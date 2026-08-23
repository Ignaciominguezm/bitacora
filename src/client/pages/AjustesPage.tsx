import { useState, useEffect } from 'react'

interface PrefRow {
  id: number
  scope_type: string
  scope_value: string
  enabled: boolean
}

interface PrefsData {
  global: PrefRow[]
  origen: PrefRow[]
  actor: PrefRow[]
}

type PrefMap = Record<string, boolean>

const KNOWN_ORIGENES = [
  { value: 'horario34', label: 'Horario34' },
  { value: 'coreworks', label: 'CoreWorks' },
  { value: 'viriatech', label: 'Viriatech Portal' },
  { value: 'vps-monitor', label: 'Servidores' }
]

const KNOWN_ACTORS = [
  { value: 'Ignacio Mínguez Montes', label: 'Mis acciones' },
  { value: 'Eva Contreras Cerro', label: 'Eva' }
]

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        background: checked && !disabled ? '#C8A840' : 'rgba(90,74,48,0.5)',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative',
        transition: 'background 0.2s',
        flexShrink: 0,
        opacity: disabled ? 0.35 : 1,
        padding: 0
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: checked ? 21 : 3,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#E8DCC8',
          transition: 'left 0.2s',
          display: 'block'
        }}
      />
    </button>
  )
}

function ToggleRow({
  label,
  subtitle,
  checked,
  onChange,
  disabled
}: {
  label: string
  subtitle?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        opacity: disabled ? 0.5 : 1,
        transition: 'opacity 0.15s'
      }}
    >
      <div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)', color: '#E8DCC8' }}>
          {label}
        </div>
        {subtitle && (
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#5A4A30', marginTop: 2 }}>
            {subtitle}
          </div>
        )}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: '#13100A',
        border: '1px solid rgba(200,168,64,0.15)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid rgba(200,168,64,0.1)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 'var(--text-2xs)',
          color: '#5A4A30',
          letterSpacing: '0.12em'
        }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

export function AjustesPage() {
  const [loading, setLoading] = useState(true)
  const [globalEnabled, setGlobalEnabled] = useState(true)
  const [origenPrefs, setOrigenPrefs] = useState<PrefMap>({})
  const [actorPrefs, setActorPrefs] = useState<PrefMap>({})
  const [unknownOrigenes, setUnknownOrigenes] = useState<string[]>([])
  const [unknownActors, setUnknownActors] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/notify/preferences', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: PrefsData) => {
        const globalRow = data.global?.find((p) => p.scope_value === 'all')
        setGlobalEnabled(globalRow?.enabled ?? true)

        const oMap: PrefMap = {}
        data.origen?.forEach((p) => { oMap[p.scope_value] = p.enabled })
        setOrigenPrefs(oMap)

        const aMap: PrefMap = {}
        data.actor?.forEach((p) => { aMap[p.scope_value] = p.enabled })
        setActorPrefs(aMap)

        const knownOValues = KNOWN_ORIGENES.map((o) => o.value)
        setUnknownOrigenes(
          (data.origen || []).filter((p) => !knownOValues.includes(p.scope_value)).map((p) => p.scope_value)
        )

        const knownAValues = KNOWN_ACTORS.map((a) => a.value)
        setUnknownActors(
          (data.actor || []).filter((p) => !knownAValues.includes(p.scope_value)).map((p) => p.scope_value)
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function patchPref(scope_type: string, scope_value: string, enabled: boolean) {
    await fetch('/api/notify/preferences', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope_type, scope_value, enabled })
    }).catch(() => {})
  }

  async function toggleGlobal(v: boolean) {
    setGlobalEnabled(v)
    await patchPref('global', 'all', v)
  }

  async function toggleOrigen(value: string, v: boolean) {
    setOrigenPrefs((prev) => ({ ...prev, [value]: v }))
    await patchPref('origen', value, v)
  }

  async function toggleActor(value: string, v: boolean) {
    setActorPrefs((prev) => ({ ...prev, [value]: v }))
    await patchPref('actor', value, v)
  }

  const allOrigenes = [
    ...KNOWN_ORIGENES,
    ...unknownOrigenes.map((v) => ({ value: v, label: v }))
  ]
  const allActors = [
    ...KNOWN_ACTORS,
    ...unknownActors.map((v) => ({ value: v, label: v }))
  ]

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 32px',
        background: '#0D0A06',
        display: 'flex',
        flexDirection: 'column',
        gap: 32
      }}
    >
      {/* Page header */}
      <div>
        <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-xl)', color: '#C8A840', letterSpacing: '0.1em', margin: 0 }}>
          AJUSTES
        </h1>
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: '#5A4A30', margin: '4px 0 0' }}>
          Preferencias del sistema
        </p>
      </div>

      {loading ? (
        <div style={{ color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)' }}>
          Cargando...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 520 }}>
          {/* Notifications card */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-md)', color: '#C8A840', letterSpacing: '0.08em', marginBottom: 12 }}>
              NOTIFICACIONES
            </div>

            {/* Group A — Global */}
            <Section title="GLOBAL">
              <ToggleRow
                label="Activar notificaciones"
                subtitle="Interruptor maestro — desactivar silencia todo"
                checked={globalEnabled}
                onChange={toggleGlobal}
              />
            </Section>

            {/* Group B — Por aplicación */}
            <Section title="POR APLICACIÓN">
              {allOrigenes.map((item) => (
                <ToggleRow
                  key={item.value}
                  label={item.label}
                  checked={origenPrefs[item.value] ?? true}
                  onChange={(v) => toggleOrigen(item.value, v)}
                  disabled={!globalEnabled}
                />
              ))}
            </Section>

            {/* Group C — Por persona */}
            <Section title="POR PERSONA">
              {allActors.map((item) => (
                <ToggleRow
                  key={item.value}
                  label={item.label}
                  checked={actorPrefs[item.value] ?? true}
                  onChange={(v) => toggleActor(item.value, v)}
                  disabled={!globalEnabled}
                />
              ))}
            </Section>
          </div>
        </div>
      )}
    </div>
  )
}
