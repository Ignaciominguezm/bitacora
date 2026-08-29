export type RiskLevel = 'bajo' | 'medio' | 'fuerte'

export interface ValidationResult {
  ok: boolean
  errors: string[]
}

export interface ActionRegistryEntry {
  riskLevel: RiskLevel
  // Metadata descriptiva del tipo de acción — la tabla de policy.ts (la
  // única que decide clasificación) no la lee; queda documentada aquí por
  // si un encargo futuro la necesita.
  defaultApproval: 'required_if_initiative'
  timeoutMinutes: number
  // Nombre del executor en src/server/actions/executors/index.ts — no la
  // función misma, para poder guardar el registry en JSON/logs sin arrastrar
  // código.
  executor: string
  validatePayload: (payload: Record<string, unknown>) => ValidationResult
}

function validateCoreworkCreateTaskPayload(payload: Record<string, unknown>): ValidationResult {
  const errors: string[] = []
  const title = payload?.title
  if (typeof title !== 'string' || title.trim() === '') {
    errors.push('title obligatorio y no vacío')
  }
  return { ok: errors.length === 0, errors }
}

// type ausente de este registro => acción no soportada (REJECTED_UNSUPPORTED
// en policy.ts) — nunca se ejecuta, sin importar completo/origen/riesgo.
export const ACTION_REGISTRY: Record<string, ActionRegistryEntry> = {
  'corework.create_task': {
    riskLevel: 'medio',
    defaultApproval: 'required_if_initiative',
    timeoutMinutes: 24 * 60,
    executor: 'coreworkCreateTask',
    validatePayload: validateCoreworkCreateTaskPayload
  }
}

export type ActionType = keyof typeof ACTION_REGISTRY
