import { useAuth } from '../../contexts/AuthContext';
import { LogOut } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';

export function WaitingRoom() {
  const { user, userData, signOut } = useAuth();
  const blobRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!blobRef.current) return;
      // Viscous, slow easing for an organic feel
      blobRef.current.animate({
        left: `${e.clientX}px`,
        top: `${e.clientY}px`
      }, { duration: 4000, fill: 'forwards', easing: 'cubic-bezier(0.1, 0, 0.1, 1)' });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (userData && userData.role !== 'Pending') {
    return <Navigate to="/" />;
  }

  return (
    <div className="min-h-screen bg-[#070605] flex flex-col justify-center items-center p-6 relative overflow-hidden selection:bg-amber-500 selection:text-black font-sans">
      
      {/* Cinematic Film Grain Overlay */}
      <svg className="pointer-events-none fixed inset-0 z-50 h-full w-full opacity-[0.25] mix-blend-screen isolate">
        <filter id="noiseFilter">
            <feTurbulence 
              type="fractalNoise" 
              baseFrequency="0.75" 
              numOctaves="3" 
              stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#noiseFilter)" />
      </svg>

      {/* Dynamic Cursor Glow (Warm Amber/Rust Artlist Vibe) */}
      <div 
        ref={blobRef}
        className="absolute w-[900px] h-[700px] rounded-[100%] blur-[120px] pointer-events-none z-0 transform -translate-x-1/2 -translate-y-1/2 mix-blend-screen opacity-70"
        style={{ 
          left: '50%', top: '50%',
          background: 'radial-gradient(ellipse at center, rgba(228, 107, 64, 0.45) 0%, rgba(164, 59, 34, 0.25) 40%, transparent 70%)'
        }}
      />
      
      {/* Background static depth glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[800px] h-[800px] bg-red-900/20 rounded-full blur-[150px] pointer-events-none z-0" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[1000px] h-[800px] bg-amber-800/10 rounded-full blur-[150px] pointer-events-none z-0" />

      {/* Content Container */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-lg text-center animate-in fade-in slide-in-from-bottom-12 duration-1000">
        
        {/* Glowing Logo matching Artlist styling */}
        <div className="mb-12 scale-150 transform transition-transform duration-700 hover:scale-[1.55]">
          <img 
            src="/logo.png" 
            alt="WOVN" 
            className="h-10 w-auto object-contain brightness-0 invert opacity-100 mx-auto drop-shadow-[0_0_35px_rgba(255,255,255,0.85)]" 
          />
          <p className="text-[8px] text-white/50 tracking-widest mt-4 font-medium Drop-Shadow-none uppercase">
            Total control over every stage of production.
          </p>
        </div>

        <div className="backdrop-blur-md bg-black/40 border border-white/5 p-10 sm:p-12 rounded-3xl shadow-2xl transition-all duration-500 w-full relative overflow-hidden group">
          
          <h1 className="font-serif text-3xl sm:text-4xl text-white tracking-tight mb-4 drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
            Pending Approval
          </h1>

          <p className="text-[14px] sm:text-[15px] text-neutral-300/90 mb-10 leading-relaxed max-w-md mx-auto font-medium">
            Your secure profile has been created successfully. Please wait while our team assigns your permissions and readies your portal.
          </p>

          <button 
            onClick={() => signOut()}
            className="flex items-center justify-center gap-2 w-[60%] mx-auto py-3 rounded-full bg-gradient-to-b from-white/95 to-white/70 text-black shadow-[0_0_20px_rgba(255,255,255,0.3)] text-xs font-bold uppercase tracking-wider hover:scale-105 active:scale-95 hover:shadow-[0_0_30px_rgba(255,255,255,0.5)] transition-all duration-300"
          >
            <LogOut size={14} className="text-black/80" />
            Sign Out
          </button>
        </div>
      </div>
      
      <p className="absolute bottom-6 text-[9px] uppercase tracking-[0.2em] text-neutral-500/40 z-10 font-bold">
        &copy; {new Date().getFullYear()} Print Shop OS &bull; Studio
      </p>
    </div>
  );
}
