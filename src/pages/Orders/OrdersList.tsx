import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';
import { Search, Filter, Plus, FileDown, Loader2, Check, RefreshCw, Globe, X } from 'lucide-react';
import { StatusBadge, type StatusType } from '../../components/ui/StatusBadge';
import { useOrders } from '../../hooks/useOrders';
import { doc, updateDoc, collection, getDocs, addDoc, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ProductionCalendar } from '../Dashboard/ProductionCalendar';
import { Production } from '../Production/Production';
import { useAuth } from '../../contexts/AuthContext';
import { sendOrderStatusSMS } from '../../lib/smsService';
import { sendOrderStatusEmail } from '../../lib/emailService';
import { OrderReportsPanel } from './OrderReportsPanel';
import { formatDisplayDate } from '../../lib/utils';
import { isDiscountItem, isNonGarmentItem } from '../../lib/garmentUtils';

export function OrdersList() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { orders, loading } = useOrders();
  const nonTempOrders = [...orders]
    .filter(o => o.customerId !== 'Shopify Temporary')
    .sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (isNaN(timeA) && isNaN(timeB)) return b.id.localeCompare(a.id);
      if (isNaN(timeA)) return 1;
      if (isNaN(timeB)) return -1;
      return timeB - timeA;
    });
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'calendar';
  const [liveCustomers, setLiveCustomers] = useState<Record<string, any>>({});
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const todayDefault = new Date();
  const [newOrderForm, setNewOrderForm] = useState({
    customerId: '',
    title: '',
    rawDate: todayDefault.toLocaleDateString('en-CA'),
    date: todayDefault.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }),
    fulfillmentType: 'Standard',
    statusIndex: 0
  });

  const handleCreateOrder = async () => {
    if (!newOrderForm.customerId || !newOrderForm.title.trim()) return;
    setIsCreatingOrder(true);
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const ordersQuery = query(
        collection(db, 'orders'),
        where('createdAt', '>=', todayStart.toISOString()),
        where('createdAt', '<=', todayEnd.toISOString())
      );
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

      const portalId = `${prefix}${maxCount + 1}`;
      const selectedCust = liveCustomers[newOrderForm.customerId];
      const fulfillmentTypeToUse = newOrderForm.fulfillmentType || (selectedCust?.fulfillmentType ?? 'Standard');

      const docRef = await addDoc(collection(db, 'orders'), {
        customerId: newOrderForm.customerId,
        portalId,
        title: newOrderForm.title.trim(),
        date: newOrderForm.date,
        fulfillmentType: fulfillmentTypeToUse,
        statusIndex: newOrderForm.statusIndex,
        tracking: { carrier: '', number: '', url: '' },
        items: [],
        activities: [],
        createdAt: new Date().toISOString()
      });

      setIsNewOrderModalOpen(false);
      navigate(`/orders/${docRef.id}`);
    } catch (err) {
      console.error('Error creating order:', err);
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const displayedOrders = nonTempOrders.filter(order => {
    // 1. Tab filter
    const isQuote = order.statusIndex <= 2;
    if (currentTab === 'orders' && isQuote) return false;
    if (currentTab === 'quotes' && !isQuote) return false;

    // 2. Search filter
    if (search.trim()) {
      const query = search.toLowerCase();
      const liveCustomer = order.customerId ? liveCustomers[order.customerId] : null;
      const customerName = (liveCustomer?.company || liveCustomer?.name || order.customerId || '').toLowerCase();
      const title = (order.title || '').toLowerCase();
      const orderId = (order.portalId || order.id || '').toLowerCase();
      
      return customerName.includes(query) || title.includes(query) || orderId.includes(query);
    }

    return true;
  });

  useEffect(() => {
    getDocs(collection(db, 'customers')).then(snapshot => {
      const dbCusts: Record<string, any> = {};
      snapshot.docs.forEach(doc => {
        dbCusts[doc.id] = doc.data();
      });
      setLiveCustomers(dbCusts);
    });
  }, []);

  const handleNextStatus = async (e: React.MouseEvent, orderId: string, currentIndex: number) => {
    e.stopPropagation();
    // Advance logic 
    const nextIndex = currentIndex < 8 ? currentIndex + 1 : 0;
    try {
      await updateDoc(doc(db, 'orders', orderId), { statusIndex: nextIndex });
      sendOrderStatusSMS(orderId, nextIndex);
      sendOrderStatusEmail(orderId, nextIndex);
    } catch (err) {
      console.error("Error updating status: ", err);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] text-brand-secondary gap-3">
        <Loader2 className="animate-spin" size={32} />
        <p className="font-semibold uppercase tracking-widest text-xs">Loading Live Orders...</p>
      </div>
    );
  }

  return (
    <div className={tokens.layout.container}>
      {/* Page Header */}
      <div className={tokens.layout.pageHeader}>
        <div>
          <h1 className={tokens.typography.h1}>Orders & Quotes</h1>
          <p className={tokens.typography.bodyMuted + " mt-2"}>
            Manage all shop orders across the pipeline.
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <PillButton variant="outline" className="gap-2">
            <FileDown size={16} />
            Export
          </PillButton>
          <PillButton variant="filled" className="gap-2" onClick={() => setIsNewOrderModalOpen(true)}>
            <Plus size={16} />
            New Order
          </PillButton>
        </div>
      </div>

      <div className="flex items-center gap-6 mb-8 border-b border-brand-border">
          <button 
             onClick={() => setSearchParams({ tab: 'calendar' })}
             className={`pb-4 text-sm font-bold uppercase tracking-wider transition-all relative ${currentTab === 'calendar' ? 'text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
          >
             Calendar
             {currentTab === 'calendar' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-t-full" />}
          </button>
          <button 
             onClick={() => setSearchParams({ tab: 'orders' })}
             className={`pb-4 text-sm font-bold uppercase tracking-wider transition-all relative ${currentTab === 'orders' ? 'text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
          >
             Orders
             {currentTab === 'orders' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-t-full" />}
          </button>
          <button 
             onClick={() => setSearchParams({ tab: 'quotes' })}
             className={`pb-4 text-sm font-bold uppercase tracking-wider transition-all relative ${currentTab === 'quotes' ? 'text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
          >
             Quotes
             {currentTab === 'quotes' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-t-full" />}
          </button>
          <button 
             onClick={() => setSearchParams({ tab: 'production' })}
             className={`pb-4 text-sm font-bold uppercase tracking-wider transition-all relative ${currentTab === 'production' ? 'text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
          >
             Production
             {currentTab === 'production' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-t-full" />}
          </button>
          <button 
             onClick={() => setSearchParams({ tab: 'reports' })}
             className={`pb-4 text-sm font-bold uppercase tracking-wider transition-all relative ${currentTab === 'reports' ? 'text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
          >
             Reports
             {currentTab === 'reports' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-t-full" />}
          </button>
      </div>

      {/* Filters and Search Bar */}
      {currentTab !== 'production' && currentTab !== 'reports' && (
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between mb-6 gap-4">
        <div className="flex gap-2 w-full max-w-md">
           <div className="relative flex-1">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-secondary" size={16} />
             <input 
               type="text" 
               placeholder="Search orders..." 
               value={search}
               onChange={(e) => setSearch(e.target.value)}
               className="w-full pl-10 pr-4 py-2 bg-white border border-brand-border rounded-lg text-sm focus:border-brand-primary focus:outline-none transition-colors"
             />
           </div>
           <button className="px-4 py-2 bg-white border border-brand-border rounded-lg text-brand-secondary hover:text-brand-primary hover:bg-brand-bg transition-colors flex items-center gap-2 text-sm font-medium">
             <Filter size={16} />
             <span className="hidden sm:inline">Filter</span>
           </button>
        </div>
        
        <div className="text-sm text-brand-secondary">
          Showing <span className="font-semibold text-brand-primary">{displayedOrders.length}</span> {currentTab === 'quotes' ? 'active quotes' : currentTab === 'orders' ? 'active orders' : 'scheduled items'}
        </div>
      </div>
      )}

      {/* Production Calendar */}
      {currentTab === 'calendar' && (
        <div className="w-full mb-8">
           <ProductionCalendar orders={displayedOrders} />
        </div>
      )}

      {/* Production Pipeline */}
      {currentTab === 'production' && (
        <Production isEmbed={true} />
      )}

      {/* Reports Panel */}
      {currentTab === 'reports' && (
        <OrderReportsPanel liveCustomers={liveCustomers} />
      )}

      {/* Orders Table */}
      {currentTab !== 'calendar' && currentTab !== 'production' && currentTab !== 'reports' && (
        <div className="bg-white rounded-card border border-brand-border overflow-hidden custom-scrollbar overflow-x-auto shadow-sm">
        <div className="min-w-[1000px]">
          {/* Table Header */}
          <div className="grid grid-cols-[100px_minmax(200px,1fr)_minmax(250px,2fr)_150px_100px_120px_100px] p-4 text-xs font-semibold uppercase tracking-wider text-brand-secondary border-b border-brand-border bg-brand-bg/60">
            <div className="px-2">Order ID</div>
            <div>Customer</div>
            <div>Title</div>
            <div>Status</div>
            <div className="text-right">Items</div>
            <div className="text-right">{hasPermission('viewPricing') ? 'Total Price' : ''}</div>
            <div className="text-right pr-4">Due Date</div>
          </div>
          
          {/* Table Body */}
          <div className="divide-y divide-brand-border/60">
            {displayedOrders.map((order) => {
              
              // Calculate dynamic sums from the line items array
              const totalItems = order.items?.reduce((acc: number, i: any) => {
                const styleLower = (i.style || '').toLowerCase();
                const isShipping = styleLower.includes('shipping') || styleLower.includes('delivery') || (i.id && i.id.toString().startsWith('ship-')) || i.itemType === 'shipping';
                const isTax = styleLower.includes('tax');
                if (isShipping || isTax || isDiscountItem(i)) return acc;
                if (i.itemType === 'service' || isNonGarmentItem(i)) {
                  return acc + (parseInt(i.qty) || parseInt(i.quantity) || 0);
                }
                const sizeSum = i.sizes ? Object.values(i.sizes).reduce((sum: number, val: any) => sum + (parseInt(val) || 0), 0) : 0;
                return acc + (sizeSum > 0 ? sizeSum : (parseInt(i.qty) || parseInt(i.quantity) || 0));
              }, 0) || 0;

              let lineItemsDiscountTotal = 0;
              const itemsPriceRaw = order.items?.reduce((acc: number, i: any) => {
                const sizeSum = i.sizes ? Object.values(i.sizes).reduce((sum: number, val: any) => sum + (parseInt(val) || 0), 0) : 0;
                const safeQty = sizeSum > 0 ? sizeSum : (i.qty ? parseInt(i.qty.toString().replace(/[^0-9]/g, '')) || 0 : (i.quantity ? parseInt(i.quantity.toString().replace(/[^0-9]/g, '')) || 0 : 0));
                
                let safePriceNum = 0;
                if (i.price !== undefined && i.price !== null) {
                  const pString = i.price.toString().replace(/[^0-9.]/g, '');
                  if (pString !== '') safePriceNum = parseFloat(pString);
                }

                let itemVal = 0;
                if (safeQty > 0 && safePriceNum > 0) {
                  itemVal = safeQty * safePriceNum;
                } else {
                  const priceMatch = (i.total || '$0').toString().replace(/[^0-9.]/g, '');
                  itemVal = parseFloat(priceMatch) || 0;
                }

                if (isDiscountItem(i)) {
                  lineItemsDiscountTotal += Math.abs(itemVal);
                  return acc;
                }
                return acc + itemVal;
              }, 0) || 0;

              const showInvoiceServices = order.invoiceSettings?.showComplimentaryServices !== false;
              const rawCustomServices = showInvoiceServices
                ? (order.invoiceSettings?.customServices || order.customServices || [])
                : [];
              const pricedCustomServices = (Array.isArray(rawCustomServices) ? rawCustomServices : [])
                .map((srv: any) => {
                  const sPrice = parseFloat(srv?.price || 0) || 0;
                  const sQty = parseInt(srv?.qty || 1) || 1;
                  return {
                    name: String(srv?.name || 'Service Fee').trim() || 'Service Fee',
                    qty: sQty,
                    price: sPrice,
                    total: sPrice * sQty
                  };
                })
                .filter((srv) => srv.total > 0);
              const customServicesTotal = pricedCustomServices.reduce((sum, srv) => sum + srv.total, 0);
              const totalPriceRaw = itemsPriceRaw + customServicesTotal;

              const explicitDiscountAmt = Math.abs(parseFloat(order.discountAmount || 0) || 0) + Math.abs(parseFloat(order.shippingDiscountAmount || 0) || 0);
              const discountAmt = Math.max(explicitDiscountAmt, lineItemsDiscountTotal);
              const finalOrderTotal = Math.max(0, totalPriceRaw - discountAmt);
              // Format price beautifully
              const totalFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(finalOrderTotal);

              const liveCustomer = order.customerId ? liveCustomers[order.customerId] : null;
              
              const isKitting = liveCustomer?.fulfillmentType === 'Kitting';

              // Map flexible 9-step Admin pipeline Badge component
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

              // CRM Mapping just for visual clarity
              const customerName = liveCustomer?.company || liveCustomer?.name || order.customerId || 'Unknown Customer';

              return (
                <div 
                  key={order.id} 
                  onClick={() => navigate(`/orders/${order.id}`)}
                  className="grid grid-cols-[100px_minmax(200px,1fr)_minmax(250px,2fr)_150px_100px_120px_100px] p-4 items-center hover:bg-brand-bg transition-colors cursor-pointer group"
                >
                  <div className="px-2 text-xs font-semibold text-brand-secondary">{order.portalId || order.id}</div>
                  <div className="font-serif text-lg text-brand-primary truncate pr-4">{customerName}</div>
                  <div className="text-sm text-brand-secondary truncate pr-4 flex items-center gap-2">
                    <span className="truncate">{order.title}</span>
                    {order.hasUnreadCustomerUpdate && (
                      <span className="bg-amber-100 border border-amber-300 text-amber-900 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 flex items-center gap-1 animate-pulse" title="Customer resubmitted new size quantities">
                        <RefreshCw size={10} className="text-amber-600" /> Updated Qty
                      </span>
                    )}
                    {order.hasUnreadWebLead && (
                      <span className="bg-blue-100 border border-blue-300 text-blue-900 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 flex items-center gap-1 animate-pulse" title="New Web Lead Order">
                        <Globe size={10} className="text-blue-600" /> New Web Lead
                      </span>
                    )}
                  </div>
                  <div onClick={(e) => handleNextStatus(e, order.id, order.statusIndex)} className="group/badge" title="Click to bump status!">
                    <div className="group-hover/badge:scale-105 transition-transform origin-left">
                       <StatusBadge status={badgeStatus} />
                    </div>
                  </div>
                  <div className="text-right text-sm font-medium text-brand-primary">{totalItems} qt</div>
                  <div className="text-right text-sm font-serif text-brand-primary flex flex-col items-end justify-center">
                     <div className="flex items-center gap-1">
                       {order.paymentStatus === 'paid' && <div title="Paid"><Check size={14} className="text-emerald-500" strokeWidth={3} /></div>}
                       {hasPermission('viewPricing') ? totalFormatted : ''}
                     </div>
                     {order.discountCode && (
                       <span className="text-[9px] uppercase font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded mt-0.5" title={`Applied Discount Code: ${order.discountCode}`}>
                         {order.discountCode}
                       </span>
                     )}
                     {hasPermission('viewPricing') && pricedCustomServices.map((srv, idx) => (
                       <span
                         key={idx}
                         className="text-[9px] uppercase font-bold text-amber-800 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded mt-0.5"
                         title={`${srv.name}: +${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(srv.total)}`}
                       >
                         +{srv.name}
                       </span>
                     ))}
                  </div>
                  <div className="text-right pr-4 text-sm font-medium text-brand-secondary group-hover:text-brand-primary transition-colors">
                    {formatDisplayDate(order.date || order.targetCompletionDate || order.neededByDate) || '-'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}

      {/* Create New Order Modal */}
      {isNewOrderModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 overflow-y-auto">
          <div className="bg-brand-bg max-w-lg w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-brand-border my-auto">
            <div className="p-6 border-b border-brand-border flex justify-between items-center bg-white">
              <h3 className="font-serif text-2xl text-brand-primary">Create New Order</h3>
              <button
                onClick={() => setIsNewOrderModalOpen(false)}
                className="text-brand-secondary hover:text-brand-primary transition-colors bg-brand-bg border border-brand-border rounded-md p-1"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 flex flex-col gap-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Customer</label>
                <select
                  value={newOrderForm.customerId}
                  onChange={(e) => setNewOrderForm(prev => ({ ...prev, customerId: e.target.value }))}
                  className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                >
                  <option value="">Select a Customer...</option>
                  {Object.entries(liveCustomers)
                    .sort(([, a], [, b]) => ((a?.company || a?.contactName || '')).localeCompare(b?.company || b?.contactName || ''))
                    .map(([cid, cust]) => (
                      <option key={cid} value={cid}>
                        {cust?.company && cust.company !== '-' ? cust.company : (cust?.contactName || cid)}
                      </option>
                    ))}
                </select>
              </div>
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
                  className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm text-brand-primary focus:border-brand-primary focus:outline-none transition-colors min-h-[46px]"
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
                    <option value="Standard">Delivered</option>
                    <option value="Kitting">Inventory &amp; Kitting</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Pipeline Status</label>
                  <select
                    value={newOrderForm.statusIndex.toString()}
                    onChange={(e) => setNewOrderForm(prev => ({ ...prev, statusIndex: parseInt(e.target.value, 10) }))}
                    className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                  >
                    <option value="0">0 - Quote</option>
                    <option value="1">1 - Mgmt Notified</option>
                    <option value="2">2 - Quote Sent</option>
                    <option value="3">3 - Approved</option>
                    <option value="4">4 - Shopping</option>
                    <option value="5">5 - Ordered</option>
                    <option value="6">6 - Processing</option>
                    <option value="7">7 - Shipped</option>
                    <option value="8">8 - Received</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-4 pt-4 border-t border-brand-border">
                <PillButton variant="outline" onClick={() => setIsNewOrderModalOpen(false)} className="flex-1 justify-center py-3">
                  Cancel
                </PillButton>
                <PillButton
                  variant="filled"
                  onClick={handleCreateOrder}
                  className="flex-1 justify-center py-3"
                  disabled={isCreatingOrder || !newOrderForm.customerId || !newOrderForm.title.trim()}
                >
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
