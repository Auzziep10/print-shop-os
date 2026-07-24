import { Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { Search, Info, HelpCircle, User, Settings, LogOut, X, ShoppingBag, MapPin, Upload, Trash2, Image, Check, MessageSquare, Send, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useState, useEffect, useRef } from 'react';
import { PortalHelpDrawer } from '../Portal/PortalHelpDrawer';
import { PortalTourOverlay } from '../Portal/PortalTourOverlay';
import { db, storage } from '../../lib/firebase';
import { doc, updateDoc, onSnapshot, collection, addDoc, query, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export function PortalLayout() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, userData, user, loading } = useAuth();

  // Authentication and authorization redirection guard
  useEffect(() => {
    if (loading) return;

    // 1. If not authenticated, redirect to login
    if (!user) {
      navigate('/login', { state: { from: location }, replace: true });
      return;
    }

    // 2. If client, enforce they only access their own customer ID
    if (userData?.role === 'Client') {
      const clientCustId = userData.customerId;
      if (!clientCustId) {
        navigate('/login', { replace: true });
        return;
      }

      if (customerId !== clientCustId) {
        let subPath = '';
        if (location.pathname.endsWith('/vault')) subPath = '/vault';
        else if (location.pathname.endsWith('/roster')) subPath = '/roster';
        else if (location.pathname.endsWith('/quote')) subPath = '/quote';
        else if (location.pathname.endsWith('/create')) subPath = '/create';

        navigate(`/portal/${clientCustId}${subPath}`, { replace: true });
      }
    } else {
      // 3. Admin/Staff view: redirect to main dashboard if they enter /portal directly without CUS ID
      if (!customerId) {
        navigate('/', { replace: true });
      }
    }
  }, [loading, user, userData, customerId, location.pathname, navigate]);
  
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [activeTour, setActiveTour] = useState('');
  const [tourStep, setTourStep] = useState(0);

  const [customer, setCustomer] = useState<any>(null);
  const [isLoadingCustomer, setIsLoadingCustomer] = useState(true);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [isJiggling, setIsJiggling] = useState(false);

  useEffect(() => {
    if (!customerId) {
      setCartCount(0);
      return;
    }
    const updateCount = () => {
      const cartKey = `wovn_reorder_cart_${customerId}`;
      try {
        const cart = JSON.parse(localStorage.getItem(cartKey) || '[]');
        setCartCount(cart.length);
        setIsJiggling(true);
        setTimeout(() => setIsJiggling(false), 600);
      } catch (e) {
        setCartCount(0);
      }
    };
    updateCount();
    window.addEventListener('wovn_cart_updated', updateCount);
    return () => {
      window.removeEventListener('wovn_cart_updated', updateCount);
    };
  }, [customerId]);
  
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

  // Logo Settings States
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string>('');
  const [shouldDeleteLogo, setShouldDeleteLogo] = useState(false);

  // Address Prompt States
  const [isAddressPromptOpen, setIsAddressPromptOpen] = useState(false);
  const [promptStreet, setPromptStreet] = useState('');
  const [promptCity, setPromptCity] = useState('');
  const [promptState, setPromptState] = useState('');
  const [promptZip, setPromptZip] = useState('');
  const [isSavingPromptAddress, setIsSavingPromptAddress] = useState(false);
  const [isSavedPromptAddress, setIsSavedPromptAddress] = useState(false);

  // Support Chat states
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [newMessageText, setNewMessageText] = useState('');
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Listen to support chat messages in real time
  useEffect(() => {
    if (!customerId) return;

    const msgsRef = collection(db, 'customers', customerId || '', 'chat_messages');
    const q = query(msgsRef, orderBy('timestamp', 'asc'));

    const unsub = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setChatMessages(msgs);

      // Count unread messages from admins/staff
      const unread = msgs.filter((m: any) => m.senderRole !== 'Client' && !m.read).length;
      setUnreadChatCount(unread);
    }, (err) => {
      console.error("Error listening to support chat messages:", err);
    });

    return () => unsub();
  }, [customerId]);

  // Mark admin/staff messages as read when the chat panel is open
  useEffect(() => {
    if (isChatOpen && customerId && chatMessages.length > 0) {
      const unreadMsgs = chatMessages.filter(
        (m: any) => m.senderRole !== 'Client' && !m.read
      );

      if (unreadMsgs.length > 0) {
        unreadMsgs.forEach(async (m) => {
          try {
            const msgRef = doc(db, 'customers', customerId, 'chat_messages', m.id);
            await updateDoc(msgRef, { read: true });
          } catch (err) {
            console.error("Failed to mark message as read:", err);
          }
        });
      }
    }
  }, [isChatOpen, chatMessages, customerId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (isChatOpen && chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages, isChatOpen]);

  // Presence system to track online status
  useEffect(() => {
    if (!customerId) return;

    const docRef = doc(db, 'customers', customerId);

    const setOnline = async () => {
      try {
        await updateDoc(docRef, {
          isOnline: true,
          lastActiveAt: new Date().toISOString()
        });
      } catch (err) {
        console.error("Failed to update presence to online:", err);
      }
    };

    const setOffline = async () => {
      try {
        await updateDoc(docRef, {
          isOnline: false,
          lastActiveAt: new Date().toISOString()
        });
      } catch (err) {
        console.error("Failed to update presence to offline:", err);
      }
    };

    // Initialize online status
    setOnline();

    // Heartbeat to keep status active (every 30 seconds)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        setOnline();
      }
    }, 30000);

    // Track tab visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setOnline();
      } else {
        setOffline();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Track tab closes/navigation
    window.addEventListener('beforeunload', setOffline);

    // Cleanup on unmount
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', setOffline);
      setOffline();
    };
  }, [customerId]);

  const [isUploadingChatImage, setIsUploadingChatImage] = useState(false);

  const uploadAndSendImage = async (file: File) => {
    setIsUploadingChatImage(true);
    try {
      const storageRef = ref(storage, `customers/${customerId}/chat_attachments/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      const msgsRef = collection(db, 'customers', customerId || '', 'chat_messages');
      await addDoc(msgsRef, {
        text: '',
        imageUrl: downloadUrl,
        senderId: customerId,
        senderName: customer?.contactName || customer?.company || 'Client',
        senderRole: 'Client',
        timestamp: new Date().toISOString(),
        read: false
      });

      // Update parent customer document to trigger admin notification
      const customerDocRef = doc(db, 'customers', customerId || '');
      await updateDoc(customerDocRef, {
        hasUnreadSupport: true,
        lastSupportMessageText: '📷 Sent an image attachment',
        lastSupportMessageSenderName: customer?.contactName || customer?.company || 'Client',
        lastSupportMessageTimestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error("Failed to upload/send chat image:", err);
      alert("Failed to send image attachment.");
    } finally {
      setIsUploadingChatImage(false);
    }
  };

  const handleChatImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !customerId) return;
    await uploadAndSendImage(file);
  };

  const handleChatPaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          await uploadAndSendImage(file);
        }
      }
    }
  };

  const handleSendChatMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMessageText.trim() || !customerId) return;

    const textToSend = newMessageText.trim();
    setNewMessageText('');

    try {
      const msgsRef = collection(db, 'customers', customerId || '', 'chat_messages');
      await addDoc(msgsRef, {
        text: textToSend,
        senderId: customerId,
        senderName: customer?.contactName || customer?.company || 'Client',
        senderRole: 'Client',
        timestamp: new Date().toISOString(),
        read: false
      });

      // Update parent customer document to trigger admin notification
      const customerDocRef = doc(db, 'customers', customerId || '');
      await updateDoc(customerDocRef, {
        hasUnreadSupport: true,
        lastSupportMessageText: textToSend,
        lastSupportMessageSenderName: customer?.contactName || customer?.company || 'Client',
        lastSupportMessageTimestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error("Failed to send support chat message:", err);
      alert("Failed to send message. Please try again.");
    }
  };

  useEffect(() => {
    if (!customerId) return;
    setIsLoadingCustomer(true);
    const unsub = onSnapshot(doc(db, 'customers', customerId), (snapshot) => {
      if (snapshot.exists()) {
        setCustomer(snapshot.data());
      }
      setIsLoadingCustomer(false);
    }, (err) => {
      console.error("Error listening to customer in PortalLayout:", err);
      setIsLoadingCustomer(false);
    });
    return () => unsub();
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

      // Reset logo upload states
      setLogoFile(null);
      setLogoPreviewUrl('');
      setShouldDeleteLogo(false);

      // Populate address prompt states
      setPromptStreet(customer.shippingStreet || '');
      setPromptCity(customer.shippingCity || '');
      setPromptState(customer.shippingState || '');
      setPromptZip(customer.shippingZip || '');
    }
  }, [customer, isProfileModalOpen]);

  // Effect to trigger shipping address complete pop-up
  useEffect(() => {
    if (!isLoadingCustomer && customer) {
      const hasIncompleteAddress = !customer.shippingStreet || !customer.shippingCity || !customer.shippingState || !customer.shippingZip;
      const isDismissed = sessionStorage.getItem('wovn_dismissed_address_prompt') === 'true';
      if (hasIncompleteAddress && !isDismissed) {
        setIsAddressPromptOpen(true);
      }
    }
  }, [customer, isLoadingCustomer]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isProfileDropdownOpen && !(event.target as Element).closest('.profile-dropdown-container')) {
        setIsProfileDropdownOpen(false);
        if (activeTour === 'profile') {
          setTourStep(0);
          localStorage.setItem('wovn_tour_step', '0');
        }
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isProfileDropdownOpen, activeTour]);

  // Synchronize tour step with dropdown/modal state when in profile tour
  useEffect(() => {
    if (activeTour !== 'profile') return;

    if (tourStep === 0) {
      setIsProfileDropdownOpen(false);
      setIsProfileModalOpen(false);
    } else if (tourStep === 1) {
      setIsProfileDropdownOpen(true);
      setIsProfileModalOpen(false);
    } else if (tourStep === 2) {
      setIsProfileDropdownOpen(false);
      setIsProfileModalOpen(true);
    }
  }, [tourStep, activeTour]);

  const handleSaveProfile = async () => {
    if (!customerId) return;
    setIsSaving(true);
    try {
      let finalLogoUrl = customer?.logo || null;
      let finalCroppedLogoUrl = customer?.croppedLogo || null;

      if (shouldDeleteLogo) {
        finalLogoUrl = null;
        finalCroppedLogoUrl = null;
      } else if (logoFile) {
        const fileRef = ref(storage, `customers/${customerId}/logo_full_${Date.now()}`);
        await uploadBytes(fileRef, logoFile);
        const downloadUrl = await getDownloadURL(fileRef);
        finalLogoUrl = downloadUrl;
        finalCroppedLogoUrl = downloadUrl;
      }

      await updateDoc(doc(db, 'customers', customerId), {
        contactName: editContactName,
        company: editCompany,
        email: editEmail,
        phone: editPhone,
        shippingStreet: editStreet,
        shippingCity: editCity,
        shippingState: editState,
        shippingZip: editZip,
        logo: finalLogoUrl,
        croppedLogo: finalCroppedLogoUrl,
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
        logo: finalLogoUrl,
        croppedLogo: finalCroppedLogoUrl,
      }));
      setIsProfileModalOpen(false);
      if (activeTour === 'profile') {
        handleExitTour();
      }
      alert("Settings saved successfully!");
    } catch (err) {
      console.error("Error saving customer profile:", err);
      alert("Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      setLogoPreviewUrl(URL.createObjectURL(file));
      setShouldDeleteLogo(false);
    }
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoPreviewUrl('');
    setShouldDeleteLogo(true);
  };

  const handleSavePromptAddress = async () => {
    if (!customerId) return;
    setIsSavingPromptAddress(true);
    try {
      await updateDoc(doc(db, 'customers', customerId), {
        shippingStreet: promptStreet,
        shippingCity: promptCity,
        shippingState: promptState,
        shippingZip: promptZip,
      });
      setIsSavingPromptAddress(false);
      setIsSavedPromptAddress(true);
      
      // Wait for 0.5 seconds before closing the dialog
      await new Promise((resolve) => setTimeout(resolve, 500));
      setIsAddressPromptOpen(false);
    } catch (err) {
      console.error("Error saving prompt address:", err);
      alert("Failed to save address. Please try again.");
      setIsSavingPromptAddress(false);
    } finally {
      setIsSavedPromptAddress(false);
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

  const handleCreateOrder = (openLibrary = false) => {
    navigate(customerId ? `/portal/${customerId}/create` : '/portal', {
      state: openLibrary ? { openLibrary: true } : undefined
    });
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-black">
        <div className="animate-spin w-8 h-8 border-4 border-black border-t-transparent rounded-full" />
      </div>
    );
  }

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
      <header className={`flex flex-col lg:flex-row items-center justify-between px-6 lg:px-10 bg-white border-b border-black/5 gap-4 lg:gap-8 ${customer?.logo ? 'py-4' : 'py-6'}`}>
        {/* Left Section: Logo & Create Order Button */}
        <div className="flex items-center gap-12 shrink-0 w-full lg:w-auto justify-between lg:justify-start">
          <div 
            onClick={() => navigate(customerId ? `/portal/${customerId}` : '/portal')}
            className="flex items-center cursor-pointer hover:opacity-80 transition-opacity"
            title="Go to Dashboard"
          >
            {/* Main Logo */}
            {isLoadingCustomer ? (
              <div className="h-8 w-24 bg-gray-150/40 rounded animate-pulse" />
            ) : customer?.logo ? (
              <img src={customer.logo} alt={customer.company || "Customer Logo"} className="h-16 object-contain max-w-[260px]" />
            ) : (
              <img src="/logo.png" alt="WOVN" className="h-8" />
            )}
          </div>

          <button 
            data-tour="create-order-btn"
            onClick={() => handleCreateOrder(false)}
            className="bg-black text-white px-5 py-2.5 rounded-full text-xs font-bold tracking-wide hover:bg-black/80 hover:scale-105 active:scale-95 transition-all shadow-[0_4px_14px_0_rgb(0,0,0,0.15)] shrink-0"
          >
            {cartCount > 0 ? "+ Items" : "Create Order +"}
          </button>
        </div>
 
        {/* Center Section: Search Pill (Centered & Smaller) */}
        <div className="hidden xl:flex flex-1 justify-center px-6">
          <div className="relative w-full max-w-sm group">
            <input 
              type="text" 
              placeholder="Search" 
              className="w-full pl-6 pr-10 py-2.5 bg-white border border-gray-200 rounded-full text-sm font-medium focus:outline-none focus:border-gray-300 focus:shadow-sm transition-all placeholder:text-gray-400"
            />
            <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-gray-600 transition-colors" size={16} strokeWidth={2.5} />
          </div>
        </div>
 
        {/* Right Section: Navigation Options */}
        <div className="flex flex-wrap items-center justify-center lg:justify-end gap-3 sm:gap-4 md:gap-6 w-full lg:w-auto">
          <button 
            data-tour="orders-tab"
            onClick={() => navigate(customerId ? `/portal/${customerId}` : '/portal')}
            className={`text-[13px] font-semibold tracking-wide pb-0.5 border-b-2 transition-all ${
              location.pathname.startsWith('/portal') && !location.pathname.endsWith('/create') && !location.pathname.endsWith('/quote') && !location.pathname.endsWith('/vault') && !location.pathname.endsWith('/roster')
                ? 'text-black border-black font-bold'
                : 'text-gray-400 border-transparent hover:text-black hover:border-black'
            }`}
          >
            Dashboard
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
            data-tour="roster-tab"
            onClick={() => navigate(customerId ? `/portal/${customerId}/roster` : '/portal/roster')}
            className={`text-[13px] font-semibold tracking-wide pb-0.5 border-b-2 transition-all ${
              location.pathname.endsWith('/roster')
                ? 'text-black border-black'
                : 'text-gray-400 border-transparent hover:text-black hover:border-black'
            }`}
          >
            Team Roster
          </button>
 
          <button 
            data-tour="saved-carts-tab"
            onClick={() => navigate(customerId ? `/portal/${customerId}/create?tab=saved` : '/portal/create?tab=saved')}
            className={`text-[13px] font-semibold tracking-wide pb-0.5 border-b-2 transition-all ${
              location.pathname.endsWith('/create') && new URLSearchParams(location.search).get('tab') === 'saved'
                ? 'text-black border-black'
                : 'text-gray-400 border-transparent hover:text-black hover:border-black'
            }`}
          >
            Saved Carts
          </button>
          
          <button
            id="reorder-cart-btn"
            data-tour="reorder-cart-btn"
            onClick={() => {
              if (location.pathname.endsWith('/create')) {
                window.dispatchEvent(new CustomEvent('wovn_open_cart_drawer'));
              } else {
                navigate(customerId ? `/portal/${customerId}/create?openCart=true` : '/portal/create?openCart=true');
              }
            }}
            className={`bg-white border border-emerald-500 text-emerald-700 px-4.5 py-2.5 rounded-full text-xs font-bold tracking-wide hover:bg-neutral-50 hover:scale-105 active:scale-95 shadow-sm flex items-center gap-2 cursor-pointer mr-2 transition-all duration-300 ${
              isJiggling ? 'animate-bounce' : ''
            } ${
              (cartCount > 0 || activeTour)
                ? 'opacity-100 scale-100 w-auto pointer-events-auto' 
                : 'opacity-0 scale-75 w-0 pointer-events-none overflow-hidden mr-0 border-0 p-0'
            }`}
            title="View Cart"
          >
            <div className="relative">
              <ShoppingBag size={15} className="text-emerald-600" />
              <span className="absolute -top-1.5 -right-1.5 bg-emerald-600 text-white text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center border border-white">
                {cartCount}
              </span>
            </div>
            <span className="font-extrabold uppercase text-[10px] tracking-wider text-emerald-600 whitespace-nowrap">Cart</span>
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
              data-tour="profile-btn"
              onClick={() => {
                const nextState = !isProfileDropdownOpen;
                setIsProfileDropdownOpen(nextState);
                if (activeTour === 'profile') {
                  setTourStep(nextState ? 1 : 0);
                  localStorage.setItem('wovn_tour_step', nextState ? '1' : '0');
                }
              }}
              className="w-10 h-10 rounded-full border border-black/20 overflow-hidden bg-neutral-100 flex items-center justify-center cursor-pointer hover:border-black hover:scale-105 active:scale-95 transition-all shadow-[0_2px_8px_0_rgb(0,0,0,0.02)] shrink-0"
              title="Account & Settings"
            >
              {isLoadingCustomer ? (
                <div className="w-full h-full rounded-full bg-neutral-200 animate-pulse" />
              ) : customer?.croppedLogo || customer?.logo ? (
                <img src={customer.croppedLogo || customer.logo} alt="Profile" className="w-full h-full object-cover mix-blend-multiply p-0.5" />
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
                  data-tour="profile-settings-btn"
                  onClick={() => {
                    setIsProfileDropdownOpen(false);
                    setIsProfileModalOpen(true);
                    if (activeTour === 'profile') {
                      setTourStep(2);
                      localStorage.setItem('wovn_tour_step', '2');
                    }
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
                onClick={() => {
                  setIsProfileModalOpen(false);
                  if (activeTour === 'profile') {
                    handleExitTour();
                  }
                }}
                className="w-10 h-10 rounded-full border border-black/10 hover:border-black flex items-center justify-center hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body / Form */}
            <div data-tour="profile-modal-fields" className="p-8 max-h-[70vh] overflow-y-auto flex flex-col gap-6">
              {/* Company Logo Section */}
              <div className="flex flex-col gap-4">
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest border-b border-neutral-50 pb-1">Company Logo</h3>
                
                <div className="flex items-center gap-6">
                  {/* Logo Preview */}
                  <div className="relative w-20 h-20 rounded-2xl border border-neutral-200 overflow-hidden bg-neutral-50 flex items-center justify-center group flex-shrink-0">
                    {logoPreviewUrl ? (
                      <img src={logoPreviewUrl} alt="Logo preview" className="w-full h-full object-contain" />
                    ) : customer?.logo ? (
                      <img src={customer.logo} alt="Current logo" className="w-full h-full object-contain" />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-neutral-400">
                        <Image size={24} strokeWidth={1.5} />
                        <span className="text-[8px] uppercase font-bold mt-1 text-center">No Logo</span>
                      </div>
                    )}
                    
                    {(logoPreviewUrl || customer?.logo) && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <span className="text-[10px] text-white font-bold uppercase tracking-wider">Preview</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <label 
                        htmlFor="portal-logo-upload"
                        className="px-4 py-2 bg-black text-white hover:bg-neutral-800 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer transition-all flex items-center gap-1.5 shadow-sm"
                      >
                        <Upload size={13} />
                        Choose File
                      </label>
                      <input 
                        type="file"
                        id="portal-logo-upload"
                        accept="image/*"
                        onChange={handleLogoFileChange}
                        className="hidden"
                      />
                      
                      {(logoPreviewUrl || customer?.logo) && (
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          className="px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 size={13} />
                          Remove
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-neutral-400 font-semibold leading-relaxed">
                      Accepts PNG, JPG, or SVG. Suggested size 512x512px.
                    </p>
                  </div>
                </div>
              </div>

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

      {/* Complete Address Prompt Modal */}
      {isAddressPromptOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] border border-neutral-200 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center border-b border-neutral-100">
              <div>
                <h2 className="text-xl font-serif text-neutral-900 tracking-tight flex items-center gap-2">
                  <MapPin className="text-neutral-700" size={20} />
                  Complete Your Shipping Address
                </h2>
                <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider mt-1">Get the fastest quote requests</p>
              </div>
              <button 
                onClick={() => {
                  setIsAddressPromptOpen(false);
                  sessionStorage.setItem('wovn_dismissed_address_prompt', 'true');
                }}
                className="w-8 h-8 rounded-full border border-black/10 hover:border-black flex items-center justify-center hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
            
            <div className="p-8 flex flex-col gap-4">
              <p className="text-xs text-neutral-500 leading-relaxed font-semibold">
                We noticed your shipping address is not fully filled out. Add it now to enjoy automatic filling and faster turnaround times on your quote requests!
              </p>
              
              <div className="flex flex-col gap-3 mt-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] uppercase font-bold text-neutral-500 pl-1">Street Address</label>
                  <input 
                    type="text"
                    value={promptStreet}
                    onChange={(e) => setPromptStreet(e.target.value)}
                    placeholder="e.g. 123 Main St"
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-400 focus:bg-white transition-all font-bold"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1 col-span-1">
                    <label className="text-[9px] uppercase font-bold text-neutral-500 pl-1">City</label>
                    <input 
                      type="text"
                      value={promptCity}
                      onChange={(e) => setPromptCity(e.target.value)}
                      placeholder="e.g. Austin"
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2 text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-400 focus:bg-white transition-all font-bold"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] uppercase font-bold text-neutral-500 pl-1">State</label>
                    <input 
                      type="text"
                      value={promptState}
                      onChange={(e) => setPromptState(e.target.value)}
                      placeholder="e.g. TX"
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2 text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-400 focus:bg-white transition-all font-bold"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] uppercase font-bold text-neutral-500 pl-1">Zip Code</label>
                    <input 
                      type="text"
                      value={promptZip}
                      onChange={(e) => setPromptZip(e.target.value)}
                      placeholder="e.g. 78701"
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2 text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-400 focus:bg-white transition-all font-bold"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-8 py-5 bg-neutral-50 border-t border-neutral-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setIsAddressPromptOpen(false);
                  sessionStorage.setItem('wovn_dismissed_address_prompt', 'true');
                }}
                className="text-xs font-bold uppercase tracking-wider text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                Remind Me Later
              </button>
              
              <button
                type="button"
                onClick={handleSavePromptAddress}
                disabled={isSavingPromptAddress || isSavedPromptAddress || !promptStreet || !promptCity || !promptState || !promptZip}
                className={`px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-1.5 disabled:cursor-not-allowed ${
                  isSavedPromptAddress 
                    ? 'bg-emerald-600 text-white' 
                    : 'bg-black text-white hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400'
                }`}
              >
                {isSavingPromptAddress ? (
                  'Saving...'
                ) : isSavedPromptAddress ? (
                  <>
                    <Check size={14} strokeWidth={3} className="animate-in zoom-in duration-200" />
                    <span>Saved</span>
                  </>
                ) : (
                  'Save & Close'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Floating Chat Bubble Button */}
      {customerId && (
        <>
          {/* Unread Message Alert speech bubble floating next to chat button */}
          {!isChatOpen && unreadChatCount > 0 && (
            <div 
              onClick={() => setIsChatOpen(true)}
              className="fixed bottom-7 right-24 z-[120] bg-neutral-900 hover:bg-neutral-800 text-white text-[11px] font-bold px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 cursor-pointer transition-all hover:scale-105 active:scale-95 border border-neutral-800 animate-bounce group"
              title="Click to view new messages"
            >
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-ping shrink-0" />
              <span className="whitespace-nowrap">New message from team!</span>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1.5 w-3 h-3 bg-neutral-900 border-t border-r border-neutral-800 rotate-45 pointer-events-none group-hover:bg-neutral-800 transition-colors" />
            </div>
          )}

          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="fixed bottom-6 right-6 z-[120] w-14 h-14 rounded-full bg-black text-white flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer group"
            title="Chat with Support"
          >
            {isChatOpen ? (
              <X size={22} className="animate-in spin-in-90 duration-200" />
            ) : (
              <MessageSquare size={22} className="animate-in zoom-in duration-200" />
            )}
            
            {/* Unread Count Badge */}
            {!isChatOpen && unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white animate-bounce">
                {unreadChatCount}
              </span>
            )}
          </button>

          {/* Slide-Up Support Chat Panel */}
          {isChatOpen && (
            <div className="fixed bottom-24 right-6 z-[120] w-80 sm:w-96 h-[480px] bg-white rounded-3xl border border-neutral-200 shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">
              {/* Header */}
              <div className="bg-white border-b border-neutral-100 p-5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-neutral-100 flex items-center justify-center font-bold text-sm text-neutral-700 relative border border-neutral-200">
                    W
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-neutral-900 tracking-wide uppercase">WOVN Support</h3>
                    <p className="text-[10px] text-emerald-600 font-bold mt-0.5">Admins & Managers online</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsChatOpen(false)}
                  className="text-neutral-400 hover:text-neutral-700 hover:bg-neutral-50 p-1.5 rounded-full transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Messages List */}
              <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 bg-neutral-50/50 flex flex-col gap-3 custom-scrollbar">
                {chatMessages.length === 0 ? (
                  <div className="my-auto text-center flex flex-col items-center justify-center p-6 gap-2 text-neutral-400">
                    <MessageSquare size={32} className="stroke-[1.5] text-neutral-300" />
                    <p className="text-xs font-semibold">Start a conversation!</p>
                    <p className="text-[10px] leading-relaxed max-w-[200px]">Send a message to our shop admins and managers. We usually reply within minutes.</p>
                  </div>
                ) : (
                  chatMessages.map((msg: any) => {
                    const isMe = msg.senderRole === 'Client';
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col max-w-[75%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}
                      >
                        {!isMe && (
                          <span className="text-[9px] text-neutral-450 font-bold uppercase tracking-wider mb-1 ml-1">
                            {msg.senderName} ({msg.senderRole})
                          </span>
                        )}
                        <div
                          className={`p-3 rounded-2xl text-xs font-semibold leading-relaxed shadow-3xs break-words w-full ${
                            isMe
                              ? 'bg-neutral-900 text-white rounded-br-none'
                              : 'bg-neutral-100 text-neutral-800 rounded-bl-none'
                          }`}
                        >
                          {msg.imageUrl ? (
                            <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer" className="block max-w-full overflow-hidden rounded-xl mt-1 border border-neutral-200 cursor-zoom-in">
                              <img src={msg.imageUrl} alt="Chat Attachment" className="max-w-full max-h-[220px] object-contain mx-auto" />
                            </a>
                          ) : null}
                          {msg.text && <p className={msg.imageUrl ? 'mt-2' : ''}>{msg.text}</p>}
                        </div>
                        <span className="text-[8px] text-neutral-400 mt-1 font-semibold">
                          {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                    );
                  })
                )}

              </div>

              {/* Input Form */}
              <form
                onSubmit={handleSendChatMessage}
                className="p-3 border-t border-neutral-100 flex gap-2 items-center bg-white shrink-0"
              >
                <label className="w-9 h-9 rounded-xl border border-neutral-200 hover:bg-neutral-50 flex items-center justify-center text-neutral-500 cursor-pointer shrink-0 transition-colors relative">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleChatImageUpload}
                    disabled={isUploadingChatImage}
                  />
                  {isUploadingChatImage ? (
                    <Loader2 className="animate-spin text-brand-primary" size={14} />
                  ) : (
                    <Image size={14} />
                  )}
                </label>
                <input
                  type="text"
                  placeholder="Type a message or paste image..."
                  value={newMessageText}
                  onChange={(e) => setNewMessageText(e.target.value)}
                  onPaste={handleChatPaste}
                  className="flex-1 bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-black rounded-xl px-4 py-2.5 text-xs text-neutral-900 focus:outline-none font-semibold transition-all"
                />
                <button
                  type="submit"
                  disabled={!newMessageText.trim()}
                  className="w-9 h-9 rounded-xl bg-black hover:bg-neutral-800 text-white flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
                >
                  <Send size={14} />
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}
