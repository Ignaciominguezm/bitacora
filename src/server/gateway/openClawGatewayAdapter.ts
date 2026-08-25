import type { AgentContext, AgentGateway, AgentMessage, AgentSessionRef } from './types.js'
import { buildPrompt } from './prompt.js'

const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'https://imm-guarida.tailf37d92.ts.net'
const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN
const OPENCLAW_TIMEOUT_SECONDS = Number.parseInt(process.env.OPENCLAW_TIMEOUT_SECONDS || '60', 10)
// Cuántos mensajes recientes de cabina_messages se inyectan en el input.
// /v1/responses no tiene ningún mecanismo de sesión (sondeado con curl real
// contra el gateway — session/sessionKey/conversation/conversation_id dan
// 400, metadata.session y previous_response_id se aceptan pero no aíslan
// nada), así que la continuidad por hilo la aporta Cabina metiendo contexto
// en el propio input, no la API. 10 mensajes (~5 intercambios) es una
// fracción modesta frente a lo que ya cuesta la memoria propia de Unria
// (700–12.800 input_tokens observados solo por eso en el sondeo, y
// creciendo) — suficiente para mantener coherente el hilo reciente sin
// competir con ese coste.
const HISTORY_MESSAGE_LIMIT = Number.parseInt(process.env.OPENCLAW_HISTORY_MESSAGES || '10', 10)

// Formato Responses de OpenAI — confirmado con curl real contra el gateway.
interface ResponsesContentItem {
  type?: string
  text?: string
}
interface ResponsesOutputItem {
  type?: string
  content?: ResponsesContentItem[]
  // Va dentro de cada item de output, no en la raíz del JSON — confirmado
  // en las respuestas reales del sondeo (p. ej. "output":[{"type":"message",
  // ...,"phase":"final_answer","status":"completed"}]).
  phase?: string
}
interface ResponsesUsage {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
}
interface ResponsesResult {
  output?: ResponsesOutputItem[]
  usage?: ResponsesUsage
}

function findMessageItem(result: ResponsesResult): ResponsesOutputItem | undefined {
  return result.output?.find((item) => item.type === 'message') ?? result.output?.[0]
}

function extractText(result: ResponsesResult): string {
  const message = findMessageItem(result)
  const textItem = message?.content?.find((c) => c.type === 'output_text') ?? message?.content?.[0]
  const text = textItem?.text
  if (typeof text === 'string' && text.trim()) return text
  throw new Error('Respuesta de OpenClaw (gateway) sin output[].content[].text reconocible')
}

function formatHistoryLine(m: AgentMessage): string {
  return `${m.role === 'user' ? 'Usuario' : 'Unria'}: ${m.content}`
}

// Resumen (si existe) + últimos N mensajes de la conversación, para que la
// continuidad de cada hilo de Cabina viva aquí y no dependa de nada que
// ofrezca /v1/responses. Si no hay resumen y la conversación ya pasó del
// límite, lo dice explícitamente — así una respuesta que no recuerda algo
// dicho hace 15 mensajes se lee como "estado intermedio esperado", no como
// un fallo silencioso.
function buildContextBlock(session: AgentSessionRef, limit: number): string {
  const parts: string[] = []

  if (session.summary) {
    parts.push('[Resumen de esta conversación hasta ahora]', session.summary)
  }

  const recent = session.history.slice(-limit)
  const truncated = session.history.length > recent.length

  if (recent.length > 0) {
    parts.push('[Historial reciente]')
    if (truncated && !session.summary) {
      parts.push('[...mensajes anteriores no incluidos; resumen aún no disponible...]')
    }
    parts.push(...recent.map(formatHistoryLine))
  }

  return parts.join('\n')
}

// Habla con el gateway HTTP de OpenClaw en la sobremesa, vía Tailscale.
// Formato Responses de OpenAI: POST /v1/responses, body {model, input}. Sin
// ningún campo de sesión — confirmado que ninguno aísla nada en este
// gateway. Nunca se llama desde el navegador — vive en el backend, el
// token nunca sale de aquí (no viaja al cliente en ninguna respuesta).
export class OpenClawGatewayAdapter implements AgentGateway {
  async *send(message: string, context: AgentContext, session: AgentSessionRef): AsyncIterable<string> {
    if (!OPENCLAW_GATEWAY_TOKEN) {
      throw new Error('OPENCLAW_GATEWAY_TOKEN no configurado')
    }

    const contextBlock = buildContextBlock(session, HISTORY_MESSAGE_LIMIT)
    const enrichedMessage = contextBlock ? `${contextBlock}\n\n${message}` : message
    const prompt = buildPrompt(enrichedMessage, context, session)
    const startedAt = Date.now()

    let res: Response
    try {
      res = await fetch(`${OPENCLAW_GATEWAY_URL}/v1/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENCLAW_GATEWAY_TOKEN}`
        },
        body: JSON.stringify({ model: 'openclaw', input: prompt }),
        signal: AbortSignal.timeout(OPENCLAW_TIMEOUT_SECONDS * 1000)
      })
    } catch (err) {
      console.error(
        `[openclaw-gateway] fallo de red sessionId=${session.sessionId} durationMs=${Date.now() - startedAt}: ` +
          `${err instanceof Error ? err.message : 'error desconocido'}`
      )
      throw new Error('No se pudo contactar con el gateway de OpenClaw')
    }

    const durationMs = Date.now() - startedAt

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      console.error(
        `[openclaw-gateway] HTTP ${res.status} sessionId=${session.sessionId} durationMs=${durationMs} ` +
          `body="${errBody.slice(0, 300)}"`
      )
      throw new Error(`OpenClaw gateway respondió ${res.status}`)
    }

    let data: ResponsesResult
    try {
      data = (await res.json()) as ResponsesResult
    } catch {
      console.error(`[openclaw-gateway] JSON inválido sessionId=${session.sessionId} durationMs=${durationMs}`)
      throw new Error('No se pudo parsear la respuesta JSON del gateway de OpenClaw')
    }

    console.log(
      `[openclaw-gateway] session=${session.sessionId} ok durationMs=${durationMs} phase=${findMessageItem(data)?.phase ?? '?'} ` +
        `tokens=${data.usage?.total_tokens ?? '?'} (input=${data.usage?.input_tokens ?? '?'} output=${data.usage?.output_tokens ?? '?'})`
    )
    yield extractText(data)
  }
}
