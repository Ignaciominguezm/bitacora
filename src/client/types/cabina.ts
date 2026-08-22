export type Ambito = 'proyectos_personales' | 'clientes' | 'ocio'
export type Modo = 'diseno' | 'implementacion' | 'revision'

export interface CabinaMessage {
  role: 'user' | 'assistant'
  content: string
  ambito: Ambito
  modo: Modo
}

export interface CabinaSessionSummary {
  id: string
  ambito: Ambito
  modo: Modo
  title: string
  created_at: string
  updated_at: string
}

export interface CabinaSessionDetail extends CabinaSessionSummary {
  messages: CabinaMessage[]
}
