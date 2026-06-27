import { useState } from 'react'

type Page = 'dashboard' | 'conversations' | 'crm' | 'tasks' | 'team' | 'tiempo' | 'system'

interface NavItem {
  id: Page | 'logout'
  label: string
  symbol: string
  icon?: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', symbol: '⊞', icon: '/icons/astrolabio.svg' },
  { id: 'conversations', label: 'Conversaciones', symbol: '◈', icon: '/icons/mapa.svg' },
  { id: 'crm', label: 'CRM', symbol: '◎', icon: '/icons/cofre.svg' },
  { id: 'tasks', label: 'Tareas', symbol: '◻', icon: '/icons/espadas.svg' },
  { id: 'team', label: 'Equipo', symbol: '◈', icon: '/icons/catalejo.svg' },
  { id: 'tiempo', label: 'Tiempo', symbol: '◷' },
  { id: 'system', label: 'Sistema', symbol: '⊙' }
]

interface Props {
  currentPage: Page
  onNavigate: (page: Page) => void
  onLogout: () => void
}

export function Sidebar({ currentPage, onNavigate, onLogout }: Props) {
  const [tooltip, setTooltip] = useState<string | null>(null)

  const btnStyle = (id: string): React.CSSProperties => ({
    width: 40,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: currentPage === id ? 'rgba(200,168,64,0.15)' : 'transparent',
    border: currentPage === id ? '1px solid rgba(200,168,64,0.4)' : '1px solid transparent',
    color: currentPage === id ? '#C8A840' : '#5A4A30',
    fontSize: 18,
    cursor: 'pointer',
    transition: 'all 0.15s',
    position: 'relative'
  })

  return (
    <nav
      style={{
        width: 56,
        minHeight: '100vh',
        background: '#13100A',
        borderRight: '1px solid rgba(200,168,64,0.15)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 12,
        paddingBottom: 12,
        gap: 4,
        flexShrink: 0,
        position: 'relative',
        zIndex: 10
      }}
    >
      {/* Logo mark */}
      <div style={{ marginBottom: 16 }}>
        <img src="/favicon.png" width="32" height="32" alt="Bitácora" style={{ display: 'block' }} />
      </div>

      <div
        style={{
          width: 24,
          height: 1,
          background: 'rgba(200,168,64,0.2)',
          marginBottom: 8
        }}
      />

      {/* Navigation items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        {NAV_ITEMS.map((item) => (
          <div key={item.id} style={{ position: 'relative' }}>
            <button
              onClick={() => onNavigate(item.id as Page)}
              onMouseEnter={() => setTooltip(item.id)}
              onMouseLeave={() => setTooltip(null)}
              style={btnStyle(item.id)}
              title={item.label}
            >
              {item.icon ? (
                <img
                  src={item.icon}
                  width="24"
                  height="24"
                  style={{
                    opacity: currentPage === item.id ? 1 : 0.4,
                    filter: currentPage === item.id ? 'brightness(1.2)' : 'none',
                    transition: 'opacity 0.15s'
                  }}
                  alt={item.label}
                />
              ) : (
                item.symbol
              )}
            </button>
            {tooltip === item.id && (
              <div
                style={{
                  position: 'absolute',
                  left: 48,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: '#1A1510',
                  border: '1px solid rgba(200,168,64,0.3)',
                  color: '#E8DCC8',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 12,
                  padding: '4px 10px',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  zIndex: 100
                }}
              >
                {item.label}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Logout at bottom */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={onLogout}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#e05050'
            setTooltip('logout')
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#5A4A30'
            setTooltip(null)
          }}
          style={{
            width: 40,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: '1px solid transparent',
            color: '#5A4A30',
            fontSize: 18,
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
          title="Cerrar sesión"
        >
          ⊗
        </button>
        {tooltip === 'logout' && (
          <div
            style={{
              position: 'absolute',
              left: 48,
              top: '50%',
              transform: 'translateY(-50%)',
              background: '#1A1510',
              border: '1px solid rgba(200,168,64,0.3)',
              color: '#E8DCC8',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 12,
              padding: '4px 10px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 100
            }}
          >
            Cerrar sesión
          </div>
        )}
      </div>
    </nav>
  )
}
