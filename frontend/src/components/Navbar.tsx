'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X, ArrowRight, Terminal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/compiler', label: 'Compiler' },
  { href: '#features', label: 'Features' },
  { href: '#docs', label: 'Docs' },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-4 left-0 right-0 z-50 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto glass-nav rounded-2xl px-4 sm:px-6 shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2.5 group shrink-0">
            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center group-hover:bg-white/15 transition-colors ring-1 ring-white/[0.06]">
              <Terminal className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-bold tracking-tight text-white/90">
              Code<span className="text-white/50">Forge</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-0.5">
            {navLinks.map(link => (
              <Link
                key={link.label}
                href={link.href}
                className="px-3 py-1.5 text-xs text-white/50 hover:text-white/90 rounded-lg hover:bg-white/[0.04] transition-all tracking-wide font-medium"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/compiler"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-white text-black text-xs font-semibold rounded-lg hover:bg-white/90 transition-all active:scale-[0.97] shadow-lg shadow-white/10"
            >
              Start Coding
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <button onClick={() => setOpen(!open)} className="md:hidden p-2 text-white/50 hover:text-white/90 rounded-lg hover:bg-white/[0.04] transition-colors">
            {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="md:hidden mt-2 mx-4 sm:mx-6 glass-nav rounded-2xl px-4 py-4 space-y-1 shadow-[0_8px_40px_rgba(0,0,0,0.5)]"
          >
            {navLinks.map(link => (
              <Link
                key={link.label}
                href={link.href}
                className="block px-3 py-2 text-sm text-white/50 hover:text-white/90 rounded-lg hover:bg-white/[0.04] transition-colors"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/compiler"
              className="block text-center px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg mt-3"
              onClick={() => setOpen(false)}
            >
              Start Coding
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
