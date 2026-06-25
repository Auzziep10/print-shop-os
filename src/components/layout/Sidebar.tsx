import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  LayoutDashboard, 
  Layers, 
  Users, 
  Scissors, 
  Package,
  UsersRound, 
  Settings, 
  FileBox,
  X,
  ExternalLink,
  Link2,
  Calendar,
  CheckSquare,
  Mail as MailIcon,
  Activity,
  Compass,
  ShoppingBag,
  BookOpen,
  MessageSquare,
  Globe,
  ChevronDown,
  Boxes,
  Map,
  Droplet
} from 'lucide-react';

import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';

interface SidebarProps {
  onClose?: () => void;
}

const iconMap: Record<string, any> = {
  link: Link2,
  globe: Globe,
  calendar: Calendar,
  tasks: CheckSquare,
  mail: MailIcon,
  activity: Activity,
  compass: Compass,
  shopping: ShoppingBag,
  book: BookOpen,
  message: MessageSquare
};

const colorTextMap: Record<string, string> = {
  neutral: 'text-neutral-500 group-hover:text-neutral-900',
  blue: 'text-blue-500 group-hover:text-blue-600',
  emerald: 'text-emerald-500 group-hover:text-emerald-600',
  purple: 'text-purple-500 group-hover:text-purple-600',
  rose: 'text-rose-500 group-hover:text-rose-600',
  amber: 'text-amber-500 group-hover:text-amber-600'
};

export function Sidebar({ onClose }: SidebarProps) {
  const location = useLocation();
  const [appLinks, setAppLinks] = useState<any[]>([]);
  const [isAppsExpanded, setIsAppsExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('sidebar_apps_expanded');
      return saved !== null ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const toggleAppsExpanded = () => {
    setIsAppsExpanded(prev => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar_apps_expanded', JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'apps'), (docSnap) => {
      if (docSnap.exists()) {
        setAppLinks(docSnap.data().links || []);
      } else {
        setAppLinks([]);
      }
    }, (err) => {
      console.error("Error listening to app links:", err);
    });
    return () => unsub();
  }, []);

  const { userData, hasPermission } = useAuth();
  const isAdmin = userData?.role === 'Admin';

  const [isInventoryExpanded, setIsInventoryExpanded] = useState<boolean>(false);
  const [isOrdersExpanded, setIsOrdersExpanded] = useState<boolean>(false);
  const [isTeamExpanded, setIsTeamExpanded] = useState<boolean>(false);
  const [isDashboardExpanded, setIsDashboardExpanded] = useState<boolean>(() => {
    return location.pathname === '/' || location.pathname.startsWith('/biz-ops');
  });

  // Automatically collapse other menus when in another menu
  useEffect(() => {
    const isDashboard = location.pathname === '/' || location.pathname.startsWith('/biz-ops');
    const isOrders = location.pathname.startsWith('/orders');
    const isInventory = location.pathname.startsWith('/inventory');
    const isTeam = location.pathname.startsWith('/team');

    setIsDashboardExpanded(isDashboard);
    setIsOrdersExpanded(isOrders);
    setIsInventoryExpanded(isInventory);
    setIsTeamExpanded(isTeam);
  }, [location.pathname]);

  const inventorySubItems = [
    { label: 'Products', path: '/inventory?tab=Products', icon: ShoppingBag },
    { label: 'Pallet Inventory', path: '/inventory?tab=Pallets', icon: Boxes },
    { label: 'DTF Supplies', path: '/inventory?tab=DTF', icon: Droplet },
    { label: 'Warehouse 3D Map', path: '/inventory?tab=Warehouse&sub=Map', icon: Map },
    ...(isAdmin ? [{ label: 'Admin Builder', path: '/inventory?tab=Warehouse&sub=Builder', icon: Settings }] : []),
  ];

  const ordersSubItems = [
    { label: 'Calendar', path: '/orders?tab=calendar', icon: Calendar },
    { label: 'Orders', path: '/orders?tab=orders', icon: Layers },
    { label: 'Quotes', path: '/orders?tab=quotes', icon: MailIcon },
    { label: 'Production', path: '/orders?tab=production', icon: Scissors },
    { label: 'Reports', path: '/orders?tab=reports', icon: FileBox },
  ];

  const teamSubItems = [
    { label: 'Daily Planner', path: '/team', icon: Calendar },
    { label: 'Meetings', path: '/team/meetings', icon: MessageSquare },
  ];

  const isSubItemActive = (subPath: string) => {
    const [path, search] = subPath.split('?');
    if (location.pathname !== path) return false;
    
    const params = new URLSearchParams(search || '');
    const currentParams = new URLSearchParams(location.search);
    
    if (path === '/orders') {
      const tab = params.get('tab') || 'calendar';
      const currentTab = currentParams.get('tab') || 'calendar';
      return tab === currentTab;
    }
    
    const tab = params.get('tab') || 'Products';
    const currentTab = currentParams.get('tab') || 'Products';
    
    if (tab !== currentTab) return false;
    
    if (tab === 'Warehouse') {
      const sub = params.get('sub') || 'Map';
      const currentSub = currentParams.get('sub') || 'Map';
      return sub === currentSub;
    }
    
    return true;
  };

  const navItems = [
    ...(hasPermission('viewDashboard') ? [{ label: 'Dashboard', icon: LayoutDashboard, path: '/' }] : []),
    ...(hasPermission('manageOrders') ? [{ label: 'Orders/Quotes', icon: Layers, path: '/orders' }] : []),
    ...(hasPermission('manageCustomers') ? [{ label: 'Customers', icon: Users, path: '/customers' }] : []),
    ...(hasPermission('manageInventory') ? [{ label: 'Inventory', icon: Package, path: '/inventory' }] : []),
    ...(hasPermission('manageTeam') ? [{ label: 'Team', icon: UsersRound, path: '/team' }] : []),
  ];

  return (
    <aside className="w-[280px] lg:w-64 border-r border-brand-border bg-brand-bg flex flex-col h-full lg:h-[100dvh] lg:sticky top-0 bg-white shadow-2xl lg:shadow-none overflow-hidden">
      <div className="p-6 flex justify-between items-start">
        <div>
          <img src="/wovn-production-logo.png" alt="WOVN Logo" className="h-10 w-auto mb-1" />
        </div>
        {onClose && (
          <button onClick={onClose} className="lg:hidden p-1 -mr-2 -mt-2 text-brand-secondary hover:text-brand-primary transition-colors hover:bg-black/5 rounded-lg">
            <X size={20} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
          
          if (item.label === 'Dashboard' && userData?.bizOps) {
            const dashboardSubItems = [
              { label: 'Production', path: '/', icon: LayoutDashboard },
              { label: 'Biz Ops', path: '/biz-ops', icon: Activity },
            ];

            const isDashActive = location.pathname === '/' || location.pathname === '/biz-ops';

            return (
              <div key={item.label} className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsDashboardExpanded(prev => !prev);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors group border border-transparent text-left",
                    isDashActive 
                      ? "bg-white border border-brand-border text-brand-primary shadow-sm font-medium" 
                      : "text-brand-secondary hover:text-brand-primary hover:bg-brand-muted"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <item.icon 
                      size={18} 
                      strokeWidth={isDashActive ? 2 : 1.5} 
                      className={cn(isDashActive ? "text-brand-primary" : "text-brand-secondary group-hover:text-brand-primary")}
                    />
                    <span>{item.label}</span>
                  </div>
                  <ChevronDown 
                    size={14} 
                    className={cn(
                      "transition-transform duration-200 text-brand-secondary group-hover:text-brand-primary",
                      isDashboardExpanded ? "rotate-180" : ""
                    )}
                  />
                </button>
                
                {isDashboardExpanded && (
                  <div className="space-y-1 pl-4 border-l border-brand-border/60 ml-[22px] mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    {dashboardSubItems.map((subItem) => {
                      const isSubActive = location.pathname === subItem.path;
                      return (
                        <Link
                          key={subItem.label}
                          to={subItem.path}
                          onClick={() => onClose?.()}
                          className={cn(
                            "flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer group border border-transparent",
                            isSubActive 
                              ? "bg-white border border-brand-border text-brand-primary shadow-sm font-semibold" 
                              : "text-brand-secondary hover:text-brand-primary hover:bg-brand-muted/40"
                          )}
                        >
                          <subItem.icon 
                            size={14} 
                            strokeWidth={isSubActive ? 2 : 1.5}
                            className={cn(
                              isSubActive ? "text-brand-primary" : "text-brand-secondary group-hover:text-brand-primary"
                            )}
                          />
                          <span>{subItem.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          if (item.label === 'Orders/Quotes') {
            return (
              <div key={item.label} className="space-y-1">
                <Link
                  to="/orders?tab=calendar"
                  onClick={() => {
                    setIsOrdersExpanded(prev => !prev);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors group border border-transparent",
                    isActive 
                      ? "bg-white border border-brand-border text-brand-primary shadow-sm font-medium" 
                      : "text-brand-secondary hover:text-brand-primary hover:bg-brand-muted"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <item.icon 
                      size={18} 
                      strokeWidth={isActive ? 2 : 1.5} 
                      className={cn(isActive ? "text-brand-primary" : "text-brand-secondary group-hover:text-brand-primary")}
                    />
                    <span>{item.label}</span>
                  </div>
                  <ChevronDown 
                    size={14} 
                    className={cn(
                      "transition-transform duration-200 text-brand-secondary group-hover:text-brand-primary",
                      isOrdersExpanded ? "rotate-180" : ""
                    )}
                  />
                </Link>
                
                {isOrdersExpanded && (
                  <div className="space-y-1 pl-4 border-l border-brand-border/60 ml-[22px] mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    {ordersSubItems.map((subItem) => {
                      const isSubActive = isSubItemActive(subItem.path);
                      return (
                        <Link
                          key={subItem.label}
                          to={subItem.path}
                          onClick={() => onClose?.()}
                          className={cn(
                            "flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer group border border-transparent",
                            isSubActive 
                              ? "bg-white border border-brand-border text-brand-primary shadow-sm font-semibold" 
                              : "text-brand-secondary hover:text-brand-primary hover:bg-brand-muted/40"
                          )}
                        >
                          <subItem.icon 
                            size={14} 
                            strokeWidth={isSubActive ? 2 : 1.5}
                            className={cn(
                              isSubActive ? "text-brand-primary" : "text-brand-secondary group-hover:text-brand-primary"
                            )}
                          />
                          <span>{subItem.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          if (item.label === 'Inventory') {
            return (
              <div key={item.label} className="space-y-1">
                <Link
                  to="/inventory?tab=Products"
                  onClick={() => {
                    setIsInventoryExpanded(prev => !prev);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors group border border-transparent",
                    isActive 
                      ? "bg-white border border-brand-border text-brand-primary shadow-sm font-medium" 
                      : "text-brand-secondary hover:text-brand-primary hover:bg-brand-muted"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <item.icon 
                      size={18} 
                      strokeWidth={isActive ? 2 : 1.5} 
                      className={cn(isActive ? "text-brand-primary" : "text-brand-secondary group-hover:text-brand-primary")}
                    />
                    <span>{item.label}</span>
                  </div>
                  <ChevronDown 
                    size={14} 
                    className={cn(
                      "transition-transform duration-200 text-brand-secondary group-hover:text-brand-primary",
                      isInventoryExpanded ? "rotate-180" : ""
                    )}
                  />
                </Link>
                
                {isInventoryExpanded && (
                  <div className="space-y-1 pl-4 border-l border-brand-border/60 ml-[22px] mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    {inventorySubItems.map((subItem) => {
                      const isSubActive = isSubItemActive(subItem.path);
                      return (
                        <Link
                          key={subItem.label}
                          to={subItem.path}
                          onClick={() => onClose?.()}
                          className={cn(
                            "flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer group border border-transparent",
                            isSubActive 
                              ? "bg-white border border-brand-border text-brand-primary shadow-sm font-semibold" 
                              : "text-brand-secondary hover:text-brand-primary hover:bg-brand-muted/40"
                          )}
                        >
                          <subItem.icon 
                            size={14} 
                            strokeWidth={isSubActive ? 2 : 1.5}
                            className={cn(
                              isSubActive ? "text-brand-primary" : "text-brand-secondary group-hover:text-brand-primary"
                            )}
                          />
                          <span>{subItem.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          if (item.label === 'Team') {
            return (
              <div key={item.label} className="space-y-1">
                <Link
                  to="/team"
                  onClick={() => {
                    setIsTeamExpanded(prev => !prev);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors group border border-transparent",
                    isActive 
                      ? "bg-white border border-brand-border text-brand-primary shadow-sm font-medium" 
                      : "text-brand-secondary hover:text-brand-primary hover:bg-brand-muted"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <item.icon 
                      size={18} 
                      strokeWidth={isActive ? 2 : 1.5} 
                      className={cn(isActive ? "text-brand-primary" : "text-brand-secondary group-hover:text-brand-primary")}
                    />
                    <span>{item.label}</span>
                  </div>
                  <ChevronDown 
                    size={14} 
                    className={cn(
                      "transition-transform duration-200 text-brand-secondary group-hover:text-brand-primary",
                      isTeamExpanded ? "rotate-180" : ""
                    )}
                  />
                </Link>
                
                {isTeamExpanded && (
                  <div className="space-y-1 pl-4 border-l border-brand-border/60 ml-[22px] mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    {teamSubItems.map((subItem) => {
                      const isSubActive = isSubItemActive(subItem.path);
                      return (
                        <Link
                          key={subItem.label}
                          to={subItem.path}
                          onClick={() => onClose?.()}
                          className={cn(
                            "flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer group border border-transparent",
                            isSubActive 
                              ? "bg-white border border-brand-border text-brand-primary shadow-sm font-semibold" 
                              : "text-brand-secondary hover:text-brand-primary hover:bg-brand-muted/40"
                          )}
                        >
                          <subItem.icon 
                            size={14} 
                            strokeWidth={isSubActive ? 2 : 1.5}
                            className={cn(
                              isSubActive ? "text-brand-primary" : "text-brand-secondary group-hover:text-brand-primary"
                            )}
                          />
                          <span>{subItem.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.label}
              to={item.path}
              onClick={() => onClose?.()}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors group border border-transparent",
                isActive 
                  ? "bg-white border border-brand-border text-brand-primary shadow-sm font-medium" 
                  : "text-brand-secondary hover:text-brand-primary hover:bg-brand-muted"
              )}
            >
              <item.icon 
                size={18} 
                strokeWidth={isActive ? 2 : 1.5} 
                className={cn(isActive ? "text-brand-primary" : "text-brand-secondary group-hover:text-brand-primary")}
              />
              <span className={isActive ? "font-medium" : ""}>{item.label}</span>
            </Link>
          );
        })}

        {appLinks.length > 0 && (
          <div className="mt-6 pt-6 border-t border-brand-border animate-in fade-in duration-300">
            <button 
              onClick={toggleAppsExpanded}
              className="w-full flex items-center justify-between px-3 mb-2 text-[10px] font-bold uppercase tracking-widest text-brand-secondary hover:text-brand-primary transition-colors cursor-pointer group"
            >
              <span>Other Apps</span>
              <ChevronDown 
                size={12} 
                className={cn(
                  "transition-transform duration-200 text-brand-secondary group-hover:text-brand-primary", 
                  isAppsExpanded ? "rotate-180" : ""
                )} 
              />
            </button>
            
            {isAppsExpanded && (
              <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                {appLinks.map((app) => {
                  const IconComponent = iconMap[app.icon] || Link2;
                  const colorClass = colorTextMap[app.color] || 'text-brand-secondary';

                  return (
                    <a
                      key={app.id || app.url}
                      href={app.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm text-brand-secondary hover:text-brand-primary hover:bg-brand-muted border border-transparent transition-colors group"
                    >
                      <div className="flex items-center gap-3 truncate">
                        <IconComponent 
                          size={18} 
                          strokeWidth={1.5}
                          className={cn("transition-colors", colorClass)}
                        />
                        <span className="truncate">{app.name}</span>
                      </div>
                      <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-brand-secondary" />
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>

      {hasPermission('manageSettings') && (
        <div className="p-4 border-t border-brand-border">
          <Link 
            to="/settings"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-brand-secondary hover:text-brand-primary hover:bg-brand-muted transition-colors"
          >
            <Settings size={18} strokeWidth={1.5} />
            Settings
          </Link>
        </div>
      )}
    </aside>
  );
}
