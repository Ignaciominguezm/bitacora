import type { AgentContext, AgentGateway, AgentSessionRef } from './types.js'

// Envuelve un adaptador primario con uno de respaldo: si el primario lanza
// antes de producir ningún chunk, se reintenta entero con el de respaldo.
// Válido mientras los adaptadores sean "todo o nada" (un único yield tras
// completar, como OpenClawCliAdapter y MockAdapter) — si en el futuro un
// adaptador primario streamea de verdad y falla a mitad, esta clase habría
// que revisarla para no mezclar chunks ya emitidos del primario con la
// respuesta completa del de respaldo.
export class FallbackAdapter implements AgentGateway {
  constructor(
    private readonly primary: AgentGateway,
    private readonly fallback: AgentGateway,
    private readonly primaryName: string
  ) {}

  async *send(message: string, context: AgentContext, session: AgentSessionRef): AsyncIterable<string> {
    try {
      for await (const chunk of this.primary.send(message, context, session)) {
        yield chunk
      }
    } catch (err) {
      console.error(
        `[gateway] ${this.primaryName} falló, usando MockAdapter de respaldo — sessionId=${session.sessionId}: ` +
          `${err instanceof Error ? err.message : 'error desconocido'}`
      )
      for await (const chunk of this.fallback.send(message, context, session)) {
        yield chunk
      }
    }
  }
}
