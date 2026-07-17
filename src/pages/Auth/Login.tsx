import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export function Login() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, sendPasswordReset, user, userData, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'signIn' | 'signUp' | 'forgotPassword'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        const from = (location.state as any)?.from;
        const destination = from ? (from.pathname + from.search + from.hash) : '/';
        navigate(destination, { replace: true });
      }
    }
  }, [user, userData, navigate, location.state]);

  useEffect(() => {
    if (!authLoading && !user && isLoading) {
      setIsLoading(false);
    }
  }, [user, authLoading, isLoading]);

  const handleGoogleSignIn = () => {
    setError(null);
    setMessage(null);
    setIsLoading(true);
    signInWithGoogle()
      .catch((err) => {
        console.error(err);
        setError('Failed to sign in with Google. Please try again.');
        setIsLoading(false);
      });
  };

  const handleEmailAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Email is required.');
      return;
    }
    setError(null);
    setMessage(null);
    setIsLoading(true);

    if (authMode === 'forgotPassword') {
      sendPasswordReset(email)
        .then(() => {
          setMessage('A password reset link has been sent to your email.');
          setIsLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setError(err.message || 'Failed to send password reset email.');
          setIsLoading(false);
        });
      return;
    }

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters long.');
      setIsLoading(false);
      return;
    }

    if (authMode === 'signUp') {
      signUpWithEmail(email, password)
        .catch((err) => {
          console.error(err);
          setError(err.message || 'Failed to register. Please try again.');
          setIsLoading(false);
        });
    } else {
      signInWithEmail(email, password)
        .catch((err) => {
          console.error(err);
          if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
            setError('Invalid email or password.');
          } else {
            setError(err.message || 'Failed to sign in. Please try again.');
          }
          setIsLoading(false);
        });
    }
  };

  return (
    <div className="min-h-screen bg-[#070605] flex flex-col justify-center items-center p-6 relative overflow-hidden selection:bg-amber-500 selection:text-black font-sans">
      
      {/* Cinematic Film Grain Overlay */}
      <svg className="pointer-events-none fixed inset-0 z-50 h-full w-full opacity-[0.25] mix-blend-screen isolate hidden md:block">
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
        className="absolute w-[900px] h-[700px] rounded-[100%] blur-[120px] pointer-events-none z-0 transform -translate-x-1/2 -translate-y-1/2 mix-blend-screen opacity-70 hidden md:block"
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
            {authMode === 'signIn' ? 'Welcome' : authMode === 'signUp' ? 'Create Account' : 'Reset Password'}
          </h1>
          <p className="text-[14px] sm:text-[15px] text-neutral-300/90 mb-6 leading-relaxed max-w-sm mx-auto font-medium">
            {authMode === 'signIn' 
              ? 'Authenticate to securely access your bespoke production workspace.' 
              : authMode === 'signUp' 
                ? 'Create a credential to access your bespoke production workspace.' 
                : 'Enter your email address to receive a password reset link.'}
          </p>

          {error && (
            <div className="mb-6 p-4 bg-red-950/30 border border-red-900/50 rounded-xl text-red-500 text-sm text-center font-medium backdrop-blur-sm">
              {error}
            </div>
          )}

          {message && (
            <div className="mb-6 p-4 bg-emerald-950/30 border border-emerald-900/50 rounded-xl text-emerald-400 text-sm text-center font-medium backdrop-blur-sm">
              {message}
            </div>
          )}

          <form onSubmit={handleEmailAuthSubmit} className="space-y-4 text-left w-full">
            <div>
              <label className="block text-[11px] uppercase tracking-wider font-bold text-neutral-400 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all duration-200"
                placeholder="you@example.com"
                disabled={isLoading}
              />
            </div>

            {authMode !== 'forgotPassword' && (
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-[11px] uppercase tracking-wider font-bold text-neutral-400">
                    Password
                  </label>
                  {authMode === 'signIn' && (
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('forgotPassword');
                        setError(null);
                        setMessage(null);
                      }}
                      className="text-xs text-amber-500/80 hover:text-amber-400 transition-colors font-medium"
                    >
                      Forgot Password?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all duration-200"
                  placeholder="••••••••"
                  disabled={isLoading}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center justify-center gap-2 w-full py-4 rounded-xl bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold shadow-[0_0_20px_rgba(245,158,11,0.2)] hover:shadow-[0_0_30px_rgba(245,158,11,0.3)] transition-all duration-300 disabled:opacity-50 active:scale-95"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={18} />
              ) : authMode === 'signIn' ? (
                'Sign In'
              ) : authMode === 'signUp' ? (
                'Create Account'
              ) : (
                'Send Reset Link'
              )}
            </button>
          </form>

          <div className="relative my-6 w-full flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10"></div>
            </div>
            <span className="relative px-3 bg-neutral-900 text-[11px] uppercase tracking-widest text-neutral-500 font-semibold">
              or
            </span>
          </div>

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

          <div className="mt-8 pt-6 border-t border-white/5 flex flex-col items-center gap-3 text-sm">
            {authMode === 'signIn' && (
              <p className="text-neutral-400 text-xs">
                Don't have an account?{' '}
                <button
                  onClick={() => {
                    setAuthMode('signUp');
                    setError(null);
                    setMessage(null);
                  }}
                  className="text-white hover:text-amber-400 font-semibold underline transition-colors"
                >
                  Sign Up
                </button>
              </p>
            )}
            {authMode === 'signUp' && (
              <p className="text-neutral-400 text-xs">
                Already have an account?{' '}
                <button
                  onClick={() => {
                    setAuthMode('signIn');
                    setError(null);
                    setMessage(null);
                  }}
                  className="text-white hover:text-amber-400 font-semibold underline transition-colors"
                >
                  Sign In
                </button>
              </p>
            )}
            {authMode === 'forgotPassword' && (
              <button
                onClick={() => {
                  setAuthMode('signIn');
                  setError(null);
                  setMessage(null);
                }}
                className="text-white hover:text-amber-400 font-semibold underline text-xs transition-colors"
              >
                Back to Sign In
              </button>
            )}
          </div>
        </div>
      </div>
      
      <p className="absolute bottom-6 text-[9px] uppercase tracking-[0.2em] text-neutral-500/40 z-10 font-bold">
        &copy; {new Date().getFullYear()} Print Shop OS &bull; Studio
      </p>
    </div>
  );
}
