import { useParams, useNavigate } from 'react-router-dom';
import { tokens } from '../../lib/tokens';
import { useState, useEffect } from 'react';
import { PillButton } from '../../components/ui/PillButton';
import { ArrowLeft, MessageSquare, Clock, Users, Link as LinkIcon, Download, Image as ImageIcon, Loader2, X, Edit3, Upload, Trash2, Plus } from 'lucide-react';
import { StatusBadge, type StatusType } from '../../components/ui/StatusBadge';
import { useOrders } from '../../hooks/useOrders';
import { MOCK_CUSTOMERS_DB } from '../../lib/mockData';
import { db, storage } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getTrackingLink } from '../../lib/utils';

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'OSFA'];

const sortSizes = (a: string, b: string) => {
  const iA = SIZE_ORDER.indexOf(a.toUpperCase());
  const iB = SIZE_ORDER.indexOf(b.toUpperCase());
  if (iA === -1 && iB === -1) return a.localeCompare(b);
  if (iA === -1) return 1;
  if (iB === -1) return -1;
  return iA - iB;
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
    trackingCarrier: '', trackingNumber: ''
  });

  const [editItemObj, setEditItemObj] = useState<any>(null);
  const [isItemSaving, setIsItemSaving] = useState(false);
  const [isUploadingMain, setIsUploadingMain] = useState(false);
  const [isUploadingRef, setIsUploadingRef] = useState(false);

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

  // Update edit form when order loads or changes
  useEffect(() => {
    const order = orders.find(o => o.id === id);
    if (order) {
      setEditForm({
        title: order.title || '',
        date: order.date || '',
        statusIndex: order.statusIndex || 0,
        trackingCarrier: order.trackingCarrier || '',
        trackingNumber: order.trackingNumber || ''
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
        trackingNumber: editForm.trackingNumber
      }, { merge: true });
      setIsEditDialogOpen(false);
    } catch (err) {
      console.error("Error updating order:", err);
      // Fallback update could go here if using local state array, but we have onSnapshot so it's live!
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] text-brand-secondary gap-3">
        <Loader2 className="animate-spin" size={32} />
        <p className="font-semibold uppercase tracking-widest text-xs">Loading Order Details...</p>
      </div>
    );
  }

  const order = orders.find(o => o.id === id);

  if (!order) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] text-brand-secondary gap-3">
        <p className="font-semibold uppercase tracking-widest text-xs">Order not found.</p>
        <PillButton variant="outline" onClick={() => navigate(-1)}>Back</PillButton>
      </div>
    );
  }

  const customer = MOCK_CUSTOMERS_DB[order.customerId] || MOCK_CUSTOMERS_DB['CUS-001'];
  
  // Calculate dynamic sums from the line items array
  const totalItems = order.items?.reduce((acc: number, i: any) => acc + (i.qty || 0), 0) || 0;
  const totalPriceRaw = order.items?.reduce((acc: number, i: any) => {
    const priceMatch = (i.total || '$0').replace(/[^0-9.]/g, '');
    return acc + (parseFloat(priceMatch) || 0);
  }, 0) || 0;
  const totalFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalPriceRaw);

  // Map strict 5-step Portal Index to our flexible Admin pipeline Badge component
  let badgeStatus: StatusType = 'quote';
  let subStatus = '';
  switch(order.statusIndex) {
     case 0: badgeStatus = 'quote'; subStatus = 'Quote'; break;
     case 1: badgeStatus = 'artwork'; subStatus = 'Artwork'; break;
     case 2: badgeStatus = 'approval'; subStatus = 'Approval'; break;
     case 3: badgeStatus = 'production'; subStatus = 'Production'; break;
     case 4: badgeStatus = 'qc'; subStatus = 'Quality Check'; break;
     case 5: badgeStatus = 'completed'; subStatus = 'Completed'; break;
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Order Information */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Header */}
          <div className="bg-white p-8 rounded-card border border-brand-border shadow-sm">
            <div className="flex justify-between items-start mb-6">
               <div>
                  <h1 className="font-serif text-4xl text-brand-primary mb-2">{customer.company}</h1>
                  <p className="text-lg text-brand-secondary">{order.title}</p>
               </div>
               <div className="text-right">
                  <p className="text-xs uppercase font-bold tracking-widest text-brand-secondary mb-3">Order {order.portalId || order.id}</p>
                  <StatusBadge status={badgeStatus} subStatus={subStatus} />
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

        {/* Right Column: Activity & Assignees */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Team Assignment */}
          <div className="bg-white p-6 rounded-card border border-brand-border shadow-sm">
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
      </div>

      <div className="space-y-8 mt-8">
          {/* Garments / Items */}
          <div>
            <div className="flex justify-between items-center mb-4">
               <h2 className={tokens.typography.h2}>Order Items</h2>
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
                 <div key={item.id} className="p-6 border-b border-brand-border/50 flex gap-6 items-start hover:bg-brand-bg transition-colors last:border-0">
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 w-full relative group">
                       
                       {/* Edit Button */}
                       <button 
                         onClick={() => setEditItemObj(item)} 
                         className="absolute top-0 right-0 p-1.5 text-brand-secondary hover:text-brand-primary transition-colors opacity-0 group-hover:opacity-100 bg-white rounded-md shadow-sm border border-brand-border z-10"
                         title="Edit Item"
                       >
                         <Edit3 size={14} />
                       </button>

                       {/* Left Side: Visual & Specs */}
                       <div className="flex flex-col lg:flex-row lg:items-center gap-4 flex-1 min-w-0 pr-2">
                         {/* Product Visual */}
                         <div className="flex items-center gap-4 w-[160px] shrink-0">
                           <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-black/5 bg-gray-50 flex items-center justify-center">
                             <img src={item.image} alt={item.style} className="w-full h-full object-cover mix-blend-multiply p-1" />
                           </div>
                           <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-gray-900 text-[15px]">{item.gender || 'Unisex'}</h4>
                              </div>
                              <p className="text-xs font-semibold text-gray-500 mt-1">{item.style}</p>
                           </div>
                         </div>

                         {/* Specs */}
                         <div className="flex flex-wrap gap-2 flex-1">
                            {item.itemNum && <DataPill label="Item #" value={item.itemNum} />}
                            {item.color && <DataPill label="Garment Color" value={item.color} />}
                            {item.logos?.map((logo: string, i: number) => (
                              <DataPill key={i} label={`Logo ${i+1}`} value={logo} />
                            ))}
                         </div>
                       </div>

                       {/* Right Side: Sizing & Pricing */}
                       <div className="flex flex-wrap lg:flex-nowrap items-end lg:items-center gap-4 shrink-0">
                         {/* Sizing Grid Area */}
                         <div className="flex items-stretch gap-[2px] bg-neutral-200 p-[3px] rounded-xl font-sans shrink-0">
                           {item.sizes && Object.entries(item.sizes).sort(([a], [b]) => sortSizes(a, b)).map(([size, qty]: [string, any]) => (
                             <div key={size} className="w-10 text-center flex flex-col">
                               <div className="bg-neutral-300 text-neutral-600 text-[10px] font-bold py-1.5 rounded-t-[8px] uppercase tracking-wide h-6 flex items-center justify-center">{size}</div>
                               <div className={`text-[12px] font-bold py-2 rounded-b-[8px] h-8 flex items-center justify-center bg-white ${qty > 0 ? 'text-neutral-800' : 'text-neutral-400'}`}>
                                 {qty}
                               </div>
                             </div>
                           ))}
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
                 </div>
               )) : (
                 <div className="p-6 text-center text-brand-secondary">No items found in this order.</div>
               )}
            </div>
          </div>
          
          {/* Artwork & Mockups */}
          <div>
            <div className="flex items-center justify-between mb-4">
               <h2 className={tokens.typography.h2}>Artwork Files</h2>
               <button className="text-sm font-semibold uppercase tracking-widest text-brand-secondary hover:text-brand-primary transition-colors">Upload</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
               <div className="aspect-square bg-white border border-brand-border rounded-card p-4 flex flex-col justify-between hover:-translate-y-1 transition-transform cursor-pointer shadow-sm">
                  <div className="h-full bg-brand-muted rounded flex items-center justify-center mb-3 border border-brand-border/50">
                     <ImageIcon className="text-brand-secondary/50" size={32} />
                  </div>
                  <div className="flex justify-between items-center w-full">
                     <span className="text-xs font-medium truncate">Left_Chest_Logo_v2.ai</span>
                     <LinkIcon size={14} className="text-brand-secondary" />
                  </div>
               </div>
            </div>
          </div>

          {/* Activity Feed */}
          <div className="bg-white p-6 rounded-card border border-brand-border shadow-sm flex flex-col ">
            <div className="flex items-center gap-2 mb-6">
              <Clock className="text-brand-primary" size={20} />
              <h3 className={tokens.typography.h3}>Activity</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-6 custom-scrollbar mb-4">
               {/* Event */}
               <div className="relative pl-6 border-l border-brand-border/60">
                  <div className="absolute w-2 h-2 rounded-full bg-brand-primary left-[-4.5px] top-1.5 ring-4 ring-white"></div>
                  <p className="text-sm font-medium text-brand-primary mb-0.5">Status changed to Printing</p>
                  <p className="text-xs text-brand-secondary">Today, 9:42 AM by Anna G.</p>
               </div>
               
               {/* Comment */}
               <div className="relative pl-6 border-l border-brand-border/60">
                  <div className="absolute w-2 h-2 rounded-full bg-brand-secondary left-[-4.5px] top-1.5 ring-4 ring-white"></div>
                  <p className="text-sm font-medium text-brand-primary mb-1">Vanessa Miller</p>
                  <div className="bg-brand-bg p-3 rounded-lg text-sm text-brand-secondary border border-brand-border/50">
                     Screens are burned and set up on press 2. Waiting for shirts to complete receiving.
                  </div>
                  <p className="text-xs text-brand-secondary mt-1">Yesterday, 3:15 PM</p>
               </div>

                {/* Event */}
               <div className="relative pl-6 border-l border-brand-border/60 pb-4">
                  <div className="absolute w-2 h-2 rounded-full bg-blue-500 left-[-4.5px] top-1.5 ring-4 ring-white"></div>
                  <p className="text-sm font-medium text-brand-primary mb-0.5">Artwork Approved</p>
                  <p className="text-xs text-brand-secondary">Oct 12, 10:00 AM by Client Portal</p>
               </div>
            </div>

            {/* Comment Input */}
            <div className="mt-auto relative">
               <input 
                 type="text" 
                 placeholder="Leave a note..." 
                 className="w-full bg-brand-bg border border-brand-border rounded-lg pl-4 pr-10 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
               />
               <button className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-secondary hover:text-brand-primary transition-colors">
                 <MessageSquare size={16} />
               </button>
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

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Pipeline Status</label>
                <select 
                  value={editForm.statusIndex.toString()}
                  onChange={(e) => setEditForm(prev => ({ ...prev, statusIndex: parseInt(e.target.value) }))}
                  className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                >
                  <option value="0">0 - Quote / Placed</option>
                  <option value="1">1 - Artwork</option>
                  <option value="2">2 - Approval</option>
                  <option value="3">3 - Production</option>
                  <option value="4">4 - Quality Check</option>
                  <option value="5">5 - Completed</option>
                </select>
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
              <button 
                onClick={() => setEditItemObj(null)} 
                className="text-brand-secondary hover:text-brand-primary transition-colors bg-brand-bg border border-brand-border rounded-md p-1"
              >
                <X size={20} />
              </button>
            </div>
            
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
                  {SIZE_ORDER.map((size) => (
                    <div key={size}>
                      <label className="block text-[10px] font-bold text-center text-brand-secondary mb-1">{size}</label>
                      <input 
                        type="number" 
                        min="0"
                        value={editItemObj.sizes?.[size] || 0}
                        onChange={(e) => setEditItemObj({
                          ...editItemObj, 
                          sizes: { ...editItemObj.sizes, [size]: parseInt(e.target.value) || 0 }
                        })}
                        className="w-full bg-white border border-brand-border rounded-lg px-2 py-2 text-sm text-center focus:border-brand-primary focus:outline-none transition-colors"
                      />
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

    </div>
  );
}
