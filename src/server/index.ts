import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authRoutes } from './routes/auth.js'
import { healthRoutes } from './routes/health.js'
import { teamRoutes } from './routes/team.js'
import { tasksRoutes } from './routes/tasks.js'
import { chatRoutes } from './routes/chat.js'
import { cabinaRoutes } from './routes/cabina.js'
import { approvalsRoutes } from './routes/approvals.js'
import { whatsappRoutes } from './routes/whatsapp.js'
import { crmRoutes } from './routes/crm.js'
import { voiceRoutes } from './routes/voice.js'
import { unriarRoutes } from './routes/unriar.js'
import { timeRoutes } from './routes/time.js'
import { notifyRoutes } from './routes/notify.js'
import { serversRoutes } from './routes/servers.js'
import { finanzasRoutes } from './routes/finanzas.js'
import { authMiddleware } from './middleware/auth.js'

const app = new Hono()

app.use('/api/*', cors({
  origin: process.env.APP_URL || 'http://localhost:5173',
  credentials: true
}))

// Auth routes (no middleware)
app.route('/api/auth', authRoutes)
// Unriar routes — mixed auth (each route handles its own auth)
app.route('/api/unriar', unriarRoutes)

// Protected API routes
const api = new Hono()
api.use('/*', async (c, next) => {
  // These routes manage their own auth internally
  if (c.req.path === '/api/chat/unriar/callback') return next()
  if (c.req.path.startsWith('/api/notify')) return next()
  if (c.req.path.startsWith('/api/servers')) return next()
  return authMiddleware(c, next)
})
api.route('/health', healthRoutes)
api.route('/team', teamRoutes)
api.route('/tasks', tasksRoutes)
api.route('/chat', chatRoutes)
api.route('/cabina', cabinaRoutes)
api.route('/approvals', approvalsRoutes)
api.route('/whatsapp', whatsappRoutes)
api.route('/crm', crmRoutes)
api.route('/voice', voiceRoutes)
api.route('/time', timeRoutes)
api.route('/notify', notifyRoutes)
api.route('/servers', serversRoutes)
api.route('/finanzas', finanzasRoutes)
app.route('/api', api)

// Serve static frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist/public' }))
  // SPA fallback — explicitly never serve index.html for /api/* paths
  app.get('/*', (c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.json({ error: 'Not found' }, 404)
    }
    return serveStatic({ root: './dist/public', path: 'index.html' })(c, async () => {})
  })
}

const port = parseInt(process.env.PORT || '3006', 10)
serve({ fetch: app.fetch, port }, () => {
  console.log(`Bitácora running on http://localhost:${port}`)
})
