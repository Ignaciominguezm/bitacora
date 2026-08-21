import { useState, useEffect, useCallback, useRef } from 'react'
import { type Ambito, hexToRgba, formatSaldo, mondayOf, addDaysStr, formatDateEs } from './shared'

interface RevisionCuenta {
  id: number
  nombre: string
  tipo: string
  entidad: string | null
  moneda: string
  saldo_id: number | null
  saldo: string | null
}

interface RevisionAmbitoGrupo {
  id: number
  nombre: string
  color: string
  orden: number
  cuentas: RevisionCuenta[]
}

interface Revision {
  id: number
  fecha: string
  estado: 'borrador' | 'revisada' | 'cerrada'
  notas: string | null
  created_at: string
  updated_at: string
}

interface RevisionResponse {
  semana: string
  revision: Revision | null
  ambitos: RevisionAmbitoGrupo[]
}

interface CompareCuenta {
  cuenta_id: number
  nombre: string
  moneda: string
  saldo_actual: number | null
  saldo_anterior: number | null
  delta: number | null
  delta_pct: number | null
}

interface CompareAmbito {
  id: number
  nombre: string
  color: string
  orden: number
  cuentas: CompareCuenta[]
  total_actual: number | null
  total_anterior: number | null
  delta_total: number | null
}

interface CompareResponse {
  semana: string
  semana_anterior: string
  sin_comparacion_previa: boolean
  ambitos: CompareAmbito[]
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

const ESTADOS_REVISION: Array<Revision['estado']> = ['borrador', 'revisada', 'cerrada']
const ESTADO_LABEL: Record<Revision['estado'], string> = { borrador: 'Borrador', revisada: 'Revisada', cerrada: 'Cerrada' }

const smallBtn: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 10,
  color: '#A09070',
  background: 'transparent',
  border: '1px solid rgba(200,168,64,0.2)',
  padding: '4px 10px',
  cursor: 'pointer',
  letterSpacing: '0.04em'
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 12,
  color: '#E8DCC8',
  background: '#0D0A06',
  border: '1px solid rgba(200,168,64,0.2)',
  padding: '6px 8px',
  outline: 'none'
}

function deltaColor(delta: number | null): string {
  if (delta === null || delta === 0) return '#5A4A30'
  return delta > 0 ? '#4ade80' : '#f87171'
}

function deltaLabel(delta: number | null): string {
  if (delta === null) return '—'
  const sign = delta > 0 ? '+' : ''
  return `${sign}${formatSaldo(delta)}`
}

export function RevisionSemanalView({ ambitos }: { ambitos: Ambito[] }) {
  const [semana, setSemana] = useState(() => mondayOf(new Date()))
  const [selectedAmbitoId, setSelectedAmbitoId] = useState<number | null>(ambitos[0]?.id ?? null)
  const [revisionData, setRevisionData] = useState<RevisionResponse | null>(null)
  const [compareData, setCompareData] = useState<CompareResponse | null>(null)
  const [loadingRevision, setLoadingRevision] = useState(true)
  const [saldoInputs, setSaldoInputs] = useState<Record<number, string>>({})
  const [savingSaldoId, setSavingSaldoId] = useState<number | null>(null)
  const [notas, setNotas] = useState('')
  const [savingNotas, setSavingNotas] = useState(false)

  const [previsiones, setPrevisiones] = useState<Prevision[]>([])
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [deudas, setDeudas] = useState<Deuda[]>([])
  const [loadingLists, setLoadingLists] = useState(false)

  useEffect(() => {
    if (selectedAmbitoId === null && ambitos.length > 0) setSelectedAmbitoId(ambitos[0].id)
  }, [ambitos, selectedAmbitoId])

  const fetchRevision = useCallback(async (wk: string) => {
    setLoadingRevision(true)
    try {
      const [revRes, cmpRes] = await Promise.all([
        fetch(`/api/finanzas/revision?semana=${wk}`, { credentials: 'include' }),
        fetch(`/api/finanzas/revision/comparar?semana=${wk}`, { credentials: 'include' })
      ])
      const revData: RevisionResponse = await revRes.json()
      const cmpData: CompareResponse = await cmpRes.json()
      setRevisionData(revData)
      setCompareData(cmpData)
      setNotas(revData.revision?.notas ?? '')

      const inputs: Record<number, string> = {}
      for (const amb of revData.ambitos ?? []) {
        for (const cta of amb.cuentas) {
          if (cta.saldo !== null) inputs[cta.id] = String(cta.saldo)
        }
      }
      setSaldoInputs(inputs)
    } catch {
      // keep stale
    } finally {
      setLoadingRevision(false)
    }
  }, [])

  useEffect(() => {
    fetchRevision(semana)
  }, [semana, fetchRevision])

  const fetchAmbitoLists = useCallback(async (ambitoId: number) => {
    setLoadingLists(true)
    try {
      const [pRes, rRes, dRes] = await Promise.all([
        fetch(`/api/finanzas/previsiones?ambito_id=${ambitoId}&estado=previsto`, { credentials: 'include' }),
        fetch(`/api/finanzas/reservas?ambito_id=${ambitoId}&estado=activa`, { credentials: 'include' }),
        fetch(`/api/finanzas/deudas?ambito_id=${ambitoId}&estado=pendiente`, { credentials: 'include' })
      ])
      setPrevisiones((await pRes.json()).previsiones ?? [])
      setReservas((await rRes.json()).reservas ?? [])
      setDeudas((await dRes.json()).deudas ?? [])
    } catch {
      // keep stale
    } finally {
      setLoadingLists(false)
    }
  }, [])

  useEffect(() => {
    if (selectedAmbitoId !== null) fetchAmbitoLists(selectedAmbitoId)
  }, [selectedAmbitoId, fetchAmbitoLists])

  async function ensureRevisionId(): Promise<number | null> {
    if (revisionData?.revision?.id) return revisionData.revision.id
    try {
      const res = await fetch('/api/finanzas/revision', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ semana })
      })
      if (!res.ok) return null
      const data = await res.json()
      setRevisionData((prev) => (prev ? { ...prev, revision: data.revision } : prev))
      return data.revision.id as number
    } catch {
      return null
    }
  }

  async function saveSaldo(cuentaId: number) {
    const raw = saldoInputs[cuentaId]
    const num = Number(raw)
    if (raw === undefined || raw.trim() === '' || Number.isNaN(num)) return
    setSavingSaldoId(cuentaId)
    try {
      const revId = await ensureRevisionId()
      if (!revId) return
      const res = await fetch(`/api/finanzas/revision/${revId}/saldo`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuenta_id: cuentaId, saldo: num })
      })
      if (res.ok) await fetchRevision(semana)
    } finally {
      setSavingSaldoId(null)
    }
  }

  async function saveNotas() {
    setSavingNotas(true)
    try {
      const revId = await ensureRevisionId()
      if (!revId) return
      await fetch(`/api/finanzas/revision/${revId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notas })
      })
      await fetchRevision(semana)
    } finally {
      setSavingNotas(false)
    }
  }

  async function changeEstado(nuevo: Revision['estado']) {
    const revId = await ensureRevisionId()
    if (!revId) return
    await fetch(`/api/finanzas/revision/${revId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: nuevo })
    })
    await fetchRevision(semana)
  }

  const selectedAmbito = revisionData?.ambitos.find((a) => a.id === selectedAmbitoId) ?? null
  const selectedCompare = compareData?.ambitos.find((a) => a.id === selectedAmbitoId) ?? null
  const ambitoInfo = ambitos.find((a) => a.id === selectedAmbitoId) ?? null
  const estado = revisionData?.revision?.estado ?? 'borrador'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Week header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setSemana((s) => addDaysStr(s, -7))} style={smallBtn}>← Semana anterior</button>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#C8A840', padding: '0 8px' }}>
            {formatDateEs(semana)} — {formatDateEs(addDaysStr(semana, 6))}
          </div>
          <button onClick={() => setSemana((s) => addDaysStr(s, 7))} style={smallBtn}>Semana siguiente →</button>
        </div>
        <button onClick={() => setSemana(mondayOf(new Date()))} style={smallBtn}>Esta semana</button>
      </div>

      {/* Ambito tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {ambitos.map((a) => {
          const active = a.id === selectedAmbitoId
          return (
            <button
              key={a.id}
              onClick={() => setSelectedAmbitoId(a.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: 'Cinzel, serif',
                fontSize: 12,
                letterSpacing: '0.06em',
                color: active ? '#E8DCC8' : '#5A4A30',
                background: active ? hexToRgba(a.color, 0.12) : 'transparent',
                border: `1px solid ${active ? hexToRgba(a.color, 0.4) : 'rgba(200,168,64,0.15)'}`,
                padding: '8px 16px',
                cursor: 'pointer'
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
              {a.nombre.toUpperCase()}
            </button>
          )
        })}
      </div>

      {loadingRevision ? (
        <div style={{ color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>Cargando...</div>
      ) : selectedAmbito && ambitoInfo ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <SaldosBlock
            ambito={ambitoInfo}
            cuentas={selectedAmbito.cuentas}
            compareCuentas={selectedCompare?.cuentas ?? []}
            saldoInputs={saldoInputs}
            onInputChange={(id, v) => setSaldoInputs((prev) => ({ ...prev, [id]: v }))}
            onSave={saveSaldo}
            savingId={savingSaldoId}
          />

          <PrevisionesBlock
            ambito={ambitoInfo}
            cuentas={selectedAmbito.cuentas}
            previsiones={previsiones}
            loading={loadingLists}
            onRefresh={() => selectedAmbitoId !== null && fetchAmbitoLists(selectedAmbitoId)}
          />

          <ReservasBlock
            ambito={ambitoInfo}
            cuentas={selectedAmbito.cuentas}
            reservas={reservas}
            loading={loadingLists}
            onRefresh={() => selectedAmbitoId !== null && fetchAmbitoLists(selectedAmbitoId)}
          />

          <DeudasBlock
            ambito={ambitoInfo}
            deudas={deudas}
            loading={loadingLists}
            onRefresh={() => selectedAmbitoId !== null && fetchAmbitoLists(selectedAmbitoId)}
          />

          <NotasEstadoBlock
            ambito={ambitoInfo}
            notas={notas}
            onNotasChange={setNotas}
            onSaveNotas={saveNotas}
            savingNotas={savingNotas}
            estado={estado}
            onChangeEstado={changeEstado}
          />
        </div>
      ) : (
        <div style={{ color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
          Elige un ámbito para trabajar en él.
        </div>
      )}

      <ResumenComparacion compareData={compareData} />
    </div>
  )
}

function SaldosBlock({
  ambito,
  cuentas,
  compareCuentas,
  saldoInputs,
  onInputChange,
  onSave,
  savingId
}: {
  ambito: Ambito
  cuentas: RevisionCuenta[]
  compareCuentas: CompareCuenta[]
  saldoInputs: Record<number, string>
  onInputChange: (id: number, v: string) => void
  onSave: (id: number) => void
  savingId: number | null
}) {
  return (
    <Section title="SALDOS DE LA SEMANA" color={ambito.color}>
      {cuentas.length === 0 && (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#5A4A30', padding: '8px 4px' }}>
          Este ámbito no tiene cuentas activas todavía.
        </div>
      )}
      {cuentas.map((cta) => {
        const cmp = compareCuentas.find((c) => c.cuenta_id === cta.id)
        return (
          <div
            key={cta.id}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', border: '1px solid rgba(200,168,64,0.08)', gap: 12, flexWrap: 'wrap' }}
          >
            <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#E8DCC8', minWidth: 140 }}>{cta.nombre}</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A4A30' }}>
                Semana anterior:{' '}
                <span style={{ color: '#7A6A50' }}>
                  {cmp?.saldo_anterior !== null && cmp?.saldo_anterior !== undefined ? `${formatSaldo(cmp.saldo_anterior)} ${cta.moneda}` : '—'}
                </span>
              </div>
              {cmp && cmp.delta !== null && (
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: deltaColor(cmp.delta) }}>
                  {deltaLabel(cmp.delta)}
                </span>
              )}
              <input
                value={saldoInputs[cta.id] ?? ''}
                onChange={(e) => onInputChange(cta.id, e.target.value)}
                placeholder="0.00"
                style={{ ...inputStyle, width: 110, textAlign: 'right' }}
              />
              <button
                onClick={() => onSave(cta.id)}
                disabled={savingId === cta.id}
                style={{ ...smallBtn, color: '#C8A840', borderColor: 'rgba(200,168,64,0.35)', opacity: savingId === cta.id ? 0.5 : 1 }}
              >
                {savingId === cta.id ? '...' : 'Guardar'}
              </button>
            </div>
          </div>
        )
      })}
    </Section>
  )
}

function PrevisionesBlock({
  ambito,
  cuentas,
  previsiones,
  loading,
  onRefresh
}: {
  ambito: Ambito
  cuentas: RevisionCuenta[]
  previsiones: Prevision[]
  loading: boolean
  onRefresh: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [tipo, setTipo] = useState<'ingreso' | 'gasto'>('gasto')
  const [concepto, setConcepto] = useState('')
  const [importe, setImporte] = useState('')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [cuentaId, setCuentaId] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!concepto.trim() || !importe || Number.isNaN(Number(importe)) || !fecha) return
    setSaving(true)
    try {
      const res = await fetch('/api/finanzas/previsiones', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ambito_id: ambito.id,
          cuenta_id: cuentaId === '' ? null : cuentaId,
          tipo,
          concepto: concepto.trim(),
          importe: Number(importe),
          fecha_estimada: fecha
        })
      })
      if (res.ok) {
        setConcepto(''); setImporte(''); setCuentaId(''); setAdding(false)
        onRefresh()
      }
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
    <Section
      title="PREVISIONES VIGENTES"
      color={ambito.color}
      onAdd={() => setAdding((v) => !v)}
      info={{
        title: '¿Qué es una previsión?',
        body: 'Dinero que esperas que entre o salga, pero que todavía NO ha pasado por el banco.\n- Cobros previstos: lo que esperas recibir (cobro del autónomo, factura de un cliente, ingreso de una formación).\n- Pagos previstos: lo que sabes que pagarás (cuota de autónomo, gestoría, hosting, hipoteca, proveedor).\nLa clave: aún no ha entrado ni salido, pero quieres verlo venir.'
      }}
    >
      {loading && <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#5A4A30' }}>Cargando...</div>}
      {!loading && previsiones.length === 0 && !adding && (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#5A4A30', padding: '8px 4px' }}>Sin previsiones vigentes.</div>
      )}
      {previsiones.map((p) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', border: '1px solid rgba(200,168,64,0.08)', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: p.tipo === 'ingreso' ? '#4ade80' : '#f87171', border: `1px solid ${p.tipo === 'ingreso' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`, padding: '2px 6px' }}>
              {p.tipo === 'ingreso' ? 'INGRESO' : 'GASTO'}
            </span>
            <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#E8DCC8' }}>{p.concepto}</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A4A30' }}>{formatDateEs(p.fecha_estimada)}</span>
            {p.cuenta_nombre && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A4A30' }}>· {p.cuenta_nombre}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#E8DCC8' }}>{formatSaldo(p.importe)} {p.moneda}</span>
            <button onClick={() => setEstado(p.id, 'realizado')} style={{ ...smallBtn, color: '#4ade80' }}>Realizado</button>
            <button onClick={() => setEstado(p.id, 'cancelado')} style={{ ...smallBtn, color: '#f87171' }}>Cancelar</button>
          </div>
        </div>
      ))}

      {adding && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 12px', background: 'rgba(200,168,64,0.03)' }}>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as 'ingreso' | 'gasto')} style={inputStyle}>
            <option value="gasto">Gasto</option>
            <option value="ingreso">Ingreso</option>
          </select>
          <input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Concepto" style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
          <input value={importe} onChange={(e) => setImporte(e.target.value)} placeholder="Importe" style={{ ...inputStyle, width: 100 }} />
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={inputStyle} />
          <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value ? Number(e.target.value) : '')} style={inputStyle}>
            <option value="">Sin cuenta asignada</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <button onClick={submit} disabled={saving} style={{ ...smallBtn, color: '#C8A840', borderColor: 'rgba(200,168,64,0.35)' }}>
            {saving ? '...' : 'Añadir'}
          </button>
        </div>
      )}
    </Section>
  )
}

function ReservasBlock({
  ambito,
  cuentas,
  reservas,
  loading,
  onRefresh
}: {
  ambito: Ambito
  cuentas: RevisionCuenta[]
  reservas: Reserva[]
  loading: boolean
  onRefresh: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [concepto, setConcepto] = useState('')
  const [importe, setImporte] = useState('')
  const [cuentaId, setCuentaId] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!concepto.trim() || !importe || Number.isNaN(Number(importe)) || cuentaId === '') return
    setSaving(true)
    try {
      const res = await fetch('/api/finanzas/reservas', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuenta_id: cuentaId, concepto: concepto.trim(), importe: Number(importe) })
      })
      if (res.ok) {
        setConcepto(''); setImporte(''); setCuentaId(''); setAdding(false)
        onRefresh()
      }
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
    <Section
      title="RESERVAS ACTIVAS"
      color={ambito.color}
      onAdd={() => setAdding((v) => !v)}
      info={{
        title: '¿Qué es una reserva?',
        body: 'Dinero que YA tienes en una cuenta, pero que está apartado para algo y no consideras libre.\nEjemplos: 600€ para impuestos, 300€ para devolver a alguien, 1.000€ de colchón, dinero apartado para una factura concreta.\nLa clave: el dinero ya existe, pero está comprometido. (Distinto de una previsión: la previsión es dinero que esperas; la reserva es dinero que ya tienes pero no puedes gastar alegremente.)'
      }}
    >
      {loading && <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#5A4A30' }}>Cargando...</div>}
      {!loading && reservas.length === 0 && !adding && (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#5A4A30', padding: '8px 4px' }}>Sin reservas activas.</div>
      )}
      {reservas.map((r) => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', border: '1px solid rgba(200,168,64,0.08)', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#E8DCC8' }}>{r.concepto}</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A4A30' }}>· {r.cuenta_nombre}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#E8DCC8' }}>{formatSaldo(r.importe)} {r.moneda}</span>
            <button onClick={() => setEstado(r.id, 'liberada')} style={smallBtn}>Liberar</button>
            <button onClick={() => setEstado(r.id, 'usada')} style={smallBtn}>Usar</button>
            <button onClick={() => setEstado(r.id, 'cancelada')} style={{ ...smallBtn, color: '#f87171' }}>Cancelar</button>
          </div>
        </div>
      ))}

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
        </div>
      )}
    </Section>
  )
}

function DeudasBlock({
  ambito,
  deudas,
  loading,
  onRefresh
}: {
  ambito: Ambito
  deudas: Deuda[]
  loading: boolean
  onRefresh: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [contraparte, setContraparte] = useState('')
  const [direccion, setDireccion] = useState<'debo' | 'me_deben'>('debo')
  const [importe, setImporte] = useState('')
  const [vencimiento, setVencimiento] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!contraparte.trim() || !importe || Number.isNaN(Number(importe))) return
    setSaving(true)
    try {
      const res = await fetch('/api/finanzas/deudas', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ambito_id: ambito.id,
          contraparte: contraparte.trim(),
          direccion,
          importe: Number(importe),
          fecha_vencimiento: vencimiento || null
        })
      })
      if (res.ok) {
        setContraparte(''); setImporte(''); setVencimiento(''); setAdding(false)
        onRefresh()
      }
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
    <Section
      title="DEUDAS PENDIENTES"
      color={ambito.color}
      onAdd={() => setAdding((v) => !v)}
      info={{
        title: '¿Qué es una deuda?',
        body: 'Obligaciones o derechos de cobro que quieres controlar como deuda viva.\n- Me deben: alguien te debe dinero (una factura ya vencida).\n- Debo: tú debes saldar algo (a una persona, a un proveedor).\nLa clave: la deuda tiene peso de obligación/seguimiento. Una previsión es algo esperado; una deuda es algo que ya consideras pendiente de saldar.\nEjemplo: "me pagará la factura el día 5" es previsión; "me debe una factura ya vencida" es deuda.'
      }}
    >
      {loading && <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#5A4A30' }}>Cargando...</div>}
      {!loading && deudas.length === 0 && !adding && (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#5A4A30', padding: '8px 4px' }}>Sin deudas pendientes.</div>
      )}
      {deudas.map((d) => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', border: '1px solid rgba(200,168,64,0.08)', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: d.direccion === 'debo' ? '#f87171' : '#4ade80', border: `1px solid ${d.direccion === 'debo' ? 'rgba(248,113,113,0.3)' : 'rgba(74,222,128,0.3)'}`, padding: '2px 6px' }}>
              {d.direccion === 'debo' ? 'DEBO' : 'ME DEBEN'}
            </span>
            <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#E8DCC8' }}>{d.contraparte}</span>
            {d.fecha_vencimiento && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A4A30' }}>vence {formatDateEs(d.fecha_vencimiento)}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#E8DCC8' }}>{formatSaldo(d.importe)} {d.moneda}</span>
            <button onClick={() => setEstado(d.id, d.direccion === 'debo' ? 'pagada' : 'cobrada')} style={{ ...smallBtn, color: '#4ade80' }}>
              {d.direccion === 'debo' ? 'Marcar pagada' : 'Marcar cobrada'}
            </button>
            <button onClick={() => setEstado(d.id, 'cancelada')} style={{ ...smallBtn, color: '#f87171' }}>Cancelar</button>
          </div>
        </div>
      ))}

      {adding && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 12px', background: 'rgba(200,168,64,0.03)' }}>
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
        </div>
      )}
    </Section>
  )
}

function NotasEstadoBlock({
  ambito,
  notas,
  onNotasChange,
  onSaveNotas,
  savingNotas,
  estado,
  onChangeEstado
}: {
  ambito: Ambito
  notas: string
  onNotasChange: (v: string) => void
  onSaveNotas: () => void
  savingNotas: boolean
  estado: Revision['estado']
  onChangeEstado: (e: Revision['estado']) => void
}) {
  return (
    <Section title="NOTAS Y ESTADO DE LA REVISIÓN" color={ambito.color}>
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <textarea
          value={notas}
          onChange={(e) => onNotasChange(e.target.value)}
          onBlur={onSaveNotas}
          placeholder="Notas de esta revisión semanal..."
          rows={3}
          style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'JetBrains Mono, monospace' }}
        />
        {savingNotas && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A4A30' }}>Guardando notas...</span>}

        <div style={{ display: 'flex', gap: 0, marginTop: 4 }}>
          {ESTADOS_REVISION.map((e, i) => (
            <button
              key={e}
              onClick={() => onChangeEstado(e)}
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 11,
                padding: '6px 16px',
                cursor: 'pointer',
                color: estado === e ? '#C8A840' : '#5A4A30',
                background: estado === e ? 'rgba(200,168,64,0.15)' : 'transparent',
                border: estado === e ? '1px solid rgba(200,168,64,0.4)' : '1px solid rgba(200,168,64,0.12)',
                borderRadius: i === 0 ? '3px 0 0 3px' : i === ESTADOS_REVISION.length - 1 ? '0 3px 3px 0' : 0,
                marginLeft: i === 0 ? 0 : -1
              }}
            >
              {ESTADO_LABEL[e]}
            </button>
          ))}
        </div>
      </div>
    </Section>
  )
}

function ResumenComparacion({ compareData }: { compareData: CompareResponse | null }) {
  if (!compareData) return null

  return (
    <section>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#5A4A30', letterSpacing: '0.12em', marginBottom: 4 }}>
        RESUMEN — INFORMATIVO
      </div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A4A30', marginBottom: 12 }}>
        Cada ámbito es independiente. Estos totales NUNCA se suman entre sí.
        {compareData.sin_comparacion_previa && ' Sin comparación previa disponible para la semana anterior.'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {compareData.ambitos.map((a) => (
          <div key={a.id} style={{ background: '#13100A', border: `1px solid ${hexToRgba(a.color, 0.2)}`, borderLeft: `3px solid ${a.color}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: 11, color: '#E8DCC8', letterSpacing: '0.06em' }}>{a.nombre.toUpperCase()}</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 16, color: '#C8A840' }}>
              {a.total_actual !== null ? formatSaldo(a.total_actual) : '—'}
            </span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A4A30' }}>
              Semana anterior: {a.total_anterior !== null ? formatSaldo(a.total_anterior) : '—'}
            </span>
            {a.delta_total !== null && (
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: deltaColor(a.delta_total) }}>
                {deltaLabel(a.delta_total)}
              </span>
            )}
          </div>
        ))}
      </div>
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
          border: `1px solid ${open ? 'rgba(200,168,64,0.6)' : 'rgba(200,168,64,0.3)'}`,
          background: open ? 'rgba(200,168,64,0.15)' : 'transparent',
          color: open ? '#C8A840' : '#7A6A50',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9,
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
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: 12, color: '#C8A840', letterSpacing: '0.04em' }}>
              {title}
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
              style={{ background: 'transparent', border: 'none', color: '#5A4A30', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1, flexShrink: 0 }}
            >
              ✕
            </button>
          </div>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#A09070', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
            {body}
          </span>
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  color,
  onAdd,
  info,
  children
}: {
  title: string
  color: string
  onAdd?: () => void
  info?: { title: string; body: string }
  children: React.ReactNode
}) {
  return (
    <section style={{ background: '#13100A', border: `1px solid ${hexToRgba(color, 0.2)}` }}>
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${hexToRgba(color, 0.1)}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#5A4A30', letterSpacing: '0.12em' }}>{title}</span>
          {info && <InfoButton title={info.title} body={info.body} />}
        </div>
        {onAdd && (
          <button onClick={onAdd} style={{ ...smallBtn, color: '#A09070' }}>+ Añadir</button>
        )}
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </section>
  )
}
