import { useState, useEffect, useCallback } from 'react'
import { hexToRgba, type Ambito } from './shared'

interface Tercero {
  id: number
  ambito_id: number
  core_contact_id: number | null
  nombre: string
  tipo: 'cliente' | 'proveedor' | 'ambos' | 'otro'
  nif: string | null
  direccion_fiscal: string | null
  activa: boolean
  notas: string | null
}

interface CoreContact {
  id: number
  nombre: string
}

type TipoTercero = Tercero['tipo']

const TIPO_LABEL: Record<TipoTercero, string> = {
  cliente: 'Cliente',
  proveedor: 'Proveedor',
  ambos: 'Cliente/Proveedor',
  otro: 'Otro'
}

interface FormState {
  mode: 'create' | 'edit'
  id?: number
  ambitoId: number | ''
  nombre: string
  tipo: TipoTercero | ''
  nif: string
  direccionFiscal: string
  notas: string
  coreContactId: number | ''
}

const EMPTY_FORM: FormState = {
  mode: 'create',
  ambitoId: '',
  nombre: '',
  tipo: '',
  nif: '',
  direccionFiscal: '',
  notas: '',
  coreContactId: ''
}

const smallBtn: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 'var(--text-xs)',
  color: '#A09070',
  background: 'transparent',
  border: '1px solid rgba(200,168,64,0.2)',
  padding: '3px 10px',
  cursor: 'pointer',
  letterSpacing: '0.04em'
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

export function TercerosView({ ambitos }: { ambitos: Ambito[] }) {
  const [terceros, setTerceros] = useState<Tercero[]>([])
  const [loading, setLoading] = useState(true)
  const [coreContacts, setCoreContacts] = useState<CoreContact[] | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchTerceros = useCallback(async () => {
    try {
      const res = await fetch('/api/finanzas/terceros', { credentials: 'include' })
      const data = await res.json()
      setTerceros(data.terceros ?? [])
    } catch {
      // keep stale
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTerceros()
    fetch('/api/finanzas/core-contacts', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setCoreContacts(data?.contactos ?? null))
      .catch(() => setCoreContacts(null))
  }, [fetchTerceros])

  function openCreate(ambitoId?: number) {
    setFormError(null)
    setForm({ ...EMPTY_FORM, ambitoId: ambitoId ?? '' })
  }

  function openEdit(t: Tercero) {
    setFormError(null)
    setForm({
      mode: 'edit',
      id: t.id,
      ambitoId: t.ambito_id,
      nombre: t.nombre,
      tipo: t.tipo,
      nif: t.nif ?? '',
      direccionFiscal: t.direccion_fiscal ?? '',
      notas: t.notas ?? '',
      coreContactId: t.core_contact_id ?? ''
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
    if (form.mode === 'create' && form.ambitoId === '') return setFormError('Selecciona un ámbito')

    setSaving(true)
    setFormError(null)
    try {
      const body =
        form.mode === 'create'
          ? {
              ambito_id: form.ambitoId,
              nombre: form.nombre.trim(),
              tipo: form.tipo,
              nif: form.nif.trim() || null,
              direccion_fiscal: form.direccionFiscal.trim() || null,
              notas: form.notas.trim() || null,
              core_contact_id: form.coreContactId === '' ? null : form.coreContactId
            }
          : {
              nombre: form.nombre.trim(),
              tipo: form.tipo,
              nif: form.nif.trim() || null,
              direccion_fiscal: form.direccionFiscal.trim() || null,
              notas: form.notas.trim() || null,
              core_contact_id: form.coreContactId === '' ? null : form.coreContactId
            }

      const url = form.mode === 'create' ? '/api/finanzas/terceros' : `/api/finanzas/terceros/${form.id}`
      const method = form.mode === 'create' ? 'POST' : 'PATCH'
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
      await fetchTerceros()
    } catch {
      setFormError('Error de red')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActiva(t: Tercero) {
    if (t.activa && !window.confirm(`¿Archivar "${t.nombre}"?`)) return
    try {
      const res = await fetch(`/api/finanzas/terceros/${t.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activa: !t.activa })
      })
      if (res.ok) await fetchTerceros()
    } catch {
      // ignore — próxima carga reconcilia
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => openCreate()} style={{ ...smallBtn, color: '#C8A840', borderColor: 'rgba(200,168,64,0.35)', padding: '6px 14px' }}>
          + Nuevo tercero
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--color-text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)' }}>Cargando...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {ambitos.map((ambito) => (
            <AmbitoBlock
              key={ambito.id}
              ambito={ambito}
              terceros={terceros.filter((t) => t.ambito_id === ambito.id)}
              onNew={() => openCreate(ambito.id)}
              onEdit={openEdit}
              onToggleActiva={toggleActiva}
            />
          ))}
        </div>
      )}

      {form && (
        <TerceroForm
          form={form}
          ambitos={ambitos}
          coreContacts={coreContacts}
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
  terceros,
  onNew,
  onEdit,
  onToggleActiva
}: {
  ambito: Ambito
  terceros: Tercero[]
  onNew: () => void
  onEdit: (t: Tercero) => void
  onToggleActiva: (t: Tercero) => void
}) {
  const activos = terceros.filter((t) => t.activa)
  const inactivos = terceros.filter((t) => !t.activa)

  return (
    <section style={{ background: '#13100A', border: `1px solid ${hexToRgba(ambito.color, 0.25)}`, borderLeft: `3px solid ${ambito.color}` }}>
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${hexToRgba(ambito.color, 0.12)}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: ambito.color, flexShrink: 0 }} />
          <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-md)', color: '#E8DCC8', letterSpacing: '0.06em' }}>
            {ambito.nombre.toUpperCase()}
          </span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {activos.length} tercero{activos.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button onClick={onNew} style={{ ...smallBtn, border: `1px solid ${hexToRgba(ambito.color, 0.25)}` }}>+ Tercero</button>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {terceros.length === 0 && (
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', padding: '8px 4px' }}>
            Sin terceros todavía.
          </div>
        )}
        {activos.map((t) => (
          <TerceroRow key={t.id} tercero={t} onEdit={onEdit} onToggleActiva={onToggleActiva} />
        ))}
        {inactivos.length > 0 && (
          <>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', letterSpacing: '0.1em', marginTop: 8, marginBottom: 2 }}>
              ARCHIVADOS
            </div>
            {inactivos.map((t) => (
              <TerceroRow key={t.id} tercero={t} onEdit={onEdit} onToggleActiva={onToggleActiva} />
            ))}
          </>
        )}
      </div>
    </section>
  )
}

function TerceroRow({ tercero: t, onEdit, onToggleActiva }: { tercero: Tercero; onEdit: (t: Tercero) => void; onToggleActiva: (t: Tercero) => void }) {
  const dim = !t.activa
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: dim ? 'transparent' : 'rgba(200,168,64,0.03)',
        border: '1px solid rgba(200,168,64,0.08)',
        opacity: dim ? 0.5 : 1,
        gap: 12,
        flexWrap: 'wrap'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-base)', color: '#E8DCC8' }}>{t.nombre}</span>
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 'var(--text-2xs)',
            color: '#C8A840',
            background: 'rgba(200,168,64,0.1)',
            border: '1px solid rgba(200,168,64,0.2)',
            padding: '2px 6px',
            letterSpacing: '0.04em',
            flexShrink: 0
          }}
        >
          {TIPO_LABEL[t.tipo]}
        </span>
        {t.nif && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{t.nif}</span>}
        {t.core_contact_id !== null && (
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: '#8B9DC8', border: '1px solid rgba(139,157,200,0.3)', padding: '2px 6px' }}>
            ⚭ vinculado
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <button onClick={() => onEdit(t)} style={{ ...smallBtn, border: 'none', padding: 2 }}>Editar</button>
        <button onClick={() => onToggleActiva(t)} style={{ ...smallBtn, border: 'none', padding: 2, color: t.activa ? '#f87171' : '#4ade80' }}>
          {t.activa ? 'Archivar' : 'Activar'}
        </button>
      </div>
    </div>
  )
}

function TerceroForm({
  form,
  ambitos,
  coreContacts,
  error,
  saving,
  onChange,
  onCancel,
  onSubmit
}: {
  form: FormState
  ambitos: Ambito[]
  coreContacts: CoreContact[] | null
  error: string | null
  saving: boolean
  onChange: (f: FormState) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#13100A', border: '1px solid rgba(200,168,64,0.25)', padding: 24, width: 420, maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '85vh', overflowY: 'auto' }}
      >
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-lg)', color: '#C8A840', letterSpacing: '0.08em' }}>
          {form.mode === 'create' ? 'NUEVO TERCERO' : 'EDITAR TERCERO'}
        </span>

        {form.mode === 'create' && (
          <div>
            <label style={labelStyle}>ÁMBITO</label>
            <select value={form.ambitoId} onChange={(e) => onChange({ ...form, ambitoId: e.target.value ? Number(e.target.value) : '' })} style={inputStyle}>
              <option value="">Selecciona un ámbito</option>
              {ambitos.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label style={labelStyle}>NOMBRE</label>
          <input value={form.nombre} onChange={(e) => onChange({ ...form, nombre: e.target.value })} style={inputStyle} placeholder="Ej. Cliente ejemplo SL" />
        </div>

        <div>
          <label style={labelStyle}>TIPO</label>
          <select value={form.tipo} onChange={(e) => onChange({ ...form, tipo: e.target.value as TipoTercero })} style={inputStyle}>
            <option value="">Selecciona un tipo</option>
            <option value="cliente">Cliente</option>
            <option value="proveedor">Proveedor</option>
            <option value="ambos">Cliente/Proveedor</option>
            <option value="otro">Otro</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>NIF (opcional)</label>
          <input value={form.nif} onChange={(e) => onChange({ ...form, nif: e.target.value })} style={inputStyle} placeholder="Ej. B12345678" />
        </div>

        <div>
          <label style={labelStyle}>DIRECCIÓN FISCAL (opcional)</label>
          <input value={form.direccionFiscal} onChange={(e) => onChange({ ...form, direccionFiscal: e.target.value })} style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>NOTAS (opcional)</label>
          <textarea value={form.notas} onChange={(e) => onChange({ ...form, notas: e.target.value })} style={{ ...inputStyle, resize: 'vertical' }} rows={2} />
        </div>

        <div>
          <label style={labelStyle}>VINCULAR A CONTACTO (opcional, informativo)</label>
          {coreContacts ? (
            <select
              value={form.coreContactId}
              onChange={(e) => onChange({ ...form, coreContactId: e.target.value ? Number(e.target.value) : '' })}
              style={inputStyle}
            >
              <option value="">Sin vincular</option>
              {coreContacts.map((cc) => (
                <option key={cc.id} value={cc.id}>{cc.nombre}</option>
              ))}
            </select>
          ) : (
            <input
              type="number"
              value={form.coreContactId}
              onChange={(e) => onChange({ ...form, coreContactId: e.target.value ? Number(e.target.value) : '' })}
              style={inputStyle}
              placeholder="ID de contacto (manual — sin catálogo disponible)"
            />
          )}
        </div>

        {error && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#f87171' }}>{error}</span>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} style={{ ...smallBtn, padding: '7px 16px' }}>Cancelar</button>
          <button onClick={onSubmit} disabled={saving} style={{ ...smallBtn, color: '#C8A840', borderColor: 'rgba(200,168,64,0.35)', padding: '7px 16px', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
