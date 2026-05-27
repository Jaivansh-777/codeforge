'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Mic, MicOff, Phone, PhoneOff, Loader2,
  Camera, CameraOff, Monitor, MonitorOff,
  X, Maximize2, Minimize2, Volume2, Users, MessageSquare,
  Wifi, WifiOff, AlertTriangle, RefreshCw, ScreenShareOff,
} from 'lucide-react';
import type { Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import RoomCallChat from './RoomCallChat';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */
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
interface RemoteMediaState {
  audio: boolean;
  video: boolean;
  screen: boolean;
}
interface PeerData {
  pc: RTCPeerConnection;
  videoStream: MediaStream | null;
  audioStream: MediaStream | null;
}
interface Props {
  socket: Socket | null;
  socketId: string | null;
  participants: Participant[];
  userName: string;
  chatMessages: ChatMessage[];
  onSendChat: (msg: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */
const STUN: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};
const VID_MAIN: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
const VID_SCR: MediaTrackConstraints = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
const VID_FALLBACK: MediaTrackConstraints = { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 5 } };

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
const LOG = (...a: any[]) => console.log('[Call]', ...a);
let pcCounter = 0;

function getSender(pc: RTCPeerConnection, kind: 'audio' | 'video') {
  return pc.getTransceivers().find(t => t.receiver?.track?.kind === kind)?.sender ?? null;
}

/* ================================================================== */
/*  VideoTile — renders a single participant video or fallback        */
/* ================================================================== */
function VideoTile({
  stream,
  name,
  hasVideo,
  isScreen,
  isLocal,
  muted,
  speaking,
  micMuted,
  isLarge,
}: {
  stream: MediaStream | null;
  name: string;
  hasVideo: boolean;
  isScreen?: boolean;
  isLocal?: boolean;
  muted?: boolean;
  speaking?: boolean;
  micMuted?: boolean;
  isLarge?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);

  const setRef = useCallback((el: HTMLVideoElement | null) => {
    if (el) {
      el.srcObject = stream;
      if (el.readyState >= 2) { setReady(true); readyRef.current = true; }
      else {
        const onData = () => { setReady(true); readyRef.current = true; el.onloadeddata = null; };
        el.onloadeddata = onData;
      }
    }
  }, [stream]);

  const initial = name?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${
        speaking ? 'border-emerald-400/60 shadow-[0_0_24px_rgba(52,211,153,0.15)]' : 'border-white/[0.06]'
      } ${isLarge ? 'min-h-[280px] sm:min-h-[360px]' : 'min-h-[160px] sm:min-h-[200px]'}`}
    >
      {/* Background */}
      <div className="absolute inset-0 bg-[#0a0a0e]" />

      {/* Video — always render the element so the ref is stable */}
      <video
        ref={setRef}
        autoPlay
        playsInline
        muted={isLocal || muted}
        className={`absolute inset-0 w-full h-full ${isLocal ? 'scale-x-[-1]' : ''} ${
          isScreen ? 'object-contain' : hasVideo && stream ? 'object-cover' : 'hidden'
        }`}
      />

      {/* Loading spinner */}
      {hasVideo && stream && !ready && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <Loader2 className="w-6 h-6 text-white/20 animate-spin" />
        </div>
      )}

      {/* Avatar fallback */}
      {(!hasVideo || !stream) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`w-14 h-14 sm:w-20 sm:h-20 rounded-full flex items-center justify-center text-xl sm:text-3xl font-bold transition-colors duration-300 ${
            speaking ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[0.06] text-white/30'
          }`}>
            {initial}
          </div>
        </div>
      )}

      {/* Screen share badge */}
      {isScreen && (
        <div className="absolute top-2 left-2 z-10 bg-emerald-500/20 backdrop-blur-md rounded-lg px-2 py-1 flex items-center gap-1.5">
          <Monitor className="w-3 h-3 text-emerald-400" />
          <span className="text-[10px] font-medium text-emerald-300">Screen</span>
        </div>
      )}

      {/* Speaking ring */}
      {speaking && !micMuted && (
        <div className="absolute inset-0 rounded-2xl border-[2px] border-emerald-400/50 pointer-events-none" />
      )}

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white/80 drop-shadow-md truncate">
            {isLocal ? 'You' : name}
          </span>
          {micMuted && <MicOff className="w-3 h-3 text-red-400 shrink-0" />}
          {!micMuted && !isLocal && <Volume2 className="w-3 h-3 text-emerald-400/70 shrink-0" />}
          {isScreen && !isLocal && <Monitor className="w-3 h-3 text-emerald-400 shrink-0" />}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Main Component                                                    */
/* ================================================================== */
export default function RoomMediaPanel({ socket, socketId, participants, userName, chatMessages, onSendChat }: Props) {
  /* ---- state ---- */
  const [mediaActive, setMediaActive] = useState(false);
  const [micMuted, setMicMuted] = useState(true);
  const [cameraOff, setCameraOff] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [screenShareBy, setScreenShareBy] = useState<string | null>(null);
  const [showCallUi, setShowCallUi] = useState(true);
  const [connStates, setConnStates] = useState<Map<string, string>>(new Map());
  const [showChat, setShowChat] = useState(false);
  const [localStreamReady, setLocalStreamReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  /* ---- refs ---- */
  const sRef = useRef(socket);
  const sidRef = useRef(socketId);
  const partsRef = useRef<Participant[]>([]);
  const lsRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerData>>(new Map());
  const remMediaRef = useRef<Map<string, RemoteMediaState>>(new Map());
  const scrStreamRef = useRef<MediaStream | null>(null);
  const wasCamRef = useRef(false);
  const localVidRef = useRef<HTMLVideoElement>(null);
  const actxRef = useRef<AudioContext | null>(null);
  const anlRef = useRef<AnalyserNode | null>(null);
  const spkIntRef = useRef<number | null>(null);
  const callActiveRef = useRef(false);

  /* ---- keep refs in sync ---- */
  useEffect(() => { sRef.current = socket; }, [socket]);
  useEffect(() => { sidRef.current = socketId; }, [socketId]);
  useEffect(() => { partsRef.current = participants; }, [participants]);

  const [, tick] = useState(0);
  const force = useCallback(() => tick(n => n + 1), []);

  /* ---- local video ref sync ---- */
  useEffect(() => {
    if (localVidRef.current && lsRef.current) {
      localVidRef.current.srcObject = lsRef.current;
      setLocalStreamReady(true);
    }
  });

  /* ---- speaking detection ---- */
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

  /* ---- bitrate ---- */
  function setBitrate(pc: RTCPeerConnection, bps: number) {
    const s = getSender(pc, 'video');
    if (!s) return;
    const p = s.getParameters();
    if (!p.encodings) p.encodings = [{}];
    p.encodings[0].maxBitrate = bps;
    s.setParameters(p).catch(() => {});
  }

  /* ---- broadcast local video track to all peers ---- */
  function bcastVideoTrack(track: MediaStreamTrack | null, isScreen = false) {
    LOG('broadcasting video track', track?.id ?? 'null', 'screen=', isScreen);
    peersRef.current.forEach(({ pc }) => {
      const s = getSender(pc, 'video');
      if (track) {
        if (s) { s.replaceTrack(track).catch(() => {}); }
        else if (lsRef.current) { pc.addTrack(track, lsRef.current); }
        setBitrate(pc, isScreen ? 4_000_000 : 1_500_000);
      } else if (s) {
        try { pc.removeTrack(s); } catch {}
      }
    });
  }

  /* ---- ensure local audio/video tracks are added to a peer ---- */
  function ensureLocalTracks(pc: RTCPeerConnection) {
    const st = lsRef.current;
    if (!st) return;
    const at = st.getAudioTracks()[0];
    if (at && !getSender(pc, 'audio')) pc.addTrack(at, st);
    const vt = st.getVideoTracks()[0];
    if (vt && !getSender(pc, 'video')) pc.addTrack(vt, st);
  }

  /* ---- create a new RTCPeerConnection ---- */
  function createPC(targetId: string): PeerData {
    const id = ++pcCounter;
    LOG(`[${id}] createPC for ${targetId}`);

    const pc = new RTCPeerConnection(STUN);

    pc.onicecandidate = (e) => {
      if (e.candidate && sRef.current) {
        sRef.current.emit('signal', {
          to: targetId,
          signal: { type: 'ice-candidate', candidate: e.candidate },
        });
      }
    };

    pc.ontrack = (e) => {
      if (!e.streams[0]) return;
      LOG(`[${id}] ontrack from ${targetId} kind=${e.track.kind}`);
      if (e.track.kind === 'audio') {
        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
        audio.srcObject = e.streams[0];
        audio.play().catch(() => {});
        // Store in DOM; peer cleanup will remove it
        (audio as any).__peerId = targetId;
      } else if (e.track.kind === 'video') {
        const pd = peersRef.current.get(targetId);
        if (pd) {
          pd.videoStream = e.streams[0];
        }
        LOG(`[${id}] remote video stream ready for ${targetId}`);
        setTimeout(() => force(), 0);
      }
    };

    pc.oniceconnectionstatechange = () => {
      const st = pc.iceConnectionState;
      LOG(`[${id}] iceConnectionState ${targetId} => ${st}`);
      updConnState(targetId, st);
      if (st === 'disconnected' || st === 'failed') cleanupPeer(targetId);
    };

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      LOG(`[${id}] connectionState ${targetId} => ${st}`);
      updConnState(targetId, st);
      if (st === 'failed' || st === 'disconnected') cleanupPeer(targetId);
    };

    pc.onnegotiationneeded = async () => {
      try {
        if (pc.signalingState !== 'stable') return;
        LOG(`[${id}] negotiation needed for ${targetId}`);
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);
        sRef.current?.emit('signal', {
          to: targetId,
          signal: { type: 'offer', sdp: pc.localDescription },
        });
      } catch (e) { console.error('[neg]', e); }
    };

    const data: PeerData = { pc, videoStream: null, audioStream: null };
    peersRef.current.set(targetId, data);
    LOG(`[${id}] peer created for ${targetId}`);
    return data;
  }

  /* ---- get-or-create peer ---- */
  function ensurePC(targetId: string): PeerData | null {
    const ex = peersRef.current.get(targetId);
    if (ex) {
      const st = ex.pc.connectionState;
      if (st === 'new' || st === 'connecting' || st === 'connected') return ex;
      LOG('recreating peer for', targetId, 'old state:', st);
      ex.pc.close();
      peersRef.current.delete(targetId);
    }
    return createPC(targetId);
  }

  /* ---- cleanup a single peer ---- */
  function cleanupPeer(targetId: string) {
    const pd = peersRef.current.get(targetId);
    if (pd) {
      LOG('cleanup peer', targetId);
      pd.pc.close();
      peersRef.current.delete(targetId);
    }
    // Remove orphaned audio elements
    document.querySelectorAll<HTMLAudioElement>(`audio[__peerId="${targetId}"]`).forEach(el => {
      el.pause();
      el.srcObject = null;
      el.remove();
    });
    remMediaRef.current.delete(targetId);
    updConnState(targetId, 'closed');
    if (screenShareBy === targetId) setScreenShareBy(null);
    setTimeout(() => force(), 0);
  }

  function updConnState(id: string, st: string) {
    setConnStates(p => { const m = new Map(p); m.set(id, st); return m; });
  }

  /* ---- send offer to a specific peer ---- */
  async function sendOffer(targetId: string) {
    const pd = ensurePC(targetId);
    if (!pd) return;
    ensureLocalTracks(pd.pc);
    try {
      const offer = await pd.pc.createOffer();
      await pd.pc.setLocalDescription(offer);
      sRef.current?.emit('signal', {
        to: targetId,
        signal: { type: 'offer', sdp: pd.pc.localDescription },
      });
    } catch (e) { console.error('[offer]', e); }
  }

  /* ---- connect to all existing participants ---- */
  async function connectAll() {
    const sid = sidRef.current;
    if (!sid) return;
    for (const p of partsRef.current) {
      if (p.socketId !== sid && !peersRef.current.has(p.socketId)) {
        await sendOffer(p.socketId);
      }
    }
  }

  /* ================================================================ */
  /*  Media actions                                                   */
  /* ================================================================ */

  /* ---- Join Call ---- */
  const joinCall = useCallback(async () => {
    LOG('joinCall started');
    setLoading(true); setError(''); setCameraError(null);
    try {
      const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
      let vidTrack: MediaStreamTrack | null = null;
      try {
        const cs = await navigator.mediaDevices.getUserMedia({ video: VID_MAIN });
        vidTrack = cs.getVideoTracks()[0];
        vidTrack.enabled = false;
      } catch (err: any) {
        if (err.name === 'NotFoundError') setCameraError('Camera unavailable');
        else if (err.name === 'NotAllowedError') setCameraError('Camera denied');
        else setCameraError('Camera error');
      }
      const st = new MediaStream();
      audio.getAudioTracks().forEach(t => st.addTrack(t));
      if (vidTrack) st.addTrack(vidTrack);
      lsRef.current = st;
      st.getAudioTracks().forEach(t => (t.enabled = false));
      setMicMuted(true); setCameraOff(!vidTrack); setMediaActive(true);
      callActiveRef.current = true;
      if (vidTrack) setLocalStreamReady(true);
      startSpk(st);
      if (localVidRef.current) {
        localVidRef.current.srcObject = st;
        setLocalStreamReady(true);
      }
      sRef.current?.emit('media-state', {
        enabled: { audio: true, video: !!vidTrack, screen: false },
      });
      await connectAll();
      LOG('joinCall completed');
    } catch (e: any) {
      setError(e.message || 'Microphone access denied');
      LOG('joinCall failed', e.message);
    } finally { setLoading(false); }
  }, [startSpk]);

  /* ---- Toggle Mic ---- */
  const toggleMic = useCallback(() => {
    if (!lsRef.current) return;
    lsRef.current.getAudioTracks().forEach(t => (t.enabled = micMuted));
    setMicMuted(!micMuted);
    if (!micMuted) setSpeaking(false);
    sRef.current?.emit('media-state', {
      enabled: { audio: !micMuted, video: screenSharing || !cameraOff, screen: screenSharing },
    });
  }, [micMuted, cameraOff, screenSharing]);

  /* ---- Toggle Camera ---- */
  const toggleCam = useCallback(async () => {
    if (screenSharing) return;
    LOG('toggleCam', cameraOff ? 'on' : 'off');
    setError(''); setCameraError(null);

    if (cameraOff) {
      // Turn camera ON
      try {
        const cs = await navigator.mediaDevices.getUserMedia({ video: VID_MAIN });
        const nt = cs.getVideoTracks()[0];
        if (lsRef.current) lsRef.current.addTrack(nt);
        bcastVideoTrack(nt, false);
        setCameraOff(false);
        if (localVidRef.current && lsRef.current) {
          localVidRef.current.srcObject = lsRef.current;
          setLocalStreamReady(true);
        }
      } catch (err: any) {
        if (err.name === 'NotFoundError') setCameraError('Camera unavailable');
        else if (err.name === 'NotAllowedError') setCameraError('Camera denied');
        else setCameraError('Camera error');
        setCameraOff(true);
      }
    } else {
      // Turn camera OFF
      const tracks = lsRef.current?.getVideoTracks() ?? [];
      tracks.forEach(t => { t.enabled = false; t.stop(); lsRef.current?.removeTrack(t); });
      bcastVideoTrack(null, false);
      setCameraOff(true);
    }
    force();
    sRef.current?.emit('media-state', {
      enabled: { audio: !micMuted, video: !cameraOff, screen: screenSharing },
    });
  }, [cameraOff, micMuted, screenSharing]);

  /* ---- Retry Camera ---- */
  const retryCam = useCallback(async () => {
    setCameraError(null); setError('');
    try {
      const cs = await navigator.mediaDevices.getUserMedia({ video: VID_MAIN });
      const nt = cs.getVideoTracks()[0];
      if (lsRef.current) {
        // Stop old tracks first
        lsRef.current.getVideoTracks().forEach(t => { t.stop(); lsRef.current?.removeTrack(t); });
        lsRef.current.addTrack(nt);
      }
      bcastVideoTrack(nt, false);
      setCameraOff(false);
      if (localVidRef.current && lsRef.current) {
        localVidRef.current.srcObject = lsRef.current;
        setLocalStreamReady(true);
      }
    } catch {
      setCameraError('Camera still unavailable');
    }
    force();
  }, []);

  /* ---- Screen Share ---- */
  const startSS = useCallback(async () => {
    LOG('startSS');
    setLoading(true); setError('');
    try {
      const ds = await navigator.mediaDevices.getDisplayMedia({ video: VID_SCR, audio: true });
      const vt = ds.getVideoTracks()[0];
      vt.onended = () => stopSS();
      scrStreamRef.current = ds;
      wasCamRef.current = !cameraOff;
      const ls = lsRef.current;
      if (ls) {
        const old = ls.getVideoTracks();
        ls.addTrack(vt);
        bcastVideoTrack(vt, true);
        old.forEach(t => { ls.removeTrack(t); t.stop(); });
      }
      setScreenSharing(true); setCameraOff(false); setLocalStreamReady(false); force();
      toast('Tip: Share a different window to avoid mirror effect.', { duration: 4000, style: { background: 'rgba(10,10,14,0.95)', color: '#e4e4e7', border: '1px solid rgba(251,191,36,0.3)', fontSize: '12px', borderRadius: '12px' } });
      sRef.current?.emit('media-state', { enabled: { audio: !micMuted, video: true, screen: true } });
    } catch (e: any) {
      if (e.name === 'NotAllowedError') setError('Screen share denied');
      else setError(e.message || 'Screen share failed');
    } finally { setLoading(false); }
  }, [cameraOff, micMuted]);

  const stopSS = useCallback(async () => {
    LOG('stopSS');
    const ls = lsRef.current;
    const old = ls?.getVideoTracks() || [];
    if (wasCamRef.current) {
      try {
        const cs = await navigator.mediaDevices.getUserMedia({ video: VID_MAIN });
        const ct = cs.getVideoTracks()[0];
        ls?.addTrack(ct);
        bcastVideoTrack(ct, false);
      } catch { bcastVideoTrack(null); wasCamRef.current = false; }
    } else {
      try {
        const fb = await navigator.mediaDevices.getUserMedia({ video: VID_FALLBACK });
        const ft = fb.getVideoTracks()[0];
        ft.enabled = false;
        ls?.addTrack(ft);
        bcastVideoTrack(ft, false);
      } catch { bcastVideoTrack(null); }
    }
    old.forEach(t => { ls?.removeTrack(t); t.stop(); });
    if (scrStreamRef.current) { scrStreamRef.current.getTracks().forEach(t => t.stop()); scrStreamRef.current = null; }
    if (localVidRef.current && ls) { localVidRef.current.srcObject = ls; setLocalStreamReady(true); }
    setScreenSharing(false);
    if (!wasCamRef.current) setCameraOff(true);
    force();
    sRef.current?.emit('media-state', { enabled: { audio: !micMuted, video: wasCamRef.current, screen: false } });
  }, [micMuted]);

  /* ---- Leave Call ---- */
  const leaveCall = useCallback(() => {
    LOG('leaveCall');
    callActiveRef.current = false;
    // Close all peers
    peersRef.current.forEach((pd, id) => {
      LOG('closing peer', id);
      pd.pc.close();
    });
    peersRef.current.clear();
    // Remove all remote audio elements
    document.querySelectorAll<HTMLAudioElement>('audio[__peerId]').forEach(el => {
      el.pause();
      el.srcObject = null;
      el.remove();
    });
    remMediaRef.current.clear();
    // Stop screen share
    if (scrStreamRef.current) { scrStreamRef.current.getTracks().forEach(t => t.stop()); scrStreamRef.current = null; }
    // Stop local stream
    if (lsRef.current) { lsRef.current.getTracks().forEach(t => t.stop()); lsRef.current = null; }
    stopSpk();
    setMediaActive(false); setMicMuted(true); setCameraOff(true); setScreenSharing(false);
    setScreenShareBy(null); setError(''); setCameraError(null); setLocalStreamReady(false);
    setShowCallUi(true);
    sRef.current?.emit('media-state', { enabled: { audio: false, video: false, screen: false } });
    LOG('cleanup done');
  }, [stopSpk]);

  /* ================================================================ */
  /*  Socket event handlers                                           */
  /* ================================================================ */

  /* ---- Signal ---- */
  useEffect(() => {
    if (!socket) return;
    const h = async ({ from, signal }: { from: string; signal: any }) => {
      if (from === sidRef.current) return;
      const pd = ensurePC(from);
      if (!pd) return;
      const pc = pd.pc;
      try {
        if (signal.type === 'offer') {
          LOG('received offer from', from);
          if (pc.signalingState === 'have-local-offer')
            await pc.setLocalDescription({ type: 'rollback' as unknown as RTCSdpType });
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          ensureLocalTracks(pc);
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          socket.emit('signal', { to: from, signal: { type: 'answer', sdp: pc.localDescription } });
          const audioOn = lsRef.current?.getAudioTracks().some(t => t.enabled) ?? false;
          const videoOn = lsRef.current?.getVideoTracks().some(t => t.enabled) ?? false;
          socket.emit('media-state', { enabled: { audio: audioOn, video: videoOn, screen: scrStreamRef.current !== null } });
        } else if (signal.type === 'answer') {
          LOG('received answer from', from);
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

  /* ---- Media state ---- */
  useEffect(() => {
    if (!socket) return;
    const h = ({ socketId: sid, enabled }: { socketId: string; enabled: { audio?: boolean; video?: boolean; screen?: boolean } }) => {
      const st: RemoteMediaState = { audio: !!enabled.audio, video: !!enabled.video, screen: !!enabled.screen };
      remMediaRef.current.set(sid, st);
      if (enabled.screen) setScreenShareBy(sid);
      else if (screenShareBy === sid) setScreenShareBy(null);
      setTimeout(() => force(), 0);
    };
    socket.on('media-state', h);
    return () => { socket.off('media-state', h); };
  }, [socket, screenShareBy]);

  /* ---- User left ---- */
  useEffect(() => {
    if (!socket) return;
    const h = ({ socketId: lid }: { socketId: string }) => { LOG('user-left', lid); cleanupPeer(lid); };
    socket.on('user-left', h);
    return () => { socket.off('user-left', h); };
  }, [socket]);

  /* ---- New participant ---- */
  useEffect(() => {
    if (!mediaActive) return;
    const sid = sidRef.current;
    if (!sid) return;
    for (const p of participants) {
      if (p.socketId !== sid && !peersRef.current.has(p.socketId)) {
        LOG('new participant, sending offer to', p.socketId);
        sendOffer(p.socketId);
      }
    }
  }, [participants, mediaActive]);

  /* ---- Cleanup on unmount ---- */
  useEffect(() => {
    return () => { if (callActiveRef.current) leaveCall(); };
  }, []);

  /* ================================================================ */
  /*  Derived data                                                    */
  /* ================================================================ */

  const remoteParticipants = useMemo(() => {
    return participants
      .filter(p => p.socketId !== sidRef.current)
      .map(p => {
        const rem = remMediaRef.current.get(p.socketId);
        const pd = peersRef.current.get(p.socketId);
        return {
          ...p,
          stream: pd?.videoStream ?? null,
          hasVideo: !!rem?.video && !!pd?.videoStream,
          isScreen: !!rem?.screen,
          micMuted: !rem?.audio,
        };
      });
  }, [participants, mediaActive, screenShareBy]);

  const hasScreenShare = screenShareBy && remMediaRef.current.get(screenShareBy)?.screen;

  const allTiles = useMemo(() => {
    const tiles: Array<{
      key: string;
      stream: MediaStream | null;
      name: string;
      hasVideo: boolean;
      isScreen: boolean;
      isLocal: boolean;
      micMuted: boolean;
    }> = [];
    // Remote participants
    for (const p of remoteParticipants) {
      tiles.push({ key: p.socketId, stream: p.stream, name: p.name, hasVideo: p.hasVideo, isScreen: p.isScreen, isLocal: false, micMuted: p.micMuted });
    }
    // Local tile
    tiles.push({ key: 'local', stream: lsRef.current, name: userName, hasVideo: !cameraOff && !!lsRef.current?.getVideoTracks().length, isScreen: screenSharing, isLocal: true, micMuted });
    return tiles;
  }, [remoteParticipants, cameraOff, screenSharing, micMuted, userName, localStreamReady]);

  const initial = userName?.charAt(0)?.toUpperCase() ?? 'C';
  const roomName = `Cyber Classes`;

  /* ================================================================ */
  /*  Render: Not in call                                             */
  /* ================================================================ */
  if (!mediaActive) {
    return (
      <div className="flex items-center gap-2">
        <button onClick={joinCall} disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl bg-white/[0.06] text-white/70 border border-white/[0.08] hover:bg-white/[0.1] hover:text-white/90 disabled:opacity-50 transition-all active:scale-95">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Phone className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{loading ? 'Connecting...' : 'Join Call'}</span>
        </button>
        {error && <span className="text-[10px] text-red-400/70 max-w-[120px] truncate">{error}</span>}
      </div>
    );
  }

  /* ================================================================ */
  /*  Render: In call                                                 */
  /* ================================================================ */

  // Minimized avatar button
  if (!showCallUi) {
    return (
      <button onClick={() => setShowCallUi(true)}
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
    <div className="fixed inset-0 z-[9995] flex flex-col bg-[#0a0a0e] overflow-hidden">
      {/* ============ Top Bar ============ */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-black/40 backdrop-blur-xl border-b border-white/[0.04] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${mediaActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.4)]' : 'bg-red-500'}`} />
            <span className="text-sm font-semibold text-white/80">{roomName}</span>
          </div>
          <span className="text-white/[0.06] hidden sm:inline">|</span>
          <span className="hidden sm:flex items-center gap-1.5 text-xs text-white/40">
            <Users className="w-3.5 h-3.5" />
            {participants.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Connection */}
          <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono text-emerald-400/60">
            <Wifi className="w-3 h-3" />
          </div>

          {/* Chat toggle */}
          <button onClick={() => setShowChat(!showChat)}
            className={`p-2 rounded-xl transition-all text-xs ${showChat ? 'bg-white/[0.1] text-white/90' : 'text-white/50 hover:bg-white/[0.06]'}`}
            title="Toggle chat">
            <MessageSquare className="w-4 h-4" />
          </button>

          {/* Minimize */}
          <button onClick={() => setShowCallUi(false)}
            className="p-2 rounded-xl text-white/50 hover:bg-white/[0.06] transition-all" title="Minimize">
            <Minimize2 className="w-4 h-4" />
          </button>

          {/* Leave */}
          <button onClick={leaveCall}
            className="p-2 rounded-xl bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-all active:scale-90" title="Leave call">
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ============ Main Area ============ */}
      <div className="flex-1 flex min-h-0">
        {/* Video Grid */}
        <div className={`flex-1 flex flex-col min-h-0 p-3 sm:p-4 gap-3 ${showChat ? 'hidden lg:flex' : ''}`}>
          {/* Screen share spotlight */}
          {hasScreenShare && (() => {
            const sharerId = screenShareBy!;
            const sharer = participants.find(p => p.socketId === sharerId);
            const pd = peersRef.current.get(sharerId);
            return (
              <div className="flex-1 min-h-0">
                <VideoTile
                  stream={pd?.videoStream ?? null}
                  name={sharer?.name ?? 'Unknown'}
                  hasVideo
                  isScreen
                  micMuted={false}
                  isLarge
                />
              </div>
            );
          })()}

          {/* Video tiles grid */}
          {!hasScreenShare && (
            <div className={`flex-1 grid gap-3 min-h-0 content-start ${
              allTiles.length <= 1 ? 'grid-cols-1' :
              allTiles.length === 2 ? 'grid-cols-1 sm:grid-cols-2' :
              allTiles.length <= 4 ? 'grid-cols-1 sm:grid-cols-2' :
              'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            }`}>
              {allTiles.map(t => (
                <VideoTile
                  key={t.key}
                  stream={t.stream}
                  name={t.name}
                  hasVideo={t.hasVideo}
                  isScreen={t.isScreen}
                  isLocal={t.isLocal}
                  muted={t.isLocal}
                  speaking={t.isLocal ? speaking && !micMuted : false}
                  micMuted={t.micMuted}
                  isLarge={allTiles.length <= 2}
                />
              ))}
            </div>
          )}

          {/* Camera error card */}
          {cameraError && (
            <div className="flex items-center gap-3 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300/80">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span className="flex-1">{cameraError}</span>
              <button onClick={retryCam}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-all text-[10px] font-medium">
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-3 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-300/80">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-400" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError('')} className="p-1 hover:bg-white/[0.06] rounded-lg text-white/30 transition-all">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* ============ Chat Drawer ============ */}
        {showChat && (
          <div className="w-full sm:w-80 lg:w-96 shrink-0 border-l border-white/[0.06] bg-black/20 flex flex-col">
            <RoomCallChat
              messages={chatMessages}
              onSend={onSendChat}
              currentSocketId={socketId}
              onClose={() => setShowChat(false)}
            />
          </div>
        )}
      </div>

      {/* ============ Bottom Control Bar ============ */}
      <div className="flex items-center justify-center gap-2 px-4 py-3 bg-black/60 backdrop-blur-xl border-t border-white/[0.04] shrink-0">
        {/* Mic */}
        <button onClick={toggleMic}
          className={`p-3 rounded-2xl transition-all active:scale-90 ${
            micMuted ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'
          }`} title={micMuted ? 'Unmute' : 'Mute'}>
          {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Camera */}
        <button onClick={toggleCam} disabled={screenSharing}
          className={`p-3 rounded-2xl transition-all active:scale-90 ${
            screenSharing ? 'bg-white/[0.03] text-white/30 cursor-not-allowed' :
            cameraOff ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'
          }`} title={screenSharing ? 'Stop share to toggle camera' : cameraOff ? 'Turn on camera' : 'Turn off camera'}>
          {cameraOff ? <CameraOff className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
        </button>

        {/* Screen Share */}
        <button onClick={screenSharing ? stopSS : startSS} disabled={loading}
          className={`p-3 rounded-2xl transition-all active:scale-90 ${
            screenSharing ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'
          }`} title={screenSharing ? 'Stop sharing' : 'Share screen'}>
          {screenSharing ? <ScreenShareOff className="w-5 h-5" /> : loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Monitor className="w-5 h-5" />}
        </button>

        {/* Divider */}
        <div className="w-px h-8 bg-white/[0.08] mx-1" />

        {/* Leave */}
        <button onClick={leaveCall}
          className="p-3 rounded-2xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all active:scale-90" title="Leave call">
          <PhoneOff className="w-5 h-5" />
        </button>

        {/* Connection indicator */}
        <div className="hidden sm:flex items-center gap-1 ml-2 px-3 py-1.5 rounded-xl bg-white/[0.04] text-[10px] font-mono">
          {Array.from(connStates.entries()).some(([, s]) => s === 'connected') ? (
            <><Wifi className="w-3 h-3 text-emerald-400/60" /><span className="text-white/40">{Array.from(connStates.entries()).filter(([, s]) => s === 'connected').length}</span></>
          ) : (
            <><WifiOff className="w-3 h-3 text-red-400/60" /><span className="text-white/40">0</span></>
          )}
        </div>
      </div>
    </div>
  );
}
