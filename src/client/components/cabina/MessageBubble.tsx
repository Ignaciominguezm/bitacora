import ReactMarkdown from 'react-markdown'
import type { CabinaMessage } from '../../types/cabina'
import { ACCENT, AMBITO_LABEL, MODO_LABEL, MUTED, TEXT, WARN, WARN_BORDER } from './theme'

interface Props {
  message: CabinaMessage
  // true solo para la última burbuja del asistente mientras el turno sigue
  // en curso (cursor parpadeante / "Escribiendo...").
  streaming?: boolean
  // Se llama al pulsar "Recargar conversación" en una burbuja incompleta.
  // El componente no sabe cómo recargar — solo emite el evento.
  onReload?: () => void
}

export function MessageBubble({ message, streaming, onReload }: Props) {
  const isUser = message.role === 'user'
  const isEmpty = message.content.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '80%',
          padding: '8px 12px',
          background: isUser ? `${ACCENT}18` : message.incomplete ? 'rgba(217,161,92,0.06)' : '#13100A',
          border: `1px ${message.incomplete ? 'dashed' : 'solid'} ${
            isUser ? ACCENT + '40' : message.incomplete ? WARN_BORDER : ACCENT + '18'
          }`,
          fontFamily: 'DM Sans, sans-serif',
          fontSize: 13,
          color: TEXT,
          lineHeight: 1.5,
          wordBreak: 'break-word'
        }}
      >
        {!isUser && (
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9,
              color: MUTED,
              letterSpacing: '0.05em',
              marginBottom: 4
            }}
          >
            {AMBITO_LABEL[message.ambito]} · {MODO_LABEL[message.modo]}
          </div>
        )}

        {isUser ? (
          <span style={{ whiteSpace: 'pre-wrap' }}>{message.content}</span>
        ) : isEmpty && streaming ? (
          <span style={{ color: MUTED, fontStyle: 'italic' }}>Escribiendo...</span>
        ) : (
          <div className="cabina-markdown">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}

        {streaming && !isUser && !isEmpty && !message.incomplete && (
          <span className="cursor-blink" style={{ color: ACCENT }}>▌</span>
        )}

        {message.incomplete && (
          <div
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: `1px solid ${WARN_BORDER}`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap'
            }}
          >
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: WARN, lineHeight: 1.4 }}>
              Se cortó la conexión mientras llegaba esta respuesta. Es casi seguro que ya quedó guardada completa
              en el servidor.
            </span>
            {onReload && (
              <button
                onClick={onReload}
                style={{
                  background: 'transparent',
                  border: `1px solid ${WARN_BORDER}`,
                  color: WARN,
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10,
                  padding: '3px 8px',
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                  flexShrink: 0
                }}
              >
                Recargar conversación
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
