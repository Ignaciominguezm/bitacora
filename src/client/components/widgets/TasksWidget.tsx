import { useState, useEffect } from 'react'

interface Task {
  id: number
  title: string
  description?: string
  priority: string
  status: string
  due_date?: string
  assigned_to?: string
  client_name?: string
  client_color?: string
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#f87171',
  high: '#fb923c',
  medium: '#facc15',
  low: '#86efac'
}

const PRIORITY_LABEL: Record<string, string> = {
  urgent: 'URG',
  high: 'ALT',
  medium: 'MED',
  low: 'BAJ'
}

function isOverdue(dateStr?: string) {
  if (!dateStr) return false
  return new Date(dateStr) < new Date()
}

export function TasksWidget() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/tasks/urgent', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: Task[]) => setTasks(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

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
          TAREAS URGENTES
        </span>
        {tasks.length > 0 && (
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              color: '#C8A840',
              background: 'rgba(200,168,64,0.12)',
              padding: '1px 6px',
              border: '1px solid rgba(200,168,64,0.25)'
            }}
          >
            {tasks.length}
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {loading ? (
          <div style={{ padding: 12, color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
            Cargando...
          </div>
        ) : tasks.length === 0 ? (
          <div style={{ padding: 12, color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
            Sin tareas urgentes ✓
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              style={{
                padding: '6px 12px',
                borderBottom: '1px solid rgba(200,168,64,0.06)',
                display: 'flex',
                flexDirection: 'column',
                gap: 3
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 9,
                    color: PRIORITY_COLOR[task.priority] || '#5A4A30',
                    background: `${PRIORITY_COLOR[task.priority] || '#5A4A30'}18`,
                    padding: '1px 4px',
                    border: `1px solid ${PRIORITY_COLOR[task.priority] || '#5A4A30'}40`,
                    flexShrink: 0
                  }}
                >
                  {PRIORITY_LABEL[task.priority] || task.priority}
                </span>
                <span
                  style={{
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: 12,
                    color: '#E8DCC8',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1
                  }}
                >
                  {task.title}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, paddingLeft: 0 }}>
                {task.client_name && (
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A4A30' }}>
                    {task.client_name}
                  </span>
                )}
                {task.due_date && (
                  <span
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 10,
                      color: isOverdue(task.due_date) ? '#f87171' : '#A09070'
                    }}
                  >
                    {new Date(task.due_date).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                  </span>
                )}
                {task.assigned_to && (
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A4A30' }}>
                    → {task.assigned_to}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
