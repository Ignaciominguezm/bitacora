import { useState, useEffect, useRef } from 'react'

const ACCENT_WA = '#4ade80'

interface Contact {
  session_id: string
  phone: string
  full_name: string | null
  last_message: string
  last_type: 'human' | 'ai'
  message_count: number
  last_id: number
}

interface WaMessage {
  id: number
  type: string
  content: string
  tool_calls?: unknown
}

export function WhatsAppHistory() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selected, setSelected] = useState<Contact | null>(null)
  const [waMessages, setWaMessages] = useState<WaMessage[]>([])
  const [loadingContacts, setLoadingContacts] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [showList, setShowList] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [waMessages])

  useEffect(() => {
    fetch('/api/whatsapp/recent', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { conversations?: Contact[] }) => setContacts(data.conversations || []))
      .catch(() => {})
      .finally(() => setLoadingContacts(false))
  }, [])

  async function selectContact(contact: Contact) {
    setSelected(contact)
    setShowList(false)
    setLoadingMsgs(true)
    setWaMessages([])
    try {
      const res = await fetch(`/api/whatsapp/conversation/${encodeURIComponent(contact.session_id)}`, { credentials: 'include' })
      const data: { messages?: WaMessage[] } = await res.json()
      setWaMessages(data.messages || [])
    } catch {
      setWaMessages([])
    } finally {
      setLoadingMsgs(false)
    }
  }

  function displayName(c: Contact) {
    return c.full_name || c.phone
  }

  function truncate(text: string, len = 60) {
    return text.length > len ? text.slice(0, len) + '…' : text
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
      {/* Left panel — contact list */}
      <div className={`conv-list-panel ${!showList ? 'conv-hidden' : ''}`}
        style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid rgba(74,222,128,0.12)' }}
      >
        <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(74,222,128,0.1)', flexShrink: 0 }}>
          <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-sm)', color: '#A09070', letterSpacing: '0.08em' }}>WHATSAPP — UnrIA</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingContacts ? (
            <div style={{ padding: 12, color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)' }}>Cargando...</div>
          ) : contacts.length === 0 ? (
            <div style={{ padding: 12, color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)' }}>Sin conversaciones</div>
          ) : contacts.map((c) => (
            <div
              key={c.session_id}
              onClick={() => selectContact(c)}
              style={{ padding: '10px 12px', borderBottom: '1px solid rgba(200,168,64,0.06)', cursor: 'pointer', background: selected?.session_id === c.session_id ? 'rgba(74,222,128,0.22)' : 'transparent', borderLeft: `2px solid ${selected?.session_id === c.session_id ? ACCENT_WA : 'transparent'}`, transition: 'all 0.1s' }}
              onMouseEnter={(e) => { if (selected?.session_id !== c.session_id) (e.currentTarget as HTMLDivElement).style.background = 'rgba(74,222,128,0.04)' }}
              onMouseLeave={(e) => { if (selected?.session_id !== c.session_id) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: c.last_type === 'ai' ? '#C8A840' : '#5A4A30', flexShrink: 0 }} />
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-base)', color: '#E8DCC8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {displayName(c)}
                </span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: '#5A4A30', flexShrink: 0 }}>
                  {c.message_count}
                </span>
              </div>
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-sm)', color: '#7A6A50', paddingLeft: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {truncate(c.last_message)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — conversation */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)' }}>
            Selecciona una conversación
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(74,222,128,0.1)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <button
                className="conv-mobile-back"
                onClick={() => setShowList(true)}
                style={{ background: 'transparent', border: 'none', color: '#5A4A30', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-lg)', padding: '0 4px' }}
              >
                ←
              </button>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: ACCENT_WA, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-md)', color: '#E8DCC8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {displayName(selected)}
                </div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#5A4A30' }}>
                  {selected.phone} · {selected.message_count} mensajes
                </div>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {loadingMsgs ? (
                <div style={{ padding: 12, color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)' }}>Cargando...</div>
              ) : waMessages.length === 0 ? (
                <div style={{ padding: 12, color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)' }}>Sin mensajes</div>
              ) : waMessages.filter((m) => m.type !== 'tool').map((msg) => {
                const isHuman = msg.type === 'human'
                return (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isHuman ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '78%',
                      padding: '7px 11px',
                      background: isHuman ? 'rgba(90,74,48,0.3)' : '#13100A',
                      border: isHuman ? '1px solid rgba(90,74,48,0.5)' : '1px solid rgba(200,168,64,0.15)',
                      fontFamily: 'DM Sans, sans-serif',
                      fontSize: 'var(--text-md)',
                      color: '#E8DCC8',
                      lineHeight: 1.5,
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap'
                    }}>
                      {msg.content || <span style={{ color: '#5A4A30', fontStyle: 'italic' }}>[sin contenido]</span>}
                    </div>
                    {!isHuman && (
                      <div style={{ marginTop: 2, fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: '#5A4A30', paddingLeft: 2 }}>
                        UnrIA
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
