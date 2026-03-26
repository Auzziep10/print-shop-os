import { Search, Bell, Plus, LogOut, Menu } from 'lucide-react';
import { PillButton } from '../ui/PillButton';
import { useAuth } from '../../contexts/AuthContext';

interface TopBarProps {
  onOpenSidebar?: () => void;
}

export function TopBar({ onOpenSidebar }: TopBarProps) {
  const { user, signOut } = useAuth();

  return (
    <header className="h-16 border-b border-brand-border bg-white px-4 md:px-6 flex items-center justify-between sticky top-0 z-40 w-full shrink-0">
      <div className="flex items-center flex-1 min-w-0 mr-4">
        {onOpenSidebar && (
           <button onClick={onOpenSidebar} className="lg:hidden p-2 -ml-2 mr-2 text-brand-secondary hover:text-brand-primary transition-colors rounded-lg hover:bg-black/5">
              <Menu size={20} strokeWidth={2} />
           </button>
        )}
        <div className="max-w-md w-full relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-secondary" size={16} strokeWidth={2} />
          <input 
            type="text" 
            placeholder="Search orders, customers, or files (⌘K)" 
            className="w-full pl-10 pr-4 py-2 bg-brand-bg border border-transparent rounded-lg text-sm focus:bg-white focus:border-brand-primary focus:outline-none transition-all placeholder:text-brand-secondary/70"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4 shrink-0">
        <button className="relative p-2 text-brand-secondary hover:text-brand-primary transition-colors">
          <Bell size={20} strokeWidth={1.5} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-black rounded-full border border-white"></span>
        </button>
        
        <div className="hidden sm:block h-8 w-px bg-brand-border mx-2"></div>

        <PillButton variant="filled" className="hidden sm:flex h-8 py-0 px-4 text-xs gap-1.5">
          <Plus size={14} />
          New Order
        </PillButton>
        <button className="sm:hidden w-8 h-8 bg-black text-white rounded-full flex items-center justify-center shrink-0">
          <Plus size={16} />
        </button>

        <button 
          onClick={() => signOut()}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-brand-primary text-white text-xs font-medium ml-2 border-2 border-transparent hover:border-brand-border transition-all group relative"
          title="Sign Out"
        >
          <span className="group-hover:hidden uppercase">{user?.displayName ? user.displayName.substring(0, 2) : 'OS'}</span>
          <LogOut size={14} className="hidden group-hover:block" />
        </button>
      </div>
    </header>
  );
}
