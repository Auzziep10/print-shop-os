import { MoreHorizontal, Paperclip, MessageSquare, Loader2 } from 'lucide-react';
import { useOrders } from '../../hooks/useOrders';
import { MOCK_CUSTOMERS_DB } from '../../lib/mockData';
import { useNavigate } from 'react-router-dom';

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

  if (loading) {
     return (
        <div className="w-full h-64 flex flex-col items-center justify-center text-brand-secondary gap-3">
          <Loader2 className="animate-spin" size={32} />
        </div>
     );
  }

  return (
    <div className="grid grid-cols-7 gap-4 w-full pt-2">
      {COLUMNS.map(col => {
        const columnOrders = orders.filter(o => (o.statusIndex || 0) === col.id);
        
        return (
          <div key={col.id} className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-sans font-semibold text-xs text-brand-secondary uppercase tracking-widest">{col.title}</h3>
              <span className="w-6 h-6 rounded-md bg-white border border-brand-border text-brand-primary text-xs flex items-center justify-center font-medium shadow-sm">
                {columnOrders.length}
              </span>
            </div>
            
            <div className="flex flex-col gap-3 min-h-[150px] bg-brand-muted/40 rounded-2xl p-2 border border-brand-border/50 border-dashed">
              {columnOrders.map(order => {
                const customer = MOCK_CUSTOMERS_DB[order.customerId] || MOCK_CUSTOMERS_DB['CUS-001'];
                const companyName = customer?.company || 'Unknown Client';
                
                return (
                  <div 
                    key={order.id} 
                    onClick={() => navigate(`/orders/${order.id}`)}
                    className="bg-white p-3.5 rounded-2xl border border-brand-border shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_16px_-6px_rgba(0,0,0,0.1)] transition-all cursor-pointer group hover:-translate-y-0.5"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-semibold text-brand-secondary">{order.portalId || order.id.substring(0, 8)}</span>
                        {order.priority === 'rush' && (
                          <span className="px-1.5 py-0.5 rounded border border-red-200 bg-red-50 text-red-700 text-[8px] font-bold uppercase tracking-wider">Rush</span>
                        )}
                      </div>
                      <button className="text-brand-secondary opacity-0 group-hover:opacity-100 hover:text-brand-primary transition-opacity bg-brand-bg rounded-md p-1">
                        <MoreHorizontal size={12} />
                      </button>
                    </div>
                    
                    <h4 className="font-serif text-lg mb-0.5 text-brand-primary tracking-tight leading-snug truncate">{companyName}</h4>
                    <p className="text-xs text-brand-secondary mb-3 leading-relaxed truncate">{order.title}</p>
                    
                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-brand-border/50">
                      <div className="flex items-center gap-3 text-brand-secondary">
                        <div className="flex items-center gap-1 text-[10px] font-medium hover:text-brand-primary transition-colors"><Paperclip size={12} strokeWidth={2} /> 0</div>
                        <div className="flex items-center gap-1 text-[10px] font-medium hover:text-brand-primary transition-colors"><MessageSquare size={12} strokeWidth={2} /> 0</div>
                      </div>
                      <div className="w-6 h-6 rounded-full bg-brand-primary text-white text-[9px] font-bold flex items-center justify-center shadow-sm">
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
