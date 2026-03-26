import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Layers, 
  Users, 
  Scissors, 
  Image as ImageIcon, 
  UsersRound, 
  Settings, 
  FileBox,
  X
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const location = useLocation();

  const navItems = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { label: 'Orders', icon: Layers, path: '/orders' },
    { label: 'Customers', icon: Users, path: '/customers' },
    { label: 'Production', icon: Scissors, path: '/production' },
    { label: 'Artwork', icon: ImageIcon, path: '/artwork' },
    { label: 'Team', icon: UsersRound, path: '/team' },
    { label: 'Reports', icon: FileBox, path: '/reports' },
  ];

  return (
    <aside className="w-[280px] lg:w-64 border-r border-brand-border bg-brand-bg flex flex-col h-full lg:h-[100dvh] lg:sticky top-0 bg-white shadow-2xl lg:shadow-none overflow-hidden">
      <div className="p-6 flex justify-between items-start">
        <div>
          <img src="/logo.png" alt="WOVN Logo" className="h-6 w-auto mb-1" />
          <p className="text-[10px] uppercase font-semibold tracking-widest text-brand-secondary mt-2">Print Shop OS</p>
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
