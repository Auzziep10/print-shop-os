import { useState, useEffect } from 'react';
import { ArrowLeft, PackagePlus, X, Trash2, ChevronDown } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export function PortalCreateOrder() {
  const navigate = useNavigate();
  const { customerId } = useParams();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [customerDecks, setCustomerDecks] = useState<any[]>([]);
  const [isLoadingDecks, setIsLoadingDecks] = useState(true);

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
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-serif text-neutral-900 tracking-tight flex items-center gap-4">
          Create New Order
        </h1>
        <p className="text-neutral-500 font-medium text-sm max-w-xl leading-relaxed">
          Use the builder below to select garments, upload artwork, and construct your order. We'll provide real-time pricing and mockups as you go.
        </p>
      </div>

      {/* Builder Layout - Starting simple */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-4">
        
        {/* Left Column: Form / Steps */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {orderItems.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 shadow-[0_4px_24px_rgb(0,0,0,0.02)] border border-neutral-100 flex flex-col items-center justify-center min-h-[400px] text-center gap-4">
              <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center text-neutral-400">
                <PackagePlus size={28} strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-neutral-900 mb-1">Let's start building</h3>
                <p className="text-neutral-500 text-sm max-w-xs mx-auto">
                  Select your first garment style to begin assembling your custom order.
                </p>
              </div>
              
              <div className="mt-4 flex items-center justify-center gap-4">
                <button 
                  onClick={() => setIsDrawerOpen(true)}
                  className="bg-black text-white px-8 py-3.5 rounded-full text-[13px] font-bold tracking-wide hover:bg-neutral-800 hover:scale-[1.02] transition-all shadow-md"
                >
                  + Add Garment
                </button>
                <button 
                  onClick={() => navigate(customerId ? `/portal/${customerId}/quote` : '/portal/quote')}
                  className="bg-white text-neutral-900 border border-neutral-200 px-8 py-3.5 rounded-full text-[13px] font-bold tracking-wide hover:bg-neutral-50 hover:border-neutral-300 hover:scale-[1.02] transition-all shadow-sm"
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
                      <div className="w-20 h-20 rounded-xl overflow-hidden bg-neutral-50 border border-neutral-100 shrink-0">
                         <img src={item.image} alt={item.style} className="w-full h-full object-cover mix-blend-multiply" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center text-[10px] font-bold text-neutral-400 shrink-0">{index + 1}</span>
                          <h3 className="text-lg font-bold text-neutral-900">{item.style}</h3>
                        </div>
                        <p className="text-sm font-semibold text-neutral-500">{item.itemNum}</p>
                        {item.price > 0 && (
                            <p className="text-sm font-bold text-black mt-1 bg-neutral-50 inline-block px-2 py-0.5 rounded border border-neutral-200 shadow-sm">${parseFloat(item.price).toFixed(2)} / unit</p>
                        )}
                      </div>
                    </div>
                    <button 
                      onClick={() => handleRemoveItem(item.instanceId)}
                      className="text-neutral-400 hover:text-red-500 transition-colors p-2"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  {/* Settings Grid for this item */}
                  <div className="grid grid-cols-1 gap-4">
                     <div className="flex flex-col gap-2">
                       <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Garment Color</label>
                       <div className="relative max-w-[300px]">
                         <select className="w-full appearance-none bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm font-medium text-neutral-900 focus:outline-none focus:border-neutral-400 cursor-pointer">
                           {item.colors.map((c: string) => <option key={c} value={c}>{c}</option>)}
                         </select>
                         <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" size={16} />
                       </div>
                     </div>
                  </div>

                  {/* Sizing Matrix */}
                  <div className="bg-neutral-50 rounded-xl p-4 flex flex-col items-start border border-neutral-200 gap-3">
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
              <button 
                onClick={() => setIsDrawerOpen(true)}
                className="w-full bg-neutral-50 hover:bg-neutral-100 border-2 border-dashed border-neutral-200 rounded-3xl p-6 flex flex-col items-center justify-center text-neutral-500 hover:text-black transition-all group"
              >
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform mb-3">
                  <PackagePlus size={20} strokeWidth={2} />
                </div>
                <span className="font-bold text-sm tracking-wide">Add Another Garment</span>
              </button>
            </>
          )}
        </div>

        {/* Right Column: Order Summary (Sticky) */}
        <div className="lg:col-span-1">
          <div className="sticky top-8 bg-neutral-50 rounded-3xl p-6 border border-neutral-200/60 min-h-[400px] flex flex-col">
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
              <div className="flex justify-between items-center text-lg font-black text-neutral-900">
                <span>Estimated Total</span>
                <span>${orderItems.reduce((sum, item) => {
                   const totalQty = Object.values(item.quantities as Record<string, number>).reduce((q, val) => q + val, 0);
                   return sum + (totalQty * (parseFloat(item.price) || 0));
                }, 0).toFixed(2)}</span>
              </div>
              
              <button disabled={orderItems.length === 0} className={`w-full mt-4 py-3.5 rounded-xl text-sm font-bold transition-all ${orderItems.length > 0 ? 'bg-black text-white hover:bg-neutral-800 shadow-md transform active:scale-[0.98]' : 'bg-neutral-200 text-neutral-400'}`}>
                Submit Order
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Slide-out Catalog Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-[500px] h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="px-8 py-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
              <div>
                <h2 className="text-xl font-serif text-neutral-900">Your Catalog</h2>
                <p className="text-sm font-medium text-neutral-500 mt-1">Select from your approved styles.</p>
              </div>
              <button 
                onClick={() => setIsDrawerOpen(false)}
                className="w-10 h-10 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-500 hover:text-black hover:border-black transition-colors shadow-sm"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8">
              {isLoadingDecks ? (
                <div className="flex items-center justify-center p-8">
                  <div className="animate-spin w-8 h-8 border-4 border-black border-t-transparent rounded-full"></div>
                </div>
              ) : customerDecks.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-neutral-500">
                  <PackagePlus size={32} className="mb-4 text-neutral-300" />
                  <p>No catalog decks connected for this client.</p>
                  <p className="text-xs mt-2">Connect decks via the Edit Company panel.</p>
                </div>
              ) : (
                customerDecks.map((deck) => (
                  <div key={deck.id || deck.name} className="flex flex-col gap-4">
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
                        
                        // Parse colors from various possible catalog structures using recursive scanning
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
                        
                        let colors = findColorsInObj({ ...item }) || ['Custom Color'];
                        if (colors.length === 0) colors = ['Custom Color'];
                        
                        // Parse sizes
                        let sizes: string[] = [];
                        if (Array.isArray(item.sizes) && item.sizes.length > 0) {
                            sizes = item.sizes;
                        } else if (Array.isArray(item.availableSizes) && item.availableSizes.length > 0) {
                            sizes = item.availableSizes;
                        } else if (Array.isArray(item.variations) && item.variations[0]?.sizes) {
                            sizes = item.variations[0].sizes;
                        } else if (style.toLowerCase().includes('chill') || style.toLowerCase().includes('tumbler') || style.toLowerCase().includes('bag') || style.toLowerCase().includes('hat')) {
                            sizes = ['OSFA'];
                        }

                        const image = item.mockup_image || item.mock_image || item.original_image || item.image || item.imageUrl || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';
                        
                        // Rush fee markup logic (15% markup typical on Wovn)
                        // Safely traverse stringified schema to detect nested booleans regardless of parent structure
                        const deckStr = JSON.stringify(deck).toLowerCase();
                        const itemStr = JSON.stringify(item).toLowerCase();
                        const isRush = deckStr.includes('rush') || itemStr.includes('rush') || deckStr.includes('rush_fee') || itemStr.includes('rush_fee');
                        
                        const basePrice = parseFloat(item.msrp || item.price || item.unit_cost || 0);
                        const price = isRush ? basePrice * 1.15 : basePrice;

                        return (
                          <div key={item.id || idx} className="group flex items-center gap-5 bg-white border border-neutral-200 hover:border-black transition-colors rounded-2xl p-4 cursor-pointer shadow-[0_2px_10px_rgb(0,0,0,0.02)] hover:shadow-md">
                            <div className="w-16 h-16 rounded-xl overflow-hidden bg-neutral-50 border border-neutral-100 shrink-0">
                              <img src={image} alt={style} className="w-full h-full object-cover mix-blend-multiply" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                 <h4 className="font-bold text-neutral-900 text-[15px] truncate pr-2">{style}</h4>
                                 <span className="text-[10px] font-bold text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded-full shrink-0">{gender}</span>
                              </div>
                              {itemNum && itemNum.length < 15 && (
                                <p className="text-xs font-semibold text-neutral-500">{itemNum}</p>
                              )}
                              {price > 0 && (
                                  <p className="text-xs font-black text-black mt-1 flex items-center gap-2">
                                      ${price.toFixed(2)}
                                      {isRush && <span className="text-[9px] font-bold text-neutral-400 italic">includes rush fee</span>}
                                  </p>
                              )}
                              <p className="text-xs text-neutral-400 font-medium mt-1 truncate">{colors.join(' • ')}</p>
                            </div>
                            <button 
                              onClick={() => handleAddItem({ ...item, style, gender, itemNum, colors, sizes, image, price })}
                              className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-500 group-hover:bg-black group-hover:text-white flex items-center justify-center transition-colors shrink-0"
                            >
                               <PackagePlus size={16} strokeWidth={2.5} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
              
              <button className="w-full bg-neutral-50 hover:bg-neutral-100 border-2 border-dashed border-neutral-200 rounded-xl py-4 flex items-center justify-center text-sm font-bold text-neutral-500 hover:text-black transition-all group mt-2 shrink-0">
                <PackagePlus size={18} className="mr-2 group-hover:scale-110 transition-transform" />
                + Search Global Blank Catalog
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
