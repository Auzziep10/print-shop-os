import { useState, useEffect } from 'react';
import { ArrowLeft, PackagePlus, X, Trash2, ChevronDown, RotateCcw, Calendar, Loader2, Sparkles, Plus } from 'lucide-react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, setDoc } from 'firebase/firestore';
import { GarmentCustomizerModal } from '../../components/Portal/GarmentCustomizerModal';
const findColorsInObj = (obj: any, maxDepth = 4): string[] | null => {
  if (!obj || typeof obj !== 'object' || maxDepth === 0) return null;
  const colorKeys = ['availableColors', 'available_colors', 'colors', 'Colors', 'color', 'Color', 'AvailableColors'];
  for (const k of colorKeys) {
      if (obj[k]) {
          const val = obj[k];
          if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string') return val;
          if (typeof val === 'string' && val.trim().length > 0) return val.split(',').map(s=>s.trim());
      }
  }
  if (Array.isArray(obj)) {
      for (const i of obj) {
          const res = findColorsInObj(i, maxDepth - 1);
          if (res) return res;
      }
  } else {
      for (const k of Object.keys(obj)) {
          if (typeof obj[k] === 'object') {
              const res = findColorsInObj(obj[k], maxDepth - 1);
              if (res) return res;
          }
      }
  }
  return null;
};

const parseSizesFromItem = (item: any, style = ''): string[] => {
  let sizes: string[] = [];
  if (Array.isArray(item.sizes) && item.sizes.length > 0) {
      sizes = item.sizes;
  } else if (typeof item.sizes === 'string' && item.sizes.trim()) {
      sizes = item.sizes.split(',').map((s:string) => s.trim());
  } else if (Array.isArray(item.availableSizes) && item.availableSizes.length > 0) {
      sizes = item.availableSizes;
  } else if (typeof item.availableSizes === 'string' && item.availableSizes.trim()) {
      sizes = item.availableSizes.split(',').map((s:string) => s.trim());
  } else if (item.sizeSpread && typeof item.sizeSpread === 'string' && item.sizeSpread.trim()) {
      sizes = item.sizeSpread.split(',').map((s:string) => s.trim());
  } else if (item.size_spread && typeof item.size_spread === 'string' && item.size_spread.trim()) {
      sizes = item.size_spread.split(',').map((s:string) => s.trim());
  } else if (Array.isArray(item.variations) && item.variations[0]?.sizes) {
      sizes = item.variations[0].sizes;
  } else if (style.toLowerCase().includes('chill') || style.toLowerCase().includes('tumbler') || style.toLowerCase().includes('bag') || style.toLowerCase().includes('hat')) {
      sizes = ['OSFA'];
  }
  if (sizes.length === 0) {
      sizes = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
  }
  return sizes;
};

export function PortalCreateOrder() {
  const navigate = useNavigate();
  const { customerId } = useParams();
  const location = useLocation();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [customerDecks, setCustomerDecks] = useState<any[]>([]);
  const [isLoadingDecks, setIsLoadingDecks] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previousOrders, setPreviousOrders] = useState<any[]>([]);
  const [isLoadingPreviousOrders, setIsLoadingPreviousOrders] = useState(true);
  const [isRepeatModalOpen, setIsRepeatModalOpen] = useState(false);
  const [hasWovnRack, setHasWovnRack] = useState(false);
  const [activeLibraryTab, setActiveLibraryTab] = useState('wovn');
  const [suggestedItems, setSuggestedItems] = useState<any[]>([]);
  const [pastGarments, setPastGarments] = useState<any[]>([]);
  const [customizingItem, setCustomizingItem] = useState<any | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

  const [pendingPreselected, setPendingPreselected] = useState<any[] | null>(null);

  useEffect(() => {
    if (location.state?.preselectedItems && Array.isArray(location.state.preselectedItems)) {
      setPendingPreselected(location.state.preselectedItems);
      // Clear location state to avoid repeating on reload
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const mapPrevItemToBuilderItem = (item: any, decks: any[]) => {
    const quantities = item.sizes || {};
    
    const matchingCatalogGarment = decks.find(dItem => 
      (dItem.garment_id || dItem.sku || dItem.id) === item.itemNum ||
      (dItem.garment_name || dItem.name || dItem.style || dItem.title) === item.style
    );
    
    let colors = ['Custom Color'];
    if (matchingCatalogGarment) {
      const catalogColors = findColorsInObj({ ...matchingCatalogGarment });
      if (catalogColors && catalogColors.length > 0) {
        colors = catalogColors;
      }
    } else if (item.color) {
      colors = [item.color];
    }
    
    const sizes = parseSizesFromItem(matchingCatalogGarment || {}, item.style || '');
    
    const quantitiesMap: any = {};
    sizes.forEach((s: string) => {
      quantitiesMap[s] = 0;
    });
    
    Object.keys(quantities).forEach((s: string) => {
      quantitiesMap[s] = quantities[s] || 0;
    });

    const artwork = item.artworks?.[0] || {};

    return {
      instanceId: Math.random().toString(36).substring(7),
      style: item.style || 'Custom Garment',
      itemNum: item.itemNum || '',
      gender: item.gender || 'Unisex',
      price: item.price || 0,
      image: item.image || '',
      colors: colors,
      selectedColor: item.color || colors[0],
      quantities: quantitiesMap,
      sizes: sizes,
      customized: item.customized || false,
      logoPlacement: item.notes?.replace('Mockup Placement: ', '') || '',
      logoUrl: artwork.url || item.logoUrl || null,
      logoName: artwork.name || item.logoName || null,
      logoUrlBack: item.logoUrlBack || null,
      logoNameBack: item.logoNameBack || null,
      logoUrlLeftSleeve: item.logoUrlLeftSleeve || null,
      logoNameLeftSleeve: item.logoNameLeftSleeve || null,
      logoUrlRightSleeve: item.logoUrlRightSleeve || null,
      logoNameRightSleeve: item.logoNameRightSleeve || null
    };
  };

  useEffect(() => {
    if (pendingPreselected && !isLoadingDecks) {
      const mapped = pendingPreselected.map(item => mapPrevItemToBuilderItem(item, customerDecks));
      setOrderItems(prev => [...prev, ...mapped]);
      setPendingPreselected(null);
    }
  }, [pendingPreselected, isLoadingDecks, customerDecks]);

  useEffect(() => {
    const fetchPreviousOrders = async () => {
      if (!customerId) return;
      setIsLoadingPreviousOrders(true);
      try {
        const q = query(
          collection(db, 'orders'),
          where('customerId', '==', customerId)
        );
        const querySnapshot = await getDocs(q);
        const ordersList: any[] = [];
        querySnapshot.forEach((docSnap) => {
          ordersList.push(docSnap.data());
        });
        ordersList.sort((a, b) => {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeB - timeA;
        });
        setPreviousOrders(ordersList);

        // Compute unique past garments
        const uniqueGarmentsMap: Record<string, any> = {};
        ordersList.forEach((orderData) => {
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
      } catch (err) {
        console.error("Failed to fetch previous orders", err);
      } finally {
        setIsLoadingPreviousOrders(false);
      }
    };
    fetchPreviousOrders();
  }, [customerId]);

  const handleRepeatOrder = (prevOrder: any) => {
    if (!prevOrder || !Array.isArray(prevOrder.items)) return;

    const newItems = prevOrder.items.map((item: any) => {
      const quantities = item.sizes || {};
      
      const matchingCatalogGarment = customerDecks.find(dItem => 
        (dItem.garment_id || dItem.sku || dItem.id) === item.itemNum ||
        (dItem.garment_name || dItem.name || dItem.style || dItem.title) === item.style
      );
      
      let colors = ['Custom Color'];
      if (matchingCatalogGarment) {
        const catalogColors = findColorsInObj({ ...matchingCatalogGarment });
        if (catalogColors && catalogColors.length > 0) {
          colors = catalogColors;
        }
      } else if (item.color) {
        colors = [item.color];
      }
      
      const sizes = parseSizesFromItem(matchingCatalogGarment || {}, item.style || '');
      
      const quantitiesMap: any = {};
      sizes.forEach((s: string) => {
        quantitiesMap[s] = 0;
      });
      
      Object.keys(quantities).forEach((s: string) => {
        quantitiesMap[s] = quantities[s] || 0;
      });

      return {
        instanceId: Math.random().toString(36).substring(7),
        style: item.style || 'Custom Garment',
        itemNum: item.itemNum || '',
        gender: item.gender || 'Unisex',
        price: item.price || 0,
        image: item.image || '',
        colors: colors,
        selectedColor: item.color || colors[0],
        quantities: quantitiesMap,
        sizes: sizes
      };
    });

    setOrderItems(newItems);
    setIsRepeatModalOpen(false);
  };

  useEffect(() => {
    const fetchDecks = async () => {
      if (!customerId) return;
      setIsLoadingDecks(true);
      
      try {
        const customerDoc = await getDoc(doc(db, 'customers', customerId));
        if (customerDoc.exists()) {
          const customerData = customerDoc.data();
          // Support both array and single string for backwards compatibility
          const deckIds = customerData.catalogLinkIds || (customerData.catalogLinkId ? [customerData.catalogLinkId] : []);
          const isRackActive = deckIds.length > 0;
          setHasWovnRack(isRackActive);
          setSuggestedItems(customerData.suggestedItems || []);
          if (!isRackActive) {
            setActiveLibraryTab(customerData.suggestedItems && customerData.suggestedItems.length > 0 ? 'suggested' : 'past');
          }
          
          if (deckIds.length > 0) {
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
            
            // The API returns an array for each deck request. Flatten them all together.
            const validArrays = fetchedArrays.filter(d => d !== null && Array.isArray(d));
            const flatDecks = validArrays.flat();
            setCustomerDecks(flatDecks);
          }
        }
      } catch (err) {
         console.error("Error fetching customer or decks", err);
      } finally {
        setIsLoadingDecks(false);
      }
    };
    
    fetchDecks();
  }, [customerId]);

  const handleBack = () => {
    navigate(customerId ? `/portal/${customerId}` : '/portal');
  };

  const handleSubmitOrder = async () => {
    if (!customerId || orderItems.length === 0) return;
    setIsSubmitting(true);
    
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      
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

      const orderId = `order-${Date.now()}`;
      
      const payload = {
        id: orderId,
        portalId: portalId,
        customerId: customerId,
        title: `Portal Order - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric'})}`,
        statusIndex: 0, 
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric'}),
        createdAt: new Date().toISOString(),
        totalAmount: Math.round(orderItems.reduce((sum, item) => {
           const totalQty = Object.values(item.quantities as Record<string, number>).reduce((q, val) => q + val, 0);
           return sum + (totalQty * (parseFloat(item.price) || 0));
        }, 0) * 100) / 100,
        items: orderItems.map(item => {
           const totalQty = Object.values(item.quantities as Record<string, number>).reduce((q, val) => q + val, 0);
           const p = parseFloat(item.price) || 0;
           return {
             id: item.instanceId || Date.now().toString(),
             style: item.style || 'Custom Garment',
             color: item.selectedColor || '',
             price: Math.round(p * 100) / 100,
             total: Math.round(p * totalQty * 100) / 100,
             itemNum: item.itemNum || '',
             gender: item.gender || 'Unisex',
             qty: totalQty,
             image: item.customized ? item.image : (item.images?.[item.selectedColor] || item.image || ''),
             notes: item.logoPlacement ? `Mockup Placement: ${item.logoPlacement}` : '',
             sizes: item.quantities,
             artworks: item.logoUrl ? [{ url: item.logoUrl, originalUrl: item.logoUrl, name: item.logoName || 'Logo' }] : []
           }
        })
      };

      await setDoc(doc(db, 'orders', orderId), payload);
      navigate(customerId ? `/portal/${customerId}` : '/portal');
    } catch (err) {
      console.error("Failed to submit order", err);
      alert("Failed to submit order. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddItem = (item: any) => {
    // Determine dynamic size run specific to this garment
    const defaultSizes = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
    const itemSizes = item.sizes && item.sizes.length > 0 ? item.sizes : defaultSizes;
    
    // Create zeroed quantity map strictly from the provided sizes
    const qtyMap: any = {};
    itemSizes.forEach((s: string) => qtyMap[s] = 0);

    const newItem = {
      ...item,
      instanceId: Math.random().toString(36).substring(7),
      selectedColor: item.colors?.[0] || 'Custom Color',
      quantities: qtyMap
    };
    setOrderItems(prev => [...prev, newItem]);
    setIsDrawerOpen(false); // smoothly close drawer
  };

  const handleUpdateQuantity = (instanceId: string, size: string, qty: string) => {
    const parsedQty = parseInt(qty) || 0;
    setOrderItems(prev => prev.map(item => {
      if (item.instanceId === instanceId) {
        return {
          ...item,
          quantities: { ...item.quantities, [size]: parsedQty }
        };
      }
      return item;
    }));
  };

  const handleRemoveItem = (instanceId: string) => {
    setOrderItems(prev => prev.filter(item => item.instanceId !== instanceId));
  };

  const getActiveSidesCount = (item: any) => {
    if (!item.customized) return 1;
    let count = 0;
    if (item.logoUrl) count++;
    if (item.logoUrlBack) count++;
    if (item.logoUrlLeftSleeve) count++;
    if (item.logoUrlRightSleeve) count++;
    return count || 1;
  };

  return (
    <div className="max-w-[1200px] mx-auto w-full flex flex-col gap-8 animate-in fade-in zoom-in-95 duration-300">
      {/* Header Area */}
      <div className="flex items-center justify-between mt-4">
        <button 
          onClick={handleBack}
          className="flex items-center gap-2 text-neutral-500 hover:text-black transition-colors font-medium text-sm group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          Back to Orders
        </button>

        {previousOrders.length > 0 && (
          <button 
            onClick={() => setIsRepeatModalOpen(true)}
            className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-neutral-500 hover:text-black hover:underline transition-colors cursor-pointer"
          >
            <RotateCcw size={12} />
            Repeat Past Order
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-serif text-neutral-900 tracking-tight flex items-center gap-4">
          Create New Quote Request
        </h1>
        <p className="text-neutral-500 font-medium text-sm max-w-xl leading-relaxed">
          Use the builder below to select garments, upload artwork, and construct your request. We'll generate mockups and calculate pricing for your review.
        </p>
      </div>

      {/* Builder Layout - Starting simple */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-4">
        
        {/* Left Column: Form / Steps */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {orderItems.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 shadow-[0_4px_24px_rgb(0,0,0,0.02)] border border-neutral-100 flex flex-col gap-6">
              <div>
                <h3 className="text-xl font-serif text-neutral-900">Your Catalog</h3>
                <p className="text-sm font-medium text-neutral-500 mt-1">Select from your approved collection, suggested, or past styles to begin building your order.</p>
              </div>

              {/* Library Tabs */}
              <div className="flex gap-4 border-b border-neutral-100 py-3 overflow-x-auto shrink-0 bg-neutral-50/50 px-4 rounded-xl">
                {hasWovnRack && (
                  <button
                    type="button"
                    onClick={() => setActiveLibraryTab('wovn')}
                    className={`text-sm font-bold pb-1.5 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                      activeLibraryTab === 'wovn' 
                        ? 'text-black border-black' 
                        : 'text-neutral-400 border-transparent hover:text-black hover:border-black'
                    }`}
                  >
                    Approved Library ({customerDecks.reduce((acc, deck) => acc + (deck.items || deck.garments || []).length, 0)})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveLibraryTab('suggested')}
                  className={`text-sm font-bold pb-1.5 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                    activeLibraryTab === 'suggested' 
                      ? 'text-black border-black' 
                      : 'text-neutral-400 border-transparent hover:text-black hover:border-black'
                  }`}
                >
                  Suggested ({suggestedItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLibraryTab('past')}
                  className={`text-sm font-bold pb-1.5 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                    activeLibraryTab === 'past' 
                      ? 'text-black border-black' 
                      : 'text-neutral-400 border-transparent hover:text-black hover:border-black'
                  }`}
                >
                  Past Garments ({pastGarments.length})
                </button>
              </div>

              {/* Library Grid Content */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeLibraryTab === 'wovn' && (
                  isLoadingDecks ? (
                    <div className="col-span-full flex items-center justify-center p-8">
                      <Loader2 className="animate-spin text-neutral-400" size={24} />
                    </div>
                  ) : customerDecks.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center p-8 text-center text-neutral-500">
                      <PackagePlus size={32} className="mb-4 text-neutral-300" />
                      <p>No catalog decks connected for this client.</p>
                    </div>
                  ) : (
                    customerDecks.map((item: any, idx: number) => {
                      const style = item.garment_name || item.name || item.style || item.title || 'Unknown Style';
                      const gender = item.gender || 'Unisex';
                      const itemNum = item.itemNum || item.garment_id || item.sku || item.id || `GARMENT-${idx+1}`;
                      
                      let colors = findColorsInObj({ ...item }) || ['Custom Color'];
                      if (colors.length === 0) colors = ['Custom Color'];
                      
                      let sizes = parseSizesFromItem(item, style);

                      const image = item.mockup_image || item.mock_image || item.original_image || item.image || item.imageUrl || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';
                      
                      const basePrice = parseFloat(item.msrp || item.price || item.unit_cost || 0);
                      const price = basePrice;

                      return (
                        <div 
                          key={item.id || idx} 
                          onClick={() => handleAddItem({ ...item, style, gender, itemNum, colors, sizes, image, price })}
                          className="group flex items-center gap-4 bg-neutral-50/50 border border-neutral-200 hover:border-black transition-colors rounded-2xl p-4 cursor-pointer shadow-[0_2px_10px_rgb(0,0,0,0.01)] hover:shadow-xs"
                        >
                          <div className="w-14 h-14 rounded-xl overflow-hidden bg-white border border-neutral-100 shrink-0 flex items-center justify-center">
                            <img src={image} alt={style} className="w-full h-full object-contain p-1 mix-blend-multiply" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                               <h4 className="font-bold text-neutral-900 text-sm truncate pr-2">{style}</h4>
                               <span className="text-[9px] font-bold text-neutral-500 bg-neutral-200/60 px-2 py-0.5 rounded-full shrink-0">{gender}</span>
                            </div>
                            {itemNum && itemNum.length < 15 && (
                              <p className="text-[10px] font-semibold text-neutral-450">{itemNum}</p>
                            )}
                            <p className="text-[10px] text-neutral-400 font-medium mt-1 truncate">{colors.join(' • ')}</p>
                          </div>
                          <button 
                            className="w-8 h-8 rounded-full bg-white border border-neutral-200 text-neutral-400 group-hover:bg-black group-hover:text-white group-hover:border-black flex items-center justify-center transition-colors shrink-0"
                          >
                             <Plus size={14} strokeWidth={2.5} />
                          </button>
                        </div>
                      );
                    })
                  )
                )}

                {activeLibraryTab === 'suggested' && (
                  suggestedItems.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center p-8 text-center text-neutral-500">
                      <PackagePlus size={32} className="mb-4 text-neutral-300" />
                      <p>No suggested garments found.</p>
                    </div>
                  ) : (
                    suggestedItems.map((item, idx) => {
                      const style = item.style || 'Custom Garment';
                      const itemNum = item.itemNum || '';
                      const colors = item.colors || ['Custom Color'];
                      const sizes = item.sizes || ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
                      const image = item.image || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';
                      const price = parseFloat(item.price || 0);

                      return (
                        <div 
                          key={item.id || idx} 
                          onClick={() => handleAddItem({ ...item, style, itemNum, colors, sizes, image, price })}
                          className="group flex items-center gap-4 bg-neutral-50/50 border border-neutral-200 hover:border-black transition-colors rounded-2xl p-4 cursor-pointer shadow-[0_2px_10px_rgb(0,0,0,0.01)] hover:shadow-xs"
                        >
                          <div className="w-14 h-14 rounded-xl overflow-hidden bg-white border border-neutral-100 shrink-0 flex items-center justify-center">
                            <img src={image} alt={style} className="w-full h-full object-contain p-1 mix-blend-multiply" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-neutral-900 text-sm truncate mb-0.5">{style}</h4>
                            {itemNum && (
                              <p className="text-[10px] font-semibold text-neutral-450">{itemNum}</p>
                            )}
                            <p className="text-[10px] text-neutral-400 font-medium mt-1 truncate">{colors.join(' • ')}</p>
                          </div>
                          <button 
                            className="w-8 h-8 rounded-full bg-white border border-neutral-200 text-neutral-400 group-hover:bg-black group-hover:text-white group-hover:border-black flex items-center justify-center transition-colors shrink-0"
                          >
                             <Plus size={14} strokeWidth={2.5} />
                          </button>
                        </div>
                      );
                    })
                  )
                )}

                {activeLibraryTab === 'past' && (
                  pastGarments.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center p-8 text-center text-neutral-500">
                      <PackagePlus size={32} className="mb-4 text-neutral-300" />
                      <p>No past orders found.</p>
                    </div>
                  ) : (
                    pastGarments.map((item, idx) => {
                      const style = item.style || 'Custom Garment';
                      const itemNum = item.itemNum || '';
                      const colors = item.colors || ['Custom Color'];
                      const sizes = item.sizes || ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
                      const image = item.image || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';
                      const price = parseFloat(item.price || 0);

                      return (
                        <div 
                          key={item.id || idx} 
                          onClick={() => handleAddItem({ ...item, style, itemNum, colors, sizes, image, price })}
                          className="group flex items-center gap-4 bg-neutral-50/50 border border-neutral-200 hover:border-black transition-colors rounded-2xl p-4 cursor-pointer shadow-[0_2px_10px_rgb(0,0,0,0.01)] hover:shadow-xs"
                        >
                          <div className="w-14 h-14 rounded-xl overflow-hidden bg-white border border-neutral-100 shrink-0 flex items-center justify-center">
                            <img src={image} alt={style} className="w-full h-full object-contain p-1 mix-blend-multiply" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-neutral-900 text-sm truncate mb-0.5">{style}</h4>
                            {itemNum && (
                              <p className="text-[10px] font-semibold text-neutral-450">{itemNum}</p>
                            )}
                            <p className="text-[10px] text-neutral-400 font-medium mt-1 truncate">{colors.join(' • ')}</p>
                          </div>
                          <button 
                            className="w-8 h-8 rounded-full bg-white border border-neutral-200 text-neutral-400 group-hover:bg-black group-hover:text-white group-hover:border-black flex items-center justify-center transition-colors shrink-0"
                          >
                             <Plus size={14} strokeWidth={2.5} />
                          </button>
                        </div>
                      );
                    })
                  )
                )}
              </div>
              
              <div className="border-t border-neutral-100 pt-6 flex justify-end gap-3">
                <button 
                  data-tour="request-quote-link"
                  onClick={() => navigate(customerId ? `/portal/${customerId}/quote` : '/portal/quote')}
                  className="bg-white text-neutral-900 border border-neutral-200 px-6 py-2.5 rounded-full text-xs font-bold tracking-wide hover:bg-neutral-50 hover:border-neutral-300 transition-all shadow-2xs cursor-pointer"
                >
                  Request Quote
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Loop through actual order items */}
              {orderItems.map((item, index) => (
                <div key={item.instanceId} className="bg-white rounded-3xl p-6 shadow-[0_4px_24px_rgb(0,0,0,0.02)] border border-neutral-100 flex flex-col gap-6 animate-in slide-in-from-bottom-4 fade-in duration-300">
                  <div className="flex items-start justify-between border-b border-neutral-100 pb-6">
                    <div className="flex gap-5 items-center">
                      {(() => {
                        const N = getActiveSidesCount(item);
                        const isHovered = hoveredItemId === item.instanceId;
                        const translatePercentage = isHovered && N > 1 ? (100 / N) : 0;
                        const srcUrl = item.customized ? item.image : (item.images?.[item.selectedColor] || item.image);
                        return (
                          <div 
                            onClick={() => setPreviewImageUrl(srcUrl)}
                            onMouseEnter={() => setHoveredItemId(item.instanceId)}
                            onMouseLeave={() => setHoveredItemId(null)}
                            className={`w-20 h-20 rounded-xl overflow-hidden bg-neutral-50 border border-neutral-100 shrink-0 cursor-pointer flex items-center relative group ${
                              item.customized ? 'justify-start' : 'justify-center'
                            }`}
                            title="Hover to slide mockup, click to view full screen"
                          >
                            <img 
                              src={srcUrl} 
                              alt={item.style} 
                              style={{
                                width: item.customized ? `${N * 100}%` : '100%',
                                height: '100%',
                                maxWidth: 'none',
                                transform: item.customized ? `translateX(-${translatePercentage}%)` : 'none',
                                transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                              }}
                              className={`${item.customized ? 'object-cover' : 'object-contain'} mix-blend-multiply select-none animate-in fade-in duration-300 p-1`}
                            />
                          </div>
                        );
                      })()}
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center text-[10px] font-bold text-neutral-400 shrink-0">{index + 1}</span>
                          <h3 className="text-lg font-bold text-neutral-900">{item.style}</h3>
                        </div>
                        <p className="text-sm font-semibold text-neutral-500">{item.itemNum}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        data-tour={index === 0 ? "customize-btn" : undefined}
                        onClick={() => setCustomizingItem(item)}
                        className="bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-neutral-800 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                      >
                        <Sparkles size={12} className="text-neutral-500" /> Customize
                      </button>
                      <button 
                        onClick={() => handleRemoveItem(item.instanceId)}
                        className="text-neutral-400 hover:text-red-500 transition-colors p-2"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Settings Grid for this item */}
                  <div className="grid grid-cols-1 gap-4">
                     <div className="flex flex-col gap-2">
                       <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Garment Color</label>
                       <div className="relative max-w-[300px]">
                         <select 
                           value={item.selectedColor || ''}
                           onChange={(e) => {
                             const newCol = e.target.value;
                             setOrderItems(prev => prev.map(o => o.instanceId === item.instanceId ? { ...o, selectedColor: newCol } : o));
                           }}
                           className="w-full appearance-none bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm font-medium text-neutral-900 focus:outline-none focus:border-neutral-400 cursor-pointer"
                         >
                           {item.colors.map((c: string) => <option key={c} value={c}>{c}</option>)}
                         </select>
                         <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" size={16} />
                       </div>
                     </div>
                  </div>

                  {/* Sizing Matrix */}
                  <div 
                    data-tour={index === 0 ? "sizing-matrix" : undefined}
                    className="bg-neutral-50 rounded-xl p-4 flex flex-col items-start border border-neutral-200 gap-3"
                  >
                     <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Size Run</span>
                     <div className="flex flex-wrap gap-2 w-full">
                       {Object.keys(item.quantities).map((size) => (
                         <div key={size} className="flex-1 min-w-[50px] flex flex-col bg-white border border-neutral-200 rounded-lg overflow-hidden focus-within:border-black focus-within:ring-1 focus-within:ring-black transition-all">
                           <div className="bg-neutral-100 text-neutral-600 text-[10px] font-bold py-1.5 uppercase tracking-wide flex items-center justify-center border-b border-neutral-200">
                             {size}
                           </div>
                           <input 
                             type="number"
                             min="0"
                             value={item.quantities[size] || ''}
                             placeholder="0"
                             onChange={(e) => handleUpdateQuantity(item.instanceId, size, e.target.value)}
                             className="w-full h-10 text-center text-sm font-bold text-neutral-900 focus:outline-none placeholder:text-neutral-300"
                           />
                         </div>
                       ))}
                     </div>
                  </div>
                </div>
              ))}

              {/* Add Another Garment Button */}
              {hasWovnRack ? (
                <button 
                  data-tour="add-garment-btn"
                  onClick={() => {
                    setActiveLibraryTab('wovn');
                    setIsDrawerOpen(true);
                  }}
                  className="w-full bg-neutral-50 hover:bg-neutral-100 border-2 border-dashed border-neutral-200 rounded-3xl p-6 flex flex-col items-center justify-center text-neutral-500 hover:text-black transition-all group cursor-pointer"
                >
                  <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform mb-3">
                    <PackagePlus size={20} strokeWidth={2} />
                  </div>
                  <span className="font-bold text-sm tracking-wide">Add Another Garment from Library</span>
                </button>
              ) : (
                <button 
                  data-tour="add-garment-btn"
                  onClick={() => {
                    setActiveLibraryTab(suggestedItems.length > 0 ? 'suggested' : 'past');
                    setIsDrawerOpen(true);
                  }}
                  className="w-full bg-neutral-50 hover:bg-neutral-100 border-2 border-dashed border-neutral-200 rounded-3xl p-6 flex flex-col items-center justify-center text-neutral-500 hover:text-black transition-all group cursor-pointer"
                >
                  <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform mb-3">
                    <PackagePlus size={20} strokeWidth={2} />
                  </div>
                  <span className="font-bold text-sm tracking-wide">Add Another Garment from Library</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* Right Column: Order Summary (Sticky) */}
        <div className="lg:col-span-1">
          <div 
            data-tour="order-summary"
            className="sticky top-8 bg-neutral-50 rounded-3xl p-6 border border-neutral-200/60 min-h-[400px] flex flex-col"
          >
            <h3 className="font-serif text-xl text-neutral-900 border-b border-neutral-200 pb-4 mb-4">
              Order Summary
            </h3>
            
            <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 gap-3">
              {orderItems.length === 0 ? (
                <p className="text-sm font-medium text-center">Your order is currently empty.</p>
              ) : (
                <div className="w-full flex-1 flex flex-col gap-3">
                  {orderItems.map((item, idx) => {
                    const totalQty = Object.values(item.quantities as Record<string, number>).reduce((sum, qty) => sum + qty, 0);
                    const itemCost = totalQty * (parseFloat(item.price) || 0);
                    return (
                      <div key={item.instanceId} className="flex items-start justify-between text-sm py-2 border-b border-neutral-100 last:border-0 pointer-events-none w-full">
                        <span className="font-semibold text-neutral-900 truncate pr-2 flex-1"><span className="text-neutral-400 mr-2">{idx+1}.</span>{item.style}</span>
                        <div className="flex flex-col items-end shrink-0">
                            <span className={`font-bold ${totalQty > 0 ? 'text-neutral-900' : 'text-neutral-400'}`}>{totalQty} QTY</span>
                            {itemCost > 0 && <span className="text-[10px] font-bold text-neutral-500 mt-0.5">${itemCost.toFixed(2)}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-auto border-t border-neutral-200 pt-4 space-y-3">
              <div className="flex justify-between items-center text-sm font-bold text-neutral-500">
                <span>Total Items</span>
                <span>{orderItems.length} styles</span>
              </div>
              <button 
                onClick={handleSubmitOrder}
                disabled={orderItems.length === 0 || isSubmitting} 
                className={`w-full mt-4 py-3.5 rounded-xl text-sm font-bold transition-all ${orderItems.length > 0 && !isSubmitting ? 'bg-black text-white hover:bg-neutral-800 shadow-md transform active:scale-[0.98]' : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'}`}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Quote Request'}
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Slide-out Catalog Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-[550px] h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="px-8 py-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
              <div>
                <h2 className="text-xl font-serif text-neutral-900">Your Catalog</h2>
                <p className="text-sm font-medium text-neutral-500 mt-1">Select from your approved, suggested, or past styles.</p>
              </div>
              <button 
                onClick={() => setIsDrawerOpen(false)}
                className="w-10 h-10 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-500 hover:text-black hover:border-black transition-colors shadow-sm cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Drawer Tabs */}
            <div className="flex gap-4 border-b border-neutral-100 px-8 py-3 overflow-x-auto shrink-0 bg-neutral-50/50">
              {hasWovnRack && (
                <button
                  type="button"
                  onClick={() => setActiveLibraryTab('wovn')}
                  className={`text-sm font-bold pb-1.5 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                    activeLibraryTab === 'wovn' 
                      ? 'text-black border-black' 
                      : 'text-neutral-400 border-transparent hover:text-black hover:border-black'
                  }`}
                >
                  Approved Library ({customerDecks.reduce((acc, deck) => acc + (deck.items || deck.garments || []).length, 0)})
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveLibraryTab('suggested')}
                className={`text-sm font-bold pb-1.5 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                  activeLibraryTab === 'suggested' 
                    ? 'text-black border-black' 
                    : 'text-neutral-400 border-transparent hover:text-black hover:border-black'
                }`}
              >
                Suggested ({suggestedItems.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveLibraryTab('past')}
                className={`text-sm font-bold pb-1.5 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                  activeLibraryTab === 'past' 
                    ? 'text-black border-black' 
                    : 'text-neutral-400 border-transparent hover:text-black hover:border-black'
                }`}
              >
                Past Garments ({pastGarments.length})
              </button>
            </div>
            
            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6">
              {activeLibraryTab === 'wovn' && (
                isLoadingDecks ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="animate-spin text-neutral-400" size={24} />
                  </div>
                ) : customerDecks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-neutral-500">
                    <PackagePlus size={32} className="mb-4 text-neutral-300" />
                    <p>No catalog decks connected for this client.</p>
                  </div>
                ) : (
                  customerDecks.map((deck) => (
                    <div key={deck.id || deck.name} className="flex flex-col gap-4 mb-4">
                      <div className="bg-[#f0ebe1] rounded-2xl p-6 border border-[#e6e2db] flex flex-col justify-center items-center text-center">
                         <h3 className="font-bold text-neutral-900 tracking-tight text-lg">{deck.name || "Catalog Deck"}</h3>
                         {deck.name && (
                           <p className="text-[#6b665c] font-bold mt-1 uppercase tracking-widest text-[10px]">Active Collection</p>
                         )}
                      </div>

                      <div className="flex flex-col gap-3 mt-1">
                        {(deck.items || deck.garments || []).map((item: any, idx: number) => {
                          const style = item.garment_name || item.name || item.style || item.title || 'Unknown Style';
                          const gender = item.gender || 'Unisex';
                          const itemNum = item.itemNum || item.garment_id || item.sku || item.id || `GARMENT-${idx+1}`;
                          
                          let colors = findColorsInObj({ ...item }) || ['Custom Color'];
                          if (colors.length === 0) colors = ['Custom Color'];
                          
                          let sizes = parseSizesFromItem(item, style);

                          const image = item.mockup_image || item.mock_image || item.original_image || item.image || item.imageUrl || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';
                          
                          const deckStr = JSON.stringify(deck).toLowerCase();
                          const itemStr = JSON.stringify(item).toLowerCase();
                          const isRush = deckStr.includes('rush') || itemStr.includes('rush') || deckStr.includes('rush_fee') || itemStr.includes('rush_fee');
                          
                          const basePrice = parseFloat(item.msrp || item.price || item.unit_cost || 0);
                          const price = isRush ? basePrice * 1.15 : basePrice;

                          return (
                            <div key={item.id || idx} className="group flex items-center gap-5 bg-white border border-neutral-200 hover:border-black transition-colors rounded-2xl p-4 cursor-pointer shadow-[0_2px_10px_rgb(0,0,0,0.02)] hover:shadow-md">
                              <div className="w-16 h-16 rounded-xl overflow-hidden bg-neutral-50 border border-neutral-100 shrink-0 flex items-center justify-center">
                                <img src={image} alt={style} className="w-full h-full object-contain p-1 mix-blend-multiply" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                   <h4 className="font-bold text-neutral-900 text-[15px] truncate pr-2">{style}</h4>
                                   <span className="text-[10px] font-bold text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded-full shrink-0">{gender}</span>
                                </div>
                                {itemNum && itemNum.length < 15 && (
                                  <p className="text-xs font-semibold text-neutral-500">{itemNum}</p>
                                )}

                                <p className="text-xs text-neutral-400 font-medium mt-1 truncate">{colors.join(' • ')}</p>
                              </div>
                              <button 
                                onClick={() => handleAddItem({ ...item, style, gender, itemNum, colors, sizes, image, price })}
                                className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-500 group-hover:bg-black group-hover:text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                              >
                                 <PackagePlus size={16} strokeWidth={2.5} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )
              )}

              {activeLibraryTab === 'suggested' && (
                suggestedItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-neutral-500">
                    <PackagePlus size={32} className="mb-4 text-neutral-300" />
                    <p>No suggested garments found.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {suggestedItems.map((item, idx) => {
                      const style = item.style || 'Custom Garment';
                      const itemNum = item.itemNum || '';
                      const colors = item.colors || ['Custom Color'];
                      const sizes = item.sizes || ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
                      const image = item.image || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';
                      const price = parseFloat(item.price || 0);

                      return (
                        <div key={item.id || idx} className="group flex items-center gap-5 bg-white border border-neutral-200 hover:border-black transition-colors rounded-2xl p-4 cursor-pointer shadow-[0_2px_10px_rgb(0,0,0,0.02)] hover:shadow-md">
                          <div className="w-16 h-16 rounded-xl overflow-hidden bg-neutral-50 border border-neutral-100 shrink-0 flex items-center justify-center">
                            <img src={image} alt={style} className="w-full h-full object-contain p-1 mix-blend-multiply" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                               <h4 className="font-bold text-neutral-900 text-[15px] truncate pr-2">{style}</h4>
                            </div>
                            {itemNum && (
                              <p className="text-xs font-semibold text-neutral-500">{itemNum}</p>
                            )}

                            <p className="text-xs text-neutral-400 font-medium mt-1 truncate">{colors.join(' • ')}</p>
                          </div>
                          <button 
                            onClick={() => handleAddItem({ ...item, style, itemNum, colors, sizes, image, price })}
                            className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-500 group-hover:bg-black group-hover:text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                          >
                             <PackagePlus size={16} strokeWidth={2.5} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {activeLibraryTab === 'past' && (
                pastGarments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-neutral-500">
                    <RotateCcw size={32} className="mb-4 text-neutral-300 animate-pulse" />
                    <p>No past ordered garments found.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {pastGarments.map((item, idx) => {
                      const style = item.style || 'Custom Garment';
                      const itemNum = item.itemNum || '';
                      const colors = item.colors || ['Custom Color'];
                      const sizes = item.sizes || ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
                      const image = item.image || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';
                      const price = parseFloat(item.price || 0);

                      return (
                        <div key={item.id || idx} className="group flex items-center gap-5 bg-white border border-neutral-200 hover:border-black transition-colors rounded-2xl p-4 cursor-pointer shadow-[0_2px_10px_rgb(0,0,0,0.02)] hover:shadow-md">
                          <div className="w-16 h-16 rounded-xl overflow-hidden bg-neutral-50 border border-neutral-100 shrink-0 flex items-center justify-center">
                            <img src={image} alt={style} className="w-full h-full object-contain p-1 mix-blend-multiply" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                               <h4 className="font-bold text-neutral-900 text-[15px] truncate pr-2">{style}</h4>
                            </div>
                            {itemNum && (
                              <p className="text-xs font-semibold text-neutral-500">{itemNum}</p>
                            )}
                            {price > 0 && (
                                <p className="text-xs font-black text-black mt-1">
                                    ${price.toFixed(2)}
                                </p>
                            )}
                            <p className="text-xs text-neutral-400 font-medium mt-1 truncate">{colors.join(' • ')}</p>
                          </div>
                          <button 
                            onClick={() => handleAddItem({ ...item, style, itemNum, colors, sizes, image, price })}
                            className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-500 group-hover:bg-black group-hover:text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                          >
                             <PackagePlus size={16} strokeWidth={2.5} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )
              )}
              
              <button className="w-full bg-neutral-50 hover:bg-neutral-100 border-2 border-dashed border-neutral-200 rounded-xl py-4 flex items-center justify-center text-sm font-bold text-neutral-500 hover:text-black transition-all group mt-2 shrink-0 cursor-pointer">
                <PackagePlus size={18} className="mr-2 group-hover:scale-110 transition-transform" />
                + Search Global Blank Catalog
              </button>
            </div>

          </div>
        </div>
      )}

      {isRepeatModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-[500px] h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            
            {/* Drawer Header */}
            <div className="px-8 py-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
              <div>
                <h2 className="text-xl font-serif text-neutral-900">Repeat Previous Order</h2>
                <p className="text-sm font-medium text-neutral-500 mt-1">Select a past order to copy its garments and quantities.</p>
              </div>
              <button 
                onClick={() => setIsRepeatModalOpen(false)}
                className="w-10 h-10 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-500 hover:text-black hover:border-black transition-colors shadow-sm"
              >
                <X size={20} />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-4">
              {isLoadingPreviousOrders ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="animate-spin w-8 h-8 text-black" />
                </div>
              ) : previousOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-neutral-500">
                  <RotateCcw size={32} className="mb-4 text-neutral-300 animate-pulse" />
                  <p className="font-bold text-neutral-800">No previous orders found</p>
                  <p className="text-xs mt-1 text-neutral-500">Place your first order to enable repeating.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {previousOrders.map((prevOrder) => {
                    const totalQty = prevOrder.items?.reduce((sum: number, i: any) => sum + (i.qty || 0), 0) || 0;
                    return (
                      <div 
                        key={prevOrder.id} 
                        className="group flex flex-col bg-white border border-neutral-200 hover:border-black transition-all rounded-2xl p-5 cursor-pointer shadow-[0_2px_10px_rgb(0,0,0,0.02)] hover:shadow-md gap-3"
                        onClick={() => handleRepeatOrder(prevOrder)}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-serif text-lg text-neutral-900 leading-tight group-hover:text-black transition-colors">{prevOrder.title}</h4>
                            <p className="text-xs font-bold text-neutral-500 mt-1 uppercase tracking-wider">{prevOrder.portalId || 'Portal Order'}</p>
                          </div>
                          <span className="text-sm font-black text-black shrink-0">
                            ${(prevOrder.totalAmount || 0).toFixed(2)}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-xs font-medium text-neutral-500 border-t border-neutral-100 pt-3">
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            {prevOrder.date}
                          </span>
                          <span>•</span>
                          <span>{prevOrder.items?.length || 0} styles</span>
                          <span>•</span>
                          <span>{totalQty} total units</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {customizingItem && (
        <GarmentCustomizerModal
          isOpen={!!customizingItem}
          onClose={() => setCustomizingItem(null)}
          garment={{
            id: customizingItem.instanceId,
            style: customizingItem.style,
            itemNum: customizingItem.itemNum,
            image: customizingItem.image,
            images: customizingItem.images || null,
            backImages: customizingItem.backImages || null,
            colors: customizingItem.colors || ['Custom Color'],
            selectedColor: customizingItem.selectedColor
          }}
          customerId={customerId || 'CUS-001'}
          onSave={(customizedData) => {
            setOrderItems(prev => prev.map(item => item.instanceId === customizingItem.instanceId ? {
              ...item,
              style: customizedData.style,
              selectedColor: customizedData.selectedColor,
              image: customizedData.image,
              customized: true,
              logoPlacement: customizedData.logoPlacement,
              logoUrl: customizedData.logoUrl,
              logoName: customizedData.logoName,
              logoUrlBack: customizedData.logoUrlBack,
              logoNameBack: customizedData.logoNameBack,
              logoUrlLeftSleeve: customizedData.logoUrlLeftSleeve || null,
              logoNameLeftSleeve: customizedData.logoNameLeftSleeve || null,
              logoUrlRightSleeve: customizedData.logoUrlRightSleeve || null,
              logoNameRightSleeve: customizedData.logoNameRightSleeve || null,
              colors: customizedData.colors || item.colors
            } : item));
          }}
        />
      )}

      {/* Lightbox Image Preview Modal */}
      {previewImageUrl && (
        <div 
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div 
            className="relative max-w-[95vw] max-h-[90vh] bg-white rounded-[2rem] p-6 md:p-10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex items-center justify-center border border-neutral-200/50 cursor-crosshair"
            onClick={(e) => e.stopPropagation()}
            onMouseMove={(e) => {
              const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
              const x = (e.clientX - left) / width;
              const y = (e.clientY - top) / height;
              const img = e.currentTarget.querySelector('img');
              if (img) img.style.transformOrigin = `${x * 100}% ${y * 100}%`;
            }}
            title="Hover to zoom"
          >
            <button 
              onClick={() => setPreviewImageUrl(null)}
              className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-neutral-800 hover:text-black flex items-center justify-center shadow-lg transition-all z-50 cursor-pointer border border-neutral-100 hover:scale-105"
            >
              <X size={20} />
            </button>
            <img 
              src={previewImageUrl} 
              alt="Mockup Preview" 
              style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '75vh' }}
              className="rounded-2xl select-none transition-transform duration-200 ease-out hover:scale-[2]" 
            />
          </div>
        </div>
      )}

    </div>
  );
}
