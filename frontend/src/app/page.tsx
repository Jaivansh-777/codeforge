'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Zap, Shield, Code2, Cloud, Sparkles, Terminal } from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import Navbar from '@/components/Navbar';

const SplineRobot = dynamic(() => import('@/components/SplineRobot'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[400px] lg:min-h-[520px] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-xl border border-white/[0.06] bg-white/[0.02] flex items-center justify-center">
          <svg className="w-5 h-5 text-white/30 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
        <span className="text-xs text-white/30 font-mono tracking-wider uppercase">Loading</span>
      </div>
    </div>
  ),
});

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
};

const stagger = {
  initial: { opacity: 0 },
  whileInView: { opacity: 1 },
  viewport: { once: true },
  transition: { staggerChildren: 0.08 },
};

const languages = [
  'Python', 'C', 'C++', 'JavaScript', 'PHP', 'Java', 'Assembly', 'Binary',
];

const features = [
  { icon: Zap, title: 'Lightning Fast', desc: 'Sub-second execution with optimized Docker pipeline for all supported languages.' },
  { icon: Shield, title: 'Secure Execution', desc: 'Every run is sandboxed in an isolated container with zero network access.' },
  { icon: Code2, title: 'Powerful Editor', desc: 'Monaco editor with syntax highlighting, themes, and auto-completion.' },
  { icon: Cloud, title: 'Cloud Native', desc: 'Deploy anywhere with Docker Compose. Neon PostgreSQL for persistence.' },
];

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/[0.06] text-xs text-white/40 hover:text-white/70 hover:border-white/[0.15] transition-all cursor-default">
      {children}
    </span>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white overflow-hidden">
      {/* Particle stars */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {Array.from({ length: 60 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-[1px] h-[1px] bg-white/60 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              opacity: 0.2 + Math.random() * 0.6,
              animation: `twinkle ${2 + Math.random() * 4}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 4}s`,
            }}
          />
        ))}
      </div>

      <Navbar />

      <main className="relative z-10">
        {/* Hero */}
        <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-20 overflow-hidden min-h-[700px] lg:min-h-[850px] flex items-center">
          <div className="absolute inset-0 bg-grid opacity-30" />
          <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-white/[0.015] rounded-full blur-[150px]" />

          <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-6 lg:gap-8 items-center">

              {/* Left text */}
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="text-center lg:text-left max-w-xl lg:max-w-2xl"
              >
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/[0.06] bg-white/[0.03] text-[11px] text-white/50 tracking-wide mb-6"
                >
                  <Sparkles className="w-3 h-3" />
                  Production-ready online compiler
                </motion.div>

                <h1 className="text-[clamp(2.2rem,7vw,4.5rem)] font-bold tracking-tight leading-[1.08] mb-5">
                  <span className="text-white">Run code in </span>
                  <span className="text-white">any language</span>
                  <br />
                  <span className="text-gradient-mono">instantly.</span>
                </h1>

                <p className="text-sm sm:text-base text-white/40 max-w-lg mb-8 leading-relaxed lg:mx-0 mx-auto">
                  A fast, secure, and elegant online compiler with Docker sandboxing, a powerful editor, and real-time execution.
                </p>

                <div className="flex flex-col sm:flex-row items-center lg:justify-start justify-center gap-3">
                  <Link
                    href="/compiler"
                    className="group inline-flex items-center gap-2 px-5 py-2.5 bg-white text-black text-sm font-semibold rounded-xl hover:bg-white/90 transition-all duration-200 active:scale-[0.97] shadow-lg shadow-white/10"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Open Compiler
                    <Zap className="w-3.5 h-3.5" />
                  </Link>
                  <a
                    href="#features"
                    className="inline-flex items-center gap-2 px-5 py-2.5 border border-white/[0.1] hover:border-white/[0.2] text-white/60 hover:text-white/90 text-sm font-medium rounded-xl transition-all duration-200"
                  >
                    Explore Features
                    <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="flex flex-wrap items-center lg:justify-start justify-center gap-2 mt-10"
                >
                  {languages.map(lang => (
                    <Pill key={lang}>{lang}</Pill>
                  ))}
                </motion.div>
              </motion.div>

              {/* Right: Robot */}
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="relative flex items-center justify-center lg:justify-end lg:-mr-20"
              >
                <div className="relative w-full max-w-[90vw] sm:max-w-[520px] lg:max-w-[650px] xl:max-w-[750px] aspect-square">
                  {/* Soft white/grey radial glow */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-[500px] h-[500px] rounded-full bg-white/[0.04] blur-[140px]" />
                    <div className="absolute w-[350px] h-[350px] rounded-full bg-white/[0.025] blur-[100px]" />
                  </div>

                  {/* Robot */}
                  <div className="relative w-full h-full animate-float-slow z-10" style={{ minHeight: '450px', maxHeight: '750px' }}>
                    <SplineRobot />
                  </div>
                </div>
              </motion.div>

            </div>
          </div>
        </section>

        {/* Feature cards */}
        <section id="features" className="py-20 sm:py-28">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div {...fadeUp} className="text-center mb-14">
              <h2 className="text-2xl sm:text-3xl font-bold text-white/90 tracking-tight mb-3">
                Built for developers
              </h2>
              <p className="text-sm text-white/40 max-w-md mx-auto">
                Every feature is designed for speed, security, and a seamless experience.
              </p>
            </motion.div>

            <motion.div {...stagger} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {features.map(f => (
                <motion.div
                  key={f.title}
                  variants={{
                    initial: { opacity: 0, y: 16 },
                    whileInView: { opacity: 1, y: 0 },
                  }}
                  className="mirror-glass rounded-xl p-5 hover:bg-white/[0.04] transition-all duration-300 group mirror-shine"
                >
                  <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.04] flex items-center justify-center mb-3 group-hover:bg-white/[0.06] transition-colors">
                    <f.icon className="w-4 h-4 text-white/60" />
                  </div>
                  <h3 className="text-sm font-semibold text-white/80 mb-1.5">{f.title}</h3>
                  <p className="text-xs text-white/40 leading-relaxed">{f.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="pb-20 sm:pb-28">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="relative overflow-hidden rounded-2xl border border-white/[0.05] bg-white/[0.02] p-8 sm:p-12 text-center"
            >
              <div className="absolute inset-0 bg-grid opacity-20" />
              <div className="relative">
                <h2 className="text-xl sm:text-2xl font-bold text-white/90 mb-3">Ready to start coding?</h2>
                <p className="text-sm text-white/40 max-w-md mx-auto mb-6">
                  No sign-up required. Open the compiler and write code in any language instantly.
                </p>
                <Link
                  href="/compiler"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-black text-sm font-semibold rounded-xl hover:bg-white/90 transition-all active:scale-[0.97] shadow-lg shadow-white/10"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  Open Compiler
                </Link>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.03] py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-white/30" />
            <span className="text-sm font-semibold text-white/30">CodeForge</span>
          </div>
          <p className="text-xs text-white/20">&copy; {new Date().getFullYear()} CodeForge. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
