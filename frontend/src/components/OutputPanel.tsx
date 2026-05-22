'use client';

import { Terminal, AlertCircle, CheckCircle, Clock, XCircle, Copy, Loader2, Ban, Zap } from 'lucide-react';
import { ExecutionStats } from '@/lib/types';

interface Props {
  output: string;
  error: string;
  loading: boolean;
  stats: ExecutionStats | null;
  onCopy: () => void;
}

function Badge({ children, variant }: { children: React.ReactNode; variant: 'success' | 'error' | 'info' | 'warning' }) {
  const styles = {
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    error: 'bg-red-500/10 text-red-400 border-red-500/20',
    info: 'bg-white/[0.04] text-white/50 border-white/[0.08]',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${styles[variant]}`}>
      {children}
    </span>
  );
}

export default function OutputPanel({ output, error, loading, stats, onCopy }: Props) {
  const hasOutput = output || error;
  const isSuccess = stats?.exitCode === 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-white/[0.05] bg-white/[0.02] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-white/[0.04] flex items-center justify-center ring-1 ring-white/[0.06]">
            <Terminal className="w-3 h-3 text-white/50" />
          </div>
          <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest">Output</span>
          {loading && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] text-[10px] text-white/40 font-mono">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-pulse" />
              running
            </span>
          )}
          {!loading && stats && (
            <Badge variant={isSuccess ? 'success' : error ? 'error' : 'info'}>
              {isSuccess ? <CheckCircle className="w-2.5 h-2.5" /> : error ? <XCircle className="w-2.5 h-2.5" /> : <Zap className="w-2.5 h-2.5" />}
              {isSuccess ? 'Success' : error ? 'Error' : 'Info'}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {stats && !loading && (
            <div className="flex items-center gap-2 text-[10px] text-white/30 font-mono bg-white/[0.03] px-2 py-1 rounded-lg border border-white/[0.05]">
              {stats.executionTimeMs > 0 && (
                <span className="flex items-center gap-1 text-white/40">
                  <Clock className="w-2.5 h-2.5" />
                  <span className="tabular-nums">{stats.executionTimeMs}ms</span>
                </span>
              )}
              <span className={`flex items-center gap-1 tabular-nums ${isSuccess ? 'text-emerald-400' : 'text-red-400'}`}>
                {isSuccess ? <CheckCircle className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                exit {stats.exitCode}
              </span>
            </div>
          )}
          {hasOutput && !loading && (
            <button onClick={onCopy} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-all duration-200" title="Copy output">
              <Copy className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Terminal body — glassy frosted surface */}
      <div className="flex-1 overflow-auto p-4">
        <div className="h-full premium-glass-terminal rounded-2xl p-5 font-mono text-xs leading-relaxed relative overflow-hidden">
          {/* Terminal scan line overlay */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.03]">
            <div className="w-full h-full" style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 4px)' }} />
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
                  <div className="absolute inset-0 w-6 h-6 rounded-full bg-white/10 animate-ping" />
                </div>
                <span className="text-white/30 text-xs font-sans font-medium">Executing in sandbox...</span>
                <div className="flex gap-1.5 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                {/* Matrix-style loading bar */}
                <div className="w-48 h-1 rounded-full bg-white/[0.06] overflow-hidden mt-1">
                  <div className="h-full w-full bg-gradient-to-r from-transparent via-white/30 to-transparent rounded-full shimmer-loading" />
                </div>
              </div>
            </div>
          ) : !hasOutput ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-3 ring-1 ring-white/[0.04]">
                  <svg className="w-5 h-5 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </div>
                <p className="text-white/30 text-xs font-sans font-medium">Click Run to execute code</p>
                <p className="text-white/15 text-[10px] font-sans mt-1">Output will appear here</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 animate-fade-in relative z-10">
              {error && (
                <div className="flex items-start gap-3 p-3 bg-red-500/8 border border-red-500/12 rounded-xl">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-[10px] font-semibold text-red-400 mb-1 font-sans uppercase tracking-wider">Error</div>
                    <pre className="text-red-300/80 whitespace-pre-wrap text-xs leading-relaxed">{error}</pre>
                  </div>
                </div>
              )}
              {output && (
                <div>
                  {error && <div className="h-px bg-white/[0.04] my-2" />}
                  <pre className="text-emerald-300/90 whitespace-pre-wrap text-xs leading-relaxed font-mono drop-shadow-[0_0_12px_rgba(52,211,153,0.12)]">{output}</pre>
                </div>
              )}
            </div>
          )}

          {/* Bottom glow line */}
          <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent pointer-events-none" />
        </div>
      </div>

      {/* Stats footer */}
      {stats && !loading && (
        <div className="px-5 py-2 border-t border-white/[0.04] bg-white/[0.015] flex items-center gap-3 text-[10px] text-white/30 shrink-0 font-mono">
          {stats.executionTimeMs > 0 && (
            <span className="flex items-center gap-1 text-white/40">
              <Clock className="w-2.5 h-2.5" />
              <span className="tabular-nums">{stats.executionTimeMs}ms</span>
            </span>
          )}
          {stats.memoryUsedKb > 0 && (
            <span className="text-white/25">{stats.memoryUsedKb}<span className="lowercase">kb</span></span>
          )}
          {stats.cpuTimeMs > 0 && (
            <span className="text-white/25">{stats.cpuTimeMs}ms cpu</span>
          )}
          {stats.timedOut && (
            <span className="flex items-center gap-1 text-amber-400 font-semibold">
              <Ban className="w-2.5 h-2.5" /> Timed out
            </span>
          )}
          <span className={`ml-auto tabular-nums ${isSuccess ? 'text-emerald-400' : 'text-red-400'}`}>
            {isSuccess ? '✓' : '✗'} exit {stats.exitCode}
          </span>
        </div>
      )}
    </div>
  );
}