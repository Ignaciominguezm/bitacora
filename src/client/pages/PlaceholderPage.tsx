interface Props {
  title: string
  icon: string
}

export function PlaceholderPage({ title, icon }: Props) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        color: '#5A4A30'
      }}
    >
      <span style={{ fontSize: 48 }}>{icon}</span>
      <h2
        style={{
          fontFamily: 'Cinzel, serif',
          fontSize: 20,
          color: '#A09070',
          margin: 0,
          letterSpacing: '0.08em'
        }}
      >
        {title}
      </h2>
      <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, margin: 0 }}>
        — Próximamente —
      </p>
    </div>
  )
}
