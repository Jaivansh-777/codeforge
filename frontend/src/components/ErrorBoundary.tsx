'use client';

import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="h-screen flex items-center justify-center bg-[#050505]">
          <div className="max-w-md text-center px-6">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-red-400" />
            </div>
            <h2 className="text-lg font-bold text-white/80 mb-2">Something went wrong</h2>
            <p className="text-sm text-white/40 mb-2 font-mono">{this.state.error?.message || 'Unknown error'}</p>
            <p className="text-xs text-white/30 mb-6">The room encountered an unexpected error. The normal compiler is unaffected.</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-black text-sm font-bold rounded-xl hover:bg-white/90 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Try Again
              </button>
              <a
                href="/compiler"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/[0.06] text-white/70 text-sm font-medium rounded-xl hover:bg-white/[0.1] border border-white/[0.08] transition-all"
              >
                Go to Compiler
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
