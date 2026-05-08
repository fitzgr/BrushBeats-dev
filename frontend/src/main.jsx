import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n.ts'
import App from './App.jsx'
import { installDebugTools } from './db/debugTools'
import { initDB } from './db/indexedDbService'
import { initializePhase2Migration } from './db/migrationService'

class RootErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[BrushBeats] Unhandled render error:', error, info?.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
          <h2>Something went wrong</h2>
          <p>BrushBeats hit an unexpected error. Please reload the page to continue.</p>
          <p style={{ color: '#c00', fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
            {this.state.error?.message}
          </p>
          <button
            onClick={() => { this.setState({ error: null }); }}
            style={{ marginRight: '0.5rem', cursor: 'pointer' }}
          >
            Try again
          </button>
          <button onClick={() => window.location.reload()} style={{ cursor: 'pointer' }}>
            Reload page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

async function bootstrapDatabase() {
  try {
    await initDB()

    if (typeof window !== 'undefined') {
      window.__brushbeatsDbStatus = {
        ready: true,
        mode: 'indexeddb-primary',
        legacyCookieMode: 'read-only-compatibility'
      }
      window.dispatchEvent(new CustomEvent('brushbeats:db-status', { detail: window.__brushbeatsDbStatus }))
    }

    const migrationStatus = await initializePhase2Migration()

    if (typeof window !== 'undefined') {
      window.__brushbeatsMigrationStatus = migrationStatus
      window.dispatchEvent(new CustomEvent('brushbeats:migration-status', { detail: migrationStatus }))
    }
  } catch (error) {
    console.warn('[BrushBeats DB] IndexedDB initialization failed; current cookie/localStorage flows remain active.', error)

    if (typeof window !== 'undefined') {
      window.__brushbeatsDbStatus = {
        ready: false,
        mode: 'legacy-storage-fallback',
        legacyCookieMode: 'read-write'
      }
      window.dispatchEvent(new CustomEvent('brushbeats:db-status', { detail: window.__brushbeatsDbStatus }))

      const migrationStatus = { kind: 'migration-failed', error: error?.message || 'Failed to initialize local database.' }
      window.__brushbeatsMigrationStatus = migrationStatus
      window.dispatchEvent(new CustomEvent('brushbeats:migration-status', { detail: migrationStatus }))
    }
  }
}

void bootstrapDatabase()

if (import.meta.env.DEV) {
  installDebugTools()
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
)
