import { Search, Bell, LogOut, Menu, Check, Rocket, RefreshCw, UserPlus, Globe, Shirt, Eye, RotateCcw, Shield } from 'lucide-react';
import { useAuth, type UserRole } from '../../contexts/AuthContext';
import { useOrders } from '../../hooks/useOrders';
import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, updateDoc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { CommandPalette } from './CommandPalette';

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
  const notificationRef = useRef<HTMLDivElement>(null);

  const unreadPayments = orders.filter(o => o.paymentStatus === 'paid' && o.paymentRead === false);
  const unreadResubmittedQuotes = orders.filter(o => o.hasUnreadCustomerUpdate === true);
  const unreadWebLeadOrders = orders.filter(o => o.hasUnreadWebLead === true);
  const totalUnreadCount =
    unreadPayments.length +
    unreadSupportCustomers.length +
    unreadResubmittedQuotes.length +
    unreadWebLeadOrders.length +
    unreadNewCustomers.length +
    designerRackApprovals.length;

  useEffect(() => {
    const unsubCustomers = onSnapshot(
      collection(db, 'customers'),
      (snapshot) => {
        const allCustomers = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any)
        }));

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
                type: 'final_design'
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
                type: 'approved_for_order'
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
      await updateDoc(doc(db, 'orders', orderId), { paymentRead: true });
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
            <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-brand-border overflow-hidden z-50 animate-in slide-in-from-top-2 duration-200">
              <div className="p-3 border-b border-brand-border bg-neutral-50 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-widest text-brand-secondary">Notifications</h3>
                <span className="bg-black text-white text-[10px] px-2 py-0.5 rounded-full font-bold">{totalUnreadCount}</span>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-brand-border/30">
                {totalUnreadCount === 0 ? (
                  <div className="p-6 text-center text-xs text-brand-secondary">No new notifications.</div>
                ) : (
                  <>
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
                              await updateDoc(custRef, { designerRack: updatedRack });
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
