import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { bitacoraDb } from '../db/index.js'
import { getGateway } from '../gateway/index.js'
import type { Ambito, Modo } from '../gateway/index.js'
import { maybeUpdateSummary } from '../gateway/summarizer.js'
import { parseActionProposal, stripActionProposal } from '../actions/parseActionProposal.js'
import { applyActionProposal } from '../actions/applyActionProposal.js'

export const cabinaRoutes = new Hono()

const AMBITOS: Ambito[] = ['proyectos_personales', 'clientes', 'ocio']
const MODOS: Modo[] = ['diseno', 'implementacion', 'revision']
const DEFAULT_TITLE = 'Nueva conversación'
const AUTO_TITLE_MAX = 60

// Evita dos turnos simultáneos sobre la misma sesión (doble clic, dos
// pestañas). Vive en memoria del proceso — suficiente para un solo backend;
// si algún día hay más de una instancia detrás del balanceador, esto pasa
// a necesitar un lock externo (p. ej. una fila en cabina_sessions).
const processingSessions = new Set<string>()

function isAmbito(v: unknown): v is Ambito {
  return typeof v === 'string' && (AMBITOS as string[]).includes(v)
}

function isModo(v: unknown): v is Modo {
  return typeof v === 'string' && (MODOS as string[]).includes(v)
}

// Sin ?archived=true: solo activas (comportamiento por defecto — las
// archivadas se ocultan de la lista principal). Con ?archived=true: solo
// archivadas. 'archived' es un booleano que decidimos aquí mismo (true/
// false), nunca se interpola el query param en crudo.
cabinaRoutes.get('/history', async (c) => {
  if (!bitacoraDb) return c.json([])
  const archived = c.req.query('archived') === 'true'
  const result = await bitacoraDb.query(
    `SELECT id, ambito, modo, title, archived_at, created_at, updated_at
     FROM cabina_sessions
     WHERE archived_at IS ${archived ? 'NOT NULL' : 'NULL'}
     ORDER BY updated_at DESC LIMIT 100`
  )
  return c.json(result.rows)
})

cabinaRoutes.post('/session', async (c) => {
  if (!bitacoraDb) return c.json({ error: 'DB not configured' }, 503)
  const { ambito, modo, title } = await c.req.json<{ ambito: string; modo: string; title?: string }>()
  if (!isAmbito(ambito) || !isModo(modo)) return c.json({ error: 'ambito/modo inválidos' }, 400)

  const result = await bitacoraDb.query(
    `INSERT INTO cabina_sessions (ambito, modo, title) VALUES ($1, $2, $3) RETURNING *`,
    [ambito, modo, title?.trim() || DEFAULT_TITLE]
  )
  return c.json(result.rows[0])
})

cabinaRoutes.get('/session/:id', async (c) => {
  if (!bitacoraDb) return c.json({ error: 'DB not configured' }, 503)
  const id = c.req.param('id')

  const sessionResult = await bitacoraDb.query('SELECT * FROM cabina_sessions WHERE id = $1', [id])
  if (sessionResult.rows.length === 0) return c.json({ error: 'Not found' }, 404)

  const messagesResult = await bitacoraDb.query(
    `SELECT id, role, content, ambito, modo, created_at
     FROM cabina_messages WHERE session_id = $1 ORDER BY id ASC`,
    [id]
  )

  // processing: si hay un turno en curso para esta sesión (ver
  // processingSessions más abajo). Permite al cliente reconectar tras
  // volver de otra pestaña/sesión y saber si debe esperar una respuesta
  // que el servidor sigue generando, en vez de asumir que se perdió.
  return c.json({ ...sessionResult.rows[0], messages: messagesResult.rows, processing: processingSessions.has(id) })
})

// PATCH manual: título, ámbito/modo "actual" sin enviar mensaje, y/o
// archivar/desarchivar (archived: true|false). archived es reversible —
// el borrado definitivo es un endpoint aparte (DELETE, más abajo).
cabinaRoutes.patch('/session/:id', async (c) => {
  if (!bitacoraDb) return c.json({ error: 'DB not configured' }, 503)
  const id = c.req.param('id')
  const { title, ambito, modo, archived } = await c.req.json<{
    title?: string; ambito?: string; modo?: string; archived?: boolean
  }>()

  if (ambito !== undefined && !isAmbito(ambito)) return c.json({ error: 'ambito inválido' }, 400)
  if (modo !== undefined && !isModo(modo)) return c.json({ error: 'modo inválido' }, 400)

  const result = await bitacoraDb.query(
    `UPDATE cabina_sessions
     SET title = COALESCE($1, title), ambito = COALESCE($2, ambito), modo = COALESCE($3, modo),
         archived_at = CASE WHEN $5::boolean IS NULL THEN archived_at WHEN $5::boolean THEN now() ELSE NULL END,
         updated_at = now()
     WHERE id = $4 RETURNING *`,
    [title?.trim() || null, ambito ?? null, modo ?? null, id, archived ?? null]
  )
  if (result.rows.length === 0) return c.json({ error: 'Not found' }, 404)
  return c.json(result.rows[0])
})

// Borrado definitivo — irreversible. Solo si ya está archivada (el mismo
// "dos pasos deliberados" se aplica aquí, no solo en la UI): cabina_messages
// cae por ON DELETE CASCADE.
cabinaRoutes.delete('/session/:id', async (c) => {
  if (!bitacoraDb) return c.json({ error: 'DB not configured' }, 503)
  const id = c.req.param('id')
  const result = await bitacoraDb.query(
    'DELETE FROM cabina_sessions WHERE id = $1 AND archived_at IS NOT NULL RETURNING id',
    [id]
  )
  if (result.rows.length === 0) return c.json({ error: 'Sesión no encontrada o no está archivada' }, 404)
  return c.json({ ok: true })
})

cabinaRoutes.post('/session/:id/message', async (c) => {
  const db = bitacoraDb
  if (!db) return c.json({ error: 'DB not configured' }, 503)

  const sessionId = c.req.param('id')
  const { message, ambito, modo } = await c.req.json<{ message: string; ambito: string; modo: string }>()

  const text = message?.trim()
  if (!text) return c.json({ error: 'message vacío' }, 400)
  if (!isAmbito(ambito) || !isModo(modo)) return c.json({ error: 'ambito/modo inválidos' }, 400)

  const sessionResult = await db.query<{ title: string; summary: string | null }>(
    'SELECT title, summary FROM cabina_sessions WHERE id = $1',
    [sessionId]
  )
  if (sessionResult.rows.length === 0) return c.json({ error: 'Sesión no encontrada' }, 404)
  const session = sessionResult.rows[0]

  if (processingSessions.has(sessionId)) {
    return c.json({ error: 'Ya hay un turno en curso para esta sesión' }, 409)
  }
  processingSessions.add(sessionId)

  // A partir de aquí el sessionId queda marcado como "en curso" — cualquier
  // salida (éxito, error antes del streaming, o fin del streaming) debe
  // liberarlo. Ver los dos finally/catch de abajo.
  try {
    // Historial previo a este turno — es lo que viaja al gateway como contexto.
    const historyResult = await db.query<{ role: 'user' | 'assistant'; content: string }>(
      `SELECT role, content FROM cabina_messages WHERE session_id = $1 ORDER BY id ASC`,
      [sessionId]
    )
    const history = historyResult.rows

    await db.query(
      `INSERT INTO cabina_messages (session_id, role, content, ambito, modo) VALUES ($1, 'user', $2, $3, $4)`,
      [sessionId, text, ambito, modo]
    )

    // Auto-título naíf, independiente del gateway: solo la primera vez que la
    // sesión recibe un mensaje de usuario y sigue con el título por defecto.
    const isFirstUserMessage = !history.some((m) => m.role === 'user')
    const autoTitle = isFirstUserMessage && session.title === DEFAULT_TITLE ? text.slice(0, AUTO_TITLE_MAX) : null
    const gatewayMode = process.env.CABINA_GATEWAY || 'mock'
    console.log(`[cabina] session=${sessionId} ambito=${ambito} modo=${modo} gateway=${gatewayMode} — turno iniciado`)
    const startedAt = Date.now()

    return streamSSE(c, async (stream) => {
      try {
        let fullContent = ''
        // Si el cliente se desconecta a media respuesta, writeSSE empieza a
        // lanzar. Dejamos de escribir al stream pero seguimos consumiendo el
        // gateway igual — la respuesta se persiste completa aunque nadie la
        // esté viendo ya, en vez de perderse.
        let clientConnected = true

        try {
          for await (const chunk of getGateway().send(text, { ambito, modo }, { sessionId, title: session.title, summary: session.summary, history })) {
            fullContent += chunk
            if (clientConnected) {
              try {
                await stream.writeSSE({ data: chunk })
              } catch {
                clientConnected = false
              }
            }
          }
        } catch (err) {
          fullContent = fullContent || `Error: ${err instanceof Error ? err.message : 'Error del agente'}`
          if (clientConnected) {
            try {
              await stream.writeSSE({ data: fullContent })
            } catch {
              clientConnected = false
            }
          }
        }

        // Se persiste siempre que haya contenido (incluido el texto de error
        // de fallback de arriba), esté o no el cliente todavía conectado —
        // así el corte de conexión nunca se traduce en una respuesta perdida.
        if (fullContent) {
          // #723-MVP: Unria puede emitir, como mucho, un bloque
          // [ACCION_PROPUESTA] dentro de su respuesta. Se parsea una única
          // vez aquí; lo que se guarda/renderiza como mensaje del asistente
          // es siempre el texto SIN ese bloque (stripActionProposal), exista
          // o no, sea válido o esté malformado — el bloque crudo nunca se
          // le muestra al usuario ni sobrevive en el historial persistido.
          const proposal = parseActionProposal(fullContent)
          const cleanedContent = stripActionProposal(fullContent)

          const insertResult = await db.query<{ id: string }>(
            `INSERT INTO cabina_messages (session_id, role, content, ambito, modo)
             VALUES ($1, 'assistant', $2, $3, $4) RETURNING id`,
            [sessionId, cleanedContent, ambito, modo]
          )
          const assistantMessageId = insertResult.rows[0].id

          // updated_at se toca en cada turno (no hay trigger) para que el
          // historial ordene por recencia; ambito/modo quedan como "actual" de
          // la sesión para poder reanudarla.
          await db.query(
            `UPDATE cabina_sessions
             SET updated_at = now(), ambito = $1, modo = $2, title = COALESCE($3, title)
             WHERE id = $4`,
            [ambito, modo, autoTitle, sessionId]
          )

          // Política determinista de aprobación (ver src/server/actions/) —
          // nunca puede tirar el turno del usuario abajo: cualquier fallo
          // aquí se registra y no se propaga (mismo espíritu best-effort que
          // maybeUpdateSummary, más abajo).
          try {
            await applyActionProposal(db, { sessionId, messageId: assistantMessageId, proposal })
          } catch (err) {
            console.error(
              `[cabina-actions] fallo aplicando la propuesta de acción sessionId=${sessionId}: ` +
                `${err instanceof Error ? err.message : 'error desconocido'}`
            )
          }
        }

        if (clientConnected) {
          try {
            await stream.writeSSE({ data: '[DONE]' })
          } catch { /* cliente ya se fue */ }
        }

        console.log(`[cabina] session=${sessionId} turno completo en ${Date.now() - startedAt}ms`)

        // El usuario ya tiene su respuesta (chunks + [DONE] ya escritos
        // arriba) — esto no la retrasa. Se queda dentro del mismo
        // processingSessions que ya bloqueaba un segundo turno concurrente,
        // así que un envío mientras el resumen sigue en curso da 409 en vez
        // de arriesgar dos actualizaciones de summary pisándose. Best-effort
        // estricto: maybeUpdateSummary nunca lanza, se traga y loguea sola.
        if (fullContent) {
          await maybeUpdateSummary(db, sessionId, ambito, modo)
        }
      } finally {
        processingSessions.delete(sessionId)
      }
    })
  } catch (err) {
    processingSessions.delete(sessionId)
    throw err
  }
})
