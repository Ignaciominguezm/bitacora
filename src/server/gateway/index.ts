import type { AgentGateway } from './types.js'
import { MockAdapter } from './mockAdapter.js'

export type { AgentGateway, AgentContext, AgentMessage, AgentSessionRef, Ambito, Modo } from './types.js'

let gateway: AgentGateway | null = null

// Único punto de decisión de qué adaptador está activo. Hoy solo existe
// MockAdapter; el día que haya un adaptador real (p. ej. hacia OpenClaw)
// se añade aquí sin tocar rutas ni cliente.
export function getGateway(): AgentGateway {
  if (!gateway) gateway = new MockAdapter()
  return gateway
}
