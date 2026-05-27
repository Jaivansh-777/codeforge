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
/*  Main Component                                                    */
/* ================================================================== */
export default function RoomMediaPanel({ socket, socketId, participants, userName, chatMessages, onSendChat }: Props) {
  /* ---- State ---- */
  const [mediaActive, setMediaActive] = useState(false);
  const [micMuted, setMicMuted] = useState(true);
  const [cameraOff, setCameraOff] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [screenShareBy, setScreenShareBy] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [screenFullscreen, setScreenFullscreen] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  /* ---- Refs ---- */
  const sRef = useRef(socket);
  const sidRef = useRef(socketId);
  const partsRef = useRef<Participant[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const peersRef = useRef<Map<string, PeerData>>(new Map());
  const remMediaRef = useRef<Map<string, RemoteMediaState>>(new Map());
  const wasCamRef = useRef(false);
  const callActiveRef = useRef(false);
  const screenStageRef = useRef<HTMLDivElement>(null);
  const speakingCleanupRef = useRef<Map<string, () => void>>(new Map());

  useEffect(() => { sRef.current = socket; }, [socket]);
  useEffect(() => { sidRef.current = socketId; }, [socketId]);
  useEffect(() => { partsRef.current = participants; }, [participants]);

  const [, tick] = useState(0);
  const force = useCallback(() => tick(n => n + 1), []);

  function refreshRemoteStreams() { setTimeout(() => force(), 0); }

  /* ---- helper: add local tracks to a PC (avoids duplicates) ---- */
  function addLocalTracksToPC(pc: RTCPeerConnection) {
    const ls = localStreamRef.current;
    if (!ls) return;
    ls.getTracks().forEach(track => {
      const kind = track.kind;
      const exists = pc.getSenders().some(s => s.track?.kind === kind);
      if (!exists) {
        pc.addTrack(track, ls);
        LOG('added local track', kind, 'to PC');
      }
    });
  }

  /* ---- helper: remove local tracks of a given kind from a PC ---- */
  function removeLocalTracksFromPC(pc: RTCPeerConnection, kind: 'audio' | 'video') {
    pc.getSenders().forEach(s => {
      if (s.track?.kind === kind) {
        pc.removeTrack(s);
        LOG('removed local track', kind, 'from PC');
      }
    });
  }

  /* ---- explicit renegotiation (sends new offer) ---- */
  async function renegotiate(targetId: string) {
    const pd = peersRef.current.get(targetId);
    if (!pd) return;
    const pc = pd.pc;
    if (pc.signalingState !== 'stable') return;
    try {
      console.log("sending offer to", targetId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sRef.current?.emit('signal', { to: targetId, signal: { type: 'offer', sdp: pc.localDescription } });
      console.log("offer sent to", targetId);
    } catch (e) { console.error('[renegotiate]', e); }
  }

  async function renegotiateAll() {
    const ids = Array.from(peersRef.current.keys());
    for (const id of ids) {
      await renegotiate(id);
    }
  }

  /* ---- create PC (no transceivers; tracks added later) ---- */
  function createPC(targetId: string): PeerData {
    const id = ++pcId;
    console.log("creating peer", targetId);
    const pc = new RTCPeerConnection(STUN);

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
        console.log("received remote track from", targetId);
        remoteStreamsRef.current.set(targetId, e.streams[0]);
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
        console.log("sending offer to", targetId);
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);
        sRef.current?.emit('signal', { to: targetId, signal: { type: 'offer', sdp: pc.localDescription } });
        console.log("offer sent to", targetId);
      } catch (e) { console.error('[neg]', e); }
    };

    const data: PeerData = { pc };
    peersRef.current.set(targetId, data);
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
    remoteStreamsRef.current.delete(targetId);
    remMediaRef.current.delete(targetId);
    speakingCleanupRef.current.get(targetId)?.();
    speakingCleanupRef.current.delete(targetId);
    if (speakingId === targetId) setSpeakingId(null);
    updConnState(targetId, 'closed');
    if (screenShareBy === targetId) setScreenShareBy(null);
    setTimeout(() => force(), 0);
  }

  function updConnState(_id: string, _st: string) {}

  /* ---- send initial offer to a peer ---- */
  async function sendOffer(targetId: string) {
    const pd = ensurePC(targetId);
    if (!pd) return;
    const pc = pd.pc;
    addLocalTracksToPC(pc);
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
    if (!localStreamRef.current || micMuted) return;
    const cleanup = createSpeakingDetector(localStreamRef.current, 0.025, (speaking) => {
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
    console.log("camera stream started");
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
      localStreamRef.current = st;
      st.getAudioTracks().forEach(t => (t.enabled = false));
      setMicMuted(true); setCameraOff(!vidTrack); setMediaActive(true);
      callActiveRef.current = true;
      console.log("local video srcObject attached");
      sRef.current?.emit('media-state', { enabled: { audio: true, video: !!vidTrack, screen: false } });
      await connectAll();
      LOG('joinCall done');
    } catch (e: any) {
      if (e.name === 'NotFoundError') setError('No microphone found');
      else if (e.name === 'NotAllowedError') setError('Microphone access denied');
      else if (e.name === 'NotReadableError') setError('Microphone in use by another app');
      else setError(e.message || 'Microphone access denied');
    } finally { setLoading(false); }
  }, []);

  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    const next = !micMuted;
    localStreamRef.current.getAudioTracks().forEach(t => (t.enabled = next));
    setMicMuted(!micMuted);
    peersRef.current.forEach(({ pc }) => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
      if (sender) {
        const str = localStreamRef.current?.getAudioTracks()[0] ?? null;
        sender.replaceTrack(!micMuted ? str : null).catch(() => {});
      }
    });
    sRef.current?.emit('media-state', { enabled: { audio: !micMuted, video: screenSharing || !cameraOff, screen: screenSharing } });
  }, [micMuted, cameraOff, screenSharing]);

  const toggleCam = useCallback(async () => {
    if (screenSharing) return;
    LOG('toggleCam', cameraOff ? 'ON' : 'OFF');
    setError(''); setCameraError(null);
    if (cameraOff) {
      try {
        const cs = await navigator.mediaDevices.getUserMedia({ video: VID_MAIN });
        const nt = cs.getVideoTracks()[0];
        if (localStreamRef.current) localStreamRef.current.addTrack(nt);
        setCameraOff(false);
        peersRef.current.forEach(({ pc }) => {
          const exists = pc.getSenders().some(s => s.track?.kind === 'video');
          if (!exists && localStreamRef.current) {
            pc.addTrack(nt, localStreamRef.current);
            LOG('added video track to PC');
          }
        });
        await renegotiateAll();
        console.log("camera stream started");
        console.log("local video srcObject attached");
      } catch (err: any) {
        if (err.name === 'NotFoundError') setCameraError('Camera unavailable');
        else if (err.name === 'NotAllowedError') setCameraError('Camera denied');
        else setCameraError('Camera error');
        setCameraOff(true);
      }
    } else {
      const tracks = localStreamRef.current?.getVideoTracks() ?? [];
      tracks.forEach(t => { t.stop(); localStreamRef.current?.removeTrack(t); });
      peersRef.current.forEach(({ pc }) => {
        removeLocalTracksFromPC(pc, 'video');
      });
      await renegotiateAll();
      setCameraOff(true);
    }
    force();
    sRef.current?.emit('media-state', { enabled: { audio: !micMuted, video: !cameraOff, screen: screenSharing } });
  }, [cameraOff, micMuted, screenSharing]);

  const retryCam = useCallback(async () => {
    setCameraError(null); setError('');
    try {
      const cs = await navigator.mediaDevices.getUserMedia({ video: VID_MAIN });
      const nt = cs.getVideoTracks()[0];
      if (localStreamRef.current) { localStreamRef.current.getVideoTracks().forEach(t => { t.stop(); localStreamRef.current?.removeTrack(t); }); localStreamRef.current.addTrack(nt); }
      setCameraOff(false);
      peersRef.current.forEach(({ pc }) => {
        removeLocalTracksFromPC(pc, 'video');
        if (localStreamRef.current) {
          pc.addTrack(nt, localStreamRef.current);
        }
      });
      await renegotiateAll();
      console.log("camera stream started");
    } catch { setCameraError('Camera still unavailable'); }
    force();
  }, []);

  const startSS = useCallback(async () => {
    console.log("screen share started");
    setLoading(true); setError('');
    try {
      const ds = await navigator.mediaDevices.getDisplayMedia({
        video: { ...VID_SCR, displaySurface: 'monitor' } as MediaTrackConstraints,
        audio: true,
        preferCurrentTab: false,
      } as any);
      const vt = ds.getVideoTracks()[0];
      try {
        const s = vt.getSettings() as any;
        if (s.displaySurface === 'browser') {
          toast('You\'re sharing a browser tab — switch to "Entire Screen" or a different window to avoid recursive mirroring.', {
            duration: 7000, icon: '⚠️',
            style: { background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)', fontSize: '12px', borderRadius: '12px' },
          });
        }
      } catch {}
      vt.onended = () => stopSS();
      screenStreamRef.current = ds;
      wasCamRef.current = !cameraOff;
      const ls = localStreamRef.current;
      if (ls) {
        const old = ls.getVideoTracks();
        ls.addTrack(vt);
        old.forEach(t => { ls.removeTrack(t); t.stop(); });
      }
      peersRef.current.forEach(({ pc }) => {
        const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(vt);
          LOG('screen track replaced for peer');
        }
      });
      await renegotiateAll();
      console.log("screen offer renegotiated");
      setScreenSharing(true); setCameraOff(false); force();
      sRef.current?.emit('media-state', { enabled: { audio: !micMuted, video: true, screen: true, screenOwnerId: sidRef.current } });
    } catch (e: any) {
      if (e.name === 'NotAllowedError') setError('Screen share denied');
      else setError(e.message || 'Screen share failed');
    } finally { setLoading(false); }
  }, [cameraOff, micMuted]);

  const stopSS = useCallback(async () => {
    LOG('stopSS');
    const ls = localStreamRef.current;
    const old = ls?.getVideoTracks() || [];
    if (wasCamRef.current) {
      try {
        const cs = await navigator.mediaDevices.getUserMedia({ video: VID_MAIN });
        const ct = cs.getVideoTracks()[0];
        ls?.addTrack(ct);
        peersRef.current.forEach(({ pc }) => {
          const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (videoSender) videoSender.replaceTrack(ct);
        });
        await renegotiateAll();
        console.log("camera stream started");
        console.log("local video srcObject attached");
      } catch { setCameraOff(true); }
    } else {
      peersRef.current.forEach(({ pc }) => {
        const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (videoSender) videoSender.replaceTrack(null);
      });
      await renegotiateAll();
    }
    old.forEach(t => { ls?.removeTrack(t); t.stop(); });
    if (screenStreamRef.current) { screenStreamRef.current.getTracks().forEach(t => t.stop()); screenStreamRef.current = null; }
    setScreenSharing(false);
    if (!wasCamRef.current) setCameraOff(true);
    console.log("screen share ended");
    force();
    sRef.current?.emit('media-state', { enabled: { audio: !micMuted, video: wasCamRef.current, screen: false, screenOwnerId: null } });
  }, [micMuted]);

  const leaveCall = useCallback(() => {
    LOG('leaveCall');
    callActiveRef.current = false;
    if (document.fullscreenElement) document.exitFullscreen();
    setScreenFullscreen(false);
    peersRef.current.forEach((pd, id) => { LOG('close peer', id); pd.pc.close(); });
    peersRef.current.clear();
    document.querySelectorAll<HTMLAudioElement>('audio[__peerId]').forEach(el => { el.pause(); el.srcObject = null; el.remove(); });
    remoteStreamsRef.current.clear();
    remMediaRef.current.clear();
    speakingCleanupRef.current.forEach(c => c());
    speakingCleanupRef.current.clear();
    setSpeakingId(null);
    if (screenStreamRef.current) { screenStreamRef.current.getTracks().forEach(t => t.stop()); screenStreamRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    setMediaActive(false); setMicMuted(true); setCameraOff(true); setScreenSharing(false);
    setScreenShareBy(null); setError(''); setCameraError(null);
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
          console.log("received offer from", from);
          if (pc.signalingState === 'have-local-offer')
            await pc.setLocalDescription({ type: 'rollback' as unknown as RTCSdpType });
          addLocalTracksToPC(pc);
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          socket.emit('signal', { to: from, signal: { type: 'answer', sdp: pc.localDescription } });
          socket.emit('media-state', { enabled: { audio: !micMuted, video: !cameraOff, screen: screenSharing } });
        } else if (signal.type === 'answer') {
          console.log("received answer from", from);
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
    const h = ({ socketId: sid, enabled }: { socketId: string; enabled: { audio?: boolean; video?: boolean; screen?: boolean; screenOwnerId?: string | null } }) => {
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

  const remoteParticipantsData = useMemo(() => {
    return participants.filter(p => p.socketId !== sidRef.current).map(p => {
      const rem = remMediaRef.current.get(p.socketId);
      const stream = remoteStreamsRef.current.get(p.socketId) ?? null;
      return {
        socketId: p.socketId,
        name: p.name,
        stream,
        hasVideo: !!rem?.video && !!stream,
        isScreen: !!rem?.screen,
        micMuted: !rem?.audio,
        speaking: speakingId === p.socketId,
      };
    });
  }, [participants, mediaActive, screenShareBy, speakingId]);

  const hasScreenShare = screenShareBy && remMediaRef.current.get(screenShareBy)?.screen;

  const screenShareStream = useMemo(() => {
    if (!screenShareBy) return null;
    if (screenShareBy === sidRef.current) return screenStreamRef.current;
    return remoteStreamsRef.current.get(screenShareBy) ?? null;
  }, [screenShareBy, mediaActive]);

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
  return (
    <>
      {/* ============ Toolbar Buttons (rendered in nav slot) ============ */}
      <div className="flex items-center gap-1" data-call-toolbar>
        <button onClick={toggleMic}
          className={`p-1.5 rounded-xl transition-all active:scale-90 ${
            micMuted ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'
          }`} title={micMuted ? 'Unmute microphone' : 'Mute microphone'}>
          {micMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
        </button>

        <button onClick={toggleCam} disabled={screenSharing}
          className={`p-1.5 rounded-xl transition-all active:scale-90 ${
            screenSharing ? 'bg-white/[0.03] text-white/30 cursor-not-allowed' :
            cameraOff ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'
          }`} title={screenSharing ? 'Stop share to use camera' : cameraOff ? 'Turn on camera' : 'Turn off camera'}>
          {cameraOff ? <CameraOff className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
        </button>

        <button onClick={screenSharing ? stopSS : startSS} disabled={loading}
          className={`p-1.5 rounded-xl transition-all active:scale-90 ${
            screenSharing ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25' : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'
          }`} title={screenSharing ? 'Stop sharing screen' : 'Share screen'}>
          {screenSharing ? <ScreenShareOff className="w-3.5 h-3.5" /> : loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Monitor className="w-3.5 h-3.5" />}
        </button>

        <button onClick={() => setShowChat(!showChat)}
          className={`p-1.5 rounded-xl transition-all ${showChat ? 'bg-white/[0.1] text-white/90' : 'text-white/50 hover:bg-white/[0.06]'}`} title="Toggle chat">
          <MessageSquare className="w-3.5 h-3.5" />
        </button>

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

      {/* ============ ScreenShareStage ============ */}
      {hasScreenShare && (
        <div ref={screenStageRef}
          className={`fixed z-20 pointer-events-auto animate-scale-in
            ${screenFullscreen ? 'inset-0 bg-black' : 'left-4 lg:left-[216px]'}`}
          style={{
            top: '72px',
            right: '16px',
            bottom: screenFullscreen ? '0' : '16px',
          }}>
          <div className={`relative w-full h-full overflow-hidden ${screenFullscreen ? '' : 'rounded-2xl'} bg-black/80 flex items-center justify-center`}
            style={{ aspectRatio: '16/9' }}>
            <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
              <div className="flex items-center gap-2.5">
                <Monitor className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-white/90">
                  {participants.find(p => p.socketId === screenShareBy)?.name ?? 'Someone'}&apos;s Screen
                </span>
                {screenShareBy === sidRef.current && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30">
                    Presenting
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={toggleFullscreen}
                  className="p-1.5 rounded-lg hover:bg-white/[0.1] text-white/50 hover:text-white/80 transition-all" title={screenFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                  {screenFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button onClick={() => setScreenShareBy(null)}
                  className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-all" title="Close">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {screenShareStream ? (
              <video ref={el => {
                if (el && screenShareStream && el.srcObject !== screenShareStream) {
                  el.srcObject = screenShareStream;
                  console.log("screen share started");
                }
              }} autoPlay playsInline className="w-full h-full object-contain" />
            ) : (
              <div className="flex items-center justify-center">
                <Loader2 className="w-12 h-12 text-white/20 animate-spin" />
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 z-20 px-4 py-2 bg-gradient-to-t from-black/60 to-transparent">
              <span className="text-[11px] text-white/40 font-mono">Screen Share &bull; Live</span>
            </div>
          </div>
        </div>
      )}

      {/* ============ MediaRail (below left participants panel) ============ */}
      <div className="fixed left-4 top-[360px] w-[200px] z-20 pointer-events-none">
        <div className="flex flex-col gap-2 pointer-events-auto">
          {/* Local tile */}
          <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0a0e] transition-all duration-300"
            style={{ width: '100%', height: 110 }}>
            <video ref={el => {
              if (el && localStreamRef.current && el.srcObject !== localStreamRef.current) {
                el.srcObject = localStreamRef.current;
                console.log("local video srcObject attached");
              }
            }} autoPlay playsInline muted
              className={`absolute inset-0 w-full h-full object-cover scale-x-[-1] ${cameraOff || !localStreamRef.current?.getVideoTracks().length ? 'hidden' : ''}`} />
            {cameraOff || !localStreamRef.current?.getVideoTracks().length ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-white/[0.06] text-white/40">{initial}</div>
              </div>
            ) : null}
            <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-white/60 font-medium truncate max-w-[80px]">You</span>
                {micMuted && <MicOff className="w-2.5 h-2.5 text-red-400 shrink-0" />}
                {!micMuted && <Mic className="w-2.5 h-2.5 text-emerald-400/70 shrink-0" />}
                {cameraOff && <CameraOff className="w-2.5 h-2.5 text-red-400 shrink-0" />}
              </div>
            </div>
          </div>

          {/* Remote tiles */}
          {remoteParticipantsData.map(p => (
            <div key={p.socketId}
              className={`relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0a0e] transition-all duration-300 ${
                p.speaking ? 'ring-2 ring-emerald-400/60 ring-offset-2 ring-offset-transparent' : ''
              }`}
              style={{ width: '100%', height: 110 }}>
              <video ref={el => {
                const s = remoteStreamsRef.current.get(p.socketId);
                if (el && s && el.srcObject !== s) {
                  el.srcObject = s;
                  console.log("attached remote video", p.socketId);
                }
              }} autoPlay playsInline
                className={`absolute inset-0 w-full h-full object-cover ${p.stream ? '' : 'hidden'}`} />
              {!p.stream ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-white/[0.06] text-white/40">{p.name?.charAt(0)?.toUpperCase() ?? '?'}</div>
                </div>
              ) : null}
              <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-white/60 font-medium truncate max-w-[80px]">{p.name}</span>
                  {p.micMuted && <MicOff className="w-2.5 h-2.5 text-red-400 shrink-0" />}
                  {!p.micMuted && <Volume2 className="w-2.5 h-2.5 text-emerald-400/70 shrink-0" />}
                  {p.speaking && <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)] animate-pulse shrink-0" />}
                </div>
              </div>
            </div>
          ))}
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
