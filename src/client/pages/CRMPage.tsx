import { useState } from 'react'

type View = 'admin' | 'cliente'

export function CRMPage() {
  const [view, setView] = useState<View>('admin')

  const iframeSrc = view === 'admin'
    ? 'https://clientes.viriatech.com/admin'
    : 'https://clientes.viriatech.com/'

  const toggleBtn = (v: View, label: string) => ({
    padding: '5px 16px',
    background: view === v ? 'rgba(200,168,64,0.2)' : 'transparent',
    border: view === v ? '1px solid rgba(200,168,64,0.5)' : '1px solid rgba(200,168,64,0.15)',
    color: view === v ? '#C8A840' : '#5A4A30',
    fontFamily: 'JetBrains Mono, monospace' as const,
    fontSize: 11,
    letterSpacing: '0.06em',
    cursor: 'pointer',
    transition: 'all 0.15s'
  } as React.CSSProperties)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0D0A06' }}>
      {/* Toggle bar */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid rgba(200,168,64,0.12)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: 11, color: '#A09070', letterSpacing: '0.08em', marginRight: 4 }}>
          VIRIATECH CRM
        </span>
        <div style={{ display: 'flex', gap: 0 }}>
          <button
            onClick={() => setView('admin')}
            style={{ ...toggleBtn('admin', 'Vista Admin'), borderRadius: '3px 0 0 3px' }}
            onMouseEnter={(e) => { if (view !== 'admin') e.currentTarget.style.color = '#A09070' }}
            onMouseLeave={(e) => { if (view !== 'admin') e.currentTarget.style.color = '#5A4A30' }}
          >
            Vista Admin
          </button>
          <button
            onClick={() => setView('cliente')}
            style={{ ...toggleBtn('cliente', 'Vista Cliente'), borderRadius: '0 3px 3px 0', marginLeft: -1 }}
            onMouseEnter={(e) => { if (view !== 'cliente') e.currentTarget.style.color = '#A09070' }}
            onMouseLeave={(e) => { if (view !== 'cliente') e.currentTarget.style.color = '#5A4A30' }}
          >
            Vista Cliente
          </button>
        </div>
      </div>

      {/* Iframe */}
      <iframe
        src={iframeSrc}
        style={{ width: '100%', flex: 1, border: 'none', display: 'block' }}
        title="Viriatech CRM"
      />
    </div>
  )
}
