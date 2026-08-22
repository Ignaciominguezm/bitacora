export type Ambito = 'proyectos_personales' | 'clientes' | 'ocio'
export type Modo = 'diseno' | 'implementacion' | 'revision'

export interface AgentContext {
  ambito: Ambito
  modo: Modo
}

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AgentSessionRef {
  sessionId: string
  history: AgentMessage[]
}

// Contrato mínimo de transporte hacia el "cerebro" de Unria. La UI y las
// rutas de Cabina solo conocen esta interfaz — nunca un adaptador concreto.
// send() siempre devuelve un iterable async de chunks, emita el adaptador en
// streaming real o no: un adaptador no-streaming simplemente hace un único
// yield con la respuesta completa.
export interface AgentGateway {
  send(message: string, context: AgentContext, session: AgentSessionRef): AsyncIterable<string>
}
