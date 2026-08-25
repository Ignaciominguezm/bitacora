import { useState } from 'react'
import { UnriarChat } from '../components/chat/UnriarChat'
import { KinnarethChat } from '../components/chat/KinnarethChat'
import { WhatsAppHistory } from '../components/chat/WhatsAppHistory'

type Tab = 'unriar' | 'kinnareth' | 'whatsapp'

const TABS: { id: Tab; label: string; color: string }[] = [
  { id: 'unriar', label: 'Unriar', color: '#C8A840' },
  { id: 'kinnareth', label: 'Kinnareth', color: '#8B9DC8' },
  { id: 'whatsapp', label: 'WhatsApp', color: '#4ade80' }
]

export function ConversacionesPage() {
  const [tab, setTab] = useState<Tab>('unriar')

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0D0A06', position: 'relative' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(200,168,64,0.12)', flexShrink: 0 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '10px 24px',
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${tab === t.id ? t.color : 'transparent'}`,
              color: tab === t.id ? t.color : 'var(--color-text-muted)',
              fontFamily: 'Cinzel, serif',
              fontSize: 'var(--text-base)',
              letterSpacing: '0.08em',
              cursor: 'pointer',
              transition: 'color 0.15s, border-color 0.15s',
              marginBottom: -1
            }}
            onMouseEnter={(e) => { if (tab !== t.id) e.currentTarget.style.color = '#A09070' }}
            onMouseLeave={(e) => { if (tab !== t.id) e.currentTarget.style.color = 'var(--color-text-muted)' }}
          >
            {t.label.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Tab content — keep all mounted so state is preserved when switching */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, display: tab === 'unriar' ? 'flex' : 'none' }}>
          <UnriarChat />
        </div>
        <div style={{ position: 'absolute', inset: 0, display: tab === 'kinnareth' ? 'flex' : 'none' }}>
          <KinnarethChat />
        </div>
        <div style={{ position: 'absolute', inset: 0, display: tab === 'whatsapp' ? 'flex' : 'none' }}>
          <WhatsAppHistory />
        </div>
      </div>
    </div>
  )
}
