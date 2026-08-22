import { ACCENT, MUTED, TEXT } from './theme'

interface Props {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled?: boolean
  placeholder?: string
}

export function MessageInput({ value, onChange, onSend, disabled, placeholder }: Props) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  const canSend = value.trim().length > 0 && !disabled

  return (
    <div style={{ padding: '10px 16px', borderTop: `1px solid ${ACCENT}18`, display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? 'Mensaje a Unria...'}
        rows={1}
        disabled={disabled}
        style={{
          flex: 1,
          padding: '8px 12px',
          background: '#13100A',
          border: `1px solid ${ACCENT}30`,
          color: TEXT,
          fontFamily: 'DM Sans, sans-serif',
          fontSize: 13,
          outline: 'none',
          resize: 'none',
          minHeight: 36,
          maxHeight: 120,
          lineHeight: 1.5,
          opacity: disabled ? 0.6 : 1
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = `${ACCENT}70`)}
        onBlur={(e) => (e.currentTarget.style.borderColor = `${ACCENT}30`)}
      />
      <button
        onClick={onSend}
        disabled={!canSend}
        title="Enviar (Enter)"
        style={{
          width: 36,
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: canSend ? `${ACCENT}20` : 'transparent',
          border: `1px solid ${canSend ? ACCENT + '50' : ACCENT + '20'}`,
          color: canSend ? ACCENT : MUTED,
          cursor: canSend ? 'pointer' : 'not-allowed',
          fontSize: 14,
          flexShrink: 0
        }}
      >
        ▶
      </button>
    </div>
  )
}
