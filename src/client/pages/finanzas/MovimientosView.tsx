import { useState, useEffect, useCallback } from 'react'
import { type Ambito, hexToRgba, formatSaldo, formatDateEs, parseEsNumber } from './shared'

interface Cuenta {
  id: number
  ambito_id: number
  nombre: string
  tipo: string
  activa: boolean
}

interface Tercero {
  id: number
  ambito_id: number
  nombre: string
  tipo: string
  activa: boolean
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

type TipoMov = 'ingreso' | 'gasto' | 'traspaso_salida' | 'traspaso_entrada' | 'ajuste'

interface Movimiento {
  id: number
  cuenta_id: number
  fecha: string
  tipo: TipoMov
  importe: string
  moneda: string
  categoria_id: number | null
  tercero_id: number | null
  concepto: string | null
  notas: string | null
  ambito_id: number
  ambito_nombre: string
  ambito_color: string
  // Nombres resueltos por v_movimientos_reales — nombre exacto no
  // confirmado contra la vista real; si difiere, caen a "—" sin romper.
  cuenta_nombre?: string
  categoria_nombre?: string
  tercero_nombre?: string
}

interface AperturaCuenta {
  cuenta_id: number
  cuenta_nombre: string
  ambito_id: number
  ambito_nombre: string
  ambito_color: string
  apertura_id: number | null
  saldo: string | null
  notas: string | null
}

interface SaldoCalculadoCuenta {
  cuenta_id: number
  cuenta_nombre: string
  ambito_id: number
  ambito_nombre: string
  ambito_color: string
  saldo_apertura: string | null
  suma_movimientos: string | null
  saldo_calculado: string | null
  requiere_saldo_apertura: boolean
  saldo_observado: string | null
  saldo_observado_semana: string | null
  diferencia_conciliacion: string | null
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

export function MovimientosView({ ambitos }: { ambitos: Ambito[] }) {
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [showApertura, setShowApertura] = useState(false)
  const [showForm, setShowForm] = useState<Movimiento | 'new' | null>(null)

  const [filtros, setFiltros] = useState({ ambito_id: '', cuenta_id: '', tipo: '', desde: '', hasta: '' })

  // SaldoCalculadoPanel se recalcula en el servidor a partir de apertura +
  // movimientos, pero vive como componente hermano con su propio fetch: no
  // se entera solo de que un movimiento o una apertura cambiaron. Este
  // contador se incrementa tras cada mutación relevante y viaja como prop
  // para forzar su refetch sin recargar la página ni sacar al usuario de la vista.
  const [saldoRefreshToken, setSaldoRefreshToken] = useState(0)
  const bumpSaldoRefresh = useCallback(() => setSaldoRefreshToken((t) => t + 1), [])

  const fetchCuentas = useCallback(async () => {
    try {
      const res = await fetch('/api/finanzas/cuentas', { credentials: 'include' })
      const data = await res.json()
      setCuentas((data.cuentas ?? []).filter((c: Cuenta) => c.activa))
    } catch {
      // keep stale
    }
  }, [])

  const fetchMovimientos = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filtros.ambito_id) params.set('ambito_id', filtros.ambito_id)
      if (filtros.cuenta_id) params.set('cuenta_id', filtros.cuenta_id)
      if (filtros.tipo) params.set('tipo', filtros.tipo)
      if (filtros.desde) params.set('desde', filtros.desde)
      if (filtros.hasta) params.set('hasta', filtros.hasta)
      const res = await fetch(`/api/finanzas/movimientos?${params.toString()}`, { credentials: 'include' })
      const data = await res.json()
      setMovimientos(data.movimientos ?? [])
    } catch {
      // keep stale
    } finally {
      setLoading(false)
    }
  }, [filtros])

  useEffect(() => {
    fetchCuentas()
  }, [fetchCuentas])

  useEffect(() => {
    fetchMovimientos()
  }, [fetchMovimientos])

  async function deleteMovimiento(m: Movimiento) {
    if (!window.confirm(`¿Borrar este movimiento (${m.concepto || m.tipo}, ${eur(m.importe)})? No se puede deshacer.`)) return
    try {
      const res = await fetch(`/api/finanzas/movimientos/${m.id}`, { method: 'DELETE', credentials: 'include' })
      if (res.ok) {
        await fetchMovimientos()
        bumpSaldoRefresh()
      } else {
        const data = await res.json().catch(() => ({}))
        window.alert(data.error ?? 'No se pudo borrar')
      }
    } catch {
      window.alert('Error de red')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SaldoCalculadoPanel ambitos={ambitos} onOpenApertura={() => setShowApertura(true)} refreshToken={saldoRefreshToken} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={filtros.ambito_id} onChange={(e) => setFiltros({ ...filtros, ambito_id: e.target.value })} style={{ ...inputStyle, width: 'auto' }}>
            <option value="">Todos los ámbitos</option>
            {ambitos.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
          <select value={filtros.cuenta_id} onChange={(e) => setFiltros({ ...filtros, cuenta_id: e.target.value })} style={{ ...inputStyle, width: 'auto' }}>
            <option value="">Todas las cuentas</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })} style={{ ...inputStyle, width: 'auto' }}>
            <option value="">Todos los tipos</option>
            <option value="ingreso">Ingreso</option>
            <option value="gasto">Gasto</option>
            <option value="ajuste">Ajuste</option>
            <option value="traspaso_salida">Traspaso (salida)</option>
            <option value="traspaso_entrada">Traspaso (entrada)</option>
          </select>
          <input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} style={{ ...inputStyle, width: 'auto' }} title="Desde" />
          <input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} style={{ ...inputStyle, width: 'auto' }} title="Hasta" />
        </div>
        <button onClick={() => setShowForm('new')} style={{ ...smallBtn, color: '#C8A840', borderColor: 'rgba(200,168,64,0.35)', padding: '6px 14px' }}>
          + Nuevo movimiento
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--color-text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)' }}>Cargando...</div>
      ) : (
        <div style={{ background: '#13100A', border: '1px solid rgba(200,168,64,0.15)' }}>
          {movimientos.length === 0 && (
            <div style={{ padding: '16px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
              Sin movimientos con estos filtros.
            </div>
          )}
          {movimientos.map((m) => (
            <MovimientoRow key={m.id} m={m} onEdit={() => setShowForm(m)} onDelete={() => deleteMovimiento(m)} />
          ))}
        </div>
      )}

      {showApertura && <AperturaModal ambitos={ambitos} onClose={() => setShowApertura(false)} onSaved={bumpSaldoRefresh} />}

      {showForm && (
        <MovimientoFormModal
          mode={showForm === 'new' ? 'create' : 'edit'}
          movimiento={showForm === 'new' ? null : showForm}
          ambitos={ambitos}
          cuentas={cuentas}
          onClose={() => setShowForm(null)}
          onSaved={() => {
            setShowForm(null)
            fetchMovimientos()
            bumpSaldoRefresh()
          }}
        />
      )}
    </div>
  )
}

function MovimientoRow({ m, onEdit, onDelete }: { m: Movimiento; onEdit: () => void; onDelete: () => void }) {
  const importeNum = Number(m.importe)
  const positivo = importeNum >= 0
  const esTraspaso = m.tipo === 'traspaso_salida' || m.tipo === 'traspaso_entrada'
  const TIPO_LABEL: Record<TipoMov, string> = {
    ingreso: 'Ingreso', gasto: 'Gasto', ajuste: 'Ajuste',
    traspaso_salida: 'Traspaso ↗', traspaso_entrada: 'Traspaso ↘'
  }

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: '1px solid rgba(200,168,64,0.06)', gap: 12, flexWrap: 'wrap'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', minWidth: 76 }}>
          {formatDateEs(m.fecha)}
        </span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: m.ambito_color }}>
          {m.ambito_nombre.toUpperCase()}
        </span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: '#A09070' }}>
          {m.cuenta_nombre ?? '—'}
        </span>
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)',
            color: positivo ? '#4ade80' : '#f87171',
            border: `1px solid ${positivo ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
            padding: '2px 6px'
          }}
        >
          {TIPO_LABEL[m.tipo]}
        </span>
        <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-sm)', color: '#E8DCC8' }}>
          {m.concepto || (m.categoria_nombre ?? m.tercero_nombre ?? '')}
        </span>
        {m.categoria_nombre && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>· {m.categoria_nombre}</span>}
        {m.tercero_nombre && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>· {m.tercero_nombre}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)', color: positivo ? '#4ade80' : '#f87171' }}>
          {positivo ? '+' : ''}{eur(m.importe)}
        </span>
        {!esTraspaso ? (
          <>
            <button onClick={onEdit} style={{ ...smallBtn, border: 'none', padding: 2 }}>Editar</button>
            <button onClick={onDelete} style={{ ...smallBtn, border: 'none', padding: 2, color: '#f87171' }}>Borrar</button>
          </>
        ) : (
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>bloque B</span>
        )}
      </div>
    </div>
  )
}

function SaldoCalculadoPanel({ ambitos, onOpenApertura, refreshToken }: { ambitos: Ambito[]; onOpenApertura: () => void; refreshToken: number }) {
  const [cuentas, setCuentas] = useState<SaldoCalculadoCuenta[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSaldos = useCallback(async () => {
    try {
      const res = await fetch('/api/finanzas/saldo-calculado', { credentials: 'include' })
      const data = await res.json()
      setCuentas(data.cuentas ?? [])
    } catch {
      // keep stale
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSaldos()
  }, [fetchSaldos, refreshToken])

  return (
    <section style={{ background: '#13100A', border: '1px solid rgba(200,168,64,0.15)' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(200,168,64,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.12em' }}>
          SALDO CALCULADO — APERTURA + MOVIMIENTOS
        </span>
        <button onClick={onOpenApertura} style={smallBtn}>Saldos de apertura →</button>
      </div>

      {loading ? (
        <div style={{ padding: '12px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Cargando...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12 }}>
          {ambitos.map((amb) => {
            const propias = cuentas.filter((c) => c.ambito_id === amb.id)
            if (propias.length === 0) return null
            return (
              <div key={amb.id} style={{ border: `1px solid ${hexToRgba(amb.color, 0.15)}`, borderLeft: `3px solid ${amb.color}`, padding: 10 }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-sm)', color: '#E8DCC8', letterSpacing: '0.04em', marginBottom: 8 }}>
                  {amb.nombre.toUpperCase()}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {propias.map((c) => (
                    <div key={c.cuenta_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-sm)', color: '#A09070', minWidth: 140 }}>{c.cuenta_nombre}</span>
                      {c.requiere_saldo_apertura ? (
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#facc15' }}>
                          Falta saldo de apertura —{' '}
                          <button onClick={onOpenApertura} style={{ background: 'transparent', border: 'none', color: '#facc15', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', padding: 0 }}>
                            registrarlo
                          </button>
                        </span>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>
                            apertura {eur(c.saldo_apertura)}
                          </span>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>
                            + movs {eur(c.suma_movimientos)}
                          </span>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: '#C8A840' }}>
                            = {eur(c.saldo_calculado)}
                          </span>
                          {c.saldo_observado !== null && (
                            <span
                              style={{
                                fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)',
                                color: c.diferencia_conciliacion && Number(c.diferencia_conciliacion) !== 0 ? '#facc15' : 'var(--color-text-muted)'
                              }}
                            >
                              observado {eur(c.saldo_observado)}
                              {c.diferencia_conciliacion !== null && Number(c.diferencia_conciliacion) !== 0 && (
                                <> · diferencia {eur(c.diferencia_conciliacion)}</>
                              )}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function AperturaModal({ ambitos, onClose, onSaved }: { ambitos: Ambito[]; onClose: () => void; onSaved: () => void }) {
  const anio = new Date().getFullYear()
  const [cuentas, setCuentas] = useState<AperturaCuenta[]>([])
  const [inputs, setInputs] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [errors, setErrors] = useState<Record<number, string | null>>({})

  const fetchApertura = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/finanzas/apertura?anio=${anio}`, { credentials: 'include' })
      const data = await res.json()
      const rows: AperturaCuenta[] = data.cuentas ?? []
      setCuentas(rows)
      const seeded: Record<number, string> = {}
      for (const r of rows) if (r.saldo !== null) seeded[r.cuenta_id] = String(r.saldo)
      setInputs(seeded)
    } catch {
      // keep stale
    } finally {
      setLoading(false)
    }
  }, [anio])

  useEffect(() => {
    fetchApertura()
  }, [fetchApertura])

  async function save(cuentaId: number) {
    const raw = inputs[cuentaId] ?? ''
    const num = parseEsNumber(raw)
    if (num === null) {
      setErrors((prev) => ({ ...prev, [cuentaId]: 'Importe inválido' }))
      return
    }
    setErrors((prev) => ({ ...prev, [cuentaId]: null }))
    setSavingId(cuentaId)
    try {
      const res = await fetch('/api/finanzas/apertura', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuenta_id: cuentaId, anio, saldo: num })
      })
      if (res.ok) {
        await fetchApertura()
        onSaved()
      } else {
        const data = await res.json().catch(() => ({}))
        setErrors((prev) => ({ ...prev, [cuentaId]: data.error ?? 'Error al guardar' }))
      }
    } catch {
      setErrors((prev) => ({ ...prev, [cuentaId]: 'Error de red' }))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#13100A', border: '1px solid rgba(200,168,64,0.25)', padding: 24, width: 560, maxWidth: '92vw', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div>
          <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-lg)', color: '#C8A840', letterSpacing: '0.08em' }}>
            SALDOS DE APERTURA — {anio}
          </span>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
            El saldo de apertura es el punto de partida del año: el saldo calculado se obtiene sumando los movimientos reales a partir de aquí.
          </p>
        </div>

        {loading ? (
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Cargando...</div>
        ) : (
          ambitos.map((amb) => {
            const propias = cuentas.filter((c) => c.ambito_id === amb.id)
            if (propias.length === 0) return null
            return (
              <div key={amb.id} style={{ border: `1px solid ${hexToRgba(amb.color, 0.15)}`, borderLeft: `3px solid ${amb.color}`, padding: 10 }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-sm)', color: '#E8DCC8', letterSpacing: '0.04em', marginBottom: 8 }}>
                  {amb.nombre.toUpperCase()}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {propias.map((c) => (
                    <div key={c.cuenta_id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-sm)', color: '#A09070', flex: 1 }}>{c.cuenta_nombre}</span>
                        <input
                          value={inputs[c.cuenta_id] ?? ''}
                          onChange={(e) => setInputs((prev) => ({ ...prev, [c.cuenta_id]: e.target.value }))}
                          placeholder="0,00"
                          style={{ ...inputStyle, width: 110, textAlign: 'right' }}
                        />
                        <button onClick={() => save(c.cuenta_id)} disabled={savingId === c.cuenta_id} style={{ ...smallBtn, color: '#C8A840', borderColor: 'rgba(200,168,64,0.35)' }}>
                          {savingId === c.cuenta_id ? '...' : 'Guardar'}
                        </button>
                      </div>
                      {errors[c.cuenta_id] && (
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: '#f87171', alignSelf: 'flex-end' }}>{errors[c.cuenta_id]}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ ...smallBtn, padding: '7px 16px' }}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}

function MovimientoFormModal({
  mode,
  movimiento,
  ambitos,
  cuentas,
  onClose,
  onSaved
}: {
  mode: 'create' | 'edit'
  movimiento: Movimiento | null
  ambitos: Ambito[]
  cuentas: Cuenta[]
  onClose: () => void
  onSaved: () => void
}) {
  const [cuentaId, setCuentaId] = useState<number | ''>(movimiento?.cuenta_id ?? '')
  const [tipo, setTipo] = useState<'ingreso' | 'gasto' | 'ajuste'>(
    movimiento && (movimiento.tipo === 'ingreso' || movimiento.tipo === 'gasto' || movimiento.tipo === 'ajuste') ? movimiento.tipo : 'gasto'
  )
  const [fecha, setFecha] = useState(movimiento?.fecha ?? new Date().toISOString().slice(0, 10))
  const [importe, setImporte] = useState(movimiento ? formatSaldo(Math.abs(Number(movimiento.importe))) : '')
  const [signo, setSigno] = useState<'suma' | 'resta'>(movimiento && Number(movimiento.importe) < 0 ? 'resta' : 'suma')
  const [categoriaId, setCategoriaId] = useState<number | ''>(movimiento?.categoria_id ?? '')
  const [terceroId, setTerceroId] = useState<number | ''>(movimiento?.tercero_id ?? '')
  const [concepto, setConcepto] = useState(movimiento?.concepto ?? '')
  const [notas, setNotas] = useState(movimiento?.notas ?? '')

  const [categorias, setCategorias] = useState<CategoriaFlat[]>([])
  const [terceros, setTerceros] = useState<Tercero[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const cuentaSeleccionada = cuentas.find((c) => c.id === cuentaId)
  const ambitoDeCuenta = cuentaSeleccionada?.ambito_id

  useEffect(() => {
    if (tipo === 'gasto' || tipo === 'ingreso') {
      fetch(`/api/finanzas/categorias?tipo=${tipo}`, { credentials: 'include' })
        .then((r) => r.json())
        .then((data) => setCategorias(flattenCategorias(data.categorias ?? [])))
        .catch(() => setCategorias([]))
    } else {
      setCategorias([])
    }
  }, [tipo])

  useEffect(() => {
    if (!ambitoDeCuenta) {
      setTerceros([])
      return
    }
    fetch(`/api/finanzas/terceros?ambito_id=${ambitoDeCuenta}&activa=true`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setTerceros(data.terceros ?? []))
      .catch(() => setTerceros([]))
  }, [ambitoDeCuenta])

  async function submit() {
    if (cuentaId === '') return setError('Selecciona una cuenta')
    const importeNum = parseEsNumber(importe)
    if (importeNum === null || importeNum <= 0) return setError('Importe inválido — debe ser mayor que 0')
    if (tipo === 'gasto' && categoriaId === '') return setError('Un gasto requiere categoría')
    if (tipo === 'ingreso' && terceroId === '') return setError('Un ingreso requiere tercero')

    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        fecha,
        importe: importeNum,
        categoria_id: categoriaId === '' ? null : categoriaId,
        tercero_id: terceroId === '' ? null : terceroId,
        concepto: concepto.trim() || null,
        notas: notas.trim() || null
      }
      if (tipo === 'ajuste') body.signo = signo

      let res: Response
      if (mode === 'create') {
        res = await fetch('/api/finanzas/movimientos', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, cuenta_id: cuentaId, tipo })
        })
      } else {
        res = await fetch(`/api/finanzas/movimientos/${movimiento!.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Error al guardar')
        return
      }
      onSaved()
    } catch {
      setError('Error de red')
    } finally {
      setSaving(false)
    }
  }

  const cuentasPorAmbito = ambitos.map((a) => ({ ambito: a, cuentas: cuentas.filter((c) => c.ambito_id === a.id) }))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#13100A', border: '1px solid rgba(200,168,64,0.25)', padding: 24, width: 440, maxWidth: '92vw', maxHeight: '88vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-lg)', color: '#C8A840', letterSpacing: '0.08em' }}>
          {mode === 'create' ? 'NUEVO MOVIMIENTO' : 'EDITAR MOVIMIENTO'}
        </span>

        {mode === 'create' && (
          <div>
            <label style={labelStyle}>TIPO</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as 'ingreso' | 'gasto' | 'ajuste')} style={inputStyle}>
              <option value="gasto">Gasto</option>
              <option value="ingreso">Ingreso</option>
              <option value="ajuste">Ajuste</option>
            </select>
          </div>
        )}
        {mode === 'edit' && (
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            Tipo: <span style={{ color: '#C8A840' }}>{tipo}</span> (no editable)
          </div>
        )}

        {mode === 'create' && (
          <div>
            <label style={labelStyle}>CUENTA</label>
            <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value ? Number(e.target.value) : '')} style={inputStyle}>
              <option value="">Selecciona una cuenta</option>
              {cuentasPorAmbito.map(({ ambito, cuentas: cs }) =>
                cs.length > 0 ? (
                  <optgroup key={ambito.id} label={ambito.nombre}>
                    {cs.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </optgroup>
                ) : null
              )}
            </select>
          </div>
        )}

        <div>
          <label style={labelStyle}>FECHA</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>IMPORTE (siempre positivo)</label>
          <input value={importe} onChange={(e) => setImporte(e.target.value)} placeholder="0,00" style={inputStyle} />
        </div>

        {tipo === 'ajuste' && (
          <div>
            <label style={labelStyle}>SIGNO</label>
            <div style={{ display: 'flex', gap: 0 }}>
              {(['suma', 'resta'] as const).map((s, i) => (
                <button
                  key={s}
                  onClick={() => setSigno(s)}
                  style={{
                    flex: 1, fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', padding: '8px 0', cursor: 'pointer',
                    color: signo === s ? '#C8A840' : 'var(--color-text-muted)',
                    background: signo === s ? 'rgba(200,168,64,0.2)' : 'transparent',
                    border: signo === s ? '1px solid #C8A840' : '1px solid rgba(200,168,64,0.15)',
                    marginLeft: i === 0 ? 0 : -1
                  }}
                >
                  {s === 'suma' ? 'Suma (+)' : 'Resta (−)'}
                </button>
              ))}
            </div>
          </div>
        )}

        {(tipo === 'gasto' || tipo === 'ingreso' || tipo === 'ajuste') && (
          <div>
            <label style={labelStyle}>CATEGORÍA{tipo === 'gasto' ? ' (obligatoria)' : tipo === 'ingreso' ? ' (opcional)' : ' (opcional)'}</label>
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value ? Number(e.target.value) : '')} style={inputStyle}>
              <option value="">— Sin categoría —</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{'—'.repeat(c.depth)} {c.nombre}</option>)}
            </select>
          </div>
        )}

        <div>
          <label style={labelStyle}>TERCERO{tipo === 'ingreso' ? ' (obligatorio)' : ' (opcional)'}</label>
          <select value={terceroId} onChange={(e) => setTerceroId(e.target.value ? Number(e.target.value) : '')} style={inputStyle} disabled={!ambitoDeCuenta}>
            <option value="">— Sin tercero —</option>
            {terceros.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          {!ambitoDeCuenta && mode === 'create' && (
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>Elige primero una cuenta</span>
          )}
        </div>

        <div>
          <label style={labelStyle}>CONCEPTO (opcional)</label>
          <input value={concepto} onChange={(e) => setConcepto(e.target.value)} style={inputStyle} placeholder="Ej. Factura luz agosto" />
        </div>

        <div>
          <label style={labelStyle}>NOTAS (opcional)</label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} rows={2} />
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
