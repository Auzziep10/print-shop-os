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

      <div className="border border-brand-border rounded-xl overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-bg/50 border-b border-brand-border">
                <th className="p-4 text-xs font-bold uppercase tracking-widest text-brand-secondary w-48">User Role</th>
                {PERMISSIONS_META.map(p => (
                  <th key={p.key} className="p-4 text-xs font-bold uppercase tracking-widest text-brand-secondary text-center min-w-[120px] max-w-[150px]">
                    <div className="flex flex-col items-center">
                      <span className="truncate max-w-full">{p.label}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {ROLES.map(role => {
                const isAdmin = role === 'Admin';
                
                return (
                  <tr key={role} className="hover:bg-brand-bg/10 transition-colors">
                    <td className="p-4 align-middle">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-brand-primary">{role}</span>
                        {isAdmin && (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-primary text-white uppercase tracking-wider">
                            System Root
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-brand-secondary mt-0.5">
                        {role === 'Client' ? 'Client portal interface' : role === 'Pending' ? 'Waiting room restriction' : 'Shop floor staff'}
                      </p>
                    </td>
                    
                    {PERMISSIONS_META.map(p => {
                      const isChecked = isAdmin ? true : !!permissions[role]?.[p.key];
                      
                      return (
                        <td key={p.key} className="p-4 text-center align-middle">
                          <div className="flex justify-center">
                            {isAdmin ? (
                              <div className="relative flex items-center justify-center w-11 h-6 bg-brand-primary/10 rounded-full opacity-60 cursor-not-allowed border border-brand-primary/25" title="Admin role has absolute permissions.">
                                <span className="absolute left-1 w-4 h-4 bg-brand-primary rounded-full transform translate-x-5 flex items-center justify-center">
                                  <Lock size={8} className="text-white" />
                                </span>
                              </div>
                            ) : (
                              <button
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
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail list showing what each permission does */}
      <div className="bg-brand-bg/30 rounded-xl p-6 border border-brand-border space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-brand-primary">Permission Explanations</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {PERMISSIONS_META.map(p => (
            <div key={p.key} className="space-y-1">
              <h4 className="text-xs font-bold text-brand-primary">{p.label}</h4>
              <p className="text-xs text-brand-secondary leading-relaxed">{p.description}</p>
            </div>
          ))}
        </div>
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
