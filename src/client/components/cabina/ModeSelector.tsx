import type { Modo } from '../../types/cabina'
import { ACCENT, MODO_LABEL, MUTED } from './theme'

const OPTIONS: Modo[] = ['diseno', 'implementacion', 'revision']

interface Props {
  value: Modo
  onChange: (value: Modo) => void
  disabled?: boolean
}

export function ModeSelector({ value, onChange, disabled }: Props) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }} role="radiogroup" aria-label="Modo">
      {OPTIONS.map((opt) => {
        const active = opt === value
        return (
          <button
            key={opt}
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(opt)}
            style={{
              padding: '4px 10px',
              background: active ? `${ACCENT}18` : 'transparent',
              border: `1px solid ${active ? ACCENT + '50' : ACCENT + '20'}`,
              color: active ? ACCENT : MUTED,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              letterSpacing: '0.03em',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1
            }}
          >
            {MODO_LABEL[opt]}
          </button>
        )
      })}
    </div>
  )
}
