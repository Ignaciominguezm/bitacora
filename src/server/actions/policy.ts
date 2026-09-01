import type { ActionProposal } from './parseActionProposal.js'
import { ACTION_REGISTRY, type RiskLevel } from './registry.js'

export type PolicyDecision =
  | { kind: 'DRAFT' }
  | { kind: 'REJECTED_UNSUPPORTED' }
  | { kind: 'EXECUTE_DIRECT'; riskLevel: RiskLevel }
  | { kind: 'PENDING'; approvalMode: 'normal' | 'reforzada'; riskLevel: RiskLevel }

export type Origen = 'orden_explicita' | 'iniciativa'

// origen ausente o con cualquier valor que no sea exactamente
// 'orden_explicita' cae a 'iniciativa' — el valor menos privilegiado, nunca
// al revés: un origen dudoso no debe colarse como orden explícita.
export function normalizeOrigen(v: unknown): Origen {
  return v === 'orden_explicita' ? 'orden_explicita' : 'iniciativa'
}

// completo ausente (o cualquier cosa que no sea literalmente `true`) cae a
// false — igual criterio: ante duda, la propuesta se trata como incompleta
// (DRAFT), nunca como lista para ejecutar o para cola de aprobación.
export function normalizeCompleto(v: unknown): boolean {
  return v === true
}

// Núcleo puro de la tabla — deliberadamente desacoplado de ACTION_REGISTRY
// (recibe el riskLevel ya resuelto, o undefined si el tipo no existe en el
// registro) para poder probar las 6 filas exactas sin depender de que
// exista una acción real de riesgo 'fuerte' en el registro. decideAction(),
// más abajo, es el punto de entrada real que sí resuelve contra el
// registry.
//
// Tabla EXACTA de la tarea #723-MVP:
//   tipo desconocido en ACTION_REGISTRY            -> REJECTED_UNSUPPORTED
//   completo=false                                  -> DRAFT
//   orden_explicita + completo + riesgo bajo/medio  -> EXECUTE_DIRECT
//   orden_explicita + completo + riesgo fuerte      -> PENDING (reforzada)
//   iniciativa      + completo + riesgo bajo/medio  -> PENDING (normal)
//   iniciativa      + completo + riesgo fuerte      -> PENDING (reforzada)
//
// El tipo desconocido se comprueba antes que completo a propósito: un tipo
// no soportado "nunca ejecuta", ni siquiera como DRAFT.
export function decide(origenRaw: unknown, completoRaw: unknown, riskLevel: RiskLevel | undefined): PolicyDecision {
  if (!riskLevel) return { kind: 'REJECTED_UNSUPPORTED' }

  const completo = normalizeCompleto(completoRaw)
  if (!completo) return { kind: 'DRAFT' }

  const origen = normalizeOrigen(origenRaw)

  if (origen === 'orden_explicita') {
    if (riskLevel === 'fuerte') return { kind: 'PENDING', approvalMode: 'reforzada', riskLevel }
    return { kind: 'EXECUTE_DIRECT', riskLevel }
  }

  // iniciativa
  if (riskLevel === 'fuerte') return { kind: 'PENDING', approvalMode: 'reforzada', riskLevel }
  return { kind: 'PENDING', approvalMode: 'normal', riskLevel }
}

// suggested_risk_level del proposal se ignora siempre — el riesgo lo fija
// ACTION_REGISTRY[type].riskLevel, nunca lo que Unria sugiera de sí misma.
export function decideAction(proposal: ActionProposal): PolicyDecision {
  const entry = ACTION_REGISTRY[proposal.action_type]
  return decide(proposal.origen, proposal.completo, entry?.riskLevel)
}
