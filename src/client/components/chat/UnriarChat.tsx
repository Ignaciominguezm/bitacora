import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'

const ACCENT = '#C8A840'

interface HistoryItem {
  session_id: string
  title: string
  updated_at: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  pending?: boolean
}

export function UnriarChat() {
  const [sessions, setSessions] = useState<HistoryItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeTitle, setActiveTitle] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [recording, setRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [showList, setShowList] = useState(true)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeIdRef = useRef<string | null>(null)

  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Load history on mount and auto-select most recent session
  useEffect(() => {
    fetch('/api/chat/history?agent=unriar', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: HistoryItem[]) => {
        setSessions(data)
        if (data.length > 0) selectSession(data[0].session_id, data[0].title)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // SSE connection — reconnects whenever active session changes
  useEffect(() => {
    if (!activeId) return
    const es = new EventSource(`/api/unriar/stream?sessionId=${activeId}`)

    es.addEventListener('response', (e: MessageEvent) => {
      const { response } = JSON.parse(e.data as string) as { response: string }

      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current)
        pendingTimeoutRef.current = null
      }

      setMessages((prev) => {
        const updated = prev.map((m) =>
          m.pending ? { role: 'assistant' as const, content: response, pending: false } : m
        )
        const clean = updated.filter((m) => !m.pending)
        const title = clean.find((m) => m.role === 'user')?.content.slice(0, 60) || 'Conversación'
        const id = activeIdRef.current
        if (id) {
          fetch(`/api/chat/session/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ messages: clean, title })
          })
            .then(() => {
              setSessions((s) => s.map((sess) => sess.session_id === id ? { ...sess, title } : sess))
              setActiveTitle(title)
            })
            .catch(() => {})
        }
        return updated
      })

      setStreaming(false)
    })

    return () => es.close()
  }, [activeId])

  function selectSession(id: string, title: string) {
    setActiveId(id)
    setActiveTitle(title)
    setShowList(false)
    fetch(`/api/chat/session/${id}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { messages?: Message[] }) => {
        setMessages(Array.isArray(data.messages) ? data.messages.filter((m) => !m.pending) : [])
      })
      .catch(() => setMessages([]))
  }

  async function newConversation() {
    try {
      const res = await fetch('/api/chat/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent: 'unriar', title: 'Nueva conversación' })
      })
      const data: { session_id: string; title: string; updated_at: string } = await res.json()
      setSessions((prev) => [data, ...prev])
      setActiveId(data.session_id)
      setActiveTitle(data.title)
      setMessages([])
      setInput('')
      setShowList(false)
    } catch {
      const id = `local-${Date.now()}`
      setActiveId(id)
      setActiveTitle('Nueva conversación')
      setMessages([])
      setInput('')
      setShowList(false)
    }
  }

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming || !activeId) return

    setInput('')
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: 'Pensando...', pending: true }
    ])
    setStreaming(true)

    pendingTimeoutRef.current = setTimeout(() => {
      setMessages((prev) => prev.map((m) =>
        m.pending ? { role: 'assistant' as const, content: 'Sin respuesta. Inténtalo de nuevo.', pending: false } : m
      ))
      setStreaming(false)
      pendingTimeoutRef.current = null
    }, 60_000)

    try {
      await fetch('/api/unriar/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: text, sessionId: activeId })
      })
    } catch {
      if (pendingTimeoutRef.current) { clearTimeout(pendingTimeoutRef.current); pendingTimeoutRef.current = null }
      setMessages((prev) => prev.map((m) =>
        m.pending ? { role: 'assistant' as const, content: 'Error al contactar con el agente.', pending: false } : m
      ))
      setStreaming(false)
    }
  }, [input, streaming, activeId])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
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
        const form = new FormData()
        form.append('audio', blob, 'audio.webm')
        try {
          const res = await fetch('/api/voice/transcribe', { method: 'POST', credentials: 'include', body: form })
          const { text } = await res.json() as { text: string }
          if (text) setInput((p) => p ? `${p} ${text}` : text)
        } catch { /* whisper not configured */ }
      }
      recorder.start()
      setMediaRecorder(recorder)
      setRecording(true)
    } catch { /* mic unavailable */ }
  }

  function stopRecording() {
    mediaRecorder?.stop()
    setMediaRecorder(null)
    setRecording(false)
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' })
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
      {/* Left panel */}
      <div className={`conv-list-panel ${!showList ? 'conv-hidden' : ''}`}
        style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid rgba(200,168,64,0.12)' }}
      >
        <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(200,168,64,0.1)', flexShrink: 0 }}>
          <button
            onClick={newConversation}
            style={{ width: '100%', padding: '7px 12px', background: `${ACCENT}0f`, border: `1px solid ${ACCENT}40`, color: ACCENT, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, cursor: 'pointer', letterSpacing: '0.06em', transition: 'background 0.15s' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = `${ACCENT}20`)}
            onMouseLeave={(e) => (e.currentTarget.style.background = `${ACCENT}0f`)}
          >
            + Nueva conversación
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {sessions.length === 0 ? (
            <div style={{ padding: 12, color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>Sin conversaciones</div>
          ) : sessions.map((s) => (
            <div
              key={s.session_id}
              onClick={() => selectSession(s.session_id, s.title)}
              style={{ padding: '10px 12px', borderBottom: '1px solid rgba(200,168,64,0.06)', cursor: 'pointer', background: activeId === s.session_id ? `${ACCENT}12` : 'transparent', borderLeft: `2px solid ${activeId === s.session_id ? ACCENT : 'transparent'}`, transition: 'all 0.1s' }}
              onMouseEnter={(e) => { if (activeId !== s.session_id) (e.currentTarget as HTMLDivElement).style.background = `${ACCENT}08` }}
              onMouseLeave={(e) => { if (activeId !== s.session_id) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
            >
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#E8DCC8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A4A30', marginTop: 2 }}>{fmtDate(s.updated_at)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!activeId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
            Selecciona o crea una conversación
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(200,168,64,0.1)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <button
                className="conv-mobile-back"
                onClick={() => setShowList(true)}
                style={{ background: 'transparent', border: 'none', color: '#5A4A30', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: 14, padding: '0 4px' }}
              >
                ←
              </button>
              <div className={streaming ? 'pulse-dot' : undefined} style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, opacity: streaming ? 1 : 0.4, flexShrink: 0 }} />
              <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#E8DCC8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeTitle}
              </span>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {messages.length === 0 && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, minHeight: 100 }}>
                  Unriar en espera
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '80%', padding: '8px 12px', background: msg.role === 'user' ? `${ACCENT}18` : '#13100A', border: `1px solid ${msg.role === 'user' ? ACCENT + '40' : 'rgba(200,168,64,0.12)'}`, fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: msg.pending ? '#5A4A30' : '#E8DCC8', lineHeight: 1.5, wordBreak: 'break-word', fontStyle: msg.pending ? 'italic' : 'normal' }}>
                    {msg.pending ? (
                      <span>{msg.content}</span>
                    ) : msg.role === 'user' ? (
                      <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                    ) : (
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    )}
                    {streaming && i === messages.length - 1 && msg.role === 'assistant' && !msg.pending && (
                      <span className="cursor-blink" style={{ color: ACCENT }}>▌</span>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(200,168,64,0.1)', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Mensaje a Unriar..."
                rows={1}
                disabled={streaming}
                style={{ flex: 1, padding: '8px 12px', background: '#13100A', border: `1px solid ${ACCENT}30`, color: '#E8DCC8', fontFamily: 'DM Sans, sans-serif', fontSize: 13, outline: 'none', resize: 'none', minHeight: 36, maxHeight: 100, lineHeight: 1.5, opacity: streaming ? 0.6 : 1 }}
                onFocus={(e) => (e.currentTarget.style.borderColor = `${ACCENT}70`)}
                onBlur={(e) => (e.currentTarget.style.borderColor = `${ACCENT}30`)}
              />
              <button onMouseDown={startRecording} onMouseUp={stopRecording} onMouseLeave={stopRecording}
                style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: recording ? `${ACCENT}25` : 'transparent', border: `1px solid ${ACCENT}30`, color: recording ? ACCENT : '#5A4A30', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}
                title="Mantener para grabar">
                🎙
              </button>
              <button onClick={sendMessage} disabled={!input.trim() || streaming}
                style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: input.trim() && !streaming ? `${ACCENT}20` : 'transparent', border: `1px solid ${input.trim() && !streaming ? ACCENT + '50' : ACCENT + '20'}`, color: input.trim() && !streaming ? ACCENT : '#5A4A30', cursor: input.trim() && !streaming ? 'pointer' : 'not-allowed', fontSize: 14, flexShrink: 0 }}
                title="Enviar (Enter)">
                ▶
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
