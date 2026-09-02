import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { RefreshCw, LogOut, Home, ShieldAlert, FileQuestion, AlertTriangle, WifiOff, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { PillButton } from '../../components/ui/PillButton';

export interface ErrorPageProps {
  code?: number | string;
  title?: string;
  message?: string;
  error?: Error | null;
  componentStack?: string;
}

const IS_DEV = import.meta.env.DEV;

export function ErrorPage({
  code: propCode,
  title: propTitle,
  message: propMessage,
  error,
  componentStack,
}: ErrorPageProps) {
  const { code: paramCode } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const [showDevDetails, setShowDevDetails] = useState(false);

  const rawCode = String(propCode || paramCode || '500');
  const codeNum = parseInt(rawCode, 10) || 500;

  const handleLogout = async () => {
    try {
      if (signOut) await signOut();
    } catch (e) {
      // ignore
    } finally {
      window.location.href = '/login';
    }
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  // Get generic customer-friendly copy per error code
  const getErrorInfo = () => {
    switch (codeNum) {
      case 404:
        return {
          icon: <FileQuestion className="w-12 h-12 text-brand-primary" strokeWidth={1.5} />,
          codeLabel: '404',
          title: propTitle || 'Page Not Found',
          message:
            propMessage ||
            "The page or resource you are looking for doesn't exist, was renamed, or has been moved.",
        };
      case 403:
        return {
          icon: <ShieldAlert className="w-12 h-12 text-amber-600" strokeWidth={1.5} />,
          codeLabel: '403',
          title: propTitle || 'Access Restricted',
          message:
            propMessage ||
            'You do not have permission to view this section of the workspace. Please contact your administrator if you need role access.',
        };
      case 503:
        return {
          icon: <WifiOff className="w-12 h-12 text-blue-600" strokeWidth={1.5} />,
          codeLabel: '503',
          title: propTitle || 'Connection Interrupted',
          message:
            propMessage ||
            'We are having trouble communicating with the service. Please verify your network connection and try again.',
        };
      case 500:
      default:
        return {
          icon: <AlertTriangle className="w-12 h-12 text-rose-600" strokeWidth={1.5} />,
          codeLabel: rawCode !== '500' ? rawCode : '500',
          title: propTitle || 'Something Went Wrong',
          message:
            propMessage ||
            "An unexpected application error occurred. We've logged this issue internally and our engineering team has been notified.",
        };
    }
  };

  const info = getErrorInfo();

  return (
    <div className="min-h-screen w-full bg-brand-bg flex flex-col justify-between items-center p-6 sm:p-10 font-sans selection:bg-brand-primary selection:text-white">
      {/* Brand Header */}
      <header className="w-full max-w-4xl flex items-center justify-between py-4 border-b border-brand-border/60">
        <Link to="/" className="flex items-center gap-2 group">
          <span className="font-sans text-2xl font-black tracking-tighter uppercase text-neutral-900 group-hover:opacity-80 transition-opacity">
            INKTHEORY
          </span>
          <span className="h-2 w-2 rounded-full bg-orange-600 inline-block" />
        </Link>
        <span className="text-xs font-mono font-semibold uppercase tracking-widest text-neutral-400">
          Support &amp; Diagnostics
        </span>
      </header>

      {/* Main Customer Error Card */}
      <main className="my-auto w-full max-w-lg bg-white border border-brand-border rounded-2xl p-8 sm:p-10 shadow-xl text-center space-y-6 animate-in fade-in duration-300">
        <div className="mx-auto w-20 h-20 rounded-full bg-neutral-100/80 flex items-center justify-center border border-neutral-200/60 shadow-inner">
          {info.icon}
        </div>

        <div className="space-y-2">
          <span className="inline-block px-3 py-1 bg-neutral-100 text-neutral-600 text-xs font-mono font-bold uppercase tracking-wider rounded-full">
            Error {info.codeLabel}
          </span>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-neutral-950 tracking-tight">
            {info.title}
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 font-sans leading-relaxed pt-1">
            {info.message}
          </p>
        </div>

        {/* Customer Action Recovery Controls */}
        <div className="pt-4 border-t border-neutral-100 flex flex-col sm:flex-row items-center justify-center gap-3">
          <PillButton
            variant="filled"
            onClick={handleRefresh}
            className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold gap-2 justify-center"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh Page</span>
          </PillButton>

          {user && (
            <PillButton
              variant="outline"
              onClick={handleLogout}
              className="w-full sm:w-auto px-5 py-2.5 text-xs font-semibold gap-2 justify-center border-neutral-300 hover:border-neutral-400"
            >
              <LogOut className="w-4 h-4 text-neutral-600" />
              <span>Log Out &amp; Back In</span>
            </PillButton>
          )}

          <PillButton
            variant="outline"
            onClick={() => navigate('/dashboard')}
            className="w-full sm:w-auto px-5 py-2.5 text-xs font-semibold gap-2 justify-center border-neutral-300 hover:border-neutral-400"
          >
            <Home className="w-4 h-4 text-neutral-600" />
            <span>Go to Dashboard</span>
          </PillButton>
        </div>

        {/* DEV ONLY Developer Diagnostics Drawer */}
        {IS_DEV && (error || componentStack) && (
          <div className="pt-4 border-t border-amber-200/80 text-left">
            <button
              type="button"
              onClick={() => setShowDevDetails(prev => !prev)}
              className="w-full flex items-center justify-between text-[11px] font-mono font-bold uppercase tracking-wider text-amber-700 bg-amber-50 hover:bg-amber-100/80 px-3 py-2 rounded-lg border border-amber-200 transition-colors"
            >
              <span>Developer Debug Output (DEV Mode Only)</span>
              {showDevDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showDevDetails && (
              <div className="mt-3 p-3 bg-neutral-900 text-neutral-100 text-[11px] font-mono rounded-lg space-y-2 overflow-x-auto max-h-60 border border-neutral-800">
                {error?.message && (
                  <div>
                    <span className="text-rose-400 font-bold">Message:</span> {error.message}
                  </div>
                )}
                {error?.stack && (
                  <div>
                    <span className="text-amber-400 font-bold">Stack Trace:</span>
                    <pre className="whitespace-pre-wrap text-[10px] text-neutral-300 mt-1">{error.stack}</pre>
                  </div>
                )}
                {componentStack && (
                  <div>
                    <span className="text-blue-400 font-bold">Component Stack:</span>
                    <pre className="whitespace-pre-wrap text-[10px] text-neutral-300 mt-1">{componentStack}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full max-w-4xl text-center py-4 border-t border-brand-border/40 text-[11px] text-neutral-400 font-sans">
        &copy; {new Date().getFullYear()} INKTHEORY. All rights reserved. &middot; Powered by INKTHEORY Production OS
      </footer>
    </div>
  );
}
