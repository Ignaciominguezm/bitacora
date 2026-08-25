import type { AgentContext, AgentSessionRef } from './types.js'
import { AMBITO_LABEL, MODO_LABEL } from './labels.js'

// Prompt enriquecido compartido por los adaptadores reales de OpenClaw
// (CLI y gateway HTTP) — mismo contexto viaje por el transporte que viaje.
export function buildPrompt(message: string, context: AgentContext, session: AgentSessionRef): string {
  return [
    'Estás respondiendo dentro de Cabina Unria, la interfaz de trabajo de ' +
      'Bitácora — no es Telegram ni WhatsApp. Responde en consecuencia.',
    `Ámbito: ${AMBITO_LABEL[context.ambito]}`,
    `Modo: ${MODO_LABEL[context.modo]}`,
    `Conversación: "${session.title}" (sesión ${session.sessionId})`,
    '',
    message
  ].join('\n')
}
