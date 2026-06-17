import { Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { Search, Info, HelpCircle, User, Settings, LogOut, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useState, useEffect } from 'react';
import { PortalHelpDrawer } from '../Portal/PortalHelpDrawer';
import { PortalTourOverlay } from '../Portal/PortalTourOverlay';
import { db } from '../../lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

export function PortalLayout() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, userData } = useAuth();
  
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [activeTour, setActiveTour] = useState('');
  const [tourStep, setTourStep] = useState(0);

  const [customer, setCustomer] = useState<any>(null);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  
  // Settings Form States
  const [editContactName, setEditContactName] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editStreet, setEditStreet] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editState, setEditState] = useState('');
  const [editZip, setEditZip] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!customerId) return;
    const fetchCustomer = async () => {
      try {
        const d = await getDoc(doc(db, 'customers', customerId));
        if (d.exists()) {
          setCustomer(d.data());
        }
      } catch (err) {
        console.error("Error fetching customer in PortalLayout:", err);
      }
    };
    fetchCustomer();
  }, [customerId]);

  useEffect(() => {
    if (customer) {
      setEditContactName(customer.contactName || '');
      setEditCompany(customer.company || customer.name || '');
      setEditEmail(customer.email || '');
      setEditPhone(customer.phone || '');
      setEditStreet(customer.shippingStreet || '');
      setEditCity(customer.shippingCity || '');
      setEditState(customer.shippingState || '');
      setEditZip(customer.shippingZip || '');
    }
  }, [customer, isProfileModalOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isProfileDropdownOpen && !(event.target as Element).closest('.profile-dropdown-container')) {
        setIsProfileDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isProfileDropdownOpen]);

  const handleSaveProfile = async () => {
    if (!customerId) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'customers', customerId), {
        contactName: editContactName,
        company: editCompany,
        email: editEmail,
        phone: editPhone,
        shippingStreet: editStreet,
        shippingCity: editCity,
        shippingState: editState,
        shippingZip: editZip,
      });
      setCustomer((prev: any) => ({
        ...prev,
        contactName: editContactName,
        company: editCompany,
        email: editEmail,
        phone: editPhone,
        shippingStreet: editStreet,
        shippingCity: editCity,
        shippingState: editState,
        shippingZip: editZip,
      }));
      setIsProfileModalOpen(false);
      alert("Settings saved successfully!");
    } catch (err) {
      console.error("Error saving customer profile:", err);
      alert("Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

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
            onClick={() => navigate('/start')}
            className="border border-black/20 text-black px-5 py-2.5 rounded-full text-xs font-bold tracking-wide hover:border-black hover:bg-black/5 hover:scale-105 active:scale-95 transition-all shadow-[0_2px_8px_0_rgb(0,0,0,0.02)]"
          >
            Main Page
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

          {/* Profile Dropdown */}
          <div className="relative profile-dropdown-container">
            <button 
              onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
              className="w-10 h-10 rounded-full border border-black/20 overflow-hidden bg-neutral-100 flex items-center justify-center cursor-pointer hover:border-black hover:scale-105 active:scale-95 transition-all shadow-[0_2px_8px_0_rgb(0,0,0,0.02)] shrink-0"
              title="Account & Settings"
            >
              {customer?.logo ? (
                <img src={customer.logo} alt="Profile" className="w-full h-full object-cover mix-blend-multiply p-0.5" />
              ) : (
                <span className="text-xs font-bold text-neutral-600">
                  {customer?.company?.substring(0, 2).toUpperCase() || customer?.name?.substring(0, 2).toUpperCase() || 'U'}
                </span>
              )}
            </button>

            {isProfileDropdownOpen && (
              <div className="absolute right-0 mt-2.5 w-64 bg-white border border-neutral-150 rounded-2xl shadow-xl py-3 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="px-4 py-2 border-b border-neutral-100 mb-2">
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest leading-none mb-1">Signed in as</p>
                  <p className="text-sm font-bold text-neutral-800 truncate leading-snug">{customer?.company || customer?.contactName || userData?.name || 'Customer'}</p>
                  <p className="text-xs text-neutral-500 truncate leading-none mt-1">{customer?.email || userData?.email || ''}</p>
                </div>
                
                <button
                  onClick={() => {
                    setIsProfileDropdownOpen(false);
                    setIsProfileModalOpen(true);
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-neutral-700 hover:bg-neutral-50 hover:text-black flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Settings size={14} />
                  Account Settings
                </button>

                <button
                  onClick={async () => {
                    setIsProfileDropdownOpen(false);
                    await signOut();
                    navigate('/login');
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors border-t border-neutral-50 mt-1 cursor-pointer"
                >
                  <LogOut size={14} />
                  Log Out
                </button>
              </div>
            )}
          </div>
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

      {/* Account Settings Modal */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] border border-neutral-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-8 pt-8 pb-4 flex justify-between items-center border-b border-neutral-100">
              <div>
                <h2 className="text-2xl font-serif text-neutral-900 tracking-tight flex items-center gap-2">
                  <User className="text-black" size={22} />
                  Account Settings
                </h2>
                <p className="text-xs text-neutral-400 font-semibold uppercase tracking-wider mt-1">Customize your customer profile</p>
              </div>
              <button 
                onClick={() => setIsProfileModalOpen(false)}
                className="w-10 h-10 rounded-full border border-black/10 hover:border-black flex items-center justify-center hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body / Form */}
            <div className="p-8 max-h-[70vh] overflow-y-auto flex flex-col gap-6">
              {/* Basic Info */}
              <div className="flex flex-col gap-4">
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest border-b border-neutral-50 pb-1">Basic Information</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase font-bold text-neutral-500 pl-1">Primary Contact Name</label>
                    <input 
                      type="text"
                      value={editContactName}
                      onChange={(e) => setEditContactName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-400 focus:bg-white transition-all"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase font-bold text-neutral-500 pl-1">Company Name</label>
                    <input 
                      type="text"
                      value={editCompany}
                      onChange={(e) => setEditCompany(e.target.value)}
                      placeholder="e.g. Acme Corp"
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-400 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase font-bold text-neutral-500 pl-1">Email Address</label>
                    <input 
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="e.g. john@example.com"
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-400 focus:bg-white transition-all"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase font-bold text-neutral-500 pl-1">Phone Number</label>
                    <input 
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="e.g. (555) 555-5555"
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-400 focus:bg-white transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Shipping Address */}
              <div className="flex flex-col gap-4">
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest border-b border-neutral-50 pb-1">Shipping Address</h3>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold text-neutral-500 pl-1">Street Address</label>
                  <input 
                    type="text"
                    value={editStreet}
                    onChange={(e) => setEditStreet(e.target.value)}
                    placeholder="e.g. 123 Main St"
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-400 focus:bg-white transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1.5 sm:col-span-1.5">
                    <label className="text-[10px] uppercase font-bold text-neutral-500 pl-1">City</label>
                    <input 
                      type="text"
                      value={editCity}
                      onChange={(e) => setEditCity(e.target.value)}
                      placeholder="e.g. Austin"
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-400 focus:bg-white transition-all"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase font-bold text-neutral-500 pl-1">State</label>
                    <input 
                      type="text"
                      value={editState}
                      onChange={(e) => setEditState(e.target.value)}
                      placeholder="e.g. TX"
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-400 focus:bg-white transition-all"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase font-bold text-neutral-500 pl-1">Zip Code</label>
                    <input 
                      type="text"
                      value={editZip}
                      onChange={(e) => setEditZip(e.target.value)}
                      placeholder="e.g. 78701"
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-400 focus:bg-white transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-8 py-6 bg-neutral-50 border-t border-neutral-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(false)}
                className="px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-neutral-500 hover:bg-neutral-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={isSaving}
                className="px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider bg-black text-white hover:bg-neutral-800 transition-all flex items-center gap-1.5 shadow-md cursor-pointer disabled:bg-neutral-300 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
