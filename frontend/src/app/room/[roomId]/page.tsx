'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  Play, Copy, Link, Users, Wifi, WifiOff, Lock, Unlock, Crown,
  Terminal, FileCode, PanelRightClose, PanelRightOpen,
  Loader2, AlertTriangle, X, MessageSquare,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import Editor from '@/components/Editor';
import LanguageSelector from '@/components/LanguageSelector';
import InputPanel from '@/components/InputPanel';
import OutputPanel from '@/components/OutputPanel';
import NamePrompt from '@/components/NamePrompt';
import ParticipantsPanel from '@/components/ParticipantsPanel';
import RoomChat from '@/components/RoomChat';
import ErrorBoundary from '@/components/ErrorBoundary';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';
import type { Socket } from 'socket.io-client';
import type { ExecutionStats } from '@/lib/types';

interface Participant {
  socketId: string;
  name: string;
}

interface ChatMessage {
  socketId: string;
  name: string;
  message: string;
  timestamp: number;
}

const LANG_DISPLAY: Record<string, { name: string; ext: string }> = {
  python: { name: 'Python', ext: 'py' },
  c: { name: 'C', ext: 'c' },
  cpp: { name: 'C++', ext: 'cpp' },
  javascript: { name: 'JavaScript', ext: 'js' },
  php: { name: 'PHP', ext: 'php' },
  java: { name: 'Java', ext: 'java' },
  assembly: { name: 'Assembly', ext: 'asm' },
};

const CODE_TEMPLATES: Record<string, string> = {
  python: `print("Hello CodeForge!")`,
  c: `#include <stdio.h>\nint main() { printf("Hello CodeForge!\\n"); return 0; }`,
  cpp: `#include <iostream>\nint main() { std::cout << "Hello CodeForge!" << std::endl; return 0; }`,
  javascript: `console.log("Hello CodeForge!");`,
  php: `<?php echo "Hello CodeForge!\\n";`,
  java: `public class Main { public static void main(String[] a) { System.out.println("Hello CodeForge!"); } }`,
  assembly: `section .data\nmsg db 'Hello',0xa\nlen equ $ - msg\nsection .text\nglobal _start\n_start:\nmov rax,1; mov rdi,1; mov rsi,msg; mov rdx,len; syscall; mov rax,60; xor rdi,rdi; syscall`,
};

function RoomContent() {
  const params = useParams();
  const roomId = params.roomId as string;

  const [joined, setJoined] = useState(false);
  const [userName, setUserName] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [hostSocketId, setHostSocketId] = useState<string>('');
  const [socketId, setSocketId] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);

  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState('');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [stats, setStats] = useState<ExecutionStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [allowEdit, setAllowEdit] = useState(true);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [showInput, setShowInput] = useState(true);
  const [showChat, setShowChat] = useState(false);

  const localEditRef = useRef(true);
  const socketRef = useRef<Socket | null>(null);

  const handleJoin = useCallback((name: string) => {
    setUserName(name);
    const socket = connectSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setSocketId(socket.id || null);
      socket.emit('join-room', { roomId, name });
    });

    socket.on('disconnect', () => {
      setConnected(false);
      toast.error('Disconnected from server. You can still edit locally.', { duration: 5000 });
    });

    socket.on('connect_error', () => {
      setConnected(false);
      toast.error('Cannot connect to live server. You can still use the editor locally.', { duration: 5000 });
      setJoined(true);
    });

    socket.on('room-state', (state) => {
      setIsHost(state.isHost);
      setHostSocketId(state.hostSocketId);
      setCode(state.code || CODE_TEMPLATES[state.language] || '');
      setLanguage(state.language || 'python');
      setInput(state.input || '');
      setOutput(state.output || '');
      setError(state.error || '');
      setStats(state.stats || null);
      setAllowEdit(state.allowEdit ?? true);
      setParticipants(state.participants || []);
      setJoined(true);

      if (state.isHost) {
        localEditRef.current = true;
      } else {
        localEditRef.current = state.allowEdit ?? true;
      }
    });

    socket.on('code-change', ({ code: newCode }) => {
      setCode(newCode);
    });

    socket.on('language-change', ({ language: newLang }) => {
      setLanguage(newLang);
      setOutput('');
      setError('');
      setStats(null);
    });

    socket.on('stdin-change', ({ input: newInput }) => {
      setInput(newInput);
    });

    socket.on('execution-start', () => {
      setLoading(true);
      setOutput('');
      setError('');
      setStats(null);
    });

    socket.on('output-change', ({ output: out, error: err, stats: st }) => {
      setLoading(false);
      setOutput(out || '');
      setError(err || '');
      setStats(st || null);
    });

    socket.on('participants-update', (p: Participant[]) => {
      setParticipants(p);
    });

    socket.on('user-joined', ({ name: n }) => {
      toast.success(`${n} joined the room`, { duration: 3000 });
    });

    socket.on('user-left', ({ name: n }) => {
      if (n) toast(`${n} left`, { duration: 2000 });
    });

    socket.on('host-change', ({ hostSocketId: hid }) => {
      setHostSocketId(hid);
      if (socket.id === hid) {
        setIsHost(true);
        localEditRef.current = true;
        toast.success('You are now the host', { duration: 3000 });
      }
    });

    socket.on('edit-mode-change', ({ allowEdit: ae }) => {
      setAllowEdit(ae);
      if (!isHost) localEditRef.current = ae;
      toast(ae ? 'Editing enabled by host' : 'Editing disabled by host', { duration: 2000 });
    });

    socket.on('chat-message', (msg: ChatMessage) => {
      setChatMessages(prev => [...prev, msg]);
    });

    if (socket.connected) {
      socket.emit('join-room', { roomId, name });
    }
  }, [roomId]);

  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, []);

  const handleCodeChange = useCallback((newCode: string) => {
    setCode(newCode);
    if (connected && socketRef.current && localEditRef.current) {
      socketRef.current.emit('code-change', { code: newCode });
    }
  }, [connected]);

  const handleLanguageChange = useCallback((newLang: string) => {
    setLanguage(newLang);
    setCode(CODE_TEMPLATES[newLang] || '');
    setOutput('');
    setError('');
    setStats(null);
    if (connected && socketRef.current) {
      socketRef.current.emit('language-change', { language: newLang });
    }
  }, [connected]);

  const handleInputChange = useCallback((newInput: string) => {
    setInput(newInput);
    if (connected && socketRef.current) {
      socketRef.current.emit('stdin-change', { input: newInput });
    }
  }, [connected]);

  const handleRun = useCallback(async () => {
    if (!code.trim()) {
      toast.error('Write some code first');
      return;
    }
    if (!isHost) {
      toast.error('Only the host can run code');
      return;
    }
    if (connected && socketRef.current) {
      socketRef.current.emit('run-code');
    }
  }, [code, isHost, connected]);

  const handleToggleEdit = useCallback(() => {
    if (!isHost || !connected || !socketRef.current) return;
    socketRef.current.emit('toggle-edit', { allowEdit: !allowEdit });
  }, [isHost, connected, allowEdit]);

  const handleCopyInvite = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast.success('Invite link copied to clipboard');
  };

  const handleSendChat = useCallback((message: string) => {
    if (connected && socketRef.current) {
      socketRef.current.emit('chat-message', { message });
    }
  }, [connected]);

  const handleCopyOutput = () => {
    const text = error ? `Error:\n${error}\n\nOutput:\n${output}` : output;
    navigator.clipboard.writeText(text);
    toast.success('Output copied');
  };

  const langInfo = LANG_DISPLAY[language] || { name: language, ext: 'txt' };

  if (!joined) {
    return <NamePrompt onJoin={handleJoin} />;
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#050505]">
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-white/[0.015] rounded-full blur-[150px]" />
        <div className="absolute bottom-1/4 left-1/5 w-[400px] h-[400px] bg-white/[0.01] rounded-full blur-[120px]" />
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

      {/* Nav */}
      <nav className="relative z-[100] px-4 sm:px-6 pt-4">
        <div className="max-w-7xl mx-auto glass-nav rounded-2xl px-3 sm:px-5 shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between h-14">
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
                <LanguageSelector selected={language} onSelect={handleLanguageChange} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Connection status */}
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-mono ${
                connected ? 'text-emerald-400/70' : 'text-red-400/70'
              }`}>
                {connected ? (
                  <><Wifi className="w-3 h-3" /><span className="hidden sm:inline">Live</span></>
                ) : (
                  <><WifiOff className="w-3 h-3" /><span className="hidden sm:inline">Offline</span></>
                )}
              </div>

              {/* Edit toggle (host only) */}
              {isHost && (
                <button
                  onClick={handleToggleEdit}
                  className={`p-1.5 rounded-lg text-xs transition-all ${
                    allowEdit
                      ? 'bg-white/[0.06] text-white/70 border border-white/[0.08]'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                  title={allowEdit ? 'Disable editing for others' : 'Enable editing for others'}
                >
                  {allowEdit ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                </button>
              )}

              {/* Chat toggle */}
              <button
                onClick={() => setShowChat(!showChat)}
                className={`p-1.5 rounded-lg text-xs transition-all ${
                  showChat
                    ? 'bg-white/[0.06] text-white/70 border border-white/[0.08]'
                    : 'text-white/40 hover:text-white/70'
                }`}
                title="Toggle chat"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </button>

              {/* Copy invite */}
              <button
                onClick={handleCopyInvite}
                className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-all"
                title="Copy invite link"
              >
                <Link className="w-3.5 h-3.5" />
              </button>

              {/* Run */}
              <button
                onClick={handleRun}
                disabled={loading || !isHost}
                className="group relative inline-flex items-center gap-2 px-5 py-2 bg-white text-black text-xs font-bold rounded-xl hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(255,255,255,0.12)] active:scale-[0.97]"
              >
                {loading ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin relative z-10" /><span className="relative z-10">Running...</span></>
                ) : (
                  <><Play className="w-3.5 h-3.5 fill-current relative z-10" /><span className="relative z-10">Run</span></>
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main area */}
      <div className="relative z-10 flex-1 flex gap-3 sm:gap-4 p-3 sm:p-4 min-h-0 max-w-7xl mx-auto w-full">
        {/* Left sidebar: participants + toggle */}
        <div className={`${showChat ? 'hidden lg:flex' : 'flex'} flex-col gap-3 w-[200px] shrink-0`}>
          <ParticipantsPanel
            participants={participants}
            hostSocketId={hostSocketId}
            currentSocketId={socketId}
          />
          {showChat && (
            <div className="flex-1 min-h-0">
              <RoomChat
                messages={chatMessages}
                onSend={handleSendChat}
                currentSocketId={socketId}
              />
            </div>
          )}
        </div>

        {/* Chat mobile/overlay toggle */}
        {showChat && (
          <div className="lg:hidden fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-lg h-[60vh] bg-[#050505] rounded-t-[28px] border border-white/[0.08] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                <span className="text-xs font-bold text-white/60 uppercase tracking-wider">Chat</span>
                <button onClick={() => setShowChat(false)} className="p-1 rounded-lg hover:bg-white/[0.06] text-white/40">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <RoomChat
                  messages={chatMessages}
                  onSend={handleSendChat}
                  currentSocketId={socketId}
                />
              </div>
            </div>
          </div>
        )}

        {/* Editor */}
        <div className="flex-1 flex flex-col min-h-0 premium-glass-card rounded-[28px] overflow-hidden border-shine">
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
              {isHost && <Crown className="w-3 h-3 text-amber-400/60" />}
              <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[9px] text-white/40 font-mono tracking-wide uppercase">
                {langInfo.name}
              </span>
            </div>
          </div>

          <div className="flex-1 min-h-0 relative premium-glass-editor-bg">
            <div className="absolute inset-0 pointer-events-none z-0">
              <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_20%_20%,rgba(255,255,255,0.03)_0%,transparent_60%)]" />
            </div>
            <div className="absolute inset-0 z-1">
              <Editor
                language={language}
                code={code}
                onChange={handleCodeChange}
              />
            </div>
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/[0.08] to-transparent pointer-events-none z-10" />
          </div>

          <div className="flex items-center justify-between px-5 py-1.5 border-t border-white/[0.04] bg-white/[0.015] shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-white/30 font-mono">{userName}</span>
              <span className="text-white/[0.06]">|</span>
              <span className="text-[10px] text-white/30 font-mono">{langInfo.name}</span>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="w-full lg:w-[360px] xl:w-[400px] flex flex-col gap-3 shrink-0 overflow-hidden">
          {showInput && (
            <div className="flex-shrink-0 premium-glass-card rounded-[28px] overflow-hidden border-shine" style={{ minHeight: '140px', maxHeight: '260px' }}>
              <InputPanel value={input} onChange={handleInputChange} />
            </div>
          )}
          <div className={`${showInput ? 'flex-1' : 'flex-1'} premium-glass-card rounded-[28px] overflow-hidden border-shine`}>
            <OutputPanel output={output} error={error} loading={loading} stats={stats} onCopy={handleCopyOutput} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 flex items-center justify-between px-5 py-2 border-t border-white/[0.04] bg-white/[0.02] shrink-0">
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 ${connected ? 'text-emerald-400/60' : 'text-red-400/60'}`}>
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500/60 shadow-[0_0_6px_rgba(34,197,94,0.3)]' : 'bg-red-500/60 shadow-[0_0_6px_rgba(239,68,68,0.3)]'}`} />
            <span className="text-[10px] font-mono">{connected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <span className="text-white/[0.06]">|</span>
          <span className="text-[10px] text-white/25 font-mono">{participants.length} participant{participants.length !== 1 ? 's' : ''}</span>
          <span className="text-white/[0.06]">|</span>
          <span className="text-[10px] text-white/25 font-mono">Room: {roomId.slice(0, 8)}</span>
        </div>
        <div className="flex items-center gap-3">
          {isHost && (
            <button onClick={handleCopyInvite} className="flex items-center gap-1.5 text-[10px] text-white/30 font-mono hover:text-white/50 transition-all">
              <Copy className="w-2.5 h-2.5" />
              Copy Invite Link
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

export default function RoomPage() {
  return (
    <ErrorBoundary>
      <RoomContent />
    </ErrorBoundary>
  );
}
