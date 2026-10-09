import { useState, useEffect, useMemo } from 'react';
import { X, Search, MapPin, Check, Loader2, AlertCircle, ArrowLeftRight } from 'lucide-react';
import { PillButton } from '../ui/PillButton';
import { db } from '../../lib/firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';

interface TransferOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
  currentCustomer: any;
  onTransferred?: (newCustomer: any) => void;
}

export function TransferOrderModal({
  isOpen,
  onClose,
  order,
  currentCustomer,
  onTransferred
}: TransferOrderModalProps) {
  const { userData, user } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [updateShippingAddress, setUpdateShippingAddress] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSelectedCustomerId(null);
      setUpdateShippingAddress(false);
      setError(null);
      return;
    }

    const fetchCustomers = async () => {
      setIsLoadingCustomers(true);
      setError(null);
      try {
        const snap = await getDocs(collection(db, 'customers'));
        const list = snap.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));

        // Sort alphabetically by company name or contact name
        list.sort((a: any, b: any) => {
          const nameA = (a.company || a.name || a.contactName || '').toLowerCase();
          const nameB = (b.company || b.name || b.contactName || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });

        setCustomers(list);
      } catch (err: any) {
        console.error('Failed to load customers for transfer:', err);
        setError('Failed to load customers. Please check permissions.');
      } finally {
        setIsLoadingCustomers(false);
      }
    };

    fetchCustomers();
  }, [isOpen]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customers;

    return customers.filter(c => {
      const company = (c.company || '').toLowerCase();
      const contact = (c.contactName || c.name || '').toLowerCase();
      const email = (c.email || '').toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      const id = (c.id || '').toLowerCase();

      return company.includes(q) || contact.includes(q) || email.includes(q) || phone.includes(q) || id.includes(q);
    });
  }, [customers, searchQuery]);

  const targetCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    return customers.find(c => c.id === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  const currentCustomerId = order?.customerId || currentCustomer?.id;
  const currentCustomerName = currentCustomer?.company || currentCustomer?.name || order?.customerName || 'Current Customer';

  const targetHasAddress = Boolean(
    targetCustomer && (targetCustomer.shippingStreet || targetCustomer.shippingCity || targetCustomer.shippingAddress?.street1)
  );

  const handleConfirmTransfer = async () => {
    if (!order?.id || !targetCustomer) return;
    if (targetCustomer.id === currentCustomerId) {
      setError('Selected customer is already assigned to this order.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const newCustomerName = targetCustomer.company || targetCustomer.name || targetCustomer.contactName || 'Customer';
      const adminName = userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Admin';

      let newShippingAddress = null;
      if (updateShippingAddress && targetHasAddress) {
        newShippingAddress = {
          name: targetCustomer.contactName || targetCustomer.name || targetCustomer.company || '',
          company: targetCustomer.company || '',
          street1: targetCustomer.shippingStreet || targetCustomer.shippingAddress?.street1 || '',
          street2: targetCustomer.shippingStreet2 || targetCustomer.shippingAddress?.street2 || '',
          city: targetCustomer.shippingCity || targetCustomer.shippingAddress?.city || '',
          state: targetCustomer.shippingState || targetCustomer.shippingAddress?.state || '',
          zip: targetCustomer.shippingZip || targetCustomer.shippingAddress?.zip || '',
          country: targetCustomer.shippingCountry || targetCustomer.shippingAddress?.country || 'US',
          phone: targetCustomer.phone || ''
        };
      }

      const activity = {
        id: `act-${Date.now()}`,
        type: 'system',
        message: `Transferred order from "${currentCustomerName}" to "${newCustomerName}"`,
        user: adminName,
        timestamp: new Date().toISOString()
      };

      const updatePayload: Record<string, any> = {
        customerId: targetCustomer.id,
        customerName: newCustomerName,
        companyName: targetCustomer.company || targetCustomer.name || '',
        activities: [activity, ...(order.activities || [])]
      };

      if (newShippingAddress) {
        updatePayload.shippingAddress = newShippingAddress;
      }

      await setDoc(doc(db, 'orders', order.id), updatePayload, { merge: true });

      if (onTransferred) {
        onTransferred(targetCustomer);
      }
      onClose();
    } catch (err: any) {
      console.error('Error transferring order customer:', err);
      setError(err?.message || 'Failed to transfer order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-3xl p-6 md:p-8 max-w-2xl w-full flex flex-col shadow-2xl border border-brand-border my-auto max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-4 pb-3 border-b border-brand-border/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-black text-white flex items-center justify-center shrink-0 shadow-sm">
              <ArrowLeftRight size={20} />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-900 leading-tight">Transfer Order to Customer</h3>
              <p className="text-xs text-brand-secondary mt-0.5">
                Reassign <strong>Order {order?.portalId || order?.id}</strong> to a different client profile.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 bg-neutral-100 hover:bg-neutral-200 rounded-full transition-colors shrink-0 text-brand-secondary"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 rounded-xl flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="overflow-y-auto custom-scrollbar pr-1 flex-1 space-y-5 mb-5">
          {/* Transfer Comparison View */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
            {/* Source Customer */}
            <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200 flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Current Assigned Customer</span>
              <p className="font-bold text-sm text-neutral-900 truncate" title={currentCustomerName}>
                {currentCustomerName}
              </p>
              <div className="text-[11px] text-neutral-500 space-y-0.5 mt-0.5">
                {currentCustomer?.contactName && <div>Contact: {currentCustomer.contactName}</div>}
                {currentCustomer?.email && <div className="truncate">{currentCustomer.email}</div>}
                {currentCustomer?.phone && <div>{currentCustomer.phone}</div>}
              </div>
            </div>

            {/* Target Customer Preview */}
            <div className={`p-3.5 rounded-2xl border transition-all flex flex-col gap-1 ${
              targetCustomer 
                ? 'bg-blue-50/70 border-blue-200 shadow-xs' 
                : 'bg-neutral-50/40 border-dashed border-neutral-300'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">New Target Customer</span>
                {targetCustomer && (
                  <span className="bg-blue-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                    <Check size={10} strokeWidth={3} /> Selected
                  </span>
                )}
              </div>
              {targetCustomer ? (
                <>
                  <p className="font-bold text-sm text-blue-950 truncate" title={targetCustomer.company || targetCustomer.name}>
                    {targetCustomer.company || targetCustomer.name || 'Unnamed Client'}
                  </p>
                  <div className="text-[11px] text-blue-800/80 space-y-0.5 mt-0.5">
                    {targetCustomer.contactName && <div>Contact: {targetCustomer.contactName}</div>}
                    {targetCustomer.email && <div className="truncate">{targetCustomer.email}</div>}
                    {targetCustomer.phone && <div>{targetCustomer.phone}</div>}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center py-4 text-xs font-semibold text-neutral-400 italic">
                  Select a new customer below...
                </div>
              )}
            </div>
          </div>

          {/* Search Box */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-secondary mb-1.5">
              Search & Select Customer Account
            </label>
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by company, contact person, email, or phone..."
                className="w-full bg-brand-bg/50 border border-brand-border rounded-xl pl-10 pr-10 py-2.5 text-sm font-semibold focus:border-black focus:bg-white outline-none transition-all placeholder:font-normal placeholder:text-neutral-400"
                autoFocus
              />
              {searchQuery && (
                <button 
                  type="button" 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-black p-1"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Customers Selection List */}
          <div className="border border-brand-border rounded-2xl overflow-hidden bg-neutral-50/50">
            <div className="px-3.5 py-2 bg-neutral-100/70 border-b border-brand-border/60 text-[10px] font-bold uppercase tracking-wider text-brand-secondary flex justify-between items-center">
              <span>Client Directory ({filteredCustomers.length})</span>
              {searchQuery && (
                <span className="text-neutral-500 font-normal">Filtered by "{searchQuery}"</span>
              )}
            </div>

            <div className="max-h-[220px] overflow-y-auto custom-scrollbar divide-y divide-brand-border/40">
              {isLoadingCustomers ? (
                <div className="p-8 flex flex-col items-center justify-center gap-2 text-neutral-400 text-xs">
                  <Loader2 className="animate-spin" size={24} />
                  <span>Loading customers directory...</span>
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-500">
                  No customers found matching "{searchQuery}".
                </div>
              ) : (
                filteredCustomers.map(cust => {
                  const isCurrent = cust.id === currentCustomerId;
                  const isSelected = cust.id === selectedCustomerId;

                  return (
                    <button
                      key={cust.id}
                      type="button"
                      disabled={isCurrent}
                      onClick={() => setSelectedCustomerId(cust.id)}
                      className={`w-full text-left p-3.5 flex items-center justify-between gap-3 transition-colors ${
                        isSelected 
                          ? 'bg-blue-50/90 text-blue-950 font-bold' 
                          : isCurrent 
                            ? 'bg-neutral-100/50 opacity-50 cursor-not-allowed text-neutral-400' 
                            : 'hover:bg-white bg-transparent text-neutral-800'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold text-sm truncate ${isSelected ? 'text-blue-900' : 'text-neutral-900'}`}>
                            {cust.company || cust.name || 'Unnamed Client'}
                          </span>
                          {isCurrent && (
                            <span className="text-[9px] bg-neutral-200 text-neutral-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-neutral-500 mt-0.5">
                          {cust.contactName && <span>{cust.contactName}</span>}
                          {cust.email && <span className="truncate">{cust.email}</span>}
                          {cust.phone && <span>{cust.phone}</span>}
                          {cust.shippingCity && (
                            <span className="text-neutral-400">
                              • {cust.shippingCity}{cust.shippingState ? `, ${cust.shippingState}` : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center">
                        {isSelected ? (
                          <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xs">
                            <Check size={14} strokeWidth={3} />
                          </div>
                        ) : (
                          <div className={`w-5 h-5 rounded-full border ${isCurrent ? 'border-neutral-300' : 'border-neutral-300 group-hover:border-black'}`} />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Transfer Options */}
          {targetCustomer && (
            <div className="p-4 bg-neutral-50 rounded-2xl border border-brand-border/80 space-y-3 animate-in fade-in duration-150">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-secondary block">
                Transfer Options
              </span>

              {targetHasAddress ? (
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input 
                    type="checkbox"
                    checked={updateShippingAddress}
                    onChange={e => setUpdateShippingAddress(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-brand-border text-brand-primary focus:ring-brand-primary cursor-pointer accent-black shrink-0"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-neutral-900 block">
                      Update order shipping address to new customer's default address
                    </span>
                    <span className="text-[11px] text-neutral-500 block mt-0.5">
                      📍 {targetCustomer.shippingStreet || targetCustomer.shippingAddress?.street1}, {targetCustomer.shippingCity || targetCustomer.shippingAddress?.city}, {targetCustomer.shippingState || targetCustomer.shippingAddress?.state} {targetCustomer.shippingZip || targetCustomer.shippingAddress?.zip}
                    </span>
                  </div>
                </label>
              ) : (
                <div className="text-xs text-neutral-500 italic flex items-center gap-1.5">
                  <MapPin size={12} className="text-neutral-400 shrink-0" />
                  <span>The new customer does not have a default shipping address on file. The current order address will remain untouched.</span>
                </div>
              )}

              <p className="text-[11px] text-neutral-500 bg-white p-2.5 rounded-xl border border-neutral-200/60">
                💡 <strong>Note:</strong> Reassigning this order will instantly link it to <strong>{targetCustomer.company || targetCustomer.name}</strong>. The order will appear in their customer portal, invoice receipts, and CRM history.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 pt-3 border-t border-brand-border/60">
          <PillButton 
            variant="outline" 
            onClick={onClose} 
            className="flex-1 justify-center py-3 bg-white"
            disabled={isSubmitting}
          >
            Cancel
          </PillButton>
          <PillButton 
            variant="filled" 
            onClick={handleConfirmTransfer}
            className="flex-1 justify-center py-3 text-white bg-black hover:bg-neutral-800 disabled:opacity-50"
            disabled={!targetCustomer || targetCustomer.id === currentCustomerId || isSubmitting}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" /> Transferring...
              </span>
            ) : (
              `Confirm Transfer`
            )}
          </PillButton>
        </div>
      </div>
    </div>
  );
}
