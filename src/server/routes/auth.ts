import { Hono } from 'hono'
import { setCookie, deleteCookie, getCookie } from 'hono/cookie'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

export const authRoutes = new Hono()

authRoutes.post('/login', async (c) => {
  const { password } = await c.req.json<{ password: string }>()
  const hash = process.env.BITACORA_PASSWORD

  if (!hash) return c.json({ error: 'Server misconfigured' }, 500)

  const valid = await bcrypt.compare(password, hash)
  if (!valid) return c.json({ error: 'Invalid password' }, 401)

  const token = jwt.sign({ user: 'ignacio' }, process.env.JWT_SECRET!, { expiresIn: '48h' })

  setCookie(c, 'bitacora_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    maxAge: 48 * 60 * 60,
    path: '/'
  })

  return c.json({ ok: true })
})

authRoutes.post('/logout', (c) => {
  deleteCookie(c, 'bitacora_token', { path: '/' })
  return c.json({ ok: true })
})

authRoutes.get('/me', (c) => {
  const token = getCookie(c, 'bitacora_token')
  if (!token) return c.json({ authenticated: false })

  try {
    jwt.verify(token, process.env.JWT_SECRET!)
    return c.json({ authenticated: true })
  } catch {
    return c.json({ authenticated: false })
  }
})
