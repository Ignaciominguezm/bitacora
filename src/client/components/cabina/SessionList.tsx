import type { CabinaSessionSummary } from '../../types/cabina'
import { ACCENT, AMBITO_LABEL, MODO_LABEL, MUTED, TEXT } from './theme'

interface Props {
  sessions: CabinaSessionSummary[]
  activeId: string | null
  loading?: boolean
  onSelect: (id: string) => void
  onNew: () => void
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

export function SessionList({ sessions, activeId, loading, onSelect, onNew }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${ACCENT}10`, flexShrink: 0 }}>
        <button
          onClick={onNew}
          style={{
            width: '100%',
            padding: '7px 12px',
            background: `${ACCENT}12`,
            border: `1px solid ${ACCENT}40`,
            color: ACCENT,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
            letterSpacing: '0.06em'
          }}
        >
          + Nueva conversación
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 12, color: MUTED, fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)' }}>
            Cargando...
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ padding: 12, color: MUTED, fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)' }}>
            Sin conversaciones
          </div>
        ) : (
          sessions.map((s) => {
            const active = s.id === activeId
            return (
              <div
                key={s.id}
                onClick={() => onSelect(s.id)}
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid rgba(200,168,64,0.06)',
                  cursor: 'pointer',
                  background: active ? `${ACCENT}10` : 'transparent',
                  borderLeft: `2px solid ${active ? ACCENT : 'transparent'}`
                }}
              >
                <div
                  style={{
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: 'var(--text-base)',
                    color: TEXT,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {s.title}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 2,
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 'var(--text-2xs)',
                    color: MUTED
                  }}
                >
                  <span>{fmtDate(s.updated_at)}</span>
                  <span>·</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {AMBITO_LABEL[s.ambito]} / {MODO_LABEL[s.modo]}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
