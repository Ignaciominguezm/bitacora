import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import jwt from 'jsonwebtoken'

export async function authMiddleware(c: Context, next: Next) {
  const token = getCookie(c, 'bitacora_token')
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!)
    c.set('jwtPayload', payload)
    await next()
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
}
