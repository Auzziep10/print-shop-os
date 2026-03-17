import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';
import { Search, Filter, Plus, FileDown, MoreHorizontal, Building2, User } from 'lucide-react';

import { useEffect, useMemo } from 'react';
import { MOCK_CUSTOMERS_DB } from '../../lib/mockData';
import { db } from '../../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { useOrders } from '../../hooks/useOrders';

export function CustomersList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  
  const { orders, loading: ordersLoading } = useOrders();
  const [liveCustomers, setLiveCustomers] = useState<Record<string, any>>({});
  const [isLiveCustomersLoading, setIsLiveCustomersLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'customers'), (snapshot) => {
      const dbCusts: Record<string, any> = {};
      snapshot.docs.forEach(doc => {
        dbCusts[doc.id] = doc.data();
      });
      setLiveCustomers(dbCusts);
      setIsLiveCustomersLoading(false);
    });
    return () => unsub();
  }, []);

  const customersList = useMemo(() => {
    return Object.entries(MOCK_CUSTOMERS_DB).map(([id, mockData]) => {
      const liveData = liveCustomers[id] || {};
      const companyString = liveData.company || mockData.company || '-';
      
      const customerOrders = orders.filter(o => o.customerId === id);
      const ordersToDate = customerOrders.length;
      
      const ltvValue = customerOrders.reduce((acc, order) => {
        const orderTotal = order.items?.reduce((sum: number, item: any) => {
          const priceStr = (item.total || '$0').replace(/[^0-9.]/g, '');
          return sum + (parseFloat(priceStr) || 0);
        }, 0) || 0;
        return acc + orderTotal;
      }, 0);
      const ltvFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(ltvValue);

      let lastOrderStr = '-';
      if (customerOrders.length > 0) {
        lastOrderStr = customerOrders[customerOrders.length - 1].date || '-';
      }

      return {
        id,
        company: companyString,
        contact: liveData.email || mockData.email || 'N/A', // Using email as contact name fallback
        type: liveData.type || mockData.type || 'B2C',
        ordersToDate,
        ltv: ltvFormatted,
        lastOrder: lastOrderStr,
        logo: liveData.logo !== undefined ? liveData.logo : (mockData.logo || null),
      };
    }).filter(c => c.company.toLowerCase().includes(search.toLowerCase()) || 
                   c.contact.toLowerCase().includes(search.toLowerCase()) ||
                   c.id.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.company.localeCompare(b.company));
  }, [liveCustomers, orders, search]);

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
          Showing <span className="font-semibold text-brand-primary">{customersList.length}</span> customers
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-card border border-brand-border overflow-hidden custom-scrollbar overflow-x-auto shadow-sm">
        <div className="min-w-[1000px]">
          {/* Table Header */}
          <div className="grid grid-cols-[minmax(250px,2fr)_minmax(200px,1.5fr)_100px_120px_120px_150px_60px] p-4 text-xs font-semibold uppercase tracking-wider text-brand-secondary border-b border-brand-border bg-brand-bg/60">
            <div>Company</div>
            <div>Primary Contact</div>
            <div>Type</div>
            <div className="text-right">Orders to Date</div>
            <div className="text-right">Lifetime Value</div>
            <div className="text-right pr-4">Last Order</div>
            <div></div>
          </div>
          
          {/* Table Body */}
          <div className="divide-y divide-brand-border/60">
            {isLiveCustomersLoading || ordersLoading ? (
              <div className="flex flex-col items-center justify-center p-12 text-brand-secondary">
                 <div className="w-8 h-8 rounded-full border-4 border-brand-primary/20 border-t-brand-primary animate-spin mb-4"></div>
                 <p className="font-medium text-sm">Loading Customers...</p>
              </div>
            ) : customersList.map((customer) => (
              <div 
                key={customer.id} 
                onClick={() => navigate(`/customers/${customer.id}`)}
                className="grid grid-cols-[minmax(250px,2fr)_minmax(200px,1.5fr)_100px_120px_120px_150px_60px] p-4 items-center hover:bg-brand-bg transition-colors cursor-pointer group"
              >
                <div className="font-serif text-lg text-brand-primary truncate pr-4 flex items-center gap-4">
                  {customer.logo ? (
                    <div className="w-10 h-10 flex items-center justify-center shrink-0">
                      <img src={customer.logo} alt={customer.company} className="w-full h-full object-contain mix-blend-multiply" />
                    </div>
                  ) : customer.company !== '-' ? (
                    <div className="w-10 h-10 rounded-lg bg-brand-muted border border-brand-border flex items-center justify-center text-brand-secondary shrink-0">
                      <Building2 size={18} />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-brand-muted border border-brand-border flex items-center justify-center text-brand-secondary shrink-0">
                      <User size={18} />
                    </div>
                  )}
                  {customer.company !== '-' ? (
                    <span>{customer.company}</span>
                  ) : (
                    <span className="text-brand-secondary italic text-sm">Individual</span>
                  )}
                </div>
                <div className="text-sm font-medium text-brand-primary truncate pr-4">{customer.contact}</div>
                <div>
                  <span className="text-[10px] bg-brand-bg border border-brand-border/60 px-2 py-0.5 rounded text-brand-secondary font-semibold tracking-wide uppercase">
                    {customer.type}
                  </span>
                </div>
                <div className="text-right text-sm font-medium text-brand-primary">
                  {customer.ordersToDate > 0 ? (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-primary text-white text-xs">{customer.ordersToDate}</span>
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
