import { useState, useEffect } from 'react'
import { LoginPage } from './pages/LoginPage'
import { Layout } from './components/layout/Layout'

type AuthState = 'loading' | 'unauthenticated' | 'authenticated'

export default function App() {
  const [auth, setAuth] = useState<AuthState>('loading')

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { authenticated: boolean }) => setAuth(d.authenticated ? 'authenticated' : 'unauthenticated'))
      .catch(() => setAuth('unauthenticated'))
  }, [])

  if (auth === 'loading') {
    return (
      <div style={{ background: '#0D0A06', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#C8A840', fontFamily: 'JetBrains Mono, monospace', fontSize: 14 }}>
          cargando...
        </span>
      </div>
    )
  }

  if (auth === 'unauthenticated') {
    return <LoginPage onLogin={() => setAuth('authenticated')} />
  }

  return <Layout onLogout={() => setAuth('unauthenticated')} />
}
