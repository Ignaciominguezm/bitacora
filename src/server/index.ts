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
import { whatsappRoutes } from './routes/whatsapp.js'
import { crmRoutes } from './routes/crm.js'
import { voiceRoutes } from './routes/voice.js'
import { authMiddleware } from './middleware/auth.js'

const app = new Hono()

app.use('/api/*', cors({
  origin: process.env.APP_URL || 'http://localhost:5173',
  credentials: true
}))

// Auth routes (no middleware)
app.route('/api/auth', authRoutes)

// Protected API routes
const api = new Hono()
api.use('/*', authMiddleware)
api.route('/health', healthRoutes)
api.route('/team', teamRoutes)
api.route('/tasks', tasksRoutes)
api.route('/chat', chatRoutes)
api.route('/whatsapp', whatsappRoutes)
api.route('/crm', crmRoutes)
api.route('/voice', voiceRoutes)
app.route('/api', api)

// Serve static frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist/public' }))
  app.get('/*', (c) => {
    return serveStatic({ root: './dist/public', path: 'index.html' })(c, async () => {})
  })
}

const port = parseInt(process.env.PORT || '3006', 10)
serve({ fetch: app.fetch, port }, () => {
  console.log(`Bitácora running on http://localhost:${port}`)
})
