import type { Pool } from 'pg'
import type { ActionProposal, ParsedActionProposal } from './parseActionProposal.js'
import { decideAction } from './policy.js'
import { ACTION_REGISTRY } from './registry.js'
import { EXECUTORS } from './executors/index.js'

export interface ApplyActionProposalParams {
  sessionId: string
  messageId: string | number
  proposal: ParsedActionProposal
}

export interface ApplyActionProposalResult {
  outcome: 'none' | 'malformed' | 'DRAFT' | 'REJECTED_UNSUPPORTED' | 'EXECUTE_DIRECT' | 'PENDING'
  approvalId?: string
}

function safePayload(proposal: ActionProposal): Record<string, unknown> {
  return proposal.payload && typeof proposal.payload === 'object' && !Array.isArray(proposal.payload)
    ? proposal.payload
    : {}
}

function safeSummary(proposal: ActionProposal): string {
  return typeof proposal.summary === 'string' ? proposal.summary : ''
}

// Único punto de integración desde cabina.ts. Recibe la propuesta YA
// parseada (parseActionProposal se llama una sola vez, en cabina.ts, porque
// su resultado también decide qué texto se guarda como mensaje — ver
// stripActionProposal). A partir de aquí: null/malformed no tocan
// cabina_approvals; DRAFT/REJECTED_UNSUPPORTED tampoco (solo se registran
// por log); EXECUTE_DIRECT ejecuta el executor (dry-run) e inserta la fila
// ya como 'executed'/'failed', sin pasar por 'pending'; PENDING inserta la
// fila 'pending' con su caducidad y no ejecuta nada todavía.
export async function applyActionProposal(
  db: Pool,
  { sessionId, messageId, proposal }: ApplyActionProposalParams
): Promise<ApplyActionProposalResult> {
  if (proposal === null) return { outcome: 'none' }

  if ('error' in proposal) {
    console.error(`[cabina-actions] bloque [ACCION_PROPUESTA] malformado sessionId=${sessionId} messageId=${messageId}`)
    return { outcome: 'malformed' }
  }

  const decision = decideAction(proposal)
  const origen = proposal.origen === 'orden_explicita' ? 'orden_explicita' : 'iniciativa'
  const payload = safePayload(proposal)
  const summary = safeSummary(proposal)

  if (decision.kind === 'DRAFT') {
    console.log(`[cabina-actions] propuesta incompleta (DRAFT, no se ejecuta ni se encola) sessionId=${sessionId} type=${proposal.action_type}`)
    return { outcome: 'DRAFT' }
  }

  if (decision.kind === 'REJECTED_UNSUPPORTED') {
    console.error(`[cabina-actions] tipo de acción no soportado sessionId=${sessionId} type=${proposal.action_type}`)
    return { outcome: 'REJECTED_UNSUPPORTED' }
  }

  const entry = ACTION_REGISTRY[proposal.action_type]

  if (decision.kind === 'EXECUTE_DIRECT') {
    const executorFn = EXECUTORS[entry.executor]
    const result = await executorFn(payload)
    const insertResult = await db.query<{ id: string }>(
      `INSERT INTO cabina_approvals
         (session_id, message_id, action_type, summary, origen, risk_level, approval_mode,
          payload, status, execution_mode, result, error, expires_at, executed_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'normal', $7, $8, $9, $10, $11,
               now() + ($12 || ' minutes')::interval, now())
       RETURNING id`,
      [
        sessionId,
        messageId,
        proposal.action_type,
        summary,
        origen,
        decision.riskLevel,
        JSON.stringify(payload),
        result.ok ? 'executed' : 'failed',
        result.executionMode,
        result.result != null ? JSON.stringify(result.result) : null,
        result.error ?? null,
        entry.timeoutMinutes
      ]
    )
    return { outcome: 'EXECUTE_DIRECT', approvalId: insertResult.rows[0].id }
  }

  // PENDING
  const insertResult = await db.query<{ id: string }>(
    `INSERT INTO cabina_approvals
       (session_id, message_id, action_type, summary, origen, risk_level, approval_mode,
        payload, status, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', now() + ($9 || ' minutes')::interval)
     RETURNING id`,
    [
      sessionId,
      messageId,
      proposal.action_type,
      summary,
      origen,
      decision.riskLevel,
      decision.approvalMode,
      JSON.stringify(payload),
      entry.timeoutMinutes
    ]
  )
  return { outcome: 'PENDING', approvalId: insertResult.rows[0].id }
}
