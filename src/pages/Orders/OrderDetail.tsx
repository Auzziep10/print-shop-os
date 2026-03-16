import { useParams, useNavigate } from 'react-router-dom';
import { tokens } from '../../lib/tokens';
import { useState, useEffect } from 'react';
import { PillButton } from '../../components/ui/PillButton';
import { ArrowLeft, MessageSquare, Clock, Users, Link as LinkIcon, Download, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { StatusBadge, type StatusType } from '../../components/ui/StatusBadge';
import { useOrders } from '../../hooks/useOrders';
import { MOCK_CUSTOMERS_DB } from '../../lib/mockData';
import { db } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

export function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { orders, loading } = useOrders();

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', date: '', statusIndex: 0 });

  // Update edit form when order loads or changes
  useEffect(() => {
    const order = orders.find(o => o.id === id);
    if (order) {
      setEditForm({
        title: order.title || '',
        date: order.date || '',
        statusIndex: order.statusIndex || 0,
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
        statusIndex: editForm.statusIndex
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
        <PillButton variant="outline" onClick={() => navigate('/orders')}>Back to Orders</PillButton>
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
     case 0: badgeStatus = 'quote'; subStatus = 'Placed'; break;
     case 1: badgeStatus = 'approval'; subStatus = 'Shopping'; break;
     case 2: badgeStatus = 'production'; subStatus = 'Ordered'; break;
     case 3: badgeStatus = 'production'; subStatus = 'Processing'; break;
     case 4: badgeStatus = 'completed'; subStatus = 'Shipped'; break;
     case 5: badgeStatus = 'completed'; subStatus = 'Received'; break;
  }

  return (
    <div className={tokens.layout.container}>
      {/* Top Breadcrumb & Actions */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-brand-border">
        <button 
          onClick={() => navigate('/orders')}
          className="flex items-center gap-2 text-sm text-brand-secondary hover:text-brand-primary transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Orders
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
                  <span className="font-serif text-lg">Pickup</span>
               </div>
               <div>
                  <span className="text-xs text-brand-secondary font-medium uppercase tracking-wider block mb-1">Est. Total</span>
                  <span className="font-serif text-lg">{totalFormatted}</span>
               </div>
            </div>
          </div>

          {/* Garments / Items */}
          <div>
            <h2 className={tokens.typography.h2 + " mb-4"}>Order Items</h2>
            <div className="bg-white rounded-card border border-brand-border overflow-hidden">
               {order.items?.length > 0 ? order.items.map((item: any) => (
                 <div key={item.id} className="p-6 border-b border-brand-border/50 flex gap-6 items-start hover:bg-brand-bg transition-colors last:border-0">
                    <div className="w-24 h-24 bg-brand-muted border border-brand-border rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden bg-white selection:bg-transparent">
                       <img src={item.image} alt={item.style} className="w-full h-full object-cover mix-blend-multiply p-1" />
                    </div>
                    <div className="flex-1">
                       <h3 className="font-serif text-xl mb-1">{item.style}</h3>
                       <p className="text-sm text-brand-secondary mb-3">Color: {item.color} • {item.itemNum}</p>
                       
                       <div className="flex flex-wrap items-center gap-2 mb-4">
                         {Object.entries(item.sizes || {}).map(([size, quantity]: [string, any]) => {
                           if (quantity > 0) {
                             return (
                               <div key={size} className="flex flex-col items-center">
                                 <span className="w-8 h-8 rounded border border-brand-border flex items-center justify-center text-xs font-semibold bg-brand-bg mb-1 uppercase">{size}</span>
                                 <span className="text-xs text-brand-secondary font-medium">{quantity}</span>
                               </div>
                             );
                           }
                           return null;
                         })}
                       </div>
                    </div>
                    <div className="text-right">
                       <span className="font-serif text-xl block">{item.price}</span>
                       <span className="text-xs text-brand-secondary">/ ea</span>
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

          {/* Activity Feed */}
          <div className="bg-white p-6 rounded-card border border-brand-border shadow-sm flex flex-col h-[500px]">
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
                  <option value="0">0 - Placed / Quote</option>
                  <option value="1">1 - Shopping / Approval</option>
                  <option value="2">2 - Ordered</option>
                  <option value="3">3 - Processing / Printing</option>
                  <option value="4">4 - Shipped</option>
                  <option value="5">5 - Received / Completed</option>
                </select>
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

    </div>
  );
}
