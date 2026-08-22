import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { bitacoraDb } from '../db/index.js'
import { getGateway } from '../gateway/index.js'
import type { Ambito, Modo } from '../gateway/index.js'

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

cabinaRoutes.get('/history', async (c) => {
  if (!bitacoraDb) return c.json([])
  const result = await bitacoraDb.query(
    `SELECT id, ambito, modo, title, created_at, updated_at
     FROM cabina_sessions ORDER BY updated_at DESC LIMIT 100`
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

  return c.json({ ...sessionResult.rows[0], messages: messagesResult.rows })
})

// PATCH manual: título, y/o cambio de ámbito/modo "actual" de la sesión sin
// enviar mensaje (p. ej. el selector de contexto lo permite en el futuro).
cabinaRoutes.patch('/session/:id', async (c) => {
  if (!bitacoraDb) return c.json({ error: 'DB not configured' }, 503)
  const id = c.req.param('id')
  const { title, ambito, modo } = await c.req.json<{ title?: string; ambito?: string; modo?: string }>()

  if (ambito !== undefined && !isAmbito(ambito)) return c.json({ error: 'ambito inválido' }, 400)
  if (modo !== undefined && !isModo(modo)) return c.json({ error: 'modo inválido' }, 400)

  const result = await bitacoraDb.query(
    `UPDATE cabina_sessions
     SET title = COALESCE($1, title), ambito = COALESCE($2, ambito), modo = COALESCE($3, modo), updated_at = now()
     WHERE id = $4 RETURNING *`,
    [title?.trim() || null, ambito ?? null, modo ?? null, id]
  )
  if (result.rows.length === 0) return c.json({ error: 'Not found' }, 404)
  return c.json(result.rows[0])
})

cabinaRoutes.post('/session/:id/message', async (c) => {
  const db = bitacoraDb
  if (!db) return c.json({ error: 'DB not configured' }, 503)

  const sessionId = c.req.param('id')
  const { message, ambito, modo } = await c.req.json<{ message: string; ambito: string; modo: string }>()

  const text = message?.trim()
  if (!text) return c.json({ error: 'message vacío' }, 400)
  if (!isAmbito(ambito) || !isModo(modo)) return c.json({ error: 'ambito/modo inválidos' }, 400)

  const sessionResult = await db.query<{ title: string }>('SELECT title FROM cabina_sessions WHERE id = $1', [sessionId])
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
          for await (const chunk of getGateway().send(text, { ambito, modo }, { sessionId, title: session.title, history })) {
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
          await db.query(
            `INSERT INTO cabina_messages (session_id, role, content, ambito, modo) VALUES ($1, 'assistant', $2, $3, $4)`,
            [sessionId, fullContent, ambito, modo]
          )

          // updated_at se toca en cada turno (no hay trigger) para que el
          // historial ordene por recencia; ambito/modo quedan como "actual" de
          // la sesión para poder reanudarla.
          await db.query(
            `UPDATE cabina_sessions
             SET updated_at = now(), ambito = $1, modo = $2, title = COALESCE($3, title)
             WHERE id = $4`,
            [ambito, modo, autoTitle, sessionId]
          )
        }

        if (clientConnected) {
          try {
            await stream.writeSSE({ data: '[DONE]' })
          } catch { /* cliente ya se fue */ }
        }

        console.log(`[cabina] session=${sessionId} turno completo en ${Date.now() - startedAt}ms`)
      } finally {
        processingSessions.delete(sessionId)
      }
    })
  } catch (err) {
    processingSessions.delete(sessionId)
    throw err
  }
})
