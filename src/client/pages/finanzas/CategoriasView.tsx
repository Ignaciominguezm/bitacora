import { useState, useEffect, useCallback } from 'react'

interface CategoriaNode {
  id: number
  parent_id: number | null
  nombre: string
  tipo: 'gasto' | 'ingreso' | 'ambos'
  orden: number
  activa: boolean
  children: CategoriaNode[]
}

type Tab = 'gasto' | 'ingreso'

interface FormState {
  mode: 'create' | 'edit'
  id?: number
  nombre: string
  tipo: 'gasto' | 'ingreso' | 'ambos' | ''
  parentId: number | null
  parentNombre: string | null
  isRoot: boolean
}

const smallBtn: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 'var(--text-xs)',
  color: '#A09070',
  background: 'transparent',
  border: '1px solid rgba(200,168,64,0.2)',
  padding: '2px 8px',
  cursor: 'pointer',
  letterSpacing: '0.03em'
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

// Aplana el árbol para poblar el selector "mover a", excluyendo el propio
// nodo y sus descendientes (evita ofrecer un ciclo desde la UI — el
// backend también lo valida, esto es solo para no mostrar opciones inválidas).
function flattenExcluding(nodes: CategoriaNode[], excludeId: number | undefined, depth = 0): Array<{ id: number; label: string }> {
  const out: Array<{ id: number; label: string }> = []
  for (const n of nodes) {
    if (n.id === excludeId) continue
    out.push({ id: n.id, label: `${'—'.repeat(depth)} ${n.nombre}` })
    out.push(...flattenExcluding(n.children, excludeId, depth + 1))
  }
  return out
}

function isDescendant(node: CategoriaNode, id: number): boolean {
  if (node.id === id) return true
  return node.children.some((c) => isDescendant(c, id))
}

export function CategoriasView() {
  const [tab, setTab] = useState<Tab>('gasto')
  const [tree, setTree] = useState<CategoriaNode[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [form, setForm] = useState<FormState | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchTree = useCallback(async (t: Tab) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/finanzas/categorias?tipo=${t}`, { credentials: 'include' })
      const data = await res.json()
      setTree(data.categorias ?? [])
    } catch {
      // keep stale
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTree(tab)
  }, [tab, fetchTree])

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openCreateRoot() {
    setFormError(null)
    setForm({ mode: 'create', nombre: '', tipo: tab, parentId: null, parentNombre: null, isRoot: true })
  }

  function openCreateChild(parent: CategoriaNode) {
    setFormError(null)
    setForm({ mode: 'create', nombre: '', tipo: parent.tipo, parentId: parent.id, parentNombre: parent.nombre, isRoot: false })
  }

  function openEdit(node: CategoriaNode) {
    setFormError(null)
    setForm({ mode: 'edit', id: node.id, nombre: node.nombre, tipo: node.tipo, parentId: node.parent_id, parentNombre: null, isRoot: node.parent_id === null })
  }

  function closeForm() {
    setForm(null)
    setFormError(null)
  }

  async function submitForm() {
    if (!form) return
    if (!form.nombre.trim()) return setFormError('El nombre es obligatorio')

    setSaving(true)
    setFormError(null)
    try {
      let res: Response
      if (form.mode === 'create') {
        res = await fetch('/api/finanzas/categorias', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: form.nombre.trim(), tipo: form.tipo, parent_id: form.parentId })
        })
      } else {
        res = await fetch(`/api/finanzas/categorias/${form.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: form.nombre.trim(), parent_id: form.parentId })
        })
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setFormError(data.error ?? 'Error al guardar')
        return
      }
      closeForm()
      await fetchTree(tab)
    } catch {
      setFormError('Error de red')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActiva(node: CategoriaNode) {
    const action = node.activa ? 'archivar' : 'activar'
    try {
      const res = await fetch(`/api/finanzas/categorias/${node.id}/${action}`, { method: 'PATCH', credentials: 'include' })
      if (res.ok) {
        await fetchTree(tab)
      } else {
        const data = await res.json().catch(() => ({}))
        window.alert(data.error ?? 'No se pudo archivar')
      }
    } catch {
      window.alert('Error de red')
    }
  }

  async function reorder(siblings: CategoriaNode[], node: CategoriaNode, direction: 'up' | 'down') {
    const idx = siblings.findIndex((s) => s.id === node.id)
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= siblings.length) return
    const target = siblings[targetIdx]

    try {
      await Promise.all([
        fetch(`/api/finanzas/categorias/${node.id}`, {
          method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orden: target.orden })
        }),
        fetch(`/api/finanzas/categorias/${target.id}`, {
          method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orden: node.orden })
        })
      ])
      await fetchTree(tab)
    } catch {
      // keep stale — próxima carga reconcilia
    }
  }

  const parentOptions = form ? flattenExcluding(tree, form.mode === 'edit' ? form.id : undefined) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {(['gasto', 'ingreso'] as Tab[]).map((t, i) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 'var(--text-sm)',
                letterSpacing: '0.06em',
                padding: '6px 16px',
                cursor: 'pointer',
                color: tab === t ? '#C8A840' : 'var(--color-text-muted)',
                background: tab === t ? 'rgba(200,168,64,0.32)' : 'transparent',
                border: tab === t ? '1px solid #C8A840' : '1px solid rgba(200,168,64,0.15)',
                borderRadius: i === 0 ? '3px 0 0 3px' : '0 3px 3px 0',
                marginLeft: i === 0 ? 0 : -1
              }}
            >
              {t === 'gasto' ? 'Gastos' : 'Ingresos'}
            </button>
          ))}
        </div>
        <button onClick={openCreateRoot} style={{ ...smallBtn, color: '#C8A840', borderColor: 'rgba(200,168,64,0.35)', padding: '6px 14px' }}>
          + Nuevo grupo
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--color-text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-base)' }}>Cargando...</div>
      ) : (
        <div style={{ background: '#13100A', border: '1px solid rgba(200,168,64,0.15)', padding: 8 }}>
          {tree.length === 0 && (
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', padding: '8px 12px' }}>
              Sin categorías de este tipo.
            </div>
          )}
          {tree.map((node) => (
            <CategoriaRow
              key={node.id}
              node={node}
              depth={0}
              siblings={tree}
              expanded={expanded}
              onToggle={toggle}
              onAddChild={openCreateChild}
              onEdit={openEdit}
              onToggleActiva={toggleActiva}
              onReorder={reorder}
            />
          ))}
        </div>
      )}

      {form && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={closeForm}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#13100A', border: '1px solid rgba(200,168,64,0.25)', padding: 24, width: 380, maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: 'var(--text-lg)', color: '#C8A840', letterSpacing: '0.08em' }}>
              {form.mode === 'create' ? (form.isRoot ? 'NUEVO GRUPO' : `NUEVA SUBCATEGORÍA${form.parentNombre ? ` — ${form.parentNombre.toUpperCase()}` : ''}`) : 'EDITAR CATEGORÍA'}
            </span>

            <div>
              <label style={{ ...smallBtn, display: 'block', border: 'none', padding: 0, marginBottom: 4, cursor: 'default' }}>NOMBRE</label>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={inputStyle} placeholder="Ej. Peluquería" />
            </div>

            {form.mode === 'create' && form.isRoot && (
              <div>
                <label style={{ ...smallBtn, display: 'block', border: 'none', padding: 0, marginBottom: 4, cursor: 'default' }}>TIPO</label>
                <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as FormState['tipo'] })} style={inputStyle}>
                  <option value="gasto">Gasto</option>
                  <option value="ingreso">Ingreso</option>
                  <option value="ambos">Ambos</option>
                </select>
              </div>
            )}

            {form.mode === 'create' && !form.isRoot && (
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                Tipo heredado del grupo padre: <span style={{ color: '#C8A840' }}>{form.tipo}</span>
              </div>
            )}

            {form.mode === 'edit' && (
              <div>
                <label style={{ ...smallBtn, display: 'block', border: 'none', padding: 0, marginBottom: 4, cursor: 'default' }}>MOVER A (PADRE)</label>
                <select
                  value={form.parentId ?? ''}
                  onChange={(e) => setForm({ ...form, parentId: e.target.value ? Number(e.target.value) : null })}
                  style={inputStyle}
                >
                  <option value="">— Sin padre (grupo raíz) —</option>
                  {parentOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </div>
            )}

            {formError && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-xs)', color: '#f87171' }}>{formError}</span>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={closeForm} style={{ ...smallBtn, padding: '7px 16px' }}>Cancelar</button>
              <button
                onClick={submitForm}
                disabled={saving}
                style={{ ...smallBtn, color: '#C8A840', borderColor: 'rgba(200,168,64,0.35)', padding: '7px 16px', opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CategoriaRow({
  node,
  depth,
  siblings,
  expanded,
  onToggle,
  onAddChild,
  onEdit,
  onToggleActiva,
  onReorder
}: {
  node: CategoriaNode
  depth: number
  siblings: CategoriaNode[]
  expanded: Set<number>
  onToggle: (id: number) => void
  onAddChild: (n: CategoriaNode) => void
  onEdit: (n: CategoriaNode) => void
  onToggleActiva: (n: CategoriaNode) => void
  onReorder: (siblings: CategoriaNode[], n: CategoriaNode, dir: 'up' | 'down') => void
}) {
  const hasChildren = node.children.length > 0
  const isOpen = expanded.has(node.id)

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          paddingLeft: 10 + depth * 22,
          opacity: node.activa ? 1 : 0.45,
          borderBottom: '1px solid rgba(200,168,64,0.05)',
          gap: 10,
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <button
            onClick={() => hasChildren && onToggle(node.id)}
            style={{ width: 16, background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: hasChildren ? 'pointer' : 'default', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-sm)', flexShrink: 0 }}
          >
            {hasChildren ? (isOpen ? '▾' : '▸') : '·'}
          </button>
          <span style={{ fontFamily: depth === 0 ? 'Cinzel, serif' : 'DM Sans, sans-serif', fontSize: depth === 0 ? 'var(--text-md)' : 'var(--text-sm)', color: '#E8DCC8', letterSpacing: depth === 0 ? '0.04em' : undefined }}>
            {node.nombre}
          </span>
          {!node.activa && (
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', border: '1px solid rgba(200,168,64,0.15)', padding: '1px 5px' }}>
              archivada
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button onClick={() => onReorder(siblings, node, 'up')} style={{ ...smallBtn, padding: '1px 6px' }} title="Subir">↑</button>
          <button onClick={() => onReorder(siblings, node, 'down')} style={{ ...smallBtn, padding: '1px 6px' }} title="Bajar">↓</button>
          <button onClick={() => onAddChild(node)} style={smallBtn}>+ Sub</button>
          <button onClick={() => onEdit(node)} style={smallBtn}>Editar</button>
          <button
            onClick={() => onToggleActiva(node)}
            style={{ ...smallBtn, color: node.activa ? '#f87171' : '#4ade80' }}
          >
            {node.activa ? 'Archivar' : 'Activar'}
          </button>
        </div>
      </div>

      {hasChildren && isOpen && node.children.map((child) => (
        <CategoriaRow
          key={child.id}
          node={child}
          depth={depth + 1}
          siblings={node.children}
          expanded={expanded}
          onToggle={onToggle}
          onAddChild={onAddChild}
          onEdit={onEdit}
          onToggleActiva={onToggleActiva}
          onReorder={onReorder}
        />
      ))}
    </>
  )
}
