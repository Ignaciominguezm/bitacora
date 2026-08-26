import type { AgentContext, AgentSessionRef } from './types.js'
import { AMBITO_LABEL, MODO_LABEL } from './labels.js'

export interface BuildPromptOptions {
  // true cuando `message` ya es un context pack estructurado de Cabina (ver
  // contextPack.ts), que trae su propio bloque de metadata — evita que
  // buildPrompt() anteponga Ámbito/Modo/Conversación por duplicado.
  // Opcional, default false: no afecta a ninguna llamada existente (CLI u
  // otra) que no lo pase explícitamente.
  structuredContextPack?: boolean
}

// Prompt enriquecido compartido por los adaptadores reales de OpenClaw
// (CLI y gateway HTTP) — mismo contexto viaje por el transporte que viaje.
export function buildPrompt(
  message: string,
  context: AgentContext,
  session: AgentSessionRef,
  options: BuildPromptOptions = {}
): string {
  const intro =
    'Estás respondiendo dentro de Cabina Unria, la interfaz de trabajo de ' +
    'Bitácora — no es Telegram ni WhatsApp. Responde en consecuencia.'

  if (options.structuredContextPack) {
    return [intro, '', message].join('\n')
  }

  return [
    intro,
    `Ámbito: ${AMBITO_LABEL[context.ambito]}`,
    `Modo: ${MODO_LABEL[context.modo]}`,
    `Conversación: "${session.title}" (sesión ${session.sessionId})`,
    '',
    message
  ].join('\n')
}
