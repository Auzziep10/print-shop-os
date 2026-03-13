import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';
import { Search, Filter, Plus, FileDown, MoreHorizontal } from 'lucide-react';
import { StatusBadge, type StatusType } from '../../components/ui/StatusBadge';

const MOCK_ORDERS = [
  { id: 'ORD-101', customer: 'Acme Corp', title: '100x Black Tees', status: 'quote' as StatusType, items: 100, due: 'Oct 24, 2026', total: '$1,250' },
  { id: 'ORD-102', customer: 'Stark Industries', title: '50x Embroidered Hats', status: 'artwork' as StatusType, items: 50, due: 'Oct 25, 2026', total: '$850' },
  { id: 'ORD-103', customer: 'Wayne Ent', title: '250x Event Polos', status: 'production' as StatusType, subStatus: 'Printing', items: 250, due: 'Today', total: '$4,500' },
  { id: 'ORD-105', customer: 'Daily Bugle', title: '1000x Tote Bags', status: 'production' as StatusType, subStatus: 'Curing', items: 1000, due: 'Tomorrow', total: '$3,200' },
  { id: 'ORD-104', customer: 'Daily Planet', title: '20x Team Jackets', status: 'qc' as StatusType, items: 20, due: 'Oct 28, 2026', total: '$1,800' },
  { id: 'ORD-106', customer: 'LexCorp', title: '500x Mugs', status: 'completed' as StatusType, items: 500, due: 'Oct 20, 2026', total: '$2,100' },
  { id: 'ORD-107', customer: 'Oscorp', title: '150x Hoodies', status: 'approval' as StatusType, items: 150, due: 'Oct 29, 2026', total: '$3,400' },
];

export function OrdersList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  return (
    <div className={tokens.layout.container}>
      {/* Page Header */}
      <div className={tokens.layout.pageHeader}>
        <div>
          <h1 className={tokens.typography.h1}>Orders</h1>
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

      {/* Filters and Search Bar */}
      <div className="flex items-center justify-between mb-6">
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
            {MOCK_ORDERS.map((order) => (
              <div 
                key={order.id} 
                onClick={() => navigate(`/orders/${order.id}`)}
                className="grid grid-cols-[100px_minmax(200px,1fr)_minmax(250px,2fr)_150px_100px_120px_100px_60px] p-4 items-center hover:bg-brand-bg transition-colors cursor-pointer group"
              >
                <div className="px-2 text-xs font-semibold text-brand-secondary">{order.id}</div>
                <div className="font-serif text-lg text-brand-primary truncate pr-4">{order.customer}</div>
                <div className="text-sm text-brand-secondary truncate pr-4">{order.title}</div>
                <div>
                  <StatusBadge status={order.status} subStatus={order.subStatus} />
                </div>
                <div className="text-right text-sm font-medium text-brand-primary">{order.items}</div>
                <div className="text-right text-sm font-serif text-brand-primary">{order.total}</div>
                <div className="text-right pr-4 text-sm font-medium text-brand-secondary group-hover:text-brand-primary transition-colors">{order.due}</div>
                <div className="flex justify-end">
                   <button className="p-1.5 text-brand-secondary hover:text-brand-primary rounded-md hover:bg-white transition-colors">
                     <MoreHorizontal size={18} />
                   </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
