import { useState, useEffect, useRef } from 'react'

interface Notification {
  id: number
  origen: string
  tipo: string
  mensaje: string
  timestamp: string
  leida: boolean
}

interface QuickPref {
  scope_value: string
  enabled: boolean
}

interface PrefsResponse {
  global: QuickPref[]
  actor: QuickPref[]
  origen: QuickPref[]
}

const MAX_VISIBLE = 5

const TIPO_COLOR: Record<string, string> = {
  alerta: '#F87171',
  fichaje: '#4ADE80',
  tarea_creada: '#C8A840'
}

function tipoColor(tipo: string): string {
  return TIPO_COLOR[tipo] ?? '#5A4A30'
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return 'ahora mismo'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`
  return `hace ${Math.floor(diff / 86400)} d`
}

function QuickToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 34,
        height: 19,
        borderRadius: 10,
        background: checked ? '#C8A840' : 'rgba(90,74,48,0.5)',
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.2s',
        flexShrink: 0,
        padding: 0
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 17 : 2,
          width: 15,
          height: 15,
          borderRadius: '50%',
          background: '#E8DCC8',
          transition: 'left 0.2s',
          display: 'block'
        }}
      />
    </button>
  )
}

interface Props {
  onNavigate?: (page: string) => void
}

export function NotificationCenter({ onNavigate }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [visible, setVisible] = useState(true)
  const [quickOpen, setQuickOpen] = useState(false)
  const [globalEnabled, setGlobalEnabled] = useState(true)
  const [myActionsEnabled, setMyActionsEnabled] = useState(true)
  const esRef = useRef<EventSource | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const quickRef = useRef<HTMLDivElement | null>(null)
  const [, forceUpdate] = useState(0)

  // Refresh relative timestamps every minute
  useEffect(() => {
    tickRef.current = setInterval(() => forceUpdate((n) => n + 1), 60_000)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [])

  // Fetch unread on mount
  useEffect(() => {
    fetch('/api/notify/unread', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: Notification[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setNotifications(data)
          setVisible(true)
        }
      })
      .catch(() => {})
  }, [])

  // SSE connection — withCredentials sends the JWT cookie
  useEffect(() => {
    const es = new EventSource('/api/notify/stream', { withCredentials: true })

    es.addEventListener('notification', (e: MessageEvent) => {
      const notif: Notification = JSON.parse(e.data as string)
      setNotifications((prev) => [notif, ...prev])
      setVisible(true)
    })

    es.addEventListener('connected', () => {
      console.log('[notify] SSE connected')
    })

    es.onerror = () => { /* browser auto-reconnects */ }

    esRef.current = es
    return () => { es.close() }
  }, [])

  // Re-fetch quick prefs each time the panel opens (stays fresh after Ajustes changes)
  useEffect(() => {
    if (!quickOpen) return
    fetch('/api/notify/preferences', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: PrefsResponse) => {
        const gp = data.global?.find((p) => p.scope_value === 'all')
        const ap = data.actor?.find((p) => p.scope_value === 'Ignacio Mínguez Montes')
        setGlobalEnabled(gp?.enabled ?? true)
        setMyActionsEnabled(ap?.enabled ?? true)
      })
      .catch(() => {})
  }, [quickOpen])

  // Close quick panel on outside click
  useEffect(() => {
    if (!quickOpen) return
    function handler(e: MouseEvent) {
      if (quickRef.current && !quickRef.current.contains(e.target as Node)) {
        setQuickOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [quickOpen])

  async function patchPref(scope_type: string, scope_value: string, enabled: boolean) {
    await fetch('/api/notify/preferences', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope_type, scope_value, enabled })
    }).catch(() => {})
  }

  async function toggleGlobal(v: boolean) {
    setGlobalEnabled(v)
    await patchPref('global', 'all', v)
  }

  async function toggleMyActions(v: boolean) {
    setMyActionsEnabled(v)
    await patchPref('actor', 'Ignacio Mínguez Montes', v)
  }

  async function markRead(id: number) {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    await fetch(`/api/notify/${id}/read`, { method: 'PATCH', credentials: 'include' }).catch(() => {})
  }

  async function markAllRead() {
    setNotifications([])
    await fetch('/api/notify/read-all', { method: 'PATCH', credentials: 'include' }).catch(() => {})
  }

  const unreadCount = notifications.length
  const visibleCards = visible ? notifications.slice(0, MAX_VISIBLE) : []
  const hiddenCount = notifications.length - MAX_VISIBLE

  return (
    <>
      {/* Bell + gear — fixed top right */}
      <div
        ref={quickRef}
        style={{
          position: 'fixed',
          top: 12,
          right: 16,
          zIndex: 200,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}
      >
        {/* Gear button */}
        <button
          onClick={() => setQuickOpen((v) => !v)}
          title="Ajustes de notificaciones"
          style={{
            width: 30,
            height: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: quickOpen ? 'rgba(200,168,64,0.32)' : 'transparent',
            border: `1px solid ${quickOpen ? '#C8A840' : 'rgba(200,168,64,0.1)'}`,
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 14,
            color: quickOpen ? '#C8A840' : '#5A4A30',
            transition: 'all 0.15s'
          }}
        >
          ⚙
        </button>

        {/* Bell button */}
        <button
          onClick={() => setVisible((v) => !v)}
          title={visible ? 'Ocultar notificaciones' : 'Mostrar notificaciones'}
          style={{
            position: 'relative',
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: unreadCount > 0 ? 'rgba(200,168,64,0.12)' : 'transparent',
            border: `1px solid ${unreadCount > 0 ? 'rgba(200,168,64,0.35)' : 'rgba(200,168,64,0.12)'}`,
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 16,
            transition: 'all 0.15s'
          }}
        >
          🔔
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -5,
                right: -5,
                minWidth: 16,
                height: 16,
                padding: '0 3px',
                background: '#F87171',
                borderRadius: 8,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 9,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Quick settings dropdown */}
        {quickOpen && (
          <div
            style={{
              position: 'absolute',
              top: 44,
              right: 0,
              width: 260,
              background: '#1A1510',
              border: '1px solid rgba(200,168,64,0.25)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              zIndex: 300
            }}
          >
            <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(200,168,64,0.1)', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#5A4A30', letterSpacing: '0.1em' }}>
              NOTIFICACIONES
            </div>

            {/* Master toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(200,168,64,0.06)' }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#E8DCC8' }}>
                Activar notificaciones
              </span>
              <QuickToggle checked={globalEnabled} onChange={toggleGlobal} />
            </div>

            {/* My actions toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderBottom: '1px solid rgba(200,168,64,0.06)',
                opacity: globalEnabled ? 1 : 0.4,
                transition: 'opacity 0.15s'
              }}
            >
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#E8DCC8' }}>
                Mis acciones
              </span>
              <QuickToggle
                checked={myActionsEnabled}
                onChange={(v) => { if (globalEnabled) toggleMyActions(v) }}
              />
            </div>

            {/* Link to Ajustes page */}
            <button
              onClick={() => {
                setQuickOpen(false)
                onNavigate?.('ajustes')
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 14px',
                background: 'transparent',
                border: 'none',
                cursor: onNavigate ? 'pointer' : 'default',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                color: '#8B6914',
                letterSpacing: '0.04em',
                width: '100%'
              }}
              onMouseEnter={(e) => { if (onNavigate) e.currentTarget.style.color = '#C8A840' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#8B6914' }}
            >
              <span>Más ajustes</span>
              <span>→</span>
            </button>
          </div>
        )}
      </div>

      {/* Toast stack — fixed bottom right */}
      {visibleCards.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            zIndex: 200,
            display: 'flex',
            flexDirection: 'column-reverse',
            gap: 10,
            width: 340,
            maxWidth: 'calc(100vw - 40px)'
          }}
        >
          {/* Mark all read button */}
          {notifications.length >= 2 && (
            <button
              onClick={markAllRead}
              style={{
                alignSelf: 'flex-end',
                padding: '4px 12px',
                background: 'rgba(200,168,64,0.1)',
                border: '1px solid rgba(200,168,64,0.3)',
                color: '#C8A840',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                letterSpacing: '0.06em',
                cursor: 'pointer',
                transition: 'background 0.15s'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(200,168,64,0.2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(200,168,64,0.1)')}
            >
              Marcar todas como leídas
            </button>
          )}

          {/* Overflow indicator */}
          {hiddenCount > 0 && (
            <div
              style={{
                textAlign: 'center',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                color: '#5A4A30',
                padding: '4px 0'
              }}
            >
              +{hiddenCount} más
            </div>
          )}

          {/* Cards — newest first */}
          {visibleCards.map((n) => (
            <div
              key={n.id}
              className="notif-card"
              style={{
                background: '#1A1510',
                border: '1px solid rgba(200,168,64,0.18)',
                borderLeft: `3px solid ${tipoColor(n.tipo)}`,
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
              }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 9,
                      color: '#E8DCC8',
                      background: '#5C3D0E',
                      border: '1px solid rgba(200,168,64,0.3)',
                      padding: '1px 5px',
                      letterSpacing: '0.06em'
                    }}
                  >
                    {n.origen}
                  </span>
                  <span
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 9,
                      color: '#C8A840',
                      letterSpacing: '0.04em'
                    }}
                  >
                    {n.tipo}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 9,
                      color: '#8B6914'
                    }}
                  >
                    {relativeTime(n.timestamp)}
                  </span>
                  <button
                    onClick={() => markRead(n.id)}
                    title="Marcar como leída"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#E8DCC8',
                      cursor: 'pointer',
                      fontSize: 16,
                      lineHeight: 1,
                      padding: '0 2px',
                      transition: 'color 0.15s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#F87171')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#E8DCC8')}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Message */}
              <p
                style={{
                  margin: 0,
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 13,
                  color: '#A09070',
                  lineHeight: 1.45
                }}
              >
                {n.mensaje}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
