import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  LayoutDashboard, 
  Layers, 
  Users, 
  Scissors, 
  Image as ImageIcon, 
  Package,
  UsersRound, 
  Settings, 
  FileBox,
  X,
  Mail,
  Rocket,
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
  Globe
} from 'lucide-react';
import { cn } from '../../lib/utils';

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

  const navItems = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { label: 'Orders/Quotes', icon: Layers, path: '/orders' },
    { label: 'Customers', icon: Users, path: '/customers' },
    { label: 'Production', icon: Scissors, path: '/production' },
    { label: 'Artwork', icon: ImageIcon, path: '/artwork' },
    { label: 'Inventory', icon: Package, path: '/inventory' },
    { label: 'Team', icon: UsersRound, path: '/team' },
    { label: 'Reports', icon: FileBox, path: '/reports' },
    { label: 'Signatures', icon: Mail, path: '/signatures' },
    { label: 'Public Quote', icon: Rocket, path: '/start' },
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
          
          return (
            <Link
              key={item.label}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors group",
                isActive 
                  ? "bg-white border border-brand-border text-brand-primary shadow-sm" 
                  : "text-brand-secondary hover:text-brand-primary hover:bg-brand-muted border border-transparent"
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
            <h3 className="px-3 text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-3">
              Other Apps
            </h3>
            <div className="space-y-1">
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
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-brand-border">
        <Link 
          to="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-brand-secondary hover:text-brand-primary hover:bg-brand-muted transition-colors"
        >
          <Settings size={18} strokeWidth={1.5} />
          Settings
        </Link>
      </div>
    </aside>
  );
}
