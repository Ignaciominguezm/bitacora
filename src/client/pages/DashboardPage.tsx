import { EcosystemWidget } from '../components/widgets/EcosystemWidget'
import { TeamWidget } from '../components/widgets/TeamWidget'
import { TasksWidget } from '../components/widgets/TasksWidget'
import { CRMWidget } from '../components/widgets/CRMWidget'
import { ChatWidget } from '../components/chat/ChatWidget'
import { WhatsAppWidget } from '../components/widgets/WhatsAppWidget'
import { PlaceholderWidget } from '../components/widgets/PlaceholderWidget'
import { ErrorBoundary } from '../components/ErrorBoundary'

const CARD: React.CSSProperties = {
  background: '#1A1510',
  border: '1px solid rgba(200,168,64,0.15)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column'
}

export function DashboardPage() {
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
      {/* Row 1 — 260px */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, height: 260, flexShrink: 0 }}>
        <div style={CARD}>
          <ErrorBoundary label="ecosystem"><EcosystemWidget /></ErrorBoundary>
        </div>
        <div style={CARD}>
          <ErrorBoundary label="team"><TeamWidget /></ErrorBoundary>
        </div>
        <div style={CARD}>
          <ErrorBoundary label="tasks"><TasksWidget /></ErrorBoundary>
        </div>
        <div style={CARD}>
          <ErrorBoundary label="crm"><CRMWidget /></ErrorBoundary>
        </div>
      </div>

      {/* Row 2 — 340px */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, height: 340, flexShrink: 0 }}>
        <div style={{ ...CARD, border: '1px solid rgba(200,168,64,0.25)' }}>
          <ErrorBoundary label="chat:unriar">
            <ChatWidget agent="unriar" accentColor="#C8A840" label="UnrIA" />
          </ErrorBoundary>
        </div>
        <div style={{ ...CARD, border: '1px solid rgba(139,157,200,0.25)' }}>
          <ErrorBoundary label="chat:kinnareth">
            <ChatWidget agent="kinnareth" accentColor="#8B9DC8" label="Kinnareth" />
          </ErrorBoundary>
        </div>
      </div>

      {/* Row 3 — 240px */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, height: 240, flexShrink: 0 }}>
        <div style={{ ...CARD, gridColumn: 'span 2' }}>
          <ErrorBoundary label="whatsapp"><WhatsAppWidget /></ErrorBoundary>
        </div>
        <div style={CARD}>
          <ErrorBoundary label="gmail"><PlaceholderWidget label="Gmail" icon="✉" /></ErrorBoundary>
        </div>
        <div style={CARD}>
          <ErrorBoundary label="calendar"><PlaceholderWidget label="Calendar" icon="◷" /></ErrorBoundary>
        </div>
      </div>
    </div>
  )
}
