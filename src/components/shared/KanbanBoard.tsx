import { MoreHorizontal, Paperclip, MessageSquare, Loader2 } from 'lucide-react';
import { useOrders } from '../../hooks/useOrders';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { useState, useEffect } from 'react';

const COLUMNS = [
  { id: 'quote', title: 'Quote', matchStatuses: [0, 1, 2] },
  { id: 'approved', title: 'Approved', matchStatuses: [3] },
  { id: 'shopping', title: 'Shopping', matchStatuses: [4] },
  { id: 'ordered', title: 'Ordered', matchStatuses: [5] },
  { id: 'processing', title: 'Processing', matchStatuses: [6] },
  { id: 'shipped', title: 'Shipped / Inventory', matchStatuses: [7] },
  { id: 'received', title: 'Received / Live', matchStatuses: [8] }
];

const getOrderProgress = (order: any) => {
  let totalGarments = 0;
  let completedGarments = 0;
  
  if (order.items) {
    order.items.forEach((item: any) => {
      let sizeSum = 0;
      if (item.sizes) {
        Object.entries(item.sizes).forEach(([size, qty]: [string, any]) => {
          const q = parseInt(qty as string) || 0;
          sizeSum += q;
          if (item.completedSizes?.includes(size)) {
            completedGarments += q;
          }
        });
      }
      totalGarments += Math.max(parseInt(item.qty as string) || 0, sizeSum);
    });
  }
  
  return {
    total: totalGarments,
    completed: completedGarments,
    percent: totalGarments > 0 ? Math.round((completedGarments / totalGarments) * 100) : 0
  };
};

export function KanbanBoard() {
  const { orders, loading } = useOrders();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Record<string, any>>({});

  useEffect(() => {
    getDocs(collection(db, 'customers')).then(snap => {
      const obj: Record<string,any> = {};
      snap.forEach(d => { obj[d.id] = d.data(); });
      setCustomers(obj);
    }).catch(e => console.error(e));
  }, []);

  if (loading) {
     return (
        <div className="w-full h-64 flex flex-col items-center justify-center text-brand-secondary gap-3">
          <Loader2 className="animate-spin" size={32} />
        </div>
     );
  }

  const activeColumns = COLUMNS.map(col => ({
    ...col,
    columnOrders: orders.filter(o => col.matchStatuses.includes(o.statusIndex || 0) && o.customerId !== 'Shopify Temporary')
  })).filter(col => col.columnOrders.length > 0);

  if (activeColumns.length === 0) {
    return (
      <div className="w-full py-16 flex flex-col items-center justify-center text-brand-secondary gap-3 bg-brand-muted/20 border border-brand-border/50 border-dashed rounded-2xl mt-4">
        <p className="font-medium">No active orders in the pipeline right now.</p>
      </div>
    );
  }

  return (
    <div className="flex gap-5 pt-2 pb-3 w-full overflow-x-auto custom-scrollbar items-stretch">
      {activeColumns.map(col => {
        return (
          <div key={col.id} className="flex flex-col gap-3 w-[290px] shrink-0">
            <div className="flex items-center justify-between px-2 pb-1.5 border-b border-brand-border/50">
              <h3 className="font-sans font-bold text-[10px] text-brand-secondary uppercase tracking-widest leading-none">{col.title}</h3>
              <span className="w-5 h-5 rounded-full bg-brand-bg border border-brand-border text-brand-primary text-[10px] flex items-center justify-center font-bold">
                {col.columnOrders.length}
              </span>
            </div>
            
            <div className="flex flex-col gap-2.5 bg-brand-bg/20 rounded-2xl p-2 border border-brand-border border-dashed max-h-[380px] overflow-y-auto custom-scrollbar flex-1">
              {col.columnOrders.map(order => {
                const companyName = customers[order.customerId]?.company || customers[order.customerId]?.name || order.customerId || 'Unknown Client';
                const isRush = order.priority === 'rush';
                const progress = getOrderProgress(order);
                const showProgress = order.statusIndex >= 6 && progress.total > 0;

                return (
                  <div 
                    key={order.id} 
                    onClick={() => navigate(`/orders/${order.id}`)}
                    className={`bg-white p-3 rounded-xl border border-brand-border border-l-4 ${isRush ? 'border-l-red-500' : 'border-l-brand-primary/30'} shadow-[0_1px_3px_rgba(0,0,0,0.02)] hover:border-brand-primary hover:shadow-md transition-all cursor-pointer group flex flex-col gap-2`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="px-1.5 py-0.5 bg-neutral-100 rounded text-[9px] font-bold text-neutral-500 font-mono border border-neutral-200/50">
                        {order.portalId || order.id.substring(0, 8)}
                      </span>
                      
                      <div className="flex items-center gap-1.5">
                        {isRush && (
                          <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 text-[8px] font-bold uppercase tracking-wider border border-red-200/60 shadow-sm">
                            Rush
                          </span>
                        )}
                        <span className="text-brand-secondary opacity-0 group-hover:opacity-100 hover:text-brand-primary transition-all rounded p-0.5">
                          <MoreHorizontal size={12} />
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex-1">
                      <h4 className="font-serif text-[15px] font-bold text-brand-primary leading-snug truncate group-hover:underline decoration-brand-primary/30 underline-offset-2">
                        {companyName}
                      </h4>
                      <p className="text-[12px] text-brand-secondary mt-0.5 truncate leading-normal" title={order.title}>
                        {order.title || 'Untitled Order'}
                      </p>
                    </div>

                    {showProgress && (
                      <div className="flex flex-col gap-1 mt-0.5 bg-neutral-50/50 p-2 rounded-lg border border-neutral-100/80">
                        <div className="flex justify-between items-center text-[9px] font-bold text-neutral-400 tracking-wider">
                          <span>PRODUCTION</span>
                          <span>{progress.completed}/{progress.total} PCS ({progress.percent}%)</span>
                        </div>
                        <div className="w-full h-1 bg-neutral-100 rounded-full overflow-hidden mt-0.5">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${progress.percent === 100 ? 'bg-green-500' : 'bg-brand-primary/80'}`}
                            style={{ width: `${progress.percent}%` }}
                          />
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between pt-2 border-t border-brand-border/40 mt-0.5">
                      <div className="flex items-center gap-3 text-brand-secondary/60">
                        <div className="flex items-center gap-1 text-[10px] font-semibold hover:text-brand-primary transition-colors">
                          <Paperclip size={12} strokeWidth={2.5} /> 0
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-semibold hover:text-brand-primary transition-colors">
                          <MessageSquare size={12} strokeWidth={2.5} /> 0
                        </div>
                      </div>
                      <div className="w-5.5 h-5.5 rounded-full bg-brand-bg border border-brand-border text-brand-primary text-[9px] font-bold flex items-center justify-center shadow-sm uppercase shrink-0">
                        {companyName.charAt(0)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
