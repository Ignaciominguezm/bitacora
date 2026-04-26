import { useState, type FormEvent } from 'react'

interface Props {
  onLogin: () => void
}

export function LoginPage({ onLogin }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password })
      })

      if (res.ok) {
        onLogin()
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error || 'Credenciales incorrectas')
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0D0A06',
        flexDirection: 'column',
        gap: 0
      }}
    >
      {/* Decorative top border */}
      <div
        style={{
          width: 320,
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(200,168,64,0.6), transparent)',
          marginBottom: 40
        }}
      />

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
          width: 320
        }}
      >
        <h1
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: 32,
            fontWeight: 600,
            color: '#C8A840',
            margin: 0,
            letterSpacing: '0.1em'
          }}
        >
          Bitácora
        </h1>

        <p
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
            color: '#5A4A30',
            margin: 0,
            letterSpacing: '0.15em',
            textTransform: 'uppercase'
          }}
        >
          IMM CORE SYSTEM SL
        </p>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            autoFocus
            required
            style={{
              width: '100%',
              padding: '12px 16px',
              background: '#1A1510',
              border: '1px solid rgba(200,168,64,0.25)',
              color: '#E8DCC8',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 14,
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(200,168,64,0.6)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(200,168,64,0.25)')}
          />

          {error && (
            <p
              style={{
                margin: 0,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 12,
                color: '#e05050',
                textAlign: 'center'
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: loading ? 'rgba(200,168,64,0.1)' : 'rgba(200,168,64,0.15)',
              border: '1px solid rgba(200,168,64,0.4)',
              color: '#C8A840',
              fontFamily: 'Cinzel, serif',
              fontSize: 13,
              letterSpacing: '0.1em',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s, border-color 0.2s'
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.background = 'rgba(200,168,64,0.25)'
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.background = 'rgba(200,168,64,0.15)'
            }}
          >
            {loading ? 'Accediendo...' : 'Acceder'}
          </button>
        </div>
      </form>

      <div
        style={{
          width: 320,
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(200,168,64,0.6), transparent)',
          marginTop: 40
        }}
      />
    </div>
  )
}
