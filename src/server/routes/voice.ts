import { Hono } from 'hono'

export const voiceRoutes = new Hono()

voiceRoutes.post('/transcribe', async (c) => {
  const whisperUrl = process.env.WHISPER_URL
  if (!whisperUrl) return c.json({ error: 'Whisper not configured' }, 503)

  const formData = await c.req.formData()

  const response = await fetch(`${whisperUrl}/asr`, {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    return c.json({ error: 'Transcription failed' }, 502)
  }

  const data = await response.json() as { text?: string; result?: string }
  return c.json({ text: data.text ?? data.result ?? '' })
})
