import { useRef, useState } from 'react'

interface UseVoiceRecorderResult {
  recording: boolean
  transcribing: boolean
  error: string | null
  start: () => Promise<void>
  stop: () => void
}

// Grabación push-to-talk + transcripción vía /api/voice/transcribe (Whisper,
// ya existente en el backend). No se usa en ninguna pantalla todavía — la
// voz llega en una entrega posterior; el hook queda listo y probado aparte.
export function useVoiceRecorder(onTranscript: (text: string) => void): UseVoiceRecorderResult {
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  async function start() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      const chunks: BlobPart[] = []

      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null

        const blob = new Blob(chunks, { type: 'audio/webm' })
        const form = new FormData()
        form.append('audio', blob, 'audio.webm')

        setTranscribing(true)
        try {
          const res = await fetch('/api/voice/transcribe', { method: 'POST', credentials: 'include', body: form })
          if (!res.ok) throw new Error('Transcripción no disponible')
          const { text } = await res.json() as { text?: string }
          if (text) onTranscript(text)
        } catch {
          setError('No se pudo transcribir el audio')
        } finally {
          setTranscribing(false)
        }
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
    } catch {
      setError('Micrófono no disponible')
    }
  }

  function stop() {
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
    setRecording(false)
  }

  return { recording, transcribing, error, start, stop }
}
