import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppLayout() {
  return (
    <div className="flex min-h-screen font-sans bg-brand-bg text-brand-primary selection:bg-brand-primary selection:text-white">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          {/* Outlet is where the nested routes will render */}
          <Outlet /> 
        </main>
      </div>
    </div>
  );
}
