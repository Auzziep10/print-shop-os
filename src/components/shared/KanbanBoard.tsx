import { MoreHorizontal, Paperclip, MessageSquare, Loader2 } from 'lucide-react';
import { useOrders } from '../../hooks/useOrders';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { useState, useEffect } from 'react';

const COLUMNS = [
  { id: 0, title: 'Quote' },
  { id: 1, title: 'Approved' },
  { id: 2, title: 'Shopping' },
  { id: 3, title: 'Ordered' },
  { id: 4, title: 'Processing' },
  { id: 5, title: 'Shipped / Inventory' },
  { id: 6, title: 'Received / Live' }
];

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
    columnOrders: orders.filter(o => (o.statusIndex || 0) === col.id)
  })).filter(col => col.columnOrders.length > 0);

  if (activeColumns.length === 0) {
    return (
      <div className="w-full py-16 flex flex-col items-center justify-center text-brand-secondary gap-3 bg-brand-muted/20 border border-brand-border/50 border-dashed rounded-2xl mt-4">
        <p className="font-medium">No active orders in the pipeline right now.</p>
      </div>
    );
  }

  return (
    <div 
      className="gap-6 pt-2 pb-4 w-full grid"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
    >
      {activeColumns.map(col => {
        return (
          <div key={col.id} className="flex flex-col gap-4 w-full">
            <div className="flex items-center justify-between px-2 pb-2 border-b border-brand-border/50">
              <h3 className="font-sans font-bold text-[11px] text-brand-secondary uppercase tracking-widest">{col.title}</h3>
              <span className="w-5 h-5 rounded-full bg-brand-bg border border-brand-border text-brand-primary text-[10px] flex items-center justify-center font-bold">
                {col.columnOrders.length}
              </span>
            </div>
            
            <div className="flex flex-col gap-3 min-h-[150px] bg-brand-bg/30 rounded-2xl p-2 border border-brand-border border-dashed h-full">
              {col.columnOrders.map(order => {
                const companyName = customers[order.customerId]?.company || customers[order.customerId]?.name || order.customerId || 'Unknown Client';
                
                return (
                  <div 
                    key={order.id} 
                    onClick={() => navigate(`/orders/${order.id}`)}
                    className="bg-white p-4 rounded-xl border border-brand-border shadow-sm hover:border-brand-primary hover:shadow-md transition-all cursor-pointer group flex flex-col"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 bg-brand-muted/50 rounded-md text-[10px] font-bold text-brand-secondary tracking-wide uppercase border border-brand-border">
                          {order.portalId || order.id.substring(0, 8)}
                        </span>
                        {order.priority === 'rush' && (
                          <span className="px-1.5 py-0.5 rounded-md border border-red-200 bg-red-50 text-red-700 text-[9px] font-bold uppercase tracking-wider">Rush</span>
                        )}
                      </div>
                      <button className="text-brand-secondary opacity-0 group-hover:opacity-100 hover:text-brand-primary transition-opacity bg-brand-muted/50 rounded p-1">
                        <MoreHorizontal size={14} />
                      </button>
                    </div>
                    
                    <h4 className="font-serif text-[17px] mb-1 text-brand-primary tracking-tight leading-snug truncate group-hover:underline decoration-brand-primary/30 underline-offset-4">{companyName}</h4>
                    <p className="text-[13px] text-brand-secondary mb-4 leading-relaxed line-clamp-2">{order.title}</p>
                    
                    <div className="flex items-center justify-between mt-auto pt-4 border-t border-brand-border/50">
                      <div className="flex items-center gap-4 text-brand-secondary/70">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold hover:text-brand-primary transition-colors cursor-pointer"><Paperclip size={13} strokeWidth={2.5} /> 0</div>
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold hover:text-brand-primary transition-colors cursor-pointer"><MessageSquare size={13} strokeWidth={2.5} /> 0</div>
                      </div>
                      <div className="w-7 h-7 rounded-full bg-brand-primary text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
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
