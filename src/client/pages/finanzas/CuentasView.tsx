import { useState, useEffect, useCallback } from 'react'
import { hexToRgba, formatSaldo, type Ambito } from './shared'

interface Cuenta {
  id: number
  ambito_id: number
  nombre: string
  tipo: 'banco' | 'efectivo' | 'otro'
  entidad: string | null
  moneda: string
  activa: boolean
  saldo_actual: string | null
  saldo_semana: string | null
}

type TipoCuenta = 'banco' | 'efectivo' | 'otro'

const TIPO_LABEL: Record<TipoCuenta, string> = { banco: 'Banco', efectivo: 'Efectivo', otro: 'Otro' }

interface FormState {
  mode: 'create' | 'edit'
  id?: number
  ambito_id: number | ''
  nombre: string
  tipo: TipoCuenta | ''
  entidad: string
  moneda: string
}

const EMPTY_FORM: FormState = { mode: 'create', ambito_id: '', nombre: '', tipo: '', entidad: '', moneda: 'EUR' }

export function CuentasView({ ambitos }: { ambitos: Ambito[] }) {
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const fetchCuentas = useCallback(async () => {
    try {
      const res = await fetch('/api/finanzas/cuentas', { credentials: 'include' })
      const data = await res.json()
      setCuentas(data.cuentas ?? [])
    } catch {
      // keep stale
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCuentas()
  }, [fetchCuentas])

  function openCreate(ambitoId?: number) {
    setFormError(null)
    setForm({ ...EMPTY_FORM, ambito_id: ambitoId ?? '' })
  }

  function openEdit(cuenta: Cuenta) {
    setFormError(null)
    setForm({
      mode: 'edit',
      id: cuenta.id,
      ambito_id: cuenta.ambito_id,
      nombre: cuenta.nombre,
      tipo: cuenta.tipo,
      entidad: cuenta.entidad ?? '',
      moneda: cuenta.moneda
    })
  }

  function closeForm() {
    setForm(null)
    setFormError(null)
  }

  async function submitForm() {
    if (!form) return
    if (!form.nombre.trim()) return setFormError('El nombre es obligatorio')
    if (!form.tipo) return setFormError('Selecciona un tipo')
    if (form.mode === 'create' && form.ambito_id === '') return setFormError('Selecciona un ámbito')

    setSaving(true)
    setFormError(null)
    try {
      const url = form.mode === 'create' ? '/api/finanzas/cuentas' : `/api/finanzas/cuentas/${form.id}`
      const method = form.mode === 'create' ? 'POST' : 'PATCH'
      const body =
        form.mode === 'create'
          ? { ambito_id: form.ambito_id, nombre: form.nombre.trim(), tipo: form.tipo, entidad: form.entidad.trim() || null, moneda: form.moneda.trim() || 'EUR' }
          : { nombre: form.nombre.trim(), tipo: form.tipo, entidad: form.entidad.trim() || null, moneda: form.moneda.trim() || 'EUR' }

      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setFormError(data.error ?? 'Error al guardar')
        return
      }
      closeForm()
      await fetchCuentas()
    } catch {
      setFormError('Error de red')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActiva(cuenta: Cuenta) {
    const action = cuenta.activa ? 'desactivar' : 'activar'
    if (cuenta.activa && !window.confirm(`¿Desactivar "${cuenta.nombre}"? El histórico de saldos se conserva.`)) return

    try {
      const res = await fetch(`/api/finanzas/cuentas/${cuenta.id}/${action}`, { method: 'PATCH', credentials: 'include' })
      if (res.ok) await fetchCuentas()
    } catch {
      // ignore — UI stays as-is, next refresh will reconcile
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => openCreate()}
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
            color: '#C8A840',
            background: 'rgba(200,168,64,0.08)',
            border: '1px solid rgba(200,168,64,0.25)',
            padding: '6px 14px',
            cursor: 'pointer',
            letterSpacing: '0.06em'
          }}
        >
          + Nueva cuenta
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
          Cargando...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {ambitos.map((ambito) => (
            <AmbitoBlock
              key={ambito.id}
              ambito={ambito}
              cuentas={cuentas.filter((c) => c.ambito_id === ambito.id)}
              onNew={() => openCreate(ambito.id)}
              onEdit={openEdit}
              onToggleActiva={toggleActiva}
            />
          ))}
        </div>
      )}

      {form && (
        <CuentaForm
          form={form}
          ambitos={ambitos}
          error={formError}
          saving={saving}
          onChange={setForm}
          onCancel={closeForm}
          onSubmit={submitForm}
        />
      )}
    </div>
  )
}

function AmbitoBlock({
  ambito,
  cuentas,
  onNew,
  onEdit,
  onToggleActiva
}: {
  ambito: Ambito
  cuentas: Cuenta[]
  onNew: () => void
  onEdit: (c: Cuenta) => void
  onToggleActiva: (c: Cuenta) => void
}) {
  const activas = cuentas.filter((c) => c.activa)
  const inactivas = cuentas.filter((c) => !c.activa)

  return (
    <section
      style={{
        background: '#13100A',
        border: `1px solid ${hexToRgba(ambito.color, 0.25)}`,
        borderLeft: `3px solid ${ambito.color}`
      }}
    >
      <div
        style={{
          padding: '10px 16px',
          borderBottom: `1px solid ${hexToRgba(ambito.color, 0.12)}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: ambito.color, flexShrink: 0 }} />
          <span style={{ fontFamily: 'Cinzel, serif', fontSize: 13, color: '#E8DCC8', letterSpacing: '0.06em' }}>
            {ambito.nombre.toUpperCase()}
          </span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A4A30' }}>
            {activas.length} cuenta{activas.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={onNew}
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            color: '#A09070',
            background: 'transparent',
            border: `1px solid ${hexToRgba(ambito.color, 0.25)}`,
            padding: '3px 10px',
            cursor: 'pointer',
            letterSpacing: '0.04em'
          }}
        >
          + Cuenta
        </button>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {cuentas.length === 0 && (
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#5A4A30', padding: '8px 4px' }}>
            Sin cuentas todavía.
          </div>
        )}

        {activas.map((cuenta) => (
          <CuentaRow key={cuenta.id} cuenta={cuenta} onEdit={onEdit} onToggleActiva={onToggleActiva} />
        ))}

        {inactivas.length > 0 && (
          <>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#5A4A30', letterSpacing: '0.1em', marginTop: 8, marginBottom: 2 }}>
              INACTIVAS
            </div>
            {inactivas.map((cuenta) => (
              <CuentaRow key={cuenta.id} cuenta={cuenta} onEdit={onEdit} onToggleActiva={onToggleActiva} />
            ))}
          </>
        )}
      </div>
    </section>
  )
}

function CuentaRow({
  cuenta,
  onEdit,
  onToggleActiva
}: {
  cuenta: Cuenta
  onEdit: (c: Cuenta) => void
  onToggleActiva: (c: Cuenta) => void
}) {
  const dim = !cuenta.activa
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: dim ? 'transparent' : 'rgba(200,168,64,0.03)',
        border: '1px solid rgba(200,168,64,0.08)',
        opacity: dim ? 0.5 : 1
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: '#E8DCC8', whiteSpace: 'nowrap' }}>
          {cuenta.nombre}
        </span>
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9,
            color: '#C8A840',
            background: 'rgba(200,168,64,0.1)',
            border: '1px solid rgba(200,168,64,0.2)',
            padding: '2px 6px',
            letterSpacing: '0.04em',
            flexShrink: 0
          }}
        >
          {TIPO_LABEL[cuenta.tipo]}
        </span>
        {cuenta.entidad && (
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#5A4A30' }}>
            {cuenta.entidad}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: cuenta.saldo_actual === null ? '#5A4A30' : '#E8DCC8' }}>
          {cuenta.saldo_actual === null ? 'sin saldos aún' : `${formatSaldo(cuenta.saldo_actual)} ${cuenta.moneda}`}
        </span>
        <button
          onClick={() => onEdit(cuenta)}
          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#A09070', background: 'transparent', border: 'none', cursor: 'pointer', padding: 2 }}
        >
          Editar
        </button>
        <button
          onClick={() => onToggleActiva(cuenta)}
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            color: cuenta.activa ? '#f87171' : '#4ade80',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 2
          }}
        >
          {cuenta.activa ? 'Desactivar' : 'Reactivar'}
        </button>
      </div>
    </div>
  )
}

function CuentaForm({
  form,
  ambitos,
  error,
  saving,
  onChange,
  onCancel,
  onSubmit
}: {
  form: FormState
  ambitos: Ambito[]
  error: string | null
  saving: boolean
  onChange: (f: FormState) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  const inputStyle: React.CSSProperties = {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 12,
    color: '#E8DCC8',
    background: '#0D0A06',
    border: '1px solid rgba(200,168,64,0.2)',
    padding: '8px 10px',
    outline: 'none',
    width: '100%'
  }
  const labelStyle: React.CSSProperties = {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 9,
    color: '#5A4A30',
    letterSpacing: '0.1em',
    marginBottom: 4,
    display: 'block'
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#13100A',
          border: '1px solid rgba(200,168,64,0.25)',
          padding: 24,
          width: 380,
          maxWidth: '90vw',
          display: 'flex',
          flexDirection: 'column',
          gap: 14
        }}
      >
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: 14, color: '#C8A840', letterSpacing: '0.08em' }}>
          {form.mode === 'create' ? 'NUEVA CUENTA' : 'EDITAR CUENTA'}
        </span>

        {form.mode === 'create' && (
          <div>
            <label style={labelStyle}>ÁMBITO</label>
            <select
              value={form.ambito_id}
              onChange={(e) => onChange({ ...form, ambito_id: e.target.value ? Number(e.target.value) : '' })}
              style={inputStyle}
            >
              <option value="">Selecciona un ámbito</option>
              {ambitos.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label style={labelStyle}>NOMBRE</label>
          <input
            value={form.nombre}
            onChange={(e) => onChange({ ...form, nombre: e.target.value })}
            style={inputStyle}
            placeholder="Ej. BBVA Nómina"
          />
        </div>

        <div>
          <label style={labelStyle}>TIPO</label>
          <select
            value={form.tipo}
            onChange={(e) => onChange({ ...form, tipo: e.target.value as TipoCuenta })}
            style={inputStyle}
          >
            <option value="">Selecciona un tipo</option>
            <option value="banco">Banco</option>
            <option value="efectivo">Efectivo</option>
            <option value="otro">Otro</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>ENTIDAD (opcional)</label>
          <input
            value={form.entidad}
            onChange={(e) => onChange({ ...form, entidad: e.target.value })}
            style={inputStyle}
            placeholder="Ej. BBVA"
          />
        </div>

        <div>
          <label style={labelStyle}>MONEDA</label>
          <input
            value={form.moneda}
            onChange={(e) => onChange({ ...form, moneda: e.target.value.toUpperCase() })}
            style={inputStyle}
            maxLength={3}
          />
        </div>

        {error && (
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#f87171' }}>
            {error}
          </span>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button
            onClick={onCancel}
            style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#5A4A30', background: 'transparent', border: '1px solid rgba(200,168,64,0.15)', padding: '7px 16px', cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            onClick={onSubmit}
            disabled={saving}
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
              color: '#C8A840',
              background: 'rgba(200,168,64,0.1)',
              border: '1px solid rgba(200,168,64,0.35)',
              padding: '7px 16px',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1
            }}
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
