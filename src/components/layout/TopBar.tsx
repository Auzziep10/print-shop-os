import { Search, Bell, LogOut, Menu, Check, Rocket, RefreshCw, UserPlus, Globe, Shirt, Eye, RotateCcw, Shield, X, ExternalLink, UserCheck, Sparkles, ShoppingBag } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useAuth, type UserRole } from '../../contexts/AuthContext';
import { useOrders } from '../../hooks/useOrders';
import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, updateDoc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { CommandPalette } from './CommandPalette';
import {
  ACTIVITY_POPUPS_DOC_ID,
  runWithSuppressedActivityTracking,
  shouldShowActivityPopupsForRole,
  subscribeLocalActivityPopup,
  updateCustomerCacheForTracking,
  updateOrderCacheForTracking,
  type ActivityPopupEvent
} from '../../lib/roleActivityTracker';

interface TopBarProps {
  onOpenSidebar?: () => void;
}

interface DesignerRackApprovalNotification {
  key: string;
  customerId: string;
  customerName: string;
  designId: string;
  designTitle: string;
  mockupUrl: string;
  type: 'final_design' | 'approved_for_order';
  actorName?: string;
  actorRole?: string;
}

const DISMISSED_POPUPS_STORAGE_KEY = 'wovn_dismissed_activity_popups_v1';
const SESSION_BOOT_MS = Date.now();

function loadDismissedPopupIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_POPUPS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissedPopupIds(ids: Set<string>) {
  try {
    const arr = Array.from(ids).slice(-250);
    localStorage.setItem(DISMISSED_POPUPS_STORAGE_KEY, JSON.stringify(arr));
  } catch {
    // ignore storage errors
  }
}

const PREVIEWABLE_ROLES: UserRole[] = ['Admin', 'Leadership', 'Manager', 'Staff', 'Sales', 'Designer', 'Printer'];

export function TopBar({ onOpenSidebar }: TopBarProps) {
  const { user, userData, actualUserData, previewRole, setPreviewRole, canUseRolePreview, signOut } = useAuth();
  const { orders } = useOrders();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [unreadSupportCustomers, setUnreadSupportCustomers] = useState<any[]>([]);
  const [unreadNewCustomers, setUnreadNewCustomers] = useState<any[]>([]);
  const [designerRackApprovals, setDesignerRackApprovals] = useState<DesignerRackApprovalNotification[]>([]);
  const [activePopups, setActivePopups] = useState<ActivityPopupEvent[]>([]);
  const notificationRef = useRef<HTMLDivElement>(null);
  const dismissedIdsRef = useRef<Set<string>>(loadDismissedPopupIds());
  const seenPopupIdsRef = useRef<Set<string>>(new Set());

  const canSeeActivityPopups = shouldShowActivityPopupsForRole(userData?.role);

  const enqueueActivityPopup = (event: ActivityPopupEvent | undefined | null, isInitialSnapshot: boolean) => {
    if (!event || !event.id) return;
    if (dismissedIdsRef.current.has(event.id) || seenPopupIdsRef.current.has(event.id)) {
      return;
    }
    // On initial page load, ignore older historical events (> 45s before this tab booted) so refresh doesn't replay old alerts
    if (isInitialSnapshot && event.createdAtMs < SESSION_BOOT_MS - 45000) {
      seenPopupIdsRef.current.add(event.id);
      return;
    }
    seenPopupIdsRef.current.add(event.id);
    setActivePopups((prev) => {
      const filtered = prev.filter(
        (p) =>
          p.id !== event.id &&
          !(
            p.actorId === event.actorId &&
            p.targetId === event.targetId &&
            p.category === event.category &&
            Math.abs(event.createdAtMs - p.createdAtMs) < 2000
          )
      );
      return [event, ...filtered].slice(0, 6);
    });
  };

  const handleDismissPopup = (popupId: string) => {
    dismissedIdsRef.current.add(popupId);
    saveDismissedPopupIds(dismissedIdsRef.current);
    setActivePopups((prev) => prev.filter((p) => p.id !== popupId));
  };

  const handleDismissAllPopups = () => {
    activePopups.forEach((p) => dismissedIdsRef.current.add(p.id));
    saveDismissedPopupIds(dismissedIdsRef.current);
    setActivePopups([]);
  };

  const unreadPayments = orders.filter(o => o.paymentStatus === 'paid' && o.paymentRead === false);
  const unreadResubmittedQuotes = orders.filter(o => o.hasUnreadCustomerUpdate === true);
  const unreadWebLeadOrders = orders.filter(o => o.hasUnreadWebLead === true);
  const totalUnreadCount =
    unreadPayments.length +
    unreadSupportCustomers.length +
    unreadResubmittedQuotes.length +
    unreadWebLeadOrders.length +
    unreadNewCustomers.length +
    designerRackApprovals.length +
    (canSeeActivityPopups ? activePopups.length : 0);

  // Keep order cache & order-carried activity popups in sync
  const initialOrdersSyncedRef = useRef(false);
  useEffect(() => {
    if (!orders || orders.length === 0) return;
    updateOrderCacheForTracking(orders);
    const isInitial = !initialOrdersSyncedRef.current;
    initialOrdersSyncedRef.current = true;
    orders.forEach((o: any) => {
      if (o?.lastActivityPopup?.id) {
        enqueueActivityPopup(o.lastActivityPopup, isInitial);
      }
    });
  }, [orders]);

  // Subscribe to local same-tab events and settings/activityPopups feed
  useEffect(() => {
    const unsubLocal = subscribeLocalActivityPopup((ev) => {
      enqueueActivityPopup(ev, false);
    });

    let isFirstSettingsSnap = true;
    const unsubSettingsPopups = onSnapshot(
      doc(db, 'settings', ACTIVITY_POPUPS_DOC_ID),
      (snap) => {
        const isInitial = isFirstSettingsSnap;
        isFirstSettingsSnap = false;
        if (!snap.exists()) return;
        const events: ActivityPopupEvent[] = Array.isArray(snap.data()?.events)
          ? snap.data().events
          : [];
        // Process from oldest to newest so newest ends up on top
        [...events].reverse().forEach((ev) => enqueueActivityPopup(ev, isInitial));
      },
      (err) => {
        console.debug('Error listening to settings/activityPopups:', err);
      }
    );

    return () => {
      unsubLocal();
      unsubSettingsPopups();
    };
  }, []);

  useEffect(() => {
    let isFirstCustomersSnap = true;
    const unsubCustomers = onSnapshot(
      collection(db, 'customers'),
      (snapshot) => {
        const isInitial = isFirstCustomersSnap;
        isFirstCustomersSnap = false;

        const allCustomers = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any)
        }));

        updateCustomerCacheForTracking(allCustomers);

        allCustomers.forEach((c) => {
          if (c?.lastActivityPopup?.id) {
            enqueueActivityPopup(c.lastActivityPopup, isInitial);
          }
        });

        setUnreadSupportCustomers(allCustomers.filter((c) => c.hasUnreadSupport === true));
        setUnreadNewCustomers(allCustomers.filter((c) => c.hasUnreadCreation === true));

        const approvals: DesignerRackApprovalNotification[] = [];
        allCustomers.forEach((c) => {
          const customerName = c.company || c.contactName || c.name || 'Customer';
          const rack: any[] = Array.isArray(c.designerRack) ? c.designerRack : [];
          rack.forEach((design) => {
            if (!design || !design.id) return;
            const designTitle = design.title || design.name || 'Untitled Design';
            const legacyMockups = Array.isArray(design.mockups) ? design.mockups : [];
            const mockupUrl =
              design.frontMockupUrl ||
              legacyMockups[0]?.url ||
              design.mockupUrl ||
              design.url ||
              design.backMockupUrl ||
              '';

            if (Boolean(design.finalDesignApproved) && !design.finalDesignApprovedNotificationRead) {
              approvals.push({
                key: `${c.id}-${design.id}-final_design`,
                customerId: c.id,
                customerName,
                designId: design.id,
                designTitle,
                mockupUrl,
                type: 'final_design',
                actorName:
                  design.finalDesignApprovedByName ||
                  design.updatedByName ||
                  design.createdByName ||
                  undefined,
                actorRole:
                  design.finalDesignApprovedByRole ||
                  design.updatedByRole ||
                  design.createdByRole ||
                  undefined
              });
            }
            if (Boolean(design.approvedForOrder) && !design.approvedForOrderNotificationRead) {
              approvals.push({
                key: `${c.id}-${design.id}-approved_for_order`,
                customerId: c.id,
                customerName,
                designId: design.id,
                designTitle,
                mockupUrl,
                type: 'approved_for_order',
                actorName:
                  design.approvedForOrderByName ||
                  design.updatedByName ||
                  design.createdByName ||
                  undefined,
                actorRole:
                  design.approvedForOrderByRole ||
                  design.updatedByRole ||
                  design.createdByRole ||
                  undefined
              });
            }
          });
        });
        setDesignerRackApprovals(approvals);
      },
      (err) => {
        console.error("Error fetching customers for notifications in TopBar:", err);
      }
    );

    return () => {
      unsubCustomers();
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications]);

  const handleMarkAsRead = async (orderId: string) => {
    try {
      await runWithSuppressedActivityTracking(() =>
        updateDoc(doc(db, 'orders', orderId), { paymentRead: true })
      );
      navigate(`/orders/${orderId}`);
      setShowNotifications(false);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header className="h-16 border-b border-brand-border bg-white px-4 md:px-6 flex items-center justify-between sticky top-0 z-40 w-full shrink-0">
      <div className="flex items-center flex-1 min-w-0 mr-4">
        {onOpenSidebar && (
           <button onClick={onOpenSidebar} className="lg:hidden p-2 -ml-2 mr-2 text-brand-secondary hover:text-brand-primary transition-colors rounded-lg hover:bg-black/5">
              <Menu size={20} strokeWidth={2} />
           </button>
        )}
        <div 
          onClick={() => setIsSearchOpen(true)}
          className="max-w-md w-full relative hidden sm:block cursor-pointer group"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-secondary group-hover:text-brand-primary transition-colors" size={16} strokeWidth={2} />
          <input 
            type="text" 
            readOnly
            placeholder="Search orders, customers, or files (⌘K)" 
            className="w-full pl-10 pr-4 py-2 bg-brand-bg border border-transparent rounded-lg text-sm group-hover:border-brand-border/60 focus:outline-none transition-all placeholder:text-brand-secondary/70 cursor-pointer pointer-events-none"
          />
        </div>
      </div>

      <CommandPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      <div className="flex items-center gap-2 md:gap-4 shrink-0 relative">
        {canUseRolePreview && (
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs transition-all ${
              previewRole && previewRole !== actualUserData?.role
                ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-2xs'
                : 'bg-neutral-50 border-brand-border text-brand-secondary'
            }`}
            title="Switch which role view you are seeing across the platform without logging out"
          >
            <Eye
              size={14}
              className={
                previewRole && previewRole !== actualUserData?.role
                  ? 'text-amber-600 shrink-0'
                  : 'text-neutral-400 shrink-0'
              }
            />
            <span className="hidden md:inline text-[10px] font-extrabold uppercase tracking-wider opacity-80">
              View as:
            </span>
            <select
              value={userData?.role || actualUserData?.role || 'Admin'}
              onChange={(e) => {
                const selected = e.target.value as UserRole;
                if (selected === actualUserData?.role) {
                  setPreviewRole(null);
                } else {
                  setPreviewRole(selected);
                }
              }}
              className={`bg-transparent font-extrabold text-xs focus:outline-none cursor-pointer pr-1 ${
                previewRole && previewRole !== actualUserData?.role
                  ? 'text-amber-950'
                  : 'text-brand-primary'
              }`}
            >
              {PREVIEWABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r} {r === actualUserData?.role ? '(Your Role)' : ''}
                </option>
              ))}
            </select>
            {previewRole && previewRole !== actualUserData?.role && (
              <>
                <button
                  type="button"
                  onClick={() => navigate('/settings?tab=permissions')}
                  className="p-1 rounded-md bg-amber-200/60 hover:bg-amber-200 text-amber-900 transition-colors cursor-pointer"
                  title="Open Role Permissions Settings"
                >
                  <Shield size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewRole(null)}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
                  title={`Exit role preview and return to ${actualUserData?.role || 'Admin'}`}
                >
                  <RotateCcw size={10} />
                  <span className="hidden sm:inline">Reset</span>
                </button>
              </>
            )}
          </div>
        )}

        <button 
          onClick={() => navigate('/start')}
          className="relative p-2 text-brand-secondary hover:text-brand-primary transition-colors"
          title="Public Quote"
        >
          <Rocket size={20} strokeWidth={1.5} />
        </button>

        {canSeeActivityPopups && (
        <div className="relative" ref={notificationRef}>
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-brand-secondary hover:text-brand-primary transition-colors"
          >
            <Bell size={20} strokeWidth={1.5} />
            {totalUnreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border border-white"></span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-brand-border overflow-hidden z-50 animate-in slide-in-from-top-2 duration-200">
              <div className="p-3 border-b border-brand-border bg-neutral-50 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-widest text-brand-secondary">Notifications</h3>
                <span className="bg-black text-white text-[10px] px-2 py-0.5 rounded-full font-bold">{totalUnreadCount}</span>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-brand-border/30">
                {totalUnreadCount === 0 ? (
                  <div className="p-6 text-center text-xs text-brand-secondary">No new notifications.</div>
                ) : (
                  <>
                    {/* Live Role & Designer Rack Activity Alerts */}
                    {activePopups.map((popup) => (
                      <div
                        key={popup.id}
                        className="p-3 hover:bg-neutral-50 transition-colors cursor-pointer"
                        onClick={() => {
                          setShowNotifications(false);
                          handleDismissPopup(popup.id);
                          navigate(popup.targetRoute);
                        }}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span
                            className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                              popup.category === 'designer_rack'
                                ? 'bg-purple-50 text-purple-800 border-purple-200'
                                : popup.category === 'sales_order'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-blue-50 text-blue-800 border-blue-200'
                            }`}
                          >
                            {popup.actionTitle}
                          </span>
                          <span className="text-[9px] font-bold text-neutral-500">
                            by {popup.actorName} ({popup.actorRole})
                          </span>
                        </div>
                        <p className="text-[11px] font-semibold text-neutral-900 leading-snug">
                          {popup.actionSummary}
                        </p>
                        <p className="text-[9px] text-neutral-500 mt-1 truncate">
                          {popup.targetLabel}
                        </p>
                      </div>
                    ))}

                    {/* Designer Rack Approvals */}
                    {designerRackApprovals.map((item) => (
                      <div
                        key={item.key}
                        className="p-3 hover:bg-emerald-50/60 transition-colors cursor-pointer"
                        onClick={async () => {
                          setShowNotifications(false);
                          try {
                            const custRef = doc(db, 'customers', item.customerId);
                            const snap = await getDoc(custRef);
                            if (snap.exists() && Array.isArray(snap.data().designerRack)) {
                              const updatedRack = snap.data().designerRack.map((d: any) => {
                                if (d.id !== item.designId) return d;
                                return item.type === 'final_design'
                                  ? { ...d, finalDesignApprovedNotificationRead: true }
                                  : { ...d, approvedForOrderNotificationRead: true };
                              });
                              await runWithSuppressedActivityTracking(() =>
                                updateDoc(custRef, { designerRack: updatedRack })
                              );
                            }
                          } catch (err) {
                            console.error("Failed to mark Designer Rack approval notification as read:", err);
                          }
                          navigate(`/customers/${item.customerId}?rack=open`);
                        }}
                      >
                        <p className="text-[11px] font-bold text-emerald-900 mb-1 flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center shrink-0">
                            <Check size={10} strokeWidth={3} />
                          </span>
                          <span>
                            {item.type === 'final_design'
                              ? 'Final Design Approved'
                              : 'Garment Approved For Order'}
                          </span>
                        </p>
                        <div className="flex items-center gap-2">
                          <Shirt size={12} className="text-neutral-500 shrink-0" />
                          <p className="text-[11px] text-neutral-800 line-clamp-1 font-semibold">
                            {item.designTitle}
                          </p>
                        </div>
                        <p className="text-[9px] text-neutral-500 mt-1">
                          {item.customerName} • Designer Rack
                          {item.actorName ? ` • by ${item.actorName}${item.actorRole ? ` (${item.actorRole})` : ''}` : ''}
                        </p>
                      </div>
                    ))}

                    {/* Order Payments */}
                    {unreadPayments.map(order => (
                      <div key={order.id} className="p-3 hover:bg-neutral-50 transition-colors cursor-pointer" onClick={() => handleMarkAsRead(order.id)}>
                        <p className="text-xs font-medium text-brand-primary mb-1">Payment Received! <span className="text-emerald-500"><Check size={12} className="inline animate-in zoom-in duration-200" /></span></p>
                        <p className="text-[11px] text-brand-secondary line-clamp-1">{order.title}</p>
                      </div>
                    ))}

                    {/* Resubmitted Quotes */}
                    {unreadResubmittedQuotes.map(order => (
                      <div 
                        key={order.id} 
                        className="p-3 hover:bg-amber-50/60 transition-colors cursor-pointer" 
                        onClick={async () => {
                          setShowNotifications(false);
                          try {
                            await updateDoc(doc(db, 'orders', order.id), { hasUnreadCustomerUpdate: false });
                          } catch (err) {
                            console.error(err);
                          }
                          navigate(`/orders/${order.id}`);
                        }}
                      >
                        <p className="text-[11px] font-bold text-amber-950 mb-1 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full shrink-0 animate-ping" />
                          <RefreshCw size={12} className="text-amber-600 shrink-0" />
                          <span>Quote Resubmitted with New Qty</span>
                        </p>
                        <p className="text-[11px] text-neutral-800 line-clamp-1 font-semibold">
                          {order.title || `Order #${order.portalId || order.id.substring(0,8)}`}
                        </p>
                        <p className="text-[9px] text-neutral-500 mt-1">
                          {order.totalGarments || order.quoteResubmittedGarments || 0} Garments • Order #{order.portalId || order.id.substring(0,8)}
                        </p>
                      </div>
                    ))}

                    {/* Web Lead Orders */}
                    {unreadWebLeadOrders.map(order => (
                      <div 
                        key={order.id} 
                        className="p-3 hover:bg-blue-50/60 transition-colors cursor-pointer" 
                        onClick={async () => {
                          setShowNotifications(false);
                          try {
                            await updateDoc(doc(db, 'orders', order.id), { hasUnreadWebLead: false });
                          } catch (err) {
                            console.error(err);
                          }
                          navigate(`/orders/${order.id}`);
                        }}
                      >
                        <p className="text-[11px] font-bold text-blue-950 mb-1 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0 animate-pulse" />
                          <Globe size={12} className="text-blue-600 shrink-0" />
                          <span>New Web Lead Order</span>
                        </p>
                        <p className="text-[11px] text-neutral-800 line-clamp-1 font-semibold">
                          {order.title || `Order #${order.portalId || order.id.substring(0,8)}`}
                        </p>
                        <p className="text-[9px] text-neutral-500 mt-1">
                          From {order.contactDetails?.name || 'Web Client'} • Order #{order.portalId || order.id.substring(0,8)}
                        </p>
                      </div>
                    ))}

                    {/* New Customer Creations */}
                    {unreadNewCustomers.map(customer => (
                      <div 
                        key={customer.id} 
                        className="p-3 hover:bg-purple-50/60 transition-colors cursor-pointer" 
                        onClick={async () => {
                          setShowNotifications(false);
                          try {
                            await updateDoc(doc(db, 'customers', customer.id), { hasUnreadCreation: false });
                          } catch (err) {
                            console.error(err);
                          }
                          navigate(`/customers/${customer.id}`);
                        }}
                      >
                        <p className="text-[11px] font-bold text-purple-950 mb-1 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-purple-500 rounded-full shrink-0 animate-pulse" />
                          <UserPlus size={12} className="text-purple-600 shrink-0" />
                          <span>New Customer Created</span>
                        </p>
                        <p className="text-[11px] text-neutral-800 line-clamp-1 font-semibold">
                          {customer.company || customer.contactName || customer.name || 'New Client'}
                        </p>
                        <p className="text-[9px] text-neutral-500 mt-1">
                          {customer.email || 'No email provided'} • {customer.type || 'Web Lead'}
                        </p>
                      </div>
                    ))}

                    {/* Chat Messages */}
                    {unreadSupportCustomers.map(customer => (
                      <div 
                        key={customer.id} 
                        className="p-3 hover:bg-neutral-50 transition-colors cursor-pointer" 
                        onClick={async () => {
                          navigate(`/customers/${customer.id}?tab=chat`);
                          setShowNotifications(false);
                          try {
                            const customerRef = doc(db, 'customers', customer.id);
                            await updateDoc(customerRef, { hasUnreadSupport: false });
                          } catch (err) {
                            console.error("Failed to clear customer unread support flag from notification bar:", err);
                          }
                        }}
                      >
                        <p className="text-[11px] font-bold text-brand-primary mb-1 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0 animate-pulse" />
                          <span>New Support Chat</span>
                        </p>
                        <p className="text-[11px] text-neutral-800 line-clamp-1 font-semibold">
                          {customer.lastSupportMessageText || 'New message waiting'}
                        </p>
                        <p className="text-[9px] text-brand-secondary mt-1">
                          From {customer.contactName || customer.company || 'Client'}
                        </p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        )}
        


        <button 
          onClick={() => signOut()}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-brand-primary text-white text-xs font-medium ml-2 border-2 border-transparent hover:border-brand-border transition-all group relative"
          title="Sign Out"
        >
          <span className="group-hover:hidden uppercase">{user?.displayName ? user.displayName.substring(0, 2) : 'OS'}</span>
          <LogOut size={14} className="hidden group-hover:block" />
        </button>
      </div>

      {/* On-Screen Activity Pop-Up Stack (visible ONLY to Admins & Staff, never to Sales or Designer) */}
      {canSeeActivityPopups &&
        activePopups.length > 0 &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed top-20 right-4 sm:right-6 z-[250] flex flex-col gap-3 w-[380px] max-w-[calc(100vw-2rem)] pointer-events-none">
            {activePopups.length > 1 && (
              <div className="flex justify-end pointer-events-auto">
                <button
                  type="button"
                  onClick={handleDismissAllPopups}
                  className="px-3 py-1 rounded-full bg-neutral-900/90 hover:bg-neutral-900 text-white text-[10px] font-extrabold uppercase tracking-wider shadow-md transition-colors cursor-pointer"
                >
                  Dismiss All ({activePopups.length})
                </button>
              </div>
            )}

            {activePopups.map((popup) => {
              const isRack = popup.category === 'designer_rack';
              const isSalesOrder = popup.category === 'sales_order';
              const accentClass = isRack
                ? 'border-l-4 border-l-purple-600'
                : isSalesOrder
                  ? 'border-l-4 border-l-amber-500'
                  : 'border-l-4 border-l-blue-600';
              const badgeClass = isRack
                ? 'bg-purple-50 text-purple-800 border-purple-200'
                : isSalesOrder
                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                  : 'bg-blue-50 text-blue-800 border-blue-200';
              const timeStr = (() => {
                try {
                  return new Date(popup.createdAtMs).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit'
                  });
                } catch {
                  return 'Just now';
                }
              })();

              return (
                <div
                  key={popup.id}
                  className={`pointer-events-auto bg-white rounded-2xl border border-neutral-200 shadow-2xl p-4 flex flex-col gap-3 animate-in slide-in-from-right-5 fade-in duration-200 ${accentClass}`}
                >
                  {/* Top Row: Category Badge + Time + Close */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border ${badgeClass}`}
                      >
                        {isRack ? (
                          <Sparkles size={11} className="shrink-0" />
                        ) : isSalesOrder ? (
                          <ShoppingBag size={11} className="shrink-0" />
                        ) : (
                          <Shirt size={11} className="shrink-0" />
                        )}
                        <span>{popup.actionTitle}</span>
                      </span>
                      <span className="text-[10px] font-semibold text-neutral-400 shrink-0">
                        {timeStr}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDismissPopup(popup.id)}
                      title="Dismiss pop-up"
                      className="w-6 h-6 rounded-full text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Who Made the Change Row */}
                  <div className="flex items-center justify-between gap-2 bg-neutral-50 border border-neutral-200/80 rounded-xl px-3 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-neutral-900 text-white text-[10px] font-black flex items-center justify-center shrink-0 uppercase">
                        {(popup.actorName || 'U').substring(0, 2)}
                      </span>
                      <div className="min-w-0">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-400 block leading-none">
                          Changed By
                        </span>
                        <span className="text-xs font-extrabold text-neutral-900 truncate block mt-0.5">
                          {popup.actorName}
                        </span>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-white border border-neutral-200 text-neutral-700 shrink-0">
                      <UserCheck size={10} />
                      <span>{popup.actorRole}</span>
                    </span>
                  </div>

                  {/* Main Content + Optional Mockup Thumbnail */}
                  <div className="flex items-start gap-3">
                    {popup.mockupUrl && (
                      <div className="w-14 h-14 rounded-xl border border-neutral-200 bg-neutral-50 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                        <img
                          src={popup.mockupUrl}
                          alt={popup.designTitle || popup.targetLabel}
                          className="w-full h-full object-contain mix-blend-multiply"
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-extrabold text-neutral-900 truncate">
                        {popup.targetLabel}
                      </p>
                      <p className="text-xs font-medium text-neutral-700 leading-snug mt-0.5">
                        {popup.actionSummary}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-neutral-100">
                    <button
                      type="button"
                      onClick={() => handleDismissPopup(popup.id)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleDismissPopup(popup.id);
                        navigate(popup.targetRoute);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-neutral-900 hover:bg-neutral-800 text-white shadow-xs transition-colors cursor-pointer"
                    >
                      <span>
                        {isRack
                          ? 'Open Designer Rack'
                          : popup.targetType === 'order'
                            ? 'View Order'
                            : 'View Change'}
                      </span>
                      <ExternalLink size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </header>
  );
}
