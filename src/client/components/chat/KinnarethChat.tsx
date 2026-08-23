import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'

const ACCENT = '#8B9DC8'

interface HistoryItem {
  session_id: string
  title: string
  updated_at: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function KinnarethChat() {
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
  const abortRef = useRef<AbortController | null>(null)
  const activeIdRef = useRef<string | null>(null)

  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    fetch('/api/chat/history?agent=kinnareth', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: HistoryItem[]) => {
        setSessions(data)
        if (data.length > 0) selectSession(data[0].session_id, data[0].title)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function selectSession(id: string, title: string) {
    abortRef.current?.abort()
    setActiveId(id)
    setActiveTitle(title)
    setShowList(false)
    fetch(`/api/chat/session/${id}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { messages?: Message[] }) => {
        setMessages(Array.isArray(data.messages) ? data.messages : [])
      })
      .catch(() => setMessages([]))
  }

  async function newConversation() {
    abortRef.current?.abort()
    try {
      const res = await fetch('/api/chat/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent: 'kinnareth', title: 'Nueva conversación' })
      })
      const data: { session_id: string; title: string; updated_at: string } = await res.json()
      setSessions((prev) => [data, ...prev])
      setActiveId(data.session_id)
      setActiveTitle(data.title)
      setMessages([])
      setInput('')
      setShowList(false)
    } catch {
      setActiveId(`local-${Date.now()}`)
      setActiveTitle('Nueva conversación')
      setMessages([])
      setInput('')
      setShowList(false)
    }
  }

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return

    setInput('')
    const userMsg: Message = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages([...newMessages, { role: 'assistant', content: '' }])
    setStreaming(true)

    // Ensure session exists
    let sessionId = activeId
    if (!sessionId) {
      try {
        const res = await fetch('/api/chat/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ agent: 'kinnareth', title: text.slice(0, 60) })
        })
        const data: { session_id: string; title: string; updated_at: string } = await res.json()
        setSessions((prev) => [data, ...prev])
        setActiveId(data.session_id)
        setActiveTitle(data.title)
        sessionId = data.session_id
      } catch { /* continue without persistence */ }
    }

    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/chat/kinnareth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: abortRef.current.signal,
        body: JSON.stringify({
          message: text,
          sessionId: sessionId ?? '',
          history: messages.map((m) => ({ role: m.role, content: m.content }))
        })
      })

      if (!res.body) throw new Error('No body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let sseBuffer = ''

      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break
        sseBuffer += decoder.decode(value, { stream: true })
        const events = sseBuffer.split('\n\n')
        sseBuffer = events.pop() ?? ''
        for (const event of events) {
          const lines = event.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6))
          const data = lines.join('\n')
          if (data === '[DONE]') break outer
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
      if (sessionId) {
        const title = finalMessages.find((m) => m.role === 'user')?.content.slice(0, 60) || 'Conversación'
        fetch(`/api/chat/session/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ messages: finalMessages, title })
        })
          .then(() => setSessions((s) => s.map((sess) => sess.session_id === sessionId ? { ...sess, title } : sess)))
          .catch(() => {})
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: 'Error al conectar con Kinnareth. Inténtalo de nuevo.' }
        return updated
      })
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [input, streaming, messages, activeId])

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
        style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid rgba(139,157,200,0.12)' }}
      >
        <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(139,157,200,0.1)', flexShrink: 0 }}>
          <button
            onClick={newConversation}
            style={{ width: '100%', padding: '7px 12px', background: `${ACCENT}12`, border: `1px solid ${ACCENT}40`, color: ACCENT, fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', cursor: 'pointer', letterSpacing: '0.06em', transition: 'background 0.15s' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = `${ACCENT}22`)}
            onMouseLeave={(e) => (e.currentTarget.style.background = `${ACCENT}12`)}
          >
            + Nueva conversación
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {sessions.length === 0 ? (
            <div style={{ padding: 12, color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)' }}>Sin conversaciones</div>
          ) : sessions.map((s) => (
            <div
              key={s.session_id}
              onClick={() => selectSession(s.session_id, s.title)}
              style={{ padding: '10px 12px', borderBottom: '1px solid rgba(200,168,64,0.06)', cursor: 'pointer', background: activeId === s.session_id ? `${ACCENT}10` : 'transparent', borderLeft: `2px solid ${activeId === s.session_id ? ACCENT : 'transparent'}`, transition: 'all 0.1s' }}
              onMouseEnter={(e) => { if (activeId !== s.session_id) (e.currentTarget as HTMLDivElement).style.background = `${ACCENT}08` }}
              onMouseLeave={(e) => { if (activeId !== s.session_id) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
            >
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-base)', color: '#E8DCC8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#5A4A30', marginTop: 2 }}>{fmtDate(s.updated_at)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!activeId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)' }}>
            Selecciona o crea una conversación
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(139,157,200,0.1)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <button
                className="conv-mobile-back"
                onClick={() => setShowList(true)}
                style={{ background: 'transparent', border: 'none', color: '#5A4A30', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-lg)', padding: '0 4px' }}
              >
                ←
              </button>
              <div className={streaming ? 'pulse-dot' : undefined} style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, opacity: streaming ? 1 : 0.4, flexShrink: 0 }} />
              <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-md)', color: '#E8DCC8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeTitle}
              </span>
              {streaming && (
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: ACCENT, letterSpacing: '0.06em' }}>
                  Kinnareth está procesando...
                </span>
              )}
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {messages.length === 0 && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', minHeight: 100 }}>
                  Kinnareth en espera
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '80%', padding: '8px 12px', background: msg.role === 'user' ? `${ACCENT}18` : '#13100A', border: `1px solid ${msg.role === 'user' ? ACCENT + '40' : ACCENT + '20'}`, fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-md)', color: '#E8DCC8', lineHeight: 1.5, wordBreak: 'break-word' }}>
                    {msg.role === 'user' ? (
                      <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                    ) : (
                      <>
                        {msg.content ? <ReactMarkdown>{msg.content}</ReactMarkdown> : <span style={{ color: '#5A4A30', fontStyle: 'italic' }}>Escribiendo...</span>}
                        {streaming && i === messages.length - 1 && (
                          <span className="cursor-blink" style={{ color: ACCENT }}>▌</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '10px 16px', borderTop: `1px solid ${ACCENT}18`, display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Mensaje a Kinnareth..."
                rows={1}
                disabled={streaming}
                style={{ flex: 1, padding: '8px 12px', background: '#13100A', border: `1px solid ${ACCENT}30`, color: '#E8DCC8', fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-md)', outline: 'none', resize: 'none', minHeight: 36, maxHeight: 100, lineHeight: 1.5, opacity: streaming ? 0.6 : 1 }}
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
