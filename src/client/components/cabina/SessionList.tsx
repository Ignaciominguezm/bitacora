import { useRef, useState } from 'react'
import type { CabinaSessionSummary } from '../../types/cabina'
import { ACCENT, AMBITO_LABEL, MODO_LABEL, MUTED, TEXT, WARN } from './theme'

interface Props {
  sessions: CabinaSessionSummary[]
  activeId: string | null
  loading?: boolean
  onSelect: (id: string) => void
  // 'active' (por defecto): botón "Nueva conversación" + acciones Renombrar
  // y Archivar. 'archived': sin "Nueva conversación", acciones Desarchivar
  // y Borrar — renombrar solo tiene sentido sobre conversaciones activas.
  variant?: 'active' | 'archived'
  onNew?: () => void
  onArchive?: (id: string) => void
  onUnarchive?: (id: string) => void
  onDelete?: (id: string) => void
  onRename?: (id: string, title: string) => void
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

const rowActionStyle = { background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', padding: '2px 4px', flexShrink: 0 } as const

export function SessionList({ sessions, activeId, loading, onSelect, variant = 'active', onNew, onArchive, onUnarchive, onDelete, onRename }: Props) {
  // Una sola fila editable a la vez — el id en edición y su borrador de
  // título. skipBlurRef evita que Escape (que cierra sin confirmar) dispare
  // igualmente el confirmar-por-blur si el navegador emite un blur al
  // desmontarse el input justo después.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const skipBlurRef = useRef(false)

  function startEdit(s: CabinaSessionSummary) {
    setEditingId(s.id)
    setDraftTitle(s.title)
  }

  function confirmEdit() {
    if (skipBlurRef.current) { skipBlurRef.current = false; return }
    const trimmed = draftTitle.trim()
    if (editingId && trimmed && onRename) onRename(editingId, trimmed)
    setEditingId(null)
  }

  function cancelEdit() {
    skipBlurRef.current = true
    setEditingId(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
      {variant === 'active' && (
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
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 12, color: MUTED, fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)' }}>
            Cargando...
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ padding: 12, color: MUTED, fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)' }}>
            {variant === 'archived' ? 'Sin conversaciones archivadas' : 'Sin conversaciones'}
          </div>
        ) : (
          sessions.map((s) => {
            const active = s.id === activeId
            return (
              <div
                key={s.id}
                onClick={() => onSelect(s.id)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                  padding: '10px 12px',
                  borderBottom: '1px solid rgba(200,168,64,0.06)',
                  cursor: 'pointer',
                  background: active ? `${ACCENT}10` : 'transparent',
                  borderLeft: `2px solid ${active ? ACCENT : 'transparent'}`
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingId === s.id ? (
                    <input
                      autoFocus
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); confirmEdit() }
                        else if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                      }}
                      onBlur={confirmEdit}
                      style={{
                        display: 'block',
                        width: '100%',
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: 'var(--text-base)',
                        color: TEXT,
                        background: 'transparent',
                        border: 'none',
                        borderBottom: `1px solid ${ACCENT}60`,
                        outline: 'none',
                        padding: 0
                      }}
                    />
                  ) : (
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
                  )}
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

                {variant === 'active' && editingId !== s.id && (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {onRename && (
                      <button
                        onClick={(e) => { e.stopPropagation(); startEdit(s) }}
                        title="Renombrar conversación"
                        style={{ ...rowActionStyle, color: ACCENT }}
                      >
                        Renombrar
                      </button>
                    )}
                    {onArchive && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onArchive(s.id) }}
                        title="Archivar conversación"
                        style={{ ...rowActionStyle, color: MUTED }}
                      >
                        Archivar
                      </button>
                    )}
                  </div>
                )}

                {variant === 'archived' && (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {onUnarchive && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onUnarchive(s.id) }}
                        title="Desarchivar conversación"
                        style={{ ...rowActionStyle, color: ACCENT }}
                      >
                        Desarchivar
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (window.confirm('Esto no se puede deshacer. ¿Borrar definitivamente esta conversación?')) {
                            onDelete(s.id)
                          }
                        }}
                        title="Borrar definitivamente"
                        style={{ ...rowActionStyle, color: WARN }}
                      >
                        Borrar
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
