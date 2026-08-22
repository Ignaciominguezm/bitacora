import type { AgentContext, AgentGateway, AgentSessionRef } from './types.js'

const AMBITO_LABEL: Record<AgentContext['ambito'], string> = {
  proyectos_personales: 'Proyectos personales',
  clientes: 'Clientes',
  ocio: 'Ocio'
}

const MODO_LABEL: Record<AgentContext['modo'], string> = {
  diseno: 'Diseño',
  implementacion: 'Implementación',
  revision: 'Revisión'
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Adaptador provisional. No hay endpoint real de OpenClaw alcanzable desde
// este repo (verificado antes de esta entrega) — este mock es el único
// AgentGateway hasta que exista un adaptador real que hable con OpenClaw.
export class MockAdapter implements AgentGateway {
  async *send(message: string, context: AgentContext, session: AgentSessionRef): AsyncIterable<string> {
    const reply =
      `[Simulación — sin conexión real a Unria] ` +
      `Ámbito: ${AMBITO_LABEL[context.ambito]} · Modo: ${MODO_LABEL[context.modo]} · ` +
      `Sesión: ${session.sessionId} · Historial previo: ${session.history.length} mensaje(s).\n\n` +
      `Recibido: "${message}"`

    const words = reply.split(' ')
    for (const word of words) {
      yield word + ' '
      await sleep(15)
    }
  }
}
