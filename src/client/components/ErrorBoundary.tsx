import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  label?: string
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? ':' + this.props.label : ''}]`, error.message, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 12,
            gap: 6
          }}
        >
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#5A4A30' }}>
            {this.props.label ?? 'widget'}
          </span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#f87171', textAlign: 'center' }}>
            {this.state.error.message}
          </span>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 4,
              background: 'transparent',
              border: '1px solid rgba(200,168,64,0.25)',
              color: '#A09070',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              padding: '3px 10px',
              cursor: 'pointer'
            }}
          >
            reintentar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
