import { useState, useEffect, useRef } from 'react'

interface Contact {
  id: number
  full_name: string
  company_name?: string
  phone?: string
  email?: string
}

export function CRMWidget() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Contact[]>([])
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/crm/pending', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: unknown[]) => setPendingCount(d.length))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/crm/search?q=${encodeURIComponent(query)}`, {
          credentials: 'include'
        })
        const data: Contact[] = await res.json()
        setResults(data)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 350)
  }, [query])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid rgba(200,168,64,0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: 11, color: '#A09070', letterSpacing: '0.08em' }}>
          CRM
        </span>
        {pendingCount !== null && pendingCount > 0 && (
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              color: '#fb923c',
              background: 'rgba(251,146,60,0.12)',
              padding: '1px 6px',
              border: '1px solid rgba(251,146,60,0.3)'
            }}
          >
            {pendingCount} pendientes
          </span>
        )}
      </div>

      {/* Search */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(200,168,64,0.08)' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar contacto..."
          style={{
            width: '100%',
            padding: '6px 10px',
            background: '#13100A',
            border: '1px solid rgba(200,168,64,0.2)',
            color: '#E8DCC8',
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 12,
            outline: 'none'
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(200,168,64,0.5)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(200,168,64,0.2)')}
        />
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {searching && (
          <div style={{ padding: 12, color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
            Buscando...
          </div>
        )}
        {!searching && results.length === 0 && query && (
          <div style={{ padding: 12, color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
            Sin resultados
          </div>
        )}
        {!searching && results.length === 0 && !query && pendingCount === 0 && (
          <div style={{ padding: 12, color: '#5A4A30', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
            Busca un contacto
          </div>
        )}
        {results.map((contact) => (
          <div
            key={contact.id}
            style={{
              padding: '6px 12px',
              borderBottom: '1px solid rgba(200,168,64,0.06)',
              cursor: 'pointer',
              transition: 'background 0.1s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(200,168,64,0.05)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: '#E8DCC8' }}>
              {contact.full_name}
            </div>
            {contact.company_name && (
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A4A30' }}>
                {contact.company_name}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
