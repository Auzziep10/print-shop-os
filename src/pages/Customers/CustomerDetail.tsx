import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';
import { ArrowLeft, Mail, Phone, MapPin, Building2, ExternalLink, Plus, Loader2, Upload, X, Check, Edit3 } from 'lucide-react';
import { MOCK_CUSTOMERS_DB } from '../../lib/mockData';
import { storage, db } from '../../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, getDoc, setDoc, addDoc, collection } from 'firebase/firestore';
import Cropper from 'react-easy-crop';
import { getCroppedImg } from '../../lib/cropUtils';
import { PortalOrders } from '../Portal/PortalOrders';
import { useOrders } from '../../hooks/useOrders';

export function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const mockCustomer = id && MOCK_CUSTOMERS_DB[id] ? MOCK_CUSTOMERS_DB[id] : null;
  
  const { orders } = useOrders(id);

  const [liveLogo, setLiveLogo] = useState<string | null>(null);
  const [liveCustomerData, setLiveCustomerData] = useState<any>({});
  const [fetchingLogo, setFetchingLogo] = useState(true);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);
  const [catalogLinkIds, setCatalogLinkIds] = useState<string[]>([]);
  const [savingLinkId, setSavingLinkId] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCatalogDialogOpen, setIsCatalogDialogOpen] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteText, setNoteText] = useState("Always triple check the black ink opacity on their orders. They are very particular about the 'Vanta Black' look.");

  // New Order State
  const [isNewOrderDialogOpen, setIsNewOrderDialogOpen] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  
  const initialToday = new Date();
  const initRawDate = initialToday.toLocaleDateString('en-CA'); // Gets YYYY-MM-DD format elegantly

  const [newOrderForm, setNewOrderForm] = useState({
    title: '',
    rawDate: initRawDate,
    date: initialToday.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }),
    fulfillmentType: '',
    statusIndex: 0,
    trackingCarrier: '',
    trackingNumber: ''
  });

  // Edit Company & Portal State
  const [editCompanyForm, setEditCompanyForm] = useState({
    name: mockCustomer?.company || '',
    email: mockCustomer?.email || '',
    phone: mockCustomer?.phone || '',
    location: mockCustomer?.location || '',
    type: mockCustomer?.type || 'B2C',
    net30Terms: mockCustomer?.net30Terms === undefined ? true : mockCustomer.net30Terms,
    fulfillmentType: mockCustomer?.fulfillmentType || 'Standard'
  });
  
  const [contacts, setContacts] = useState([
    { id: 1, name: 'Bruce Wayne', role: 'Owner / Admin', email: 'bruce@wayne.ent', lastLogin: 'Today', viewAll: true },
    { id: 2, name: 'Lucius Fox', role: 'Purchasing', email: 'lfox@wayne.ent', lastLogin: '3 days ago', viewAll: true },
    { id: 3, name: 'Alfred P.', role: 'Accountant', email: 'billing@wayne.ent', lastLogin: 'Jan 12', viewAll: false }
  ]);
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', role: '', email: '', viewAll: false });

  const handleAddContact = () => {
    if (!newContact.name || !newContact.email) return;
    setContacts([...contacts, { ...newContact, id: Date.now(), lastLogin: 'Never' }]);
    setIsAddingContact(false);
    setNewContact({ name: '', role: '', email: '', viewAll: false });
  };

  const [wovnCustomers, setWovnCustomers] = useState<any[]>([]);
  const [isLoadingWovnCustomers, setIsLoadingWovnCustomers] = useState(false);
  const [wovnCustomersError, setWovnCustomersError] = useState<string | null>(null);
  const [selectedWovnCustomer, setSelectedWovnCustomer] = useState<any | null>(null);

  const [availableCatalogs, setAvailableCatalogs] = useState<any[]>([]);
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(false);

  useEffect(() => {
    if (isCatalogDialogOpen && wovnCustomers.length === 0) {
      const fetchWovnCustomers = async () => {
        setIsLoadingWovnCustomers(true);
        setWovnCustomersError(null);
        try {
          const response = await fetch('https://wovn-garment-catalog.vercel.app/api/customers');
          if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) {
              setWovnCustomers(data);
            } else if (data && typeof data === 'object') {
              // Try to find an array inside
              const possibleArray = Object.values(data).find(v => Array.isArray(v));
              setWovnCustomers(possibleArray as any[] || [data]);
            }
          } else {
            const errText = await response.text();
            setWovnCustomersError(`HTTP Error ${response.status}: ${errText}`);
          }
        } catch(e: any) {
          console.error("Error fetching wovn customers", e);
          setWovnCustomersError(e.message || "Network Error or CORS issue");
        } finally {
          setIsLoadingWovnCustomers(false);
        }
      };
      fetchWovnCustomers();
    }
  }, [isCatalogDialogOpen, wovnCustomers.length]);

  const handleSelectWovnCustomer = async (customer: any) => {
    setSelectedWovnCustomer(customer);
    setIsLoadingCatalogs(true);
    try {
      const response = await fetch(`https://wovn-garment-catalog.vercel.app/api/decks?customerId=${customer.id}`);
      if (response.ok) {
        const decks = await response.json();
        setAvailableCatalogs(prev => {
          const newDecks = [...prev];
          decks.forEach((newDeck: any) => {
            const deckId = newDeck.id || newDeck.deckId;
            if (!newDecks.find(d => (d.id || d.deckId) === deckId)) {
              newDecks.push(newDeck);
            }
          });
          return newDecks;
        });
      }
    } catch(e) {
      console.error(e);
    } finally {
      setIsLoadingCatalogs(false);
    }
  };

  // Cropper State
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const onCropComplete = (_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  useEffect(() => {
    // Try to fetch custom live logo overrides
    const fetchCustomer = async () => {
      if (!id) {
        setFetchingLogo(false);
        return;
      }
      try {
        const d = await getDoc(doc(db, 'customers', id));
        if (d.exists()) {
          const data = d.data();
          setLiveCustomerData(data);
          
          if (data.logo) setLiveLogo(data.logo);
          
          let fetchedLinks: string[] = [];
          if (data.catalogLinkIds) fetchedLinks = data.catalogLinkIds;
          else if (data.catalogLinkId) fetchedLinks = [data.catalogLinkId];
          
          setCatalogLinkIds(fetchedLinks);
          
          setEditCompanyForm({
            name: data.company || data.contactName || mockCustomer?.company || '',
            email: data.email || mockCustomer?.email || '',
            phone: data.phone || mockCustomer?.phone || '',
            location: data.location || mockCustomer?.location || '',
            type: data.type || mockCustomer?.type || 'B2C',
            net30Terms: data.net30Terms ?? mockCustomer?.net30Terms ?? true,
            fulfillmentType: data.fulfillmentType ?? mockCustomer?.fulfillmentType ?? 'Standard'
          });

          // Fetch the names for the linked catalogs immediately so they don't say "Linked WOVN Deck"
          if (fetchedLinks.length > 0) {
             Promise.all(fetchedLinks.map(async (linkId) => {
               try {
                 const res = await fetch(`https://wovn-garment-catalog.vercel.app/api/decks?deckId=${linkId}`);
                 if (res.ok) {
                    const deckData = await res.json();
                    if (Array.isArray(deckData) && deckData.length > 0 && deckData[0].name) {
                       setAvailableCatalogs(prev => {
                          const existing = [...prev];
                          if (!existing.find(d => d.id === linkId)) {
                             existing.push({ id: linkId, name: deckData[0].name });
                          }
                          return existing;
                       });
                    }
                 }
               } catch (err) {
                 console.error("Error fetching native deck name", err);
               }
             }));
          }

        }
      } catch (err) {
        console.error("Error fetching live profile:", err);
      } finally {
        setFetchingLogo(false);
      }
    };
    fetchCustomer();
  }, [id]);

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input so identical file can be picked again
  };

  const handleSaveCompany = async () => {
    if (!id) return;
    setSavingCompany(true);
    try {
      await setDoc(doc(db, 'customers', id), {
        company: editCompanyForm.name,
        email: editCompanyForm.email,
        phone: editCompanyForm.phone,
        location: editCompanyForm.location,
        type: editCompanyForm.type,
        net30Terms: editCompanyForm.net30Terms,
        fulfillmentType: editCompanyForm.fulfillmentType
      }, { merge: true });
      
      setLiveCustomerData({
        ...liveCustomerData,
        company: editCompanyForm.name,
        email: editCompanyForm.email,
        phone: editCompanyForm.phone,
        location: editCompanyForm.location,
        type: editCompanyForm.type,
        net30Terms: editCompanyForm.net30Terms,
        fulfillmentType: editCompanyForm.fulfillmentType
      });
      setIsEditDialogOpen(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingCompany(false);
    }
  };

  const handleUploadCroppedLogo = async () => {
    if (!id || !cropImageSrc || !croppedAreaPixels) return;

    try {
      setUploadingLogo(true);
      const imageSrcToCrop = cropImageSrc;
      setCropImageSrc(null); // Close the cropper dialog UI early for better UX
      
      const croppedFile = await getCroppedImg(imageSrcToCrop, croppedAreaPixels);
      if (!croppedFile) throw new Error("Could not crop image");

      const storageRef = ref(storage, `customers/${id}/logo_${Date.now()}`);
      
      // Upload cropped file to Firebase Storage
      await uploadBytes(storageRef, croppedFile);
      const url = await getDownloadURL(storageRef);

      // Save the new URL to Firestore so it persists
      await setDoc(doc(db, 'customers', id), { logo: url }, { merge: true });
      
      setLiveLogo(url);
    } catch (err) {
      console.error("Error uploading logo", err);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSaveCatalogId = async () => {
    if (!id) return;
    setSavingLinkId(true);
    try {
      await setDoc(doc(db, 'customers', id), { catalogLinkIds }, { merge: true });
    } catch (e) {
      console.error("Error saving catalog ids", e);
    } finally {
      setSavingLinkId(false);
    }
  };

  const toggleCatalogLink = (catalogId: string) => {
    if (catalogLinkIds.includes(catalogId)) {
      setCatalogLinkIds(prev => prev.filter(c => c !== catalogId));
    } else {
      setCatalogLinkIds(prev => [...prev, catalogId]);
    }
  };

  const handleCreateOrder = async () => {
    if (!id || !newOrderForm.title) return;
    setIsCreatingOrder(true);
    try {
      const portalId = "ORD-" + Math.floor(1000 + Math.random() * 9000);
      
      const fulfillmentTypeToUse = newOrderForm.fulfillmentType || (liveCustomerData?.fulfillmentType ?? mockCustomer?.fulfillmentType ?? 'Standard');
      
      const newOrder = {
        customerId: id,
        portalId: portalId,
        title: newOrderForm.title,
        date: newOrderForm.date,
        fulfillmentType: fulfillmentTypeToUse,
        statusIndex: newOrderForm.statusIndex,
        tracking: {
          carrier: newOrderForm.trackingCarrier,
          number: newOrderForm.trackingNumber,
          url: ''
        },
        items: [],
        activities: [],
        createdAt: new Date().toISOString()
      };
      
      await addDoc(collection(db, 'orders'), newOrder);
      
      setIsNewOrderDialogOpen(false);
      const resetToday = new Date();
      setNewOrderForm({
        title: '',
        rawDate: resetToday.toLocaleDateString('en-CA'),
        date: resetToday.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }),
        fulfillmentType: '',
        statusIndex: 0,
        trackingCarrier: '',
        trackingNumber: ''
      });
    } catch (e) {
      console.error("Error creating order:", e);
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const customer = { 
    ...mockCustomer, 
    ...liveCustomerData,
    logo: liveLogo || mockCustomer?.logo
  };

  const totalOrders = orders.length;
  const lifetimeValue = orders.reduce((acc, order) => {
    const orderTotal = order.items?.reduce((sum: number, i: any) => {
      const priceMatch = (i.total || '$0').toString().replace(/[^0-9.]/g, '');
      return sum + (parseFloat(priceMatch) || 0);
    }, 0) || 0;
    return acc + orderTotal;
  }, 0);
  const formattedLTV = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(lifetimeValue);

  const hasNet30 = customer?.net30Terms ?? (customer?.type === 'B2B');

  return (
    <div className={tokens.layout.container}>
      {/* Top Breadcrumb & Actions */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-brand-border">
        <button 
          onClick={() => navigate('/customers')}
          className="flex items-center gap-2 text-sm text-brand-secondary hover:text-brand-primary transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Customers
        </button>
        <div className="flex items-center gap-3">
          <PillButton 
            variant="outline" 
            className="gap-2"
            onClick={() => window.open(`/portal/${id}`, '_blank')}
          >
            <ExternalLink size={16} />
            Login to Client Portal
          </PillButton>
          <PillButton variant="filled" onClick={() => setIsEditDialogOpen(true)}>
            Edit Company
          </PillButton>
        </div>
      </div>

      {/* Header Profile */}
      <div className="bg-white p-8 rounded-card border border-brand-border shadow-sm flex flex-col md:flex-row gap-8 items-start justify-between">
          <div className="flex items-start gap-6">
            <div className={`relative w-24 h-24 rounded-xl border border-brand-border bg-brand-bg flex items-center justify-center text-brand-secondary flex-shrink-0 overflow-hidden group ${customer?.logo ? 'bg-white' : ''}`}>
               {uploadingLogo || fetchingLogo ? (
                 <Loader2 className="animate-spin text-brand-secondary" size={24} />
               ) : customer?.logo ? (
                 <img src={customer.logo} className="w-full h-full object-cover filter grayscale contrast-125 mix-blend-multiply opacity-80" alt={customer.company} />
               ) : (
                 <Building2 size={40} strokeWidth={1} />
               )}
               
               {/* Hover Upload Overlay */}
               {!uploadingLogo && (
                 <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center cursor-pointer text-white">
                   <Upload size={20} className="mb-1" />
                   <span className="text-[9px] font-bold uppercase tracking-widest text-white/90">Edit Logo</span>
                   <input type="file" className="hidden" accept="image/*" onChange={handleLogoSelect} />
                 </label>
               )}
            </div>
            <div>
               <div className="flex items-center gap-3 mb-2">
                 <h1 className="font-serif text-3xl text-brand-primary">{editCompanyForm.name || 'Unknown Company'}</h1>
                 <span className="text-[10px] bg-brand-bg border border-brand-border px-2 py-0.5 rounded text-brand-secondary font-semibold uppercase tracking-wider">{id}</span>
               </div>
               <div className="flex items-center gap-4 text-sm text-brand-secondary mb-4">
                  <span className="flex items-center gap-1.5"><MapPin size={14} /> {editCompanyForm.location}</span>
                  <span className="flex items-center gap-1.5"><Phone size={14} /> {editCompanyForm.phone}</span>
                  <span className="flex items-center gap-1.5"><Mail size={14} /> {editCompanyForm.email}</span>
               </div>
               <div className="flex gap-2">
                 <span className="text-[10px] bg-brand-bg border border-brand-border px-2.5 py-1 rounded-md text-brand-secondary font-semibold uppercase tracking-wider">{customer?.type || 'B2C'}</span>
                 {hasNet30 && (
                   <span className="text-[10px] bg-blue-50 border border-blue-200 text-blue-700 px-2.5 py-1 rounded-md font-semibold uppercase tracking-wider">Net 30 Terms</span>
                 )}
               </div>
            </div>
         </div>
         <div className="flex gap-8 text-right bg-brand-bg/50 p-6 rounded-2xl border border-brand-border border-dashed">
            <div>
               <p className="text-xs uppercase font-bold tracking-widest text-brand-secondary mb-1">Total Orders</p>
               <p className="font-serif text-3xl">{totalOrders}</p>
            </div>
            <div>
               <p className="text-xs uppercase font-bold tracking-widest text-brand-secondary mb-1">Lifetime Value</p>
               <p className="font-serif text-3xl">{formattedLTV}</p>
            </div>
         </div>
      </div>

      {/* Subtle Internal Notes */}
      <div className="mt-3 mb-8 px-2 flex items-start gap-2 text-sm text-brand-secondary">
         <p className="flex-1 leading-relaxed">
            <strong className="font-semibold text-brand-primary mr-1">Internal Note:</strong>
            {isEditingNote ? (
              <span className="flex items-center gap-2 mt-2 max-w-3xl">
                 <input 
                   type="text" 
                   value={noteText}
                   onChange={e => setNoteText(e.target.value)}
                   className="flex-1 bg-white border border-brand-border rounded-lg px-3 py-2 focus:border-brand-primary focus:outline-none text-brand-primary shadow-sm"
                   autoFocus
                   onKeyDown={(e) => {
                     if (e.key === 'Enter') setIsEditingNote(false);
                   }}
                 />
                 <button onClick={() => setIsEditingNote(false)} className="text-xs bg-brand-primary text-white px-4 py-2 rounded-lg font-semibold hover:bg-black transition-colors">Save</button>
              </span>
            ) : (
              <>
                 <span>{noteText}</span>
                 <button onClick={() => setIsEditingNote(true)} className="ml-2 text-brand-muted hover:text-brand-secondary transition-colors inline-flex items-center align-middle relative -top-[1px]">
                    <Edit3 size={14} />
                 </button>
              </>
            )}
         </p>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col gap-8">

        {/* Order History using Portal Component */}
        <div className="mt-4">
           <div className="flex items-center justify-between mb-8">
              <div>
                 <h2 className={tokens.typography.h2}>Active Quotes & Orders</h2>
                 <p className="text-sm text-brand-secondary mt-1">Current pipeline and history for this company.</p>
              </div>
              <PillButton variant="filled" className="gap-2" onClick={() => setIsNewOrderDialogOpen(true)}>
                <Plus size={16} />
                New Order
              </PillButton>
           </div>

           {/* Injecting the exact visual component the customer sees! */}
           <div className="w-full">
             <PortalOrders overrideCustomerId={id} hideHeader={true} />
           </div>
        </div>
      </div>

      {/* Crop Modal */}
      {cropImageSrc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
          <div className="bg-white max-w-lg w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-brand-border">
            <div className="p-4 border-b border-brand-border flex justify-between items-center bg-brand-bg/50">
              <h3 className="font-serif text-2xl text-brand-primary">Adjust Logo Fit</h3>
              <button onClick={() => setCropImageSrc(null)} className="text-brand-secondary hover:text-brand-primary transition-colors bg-white border border-brand-border rounded-md p-1">
                <X size={20} />
              </button>
            </div>
            
            <div className="relative w-full h-[400px] bg-checkerboard overflow-hidden rounded-t-lg">
              <Cropper
                image={cropImageSrc || ''}
                crop={crop}
                zoom={zoom}
                aspect={1}
                objectFit="contain"
                restrictPosition={false}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
                showGrid={false}
              />
            </div>
            
            <div className="p-6 bg-white">
              <p className="text-xs text-brand-secondary mb-5 text-center font-medium">Pan and zoom the image below so no part of the logo is cropped out of the square box.</p>
              
              <div className="flex items-center gap-4 mb-6 px-4">
                 <span className="text-xs font-bold uppercase text-brand-secondary tracking-widest">Zoom</span>
                 <input
                   type="range"
                   value={zoom}
                   min={0.1}
                   max={3}
                   step={0.05}
                   aria-labelledby="Zoom"
                   onChange={(e) => setZoom(Number(e.target.value))}
                   className="flex-1 accent-brand-primary cursor-pointer"
                 />
              </div>

              <div className="flex gap-4">
                <PillButton variant="outline" onClick={() => setCropImageSrc(null)} className="flex-1 justify-center py-3">
                  Cancel
                </PillButton>
                <PillButton variant="filled" onClick={handleUploadCroppedLogo} className="flex-1 justify-center py-3">
                  <span className="flex items-center gap-2"><Check size={18} /> Format & Save Upload</span>
                </PillButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Company Dialog */}
      {isEditDialogOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 overflow-y-auto">
          <div className="bg-brand-bg max-w-2xl w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-brand-border my-auto">
            <div className="p-6 border-b border-brand-border flex justify-between items-center bg-white">
              <h3 className="font-serif text-2xl text-brand-primary">Edit Company</h3>
              <button onClick={() => setIsEditDialogOpen(false)} className="text-brand-secondary hover:text-brand-primary transition-colors bg-brand-bg border border-brand-border rounded-md p-1">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
               {/* Contact Information Form */}
               <div className="bg-white p-6 rounded-card border border-brand-border shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] grid grid-cols-2 gap-4">
                 <div className="col-span-2">
                    <h2 className={tokens.typography.h2}>Company Details</h2>
                 </div>
                 <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-brand-secondary uppercase tracking-widest">Company Name</label>
                    <input className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-primary/30 transition-colors placeholder:text-brand-secondary/40 font-medium" value={editCompanyForm.name} onChange={e => setEditCompanyForm({...editCompanyForm, name: e.target.value})} />
                 </div>
                 <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-brand-secondary uppercase tracking-widest">Phone</label>
                    <input className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-primary/30 transition-colors placeholder:text-brand-secondary/40 font-medium" value={editCompanyForm.phone} onChange={e => setEditCompanyForm({...editCompanyForm, phone: e.target.value})} />
                 </div>
                 <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-brand-secondary uppercase tracking-widest">Email</label>
                    <input className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-primary/30 transition-colors placeholder:text-brand-secondary/40 font-medium" value={editCompanyForm.email} onChange={e => setEditCompanyForm({...editCompanyForm, email: e.target.value})} />
                 </div>
                 <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-brand-secondary uppercase tracking-widest">Location</label>
                    <input className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-primary/30 transition-colors placeholder:text-brand-secondary/40 font-medium" value={editCompanyForm.location} onChange={e => setEditCompanyForm({...editCompanyForm, location: e.target.value})} />
                 </div>
                 <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-brand-secondary uppercase tracking-widest">Company Type</label>
                    <select className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-primary/30 transition-colors font-medium text-brand-primary" value={editCompanyForm.type} onChange={e => setEditCompanyForm({...editCompanyForm, type: e.target.value})}>
                      <option value="B2B">B2B (Business)</option>
                      <option value="B2C">B2C (Consumer)</option>
                    </select>
                 </div>
                 <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-brand-secondary uppercase tracking-widest">Fulfillment Type</label>
                    <select className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-primary/30 transition-colors font-medium text-brand-primary" value={editCompanyForm.fulfillmentType} onChange={e => setEditCompanyForm({...editCompanyForm, fulfillmentType: e.target.value})}>
                      <option value="Standard">Standard Drop-Ship</option>
                      <option value="Kitting">Inventory & Kitting</option>
                    </select>
                 </div>
                 <div className="col-span-2 flex items-center pt-2 pl-2 gap-3">
                    <input type="checkbox" id="net30" checked={editCompanyForm.net30Terms} onChange={e => setEditCompanyForm({...editCompanyForm, net30Terms: e.target.checked})} className="w-4 h-4 accent-brand-primary cursor-pointer" />
                    <label htmlFor="net30" className="text-xs font-bold text-brand-primary uppercase tracking-widest cursor-pointer mt-0.5">ALLOW NET 30 TERMS</label>
                 </div>
               </div>

               {/* WOVN Catalog Link */}
               <div className="bg-white p-6 rounded-card border border-brand-border shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)]">
                 <div className="flex justify-between items-center mb-6">
                    <h2 className={tokens.typography.h2}>WOVN Catalog Link</h2>
                    <PillButton 
                      variant="outline" 
                      className="px-4"
                      onClick={() => setIsCatalogDialogOpen(true)}
                    >
                      <Plus size={16} /> Select Decks
                    </PillButton>
                 </div>
                 <p className="text-sm text-brand-secondary mb-4 leading-relaxed">
                   Connect this profile to multiple Garment Catalog decks to enable seamless ordering in the Client Portal.
                 </p>
                 
                 <div className="flex flex-col gap-3">
                    {catalogLinkIds.length === 0 ? (
                       <div className="bg-brand-bg rounded-xl p-4 text-center text-sm font-medium text-brand-secondary border border-dashed border-brand-border">
                         No catalog decks connected. Click above to add some.
                       </div>
                    ) : (
                       <div className="flex flex-wrap gap-2">
                         {catalogLinkIds.map(linkId => {
                           // If the catalog is fetched, map its name. Otherwise just show the ID.
                           const c = availableCatalogs.find(m => m.id === linkId);
                           return (
                             <div key={linkId} className="flex items-center gap-2 bg-white border border-brand-border/60 rounded-lg pl-3 pr-1 py-1 shadow-sm">
                               <span className="text-xs font-bold text-brand-primary">{c && c.name ? c.name : 'Linked WOVN Deck'}</span>
                               <button 
                                 onClick={() => toggleCatalogLink(linkId)}
                                 className="w-6 h-6 rounded flex items-center justify-center text-brand-secondary hover:bg-brand-bg hover:text-red-500 transition-colors"
                               >
                                 <X size={14} />
                               </button>
                             </div>
                           )
                         })}
                       </div>
                    )}
                 </div>

                 <div className="mt-6 flex justify-end border-t border-brand-border pt-6">
                    <PillButton 
                      variant="filled" 
                      className="px-6 whitespace-nowrap"
                      onClick={handleSaveCatalogId}
                      disabled={savingLinkId}
                    >
                      {savingLinkId ? 'Saving...' : 'Save Catalog Links'}
                    </PillButton>
                 </div>
               </div>

               {/* Portal Access */}
               <div className="bg-white p-6 rounded-card border border-brand-border shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)]">
                 <div className="flex justify-between items-center mb-4">
                    <h2 className={tokens.typography.h2}>Portal Access</h2>
                    {!isAddingContact && (
                      <button onClick={() => setIsAddingContact(true)} className="text-brand-secondary hover:text-brand-primary transition-colors flex items-center gap-1 text-xs font-bold">
                        <Plus size={16} /> Add Contact
                      </button>
                    )}
                 </div>
                 
                 {isAddingContact && (
                    <div className="mb-6 p-4 bg-brand-bg border border-brand-border/60 rounded-xl flex flex-col gap-3">
                       <h4 className="text-xs font-bold uppercase tracking-widest text-brand-primary mb-1">New Portal User</h4>
                       <div className="grid grid-cols-2 gap-3">
                         <input placeholder="Full Name" value={newContact.name} onChange={e => setNewContact({...newContact, name: e.target.value})} className="w-full bg-white border border-brand-border/60 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:border-brand-primary/30" />
                         <input placeholder="Email Address" value={newContact.email} onChange={e => setNewContact({...newContact, email: e.target.value})} className="w-full bg-white border border-brand-border/60 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:border-brand-primary/30" />
                         <input placeholder="Role (e.g. Designer)" value={newContact.role} onChange={e => setNewContact({...newContact, role: e.target.value})} className="w-full bg-white border border-brand-border/60 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:border-brand-primary/30" />
                         <select value={newContact.viewAll ? "all" : "own"} onChange={e => setNewContact({...newContact, viewAll: e.target.value === "all"})} className="w-full bg-white border border-brand-border/60 rounded-lg px-3 py-2 text-sm font-medium text-brand-secondary focus:outline-none focus:border-brand-primary/30">
                           <option value="own">View Own Orders</option>
                           <option value="all">View All Company Orders</option>
                         </select>
                       </div>
                       <div className="flex gap-2 justify-end mt-2">
                         <button onClick={() => setIsAddingContact(false)} className="text-xs px-3 py-1.5 font-bold text-brand-secondary hover:text-brand-primary">Cancel</button>
                         <button onClick={handleAddContact} className="text-xs px-4 py-1.5 bg-brand-primary text-white rounded-md font-bold hover:bg-black transition-colors">Add User</button>
                       </div>
                    </div>
                 )}
                 
                 <div className="space-y-3">
                   {contacts.map((contact) => (
                     <div key={contact.id} className="p-3 border border-brand-border/60 rounded-xl bg-brand-bg flex items-center justify-between group cursor-pointer hover:border-brand-primary/30 transition-colors">
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-full bg-white border border-brand-border flex items-center justify-center text-xs font-bold text-brand-primary">
                             {contact.name.charAt(0)}
                           </div>
                           <div>
                              <p className="text-sm font-medium text-brand-primary">{contact.name}</p>
                              <p className="text-[10px] text-brand-secondary uppercase tracking-wide font-semibold mt-0.5">{contact.role}</p>
                           </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <select 
                            value={contact.viewAll ? "all" : "own"} 
                            onChange={(e) => {
                               setContacts(contacts.map(c => c.id === contact.id ? { ...c, viewAll: e.target.value === "all" } : c))
                            }} 
                            className="bg-transparent text-xs font-semibold text-brand-secondary focus:outline-none cursor-pointer hover:text-brand-primary"
                          >
                            <option value="own">View Own Orders</option>
                            <option value="all">View All Company Orders</option>
                          </select>
                          <div className="text-right w-24">
                            <p className="text-xs text-brand-secondary truncate">{contact.email}</p>
                            <p className="text-[10px] text-brand-secondary/60 mt-1">Logged in {contact.lastLogin}</p>
                          </div>
                        </div>
                     </div>
                   ))}
                 </div>
               </div>
            </div>
            
            <div className="p-6 border-t border-brand-border bg-white flex justify-end gap-3">
                <PillButton variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</PillButton>
                <PillButton variant="filled" onClick={handleSaveCompany} disabled={savingCompany}>
                  {savingCompany ? 'Saving...' : 'Save Changes'}
                </PillButton>
            </div>
          </div>
        </div>
      )}

      {/* Catalog Selection Overlay */}
      {isCatalogDialogOpen && (
         <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm p-6 animate-in fade-in zoom-in-95 duration-200">
           <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl p-6 border border-brand-border flex flex-col">
              <div className="flex justify-between items-center mb-4">
                 <h3 className="font-serif text-xl text-brand-primary">Select Catalog Deck</h3>
                 <button onClick={() => { setIsCatalogDialogOpen(false); setSelectedWovnCustomer(null); }} className="text-brand-secondary hover:text-brand-primary transition-colors bg-brand-bg border border-brand-border rounded-md p-1">
                   <X size={16} />
                 </button>
              </div>

              {!selectedWovnCustomer ? (
                <>
                  <p className="text-sm text-brand-secondary mb-6 leading-relaxed">Select a WOVN Catalog profile to view their connected active decks.</p>
                  
                  <div className="space-y-3 mb-6 max-h-[400px] overflow-y-auto">
                    {isLoadingWovnCustomers ? (
                      <div className="flex justify-center p-6 bg-brand-bg rounded-xl border border-brand-border/60 text-brand-secondary text-sm font-medium">
                        <span className="animate-pulse">Loading profiles from WOVN Catalog...</span>
                      </div>
                    ) : wovnCustomersError ? (
                      <div className="flex flex-col justify-center p-6 bg-red-50 rounded-xl border border-red-200 text-red-600 text-sm font-medium text-center">
                        <p className="font-bold mb-1">Failed to load profiles</p>
                        <p className="text-xs opacity-80">{wovnCustomersError}</p>
                      </div>
                    ) : wovnCustomers.length === 0 ? (
                      <div className="flex justify-center p-6 bg-brand-bg rounded-xl border border-brand-border/60 text-brand-secondary text-sm font-medium text-center">
                        No profiles found.
                      </div>
                    ) : (
                      wovnCustomers.map(c => (
                        <button 
                          key={c.id} 
                          onClick={() => handleSelectWovnCustomer(c)}
                          className="w-full flex items-center justify-between p-4 rounded-xl border bg-white border-brand-border/60 hover:border-brand-primary/40 transition-colors group text-left"
                        >
                          <div>
                            <p className="font-medium text-brand-primary mb-0.5">{c.company || c.name}</p>
                            <p className="text-[10px] font-bold tracking-widest text-brand-secondary uppercase">{c.id}</p>
                          </div>
                          <span className="text-xs font-bold text-brand-primary opacity-0 group-hover:opacity-100 transition-opacity pr-2">→</span >
                        </button>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-6 bg-brand-bg p-2 rounded-xl border border-brand-border/60">
                    <button onClick={() => setSelectedWovnCustomer(null)} className="text-brand-primary transition-colors bg-white border border-brand-border shadow-sm rounded px-2 flex items-center h-7 text-xs font-bold">
                       &larr; Back
                    </button>
                    <p className="text-sm text-brand-secondary font-medium leading-relaxed truncate ml-1">Decks for <span className="text-brand-primary font-bold">{selectedWovnCustomer.company || selectedWovnCustomer.name}</span></p>
                  </div>

                  <div className="space-y-3 mb-6 max-h-[400px] overflow-y-auto">
                    {(() => {
                      const customerDecks = availableCatalogs.filter(d => (d.customer_id || d.customerId) === selectedWovnCustomer.id);
                      
                      if (isLoadingCatalogs) {
                        return (
                          <div className="flex justify-center p-6 bg-brand-bg rounded-xl border border-brand-border/60 text-brand-secondary text-sm font-medium">
                            <span className="animate-pulse">Loading active decks...</span>
                          </div>
                        );
                      }
                      
                      if (customerDecks.length === 0) {
                        return (
                          <div className="flex justify-center p-6 bg-brand-bg rounded-xl border border-brand-border/60 text-brand-secondary text-sm font-medium text-center">
                            No decks discovered for this profile.
                          </div>
                        );
                      }

                      return customerDecks.map(catalog => {
                        const catalogId = catalog.id || catalog.deckId;
                        const isSelected = catalogLinkIds.includes(catalogId);
                        const itemCount = Array.isArray(catalog.garments) ? catalog.garments.length : Array.isArray(catalog.items) ? catalog.items.length : 0;
                        return (
                          <button 
                            key={catalogId} 
                            onClick={() => toggleCatalogLink(catalogId)}
                            className={`w-full flex items-center justify-between p-4 rounded-xl border transition-colors group text-left ${
                              isSelected ? 'bg-brand-bg border-brand-primary/50' : 'bg-white border-brand-border/60 hover:border-brand-primary/40'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                isSelected ? 'bg-brand-primary border-brand-primary text-white' : 'bg-white border-brand-border group-hover:border-brand-primary/40'
                              }`}>
                                {isSelected && <Check size={12} strokeWidth={3} />}
                              </div>
                              <div>
                                <p className="font-medium text-brand-primary mb-0.5">{catalog.name || "Unnamed Deck"}</p>
                                <p className="text-[10px] font-bold tracking-widest text-brand-secondary uppercase">{catalogId}</p>
                              </div>
                            </div>
                            <span className="text-xs font-bold text-brand-secondary bg-white border border-brand-border px-2 py-1 rounded-md transition-colors">{itemCount} Items</span>
                          </button>
                        );
                      });
                    })()}
                  </div>
                </>
              )}
              
              <div className="flex justify-end pt-4 border-t border-brand-border">
                 <PillButton variant="filled" onClick={() => { setIsCatalogDialogOpen(false); setSelectedWovnCustomer(null); }}>Done</PillButton>
              </div>
           </div>
         </div>
      )}

      {/* New Order Dialog */}
      {isNewOrderDialogOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 overflow-y-auto">
          <div className="bg-brand-bg max-w-lg w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-brand-border my-auto">
            <div className="p-6 border-b border-brand-border flex justify-between items-center bg-white">
              <h3 className="font-serif text-2xl text-brand-primary">Create New Order</h3>
              <button 
                onClick={() => setIsNewOrderDialogOpen(false)} 
                className="text-brand-secondary hover:text-brand-primary transition-colors bg-brand-bg border border-brand-border rounded-md p-1"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Order Title</label>
                <input 
                  type="text" 
                  value={newOrderForm.title}
                  onChange={(e) => setNewOrderForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                  placeholder="e.g. Polos, Jackets, Accessories"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Due Date</label>
                <input 
                  type="date" 
                  value={newOrderForm.rawDate || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      setNewOrderForm(prev => ({ ...prev, rawDate: '', date: '' }));
                      return;
                    }
                    const [y, m, d] = val.split('-');
                    const formatted = `${m}/${d}/${y.substring(2)}`;
                    setNewOrderForm(prev => ({ ...prev, rawDate: val, date: formatted }));
                  }}
                  className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm flex items-center justify-between text-brand-primary focus:border-brand-primary focus:outline-none transition-colors accent-brand-primary min-h-[46px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Fulfillment Type</label>
                  <select 
                    value={newOrderForm.fulfillmentType}
                    onChange={(e) => setNewOrderForm(prev => ({ ...prev, fulfillmentType: e.target.value }))}
                    className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                  >
                    <option value="">Default (From Customer)</option>
                    <option value="Standard">Standard Drop-Ship</option>
                    <option value="Kitting">Inventory & Kitting</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Pipeline Status</label>
                  <select 
                    value={newOrderForm.statusIndex.toString()}
                    onChange={(e) => setNewOrderForm(prev => ({ ...prev, statusIndex: parseInt(e.target.value) }))}
                    className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                  >
                    {(() => {
                      const custFulfillment = liveCustomerData?.fulfillmentType ?? mockCustomer?.fulfillmentType ?? 'Standard';
                      const formIsKitting = newOrderForm.fulfillmentType === 'Kitting' || (!newOrderForm.fulfillmentType && custFulfillment === 'Kitting');
                      return (
                        <>
                          <option value="0">0 - Quote</option>
                          <option value="1">1 - Approved</option>
                          <option value="2">2 - Shopping</option>
                          <option value="3">3 - Ordered</option>
                          <option value="4">4 - Processing</option>
                          <option value="5">5 - {formIsKitting ? 'Inventory' : 'Shipped'}</option>
                          <option value="6">6 - {formIsKitting ? 'Live (Shopify)' : 'Received'}</option>
                        </>
                      );
                    })()}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Carrier</label>
                  <select 
                    value={newOrderForm.trackingCarrier}
                    onChange={(e) => setNewOrderForm(prev => ({ ...prev, trackingCarrier: e.target.value }))}
                    className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                  >
                    <option value="">Pickup / Local</option>
                    <option value="UPS">UPS</option>
                    <option value="FedEx">FedEx</option>
                    <option value="USPS">USPS</option>
                    <option value="DHL">DHL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Tracking Number</label>
                  <input 
                    type="text" 
                    value={newOrderForm.trackingNumber}
                    onChange={(e) => setNewOrderForm(prev => ({ ...prev, trackingNumber: e.target.value }))}
                    className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                    placeholder="e.g. 1Z9999..."
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-brand-border">
                <PillButton variant="outline" onClick={() => setIsNewOrderDialogOpen(false)} className="flex-1 justify-center py-3">
                  Cancel
                </PillButton>
                <PillButton variant="filled" onClick={handleCreateOrder} className="flex-1 justify-center py-3" disabled={isCreatingOrder || !newOrderForm.title}>
                  {isCreatingOrder ? <Loader2 className="animate-spin" size={18} /> : <span>Create Order</span>}
                </PillButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
