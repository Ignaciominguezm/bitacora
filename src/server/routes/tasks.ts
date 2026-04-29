import { Hono } from 'hono'
import { tareasDb } from '../db/index.js'

export const tasksRoutes = new Hono()

tasksRoutes.get('/urgent', async (c) => {
  if (!tareasDb) return c.json([])

  const result = await tareasDb.query(
    `SELECT t.id, t.title, t.description, t.priority, t.status, t.due_date,
            u.name AS assigned_to, cl.name AS client_name, cl.color AS client_color
     FROM tasks t
     LEFT JOIN users u ON u.id = CAST(t.assigned_to AS INTEGER)
     LEFT JOIN clients cl ON cl.id = t.client_id
     WHERE t.status != 'done'
       AND (t.priority = 'urgent' OR (t.due_date IS NOT NULL AND t.due_date <= NOW() + INTERVAL '7 days'))
     ORDER BY
       CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       t.due_date NULLS LAST
     LIMIT 20`
  )
  return c.json(result.rows)
})
