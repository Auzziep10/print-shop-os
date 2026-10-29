import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  useAuth,
  type UserRole, 
  type PermissionKey, 
  type PermissionsData, 
  DEFAULT_PERMISSIONS 
} from '../../contexts/AuthContext';
import { Shield, Lock, Save, Loader2, Check, Eye, RotateCcw } from 'lucide-react';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';

const ROLES: UserRole[] = ['Admin', 'Leadership', 'Manager', 'Staff', 'Sales', 'Printer', 'Client', 'Pending'];

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
  const { userData, actualUserData, previewRole, setPreviewRole, canUseRolePreview } = useAuth();
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

  const handleToggle = async (role: UserRole, permissionKey: PermissionKey) => {
    // Admin has a hard-coded absolute safeguard and cannot be modified
    if (role === 'Admin') return;

    const nextRolePerms = {
      ...permissions[role],
      [permissionKey]: !permissions[role]?.[permissionKey]
    };
    const nextPermissions: PermissionsData = {
      ...permissions,
      [role]: nextRolePerms,
      Admin: DEFAULT_PERMISSIONS.Admin
    };

    setPermissions(nextPermissions);

    // Auto-save immediately so live role preview reflects changes right away
    try {
      await setDoc(doc(db, 'settings', 'permissions'), { roles: nextPermissions });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error('Error auto-saving role permissions:', err);
    }
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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className={tokens.typography.h2 + " mb-1 flex items-center gap-2"}>
            <Shield className="text-brand-primary" size={20} />
            Role Permissions
          </h2>
          <p className={tokens.typography.bodyMuted}>
            Customize access levels for the different roles. Changes save and propagate immediately across all active sessions.
          </p>
        </div>

        {canUseRolePreview && (
          <div className="flex flex-wrap items-center gap-1.5 bg-neutral-100/90 p-1.5 rounded-xl border border-brand-border shrink-0">
            <span className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-brand-secondary">
              <Eye size={13} className="text-brand-primary" />
              Preview Platform As:
            </span>
            {(['Admin', 'Leadership', 'Manager', 'Staff', 'Sales', 'Printer'] as UserRole[]).map((r) => {
              const activeRole = userData?.role || actualUserData?.role || 'Admin';
              const isActive = activeRole === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    if (r === actualUserData?.role) {
                      setPreviewRole(null);
                    } else {
                      setPreviewRole(r);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? r === actualUserData?.role
                        ? 'bg-brand-primary text-white shadow-xs'
                        : 'bg-amber-500 text-white shadow-xs'
                      : 'text-brand-secondary hover:text-brand-primary hover:bg-white'
                  }`}
                >
                  {r}
                </button>
              );
            })}
            {previewRole && previewRole !== actualUserData?.role && (
              <button
                type="button"
                onClick={() => setPreviewRole(null)}
                className="ml-1 px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider bg-white border border-brand-border text-brand-primary hover:bg-neutral-50 flex items-center gap-1 cursor-pointer"
                title="Reset to your actual role"
              >
                <RotateCcw size={11} />
                Exit Preview
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {ROLES.map(role => {
          const isAdmin = role === 'Admin';
          const activeRole = userData?.role || actualUserData?.role || 'Admin';
          const isCurrentlyViewing = activeRole === role;
          const canPreviewThisRole = role !== 'Client' && role !== 'Pending';
          
          return (
            <div
              key={role}
              className={`bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between ${
                isCurrentlyViewing && previewRole
                  ? 'border-amber-400 ring-2 ring-amber-400/20'
                  : 'border-brand-border'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-brand-border/50">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg text-brand-primary">{role}</h3>
                      {isAdmin && (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-brand-primary text-white uppercase tracking-wider">
                          System Root
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-brand-secondary mt-0.5">
                      {role === 'Client' ? 'Client portal interface' : role === 'Pending' ? 'Waiting room restriction' : role === 'Sales' ? 'Sales & order creation' : 'Shop floor staff'}
                    </p>
                  </div>
                  {canUseRolePreview && canPreviewThisRole && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isCurrentlyViewing && previewRole) {
                          setPreviewRole(null);
                        } else if (role === actualUserData?.role) {
                          setPreviewRole(null);
                        } else {
                          setPreviewRole(role);
                        }
                      }}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border transition-all cursor-pointer shrink-0 ${
                        isCurrentlyViewing
                          ? role === actualUserData?.role
                            ? 'bg-neutral-900 text-white border-neutral-900'
                            : 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                          : 'bg-neutral-50 text-brand-secondary border-brand-border hover:border-brand-primary hover:text-brand-primary'
                      }`}
                      title={`Preview platform as ${role}`}
                    >
                      <Eye size={11} />
                      <span>{isCurrentlyViewing ? 'Viewing' : 'Preview'}</span>
                    </button>
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
