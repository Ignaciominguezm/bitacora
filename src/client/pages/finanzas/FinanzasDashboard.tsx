import { useState, useEffect } from 'react'
import { type Ambito, hexToRgba, formatSaldo } from './shared'

interface CuentaResumen {
  ambito_id: number
  saldo_actual: string | null
  activa: boolean
}

export function FinanzasDashboard({
  ambitos,
  onNavigate
}: {
  ambitos: Ambito[]
  onNavigate: (view: 'cuentas' | 'revision') => void
}) {
  const [cuentas, setCuentas] = useState<CuentaResumen[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/finanzas/cuentas', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setCuentas(data.cuentas ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={() => onNavigate('cuentas')}
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 12,
            color: '#C8A840',
            background: 'rgba(200,168,64,0.08)',
            border: '1px solid rgba(200,168,64,0.25)',
            padding: '10px 20px',
            cursor: 'pointer',
            letterSpacing: '0.06em'
          }}
        >
          Gestionar cuentas →
        </button>
        <button
          onClick={() => onNavigate('revision')}
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 12,
            color: '#C8A840',
            background: 'rgba(200,168,64,0.08)',
            border: '1px solid rgba(200,168,64,0.25)',
            padding: '10px 20px',
            cursor: 'pointer',
            letterSpacing: '0.06em'
          }}
        >
          Revisión semanal →
        </button>
      </div>

      <div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#5A4A30', letterSpacing: '0.12em', marginBottom: 4 }}>
          ÚLTIMO SALDO REGISTRADO POR ÁMBITO
        </div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A4A30', marginBottom: 12 }}>
          Informativo. Cada ámbito es independiente — nunca se suman entre sí.
        </div>

        {loading ? (
          <div style={{ color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>Cargando...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {ambitos.map((a) => {
              const propias = cuentas.filter((c) => c.ambito_id === a.id && c.activa)
              const conSaldo = propias.filter((c) => c.saldo_actual !== null)
              const total = conSaldo.length > 0 ? conSaldo.reduce((sum, c) => sum + Number(c.saldo_actual), 0) : null

              return (
                <div
                  key={a.id}
                  style={{
                    background: '#13100A',
                    border: `1px solid ${hexToRgba(a.color, 0.2)}`,
                    borderLeft: `3px solid ${a.color}`,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6
                  }}
                >
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: 12, color: '#E8DCC8', letterSpacing: '0.06em' }}>
                    {a.nombre.toUpperCase()}
                  </span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, color: '#C8A840' }}>
                    {total !== null ? `${formatSaldo(total)} EUR` : 'sin saldos aún'}
                  </span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A4A30' }}>
                    {propias.length} cuenta{propias.length !== 1 ? 's' : ''} activa{propias.length !== 1 ? 's' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
