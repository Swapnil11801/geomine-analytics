/**
 * ErrorBoundary — Catches React rendering crashes and shows a styled fallback
 */
import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.iconRow}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="hsl(0,70%,50%)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h1 style={styles.title}>Something went wrong</h1>
            <p style={styles.subtitle}>
              An unexpected error occurred in the application. This is usually caused by a temporary issue.
            </p>
            {this.state.error && (
              <pre style={styles.errorBox}>
                {this.state.error.message}
              </pre>
            )}
            <button
              style={styles.button}
              onClick={() => window.location.reload()}
              onMouseOver={(e) => {
                (e.target as HTMLButtonElement).style.background = 'hsl(160, 84%, 35%)';
              }}
              onMouseOut={(e) => {
                (e.target as HTMLButtonElement).style.background = 'hsl(160, 84%, 39%)';
              }}
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'hsl(220, 25%, 8%)',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  card: {
    background: 'hsl(220, 20%, 12%)',
    border: '1px solid hsl(220, 15%, 20%)',
    borderRadius: 16,
    padding: '48px 40px',
    maxWidth: 420,
    textAlign: 'center' as const,
    boxShadow: '0 16px 64px rgba(0,0,0,0.5)',
  },
  iconRow: {
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 600,
    color: '#e5e7eb',
    margin: '0 0 8px 0',
  },
  subtitle: {
    fontSize: 13,
    color: '#9ca3af',
    lineHeight: 1.6,
    margin: '0 0 20px 0',
  },
  errorBox: {
    background: 'hsla(0, 50%, 15%, 0.4)',
    border: '1px solid hsla(0, 50%, 30%, 0.3)',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 11,
    color: 'hsl(0, 70%, 70%)',
    textAlign: 'left' as const,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    maxHeight: 120,
    overflowY: 'auto' as const,
    margin: '0 0 20px 0',
  },
  button: {
    background: 'hsl(160, 84%, 39%)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 28px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
};
