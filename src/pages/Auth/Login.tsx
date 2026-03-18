import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export function Login() {
  const { signInWithGoogle, user, userData, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blobRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!blobRef.current) return;
      blobRef.current.animate({
        left: `${e.clientX}px`,
        top: `${e.clientY}px`
      }, { duration: 4000, fill: 'forwards', easing: 'cubic-bezier(0.1, 0, 0.1, 1)' });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    if (user && userData) {
      if (userData.role === 'Client') {
        navigate(`/portal/${userData.customerId || ''}`);
      } else if (userData.role === 'Pending') {
        navigate('/waiting');
      } else {
        navigate('/');
      }
    }
  }, [user, userData, navigate]);

  useEffect(() => {
    if (!authLoading && !user && isLoading) {
      setIsLoading(false);
    }
  }, [user, authLoading, isLoading]);

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await signInWithGoogle();
      // Do not navigate here, the useEffect will handle it when userData populates
    } catch (err) {
      setError('Failed to sign in. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070605] flex flex-col justify-center items-center p-6 relative overflow-hidden selection:bg-amber-500 selection:text-black font-sans">
      
      {/* Cinematic Film Grain Overlay */}
      <svg className="pointer-events-none fixed inset-0 z-50 h-full w-full opacity-[0.25] mix-blend-screen isolate">
        <filter id="noiseFilterLogin">
            <feTurbulence 
              type="fractalNoise" 
              baseFrequency="0.75" 
              numOctaves="3" 
              stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#noiseFilterLogin)" />
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

      <div className="relative z-10 flex flex-col items-center w-full max-w-md text-center animate-in fade-in slide-in-from-bottom-12 duration-1000">
        
        {/* Glowing Logo */}
        <div className="mb-14 scale-150 transform transition-transform duration-700 hover:scale-[1.55]">
          <img 
            src="/logo.png" 
            alt="WOVN" 
            className="h-10 w-auto object-contain brightness-0 invert opacity-100 mx-auto drop-shadow-[0_0_35px_rgba(255,255,255,0.85)]" 
          />
        </div>

        <div className="backdrop-blur-md bg-black/40 border border-white/5 p-10 sm:p-12 rounded-3xl shadow-2xl transition-all duration-500 w-full relative overflow-hidden group">
          
          <h1 className="font-serif text-3xl sm:text-4xl text-white tracking-tight mb-3 drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
            Welcome
          </h1>
          <p className="text-[14px] sm:text-[15px] text-neutral-300/90 mb-10 leading-relaxed max-w-sm mx-auto font-medium">
            Authenticate to securely access your bespoke production workspace.
          </p>

          {error && (
            <div className="mb-8 p-4 bg-red-950/30 border border-red-900/50 rounded-xl text-red-500 text-sm text-center font-medium backdrop-blur-sm">
              {error}
            </div>
          )}

          <button 
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="flex items-center justify-center gap-3 w-full py-4 rounded-xl bg-white/10 border border-white/10 text-white font-semibold hover:bg-white hover:text-black transition-all duration-300 disabled:opacity-50 group-hover:border-white/20 active:scale-95"
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 15.02 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                <path d="M1 1h22v22H1z" fill="none" />
              </svg>
            )}
            Continue Using Google
          </button>
        </div>
      </div>
      
      <p className="absolute bottom-6 text-[9px] uppercase tracking-[0.2em] text-neutral-500/40 z-10 font-bold">
        &copy; {new Date().getFullYear()} Print Shop OS &bull; Studio
      </p>
    </div>
  );
}
