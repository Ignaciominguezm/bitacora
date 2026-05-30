import { useState, useEffect } from 'react'

interface TimeEntry {
  name: string
  entry_type: string | null
  clock_in: string
  clock_out: string | null
  activo: boolean
}

interface Absence {
  name: string
  type: string
  start_date: string
  end_date: string
}

interface Alerta {
  name: string
  clock_in: string
  tipo: 'madrugada' | 'nocturno'
}

interface TeamData {
  fichajes: TimeEntry[]
  ausencias: Absence[]
  alertas: Alerta[]
}

interface CurrentTask {
  employee_name: string
  task_title: string
  priority: string | null
  client_name: string | null
  updated_at: string
}

export function TeamWidget() {
  const [data, setData] = useState<TeamData>({ fichajes: [], ausencias: [], alertas: [] })
  const [tasks, setTasks] = useState<Map<string, CurrentTask>>(new Map())
  const [loading, setLoading] = useState(true)

  async function fetchTeam() {
    try {
      const [todayRes, tasksRes] = await Promise.allSettled([
        fetch('/api/team/today', { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/team/current-tasks', { credentials: 'include' }).then((r) => r.json())
      ])

      if (todayRes.status === 'fulfilled') {
        setData(todayRes.value as TeamData)
      }
      if (tasksRes.status === 'fulfilled') {
        const taskList = tasksRes.value as CurrentTask[]
        setTasks(new Map(taskList.map((t) => [t.employee_name, t])))
      }
    } catch (err) {
      console.error('[TeamWidget] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTeam()
    const interval = setInterval(fetchTeam, 30_000)
    return () => clearInterval(interval)
  }, [])

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('es', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const today = new Date().toLocaleDateString('es', {
    timeZone: 'Europe/Madrid',
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  })

  const isEmpty = data.fichajes.length === 0 && data.ausencias.length === 0

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
          EQUIPO HOY
        </span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A4A30' }}>
          {today}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {loading ? (
          <div style={{ padding: 12, color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
            Cargando...
          </div>
        ) : isEmpty ? (
          <div style={{ padding: 12, color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
            Sin actividad hoy
          </div>
        ) : (
          <>
            {/* Alertas */}
            {data.alertas.length > 0 && (
              <div style={{ marginBottom: 4 }}>
                <div style={{ padding: '2px 12px', color: '#facc15', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em' }}>
                  ALERTAS
                </div>
                {data.alertas.map((al, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 12px', borderBottom: '1px solid rgba(250,204,21,0.08)', background: 'rgba(250,204,21,0.04)' }}>
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#facc15' }}>{al.name}</span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#facc15' }}>
                      {formatTime(al.clock_in)} · {al.tipo}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Fichajes */}
            {data.fichajes.length > 0 && (
              <div style={{ marginBottom: 4 }}>
                <div style={{ padding: '2px 12px', color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em' }}>
                  FICHAJES
                </div>
                {data.fichajes.map((te, i) => {
                  const task = tasks.get(te.name)
                  return (
                    <div key={i} style={{ padding: '5px 12px', borderBottom: '1px solid rgba(200,168,64,0.05)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#E8DCC8' }}>{te.name}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {te.entry_type && (
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#7A6A50', background: 'rgba(200,168,64,0.08)', border: '1px solid rgba(200,168,64,0.15)', padding: '1px 5px', letterSpacing: '0.04em' }}>
                              {te.entry_type === 'TRABAJO' ? 'Laboral' : te.entry_type === 'FORMACION' ? 'Formación' : te.entry_type}
                            </span>
                          )}
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: te.activo ? '#4ade80' : '#A09070' }}>
                            {formatTime(te.clock_in)}
                            {te.activo ? ' → en curso' : te.clock_out ? ` → ${formatTime(te.clock_out)}` : ''}
                          </span>
                        </span>
                      </div>
                      {task && (
                        <div style={{ marginTop: 2, display: 'flex', alignItems: 'baseline', gap: 6, paddingLeft: 2 }}>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A4A30', flexShrink: 0 }}>↳</span>
                          <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: '#7A6A50', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {task.task_title}
                            {task.client_name && (
                              <span style={{ color: '#4A3A20', marginLeft: 5 }}>· {task.client_name}</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Ausencias */}
            {data.ausencias.length > 0 && (
              <div>
                <div style={{ padding: '2px 12px', color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em' }}>
                  AUSENCIAS
                </div>
                {data.ausencias.map((ab, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 12px', borderBottom: '1px solid rgba(200,168,64,0.05)' }}>
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#E8DCC8' }}>{ab.name}</span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#fb923c' }}>{ab.type}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
