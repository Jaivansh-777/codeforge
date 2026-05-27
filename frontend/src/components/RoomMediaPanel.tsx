'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Mic, MicOff, Phone, PhoneOff, Loader2,
  Camera, CameraOff, Monitor, MonitorOff,
  X, Maximize2, Minimize2, Wifi, WifiOff, Volume2,
} from 'lucide-react';
import type { Socket } from 'socket.io-client';
import toast from 'react-hot-toast';

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

interface RemoteMediaState {
  audio: boolean;
  video: boolean;
  screen: boolean;
}

const VID_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
};
const SCR_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  frameRate: { ideal: 30 },
};

const LOW_VID_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 320 },
  height: { ideal: 240 },
  frameRate: { ideal: 5 },
};

function log(...a: any[]) { console.log('[WebRTC]', ...a); }

function ParticipantTile({
  stream,
  name,
  hasVideo,
  isScreen,
  isLocal,
  initial,
  speaking,
  micMuted,
  muted,
}: {
  stream: MediaStream | null;
  name: string;
  hasVideo: boolean;
  isScreen: boolean;
  isLocal: boolean;
  initial: string;
  speaking: boolean;
  micMuted: boolean;
  muted?: boolean;
}) {
  const vidRef = useRef<HTMLVideoElement | null>(null);
  const [streamReady, setStreamReady] = useState(false);

  useEffect(() => {
    if (vidRef.current && stream) {
      vidRef.current.srcObject = stream;
      setStreamReady(true);
    } else {
      setStreamReady(false);
    }
  }, [stream]);

  return (
    <div
      className="pointer-events-auto premium-glass-card-light rounded-xl overflow-hidden border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-all hover:scale-105"
      style={{ width: '128px', height: '96px' }}
    >
      <div className="relative w-full h-full bg-[#0a0a0e]">
        {hasVideo && stream ? (
          <>
            {!streamReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0e] z-10">
                <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
              </div>
            )}
            <video
              ref={vidRef}
              autoPlay
              playsInline
              muted={isLocal || muted}
              className={`absolute inset-0 w-full h-full ${isLocal ? 'scale-x-[-1]' : ''} object-contain bg-[#0a0a0e]`}
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
              speaking ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[0.06] text-white/50'
            }`}>
              {initial}
            </div>
          </div>
        )}
        {isScreen && (
          <div className="absolute top-1 left-1 z-10 bg-emerald-500/20 rounded-md px-1 py-0.5">
            <Monitor className="w-2.5 h-2.5 text-emerald-400" />
          </div>
        )}
        {speaking && !micMuted && (
          <div className="absolute inset-0 rounded-xl border-2 border-emerald-400/40 pointer-events-none" />
        )}
        <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-gradient-to-t from-black/80 to-transparent">
          <div className="flex items-center gap-1">
            <span className="text-[8px] text-white/60 font-medium drop-shadow-md truncate max-w-[70px]">
              {isLocal ? 'You' : name}
            </span>
            {isScreen && <Monitor className="w-2 h-2 text-emerald-400 shrink-0" />}
            {micMuted && <MicOff className="w-2 h-2 text-red-400 shrink-0" />}
            {!micMuted && !isLocal && <Volume2 className="w-2 h-2 text-emerald-400/60 shrink-0" />}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RoomMediaPanel({ socket, socketId, participants, userName }: Props) {
  const [mediaActive, setMediaActive] = useState(false);
  const [micMuted, setMicMuted] = useState(true);
  const [cameraOff, setCameraOff] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [minimized, setMinimized] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [screenShareBy, setScreenShareBy] = useState<string | null>(null);
  const [screenShareName, setScreenShareName] = useState('');
  const [showScreenPanel, setShowScreenPanel] = useState(true);
  const [connStates, setConnStates] = useState<Map<string, string>>(new Map());
  const [localStreamReady, setLocalStreamReady] = useState(false);
  const [showLocalPreview, setShowLocalPreview] = useState(true);

  const lsRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remAudioRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const sRef = useRef<Socket | null>(null);
  const sidRef = useRef<string | null>(null);
  const actxRef = useRef<AudioContext | null>(null);
  const anlRef = useRef<AnalyserNode | null>(null);
  const spkIntRef = useRef<number | null>(null);
  const partsRef = useRef<Participant[]>([]);
  const localVidRef = useRef<HTMLVideoElement | null>(null);
  const scrStreamRef = useRef<MediaStream | null>(null);
  const remStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const remMediaRef = useRef<Map<string, RemoteMediaState>>(new Map());
  const wasCamRef = useRef(false);
  const scrByRef = useRef<string | null>(null);
  const forceTick = useRef(0);

  sRef.current = socket;
  sidRef.current = socketId;
  partsRef.current = participants;
  scrByRef.current = screenShareBy;

  const [, tick] = useState(0);
  const force = useCallback(() => {
    forceTick.current++;
    tick(n => n + 1);
  }, []);

  // Sync local video ref on every render
  useEffect(() => {
    if (localVidRef.current && lsRef.current) {
      localVidRef.current.srcObject = lsRef.current;
      setLocalStreamReady(true);
    }
  });

  // -- Speaking --
  const startSpk = useCallback((s: MediaStream) => {
    try {
      const c = new AudioContext();
      const src = c.createMediaStreamSource(s);
      const an = c.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      actxRef.current = c;
      anlRef.current = an;
      const d = new Uint8Array(an.frequencyBinCount);
      spkIntRef.current = window.setInterval(() => {
        an.getByteFrequencyData(d);
        setSpeaking(d.reduce((a, b) => a + b, 0) / d.length > 15);
      }, 100);
    } catch {}
  }, []);

  const stopSpk = useCallback(() => {
    if (spkIntRef.current) { clearInterval(spkIntRef.current); spkIntRef.current = null; }
    if (actxRef.current) { actxRef.current.close(); actxRef.current = null; }
    anlRef.current = null;
    setSpeaking(false);
  }, []);

  // -- Sender helpers --
  function vidSender(pc: RTCPeerConnection) {
    const t = pc.getTransceivers().find(x => x.receiver?.track?.kind === 'video');
    return t?.sender || null;
  }
  function audSender(pc: RTCPeerConnection) {
    const t = pc.getTransceivers().find(x => x.receiver?.track?.kind === 'audio');
    return t?.sender || null;
  }

  function setBitrate(pc: RTCPeerConnection, bps: number) {
    const s = vidSender(pc);
    if (!s) return;
    const p = s.getParameters();
    if (!p.encodings) p.encodings = [{}];
    p.encodings[0].maxBitrate = bps;
    s.setParameters(p).catch(() => {});
  }

  function bcastVid(track: MediaStreamTrack | null, isScreen = false) {
    peersRef.current.forEach((pc) => {
      const s = vidSender(pc);
      if (track) {
        if (s) s.replaceTrack(track).catch(() => {});
        else pc.addTrack(track, lsRef.current!);
        setBitrate(pc, isScreen ? 4000000 : 1500000);
      } else if (s) {
        try { pc.removeTrack(s); } catch {}
      }
    });
  }

  function addLocalTracks(pc: RTCPeerConnection) {
    const st = lsRef.current;
    if (!st) return;
    const at = st.getAudioTracks()[0];
    if (at && !audSender(pc)) pc.addTrack(at, st);
    const vt = st.getVideoTracks()[0];
    if (vt && !vidSender(pc)) pc.addTrack(vt, st);
  }

  function updConnState(id: string, st: string) {
    setConnStates(p => { const m = new Map(p); m.set(id, st); return m; });
  }

  // -- Peer connection --
  function ensurePC(targetId: string): RTCPeerConnection {
    const ex = peersRef.current.get(targetId);
    if (ex) {
      const st = ex.connectionState;
      if (st === 'new' || st === 'connecting' || st === 'connected') return ex;
      ex.close();
      peersRef.current.delete(targetId);
    }

    const pc = new RTCPeerConnection(STUN_SERVERS);

    pc.onicecandidate = (e) => {
      if (e.candidate && sRef.current)
        sRef.current.emit('signal', { to: targetId, signal: { type: 'ice-candidate', candidate: e.candidate } });
    };

    pc.ontrack = (e) => {
      if (!e.streams[0]) return;
      log('track from', targetId, e.track.kind);
      if (e.track.kind === 'audio') {
        let el = remAudioRef.current.get(targetId);
        if (!el) {
          el = document.createElement('audio');
          el.autoplay = true;
          el.style.display = 'none';
          document.body.appendChild(el);
          remAudioRef.current.set(targetId, el);
        }
        el.srcObject = e.streams[0];
        el.play().catch((err: any) => { if (err.name !== 'NotAllowedError') console.warn('[audio]', err); });
      }
      if (e.track.kind === 'video') {
        remStreamsRef.current.set(targetId, e.streams[0]);
        setTimeout(() => force(), 0);
      }
    };

    pc.oniceconnectionstatechange = () => {
      updConnState(targetId, pc.iceConnectionState);
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed')
        removePeer(targetId);
    };

    pc.onconnectionstatechange = () => {
      updConnState(targetId, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected')
        removePeer(targetId);
    };

    pc.onnegotiationneeded = async () => {
      try {
        if (pc.signalingState !== 'stable') return;
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);
        sRef.current?.emit('signal', { to: targetId, signal: { type: 'offer', sdp: pc.localDescription } });
      } catch (e) { console.error('[neg]', e); }
    };

    peersRef.current.set(targetId, pc);
    return pc;
  }

  function removePeer(targetId: string) {
    const pc = peersRef.current.get(targetId);
    if (pc) { pc.close(); peersRef.current.delete(targetId); }
    const el = remAudioRef.current.get(targetId);
    if (el) { el.pause(); el.srcObject = null; el.remove(); remAudioRef.current.delete(targetId); }
    remStreamsRef.current.delete(targetId);
    remMediaRef.current.delete(targetId);
    updConnState(targetId, 'closed');
    if (scrByRef.current === targetId) { setScreenShareBy(null); setScreenShareName(''); }
    setTimeout(() => force(), 0);
  }

  async function sendOffer(targetId: string) {
    const pc = ensurePC(targetId);
    addLocalTracks(pc);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sRef.current?.emit('signal', { to: targetId, signal: { type: 'offer', sdp: pc.localDescription } });
    } catch (e) { console.error('[offer]', e); }
  }

  async function connectAll() {
    const sid = sidRef.current;
    if (!sid) return;
    for (const p of partsRef.current) {
      if (p.socketId !== sid) await sendOffer(p.socketId);
    }
  }

  // -- Toggle camera --
  const toggleCam = useCallback(async () => {
    if (screenSharing) return;
    setError('');
    const was = cameraOff;
    const t = lsRef.current?.getVideoTracks()[0];
    if (!t) {
      if (was) {
        try {
          const cs = await navigator.mediaDevices.getUserMedia({ video: VID_CONSTRAINTS });
          const nt = cs.getVideoTracks()[0];
          lsRef.current?.addTrack(nt);
          bcastVid(nt, false);
        } catch { setCameraOff(true); setError('Camera denied'); force(); return; }
      }
      setCameraOff(false); force();
      sRef.current?.emit('media-state', { enabled: { audio: !micMuted, video: true, screen: false } });
      return;
    }
    t.enabled = was;
    bcastVid(t, false);
    setCameraOff(!was);
    force();
    sRef.current?.emit('media-state', { enabled: { audio: !micMuted, video: was, screen: false } });
  }, [cameraOff, micMuted, screenSharing]);

  // -- Screen share --
  const startSS = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const ds = await navigator.mediaDevices.getDisplayMedia({ video: SCR_CONSTRAINTS, audio: true });
      const vt = ds.getVideoTracks()[0];
      vt.onended = () => stopSS();
      scrStreamRef.current = ds;
      wasCamRef.current = !cameraOff;
      const ls = lsRef.current;
      if (ls) {
        const old = ls.getVideoTracks();
        ls.addTrack(vt);
        bcastVid(vt, true);
        old.forEach(t => { ls.removeTrack(t); t.stop(); });
      }
      setScreenSharing(true); setCameraOff(false); setLocalStreamReady(false); force();
      toast('Tip: Share entire screen or a different window instead of this browser tab to avoid mirror effect.', {
        duration: 5000, style: { background: 'rgba(10,10,14,0.95)', color: '#e4e4e7', border: '1px solid rgba(251,191,36,0.3)', fontSize: '12px', borderRadius: '12px' },
      });
      sRef.current?.emit('media-state', { enabled: { audio: !micMuted, video: true, screen: true } });
    } catch (e: any) {
      if (e.name === 'NotAllowedError') setError('Screen share denied');
      else setError(e.message || 'Screen share failed');
    } finally { setLoading(false); }
  }, [cameraOff, micMuted]);

  const stopSS = useCallback(async () => {
    const ls = lsRef.current;
    const old = ls?.getVideoTracks() || [];
    if (wasCamRef.current) {
      try {
        const cs = await navigator.mediaDevices.getUserMedia({ video: VID_CONSTRAINTS });
        const ct = cs.getVideoTracks()[0];
        ls?.addTrack(ct);
        bcastVid(ct, false);
      } catch { bcastVid(null); wasCamRef.current = false; }
    } else {
      try {
        const fb = await navigator.mediaDevices.getUserMedia({ video: LOW_VID_CONSTRAINTS });
        const ft = fb.getVideoTracks()[0];
        ft.enabled = false;
        ls?.addTrack(ft);
        bcastVid(ft, false);
      } catch { bcastVid(null); }
    }
    old.forEach(t => { ls?.removeTrack(t); t.stop(); });
    if (scrStreamRef.current) { scrStreamRef.current.getTracks().forEach(t => t.stop()); scrStreamRef.current = null; }
    if (localVidRef.current && ls) {
      localVidRef.current.srcObject = ls;
      setLocalStreamReady(true);
    }
    setScreenSharing(false);
    if (!wasCamRef.current) setCameraOff(true);
    force();
    sRef.current?.emit('media-state', { enabled: { audio: !micMuted, video: wasCamRef.current, screen: false } });
  }, [micMuted]);

  // -- Signal handler --
  useEffect(() => {
    if (!socket) return;
    const h = async ({ from, signal }: { from: string; signal: any }) => {
      if (from === sidRef.current) return;
      const pc = ensurePC(from);
      try {
        if (signal.type === 'offer') {
          if (pc.signalingState === 'have-local-offer')
            await pc.setLocalDescription({ type: 'rollback' as unknown as RTCSdpType });
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          addLocalTracks(pc);
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          socket.emit('signal', { to: from, signal: { type: 'answer', sdp: pc.localDescription } });
          const audioOn = lsRef.current?.getAudioTracks().some(t => t.enabled) ?? false;
          const videoOn = lsRef.current?.getVideoTracks().some(t => t.enabled) ?? false;
          const screenOn = scrStreamRef.current !== null;
          socket.emit('media-state', { enabled: { audio: audioOn, video: videoOn, screen: screenOn } });
        } else if (signal.type === 'answer') {
          if (pc.signalingState === 'have-local-offer')
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } else if (signal.type === 'ice-candidate') {
          if (signal.candidate && pc.remoteDescription)
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (e) { console.error('[signal]', e); }
    };
    socket.on('signal', h);
    return () => { socket.off('signal', h); };
  }, [socket]);

  // -- Media state --
  useEffect(() => {
    if (!socket) return;
    const h = ({ socketId: sid, enabled }: { socketId: string; enabled: { audio?: boolean; video?: boolean; screen?: boolean } }) => {
      const st: RemoteMediaState = { audio: !!enabled.audio, video: !!enabled.video, screen: !!enabled.screen };
      remMediaRef.current.set(sid, st);
      if (enabled.screen) {
        setScreenShareBy(sid);
        const p = partsRef.current.find(pp => pp.socketId === sid);
        setScreenShareName(p?.name || 'Unknown');
        setShowScreenPanel(true);
      } else if (scrByRef.current === sid) {
        setScreenShareBy(null); setScreenShareName('');
      }
      setTimeout(() => force(), 0);
    };
    socket.on('media-state', h);
    return () => { socket.off('media-state', h); };
  }, [socket]);

  // -- Join call --
  const joinCall = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const as = await navigator.mediaDevices.getUserMedia({ audio: true });
      let vt: MediaStreamTrack | null = null;
      try {
        const cs = await navigator.mediaDevices.getUserMedia({ video: VID_CONSTRAINTS });
        vt = cs.getVideoTracks()[0];
        vt.enabled = false;
      } catch {}
      const st = new MediaStream();
      as.getAudioTracks().forEach(t => st.addTrack(t));
      if (vt) st.addTrack(vt);
      lsRef.current = st;
      st.getAudioTracks().forEach(t => (t.enabled = false));
      setMicMuted(true); setCameraOff(!vt); setMediaActive(true);
      if (vt) setLocalStreamReady(true);
      startSpk(st);
      if (localVidRef.current) {
        localVidRef.current.srcObject = st;
        setLocalStreamReady(true);
      }
      sRef.current?.emit('media-state', { enabled: { audio: true, video: !!vt, screen: false } });
      await connectAll();
    } catch (e: any) {
      setError(e.message || 'Microphone access denied');
    } finally { setLoading(false); }
  }, [startSpk]);

  // -- Toggle mic --
  const toggleMic = useCallback(() => {
    if (!lsRef.current) return;
    lsRef.current.getAudioTracks().forEach(t => (t.enabled = micMuted));
    setMicMuted(!micMuted);
    if (!micMuted) setSpeaking(false);
    sRef.current?.emit('media-state', { enabled: { audio: !micMuted, video: screenSharing || !cameraOff, screen: screenSharing } });
  }, [micMuted, cameraOff, screenSharing]);

  // -- Leave --
  const leaveCall = useCallback(() => {
    Array.from(peersRef.current.keys()).forEach(id => removePeer(id));
    peersRef.current.clear();
    Array.from(remAudioRef.current.entries()).forEach(([, el]) => { el.pause(); el.srcObject = null; el.remove(); });
    remAudioRef.current.clear();
    remStreamsRef.current.clear();
    if (scrStreamRef.current) { scrStreamRef.current.getTracks().forEach(t => t.stop()); scrStreamRef.current = null; }
    if (lsRef.current) { lsRef.current.getTracks().forEach(t => t.stop()); lsRef.current = null; }
    stopSpk();
    setMediaActive(false); setMicMuted(true); setCameraOff(true);
    setScreenSharing(false); setScreenShareBy(null); setScreenShareName(''); setError('');
    sRef.current?.emit('media-state', { enabled: { audio: false, video: false, screen: false } });
  }, [stopSpk]);

  // -- Events --
  useEffect(() => {
    if (!socket) return;
    const h = ({ socketId: lid }: { socketId: string }) => removePeer(lid);
    socket.on('user-left', h);
    return () => { socket.off('user-left', h); };
  }, [socket]);

  useEffect(() => {
    if (!mediaActive) return;
    const sid = sidRef.current;
    if (!sid) return;
    for (const p of participants) {
      if (p.socketId !== sid && !peersRef.current.has(p.socketId))
        sendOffer(p.socketId);
    }
  }, [participants, mediaActive]);

  useEffect(() => {
    if (!mediaActive) return;
    const c = () => setMinimized(window.innerWidth < 640);
    c();
    window.addEventListener('resize', c);
    return () => window.removeEventListener('resize', c);
  }, [mediaActive]);

  useEffect(() => { return () => { leaveCall(); }; }, []);

  // -- Compute remote list --
  const remoteList = partsRef.current.filter(p => p.socketId !== sidRef.current).map(p => {
    const st = remMediaRef.current.get(p.socketId);
    const str = remStreamsRef.current.get(p.socketId) || null;
    return { ...p, stream: str, hasVideo: !!st?.video && !!str, isScreen: !!st?.screen };
  });

  const hasScreenShare = screenShareBy && remMediaRef.current.get(screenShareBy)?.screen;

  const initial = userName.charAt(0).toUpperCase();

  // -- Not in call --
  if (!mediaActive) {
    return (
      <div className="flex items-center gap-2">
        <button onClick={joinCall} disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl bg-white/[0.06] text-white/70 border border-white/[0.08] hover:bg-white/[0.1] hover:text-white/90 disabled:opacity-50 transition-all">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Phone className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{loading ? 'Connecting...' : 'Join Call'}</span>
        </button>
        {error && <span className="text-[10px] text-red-400/70 max-w-[120px] truncate">{error}</span>}
      </div>
    );
  }

  // -- Minimized --
  if (minimized) {
    return (
      <button onClick={() => setMinimized(false)}
        className="fixed top-[76px] right-4 z-[99999] w-12 h-12 rounded-full premium-glass-card border-shine flex items-center justify-center shadow-[0_8px_32px_rgba(0,0,0,0.6)] hover:scale-105 transition-transform">
        <div className="relative">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${speaking ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[0.08] text-white/70'}`}>{initial}</div>
          {speaking && <div className="absolute inset-0 rounded-full border-2 border-emerald-400/40 animate-ping" />}
          <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-[#050505] ${micMuted ? 'bg-red-400' : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'}`} />
        </div>
      </button>
    );
  }

  return (
    <>
      {/* Screen Share Panel */}
      {hasScreenShare && showScreenPanel && (() => {
        const str = remStreamsRef.current.get(screenShareBy!) || null;
        return (
          <div className="fixed z-[9998] pointer-events-none"
            style={{ top: '80px', left: '50%', transform: 'translateX(-50%)', width: 'min(92vw, 1100px)' }}>
            <div className="relative w-full premium-glass-card rounded-2xl overflow-hidden border-shine pointer-events-auto shadow-[0_20px_80px_rgba(0,0,0,0.7)] animate-fade-in"
              style={{ aspectRatio: '16/9', maxHeight: 'calc(100vh - 180px)' }}>
              <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
                <div className="flex items-center gap-2">
                  <Monitor className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-medium text-white/80">{screenShareName}&apos;s Screen</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setShowScreenPanel(false)}
                    className="p-1 rounded-lg hover:bg-white/[0.1] text-white/50 hover:text-white/80 transition-all" title="Minimize">
                    <Minimize2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => { setScreenShareBy(null); setScreenShareName(''); }}
                    className="p-1 rounded-lg hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-all" title="Close">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {str ? (
                <video ref={el => { if (el && str) el.srcObject = str; }}
                  autoPlay playsInline
                  className="w-full h-full object-contain bg-black/60" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-black/60">
                  <Loader2 className="w-8 h-8 text-white/30 animate-spin" />
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 z-20 px-4 py-2 bg-gradient-to-t from-black/60 to-transparent">
                <span className="text-[10px] text-white/40 font-mono">Live &bull; Shared screen</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Screen Share minimized indicator */}
      {hasScreenShare && !showScreenPanel && (
        <button onClick={() => setShowScreenPanel(true)}
          className="fixed left-4 bottom-20 z-[99999] premium-glass-card rounded-xl px-3 py-2 border-shine flex items-center gap-2 shadow-[0_8px_32px_rgba(0,0,0,0.6)] animate-slide-down">
          <Monitor className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[10px] text-white/60 font-medium">{screenShareName}&apos;s Screen</span>
          <Maximize2 className="w-3 h-3 text-white/40" />
        </button>
      )}

      {/* Remote participant tiles */}
      {remoteList.length > 0 && (
        <div className="fixed bottom-[88px] left-1/2 -translate-x-1/2 z-[99999] flex items-end gap-2 px-3 py-2 pointer-events-none flex-wrap justify-center"
          style={{ maxWidth: 'min(90vw, 800px)' }}>
          {remoteList.map(p => (
            <ParticipantTile
              key={p.socketId}
              stream={p.stream}
              name={p.name}
              hasVideo={p.hasVideo}
              isScreen={p.isScreen}
              isLocal={false}
              initial={p.name.charAt(0).toUpperCase()}
              speaking={false}
              micMuted={!remMediaRef.current.get(p.socketId)?.audio}
            />
          ))}
        </div>
      )}

      {/* Local tile - always show when in call */}
      <div className="fixed bottom-[88px] right-4 z-[99999]">
        <div className="pointer-events-auto premium-glass-card-light rounded-xl overflow-hidden border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
          style={{ width: '128px', height: '96px' }}>
          <div className="relative w-full h-full bg-[#0a0a0e]">
            {!cameraOff ? (
              <>
                {!localStreamReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0e] z-10">
                    <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
                  </div>
                )}
                <video ref={localVidRef} autoPlay playsInline muted
                  className="absolute inset-0 w-full h-full object-contain scale-x-[-1]" />
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${speaking ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[0.06] text-white/50'}`}>
                  {initial}
                </div>
              </div>
            )}
            {screenSharing && (
              <div className="absolute top-1 left-1 z-10 bg-emerald-500/20 rounded-md px-1 py-0.5">
                <Monitor className="w-2.5 h-2.5 text-emerald-400" />
              </div>
            )}
            {speaking && !micMuted && (
              <div className="absolute inset-0 rounded-xl border-2 border-emerald-400/40 pointer-events-none" />
            )}
            <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex items-center gap-1">
                <span className="text-[8px] text-white/60 font-medium drop-shadow-md">You</span>
                {screenSharing && <Monitor className="w-2 h-2 text-emerald-400 shrink-0" />}
                {micMuted && <MicOff className="w-2 h-2 text-red-400 shrink-0" />}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Local Screen Share Preview */}
      {screenSharing && (
        <div className="fixed left-4 bottom-24 z-[99999]">
          {showLocalPreview !== false ? (
            <div className="premium-glass-card rounded-xl overflow-hidden border-shine shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
              style={{ width: '220px' }}>
              <div className="flex items-center justify-between px-2 py-1.5 bg-black/50">
                <div className="flex items-center gap-1.5">
                  <Monitor className="w-3 h-3 text-emerald-400" />
                  <span className="text-[9px] text-white/60 font-medium">Your Screen</span>
                </div>
                <button onClick={() => setShowLocalPreview(false)}
                  className="p-0.5 rounded hover:bg-white/[0.1] text-white/40 hover:text-white/70 transition-all">
                  <Minimize2 className="w-3 h-3" />
                </button>
              </div>
              <video ref={el => { if (el && lsRef.current) el.srcObject = lsRef.current; }}
                autoPlay playsInline muted
                className="w-full object-contain bg-black/60"
                style={{ aspectRatio: '16/9' }} />
            </div>
          ) : (
            <button onClick={() => setShowLocalPreview(true)}
              className="premium-glass-card rounded-xl px-2.5 py-1.5 border-shine flex items-center gap-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.6)] hover:scale-105 transition-transform active:scale-95">
              <Monitor className="w-3 h-3 text-emerald-400" />
              <span className="text-[9px] text-white/50 font-medium">Screen</span>
              <Maximize2 className="w-2.5 h-2.5 text-white/30" />
            </button>
          )}
        </div>
      )}

      {/* Control dock */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[99999] premium-glass-card rounded-2xl px-3 py-2 border-shine flex items-center gap-1.5 shadow-[0_8px_40px_rgba(0,0,0,0.6)] pointer-events-auto">
        <button onClick={toggleMic}
          className={`p-2.5 rounded-xl transition-all duration-200 active:scale-90 ${micMuted ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'}`}
          title={micMuted ? 'Unmute mic' : 'Mute mic'}>
          <div className="relative">
            {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            {!micMuted && speaking && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />}
          </div>
        </button>

        <button onClick={toggleCam} disabled={screenSharing}
          className={`p-2.5 rounded-xl transition-all duration-200 active:scale-90 ${screenSharing ? 'bg-white/[0.03] text-white/30 cursor-not-allowed' : cameraOff ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'}`}
          title={screenSharing ? 'Stop share to toggle camera' : cameraOff ? 'Turn on camera' : 'Turn off camera'}>
          {cameraOff ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
        </button>

        <div className="w-px h-6 bg-white/[0.08] mx-1" />

        <button onClick={screenSharing ? stopSS : startSS} disabled={loading}
          className={`p-2.5 rounded-xl transition-all duration-200 active:scale-90 ${screenSharing ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'}`}
          title={screenSharing ? 'Stop sharing screen' : 'Share screen'}>
          {screenSharing ? <MonitorOff className="w-4 h-4" /> : loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Monitor className="w-4 h-4" />}
        </button>

        <div className="w-px h-6 bg-white/[0.08] mx-1" />

        <button onClick={leaveCall}
          className="p-2.5 rounded-xl bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-all duration-200 active:scale-90"
          title="Leave call">
          <PhoneOff className="w-4 h-4" />
        </button>

        {/* Connection indicator */}
        <div className="hidden sm:flex items-center gap-1 ml-1 px-2 py-1 rounded-lg bg-white/[0.04]">
          {Array.from(connStates.entries()).some(([, s]) => s === 'connected') ? (
            <Wifi className="w-3 h-3 text-emerald-400/60" />
          ) : (
            <WifiOff className="w-3 h-3 text-red-400/60" />
          )}
          <span className="text-[9px] text-white/40 font-mono">
            {Array.from(connStates.entries()).filter(([, s]) => s === 'connected').length}/{remoteList.length}
          </span>
        </div>
      </div>
    </>
  );
}
