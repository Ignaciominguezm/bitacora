import type { Ambito, Modo } from '../../types/cabina'

// Acento propio de Cabina Unria — distinto del dorado de Unriar, el azul de
// Kinnareth y el verde de WhatsApp, para que se reconozca como módulo nuevo
// dentro de la misma paleta base de Bitácora.
export const ACCENT = '#9B7FB8'
export const WARN = '#D9A15C'
export const WARN_BORDER = 'rgba(217, 161, 92, 0.4)'
export const BG_PANEL = '#13100A'
export const TEXT = '#E8DCC8'
// #5A4A30 original fallaba contraste (~2.2:1) sobre BG_PANEL y el fondo de
// página — casi ilegible en metadata/chips/tabs inactivos. #A8916A pasa AA
// en ambos (6.3:1 sobre #13100A, 6.5:1 sobre #0D0A06) y sigue siendo
// visiblemente más oscuro que TEXT (2.2x menos luminoso), así que se lee
// como "secundario", no como texto principal.
export const MUTED = '#A8916A'

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
