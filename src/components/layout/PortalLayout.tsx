import { Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { Search, Info, HelpCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useState, useEffect } from 'react';
import { PortalHelpDrawer } from '../Portal/PortalHelpDrawer';
import { PortalTourOverlay } from '../Portal/PortalTourOverlay';

export function PortalLayout() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, userData } = useAuth();
  
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [activeTour, setActiveTour] = useState('');
  const [tourStep, setTourStep] = useState(0);

  // Sync tour state with local storage to persist across navigations
  useEffect(() => {
    const savedTour = localStorage.getItem('wovn_active_tour') || '';
    const savedStep = parseInt(localStorage.getItem('wovn_tour_step') || '0', 10);
    if (savedTour) {
      setActiveTour(savedTour);
      setTourStep(savedStep);
    }
  }, []);

  const handleStartTour = (tourId: string) => {
    setActiveTour(tourId);
    setTourStep(0);
    localStorage.setItem('wovn_active_tour', tourId);
    localStorage.setItem('wovn_tour_step', '0');
  };

  const handleNextTourStep = () => {
    const nextStep = tourStep + 1;
    setTourStep(nextStep);
    localStorage.setItem('wovn_tour_step', nextStep.toString());
  };

  const handleBackTourStep = () => {
    const prevStep = Math.max(0, tourStep - 1);
    setTourStep(prevStep);
    localStorage.setItem('wovn_tour_step', prevStep.toString());
  };

  const handleExitTour = () => {
    setActiveTour('');
    setTourStep(0);
    localStorage.removeItem('wovn_active_tour');
    localStorage.removeItem('wovn_tour_step');
  };

  const handleCreateOrder = () => {
    navigate(customerId ? `/portal/${customerId}/create` : '/portal');
  };

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white">
      {/* Admin Impersonation Banner */}
      {customerId && userData?.role !== 'Client' && (
        <div className="bg-amber-300 text-amber-900 px-6 py-2 text-[13px] font-bold flex items-center justify-center gap-3 uppercase tracking-wider">
          <Info size={16} />
          Admin View: You are currently viewing the portal as Customer {customerId}
        </div>
      )}

      {/* Top Header */}
      <header className="flex items-center justify-between px-10 py-6 bg-white border-b border-black/5">
        <div className="flex items-center">
          {/* Main Logo */}
          <img src="/logo.png" alt="WOVN" className="h-8" />
        </div>

        {/* Center Search Pill */}
        <div className="flex-1 flex justify-center px-12">
          <div className="relative w-full max-w-2xl group">
            <input 
              type="text" 
              placeholder="Search" 
              className="w-full pl-6 pr-10 py-3 bg-white border border-gray-200 rounded-full text-sm font-medium focus:outline-none focus:border-gray-300 focus:shadow-sm transition-all placeholder:text-gray-400"
            />
            <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-gray-600 transition-colors" size={18} strokeWidth={2.5} />
          </div>
        </div>

        {/* Right Nav Options */}
        <div className="flex items-center gap-6">
          <div className="flex flex-col gap-1.5 cursor-pointer group">
            <div className="w-5 h-0.5 bg-black rounded-full group-hover:bg-gray-600 transition-colors"></div>
            <div className="w-5 h-0.5 bg-black rounded-full group-hover:bg-gray-600 transition-colors"></div>
            <div className="w-3 h-0.5 bg-black rounded-full group-hover:bg-gray-600 transition-colors"></div>
          </div>
          
          <button 
            data-tour="orders-tab"
            onClick={() => navigate(customerId ? `/portal/${customerId}` : '/portal')}
            className={`text-[13px] font-semibold tracking-wide pb-0.5 border-b-2 transition-all ${
              location.pathname.startsWith('/portal') && !location.pathname.endsWith('/create') && !location.pathname.endsWith('/quote') && !location.pathname.endsWith('/vault')
                ? 'text-black border-black'
                : 'text-gray-400 border-transparent hover:text-black hover:border-black'
            }`}
          >
            Orders
          </button>

          <button 
            data-tour="vault-tab"
            onClick={() => navigate(customerId ? `/portal/${customerId}/vault` : '/portal/vault')}
            className={`text-[13px] font-semibold tracking-wide pb-0.5 border-b-2 transition-all ${
              location.pathname.endsWith('/vault')
                ? 'text-black border-black'
                : 'text-gray-400 border-transparent hover:text-black hover:border-black'
            }`}
          >
            Asset Vault
          </button>
          
          <button 
            onClick={async () => {
              await signOut();
              navigate('/login');
            }}
            className="text-[13px] font-semibold tracking-wide text-gray-400 hover:text-black transition-colors mr-2"
          >
            Log Out
          </button>
          
          <button 
            onClick={() => navigate('/start')}
            className="border border-black/20 text-black px-5 py-2.5 rounded-full text-xs font-bold tracking-wide hover:border-black hover:bg-black/5 hover:scale-105 active:scale-95 transition-all shadow-[0_2px_8px_0_rgb(0,0,0,0.02)]"
          >
            Design Store
          </button>
          
          <button 
            data-tour="create-order-btn"
            onClick={handleCreateOrder}
            className="bg-black text-white px-5 py-2.5 rounded-full text-xs font-bold tracking-wide hover:bg-black/80 hover:scale-105 active:scale-95 transition-all shadow-[0_4px_14px_0_rgb(0,0,0,0.15)] mr-2"
          >
            Create Order +
          </button>

          <button 
            onClick={() => setIsHelpOpen(true)}
            className="w-10 h-10 rounded-full border border-black/20 text-neutral-500 hover:text-black flex items-center justify-center hover:bg-neutral-50 hover:scale-105 active:scale-95 transition-all shadow-[0_2px_8px_0_rgb(0,0,0,0.02)] cursor-pointer"
            title="Portal Guide & Help Center"
          >
            <HelpCircle size={18} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="py-12 px-10">
        <Outlet />
      </main>

      <PortalHelpDrawer 
        isOpen={isHelpOpen} 
        onClose={() => setIsHelpOpen(false)} 
        onStartTour={handleStartTour}
      />

      {activeTour && (
        <PortalTourOverlay
          activeTour={activeTour}
          stepIndex={tourStep}
          onNext={handleNextTourStep}
          onBack={handleBackTourStep}
          onExit={handleExitTour}
          customerId={customerId || 'CUS-001'}
        />
      )}
    </div>
  );
}
