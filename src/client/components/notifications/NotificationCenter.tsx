import { useState, useEffect, useRef } from 'react'

interface Notification {
  id: number
  origen: string
  tipo: string
  mensaje: string
  timestamp: string
  leida: boolean
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

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [visible, setVisible] = useState(true)
  const esRef = useRef<EventSource | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
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

  // SSE connection
  useEffect(() => {
    const es = new EventSource('/api/notify/stream')

    es.addEventListener('notification', (e: MessageEvent) => {
      const notif: Notification = JSON.parse(e.data as string)
      setNotifications((prev) => [notif, ...prev])
      setVisible(true)
    })

    esRef.current = es
    return () => { es.close() }
  }, [])

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
      {/* Bell button — fixed top right */}
      <div
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

          {/* Cards — newest first (slice already ordered newest→oldest) */}
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
                      color: '#5A4A30',
                      background: 'rgba(200,168,64,0.07)',
                      border: '1px solid rgba(200,168,64,0.15)',
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
                      color: tipoColor(n.tipo),
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
                      color: '#5A4A30'
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
                      color: '#5A4A30',
                      cursor: 'pointer',
                      fontSize: 12,
                      lineHeight: 1,
                      padding: '0 2px',
                      transition: 'color 0.15s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#E8DCC8')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#5A4A30')}
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
                  color: '#E8DCC8',
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
