import { useState, useEffect } from 'react'

interface TimeEntry {
  name: string
  entry_type: string | null
  clock_in: string
  clock_out: string | null
  activo: boolean
}

interface CurrentTask {
  employee_name: string
  task_title: string
  priority: string | null
  client_name: string | null
  updated_at: string
}

const ENTRY_TYPE_LABEL: Record<string, string> = {
  TRABAJO: 'Laboral',
  FORMACION: 'Formación'
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#ef4444',
  high: '#fb923c',
  medium: '#facc15',
  low: '#4ade80'
}

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function duration(from: string, to: string | null) {
  const start = new Date(from).getTime()
  const end = to ? new Date(to).getTime() : Date.now()
  const mins = Math.floor((end - start) / 60_000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function Avatar({ name }: { name: string }) {
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: 'rgba(200,168,64,0.12)',
        border: '1px solid rgba(200,168,64,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Cinzel, serif',
        fontSize: 12,
        color: '#C8A840',
        flexShrink: 0
      }}
    >
      {initials(name)}
    </div>
  )
}

export function TeamPage() {
  const [fichajes, setFichajes] = useState<TimeEntry[]>([])
  const [tasks, setTasks] = useState<CurrentTask[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchAll() {
    const [todayRes, tasksRes] = await Promise.allSettled([
      fetch('/api/team/today', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/team/current-tasks', { credentials: 'include' }).then((r) => r.json())
    ])

    if (todayRes.status === 'fulfilled') {
      const d = todayRes.value as { fichajes: TimeEntry[] }
      setFichajes(d.fichajes ?? [])
    }
    if (tasksRes.status === 'fulfilled') {
      setTasks(tasksRes.value as CurrentTask[])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 30_000)
    return () => clearInterval(interval)
  }, [])

  const today = new Date().toLocaleDateString('es', {
    timeZone: 'Europe/Madrid',
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  })

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 32px',
        background: '#0D0A06',
        display: 'flex',
        flexDirection: 'column',
        gap: 32
      }}
    >
      {/* Page header */}
      <div>
        <h1
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: 18,
            color: '#C8A840',
            letterSpacing: '0.1em',
            margin: 0
          }}
        >
          EQUIPO
        </h1>
        <p
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
            color: '#5A4A30',
            margin: '4px 0 0'
          }}
        >
          {today}
        </p>
      </div>

      {loading ? (
        <div style={{ color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
          Cargando...
        </div>
      ) : (
        <>
          {/* Section 1 — Fichajes de hoy */}
          <section>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 9,
                color: '#5A4A30',
                letterSpacing: '0.12em',
                marginBottom: 12
              }}
            >
              FICHAJES DE HOY
            </div>

            {fichajes.length === 0 ? (
              <p style={{ color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                Sin fichajes hoy
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {fichajes.map((te, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '10px 16px',
                      background: '#13100A',
                      border: '1px solid rgba(200,168,64,0.08)',
                    }}
                  >
                    <Avatar name={te.name} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: 'DM Sans, sans-serif',
                          fontSize: 13,
                          color: '#E8DCC8',
                          marginBottom: 2
                        }}
                      >
                        {te.name}
                      </div>
                      {te.entry_type && (
                        <span
                          style={{
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: 9,
                            color: '#7A6A50',
                            background: 'rgba(200,168,64,0.08)',
                            border: '1px solid rgba(200,168,64,0.15)',
                            padding: '1px 5px',
                            letterSpacing: '0.04em'
                          }}
                        >
                          {ENTRY_TYPE_LABEL[te.entry_type] ?? te.entry_type}
                        </span>
                      )}
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 12,
                          color: te.activo ? '#4ade80' : '#A09070'
                        }}
                      >
                        {formatTime(te.clock_in)}
                        {' → '}
                        {te.activo ? (
                          <span style={{ color: '#4ade80' }}>en curso</span>
                        ) : te.clock_out ? (
                          formatTime(te.clock_out)
                        ) : '—'}
                      </div>
                      <div
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 10,
                          color: '#5A4A30',
                          marginTop: 2
                        }}
                      >
                        {duration(te.clock_in, te.clock_out)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 2 — Tarea actual */}
          <section>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 9,
                color: '#5A4A30',
                letterSpacing: '0.12em',
                marginBottom: 12
              }}
            >
              TAREA ACTUAL
            </div>

            {tasks.length === 0 ? (
              <p style={{ color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                Sin tareas activas
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tasks.map((t, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '10px 16px',
                      background: '#13100A',
                      border: '1px solid rgba(200,168,64,0.08)',
                    }}
                  >
                    <Avatar name={t.employee_name} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: 'DM Sans, sans-serif',
                          fontSize: 13,
                          color: '#E8DCC8',
                          marginBottom: 3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {t.task_title}
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span
                          style={{
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: 10,
                            color: '#7A6A50'
                          }}
                        >
                          {t.employee_name}
                        </span>
                        {t.client_name && (
                          <>
                            <span style={{ color: '#3A2A18' }}>·</span>
                            <span
                              style={{
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: 10,
                                color: '#5A4A30'
                              }}
                            >
                              {t.client_name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {t.priority && (
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: PRIORITY_COLOR[t.priority.toLowerCase()] ?? '#5A4A30',
                          flexShrink: 0
                        }}
                        title={t.priority}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
