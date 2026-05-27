'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Mic, MicOff, Phone, PhoneOff, Loader2,
  Camera, CameraOff, Monitor,
  X, Volume2, MessageSquare,
  AlertTriangle, RefreshCw, ScreenShareOff,
  Maximize2, Minimize2,
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
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
const LOG = (...a: any[]) => console.log('[Call]', ...a);
let pcId = 0;

function getTransceiver(pc: RTCPeerConnection, kind: 'audio' | 'video') {
  return pc.getTransceivers().find(t => t.receiver?.track?.kind === kind) ?? null;
}
function getSender(pc: RTCPeerConnection, kind: 'audio' | 'video') {
  return getTransceiver(pc, kind)?.sender ?? null;
}

/* ================================================================== */
/*  Speaking Detection                                                */
/* ================================================================== */
function createSpeakingDetector(stream: MediaStream, threshold = 0.02, onSpeak: (speaking: boolean) => void) {
  const audioCtx = new AudioContext();
  const src = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  src.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  let speaking = false;
  const int = setInterval(() => {
    analyser.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    const peak = avg / 255;
    const now = peak > threshold;
    if (now !== speaking) {
      speaking = now;
      onSpeak(speaking);
    }
  }, 150);
  return () => { clearInterval(int); audioCtx.close(); };
}

/* ================================================================== */
/*  VideoTile                                                         */
/* ================================================================== */
function VideoTile({
  stream, name, hasVideo, isScreen, isLocal, muted, micMuted, compact, speaking,
}: {
  stream: MediaStream | null;
  name: string;
  hasVideo: boolean;
  isScreen?: boolean;
  isLocal?: boolean;
  muted?: boolean;
  micMuted?: boolean;
  compact?: boolean;
  speaking?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (el && stream) {
      if (el.srcObject !== stream) el.srcObject = stream;
      setLoaded(true);
    }
  }, [stream]);

  const initial = name?.charAt(0)?.toUpperCase() ?? '?';

  const ring = speaking ? 'ring-2 ring-emerald-400/60 ring-offset-2 ring-offset-transparent' : '';
  const mirror = isLocal ? 'scale-x-[-1]' : '';

  if (compact) {
    return (
      <div className={`relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0a0e] shrink-0 transition-all duration-300 ${ring}`}
        style={{ width: 120, height: 90 }}>
        <video ref={videoRef} autoPlay playsInline muted={isLocal || muted}
          className={`absolute inset-0 w-full h-full ${mirror} ${isScreen ? 'object-contain' : hasVideo && stream ? 'object-cover' : 'hidden'}`} />
        {(!hasVideo || !stream || !loaded) && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold bg-white/[0.06] text-white/40">{initial}</div>
          </div>
        )}
        {isScreen && (
          <div className="absolute top-0.5 left-0.5 z-10 bg-emerald-500/30 rounded px-1 py-[1px]">
            <Monitor className="w-2.5 h-2.5 text-emerald-300" />
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-gradient-to-t from-black/80 to-transparent">
          <div className="flex items-center gap-1">
            <span className="text-[8px] text-white/60 font-medium truncate drop-shadow-md max-w-[70px]">{isLocal ? 'You' : name}</span>
            {micMuted && <MicOff className="w-2 h-2 text-red-400 shrink-0" />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0a0e] min-h-[200px] sm:min-h-[240px] transition-all duration-300 ${ring}`}>
      <video ref={videoRef} autoPlay playsInline muted={isLocal || muted}
        className={`absolute inset-0 w-full h-full ${mirror} ${isScreen ? 'object-contain' : hasVideo && stream && loaded ? 'object-cover' : 'hidden'}`} />
      {(!hasVideo || !stream || !loaded) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full flex items-center justify-center text-xl sm:text-3xl font-bold bg-white/[0.06] text-white/30">{initial}</div>
        </div>
      )}
      {isScreen && (
        <div className="absolute top-2 left-2 z-10 bg-emerald-500/20 backdrop-blur-md rounded-lg px-2 py-1 flex items-center gap-1.5">
          <Monitor className="w-3 h-3 text-emerald-400" />
          <span className="text-[10px] font-medium text-emerald-300">Screen</span>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white/80 drop-shadow-md truncate">{isLocal ? 'You' : name}</span>
          {micMuted && <MicOff className="w-3 h-3 text-red-400 shrink-0" />}
          {!micMuted && !isLocal && <Volume2 className="w-3 h-3 text-emerald-400/70 shrink-0" />}
          {speaking && !isLocal && <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)] animate-pulse shrink-0" />}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Main Component                                                    */
/* ================================================================== */
export default function RoomMediaPanel({ socket, socketId, participants, userName, chatMessages, onSendChat }: Props) {
  const [mediaActive, setMediaActive] = useState(false);
  const [micMuted, setMicMuted] = useState(true);
  const [cameraOff, setCameraOff] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [screenShareBy, setScreenShareBy] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [localStreamReady, setLocalStreamReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [screenFullscreen, setScreenFullscreen] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const sRef = useRef(socket);
  const sidRef = useRef(socketId);
  const partsRef = useRef<Participant[]>([]);
  const lsRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerData>>(new Map());
  const remMediaRef = useRef<Map<string, RemoteMediaState>>(new Map());
  const scrStreamRef = useRef<MediaStream | null>(null);
  const wasCamRef = useRef(false);
  const localVidRef = useRef<HTMLVideoElement>(null);
  const callActiveRef = useRef(false);
  const screenStageRef = useRef<HTMLDivElement>(null);
  const speakingCleanupRef = useRef<Map<string, () => void>>(new Map());

  useEffect(() => { sRef.current = socket; }, [socket]);
  useEffect(() => { sidRef.current = socketId; }, [socketId]);
  useEffect(() => { partsRef.current = participants; }, [participants]);

  const [, tick] = useState(0);
  const force = useCallback(() => tick(n => n + 1), []);

  /* ---- sync local video ---- */
  useEffect(() => {
    if (localVidRef.current && lsRef.current) {
      localVidRef.current.srcObject = lsRef.current;
      setLocalStreamReady(true);
    }
  });

  /* ---- helper: refresh remote video streams from peer data ---- */
  function refreshRemoteStreams() {
    setTimeout(() => force(), 0);
  }

  /* ---- create PC with fixed transceiver order ---- */
  function createPC(targetId: string): PeerData {
    const id = ++pcId;
    LOG(`[${id}] createPC ${targetId}`);
    const pc = new RTCPeerConnection(STUN);

    pc.addTransceiver('audio', { direction: 'inactive' });
    pc.addTransceiver('video', { direction: 'inactive' });
    LOG(`[${id}] transceivers added (audio, video)`);

    pc.onicecandidate = (e) => {
      if (e.candidate && sRef.current) {
        sRef.current.emit('signal', { to: targetId, signal: { type: 'ice-candidate', candidate: e.candidate } });
      }
    };

    pc.ontrack = (e) => {
      if (!e.streams[0]) return;
      LOG(`[${id}] ontrack ${targetId} kind=${e.track.kind}`);
      if (e.track.kind === 'audio') {
        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
        audio.srcObject = e.streams[0];
        audio.play().catch(() => {});
        (audio as any).__peerId = targetId;
      } else {
        const pd = peersRef.current.get(targetId);
        if (pd) pd.videoStream = e.streams[0];
        LOG(`[${id}] remote video ready ${targetId}`);
        refreshRemoteStreams();
      }
    };

    pc.oniceconnectionstatechange = () => {
      updConnState(targetId, pc.iceConnectionState);
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') cleanupPeer(targetId);
    };
    pc.onconnectionstatechange = () => {
      updConnState(targetId, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') cleanupPeer(targetId);
    };

    pc.onnegotiationneeded = async () => {
      try {
        if (pc.signalingState !== 'stable') return;
        LOG(`[${id}] negotiation needed ${targetId}`);
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);
        sRef.current?.emit('signal', { to: targetId, signal: { type: 'offer', sdp: pc.localDescription } });
      } catch (e) { console.error('[neg]', e); }
    };

    const data: PeerData = { pc, videoStream: null };
    peersRef.current.set(targetId, data);
    LOG(`[${id}] peer created ${targetId}`);
    return data;
  }

  function ensurePC(targetId: string): PeerData | null {
    const ex = peersRef.current.get(targetId);
    if (ex) {
      if (ex.pc.connectionState === 'new' || ex.pc.connectionState === 'connecting' || ex.pc.connectionState === 'connected') return ex;
      LOG('recreate peer', targetId);
      ex.pc.close();
      peersRef.current.delete(targetId);
    }
    return createPC(targetId);
  }

  function cleanupPeer(targetId: string) {
    const pd = peersRef.current.get(targetId);
    if (pd) { pd.pc.close(); peersRef.current.delete(targetId); }
    document.querySelectorAll<HTMLAudioElement>(`audio[__peerId="${targetId}"]`).forEach(el => { el.pause(); el.srcObject = null; el.remove(); });
    remMediaRef.current.delete(targetId);
    speakingCleanupRef.current.get(targetId)?.();
    speakingCleanupRef.current.delete(targetId);
    if (speakingId === targetId) setSpeakingId(null);
    updConnState(targetId, 'closed');
    if (screenShareBy === targetId) setScreenShareBy(null);
    setTimeout(() => force(), 0);
  }

  function updConnState(_id: string, _st: string) {}

  /* ---- Set local track on all peers via replaceTrack ---- */
  function setLocalVideoTrack(track: MediaStreamTrack | null, isScreen = false) {
    LOG('setLocalVideoTrack', track?.id ?? 'null', 'screen=', isScreen);
    peersRef.current.forEach(({ pc }) => {
      const sender = getSender(pc, 'video');
      if (!sender) return;
      if (track) {
        sender.replaceTrack(track).catch(() => {});
        const t = getTransceiver(pc, 'video');
        if (t) t.direction = 'sendrecv';
        const p = sender.getParameters();
        if (!p.encodings) p.encodings = [{}];
        p.encodings[0].maxBitrate = isScreen ? 4_000_000 : 1_500_000;
        sender.setParameters(p).catch(() => {});
      } else {
        sender.replaceTrack(null).catch(() => {});
        const t = getTransceiver(pc, 'video');
        if (t) t.direction = 'inactive';
      }
    });
  }

  function setLocalAudioTrack(enabled: boolean) {
    peersRef.current.forEach(({ pc }) => {
      const sender = getSender(pc, 'audio');
      const str = lsRef.current?.getAudioTracks()[0] ?? null;
      if (!sender) return;
      sender.replaceTrack(enabled ? str : null).catch(() => {});
      const t = getTransceiver(pc, 'audio');
      if (t) t.direction = enabled ? 'sendrecv' : 'inactive';
    });
  }

  /* ---- send initial offer ---- */
  async function sendOffer(targetId: string) {
    const pd = ensurePC(targetId);
    if (!pd) return;
    const pc = pd.pc;
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
      if (p.socketId !== sid && !peersRef.current.has(p.socketId)) {
        await sendOffer(p.socketId);
      }
    }
  }

  /* ================================================================ */
  /*  Speaking Detection Setup                                        */
  /* ================================================================ */
  useEffect(() => {
    if (!lsRef.current || micMuted) return;
    const cleanup = createSpeakingDetector(lsRef.current, 0.025, (speaking) => {
      if (speaking) setSpeakingId(sidRef.current);
      else if (speakingId === sidRef.current) setSpeakingId(null);
    });
    return cleanup;
  }, [mediaActive, micMuted]);

  /* ================================================================ */
  /*  Fullscreen API                                                  */
  /* ================================================================ */
  const toggleFullscreen = useCallback(() => {
    if (screenFullscreen) {
      if (document.exitFullscreen) document.exitFullscreen();
      setScreenFullscreen(false);
    } else {
      const el = screenStageRef.current;
      if (el && el.requestFullscreen) {
        el.requestFullscreen();
        setScreenFullscreen(true);
      }
    }
  }, [screenFullscreen]);

  useEffect(() => {
    const h = () => {
      if (!document.fullscreenElement) setScreenFullscreen(false);
    };
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  /* ================================================================ */
  /*  Media Actions                                                   */
  /* ================================================================ */

  const joinCall = useCallback(async () => {
    LOG('joinCall');
    setLoading(true); setError(''); setCameraError(null);
    try {
      const audio = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
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
      if (localVidRef.current) { localVidRef.current.srcObject = st; setLocalStreamReady(true); }
      sRef.current?.emit('media-state', { enabled: { audio: true, video: !!vidTrack, screen: false } });
      await connectAll();
      setTimeout(() => {
        setLocalAudioTrack(false);
        if (vidTrack) setLocalVideoTrack(vidTrack);
      }, 500);
      LOG('joinCall done');
    } catch (e: any) {
      if (e.name === 'NotFoundError') setError('No microphone found');
      else if (e.name === 'NotAllowedError') setError('Microphone access denied');
      else if (e.name === 'NotReadableError') setError('Microphone in use by another app');
      else setError(e.message || 'Microphone access denied');
    } finally { setLoading(false); }
  }, []);

  const toggleMic = useCallback(() => {
    if (!lsRef.current) return;
    const next = !micMuted;
    lsRef.current.getAudioTracks().forEach(t => (t.enabled = next));
    setMicMuted(!micMuted);
    setLocalAudioTrack(!micMuted);
    sRef.current?.emit('media-state', { enabled: { audio: !micMuted, video: screenSharing || !cameraOff, screen: screenSharing } });
  }, [micMuted, cameraOff, screenSharing]);

  const toggleCam = useCallback(async () => {
    if (screenSharing) return;
    LOG('toggleCam', cameraOff ? 'ON' : 'OFF');
    setError(''); setCameraError(null);
    let vidOn = !cameraOff;
    if (cameraOff) {
      try {
        const cs = await navigator.mediaDevices.getUserMedia({ video: VID_MAIN });
        const nt = cs.getVideoTracks()[0];
        if (lsRef.current) lsRef.current.addTrack(nt);
        setLocalVideoTrack(nt, false);
        setCameraOff(false);
        vidOn = true;
        if (localVidRef.current && lsRef.current) { localVidRef.current.srcObject = lsRef.current; setLocalStreamReady(true); }
      } catch (err: any) {
        if (err.name === 'NotFoundError') setCameraError('Camera unavailable');
        else if (err.name === 'NotAllowedError') setCameraError('Camera denied');
        else setCameraError('Camera error');
        setCameraOff(true);
      }
    } else {
      const tracks = lsRef.current?.getVideoTracks() ?? [];
      tracks.forEach(t => { t.stop(); lsRef.current?.removeTrack(t); });
      setLocalVideoTrack(null, false);
      setCameraOff(true);
      vidOn = false;
    }
    force();
    sRef.current?.emit('media-state', { enabled: { audio: !micMuted, video: vidOn, screen: screenSharing } });
  }, [cameraOff, micMuted, screenSharing]);

  const retryCam = useCallback(async () => {
    setCameraError(null); setError('');
    try {
      const cs = await navigator.mediaDevices.getUserMedia({ video: VID_MAIN });
      const nt = cs.getVideoTracks()[0];
      if (lsRef.current) { lsRef.current.getVideoTracks().forEach(t => { t.stop(); lsRef.current?.removeTrack(t); }); lsRef.current.addTrack(nt); }
      setLocalVideoTrack(nt, false);
      setCameraOff(false);
      if (localVidRef.current && lsRef.current) { localVidRef.current.srcObject = lsRef.current; setLocalStreamReady(true); }
    } catch { setCameraError('Camera still unavailable'); }
    force();
  }, []);

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
        setLocalVideoTrack(vt, true);
        old.forEach(t => { ls.removeTrack(t); t.stop(); });
      }
      setScreenSharing(true); setCameraOff(false); setLocalStreamReady(false); force();
      toast('Tip: Share a different window to avoid mirror.', { duration: 4000, style: { background: 'rgba(10,10,14,0.95)', color: '#e4e4e7', border: '1px solid rgba(251,191,36,0.3)', fontSize: '12px', borderRadius: '12px' } });
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
        setLocalVideoTrack(ct, false);
      } catch { setLocalVideoTrack(null); wasCamRef.current = false; }
    } else {
      setLocalVideoTrack(null);
    }
    old.forEach(t => { ls?.removeTrack(t); t.stop(); });
    if (scrStreamRef.current) { scrStreamRef.current.getTracks().forEach(t => t.stop()); scrStreamRef.current = null; }
    if (localVidRef.current && ls) { localVidRef.current.srcObject = ls; setLocalStreamReady(true); }
    setScreenSharing(false);
    if (!wasCamRef.current) setCameraOff(true);
    force();
    sRef.current?.emit('media-state', { enabled: { audio: !micMuted, video: wasCamRef.current, screen: false } });
  }, [micMuted]);

  const leaveCall = useCallback(() => {
    LOG('leaveCall');
    callActiveRef.current = false;
    if (document.fullscreenElement) document.exitFullscreen();
    setScreenFullscreen(false);
    peersRef.current.forEach((pd, id) => { LOG('close peer', id); pd.pc.close(); });
    peersRef.current.clear();
    document.querySelectorAll<HTMLAudioElement>('audio[__peerId]').forEach(el => { el.pause(); el.srcObject = null; el.remove(); });
    remMediaRef.current.clear();
    speakingCleanupRef.current.forEach(c => c());
    speakingCleanupRef.current.clear();
    setSpeakingId(null);
    if (scrStreamRef.current) { scrStreamRef.current.getTracks().forEach(t => t.stop()); scrStreamRef.current = null; }
    if (lsRef.current) { lsRef.current.getTracks().forEach(t => t.stop()); lsRef.current = null; }
    setMediaActive(false); setMicMuted(true); setCameraOff(true); setScreenSharing(false);
    setScreenShareBy(null); setError(''); setCameraError(null); setLocalStreamReady(false);
    sRef.current?.emit('media-state', { enabled: { audio: false, video: false, screen: false } });
    LOG('cleanup done');
  }, []);

  /* ================================================================ */
  /*  Socket handlers                                                 */
  /* ================================================================ */

  useEffect(() => {
    if (!socket) return;
    const h = async ({ from, signal }: { from: string; signal: any }) => {
      if (from === sidRef.current) return;
      const pd = ensurePC(from);
      if (!pd) return;
      const pc = pd.pc;
      try {
        if (signal.type === 'offer') {
          LOG('recv offer', from);
          if (pc.signalingState === 'have-local-offer')
            await pc.setLocalDescription({ type: 'rollback' as unknown as RTCSdpType });
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          socket.emit('signal', { to: from, signal: { type: 'answer', sdp: pc.localDescription } });
          if (lsRef.current) {
            const at = lsRef.current.getAudioTracks()[0];
            if (at) {
              const s = getSender(pc, 'audio');
              if (s) { s.replaceTrack(at).catch(() => {}); const t = getTransceiver(pc, 'audio'); if (t) t.direction = at.enabled ? 'sendrecv' : 'inactive'; }
            }
            const vt = lsRef.current.getVideoTracks()[0];
            if (vt) {
              const s = getSender(pc, 'video');
              if (s) { s.replaceTrack(vt).catch(() => {}); const t = getTransceiver(pc, 'video'); if (t) t.direction = screenSharing ? 'sendrecv' : vt.enabled ? 'sendrecv' : 'inactive'; }
            }
          }
          socket.emit('media-state', { enabled: { audio: !micMuted, video: !cameraOff, screen: screenSharing } });
        } else if (signal.type === 'answer') {
          LOG('recv answer', from);
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
  }, [socket, micMuted, cameraOff, screenSharing]);

  useEffect(() => {
    if (!socket) return;
    const h = ({ socketId: sid, enabled }: { socketId: string; enabled: { audio?: boolean; video?: boolean; screen?: boolean } }) => {
      remMediaRef.current.set(sid, { audio: !!enabled.audio, video: !!enabled.video, screen: !!enabled.screen });
      if (enabled.screen) setScreenShareBy(sid);
      else if (screenShareBy === sid) setScreenShareBy(null);
      setTimeout(() => force(), 0);
    };
    socket.on('media-state', h);
    return () => { socket.off('media-state', h); };
  }, [socket, screenShareBy]);

  useEffect(() => {
    if (!socket) return;
    const h = ({ socketId: lid }: { socketId: string }) => { LOG('user-left', lid); cleanupPeer(lid); };
    socket.on('user-left', h);
    return () => { socket.off('user-left', h); };
  }, [socket]);

  useEffect(() => {
    if (!mediaActive) return;
    const sid = sidRef.current;
    if (!sid) return;
    for (const p of participants) {
      if (p.socketId !== sid && !peersRef.current.has(p.socketId)) {
        LOG('send offer to new participant', p.socketId);
        sendOffer(p.socketId);
      }
    }
  }, [participants, mediaActive]);

  useEffect(() => {
    return () => { if (callActiveRef.current) leaveCall(); };
  }, []);

  /* ================================================================ */
  /*  Derived data                                                    */
  /* ================================================================ */

  const remoteParticipants = useMemo(() => {
    return participants.filter(p => p.socketId !== sidRef.current).map(p => {
      const rem = remMediaRef.current.get(p.socketId);
      const pd = peersRef.current.get(p.socketId);
      return { ...p, stream: pd?.videoStream ?? null, hasVideo: !!rem?.video && !!pd?.videoStream, isScreen: !!rem?.screen, micMuted: !rem?.audio };
    });
  }, [participants, mediaActive, screenShareBy]);

  const hasScreenShare = screenShareBy && remMediaRef.current.get(screenShareBy)?.screen;

  const screenShareStream = useMemo(() => {
    if (!screenShareBy) return null;
    const pd = peersRef.current.get(screenShareBy);
    return pd?.videoStream ?? null;
  }, [screenShareBy, mediaActive, screenShareBy]);

  const initial = userName?.charAt(0)?.toUpperCase() ?? 'C';

  /* ================================================================ */
  /*  Render                                                          */
  /* ================================================================ */

  // --- NOT IN CALL ---
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

  // --- IN CALL ---
  const hasScreen = hasScreenShare || screenSharing;

  return (
    <>
      {/* ============ Toolbar Buttons (rendered in nav slot) ============ */}
      <div className="flex items-center gap-1" data-call-toolbar>
        {/* Mic */}
        <button onClick={toggleMic}
          className={`p-1.5 rounded-xl transition-all active:scale-90 ${
            micMuted ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'
          }`} title={micMuted ? 'Unmute microphone' : 'Mute microphone'}>
          {micMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
        </button>

        {/* Camera */}
        <button onClick={toggleCam} disabled={screenSharing}
          className={`p-1.5 rounded-xl transition-all active:scale-90 ${
            screenSharing ? 'bg-white/[0.03] text-white/30 cursor-not-allowed' :
            cameraOff ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'
          }`} title={screenSharing ? 'Stop share to use camera' : cameraOff ? 'Turn on camera' : 'Turn off camera'}>
          {cameraOff ? <CameraOff className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
        </button>

        {/* Screen Share */}
        <button onClick={screenSharing ? stopSS : startSS} disabled={loading}
          className={`p-1.5 rounded-xl transition-all active:scale-90 ${
            screenSharing ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'
          }`} title={screenSharing ? 'Stop sharing screen' : 'Share screen'}>
          {screenSharing ? <ScreenShareOff className="w-3.5 h-3.5" /> : loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Monitor className="w-3.5 h-3.5" />}
        </button>

        {/* Chat */}
        <button onClick={() => setShowChat(!showChat)}
          className={`p-1.5 rounded-xl transition-all ${showChat ? 'bg-white/[0.1] text-white/90' : 'text-white/50 hover:bg-white/[0.06]'}`} title="Toggle chat">
          <MessageSquare className="w-3.5 h-3.5" />
        </button>

        {/* Leave */}
        <button onClick={leaveCall}
          className="p-1.5 rounded-xl bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-all active:scale-90" title="Leave call">
          <PhoneOff className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ============ Chat Drawer ============ */}
      {showChat && (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto" onClick={() => setShowChat(false)} />
          <div className="absolute top-0 right-0 bottom-0 w-full max-w-md pointer-events-auto bg-[#050505] border-l border-white/[0.08] shadow-2xl flex flex-col animate-fade-in">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
              <span className="text-xs font-bold text-white/60 uppercase tracking-wider">Chat</span>
              <button onClick={() => setShowChat(false)} className="p-1 rounded-lg hover:bg-white/[0.06] text-white/40 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <RoomCallChat messages={chatMessages} onSend={onSendChat} currentSocketId={socketId} onClose={() => setShowChat(false)} />
            </div>
          </div>
        </div>
      )}

      {/* ============ Media Overlay Layer ============ */}
      <div className="fixed inset-0 z-[9000] pointer-events-none">
        {/* Screen Share Dominant Stage */}
        {hasScreenShare && (
          <div ref={screenStageRef}
            className={`absolute animate-fade-in pointer-events-auto
              ${screenFullscreen ? 'inset-0 bg-black' : 'inset-x-4 top-[80px] bottom-24'}`}>
            <div className={`relative w-full h-full mx-auto ${screenFullscreen ? '' : 'max-w-[80vw]'}`}
              style={screenFullscreen ? {} : { aspectRatio: '16/9', maxHeight: 'calc(100vh - 200px)' }}>
              {/* Top bar */}
              <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/80 via-black/40 to-transparent rounded-t-2xl">
                <div className="flex items-center gap-2">
                  <Monitor className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-medium text-white/80">
                    {participants.find(p => p.socketId === screenShareBy)?.name ?? 'Someone'}&apos;s Screen
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={toggleFullscreen}
                    className="p-1.5 rounded-lg hover:bg-white/[0.1] text-white/50 hover:text-white/80 transition-all" title={screenFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                    {screenFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => setScreenShareBy(null)}
                    className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-all" title="Close">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {/* Video */}
              {screenShareStream ? (
                <video ref={el => { if (el && screenShareStream && el.srcObject !== screenShareStream) el.srcObject = screenShareStream; }}
                  autoPlay playsInline className={`w-full h-full object-contain rounded-2xl ${screenFullscreen ? 'rounded-none' : ''} bg-black/80`} />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-black/80 rounded-2xl">
                  <Loader2 className="w-10 h-10 text-white/30 animate-spin" />
                </div>
              )}
              {/* Bottom label */}
              <div className="absolute bottom-0 left-0 right-0 z-20 px-4 py-2 bg-gradient-to-t from-black/60 to-transparent rounded-b-2xl">
                <span className="text-[10px] text-white/40 font-mono">Screen Share &bull; Live</span>
              </div>
            </div>
          </div>
        )}

        {/* Participant Tiles */}
        <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-[9100] flex items-center gap-2 pointer-events-none transition-all duration-300 ease-out`}
          style={{ maxWidth: 'min(90vw, 800px)' }}>
          <div className="flex items-center gap-2 px-3 py-2 mirror-glass rounded-2xl pointer-events-auto flex-wrap justify-center">
            {/* Local tile */}
            <VideoTile
              stream={lsRef.current}
              name={userName}
              hasVideo={!cameraOff && !!lsRef.current?.getVideoTracks().length}
              isScreen={screenSharing}
              isLocal
              muted
              micMuted={micMuted}
              compact
              speaking={speakingId === sidRef.current}
            />
            {/* Remote tiles */}
            {remoteParticipants.map(p => (
              <VideoTile key={p.socketId} {...p} compact speaking={speakingId === p.socketId} />
            ))}
          </div>
        </div>
      </div>

      {/* ============ Camera Error Toast ============ */}
      {cameraError && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300/80 backdrop-blur-md shadow-lg animate-slide-down">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
          <span className="flex-1">{cameraError}</span>
          <button onClick={retryCam} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-all text-[10px] font-medium">
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
          <button onClick={() => setCameraError(null)} className="p-1 hover:bg-white/[0.06] rounded-lg text-white/30 transition-all">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* ============ Error Toast ============ */}
      {error && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-300/80 backdrop-blur-md shadow-lg animate-slide-down">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-400" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="p-1 hover:bg-white/[0.06] rounded-lg text-white/30 transition-all">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </>
  );
}
