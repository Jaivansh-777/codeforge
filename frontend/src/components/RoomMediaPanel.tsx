'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Video, VideoOff, Monitor, PhoneOff, Phone, Loader2 } from 'lucide-react';
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

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerData>>(new Map());
  const remoteVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map());

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

  return (
    <>
      {/* Video tiles */}
      <div className="fixed bottom-20 right-4 z-[9999] flex flex-col gap-2 max-w-[200px]">
        {/* Local video */}
        <div className="relative premium-glass-card rounded-xl overflow-hidden border-shine w-full" style={{ aspectRatio: '4/3', minHeight: '100px' }}>
          <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <div className="absolute bottom-1 left-1.5 flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${micMuted ? 'bg-red-400' : 'bg-emerald-400'}`} />
            <span className="text-[8px] text-white/60 font-medium drop-shadow-lg">You</span>
          </div>
        </div>
        {activePeers.map(pid => {
          const p = participants.find(pp => pp.socketId === pid);
          return (
            <div key={pid} className="relative premium-glass-card rounded-xl overflow-hidden border-shine w-full" style={{ aspectRatio: '4/3', minHeight: '100px' }}>
              <video
                ref={el => { if (el) remoteVideosRef.current.set(pid, el); }}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-1 left-1.5">
                <span className="text-[8px] text-white/60 font-medium drop-shadow-lg">{p?.name || 'Peer'}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating control dock */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] premium-glass-card rounded-2xl px-3 py-2 border-shine flex items-center gap-1.5 shadow-[0_8px_40px_rgba(0,0,0,0.6)]">
        <button
          onClick={toggleMic}
          className={`p-2.5 rounded-xl transition-all ${micMuted ? 'bg-red-500/15 text-red-400' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'}`}
          title={micMuted ? 'Unmute mic' : 'Mute mic'}
        >
          {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>
        <button
          onClick={toggleCamera}
          className={`p-2.5 rounded-xl transition-all ${cameraOff ? 'bg-red-500/15 text-red-400' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'}`}
          title={cameraOff ? 'Turn on camera' : 'Turn off camera'}
        >
          {cameraOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
        </button>
        <button
          onClick={toggleScreenShare}
          className={`p-2.5 rounded-xl transition-all ${screenSharing ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'}`}
          title={screenSharing ? 'Stop sharing' : 'Share screen'}
        >
          <Monitor className="w-4 h-4" />
        </button>
        <div className="w-px h-6 bg-white/[0.08] mx-1" />
        <button
          onClick={leaveMedia}
          className="p-2.5 rounded-xl bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-all"
          title="Leave audio"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    </>
  );
}
