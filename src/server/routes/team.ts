import { Hono } from 'hono'
import { horarioDb, vacacionesDb, tareasDb } from '../db/index.js'

export const teamRoutes = new Hono()

teamRoutes.get('/today', async (c) => {
  const [timeEntries, absences] = await Promise.allSettled([
    horarioDb
      ? horarioDb.query(
          `SELECT u.name,
                  te."entryType" AS entry_type,
                  to_timestamp(te."clockIn"::bigint / 1000) AS clock_in,
                  CASE WHEN te.status = 'active'
                       THEN NULL
                       ELSE to_timestamp(te."clockOut"::bigint / 1000)
                  END AS clock_out,
                  te.status = 'active' AS activo,
                  EXTRACT(HOUR FROM (to_timestamp(te."clockIn"::bigint / 1000) AT TIME ZONE 'Europe/Madrid')) AS clock_in_hour
           FROM "timeEntries" te
           JOIN users u ON u.id = te."userId"
           WHERE DATE(to_timestamp(te."clockIn"::bigint / 1000) AT TIME ZONE 'Europe/Madrid') =
                 (NOW() AT TIME ZONE 'Europe/Madrid')::date
           ORDER BY te."clockIn"`
        )
      : Promise.resolve({ rows: [] }),

    vacacionesDb
      ? vacacionesDb.query(
          `SELECT e.name, r.type, r.start_date, r.end_date
           FROM requests r
           JOIN employees e ON e.id = r.employee_id
           WHERE r.status = 'approved'
             AND (NOW() AT TIME ZONE 'Europe/Madrid')::date
                 BETWEEN r.start_date AND r.end_date`
        )
      : Promise.resolve({ rows: [] })
  ])

  const entries = timeEntries.status === 'fulfilled' ? timeEntries.value.rows : []
  const abs = absences.status === 'fulfilled' ? absences.value.rows : []

  const alertas = entries
    .filter((te: { clock_in_hour: number }) => te.clock_in_hour < 6 || te.clock_in_hour >= 20)
    .map((te: { name: string; clock_in: string; clock_in_hour: number }) => ({
      name: te.name,
      clock_in: te.clock_in,
      tipo: te.clock_in_hour < 6 ? 'madrugada' : 'nocturno'
    }))

  return c.json({ fichajes: entries, ausencias: abs, alertas })
})

teamRoutes.get('/current-tasks', async (c) => {
  if (!tareasDb) return c.json([])

  try {
    const result = await tareasDb.query(
      `SELECT DISTINCT ON (u.id)
              u.name AS employee_name,
              t.title AS task_title,
              t.priority,
              c.name AS client_name,
              t.updated_at
       FROM tasks t
       JOIN users u ON u.id = t.assignee_id
       LEFT JOIN clients c ON c.id = t.client_id
       WHERE LOWER(t.status) NOT IN (
         'done','completed','cancelled','closed','archived',
         'cerrada','finalizada','completada','cancelada','terminada','archivada'
       )
       ORDER BY u.id, t.updated_at DESC`
    )
    return c.json(result.rows)
  } catch {
    return c.json([])
  }
})
