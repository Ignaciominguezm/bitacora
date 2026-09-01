import { useState } from 'react'
import type { CabinaApproval } from '../../types/cabina'
import { ACCENT, MUTED, TEXT, WARN, WARN_BORDER } from './theme'

interface Props {
  approval: CabinaApproval
  onApprove: (id: string) => void
  onReject: (id: string) => void
}

const RISK_LABEL: Record<string, string> = { bajo: 'Riesgo bajo', medio: 'Riesgo medio', fuerte: 'Riesgo fuerte' }
const ORIGEN_LABEL: Record<string, string> = { orden_explicita: 'Orden explícita', iniciativa: 'Iniciativa de Unria' }
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  expired: 'Caducada',
  cancelled: 'Cancelada',
  executed: 'Ejecutada',
  failed: 'Fallida'
}

const monoLabel = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 'var(--text-2xs)',
  letterSpacing: '0.05em'
} as const

// Tarjeta de una acción propuesta por Unria — pendiente, o ya resuelta
// (ejecutada directa, aprobada/rechazada, caducada). El principio rector de
// #723-MVP obliga a que sea imposible confundir simulación con efecto real:
// de ahí el distintivo "SIMULADO" siempre que execution_mode sea dry_run, y
// a que una acción reforzada exija abrir el payload antes de poder aprobar.
export function ApprovalCard({ approval, onApprove, onReject }: Props) {
  const [reviewed, setReviewed] = useState(false)
  const isPending = approval.status === 'pending'
  const requiresReview = approval.approval_mode === 'reforzada'
  const canApprove = isPending && (!requiresReview || reviewed)

  return (
    <div
      style={{
        maxWidth: '80%',
        border: `1px solid ${requiresReview ? WARN_BORDER : ACCENT + '30'}`,
        background: '#13100A',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}
    >
      <div style={{ ...monoLabel, color: MUTED, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: ACCENT }}>PROPUESTA DE ACCIÓN</span>
        <span>·</span>
        <span>{approval.action_type}</span>
        <span>·</span>
        <span>{ORIGEN_LABEL[approval.origen] ?? approval.origen}</span>
        <span>·</span>
        <span>{RISK_LABEL[approval.risk_level] ?? approval.risk_level}</span>
        {requiresReview && <span style={{ color: WARN }}>· REFORZADA</span>}
      </div>

      <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 'var(--text-md)', color: TEXT, lineHeight: 1.5 }}>
        {approval.summary}
      </div>

      {approval.execution_mode === 'dry_run' && (
        <div
          style={{
            ...monoLabel,
            alignSelf: 'flex-start',
            border: `1px solid ${WARN_BORDER}`,
            color: WARN,
            padding: '2px 6px'
          }}
        >
          SIMULADO — SIN EFECTO REAL
        </div>
      )}

      <details onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) setReviewed(true) }}>
        <summary style={{ ...monoLabel, color: MUTED, cursor: 'pointer' }}>
          {requiresReview && !reviewed ? 'Ver payload (obligatorio para aprobar)' : 'Ver payload'}
        </summary>
        <pre
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 'var(--text-2xs)',
            color: TEXT,
            background: '#0D0A06',
            padding: 8,
            marginTop: 6,
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}
        >
          {JSON.stringify(approval.payload, null, 2)}
        </pre>
        {approval.result != null && (
          <pre
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 'var(--text-2xs)',
              color: MUTED,
              marginTop: 6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}
          >
            {JSON.stringify(approval.result, null, 2)}
          </pre>
        )}
      </details>

      <div style={{ ...monoLabel, color: MUTED }}>
        Estado: {STATUS_LABEL[approval.status] ?? approval.status}
        {approval.error && <span style={{ color: WARN }}> · {approval.error}</span>}
      </div>

      {isPending && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onApprove(approval.id)}
            disabled={!canApprove}
            title={requiresReview && !reviewed ? 'Revisa el payload antes de aprobar (acción reforzada)' : undefined}
            style={{
              background: 'transparent',
              border: `1px solid ${ACCENT}60`,
              color: canApprove ? ACCENT : MUTED,
              ...monoLabel,
              padding: '4px 10px',
              cursor: canApprove ? 'pointer' : 'not-allowed'
            }}
          >
            Aprobar
          </button>
          <button
            onClick={() => onReject(approval.id)}
            style={{
              background: 'transparent',
              border: `1px solid ${WARN_BORDER}`,
              color: WARN,
              ...monoLabel,
              padding: '4px 10px',
              cursor: 'pointer'
            }}
          >
            Rechazar
          </button>
          <button
            disabled
            title="Edición todavía no disponible"
            style={{
              background: 'transparent',
              border: `1px solid ${MUTED}40`,
              color: MUTED,
              ...monoLabel,
              padding: '4px 10px',
              cursor: 'not-allowed'
            }}
          >
            Editar
          </button>
        </div>
      )}
    </div>
  )
}
