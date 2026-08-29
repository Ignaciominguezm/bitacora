export type Ambito = 'proyectos_personales' | 'clientes' | 'ocio'
export type Modo = 'diseno' | 'implementacion' | 'revision'

export interface CabinaMessage {
  role: 'user' | 'assistant'
  content: string
  ambito: Ambito
  modo: Modo
  // Solo local — nunca viaja al/desde el servidor. Marca un turno que se
  // cortó (red o cambio de sesión a media respuesta) para que la UI lo
  // distinga de una respuesta completa; lo que ya se haya generado del lado
  // del servidor queda igualmente persistido en BD (ver cabina.ts).
  incomplete?: boolean
}

export interface CabinaSessionSummary {
  id: string
  ambito: Ambito
  modo: Modo
  title: string
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface CabinaSessionDetail extends CabinaSessionSummary {
  messages: CabinaMessage[]
  // true si el servidor sigue generando un turno para esta sesión (p. ej.
  // se envió un mensaje y se cambió de pestaña antes de que respondiera).
  processing: boolean
}

// #723-MVP — fila de cabina_approvals tal como la devuelve
// src/server/routes/approvals.ts. Ver src/server/actions/ para el pipeline
// que las crea (parser + registry + policy).
export type ActionOrigen = 'orden_explicita' | 'iniciativa'
export type ActionRiskLevel = 'bajo' | 'medio' | 'fuerte'
export type ApprovalMode = 'normal' | 'reforzada'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled' | 'executed' | 'failed'
export type ExecutionMode = 'dry_run' | 'real'

export interface CabinaApproval {
  id: string
  session_id: string
  message_id: string | null
  action_type: string
  summary: string
  origen: ActionOrigen
  risk_level: ActionRiskLevel
  approval_mode: ApprovalMode
  payload: Record<string, unknown>
  status: ApprovalStatus
  execution_mode: ExecutionMode | null
  result: Record<string, unknown> | null
  error: string | null
  requested_by: string
  approved_by: string | null
  approved_at: string | null
  expires_at: string
  created_at: string
  executed_at: string | null
}
