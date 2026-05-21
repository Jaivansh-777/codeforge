'use client';

import { useState } from 'react';
import { Users, ArrowRight, Terminal } from 'lucide-react';

export default function NamePrompt({ onJoin }: { onJoin: (name: string) => void }) {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onJoin(trimmed);
  };

  return (
    <div className="h-screen flex items-center justify-center bg-[#050505] p-4">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-white/[0.015] rounded-full blur-[150px]" />
        <div className="absolute bottom-1/4 left-1/5 w-[400px] h-[400px] bg-white/[0.01] rounded-full blur-[120px]" />
      </div>

      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-sm premium-glass-card rounded-[28px] p-8 border-shine"
      >
        <div className="flex items-center justify-center w-14 h-14 mx-auto mb-5 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
          <Users className="w-6 h-6 text-white/60" />
        </div>

        <h1 className="text-xl font-bold text-white/90 text-center mb-1 tracking-tight">
          Join Live Room
        </h1>
        <p className="text-sm text-white/40 text-center mb-6">
          Enter your name to join the collaboration session.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-2">
              Your Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Alex"
              maxLength={30}
              autoFocus
              className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.1] rounded-xl text-sm text-white/80 placeholder:text-white/20 outline-none focus:border-white/[0.25] focus:bg-white/[0.06] transition-all font-medium"
            />
          </div>

          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-white text-black text-sm font-bold rounded-xl hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Join Room
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-6 pt-5 border-t border-white/[0.06]">
          <div className="flex items-center gap-2 text-[11px] text-white/25">
            <Terminal className="w-3 h-3" />
            <span>Your code stays private between room participants</span>
          </div>
        </div>
      </form>
    </div>
  );
}
