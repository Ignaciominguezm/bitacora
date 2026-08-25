import { useEffect, useRef, useState } from 'react'
import type { Ambito, CabinaMessage, CabinaSessionDetail, CabinaSessionSummary, Modo } from '../types/cabina'

const DEFAULT_AMBITO: Ambito = 'proyectos_personales'
const DEFAULT_MODO: Modo = 'diseno'
const DEFAULT_TITLE = 'Nueva conversación'

function emptyMessage(role: CabinaMessage['role'], ambito: Ambito, modo: Modo): CabinaMessage {
  return { role, content: '', ambito, modo }
}

// Estado + transporte de una conversación de Cabina. Habla solo con
// /api/cabina/* — no conoce el gateway ni cómo se genera la respuesta.
export function useAgentSession() {
  const [sessions, setSessions] = useState<CabinaSessionSummary[]>([])
  const [archivedSessions, setArchivedSessions] = useState<CabinaSessionSummary[]>([])
  const [viewArchived, setViewArchived] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [ambito, setAmbito] = useState<Ambito>(DEFAULT_AMBITO)
  const [modo, setModo] = useState<Modo>(DEFAULT_MODO)
  const [title, setTitle] = useState(DEFAULT_TITLE)
  const [messages, setMessages] = useState<CabinaMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  // Permite a sendMessage comprobar, tras un await, si el usuario sigue en
  // la misma sesión antes de tocar `messages` — evita que una respuesta (o
  // un marcado de error) de una sesión abandonada corrompa la que se ve
  // ahora tras un cambio de sesión a media respuesta.
  const activeIdRef = useRef<string | null>(null)
  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  useEffect(() => {
    let cancelled = false
    fetch('/api/cabina/history', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: CabinaSessionSummary[]) => {
        if (cancelled) return
        setSessions(data)
        if (data.length > 0) void selectSession(data[0].id)
      })
      .catch(() => { if (!cancelled) setError('No se pudo cargar el historial') })
      .finally(() => { if (!cancelled) setLoadingHistory(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function selectSession(id: string) {
    abortRef.current?.abort()
    setStreaming(false)
    setActiveId(id)
    setError(null)
    try {
      const res = await fetch(`/api/cabina/session/${id}`, { credentials: 'include' })
      if (!res.ok) throw new Error('not found')
      const data: CabinaSessionDetail = await res.json()
      setAmbito(data.ambito)
      setModo(data.modo)
      setTitle(data.title)
      setMessages(Array.isArray(data.messages) ? data.messages : [])
    } catch {
      setMessages([])
      setError('No se pudo cargar la conversación')
    }
  }

  async function createSession(nextAmbito: Ambito, nextModo: Modo): Promise<string | null> {
    try {
      const res = await fetch('/api/cabina/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ambito: nextAmbito, modo: nextModo })
      })
      if (!res.ok) throw new Error('create failed')
      const data: CabinaSessionSummary = await res.json()
      setSessions((prev) => [data, ...prev])
      setActiveId(data.id)
      setAmbito(data.ambito)
      setModo(data.modo)
      setTitle(data.title)
      setMessages([])
      setError(null)
      return data.id
    } catch {
      setError('No se pudo crear la conversación')
      return null
    }
  }

  async function newSession() {
    abortRef.current?.abort()
    await createSession(ambito, modo)
  }

  async function refreshSessionMeta(id: string) {
    try {
      const res = await fetch(`/api/cabina/session/${id}`, { credentials: 'include' })
      if (!res.ok) return
      const data: CabinaSessionDetail = await res.json()
      const summary: CabinaSessionSummary = {
        id: data.id, ambito: data.ambito, modo: data.modo, title: data.title,
        archived_at: data.archived_at, created_at: data.created_at, updated_at: data.updated_at
      }
      setSessions((prev) => [summary, ...prev.filter((s) => s.id !== id)])
      // activeIdRef, no el `activeId` de estado: este closure puede venir de
      // un render donde activeId todavía era null (primer mensaje de una
      // sesión recién creada) aunque la sesión activa real ya sea `id`.
      if (activeIdRef.current === id) setTitle(data.title)
    } catch { /* no crítico — el título/orden local sigue siendo razonable */ }
  }

  async function renameSession(newTitle: string) {
    const trimmed = newTitle.trim()
    if (!trimmed || !activeId) return
    try {
      const res = await fetch(`/api/cabina/session/${activeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: trimmed })
      })
      if (!res.ok) throw new Error('rename failed')
      const data: CabinaSessionSummary = await res.json()
      setTitle(data.title)
      setSessions((prev) => prev.map((s) => (s.id === data.id ? data : s)))
    } catch {
      setError('No se pudo renombrar la conversación')
    }
  }

  // Cambia entre la lista activa y la archivada, recargando desde el
  // servidor (cubre también el caso de volver a "Activas" tras desarchivar
  // algo, sin tener que sincronizar los dos arrays a mano).
  async function setArchivedView(archived: boolean) {
    setViewArchived(archived)
    try {
      const res = await fetch(`/api/cabina/history?archived=${archived}`, { credentials: 'include' })
      const data: CabinaSessionSummary[] = await res.json()
      if (archived) setArchivedSessions(data)
      else setSessions(data)
    } catch {
      setError('No se pudo cargar el historial')
    }
  }

  // Archivar es reversible — solo oculta de la lista activa. Si era la
  // sesión abierta, la deseleccionamos (ya no tiene sentido seguir
  // "sobre" una conversación que acaba de desaparecer de la lista).
  async function archiveSession(id: string) {
    try {
      const res = await fetch(`/api/cabina/session/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ archived: true })
      })
      if (!res.ok) throw new Error('archive failed')
      setSessions((prev) => prev.filter((s) => s.id !== id))
      if (activeId === id) {
        setActiveId(null)
        setMessages([])
        setTitle(DEFAULT_TITLE)
      }
    } catch {
      setError('No se pudo archivar la conversación')
    }
  }

  async function unarchiveSession(id: string) {
    try {
      const res = await fetch(`/api/cabina/session/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ archived: false })
      })
      if (!res.ok) throw new Error('unarchive failed')
      setArchivedSessions((prev) => prev.filter((s) => s.id !== id))
    } catch {
      setError('No se pudo desarchivar la conversación')
    }
  }

  // Irreversible — el servidor ya exige que esté archivada antes de
  // borrarla (mismo "dos pasos" reforzado del lado del backend).
  async function deleteSession(id: string) {
    try {
      const res = await fetch(`/api/cabina/session/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error('delete failed')
      setArchivedSessions((prev) => prev.filter((s) => s.id !== id))
    } catch {
      setError('No se pudo borrar la conversación')
    }
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || streaming) return

    let sessionId = activeId
    if (!sessionId) {
      sessionId = await createSession(ambito, modo)
      if (!sessionId) return
    }

    setError(null)
    setMessages((prev) => [...prev, { role: 'user', content: trimmed, ambito, modo }, emptyMessage('assistant', ambito, modo)])
    setStreaming(true)
    abortRef.current = new AbortController()

    try {
      const res = await fetch(`/api/cabina/session/${sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: abortRef.current.signal,
        body: JSON.stringify({ message: trimmed, ambito, modo })
      })
      if (!res.body) throw new Error('Sin cuerpo de respuesta')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let buffer = ''

      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''
        for (const event of events) {
          const data = event.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n')
          if (data === '[DONE]') break outer
          if (data) {
            fullContent += data
            if (activeIdRef.current === sessionId) {
              setMessages((prev) => {
                const updated = [...prev]
                updated[updated.length - 1] = { role: 'assistant', content: fullContent, ambito, modo }
                return updated
              })
            }
          }
        }
      }

      // El servidor persiste igual aunque nos hayamos ido a otra sesión —
      // solo refrescamos metadatos (título/orden) si seguimos mirándola.
      if (activeIdRef.current === sessionId) await refreshSessionMeta(sessionId)
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError'
      // El servidor sigue consumiendo el gateway y persiste la respuesta
      // aunque el stream se corte aquí (red o abort por cambio de sesión) —
      // ver cabina.ts. Aquí solo marcamos la burbuja local como incompleta,
      // sin descartar lo que ya se había recibido, y solo si seguimos en la
      // misma sesión que originó el envío.
      if (activeIdRef.current === sessionId) {
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last?.role === 'assistant') updated[updated.length - 1] = { ...last, incomplete: true }
          return updated
        })
      }
      if (!isAbort) setError('Error al enviar el mensaje')
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  return {
    sessions,
    archivedSessions,
    viewArchived,
    loadingHistory,
    activeId,
    ambito,
    modo,
    title,
    messages,
    streaming,
    error,
    setAmbito,
    setModo,
    selectSession,
    newSession,
    renameSession,
    sendMessage,
    setArchivedView,
    archiveSession,
    unarchiveSession,
    deleteSession
  }
}
