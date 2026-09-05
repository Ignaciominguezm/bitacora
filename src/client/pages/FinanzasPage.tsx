import { useState, useEffect } from 'react'
import { type Ambito, hexToRgba } from './finanzas/shared'
import { FinanzasDashboard } from './finanzas/FinanzasDashboard'
import { CuentasView } from './finanzas/CuentasView'
import { VistaMensualView } from './finanzas/VistaMensualView'
import { CategoriasView } from './finanzas/CategoriasView'
import { TercerosView } from './finanzas/TercerosView'
import { MovimientosView } from './finanzas/MovimientosView'
import { ObligacionesView } from './finanzas/ObligacionesView'
import { FiscalView } from './finanzas/FiscalView'

type View = 'dashboard' | 'cuentas' | 'vista-mensual' | 'categorias' | 'terceros' | 'movimientos' | 'obligaciones' | 'fiscal'

// Dos bloques a propósito, con acento de color distinto: TESORERÍA (gestión
// de caja del día a día) vs FISCAL (cumplimiento — declaraciones, plazos
// AEAT). Antes eran una única fila de botones idénticos y el usuario no
// distinguía de un vistazo qué era tesorería y qué era cumplimiento.
const GRUPO_FINANCIERO: Array<{ id: View; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'cuentas', label: 'Cuentas' },
  { id: 'vista-mensual', label: 'Vista mensual' },
  { id: 'categorias', label: 'Categorías' },
  { id: 'terceros', label: 'Terceros' },
  { id: 'movimientos', label: 'Movimientos' },
  { id: 'obligaciones', label: 'Obligaciones' }
]
const GRUPO_FISCAL: Array<{ id: View; label: string }> = [{ id: 'fiscal', label: 'Fiscal' }]

const ACENTO_FINANCIERO = '#C8A840'
const ACENTO_FISCAL = '#8B9DC8'

export function FinanzasPage() {
  const [view, setView] = useState<View>('dashboard')
  const [ambitos, setAmbitos] = useState<Ambito[]>([])

  useEffect(() => {
    fetch('/api/finanzas/ambitos', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setAmbitos(data.ambitos ?? []))
      .catch(() => {})
  }, [])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', background: '#0D0A06', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-xl)', color: '#C8A840', letterSpacing: '0.1em', margin: 0 }}>
            FINANZAS
          </h1>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
            Cuentas y vista mensual por ámbito
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, marginRight: 'var(--notif-gutter)', flexWrap: 'wrap' }}>
          <TabGrupo label="TESORERÍA" acento={ACENTO_FINANCIERO} tabs={GRUPO_FINANCIERO} view={view} onSelect={setView} />
          <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(200,168,64,0.15)' }} />
          <TabGrupo label="FISCAL" acento={ACENTO_FISCAL} tabs={GRUPO_FISCAL} view={view} onSelect={setView} />
        </div>
      </div>

      {view === 'dashboard' && <FinanzasDashboard onNavigate={setView} />}
      {view === 'cuentas' && <CuentasView ambitos={ambitos} />}
      {view === 'vista-mensual' && <VistaMensualView ambitos={ambitos} />}
      {view === 'categorias' && <CategoriasView />}
      {view === 'terceros' && <TercerosView ambitos={ambitos} />}
      {view === 'movimientos' && <MovimientosView ambitos={ambitos} />}
      {view === 'obligaciones' && <ObligacionesView ambitos={ambitos} />}
      {view === 'fiscal' && <FiscalView ambitos={ambitos} />}
    </div>
  )
}

function TabGrupo({
  label,
  acento,
  tabs,
  view,
  onSelect
}: {
  label: string
  acento: string
  tabs: Array<{ id: View; label: string }>
  view: View
  onSelect: (v: View) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: acento, letterSpacing: '0.15em' }}>{label}</span>
      <div style={{ display: 'flex', gap: 0 }}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 'var(--text-sm)',
              letterSpacing: '0.06em',
              padding: '6px 16px',
              cursor: 'pointer',
              color: view === t.id ? acento : 'var(--color-text-muted)',
              background: view === t.id ? hexToRgba(acento, 0.32) : 'transparent',
              border: view === t.id ? `1px solid ${acento}` : `1px solid ${hexToRgba(acento, 0.15)}`,
              borderRadius: i === 0 ? '3px 0 0 3px' : i === tabs.length - 1 ? '0 3px 3px 0' : 0,
              marginLeft: i === 0 ? 0 : -1
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
