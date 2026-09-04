import { useState, useEffect } from 'react'
import { type Ambito } from './finanzas/shared'
import { FinanzasDashboard } from './finanzas/FinanzasDashboard'
import { CuentasView } from './finanzas/CuentasView'
import { VistaMensualView } from './finanzas/VistaMensualView'
import { CategoriasView } from './finanzas/CategoriasView'
import { TercerosView } from './finanzas/TercerosView'
import { MovimientosView } from './finanzas/MovimientosView'
import { ObligacionesView } from './finanzas/ObligacionesView'
import { FiscalView } from './finanzas/FiscalView'

type View = 'dashboard' | 'cuentas' | 'vista-mensual' | 'categorias' | 'terceros' | 'movimientos' | 'obligaciones' | 'fiscal'

const TABS: Array<{ id: View; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'cuentas', label: 'Cuentas' },
  { id: 'vista-mensual', label: 'Vista mensual' },
  { id: 'categorias', label: 'Categorías' },
  { id: 'terceros', label: 'Terceros' },
  { id: 'movimientos', label: 'Movimientos' },
  { id: 'obligaciones', label: 'Obligaciones' },
  { id: 'fiscal', label: 'Fiscal' }
]

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

        <div style={{ display: 'flex', gap: 0, marginRight: 'var(--notif-gutter)' }}>
          {TABS.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 'var(--text-sm)',
                letterSpacing: '0.06em',
                padding: '6px 16px',
                cursor: 'pointer',
                color: view === t.id ? '#C8A840' : 'var(--color-text-muted)',
                background: view === t.id ? 'rgba(200,168,64,0.32)' : 'transparent',
                border: view === t.id ? '1px solid #C8A840' : '1px solid rgba(200,168,64,0.15)',
                borderRadius: i === 0 ? '3px 0 0 3px' : i === TABS.length - 1 ? '0 3px 3px 0' : 0,
                marginLeft: i === 0 ? 0 : -1
              }}
            >
              {t.label}
            </button>
          ))}
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
