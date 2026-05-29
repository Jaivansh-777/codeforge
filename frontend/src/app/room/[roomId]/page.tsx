'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  Play, Copy, Link, Wifi, WifiOff, Lock, Unlock, Crown,
  Terminal, FileCode, PanelRightClose, PanelRightOpen,
  Loader2, AlertTriangle, X, MessageSquare, Pen,
} from 'lucide-react';
import Whiteboard from '@/components/Whiteboard';
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
  python: `print("Hello from Cyber Classes Sirsa!")`,
  c: `#include <stdio.h>\nint main() { printf("Hello from Cyber Classes Sirsa!\\n"); return 0; }`,
  cpp: `#include <iostream>\nint main() { std::cout << "Hello from Cyber Classes Sirsa!" << std::endl; return 0; }`,
  javascript: `console.log("Hello from Cyber Classes Sirsa!");`,
  php: `<?php echo "Hello from Cyber Classes Sirsa!\\n";`,
  java: `public class Main { public static void main(String[] a) { System.out.println("Hello from Cyber Classes Sirsa!"); } }`,
  assembly: `section .data\nmsg db 'Hello',0xa\nlen equ $ - msg\nsection .text\nglobal _start\n_start:\nmov rax,1; mov rdi,1; mov rsi,msg; mov rdx,len; syscall; mov rax,60; xor rdi,rdi; syscall`,
};

type Tab = 'code' | 'whiteboard';

function RoomContent() {
  const params = useParams();
  const roomId = params.roomId as string;

  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [userName, setUserName] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [hostSocketId, setHostSocketId] = useState<string>('');
  const [socketId, setSocketId] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('code');
  const [locked, setLocked] = useState(false);

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
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const currentCodeRef = useRef('');

  const handleJoin = useCallback((name: string) => {
    setJoinError('');
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
      toast.error('Disconnected from server. Reconnecting...', { duration: 5000 });
    });

    socket.on('connect_error', () => {
      setConnected(false);
      toast.error('Cannot connect to live server.', { duration: 5000 });
      setJoined(true);
    });

    socket.on('join-error', ({ message }: { message: string }) => {
      setJoinError(message);
    });

    socket.on('kicked', ({ reason: r }: { reason: string }) => {
      toast.error(r, { duration: 8000 });
      disconnectSocket();
      setJoined(false);
      setUserName('');
      setSocketId(null);
    });

    socket.on('room-state', (state) => {
      setIsHost(state.isHost);
      setHostSocketId(state.hostSocketId);
      setCode(state.code || CODE_TEMPLATES[state.language] || '');
      currentCodeRef.current = state.code || CODE_TEMPLATES[state.language] || '';
      setLanguage(state.language || 'python');
      setInput(state.input || '');
      setOutput(state.output || '');
      setError(state.error || '');
      setStats(state.stats || null);
      setAllowEdit(state.allowEdit ?? true);
      setLocked(state.locked ?? false);
      setParticipants(state.participants || []);
      setJoined(true);

      if (state.isHost) {
        localEditRef.current = true;
      } else {
        localEditRef.current = state.allowEdit ?? true;
      }
    });

    socket.on('code-change', ({ code: newCode }: { code: string }) => {
      setCode(newCode);
      currentCodeRef.current = newCode;
    });

    socket.on('language-change', ({ language: newLang }: { language: string }) => {
      setLanguage(newLang);
      setOutput('');
      setError('');
      setStats(null);
    });

    socket.on('stdin-change', ({ input: newInput }: { input: string }) => {
      setInput(newInput);
    });

    socket.on('execution-start', () => {
      setLoading(true);
      setOutput('');
      setError('');
      setStats(null);
    });

    socket.on('execution-output', ({ type, data }: { type: string; data: string }) => {
      if (type === 'stdout') {
        setOutput(prev => prev + data);
      } else if (type === 'stderr') {
        setError(prev => prev + data);
      }
    });

    socket.on('execution-complete', ({ output: out, error: err, stats: st }) => {
      setLoading(false);
      if (out) setOutput(out);
      if (err) setError(err);
      setStats(st || null);
    });

    socket.on('participants-update', (p: Participant[]) => {
      setParticipants(p);
    });

    socket.on('user-joined', ({ name: n }: { name: string }) => {
      toast.success(`${n} joined the room`, { duration: 3000 });
    });

    socket.on('user-left', ({ name: n }: { name: string }) => {
      if (n) toast(`${n} left`, { duration: 2000 });
    });

    socket.on('host-change', ({ hostSocketId: hid }: { hostSocketId: string }) => {
      setHostSocketId(hid);
      if (socket.id === hid) {
        setIsHost(true);
        localEditRef.current = true;
        toast.success('You are now the host', { duration: 3000 });
      }
    });

    socket.on('edit-mode-change', ({ allowEdit: ae }: { allowEdit: boolean }) => {
      setAllowEdit(ae);
      if (!isHost) localEditRef.current = ae;
      toast(ae ? 'Editing enabled by host' : 'Editing disabled by host', { duration: 2000 });
    });

    socket.on('room-locked', () => {
      setLocked(true);
      toast('Room locked by host', { duration: 2000 });
    });

    socket.on('room-unlocked', () => {
      setLocked(false);
      toast('Room unlocked by host', { duration: 2000 });
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
      if (debounceRef.current) clearTimeout(debounceRef.current);
      disconnectSocket();
    };
  }, []);

  const emitCodeChange = useCallback((newCode: string) => {
    if (connected && socketRef.current && localEditRef.current) {
      socketRef.current.emit('code-change', { code: newCode });
    }
  }, [connected]);

  const handleCodeChange = useCallback((newCode: string) => {
    setCode(newCode);
    currentCodeRef.current = newCode;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      emitCodeChange(newCode);
    }, 300);
  }, [emitCodeChange]);

  const handleLanguageChange = useCallback((newLang: string) => {
    setLanguage(newLang);
    setCode(CODE_TEMPLATES[newLang] || '');
    currentCodeRef.current = CODE_TEMPLATES[newLang] || '';
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

  const handleRun = useCallback(() => {
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

  const handleLockRoom = useCallback(() => {
    if (!isHost || !connected || !socketRef.current) return;
    if (locked) {
      socketRef.current.emit('unlock-room');
    } else {
      socketRef.current.emit('lock-room');
    }
  }, [isHost, connected, locked]);

  const handleKick = useCallback((targetSocketId: string) => {
    if (!isHost || !connected || !socketRef.current) return;
    socketRef.current.emit('kick-participant', { targetSocketId });
  }, [isHost, connected]);

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

  if (joinError) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#050505]">
        <div className="max-w-md w-full px-6">
          <div className="premium-glass-card rounded-[28px] p-8 text-center border-shine">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <h2 className="text-lg font-bold text-white/80 mb-2">Cannot Join Room</h2>
            <p className="text-sm text-white/50 mb-6">{joinError}</p>
            <button
              onClick={() => { setJoinError(''); setJoined(false); disconnectSocket(); }}
              className="px-5 py-2 bg-white/10 text-white/70 rounded-xl text-sm font-medium hover:bg-white/20 transition-all"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

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
      <div className="cyber-scanlines" />
      <div className="cyber-grid" />

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
      <nav className="relative z-40 px-4 sm:px-6 pt-4">
        <div className="max-w-7xl mx-auto glass-nav rounded-2xl px-3 sm:px-5 shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2.5 shrink-0">
                <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center ring-1 ring-white/[0.06]">
                  <Terminal className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-sm font-bold tracking-tight text-white/90 hidden sm:inline">
                  Cyber<span className="text-white/50"> Classes Sirsa</span>
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

              {/* Lock/unlock room (host only) */}
              {isHost && (
                <button
                  onClick={handleLockRoom}
                  className={`p-1.5 rounded-lg text-xs transition-all ${
                    locked
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                  }`}
                  title={locked ? 'Unlock room' : 'Lock room'}
                >
                  <Lock className="w-3.5 h-3.5" />
                </button>
              )}

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

              {/* Room locked indicator for non-host */}
              {!isHost && locked && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 text-amber-400/70 text-[10px] font-mono">
                  <Lock className="w-3 h-3" />
                  <span className="hidden sm:inline">Locked</span>
                </div>
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

              {/* Run (only visible in code tab) */}
              {activeTab === 'code' && (
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
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main area */}
      <div className="relative z-10 flex-1 flex gap-3 sm:gap-4 p-3 sm:p-4 min-h-0 max-w-7xl mx-auto w-full">
        {/* Left sidebar: participants + chat */}
        <div className="flex flex-col gap-3 w-[200px] shrink-0">
          <ParticipantsPanel
            participants={participants}
            hostSocketId={hostSocketId}
            currentSocketId={socketId}
            isHost={isHost}
            onKick={handleKick}
          />
          {showChat && (
            <div className="flex-1 min-h-0 hidden lg:block">
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
          <div className="lg:hidden fixed inset-0 z-[9997] flex items-end justify-center bg-black/60 backdrop-blur-sm">
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

        {/* Center: Tabbed content */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Tab bar */}
          <div className="flex items-center gap-0.5 mb-3 shrink-0">
            <button
              onClick={() => setActiveTab('code')}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all ${
                activeTab === 'code'
                  ? 'bg-white/[0.06] text-white/90 border border-white/[0.08] border-b-transparent'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/[0.03]'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              Code
            </button>
            <button
              onClick={() => setActiveTab('whiteboard')}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all ${
                activeTab === 'whiteboard'
                  ? 'bg-white/[0.06] text-white/90 border border-white/[0.08] border-b-transparent'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/[0.03]'
              }`}
            >
              <Pen className="w-3.5 h-3.5" />
              Whiteboard
            </button>
          </div>

          {activeTab === 'code' ? (
            <div className="flex-1 flex gap-3 sm:gap-4 min-h-0">
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

              {/* Right panel for code view */}
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
          ) : (
            /* Whiteboard tab */
            <div className="flex-1 min-h-0">
              <Whiteboard
                socket={socketRef.current}
                roomId={roomId}
              />
            </div>
          )}
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
          {activeTab === 'code' && (
            <button
              onClick={() => setShowInput(!showInput)}
              className="flex items-center gap-1.5 text-[10px] text-white/30 font-mono hover:text-white/50 transition-all"
            >
              {showInput ? <PanelRightClose className="w-2.5 h-2.5" /> : <PanelRightOpen className="w-2.5 h-2.5" />}
              {showInput ? 'Hide Input' : 'Show Input'}
            </button>
          )}
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
