import type { Ambito } from '../../types/cabina'
import { ACCENT, AMBITO_LABEL, MUTED } from './theme'

const OPTIONS: Ambito[] = ['proyectos_personales', 'clientes', 'ocio']

interface Props {
  value: Ambito
  onChange: (value: Ambito) => void
  disabled?: boolean
}

export function ScopeSelector({ value, onChange, disabled }: Props) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }} role="radiogroup" aria-label="Ámbito">
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
              fontSize: 'var(--text-xs)',
              letterSpacing: '0.03em',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1
            }}
          >
            {AMBITO_LABEL[opt]}
          </button>
        )
      })}
    </div>
  )
}
