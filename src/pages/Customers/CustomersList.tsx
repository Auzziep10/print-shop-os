import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';
import { Search, Filter, Plus, FileDown, MoreHorizontal, Building2, User } from 'lucide-react';

const MOCK_CUSTOMERS = [
  { id: 'CUS-001', company: 'Wayne Enterprises', contact: 'Bruce Wayne', type: 'B2B', activeOrders: 3, ltv: '$45,200', lastOrder: 'Oct 24, 2026' },
  { id: 'CUS-002', company: 'Stark Industries', contact: 'Tony Stark', type: 'B2B', activeOrders: 1, ltv: '$128,500', lastOrder: 'Oct 25, 2026' },
  { id: 'CUS-003', company: 'Daily Bugle', contact: 'J. Jonah Jameson', type: 'B2B', activeOrders: 2, ltv: '$12,400', lastOrder: 'Yesterday' },
  { id: 'CUS-004', company: 'Daily Planet', contact: 'Clark Kent', type: 'B2B', activeOrders: 1, ltv: '$8,900', lastOrder: 'Oct 28, 2026' },
  { id: 'CUS-005', company: 'Acme Corp', contact: 'Wile E. Coyote', type: 'B2B', activeOrders: 1, ltv: '$3,200', lastOrder: 'Oct 20, 2026' },
  { id: 'CUS-006', company: '-', contact: 'Peter Parker', type: 'DTC', activeOrders: 0, ltv: '$450', lastOrder: 'Sep 15, 2026' },
];

export function CustomersList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  return (
    <div className={tokens.layout.container}>
      {/* Page Header */}
      <div className={tokens.layout.pageHeader}>
        <div>
          <h1 className={tokens.typography.h1}>Customers</h1>
          <p className={tokens.typography.bodyMuted + " mt-2"}>
            Manage companies, contacts, and client portals.
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <PillButton variant="outline" className="gap-2">
            <FileDown size={16} />
            Export Context
          </PillButton>
          <PillButton variant="filled" className="gap-2">
            <Plus size={16} />
            New Customer
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
               placeholder="Search companies or contacts..." 
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
          Showing <span className="font-semibold text-brand-primary">6</span> customers
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-card border border-brand-border overflow-hidden custom-scrollbar overflow-x-auto shadow-sm">
        <div className="min-w-[1000px]">
          {/* Table Header */}
          <div className="grid grid-cols-[80px_minmax(250px,2fr)_minmax(200px,1.5fr)_100px_120px_120px_150px_60px] p-4 text-xs font-semibold uppercase tracking-wider text-brand-secondary border-b border-brand-border bg-brand-bg/60">
            <div className="px-2">ID</div>
            <div>Company</div>
            <div>Primary Contact</div>
            <div>Type</div>
            <div className="text-right">Active Orders</div>
            <div className="text-right">Lifetime Value</div>
            <div className="text-right pr-4">Last Order</div>
            <div></div>
          </div>
          
          {/* Table Body */}
          <div className="divide-y divide-brand-border/60">
            {MOCK_CUSTOMERS.map((customer) => (
              <div 
                key={customer.id} 
                onClick={() => navigate(`/customers/${customer.id}`)}
                className="grid grid-cols-[80px_minmax(250px,2fr)_minmax(200px,1.5fr)_100px_120px_120px_150px_60px] p-4 items-center hover:bg-brand-bg transition-colors cursor-pointer group"
              >
                <div className="px-2 text-xs font-semibold text-brand-secondary">{customer.id}</div>
                <div className="font-serif text-lg text-brand-primary truncate pr-4 flex items-center gap-3">
                  {customer.company !== '-' ? (
                    <>
                      <div className="w-8 h-8 rounded bg-brand-muted border border-brand-border flex items-center justify-center text-brand-secondary shrink-0">
                        <Building2 size={14} />
                      </div>
                      {customer.company}
                    </>
                  ) : (
                    <>
                      <div className="w-8 h-8 rounded-full bg-brand-muted border border-brand-border flex items-center justify-center text-brand-secondary shrink-0">
                        <User size={14} />
                      </div>
                      <span className="text-brand-secondary italic text-sm">Individual</span>
                    </>
                  )}
                </div>
                <div className="text-sm font-medium text-brand-primary truncate pr-4">{customer.contact}</div>
                <div>
                  <span className="text-[10px] bg-brand-bg border border-brand-border/60 px-2 py-0.5 rounded text-brand-secondary font-semibold tracking-wide uppercase">
                    {customer.type}
                  </span>
                </div>
                <div className="text-right text-sm font-medium text-brand-primary">
                  {customer.activeOrders > 0 ? (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-primary text-white text-xs">{customer.activeOrders}</span>
                  ) : (
                    <span className="text-brand-secondary">-</span>
                  )}
                </div>
                <div className="text-right text-sm font-serif text-brand-primary">{customer.ltv}</div>
                <div className="text-right pr-4 text-sm font-medium text-brand-secondary group-hover:text-brand-primary transition-colors">{customer.lastOrder}</div>
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
