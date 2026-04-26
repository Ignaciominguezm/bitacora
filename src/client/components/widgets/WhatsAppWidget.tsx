import { useState, useEffect } from 'react'

interface Conversation {
  id: number
  session_id: string
  [key: string]: unknown
}

export function WhatsAppWidget() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/whatsapp/recent', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: Conversation[]) => setConversations(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function getDisplayName(conv: Conversation): string {
    return (conv.display_name as string) || (conv.session_id as string) || `Conversación ${conv.id}`
  }

  function getLastMessage(conv: Conversation): string {
    const msg = (conv.last_message as string) || (conv.message as string) || ''
    return msg.length > 60 ? msg.slice(0, 60) + '…' : msg
  }

  function getTimestamp(conv: Conversation): string {
    const ts = conv.updated_at || conv.created_at || conv.timestamp
    if (!ts) return ''
    return new Date(ts as string).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid rgba(200,168,64,0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: 11, color: '#A09070', letterSpacing: '0.08em' }}>
          WHATSAPP — UnrIA
        </span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A4A30' }}>
          {conversations.length} recientes
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {loading ? (
          <div style={{ padding: 12, color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
            Cargando conversaciones...
          </div>
        ) : conversations.length === 0 ? (
          <div style={{ padding: 12, color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
            Sin conversaciones recientes
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              style={{
                padding: '7px 12px',
                borderBottom: '1px solid rgba(200,168,64,0.06)',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                cursor: 'pointer',
                transition: 'background 0.1s'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(200,168,64,0.04)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#E8DCC8', fontWeight: 500 }}>
                  {getDisplayName(conv)}
                </span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A4A30' }}>
                  {getTimestamp(conv)}
                </span>
              </div>
              <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: '#A09070' }}>
                {getLastMessage(conv)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
