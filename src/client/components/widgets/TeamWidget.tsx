import { useState, useEffect } from 'react'

interface TimeEntry {
  name: string
  clock_in: string
  clock_out: string | null
}

interface Absence {
  name: string
  absence_type: string
  date_from: string
  date_to: string
}

interface Task {
  id: number
  title: string
  priority: string
  assigned_to: string
}

interface TeamData {
  timeEntries: TimeEntry[]
  absences: Absence[]
  tasks: Task[]
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#f87171',
  high: '#fb923c',
  medium: '#facc15',
  low: '#4ade80'
}

export function TeamWidget() {
  const [data, setData] = useState<TeamData>({ timeEntries: [], absences: [], tasks: [] })
  const [loading, setLoading] = useState(true)

  async function fetchTeam() {
    try {
      const res = await fetch('/api/team/today', { credentials: 'include' })
      const d: TeamData = await res.json()
      setData(d)
    } catch {
      // keep stale
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
    return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
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
          EQUIPO HOY
        </span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A4A30' }}>
          {new Date().toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {loading ? (
          <div style={{ padding: 12, color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
            Cargando...
          </div>
        ) : (
          <>
            {/* Clock-ins */}
            {data.timeEntries.length > 0 && (
              <div style={{ marginBottom: 4 }}>
                <div style={{ padding: '2px 12px', color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em' }}>
                  FICHAJES
                </div>
                {data.timeEntries.map((te, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 12px', borderBottom: '1px solid rgba(200,168,64,0.05)' }}>
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#E8DCC8' }}>{te.name}</span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#A09070' }}>
                      {formatTime(te.clock_in)}{te.clock_out ? ` → ${formatTime(te.clock_out)}` : ' →'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Absences */}
            {data.absences.length > 0 && (
              <div style={{ marginBottom: 4 }}>
                <div style={{ padding: '2px 12px', color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em' }}>
                  AUSENCIAS
                </div>
                {data.absences.map((ab, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 12px', borderBottom: '1px solid rgba(200,168,64,0.05)' }}>
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#E8DCC8' }}>{ab.name}</span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#fb923c' }}>{ab.absence_type}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Tasks today */}
            {data.tasks.length > 0 && (
              <div>
                <div style={{ padding: '2px 12px', color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em' }}>
                  TAREAS HOY
                </div>
                {data.tasks.map((t) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', borderBottom: '1px solid rgba(200,168,64,0.05)' }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: PRIORITY_COLOR[t.priority] || '#5A4A30', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#E8DCC8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.title}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {data.timeEntries.length === 0 && data.absences.length === 0 && data.tasks.length === 0 && (
              <div style={{ padding: 12, color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                Sin actividad registrada
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
