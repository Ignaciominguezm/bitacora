import { useState, useEffect, useCallback, useRef } from 'react'
import { type Ambito, hexToRgba, formatSaldo, parseEsNumber, formatDateEs } from './shared'

// #743 pieza 3 — Vista Mensual. Transforma la antigua "Revisión Semanal"
// (#712): el bloque de captura manual de saldos desaparece (los saldos ya
// se derivan del flujo de caja real, Pieza 2A — ver v_cuentas_saldo_calculado
// y GET /api/finanzas/vista-mensual). Se conserva y reorganiza el resto:
// obligaciones del mes destacadas arriba, previsiones/reservas/deudas en
// bloques plegables. Separación estricta por ámbito en todo momento — nunca
// un total que sume ámbitos entre sí.

interface CoberturaAmbito {
  id: number
  nombre: string
  color: string
  orden: number
  disponible: number
  saldo_incompleto: boolean
  cuentas_sin_apertura_n: number
  reservas_activas: number
  obligaciones_mes_total: number
  obligaciones_mes_count: number
  margen: number
  colchon_minimo: number
  semaforo: 'rojo' | 'ambar' | 'verde'
}

interface VistaMensualResponse {
  mes: string
  periodo: string
  ambitos: CoberturaAmbito[]
}

type EstadoInstancia = 'pendiente' | 'cubierta' | 'cancelada'

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

interface Prevision {
  id: number
  ambito_id: number
  cuenta_id: number | null
  tipo: 'ingreso' | 'gasto'
  estado: 'previsto' | 'realizado' | 'cancelado'
  concepto: string
  importe: string
  moneda: string
  fecha_estimada: string
  notas: string | null
  cuenta_nombre: string | null
}

interface Reserva {
  id: number
  cuenta_id: number
  ambito_id: number
  concepto: string
  estado: 'activa' | 'liberada' | 'usada' | 'cancelada'
  importe: string
  moneda: string
  notas: string | null
  cuenta_nombre: string
}

interface Deuda {
  id: number
  ambito_id: number
  contraparte: string
  direccion: 'debo' | 'me_deben'
  estado: 'pendiente' | 'pagada' | 'cobrada' | 'cancelada'
  importe: string
  moneda: string
  fecha_vencimiento: string | null
  notas: string | null
}

interface CuentaOpcion {
  id: number
  nombre: string
  ambito_id: number
}

const smallBtn: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 'var(--text-xs)',
  color: '#A09070',
  background: 'transparent',
  border: '1px solid rgba(200,168,64,0.2)',
  padding: '4px 10px',
  cursor: 'pointer',
  letterSpacing: '0.04em'
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 'var(--text-base)',
  color: '#E8DCC8',
  background: '#0D0A06',
  border: '1px solid rgba(200,168,64,0.2)',
  padding: '6px 8px',
  outline: 'none'
}

const SEMAFORO_COLOR: Record<CoberturaAmbito['semaforo'], string> = { rojo: '#f87171', ambar: '#facc15', verde: '#4ade80' }
const SEMAFORO_LABEL: Record<CoberturaAmbito['semaforo'], string> = { rojo: 'NO CUBRE', ambar: 'AJUSTADO', verde: 'CUBIERTO' }
const ESTADO_INSTANCIA_LABEL: Record<EstadoInstancia, string> = { pendiente: 'Pendiente', cubierta: 'Cubierta', cancelada: 'Cancelada' }

function eur(v: string | number | null): string {
  if (v === null) return '—'
  const n = typeof v === 'number' ? v : Number(v)
  if (Number.isNaN(n)) return '—'
  return `${formatSaldo(n)} €`
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number)
  const total = m - 1 + delta
  const year = y + Math.floor(total / 12)
  const month = ((total % 12) + 12) % 12
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function formatMesEs(mes: string): string {
  const d = new Date(`${mes}-01T00:00:00Z`)
  const s = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// Solo aplica a instancias pendientes — cubierta/cancelada tienen su color
// neutro propio, no un semáforo de urgencia.
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

// La frase pedida: "Obligaciones del mes: 262€. Disponible: 1.400€.
// Cubierto, queda 1.138€." — la cifra (margen) siempre acompaña al color,
// nunca solo el semáforo.
function mensajeCobertura(a: CoberturaAmbito): string {
  const base = `Obligaciones del mes: ${eur(a.obligaciones_mes_total)}. Disponible: ${eur(a.disponible)}.`
  if (a.semaforo === 'rojo') return `${base} NO cubres — faltan ${eur(Math.abs(a.margen))}.`
  if (a.semaforo === 'ambar') return `${base} Cubierto, pero con poco margen — quedan ${eur(a.margen)} (colchón mínimo: ${eur(a.colchon_minimo)}).`
  return `${base} Cubierto, queda ${eur(a.margen)}.`
}

export function VistaMensualView({ ambitos }: { ambitos: Ambito[] }) {
  const [mes, setMes] = useState(currentMonth())
  const periodo = `${mes}-01`

  const [cobertura, setCobertura] = useState<CoberturaAmbito[]>([])
  const [loadingCobertura, setLoadingCobertura] = useState(true)
  const [coberturaError, setCoberturaError] = useState<string | null>(null)

  const [instancias, setInstancias] = useState<Instancia[]>([])
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [loadingObligaciones, setLoadingObligaciones] = useState(true)
  const [descartadas, setDescartadas] = useState<Set<number>>(new Set())

  const [cuentas, setCuentas] = useState<CuentaOpcion[]>([])
  const [previsiones, setPrevisiones] = useState<Prevision[]>([])
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [deudas, setDeudas] = useState<Deuda[]>([])
  const [loadingListas, setLoadingListas] = useState(true)

  const fetchCobertura = useCallback(async (m: string) => {
    setLoadingCobertura(true)
    setCoberturaError(null)
    try {
      const res = await fetch(`/api/finanzas/vista-mensual?mes=${m}`, { credentials: 'include' })
      const data: VistaMensualResponse | { error: string } = await res.json()
      if (!res.ok) {
        setCoberturaError('error' in data ? data.error : 'Error al cargar la cobertura del mes')
        setCobertura([])
        return
      }
      setCobertura('ambitos' in data ? data.ambitos : [])
    } catch {
      setCoberturaError('Error de red al cargar la cobertura del mes')
    } finally {
      setLoadingCobertura(false)
    }
  }, [])

  const fetchObligacionesMes = useCallback(async (p: string) => {
    setLoadingObligaciones(true)
    try {
      const [instRes, sugRes] = await Promise.all([
        fetch(`/api/finanzas/obligaciones/instancias?periodo=${p}`, { credentials: 'include' }),
        fetch(`/api/finanzas/obligaciones/sugerencias?periodo=${p}`, { credentials: 'include' })
      ])
      setInstancias((await instRes.json()).instancias ?? [])
      setSugerencias((await sugRes.json()).sugerencias ?? [])
      setDescartadas(new Set())
    } catch {
      // keep stale
    } finally {
      setLoadingObligaciones(false)
    }
  }, [])

  const fetchListas = useCallback(async () => {
    setLoadingListas(true)
    try {
      const [cRes, pRes, rRes, dRes] = await Promise.all([
        fetch('/api/finanzas/cuentas', { credentials: 'include' }),
        fetch('/api/finanzas/previsiones?estado=previsto', { credentials: 'include' }),
        fetch('/api/finanzas/reservas?estado=activa', { credentials: 'include' }),
        fetch('/api/finanzas/deudas?estado=pendiente', { credentials: 'include' })
      ])
      setCuentas(((await cRes.json()).cuentas ?? []).map((c: { id: number; nombre: string; ambito_id: number }) => ({ id: c.id, nombre: c.nombre, ambito_id: c.ambito_id })))
      setPrevisiones((await pRes.json()).previsiones ?? [])
      setReservas((await rRes.json()).reservas ?? [])
      setDeudas((await dRes.json()).deudas ?? [])
    } catch {
      // keep stale
    } finally {
      setLoadingListas(false)
    }
  }, [])

  useEffect(() => { fetchCobertura(mes) }, [mes, fetchCobertura])
  useEffect(() => { fetchObligacionesMes(periodo) }, [periodo, fetchObligacionesMes])
  useEffect(() => { fetchListas() }, [fetchListas])

  async function confirmarCandidato(instanciaId: number, movimientoId: number) {
    try {
      const res = await fetch(`/api/finanzas/obligaciones/instancias/${instanciaId}/cubrir`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movimiento_id: movimientoId })
      })
      if (res.ok) {
        await fetchObligacionesMes(periodo)
        await fetchCobertura(mes)
      } else {
        const data = await res.json().catch(() => ({}))
        window.alert(data.error ?? 'No se pudo confirmar')
      }
    } catch {
      window.alert('Error de red')
    }
  }

  function descartarCandidato(instanciaId: number, movimientoId: number) {
    setDescartadas((prev) => new Set(prev).add(instanciaId * 1_000_000 + movimientoId))
  }

  const instanciasPorAmbito = ambitos.map((amb) => ({ ambito: amb, instancias: instancias.filter((i) => i.ambito_id === amb.id) }))
  const sugerenciasPorInstancia = new Map(sugerencias.map((s) => [s.instancia_id, s]))

  // Previsiones se filtran por mes (tienen fecha); reservas y deudas son
  // vigentes — no dependen de qué mes esté seleccionado.
  const inicioMes = periodo
  const finMes = `${shiftMonth(mes, 1)}-01`
  const previsionesDelMes = previsiones.filter((p) => p.fecha_estimada >= inicioMes && p.fecha_estimada < finMes)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Cabecera de mes */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setMes((m) => shiftMonth(m, -1))} style={smallBtn}>← Mes anterior</button>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-lg)', color: '#C8A840', padding: '0 8px', letterSpacing: '0.04em' }}>
            {formatMesEs(mes)}
          </div>
          <button onClick={() => setMes((m) => shiftMonth(m, 1))} style={smallBtn}>Mes siguiente →</button>
        </div>
        <button onClick={() => setMes(currentMonth())} style={smallBtn}>Este mes</button>
      </div>

      {/* 1. Resumen de cobertura — por ámbito, separados */}
      <ResumenCobertura data={cobertura} loading={loadingCobertura} error={coberturaError} onColchonSaved={() => fetchCobertura(mes)} />

      {/* 2. Obligaciones del mes — destacado, no plegable */}
      <ObligacionesDelMes
        grupos={instanciasPorAmbito}
        loading={loadingObligaciones}
        sugerenciasPorInstancia={sugerenciasPorInstancia}
        descartadas={descartadas}
        onConfirmar={confirmarCandidato}
        onDescartar={descartarCandidato}
      />

      {/* 3. Bloques plegables */}
      <Accordion title="PREVISIONES DEL MES" subtitle={`${previsionesDelMes.length} en ${formatMesEs(mes)}`}>
        <PrevisionesBlock
          ambitos={ambitos}
          cuentas={cuentas}
          previsiones={previsionesDelMes}
          mesDefecto={periodo}
          loading={loadingListas}
          onRefresh={fetchListas}
        />
      </Accordion>

      <Accordion title="RESERVAS" subtitle={`${reservas.length} vigentes`} badge="VIGENTES">
        <ReservasBlock ambitos={ambitos} cuentas={cuentas} reservas={reservas} loading={loadingListas} onRefresh={fetchListas} />
      </Accordion>

      <Accordion title="DEUDAS" subtitle={`${deudas.length} vigentes`} badge="VIGENTES">
        <DeudasBlock ambitos={ambitos} deudas={deudas} loading={loadingListas} onRefresh={fetchListas} />
      </Accordion>
    </div>
  )
}

function ResumenCobertura({
  data,
  loading,
  error,
  onColchonSaved
}: {
  data: CoberturaAmbito[]
  loading: boolean
  error: string | null
  onColchonSaved: () => void
}) {
  if (loading) {
    return <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)', color: 'var(--color-text-muted)' }}>Cargando cobertura...</div>
  }
  if (error) {
    return <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)', color: '#f87171' }}>{error}</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.1em' }}>
        RESUMEN DE COBERTURA — cada ámbito por separado, nunca sumados entre sí
      </div>
      {data.map((a) => {
        const semColor = SEMAFORO_COLOR[a.semaforo]
        return (
          <section
            key={a.id}
            style={{ background: '#13100A', border: `1px solid ${hexToRgba(a.color, 0.25)}`, borderLeft: `3px solid ${a.color}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-md)', color: '#E8DCC8', letterSpacing: '0.06em' }}>
                  {a.nombre.toUpperCase()}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 20, color: semColor }}>{eur(a.margen)}</span>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: semColor, boxShadow: `0 0 8px ${hexToRgba(semColor, 0.6)}`, flexShrink: 0 }} />
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: semColor, letterSpacing: '0.04em' }}>
                  {SEMAFORO_LABEL[a.semaforo]}
                </span>
              </div>
            </div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-md)', color: '#A09070' }}>
              {mensajeCobertura(a)}
            </div>
            <ColchonEditor ambitoId={a.id} colchonActual={a.colchon_minimo} onSaved={onColchonSaved} />
            {a.saldo_incompleto && (
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#facc15', border: '1px solid rgba(250,204,21,0.35)', padding: '5px 10px' }}>
                ⚠ Saldo incompleto: {a.cuentas_sin_apertura_n} cuenta{a.cuentas_sin_apertura_n !== 1 ? 's' : ''} sin saldo de apertura este año — el disponible NO {a.cuentas_sin_apertura_n !== 1 ? 'las' : 'la'} incluye.
              </div>
            )}
          </section>
        )
      })}
      {data.length === 0 && (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Sin ámbitos configurados.</div>
      )}
    </div>
  )
}

// Colchón mínimo de margen de seguridad (30d) de este ámbito — el umbral
// que separa AJUSTADO de CUBIERTO en el semáforo. Antes era una constante
// fija en el código; ahora vive en ambitos.colchon_minimo y se edita aquí,
// por ámbito, sin tocar código ni BD.
function ColchonEditor({ ambitoId, colchonActual, onSaved }: { ambitoId: number; colchonActual: number; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [valor, setValor] = useState(() => formatSaldo(colchonActual))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!editing) setValor(formatSaldo(colchonActual))
  }, [colchonActual, editing])

  async function guardar() {
    const num = parseEsNumber(valor)
    if (num === null || num < 0) {
      setError('Importe inválido')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/finanzas/ambitos/${ambitoId}/colchon`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colchon_minimo: num })
      })
      if (res.ok) {
        setEditing(false)
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

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>
          colchón mínimo: {eur(colchonActual)}
        </span>
        <button onClick={() => setEditing(true)} style={{ ...smallBtn, padding: '1px 8px' }}>Editar</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>colchón mínimo:</span>
      <input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="0,00"
        style={{ ...inputStyle, width: 100, fontSize: 'var(--text-xs)', padding: '3px 6px' }}
      />
      <button onClick={guardar} disabled={saving} style={{ ...smallBtn, padding: '1px 8px', color: '#C8A840', borderColor: 'rgba(200,168,64,0.35)' }}>
        {saving ? '...' : 'Guardar'}
      </button>
      <button
        onClick={() => { setEditing(false); setError(null); setValor(formatSaldo(colchonActual)) }}
        style={{ ...smallBtn, padding: '1px 8px' }}
      >
        Cancelar
      </button>
      {error && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: '#f87171' }}>{error}</span>}
    </div>
  )
}

function ObligacionesDelMes({
  grupos,
  loading,
  sugerenciasPorInstancia,
  descartadas,
  onConfirmar,
  onDescartar
}: {
  grupos: Array<{ ambito: Ambito; instancias: Instancia[] }>
  loading: boolean
  sugerenciasPorInstancia: Map<number, Sugerencia>
  descartadas: Set<number>
  onConfirmar: (instanciaId: number, movimientoId: number) => void
  onDescartar: (instanciaId: number, movimientoId: number) => void
}) {
  return (
    <section style={{ background: '#13100A', border: '1px solid rgba(200,168,64,0.25)' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(200,168,64,0.12)' }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: '#C8A840', letterSpacing: '0.12em' }}>
          OBLIGACIONES DEL MES
        </span>
      </div>
      {loading ? (
        <div style={{ padding: '16px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Cargando...</div>
      ) : (
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {grupos.every((g) => g.instancias.length === 0) && (
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', padding: '4px 4px' }}>
              Sin obligaciones este mes.
            </div>
          )}
          {grupos.map(({ ambito, instancias: insts }) => {
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
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>vence {formatDateEs(inst.fecha_vencimiento)}</span>
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: sem.color, border: `1px solid ${hexToRgba(sem.color, 0.4)}`, padding: '1px 6px' }}>
                              {ESTADO_INSTANCIA_LABEL[inst.estado]}{inst.estado === 'pendiente' && sem.label !== 'Pendiente' ? ` · ${sem.label}` : ''}
                            </span>
                          </div>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)', color: '#E8DCC8' }}>
                            {inst.estado === 'cubierta' ? eur(inst.importe_real) : eur(inst.importe_esperado)}
                          </span>
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
                                  <button onClick={() => onConfirmar(inst.id, cand.id)} style={{ ...smallBtn, color: '#4ade80', borderColor: 'rgba(74,222,128,0.35)' }}>Confirmar</button>
                                  <button onClick={() => onDescartar(inst.id, cand.id)} style={{ ...smallBtn, color: 'var(--color-text-muted)' }}>Descartar</button>
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
  )
}

function Accordion({ title, subtitle, badge, children }: { title: string; subtitle?: string; badge?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <section style={{ background: '#13100A', border: '1px solid rgba(200,168,64,0.15)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          padding: '10px 16px',
          background: 'transparent',
          border: 'none',
          borderBottom: open ? '1px solid rgba(200,168,64,0.1)' : 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          cursor: 'pointer',
          textAlign: 'left'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.12em' }}>
            {title}
          </span>
          {badge && (
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: '#A09070', border: '1px solid rgba(200,168,64,0.2)', padding: '1px 6px', letterSpacing: '0.06em' }}>
              {badge}
            </span>
          )}
          {subtitle && (
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>
              {subtitle}
            </span>
          )}
        </div>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
          {open ? '▾ ocultar' : '▸ mostrar'}
        </span>
      </button>
      {open && <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>}
    </section>
  )
}

function InfoButton({ title, body }: { title: string; body: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={title}
        aria-expanded={open}
        style={{
          width: 15,
          height: 15,
          borderRadius: '50%',
          border: `1px solid ${open ? '#C8A840' : 'rgba(200,168,64,0.3)'}`,
          background: open ? 'rgba(200,168,64,0.32)' : 'transparent',
          color: open ? '#C8A840' : 'var(--color-text-muted)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 'var(--text-2xs)',
          lineHeight: '13px',
          cursor: 'pointer',
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        i
      </button>

      {open && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            top: 20,
            left: 0,
            zIndex: 50,
            width: 300,
            maxWidth: '85vw',
            background: '#13100A',
            border: '1px solid rgba(200,168,64,0.3)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-base)', color: '#C8A840', letterSpacing: '0.04em' }}>
              {title}
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
              style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 'var(--text-md)', padding: 0, lineHeight: 1, flexShrink: 0 }}
            >
              ✕
            </button>
          </div>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: '#A09070', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
            {body}
          </span>
        </div>
      )}
    </div>
  )
}

function PrevisionesBlock({
  ambitos,
  cuentas,
  previsiones,
  mesDefecto,
  loading,
  onRefresh
}: {
  ambitos: Ambito[]
  cuentas: CuentaOpcion[]
  previsiones: Prevision[]
  mesDefecto: string
  loading: boolean
  onRefresh: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [ambitoId, setAmbitoId] = useState<number | ''>(ambitos[0]?.id ?? '')
  const [tipo, setTipo] = useState<'ingreso' | 'gasto'>('gasto')
  const [concepto, setConcepto] = useState('')
  const [importe, setImporte] = useState('')
  const [fecha, setFecha] = useState(mesDefecto)
  const [cuentaId, setCuentaId] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previsionesPorAmbito = ambitos.map((amb) => ({ ambito: amb, items: previsiones.filter((p) => p.ambito_id === amb.id) }))
  const cuentasDelAmbito = ambitoId === '' ? [] : cuentas.filter((c) => c.ambito_id === ambitoId)

  async function submit() {
    if (ambitoId === '' || !concepto.trim() || !fecha) {
      setError('Ámbito, concepto y fecha son obligatorios')
      return
    }
    const importeNum = parseEsNumber(importe)
    if (importeNum === null) {
      setError('Importe inválido')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/finanzas/previsiones', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ambito_id: ambitoId,
          cuenta_id: cuentaId === '' ? null : cuentaId,
          tipo,
          concepto: concepto.trim(),
          importe: importeNum,
          fecha_estimada: fecha
        })
      })
      if (res.ok) {
        setConcepto(''); setImporte(''); setCuentaId(''); setAdding(false)
        onRefresh()
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

  async function setEstado(id: number, estado: 'realizado' | 'cancelado') {
    await fetch(`/api/finanzas/previsiones/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado })
    })
    onRefresh()
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <InfoButton
          title="¿Qué es una previsión?"
          body={'Dinero que esperas que entre o salga, pero que todavía NO ha pasado por el banco.\n- Cobros previstos: lo que esperas recibir.\n- Pagos previstos: lo que sabes que pagarás.\nSe filtran por el mes seleccionado (tienen fecha estimada).'}
        />
        <button onClick={() => setAdding((v) => !v)} style={{ ...smallBtn, color: '#A09070' }}>+ Añadir</button>
      </div>

      {loading && <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Cargando...</div>}
      {!loading && previsiones.length === 0 && !adding && (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', padding: '8px 4px' }}>Sin previsiones este mes.</div>
      )}

      {previsionesPorAmbito.map(({ ambito, items }) => {
        if (items.length === 0) return null
        return (
          <div key={ambito.id} style={{ border: `1px solid ${hexToRgba(ambito.color, 0.15)}`, borderLeft: `3px solid ${ambito.color}`, padding: 10 }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-sm)', color: '#E8DCC8', letterSpacing: '0.04em', marginBottom: 8 }}>
              {ambito.nombre.toUpperCase()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', border: '1px solid rgba(200,168,64,0.06)', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: p.tipo === 'ingreso' ? '#4ade80' : '#f87171', border: `1px solid ${p.tipo === 'ingreso' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`, padding: '2px 6px' }}>
                      {p.tipo === 'ingreso' ? 'INGRESO' : 'GASTO'}
                    </span>
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-md)', color: '#E8DCC8' }}>{p.concepto}</span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{formatDateEs(p.fecha_estimada)}</span>
                    {p.cuenta_nombre && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>· {p.cuenta_nombre}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)', color: '#E8DCC8' }}>{eur(p.importe)}</span>
                    <button onClick={() => setEstado(p.id, 'realizado')} style={{ ...smallBtn, color: '#4ade80' }}>Realizado</button>
                    <button onClick={() => setEstado(p.id, 'cancelado')} style={{ ...smallBtn, color: '#f87171' }}>Cancelar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {adding && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 12px', background: 'rgba(200,168,64,0.03)' }}>
          <select value={ambitoId} onChange={(e) => { setAmbitoId(e.target.value ? Number(e.target.value) : ''); setCuentaId('') }} style={inputStyle}>
            {ambitos.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as 'ingreso' | 'gasto')} style={inputStyle}>
            <option value="gasto">Gasto</option>
            <option value="ingreso">Ingreso</option>
          </select>
          <input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Concepto" style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
          <input value={importe} onChange={(e) => setImporte(e.target.value)} placeholder="Importe" style={{ ...inputStyle, width: 100 }} />
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={inputStyle} />
          <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value ? Number(e.target.value) : '')} style={inputStyle}>
            <option value="">Sin cuenta asignada</option>
            {cuentasDelAmbito.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <button onClick={submit} disabled={saving} style={{ ...smallBtn, color: '#C8A840', borderColor: 'rgba(200,168,64,0.35)' }}>
            {saving ? '...' : 'Añadir'}
          </button>
          {error && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#f87171', alignSelf: 'center' }}>{error}</span>}
        </div>
      )}
    </>
  )
}

function ReservasBlock({
  ambitos,
  cuentas,
  reservas,
  loading,
  onRefresh
}: {
  ambitos: Ambito[]
  cuentas: CuentaOpcion[]
  reservas: Reserva[]
  loading: boolean
  onRefresh: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [concepto, setConcepto] = useState('')
  const [importe, setImporte] = useState('')
  const [cuentaId, setCuentaId] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reservasPorAmbito = ambitos.map((amb) => ({ ambito: amb, items: reservas.filter((r) => r.ambito_id === amb.id) }))

  async function submit() {
    if (!concepto.trim() || cuentaId === '') {
      setError('Cuenta y concepto son obligatorios')
      return
    }
    const importeNum = parseEsNumber(importe)
    if (importeNum === null) {
      setError('Importe inválido')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/finanzas/reservas', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuenta_id: cuentaId, concepto: concepto.trim(), importe: importeNum })
      })
      if (res.ok) {
        setConcepto(''); setImporte(''); setCuentaId(''); setAdding(false)
        onRefresh()
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

  async function setEstado(id: number, estado: 'liberada' | 'usada' | 'cancelada') {
    await fetch(`/api/finanzas/reservas/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado })
    })
    onRefresh()
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <InfoButton
          title="¿Qué es una reserva?"
          body={'Dinero que YA tienes en una cuenta, pero está apartado para algo y no lo consideras libre.\nVigentes: se muestran siempre, no dependen del mes seleccionado.'}
        />
        <button onClick={() => setAdding((v) => !v)} style={{ ...smallBtn, color: '#A09070' }}>+ Añadir</button>
      </div>

      {loading && <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Cargando...</div>}
      {!loading && reservas.length === 0 && !adding && (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', padding: '8px 4px' }}>Sin reservas vigentes.</div>
      )}

      {reservasPorAmbito.map(({ ambito, items }) => {
        if (items.length === 0) return null
        return (
          <div key={ambito.id} style={{ border: `1px solid ${hexToRgba(ambito.color, 0.15)}`, borderLeft: `3px solid ${ambito.color}`, padding: 10 }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-sm)', color: '#E8DCC8', letterSpacing: '0.04em', marginBottom: 8 }}>
              {ambito.nombre.toUpperCase()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((r) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', border: '1px solid rgba(200,168,64,0.06)', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-md)', color: '#E8DCC8' }}>{r.concepto}</span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>· {r.cuenta_nombre}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)', color: '#E8DCC8' }}>{eur(r.importe)}</span>
                    <button onClick={() => setEstado(r.id, 'liberada')} style={smallBtn}>Liberar</button>
                    <button onClick={() => setEstado(r.id, 'usada')} style={smallBtn}>Usar</button>
                    <button onClick={() => setEstado(r.id, 'cancelada')} style={{ ...smallBtn, color: '#f87171' }}>Cancelar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {adding && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 12px', background: 'rgba(200,168,64,0.03)' }}>
          <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value ? Number(e.target.value) : '')} style={inputStyle}>
            <option value="">Selecciona cuenta</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Concepto" style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
          <input value={importe} onChange={(e) => setImporte(e.target.value)} placeholder="Importe" style={{ ...inputStyle, width: 100 }} />
          <button onClick={submit} disabled={saving} style={{ ...smallBtn, color: '#C8A840', borderColor: 'rgba(200,168,64,0.35)' }}>
            {saving ? '...' : 'Añadir'}
          </button>
          {error && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#f87171', alignSelf: 'center' }}>{error}</span>}
        </div>
      )}
    </>
  )
}

function DeudasBlock({
  ambitos,
  deudas,
  loading,
  onRefresh
}: {
  ambitos: Ambito[]
  deudas: Deuda[]
  loading: boolean
  onRefresh: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [ambitoId, setAmbitoId] = useState<number | ''>(ambitos[0]?.id ?? '')
  const [contraparte, setContraparte] = useState('')
  const [direccion, setDireccion] = useState<'debo' | 'me_deben'>('debo')
  const [importe, setImporte] = useState('')
  const [vencimiento, setVencimiento] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const deudasPorAmbito = ambitos.map((amb) => ({ ambito: amb, items: deudas.filter((d) => d.ambito_id === amb.id) }))

  async function submit() {
    if (ambitoId === '' || !contraparte.trim()) {
      setError('Ámbito y contraparte son obligatorios')
      return
    }
    const importeNum = parseEsNumber(importe)
    if (importeNum === null) {
      setError('Importe inválido')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/finanzas/deudas', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ambito_id: ambitoId,
          contraparte: contraparte.trim(),
          direccion,
          importe: importeNum,
          fecha_vencimiento: vencimiento || null
        })
      })
      if (res.ok) {
        setContraparte(''); setImporte(''); setVencimiento(''); setAdding(false)
        onRefresh()
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

  async function setEstado(id: number, estado: 'pagada' | 'cobrada' | 'cancelada') {
    await fetch(`/api/finanzas/deudas/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado })
    })
    onRefresh()
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <InfoButton
          title="¿Qué es una deuda?"
          body={'Obligaciones o derechos de cobro que quieres controlar como deuda viva.\n- Me deben: alguien te debe dinero.\n- Debo: tú debes saldar algo.\nVigentes: se muestran siempre, no dependen del mes seleccionado.'}
        />
        <button onClick={() => setAdding((v) => !v)} style={{ ...smallBtn, color: '#A09070' }}>+ Añadir</button>
      </div>

      {loading && <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Cargando...</div>}
      {!loading && deudas.length === 0 && !adding && (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', padding: '8px 4px' }}>Sin deudas vigentes.</div>
      )}

      {deudasPorAmbito.map(({ ambito, items }) => {
        if (items.length === 0) return null
        return (
          <div key={ambito.id} style={{ border: `1px solid ${hexToRgba(ambito.color, 0.15)}`, borderLeft: `3px solid ${ambito.color}`, padding: 10 }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-sm)', color: '#E8DCC8', letterSpacing: '0.04em', marginBottom: 8 }}>
              {ambito.nombre.toUpperCase()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((d) => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', border: '1px solid rgba(200,168,64,0.06)', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: d.direccion === 'debo' ? '#f87171' : '#4ade80', border: `1px solid ${d.direccion === 'debo' ? 'rgba(248,113,113,0.3)' : 'rgba(74,222,128,0.3)'}`, padding: '2px 6px' }}>
                      {d.direccion === 'debo' ? 'DEBO' : 'ME DEBEN'}
                    </span>
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-md)', color: '#E8DCC8' }}>{d.contraparte}</span>
                    {d.fecha_vencimiento && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>vence {formatDateEs(d.fecha_vencimiento)}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)', color: '#E8DCC8' }}>{eur(d.importe)}</span>
                    <button onClick={() => setEstado(d.id, d.direccion === 'debo' ? 'pagada' : 'cobrada')} style={{ ...smallBtn, color: '#4ade80' }}>
                      {d.direccion === 'debo' ? 'Marcar pagada' : 'Marcar cobrada'}
                    </button>
                    <button onClick={() => setEstado(d.id, 'cancelada')} style={{ ...smallBtn, color: '#f87171' }}>Cancelar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {adding && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 12px', background: 'rgba(200,168,64,0.03)' }}>
          <select value={ambitoId} onChange={(e) => setAmbitoId(e.target.value ? Number(e.target.value) : '')} style={inputStyle}>
            {ambitos.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
          <select value={direccion} onChange={(e) => setDireccion(e.target.value as 'debo' | 'me_deben')} style={inputStyle}>
            <option value="debo">Debo</option>
            <option value="me_deben">Me deben</option>
          </select>
          <input value={contraparte} onChange={(e) => setContraparte(e.target.value)} placeholder="Contraparte" style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
          <input value={importe} onChange={(e) => setImporte(e.target.value)} placeholder="Importe" style={{ ...inputStyle, width: 100 }} />
          <input type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} style={inputStyle} />
          <button onClick={submit} disabled={saving} style={{ ...smallBtn, color: '#C8A840', borderColor: 'rgba(200,168,64,0.35)' }}>
            {saving ? '...' : 'Añadir'}
          </button>
          {error && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#f87171', alignSelf: 'center' }}>{error}</span>}
        </div>
      )}
    </>
  )
}
