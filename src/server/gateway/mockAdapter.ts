import type { AgentContext, AgentGateway, AgentSessionRef } from './types.js'
import { AMBITO_LABEL, MODO_LABEL } from './labels.js'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Adaptador provisional. Se usa cuando CABINA_GATEWAY no está en
// 'openclaw-cli', y también como respaldo automático (ver
// gateway/fallbackAdapter.ts) si OpenClawCliAdapter falla en tiempo de
// ejecución — el propio texto de respuesta ya deja claro que es una
// simulación, así que no hace falta tocar la UI para comunicar el modo.
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
