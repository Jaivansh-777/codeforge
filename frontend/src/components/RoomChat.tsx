'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send } from 'lucide-react';

interface ChatMessage {
  socketId: string;
  name: string;
  message: string;
  timestamp: number;
}

interface Props {
  messages: ChatMessage[];
  onSend: (msg: string) => void;
  currentSocketId: string | null;
}

export default function RoomChat({ messages, onSend, currentSocketId }: Props) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput('');
  };

  return (
    <div className="premium-glass-card rounded-[20px] overflow-hidden border-shine flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02] shrink-0">
        <MessageSquare className="w-3.5 h-3.5 text-white/40" />
        <span className="text-[11px] font-bold text-white/40 uppercase tracking-wider">Chat</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-[11px] text-white/20">No messages yet</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.socketId === currentSocketId;
          return (
            <div key={i} className={`flex items-start gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 mt-0.5 ${
                isMe ? 'bg-white/10 text-white/60' : 'bg-white/[0.06] text-white/40'
              }`}>
                {msg.name.charAt(0).toUpperCase()}
              </div>
              <div className={`max-w-[80%] ${isMe ? 'text-right' : ''}`}>
                <div className="flex items-baseline gap-1.5 mb-0.5">
                  <span className={`text-[9px] font-semibold ${isMe ? 'text-white/50' : 'text-white/40'}`}>
                    {msg.name}
                  </span>
                </div>
                <p className={`text-xs px-3 py-1.5 rounded-xl inline-block leading-relaxed ${
                  isMe
                    ? 'bg-white/10 text-white/80'
                    : 'bg-white/[0.04] text-white/60'
                }`}>
                  {msg.message}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 p-2 border-t border-white/[0.06] shrink-0">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a message..."
          maxLength={500}
          className="flex-1 px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-xl text-xs text-white/60 placeholder:text-white/20 outline-none focus:border-white/[0.2] transition-all"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="p-2 rounded-xl bg-white/10 text-white/60 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
