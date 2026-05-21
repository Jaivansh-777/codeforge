'use client';

import { FileInput, Trash2 } from 'lucide-react';

export default function InputPanel({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-white/[0.05] bg-white/[0.02] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-lg bg-white/[0.04] flex items-center justify-center ring-1 ring-white/[0.06]">
            <FileInput className="w-2.5 h-2.5 text-white/40" />
          </div>
          <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Input</span>
        </div>
        {value && (
          <button
            onClick={() => onChange('')}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-all duration-200"
            title="Clear input"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Enter program input here..."
        className="flex-1 bg-transparent text-xs text-white/50 font-mono p-5 outline-none resize-none placeholder:text-white/15 leading-relaxed"
        spellCheck={false}
      />
    </div>
  );
}
