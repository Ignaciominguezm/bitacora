import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { DashboardPage } from '../../pages/DashboardPage'
import { TeamPage } from '../../pages/TeamPage'
import { TareasPage } from '../../pages/TareasPage'
import { SistemaPage } from '../../pages/SistemaPage'
import { ConversacionesPage } from '../../pages/ConversacionesPage'
import { CabinaUnriaPage } from '../../pages/CabinaUnriaPage'
import { CRMPage } from '../../pages/CRMPage'
import { TiempoPage } from '../../pages/TiempoPage'
import { AjustesPage } from '../../pages/AjustesPage'
import { FinanzasPage } from '../../pages/FinanzasPage'
import { NotificationCenter } from '../notifications/NotificationCenter'

type Page = 'dashboard' | 'conversations' | 'cabina' | 'crm' | 'tasks' | 'team' | 'tiempo' | 'finanzas' | 'system' | 'ajustes'

interface Props {
  onLogout: () => void
}

export function Layout({ onLogout }: Props) {
  const [page, setPage] = useState<Page>('dashboard')

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    onLogout()
  }

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <Sidebar currentPage={page} onNavigate={setPage} onLogout={handleLogout} />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {page === 'dashboard' && <DashboardPage onOpenSistema={() => setPage('system')} />}
        {page === 'conversations' && <ConversacionesPage />}
        {page === 'cabina' && <CabinaUnriaPage />}
        {page === 'crm' && <CRMPage />}
        {page === 'tasks' && <TareasPage />}
        {page === 'team' && <TeamPage />}
        {page === 'tiempo' && <TiempoPage />}
        {page === 'finanzas' && <FinanzasPage />}
        {page === 'system' && <SistemaPage />}
        {page === 'ajustes' && <AjustesPage />}
      </main>
      <NotificationCenter onNavigate={setPage} />
    </div>
  )
}
