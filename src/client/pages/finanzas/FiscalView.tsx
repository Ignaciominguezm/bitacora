import { useState, useEffect, useCallback } from 'react'
import { type Ambito, hexToRgba, formatSaldo, formatDateEs, parseEsNumber } from './shared'

type Bloque = 'A' | 'B' | 'C' | 'D'
type Aplicabilidad = 'confirmada' | 'probable' | 'condicional' | 'pendiente_validar' | 'no_aplica'
type Prioridad = 'critica' | 'alta' | 'media' | 'baja'
type Periodicidad = 'mensual' | 'trimestral' | 'anual' | 'segun_evento' | 'continua' | 'puntual'
type EstadoInstanciaFiscal = 'pendiente' | 'en_preparacion' | 'preparada' | 'revisada' | 'presentada' | 'pagada' | 'archivada' | 'no_aplica'

interface ObligacionFiscal {
  id: number
  ambito_id: number
  codigo: string | null
  nombre: string
  modelo: string | null
  bloque: Bloque
  tipo: string
  organismo: string | null
  aplicabilidad: Aplicabilidad
  prioridad: Prioridad
  periodicidad: Periodicidad
  regla_plazo: string | null
  evidencia_min: string | null
  responsable: string | null
  condicion: string | null
  aviso: string | null
  activa: boolean
  ambito_nombre: string
  ambito_color: string
  ambito_orden: number
}

interface InstanciaFiscal {
  id: number
  obligacion_id: number
  periodo: string
  periodo_etiqueta: string
  fecha_apertura: string | null
  fecha_limite: string
  fecha_domiciliacion: string | null
  estado: EstadoInstanciaFiscal
  importe_estimado: string | null
  csv: string | null
  nrc: string | null
  revisor: string | null
  fecha_revision: string | null
  notas: string | null
  obligacion_nombre: string
  modelo: string | null
  bloque: Bloque
  ambito_id: number
  ambito_nombre: string
  ambito_color: string
}

interface Evidencia {
  id: number
  instancia_id: number
  descripcion: string
  referencia: string | null
  fecha_origen: string | null
  created_at: string
}

interface ProximoVencimiento {
  id: number
  periodo_etiqueta: string
  fecha_limite: string
  estado: EstadoInstanciaFiscal
  dias_restantes: number
  obligacion_nombre: string
  modelo: string | null
  bloque: Bloque
  ambito_id: number
  ambito_nombre: string
  ambito_color: string
}

interface VencidaSinPresentar {
  id: number
  periodo_etiqueta: string
  fecha_limite: string
  estado: EstadoInstanciaFiscal
  dias_vencida: number
  obligacion_nombre: string
  modelo: string | null
  bloque: Bloque
  ambito_id: number
  ambito_nombre: string
  ambito_color: string
}

interface ResumenAmbitoFiscal {
  ambito_id: number
  ambito_nombre: string
  ambito_color: string
  confirmadas: number
  pendiente_validar: number
  total: number
}

interface TableroResponse {
  hoy: string
  proximos_vencimientos: ProximoVencimiento[]
  vencidas_sin_presentar: VencidaSinPresentar[]
  resumen_por_ambito: ResumenAmbitoFiscal[]
}

const BLOQUES: Bloque[] = ['A', 'B', 'C', 'D']

const APLICABILIDAD_INFO: Record<Aplicabilidad, { bg: string; color: string; border: string; label: string; strike?: boolean }> = {
  confirmada: { bg: 'rgba(74,222,128,0.12)', color: '#4ade80', border: 'rgba(74,222,128,0.4)', label: 'Confirmada' },
  probable: { bg: 'rgba(250,204,21,0.12)', color: '#facc15', border: 'rgba(250,204,21,0.4)', label: 'Probable' },
  condicional: { bg: 'rgba(160,144,112,0.15)', color: '#A09070', border: 'rgba(160,144,112,0.4)', label: 'Condicional' },
  pendiente_validar: { bg: 'rgba(248,113,113,0.18)', color: '#f87171', border: 'rgba(248,113,113,0.7)', label: '⚠ Pendiente de validar con gestoría' },
  no_aplica: { bg: 'transparent', color: 'var(--color-text-muted)', border: 'rgba(160,144,112,0.25)', label: 'No aplica', strike: true }
}

const PRIORIDAD_LABEL: Record<Prioridad, string> = { critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja' }
const PERIODICIDAD_LABEL: Record<Periodicidad, string> = {
  mensual: 'Mensual', trimestral: 'Trimestral', anual: 'Anual', segun_evento: 'Según evento', continua: 'Continua', puntual: 'Puntual'
}
const ESTADO_LABEL: Record<EstadoInstanciaFiscal, string> = {
  pendiente: 'Pendiente', en_preparacion: 'En preparación', preparada: 'Preparada', revisada: 'Revisada',
  presentada: 'Presentada', pagada: 'Pagada', archivada: 'Archivada', no_aplica: 'No aplica'
}
const ESTADOS_ORDEN: EstadoInstanciaFiscal[] = ['pendiente', 'en_preparacion', 'preparada', 'revisada', 'presentada', 'pagada', 'archivada', 'no_aplica']
const ESTADO_COLOR: Record<EstadoInstanciaFiscal, string> = {
  pendiente: 'var(--color-text-muted)', en_preparacion: '#facc15', preparada: '#facc15', revisada: '#8B9DC8',
  presentada: '#4ade80', pagada: '#4ade80', archivada: 'var(--color-text-muted)', no_aplica: 'var(--color-text-muted)'
}

const smallBtn: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 'var(--text-xs)',
  color: '#A09070',
  background: 'transparent',
  border: '1px solid rgba(200,168,64,0.2)',
  padding: '4px 10px',
  cursor: 'pointer',
  letterSpacing: '0.03em'
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 'var(--text-sm)',
  color: '#E8DCC8',
  background: '#0D0A06',
  border: '1px solid rgba(200,168,64,0.2)',
  padding: '6px 8px',
  outline: 'none'
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 'var(--text-2xs)',
  color: 'var(--color-text-muted)',
  letterSpacing: '0.1em',
  marginBottom: 4,
  display: 'block'
}

function eur(v: string | number | null): string {
  if (v === null) return '—'
  return `${formatSaldo(v)} €`
}

export function FiscalView({ ambitos }: { ambitos: Ambito[] }) {
  const [tab, setTab] = useState<'tablero' | 'catalogo'>('tablero')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', gap: 0 }}>
        {(['tablero', 'catalogo'] as const).map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 'var(--text-sm)',
              letterSpacing: '0.06em',
              padding: '6px 16px',
              cursor: 'pointer',
              color: tab === t ? '#C8A840' : 'var(--color-text-muted)',
              background: tab === t ? 'rgba(200,168,64,0.32)' : 'transparent',
              border: tab === t ? '1px solid #C8A840' : '1px solid rgba(200,168,64,0.15)',
              borderRadius: i === 0 ? '3px 0 0 3px' : '0 3px 3px 0',
              marginLeft: i === 0 ? 0 : -1
            }}
          >
            {t === 'tablero' ? 'Tablero' : 'Catálogo de obligaciones'}
          </button>
        ))}
      </div>

      {tab === 'tablero' ? <TableroFiscal /> : <CatalogoFiscal ambitos={ambitos} />}
    </div>
  )
}

function TableroFiscal() {
  const [data, setData] = useState<TableroResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchTablero = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/finanzas/fiscal/tablero', { credentials: 'include' })
      setData(await res.json())
    } catch {
      // keep stale
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTablero()
  }, [fetchTablero])

  if (loading) {
    return <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)', color: 'var(--color-text-muted)' }}>Cargando...</div>
  }
  if (!data) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {data.vencidas_sin_presentar.length > 0 && (
        <section style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.5)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: '#f87171', letterSpacing: '0.1em' }}>
            ⚠ VENCIDAS SIN PRESENTAR
          </span>
          {data.vencidas_sin_presentar.map((v) => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '6px 10px', border: '1px solid rgba(248,113,113,0.25)' }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: v.ambito_color }}>{v.ambito_nombre.toUpperCase()}</span>
              <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-sm)', color: '#E8DCC8' }}>
                {v.obligacion_nombre}{v.modelo ? ` (${v.modelo})` : ''}
              </span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{v.periodo_etiqueta}</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>vencía {formatDateEs(v.fecha_limite)}</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#f87171' }}>hace {v.dias_vencida} día{v.dias_vencida !== 1 ? 's' : ''}</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: ESTADO_COLOR[v.estado], marginLeft: 'auto' }}>{ESTADO_LABEL[v.estado]}</span>
            </div>
          ))}
        </section>
      )}

      <section style={{ background: '#13100A', border: '1px solid rgba(200,168,64,0.15)' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(200,168,64,0.1)' }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.12em' }}>
            QUÉ SE APROXIMA
          </span>
        </div>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.proximos_vencimientos.length === 0 && (
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Sin vencimientos próximos.</div>
          )}
          {data.proximos_vencimientos.map((v) => {
            const urgente = v.dias_restantes <= 7
            return (
              <div
                key={v.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '6px 10px',
                  border: `1px solid ${urgente ? 'rgba(250,204,21,0.35)' : 'rgba(200,168,64,0.08)'}`
                }}
              >
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: v.ambito_color }}>{v.ambito_nombre.toUpperCase()}</span>
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-sm)', color: '#E8DCC8' }}>
                  {v.obligacion_nombre}{v.modelo ? ` (${v.modelo})` : ''}
                </span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{v.periodo_etiqueta}</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{formatDateEs(v.fecha_limite)}</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: urgente ? '#facc15' : 'var(--color-text-muted)' }}>
                  en {v.dias_restantes} día{v.dias_restantes !== 1 ? 's' : ''}
                </span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: ESTADO_COLOR[v.estado], marginLeft: 'auto' }}>{ESTADO_LABEL[v.estado]}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section style={{ background: '#13100A', border: '1px solid rgba(200,168,64,0.15)' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(200,168,64,0.1)' }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.12em' }}>
            RESUMEN POR ÁMBITO — confirmadas vs pendiente de validar con gestoría
          </span>
        </div>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.resumen_por_ambito.map((r) => (
            <div key={r.ambito_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderLeft: `3px solid ${r.ambito_color}`, padding: '8px 12px', background: hexToRgba(r.ambito_color, 0.04) }}>
              <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-sm)', color: '#E8DCC8', letterSpacing: '0.04em' }}>{r.ambito_nombre.toUpperCase()}</span>
              <div style={{ display: 'flex', gap: 16 }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: '#4ade80' }}>{r.confirmadas} confirmadas</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: r.pendiente_validar > 0 ? '#f87171' : 'var(--color-text-muted)' }}>
                  {r.pendiente_validar} pendiente{r.pendiente_validar !== 1 ? 's' : ''} de validar
                </span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{r.total} total</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function CatalogoFiscal({ ambitos }: { ambitos: Ambito[] }) {
  const [obligaciones, setObligaciones] = useState<ObligacionFiscal[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const fetchObligaciones = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/finanzas/fiscal/obligaciones', { credentials: 'include' })
      setObligaciones((await res.json()).obligaciones ?? [])
    } catch {
      // keep stale
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchObligaciones()
  }, [fetchObligaciones])

  if (loading) {
    return <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)', color: 'var(--color-text-muted)' }}>Cargando...</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {ambitos.map((amb) => {
        const propias = obligaciones.filter((o) => o.ambito_id === amb.id)
        if (propias.length === 0) return null
        return (
          <section key={amb.id} style={{ border: `1px solid ${hexToRgba(amb.color, 0.2)}`, borderLeft: `3px solid ${amb.color}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-md)', color: '#E8DCC8', letterSpacing: '0.06em' }}>{amb.nombre.toUpperCase()}</span>
            {BLOQUES.map((bl) => {
              const deEsteBloque = propias.filter((o) => o.bloque === bl)
              if (deEsteBloque.length === 0) return null
              return (
                <div key={bl} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.12em' }}>BLOQUE {bl}</span>
                  {deEsteBloque.map((o) => (
                    <ObligacionRow
                      key={o.id}
                      obligacion={o}
                      expanded={expandedId === o.id}
                      onToggle={() => setExpandedId(expandedId === o.id ? null : o.id)}
                      onSaved={fetchObligaciones}
                    />
                  ))}
                </div>
              )
            })}
          </section>
        )
      })}
      {obligaciones.length === 0 && (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Sin obligaciones en el catálogo.</div>
      )}
    </div>
  )
}

function ObligacionRow({
  obligacion,
  expanded,
  onToggle,
  onSaved
}: {
  obligacion: ObligacionFiscal
  expanded: boolean
  onToggle: () => void
  onSaved: () => void
}) {
  const [savingAplic, setSavingAplic] = useState(false)
  const info = APLICABILIDAD_INFO[obligacion.aplicabilidad]

  async function cambiarAplicabilidad(nueva: Aplicabilidad) {
    setSavingAplic(true)
    try {
      const res = await fetch(`/api/finanzas/fiscal/obligaciones/${obligacion.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aplicabilidad: nueva })
      })
      if (res.ok) {
        onSaved()
      } else {
        const data = await res.json().catch(() => ({}))
        window.alert(data.error ?? 'No se pudo guardar')
      }
    } catch {
      window.alert('Error de red')
    } finally {
      setSavingAplic(false)
    }
  }

  return (
    <div style={{ border: '1px solid rgba(200,168,64,0.08)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', textDecoration: info.strike ? 'line-through' : 'none' }}>
          <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-sm)', color: '#E8DCC8' }}>{obligacion.nombre}</span>
          {obligacion.modelo && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{obligacion.modelo}</span>}
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', border: '1px solid rgba(200,168,64,0.15)', padding: '1px 6px' }}>
            {PRIORIDAD_LABEL[obligacion.prioridad]}
          </span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>{PERIODICIDAD_LABEL[obligacion.periodicidad]}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: info.color, background: info.bg, border: `1px solid ${info.border}`, padding: '2px 8px', fontWeight: obligacion.aplicabilidad === 'pendiente_validar' ? 700 : 400 }}>
            {info.label}
          </span>
          <select
            value={obligacion.aplicabilidad}
            disabled={savingAplic}
            onChange={(e) => cambiarAplicabilidad(e.target.value as Aplicabilidad)}
            style={{ ...inputStyle, padding: '3px 6px', fontSize: 'var(--text-xs)' }}
          >
            <option value="confirmada">Confirmada</option>
            <option value="probable">Probable</option>
            <option value="condicional">Condicional</option>
            <option value="pendiente_validar">Pendiente de validar</option>
            <option value="no_aplica">No aplica</option>
          </select>
          <button onClick={onToggle} style={smallBtn}>{expanded ? 'Ocultar vencimientos' : 'Vencimientos'}</button>
        </div>
      </div>

      {obligacion.regla_plazo && (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>Plazo: {obligacion.regla_plazo}</div>
      )}
      {obligacion.evidencia_min && (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>Evidencia mínima: {obligacion.evidencia_min}</div>
      )}
      {obligacion.responsable && (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>Responsable: {obligacion.responsable}</div>
      )}
      {obligacion.condicion && (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>Condición: {obligacion.condicion}</div>
      )}
      {obligacion.aviso && (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#facc15' }}>⚠ {obligacion.aviso}</div>
      )}

      {expanded && <InstanciasDeObligacion obligacionId={obligacion.id} />}
    </div>
  )
}

function InstanciasDeObligacion({ obligacionId }: { obligacionId: number }) {
  const [instancias, setInstancias] = useState<InstanciaFiscal[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [detalleId, setDetalleId] = useState<number | null>(null)

  const fetchInstancias = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/finanzas/fiscal/instancias?obligacion_id=${obligacionId}`, { credentials: 'include' })
      setInstancias((await res.json()).instancias ?? [])
    } catch {
      // keep stale
    } finally {
      setLoading(false)
    }
  }, [obligacionId])

  useEffect(() => {
    fetchInstancias()
  }, [fetchInstancias])

  async function borrar(id: number) {
    if (!window.confirm('¿Borrar este vencimiento? Se perderán sus evidencias. No se puede deshacer.')) return
    try {
      const res = await fetch(`/api/finanzas/fiscal/instancias/${id}`, { method: 'DELETE', credentials: 'include' })
      if (res.ok) await fetchInstancias()
      else { const d = await res.json().catch(() => ({})); window.alert(d.error ?? 'No se pudo borrar') }
    } catch {
      window.alert('Error de red')
    }
  }

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(200,168,64,0.1)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.1em' }}>VENCIMIENTOS</span>
        <button onClick={() => setShowForm(true)} style={{ ...smallBtn, color: '#C8A840', borderColor: 'rgba(200,168,64,0.35)' }}>+ Nuevo vencimiento</button>
      </div>

      {loading ? (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Cargando...</div>
      ) : instancias.length === 0 ? (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Sin vencimientos creados todavía.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {instancias.map((inst) => (
            <div key={inst.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '6px 10px', background: 'rgba(200,168,64,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#E8DCC8' }}>{inst.periodo_etiqueta}</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>límite {formatDateEs(inst.fecha_limite)}</span>
                {inst.importe_estimado !== null && (
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>~{eur(inst.importe_estimado)}</span>
                )}
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: ESTADO_COLOR[inst.estado], border: `1px solid ${hexToRgba(ESTADO_COLOR[inst.estado] === 'var(--color-text-muted)' ? '#A09070' : ESTADO_COLOR[inst.estado], 0.4)}`, padding: '1px 6px' }}>
                  {ESTADO_LABEL[inst.estado]}
                </span>
                {inst.revisor && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>revisor: {inst.revisor}</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setDetalleId(inst.id)} style={smallBtn}>Gestionar</button>
                <button onClick={() => borrar(inst.id)} style={{ ...smallBtn, color: '#f87171' }}>Borrar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <NuevaInstanciaModal
          obligacionId={obligacionId}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            fetchInstancias()
          }}
        />
      )}

      {detalleId !== null && (
        <InstanciaDetalleModal
          instanciaId={detalleId}
          obligacionId={obligacionId}
          onClose={() => setDetalleId(null)}
          onSaved={fetchInstancias}
        />
      )}
    </div>
  )
}

function NuevaInstanciaModal({ obligacionId, onClose, onSaved }: { obligacionId: number; onClose: () => void; onSaved: () => void }) {
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 10))
  const [periodoEtiqueta, setPeriodoEtiqueta] = useState('')
  const [fechaLimite, setFechaLimite] = useState('')
  const [fechaDomiciliacion, setFechaDomiciliacion] = useState('')
  const [importeEstimado, setImporteEstimado] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!periodoEtiqueta.trim()) return setError('La etiqueta del periodo es obligatoria (ej. "3T 2026")')
    if (!fechaLimite) return setError('La fecha límite es obligatoria')
    let importeNum: number | null = null
    if (importeEstimado.trim() !== '') {
      importeNum = parseEsNumber(importeEstimado)
      if (importeNum === null) return setError('Importe estimado inválido')
    }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/finanzas/fiscal/instancias', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          obligacion_id: obligacionId,
          periodo,
          periodo_etiqueta: periodoEtiqueta.trim(),
          fecha_limite: fechaLimite,
          fecha_domiciliacion: fechaDomiciliacion || null,
          importe_estimado: importeNum
        })
      })
      if (res.ok) {
        onSaved()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Error al guardar')
      }
    } catch {
      setError('Error de red')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#13100A', border: '1px solid rgba(200,168,64,0.25)', padding: 24, width: 400, maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-lg)', color: '#C8A840', letterSpacing: '0.08em' }}>NUEVO VENCIMIENTO</span>

        <div>
          <label style={labelStyle}>PERIODO (día 1 del trimestre/mes/año)</label>
          <input type="date" value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>ETIQUETA (ej. "3T 2026")</label>
          <input value={periodoEtiqueta} onChange={(e) => setPeriodoEtiqueta(e.target.value)} style={inputStyle} placeholder="3T 2026" />
        </div>
        <div>
          <label style={labelStyle}>FECHA LÍMITE</label>
          <input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>FECHA DE DOMICILIACIÓN (opcional)</label>
          <input type="date" value={fechaDomiciliacion} onChange={(e) => setFechaDomiciliacion(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>IMPORTE ESTIMADO (opcional — lo metes tú, el sistema no lo calcula)</label>
          <input value={importeEstimado} onChange={(e) => setImporteEstimado(e.target.value)} style={inputStyle} placeholder="0,00" />
        </div>

        {error && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#f87171' }}>{error}</span>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ ...smallBtn, padding: '7px 16px' }}>Cancelar</button>
          <button onClick={submit} disabled={saving} style={{ ...smallBtn, color: '#C8A840', borderColor: 'rgba(200,168,64,0.35)', padding: '7px 16px', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function InstanciaDetalleModal({
  instanciaId,
  obligacionId,
  onClose,
  onSaved
}: {
  instanciaId: number
  obligacionId: number
  onClose: () => void
  onSaved: () => void
}) {
  const [instancia, setInstancia] = useState<InstanciaFiscal | null>(null)
  const [evidencias, setEvidencias] = useState<Evidencia[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [csv, setCsv] = useState('')
  const [nrc, setNrc] = useState('')

  const [pendienteEstado, setPendienteEstado] = useState<EstadoInstanciaFiscal | null>(null)
  const [revisorInput, setRevisorInput] = useState('')

  const [descEvidencia, setDescEvidencia] = useState('')
  const [refEvidencia, setRefEvidencia] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/finanzas/fiscal/instancias/${instanciaId}/evidencias`, { credentials: 'include' })
      setEvidencias((await res.json()).evidencias ?? [])
    } catch {
      // keep stale
    } finally {
      setLoading(false)
    }
  }, [instanciaId])

  // No hay GET por id suelto para una instancia: se pide el listado (acotado
  // a esta obligación via obligacion_id, así que son pocas filas) y se
  // queda con la de este id.
  const fetchInstancia = useCallback(async () => {
    try {
      const res = await fetch(`/api/finanzas/fiscal/instancias?obligacion_id=${obligacionId}`, { credentials: 'include' })
      const data = await res.json()
      const found: InstanciaFiscal | undefined = (data.instancias ?? []).find((i: InstanciaFiscal) => i.id === instanciaId)
      if (found) {
        setInstancia(found)
        setCsv(found.csv ?? '')
        setNrc(found.nrc ?? '')
      }
    } catch {
      // keep stale
    }
  }, [instanciaId, obligacionId])

  useEffect(() => {
    fetchInstancia()
    cargar()
  }, [fetchInstancia, cargar])

  async function guardarCambio(body: Record<string, unknown>) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/finanzas/fiscal/instancias/${instanciaId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (res.ok) {
        await fetchInstancia()
        onSaved()
        return true
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Error al guardar')
        return false
      }
    } catch {
      setError('Error de red')
      return false
    } finally {
      setSaving(false)
    }
  }

  function cambiarEstado(nuevo: EstadoInstanciaFiscal) {
    if ((nuevo === 'presentada' || nuevo === 'pagada') && !instancia?.revisor) {
      setPendienteEstado(nuevo)
      setRevisorInput('')
      return
    }
    guardarCambio({ estado: nuevo })
  }

  async function confirmarConRevisor() {
    if (!revisorInput.trim()) { setError('El revisor es obligatorio para este control de doble verificación'); return }
    const ok = await guardarCambio({ estado: pendienteEstado, revisor: revisorInput.trim(), csv: csv.trim() || null, nrc: nrc.trim() || null })
    if (ok) setPendienteEstado(null)
  }

  async function guardarCsvNrc() {
    await guardarCambio({ csv: csv.trim() || null, nrc: nrc.trim() || null })
  }

  async function añadirEvidencia() {
    if (!descEvidencia.trim()) return
    try {
      const res = await fetch(`/api/finanzas/fiscal/instancias/${instanciaId}/evidencias`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descripcion: descEvidencia.trim(), referencia: refEvidencia.trim() || null })
      })
      if (res.ok) {
        setDescEvidencia('')
        setRefEvidencia('')
        await cargar()
      } else {
        const d = await res.json().catch(() => ({}))
        window.alert(d.error ?? 'No se pudo guardar la evidencia')
      }
    } catch {
      window.alert('Error de red')
    }
  }

  async function borrarEvidencia(id: number) {
    try {
      const res = await fetch(`/api/finanzas/fiscal/evidencias/${id}`, { method: 'DELETE', credentials: 'include' })
      if (res.ok) await cargar()
    } catch {
      // ignore
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#13100A', border: '1px solid rgba(200,168,64,0.25)', padding: 24, width: 480, maxWidth: '92vw', maxHeight: '88vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-lg)', color: '#C8A840', letterSpacing: '0.08em' }}>
          {instancia ? instancia.periodo_etiqueta.toUpperCase() : 'VENCIMIENTO'}
        </span>

        {loading || !instancia ? (
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Cargando...</div>
        ) : (
          <>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {instancia.obligacion_nombre}{instancia.modelo ? ` (${instancia.modelo})` : ''} · límite {formatDateEs(instancia.fecha_limite)}
            </div>

            <div>
              <label style={labelStyle}>ESTADO</label>
              <select
                value={instancia.estado}
                disabled={saving}
                onChange={(e) => cambiarEstado(e.target.value as EstadoInstanciaFiscal)}
                style={inputStyle}
              >
                {ESTADOS_ORDEN.map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
              </select>
            </div>

            {pendienteEstado && (
              <div style={{ border: '1px solid rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.06)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#f87171' }}>
                  Control de doble verificación: para marcar "{ESTADO_LABEL[pendienteEstado]}" hace falta registrar quién lo revisó.
                </span>
                <div>
                  <label style={labelStyle}>REVISOR (obligatorio)</label>
                  <input value={revisorInput} onChange={(e) => setRevisorInput(e.target.value)} style={inputStyle} placeholder="Nombre de quien revisa" />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setPendienteEstado(null)} style={{ ...smallBtn, padding: '6px 12px' }}>Cancelar</button>
                  <button onClick={confirmarConRevisor} disabled={saving} style={{ ...smallBtn, color: '#C8A840', borderColor: 'rgba(200,168,64,0.35)', padding: '6px 12px' }}>
                    Confirmar {ESTADO_LABEL[pendienteEstado]}
                  </button>
                </div>
              </div>
            )}

            {instancia.revisor && (
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>
                Revisado por {instancia.revisor}{instancia.fecha_revision ? ` el ${formatDateEs(instancia.fecha_revision)}` : ''}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <label style={labelStyle}>CSV</label>
                <input value={csv} onChange={(e) => setCsv(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <label style={labelStyle}>NRC</label>
                <input value={nrc} onChange={(e) => setNrc(e.target.value)} style={inputStyle} />
              </div>
              <button onClick={guardarCsvNrc} disabled={saving} style={{ ...smallBtn, alignSelf: 'flex-end', flexShrink: 0 }}>Guardar</button>
            </div>

            <div>
              <label style={labelStyle}>EVIDENCIAS</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                {evidencias.length === 0 && (
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Sin evidencias todavía.</span>
                )}
                {evidencias.map((ev) => (
                  <div key={ev.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '4px 8px', background: 'rgba(200,168,64,0.04)' }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#E8DCC8' }}>
                      {ev.descripcion}{ev.referencia ? ` — ${ev.referencia}` : ''}
                    </span>
                    <button onClick={() => borrarEvidencia(ev.id)} style={{ ...smallBtn, border: 'none', padding: 2, color: '#f87171' }}>Borrar</button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <input value={descEvidencia} onChange={(e) => setDescEvidencia(e.target.value)} placeholder="Descripción" style={{ ...inputStyle, flex: 2, minWidth: 120 }} />
                <input value={refEvidencia} onChange={(e) => setRefEvidencia(e.target.value)} placeholder="Referencia (fichero, URL...)" style={{ ...inputStyle, flex: 1, minWidth: 120 }} />
                <button onClick={añadirEvidencia} style={{ ...smallBtn, color: '#C8A840', borderColor: 'rgba(200,168,64,0.35)' }}>+ Añadir</button>
              </div>
            </div>
          </>
        )}

        {error && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#f87171' }}>{error}</span>}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ ...smallBtn, padding: '7px 16px' }}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
