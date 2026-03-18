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
      // Use animate for a smooth trailing effect
      blobRef.current.animate({
        left: `${e.clientX}px`,
        top: `${e.clientY}px`
      }, { duration: 3000, fill: 'forwards' });
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
    <div className="min-h-screen bg-[#050505] flex flex-col justify-center items-center p-6 relative overflow-hidden selection:bg-white selection:text-black font-sans">
      
      {/* Background Grid Pattern */}
      <div 
        className="absolute inset-0 z-0 opacity-[0.03]" 
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }}
      ></div>

      {/* Dynamic Cursor Glow (The Blob) */}
      <div 
        ref={blobRef}
        className="absolute w-[800px] h-[800px] bg-brand-primary/20 rounded-full blur-[120px] pointer-events-none z-0 transform -translate-x-1/2 -translate-y-1/2 mix-blend-screen"
        style={{ left: '50%', top: '50%' }}
      />
      
      {/* Secondary ambient glow */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none z-0" />

      {/* Content Container */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-lg text-center animate-in fade-in slide-in-from-bottom-8 duration-1000">
        
        {/* Large Centered Logo */}
        <div className="mb-14">
          <img 
            src="/logo.png" 
            alt="WOVN" 
            className="h-14 w-auto object-contain brightness-0 invert opacity-95 mx-auto" 
          />
        </div>

        <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/10 p-10 sm:p-12 rounded-3xl shadow-2xl transition-all duration-500 hover:bg-white/[0.04] hover:border-white/20 group w-full relative overflow-hidden">
          
          {/* Subtle inside shine */}
          <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>

          <h1 className="font-serif text-3xl sm:text-4xl text-white tracking-tight mb-4 drop-shadow-sm">
            Pending Approval
          </h1>

          <p className="text-[15px] sm:text-base text-neutral-400 mb-10 leading-relaxed max-w-md mx-auto font-medium">
            Your secure profile has been created successfully. Please wait while our team assigns your permissions and readies your portal.
          </p>

          <button 
            onClick={() => signOut()}
            className="flex items-center justify-center gap-3 w-full py-4 rounded-xl bg-white/10 border border-white/5 text-white text-sm font-semibold hover:bg-white hover:text-black transition-all duration-300 active:scale-[0.98]"
          >
            <LogOut size={16} />
            Sign Out Securely
          </button>
        </div>
      </div>
      
      <p className="absolute bottom-6 text-[11px] uppercase tracking-widest text-neutral-600 z-10 font-bold">
        &copy; {new Date().getFullYear()} Print Shop OS &bull; Secure Access
      </p>
    </div>
  );
}
