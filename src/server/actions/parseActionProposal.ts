// Contrato del bloque que Unria puede emitir dentro de su respuesta de
// texto (como mucho uno; si hay varios, se usa el primero y se ignora el
// resto):
//   [ACCION_PROPUESTA]
//   { "action_type": "...", "summary": "...", "origen": "...",
//     "completo": true|false, "suggested_risk_level": "...", "payload": {...} }
//   [/ACCION_PROPUESTA]
//
// suggested_risk_level viaja en el bloque pero el backend lo ignora siempre
// (ver policy.ts) — está aquí solo para que quien lo lea (debug humano)
// tenga una pista de lo que Unria creía, nunca para decidir nada.
export interface ActionProposal {
  action_type: string
  summary?: string
  origen?: string
  completo?: boolean
  suggested_risk_level?: string
  payload?: Record<string, unknown>
}

export type ParsedActionProposal = ActionProposal | { error: 'malformed' } | null

const BLOCK_RE = /\[ACCION_PROPUESTA\]([\s\S]*?)\[\/ACCION_PROPUESTA\]/

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Extrae y parsea el primer bloque [ACCION_PROPUESTA]/[/ACCION_PROPUESTA] de
// un texto. Nunca lanza: JSON.parse va envuelto en try/catch, y cualquier
// resultado que no tenga forma de propuesta usable (no es objeto, o
// action_type no es un string) cuenta también como 'malformed' — evita que
// el resto del pipeline (registry/policy) tenga que defenderse de formas
// imposibles.
export function parseActionProposal(text: string): ParsedActionProposal {
  const match = BLOCK_RE.exec(text)
  if (!match) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(match[1].trim())
  } catch {
    return { error: 'malformed' }
  }

  if (!isPlainObject(parsed) || typeof parsed.action_type !== 'string' || parsed.action_type.trim() === '') {
    return { error: 'malformed' }
  }

  return parsed as unknown as ActionProposal
}

// Lo que se guarda/renderiza como mensaje del asistente nunca incluye el
// bloque crudo — exista o no exista, sea válido o esté malformado. Solo se
// quita el primer bloque (el que también parsea parseActionProposal); si
// hubiera más, quedan como texto normal (se ignoran a efectos de acción,
// pero no son responsabilidad de esta función ocultarlos).
export function stripActionProposal(text: string): string {
  return text.replace(BLOCK_RE, '').trim()
}
