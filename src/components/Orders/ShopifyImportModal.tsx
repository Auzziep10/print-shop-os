import React, { useState } from 'react';
import { X, Search, ShoppingBag, Loader2, Check } from 'lucide-react';
import { PillButton } from '../ui/PillButton';
import { db } from '../../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
}

export function ShopifyImportModal({ isOpen, onClose, customerId }: Props) {
  const [searchTag, setSearchTag] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTag.trim()) return;
    
    setIsLoading(true);
    setOrders([]);
    try {
       const res = await fetch(`/api/shopify/search?tag=${encodeURIComponent(searchTag.trim())}`);
       if (!res.ok) throw new Error('API Error');
       const data = await res.json();
       setOrders(data.orders || []);
    } catch (err) {
       console.error('Failed to search shopify orders', err);
       alert('Could not search Shopify orders. Ensure the local API edge function is reachable.');
    } finally {
       setIsLoading(false);
    }
  };

  const toggleOrderSelection = (orderId: string) => {
    const newSet = new Set(selectedOrderIds);
    if (newSet.has(orderId)) newSet.delete(orderId);
    else newSet.add(orderId);
    setSelectedOrderIds(newSet);
  };

  const handleImport = async () => {
    if (selectedOrderIds.size === 0) return;
    setIsImporting(true);
    
    try {
      // 1. Filter out the selected orders
      const selectedOrders = orders.filter(o => selectedOrderIds.has(o.id));
      
      // 2. Map all line items from all selected orders into our unified format
      const groupedItems = new Map();
      let globalIdx = 0;
      
      for (const order of selectedOrders) {
         for (const item of order.lineItems || []) {
            const title = item.title;
            const fullVariant = item.variantTitle || '';
            
            // Parse Size and Color from variant (e.g., "S (4-6) / Black / Glow V")
            let size = 'OS';
            let color = '';
            
            if (fullVariant && fullVariant !== 'Default Title') {
               const parts = fullVariant.split(' / ');
               size = parts[0]; 
               if (parts.length > 1) {
                  color = parts.slice(1).join(' / ');
               }
            }

            const key = title + '|' + color;

            if (!groupedItems.has(key)) {
               groupedItems.set(key, {
                  id: Date.now() + globalIdx++,
                  style: title,
                  gender: color || 'Unisex', // Option details appear bold on top
                  color: '',
                  qty: 0,
                  price: item.originalUnitPriceSet?.presentmentMoney?.amount || '0',
                  total: '0',
                  image: item.image?.url || '',
                  logos: [],
                  sizes: {}
               });
            }

            const existing = groupedItems.get(key);
            const qty = parseInt(item.quantity) || 0;
            
            existing.qty += qty;
            existing.sizes[size] = (existing.sizes[size] || 0) + qty;
            
            existing.total = `$${(existing.qty * parseFloat(existing.price || '0')).toFixed(2)}`;
         }
      }
      
      const combinedItems = Array.from(groupedItems.values());

      // 3. Create the unified order in Firestore
      const newOrderBody = {
         customerId,
         title: `Shopify Batch: ${searchTag.toUpperCase()}`,
         date: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }),
         statusIndex: 0,
         portalId: '#' + Math.floor(1000 + Math.random() * 9000).toString(),
         createdAt: new Date().toISOString(),
         fulfillmentType: 'Standard', // Default
         items: combinedItems,
         boxes: [],
         activities: [{
            id: Date.now().toString(),
            type: 'status_change',
            message: `Imported ${selectedOrders.length} orders from Shopify`,
            user: 'System Integration',
            timestamp: new Date().toISOString()
         }]
      };

      const ordersRef = collection(db, 'orders');
      await addDoc(ordersRef, newOrderBody);
      
      onClose();
      // Optional: force reload state or trigger a toast
      window.location.reload(); 
    } catch (err) {
      console.error('Failed to import order', err);
      alert('Failed to combine and import orders into Print Shop OS.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 overflow-y-auto">
      <div className="bg-white max-w-2xl w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-brand-border my-auto max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-brand-border flex justify-between items-center bg-brand-bg/50">
          <div>
            <h3 className="font-serif text-2xl text-brand-primary">Shopify Import</h3>
            <p className="text-xs font-semibold text-brand-secondary uppercase tracking-widest mt-1">Combine Tagged Orders</p>
          </div>
          <button onClick={onClose} className="text-brand-secondary hover:text-brand-primary bg-white p-2 rounded-lg border border-brand-border/60 transition-colors shadow-sm">
            <X size={20} />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6 flex flex-col gap-6 flex-1 overflow-y-auto custom-scrollbar">
           <form onSubmit={handleSearch} className="flex gap-3">
              <div className="relative flex-1">
                 <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-secondary" />
                 <input 
                   type="text" 
                   value={searchTag}
                   onChange={e => setSearchTag(e.target.value)}
                   placeholder="Enter Shopify tag to search (e.g. VIP, FallPromo)" 
                   className="w-full bg-neutral-50 border border-brand-border rounded-xl pl-10 pr-4 py-3 text-sm focus:border-brand-primary focus:bg-white focus:outline-none transition-all"
                   autoFocus
                 />
              </div>
              <PillButton type="submit" variant="outline" className="shrink-0 px-6 py-3" disabled={isLoading || !searchTag.trim()}>
                 {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Search Tag'}
              </PillButton>
           </form>

           {/* Results Area */}
           <div className="flex-1 rounded-xl bg-neutral-50 border border-brand-border p-4 min-h-[300px]">
              {orders.length === 0 && !isLoading && (
                 <div className="h-full flex flex-col items-center justify-center text-center opacity-50 space-y-3">
                    <ShoppingBag size={32} />
                    <p className="text-sm font-semibold">No Shopify orders found.</p>
                 </div>
              )}
              {isLoading && (
                 <div className="h-full flex items-center justify-center text-brand-primary">
                    <Loader2 size={32} className="animate-spin" />
                 </div>
              )}
              {orders.length > 0 && !isLoading && (
                 <div className="space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-brand-border/40">
                       <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary">Found {orders.length} Orders</span>
                       <button 
                         className="text-xs font-bold text-brand-primary hover:underline cursor-pointer tracking-wide"
                         onClick={() => setSelectedOrderIds(new Set(orders.map(o => o.id)))}
                       >
                         Select All
                       </button>
                    </div>
                    {orders.map(order => {
                      const isSelected = selectedOrderIds.has(order.id);
                      return (
                         <div 
                           key={order.id} 
                           onClick={() => toggleOrderSelection(order.id)}
                           className={`bg-white p-4 rounded-xl border transition-all cursor-pointer flex items-center gap-4 ${isSelected ? 'border-brand-primary shadow-sm bg-blue-50/10' : 'border-brand-border shadow-sm hover:border-black/20'}`}
                         >
                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'bg-brand-primary border-brand-primary' : 'border-brand-secondary/40'}`}>
                               {isSelected && <Check size={12} className="text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                               <p className="font-bold text-brand-primary text-sm mb-0.5">{order.name}</p>
                               <p className="text-xs text-brand-secondary line-clamp-1">{order.email} • {new Date(order.createdAt).toLocaleDateString()}</p>
                            </div>
                            <div className="text-right shrink-0">
                               <p className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary bg-neutral-100 px-2 py-1 rounded-md mb-1">{order.lineItems?.length || 0} Items</p>
                               <p className="text-xs font-semibold text-brand-primary">{order.displayFinancialStatus}</p>
                            </div>
                         </div>
                      );
                    })}
                 </div>
              )}
           </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-brand-border bg-brand-bg/30 flex justify-between items-center">
            <span className="text-xs font-semibold text-brand-secondary uppercase tracking-widest">{selectedOrderIds.size} Orders Selected</span>
            <div className="flex gap-3">
              <PillButton variant="outline" onClick={onClose} className="px-6 py-2.5">
                Cancel
              </PillButton>
              <PillButton 
                variant="filled" 
                onClick={handleImport} 
                disabled={selectedOrderIds.size === 0 || isImporting}
                className="px-6 py-2.5 bg-brand-primary text-white"
              >
                {isImporting ? <Loader2 size={16} className="animate-spin" /> : 'Combine & Import'}
              </PillButton>
            </div>
        </div>
      </div>
    </div>
  );
}
