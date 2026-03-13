import { MoreHorizontal, Paperclip, MessageSquare } from 'lucide-react';

const COLUMNS = [
  { id: 'quote', title: 'Quote' },
  { id: 'artwork', title: 'Artwork' },
  { id: 'approval', title: 'Approval' },
  { id: 'production', title: 'Production' },
  { id: 'qc', title: 'Quality Check' },
  { id: 'completed', title: 'Completed' }
];

const MOCK_ORDERS = [
  { id: 'ORD-101', customer: 'Acme Corp', title: '100x Black Tees', status: 'quote', priority: 'standard', items: 100 },
  { id: 'ORD-102', customer: 'Stark Industries', title: '50x Embroidered Hats', status: 'artwork', priority: 'rush', items: 50 },
  { id: 'ORD-103', customer: 'Wayne Ent', title: '250x Event Polos', status: 'production', subStatus: 'Printing', priority: 'standard', items: 250 },
  { id: 'ORD-105', customer: 'Daily Bugle', title: '1000x Tote Bags', status: 'production', subStatus: 'Curing', priority: 'standard', items: 1000 },
  { id: 'ORD-104', customer: 'Daily Planet', title: '20x Team Jackets', status: 'qc', priority: 'standard', items: 20 },
];

export function KanbanBoard() {
  return (
    <div className="grid grid-cols-6 gap-4 w-full pt-2">
      {COLUMNS.map(col => (
        <div key={col.id} className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-sans font-semibold text-xs text-brand-secondary uppercase tracking-widest">{col.title}</h3>
            <span className="w-6 h-6 rounded-md bg-white border border-brand-border text-brand-primary text-xs flex items-center justify-center font-medium shadow-sm">
              {MOCK_ORDERS.filter(o => o.status === col.id).length}
            </span>
          </div>
          
          <div className="flex flex-col gap-3 min-h-[150px] bg-brand-muted/40 rounded-2xl p-2 border border-brand-border/50 border-dashed">
            {MOCK_ORDERS.filter(o => o.status === col.id).map(order => (
              <div key={order.id} className="bg-white p-3.5 rounded-2xl border border-brand-border shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_16px_-6px_rgba(0,0,0,0.1)] transition-all cursor-pointer group hover:-translate-y-0.5">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-semibold text-brand-secondary">{order.id}</span>
                    {order.priority === 'rush' && (
                      <span className="px-1.5 py-0.5 rounded border border-red-200 bg-red-50 text-red-700 text-[8px] font-bold uppercase tracking-wider">Rush</span>
                    )}
                  </div>
                  <button className="text-brand-secondary opacity-0 group-hover:opacity-100 hover:text-brand-primary transition-opacity bg-brand-bg rounded-md p-1">
                    <MoreHorizontal size={12} />
                  </button>
                </div>
                
                <h4 className="font-serif text-lg mb-0.5 text-brand-primary tracking-tight leading-snug truncate">{order.customer}</h4>
                <p className="text-xs text-brand-secondary mb-3 leading-relaxed truncate">{order.title}</p>
                
                {order.subStatus && (
                   <div className="mb-4">
                     <span className="text-[10px] bg-brand-bg border border-brand-border/60 px-2.5 py-1 rounded-md text-brand-secondary font-semibold tracking-wide uppercase">
                        {order.subStatus}
                     </span>
                   </div>
                )}
                
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-brand-border/50">
                  <div className="flex items-center gap-3 text-brand-secondary">
                    <div className="flex items-center gap-1 text-[10px] font-medium hover:text-brand-primary transition-colors"><Paperclip size={12} strokeWidth={2} /> 2</div>
                    <div className="flex items-center gap-1 text-[10px] font-medium hover:text-brand-primary transition-colors"><MessageSquare size={12} strokeWidth={2} /> 1</div>
                  </div>
                  <div className="w-6 h-6 rounded-full bg-brand-primary text-white text-[9px] font-bold flex items-center justify-center shadow-sm">
                    {order.customer.charAt(0)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
