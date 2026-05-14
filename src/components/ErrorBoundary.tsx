import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: '#fca5a5', backgroundColor: '#000', fontSize: '14px', minHeight: '100vh', wordBreak: 'break-all' }}>
          <h2 style={{ color: '#ef4444', marginBottom: '10px' }}>Something went wrong.</h2>
          <details style={{ whiteSpace: 'pre-wrap', border: '1px solid #ef444450', padding: '10px', borderRadius: '4px' }}>
            <summary style={{ cursor: 'pointer', marginBottom: '10px' }}>View Error Details</summary>
            {this.state.error && this.state.error.toString()}
            <br /><br />
            {this.state.error?.stack}
          </details>
          <button 
            style={{ marginTop: '20px', padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', borderRadius: '4px', border: 'none' }}
            onClick={() => window.location.reload()}
          >
            Refresh App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
