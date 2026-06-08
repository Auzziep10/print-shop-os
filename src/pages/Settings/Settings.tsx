import { tokens } from '../../lib/tokens';
import { Settings as SettingsIcon } from 'lucide-react';
import { UsersTab } from './UsersTab';
import { BusinessTab } from './BusinessTab';
import { AppsTab } from './AppsTab';
import { StorefrontCatalogTab } from './StorefrontCatalogTab';
import { Signatures } from '../Signatures/Signatures';
import { useAuth } from '../../contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';

export function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'users';
  const setActiveTab = (tab: string) => setSearchParams({ tab });
  const { userData } = useAuth();
  
  // Only Admin or Leadership can access settings
  if (userData?.role !== 'Admin' && userData?.role !== 'Leadership') {
    return (
      <div className={tokens.layout.container}>
        <div className="p-12 text-center text-brand-secondary border border-brand-border rounded-card bg-white mt-6 shrink-0">
          You do not have permission to view settings.
        </div>
      </div>
    );
  }

  return (
    <div className={tokens.layout.container}>
      {/* Header */}
      <div className={tokens.layout.pageHeader}>
        <div>
          <div className="flex items-center gap-3 mb-2">
            <SettingsIcon className="text-brand-primary" size={24} strokeWidth={1.5} />
            <h1 className={tokens.typography.h1}>Settings</h1>
          </div>
          <p className={tokens.typography.bodyMuted + " mt-2"}>
            Manage application settings and team members.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
        <div className="w-full md:w-64 shrink-0">
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('users')}
              className={`w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'users' 
                  ? 'bg-brand-primary text-white' 
                  : 'text-brand-secondary hover:bg-brand-bg hover:text-brand-primary'
              }`}
            >
              User Management
            </button>
            <button
              onClick={() => setActiveTab('business')}
              className={`w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'business' 
                  ? 'bg-brand-primary text-white' 
                  : 'text-brand-secondary hover:bg-brand-bg hover:text-brand-primary'
              }`}
            >
              Business Profile
            </button>
            <button
              onClick={() => setActiveTab('apps')}
              className={`w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'apps' 
                  ? 'bg-brand-primary text-white' 
                  : 'text-brand-secondary hover:bg-brand-bg hover:text-brand-primary'
              }`}
            >
              App Links
            </button>
            <button
              onClick={() => setActiveTab('storefront-catalog')}
              className={`w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'storefront-catalog' 
                  ? 'bg-brand-primary text-white' 
                  : 'text-brand-secondary hover:bg-brand-bg hover:text-brand-primary'
              }`}
            >
              Storefront Catalog
            </button>
            <button
              onClick={() => setActiveTab('signatures')}
              className={`w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'signatures' 
                  ? 'bg-brand-primary text-white' 
                  : 'text-brand-secondary hover:bg-brand-bg hover:text-brand-primary'
              }`}
            >
              Email Signatures
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 bg-white border border-brand-border rounded-xl p-6 shadow-sm min-w-0">
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'business' && <BusinessTab />}
          {activeTab === 'apps' && <AppsTab />}
          {activeTab === 'storefront-catalog' && <StorefrontCatalogTab />}
          {activeTab === 'signatures' && <Signatures />}
        </div>
      </div>
    </div>
  );
}
