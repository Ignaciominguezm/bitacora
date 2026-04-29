import { Hono } from 'hono'
import { horarioDb, vacacionesDb, tareasDb } from '../db/index.js'

export const teamRoutes = new Hono()

teamRoutes.get('/today', async (c) => {
  const today = new Date().toISOString().split('T')[0]

  const [timeEntries, absences, tasks] = await Promise.allSettled([
    horarioDb
      ? horarioDb.query(
          `SELECT u.name, te.clock_in, te.clock_out
           FROM "timeEntries" te
           JOIN users u ON u.id = te."userId"
           WHERE te.clock_in::date = $1
           ORDER BY te.clock_in DESC`,
          [today]
        )
      : Promise.resolve({ rows: [] }),

    vacacionesDb
      ? vacacionesDb.query(
          `SELECT e.name, r.absence_type, r.date_from, r.date_to
           FROM requests r
           JOIN employees e ON e.id = r.employee_id
           WHERE r.status = 'approved'
             AND $1::date BETWEEN r.date_from AND r.date_to`,
          [today]
        )
      : Promise.resolve({ rows: [] }),

    tareasDb
      ? tareasDb.query(
          `SELECT t.id, t.title, t.priority, t.status, t.due_date, u.name AS assigned_to
           FROM tasks t
           LEFT JOIN users u ON u.id = CAST(t.assigned_to AS INTEGER)
           WHERE t.status != 'done' AND t.due_date::date = $1
           ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END`,
          [today]
        )
      : Promise.resolve({ rows: [] })
  ])

  if (timeEntries.status === 'rejected') console.error('[team] horarioDb query error:', timeEntries.reason)
  if (absences.status === 'rejected') console.error('[team] vacacionesDb query error:', absences.reason)
  if (tasks.status === 'rejected') console.error('[team] tareasDb query error:', tasks.reason)

  return c.json({
    timeEntries: timeEntries.status === 'fulfilled' ? timeEntries.value.rows : [],
    absences: absences.status === 'fulfilled' ? absences.value.rows : [],
    tasks: tasks.status === 'fulfilled' ? tasks.value.rows : []
  })
})
