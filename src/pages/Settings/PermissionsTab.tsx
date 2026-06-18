import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  type UserRole, 
  type PermissionKey, 
  type PermissionsData, 
  DEFAULT_PERMISSIONS 
} from '../../contexts/AuthContext';
import { Shield, Lock, Save, Loader2, Check } from 'lucide-react';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';

const ROLES: UserRole[] = ['Admin', 'Leadership', 'Manager', 'Staff', 'Client', 'Pending'];

interface PermissionMeta {
  key: PermissionKey;
  label: string;
  description: string;
}

const PERMISSIONS_META: PermissionMeta[] = [
  {
    key: 'viewDashboard',
    label: 'View Dashboard',
    description: 'Access to the daily production summary, floor schedules, and pipeline overview.'
  },
  {
    key: 'manageOrders',
    label: 'Orders & Quotes',
    description: 'Manage production queue, quotes, calendar, artwork status, and detailed pack slips.'
  },
  {
    key: 'manageCustomers',
    label: 'Customers',
    description: 'Access customer directory, address data, custom logos, and historical garment maps.'
  },
  {
    key: 'manageInventory',
    label: 'Inventory',
    description: 'Manage active catalog products, warehouse pallet maps, and DTF supplies.'
  },
  {
    key: 'manageTeam',
    label: 'Team & Planner',
    description: 'Adjust floor schedules, check in team meetings, and log capacity scores.'
  },
  {
    key: 'manageSettings',
    label: 'Manage Settings',
    description: 'Configure integrations, storefront catalogs, team members, and role permissions.'
  },
  {
    key: 'viewPricing',
    label: 'Pricing Visibility',
    description: 'Permits viewing prices, quotes amounts, item unit costs, and financial calculations.'
  }
];

export function PermissionsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [permissions, setPermissions] = useState<PermissionsData>(DEFAULT_PERMISSIONS);

  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const docRef = doc(db, 'settings', 'permissions');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().roles) {
          // Merge with default permissions to ensure any newly added permissions are populated
          const dbData = docSnap.data().roles as PermissionsData;
          const merged: any = {};
          
          ROLES.forEach(role => {
            merged[role] = {
              ...DEFAULT_PERMISSIONS[role],
              ...(dbData[role] || {})
            };
          });
          
          setPermissions(merged);
        } else {
          setPermissions(DEFAULT_PERMISSIONS);
        }
      } catch (err) {
        console.error('Error fetching permissions settings:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, []);

  const handleToggle = (role: UserRole, permissionKey: PermissionKey) => {
    // Admin has a hard-coded absolute safeguard and cannot be modified
    if (role === 'Admin') return;

    setPermissions(prev => ({
      ...prev,
      [role]: {
        ...prev[role],
        [permissionKey]: !prev[role]?.[permissionKey]
      }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      // Keep Admin role strictly protected with full access
      const updatedPermissions = {
        ...permissions,
        Admin: DEFAULT_PERMISSIONS.Admin
      };
      
      await setDoc(doc(db, 'settings', 'permissions'), { roles: updatedPermissions });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving role permissions:', err);
      alert('Failed to save permissions. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-brand-secondary" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <h2 className={tokens.typography.h2 + " mb-1 flex items-center gap-2"}>
          <Shield className="text-brand-primary" size={20} />
          Role Permissions
        </h2>
        <p className={tokens.typography.bodyMuted}>
          Customize access levels for the different roles. Changes propagate immediately across all active user sessions.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {ROLES.map(role => {
          const isAdmin = role === 'Admin';
          
          return (
            <div key={role} className="bg-white border border-brand-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-brand-border/50">
                  <div>
                    <h3 className="font-bold text-lg text-brand-primary">{role}</h3>
                    <p className="text-xs text-brand-secondary mt-0.5">
                      {role === 'Client' ? 'Client portal interface' : role === 'Pending' ? 'Waiting room restriction' : 'Shop floor staff'}
                    </p>
                  </div>
                  {isAdmin && (
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-brand-primary text-white uppercase tracking-wider">
                      System Root
                    </span>
                  )}
                </div>

                <div className="divide-y divide-brand-border/40 mt-3">
                  {PERMISSIONS_META.map(p => {
                    const isChecked = isAdmin ? true : !!permissions[role]?.[p.key];
                    
                    return (
                      <div key={p.key} className="py-3.5 flex items-start justify-between gap-4">
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-brand-primary">{p.label}</span>
                          <span className="text-[10px] text-brand-secondary mt-0.5 leading-relaxed">{p.description}</span>
                        </div>
                        <div className="shrink-0 pt-0.5">
                          {isAdmin ? (
                            <div className="relative flex items-center justify-center w-11 h-6 bg-brand-primary/10 rounded-full opacity-60 cursor-not-allowed border border-brand-primary/25" title="Admin role has absolute permissions.">
                              <span className="absolute left-1 w-4 h-4 bg-brand-primary rounded-full transform translate-x-5 flex items-center justify-center">
                                <Lock size={8} className="text-white" />
                              </span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggle(role, p.key)}
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                                isChecked ? 'bg-brand-primary' : 'bg-neutral-200'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                  isChecked ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Save Button Bar */}
      <div className="pt-6 border-t border-brand-border flex items-center gap-4">
        <PillButton 
          variant="filled" 
          onClick={handleSave} 
          disabled={saving} 
          className="min-w-[160px] justify-center"
        >
          {saving ? (
            <Loader2 className="animate-spin" size={18} />
          ) : saveSuccess ? (
            <span className="flex items-center gap-1">
              <Check size={16} /> Saved!
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Save size={18} /> Save Permissions
            </span>
          )}
        </PillButton>
        {saveSuccess && (
          <span className="text-xs text-emerald-600 font-semibold animate-in fade-in duration-300">
            Permissions saved successfully and applied to active users.
          </span>
        )}
      </div>
    </div>
  );
}
