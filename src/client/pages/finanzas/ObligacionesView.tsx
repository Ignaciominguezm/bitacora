import { useState, useEffect, useCallback } from 'react'
import { type Ambito, hexToRgba, formatSaldo, formatDateEs, parseEsNumber } from './shared'

type Periodicidad = 'mensual' | 'trimestral' | 'anual' | 'puntual'
type TipoImporte = 'fijo' | 'variable'
type EstadoInstancia = 'pendiente' | 'cubierta' | 'cancelada'

interface Obligacion {
  id: number
  ambito_id: number
  categoria_id: number
  nombre: string
  periodicidad: Periodicidad
  tipo_importe: TipoImporte
  importe_referencia: string | null
  dia_vencimiento: number | null
  meses_desfase: number
  activa: boolean
  notas: string | null
  ambito_nombre: string
  ambito_color: string
  ambito_orden: number
  categoria_nombre: string
}

interface Instancia {
  id: number
  obligacion_id: number
  periodo: string
  fecha_vencimiento: string
  importe_esperado: string | null
  estado: EstadoInstancia
  movimiento_id: number | null
  importe_real: string | null
  fecha_cubierta: string | null
  notas: string | null
  obligacion_nombre: string
  periodicidad: Periodicidad
  categoria_id: number
  categoria_nombre: string
  ambito_id: number
  ambito_nombre: string
  ambito_color: string
  ambito_orden: number
}

interface Candidato {
  id: number
  cuenta_id: number
  fecha: string
  importe: string
  concepto: string | null
  cuenta_nombre: string
}

interface Sugerencia {
  instancia_id: number
  obligacion_id: number
  obligacion_nombre: string
  importe_esperado: string | null
  candidatos: Candidato[]
}

interface CategoriaNode {
  id: number
  parent_id: number | null
  nombre: string
  tipo: string
  activa: boolean
  children: CategoriaNode[]
}

interface CategoriaFlat {
  id: number
  nombre: string
  depth: number
}

const PERIODICIDAD_LABEL: Record<Periodicidad, string> = { mensual: 'Mensual', trimestral: 'Trimestral', anual: 'Anual', puntual: 'Puntual' }
const ESTADO_LABEL: Record<EstadoInstancia, string> = { pendiente: 'Pendiente', cubierta: 'Cubierta', cancelada: 'Cancelada' }

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
  fontSize: 'var(--text-base)',
  color: '#E8DCC8',
  background: '#0D0A06',
  border: '1px solid rgba(200,168,64,0.2)',
  padding: '8px 10px',
  outline: 'none',
  width: '100%'
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

function flattenCategorias(nodes: CategoriaNode[], depth = 0): CategoriaFlat[] {
  const out: CategoriaFlat[] = []
  for (const n of nodes) {
    if (!n.activa) continue
    out.push({ id: n.id, nombre: n.nombre, depth })
    out.push(...flattenCategorias(n.children, depth + 1))
  }
  return out
}

function currentMonthStart(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function shiftMonth(periodo: string, delta: number): string {
  const [y, m] = periodo.split('-').map(Number)
  const total = m - 1 + delta
  const year = y + Math.floor(total / 12)
  const month = ((total % 12) + 12) % 12
  return `${year}-${String(month + 1).padStart(2, '0')}-01`
}

function formatMesEs(periodo: string): string {
  const d = new Date(`${periodo}T00:00:00Z`)
  const s = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// Semáforo de vencimiento: solo aplica a instancias pendientes. Cubierta y
// cancelada tienen su propio color neutro, no un semáforo de urgencia.
function semaforoInstancia(inst: Instancia): { color: string; label: string } {
  if (inst.estado === 'cubierta') return { color: '#4ade80', label: 'Cubierta' }
  if (inst.estado === 'cancelada') return { color: 'var(--color-text-muted)', label: 'Cancelada' }
  const hoy = todayStr()
  const limite = new Date(`${hoy}T00:00:00Z`)
  limite.setUTCDate(limite.getUTCDate() + 7)
  const limiteStr = limite.toISOString().slice(0, 10)
  if (inst.fecha_vencimiento < hoy) return { color: '#f87171', label: 'Vencida' }
  if (inst.fecha_vencimiento <= limiteStr) return { color: '#facc15', label: 'Próxima' }
  return { color: 'var(--color-text-muted)', label: 'Pendiente' }
}

export function ObligacionesView({ ambitos }: { ambitos: Ambito[] }) {
  const [periodo, setPeriodo] = useState(currentMonthStart())
  const [obligaciones, setObligaciones] = useState<Obligacion[]>([])
  const [instancias, setInstancias] = useState<Instancia[]>([])
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [loading, setLoading] = useState(true)
  const [descartadas, setDescartadas] = useState<Set<number>>(new Set())

  const [showForm, setShowForm] = useState<Obligacion | 'new' | null>(null)
  const [cubrirFor, setCubrirFor] = useState<Instancia | null>(null)
  const [manualFor, setManualFor] = useState(false)

  const fetchObligaciones = useCallback(async () => {
    try {
      const res = await fetch('/api/finanzas/obligaciones', { credentials: 'include' })
      const data = await res.json()
      setObligaciones(data.obligaciones ?? [])
    } catch {
      // keep stale
    }
  }, [])

  const fetchInstancias = useCallback(async () => {
    setLoading(true)
    try {
      const [instRes, sugRes] = await Promise.all([
        fetch(`/api/finanzas/obligaciones/instancias?periodo=${periodo}`, { credentials: 'include' }),
        fetch(`/api/finanzas/obligaciones/sugerencias?periodo=${periodo}`, { credentials: 'include' })
      ])
      setInstancias((await instRes.json()).instancias ?? [])
      setSugerencias((await sugRes.json()).sugerencias ?? [])
      setDescartadas(new Set())
    } catch {
      // keep stale
    } finally {
      setLoading(false)
    }
  }, [periodo])

  useEffect(() => {
    fetchObligaciones()
  }, [fetchObligaciones])

  useEffect(() => {
    fetchInstancias()
  }, [fetchInstancias])

  async function confirmarCandidato(instanciaId: number, movimientoId: number) {
    try {
      const res = await fetch(`/api/finanzas/obligaciones/instancias/${instanciaId}/cubrir`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movimiento_id: movimientoId })
      })
      if (res.ok) {
        await fetchInstancias()
        await fetchObligaciones()
      } else {
        const data = await res.json().catch(() => ({}))
        window.alert(data.error ?? 'No se pudo confirmar')
      }
    } catch {
      window.alert('Error de red')
    }
  }

  async function descubrir(instanciaId: number) {
    if (!window.confirm('¿Deshacer el emparejamiento? La instancia volverá a pendiente.')) return
    try {
      const res = await fetch(`/api/finanzas/obligaciones/instancias/${instanciaId}/descubrir`, { method: 'POST', credentials: 'include' })
      if (res.ok) await fetchInstancias()
    } catch {
      // ignore — próxima carga reconcilia
    }
  }

  function descartarCandidato(instanciaId: number, movimientoId: number) {
    setDescartadas((prev) => new Set(prev).add(instanciaId * 1_000_000 + movimientoId))
  }

  const instanciasPorAmbito = ambitos.map((amb) => ({ ambito: amb, instancias: instancias.filter((i) => i.ambito_id === amb.id) }))
  const obligacionesPorAmbito = ambitos.map((amb) => ({ ambito: amb, obligaciones: obligaciones.filter((o) => o.ambito_id === amb.id) }))
  const sugerenciasPorInstancia = new Map(sugerencias.map((s) => [s.instancia_id, s]))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Plantillas */}
      <section style={{ background: '#13100A', border: '1px solid rgba(200,168,64,0.15)' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(200,168,64,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.12em' }}>
            OBLIGACIONES — PLANTILLAS
          </span>
          <button onClick={() => setShowForm('new')} style={{ ...smallBtn, color: '#C8A840', borderColor: 'rgba(200,168,64,0.35)' }}>+ Nueva obligación</button>
        </div>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {obligacionesPorAmbito.every((g) => g.obligaciones.length === 0) && (
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', padding: '4px 4px' }}>
              Sin obligaciones todavía.
            </div>
          )}
          {obligacionesPorAmbito.map(({ ambito, obligaciones: obs }) => {
            if (obs.length === 0) return null
            return (
              <div key={ambito.id} style={{ border: `1px solid ${hexToRgba(ambito.color, 0.15)}`, borderLeft: `3px solid ${ambito.color}`, padding: 10 }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-sm)', color: '#E8DCC8', letterSpacing: '0.04em', marginBottom: 8 }}>
                  {ambito.nombre.toUpperCase()}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {obs.map((o) => (
                    <div key={o.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', opacity: o.activa ? 1 : 0.5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-sm)', color: '#E8DCC8' }}>{o.nombre}</span>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', border: '1px solid rgba(200,168,64,0.15)', padding: '1px 6px' }}>
                          {PERIODICIDAD_LABEL[o.periodicidad]}
                        </span>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>· {o.categoria_nombre}</span>
                        {!o.activa && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>(desactivada)</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: '#C8A840' }}>
                          {o.tipo_importe === 'variable' ? '~' : ''}{eur(o.importe_referencia)}
                        </span>
                        <button onClick={() => setShowForm(o)} style={{ ...smallBtn, border: 'none', padding: 2 }}>Editar</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Vencimientos del periodo */}
      <section style={{ background: '#13100A', border: '1px solid rgba(200,168,64,0.15)' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(200,168,64,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setPeriodo((p) => shiftMonth(p, -1))} style={smallBtn}>← Mes anterior</button>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)', color: '#C8A840', padding: '0 8px' }}>{formatMesEs(periodo)}</span>
            <button onClick={() => setPeriodo((p) => shiftMonth(p, 1))} style={smallBtn}>Mes siguiente →</button>
            <button onClick={() => setPeriodo(currentMonthStart())} style={smallBtn}>Este mes</button>
          </div>
          <button onClick={() => setManualFor(true)} style={{ ...smallBtn, color: '#C8A840', borderColor: 'rgba(200,168,64,0.35)' }}>+ Vencimiento manual</button>
        </div>

        {loading ? (
          <div style={{ padding: '16px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Cargando...</div>
        ) : (
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {instanciasPorAmbito.every((g) => g.instancias.length === 0) && (
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', padding: '4px 4px' }}>
                Sin vencimientos este mes.
              </div>
            )}
            {instanciasPorAmbito.map(({ ambito, instancias: insts }) => {
              if (insts.length === 0) return null
              return (
                <div key={ambito.id} style={{ border: `1px solid ${hexToRgba(ambito.color, 0.15)}`, borderLeft: `3px solid ${ambito.color}`, padding: 10 }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-sm)', color: '#E8DCC8', letterSpacing: '0.04em', marginBottom: 8 }}>
                    {ambito.nombre.toUpperCase()}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {insts.map((inst) => {
                      const sem = semaforoInstancia(inst)
                      const sug = sugerenciasPorInstancia.get(inst.id)
                      const candidatosVivos = sug ? sug.candidatos.filter((cand) => !descartadas.has(inst.id * 1_000_000 + cand.id)) : []
                      return (
                        <div key={inst.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', border: '1px solid rgba(200,168,64,0.06)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: sem.color, flexShrink: 0 }} />
                              <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-sm)', color: '#E8DCC8' }}>{inst.obligacion_nombre}</span>
                              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>· {inst.categoria_nombre}</span>
                              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>vence {formatDateEs(inst.fecha_vencimiento)}</span>
                              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: sem.color, border: `1px solid ${hexToRgba(sem.color, 0.4)}`, padding: '1px 6px' }}>
                                {ESTADO_LABEL[inst.estado]}{inst.estado === 'pendiente' && sem.label !== 'Pendiente' ? ` · ${sem.label}` : ''}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)', color: '#E8DCC8' }}>
                                {inst.estado === 'cubierta' ? eur(inst.importe_real) : eur(inst.importe_esperado)}
                              </span>
                              {inst.estado === 'pendiente' && (
                                <button onClick={() => setCubrirFor(inst)} style={smallBtn}>Cubrir manualmente</button>
                              )}
                              {inst.estado === 'cubierta' && (
                                <button onClick={() => descubrir(inst.id)} style={{ ...smallBtn, color: '#f87171' }}>Descubrir</button>
                              )}
                            </div>
                          </div>

                          {inst.estado === 'pendiente' && candidatosVivos.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 18 }}>
                              {candidatosVivos.map((cand) => (
                                <div
                                  key={cand.id}
                                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '6px 10px', background: 'rgba(250,204,21,0.06)', border: '1px solid rgba(250,204,21,0.2)' }}
                                >
                                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#facc15' }}>
                                    Posible pago: {cand.concepto || cand.cuenta_nombre} de {eur(cand.importe)} el {formatDateEs(cand.fecha)} — ¿confirmar?
                                  </span>
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={() => confirmarCandidato(inst.id, cand.id)} style={{ ...smallBtn, color: '#4ade80', borderColor: 'rgba(74,222,128,0.35)' }}>Confirmar</button>
                                    <button onClick={() => descartarCandidato(inst.id, cand.id)} style={{ ...smallBtn, color: 'var(--color-text-muted)' }}>Descartar</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {showForm && (
        <ObligacionFormModal
          mode={showForm === 'new' ? 'create' : 'edit'}
          obligacion={showForm === 'new' ? null : showForm}
          ambitos={ambitos}
          onClose={() => setShowForm(null)}
          onSaved={() => {
            setShowForm(null)
            fetchObligaciones()
            fetchInstancias()
          }}
        />
      )}

      {cubrirFor && (
        <CubrirManualModal
          instancia={cubrirFor}
          onClose={() => setCubrirFor(null)}
          onConfirmed={() => {
            fetchInstancias()
            fetchObligaciones()
          }}
        />
      )}

      {manualFor && (
        <InstanciaManualModal
          obligaciones={obligaciones}
          periodoInicial={periodo}
          onClose={() => setManualFor(false)}
          onSaved={() => {
            setManualFor(false)
            fetchInstancias()
          }}
        />
      )}
    </div>
  )
}

function CubrirManualModal({ instancia, onClose, onConfirmed }: { instancia: Instancia; onClose: () => void; onConfirmed: () => void }) {
  const [movimientos, setMovimientos] = useState<Array<{ id: number; fecha: string; importe: string; concepto: string | null; cuenta_nombre?: string }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/finanzas/movimientos?categoria_id=${instancia.categoria_id}&tipo=gasto&limit=30`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setMovimientos(d.movimientos ?? []))
      .catch(() => setMovimientos([]))
      .finally(() => setLoading(false))
  }, [instancia.categoria_id])

  async function confirmar(movId: number) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/finanzas/obligaciones/instancias/${instancia.id}/cubrir`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movimiento_id: movId })
      })
      if (res.ok) {
        onConfirmed()
        onClose()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Error al cubrir')
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
        style={{ background: '#13100A', border: '1px solid rgba(200,168,64,0.25)', padding: 24, width: 480, maxWidth: '92vw', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-lg)', color: '#C8A840', letterSpacing: '0.08em' }}>
          CUBRIR — {instancia.obligacion_nombre.toUpperCase()}
        </span>
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
          Gastos recientes de la categoría {instancia.categoria_nombre}. Elige el que cubre este vencimiento.
        </p>

        {loading ? (
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Cargando...</div>
        ) : movimientos.length === 0 ? (
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            No hay gastos de esta categoría todavía.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {movimientos.map((m) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 10px', border: '1px solid rgba(200,168,64,0.1)', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#A09070' }}>
                  {formatDateEs(m.fecha)} · {m.cuenta_nombre ?? '—'} · {m.concepto || '—'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: '#f87171' }}>{eur(m.importe)}</span>
                  <button onClick={() => confirmar(m.id)} disabled={saving} style={{ ...smallBtn, color: '#4ade80', borderColor: 'rgba(74,222,128,0.35)' }}>Elegir</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#f87171' }}>{error}</span>}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ ...smallBtn, padding: '7px 16px' }}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}

function InstanciaManualModal({
  obligaciones,
  periodoInicial,
  onClose,
  onSaved
}: {
  obligaciones: Obligacion[]
  periodoInicial: string
  onClose: () => void
  onSaved: () => void
}) {
  const [obligacionId, setObligacionId] = useState<number | ''>('')
  const [periodo, setPeriodo] = useState(periodoInicial)
  const [fechaVencimiento, setFechaVencimiento] = useState(periodoInicial)
  const [importeEsperado, setImporteEsperado] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ambitosDe = new Map(obligaciones.map((o) => [o.id, o]))

  async function submit() {
    if (obligacionId === '') return setError('Selecciona una obligación')
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { obligacion_id: obligacionId, periodo, fecha_vencimiento: fechaVencimiento }
      if (importeEsperado.trim() !== '') {
        const n = parseEsNumber(importeEsperado)
        if (n === null) { setError('Importe inválido'); setSaving(false); return }
        body.importe_esperado = n
      }
      const res = await fetch('/api/finanzas/obligaciones/instancias', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
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
        style={{ background: '#13100A', border: '1px solid rgba(200,168,64,0.25)', padding: 24, width: 420, maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-lg)', color: '#C8A840', letterSpacing: '0.08em' }}>VENCIMIENTO MANUAL</span>

        <div>
          <label style={labelStyle}>OBLIGACIÓN</label>
          <select value={obligacionId} onChange={(e) => setObligacionId(e.target.value ? Number(e.target.value) : '')} style={inputStyle}>
            <option value="">Selecciona una obligación</option>
            {obligaciones.map((o) => (
              <option key={o.id} value={o.id}>{o.nombre} — {ambitosDe.get(o.id)?.ambito_nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>PERIODO (día 1 del mes/trimestre/año)</label>
          <input type="date" value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>FECHA DE VENCIMIENTO</label>
          <input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>IMPORTE ESPERADO (opcional)</label>
          <input value={importeEsperado} onChange={(e) => setImporteEsperado(e.target.value)} placeholder="0,00" style={inputStyle} />
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

function ObligacionFormModal({
  mode,
  obligacion,
  ambitos,
  onClose,
  onSaved
}: {
  mode: 'create' | 'edit'
  obligacion: Obligacion | null
  ambitos: Ambito[]
  onClose: () => void
  onSaved: () => void
}) {
  const [ambitoId, setAmbitoId] = useState<number | ''>(obligacion?.ambito_id ?? '')
  const [categoriaId, setCategoriaId] = useState<number | ''>(obligacion?.categoria_id ?? '')
  const [nombre, setNombre] = useState(obligacion?.nombre ?? '')
  const [periodicidad, setPeriodicidad] = useState<Periodicidad>(obligacion?.periodicidad ?? 'mensual')
  const [tipoImporte, setTipoImporte] = useState<TipoImporte>(obligacion?.tipo_importe ?? 'fijo')
  const [importeReferencia, setImporteReferencia] = useState(obligacion?.importe_referencia !== null && obligacion?.importe_referencia !== undefined ? formatSaldo(obligacion.importe_referencia) : '')
  const [diaVencimiento, setDiaVencimiento] = useState(obligacion?.dia_vencimiento !== null && obligacion?.dia_vencimiento !== undefined ? String(obligacion.dia_vencimiento) : '')
  const [mesesDesfase, setMesesDesfase] = useState(obligacion ? String(obligacion.meses_desfase) : '0')
  const [notas, setNotas] = useState(obligacion?.notas ?? '')
  const [activa, setActiva] = useState(obligacion?.activa ?? true)

  const [categorias, setCategorias] = useState<CategoriaFlat[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [instanciasCreadas, setInstanciasCreadas] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/finanzas/categorias?tipo=gasto', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setCategorias(flattenCategorias(data.categorias ?? [])))
      .catch(() => setCategorias([]))
  }, [])

  async function submit() {
    setError(null)

    if (mode === 'create') {
      if (ambitoId === '') return setError('Selecciona un ámbito')
      if (categoriaId === '') return setError('Selecciona una categoría')
      if (!nombre.trim()) return setError('El nombre es obligatorio')
    }

    let importeReferenciaNum: number | null = null
    if (importeReferencia.trim() !== '') {
      importeReferenciaNum = parseEsNumber(importeReferencia)
      if (importeReferenciaNum === null) return setError('Importe de referencia inválido')
    }
    let diaVencimientoNum: number | null = null
    if (diaVencimiento.trim() !== '') {
      diaVencimientoNum = Number(diaVencimiento)
      if (!Number.isInteger(diaVencimientoNum) || diaVencimientoNum < 1 || diaVencimientoNum > 31) return setError('Día de vencimiento debe estar entre 1 y 31')
    }
    const mesesDesfaseNum = Number(mesesDesfase || '0')
    if (!Number.isInteger(mesesDesfaseNum)) return setError('Meses de desfase debe ser un entero')

    setSaving(true)
    try {
      let res: Response
      if (mode === 'create') {
        res = await fetch('/api/finanzas/obligaciones', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ambito_id: ambitoId,
            categoria_id: categoriaId,
            nombre: nombre.trim(),
            periodicidad,
            tipo_importe: tipoImporte,
            importe_referencia: importeReferenciaNum,
            dia_vencimiento: diaVencimientoNum,
            meses_desfase: mesesDesfaseNum,
            notas: notas.trim() || null
          })
        })
      } else {
        res = await fetch(`/api/finanzas/obligaciones/${obligacion!.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: nombre.trim(),
            importe_referencia: importeReferenciaNum,
            dia_vencimiento: diaVencimientoNum,
            meses_desfase: mesesDesfaseNum,
            activa,
            notas: notas.trim() || null
          })
        })
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Error al guardar')
        return
      }
      const data = await res.json().catch(() => ({}))
      if (mode === 'create' && typeof data.instancias_creadas === 'number' && data.instancias_creadas > 0) {
        setInstanciasCreadas(data.instancias_creadas)
        setTimeout(onSaved, 900)
        return
      }
      onSaved()
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
        style={{ background: '#13100A', border: '1px solid rgba(200,168,64,0.25)', padding: 24, width: 440, maxWidth: '92vw', maxHeight: '88vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-lg)', color: '#C8A840', letterSpacing: '0.08em' }}>
          {mode === 'create' ? 'NUEVA OBLIGACIÓN' : 'EDITAR OBLIGACIÓN'}
        </span>

        {instanciasCreadas !== null && (
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: '#4ade80' }}>
            Creada — {instanciasCreadas} instancia{instanciasCreadas !== 1 ? 's' : ''} generada{instanciasCreadas !== 1 ? 's' : ''} para el año en curso.
          </div>
        )}

        {mode === 'create' && (
          <div>
            <label style={labelStyle}>ÁMBITO</label>
            <select value={ambitoId} onChange={(e) => setAmbitoId(e.target.value ? Number(e.target.value) : '')} style={inputStyle}>
              <option value="">Selecciona un ámbito</option>
              {ambitos.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>
        )}

        <div>
          <label style={labelStyle}>NOMBRE</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={inputStyle} placeholder="Ej. Cuota autónomo" />
        </div>

        {mode === 'create' && (
          <div>
            <label style={labelStyle}>CATEGORÍA (de gasto)</label>
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value ? Number(e.target.value) : '')} style={inputStyle}>
              <option value="">Selecciona una categoría</option>
              {categorias.map((cat) => <option key={cat.id} value={cat.id}>{'—'.repeat(cat.depth)} {cat.nombre}</option>)}
            </select>
          </div>
        )}

        {mode === 'create' ? (
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>PERIODICIDAD</label>
              <select value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value as Periodicidad)} style={inputStyle}>
                <option value="mensual">Mensual</option>
                <option value="trimestral">Trimestral</option>
                <option value="anual">Anual</option>
                <option value="puntual">Puntual</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>TIPO DE IMPORTE</label>
              <select value={tipoImporte} onChange={(e) => setTipoImporte(e.target.value as TipoImporte)} style={inputStyle}>
                <option value="fijo">Fijo</option>
                <option value="variable">Variable</option>
              </select>
            </div>
          </div>
        ) : (
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {PERIODICIDAD_LABEL[obligacion!.periodicidad]} · {obligacion!.tipo_importe === 'fijo' ? 'Fijo' : 'Variable'} · {obligacion!.categoria_nombre} (no editables)
          </div>
        )}

        <div>
          <label style={labelStyle}>IMPORTE DE REFERENCIA (opcional)</label>
          <input value={importeReferencia} onChange={(e) => setImporteReferencia(e.target.value)} style={inputStyle} placeholder="0,00" />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>DÍA DE VENCIMIENTO (1-31, opcional)</label>
            <input value={diaVencimiento} onChange={(e) => setDiaVencimiento(e.target.value)} style={inputStyle} placeholder="Último día del mes" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>MESES DE DESFASE</label>
            <input value={mesesDesfase} onChange={(e) => setMesesDesfase(e.target.value)} style={inputStyle} placeholder="0" />
          </div>
        </div>

        <div>
          <label style={labelStyle}>NOTAS (opcional)</label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} rows={2} />
        </div>

        {mode === 'edit' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: '#A09070', cursor: 'pointer' }}>
            <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
            Activa
          </label>
        )}

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
