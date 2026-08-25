interface Props {
  label: string
  icon: string
}

export function PlaceholderWidget({ label, icon }: Props) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid rgba(200,168,64,0.12)'
        }}
      >
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-sm)', color: '#A09070', letterSpacing: '0.08em' }}>
          {label.toUpperCase()}
        </span>
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          color: 'var(--color-text-muted)'
        }}
      >
        <span style={{ fontSize: 24 }}>{icon}</span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', letterSpacing: '0.1em' }}>
          próximamente
        </span>
      </div>
    </div>
  )
}
