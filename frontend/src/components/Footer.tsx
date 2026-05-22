import { Terminal, MessageCircle, Globe } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.03] py-10 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[1px] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      </div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/[0.06] flex items-center justify-center shadow-lg shadow-black/20">
              <Terminal className="w-4 h-4 text-white/60" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white/80 tracking-tight">Cyber Classes Sirsa</h3>
              <p className="text-[10px] text-white/30 font-medium tracking-wider">Learn &bull; Build &bull; Secure</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="#"
              className="group flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.12] transition-all duration-200"
            >
              <MessageCircle className="w-3 h-3 text-white/40 group-hover:text-white/60 transition-colors" />
              <span className="text-[11px] text-white/40 group-hover:text-white/60 font-medium transition-colors">WhatsApp</span>
            </a>
            <a
              href="#"
              className="group flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.12] transition-all duration-200"
            >
              <Globe className="w-3 h-3 text-white/40 group-hover:text-white/60 transition-colors" />
              <span className="text-[11px] text-white/40 group-hover:text-white/60 font-medium transition-colors">Contact</span>
            </a>
            <div className="flex items-center gap-1.5">
              <a href="#" className="w-7 h-7 rounded-lg border border-white/[0.06] bg-white/[0.02] flex items-center justify-center hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-200 group">
                <svg className="w-3 h-3 text-white/30 group-hover:text-white/50 transition-colors" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              </a>
              <a href="#" className="w-7 h-7 rounded-lg border border-white/[0.06] bg-white/[0.02] flex items-center justify-center hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-200 group">
                <svg className="w-3 h-3 text-white/30 group-hover:text-white/50 transition-colors" viewBox="0 0 24 24" fill="currentColor"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>
              </a>
            </div>
          </div>
        </div>
        <div className="mt-6 pt-4 border-t border-white/[0.03] flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[10px] text-white/20 font-mono">&copy; {new Date().getFullYear()} Cyber Classes Sirsa. All rights reserved.</p>
          <p className="text-[10px] text-white/15 font-mono">Built with precision &bull; Secure by design</p>
        </div>
      </div>
    </footer>
  );
}