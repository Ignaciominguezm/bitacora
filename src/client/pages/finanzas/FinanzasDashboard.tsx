import { useState, useEffect, useCallback } from 'react'
import { hexToRgba, formatSaldo, formatDateEs, mondayOf } from './shared'

interface CuentaResumen {
  id: number
  nombre: string
  tipo: 'banco' | 'efectivo' | 'otro'
  entidad: string | null
  saldo_actual: string | null
}

interface VencItem {
  id: number
  tipo: 'ingreso' | 'gasto'
  concepto: string
  importe: number
  fecha_estimada: string
  cuenta_nombre: string | null
}

interface AmbitoDashboard {
  id: number
  nombre: string
  color: string
  orden: number
  cuentas: CuentaResumen[]
  saldo_total: number
  reservas_activas: number
  disponible_tras_reservas: number
  pagos_proximos_30d: number
  cobros_esperados_30d: number
  margen_seguridad: number
  escenario_esperado: number
  colchon_minimo: number
  colchon_provisional: boolean
  semaforo: 'rojo' | 'ambar' | 'verde'
  vencimientos_7d: { pagos: VencItem[]; cobros: VencItem[]; total_pagos_7d: number; total_cobros_7d: number }
  riesgo_7_dias: boolean
  deudas: { debo: { total: number; n: number }; me_deben: { total: number; n: number } }
}

interface VencimientoTagged extends VencItem {
  ambito_id: number
  ambito_nombre: string
  ambito_color: string
}

interface Pendiente {
  cuenta_id: number
  nombre: string
  ambito_id: number
  ambito_nombre: string
  ambito_color: string
}

interface DashboardResponse {
  semana: string
  hoy: string
  ambitos: AmbitoDashboard[]
  vencimientos_semana: VencimientoTagged[]
  pendientes_de_revisar: Pendiente[]
}

const SEMAFORO_COLOR: Record<AmbitoDashboard['semaforo'], string> = {
  rojo: '#f87171',
  ambar: '#facc15',
  verde: '#4ade80'
}
const SEMAFORO_LABEL: Record<AmbitoDashboard['semaforo'], string> = {
  rojo: 'RIESGO',
  ambar: 'AJUSTADO',
  verde: 'OK'
}

function eur(n: number): string {
  return `${formatSaldo(n)} €`
}

export function FinanzasDashboard({
  onNavigate
}: {
  onNavigate: (view: 'cuentas' | 'revision') => void
}) {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDashboard = useCallback(async () => {
    try {
      const semana = mondayOf(new Date())
      const res = await fetch(`/api/finanzas/dashboard?semana=${semana}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error al cargar el dashboard')
        return
      }
      setData(json)
      setError(null)
    } catch {
      setError('Error de red')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={() => onNavigate('cuentas')} style={navBtnStyle}>Gestionar cuentas →</button>
        <button onClick={() => onNavigate('revision')} style={navBtnStyle}>Revisión semanal →</button>
      </div>

      {loading && (
        <div style={{ color: 'var(--color-text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)' }}>
          Cargando...
        </div>
      )}

      {!loading && error && (
        <div style={{ color: '#f87171', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)' }}>
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {data.ambitos.map((amb) => (
              <AmbitoCard key={amb.id} amb={amb} />
            ))}
          </div>

          <VencimientosBlock items={data.vencimientos_semana} />
          <DeudasBlock ambitos={data.ambitos} />
          <PendientesBlock items={data.pendientes_de_revisar} onGoRevisar={() => onNavigate('revision')} />
        </>
      )}
    </div>
  )
}

const navBtnStyle: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 'var(--text-base)',
  color: '#C8A840',
  background: 'rgba(200,168,64,0.08)',
  border: '1px solid rgba(200,168,64,0.25)',
  padding: '10px 20px',
  cursor: 'pointer',
  letterSpacing: '0.06em'
}

function Stat({ label, value, color, big }: { label: string; value: string; color?: string; big?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.08em' }}>
        {label}
      </span>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: big ? 22 : 'var(--text-md)', color: color ?? '#E8DCC8' }}>
        {value}
      </span>
    </div>
  )
}

function AmbitoCard({ amb }: { amb: AmbitoDashboard }) {
  const efectivo = amb.cuentas.filter((c) => c.tipo === 'efectivo')
  const semColor = SEMAFORO_COLOR[amb.semaforo]

  return (
    <section
      style={{
        background: '#13100A',
        border: `1px solid ${hexToRgba(amb.color, 0.25)}`,
        borderLeft: `3px solid ${amb.color}`,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 18px',
          borderBottom: `1px solid ${hexToRgba(amb.color, 0.12)}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 9, height: 9, borderRadius: '50%', background: amb.color, flexShrink: 0 }} />
          <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-md)', color: '#E8DCC8', letterSpacing: '0.06em' }}>
            {amb.nombre.toUpperCase()}
          </span>
          {amb.riesgo_7_dias && (
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 'var(--text-2xs)',
                color: '#facc15',
                border: '1px solid rgba(250,204,21,0.4)',
                padding: '2px 7px',
                letterSpacing: '0.04em'
              }}
            >
              ⚠ VENCE ESTA SEMANA
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: semColor, boxShadow: `0 0 8px ${hexToRgba(semColor, 0.6)}` }} />
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: semColor, letterSpacing: '0.04em' }}>
            {SEMAFORO_LABEL[amb.semaforo]}
          </span>
        </div>
      </div>

      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Saldos principales */}
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <Stat label="SALDO TOTAL" value={eur(amb.saldo_total)} />
          <Stat label="DISPONIBLE TRAS RESERVAS" value={eur(amb.disponible_tras_reservas)} color="#C8A840" big />
          <Stat label="RESERVAS ACTIVAS" value={eur(amb.reservas_activas)} />
        </div>

        {/* Efectivo, si existe cuenta de ese tipo en el ámbito */}
        {efectivo.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 10, borderLeft: '2px solid rgba(200,168,64,0.15)' }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.08em' }}>
              EFECTIVO
            </span>
            {efectivo.map((c) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, maxWidth: 320 }}>
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-sm)', color: '#A09070' }}>{c.nombre}</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: '#E8DCC8' }}>
                  {c.saldo_actual === null ? 'sin saldo' : eur(Number(c.saldo_actual))}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Previsiones 30 días */}
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <Stat label="PAGOS PRÓXIMOS 30D" value={eur(amb.pagos_proximos_30d)} color="#f87171" />
          <Stat label="COBROS ESPERADOS 30D" value={eur(amb.cobros_esperados_30d)} color="#4ade80" />
        </div>

        {/* Margen y escenario */}
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.08em' }}>
              MARGEN DE SEGURIDAD (30D, CONSERVADOR — SIN COBROS)
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 20, color: semColor }}>
                {eur(amb.margen_seguridad)}
              </span>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: semColor, flexShrink: 0 }} />
            </div>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>
              umbral provisional / pendiente de configurar: {eur(amb.colchon_minimo)}
            </span>
          </div>

          <Stat
            label="ESCENARIO ESPERADO — PROYECCIÓN, SI SE CUMPLEN LOS COBROS"
            value={eur(amb.escenario_esperado)}
            color="#A09070"
          />
        </div>
      </div>
    </section>
  )
}

function VencimientosBlock({ items }: { items: VencimientoTagged[] }) {
  return (
    <section style={{ background: '#13100A', border: '1px solid rgba(200,168,64,0.15)' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(200,168,64,0.1)' }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.12em' }}>
          VENCIMIENTOS DE LA SEMANA (7 DÍAS)
        </span>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.length === 0 && (
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', padding: '6px 4px' }}>
            Sin vencimientos en los próximos 7 días.
          </div>
        )}
        {items.map((it) => (
          <div
            key={`${it.tipo}-${it.id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              border: `1px solid ${hexToRgba(it.ambito_color, 0.15)}`,
              borderLeft: `3px solid ${it.ambito_color}`,
              gap: 12,
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 'var(--text-2xs)',
                  color: it.ambito_color,
                  letterSpacing: '0.04em',
                  flexShrink: 0
                }}
              >
                {it.ambito_nombre.toUpperCase()}
              </span>
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 'var(--text-2xs)',
                  color: it.tipo === 'ingreso' ? '#4ade80' : '#f87171',
                  border: `1px solid ${it.tipo === 'ingreso' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
                  padding: '2px 6px',
                  flexShrink: 0
                }}
              >
                {it.tipo === 'ingreso' ? 'COBRO' : 'PAGO'}
              </span>
              <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-sm)', color: '#E8DCC8' }}>{it.concepto}</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>
                {formatDateEs(it.fecha_estimada)}
              </span>
            </div>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: it.tipo === 'ingreso' ? '#4ade80' : '#f87171' }}>
              {eur(it.importe)}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function DeudasBlock({ ambitos }: { ambitos: AmbitoDashboard[] }) {
  const conDeudas = ambitos.filter((a) => a.deudas.debo.n > 0 || a.deudas.me_deben.n > 0)

  return (
    <section style={{ background: '#13100A', border: '1px solid rgba(200,168,64,0.15)' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(200,168,64,0.1)' }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.12em' }}>
          DEUDAS
        </span>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {conDeudas.length === 0 && (
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', padding: '6px 4px' }}>
            Sin deudas pendientes en ningún ámbito.
          </div>
        )}
        {conDeudas.map((amb) => (
          <div
            key={amb.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              border: `1px solid ${hexToRgba(amb.color, 0.15)}`,
              borderLeft: `3px solid ${amb.color}`,
              gap: 16,
              flexWrap: 'wrap'
            }}
          >
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: amb.color }}>
              {amb.nombre.toUpperCase()}
            </span>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {amb.deudas.debo.n > 0 && (
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: '#f87171' }}>
                  Debo: {eur(amb.deudas.debo.total)} ({amb.deudas.debo.n})
                </span>
              )}
              {amb.deudas.me_deben.n > 0 && (
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: '#4ade80' }}>
                  Me deben: {eur(amb.deudas.me_deben.total)} ({amb.deudas.me_deben.n})
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function PendientesBlock({ items, onGoRevisar }: { items: Pendiente[]; onGoRevisar: () => void }) {
  if (items.length === 0) return null

  return (
    <section style={{ background: '#13100A', border: '1px solid rgba(250,204,21,0.2)' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(250,204,21,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: '#facc15', letterSpacing: '0.12em' }}>
          PENDIENTES DE REVISAR — SIN SALDO ESTA SEMANA
        </span>
        <button
          onClick={onGoRevisar}
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 'var(--text-2xs)',
            color: '#facc15',
            background: 'transparent',
            border: '1px solid rgba(250,204,21,0.35)',
            padding: '3px 10px',
            cursor: 'pointer',
            letterSpacing: '0.04em'
          }}
        >
          Ir a Revisión semanal →
        </button>
      </div>
      <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {items.map((it) => (
          <div
            key={it.cuenta_id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              border: `1px solid ${hexToRgba(it.ambito_color, 0.25)}`
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: it.ambito_color, flexShrink: 0 }} />
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: '#E8DCC8' }}>{it.nombre}</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>
              · {it.ambito_nombre}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
