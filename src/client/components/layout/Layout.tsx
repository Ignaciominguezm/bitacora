import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { DashboardPage } from '../../pages/DashboardPage'
import { PlaceholderPage } from '../../pages/PlaceholderPage'

type Page = 'dashboard' | 'conversations' | 'crm' | 'tasks' | 'team' | 'system'

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
        {page === 'dashboard' && <DashboardPage />}
        {page === 'conversations' && <PlaceholderPage title="Conversaciones" icon="◈" />}
        {page === 'crm' && <PlaceholderPage title="CRM" icon="◎" />}
        {page === 'tasks' && <PlaceholderPage title="Tareas" icon="◻" />}
        {page === 'team' && <PlaceholderPage title="Equipo" icon="◈" />}
        {page === 'system' && <PlaceholderPage title="Sistema" icon="⊙" />}
      </main>
    </div>
  )
}
