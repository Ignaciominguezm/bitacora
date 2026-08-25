export type Ambito = 'proyectos_personales' | 'clientes' | 'ocio'
export type Modo = 'diseno' | 'implementacion' | 'revision'

export interface CabinaMessage {
  role: 'user' | 'assistant'
  content: string
  ambito: Ambito
  modo: Modo
  // Solo local — nunca viaja al/desde el servidor. Marca un turno que se
  // cortó (red o cambio de sesión a media respuesta) para que la UI lo
  // distinga de una respuesta completa; lo que ya se haya generado del lado
  // del servidor queda igualmente persistido en BD (ver cabina.ts).
  incomplete?: boolean
}

export interface CabinaSessionSummary {
  id: string
  ambito: Ambito
  modo: Modo
  title: string
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface CabinaSessionDetail extends CabinaSessionSummary {
  messages: CabinaMessage[]
}
