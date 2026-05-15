import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

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
        <div className="min-h-screen bg-black flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full glass-card p-10 border border-neon-red/20 space-y-6">
            <div className="w-20 h-20 bg-neon-red/10 rounded-full flex items-center justify-center mx-auto text-neon-red shadow-[0_0_20px_rgba(255,0,60,0.2)]">
              <AlertTriangle size={40} />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-black uppercase italic tracking-tighter text-white">System <span className="text-neon-red">Critical Failure</span></h1>
              <p className="text-gray-500 text-xs font-bold leading-relaxed">
                The terminal encountered an unrecoverable rendering sequence. Operational parameters have been compromised.
              </p>
            </div>
            {this.state.error && (
               <div className="p-4 bg-black/40 rounded-lg border border-white/5 font-mono text-[10px] text-neon-red text-left overflow-auto max-h-32">
                 {this.state.error.message}
               </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-neon-red text-black font-black rounded-xl hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-sm"
            >
              <RefreshCcw size={20} />
              Reboot Terminal
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
