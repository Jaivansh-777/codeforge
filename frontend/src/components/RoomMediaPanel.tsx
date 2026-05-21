'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Loader2, ChevronDown, Users, GripHorizontal } from 'lucide-react';
import type { Socket } from 'socket.io-client';

interface Participant {
  socketId: string;
  name: string;
}

interface Props {
  socket: Socket | null;
  socketId: string | null;
  participants: Participant[];
  userName: string;
}

const STUN_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

interface PeerData {
  connection: RTCPeerConnection;
  streams: MediaStream[];
}

export default function RoomMediaPanel({ socket, socketId, participants, userName }: Props) {
  const [mediaActive, setMediaActive] = useState(false);
  const [micMuted, setMicMuted] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [minimized, setMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [speaking, setSpeaking] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerData>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speakingIntervalRef = useRef<number | null>(null);
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, startPosX: 0, startPosY: 0 });

  const otherParticipants = participants.filter(p => p.socketId !== socketId);

  // Speaking detection
  const startSpeakingDetection = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      speakingIntervalRef.current = window.setInterval(() => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setSpeaking(avg > 15);
      }, 100);
    } catch {
      // Speaking detection not essential
    }
  }, []);

  const stopSpeakingDetection = useCallback(() => {
    if (speakingIntervalRef.current) {
      clearInterval(speakingIntervalRef.current);
      speakingIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setSpeaking(false);
  }, []);

  // Handle incoming signals
  useEffect(() => {
    if (!socket) return;

    const handleSignal = async ({ from, signal }: { from: string; signal: any }) => {
      if (from === socketId) return;

      let peer = peersRef.current.get(from);
      if (!peer) {
        peer = createPeerConnection(from);
      }

      const pc = peer.connection;

      try {
        if (signal.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('signal', { to: from, signal: { type: 'answer', sdp: pc.localDescription } });
        } else if (signal.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } else if (signal.type === 'ice-candidate' && signal.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (e) {
        console.error('[WebRTC] Signal error:', e);
      }
    };

    socket.on('signal', handleSignal);
    return () => { socket.off('signal', handleSignal); };
  }, [socket, socketId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAll();
    };
  }, []);

  const createPeerConnection = useCallback((targetId: string): PeerData => {
    const pc = new RTCPeerConnection(STUN_SERVERS);

    pc.onicecandidate = (e) => {
      if (e.candidate && socket) {
        socket.emit('signal', { to: targetId, signal: { type: 'ice-candidate', candidate: e.candidate } });
      }
    };

    pc.ontrack = () => {};

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        pc.addTrack(track, localStreamRef.current);
      }
    }

    const peerData: PeerData = { connection: pc, streams: [] };
    peersRef.current.set(targetId, peerData);
    return peerData;
  }, [socket]);

  const sendOffersToAll = useCallback(async () => {
    if (!socket || !socketId) return;

    const targets = participants.filter(p => p.socketId !== socketId);

    for (const target of targets) {
      const peer = createPeerConnection(target.socketId);
      const pc = peer.connection;

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('signal', { to: target.socketId, signal: { type: 'offer', sdp: pc.localDescription } });
      } catch (e) {
        console.error('[WebRTC] Offer error to', target.socketId, e);
      }
    }
  }, [socket, socketId, participants, createPeerConnection]);

  const joinAudio = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      localStreamRef.current = stream;
      stream.getAudioTracks().forEach(t => (t.enabled = false));
      setMicMuted(true);
      setMediaActive(true);
      startSpeakingDetection(stream);

      if (socket) {
        socket.emit('media-state', { enabled: { audio: true, video: false } });
      }

      await sendOffersToAll();
    } catch (e: any) {
      const msg = e.message || 'Could not access microphone';
      setError(msg);
      console.error('[WebRTC] getUserMedia error:', e);
    } finally {
      setLoading(false);
    }
  }, [socket, sendOffersToAll, startSpeakingDetection]);

  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTracks = localStreamRef.current.getAudioTracks();
    audioTracks.forEach(t => (t.enabled = micMuted));
    setMicMuted(!micMuted);
    if (!micMuted) {
      setSpeaking(false);
    }

    if (socket) {
      socket.emit('media-state', { enabled: { audio: !micMuted, video: false } });
    }
  }, [micMuted, socket]);

  const leaveAudio = useCallback(() => {
    stopSpeakingDetection();
    cleanupAll();
    setMediaActive(false);
    setMicMuted(true);
    setError('');

    if (socket) {
      socket.emit('media-state', { enabled: { audio: false, video: false } });
    }
  }, [socket, stopSpeakingDetection]);

  function cleanupAll() {
    Array.from(peersRef.current.values()).forEach((peer) => {
      peer.connection.close();
    });
    peersRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
  }

  // Handle peers leaving
  useEffect(() => {
    if (!socket) return;
    const handleUserLeft = ({ socketId: leftId }: { socketId: string }) => {
      const peer = peersRef.current.get(leftId);
      if (peer) {
        peer.connection.close();
        peersRef.current.delete(leftId);
      }
    };
    socket.on('user-left', handleUserLeft);
    return () => { socket.off('user-left', handleUserLeft); };
  }, [socket]);

  // Auto-minimize on mobile
  useEffect(() => {
    if (!mediaActive) return;
    const check = () => setMinimized(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [mediaActive]);

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current.isDragging = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startY = e.clientY;
    dragRef.current.startPosX = position.x;
    dragRef.current.startPosY = position.y;

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current.isDragging) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setPosition({ x: dragRef.current.startPosX + dx, y: dragRef.current.startPosY + dy });
    };
    const onUp = () => { dragRef.current.isDragging = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp, { once: true });
  }, [position]);

  if (!mediaActive) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={joinAudio}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl bg-white/[0.06] text-white/70 border border-white/[0.08] hover:bg-white/[0.1] hover:text-white/90 disabled:opacity-50 transition-all"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Phone className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{loading ? 'Connecting...' : 'Join Audio'}</span>
        </button>
        {error && <span className="text-[10px] text-red-400/70">{error}</span>}
      </div>
    );
  }

  const initial = userName.charAt(0).toUpperCase();

  // Minimized bubble
  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed top-[76px] right-4 z-[9999] w-12 h-12 rounded-full premium-glass-card border-shine flex items-center justify-center shadow-[0_8px_32px_rgba(0,0,0,0.6)] hover:scale-105 transition-transform"
      >
        <div className="relative">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
            speaking ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[0.08] text-white/70'
          }`}>
            {initial}
          </div>
          {speaking && (
            <div className="absolute inset-0 rounded-full border-2 border-emerald-400/40 animate-ping" />
          )}
          <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-[#050505] ${
            micMuted ? 'bg-red-400' : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'
          }`} />
        </div>
      </button>
    );
  }

  return (
    <>
      {/* Floating panel */}
      <div
        className="fixed z-[9999] pointer-events-none select-none"
        style={{
          right: '16px',
          top: position.x === 0 && position.y === 0 ? '76px' : `calc(76px + ${position.y}px)`,
          transform: position.x !== 0 || position.y !== 0 ? `translateX(${position.x}px)` : undefined,
        }}
      >
        <div className="sm:w-[160px] w-[120px] premium-glass-card rounded-xl overflow-hidden border-shine shadow-[0_8px_40px_rgba(0,0,0,0.6)]">
          {/* Header drag handle */}
          <div
            onMouseDown={handleMouseDown}
            className="flex items-center justify-between px-2 py-1 bg-white/[0.03] border-b border-white/[0.06] cursor-grab active:cursor-grabbing pointer-events-auto"
          >
            <div className="flex items-center gap-1.5">
              <GripHorizontal className="w-2.5 h-2.5 text-white/30" />
              <span className="text-[9px] text-white/40 font-mono font-medium truncate max-w-[60px]">{userName}</span>
            </div>
            <div className="flex items-center gap-1">
              {participants.length > 1 && (
                <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white/[0.04] text-[8px] text-white/40 font-mono">
                  <Users className="w-2 h-2" />
                  <span>{participants.length}</span>
                </div>
              )}
              <button onClick={() => setMinimized(true)} className="p-0.5 rounded hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition-all pointer-events-auto">
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Avatar/speaking indicator area */}
          <div className="relative h-[76px] bg-[#0a0a0e] flex items-center justify-center">
            <div className={`sm:w-10 sm:h-10 w-7 h-7 rounded-full flex items-center justify-center sm:text-base text-xs font-bold transition-all ${
              speaking
                ? 'bg-emerald-500/20 text-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.2)]'
                : 'bg-white/[0.06] text-white/50'
            }`}>
              {initial}
            </div>
            {speaking && (
              <>
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-1 sm:inset-2 rounded-full bg-emerald-400/5 blur-xl animate-pulse" />
                </div>
                <div className="absolute inset-2 rounded-full border border-emerald-400/20 animate-ping" />
              </>
            )}
            {!micMuted && !speaking && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-0.5">
                <div className="w-0.5 h-2 bg-emerald-400/30 rounded-full animate-pulse" />
                <div className="w-0.5 h-3 bg-emerald-400/40 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                <div className="w-0.5 h-2 bg-emerald-400/30 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
              </div>
            )}

            {/* Bottom overlay */}
            <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-gradient-to-t from-black/70 to-transparent">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className="text-[8px] text-white/60 font-medium drop-shadow-md">You</span>
                  {speaking && <span className="text-[7px] text-emerald-400/80 font-medium">speaking</span>}
                </div>
                <div className={`p-[1px] rounded ${micMuted ? 'bg-red-400/40' : 'bg-emerald-400/40'}`}>
                  {micMuted ? <MicOff className="sm:w-2.5 sm:h-2.5 w-2 h-2 text-red-300" /> : <Mic className="sm:w-2.5 sm:h-2.5 w-2 h-2 text-emerald-300" />}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Control dock */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] premium-glass-card rounded-2xl px-3 py-2 border-shine flex items-center gap-1.5 shadow-[0_8px_40px_rgba(0,0,0,0.6)] pointer-events-auto">
        <button onClick={toggleMic} className={`p-2.5 rounded-xl transition-all ${micMuted ? 'bg-red-500/15 text-red-400' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'}`} title={micMuted ? 'Unmute mic' : 'Mute mic'}>
          {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>
        <div className="w-px h-6 bg-white/[0.08] mx-1" />
        <button onClick={leaveAudio} className="p-2.5 rounded-xl bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-all" title="Leave audio">
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    </>
  );
}
