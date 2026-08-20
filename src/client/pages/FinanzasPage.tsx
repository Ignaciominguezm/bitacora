export function FinanzasPage() {
  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 32px',
        background: '#0D0A06',
        display: 'flex',
        flexDirection: 'column',
        gap: 32
      }}
    >
      <div>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 18, color: '#C8A840', letterSpacing: '0.1em', margin: 0 }}>
          FINANZAS
        </h1>
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#5A4A30', margin: '4px 0 0' }}>
          Control financiero personal y empresarial
        </p>
      </div>

      <div
        style={{
          background: '#13100A',
          border: '1px solid rgba(200,168,64,0.15)',
          padding: '32px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          maxWidth: 480
        }}
      >
        <span style={{ fontSize: 32, opacity: 0.3 }}>€</span>
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: 13, color: '#C8A840', letterSpacing: '0.1em' }}>
          MVP 0.1 EN CONSTRUCCIÓN
        </span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#5A4A30', textAlign: 'center', lineHeight: 1.6 }}>
          Módulo de saldos y previsiones.<br />
          Andamiaje listo — features pendientes de despliegue.
        </span>
      </div>
    </div>
  )
}
