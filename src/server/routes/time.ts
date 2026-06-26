import { Hono } from 'hono'
import { tareasDb } from '../db/index.js'

export const timeRoutes = new Hono()

interface TimeEntryRow {
  user_id: number
  user_name: string
  task_id: number
  task_title: string
  client_name: string | null
  started_at: string
  ended_at: string | null
  duration_minutes: number | null
}

type Period = 'today' | 'week' | 'month'

function periodStart(period: Period): string {
  const now = new Date()
  const madridNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }))

  if (period === 'today') {
    madridNow.setHours(0, 0, 0, 0)
    return madridNow.toISOString()
  }
  if (period === 'week') {
    madridNow.setDate(madridNow.getDate() - 7)
    return madridNow.toISOString()
  }
  madridNow.setDate(madridNow.getDate() - 30)
  return madridNow.toISOString()
}

function effectiveMinutes(row: TimeEntryRow): number {
  if (row.duration_minutes !== null) return row.duration_minutes
  const started = new Date(row.started_at).getTime()
  return Math.max(0, Math.round((Date.now() - started) / 60000))
}

timeRoutes.get('/summary', async (c) => {
  if (!tareasDb) return c.json({ entries: [], by_user: [], by_client: [], total_minutes: 0 })

  const period = (c.req.query('period') || 'week') as Period
  const userId = c.req.query('userId') || 'all'
  const period_start = periodStart(period)
  const period_end = new Date().toISOString()

  const params: unknown[] = [period_start]
  let userFilter = ''
  if (userId !== 'all') {
    params.push(Number(userId))
    userFilter = 'AND tte.user_id = $2'
  }

  const result = await tareasDb.query<TimeEntryRow>(
    `SELECT
       u.id as user_id,
       u.name as user_name,
       t.id as task_id,
       t.title as task_title,
       c.name as client_name,
       tte.started_at,
       tte.ended_at,
       tte.duration_minutes
     FROM task_time_entries tte
     JOIN tasks t ON t.id = tte.task_id
     JOIN users u ON u.id = tte.user_id
     LEFT JOIN clients c ON c.id = t.client_id
     WHERE tte.started_at >= $1
       ${userFilter}
     ORDER BY tte.started_at DESC`,
    params
  )

  const entries = result.rows

  type TaskAgg = { task_title: string; total_minutes: number; running: boolean }
  type ByClientInUser = { client_name: string; total_minutes: number; tasks: TaskAgg[] }
  type ByUserAgg = { user_id: number; user_name: string; total_minutes: number; by_client: ByClientInUser[] }
  type ByUserInClient = { user_id: number; user_name: string; total_minutes: number; tasks: TaskAgg[] }
  type ByClientAgg = { client_name: string; total_minutes: number; by_user: ByUserInClient[]; tasks: TaskAgg[] }

  const byUserMap = new Map<number, ByUserAgg>()
  const byClientMap = new Map<string, ByClientAgg>()
  let total_minutes = 0

  for (const row of entries) {
    const minutes = effectiveMinutes(row)
    const clientName = row.client_name || 'Sin cliente'
    total_minutes += minutes

    // by_user
    let userAgg = byUserMap.get(row.user_id)
    if (!userAgg) {
      userAgg = { user_id: row.user_id, user_name: row.user_name, total_minutes: 0, by_client: [] }
      byUserMap.set(row.user_id, userAgg)
    }
    userAgg.total_minutes += minutes
    let clientInUser = userAgg.by_client.find((bc) => bc.client_name === clientName)
    if (!clientInUser) {
      clientInUser = { client_name: clientName, total_minutes: 0, tasks: [] }
      userAgg.by_client.push(clientInUser)
    }
    clientInUser.total_minutes += minutes
    let taskInClientUser = clientInUser.tasks.find((t) => t.task_title === row.task_title)
    if (!taskInClientUser) {
      taskInClientUser = { task_title: row.task_title, total_minutes: 0, running: false }
      clientInUser.tasks.push(taskInClientUser)
    }
    taskInClientUser.total_minutes += minutes
    if (row.ended_at === null) taskInClientUser.running = true

    // by_client
    let clientAgg = byClientMap.get(clientName)
    if (!clientAgg) {
      clientAgg = { client_name: clientName, total_minutes: 0, by_user: [], tasks: [] }
      byClientMap.set(clientName, clientAgg)
    }
    clientAgg.total_minutes += minutes
    let userInClient = clientAgg.by_user.find((u) => u.user_id === row.user_id)
    if (!userInClient) {
      userInClient = { user_id: row.user_id, user_name: row.user_name, total_minutes: 0, tasks: [] }
      clientAgg.by_user.push(userInClient)
    }
    userInClient.total_minutes += minutes
    let taskInUserClient = userInClient.tasks.find((t) => t.task_title === row.task_title)
    if (!taskInUserClient) {
      taskInUserClient = { task_title: row.task_title, total_minutes: 0, running: false }
      userInClient.tasks.push(taskInUserClient)
    }
    taskInUserClient.total_minutes += minutes
    if (row.ended_at === null) taskInUserClient.running = true
    let taskInClient = clientAgg.tasks.find((t) => t.task_title === row.task_title)
    if (!taskInClient) {
      taskInClient = { task_title: row.task_title, total_minutes: 0, running: false }
      clientAgg.tasks.push(taskInClient)
    }
    taskInClient.total_minutes += minutes
    if (row.ended_at === null) taskInClient.running = true
  }

  const by_user = Array.from(byUserMap.values()).sort((a, b) => b.total_minutes - a.total_minutes)
  const by_client = Array.from(byClientMap.values()).sort((a, b) => b.total_minutes - a.total_minutes)

  return c.json({ entries, by_user, by_client, total_minutes, period, period_start, period_end })
})
