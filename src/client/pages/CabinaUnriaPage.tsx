import { useEffect, useRef, useState } from 'react'
import { useAgentSession } from '../hooks/useAgentSession'
import { MessageBubble } from '../components/cabina/MessageBubble'
import { MessageInput } from '../components/cabina/MessageInput'
import { SessionList } from '../components/cabina/SessionList'
import { ScopeSelector } from '../components/cabina/ScopeSelector'
import { ModeSelector } from '../components/cabina/ModeSelector'
import { ACCENT, MUTED, TEXT } from '../components/cabina/theme'

// Huecos reservados en el layout para entregas futuras — sin funcionalidad
// todavía. Solo el sitio y el rótulo; nada que construir aquí en esta fase.
const FUTURE_SECTIONS = ['Decisiones', 'Memoria', 'Tareas CoreWork', 'Adjuntos', 'Zona de aprobación']

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: MUTED, letterSpacing: '0.05em', marginBottom: 2 }}>
        {label.toUpperCase()}
      </div>
      <div
        style={{
          fontFamily: mono ? 'JetBrains Mono, monospace' : 'DM Sans, sans-serif',
          fontSize: mono ? 'var(--text-sm)' : 'var(--text-md)',
          color: TEXT,
          wordBreak: 'break-all'
        }}
      >
        {value}
      </div>
    </div>
  )
}

export function CabinaUnriaPage() {
  const {
    sessions,
    archivedSessions,
    viewArchived,
    loadingHistory,
    activeId,
    ambito,
    modo,
    title,
    messages,
    streaming,
    error,
    setAmbito,
    setModo,
    selectSession,
    newSession,
    sendMessage,
    setArchivedView,
    archiveSession,
    unarchiveSession,
    deleteSession
  } = useAgentSession()

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend() {
    if (!input.trim() || streaming) return
    const text = input
    setInput('')
    void sendMessage(text)
  }

  // Vuelve a pedir la sesión real de BD. Si el corte fue tan temprano que el
  // servidor no llegó a persistir nada (ver cabina.ts), esa fila del
  // asistente simplemente no existe — la lista recargada termina en el
  // mensaje del usuario y la burbuja incompleta desaparece con la
  // recarga, en vez de quedar "resuelta" con contenido que nunca hubo.
  function handleReload() {
    if (activeId) void selectSession(activeId)
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: '#0D0A06' }}>
      {/* Columna izquierda — historial de sesiones */}
      <div style={{ width: 260, flexShrink: 0, borderRight: `1px solid ${ACCENT}15`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', borderBottom: `1px solid ${ACCENT}10`, flexShrink: 0 }}>
          {(['activas', 'archivadas'] as const).map((tab) => {
            const isArchivedTab = tab === 'archivadas'
            const tabActive = viewArchived === isArchivedTab
            return (
              <button
                key={tab}
                onClick={() => void setArchivedView(isArchivedTab)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${tabActive ? ACCENT : 'transparent'}`,
                  color: tabActive ? ACCENT : MUTED,
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 'var(--text-2xs)',
                  letterSpacing: '0.05em',
                  cursor: 'pointer'
                }}
              >
                {tab.toUpperCase()}
              </button>
            )
          })}
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {viewArchived ? (
            <SessionList
              sessions={archivedSessions}
              activeId={activeId}
              onSelect={selectSession}
              variant="archived"
              onUnarchive={unarchiveSession}
              onDelete={deleteSession}
            />
          ) : (
            <SessionList
              sessions={sessions}
              activeId={activeId}
              loading={loadingHistory}
              onSelect={selectSession}
              onNew={newSession}
              onArchive={archiveSession}
            />
          )}
        </div>
      </div>

      {/* Columna central — la conversación */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.length === 0 && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: MUTED,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 'var(--text-base)',
                textAlign: 'center'
              }}
            >
              Sin mensajes todavía — escribe algo para empezar.
            </div>
          )}
          {messages.map((m, i) => (
            <MessageBubble
              key={i}
              message={m}
              streaming={streaming && i === messages.length - 1 && m.role === 'assistant'}
              onReload={m.incomplete ? handleReload : undefined}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div style={{ padding: '4px 20px', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#F87171' }}>
            {error}
          </div>
        )}

        <MessageInput value={input} onChange={setInput} onSend={handleSend} disabled={streaming} placeholder="Mensaje a Unria..." />
      </div>

      {/* Columna derecha — panel de contexto, persistente. La conversación
          con su contexto al lado: esto es lo que distingue Cabina de un
          chat con desplegables arriba. */}
      <div style={{ width: 300, flexShrink: 0, borderLeft: `1px solid ${ACCENT}15`, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${ACCENT}12` }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-sm)', color: ACCENT, letterSpacing: '0.08em', marginBottom: 14 }}>
            CONTEXTO
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: MUTED, letterSpacing: '0.05em', marginBottom: 5 }}>
              ÁMBITO
            </div>
            <ScopeSelector value={ambito} onChange={setAmbito} disabled={streaming} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: MUTED, letterSpacing: '0.05em', marginBottom: 5 }}>
              MODO
            </div>
            <ModeSelector value={modo} onChange={setModo} disabled={streaming} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <InfoRow label="Título" value={activeId ? title : '—'} />
            <InfoRow label="Mensajes" value={String(messages.length)} />
            <InfoRow label="Sesión" value={activeId ?? '—'} mono />
          </div>
        </div>

        {/* Huecos reservados — sin funcionalidad en esta entrega */}
        <div style={{ padding: '4px 16px 16px' }}>
          {FUTURE_SECTIONS.map((label) => (
            <div key={label} style={{ padding: '10px 0', borderTop: `1px solid ${ACCENT}0c` }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: MUTED, letterSpacing: '0.05em' }}>
                {label.toUpperCase()}
              </div>
              {/* Reservado para una entrega futura. */}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
