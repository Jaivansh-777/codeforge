'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, X } from 'lucide-react';

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
  onClose: () => void;
}

export default function RoomCallChat({ messages, onSend, currentSocketId, onClose }: Props) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const handleSend = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
        <span className="text-xs font-bold text-white/60 uppercase tracking-wider">Chat</span>
        <button onClick={onClose} className="lg:hidden p-1 rounded-lg hover:bg-white/[0.06] text-white/40 transition-all">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-none">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-white/20">No messages yet</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.socketId === currentSocketId;
          return (
            <div key={i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <div className={`px-3 py-1.5 rounded-2xl text-xs max-w-[85%] break-words leading-relaxed ${
                isMe
                  ? 'bg-white/[0.1] text-white/90 rounded-tr-[4px]'
                  : 'bg-white/[0.04] text-white/70 rounded-tl-[4px]'
              }`}>
                {msg.message}
              </div>
              <span className="text-[9px] text-white/20 mt-0.5 px-1">
                {isMe ? 'You' : msg.name}
              </span>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="shrink-0 p-3 border-t border-white/[0.06]">
        <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex items-center gap-2">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white/70 placeholder:text-white/20 outline-none focus:border-white/[0.15] transition-all"
          />
          <button type="submit" disabled={!text.trim()}
            className="p-2 rounded-xl bg-white/[0.08] text-white/50 hover:bg-white/[0.12] disabled:opacity-30 transition-all">
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
