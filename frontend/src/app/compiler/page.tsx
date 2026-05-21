'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Play, RotateCcw, Copy, Download, PanelRightClose, PanelRightOpen,
  Loader2, Terminal, Sparkles, FileCode, AlertTriangle, X
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import Editor from '@/components/Editor';
import LanguageSelector from '@/components/LanguageSelector';
import InputPanel from '@/components/InputPanel';
import OutputPanel from '@/components/OutputPanel';
import { CODE_TEMPLATES } from '@/lib/templates';
import { executeCode } from '@/lib/api';
import type { ExecuteResponse, ExecutionStats } from '@/lib/types';

const LANG_DISPLAY: Record<string, { name: string; ext: string }> = {
  python: { name: 'Python', ext: 'py' },
  c: { name: 'C', ext: 'c' },
  cpp: { name: 'C++', ext: 'cpp' },
  javascript: { name: 'JavaScript', ext: 'js' },
  php: { name: 'PHP', ext: 'php' },
  java: { name: 'Java', ext: 'java' },
  assembly: { name: 'Assembly', ext: 'asm' },
};

export default function CompilerPage() {
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState(CODE_TEMPLATES.python);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<ExecutionStats | null>(null);
  const [showInput, setShowInput] = useState(true);
  const [backendError, setBackendError] = useState(false);

  useEffect(() => {
    setCode(CODE_TEMPLATES[language] || '');
    setOutput('');
    setError('');
    setStats(null);
    setBackendError(false);
  }, [language]);

  const handleRun = useCallback(async () => {
    if (!code.trim()) {
      toast.error('Write some code first');
      return;
    }

    setLoading(true);
    setOutput('');
    setError('');
    setStats(null);
    setBackendError(false);

    try {
      const result: ExecuteResponse = await executeCode(language, code, input);
      console.log('[Compiler] Result:', result);
      setOutput(result.output || '');
      setError(result.error || '');
      setStats({
        executionTimeMs: result.executionTimeMs,
        memoryUsedKb: result.memoryUsedKb,
        cpuTimeMs: result.cpuTimeMs,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
      });
      if (!result.output && !result.error) {
        setOutput('No output returned');
      }
      if (result.exitCode === 0) {
        toast.success('Executed successfully');
      } else if (result.timedOut) {
        toast.error('Execution timed out');
      } else if (result.error) {
        toast.error('Runtime error');
      }
    } catch (e: any) {
      const msg = e.message || 'Execution failed';
      setError(msg);
      setBackendError(true);
      toast.error(msg, { duration: 5000 });
    } finally {
      setLoading(false);
    }
  }, [code, language, input]);

  const handleReset = () => {
    setCode(CODE_TEMPLATES[language] || '');
    setOutput('');
    setError('');
    setStats(null);
    setInput('');
    setBackendError(false);
    toast.success('Reset to template');
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code);
    toast.success('Code copied');
  };

  const handleCopyOutput = () => {
    const text = error ? `Error:\n${error}\n\nOutput:\n${output}` : output;
    navigator.clipboard.writeText(text);
    toast.success('Output copied');
  };

  const handleDownload = () => {
    const ext = LANG_DISPLAY[language]?.ext || 'txt';
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codeforge.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const langInfo = LANG_DISPLAY[language] || { name: language, ext: 'txt' };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#050505]">
      {/* Background layers */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-white/[0.015] rounded-full blur-[150px]" />
        <div className="absolute bottom-1/4 left-1/5 w-[400px] h-[400px] bg-white/[0.01] rounded-full blur-[120px]" />

        {/* Floating glass bubbles — black/white theme */}
        <div className="glass-bubble glass-bubble-1 w-24 h-24 top-[10%] left-[5%]" />
        <div className="glass-bubble glass-bubble-2 w-16 h-16 top-[55%] left-[2%]" />
        <div className="glass-bubble glass-bubble-3 w-28 h-28 top-[35%] right-[3%]" />
        <div className="glass-bubble glass-bubble-1 w-14 h-14 bottom-[20%] right-[12%]" />
        <div className="glass-bubble glass-bubble-2 w-20 h-20 top-[15%] right-[25%]" />
        <div className="glass-bubble glass-bubble-3 w-12 h-12 bottom-[35%] left-[15%]" />
        <div className="glass-bubble glass-bubble-1 w-18 h-18 top-[70%] right-[35%]" style={{ width: '72px', height: '72px' }} />

        {/* Particle stars */}
        {Array.from({ length: 40 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-[1px] h-[1px] bg-white/60 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              opacity: 0.15 + Math.random() * 0.4,
              animation: `twinkle ${3 + Math.random() * 5}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 5}s`,
            }}
          />
        ))}
      </div>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'rgba(10, 10, 14, 0.92)',
            color: '#e4e4e7',
            border: '1px solid rgba(255,255,255,0.08)',
            fontSize: '13px',
            borderRadius: '12px',
            backdropFilter: 'blur(24px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
          },
          success: { iconTheme: { primary: '#34d399', secondary: '#131316' } },
          error: { iconTheme: { primary: '#f87171', secondary: '#131316' } },
        }}
      />

      {/* Navbar */}
      <nav className="relative z-[100] px-4 sm:px-6 pt-4">
        <div className="max-w-7xl mx-auto glass-nav rounded-2xl px-3 sm:px-5 shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between h-14">
            {/* Left: logo + language */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2.5 shrink-0">
                <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center ring-1 ring-white/[0.06]">
                  <Terminal className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-sm font-bold tracking-tight text-white/90 hidden sm:inline">
                  Code<span className="text-white/50">Forge</span>
                </span>
              </div>
              <div className="h-5 w-[1px] bg-white/[0.06] hidden sm:block" />
              <div className="w-36 sm:w-40">
                <LanguageSelector selected={language} onSelect={setLanguage} />
              </div>
            </div>

            {/* Center: action buttons */}
            <div className="hidden sm:flex items-center gap-1">
              <button
                onClick={() => setShowInput(!showInput)}
                className={`p-1.5 rounded-lg text-xs transition-all duration-200 ${
                  showInput
                    ? 'bg-white/[0.06] text-white/70 border border-white/[0.08]'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                }`}
                title="Toggle input"
              >
                {showInput ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
              </button>
              <button onClick={handleCopyCode} className="glass-icon-btn" title="Copy code">
                <Copy className="w-3 h-3" />
              </button>
              <button onClick={handleDownload} className="glass-icon-btn" title="Download">
                <Download className="w-3 h-3" />
              </button>
              <button onClick={handleReset} className="glass-icon-btn" title="Reset">
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>

            {/* Right: Run button */}
            <button
              onClick={handleRun}
              disabled={loading}
              className="group relative inline-flex items-center gap-2 px-5 py-2 bg-white text-black text-xs font-bold rounded-xl hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-[0_0_20px_rgba(255,255,255,0.12)] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] active:scale-[0.97] overflow-hidden"
            >
              {loading ? (
                <span className="shimmer-loading absolute inset-0" />
              ) : null}
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin relative z-10" />
                  <span className="relative z-10">Running...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current relative z-10" />
                  <span className="relative z-10">Run Code</span>
                  <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md bg-black/10 text-[9px] font-mono text-black/40 relative z-10">
                    ⌘⏎
                  </kbd>
                </>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile action bar */}
      <div className="relative z-10 flex sm:hidden items-center gap-2 px-4 py-2 border-b border-white/[0.04] bg-white/[0.02] shrink-0">
        <button
          onClick={() => setShowInput(!showInput)}
          className={`p-1.5 rounded-lg text-xs transition-all duration-200 ${
            showInput ? 'bg-white/[0.06] text-white/70' : 'text-white/40'
          }`}
        >
          {showInput ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
          <span className="text-[10px] ml-1 font-medium">Input</span>
        </button>
        <button onClick={handleCopyCode} className="p-1.5 rounded-lg text-white/40 hover:bg-white/[0.04] transition-all">
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleDownload} className="p-1.5 rounded-lg text-white/40 hover:bg-white/[0.04] transition-all">
          <Download className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleReset} className="p-1.5 rounded-lg text-white/40 hover:bg-white/[0.04] transition-all">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col lg:flex-row gap-3 sm:gap-4 p-3 sm:p-4 min-h-0 max-w-7xl mx-auto w-full">
        {/* Editor panel - 70% */}
        <div className="flex-1 flex flex-col min-h-0 premium-glass-card rounded-[28px] overflow-hidden border-shine">
          {/* Editor header: macOS dots + filename pill + language badge */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.06] bg-white/[0.02] shrink-0">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80 shadow-[0_0_6px_rgba(239,68,68,0.3)]" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80 shadow-[0_0_6px_rgba(234,179,8,0.3)]" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/80 shadow-[0_0_6px_rgba(34,197,94,0.3)]" />
            </div>
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06]">
              <FileCode className="w-3 h-3 text-white/40" />
              <span className="text-[11px] text-white/60 font-mono font-medium">main.{langInfo.ext}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[9px] text-white/40 font-mono font-medium tracking-wide uppercase">
                {langInfo.name}
              </span>
            </div>
          </div>

          {/* Editor body with frosted glass background */}
          <div className="flex-1 min-h-0 relative premium-glass-editor-bg">
            {/* Subtle radial highlight overlay */}
            <div className="absolute inset-0 pointer-events-none z-0">
              <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_20%_20%,rgba(255,255,255,0.03)_0%,transparent_60%)]" />
            </div>
            <div className="absolute inset-0 z-1">
              <Editor language={language} code={code} onChange={setCode} />
            </div>
            {/* Mirror shine overlay */}
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/[0.08] to-transparent pointer-events-none z-10" />
          </div>

          {/* Editor status bar */}
          <div className="flex items-center justify-between px-5 py-1.5 border-t border-white/[0.04] bg-white/[0.015] shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-white/30 font-mono">Ln 1, Col 1</span>
              <span className="text-white/[0.06]">|</span>
              <span className="text-[10px] text-white/30 font-mono">{langInfo.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-white/30 font-mono">UTF-8</span>
              <span className="text-white/[0.06]">|</span>
              <span className="text-[10px] text-white/30 font-mono">main.{langInfo.ext}</span>
            </div>
          </div>
        </div>

        {/* Right panel - 30% */}
        <div className="w-full lg:w-[360px] xl:w-[400px] flex flex-col gap-3 sm:gap-4 shrink-0 overflow-hidden">
          {/* Input card */}
          {showInput && (
            <div className="flex-shrink-0 premium-glass-card rounded-[28px] overflow-hidden border-shine" style={{ minHeight: '140px', maxHeight: '260px' }}>
              <InputPanel value={input} onChange={setInput} />
            </div>
          )}

          {/* Output card */}
          <div className={`${showInput ? 'flex-1' : 'flex-1'} premium-glass-card rounded-[28px] overflow-hidden border-shine`}>
            <OutputPanel output={output} error={error} loading={loading} stats={stats} onCopy={handleCopyOutput} />
          </div>
        </div>
      </div>

      {/* Backend connection error banner */}
      {backendError && !loading && (
        <div className="relative z-[99] mx-3 sm:mx-4 mb-3 px-4 py-3 bg-red-500/8 border border-red-500/15 rounded-2xl animate-slide-down premium-glass-card-light max-w-7xl w-[calc(100%-24px)] sm:w-[calc(100%-32px)]" style={{ marginLeft: 'auto', marginRight: 'auto' }}>
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            </div>
            <span className="text-xs text-red-300/80 font-medium flex-1">
              Cannot connect to backend. Make sure the server is running at {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}.
            </span>
            <button onClick={() => setBackendError(false)} className="p-1 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-all">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Status bar */}
      <footer className="relative z-10 flex items-center justify-between px-5 py-2 border-t border-white/[0.04] bg-white/[0.02] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500/60 shadow-[0_0_6px_rgba(34,197,94,0.3)]" />
            <span className="text-[10px] text-white/30 font-mono font-medium">{langInfo.name}</span>
          </div>
          <span className="text-white/[0.06]">|</span>
          <span className="text-[10px] text-white/25 font-mono">main.{langInfo.ext}</span>
          <span className="text-white/[0.06]">|</span>
          <span className="text-[10px] text-white/25 font-mono">UTF-8</span>
        </div>
        <div className="flex items-center gap-3">
          {loading && (
            <span className="flex items-center gap-1.5 text-[10px] text-white/40 font-mono">
              <Loader2 className="w-2.5 h-2.5 animate-spin" /> Executing...
            </span>
          )}
          {stats && !loading && (
            <span className="flex items-center gap-2 text-[10px] text-white/30 font-mono">
              <span className="tabular-nums">{stats.executionTimeMs}ms</span>
              <span className={`tabular-nums font-semibold ${stats.exitCode === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                exit {stats.exitCode}
              </span>
              {stats.timedOut && <span className="text-amber-400 font-semibold">timeout</span>}
            </span>
          )}
          {!loading && !stats && (
            <span className="text-[10px] text-white/25 font-mono">Ready</span>
          )}
        </div>
      </footer>
    </div>
  );
}
