import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  Search, 
  FileText, 
  Folder, 
  Building2, 
  Calendar,
  X,
  ArrowRight,
  Sparkles
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

const PAGES = [
  { name: 'Dashboard', path: '/', category: 'Pages', description: 'View system metrics, alerts, and live meetings' },
  { name: 'Orders List', path: '/orders', category: 'Pages', description: 'Manage print orders, quotes, and production status' },
  { name: 'Production Pipeline', path: '/orders?tab=production', category: 'Pages', description: 'Monitor order steps and schedule timeline' },
  { name: 'Artwork Pipeline', path: '/orders?tab=production&sub=artwork', category: 'Pages', description: 'Track proof approvals and design files' },
  { name: 'Reports', path: '/orders?tab=reports', category: 'Pages', description: 'Analyze sales, profit margins, and costs' },
  { name: 'Customers List', path: '/customers', category: 'Pages', description: 'View clients, companies, and contacts' },
  { name: 'Inventory', path: '/inventory', category: 'Pages', description: 'Manage garments, boxes, and stock counts' },
  { name: 'Mobile Inventory Scan', path: '/inventory/scan', category: 'Pages', description: 'Scan box barcodes with your mobile device' },
  { name: 'Team Members', path: '/team', category: 'Pages', description: 'View user capacities and workload distribution' },
  { name: 'Team Meetings', path: '/team/meetings', category: 'Pages', description: 'Sync meetings, checklists, and capacity scores' },
  { name: 'Settings', path: '/settings', category: 'Pages', description: 'Configure system defaults and user roles' },
  { name: 'Signatures & Profiles', path: '/settings?tab=signatures', category: 'Pages', description: 'Manage print setup specifications' },
  { name: 'Public Quote Request', path: '/start', category: 'Pages', description: 'Access the external client quoting form' }
];

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Load Firestore data when search is open
  useEffect(() => {
    if (!isOpen) return;

    const unsubOrders = onSnapshot(collection(db, 'orders'), (snap) => {
      const list: any[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });
      list.sort((a, b) => b.id.localeCompare(a.id));
      setOrders(list);
    });

    const unsubCustomers = onSnapshot(collection(db, 'customers'), (snap) => {
      const list: any[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });
      list.sort((a, b) => (a.company || '').localeCompare(b.company || ''));
      setCustomers(list);
    });

    const unsubMeetings = onSnapshot(collection(db, 'meetings'), (snap) => {
      const list: any[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });
      list.sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime());
      setMeetings(list);
    });

    return () => {
      unsubOrders();
      unsubCustomers();
      unsubMeetings();
    };
  }, [isOpen]);

  // Map Customer IDs to Company Names for Order Search
  const customerMap = useMemo(() => {
    const map: Record<string, string> = {};
    customers.forEach(c => {
      if (c.id && c.company) {
        map[c.id] = c.company;
      }
    });
    return map;
  }, [customers]);

  // Filter lists based on query
  const filteredPages = useMemo(() => {
    if (!query.trim()) return PAGES;
    return PAGES.filter(p => 
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.description.toLowerCase().includes(query.toLowerCase())
    );
  }, [query]);

  const filteredOrders = useMemo(() => {
    if (!query.trim()) return [];
    return orders.filter(o => {
      const companyName = o.customerId ? (customerMap[o.customerId] || '') : '';
      return (
        (o.title || '').toLowerCase().includes(query.toLowerCase()) ||
        (o.portalId || '').toLowerCase().includes(query.toLowerCase()) ||
        o.id.toLowerCase().includes(query.toLowerCase()) ||
        companyName.toLowerCase().includes(query.toLowerCase())
      );
    }).slice(0, 5); // Cap to 5 results for clean view
  }, [query, orders, customerMap]);

  const filteredCustomers = useMemo(() => {
    if (!query.trim()) return [];
    return customers.filter(c => 
      (c.company || '').toLowerCase().includes(query.toLowerCase()) ||
      (c.contactName || '').toLowerCase().includes(query.toLowerCase()) ||
      (c.email || '').toLowerCase().includes(query.toLowerCase())
    ).slice(0, 5); // Cap to 5 results for clean view
  }, [query, customers]);

  const filteredMeetings = useMemo(() => {
    if (!query.trim()) return [];
    return meetings.filter(m => 
      (m.title || '').toLowerCase().includes(query.toLowerCase()) ||
      (m.summary || '').toLowerCase().includes(query.toLowerCase()) ||
      (m.date || '').toLowerCase().includes(query.toLowerCase())
    ).slice(0, 5); // Cap to 5 results for clean view
  }, [query, meetings]);

  // Flattened results list for easy index-based navigation
  const flatResults = useMemo(() => {
    const list: any[] = [];
    filteredPages.forEach(p => list.push({ ...p, type: 'page', key: `page-${p.name}` }));
    filteredOrders.forEach(o => list.push({ ...o, type: 'order', key: `order-${o.id}` }));
    filteredCustomers.forEach(c => list.push({ ...c, type: 'customer', key: `customer-${c.id}` }));
    filteredMeetings.forEach(m => list.push({ ...m, type: 'meeting', key: `meeting-${m.id}` }));
    return list;
  }, [filteredPages, filteredOrders, filteredCustomers, filteredMeetings]);

  // Handle keydown navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (flatResults.length === 0 ? 0 : (prev + 1) % flatResults.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (flatResults.length === 0 ? 0 : (prev - 1 + flatResults.length) % flatResults.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (flatResults[selectedIndex]) {
          handleSelect(flatResults[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, flatResults, selectedIndex]);

  // Scroll active item into view inside the scroll container
  useEffect(() => {
    const activeEl = containerRef.current?.querySelector('.active-search-item');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Reset selected index when search query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = (item: any) => {
    onClose();
    if (item.type === 'page') {
      navigate(item.path);
    } else if (item.type === 'order') {
      navigate(`/orders/${item.id}`);
    } else if (item.type === 'customer') {
      navigate(`/customers/${item.id}`);
    } else if (item.type === 'meeting') {
      navigate('/team/meetings', { state: { selectMeetingId: item.id } });
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/50 backdrop-blur-md transition-opacity duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-[#f7f4ef] border border-[#ded8ce] rounded-[24px] shadow-2xl max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[75vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input Box */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[#ded8ce] bg-white relative">
          <Search className="text-brand-secondary shrink-0" size={20} strokeWidth={2.5} />
          <input 
            ref={inputRef}
            type="text" 
            placeholder="Search pages, orders, customers, or meetings..." 
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full text-base bg-transparent text-brand-primary placeholder:text-brand-secondary/60 focus:outline-none border-none py-1 font-sans"
          />
          <button 
            onClick={onClose}
            className="p-1 rounded-full text-brand-secondary hover:bg-neutral-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search Results List */}
        <div 
          ref={containerRef}
          className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4"
        >
          {flatResults.length === 0 ? (
            <div className="py-12 text-center text-brand-secondary text-sm flex flex-col items-center gap-2">
              <Sparkles size={24} className="text-brand-secondary/40" />
              <p>No results found for <span className="font-semibold">"{query}"</span></p>
              <p className="text-xs text-brand-secondary/70">Try searching for pages like "meetings", or orders by title/client.</p>
            </div>
          ) : (
            <>
              {/* Pages Section */}
              {filteredPages.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary px-3 py-1.5">
                    Pages
                  </h3>
                  <div className="space-y-1">
                    {filteredPages.map((page) => {
                      const itemIndex = flatResults.findIndex(r => r.key === `page-${page.name}`);
                      const isActive = selectedIndex === itemIndex;
                      return (
                        <div 
                          key={page.name}
                          onClick={() => handleSelect({ ...page, type: 'page' })}
                          onMouseEnter={() => setSelectedIndex(itemIndex)}
                          className={`flex items-start gap-3 p-3 rounded-[16px] transition-all cursor-pointer group ${
                            isActive 
                              ? 'bg-[#111] text-white active-search-item' 
                              : 'hover:bg-[#ded8ce]/30 text-brand-primary'
                          }`}
                        >
                          <div className={`p-2 rounded-lg ${isActive ? 'bg-white/10 text-white' : 'bg-[#ded8ce]/30 text-brand-secondary group-hover:text-brand-primary'}`}>
                            <Folder size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold flex items-center justify-between">
                              <span>{page.name}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${isActive ? 'bg-white/20 text-white' : 'bg-brand-bg text-brand-secondary'}`}>
                                Route
                              </span>
                            </div>
                            <p className={`text-xs mt-0.5 truncate ${isActive ? 'text-white/70' : 'text-brand-secondary'}`}>
                              {page.description}
                            </p>
                          </div>
                          {isActive && <ArrowRight size={16} className="self-center text-white/50" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Orders Section */}
              {filteredOrders.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary px-3 py-1.5">
                    Orders
                  </h3>
                  <div className="space-y-1">
                    {filteredOrders.map((order) => {
                      const itemIndex = flatResults.findIndex(r => r.key === `order-${order.id}`);
                      const isActive = selectedIndex === itemIndex;
                      const company = order.customerId ? (customerMap[order.customerId] || '') : '';
                      return (
                        <div 
                          key={order.id}
                          onClick={() => handleSelect({ ...order, type: 'order' })}
                          onMouseEnter={() => setSelectedIndex(itemIndex)}
                          className={`flex items-start gap-3 p-3 rounded-[16px] transition-all cursor-pointer group ${
                            isActive 
                              ? 'bg-[#111] text-white active-search-item' 
                              : 'hover:bg-[#ded8ce]/30 text-brand-primary'
                          }`}
                        >
                          <div className={`p-2 rounded-lg ${isActive ? 'bg-white/10 text-white' : 'bg-[#ded8ce]/30 text-brand-secondary group-hover:text-brand-primary'}`}>
                            <FileText size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold flex items-center justify-between">
                              <span className="truncate pr-2">{order.title || 'Untitled Order'}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${isActive ? 'bg-white/20 text-white' : 'bg-brand-bg text-brand-secondary'}`}>
                                #{order.portalId || order.id.substring(0, 6)}
                              </span>
                            </div>
                            <p className={`text-xs mt-0.5 truncate ${isActive ? 'text-white/70' : 'text-brand-secondary'}`}>
                              {company ? `${company} • ` : ''}Due: {order.targetCompletionDate || order.date || 'N/A'}
                            </p>
                          </div>
                          {isActive && <ArrowRight size={16} className="self-center text-white/50" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Customers Section */}
              {filteredCustomers.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary px-3 py-1.5">
                    Customers
                  </h3>
                  <div className="space-y-1">
                    {filteredCustomers.map((customer) => {
                      const itemIndex = flatResults.findIndex(r => r.key === `customer-${customer.id}`);
                      const isActive = selectedIndex === itemIndex;
                      return (
                        <div 
                          key={customer.id}
                          onClick={() => handleSelect({ ...customer, type: 'customer' })}
                          onMouseEnter={() => setSelectedIndex(itemIndex)}
                          className={`flex items-start gap-3 p-3 rounded-[16px] transition-all cursor-pointer group ${
                            isActive 
                              ? 'bg-[#111] text-white active-search-item' 
                              : 'hover:bg-[#ded8ce]/30 text-brand-primary'
                          }`}
                        >
                          <div className={`p-2 rounded-lg ${isActive ? 'bg-white/10 text-white' : 'bg-[#ded8ce]/30 text-brand-secondary group-hover:text-brand-primary'}`}>
                            <Building2 size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold flex items-center justify-between">
                              <span className="truncate">{customer.company !== '-' ? customer.company : 'Individual Client'}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${isActive ? 'bg-white/20 text-white' : 'bg-brand-bg text-brand-secondary'}`}>
                                Client
                              </span>
                            </div>
                            <p className={`text-xs mt-0.5 truncate ${isActive ? 'text-white/70' : 'text-brand-secondary'}`}>
                              {customer.contactName || customer.email || 'No contact specified'}
                            </p>
                          </div>
                          {isActive && <ArrowRight size={16} className="self-center text-white/50" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Meetings Section */}
              {filteredMeetings.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary px-3 py-1.5">
                    Meetings
                  </h3>
                  <div className="space-y-1">
                    {filteredMeetings.map((meeting) => {
                      const itemIndex = flatResults.findIndex(r => r.key === `meeting-${meeting.id}`);
                      const isActive = selectedIndex === itemIndex;
                      return (
                        <div 
                          key={meeting.id}
                          onClick={() => handleSelect({ ...meeting, type: 'meeting' })}
                          onMouseEnter={() => setSelectedIndex(itemIndex)}
                          className={`flex items-start gap-3 p-3 rounded-[16px] transition-all cursor-pointer group ${
                            isActive 
                              ? 'bg-[#111] text-white active-search-item' 
                              : 'hover:bg-[#ded8ce]/30 text-brand-primary'
                          }`}
                        >
                          <div className={`p-2 rounded-lg ${isActive ? 'bg-white/10 text-white' : 'bg-[#ded8ce]/30 text-brand-secondary group-hover:text-brand-primary'}`}>
                            <Calendar size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold flex items-center justify-between">
                              <span className="truncate">{meeting.title || 'Untitled Meeting'}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${isActive ? 'bg-white/20 text-white' : 'bg-brand-bg text-brand-secondary'}`}>
                                Meeting
                              </span>
                            </div>
                            <p className={`text-xs mt-0.5 truncate ${isActive ? 'text-white/70' : 'text-brand-secondary'}`}>
                              Date: {meeting.date} {meeting.summary ? `• ${meeting.summary}` : ''}
                            </p>
                          </div>
                          {isActive && <ArrowRight size={16} className="self-center text-white/50" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Command Palette Keyboard Hints Footer */}
        <div className="px-6 py-3 border-t border-[#ded8ce] bg-neutral-50 flex items-center justify-between text-[11px] text-brand-secondary">
          <div className="flex items-center gap-4">
            <span>
              Use <kbd className="bg-white px-1.5 py-0.5 border border-brand-border rounded font-semibold font-mono text-[9px]">↑↓</kbd> to navigate
            </span>
            <span>
              Press <kbd className="bg-white px-1.5 py-0.5 border border-brand-border rounded font-semibold font-mono text-[9px]">Enter</kbd> to select
            </span>
            <span>
              Press <kbd className="bg-white px-1.5 py-0.5 border border-brand-border rounded font-semibold font-mono text-[9px]">Esc</kbd> to close
            </span>
          </div>
          <div className="flex items-center gap-1 font-semibold uppercase tracking-wider text-[10px]">
            <span>WOVN SEARCH</span>
          </div>
        </div>
      </div>
    </div>
  );
}
