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
  Sparkles,
  LayoutDashboard,
  Layers,
  Users,
  Package,
  Settings,
  Clock
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

const QUICK_PAGES = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard, color: 'text-blue-600 bg-blue-50 border-blue-100' },
  { name: 'Orders', path: '/orders', icon: Layers, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  { name: 'Customers', path: '/customers', icon: Users, color: 'text-purple-600 bg-purple-50 border-purple-100' },
  { name: 'Inventory', path: '/inventory', icon: Package, color: 'text-amber-600 bg-amber-50 border-amber-100' },
  { name: 'Meetings', path: '/team/meetings', icon: Calendar, color: 'text-rose-600 bg-rose-50 border-rose-100' },
  { name: 'Settings', path: '/settings', icon: Settings, color: 'text-neutral-600 bg-neutral-100 border-neutral-200' }
];

const PAGES = [
  { name: 'Dashboard', path: '/', category: 'Pages' },
  { name: 'Orders List', path: '/orders', category: 'Pages' },
  { name: 'Production Pipeline', path: '/orders?tab=production', category: 'Pages' },
  { name: 'Artwork Pipeline', path: '/orders?tab=production&sub=artwork', category: 'Pages' },
  { name: 'Reports', path: '/orders?tab=reports', category: 'Pages' },
  { name: 'Customers List', path: '/customers', category: 'Pages' },
  { name: 'Inventory', path: '/inventory', category: 'Pages' },
  { name: 'Mobile Inventory Scan', path: '/inventory/scan', category: 'Pages' },
  { name: 'Team Members', path: '/team', category: 'Pages' },
  { name: 'Team Meetings', path: '/team/meetings', category: 'Pages' },
  { name: 'Settings', path: '/settings', category: 'Pages' },
  { name: 'Signatures & Profiles', path: '/settings?tab=signatures', category: 'Pages' },
  { name: 'Public Quote Request', path: '/start', category: 'Pages' }
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
      // Sort by date or ID to show recent orders first
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

  // 3 most recent orders for default quick access
  const recentOrders = useMemo(() => {
    return orders.slice(0, 3);
  }, [orders]);

  // Filter lists based on query
  const filteredPages = useMemo(() => {
    if (!query.trim()) return [];
    return PAGES.filter(p => 
      p.name.toLowerCase().includes(query.toLowerCase())
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
    }).slice(0, 5);
  }, [query, orders, customerMap]);

  const filteredCustomers = useMemo(() => {
    if (!query.trim()) return [];
    return customers.filter(c => 
      (c.company || '').toLowerCase().includes(query.toLowerCase()) ||
      (c.contactName || '').toLowerCase().includes(query.toLowerCase()) ||
      (c.email || '').toLowerCase().includes(query.toLowerCase())
    ).slice(0, 5);
  }, [query, customers]);

  const filteredMeetings = useMemo(() => {
    if (!query.trim()) return [];
    return meetings.filter(m => 
      (m.title || '').toLowerCase().includes(query.toLowerCase()) ||
      (m.summary || '').toLowerCase().includes(query.toLowerCase()) ||
      (m.date || '').toLowerCase().includes(query.toLowerCase())
    ).slice(0, 5);
  }, [query, meetings]);

  // Flattened results list for easy index-based keyboard navigation
  const flatResults = useMemo(() => {
    const list: any[] = [];
    
    if (!query.trim()) {
      // 1. In empty state, make Quick Pages and Recent Orders keyboard navigable!
      QUICK_PAGES.forEach(p => list.push({ ...p, type: 'quick-page', key: `quick-${p.name}` }));
      recentOrders.forEach(o => list.push({ ...o, type: 'recent-order', key: `recent-order-${o.id}` }));
    } else {
      // 2. In search state, add filtered results
      filteredPages.forEach(p => list.push({ ...p, type: 'page', key: `page-${p.name}` }));
      filteredOrders.forEach(o => list.push({ ...o, type: 'order', key: `order-${o.id}` }));
      filteredCustomers.forEach(c => list.push({ ...c, type: 'customer', key: `customer-${c.id}` }));
      filteredMeetings.forEach(m => list.push({ ...m, type: 'meeting', key: `meeting-${m.id}` }));
    }
    return list;
  }, [query, filteredPages, filteredOrders, filteredCustomers, filteredMeetings, recentOrders]);

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
    if (item.type === 'page' || item.type === 'quick-page') {
      navigate(item.path);
    } else if (item.type === 'order' || item.type === 'recent-order') {
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
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/40 backdrop-blur-md transition-opacity duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-[#f7f4ef] border border-[#ded8ce] rounded-[24px] shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[75vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input Box */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[#ded8ce] bg-white relative">
          <Search className="text-brand-secondary shrink-0" size={18} strokeWidth={2.5} />
          <input 
            ref={inputRef}
            type="text" 
            placeholder="Type to search orders, customers, or meetings..." 
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full text-base bg-transparent text-brand-primary placeholder:text-brand-secondary/60 focus:outline-none border-none py-0.5 font-sans"
          />
          <button 
            onClick={onClose}
            className="p-1 rounded-full text-brand-secondary hover:bg-neutral-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search Content */}
        <div 
          ref={containerRef}
          className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-5"
        >
          {query.trim() === '' ? (
            // Default View (No Query): Clean Quick Navigation + Recent Orders
            <>
              {/* Quick Pages Grid */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary px-1 mb-3">
                  Quick Navigation
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  {QUICK_PAGES.map((page, idx) => {
                    const isActive = selectedIndex === idx;
                    const Icon = page.icon;
                    return (
                      <div
                        key={page.name}
                        onClick={() => handleSelect({ ...page, type: 'quick-page' })}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all cursor-pointer text-center group ${
                          isActive 
                            ? 'bg-[#ded8ce]/40 border-[#ded8ce] scale-[1.02] shadow-sm active-search-item' 
                            : 'bg-white border-[#ded8ce]/60 hover:bg-neutral-50/65'
                        }`}
                      >
                        <div className={`p-2 rounded-xl border border-transparent mb-2 ${page.color} ${isActive ? 'scale-105' : 'group-hover:scale-105'} transition-all`}>
                          <Icon size={18} />
                        </div>
                        <span className="text-xs font-semibold text-brand-primary truncate w-full">
                          {page.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Orders */}
              {recentOrders.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary px-1 mb-2">
                    Recent Orders
                  </h4>
                  <div className="space-y-1">
                    {recentOrders.map((order, idx) => {
                      const itemIndex = QUICK_PAGES.length + idx;
                      const isActive = selectedIndex === itemIndex;
                      const company = order.customerId ? (customerMap[order.customerId] || '') : '';
                      return (
                        <div
                          key={order.id}
                          onClick={() => handleSelect({ ...order, type: 'recent-order' })}
                          onMouseEnter={() => setSelectedIndex(itemIndex)}
                          className={`flex items-center gap-3 p-3 rounded-[16px] transition-all cursor-pointer group border ${
                            isActive 
                              ? 'bg-[#ded8ce]/40 border-[#ded8ce] active-search-item' 
                              : 'bg-white/60 border-transparent hover:bg-[#ded8ce]/20'
                          }`}
                        >
                          <div className={`p-2 rounded-lg bg-neutral-100 text-brand-secondary transition-colors ${isActive ? 'bg-[#ded8ce]/50 text-brand-primary' : ''}`}>
                            <Clock size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold flex items-center justify-between">
                              <span className="truncate pr-2">{order.title || 'Untitled Order'}</span>
                              <span className="text-[10px] text-brand-secondary font-mono">
                                #{order.portalId || order.id.substring(0, 6)}
                              </span>
                            </div>
                            <p className="text-xs text-brand-secondary truncate mt-0.5">
                              {company ? `${company} • ` : ''}Due: {order.targetCompletionDate || order.date || 'N/A'}
                            </p>
                          </div>
                          {isActive && <ArrowRight size={16} className="text-brand-secondary" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            // Search View (Query entered): Simplified, clean lists
            <>
              {flatResults.length === 0 ? (
                <div className="py-12 text-center text-brand-secondary text-sm flex flex-col items-center gap-2">
                  <Sparkles size={20} className="text-brand-secondary/40" />
                  <p>No matches for <span className="font-semibold text-brand-primary">"{query}"</span></p>
                  <p className="text-xs text-brand-secondary/70">Type pages, meetings, clients, or order titles.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {flatResults.map((item, idx) => {
                    const isActive = selectedIndex === idx;
                    
                    // Determine Icon & Badges dynamically
                    let IconComponent = Folder;
                    let label = 'Route';
                    let subtext = '';

                    if (item.type === 'page') {
                      IconComponent = Folder;
                      label = 'Page';
                      subtext = item.path;
                    } else if (item.type === 'order') {
                      IconComponent = FileText;
                      label = `Order #${item.portalId || item.id.substring(0, 6)}`;
                      const company = item.customerId ? (customerMap[item.customerId] || '') : '';
                      subtext = company ? `${company} • Due: ${item.date}` : `Due: ${item.date}`;
                    } else if (item.type === 'customer') {
                      IconComponent = Building2;
                      label = 'Client';
                      subtext = item.contactName || item.email || '';
                    } else if (item.type === 'meeting') {
                      IconComponent = Calendar;
                      label = 'Meeting';
                      subtext = `Held: ${item.date}`;
                    }

                    return (
                      <div 
                        key={item.key}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`flex items-center gap-3 p-3 rounded-[16px] transition-all cursor-pointer group border ${
                          isActive 
                            ? 'bg-[#ded8ce]/40 border-[#ded8ce] active-search-item' 
                            : 'border-transparent hover:bg-[#ded8ce]/25'
                        }`}
                      >
                        <div className={`p-2 rounded-lg ${isActive ? 'bg-[#ded8ce]/50 text-brand-primary' : 'bg-neutral-100/80 text-brand-secondary group-hover:text-brand-primary'} transition-colors`}>
                          <IconComponent size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold flex items-center justify-between">
                            <span className="truncate pr-2 text-brand-primary">
                              {item.name || item.title || (item.company !== '-' ? item.company : 'Individual Client')}
                            </span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase font-bold tracking-wider ${
                              isActive ? 'bg-[#ded8ce]/60 text-brand-primary' : 'bg-brand-bg border border-brand-border/40 text-brand-secondary'
                            }`}>
                              {label}
                            </span>
                          </div>
                          {subtext && (
                            <p className="text-xs text-brand-secondary truncate mt-0.5">
                              {subtext}
                            </p>
                          )}
                        </div>
                        {isActive && <ArrowRight size={16} className="text-brand-secondary" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Command Palette Keyboard Hints Footer */}
        <div className="px-6 py-2.5 border-t border-[#ded8ce] bg-neutral-50/60 flex items-center justify-between text-[10px] text-brand-secondary">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="bg-white px-1 py-0.5 border border-brand-border rounded font-sans text-[9px] shadow-sm">↑↓</kbd> to move
            </span>
            <span>
              <kbd className="bg-white px-1 py-0.5 border border-brand-border rounded font-sans text-[9px] shadow-sm">Enter</kbd> to select
            </span>
            <span>
              <kbd className="bg-white px-1 py-0.5 border border-brand-border rounded font-sans text-[9px] shadow-sm">Esc</kbd> to close
            </span>
          </div>
          <div className="text-[9px] font-bold tracking-widest text-brand-secondary/80">
            WOVN SEARCH
          </div>
        </div>
      </div>
    </div>
  );
}
