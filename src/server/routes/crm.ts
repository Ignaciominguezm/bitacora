import { Hono } from 'hono'
import { immDb, immReadonlyDb } from '../db/index.js'

export const crmRoutes = new Hono()

crmRoutes.get('/search', async (c) => {
  if (!immReadonlyDb) return c.json([])
  const q = c.req.query('q') || ''

  const result = await immReadonlyDb.query(
    `SELECT id, full_name, phone, email, company_name, whatsapp_number, active
     FROM core_contacts
     WHERE active = true
       AND (full_name ILIKE $1 OR company_name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1)
     ORDER BY full_name
     LIMIT 20`,
    [`%${q}%`]
  )
  return c.json(result.rows)
})

crmRoutes.get('/contact/:id', async (c) => {
  if (!immReadonlyDb) return c.json({ error: 'DB not configured' }, 503)
  const id = c.req.param('id')

  const [contact, roles, services, interactions] = await Promise.all([
    immReadonlyDb.query('SELECT * FROM core_contacts WHERE id = $1', [id]),
    immReadonlyDb.query('SELECT * FROM core_contact_roles WHERE contact_id = $1', [id]),
    immReadonlyDb.query(
      `SELECT cs.*, srv.name AS service_name, srv.category, bu.name AS business_unit_name
       FROM crm_contact_services cs
       LEFT JOIN crm_services srv ON srv.id = cs.service_id
       LEFT JOIN core_business_units bu ON bu.id = cs.business_unit_id
       WHERE cs.contact_id = $1`,
      [id]
    ),
    immReadonlyDb.query(
      `SELECT * FROM crm_interactions WHERE contact_id = $1 ORDER BY happened_at DESC LIMIT 20`,
      [id]
    )
  ])

  if (contact.rows.length === 0) return c.json({ error: 'Not found' }, 404)

  return c.json({
    ...contact.rows[0],
    roles: roles.rows,
    services: services.rows,
    interactions: interactions.rows
  })
})

crmRoutes.post('/interaction', async (c) => {
  if (!immDb) return c.json({ error: 'DB not configured' }, 503)
  const { contact_id, type, direction, summary, full_content, visibility, happened_at } =
    await c.req.json<{
      contact_id: number
      type: string
      direction: string
      summary: string
      full_content?: string
      visibility?: string
      happened_at?: string
    }>()

  const result = await immDb.query(
    `INSERT INTO crm_interactions (contact_id, type, direction, summary, full_content, visibility, happened_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'bitacora')
     RETURNING *`,
    [
      contact_id,
      type,
      direction,
      summary,
      full_content || null,
      visibility || 'internal',
      happened_at || new Date().toISOString()
    ]
  )
  return c.json(result.rows[0])
})

crmRoutes.get('/pending', async (c) => {
  if (!immReadonlyDb) return c.json([])
  const result = await immReadonlyDb.query(
    `SELECT * FROM unria_pending_contacts WHERE decision = 'pending' ORDER BY last_seen_at DESC LIMIT 50`
  )
  return c.json(result.rows)
})
