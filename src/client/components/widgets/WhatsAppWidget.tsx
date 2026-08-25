import { useState, useEffect } from 'react'

interface Conversation {
  session_id: string
  phone: string
  full_name: string | null
  last_message: string
  last_type: 'human' | 'ai'
  message_count: number
  last_id: number
}

export function WhatsAppWidget() {
  const [convs, setConvs] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/whatsapp/recent', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { conversations?: Conversation[] }) => setConvs(data.conversations || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function displayName(conv: Conversation): string {
    return conv.full_name || conv.phone
  }

  function truncate(text: string): string {
    return text.length > 80 ? text.slice(0, 80) + '…' : text
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
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-sm)', color: '#A09070', letterSpacing: '0.08em' }}>
          WHATSAPP — UnrIA
        </span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          {convs.length} recientes
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {loading ? (
          <div style={{ padding: 12, color: 'var(--color-text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)' }}>
            Cargando conversaciones...
          </div>
        ) : convs.length === 0 ? (
          <div style={{ padding: 12, color: 'var(--color-text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)' }}>
            Sin conversaciones recientes
          </div>
        ) : (
          convs.map((conv) => (
            <div
              key={conv.session_id}
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
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-base)', color: '#E8DCC8', fontWeight: 500 }}>
                  {displayName(conv)}
                </span>
                <span
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 'var(--text-2xs)',
                    color: conv.last_type === 'ai' ? '#C8A840' : 'var(--color-text-muted)',
                    letterSpacing: '0.06em'
                  }}
                >
                  {conv.last_type === 'ai' ? 'UnrIA' : 'user'}
                </span>
              </div>
              <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-sm)', color: '#A09070' }}>
                {truncate(conv.last_message)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
