import { useState, useEffect, useCallback, useRef } from 'react'
import { type Ambito, hexToRgba, formatSaldo, parseEsNumber, mondayOf, addDaysStr, formatDateEs } from './shared'

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

function deltaColor(delta: number | null): string {
  if (delta === null || delta === 0) return 'var(--color-text-muted)'
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
  const [saldoErrors, setSaldoErrors] = useState<Record<number, string | null>>({})
  const [notas, setNotas] = useState('')
  const [savingNotas, setSavingNotas] = useState(false)
  const [notasError, setNotasError] = useState<string | null>(null)
  const [estadoError, setEstadoError] = useState<string | null>(null)

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
      // Respuestas de error (p.ej. 503 sin FINANZAS_DB_URL) no traen
      // `ambitos` — sin este fallback, los .find()/.map() de más abajo
      // revientan el componente entero en vez de degradar a "sin datos".
      setRevisionData({ ...revData, ambitos: revData.ambitos ?? [] })
      setCompareData({ ...cmpData, ambitos: cmpData.ambitos ?? [] })
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

  // Crea la revisión de la semana si aún no existe (revisiones nuevas no
  // tienen id todavía) y devuelve su id, o un mensaje de error si algo
  // falla — nunca null en silencio, para que el llamante pueda mostrarlo.
  async function ensureRevisionId(): Promise<{ id: number } | { error: string }> {
    if (revisionData?.revision?.id) return { id: revisionData.revision.id }
    try {
      const res = await fetch('/api/finanzas/revision', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ semana })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return { error: data.error ?? 'No se pudo crear la revisión de esta semana' }
      setRevisionData((prev) => (prev ? { ...prev, revision: data.revision } : prev))
      return { id: data.revision.id as number }
    } catch {
      return { error: 'Error de red al crear la revisión' }
    }
  }

  async function saveSaldo(cuentaId: number) {
    const raw = saldoInputs[cuentaId] ?? ''
    const num = parseEsNumber(raw)
    if (num === null) {
      setSaldoErrors((prev) => ({ ...prev, [cuentaId]: 'Importe inválido' }))
      return
    }
    setSaldoErrors((prev) => ({ ...prev, [cuentaId]: null }))
    setSavingSaldoId(cuentaId)
    try {
      const rev = await ensureRevisionId()
      if ('error' in rev) {
        setSaldoErrors((prev) => ({ ...prev, [cuentaId]: rev.error }))
        return
      }
      const res = await fetch(`/api/finanzas/revision/${rev.id}/saldo`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuenta_id: cuentaId, saldo: num })
      })
      if (res.ok) {
        await fetchRevision(semana)
      } else {
        const data = await res.json().catch(() => ({}))
        setSaldoErrors((prev) => ({ ...prev, [cuentaId]: data.error ?? 'Error al guardar el saldo' }))
      }
    } catch {
      setSaldoErrors((prev) => ({ ...prev, [cuentaId]: 'Error de red al guardar' }))
    } finally {
      setSavingSaldoId(null)
    }
  }

  async function saveNotas() {
    setSavingNotas(true)
    setNotasError(null)
    try {
      const rev = await ensureRevisionId()
      if ('error' in rev) {
        setNotasError(rev.error)
        return
      }
      const res = await fetch(`/api/finanzas/revision/${rev.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notas })
      })
      if (res.ok) {
        await fetchRevision(semana)
      } else {
        const data = await res.json().catch(() => ({}))
        setNotasError(data.error ?? 'Error al guardar las notas')
      }
    } catch {
      setNotasError('Error de red al guardar')
    } finally {
      setSavingNotas(false)
    }
  }

  async function changeEstado(nuevo: Revision['estado']) {
    setEstadoError(null)
    const rev = await ensureRevisionId()
    if ('error' in rev) {
      setEstadoError(rev.error)
      return
    }
    try {
      const res = await fetch(`/api/finanzas/revision/${rev.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevo })
      })
      if (res.ok) {
        await fetchRevision(semana)
      } else {
        const data = await res.json().catch(() => ({}))
        setEstadoError(data.error ?? 'Error al cambiar el estado')
      }
    } catch {
      setEstadoError('Error de red al guardar')
    }
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
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)', color: '#C8A840', padding: '0 8px' }}>
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
                fontSize: 'var(--text-base)',
                letterSpacing: '0.06em',
                color: active ? '#E8DCC8' : 'var(--color-text-muted)',
                background: active ? hexToRgba(a.color, 0.32) : 'transparent',
                border: `1px solid ${active ? a.color : 'rgba(200,168,64,0.15)'}`,
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
        <div style={{ color: 'var(--color-text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)' }}>Cargando...</div>
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
            errors={saldoErrors}
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
            notasError={notasError}
            estado={estado}
            onChangeEstado={changeEstado}
            estadoError={estadoError}
          />
        </div>
      ) : (
        <div style={{ color: 'var(--color-text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)' }}>
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
  savingId,
  errors
}: {
  ambito: Ambito
  cuentas: RevisionCuenta[]
  compareCuentas: CompareCuenta[]
  saldoInputs: Record<number, string>
  onInputChange: (id: number, v: string) => void
  onSave: (id: number) => void
  savingId: number | null
  errors: Record<number, string | null>
}) {
  return (
    <Section title="SALDOS DE LA SEMANA" color={ambito.color}>
      {cuentas.length === 0 && (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', padding: '8px 4px' }}>
          Este ámbito no tiene cuentas activas todavía.
        </div>
      )}
      {cuentas.map((cta) => {
        const cmp = compareCuentas.find((c) => c.cuenta_id === cta.id)
        const error = errors[cta.id]
        return (
          <div
            key={cta.id}
            style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 12px', border: '1px solid rgba(200,168,64,0.08)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-md)', color: '#E8DCC8', minWidth: 140 }}>{cta.nombre}</span>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  Semana anterior:{' '}
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {cmp?.saldo_anterior !== null && cmp?.saldo_anterior !== undefined ? `${formatSaldo(cmp.saldo_anterior)} ${cta.moneda}` : '—'}
                  </span>
                </div>
                {cmp && cmp.delta !== null && (
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: deltaColor(cmp.delta) }}>
                    {deltaLabel(cmp.delta)}
                  </span>
                )}
                <input
                  value={saldoInputs[cta.id] ?? ''}
                  onChange={(e) => onInputChange(cta.id, e.target.value)}
                  placeholder="0,00"
                  style={{ ...inputStyle, width: 110, textAlign: 'right', borderColor: error ? 'rgba(248,113,113,0.5)' : undefined }}
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
            {error && (
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#f87171', alignSelf: 'flex-end' }}>
                {error}
              </span>
            )}
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
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!concepto.trim() || !fecha) {
      setError('Concepto y fecha son obligatorios')
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
          ambito_id: ambito.id,
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
    <Section
      title="PREVISIONES VIGENTES"
      color={ambito.color}
      onAdd={() => setAdding((v) => !v)}
      info={{
        title: '¿Qué es una previsión?',
        body: 'Dinero que esperas que entre o salga, pero que todavía NO ha pasado por el banco.\n- Cobros previstos: lo que esperas recibir (cobro del autónomo, factura de un cliente, ingreso de una formación).\n- Pagos previstos: lo que sabes que pagarás (cuota de autónomo, gestoría, hosting, hipoteca, proveedor).\nLa clave: aún no ha entrado ni salido, pero quieres verlo venir.'
      }}
    >
      {loading && <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Cargando...</div>}
      {!loading && previsiones.length === 0 && !adding && (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', padding: '8px 4px' }}>Sin previsiones vigentes.</div>
      )}
      {previsiones.map((p) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', border: '1px solid rgba(200,168,64,0.08)', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: p.tipo === 'ingreso' ? '#4ade80' : '#f87171', border: `1px solid ${p.tipo === 'ingreso' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`, padding: '2px 6px' }}>
              {p.tipo === 'ingreso' ? 'INGRESO' : 'GASTO'}
            </span>
            <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-md)', color: '#E8DCC8' }}>{p.concepto}</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{formatDateEs(p.fecha_estimada)}</span>
            {p.cuenta_nombre && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>· {p.cuenta_nombre}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)', color: '#E8DCC8' }}>{formatSaldo(p.importe)} {p.moneda}</span>
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
          {error && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#f87171', alignSelf: 'center' }}>{error}</span>}
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
  const [error, setError] = useState<string | null>(null)

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
    <Section
      title="RESERVAS ACTIVAS"
      color={ambito.color}
      onAdd={() => setAdding((v) => !v)}
      info={{
        title: '¿Qué es una reserva?',
        body: 'Dinero que YA tienes en una cuenta, pero que está apartado para algo y no consideras libre.\nEjemplos: 600€ para impuestos, 300€ para devolver a alguien, 1.000€ de colchón, dinero apartado para una factura concreta.\nLa clave: el dinero ya existe, pero está comprometido. (Distinto de una previsión: la previsión es dinero que esperas; la reserva es dinero que ya tienes pero no puedes gastar alegremente.)'
      }}
    >
      {loading && <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Cargando...</div>}
      {!loading && reservas.length === 0 && !adding && (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', padding: '8px 4px' }}>Sin reservas activas.</div>
      )}
      {reservas.map((r) => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', border: '1px solid rgba(200,168,64,0.08)', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-md)', color: '#E8DCC8' }}>{r.concepto}</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>· {r.cuenta_nombre}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)', color: '#E8DCC8' }}>{formatSaldo(r.importe)} {r.moneda}</span>
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
          {error && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#f87171', alignSelf: 'center' }}>{error}</span>}
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
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!contraparte.trim()) {
      setError('Contraparte es obligatoria')
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
          ambito_id: ambito.id,
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
    <Section
      title="DEUDAS PENDIENTES"
      color={ambito.color}
      onAdd={() => setAdding((v) => !v)}
      info={{
        title: '¿Qué es una deuda?',
        body: 'Obligaciones o derechos de cobro que quieres controlar como deuda viva.\n- Me deben: alguien te debe dinero (una factura ya vencida).\n- Debo: tú debes saldar algo (a una persona, a un proveedor).\nLa clave: la deuda tiene peso de obligación/seguimiento. Una previsión es algo esperado; una deuda es algo que ya consideras pendiente de saldar.\nEjemplo: "me pagará la factura el día 5" es previsión; "me debe una factura ya vencida" es deuda.'
      }}
    >
      {loading && <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Cargando...</div>}
      {!loading && deudas.length === 0 && !adding && (
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', padding: '8px 4px' }}>Sin deudas pendientes.</div>
      )}
      {deudas.map((d) => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', border: '1px solid rgba(200,168,64,0.08)', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: d.direccion === 'debo' ? '#f87171' : '#4ade80', border: `1px solid ${d.direccion === 'debo' ? 'rgba(248,113,113,0.3)' : 'rgba(74,222,128,0.3)'}`, padding: '2px 6px' }}>
              {d.direccion === 'debo' ? 'DEBO' : 'ME DEBEN'}
            </span>
            <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-md)', color: '#E8DCC8' }}>{d.contraparte}</span>
            {d.fecha_vencimiento && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>vence {formatDateEs(d.fecha_vencimiento)}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)', color: '#E8DCC8' }}>{formatSaldo(d.importe)} {d.moneda}</span>
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
          {error && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#f87171', alignSelf: 'center' }}>{error}</span>}
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
  notasError,
  estado,
  onChangeEstado,
  estadoError
}: {
  ambito: Ambito
  notas: string
  onNotasChange: (v: string) => void
  onSaveNotas: () => void
  savingNotas: boolean
  notasError: string | null
  estado: Revision['estado']
  onChangeEstado: (e: Revision['estado']) => void
  estadoError: string | null
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
        {savingNotas && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Guardando notas...</span>}
        {notasError && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#f87171' }}>{notasError}</span>}

        <div style={{ display: 'flex', gap: 0, marginTop: 4 }}>
          {ESTADOS_REVISION.map((e, i) => (
            <button
              key={e}
              onClick={() => onChangeEstado(e)}
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 'var(--text-sm)',
                padding: '6px 16px',
                cursor: 'pointer',
                color: estado === e ? '#C8A840' : 'var(--color-text-muted)',
                background: estado === e ? 'rgba(200,168,64,0.32)' : 'transparent',
                border: estado === e ? '1px solid #C8A840' : '1px solid rgba(200,168,64,0.12)',
                borderRadius: i === 0 ? '3px 0 0 3px' : i === ESTADOS_REVISION.length - 1 ? '0 3px 3px 0' : 0,
                marginLeft: i === 0 ? 0 : -1
              }}
            >
              {ESTADO_LABEL[e]}
            </button>
          ))}
        </div>
        {estadoError && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#f87171' }}>{estadoError}</span>}
      </div>
    </Section>
  )
}

function ResumenComparacion({ compareData }: { compareData: CompareResponse | null }) {
  if (!compareData) return null

  return (
    <section>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.12em', marginBottom: 4 }}>
        RESUMEN — INFORMATIVO
      </div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 12 }}>
        Cada ámbito es independiente. Estos totales NUNCA se suman entre sí.
        {compareData.sin_comparacion_previa && ' Sin comparación previa disponible para la semana anterior.'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {compareData.ambitos.map((a) => (
          <div key={a.id} style={{ background: '#13100A', border: `1px solid ${hexToRgba(a.color, 0.2)}`, borderLeft: `3px solid ${a.color}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-sm)', color: '#E8DCC8', letterSpacing: '0.06em' }}>{a.nombre.toUpperCase()}</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2lg)', color: '#C8A840' }}>
              {a.total_actual !== null ? formatSaldo(a.total_actual) : '—'}
            </span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              Semana anterior: {a.total_anterior !== null ? formatSaldo(a.total_anterior) : '—'}
            </span>
            {a.delta_total !== null && (
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: deltaColor(a.delta_total) }}>
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
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.12em' }}>{title}</span>
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
