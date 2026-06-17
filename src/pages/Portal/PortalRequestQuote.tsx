import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, ChevronDown, Upload, Plus, Trash2, FileText, Loader2, Sparkles } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { db, storage } from '../../lib/firebase';
import { doc, getDoc, setDoc, query, collection, where, getDocs, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { GarmentCustomizerModal } from '../../components/Portal/GarmentCustomizerModal';
import sanmarCatalogJson from '../../data/sanmar-catalog.json';

const sanmarCatalog = sanmarCatalogJson as any[];

const DEFAULT_RACKS = {
  Athleisure: { hat: 'STC70', shirt: 'BC3001', polo: 'ST640', crewneck: 'DT1304', hoodie: 'BC3719', longsleeve: 'BC3501' },
  Casual: { hat: '112', shirt: '64000', polo: '64800', crewneck: 'SF000', hoodie: '18500', longsleeve: '6014' },
  Formal: { hat: 'C402', shirt: 'BC3001', polo: 'K500', crewneck: 'DT1304', hoodie: '996M', longsleeve: 'BC3501' },
  Active: { hat: 'STC70', shirt: 'BC3001', polo: 'ST550', crewneck: 'S6000', hoodie: 'DT6100', longsleeve: '29LS' },
  Business: { hat: 'C402', shirt: 'K810', polo: 'K810', crewneck: 'DT1304', hoodie: 'BC3719', longsleeve: '6014' },
  'Work Wear': { hat: '212', shirt: '5000', polo: 'K420', crewneck: '562M', hoodie: '18500', longsleeve: '6014' },
  Outdoor: { hat: '112', shirt: 'BC3001', polo: 'K110', crewneck: '1566', hoodie: 'DT6100', longsleeve: '6014' },
  Team: { hat: '112', shirt: '64000', polo: 'ST665', crewneck: 'S6000', hoodie: '996M', longsleeve: '29LS' }
};

export function PortalRequestQuote() {
  const navigate = useNavigate();
  const { customerId } = useParams();
  
  const [products, setProducts] = useState<any[]>([
    { id: 1, artworkUrl: null, artworkName: null, isUploading: false }
  ]);

  const [contactName, setContactName] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [phone, setPhone] = useState('');
  
  const [shippingAddress, setShippingAddress] = useState({
    line1: '',
    line2: '',
    city: '',
    state: '',
    zip: '',
    country: ''
  });

  const [orderOnBehalf, setOrderOnBehalf] = useState({
    department: '',
    contactPerson: ''
  });

  const [inHandsDate, setInHandsDate] = useState('');
  const [notes, setNotes] = useState('');
  const [budgetTier, setBudgetTier] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [suggestedItems, setSuggestedItems] = useState<any[]>([]);
  const [wovnRack, setWovnRack] = useState<any[]>([]);
  const [pastGarments, setPastGarments] = useState<any[]>([]);
  const [customerRacks, setCustomerRacks] = useState<Record<string, any>>(DEFAULT_RACKS);
  const [activeRackCategory, setActiveRackCategory] = useState('Athleisure');
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const [activeLibraryTab, setActiveLibraryTab] = useState('rack');
  const [customizingProduct, setCustomizingProduct] = useState<any | null>(null);
  const [hoveredProductId, setHoveredProductId] = useState<number | null>(null);
  const [showShipping, setShowShipping] = useState(false);
  const [showOnBehalf, setShowOnBehalf] = useState(false);

  useEffect(() => {
    const fetchCustomer = async () => {
      if (!customerId) return;
      setIsLoadingLibrary(true);
      try {
        const docRef = doc(db, 'customers', customerId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          
          if (data.name) setContactName(data.name);
          if (data.email) setEmailAddress(data.email);
          if (data.phone) setPhone(data.phone);

          const street = data.shippingStreet || data.billingStreet || '';
          if (street) {
            setShowShipping(true);
          }

          // Auto-populate shipping address using top-level properties
          setShippingAddress({
            line1: street,
            line2: '', // no line 2 in original schema, leave blank
            city: data.shippingCity || data.billingCity || '',
            state: data.shippingState || data.billingState || '',
            zip: data.shippingZip || data.billingZip || '',
            country: data.shippingCountry || data.billingCountry || 'US' // default to US if none exists
          });

          // 1. Fetch Suggested Items
          setSuggestedItems(data.suggestedItems || []);

          // 2. Fetch WOVN Rack Items (Decks)
          const deckIds = data.catalogLinkIds || (data.catalogLinkId ? [data.catalogLinkId] : []);
          if (deckIds.length > 0) {
            try {
              const fetchedArrays = await Promise.all(
                deckIds.map(async (deckId: string) => {
                  try {
                    const response = await fetch(`https://wovn-garment-catalog.vercel.app/api/decks?deckId=${deckId}`);
                    if (response.ok) {
                      return await response.json();
                    }
                  } catch (e) {
                    console.error("Failed to fetch deck:", deckId, e);
                  }
                  return null;
                })
              );
              
              const validArrays = fetchedArrays.filter(d => d !== null && Array.isArray(d));
              const flatDecks = validArrays.flat();
              const allGarments = flatDecks.reduce((acc: any[], deck: any) => {
                const itemsList = deck.items || deck.garments || [];
                return [...acc, ...itemsList];
              }, []);
              
              setWovnRack(allGarments);
            } catch (deckErr) {
              console.error("Error loading customer decks:", deckErr);
            }
          }

          // 3. Fetch Past Ordered Garments
          try {
            const q = query(
              collection(db, 'orders'),
              where('customerId', '==', customerId)
            );
            const querySnapshot = await getDocs(q);
            const uniqueGarmentsMap: Record<string, any> = {};
            querySnapshot.forEach((docSnap) => {
              const orderData = docSnap.data();
              if (orderData.items && Array.isArray(orderData.items)) {
                orderData.items.forEach((item: any) => {
                  const styleKey = item.style || item.itemNum;
                  if (styleKey && !uniqueGarmentsMap[styleKey]) {
                    uniqueGarmentsMap[styleKey] = {
                      id: item.id || `past-${Date.now()}-${Math.random()}`,
                      style: item.style || 'Custom Garment',
                      itemNum: item.itemNum || '',
                      image: item.image || '',
                      colors: item.color ? [item.color] : ['Custom Color'],
                      price: parseFloat(item.price || 0)
                    };
                  }
                });
              }
            });
            setPastGarments(Object.values(uniqueGarmentsMap));
          } catch (orderErr) {
            console.error("Error loading past orders for quote:", orderErr);
          }

          // 4. Fetch Customer Custom Racks
          if (data.racks) {
            setCustomerRacks(data.racks);
          }
        }
      } catch (err) {
        console.error("Error fetching customer", err);
      } finally {
        setIsLoadingLibrary(false);
      }
    };
    fetchCustomer();
  }, [customerId]);

  const getGarmentImage = (item: any) => {
    if (item.image) return item.image;
    if (item.images) {
      const firstColor = item.colors?.[0] || Object.keys(item.images)[0];
      if (firstColor && item.images[firstColor]) {
        return item.images[firstColor].front || item.images[firstColor].swatch || '';
      }
    }
    return 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';
  };

  const activeRackItems = useMemo(() => {
    const categoryRacks = customerRacks[activeRackCategory] || DEFAULT_RACKS.Athleisure;
    return Object.entries(categoryRacks).map(([slot, styleId]) => {
      const prod = sanmarCatalog.find(p => p.style.toLowerCase() === String(styleId).toLowerCase());
      if (prod) {
        return {
          ...prod,
          id: `${slot}-${Date.now()}-${Math.random()}`,
          slot,
          slotLabel: slot.charAt(0).toUpperCase() + slot.slice(1)
        };
      }
      return null;
    }).filter(Boolean) as any[];
  }, [customerRacks, activeRackCategory]);

  const handleBack = () => {
    navigate(customerId ? `/portal/${customerId}` : '/portal');
  };

  const getActiveSidesCountForProduct = (p: any) => {
    if (!p.customized) return 1;
    let count = 0;
    if (p.logoUrl) count++;
    if (p.logoUrlBack) count++;
    if (p.logoUrlLeftSleeve) count++;
    if (p.logoUrlRightSleeve) count++;
    return count || 1;
  };

  const handleAddProduct = () => {
    const qtyMap: Record<string, number> = {};
    const defaultSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'OSFA'];
    defaultSizes.forEach(s => qtyMap[s] = 0);
    setProducts(prev => [...prev, { id: Date.now(), garmentName: '', color: '', qty: 0, artworkUrl: null, artworkName: null, isUploading: false, sizes: qtyMap }]);
  };

  const handleAddProductFromLibrary = (item: any) => {
    const style = item.title || item.style || item.garment_name || item.name || 'Custom Garment';
    const image = getGarmentImage(item);
    const colors = item.colors || ['Custom Color'];
    
    const qtyMap: Record<string, number> = {};
    const defaultSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'OSFA'];
    defaultSizes.forEach(s => qtyMap[s] = 0);

    const newProduct = {
      id: Date.now() + Math.random(),
      garmentName: style,
      itemNum: item.style || item.itemNum || item.garment_id || item.sku || item.id || '',
      color: colors[0] || '',
      qty: 0,
      artworkUrl: image,
      artworkName: 'Garment Artwork',
      isUploading: false,
      colors: colors,
      sizes: qtyMap,
      customized: false,
      images: item.images || null
    };
    
    setProducts(prev => {
      if (prev.length === 1 && !prev[0].garmentName && !prev[0].artworkUrl) {
        return [newProduct];
      }
      return [...prev, newProduct];
    });
  };

  const handleRemoveProduct = (id: number) => {
    setProducts(prev => prev.filter((p: any) => p.id !== id));
  };

  const handleFileUpload = async (productId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !customerId) return;
    
    // Set uploading state
    setProducts(prev => prev.map((p: any) => p.id === productId ? { ...p, isUploading: true } : p));
    
    try {
      const storageRef = ref(storage, `portal/${customerId}/quote_artwork/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      
      setProducts(prev => prev.map((p: any) => p.id === productId ? { 
        ...p, 
        isUploading: false, 
        artworkUrl: url,
        artworkName: file.name
      } : p));

      // Save to Asset Vault automatically
      try {
        const newAsset = {
          id: `asset-${Date.now()}`,
          name: file.name,
          url: url,
          uploadedAt: new Date().toISOString()
        };
        const docRef = doc(db, 'customers', customerId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const currentAssets = docSnap.data().assets || [];
          await updateDoc(docRef, {
            assets: [...currentAssets, newAsset]
          });
        }
      } catch (vaultErr) {
        console.error("Auto vault save failed:", vaultErr);
      }
    } catch (err) {
      console.error("Upload failed", err);
      setProducts(prev => prev.map((p: any) => p.id === productId ? { ...p, isUploading: false } : p));
    }
  };

  const handleSubmit = async () => {
    if (!customerId) return;
    
    if (!contactName || !emailAddress) {
       alert("Please provide at least a contact name and email.");
       return;
    }
    
    setIsSubmitting(true);
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      
      // Need to query all orders to find the max portalId for today
      // Assuming we have to fetch them, but since we're in a component we can just use getDocs
      const ordersQuery = query(collection(db, 'orders'), where('createdAt', '>=', todayStart.toISOString()), where('createdAt', '<=', todayEnd.toISOString()));
      const ordersSnapshot = await getDocs(ordersQuery);
      
      const yy = String(todayStart.getFullYear()).slice(-2);
      const mm = String(todayStart.getMonth() + 1).padStart(2, '0');
      const dd = String(todayStart.getDate()).padStart(2, '0');
      const prefix = `${yy}${mm}${dd}-`;

      let maxCount = 0;
      ordersSnapshot.forEach(docSnap => {
          const data = docSnap.data();
          if (data.portalId && data.portalId.startsWith(prefix)) {
             const suffix = data.portalId.split('-')[1];
             if (suffix) {
                const numericCount = parseInt(suffix, 10);
                if (!isNaN(numericCount) && numericCount > maxCount) {
                   maxCount = numericCount;
                }
             }
          }
      });

      const count = maxCount + 1;
      const portalId = `${prefix}${count}`;

      const payload = {
        id: `quote-${Date.now()}`,
        portalId: portalId,
        customerId: customerId,
        title: `Quote Request from ${contactName}`,
        statusIndex: 0, // 0 = Request Created (Quote)
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric'}),
        createdAt: new Date().toISOString(),
        items: products.map(p => {
           const sizeQtySum = p.sizes ? Object.values(p.sizes).reduce((acc: number, val: any) => acc + (parseInt(val.toString()) || 0), 0) : 0;
           return {
              id: p.id || Date.now(),
              style: p.garmentName || 'Custom Garment',
              color: p.color || '',
              qty: sizeQtySum || p.qty || 0,
              image: p.artworkUrl || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200',
              notes: p.logoPlacement ? `Mockup Placement: ${p.logoPlacement}` : '',
              sizes: p.sizes || {},
              artworks: p.artworkUrl ? [{ url: p.artworkUrl, originalUrl: p.artworkUrl, name: p.artworkName || 'Artwork' }] : []
           };
        }),
        shippingAddress: {
           street1: shippingAddress.line1,
           city: shippingAddress.city,
           state: shippingAddress.state,
           zip: shippingAddress.zip,
           country: shippingAddress.country,
           name: orderOnBehalf.contactPerson || contactName
        },
        contactDetails: {
           name: contactName,
           email: emailAddress,
           phone: phone
        },
        inHandsDate: inHandsDate,
        notes: notes,
        budgetTier: budgetTier,
        activities: [{
          id: `act-${Date.now()}`,
          type: 'system',
          message: `Quote request submitted by ${contactName}`,
          user: emailAddress,
          timestamp: new Date().toISOString()
        }]
      };

      await setDoc(doc(db, 'orders', payload.id), payload);
      alert("Quote Request Successfully Submitted!");
      navigate(`/portal/${customerId}`);
    } catch (err) {
      console.error("Error submitting quote:", err);
      alert("There was an error submitting your quote request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto w-full flex flex-col gap-8 animate-in fade-in zoom-in-95 duration-300 pb-20">
      {/* Header Area */}
      <div className="flex items-center justify-between mt-4">
        <button 
          onClick={handleBack}
          className="flex items-center gap-2 text-neutral-500 hover:text-black transition-colors font-medium text-sm group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          Back to Orders
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-serif text-neutral-900 tracking-tight flex items-center gap-4">
          Request New Quote
        </h1>
        <p className="text-neutral-500 font-medium text-sm max-w-xl leading-relaxed">
          Submit your project details for pricing
        </p>
      </div>

      <div className="flex flex-col gap-8 mt-4">
        
        {/* Contact Information & Project Details side-by-side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Contact Information */}
          <div className="bg-white rounded-3xl p-6 shadow-[0_4px_24px_rgb(0,0,0,0.02)] border border-neutral-100 flex flex-col gap-4 relative animate-in fade-in duration-300">
              <div>
                  <h2 className="text-lg font-bold text-neutral-900">Contact Information</h2>
                  <p className="text-xs text-neutral-500 mt-0.5">Provide your contact details so we can reach you about your quote</p>
              </div>
              
              <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Contact Name</label>
                      <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} className="w-full bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-black rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none placeholder:text-neutral-400 transition-all font-bold" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Email Address</label>
                      <input type="email" value={emailAddress} onChange={e => setEmailAddress(e.target.value)} className="w-full bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-black rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none placeholder:text-neutral-400 transition-all font-bold" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Phone Number (Optional)</label>
                      <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-black rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none placeholder:text-neutral-400 transition-all font-bold" />
                  </div>
              </div>
          </div>

          {/* Project Details & Timeline */}
          <div className="bg-white rounded-3xl p-6 shadow-[0_4px_24px_rgb(0,0,0,0.02)] border border-neutral-100 flex flex-col gap-4 relative animate-in fade-in duration-300">
              <div>
                  <h2 className="text-lg font-bold text-neutral-900">Project Details & Timeline</h2>
                  <p className="text-xs text-neutral-500 mt-0.5">Project timeline, requirements, and budget expectations</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">In-Hands Date</label>
                      <input type="date" value={inHandsDate} onChange={e => setInHandsDate(e.target.value)} className="w-full bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-black rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none transition-all font-bold" />
                  </div>

                  <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Budget Tier</label>
                      <div className="relative">
                          <select value={budgetTier} onChange={e => setBudgetTier(e.target.value)} className="w-full appearance-none bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-black rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none cursor-pointer font-bold">
                              <option value="">Choose a pricing tier</option>
                              <option value="economy">Economy / Promo</option>
                              <option value="standard">Standard / Retail</option>
                              <option value="premium">Premium / Custom Cut & Sew</option>
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" size={16} />
                      </div>
                  </div>
              </div>

              <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Additional Notes (Optional)</label>
                  <textarea 
                      rows={3}
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Any special requirements, color preferences, or additional details..." 
                      className="w-full bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-black rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none placeholder:text-neutral-400 transition-all resize-none font-bold font-sans" 
                  />
              </div>

              {/* Optional Section Toggles */}
              <div className="flex flex-wrap items-center gap-6 mt-2 pt-2 border-t border-neutral-100">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={showOnBehalf} 
                    onChange={(e) => setShowOnBehalf(e.target.checked)} 
                    className="w-4 h-4 rounded border-neutral-300 text-black focus:ring-black accent-black"
                  />
                  <span className="text-xs font-bold text-neutral-700">Order on behalf of someone else</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={showShipping} 
                    onChange={(e) => setShowShipping(e.target.checked)} 
                    className="w-4 h-4 rounded border-neutral-300 text-black focus:ring-black accent-black"
                  />
                  <span className="text-xs font-bold text-neutral-700">Ship request to custom address</span>
                </label>
              </div>

              {/* On Behalf Of Fields (Conditional) */}
              {showOnBehalf && (
                <div className="bg-neutral-50/50 rounded-2xl p-4 border border-neutral-200/50 flex flex-col gap-3 mt-1 animate-in slide-in-from-top-3 duration-200">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Ordering on Behalf Of</h3>
                    <button type="button" onClick={() => { setShowOnBehalf(false); setOrderOnBehalf({department: '', contactPerson: ''}); }} className="text-[10px] font-bold text-red-500 hover:underline">Remove</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-neutral-700">Department/Team</label>
                          <input type="text" value={orderOnBehalf.department} onChange={e => setOrderOnBehalf(prev => ({...prev, department: e.target.value}))} placeholder="e.g., Marketing, Sales, HR" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none focus:border-black transition-all font-bold" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-neutral-700">Contact Person</label>
                          <input type="text" value={orderOnBehalf.contactPerson} onChange={e => setOrderOnBehalf(prev => ({...prev, contactPerson: e.target.value}))} placeholder="Person you're ordering for" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none focus:border-black transition-all font-bold" />
                      </div>
                  </div>
                </div>
              )}

              {/* Shipping Address Fields (Conditional) */}
              {showShipping && (
                <div className="bg-neutral-50/50 rounded-2xl p-4 border border-neutral-200/50 flex flex-col gap-3 mt-1 animate-in slide-in-from-top-3 duration-200">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Shipping Address</h3>
                    <button type="button" onClick={() => { setShowShipping(false); setShippingAddress({line1: '', line2: '', city: '', state: '', zip: '', country: 'US'}); }} className="text-[10px] font-bold text-red-500 hover:underline">Remove</button>
                  </div>
                  <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-neutral-700">Address Line 1</label>
                          <input type="text" value={shippingAddress.line1} onChange={e => setShippingAddress(prev => ({...prev, line1: e.target.value}))} placeholder="Street address" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none focus:border-black transition-all font-bold" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-neutral-700">Address Line 2 (Optional)</label>
                          <input type="text" value={shippingAddress.line2} onChange={e => setShippingAddress(prev => ({...prev, line2: e.target.value}))} placeholder="Apt, suite, unit, etc." className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none focus:border-black transition-all font-bold" />
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="flex flex-col gap-1.5">
                              <label className="text-xs font-bold text-neutral-700">City</label>
                              <input type="text" value={shippingAddress.city} onChange={e => setShippingAddress(prev => ({...prev, city: e.target.value}))} placeholder="City" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none focus:border-black transition-all font-bold" />
                          </div>
                          <div className="flex flex-col gap-1.5">
                              <label className="text-xs font-bold text-neutral-700">State/Province</label>
                              <input type="text" value={shippingAddress.state} onChange={e => setShippingAddress(prev => ({...prev, state: e.target.value}))} placeholder="State" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none focus:border-black transition-all font-bold" />
                          </div>
                          <div className="flex flex-col gap-1.5">
                              <label className="text-xs font-bold text-neutral-700">ZIP Code</label>
                              <input type="text" value={shippingAddress.zip} onChange={e => setShippingAddress(prev => ({...prev, zip: e.target.value}))} placeholder="ZIP" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none focus:border-black transition-all font-bold" />
                          </div>
                          <div className="flex flex-col gap-1.5">
                              <label className="text-xs font-bold text-neutral-700">Country</label>
                              <input type="text" value={shippingAddress.country} onChange={e => setShippingAddress(prev => ({...prev, country: e.target.value}))} placeholder="Country" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none focus:border-black transition-all font-bold" />
                          </div>
                      </div>
                  </div>
                </div>
              )}
          </div>
        </div>

        {/* Library Selector */}
        <div className="bg-white rounded-3xl p-8 shadow-[0_4px_24px_rgb(0,0,0,0.02)] border border-neutral-100 flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold text-neutral-900">Select Garments from Library</h2>
            <p className="text-sm text-neutral-500">Choose from suggested, past, or catalog garments to add to your quote request</p>
          </div>
          
          <div className="flex gap-4 border-b border-neutral-100 pb-3 overflow-x-auto">
            {['rack', 'wovn', 'suggested', 'past'].map((tab) => {
              const label = tab === 'rack' ? 'Design Your Rack' : tab === 'wovn' ? 'WOVN Catalog' : tab === 'suggested' ? 'Suggested Items' : 'Past Garments';
              const count = tab === 'rack' 
                ? activeRackItems.length 
                : tab === 'wovn' 
                  ? wovnRack.length 
                  : tab === 'suggested' 
                    ? suggestedItems.length 
                    : pastGarments.length;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveLibraryTab(tab)}
                  className={`text-sm font-bold pb-2 border-b-2 whitespace-nowrap transition-all ${
                    activeLibraryTab === tab 
                      ? 'text-black border-black' 
                      : 'text-neutral-400 border-transparent hover:text-black hover:border-black'
                  }`}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>

          {activeLibraryTab === 'rack' && (
            <div className="flex flex-wrap gap-2 pb-2 border-b border-neutral-100">
              {Object.keys(customerRacks).map((catName) => (
                <button
                  key={catName}
                  type="button"
                  onClick={() => setActiveRackCategory(catName)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                    activeRackCategory === catName
                      ? 'bg-black text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {catName}
                </button>
              ))}
            </div>
          )}

          {isLoadingLibrary ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-neutral-400" size={24} />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[300px] overflow-y-auto pr-1">
              {activeLibraryTab === 'rack' && activeRackItems.map((item, idx) => (
                <div 
                  key={item.id || `${item.style}-${idx}`} 
                  onClick={() => handleAddProductFromLibrary(item)}
                  className="group bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 hover:border-black/30 rounded-2xl p-4 flex flex-col items-center text-center cursor-pointer transition-all shadow-[0_2px_8px_rgb(0,0,0,0.01)] hover:shadow-md"
                >
                  <div className="w-16 h-16 bg-white border border-neutral-100 rounded-xl overflow-hidden flex items-center justify-center p-1 mb-2">
                    <img 
                      src={getGarmentImage(item)} 
                      alt={item.title || item.style} 
                      className="max-w-full max-h-full object-contain mix-blend-multiply" 
                    />
                  </div>
                  <p className="font-bold text-xs text-neutral-900 truncate w-full">{item.title || item.style}</p>
                  <p className="text-[10px] text-neutral-500 truncate w-full mt-0.5">{item.style || 'Catalog'}</p>
                  <span className="text-[10px] font-bold text-black mt-2 group-hover:scale-105 transition-transform">+ Add to Request</span>
                </div>
              ))}

              {activeLibraryTab === 'wovn' && wovnRack.map((item, idx) => (
                <div 
                  key={item.id || idx} 
                  onClick={() => handleAddProductFromLibrary(item)}
                  className="group bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 hover:border-black/30 rounded-2xl p-4 flex flex-col items-center text-center cursor-pointer transition-all shadow-[0_2px_8px_rgb(0,0,0,0.01)] hover:shadow-md"
                >
                  <div className="w-16 h-16 bg-white border border-neutral-100 rounded-xl overflow-hidden flex items-center justify-center p-1 mb-2">
                    <img src={item.image || item.original_image || item.mockup_image || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200'} alt={item.style || item.name} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                  </div>
                  <p className="font-bold text-xs text-neutral-900 truncate w-full">{item.style || item.name || item.garment_name}</p>
                  <p className="text-[10px] text-neutral-500 truncate w-full mt-0.5">{item.itemNum || item.garment_id || 'Catalog'}</p>
                  <span className="text-[10px] font-bold text-black mt-2 group-hover:scale-105 transition-transform">+ Add to Request</span>
                </div>
              ))}
              
              {activeLibraryTab === 'suggested' && suggestedItems.map((item, idx) => (
                <div 
                  key={item.id || idx} 
                  onClick={() => handleAddProductFromLibrary(item)}
                  className="group bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 hover:border-black/30 rounded-2xl p-4 flex flex-col items-center text-center cursor-pointer transition-all shadow-[0_2px_8px_rgb(0,0,0,0.01)] hover:shadow-md"
                >
                  <div className="w-16 h-16 bg-white border border-neutral-100 rounded-xl overflow-hidden flex items-center justify-center p-1 mb-2">
                    <img src={item.image || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200'} alt={item.style} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                  </div>
                  <p className="font-bold text-xs text-neutral-900 truncate w-full">{item.style}</p>
                  <p className="text-[10px] text-neutral-500 truncate w-full mt-0.5">{item.itemNum || 'Suggested'}</p>
                  <span className="text-[10px] font-bold text-black mt-2 group-hover:scale-105 transition-transform">+ Add to Request</span>
                </div>
              ))}

              {activeLibraryTab === 'past' && pastGarments.map((item, idx) => (
                <div 
                  key={item.id || idx} 
                  onClick={() => handleAddProductFromLibrary(item)}
                  className="group bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 hover:border-black/30 rounded-2xl p-4 flex flex-col items-center text-center cursor-pointer transition-all shadow-[0_2px_8px_rgb(0,0,0,0.01)] hover:shadow-md"
                >
                  <div className="w-16 h-16 bg-white border border-neutral-100 rounded-xl overflow-hidden flex items-center justify-center p-1 mb-2">
                    <img src={item.image || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200'} alt={item.style} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                  </div>
                  <p className="font-bold text-xs text-neutral-900 truncate w-full">{item.style}</p>
                  <p className="text-[10px] text-neutral-500 truncate w-full mt-0.5">{item.itemNum || 'Past Order'}</p>
                  <span className="text-[10px] font-bold text-black mt-2 group-hover:scale-105 transition-transform">+ Add to Request</span>
                </div>
              ))}

              {activeLibraryTab === 'rack' && activeRackItems.length === 0 && (
                <p className="col-span-full text-center py-6 text-sm text-neutral-400 italic">No rack garments configured.</p>
              )}
              {activeLibraryTab === 'wovn' && wovnRack.length === 0 && (
                <p className="col-span-full text-center py-6 text-sm text-neutral-400 italic">No catalog garments linked.</p>
              )}
              {activeLibraryTab === 'suggested' && suggestedItems.length === 0 && (
                <p className="col-span-full text-center py-6 text-sm text-neutral-400 italic">No suggested items recommendation found.</p>
              )}
              {activeLibraryTab === 'past' && pastGarments.length === 0 && (
                <p className="col-span-full text-center py-6 text-sm text-neutral-400 italic">No past orders found to pull items from.</p>
              )}
            </div>
          )}
        </div>

        {/* Products */}
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-bold text-neutral-900">Products</h2>
                    <p className="text-sm text-neutral-500">Add one or more products to your quote</p>
                </div>
                <button 
                  onClick={handleAddProduct}
                  className="bg-white border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 text-neutral-900 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm"
                >
                  <Plus size={16} /> Add Another Product
                </button>
            </div>

            {products.map((product, index) => {
              const N = getActiveSidesCountForProduct(product);
              const isHovered = hoveredProductId === product.id;
              const translatePercentage = isHovered && N > 1 ? (100 / N) : 0;
              const isCustomized = product.customized;

              return (
                <div key={product.id} className="bg-white rounded-3xl p-6 shadow-[0_4px_24px_rgb(0,0,0,0.02)] border border-neutral-100 flex flex-col gap-5 relative animate-in slide-in-from-bottom-4 fade-in duration-300">
                  
                  {/* Top Header Section */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
                    <div className="flex gap-4 items-center">
                      {/* Thumbnail Box */}
                      <div 
                        onMouseEnter={() => setHoveredProductId(product.id)}
                        onMouseLeave={() => setHoveredProductId(null)}
                        className="w-16 h-16 rounded-xl overflow-hidden bg-neutral-50 border border-neutral-100 shrink-0 relative flex items-center justify-start cursor-pointer"
                        title="Hover to slide mockup"
                      >
                        <img 
                          src={product.artworkUrl || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200'} 
                          alt={product.garmentName} 
                          style={{
                            width: isCustomized ? `${N * 100}%` : '100%',
                            height: '100%',
                            maxWidth: 'none',
                            transform: isCustomized ? `translateX(-${translatePercentage}%)` : 'none',
                            transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                          }}
                          className="object-cover mix-blend-multiply select-none"
                        />
                      </div>

                      {/* Garment Details & Placement summary */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="w-5 h-5 rounded-full bg-neutral-100 flex items-center justify-center text-[10px] font-bold text-neutral-400 shrink-0">{index + 1}</span>
                          {product.itemNum ? (
                            <h3 className="text-md font-bold text-neutral-900 truncate">{product.garmentName}</h3>
                          ) : (
                            <input
                              type="text"
                              value={product.garmentName || ''}
                              onChange={(e) => setProducts(prev => prev.map((p: any) => p.id === product.id ? { ...p, garmentName: e.target.value } : p))}
                              placeholder="Enter garment name/type..."
                              className="bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1 text-xs font-bold text-neutral-900 focus:outline-none focus:border-neutral-450 focus:bg-white placeholder:text-neutral-400 transition-all w-[200px]"
                            />
                          )}
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-500 font-medium mt-1">
                          {product.itemNum && <span className="font-semibold text-neutral-600 bg-neutral-100 px-1.5 py-0.5 rounded">{product.itemNum}</span>}
                          {isCustomized ? (
                            <span className="text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                              <Sparkles size={10} /> Customized Mockup
                            </span>
                          ) : (
                            <span className="text-neutral-400 font-bold bg-neutral-100 px-1.5 py-0.5 rounded">Blank Design</span>
                          )}
                          {product.color && <span className="uppercase tracking-wide text-[10px] bg-neutral-50 px-1.5 py-0.5 rounded border border-neutral-200 font-bold">{product.color}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Product Header Actions */}
                    <div className="flex items-center gap-2 self-end md:self-auto">
                      <button
                        type="button"
                        onClick={() => setCustomizingProduct(product)}
                        className="bg-neutral-900 hover:bg-neutral-800 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                      >
                        <Sparkles size={12} className="text-white animate-pulse" /> 
                        <span>{isCustomized ? 'Edit Customization' : 'Open Mockup Creator'}</span>
                      </button>
                      {products.length > 1 && (
                        <button 
                          onClick={() => handleRemoveProduct(product.id)} 
                          className="text-neutral-400 hover:text-red-500 transition-colors p-2 cursor-pointer"
                          title="Remove product"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Customization Details & Sizing matrix */}
                  <div className="flex flex-col gap-4">
                    {/* Sizing Matrix */}
                    <div className="bg-neutral-50 rounded-2xl p-4 flex flex-col items-start border border-neutral-100 gap-3">
                       <div className="flex justify-between items-center w-full">
                         <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Quantities by Size</span>
                         <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                           Total Qty: {Object.values(product.sizes || {}).reduce((sum: number, val: any) => sum + (parseInt(val.toString()) || 0), 0) as number} units
                         </span>
                       </div>
                       <div className="flex flex-wrap gap-2 w-full">
                         {['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'OSFA'].map((size) => (
                           <div key={size} className="flex-1 min-w-[50px] flex flex-col bg-white border border-neutral-200 rounded-lg overflow-hidden focus-within:border-black focus-within:ring-1 focus-within:ring-black transition-all">
                             <div className="bg-neutral-100 text-neutral-600 text-[10px] font-bold py-1.5 uppercase tracking-wide flex items-center justify-center border-b border-neutral-200">
                               {size}
                             </div>
                             <input 
                               type="number"
                               min="0"
                               value={product.sizes?.[size] || ''}
                               placeholder="0"
                               onChange={(e) => {
                                 const val = parseInt(e.target.value) || 0;
                                 setProducts(prev => prev.map((p: any) => p.id === product.id ? { 
                                   ...p, 
                                   sizes: { ...(p.sizes || {}), [size]: val } 
                                 } : p));
                               }}
                               className="w-full h-10 text-center text-sm font-bold text-neutral-900 focus:outline-none placeholder:text-neutral-300 font-bold"
                             />
                           </div>
                         ))}
                       </div>
                    </div>

                    {/* Placements & Uploads (only visible if NOT customized) */}
                    {!isCustomized && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-neutral-100 pt-4 animate-in fade-in duration-200">
                        {/* Manual Design Placements */}
                        <div className="flex flex-col gap-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Design Placements</label>
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            {['Front', 'Back', 'Left Chest', 'Right Chest', 'Left Sleeve', 'Right Sleeve'].map((placement) => {
                              const isChecked = product.manualPlacements?.[placement] || false;
                              return (
                                <label key={placement} className={`flex items-center gap-2 p-2.5 border rounded-xl cursor-pointer transition-all ${
                                  isChecked ? 'bg-black text-white border-black' : 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-800'
                                }`}>
                                  <input 
                                    type="checkbox" 
                                    checked={isChecked}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setProducts(prev => prev.map((p: any) => p.id === product.id ? {
                                        ...p,
                                        manualPlacements: { ...(p.manualPlacements || {}), [placement]: checked },
                                        logoPlacement: Object.entries({ ...(p.manualPlacements || {}), [placement]: checked })
                                          .filter(([_, v]) => v)
                                          .map(([k]) => k)
                                          .join(', ')
                                      } : p));
                                    }}
                                    className="w-3.5 h-3.5 rounded border-neutral-300 text-black focus:ring-black accent-black" 
                                  />
                                  <span className="text-xs font-bold">{placement}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        {/* Manual Artwork File Uploader */}
                        <div className="flex flex-col gap-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Artwork File</label>
                          {product.isUploading ? (
                            <div className="border border-dashed border-neutral-200 rounded-xl p-6 flex flex-col items-center justify-center text-center gap-2 bg-neutral-50">
                              <Loader2 className="animate-spin text-black" size={20} />
                              <p className="text-xs font-bold text-neutral-900">Uploading artwork...</p>
                            </div>
                          ) : product.artworkUrl && product.artworkUrl !== 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200' ? (
                            <div className="border border-neutral-200 rounded-xl p-4 flex items-center justify-between gap-3 bg-neutral-50 relative group">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-lg overflow-hidden bg-white border border-neutral-200 flex items-center justify-center p-1 shrink-0">
                                   {product.artworkUrl.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i) ? (
                                      <img src={product.artworkUrl} alt={product.artworkName || 'Artwork'} className="max-w-full max-h-full object-contain" />
                                   ) : (
                                      <FileText size={16} className="text-neutral-500" />
                                   )}
                                </div>
                                <span className="text-xs font-bold text-neutral-900 truncate">{product.artworkName}</span>
                              </div>
                              <button 
                                onClick={() => setProducts(prev => prev.map((p: any) => p.id === product.id ? {...p, artworkUrl: null, artworkName: null} : p))} 
                                className="text-xs font-bold text-red-500 hover:text-red-700 cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <label className="border border-dashed border-neutral-200 rounded-xl p-6 flex flex-col items-center justify-center text-center gap-2 hover:bg-neutral-50 hover:border-neutral-300 transition-all cursor-pointer group">
                              <input type="file" className="hidden" onChange={(e) => handleFileUpload(product.id, e)} accept="image/*,application/pdf,.ai,.eps,.psd,.cdr,.zip" />
                              <Upload size={16} className="text-neutral-500 group-hover:scale-110 transition-transform" />
                              <div>
                                <p className="text-xs font-bold text-neutral-900">Upload design file</p>
                                <p className="text-[10px] text-neutral-500">PDF, AI, PNG, JPEG, ZIP (Max 10MB)</p>
                              </div>
                            </label>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Placements & Artwork Summary (only visible if customized) */}
                    {isCustomized && (
                      <div className="text-xs font-semibold text-neutral-500 bg-neutral-50 px-4 py-3 rounded-xl border border-neutral-100 flex flex-wrap gap-x-4 gap-y-1 animate-in fade-in duration-200">
                        {product.logoUrl && <span>• <b>Front Placement:</b> {product.logoName || 'Logo'}</span>}
                        {product.logoUrlBack && <span>• <b>Back Placement:</b> {product.logoNameBack || 'Logo'}</span>}
                        {product.logoUrlLeftSleeve && <span>• <b>Left Sleeve:</b> {product.logoNameLeftSleeve || 'Logo'}</span>}
                        {product.logoUrlRightSleeve && <span>• <b>Right Sleeve:</b> {product.logoNameRightSleeve || 'Logo'}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>


        {/* Actions */}
        <div className="flex items-center gap-4 mt-4">
            <button disabled={isSubmitting} onClick={handleSubmit} className="flex-1 bg-black text-white py-4 rounded-xl text-sm font-bold tracking-wide hover:bg-neutral-800 transition-all shadow-md flex justify-center items-center gap-2">
                {isSubmitting ? (
                   <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                ) : (
                   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                   </svg>
                )}
                {isSubmitting ? "Submitting Request..." : "Submit Quote Request"}
            </button>
            <button 
                onClick={handleBack}
                className="bg-white border border-neutral-200 text-neutral-900 px-8 py-4 rounded-xl text-sm font-bold hover:bg-neutral-50 transition-all shadow-sm"
            >
                Cancel
            </button>
        </div>

      </div>
      {customizingProduct && (
        <GarmentCustomizerModal
          isOpen={!!customizingProduct}
          onClose={() => setCustomizingProduct(null)}
          garment={{
            id: customizingProduct.id,
            style: customizingProduct.garmentName,
            itemNum: customizingProduct.itemNum,
            image: customizingProduct.artworkUrl,
            images: customizingProduct.images || null,
            backImages: customizingProduct.backImages || null,
            colors: customizingProduct.colors || ['Custom Color'],
            selectedColor: customizingProduct.color
          }}
          customerId={customerId || 'CUS-001'}
          onSave={(customizedData) => {
            setProducts(prev => prev.map(p => p.id === customizingProduct.id ? {
              ...p,
              garmentName: customizedData.style,
              color: customizedData.selectedColor,
              artworkUrl: customizedData.image,
              artworkName: customizedData.logoName ? `Mockup with ${customizedData.logoName}` : 'Customized Mockup',
              customized: true,
              logoPlacement: customizedData.logoPlacement,
              logoUrl: customizedData.logoUrl,
              logoUrlBack: customizedData.logoUrlBack,
              logoNameBack: customizedData.logoNameBack,
              logoUrlLeftSleeve: customizedData.logoUrlLeftSleeve || null,
              logoNameLeftSleeve: customizedData.logoNameLeftSleeve || null,
              logoUrlRightSleeve: customizedData.logoUrlRightSleeve || null,
              logoNameRightSleeve: customizedData.logoNameRightSleeve || null,
              colors: customizedData.colors || p.colors
            } : p));
          }}
        />
      )}
    </div>
  );
}
