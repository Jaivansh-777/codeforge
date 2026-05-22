'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function SplineRobot() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const initRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || initRef.current) return;
    initRef.current = true;

    const scriptId = 'spline-viewer-script';

    const initSpline = () => {
      if (!containerRef.current) return;
      const viewer = document.createElement('spline-viewer');
      viewer.setAttribute('url', 'https://prod.spline.design/m9j3JJ9JbW9ddMBy/scene.splinecode');
      viewer.setAttribute('loading-anim-type', 'none');
      viewer.style.width = '100%';
      viewer.style.height = '100%';
      viewer.style.border = 'none';
      viewer.style.background = 'transparent';
      viewer.style.outline = 'none';

      const onLoad = () => {
        setLoaded(true);
        viewer.removeEventListener('load', onLoad);
      };
      viewer.addEventListener('load', onLoad);

      const fallback = setTimeout(() => {
        if (!loaded) setLoaded(true);
      }, 10000);

      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(viewer);

      return () => {
        clearTimeout(fallback);
        viewer.removeEventListener('load', onLoad);
      };
    };

    const startSpline = () => {
      if (customElements.get('spline-viewer')) {
        initSpline();
      } else {
        const script = document.createElement('script');
        script.id = scriptId;
        script.type = 'module';
        script.src = 'https://unpkg.com/@splinetool/viewer@1.12.94/build/spline-viewer.js';
        script.onload = () => setTimeout(initSpline, 150);
        script.onerror = () => { setError(true); setLoaded(true); };
        document.body.appendChild(script);
      }
    };

    if (document.querySelector(`script#${scriptId}`)) {
      startSpline();
    } else {
      startSpline();
    }
  }, [loaded]);

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Orbital rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(80vw,420px)] h-[min(80vw,420px)] rounded-full border border-white/[0.04] animate-orbit" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(58vw,320px)] h-[min(58vw,320px)] rounded-full border border-dashed border-white/[0.025] animate-orbit-reverse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(70vw,370px)] h-[min(70vw,370px)] rounded-full border border-white/[0.02] animate-orbit" style={{ animationDuration: '25s' }} />
      </div>

      {/* Orbital dots */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 hidden sm:block">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(80vw,420px)] h-[min(80vw,420px)] animate-orbit">
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * 360;
            const rad = (angle * Math.PI) / 180;
            const r = 210;
            const x = Math.cos(rad) * r;
            const y = Math.sin(rad) * r;
            return (
              <div
                key={i}
                className="absolute w-1 h-1 bg-white/50 rounded-full shadow-[0_0_4px_rgba(255,255,255,0.2)]"
                style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, opacity: 0.15 + Math.random() * 0.4 }}
              />
            );
          })}
        </div>
      </div>

      {/* Glowing sphere behind robot */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(40vw,220px)] h-[min(40vw,220px)] rounded-full bg-gradient-to-br from-cyan-400/5 via-indigo-400/5 to-purple-400/5 blur-[80px] animate-pulse pointer-events-none z-0" />

      {/* Loading skeleton */}
      {!loaded && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-30">
          <div className="w-14 h-14 rounded-xl border border-white/[0.06] bg-white/[0.02] flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-white/40 animate-spin" />
          </div>
          <span className="text-xs text-white/30 font-mono tracking-wider uppercase">Loading 3D scene</span>
        </div>
      )}

      {/* Error fallback */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-30">
          <div className="text-center">
            <div className="w-14 h-14 mx-auto mb-3 rounded-xl border border-white/[0.06] bg-white/[0.02] flex items-center justify-center">
              <svg className="w-5 h-5 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <p className="text-xs text-white/30">3D viewer unavailable</p>
          </div>
        </div>
      )}

      {/* Spline container */}
      <div className="absolute inset-0 overflow-hidden rounded-2xl z-10" style={{ clipPath: 'inset(0 0 6px 0)' }}>
        <div
          className="absolute inset-x-0 bottom-0 h-14 z-20 pointer-events-none"
          style={{
            background: 'linear-gradient(to top, #050505 0%, #050505 30%, transparent 100%)',
          }}
        />
        <div
          className="absolute bottom-0 right-0 w-36 h-12 z-20 pointer-events-none"
          style={{ background: '#050505' }}
        />
        <div
          ref={containerRef}
          className={`w-full h-full transition-opacity duration-1000 scale-[1.3] sm:scale-105 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          style={{ minHeight: '60vh', maxHeight: '680px', position: 'relative', zIndex: 2 }}
        />
      </div>
    </div>
  );
}