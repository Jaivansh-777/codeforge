'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, Code2 } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const LANGUAGES = [
  { id: 'python', name: 'Python', icon: '🐍' },
  { id: 'c', name: 'C', icon: '⚙️' },
  { id: 'cpp', name: 'C++', icon: '🔧' },
  { id: 'javascript', name: 'JavaScript', icon: '🟨' },
  { id: 'php', name: 'PHP', icon: '🐘' },
  { id: 'java', name: 'Java', icon: '☕' },
  { id: 'assembly', name: 'Assembly', icon: '🔌' },
];

export default function LanguageSelector({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const current = LANGUAGES.find(l => l.id === selected);

  const updatePosition = useCallback(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      top: rect.bottom + 6,
      width: Math.max(rect.width, 180),
      zIndex: 99999,
    });
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement)?.closest?.('[data-lang-portal]')
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = LANGUAGES.findIndex(l => l.id === selected);
        const next = e.key === 'ArrowDown'
          ? (idx + 1) % LANGUAGES.length
          : (idx - 1 + LANGUAGES.length) % LANGUAGES.length;
        onSelect(LANGUAGES[next].id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, selected, onSelect]);

  const dropdown = open && (
    <motion.div
      data-lang-portal
      initial={{ opacity: 0, y: -4, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.96 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      style={dropdownStyle}
      className="premium-glass-dropdown rounded-xl overflow-hidden shadow-2xl"
    >
      <div className="py-1">
        {LANGUAGES.map(lang => (
          <button
            key={lang.id}
            onClick={() => { onSelect(lang.id); setOpen(false); }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-all duration-150 ${
              selected === lang.id
                ? 'text-white bg-white/[0.06] border-l-2 border-white/60'
                : 'text-white/40 hover:text-white/70 border-l-2 border-transparent'
            }`}
          >
            <span className="text-sm">{lang.icon}</span>
            <span className="flex-1 text-left font-medium">{lang.name}</span>
            {selected === lang.id && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex items-center justify-center w-4 h-4"
              >
                <Check className="w-3 h-3 text-white/60" />
              </motion.span>
            )}
          </button>
        ))}
      </div>
    </motion.div>
  );

  return (
    <div className="relative" style={{ zIndex: 1 }}>
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); } }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="group flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-white/60 hover:text-white/80 hover:bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.12] transition-all duration-200"
      >
        <span className="text-base">{current?.icon || <Code2 className="w-4 h-4" />}</span>
        <span className="flex-1 text-left text-xs font-semibold tracking-wide">{current?.name || 'Select Language'}</span>
        <ChevronDown className={`w-3 h-3 text-white/30 transition-all duration-200 ${open ? 'rotate-180 text-white/60' : ''}`} />
      </button>
      {typeof window === 'object' && createPortal(
        <AnimatePresence>{dropdown}</AnimatePresence>,
        document.body
      )}
    </div>
  );
}
