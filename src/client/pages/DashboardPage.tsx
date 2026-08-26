import { TeamWidget } from '../components/widgets/TeamWidget'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { SystemHealthBanner } from '../components/widgets/SystemHealthBanner'

const CARD: React.CSSProperties = {
  background: '#1A1510',
  border: '1px solid rgba(200,168,64,0.15)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column'
}

interface Props {
  onOpenSistema: () => void
}

export function DashboardPage({ onOpenSistema }: Props) {
  return (
    <div
      style={{
        flex: 1,
        padding: '10px 10px 10px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        overflow: 'hidden',
        background: '#0D0A06'
      }}
    >
      <ErrorBoundary label="system-health-banner">
        <SystemHealthBanner onOpenSistema={onOpenSistema} />
      </ErrorBoundary>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, height: 260, flexShrink: 0 }}>
        <div style={{ ...CARD, gridColumn: 'span 4' }}>
          <ErrorBoundary label="team"><TeamWidget /></ErrorBoundary>
        </div>
      </div>
    </div>
  )
}
