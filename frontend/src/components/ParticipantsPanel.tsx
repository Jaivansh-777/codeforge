'use client';

import { Crown, User, LogOut } from 'lucide-react';
import { useState } from 'react';

interface Participant {
  socketId: string;
  name: string;
}

interface Props {
  participants: Participant[];
  hostSocketId: string;
  currentSocketId: string | null;
  isHost?: boolean;
  onKick?: (socketId: string) => void;
}

export default function ParticipantsPanel({ participants, hostSocketId, currentSocketId, isHost, onKick }: Props) {
  const [confirmKick, setConfirmKick] = useState<string | null>(null);

  return (
    <div className="premium-glass-card rounded-[20px] overflow-hidden border-shine">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <User className="w-3.5 h-3.5 text-white/40" />
          <span className="text-[11px] font-bold text-white/40 uppercase tracking-wider">
            Participants
          </span>
        </div>
        <span className="text-[10px] text-white/30 font-mono bg-white/[0.04] px-2 py-0.5 rounded-lg">
          {participants.length}
        </span>
      </div>
      <div className="p-2 space-y-0.5 max-h-[260px] overflow-y-auto">
        {participants.map(p => {
          const isUserHost = p.socketId === hostSocketId;
          const isMe = p.socketId === currentSocketId;
          return (
            <div
              key={p.socketId}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all group ${
                isMe ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                isUserHost
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                  : 'bg-white/[0.06] text-white/50 border border-white/[0.08]'
              }`}>
                {p.name.charAt(0).toUpperCase()}
              </div>
              <span className={`flex-1 font-medium truncate ${isMe ? 'text-white/80' : 'text-white/50'}`}>
                {p.name}
                {isMe && <span className="text-white/30 ml-1">(you)</span>}
              </span>
              {isUserHost && <Crown className="w-3 h-3 text-amber-400/70 shrink-0" />}
              {isHost && !isUserHost && !isMe && (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  {confirmKick === p.socketId ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { onKick?.(p.socketId); setConfirmKick(null); }}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
                      >
                        Kick
                      </button>
                      <button
                        onClick={() => setConfirmKick(null)}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40 hover:bg-white/[0.1] transition-all"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmKick(p.socketId)}
                      className="p-1 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
                      title={`Remove ${p.name}`}
                    >
                      <LogOut className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
