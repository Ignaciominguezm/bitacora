import type { AgentGateway } from './types.js'
import { MockAdapter } from './mockAdapter.js'
import { OpenClawCliAdapter } from './openClawCliAdapter.js'
import { FallbackAdapter } from './fallbackAdapter.js'

export type { AgentGateway, AgentContext, AgentMessage, AgentSessionRef, Ambito, Modo } from './types.js'

let gateway: AgentGateway | null = null

// Único punto de decisión de qué adaptador está activo — rutas y cliente
// nunca conocen cuál es. CABINA_GATEWAY=openclaw-cli activa OpenClaw con
// MockAdapter como respaldo automático si falla en tiempo de ejecución (ver
// fallbackAdapter.ts); cualquier otro valor (o ausente) usa Mock puro, sin
// intentar siquiera lanzar el CLI.
export function getGateway(): AgentGateway {
  if (!gateway) {
    const mode = process.env.CABINA_GATEWAY || 'mock'
    gateway =
      mode === 'openclaw-cli'
        ? new FallbackAdapter(new OpenClawCliAdapter(), new MockAdapter(), 'OpenClawCliAdapter')
        : new MockAdapter()
  }
  return gateway
}
