import { useParams, useNavigate } from 'react-router-dom';
import { tokens } from '../../lib/tokens';
import { useState, useEffect } from 'react';
import { PillButton } from '../../components/ui/PillButton';
import { PackingSlipsManager } from '../../components/Orders/PackingSlipsManager';
import { TrackingModal } from '../../components/Orders/TrackingModal';
import { ArrowLeft, MessageSquare, Clock, Users, Download, Loader2, X, Edit3, Upload, Trash2, Plus, ChevronDown, Image as ImageIcon, Box, Printer, ExternalLink, ShoppingBag, Search, Check, Truck } from 'lucide-react';
import QRCode from 'react-qr-code';
import { StatusBadge, type StatusType } from '../../components/ui/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useOrders } from '../../hooks/useOrders';
import { MOCK_CUSTOMERS_DB } from '../../lib/mockData';
import { db, storage } from '../../lib/firebase';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getTrackingLink } from '../../lib/utils';

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'OSFA'];

const sortSizes = (a: string, b: string) => {
      const orderMap: Record<string, number> = { 'xxs':1, 'xs':2, 's':3, 'm':4, 'l':5, 'xl':6, 'xxl':7, '2xl':7, '3xl':8, '4xl':9, '5xl':10, 'osfa':11, 'os':12 };
      const aKey = a.split(' ')[0].toLowerCase();
      const bKey = b.split(' ')[0].toLowerCase();
      const aVal = orderMap[aKey] || 99;
      const bVal = orderMap[bKey] || 99;
      if (aVal !== bVal) return aVal - bVal;
      return a.localeCompare(b);
  };

// Helper component for the little gray pills in the items breakdown
const DataPill = ({ label, value }: { label: string, value: string }) => (
  <div className="flex flex-col items-center justify-center bg-neutral-100 px-3 py-1.5 rounded-2xl min-w-[84px] max-w-[140px]">
    <span className="text-[10px] text-neutral-500 font-semibold mb-0.5 truncate w-full text-center">{label}:</span>
    <span className="text-xs text-neutral-800 font-semibold leading-none truncate w-full text-center">{value}</span>
  </div>
);

export function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { orders, loading } = useOrders();

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({ 
    title: '', date: '', statusIndex: 0,
    trackingCarrier: '', trackingNumber: '',
    fulfillmentType: ''
  });

  const [editItemObj, setEditItemObj] = useState<any>(null);
  const [quickShipItem, setQuickShipItem] = useState<any>(null);
  const [quickShipSizes, setQuickShipSizes] = useState<Record<string, number>>({});
  const [expandedImage, setExpandedImage] = useState<{src: string, alt: string} | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [isItemSaving, setIsItemSaving] = useState(false);
  const [isUploadingMain, setIsUploadingMain] = useState(false);
  const [isUploadingRef, setIsUploadingRef] = useState(false);
  const [trackingBoxId, setTrackingBoxId] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItemId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== dragOverItemId) {
      setDragOverItemId(id);
    }
  };

  const handleDragEnd = () => {
    setDraggedItemId(null);
    setDragOverItemId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedItemId || draggedItemId === targetId) return;

    const newItems = [...(order.items || [])];
    const draggedIdx = newItems.findIndex((i: any) => i.id === draggedItemId);
    const targetIdx = newItems.findIndex((i: any) => i.id === targetId);
    
    if (draggedIdx !== -1 && targetIdx !== -1) {
      const [movedItem] = newItems.splice(draggedIdx, 1);
      newItems.splice(targetIdx, 0, movedItem);
      
      try {
        await updateDoc(doc(db, 'orders', order.id), { items: newItems });
      } catch (err) {
        console.error("Error reordering items:", err);
      }
    }
    handleDragEnd();
  };

  const { user } = useAuth();
  const [noteText, setNoteText] = useState('');
  
  // Shopify Product Search
  const [shopifySearchQuery, setShopifySearchQuery] = useState('');
  const [shopifyProducts, setShopifyProducts] = useState<any[]>([]);
  const [isSearchingShopify, setIsSearchingShopify] = useState(false);
  const [isShopifySearchOpen, setIsShopifySearchOpen] = useState(false);

  const order = orders.find(o => o.id === id); // Need order reference earlier
  
  const [liveCustomer, setLiveCustomer] = useState<any>(null);
  const [fetchingCustomer, setFetchingCustomer] = useState(true);

  useEffect(() => {
    const fetchLiveCustomer = async () => {
      if (!order || !order.customerId) {
        setFetchingCustomer(false);
        return;
      }
      try {
        const d = await getDoc(doc(db, 'customers', order.customerId));
        if (d.exists()) {
           setLiveCustomer(d.data());
        }
      } catch (err) {
        console.error("Failed to fetch live customer data", err);
      } finally {
        setFetchingCustomer(false);
      }
    };
    fetchLiveCustomer();
  }, [order?.customerId]);

  const handleSearchShopify = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!shopifySearchQuery.trim()) return;
     setIsSearchingShopify(true);
     setShopifyProducts([]);
     try {
        const res = await fetch(`/api/shopify/search-products?q=${encodeURIComponent(shopifySearchQuery.trim())}`);
        const data = await res.json();
        setShopifyProducts(data.products || []);
     } catch (err) {
        console.error('Failed to search products', err);
     } finally {
        setIsSearchingShopify(false);
     }
  };

  const handleSelectShopifyProduct = (product: any, variant: any) => {
     let newSizes = { ...editItemObj?.sizes };
     
     const sizeOption = product.options?.find((o: any) => o.name.toLowerCase().includes('size'));
     if (sizeOption) {
        sizeOption.values.forEach((v: string) => {
           if (newSizes[v] === undefined) newSizes[v] = 0;
        });
     }

     const isMale = variant.title.toLowerCase().includes('men') || product.title.toLowerCase().includes('men');
     const isFemale = variant.title.toLowerCase().includes('women') || product.title.toLowerCase().includes('women');
     const gender = isFemale ? 'Female' : isMale ? 'Male' : 'Unisex';
     const color = variant.selectedOptions?.find((o:any) => o.name.toLowerCase().includes('color'))?.value || variant.title;

     // Build Inventory Map
     let inventoryMap: Record<string, number> = {};
     product.variants?.forEach((v: any) => {
        const vColor = v.selectedOptions?.find((o:any) => o.name.toLowerCase().includes('color'))?.value || v.title;
        if (vColor === color || (!product.options.find((o:any) => o.name.toLowerCase().includes('color')))) {
            const vSize = v.selectedOptions?.find((o:any) => o.name.toLowerCase().includes('size'))?.value || v.title;
            if (vSize) {
               inventoryMap[vSize] = v.inventoryQuantity || 0;
            }
        }
     });

     setEditItemObj({
        ...editItemObj,
        style: product.title,
        gender: gender,
        itemNum: variant.sku || '',
        color: color !== 'Default Title' ? color : '',
        price: variant.price || '0.00',
        image: variant.image?.url || product.featuredImage?.url || editItemObj.image,
        sizes: Object.keys(newSizes).length > 0 ? newSizes : editItemObj.sizes,
        shopifyInventoryMap: inventoryMap
     });
     
     setIsShopifySearchOpen(false);
     setShopifyProducts([]);
     setShopifySearchQuery('');
  };

  const mockCust = order ? MOCK_CUSTOMERS_DB[order.customerId] : null;
  const currentCustomer = mockCust || liveCustomer || MOCK_CUSTOMERS_DB['CUS-001'];

  const handleStatusChange = async (newIndex: number) => {
    if (!id || !order || !currentCustomer) return;
    try {
      const formIsKitting = order.fulfillmentType === 'Kitting' || (!order.fulfillmentType && currentCustomer.fulfillmentType === 'Kitting');
      const newStatusLabel = (() => {
         const labels = ['Request Created', 'Under Review', 'Quote Prepared', 'Approved', 'Sourcing', 'Ordered', 'In Production', formIsKitting ? 'Inventory' : 'Shipped', formIsKitting ? 'Live' : 'Received'];
         return labels[newIndex] || 'Unknown';
      })();

      const activity = {
        id: `act-${Date.now()}`,
        type: 'status_change',
        message: `Status updated to ${newStatusLabel}`,
        user: user?.email || 'Team Member',
        timestamp: new Date().toISOString()
      };

      await setDoc(doc(db, 'orders', id), {
        statusIndex: newIndex,
        activities: [activity, ...(order.activities || [])]
      }, { merge: true });
    } catch(err) {
      console.error(err);
    }
  };

  const handleAddNote = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!id || !order || !noteText.trim()) return;
    try {
      const activity = {
        id: `act-${Date.now()}`,
        type: 'note',
        message: noteText.trim(),
        user: user?.email || 'Team Member',
        timestamp: new Date().toISOString()
      };

      await setDoc(doc(db, 'orders', id), {
        activities: [activity, ...(order.activities || [])]
      }, { merge: true });
      setNoteText('');
    } catch(err) {
      console.error(err);
    }
  };

  const handleStartQuickShip = (item: any) => {
     if (!id || !order) return;
     const remainingSizes = { ...item.sizes };
     
     order.boxes?.forEach((box: any) => {
        const boxItem = box.items?.find((bi: any) => String(bi.id) === String(item.id));
        if (boxItem && boxItem.sizes) {
           Object.entries(boxItem.sizes).forEach(([s, q]) => {
              remainingSizes[s] = Math.max(0, (remainingSizes[s] || 0) - (q as number));
           });
        }
     });

     const hasRemaining = Object.values(remainingSizes).some((q: any) => q > 0);
     if (!hasRemaining) {
         alert('All quantities for this item have already been packed into shipments.');
         return;
     }

     const initialSizes: Record<string, number> = {};
     Object.keys(remainingSizes).forEach(k => { initialSizes[k] = 0; });
     
     setQuickShipItem({ ...item, remainingSizes });
     setQuickShipSizes(initialSizes);
  };

  const handleSaveQuickShip = async () => {
     if (!quickShipItem || !id || !order) return;
     
     const totalQty = Object.values(quickShipSizes).reduce((a, b) => a + b, 0);
     if (totalQty === 0) {
        alert("Please select at least one item to ship.");
        return;
     }

     const orderDoc = await getDoc(doc(db, 'orders', id));
     const liveBoxes = orderDoc.data()?.boxes || [];

     let nextName = `Box ${(liveBoxes.length || 0) + 1}`;
     const boxIds = liveBoxes.map((b:any) => parseInt(b.name.replace('Box ', ''))).filter((n:number)=>!isNaN(n)) || [];
     if(boxIds.length > 0) nextName = `Box ${Math.max(...boxIds) + 1}`;

     const packedSizes: Record<string, number> = {};
     Object.entries(quickShipSizes).forEach(([s, q]) => {
        if (q > 0) packedSizes[s] = q;
     });

     const newBox = {
        id: `box-${Date.now()}`,
        name: nextName,
        createdAt: new Date().toISOString(),
        items: [{
           id: quickShipItem.id,
           style: quickShipItem.style || 'Custom Garment',
           color: quickShipItem.color || '',
           gender: quickShipItem.gender || '',
           image: quickShipItem.image || '',
           itemNum: quickShipItem.itemNum || '',
           sizes: packedSizes,
           qty: totalQty
        }]
     };
     
     const activity = {
       id: `act-${Date.now()}`,
       type: 'system',
       message: `Created ${nextName} containing ${totalQty} items`,
       user: user?.displayName || user?.email?.split('@')[0] || 'Team Member',
       timestamp: new Date().toISOString()
     };

     const updatedBoxes = [...liveBoxes, newBox];
     await setDoc(doc(db, 'orders', id), { 
       boxes: updatedBoxes,
       activities: [activity, ...(orderDoc.data()?.activities || [])]
     }, { merge: true });
     
     setExpandedItems(prev => ({ ...prev, [quickShipItem.id]: true }));
     
     setQuickShipItem(null);
     setQuickShipSizes({});
  };

  const handleToggleSizeComplete = async (item: any, size: string) => {
     if (!id || !order) return;
     const currentCompleted = item.completedSizes || [];
     const isCurrentlyCompleted = currentCompleted.includes(size);
     
     const newCompleted = isCurrentlyCompleted 
       ? currentCompleted.filter((s: string) => s !== size)
       : [...currentCompleted, size];

     const updatedItems = order.items.map((i: any) => 
       i.id === item.id ? { ...i, completedSizes: newCompleted } : i
     );
     
     const actionWord = isCurrentlyCompleted ? 'Unmarked' : 'Completed';
     const activity = {
       id: `act-${Date.now()}`,
       type: 'system',
       message: `${actionWord} size ${size} for ${item.style}`,
       user: user?.displayName || user?.email?.split('@')[0] || 'Team Member',
       timestamp: new Date().toISOString()
     };

     await setDoc(doc(db, 'orders', id), { 
       items: updatedItems,
       activities: [activity, ...(order.activities || [])]
     }, { merge: true });
  };

  const handleMainImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editItemObj) return;
    setIsUploadingMain(true);
    try {
      const storageRef = ref(storage, `orders/${id}/items/${editItemObj.id}/main-${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setEditItemObj((prev: any) => ({ ...prev, image: url }));
    } catch (err) {
      console.error('Failed to upload main image', err);
    } finally {
      setIsUploadingMain(false);
    }
  };

  const handleRefImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editItemObj) return;
    setIsUploadingRef(true);
    try {
      const storageRef = ref(storage, `orders/${id}/items/${editItemObj.id}/ref-${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setEditItemObj((prev: any) => ({ 
        ...prev, 
        referenceImages: [...(prev.referenceImages || []), url] 
      }));
    } catch (err) {
      console.error('Failed to upload ref image', err);
    } finally {
      setIsUploadingRef(false);
    }
  };

  const handleSaveItemEdit = async () => {
    if (!id || !editItemObj) return;
    setIsItemSaving(true);
    try {
      const orderData = orders.find(o => o.id === id);
      if (!orderData) throw new Error("Order not found");

      // Calculate new qty 
      const totalGarments = editItemObj.sizes ? Object.values(editItemObj.sizes).reduce((acc: number, val: any) => acc + (parseInt(val) || 0), 0) : 0;
      const numericPrice = parseFloat((editItemObj.price || '0').toString().replace(/[^0-9.]/g, ''));
      const lineTotal = `$${(totalGarments * numericPrice).toFixed(2)}`;

      const finalItem = {
        ...editItemObj,
        qty: totalGarments,
        total: lineTotal
      };

      const existingItems = orderData.items || [];
      const itemExists = existingItems.some((i: any) => i.id === finalItem.id);
      
      const updatedItems = itemExists 
        ? existingItems.map((i:any) => i.id === finalItem.id ? finalItem : i)
        : [...existingItems, finalItem];

      await setDoc(doc(db, 'orders', id), { items: updatedItems }, { merge: true });
      setEditItemObj(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsItemSaving(false);
    }
  };
  const handleDeleteItem = async () => {
    if (!id || !editItemObj) return;
    
    // Only process deletion if user clicks OK
    if (!window.confirm("Are you sure you want to delete this item?")) return;
    
    setIsItemSaving(true);
    try {
      const orderData = orders.find(o => o.id === id);
      if (!orderData) throw new Error("Order not found");

      const existingItems = orderData.items || [];
      const updatedItems = existingItems.filter((i: any) => i.id !== editItemObj.id);

      await setDoc(doc(db, 'orders', id), { items: updatedItems }, { merge: true });
      setEditItemObj(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsItemSaving(false);
    }
  };

  const handleDeleteBox = async (boxId: string) => {
    if (!id || !order) return;
    if (!window.confirm('Delete this shipment and its packing slip?')) return;
    try {
      const updatedBoxes = (order.boxes || []).filter((b: any) => b.id !== boxId);
      await setDoc(doc(db, 'orders', id), { boxes: updatedBoxes }, { merge: true });
    } catch (err) {
      console.error("Error deleting box:", err);
    }
  };

  // Update edit form when order loads or changes
  useEffect(() => {
    const order = orders.find(o => o.id === id);
    if (order) {
      setEditForm({
        title: order.title || '',
        date: order.date || '',
        statusIndex: order.statusIndex || 0,
        trackingCarrier: order.trackingCarrier || '',
        trackingNumber: order.trackingNumber || '',
        fulfillmentType: order.fulfillmentType || ''
      });
    }
  }, [orders, id]);

  const handleSaveEdit = async () => {
    if (!id) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'orders', id), {
        title: editForm.title,
        date: editForm.date,
        statusIndex: editForm.statusIndex,
        trackingCarrier: editForm.trackingCarrier,
        trackingNumber: editForm.trackingNumber,
        fulfillmentType: editForm.fulfillmentType
      }, { merge: true });
      setIsEditDialogOpen(false);
    } catch (err) {
      console.error("Error updating order:", err);
      // Fallback update could go here if using local state array, but we have onSnapshot so it's live!
    } finally {
      setIsSaving(false);
    }
  };

  if (loading || fetchingCustomer) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] text-brand-secondary gap-3">
        <Loader2 className="animate-spin" size={32} />
        <p className="font-semibold uppercase tracking-widest text-xs">Loading Order Details...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] text-brand-secondary gap-3">
        <p className="font-semibold uppercase tracking-widest text-xs">Order not found.</p>
        <PillButton variant="outline" onClick={() => navigate(-1)}>Back</PillButton>
      </div>
    );
  }

  const customer = {
    ...(MOCK_CUSTOMERS_DB['CUS-001']),
    ...mockCust,
    ...liveCustomer
  };
  
  // Calculate dynamic sums from the line items array
  const totalItems = order.items?.reduce((acc: number, i: any) => acc + (i.qty || 0), 0) || 0;
  const totalPriceRaw = order.items?.reduce((acc: number, i: any) => {
    const priceMatch = (i.total || '$0').replace(/[^0-9.]/g, '');
    return acc + (parseFloat(priceMatch) || 0);
  }, 0) || 0;
  const totalFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalPriceRaw);

  // Map strict 7-step Index to Admin pipeline Badge component
  const isKitting = order.fulfillmentType === 'Kitting' || (!order.fulfillmentType && customer.fulfillmentType === 'Kitting');
  let badgeStatus: StatusType = 'quote';
  switch(order.statusIndex) {
     case 0: badgeStatus = 'quote'; break;
     case 1: badgeStatus = 'notified'; break;
     case 2: badgeStatus = 'quote_sent'; break;
     case 3: badgeStatus = 'approved'; break;
     case 4: badgeStatus = 'shopping'; break;
     case 5: badgeStatus = 'ordered'; break;
     case 6: badgeStatus = 'processing'; break;
     case 7: 
        if (isKitting) { badgeStatus = 'inventory'; }
        else { badgeStatus = 'shipped'; }
        break;
     case 8: 
        if (isKitting) { badgeStatus = 'live'; }
        else { badgeStatus = 'received'; }
        break;
  }

  return (
    <div className={tokens.layout.container}>
      {/* Top Breadcrumb & Actions */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-brand-border">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-brand-secondary hover:text-brand-primary transition-colors"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <div className="flex items-center gap-3">
          <PillButton variant="outline" className="gap-2">
            <Download size={16} />
            Invoice
          </PillButton>
          <PillButton variant="filled" onClick={() => setIsEditDialogOpen(true)}>
            Edit Order
          </PillButton>
        </div>
      </div>

      <div>
        {/* Top Section: Order Information */}
        <div className="space-y-8">
          
          {/* Header */}
          <div className="bg-white p-8 rounded-card border border-brand-border shadow-sm">
            <div className="flex justify-between items-start mb-6">
               <div>
                  <h1 className="font-serif text-4xl text-brand-primary mb-2">{customer.company}</h1>
                  <p className="text-lg text-brand-secondary">{order.title}</p>
               </div>
               <div className="flex flex-col items-end gap-3 text-right">
                  <p className="text-xs uppercase font-bold tracking-widest text-brand-secondary">Order {order.portalId || order.id}</p>
                  
                  <div className="flex items-center gap-3">
                      <StatusBadge status={badgeStatus} />
                      
                      <div className="h-6 w-px bg-brand-border hidden sm:block"></div>
                      
                      <div className="relative">
                          <select 
                              className="appearance-none bg-brand-bg hover:bg-neutral-100 border border-brand-border rounded-lg pl-3 pr-8 py-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-secondary focus:border-brand-primary focus:outline-none transition-colors cursor-pointer"
                              value={order.statusIndex.toString()}
                              onChange={(e) => handleStatusChange(Number(e.target.value))}
                          >
                            <option value="0">0 - Request Created</option>
                            <option value="1">1 - Under Review</option>
                            <option value="2">2 - Quote Prepared</option>
                            <option value="3">3 - Approved</option>
                            <option value="4">4 - Sourcing</option>
                            <option value="5">5 - Ordered</option>
                            <option value="6">6 - In Production</option>
                            <option value="7">7 - {isKitting ? 'Inventory' : 'Shipped'}</option>
                            <option value="8">8 - {isKitting ? 'Live' : 'Received'}</option>
                          </select>
                          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-secondary pointer-events-none" />
                      </div>
                  </div>
               </div>
            </div>
            
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-6 border-t border-brand-border">
               <div>
                  <span className="text-xs text-brand-secondary font-medium uppercase tracking-wider block mb-1">Due Date</span>
                  <span className="font-serif text-lg">{order.date}</span>
               </div>
               <div>
                  <span className="text-xs text-brand-secondary font-medium uppercase tracking-wider block mb-1">Total Items</span>
                  <span className="font-serif text-lg">{totalItems}</span>
               </div>
               <div>
                  <span className="text-xs text-brand-secondary font-medium uppercase tracking-wider block mb-1">Delivery</span>
                  {!order.trackingCarrier ? (
                    <span className="font-serif text-lg">Pickup</span>
                  ) : (
                    <div>
                      <span className="font-serif text-lg block">{order.trackingCarrier}</span>
                      {order.trackingNumber && (
                        <a 
                          href={getTrackingLink(order.trackingCarrier, order.trackingNumber) || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-bold text-brand-primary hover:underline hover:text-black transition-colors"
                        >
                          {order.trackingNumber}
                        </a>
                      )}
                    </div>
                  )}
               </div>
               <div>
                  <span className="text-xs text-brand-secondary font-medium uppercase tracking-wider block mb-1">Est. Total</span>
                  <span className="font-serif text-lg">{totalFormatted}</span>
               </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-8 mt-8">
          {/* Garments / Items */}
          <div>
            <div className="flex justify-between items-center mb-4">
               <h2 className={tokens.typography.h2}>Details</h2>
               <PillButton 
                 variant="outline" 
                 onClick={() => setEditItemObj({
                   id: `item-${Date.now()}`,
                   gender: '',
                   style: '',
                   itemNum: '',
                   color: '',
                   sizes: { 'XS': 0, 'S': 0, 'M': 0, 'L': 0, 'XL': 0, '2XL': 0, '3XL': 0 },
                   price: '$0.00',
                   qty: 0,
                   total: '$0.00'
                 })}
                 className="gap-2 shrink-0 px-4 py-2 text-xs"
               >
                 <Plus size={14} /> Add Item
               </PillButton>
            </div>
            <div className="bg-white rounded-card border border-brand-border overflow-hidden">
               {order.items?.length > 0 ? order.items.map((item: any) => (
                 <div 
                   key={item.id} 
                   draggable
                   onDragStart={(e) => handleDragStart(e, item.id)}
                   onDragOver={(e) => handleDragOver(e, item.id)}
                   onDragEnd={handleDragEnd}
                   onDrop={(e) => handleDrop(e, item.id)}
                   className={`p-6 border-b border-brand-border/50 flex flex-col gap-6 items-start hover:bg-brand-bg transition-colors last:border-0 cursor-grab active:cursor-grabbing ${draggedItemId === item.id ? 'opacity-50' : ''} ${dragOverItemId === item.id ? 'border-t-2 border-t-brand-primary bg-brand-bg/50' : ''}`}
                 >
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 w-full relative group">
                       
                       {/* Edit Button */}
                       <button 
                         onClick={() => setEditItemObj(item)} 
                         className="absolute top-0 right-0 p-1.5 text-brand-secondary hover:text-brand-primary transition-colors opacity-0 group-hover:opacity-100 bg-white rounded-md shadow-sm border border-brand-border z-10"
                         title="Edit Item"
                       >
                         <Edit3 size={14} />
                       </button>

                       {/* Left Side: Visual & Specs & Artwork */}
                       <div className="flex flex-col gap-3 flex-1 min-w-0 pr-2 pb-2 lg:pb-0">
                         <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                           {/* Product Visual */}
                           <div className="flex items-center gap-4 w-[160px] shrink-0">
                             <div 
                               className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-black/5 bg-gray-50 flex items-center justify-center cursor-pointer hover:border-brand-primary transition-colors hover:shadow-md"
                               onClick={() => setExpandedImage({ src: item.image, alt: item.style })}
                               title="Click to view full screen"
                             >
                               <img src={item.image} alt={item.style} className="w-full h-full object-cover mix-blend-multiply p-1 pointer-events-none" />
                             </div>
                             <div>
                                <h4 className="font-bold text-gray-900 text-[15px]">{item.style}</h4>
                                <p className="text-xs font-semibold text-gray-500 mt-0.5">
                                   {item.gender && item.gender !== 'Unisex' ? `${item.gender} ` : ''} 
                                   {item.color ? (item.gender && item.gender !== 'Unisex' ? `- ${item.color}` : item.color) : ''}
                                </p>
                                
                                {/* Dropdown Chevron for Item Boxes under Garment Name */}
                                {(() => {
                                  const itemBoxes = order.boxes?.filter((b: any) => b.items?.some((bi: any) => String(bi.id) === String(item.id))) || [];
                                  
                                  return (
                                    <div className="flex items-center gap-2.5 mt-3">
                                      {itemBoxes.length > 0 && (
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setExpandedItems(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                                          }}
                                          className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest transition-all px-3 py-1.5 rounded-full border border-brand-border shrink-0 whitespace-nowrap ${expandedItems[item.id] ? 'bg-neutral-100 text-brand-primary shadow-inner border-brand-border/80' : 'bg-white text-brand-secondary hover:border-brand-primary hover:text-brand-primary shadow-sm hover:shadow-md hover:-translate-y-[1px]'}`}
                                        >
                                          <ChevronDown size={12} strokeWidth={3} className={`transition-transform duration-300 ${expandedItems[item.id] ? 'rotate-180 text-brand-primary' : ''}`} />
                                          <span>{itemBoxes.length} {itemBoxes.length === 1 ? 'Shipment' : 'Shipments'}</span>
                                        </button>
                                      )}
                                      <button 
                                        onClick={(e) => {
                                           e.stopPropagation();
                                           handleStartQuickShip(item);
                                        }}
                                        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-primary hover:text-white transition-all bg-brand-primary/5 hover:bg-brand-primary px-3 py-1.5 rounded-full border border-brand-primary/30 hover:border-brand-primary hover:shadow-md hover:-translate-y-[1px] shrink-0 whitespace-nowrap"
                                        title="Quick pack remaining quantities into a shipment"
                                      >
                                        <Plus size={12} strokeWidth={3} /> <span>Add Shipment</span>
                                      </button>
                                    </div>
                                  );
                                })()}
                             </div>
                           </div>

                           {/* Specs */}
                           <div className="flex flex-wrap gap-2 flex-1">
                              {item.itemNum && <DataPill label="Item #" value={item.itemNum} />}
                              {item.color && <DataPill label="Garment Color" value={item.color} />}
                              {item.logos?.map((logo: string, i: number) => (
                                <DataPill key={i} label={`Logo ${i+1}`} value={logo} />
                              ))}
                              {item.logos?.map((logo: string, i: number) => (
                                <a key={`art-${i}`} href="#" className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-secondary hover:text-brand-primary transition-colors bg-brand-bg/50 px-2 py-1.5 rounded-2xl border border-brand-border h-max my-auto" onClick={(e) => e.preventDefault()}>
                                   <Download size={10} /> {logo.replace(/\s+/g, '_')}_Art.ai
                                </a>
                              ))}
                           </div>
                         </div>
                       </div>

                       {/* Right Side: Sizing & Pricing */}
                       <div className="flex flex-wrap lg:flex-nowrap items-end lg:items-center gap-4 shrink-0">
                         {/* Sizing Grid Area */}
                         <div className="flex items-stretch gap-[2px] bg-neutral-200 p-[3px] rounded-xl font-sans shrink-0">
                           {item.sizes && Object.entries(item.sizes).sort(([a], [b]) => sortSizes(a, b)).map(([size, qty]: [string, any]) => {
                             const isCompleted = item.completedSizes?.includes(size);
                             return (
                             <div 
                               key={size} 
                               className={`min-w-[44px] px-0.5 group text-center flex flex-col cursor-pointer transition-all relative ${isCompleted ? 'opacity-60 hover:opacity-100' : 'hover:-translate-y-0.5 hover:shadow-sm'}`}
                               onClick={(e) => { e.stopPropagation(); handleToggleSizeComplete(item, size); }}
                               title={isCompleted ? "Mark incomplete" : "Click to mark as completed!"}
                             >
                               {/* Hover check hint overlay */}
                               {!isCompleted && (
                                 <div className="absolute inset-0 bg-brand-primary/5 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity z-10 flex flex-col items-center justify-center rounded-[8px] pointer-events-none">
                                    <Check size={20} className="text-brand-primary drop-shadow-md" strokeWidth={3} />
                                 </div>
                               )}

                               <div className={`text-[10px] font-bold py-1.5 px-2 rounded-t-[8px] uppercase tracking-wide h-6 flex items-center justify-center transition-colors relative z-0 ${isCompleted ? 'bg-green-500 text-white' : 'bg-neutral-300 text-neutral-600 group-hover:bg-neutral-400'}`}>
                                  {isCompleted ? <Check size={12} strokeWidth={4} /> : size}
                               </div>
                               <div className={`text-[12px] font-bold py-2 px-2 rounded-b-[8px] h-8 flex items-center justify-center transition-colors relative z-0 ${isCompleted ? 'bg-green-50 text-green-700' : (qty > 0 ? 'bg-white text-neutral-800 group-hover:bg-neutral-50' : 'bg-white text-neutral-400')}`}>
                                 {qty}
                               </div>
                             </div>
                           )})}
                         </div>

                         {/* Pricing Summary */}
                         <div className="flex items-stretch gap-[2px] bg-neutral-200 p-[3px] rounded-xl font-sans shrink-0">
                           <div className="w-12 text-center flex flex-col">
                             <div className="bg-neutral-300 text-neutral-600 text-[10px] font-bold py-1.5 rounded-t-[8px] uppercase tracking-wide h-6 flex items-center justify-center">QTY</div>
                             <div className="bg-neutral-50 text-neutral-800 text-[12px] font-bold py-2 rounded-b-[8px] h-8 flex items-center justify-center">{item.qty}</div>
                           </div>
                           <div className="w-16 text-center flex flex-col">
                             <div className="bg-neutral-300 text-neutral-600 text-[10px] font-bold py-1.5 rounded-t-[8px] uppercase tracking-wide h-6 flex items-center justify-center">Price</div>
                             <div className="bg-neutral-50 text-neutral-800 text-[12px] font-bold py-2 rounded-b-[8px] h-8 flex items-center justify-center">{item.price}</div>
                           </div>
                           <div className="w-20 text-center flex flex-col">
                             <div className="bg-neutral-300 text-neutral-600 text-[10px] font-bold py-1.5 rounded-t-[8px] uppercase tracking-wide h-6 flex items-center justify-center">Total</div>
                             <div className="bg-neutral-50 text-neutral-800 text-[12px] font-bold py-2 rounded-b-[8px] h-8 flex items-center justify-center">{item.total}</div>
                           </div>
                         </div>
                       </div>
                     </div>
                     
                     {/* Expanded Boxes List - Spans Full Width */}
                     {expandedItems[item.id] && (() => {
                       const itemBoxes = order.boxes?.filter((b: any) => b.items?.some((bi: any) => String(bi.id) === String(item.id))) || [];
                       if (itemBoxes.length === 0) return null;
                       return (
                         <div className="w-full mt-6 pt-6 border-t border-brand-border/40 flex flex-col gap-3">
                           {itemBoxes.map((box: any) => {
                             const publicUrl = `${window.location.origin}/packing-slip/${order.id}/${box.id}`;
                             return (
                               <div key={box.id} className="bg-white rounded-xl border border-brand-border shadow-sm flex flex-col md:flex-row p-4 gap-4 md:items-center hover:border-brand-primary/20 transition-colors w-full relative z-20">
                                 
                                 <div className="flex items-center gap-4 min-w-[180px]">
                                   <div className="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center text-brand-primary shrink-0">
                                     <Box size={20} />
                                   </div>
                                   <div>
                                     <h3 className="font-bold text-sm text-brand-primary">{box.name}</h3>
                                     <p className="text-[10px] text-brand-secondary font-medium tracking-wide flex gap-1 items-center">
                                       <Printer size={10} /> {box.items?.reduce((acc: number, bi: any) => acc + (bi.qty || 0), 0) || 0} ITEMS TOTAL
                                     </p>
                                   </div>
                                 </div>
                                 
                                 <div className="flex-1 md:border-l border-brand-border md:pl-4 overflow-y-auto custom-scrollbar flex flex-col gap-1 md:pr-4">
                                     {box.items?.filter((bi: any) => String(bi.id) === String(item.id)).map((bi: any, i: number) => (
                                       <div key={i} className="flex flex-col xl:flex-row items-start xl:items-center py-2 gap-2 xl:gap-8 min-w-0 flex-1">
                                          <div className="flex items-center justify-between w-full xl:w-auto xl:min-w-[180px]">
                                             <span className="font-bold text-brand-primary text-sm truncate">{bi.style}</span>
                                             <span className="font-bold text-brand-secondary text-xs bg-neutral-100 px-2 py-1 rounded-md">x{bi.qty}</span>
                                          </div>
                                          {bi.sizes && Object.keys(bi.sizes).length > 0 && (
                                             <div className="flex gap-1.5 flex-wrap w-full xl:flex-1">
                                                {Object.entries(bi.sizes).sort(([a],[b])=>sortSizes(a,b)).map(([s, q]: [string, any]) => (
                                                   <span key={s} className="text-xs font-bold text-brand-secondary bg-neutral-100 px-2.5 py-1.5 rounded-md border border-brand-border shadow-sm flex items-center justify-center min-w-[36px]">{s}: <span className="text-black ml-1">{q}</span></span>
                                                ))}
                                             </div>
                                          )}
                                       </div>
                                     ))}
                                    <p className="text-[10px] italic text-brand-secondary mt-1 max-w-[200px] leading-tight">
                                      {box.items?.length > 1 ? `(+ ${box.items.length - 1} other items inside)` : ''}
                                    </p>
                                 </div>
                                 
                                 <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
                                   <div 
                                     className="bg-white p-1.5 border border-brand-border rounded shadow-sm cursor-pointer hover:border-black transition-colors" 
                                     title="Click to Print Thermal Label" 
                                     onClick={(e) => { e.stopPropagation(); window.open(`/print/label/${order.id}/${box.id}`, '_blank', 'width=600,height=800'); }}
                                   >
                                     <QRCode value={publicUrl} size={36} />
                                   </div>
                                   <div className="flex flex-col gap-1.5 min-w-[100px]">
                                     <a href={publicUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-primary hover:text-black transition-colors tooltip whitespace-nowrap bg-neutral-50 hover:bg-neutral-100 px-3 py-1.5 rounded-full border border-neutral-200 w-full text-center" onClick={(e) => e.stopPropagation()}>
                                       <ExternalLink size={12} /> View Slip
                                     </a>
                                     <button onClick={(e) => { e.stopPropagation(); setTrackingBoxId(box.id); }} className={`flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors whitespace-nowrap px-3 py-1.5 rounded-full border border-neutral-200 w-full text-center ${box.trackingNumber || box.trackingCarrier ? 'bg-black text-white hover:bg-neutral-800 border-black' : 'text-brand-primary hover:text-black bg-neutral-50 hover:bg-neutral-100'}`}>
                                       <Truck size={12} /> {box.trackingNumber || box.trackingCarrier ? 'Edit Tracking' : 'Add Tracking'}
                                     </button>
                                   </div>
                                 </div>
                
                                 <button onClick={(e) => { e.stopPropagation(); handleDeleteBox(box.id); }} className="text-red-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors p-2 shrink-0 self-start sm:self-center ml-auto md:ml-0" title="Delete Box">
                                   <Trash2 size={16} />
                                 </button>
                
                               </div>
                             );
                           })}
                         </div>
                       );
                     })()}
                  </div>
               )) : (
                 <div className="p-6 text-center text-brand-secondary">No items found in this order.</div>
               )}
            </div>
          </div>
          
          <PackingSlipsManager order={order} onEditTracking={setTrackingBoxId} />
          
          {/* Bottom Grid: Team and Activity Feed */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              {/* Team Assignment */}
              <div className="bg-white p-6 rounded-card border border-brand-border shadow-sm h-full flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <h3 className={tokens.typography.h3}>Team</h3>
                  <button className="text-brand-secondary hover:text-brand-primary"><Users size={16} /></button>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-2 hover:bg-brand-bg rounded-lg transition-colors cursor-pointer">
                     <div className="w-8 h-8 rounded-full bg-brand-primary text-white text-xs font-bold flex items-center justify-center">AG</div>
                     <div>
                        <p className="text-sm font-medium">Anna Garcia</p>
                        <p className="text-xs text-brand-secondary">Production Manager</p>
                     </div>
                  </div>
                  <div className="flex items-center gap-3 p-2 hover:bg-brand-bg rounded-lg transition-colors cursor-pointer">
                     <div className="w-8 h-8 rounded-full bg-amber-500 text-brand-primary text-xs font-bold flex items-center justify-center">VM</div>
                     <div>
                        <p className="text-sm font-medium">Vanessa Miller</p>
                        <p className="text-xs text-brand-secondary">Printer</p>
                     </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              {/* Activity Feed */}
              <div className="bg-white p-6 rounded-card border border-brand-border shadow-sm flex flex-col h-full">
                <div className="flex items-center gap-2 mb-6">
                  <Clock className="text-brand-primary" size={20} />
                  <h3 className={tokens.typography.h3}>Activity</h3>
                </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar mb-4 max-h-[400px]">
               {order.activities && order.activities.length > 0 ? order.activities.map((act: any) => (
                 <div key={act.id} className="relative pl-6 border-l border-brand-border/60 pb-4 last:pb-0 last:border-0">
                    <div className={`absolute w-2 h-2 rounded-full left-[-4.5px] top-1.5 ring-4 ring-white ${act.type === 'status_change' ? 'bg-brand-primary' : 'bg-brand-secondary'}`}></div>
                    
                    {act.type === 'status_change' ? (
                       <p className="text-sm font-medium text-brand-primary mb-0.5">{act.message}</p>
                    ) : (
                       <>
                         <p className="text-sm font-medium text-brand-primary mb-1">{act.user.split('@')[0]}</p>
                         <div className="bg-brand-bg p-3 rounded-lg text-sm text-brand-secondary border border-brand-border/50">
                            {act.message}
                         </div>
                       </>
                    )}
                    
                    <p className="text-xs text-brand-secondary mt-1">
                      {new Date(act.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute:'2-digit' })} by {act.user.split('@')[0]}
                    </p>
                 </div>
               )) : (
                 <div className="text-xs text-brand-secondary text-center py-6">No activity recorded yet for this order.</div>
               )}
            </div>

            {/* Comment Input */}
            <form onSubmit={handleAddNote} className="mt-auto relative">
               <input 
                 type="text" 
                 value={noteText}
                 onChange={(e) => setNoteText(e.target.value)}
                 placeholder="Leave a note..." 
                 className="w-full bg-brand-bg border border-brand-border rounded-lg pl-4 pr-10 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
               />
               <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-secondary hover:text-brand-primary transition-colors">
                 <MessageSquare size={16} />
               </button>
            </form>
              </div>
            </div>
          </div>
      </div>

      {/* Edit Order Dialog */}
      {isEditDialogOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 overflow-y-auto">
          <div className="bg-brand-bg max-w-lg w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-brand-border my-auto">
            <div className="p-6 border-b border-brand-border flex justify-between items-center bg-white">
              <h3 className="font-serif text-2xl text-brand-primary">Edit Order</h3>
              <button 
                onClick={() => setIsEditDialogOpen(false)} 
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
                  value={editForm.title}
                  onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                  placeholder="e.g. Polos, Jackets, Accessories"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Due Date</label>
                <input 
                  type="text" 
                  value={editForm.date}
                  onChange={(e) => setEditForm(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                  placeholder="e.g. 3/29/26"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Fulfillment Type</label>
                  <select 
                    value={editForm.fulfillmentType}
                    onChange={(e) => setEditForm(prev => ({ ...prev, fulfillmentType: e.target.value }))}
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
                    value={editForm.statusIndex.toString()}
                    onChange={(e) => setEditForm(prev => ({ ...prev, statusIndex: parseInt(e.target.value) }))}
                    className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                  >
                    {(() => {
                      const formIsKitting = editForm.fulfillmentType === 'Kitting' || (!editForm.fulfillmentType && customer.fulfillmentType === 'Kitting');
                      return (
                        <>
                          <option value="0">0 - Quote</option>
                          <option value="1">1 - Mgmt Notified</option>
                          <option value="2">2 - Quote Sent</option>
                          <option value="3">3 - Approved</option>
                          <option value="4">4 - Shopping</option>
                          <option value="5">5 - Ordered</option>
                          <option value="6">6 - Processing</option>
                          <option value="7">7 - {formIsKitting ? 'Inventory' : 'Shipped'}</option>
                          <option value="8">8 - {formIsKitting ? 'Live (Shopify)' : 'Received'}</option>
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
                    value={editForm.trackingCarrier}
                    onChange={(e) => setEditForm(prev => ({ ...prev, trackingCarrier: e.target.value }))}
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
                    value={editForm.trackingNumber}
                    onChange={(e) => setEditForm(prev => ({ ...prev, trackingNumber: e.target.value }))}
                    className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                    placeholder="e.g. 1Z9999..."
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-brand-border">
                <PillButton variant="outline" onClick={() => setIsEditDialogOpen(false)} className="flex-1 justify-center py-3">
                  Cancel
                </PillButton>
                <PillButton variant="filled" onClick={handleSaveEdit} className="flex-1 justify-center py-3" disabled={isSaving}>
                  {isSaving ? <Loader2 className="animate-spin" size={18} /> : <span>Save Changes</span>}
                </PillButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Dialog */}
      {editItemObj && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 overflow-y-auto">
          <div className="bg-brand-bg max-w-2xl w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-brand-border my-auto">
            <div className="p-6 border-b border-brand-border flex justify-between items-center bg-white">
              <h3 className="font-serif text-2xl text-brand-primary">Edit Item Specs</h3>
              <div className="flex items-center gap-3">
                 <button 
                   onClick={() => setIsShopifySearchOpen(!isShopifySearchOpen)}
                   className="text-xs font-bold uppercase tracking-widest bg-brand-bg border border-brand-border px-3 py-1.5 rounded-lg flex items-center gap-2 hover:border-brand-primary transition-colors text-brand-primary"
                 >
                   <ShoppingBag size={14} /> Link Shopify Product
                 </button>
                 <button 
                   onClick={() => { setEditItemObj(null); setIsShopifySearchOpen(false); setShopifyProducts([]); }} 
                   className="text-brand-secondary hover:text-brand-primary transition-colors bg-brand-bg border border-brand-border rounded-md p-1"
                 >
                   <X size={20} />
                 </button>
              </div>
            </div>
            
            {isShopifySearchOpen && (
               <div className="bg-brand-bg/50 border-b border-brand-border p-6 shadow-inner">
                  <form onSubmit={handleSearchShopify} className="flex flex-col gap-3">
                     <label className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary">Search Active Catalog</label>
                     <div className="flex gap-3">
                       <div className="relative flex-1">
                          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-secondary" />
                          <input 
                             type="text" 
                             value={shopifySearchQuery} 
                             onChange={e => setShopifySearchQuery(e.target.value)} 
                             placeholder="Search product names..." 
                             className="w-full bg-white border border-brand-border rounded-lg pl-9 pr-4 py-2 text-sm focus:border-brand-primary focus:outline-none"
                             autoFocus
                          />
                       </div>
                       <PillButton type="submit" variant="filled" className="px-5 py-2 shrink-0" disabled={isSearchingShopify || !shopifySearchQuery.trim()}>
                           {isSearchingShopify ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
                       </PillButton>
                     </div>
                  </form>

                  {shopifyProducts.length > 0 && !isSearchingShopify && (
                     <div className="mt-4 max-h-[250px] overflow-y-auto custom-scrollbar border border-brand-border rounded-xl bg-white divide-y divide-brand-border/40">
                        {shopifyProducts.map((product) => (
                           <div key={product.id} className="p-3">
                              <div className="flex items-center gap-3 mb-2">
                                 {product.featuredImage?.url && (
                                   <img src={product.featuredImage.url} alt="" className="w-8 h-8 object-cover rounded shadow-sm border border-black/5" />
                                 )}
                                 <h4 className="font-bold text-sm text-brand-primary">{product.title}</h4>
                              </div>
                              <div className="flex flex-wrap gap-2 pl-11">
                                 {product.variants.map((v: any) => (
                                    <button 
                                      key={v.title}
                                      onClick={() => handleSelectShopifyProduct(product, v)}
                                      className="text-[10px] uppercase font-bold tracking-wide border border-brand-border px-3 py-1.5 rounded bg-brand-bg/30 hover:bg-black hover:text-white hover:border-black transition-colors"
                                    >
                                       {v.title} (${v.price})
                                    </button>
                                 ))}
                              </div>
                           </div>
                        ))}
                     </div>
                  )}
               </div>
            )}
            
            <div className="p-6 flex flex-col gap-6 max-h-[70vh] overflow-y-auto">
              {/* Basic Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Gender</label>
                  <select 
                    value={editItemObj.gender || ''}
                    onChange={(e) => setEditItemObj({...editItemObj, gender: e.target.value})}
                    className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 font-serif text-brand-secondary focus:border-brand-primary focus:outline-none transition-colors outline-none cursor-pointer"
                  >
                    <option value="" disabled>Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Accessories">Accessories</option>
                    <option value="Unisex">Unisex</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Garment Style Name</label>
                  <input 
                    type="text" 
                    value={editItemObj.style || ''}
                    onChange={(e) => setEditItemObj({...editItemObj, style: e.target.value})}
                    className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                    placeholder="e.g. Pique Polo"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Item #</label>
                  <input 
                    type="text" 
                    value={editItemObj.itemNum || ''}
                    onChange={(e) => setEditItemObj({...editItemObj, itemNum: e.target.value})}
                    className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Garment Color</label>
                  <input 
                    type="text" 
                    value={editItemObj.color || ''}
                    onChange={(e) => setEditItemObj({...editItemObj, color: e.target.value})}
                    className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Images Section */}
              <div className="pt-4 border-t border-brand-border">
                <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-4">Item Imagery</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Main Mockup */}
                  <div className="bg-brand-bg rounded-xl border border-brand-border p-4 flex flex-col gap-3">
                    <span className="text-xs font-semibold text-brand-primary">Main Mockup Image</span>
                    <div className="w-full aspect-square bg-white border border-brand-border rounded-lg flex items-center justify-center overflow-hidden">
                      {editItemObj.image ? (
                        <img src={editItemObj.image} alt="Main mockup" className="w-full h-full object-contain p-2" />
                      ) : (
                        <ImageIcon size={32} className="text-brand-muted/50" />
                      )}
                    </div>
                    <label className="cursor-pointer bg-white border border-brand-border rounded-lg py-2 flex items-center justify-center gap-2 hover:bg-brand-muted transition-colors text-sm font-semibold text-brand-secondary">
                      {isUploadingMain ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                      {isUploadingMain ? 'Uploading...' : 'Replace Mockup'}
                      <input type="file" className="hidden" accept="image/*" onChange={handleMainImageUpload} disabled={isUploadingMain} />
                    </label>
                  </div>

                  {/* Reference Images */}
                  <div className="bg-brand-bg rounded-xl border border-brand-border p-4 flex flex-col gap-3">
                    <span className="text-xs font-semibold text-brand-primary">Reference Images</span>
                    <div className="flex-1 border border-brand-border bg-white rounded-lg p-2 overflow-y-auto max-h-[220px]">
                      {editItemObj.referenceImages?.length > 0 ? (
                        <div className="grid grid-cols-3 gap-2">
                          {editItemObj.referenceImages.map((refImg: string, i: number) => (
                            <div key={i} className="relative aspect-square rounded group overflow-hidden border border-brand-border">
                              <img src={refImg} alt={`Reference ${i}`} className="w-full h-full object-cover" />
                              <button 
                                onClick={() => setEditItemObj({
                                  ...editItemObj,
                                  referenceImages: editItemObj.referenceImages.filter((_: any, idx: number) => idx !== i)
                                })}
                                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-brand-secondary p-4 text-center">
                          No extra reference images added yet.
                        </div>
                      )}
                    </div>
                    <label className="cursor-pointer bg-white border border-brand-border rounded-lg py-2 flex items-center justify-center gap-2 hover:bg-brand-muted transition-colors text-sm font-semibold text-brand-secondary">
                      {isUploadingRef ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                      {isUploadingRef ? 'Uploading...' : 'Add Reference Image'}
                      <input type="file" className="hidden" accept="image/*" onChange={handleRefImageUpload} disabled={isUploadingRef} />
                    </label>
                  </div>
                </div>
              </div>

              {/* Price */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Price Per Garment ($)</label>
                <input 
                  type="text" 
                  value={editItemObj.price || ''}
                  onChange={(e) => setEditItemObj({...editItemObj, price: e.target.value})}
                  className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                  placeholder="$0.00"
                />
              </div>

              {/* Logos */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Decoration Options (Logos)</label>
                <div className="space-y-3">
                  {[0, 1, 2].map(idx => (
                    <input 
                      key={idx}
                      type="text" 
                      placeholder={`e.g. Left Chest`}
                      value={editItemObj.logos?.[idx] || ''}
                      onChange={(e) => {
                        const newLogos = [...(editItemObj.logos || [])];
                        newLogos[idx] = e.target.value;
                        setEditItemObj({...editItemObj, logos: newLogos.filter(Boolean)});
                      }}
                      className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                    />
                  ))}
                </div>
              </div>

              {/* Sizing Grid */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Size Spread</label>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                  {Array.from(new Set([...SIZE_ORDER, ...Object.keys(editItemObj.sizes || {})])).sort(sortSizes).map((size) => (
                    <div key={size}>
                      <label className="block text-[10px] font-bold text-center text-brand-secondary mb-1">{size}</label>
                      <input 
                        type="number" 
                        min="0"
                        value={editItemObj.sizes?.[size] || ''}
                        onChange={(e) => setEditItemObj({
                          ...editItemObj, 
                          sizes: { ...editItemObj.sizes, [size]: parseInt(e.target.value) || 0 }
                        })}
                        className="w-full bg-white border border-brand-border rounded-lg px-2 py-2 text-sm text-center focus:border-brand-primary focus:outline-none transition-colors"
                      />
                      {editItemObj.shopifyInventoryMap && editItemObj.shopifyInventoryMap[size] !== undefined && (
                         <p className={`text-[9px] text-center font-bold tracking-wide mt-1 leading-tight ${editItemObj.shopifyInventoryMap[size] > 0 ? 'text-green-600' : 'text-red-500'}`}>
                           {editItemObj.shopifyInventoryMap[size]} In Stock
                         </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-brand-border mt-2">
                <button 
                  onClick={handleDeleteItem} 
                  className="px-4 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center border border-transparent hover:border-red-100"
                  title="Delete Item"
                  disabled={isItemSaving}
                >
                  <Trash2 size={20} />
                </button>
                <PillButton variant="outline" onClick={() => setEditItemObj(null)} className="flex-1 justify-center py-3">
                  Cancel
                </PillButton>
                <PillButton variant="filled" onClick={handleSaveItemEdit} className="flex-1 justify-center py-3" disabled={isItemSaving}>
                  {isItemSaving ? <Loader2 className="animate-spin" size={18} /> : <span>Save Item Update</span>}
                </PillButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Overlay */}
      {expandedImage && (
        <div 
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/20 backdrop-blur-sm p-6" 
          onClick={() => setExpandedImage(null)}
        >
           <button 
             className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors p-2 bg-black/50 rounded-full" 
             onClick={() => setExpandedImage(null)}
           >
             <X size={24} />
           </button>
           <div 
             className="relative w-full max-w-4xl aspect-video rounded-3xl overflow-hidden cursor-crosshair bg-white"
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
             <img 
               src={expandedImage.src} 
               alt={expandedImage.alt} 
               className="w-full h-full object-contain mix-blend-multiply transition-transform duration-200 ease-out hover:scale-[2]" 
             />
           </div>
        </div>
      )}

      {/* Quick Ship Modal */}
      {quickShipItem && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setQuickShipItem(null)}>
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full flex flex-col shadow-2xl border border-brand-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-2">
               <h3 className="text-2xl font-black text-gray-900 leading-tight">Quick Ship</h3>
               <button className="p-2 bg-neutral-100 hover:bg-neutral-200 rounded-full transition-colors" onClick={() => setQuickShipItem(null)}><X size={16} /></button>
            </div>
            
            <p className="font-semibold text-brand-primary mb-6 flex items-center gap-2 flex-wrap">
              <span className="bg-black text-white text-[10px] px-2 py-0.5 rounded uppercase tracking-widest shrink-0">Target Garment</span> 
              <span>{quickShipItem.style}</span>
            </p>
            
            <p className="text-[13px] text-gray-500 mb-6 font-medium bg-neutral-50 p-3 rounded-xl border border-neutral-100">Select sizes and quantities to pack. A new discrete tracking box will automatically generate containing precisely these items.</p>
            
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 mb-8">
               {Object.entries(quickShipItem.remainingSizes).sort(([a], [b]) => sortSizes(a, b)).map(([size, maxQty]: [string, any]) => {
                  if (maxQty === 0) return null;
                  return (
                    <div key={size} className="grid grid-rows-[1fr_auto] border border-brand-border shadow-sm rounded-xl overflow-hidden focus-within:border-black focus-within:ring-1 focus-within:ring-black transition-all bg-white group">
                       <div className="bg-neutral-100/60 p-1.5 flex flex-col items-center justify-center min-h-[44px] border-b border-brand-border group-focus-within:bg-neutral-100 transition-colors">
                         <span className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary leading-tight text-center line-clamp-2">{size}</span>
                       </div>
                       <div className="relative bg-white pb-6 pt-3 h-full">
                         <input 
                           type="number"
                           min="0"
                           max={maxQty}
                           value={quickShipSizes[size] === 0 ? '' : quickShipSizes[size]}
                           onChange={(e) => {
                              let val = parseInt(e.target.value) || 0;
                              if (val > maxQty) val = maxQty;
                              if (val < 0) val = 0;
                              setQuickShipSizes(prev => ({ ...prev, [size]: val }));
                           }}
                           className="w-full bg-transparent px-2 text-xl font-black text-center focus:outline-none placeholder:text-gray-200"
                           placeholder="0"
                         />
                         <span className="absolute bottom-1.5 left-0 w-full text-center text-[8px] font-bold text-brand-primary/40 uppercase tracking-widest">Max {maxQty}</span>
                       </div>
                    </div>
                  )
               })}
            </div>
            
            <div className="flex gap-4">
              <PillButton variant="outline" onClick={() => setQuickShipItem(null)} className="flex-1 justify-center py-4">Cancel</PillButton>
              <PillButton variant="filled" className="flex-1 justify-center bg-black text-white hover:bg-neutral-800 py-4 shadow-lg shadow-black/10" onClick={handleSaveQuickShip}>Submit Shipment</PillButton>
            </div>
          </div>
        </div>
      )}

      {trackingBoxId && (
        <TrackingModal
          order={order}
          boxId={trackingBoxId}
          onClose={() => setTrackingBoxId(null)}
        />
      )}
    </div>
  );
}
