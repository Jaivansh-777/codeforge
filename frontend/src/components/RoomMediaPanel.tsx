'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Video, VideoOff, Monitor, PhoneOff, Phone, Loader2, ChevronDown, Users, GripHorizontal } from 'lucide-react';
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
  const [cameraOff, setCameraOff] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [minimized, setMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerData>>(new Map());
  const remoteVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, startPosX: 0, startPosY: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const otherParticipants = participants.filter(p => p.socketId !== socketId);

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

    pc.ontrack = (e) => {
      const peer = peersRef.current.get(targetId);
      if (!peer) return;

      const existingStream = peer.streams.find(s => s.id === e.streams[0]?.id);
      if (!existingStream && e.streams[0]) {
        peer.streams.push(e.streams[0]);
      }

      const videoEl = remoteVideosRef.current.get(targetId);
      if (videoEl && e.streams[0]) {
        videoEl.srcObject = e.streams[0];
      }
    };

    // Add local tracks to the new connection
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        pc.addTrack(track, localStreamRef.current);
      }
    }
    if (screenStreamRef.current) {
      for (const track of screenStreamRef.current.getTracks()) {
        pc.addTrack(track, screenStreamRef.current);
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

  const startMedia = useCallback(async (withVideo: boolean) => {
    setLoading(true);
    setError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: withVideo ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } : false,
      });

      localStreamRef.current = stream;
      stream.getAudioTracks().forEach(t => (t.enabled = false));

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      setMicMuted(true);
      setCameraOff(!withVideo);
      setMediaActive(true);

      if (socket) {
        socket.emit('media-state', { enabled: { audio: true, video: withVideo } });
      }

      await sendOffersToAll();
    } catch (e: any) {
      const msg = e.message || 'Could not access media devices';
      setError(msg);
      console.error('[WebRTC] getUserMedia error:', e);
    } finally {
      setLoading(false);
    }
  }, [socket, sendOffersToAll]);

  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTracks = localStreamRef.current.getAudioTracks();
    audioTracks.forEach(t => (t.enabled = micMuted));
    setMicMuted(!micMuted);

    if (socket) {
      socket.emit('media-state', { enabled: { audio: !micMuted, video: !cameraOff } });
    }
  }, [micMuted, cameraOff, socket]);

  const toggleCamera = useCallback(async () => {
    if (!cameraOff) {
      // Turn off camera
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(t => t.stop());
        localStreamRef.current.getVideoTracks().forEach(t => localStreamRef.current?.removeTrack(t));
      }
      setCameraOff(true);

      Array.from(peersRef.current.values()).forEach(async (peer) => {
        const sender = peer.connection.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          try { await peer.connection.removeTrack(sender); } catch {}
        }
      });

      if (socket) {
        socket.emit('media-state', { enabled: { audio: !micMuted, video: false } });
      }
      return;
    }

    // Turn on camera
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });

      const videoTrack = videoStream.getVideoTracks()[0];

      if (localStreamRef.current) {
        localStreamRef.current.addTrack(videoTrack);
      }

      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }

      const peersEntries = Array.from(peersRef.current.entries());
      for (const [targetId, peer] of peersEntries) {
        try {
          peer.connection.addTrack(videoTrack, localStreamRef.current!);
        } catch {
          try {
            const offer = await peer.connection.createOffer();
            await peer.connection.setLocalDescription(offer);
            if (socket) {
              socket.emit('signal', { to: targetId, signal: { type: 'offer', sdp: peer.connection.localDescription } });
            }
          } catch {}
        }
      }

      setCameraOff(false);
      if (socket) {
        socket.emit('media-state', { enabled: { audio: !micMuted, video: true } });
      }
    } catch (e) {
      console.error('[WebRTC] Camera error:', e);
    }
  }, [cameraOff, micMuted, socket]);

  const toggleScreenShare = useCallback(async () => {
    if (screenSharing) {
      // Stop screen share
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
      }
      screenStreamRef.current = null;
      setScreenSharing(false);
      return;
    }

    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });

      screenStreamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      videoTrack.onended = () => {
        setScreenSharing(false);
        screenStreamRef.current = null;
      };

      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }

      Array.from(peersRef.current.values()).forEach((peer) => {
        try {
          peer.connection.addTrack(videoTrack, localStreamRef.current!);
        } catch {}
      });

      setScreenSharing(true);
    } catch {
      setScreenSharing(false);
    }
  }, [screenSharing]);

  const leaveMedia = useCallback(() => {
    cleanupAll();
    setMediaActive(false);
    setMicMuted(true);
    setCameraOff(true);
    setScreenSharing(false);
    setError('');

    if (socket) {
      socket.emit('media-state', { enabled: { audio: false, video: false } });
    }
  }, [socket]);

  function cleanupAll() {
    Array.from(peersRef.current.values()).forEach((peer) => {
      peer.connection.close();
    });
    peersRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    remoteVideosRef.current.clear();
  }

  // Handle peers leaving
  useEffect(() => {
    if (!socket) return;
    const handleUserLeft = ({ socketId: leftId }: { socketId: string }) => {
      const peer = peersRef.current.get(leftId);
      if (peer) {
        peer.connection.close();
        peersRef.current.delete(leftId);
        remoteVideosRef.current.delete(leftId);
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
          onClick={() => startMedia(false)}
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

  const activePeers = Array.from(peersRef.current.keys());
  const initial = userName.charAt(0).toUpperCase();

  // Minimized bubble
  if (minimized) {
    return (
      <>
        <button
          onClick={() => setMinimized(false)}
          className="fixed bottom-20 right-4 z-[9999] w-12 h-12 rounded-full premium-glass-card border-shine flex items-center justify-center shadow-[0_8px_32px_rgba(0,0,0,0.6)] hover:scale-105 transition-transform"
        >
          <div className="relative">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
              cameraOff ? 'bg-white/[0.08] text-white/70' : 'bg-emerald-500/20 text-emerald-400'
            }`}>
              {initial}
            </div>
            <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-[#050505] ${
              micMuted ? 'bg-red-400' : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'
            }`} />
          </div>
          {activePeers.length > 0 && (
            <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-white/15 text-[9px] font-bold text-white/80 flex items-center justify-center px-1 border border-[#050505]">
              {activePeers.length + 1}
            </div>
          )}
        </button>

        {/* Control dock */}
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] premium-glass-card rounded-2xl px-3 py-2 border-shine flex items-center gap-1.5 shadow-[0_8px_40px_rgba(0,0,0,0.6)]">
          <button onClick={toggleMic} className={`p-2.5 rounded-xl transition-all ${micMuted ? 'bg-red-500/15 text-red-400' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'}`} title={micMuted ? 'Unmute mic' : 'Mute mic'}>
            {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <button onClick={toggleCamera} className={`p-2.5 rounded-xl transition-all ${cameraOff ? 'bg-red-500/15 text-red-400' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'}`} title={cameraOff ? 'Turn on camera' : 'Turn off camera'}>
            {cameraOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
          </button>
          <button onClick={toggleScreenShare} className={`p-2.5 rounded-xl transition-all ${screenSharing ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'}`} title={screenSharing ? 'Stop sharing' : 'Share screen'}>
            <Monitor className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-white/[0.08] mx-1" />
          <button onClick={leaveMedia} className="p-2.5 rounded-xl bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-all" title="Leave audio">
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Drag handle + Minimize */}
      <div
        ref={panelRef}
        className="fixed z-[9999] select-none"
        style={{
          right: position.x === 0 && position.y === 0 ? '12px' : undefined,
          bottom: position.x === 0 && position.y === 0 ? '80px' : undefined,
          left: position.x !== 0 || position.y !== 0 ? `calc(100vw - 192px + ${position.x}px)` : undefined,
          top: position.x !== 0 || position.y !== 0 ? `calc(100vh - 180px + ${position.y}px)` : undefined,
        }}
      >
        {/* Main preview */}
        <div className="premium-glass-card rounded-xl overflow-hidden border-shine shadow-[0_8px_40px_rgba(0,0,0,0.6)]"
          style={{ width: '180px', maxWidth: '180px' }}>
          {/* Header drag handle */}
          <div
            onMouseDown={handleMouseDown}
            className="flex items-center justify-between px-2 py-1.5 bg-white/[0.03] border-b border-white/[0.06] cursor-grab active:cursor-grabbing"
          >
            <div className="flex items-center gap-1.5">
              <GripHorizontal className="w-2.5 h-2.5 text-white/30" />
              <span className="text-[9px] text-white/40 font-mono font-medium">{userName}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white/[0.04] text-[8px] text-white/40 font-mono">
                <Users className="w-2 h-2" />
                <span>{activePeers.length + 1}</span>
              </div>
              <button onClick={() => setMinimized(true)} className="p-0.5 rounded hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition-all">
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Video / Avatar area */}
          <div className="relative" style={{ aspectRatio: '4/3' }}>
            {!cameraOff ? (
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[#0a0a0e]">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${
                  !micMuted
                    ? 'bg-emerald-500/20 text-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.2)]'
                    : 'bg-white/[0.06] text-white/50'
                }`}>
                  {initial}
                </div>
                {/* Speaking glow ring */}
                {!micMuted && (
                  <div className="absolute inset-0 rounded-b-xl pointer-events-none">
                    <div className="absolute inset-2 rounded-full bg-emerald-400/5 blur-xl animate-pulse" />
                  </div>
                )}
              </div>
            )}

            {/* Bottom overlay */}
            <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/70 to-transparent">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-white/70 font-medium drop-shadow-md">You</span>
                <div className="flex items-center gap-1">
                  <div className={`p-0.5 rounded ${micMuted ? 'bg-red-400/30' : 'bg-emerald-400/30'}`}>
                    {micMuted ? <MicOff className="w-2.5 h-2.5 text-red-300" /> : <Mic className="w-2.5 h-2.5 text-emerald-300" />}
                  </div>
                  <div className={`p-0.5 rounded ${cameraOff ? 'bg-red-400/30' : 'bg-emerald-400/30'}`}>
                    {cameraOff ? <VideoOff className="w-2.5 h-2.5 text-red-300" /> : <Video className="w-2.5 h-2.5 text-emerald-300" />}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Remote participants strip */}
          {activePeers.length > 0 && (
            <div className="flex items-center gap-1 px-2 py-1.5 border-t border-white/[0.06] bg-white/[0.02] overflow-x-auto scrollbar-none">
              {activePeers.slice(0, 4).map(pid => {
                const p = participants.find(pp => pp.socketId === pid);
                const short = p?.name?.charAt(0).toUpperCase() || '?';
                return (
                  <div key={pid} className="flex items-center gap-1.5 shrink-0">
                    <div className="w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center text-[8px] font-bold text-white/50 border border-white/[0.06]">
                      {short}
                    </div>
                    <span className="text-[8px] text-white/40 font-mono truncate max-w-[40px]">{p?.name || '...'}</span>
                  </div>
                );
              })}
              {activePeers.length > 4 && (
                <span className="text-[8px] text-white/30 font-mono shrink-0">+{activePeers.length - 4}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Floating control dock */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] premium-glass-card rounded-2xl px-3 py-2 border-shine flex items-center gap-1.5 shadow-[0_8px_40px_rgba(0,0,0,0.6)]">
        <button onClick={toggleMic} className={`p-2.5 rounded-xl transition-all ${micMuted ? 'bg-red-500/15 text-red-400' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'}`} title={micMuted ? 'Unmute mic' : 'Mute mic'}>
          {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>
        <button onClick={toggleCamera} className={`p-2.5 rounded-xl transition-all ${cameraOff ? 'bg-red-500/15 text-red-400' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'}`} title={cameraOff ? 'Turn on camera' : 'Turn off camera'}>
          {cameraOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
        </button>
        <button onClick={toggleScreenShare} className={`p-2.5 rounded-xl transition-all ${screenSharing ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'}`} title={screenSharing ? 'Stop sharing' : 'Share screen'}>
          <Monitor className="w-4 h-4" />
        </button>
        <div className="w-px h-6 bg-white/[0.08] mx-1" />
        <button onClick={leaveMedia} className="p-2.5 rounded-xl bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-all" title="Leave audio">
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    </>
  );
}
