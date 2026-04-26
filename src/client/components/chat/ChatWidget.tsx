import { useState, useEffect, useRef, useCallback } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Session {
  id?: string
  session_id?: string
  messages: Message[]
  title: string
}

interface Props {
  agent: 'unriar' | 'kinnareth'
  accentColor: string
  label: string
}

export function ChatWidget({ agent, accentColor, label }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function getOrCreateSession(): Promise<string> {
    if (sessionId) return sessionId

    const res = await fetch('/api/chat/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ agent, title: 'Nueva conversación' })
    })
    const data: Session = await res.json()
    const id = data.session_id || data.id || ''
    setSessionId(id)
    return id
  }

  async function persistSession(msgs: Message[], id: string) {
    const title = msgs.find((m) => m.role === 'user')?.content.slice(0, 60) || 'Conversación'
    await fetch(`/api/chat/session/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ messages: msgs, title })
    }).catch(() => {})
  }

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return

    setInput('')
    const userMsg: Message = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setStreaming(true)

    const assistantMsg: Message = { role: 'assistant', content: '' }
    setMessages([...newMessages, assistantMsg])

    try {
      const id = await getOrCreateSession()

      abortRef.current = new AbortController()
      const res = await fetch(`/api/chat/${agent}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: abortRef.current.signal,
        body: JSON.stringify({
          message: text,
          sessionId: id,
          history: messages.map((m) => ({ role: m.role, content: m.content }))
        })
      })

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') break
          if (data) {
            fullContent += data
            setMessages((prev) => {
              const updated = [...prev]
              updated[updated.length - 1] = { role: 'assistant', content: fullContent }
              return updated
            })
          }
        }
      }

      const finalMessages = [...newMessages, { role: 'assistant' as const, content: fullContent }]
      await persistSession(finalMessages, id)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: 'assistant',
          content: 'Error al conectar con el agente. Inténtalo de nuevo.'
        }
        return updated
      })
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [input, streaming, messages, agent, sessionId])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: BlobPart[] = []

      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks, { type: 'audio/webm' })
        const formData = new FormData()
        formData.append('audio', blob, 'audio.webm')

        try {
          const res = await fetch('/api/voice/transcribe', {
            method: 'POST',
            credentials: 'include',
            body: formData
          })
          const { text } = await res.json() as { text: string }
          if (text) setInput((prev) => (prev ? `${prev} ${text}` : text))
        } catch {
          // Whisper not configured, ignore
        }
      }

      recorder.start()
      setMediaRecorder(recorder)
      setRecording(true)
    } catch {
      // Mic not available
    }
  }

  function stopRecording() {
    mediaRecorder?.stop()
    setMediaRecorder(null)
    setRecording(false)
  }

  function clearSession() {
    setMessages([])
    setSessionId(null)
    setInput('')
    if (streaming) {
      abortRef.current?.abort()
      setStreaming(false)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: `1px solid ${accentColor}25`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: accentColor,
              opacity: streaming ? 1 : 0.4
            }}
            className={streaming ? 'pulse-dot' : undefined}
          />
          <span style={{ fontFamily: 'Cinzel, serif', fontSize: 11, color: accentColor, letterSpacing: '0.08em' }}>
            {label.toUpperCase()}
          </span>
        </div>
        <button
          onClick={clearSession}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#5A4A30',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            cursor: 'pointer',
            padding: '2px 6px',
            letterSpacing: '0.05em'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#A09070')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#5A4A30')}
          title="Nueva conversación"
        >
          nuevo ×
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#5A4A30',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11
            }}
          >
            {label} en espera
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start'
            }}
          >
            <div
              style={{
                maxWidth: '85%',
                padding: '6px 10px',
                background: msg.role === 'user' ? `${accentColor}18` : '#13100A',
                border: `1px solid ${msg.role === 'user' ? accentColor + '35' : 'rgba(200,168,64,0.1)'}`,
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 13,
                color: '#E8DCC8',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}
            >
              {msg.content}
              {streaming && i === messages.length - 1 && msg.role === 'assistant' && (
                <span className="cursor-blink" style={{ color: accentColor }}>▌</span>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          padding: '8px 12px',
          borderTop: `1px solid ${accentColor}18`,
          display: 'flex',
          gap: 6,
          alignItems: 'flex-end',
          flexShrink: 0
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Mensaje a ${label}...`}
          rows={1}
          disabled={streaming}
          style={{
            flex: 1,
            padding: '7px 10px',
            background: '#13100A',
            border: `1px solid ${accentColor}25`,
            color: '#E8DCC8',
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 13,
            outline: 'none',
            resize: 'none',
            minHeight: 34,
            maxHeight: 80,
            lineHeight: 1.5,
            opacity: streaming ? 0.6 : 1
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = `${accentColor}60`)}
          onBlur={(e) => (e.currentTarget.style.borderColor = `${accentColor}25`)}
        />

        {/* Voice button */}
        <button
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onMouseLeave={stopRecording}
          style={{
            width: 34,
            height: 34,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: recording ? `${accentColor}25` : 'transparent',
            border: `1px solid ${accentColor}30`,
            color: recording ? accentColor : '#5A4A30',
            cursor: 'pointer',
            fontSize: 14,
            transition: 'all 0.15s',
            flexShrink: 0
          }}
          title="Mantener para grabar voz"
        >
          🎙
        </button>

        {/* Send button */}
        <button
          onClick={sendMessage}
          disabled={!input.trim() || streaming}
          style={{
            width: 34,
            height: 34,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: input.trim() && !streaming ? `${accentColor}20` : 'transparent',
            border: `1px solid ${input.trim() && !streaming ? accentColor + '50' : accentColor + '20'}`,
            color: input.trim() && !streaming ? accentColor : '#5A4A30',
            cursor: input.trim() && !streaming ? 'pointer' : 'not-allowed',
            fontSize: 14,
            transition: 'all 0.15s',
            flexShrink: 0
          }}
          title="Enviar (Enter)"
        >
          ▶
        </button>
      </div>
    </div>
  )
}
