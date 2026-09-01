import type { Pool } from 'pg'
import type { AgentGateway, Ambito, Modo } from './types.js'
import { MockAdapter } from './mockAdapter.js'
import { OpenClawCliAdapter } from './openClawCliAdapter.js'
import { OpenClawGatewayAdapter, HISTORY_MESSAGE_LIMIT } from './openClawGatewayAdapter.js'

// Mismo criterio de selección de adaptador que gateway/index.ts, pero SIN
// el respaldo a MockAdapter (ver fallbackAdapter.ts): para el turno normal
// del usuario, un gateway caído que cae a Mock es preferible a romper la
// conversación. Para el resumen es al revés — un Mock silencioso sería peor
// que no resumir: escribiría el texto de simulación en `summary` como si
// fuera un resumen real y avanzaría el watermark, dejando esos mensajes sin
// resumir para siempre. Aquí un fallo real debe propagarse tal cual y
// tragarse en el catch de este módulo, no disfrazarse de éxito.
let summaryGateway: AgentGateway | null = null
function getSummaryGateway(): AgentGateway {
  if (!summaryGateway) {
    const mode = process.env.CABINA_GATEWAY || 'mock'
    if (mode === 'openclaw-cli') summaryGateway = new OpenClawCliAdapter()
    else if (mode === 'openclaw-gateway') summaryGateway = new OpenClawGatewayAdapter()
    else summaryGateway = new MockAdapter()
  }
  return summaryGateway
}

// Instrucción interna — nunca es un mensaje real del usuario. Viaja como
// MENSAJE_ACTUAL_USUARIO dentro del context pack de contextPack.ts, así que
// el resumen previo y los mensajes citados que la acompañan quedan bajo la
// misma nota anti-injection que protege cualquier otro turno: no pueden
// redirigir esta tarea, solo aportar contenido factual que resumir.
const SUMMARY_INSTRUCTION =
  'Tarea interna de Cabina, no un mensaje del usuario: no continúes la conversación ni ' +
  'respondas a nadie. A partir del resumen previo (si aparece en el bloque citado) y de los ' +
  'mensajes citados junto a él, escribe un resumen actualizado, factual y breve (máximo ~200 ' +
  'palabras), en español. Devuelve únicamente el texto del resumen, sin preámbulos ni ' +
  'explicaciones.'

interface MessageRow {
  id: string
  role: 'user' | 'assistant'
  content: string
}

// Best-effort estricto: cualquier fallo se traga y se loguea aquí mismo,
// nunca debe propagarse a quien la llama (cabina.ts la dispara sin esperar
// resultado, después de que el turno del usuario ya respondió).
export async function maybeUpdateSummary(
  db: Pool,
  sessionId: string,
  ambito: Ambito,
  modo: Modo
): Promise<void> {
  try {
    const sessionResult = await db.query<{ title: string; summary: string | null; summarized_through_id: string | null }>(
      'SELECT title, summary, summarized_through_id FROM cabina_sessions WHERE id = $1',
      [sessionId]
    )
    if (sessionResult.rows.length === 0) return
    const { title, summary, summarized_through_id } = sessionResult.rows[0]

    const messagesResult = await db.query<MessageRow>(
      'SELECT id, role, content FROM cabina_messages WHERE session_id = $1 ORDER BY id ASC',
      [sessionId]
    )
    const messages = messagesResult.rows
    if (messages.length <= HISTORY_MESSAGE_LIMIT) return // todo el historial cabe aún en la ventana

    // Mensajes que ya no van en la ventana de ningún turno futuro — si no se
    // resumen aquí, se pierden. Solo los que quedan fuera desde el último
    // resumen con éxito (watermark), nunca el historial completo: así el
    // coste de cada actualización es proporcional a lo nuevo, no a toda la
    // conversación.
    const excluded = messages.slice(0, messages.length - HISTORY_MESSAGE_LIMIT)
    const watermark = summarized_through_id ? Number(summarized_through_id) : null
    const newlyExcluded = watermark === null ? excluded : excluded.filter((m) => Number(m.id) > watermark)
    if (newlyExcluded.length === 0) return // ya cubierto por el resumen actual

    const pseudoSession = {
      sessionId,
      title,
      summary,
      history: newlyExcluded.map((m) => ({ role: m.role, content: m.content }))
    }

    let newSummary = ''
    for await (const chunk of getSummaryGateway().send(SUMMARY_INSTRUCTION, { ambito, modo }, pseudoSession)) {
      newSummary += chunk
    }
    newSummary = newSummary.trim()
    if (!newSummary) return

    const newWatermark = Number(newlyExcluded[newlyExcluded.length - 1].id)
    await db.query(
      'UPDATE cabina_sessions SET summary = $1, summarized_through_id = $2 WHERE id = $3',
      [newSummary, newWatermark, sessionId]
    )
  } catch (err) {
    console.error(
      `[cabina-summarizer] fallo al actualizar el resumen sessionId=${sessionId}: ` +
        `${err instanceof Error ? err.message : 'error desconocido'}`
    )
  }
}
