import type { Ambito, Modo } from './types.js'

export const AMBITO_LABEL: Record<Ambito, string> = {
  proyectos_personales: 'Proyectos personales',
  clientes: 'Clientes',
  ocio: 'Ocio'
}

export const MODO_LABEL: Record<Modo, string> = {
  diseno: 'Diseño',
  implementacion: 'Implementación',
  revision: 'Revisión'
}
