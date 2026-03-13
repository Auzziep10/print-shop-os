import { Outlet } from 'react-router-dom';
import { Search } from 'lucide-react';

export function PortalLayout() {
  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white">
      {/* Top Header */}
      <header className="flex items-center justify-between px-10 py-6 bg-white border-b border-black/5">
        <div className="flex items-center">
          {/* Main Logo */}
          <img src="/logo.png" alt="WOVN" className="h-8" />
        </div>

        {/* Center Search Pill */}
        <div className="flex-1 flex justify-center px-12">
          <div className="relative w-full max-w-2xl group">
            <input 
              type="text" 
              placeholder="Search" 
              className="w-full pl-6 pr-10 py-3 bg-white border border-gray-200 rounded-full text-sm font-medium focus:outline-none focus:border-gray-300 focus:shadow-sm transition-all placeholder:text-gray-400"
            />
            <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-gray-600 transition-colors" size={18} strokeWidth={2.5} />
          </div>
        </div>

        {/* Right Nav Options */}
        <div className="flex items-center gap-10">
          <div className="flex flex-col gap-1.5 cursor-pointer group">
            <div className="w-5 h-0.5 bg-black rounded-full group-hover:bg-gray-600 transition-colors"></div>
            <div className="w-5 h-0.5 bg-black rounded-full group-hover:bg-gray-600 transition-colors"></div>
            <div className="w-3 h-0.5 bg-black rounded-full group-hover:bg-gray-600 transition-colors"></div>
          </div>
          
          <button className="text-[13px] font-semibold tracking-wide text-black pb-0.5 border-b-2 border-transparent hover:border-black transition-all">
            Orders
          </button>
          
          <button className="text-[13px] font-semibold tracking-wide text-gray-400 hover:text-black transition-colors">
            Log Out
          </button>
          
          <button className="bg-black text-white px-7 py-3 rounded-full text-xs font-bold tracking-wide hover:bg-black/80 hover:scale-105 active:scale-95 transition-all shadow-[0_4px_14px_0_rgb(0,0,0,0.2)]">
            Create Order +
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="py-12 px-10">
        <Outlet />
      </main>
    </div>
  );
}
