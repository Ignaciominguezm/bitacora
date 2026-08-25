import type { AgentGateway } from './types.js'
import { MockAdapter } from './mockAdapter.js'
import { OpenClawCliAdapter } from './openClawCliAdapter.js'
import { OpenClawGatewayAdapter } from './openClawGatewayAdapter.js'
import { FallbackAdapter } from './fallbackAdapter.js'

export type { AgentGateway, AgentContext, AgentMessage, AgentSessionRef, Ambito, Modo } from './types.js'

let gateway: AgentGateway | null = null

// Único punto de decisión de qué adaptador está activo — rutas y cliente
// nunca conocen cuál es. 'openclaw-cli' invoca el CLI en el mismo host;
// 'openclaw-gateway' llama al gateway HTTP de OpenClaw (Tailscale). Ambos
// caen a MockAdapter si fallan en tiempo de ejecución (ver
// fallbackAdapter.ts); cualquier otro valor (o ausente) usa Mock puro, sin
// intentar siquiera contactar con OpenClaw.
export function getGateway(): AgentGateway {
  if (!gateway) {
    const mode = process.env.CABINA_GATEWAY || 'mock'
    if (mode === 'openclaw-cli') {
      gateway = new FallbackAdapter(new OpenClawCliAdapter(), new MockAdapter(), 'OpenClawCliAdapter')
    } else if (mode === 'openclaw-gateway') {
      gateway = new FallbackAdapter(new OpenClawGatewayAdapter(), new MockAdapter(), 'OpenClawGatewayAdapter')
    } else {
      gateway = new MockAdapter()
    }
  }
  return gateway
}
