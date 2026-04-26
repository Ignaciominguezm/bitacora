import { EcosystemWidget } from '../components/widgets/EcosystemWidget'
import { TeamWidget } from '../components/widgets/TeamWidget'
import { TasksWidget } from '../components/widgets/TasksWidget'
import { CRMWidget } from '../components/widgets/CRMWidget'
import { ChatWidget } from '../components/chat/ChatWidget'
import { WhatsAppWidget } from '../components/widgets/WhatsAppWidget'
import { PlaceholderWidget } from '../components/widgets/PlaceholderWidget'

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
        <div style={CARD}><EcosystemWidget /></div>
        <div style={CARD}><TeamWidget /></div>
        <div style={CARD}><TasksWidget /></div>
        <div style={CARD}><CRMWidget /></div>
      </div>

      {/* Row 2 — 340px */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, height: 340, flexShrink: 0 }}>
        <div style={{ ...CARD, border: '1px solid rgba(200,168,64,0.25)' }}>
          <ChatWidget agent="unriar" accentColor="#C8A840" label="UnrIA" />
        </div>
        <div style={{ ...CARD, border: '1px solid rgba(139,157,200,0.25)' }}>
          <ChatWidget agent="kinnareth" accentColor="#8B9DC8" label="Kinnareth" />
        </div>
      </div>

      {/* Row 3 — 240px */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, height: 240, flexShrink: 0 }}>
        <div style={{ ...CARD, gridColumn: 'span 2' }}><WhatsAppWidget /></div>
        <div style={CARD}><PlaceholderWidget label="Gmail" icon="✉" /></div>
        <div style={CARD}><PlaceholderWidget label="Calendar" icon="◷" /></div>
      </div>
    </div>
  )
}
