import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';
import { Search, Filter, Plus, FileDown, MoreHorizontal, Loader2 } from 'lucide-react';
import { StatusBadge, type StatusType } from '../../components/ui/StatusBadge';
import { useOrders } from '../../hooks/useOrders';
import { doc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export function OrdersList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { orders, loading } = useOrders();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'orders';
  const [liveCustomers, setLiveCustomers] = useState<Record<string, any>>({});

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
          <PillButton variant="filled" className="gap-2">
            <Plus size={16} />
            New Order
          </PillButton>
        </div>
      </div>

      <div className="flex items-center gap-6 mb-8 border-b border-brand-border">
          <button 
             onClick={() => setSearchParams({ tab: 'orders' })}
             className={`pb-4 text-sm font-bold uppercase tracking-wider transition-all relative ${currentTab === 'orders' ? 'text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
          >
             All Orders
             {currentTab === 'orders' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-t-full" />}
          </button>
          <button 
             onClick={() => setSearchParams({ tab: 'quotes' })}
             className={`pb-4 text-sm font-bold uppercase tracking-wider transition-all relative ${currentTab === 'quotes' ? 'text-brand-primary' : 'text-brand-secondary hover:text-brand-primary'}`}
          >
             Quotes
             {currentTab === 'quotes' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-t-full" />}
          </button>
      </div>

      {/* Filters and Search Bar */}
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
             Filter
           </button>
        </div>
        
        <div className="text-sm text-brand-secondary">
          Showing <span className="font-semibold text-brand-primary">7</span> active orders
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-card border border-brand-border overflow-hidden custom-scrollbar overflow-x-auto shadow-sm">
        <div className="min-w-[1000px]">
          {/* Table Header */}
          <div className="grid grid-cols-[100px_minmax(200px,1fr)_minmax(250px,2fr)_150px_100px_120px_100px_60px] p-4 text-xs font-semibold uppercase tracking-wider text-brand-secondary border-b border-brand-border bg-brand-bg/60">
            <div className="px-2">Order ID</div>
            <div>Customer</div>
            <div>Title</div>
            <div>Status</div>
            <div className="text-right">Items</div>
            <div className="text-right">Est. Total</div>
            <div className="text-right pr-4">Due Date</div>
            <div></div>
          </div>
          
          {/* Table Body */}
          <div className="divide-y divide-brand-border/60">
            {orders.filter(order => {
                const isQuote = order.statusIndex <= 2;
                if (currentTab === 'quotes') return isQuote;
                // Currently, 'orders' shows ALL, including Quotes? Let's just show all.
                return true;
            }).map((order) => {
              
              // Calculate dynamic sums from the line items array
              const totalItems = order.items?.reduce((acc: number, i: any) => acc + (i.qty || 0), 0) || 0;
              const totalPriceRaw = order.items?.reduce((acc: number, i: any) => {
                const priceMatch = (i.total || '$0').replace(/[^0-9.]/g, '');
                return acc + (parseFloat(priceMatch) || 0);
              }, 0) || 0;

              // Format price beautifully
              const totalFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalPriceRaw);

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
                  className="grid grid-cols-[100px_minmax(200px,1fr)_minmax(250px,2fr)_150px_100px_120px_100px_60px] p-4 items-center hover:bg-brand-bg transition-colors cursor-pointer group"
                >
                  <div className="px-2 text-xs font-semibold text-brand-secondary">{order.portalId || order.id}</div>
                  <div className="font-serif text-lg text-brand-primary truncate pr-4">{customerName}</div>
                  <div className="text-sm text-brand-secondary truncate pr-4">{order.title}</div>
                  <div onClick={(e) => handleNextStatus(e, order.id, order.statusIndex)} className="group/badge" title="Click to bump status!">
                    <div className="group-hover/badge:scale-105 transition-transform origin-left">
                       <StatusBadge status={badgeStatus} />
                    </div>
                  </div>
                  <div className="text-right text-sm font-medium text-brand-primary">{totalItems} qt</div>
                  <div className="text-right text-sm font-serif text-brand-primary">{totalFormatted}</div>
                  <div className="text-right pr-4 text-sm font-medium text-brand-secondary group-hover:text-brand-primary transition-colors">{order.date}</div>
                  <div className="flex justify-end">
                     <button className="p-1.5 text-brand-secondary hover:text-brand-primary rounded-md hover:bg-white transition-colors">
                       <MoreHorizontal size={18} />
                     </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
