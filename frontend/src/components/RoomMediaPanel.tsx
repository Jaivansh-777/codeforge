'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Mic, MicOff, Phone, PhoneOff, Loader2, ChevronDown, Users,
  Camera, CameraOff, Monitor, MonitorOff, GripHorizontal,
  X, Maximize2, Minimize2
} from 'lucide-react';
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
}

interface RemoteMediaState {
  audio: boolean;
  video: boolean;
  screen: boolean;
}

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
};

const SCREEN_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  frameRate: { ideal: 30 },
};

function log(...args: any[]) {
  console.log('[WebRTC]', ...args);
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
  const [speaking, setSpeaking] = useState(false);
  const [screenShareBy, setScreenShareBy] = useState<string | null>(null);
  const [screenShareName, setScreenShareName] = useState('');
  const [showScreenPanel, setShowScreenPanel] = useState(true);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerData>>(new Map());
  const remoteAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const socketRef = useRef<Socket | null>(null);
  const socketIdRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speakingIntervalRef = useRef<number | null>(null);
  const participantsRef = useRef<Participant[]>([]);
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, startPosX: 0, startPosY: 0 });
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamsRef = useRef<Map<string, MediaStream | null>>(new Map());
  const remoteMediaStatesRef = useRef<Map<string, RemoteMediaState>>(new Map());
  const wasCameraOnRef = useRef(false);
  const screenShareByRef = useRef<string | null>(null);

  socketRef.current = socket;
  socketIdRef.current = socketId;
  participantsRef.current = participants;
  screenShareByRef.current = screenShareBy;

  const [, forceUpdate] = useState(0);
  const doForceUpdate = useCallback(() => forceUpdate(n => n + 1), []);

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  });

  // --- Speaking detection ---
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

  // --- Find video sender by transceiver receiver track kind ---
  function getVideoSender(pc: RTCPeerConnection): RTCRtpSender | null {
    const transceiver = pc.getTransceivers().find(t => t.receiver?.track?.kind === 'video');
    return transceiver?.sender || null;
  }

  function getAudioSender(pc: RTCPeerConnection): RTCRtpSender | null {
    const transceiver = pc.getTransceivers().find(t => t.receiver?.track?.kind === 'audio');
    return transceiver?.sender || null;
  }

  // --- Set per-sender bitrate for quality ---
  function setVideoBitrate(pc: RTCPeerConnection, bps: number) {
    const sender = getVideoSender(pc);
    if (!sender) return;
    const params = sender.getParameters();
    if (!params.encodings) params.encodings = [{}];
    params.encodings[0].maxBitrate = bps;
    sender.setParameters(params).catch(() => {});
  }

  // --- Replace video track on all peer connections via replaceTrack (never addTrack/removeTrack) ---
  function broadcastVideoTrack(track: MediaStreamTrack | null) {
    peersRef.current.forEach((peer) => {
      const sender = getVideoSender(peer.connection);
      if (track) {
        if (sender) {
          sender.replaceTrack(track).catch(() => {});
        } else {
          peer.connection.addTrack(track, localStreamRef.current!);
        }
        setVideoBitrate(peer.connection, screenSharing ? 4000000 : 1500000);
      } else if (sender) {
        try { peer.connection.removeTrack(sender); } catch {}
      }
    });
  }

  // --- Add local audio/video tracks to a PC (avoid duplicates) ---
  function addLocalTracks(pc: RTCPeerConnection) {
    const stream = localStreamRef.current;
    if (!stream) return;

    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      const existing = getAudioSender(pc);
      if (!existing) {
        pc.addTrack(audioTrack, stream);
      }
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      const existing = getVideoSender(pc);
      if (!existing) {
        pc.addTrack(videoTrack, stream);
      }
    }
  }

  async function renegotiateAll() {
    for (const [targetId, peer] of Array.from(peersRef.current.entries())) {
      const pc = peer.connection;
      try {
        if (pc.signalingState !== 'stable') continue;
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') continue;
        await pc.setLocalDescription(offer);
        socketRef.current?.emit('signal', {
          to: targetId,
          signal: { type: 'offer', sdp: pc.localDescription },
        });
      } catch (e) {
        console.error('[WebRTC] renegotiate error:', e);
      }
    }
  }

  // --- Create or get a PeerConnection for a target ---
  function ensurePC(targetId: string): PeerData {
    const existing = peersRef.current.get(targetId);
    if (existing) {
      const state = existing.connection.connectionState;
      if (state === 'new' || state === 'connecting' || state === 'connected') {
        return existing;
      }
      existing.connection.close();
      peersRef.current.delete(targetId);
    }

    const pc = new RTCPeerConnection(STUN_SERVERS);

    pc.onicecandidate = (e) => {
      if (e.candidate && socketRef.current) {
        socketRef.current.emit('signal', {
          to: targetId,
          signal: { type: 'ice-candidate', candidate: e.candidate },
        });
      }
    };

    pc.ontrack = (e) => {
      if (!e.streams[0]) return;
      log('remote track received from', targetId, 'kind:', e.track.kind);

      if (e.track.kind === 'audio') {
        let audioEl = remoteAudioRefs.current.get(targetId);
        if (!audioEl) {
          audioEl = document.createElement('audio');
          audioEl.autoplay = true;
          audioEl.style.display = 'none';
          document.body.appendChild(audioEl);
          remoteAudioRefs.current.set(targetId, audioEl);
        }
        audioEl.srcObject = e.streams[0];
        audioEl.play().catch((err: any) => {
          if (err.name !== 'NotAllowedError') {
            console.warn('[WebRTC] audio play error:', err);
          }
        });
        log('remote audio playing from', targetId);
      }

      if (e.track.kind === 'video') {
        remoteStreamsRef.current.set(targetId, e.streams[0]);
        doForceUpdate();
        log('remote video stream stored for', targetId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      log('ICE state with', targetId, ':', pc.iceConnectionState);
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        removePeer(targetId);
      }
    };

    pc.onconnectionstatechange = () => {
      log('connection state with', targetId, ':', pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        removePeer(targetId);
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        if (pc.signalingState !== 'stable') return;
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);
        socketRef.current?.emit('signal', {
          to: targetId,
          signal: { type: 'offer', sdp: pc.localDescription },
        });
      } catch (e) {
        console.error('[WebRTC] negotiation error:', e);
      }
    };

    const peerData: PeerData = { connection: pc };
    peersRef.current.set(targetId, peerData);
    log('PC created for', targetId);
    return peerData;
  }

  function removePeer(targetId: string) {
    const peer = peersRef.current.get(targetId);
    if (peer) {
      peer.connection.close();
      peersRef.current.delete(targetId);
    }
    const audioEl = remoteAudioRefs.current.get(targetId);
    if (audioEl) {
      audioEl.pause();
      audioEl.srcObject = null;
      audioEl.remove();
      remoteAudioRefs.current.delete(targetId);
    }
    remoteStreamsRef.current.delete(targetId);
    remoteMediaStatesRef.current.delete(targetId);
    if (screenShareByRef.current === targetId) {
      setScreenShareBy(null);
      setScreenShareName('');
    }
    doForceUpdate();
    log('removed peer', targetId);
  }

  // --- Send offer to a specific peer ---
  async function sendOffer(targetId: string) {
    const peer = ensurePC(targetId);
    const pc = peer.connection;

    addLocalTracks(pc);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      log('sent offer to', targetId);
      socketRef.current?.emit('signal', {
        to: targetId,
        signal: { type: 'offer', sdp: pc.localDescription },
      });
    } catch (e) {
      console.error('[WebRTC] createOffer error:', e);
    }
  }

  // --- Connect to all current peers ---
  async function connectToAllPeers() {
    const sid = socketIdRef.current;
    if (!sid) return;
    const targets = participantsRef.current.filter(p => p.socketId !== sid);
    log('connecting to', targets.length, 'peers');
    for (const target of targets) {
      await sendOffer(target.socketId);
    }
  }

  // --- Toggle camera (enable/disable the ONE existing video track, never addTrack/removeTrack) ---
  const toggleCamera = useCallback(async () => {
    if (screenSharing) return;
    setError('');

    const wasOff = cameraOff;
    const tracks = localStreamRef.current?.getVideoTracks();
    const track = tracks?.[0];

    if (!track) {
      if (wasOff) {
        try {
          const camStream = await navigator.mediaDevices.getUserMedia({
            video: VIDEO_CONSTRAINTS,
            audio: false,
          });
          const newTrack = camStream.getVideoTracks()[0];
          localStreamRef.current?.addTrack(newTrack);
          broadcastVideoTrack(newTrack);
        } catch (e: any) {
          setCameraOff(true);
          setError('Camera access denied');
          doForceUpdate();
          if (socketRef.current) {
            socketRef.current.emit('media-state', {
              enabled: { audio: !micMuted, video: false, screen: false },
            });
          }
          return;
        }
      }
      setCameraOff(false);
      doForceUpdate();
      if (socketRef.current) {
        socketRef.current.emit('media-state', {
          enabled: { audio: !micMuted, video: true, screen: false },
        });
      }
      return;
    }

    track.enabled = wasOff;
    broadcastVideoTrack(track);
    if (wasOff) {
      setCameraOff(false);
    } else {
      setCameraOff(true);
    }
    doForceUpdate();

    if (socketRef.current) {
      socketRef.current.emit('media-state', {
        enabled: { audio: !micMuted, video: wasOff, screen: false },
      });
    }
  }, [cameraOff, micMuted, screenSharing]);

  // --- Start screen share ---
  const startScreenShare = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: SCREEN_CONSTRAINTS,
        audio: true,
      });

      const videoTrack = displayStream.getVideoTracks()[0];
      videoTrack.onended = () => { stopScreenShare(); };

      screenStreamRef.current = displayStream;
      wasCameraOnRef.current = !cameraOff;

      const localStream = localStreamRef.current;
      if (localStream) {
        const oldTracks = localStream.getVideoTracks();
        localStream.addTrack(videoTrack);
        // Replace on senders BEFORE stopping old tracks (sender.track must be non-null)
        broadcastVideoTrack(videoTrack);
        oldTracks.forEach(t => {
          localStream.removeTrack(t);
          t.stop();
        });
      }

      setScreenSharing(true);
      setCameraOff(false);
      doForceUpdate();

      if (socketRef.current) {
        socketRef.current.emit('media-state', {
          enabled: { audio: !micMuted, video: true, screen: true },
        });
      }
    } catch (e: any) {
      if (e.name === 'NotAllowedError' || e.message?.includes('permission')) {
        setError('Screen sharing permission denied');
      } else if (e.name === 'NotSupportedError') {
        setError('Screen sharing not supported');
      } else {
        setError(e.message || 'Could not share screen');
      }
    } finally {
      setLoading(false);
    }
  }, [cameraOff, micMuted]);

  // --- Stop screen share ---
  const stopScreenShare = useCallback(async () => {
    const localStream = localStreamRef.current;

    const oldTracks = localStream?.getVideoTracks() || [];

    if (wasCameraOnRef.current) {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: VIDEO_CONSTRAINTS,
          audio: false,
        });
        const camTrack = camStream.getVideoTracks()[0];
        localStream?.addTrack(camTrack);
        // Replace on senders BEFORE stopping old screen track
        broadcastVideoTrack(camTrack);
      } catch {
        try {
          const fallback = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } },
            audio: false,
          });
          const fbTrack = fallback.getVideoTracks()[0];
          fbTrack.enabled = false;
          localStream?.addTrack(fbTrack);
          broadcastVideoTrack(fbTrack);
          wasCameraOnRef.current = false;
        } catch {
          broadcastVideoTrack(null);
          wasCameraOnRef.current = false;
        }
      }
    } else {
      try {
        const fallback = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 5 } },
          audio: false,
        });
        const fbTrack = fallback.getVideoTracks()[0];
        fbTrack.enabled = false;
        localStream?.addTrack(fbTrack);
        broadcastVideoTrack(fbTrack);
      } catch {
        broadcastVideoTrack(null);
      }
    }

    // Now safe to stop old tracks (screen track) since broadcastVideoTrack already ran
    oldTracks.forEach(t => {
      localStream?.removeTrack(t);
      t.stop();
    });

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }

    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }

    setScreenSharing(false);
    if (!wasCameraOnRef.current) {
      setCameraOff(true);
    }
    doForceUpdate();

    if (socketRef.current) {
      socketRef.current.emit('media-state', {
        enabled: {
          audio: !micMuted,
          video: wasCameraOnRef.current,
          screen: false,
        },
      });
    }
  }, [micMuted]);

  // --- Signal handler ---
  useEffect(() => {
    if (!socket) return;

    const handleSignal = async ({ from, signal }: { from: string; signal: any }) => {
      if (from === socketIdRef.current) return;
      log('received', signal.type, 'from', from);

      const peer = ensurePC(from);
      const pc = peer.connection;

      try {
        if (signal.type === 'offer') {
          if (pc.signalingState === 'have-local-offer') {
            log('glare: rolling back local offer');
            await pc.setLocalDescription({ type: 'rollback' as unknown as RTCSdpType });
          }

          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          log('set remote description (offer)');

          addLocalTracks(pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          log('sent answer to', from);
          socket.emit('signal', { to: from, signal: { type: 'answer', sdp: pc.localDescription } });

        } else if (signal.type === 'answer') {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            log('set remote description (answer)');
          }

        } else if (signal.type === 'ice-candidate') {
          if (signal.candidate && pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            log('added ICE candidate');
          }
        }
      } catch (e) {
        console.error('[WebRTC] signal error:', e);
      }
    };

    socket.on('signal', handleSignal);
    return () => { socket.off('signal', handleSignal); };
  }, [socket]);

  // --- Media state handler ---
  useEffect(() => {
    if (!socket) return;

    const handleMediaState = ({ socketId: sid, enabled }: { socketId: string; enabled: { audio?: boolean; video?: boolean; screen?: boolean } }) => {
      const state: RemoteMediaState = {
        audio: !!enabled.audio,
        video: !!enabled.video,
        screen: !!enabled.screen,
      };
      remoteMediaStatesRef.current.set(sid, state);

      if (enabled.screen) {
        setScreenShareBy(sid);
        const p = participantsRef.current.find(pp => pp.socketId === sid);
        setScreenShareName(p?.name || 'Unknown');
        setShowScreenPanel(true);
      } else if (screenShareByRef.current === sid) {
        setScreenShareBy(null);
        setScreenShareName('');
      }

      doForceUpdate();
    };

    socket.on('media-state', handleMediaState);
    return () => { socket.off('media-state', handleMediaState); };
  }, [socket]);

  // --- Cleanup on unmount ---
  useEffect(() => {
    return () => {
      cleanupAll();
    };
  }, []);

  function cleanupAll() {
    Array.from(peersRef.current.keys()).forEach(id => {
      removePeer(id);
    });
    peersRef.current.clear();

    Array.from(remoteAudioRefs.current.entries()).forEach(([id, el]) => {
      el.pause();
      el.srcObject = null;
      el.remove();
    });
    remoteAudioRefs.current.clear();
    remoteStreamsRef.current.clear();

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    stopSpeakingDetection();
    log('cleaned up all');
  }

  // --- Join Call (audio required, video optional) ---
  const joinCall = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      let videoTrack: MediaStreamTrack | null = null;
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: VIDEO_CONSTRAINTS,
        });
        videoTrack = camStream.getVideoTracks()[0];
        videoTrack.enabled = false;
      } catch {
        // Camera unavailable — join with audio only
      }

      const stream = new MediaStream();
      audioStream.getAudioTracks().forEach(t => stream.addTrack(t));
      if (videoTrack) stream.addTrack(videoTrack);

      localStreamRef.current = stream;
      stream.getAudioTracks().forEach(t => (t.enabled = false));
      setMicMuted(true);
      setCameraOff(!videoTrack);
      setMediaActive(true);
      startSpeakingDetection(stream);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      if (socketRef.current) {
        socketRef.current.emit('media-state', {
          enabled: { audio: true, video: !!videoTrack, screen: false },
        });
      }

      await connectToAllPeers();
    } catch (e: any) {
      const msg = e.message || 'Could not access microphone';
      setError(msg);
      console.error('[WebRTC] getUserMedia error:', e);
    } finally {
      setLoading(false);
    }
  }, [startSpeakingDetection]);

  // --- Toggle Mic ---
  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTracks = localStreamRef.current.getAudioTracks();
    audioTracks.forEach(t => (t.enabled = micMuted));
    setMicMuted(!micMuted);
    if (!micMuted) {
      setSpeaking(false);
    }

    if (socketRef.current) {
      socketRef.current.emit('media-state', {
        enabled: {
          audio: !micMuted,
          video: screenSharing ? true : !cameraOff,
          screen: screenSharing,
        },
      });
    }
  }, [micMuted, cameraOff, screenSharing]);

  // --- Leave Call ---
  const leaveCall = useCallback(() => {
    cleanupAll();
    setMediaActive(false);
    setMicMuted(true);
    setCameraOff(true);
    setScreenSharing(false);
    setScreenShareBy(null);
    setScreenShareName('');
    setError('');

    if (socketRef.current) {
      socketRef.current.emit('media-state', { enabled: { audio: false, video: false, screen: false } });
    }
  }, []);

  // --- Handle peers leaving ---
  useEffect(() => {
    if (!socket) return;
    const handleUserLeft = ({ socketId: leftId }: { socketId: string }) => {
      removePeer(leftId);
    };
    socket.on('user-left', handleUserLeft);
    return () => { socket.off('user-left', handleUserLeft); };
  }, [socket]);

  // --- Connect to new participants who join while in-call ---
  useEffect(() => {
    if (!mediaActive) return;
    const sid = socketIdRef.current;
    if (!sid) return;

    for (const p of participants) {
      if (p.socketId !== sid && !peersRef.current.has(p.socketId)) {
        sendOffer(p.socketId);
      }
    }
  }, [participants, mediaActive]);

  // --- Auto-minimize on mobile ---
  useEffect(() => {
    if (!mediaActive) return;
    const check = () => setMinimized(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [mediaActive]);

  // --- Drag handlers ---
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

  // --- Get remote participants with video for tile rendering ---
  const remoteParticipantsWithVideo = participantsRef.current
    .filter(p => p.socketId !== socketIdRef.current)
    .map(p => {
      const state = remoteMediaStatesRef.current.get(p.socketId);
      const stream = remoteStreamsRef.current.get(p.socketId) || null;
      const hasVideo = state?.video || false;
      const screenActive = state?.screen || false;
      return { ...p, stream, hasVideo, screenActive };
    });

  const initial = userName.charAt(0).toUpperCase();

  if (!mediaActive) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={joinCall}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl bg-white/[0.06] text-white/70 border border-white/[0.08] hover:bg-white/[0.1] hover:text-white/90 disabled:opacity-50 transition-all"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Phone className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{loading ? 'Connecting...' : 'Join Call'}</span>
        </button>
        {error && <span className="text-[10px] text-red-400/70 max-w-[120px] truncate">{error}</span>}
      </div>
    );
  }

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
      {/* Screen Share Large Panel */}
      {screenShareBy && showScreenPanel && (() => {
        const shareStream = remoteStreamsRef.current.get(screenShareBy) || null;
        const shareState = remoteMediaStatesRef.current.get(screenShareBy);
        if (!shareState?.screen) return null;
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none p-4 sm:p-8">
            <div
              className="relative w-full max-w-5xl max-h-[calc(100vh-180px)] premium-glass-card rounded-2xl overflow-hidden border-shine pointer-events-auto shadow-[0_20px_80px_rgba(0,0,0,0.7)] animate-fade-in"
              style={{ aspectRatio: '16/10' }}
            >
              <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
                <div className="flex items-center gap-2">
                  <Monitor className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-medium text-white/80">
                    {screenShareName}&apos;s Screen
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowScreenPanel(false)}
                    className="p-1 rounded-lg hover:bg-white/[0.1] text-white/50 hover:text-white/80 transition-all"
                    title="Minimize"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => { setScreenShareBy(null); setScreenShareName(''); }}
                    className="p-1 rounded-lg hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-all"
                    title="Close"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <video
                ref={el => { if (el && shareStream) el.srcObject = shareStream; }}
                autoPlay
                playsInline
                className="w-full h-full object-contain bg-black/60"
              />
              <div className="absolute bottom-0 left-0 right-0 z-20 px-4 py-2 bg-gradient-to-t from-black/60 to-transparent">
                <span className="text-[10px] text-white/40 font-mono">Live &bull; Shared screen</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Screen Share minimized indicator */}
      {screenShareBy && !showScreenPanel && (
        <button
          onClick={() => setShowScreenPanel(true)}
          className="fixed left-4 bottom-20 z-[100] premium-glass-card rounded-xl px-3 py-2 border-shine flex items-center gap-2 shadow-[0_8px_32px_rgba(0,0,0,0.6)] animate-slide-down"
        >
          <Monitor className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[10px] text-white/60 font-medium">{screenShareName}&apos;s Screen</span>
          <Maximize2 className="w-3 h-3 text-white/40" />
        </button>
      )}

      {/* Floating panel with video tiles */}
      <div
        className="fixed z-[9999] pointer-events-none select-none"
        style={{
          right: '16px',
          top: position.x === 0 && position.y === 0 ? '76px' : `calc(76px + ${position.y}px)`,
          transform: position.x !== 0 || position.y !== 0 ? `translateX(${position.x}px)` : undefined,
        }}
      >
        <div className="w-[180px] sm:w-[220px] premium-glass-card rounded-xl overflow-hidden border-shine shadow-[0_8px_40px_rgba(0,0,0,0.6)]">
          <div
            onMouseDown={handleMouseDown}
            className="flex items-center justify-between px-2.5 py-1.5 bg-white/[0.03] border-b border-white/[0.06] cursor-grab active:cursor-grabbing pointer-events-auto"
          >
            <div className="flex items-center gap-1.5">
              <GripHorizontal className="w-2.5 h-2.5 text-white/30" />
              <span className="text-[9px] text-white/40 font-mono font-medium truncate max-w-[80px]">{userName}</span>
            </div>
            <div className="flex items-center gap-1">
              {participants.length > 1 && (
                <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white/[0.04] text-[8px] text-white/40 font-mono">
                  <Users className="w-2 h-2" />
                  <span>{participants.length}</span>
                </div>
              )}
              <button
                onClick={() => { setMinimized(true); setShowScreenPanel(false); }}
                className="p-0.5 rounded hover:bg-white/[0.06] text-white/40 hover:text-white/70 transition-all pointer-events-auto"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="p-2 space-y-2 pointer-events-auto">
            {/* Local video tile */}
            <div className="relative rounded-lg overflow-hidden bg-[#0a0a0e] border border-white/[0.06] h-[100px] sm:h-[120px]">
              {!cameraOff ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    speaking
                      ? 'bg-emerald-500/20 text-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.2)]'
                      : 'bg-white/[0.06] text-white/50'
                  }`}>
                    {initial}
                  </div>
                </div>
              )}

              {speaking && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-1 rounded-lg border border-emerald-400/20 animate-ping" />
                </div>
              )}

              <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-white/70 font-medium drop-shadow-md">You</span>
                    {screenSharing && (
                      <Monitor className="w-2.5 h-2.5 text-emerald-400" />
                    )}
                    {speaking && <span className="text-[7px] text-emerald-400/80 font-medium">speaking</span>}
                  </div>
                  <div className={`p-[1px] rounded ${micMuted ? 'bg-red-400/40' : 'bg-emerald-400/40'}`}>
                    {micMuted ? <MicOff className="w-2 h-2 text-red-300" /> : <Mic className="w-2 h-2 text-emerald-300" />}
                  </div>
                </div>
              </div>
            </div>

            {/* Remote participant video tiles */}
            <div className="space-y-2 max-h-[240px] sm:max-h-[300px] overflow-y-auto scrollbar-none">
              {remoteParticipantsWithVideo.map(p => {
                const rState = remoteMediaStatesRef.current.get(p.socketId);
                const hasVideo = rState?.video && p.stream;
                const isScreen = rState?.screen || false;
                return (
                  <div
                    key={p.socketId}
                    className="relative rounded-lg overflow-hidden bg-[#0a0a0e] border border-white/[0.06] h-[80px] sm:h-[90px]"
                  >
                    {hasVideo ? (
                      <video
                        ref={el => { if (el && p.stream) el.srcObject = p.stream; }}
                        autoPlay
                        playsInline
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-white/[0.06] text-white/50">
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-gradient-to-t from-black/80 to-transparent">
                      <div className="flex items-center gap-1">
                        <span className="text-[8px] text-white/60 font-medium drop-shadow-md truncate max-w-[60px]">
                          {p.name}
                        </span>
                        {isScreen && <Monitor className="w-2 h-2 text-emerald-400" />}
                      </div>
                    </div>
                  </div>
                );
              })}
              {remoteParticipantsWithVideo.length === 0 && (
                <div className="py-4 text-center">
                  <span className="text-[9px] text-white/30 font-mono">No other participants</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Control dock */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] premium-glass-card rounded-2xl px-3 py-2 border-shine flex items-center gap-1.5 shadow-[0_8px_40px_rgba(0,0,0,0.6)] pointer-events-auto">
        <button
          onClick={toggleMic}
          className={`p-2.5 rounded-xl transition-all duration-200 active:scale-90 ${
            micMuted
              ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
              : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'
          }`}
          title={micMuted ? 'Unmute mic' : 'Mute mic'}
        >
          <div className="relative">
            {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 animate-[fadeIn_0.2s_ease-out]" />}
            {!micMuted && speaking && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            )}
          </div>
        </button>

        <button
          onClick={toggleCamera}
          disabled={screenSharing}
          className={`p-2.5 rounded-xl transition-all duration-200 active:scale-90 ${
            screenSharing
              ? 'bg-white/[0.03] text-white/30 cursor-not-allowed'
              : cameraOff
                ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'
          }`}
          title={screenSharing ? 'Stop screen share to toggle camera' : cameraOff ? 'Turn on camera' : 'Turn off camera'}
        >
          {cameraOff ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
        </button>

        <div className="w-px h-6 bg-white/[0.08] mx-1" />

        <button
          onClick={screenSharing ? stopScreenShare : startScreenShare}
          disabled={loading}
          className={`p-2.5 rounded-xl transition-all duration-200 active:scale-90 ${
            screenSharing
              ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
              : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'
          }`}
          title={screenSharing ? 'Stop sharing screen' : 'Share screen'}
        >
          {screenSharing ? (
            <MonitorOff className="w-4 h-4" />
          ) : loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Monitor className="w-4 h-4" />
          )}
        </button>

        <div className="w-px h-6 bg-white/[0.08] mx-1" />

        <button
          onClick={leaveCall}
          className="p-2.5 rounded-xl bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-all duration-200 active:scale-90"
          title="Leave call"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    </>
  );
}
