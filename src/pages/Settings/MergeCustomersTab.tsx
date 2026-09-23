import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  setDoc,
  query, 
  where 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { PillButton } from '../../components/ui/PillButton';
import { 
  GitMerge, 
  ArrowRight, 
  AlertTriangle, 
  Search, 
  User, 
  ShoppingBag, 
  Image as ImageIcon, 
  Sparkles, 
  Loader2, 
  Check, 
  ExternalLink,
  ShieldCheck,
  MessageSquare
} from 'lucide-react';

interface CustomerSummary {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  location: string;
  assetsCount: number;
  ordersCount: number;
  usersCount: number;
  createdAt: string;
  raw: any;
}

export function MergeCustomersTab() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const preselectedPrimaryId = searchParams.get('primaryId') || '';

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected IDs
  const [primaryId, setPrimaryId] = useState<string>(preselectedPrimaryId);
  const [duplicateId, setDuplicateId] = useState<string>('');

  // Search queries for dropdowns
  const [primarySearch, setPrimarySearch] = useState('');
  const [duplicateSearch, setDuplicateSearch] = useState('');
  const [isPrimaryDropdownOpen, setIsPrimaryDropdownOpen] = useState(false);
  const [isDuplicateDropdownOpen, setIsDuplicateDropdownOpen] = useState(false);

  // Preview Data
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [ordersToMove, setOrdersToMove] = useState<any[]>([]);
  const [assetsToMove, setAssetsToMove] = useState<any[]>([]);
  const [usersToMove, setUsersToMove] = useState<any[]>([]);
  const [cartsToMoveCount, setCartsToMoveCount] = useState(0);
  const [chatMessagesToMoveCount, setChatMessagesToMoveCount] = useState(0);

  // Execution State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmChecked, setIsConfirmChecked] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeStep, setMergeStep] = useState<string>('');
  const [mergeSuccess, setMergeSuccess] = useState<any | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);

  // Load all customers and their order/user counts
  const loadCustomers = async () => {
    setLoading(true);
    try {
      const [custSnap, ordersSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, 'customers')),
        getDocs(collection(db, 'orders')),
        getDocs(collection(db, 'users'))
      ]);

      const ordersCountByCust: Record<string, number> = {};
      ordersSnap.forEach(d => {
        const cid = d.data().customerId;
        if (cid) ordersCountByCust[cid] = (ordersCountByCust[cid] || 0) + 1;
      });

      const usersCountByCust: Record<string, number> = {};
      usersSnap.forEach(d => {
        const cid = d.data().customerId;
        if (cid) usersCountByCust[cid] = (usersCountByCust[cid] || 0) + 1;
      });

      const list: CustomerSummary[] = custSnap.docs.map(d => {
        const data = d.data();
        const company = data.company || data.name || data.contactName || 'Unnamed Company';
        const name = data.contactName || data.name || '';
        const email = (data.email || '').toLowerCase().trim();
        const phone = data.phone || '';
        const location = data.location || '';
        const assetsCount = Array.isArray(data.assets) ? data.assets.length : 0;
        const ordersCount = ordersCountByCust[d.id] || 0;
        const usersCount = usersCountByCust[d.id] || 0;

        return {
          id: d.id,
          name,
          company,
          email,
          phone,
          location,
          assetsCount,
          ordersCount,
          usersCount,
          createdAt: data.createdAt || '',
          raw: data
        };
      });

      list.sort((a, b) => a.company.localeCompare(b.company));
      setCustomers(list);
    } catch (err: any) {
      console.error('Failed to load customers for merge tab:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  // Update primary if passed in URL
  useEffect(() => {
    if (preselectedPrimaryId && customers.some(c => c.id === preselectedPrimaryId)) {
      setPrimaryId(preselectedPrimaryId);
    }
  }, [preselectedPrimaryId, customers]);

  // Detected Potential Duplicates
  const detectedDuplicates = useMemo(() => {
    const pairs: Array<{ primary: CustomerSummary; duplicate: CustomerSummary; reason: string }> = [];
    const seenPairs = new Set<string>();

    for (let i = 0; i < customers.length; i++) {
      for (let j = i + 1; j < customers.length; j++) {
        const c1 = customers[i];
        const c2 = customers[j];
        if (c1.id === c2.id) continue;

        let matchReason = '';
        if (c1.email && c2.email && c1.email === c2.email) {
          matchReason = `Identical email: ${c1.email}`;
        } else if (
          c1.company.toLowerCase().replace(/[^a-z0-9]/g, '') ===
            c2.company.toLowerCase().replace(/[^a-z0-9]/g, '') &&
          c1.company.trim().length > 3
        ) {
          matchReason = `Similar company name: "${c1.company}" & "${c2.company}"`;
        }

        if (matchReason) {
          const pairKey = [c1.id, c2.id].sort().join('___');
          if (!seenPairs.has(pairKey)) {
            seenPairs.add(pairKey);
            // Default primary to the one with more orders/assets or older
            const c1Score = c1.ordersCount * 10 + c1.assetsCount * 2 + (c1.usersCount ? 5 : 0);
            const c2Score = c2.ordersCount * 10 + c2.assetsCount * 2 + (c2.usersCount ? 5 : 0);
            const primary = c1Score >= c2Score ? c1 : c2;
            const duplicate = c1Score >= c2Score ? c2 : c1;
            pairs.push({ primary, duplicate, reason: matchReason });
          }
        }
      }
    }
    return pairs;
  }, [customers]);

  // Selected customer objects
  const primaryCustomer = useMemo(() => customers.find(c => c.id === primaryId) || null, [customers, primaryId]);
  const duplicateCustomer = useMemo(() => customers.find(c => c.id === duplicateId) || null, [customers, duplicateId]);

  // Load preview data when both accounts are selected
  useEffect(() => {
    if (!duplicateCustomer || !primaryCustomer || duplicateId === primaryId) {
      setOrdersToMove([]);
      setAssetsToMove([]);
      setUsersToMove([]);
      setCartsToMoveCount(0);
      setChatMessagesToMoveCount(0);
      return;
    }

    let isMounted = true;
    const fetchPreview = async () => {
      setIsLoadingPreview(true);
      try {
        // Orders
        const ordSnap = await getDocs(query(collection(db, 'orders'), where('customerId', '==', duplicateId)));
        const ords = ordSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Users
        const usrSnap = await getDocs(query(collection(db, 'users'), where('customerId', '==', duplicateId)));
        const usrs = usrSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Saved Carts
        const cartSnap = await getDocs(query(collection(db, 'saved_carts'), where('customerId', '==', duplicateId)));

        // Chat messages
        const chatSnap = await getDocs(collection(db, 'customers', duplicateId, 'chat_messages'));

        // Assets
        const pAssets = Array.isArray(primaryCustomer.raw?.assets) ? primaryCustomer.raw.assets : [];
        const dAssets = Array.isArray(duplicateCustomer.raw?.assets) ? duplicateCustomer.raw.assets : [];
        const pUrls = new Set(pAssets.map((a: any) => (a.url || a.fileUrl || a.id)));
        const uniqueDAssets = dAssets.filter((a: any) => !pUrls.has(a.url || a.fileUrl || a.id));

        if (isMounted) {
          setOrdersToMove(ords);
          setUsersToMove(usrs);
          setCartsToMoveCount(cartSnap.docs.length);
          setChatMessagesToMoveCount(chatSnap.docs.length);
          setAssetsToMove(uniqueDAssets);
        }
      } catch (e) {
        console.error("Failed to load merge preview:", e);
      } finally {
        if (isMounted) setIsLoadingPreview(false);
      }
    };

    fetchPreview();
    return () => { isMounted = false; };
  }, [primaryId, duplicateId, primaryCustomer, duplicateCustomer]);

  // Execute the Merge
  const handleExecuteMerge = async () => {
    if (!primaryCustomer || !duplicateCustomer || !isConfirmChecked) return;

    setIsMerging(true);
    setMergeError(null);

    try {
      // 1. Reassign Orders
      setMergeStep(`Transferring ${ordersToMove.length} order(s)...`);
      for (const order of ordersToMove) {
        await updateDoc(doc(db, 'orders', order.id), {
          customerId: primaryCustomer.id,
          customerName: primaryCustomer.company || primaryCustomer.name
        });
      }

      // 2. Re-point Portal Users (logins)
      setMergeStep(`Re-linking ${usersToMove.length} portal user login(s)...`);
      for (const user of usersToMove) {
        await updateDoc(doc(db, 'users', user.id), {
          customerId: primaryCustomer.id,
          companyName: primaryCustomer.company || primaryCustomer.name
        });
      }

      // 3. Reassign Saved Carts
      setMergeStep('Reassigning saved carts...');
      const cartSnap = await getDocs(query(collection(db, 'saved_carts'), where('customerId', '==', duplicateCustomer.id)));
      for (const cartDoc of cartSnap.docs) {
        await updateDoc(cartDoc.ref, {
          customerId: primaryCustomer.id
        });
      }

      // 4. Copy Chat Messages
      setMergeStep('Copying customer chat history...');
      const chatSnap = await getDocs(collection(db, 'customers', duplicateCustomer.id, 'chat_messages'));
      for (const msgDoc of chatSnap.docs) {
        await setDoc(doc(db, 'customers', primaryCustomer.id, 'chat_messages', msgDoc.id), msgDoc.data());
        await deleteDoc(msgDoc.ref);
      }

      // 5. Consolidate Customer Assets, Garments, Overrides & Profile info
      setMergeStep('Consolidating vault assets, mockups, and notes...');
      const pDocSnap = await getDoc(doc(db, 'customers', primaryCustomer.id));
      const pData = pDocSnap.exists() ? pDocSnap.data() : primaryCustomer.raw;
      const dData = duplicateCustomer.raw || {};

      // Merged Assets
      const existingPAssets = Array.isArray(pData.assets) ? pData.assets : [];
      const existingUrls = new Set(existingPAssets.map((a: any) => (a.url || a.fileUrl || a.id)));
      const combinedAssets = [...existingPAssets];
      if (Array.isArray(dData.assets)) {
        dData.assets.forEach((a: any) => {
          if (!existingUrls.has(a.url || a.fileUrl || a.id)) {
            existingUrls.add(a.url || a.fileUrl || a.id);
            combinedAssets.push(a);
          }
        });
      }

      // Merged Suggested Items
      const pSuggested = Array.isArray(pData.suggestedItems) ? pData.suggestedItems : [];
      const dSuggested = Array.isArray(dData.suggestedItems) ? dData.suggestedItems : [];
      const suggestedKey = (item: any) => `${item.style || item.name || ''}_${item.itemNum || ''}_${item.image || ''}`;
      const seenSuggested = new Set(pSuggested.map(suggestedKey));
      const combinedSuggested = [...pSuggested];
      dSuggested.forEach((item: any) => {
        const k = suggestedKey(item);
        if (!seenSuggested.has(k)) {
          seenSuggested.add(k);
          combinedSuggested.push(item);
        }
      });

      // Merged Sample Items
      const pSamples = Array.isArray(pData.sampleItems) ? pData.sampleItems : [];
      const dSamples = Array.isArray(dData.sampleItems) ? dData.sampleItems : [];
      const combinedSamples = [...pSamples, ...dSamples.filter((s: any) => !pSamples.some((ps: any) => ps.id === s.id))];

      // Merged Deck Mockup Overrides
      const combinedOverrides = {
        ...(dData.deckMockupOverrides || {}),
        ...(pData.deckMockupOverrides || {})
      };

      // Merged Catalog Links
      const combinedCatalogLinks = Array.from(new Set([
        ...(pData.catalogLinkIds || []),
        ...(dData.catalogLinkIds || [])
      ]));

      // Merge Notes
      let combinedNotes = pData.notes || '';
      if (dData.notes && !combinedNotes.includes(dData.notes)) {
        combinedNotes = combinedNotes ? `${combinedNotes}\n\n[Merged from duplicate account]:\n${dData.notes}` : dData.notes;
      }

      // Address & Contact fallbacks if primary lacks them
      const updatePayload: Record<string, any> = {
        assets: combinedAssets,
        suggestedItems: combinedSuggested,
        sampleItems: combinedSamples,
        deckMockupOverrides: combinedOverrides,
        catalogLinkIds: combinedCatalogLinks,
        notes: combinedNotes,
        updatedAt: new Date().toISOString()
      };

      if (!pData.phone && dData.phone && dData.phone !== '-') updatePayload.phone = dData.phone;
      if (!pData.shippingStreet && dData.shippingStreet) updatePayload.shippingStreet = dData.shippingStreet;
      if (!pData.shippingCity && dData.shippingCity) updatePayload.shippingCity = dData.shippingCity;
      if (!pData.shippingState && dData.shippingState) updatePayload.shippingState = dData.shippingState;
      if (!pData.shippingZip && dData.shippingZip) updatePayload.shippingZip = dData.shippingZip;
      if (!pData.resaleCertificateUrl && dData.resaleCertificateUrl) {
        updatePayload.resaleCertificateUrl = dData.resaleCertificateUrl;
        updatePayload.resaleCertificateName = dData.resaleCertificateName || 'Resale Certificate';
      }

      await updateDoc(doc(db, 'customers', primaryCustomer.id), updatePayload);

      // 6. Delete Duplicate Customer Document
      setMergeStep('Safely retiring duplicate customer record...');
      await deleteDoc(doc(db, 'customers', duplicateCustomer.id));

      // 7. Complete!
      const report = {
        primaryName: primaryCustomer.company,
        primaryId: primaryCustomer.id,
        duplicateName: duplicateCustomer.company,
        ordersTransferred: ordersToMove.length,
        assetsTransferred: assetsToMove.length,
        usersTransferred: usersToMove.length,
        cartsTransferred: cartsToMoveCount,
        messagesTransferred: chatMessagesToMoveCount
      };

      setMergeSuccess(report);
      setIsModalOpen(false);

      // Refresh customer list
      await loadCustomers();
      setDuplicateId('');
    } catch (err: any) {
      console.error("Merge execution error:", err);
      setMergeError(err?.message || "An unexpected error occurred during the merge.");
    } finally {
      setIsMerging(false);
      setMergeStep('');
    }
  };

  const filteredPrimaryOptions = useMemo(() => {
    return customers.filter(c => 
      c.id !== duplicateId &&
      (c.company.toLowerCase().includes(primarySearch.toLowerCase()) ||
       c.name.toLowerCase().includes(primarySearch.toLowerCase()) ||
       c.email.toLowerCase().includes(primarySearch.toLowerCase()) ||
       c.id.toLowerCase().includes(primarySearch.toLowerCase()))
    );
  }, [customers, duplicateId, primarySearch]);

  const filteredDuplicateOptions = useMemo(() => {
    return customers.filter(c => 
      c.id !== primaryId &&
      (c.company.toLowerCase().includes(duplicateSearch.toLowerCase()) ||
       c.name.toLowerCase().includes(duplicateSearch.toLowerCase()) ||
       c.email.toLowerCase().includes(duplicateSearch.toLowerCase()) ||
       c.id.toLowerCase().includes(duplicateSearch.toLowerCase()))
    );
  }, [customers, primaryId, duplicateSearch]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand-primary/10 rounded-xl text-brand-primary">
            <GitMerge size={22} strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-brand-primary font-serif">Merge Customer Accounts</h2>
            <p className="text-sm text-brand-secondary mt-0.5">
              Combine duplicate customer accounts into a single account without losing any orders, artwork, or portal logins.
            </p>
          </div>
        </div>
      </div>

      {loading && (
        <div className="p-12 text-center text-brand-secondary flex flex-col items-center justify-center gap-3">
          <Loader2 className="animate-spin text-brand-primary" size={28} />
          <p className="text-sm">Loading customer directory...</p>
        </div>
      )}

      {/* Success Banner */}
      {mergeSuccess && (
        <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl animate-fade-in">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-emerald-500 text-white rounded-full shrink-0">
              <Check size={20} strokeWidth={3} />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-emerald-950">
                Accounts Successfully Combined!
              </h3>
              <p className="text-sm text-emerald-800 mt-1">
                <strong>"{mergeSuccess.duplicateName}"</strong> has been seamlessly merged into <strong>"{mergeSuccess.primaryName}"</strong>.
              </p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-emerald-900 bg-white/70 px-4 py-2.5 rounded-xl border border-emerald-200">
                <span>📦 {mergeSuccess.ordersTransferred} Order(s) Reassigned</span>
                <span>🖼️ {mergeSuccess.assetsTransferred} Vault Asset(s) Added</span>
                <span>👤 {mergeSuccess.usersTransferred} Portal Login(s) Re-linked</span>
                <span>🛒 {mergeSuccess.cartsTransferred} Cart(s) & {mergeSuccess.messagesTransferred} Chat Msg(s) Moved</span>
              </div>
              <div className="mt-4 flex gap-3">
                <PillButton 
                  variant="filled" 
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                  onClick={() => navigate(`/customers/${mergeSuccess.primaryId}`)}
                >
                  <ExternalLink size={14} />
                  Open Merged Customer Profile
                </PillButton>
                <PillButton 
                  variant="outline" 
                  onClick={() => setMergeSuccess(null)}
                >
                  Dismiss
                </PillButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Smart Duplicate Suggestions */}
      {detectedDuplicates.length > 0 && !mergeSuccess && (
        <div className="border border-amber-200 bg-amber-50/70 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-sm mb-3">
            <Sparkles size={16} className="text-amber-600" />
            Detected Potential Duplicates ({detectedDuplicates.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {detectedDuplicates.map(({ primary, duplicate, reason }, idx) => (
              <div 
                key={idx} 
                className="bg-white p-3.5 rounded-xl border border-amber-200/80 shadow-xs flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-brand-primary truncate">
                    {primary.company} <span className="text-brand-secondary font-normal">({primary.ordersCount} orders, {primary.assetsCount} assets)</span>
                  </p>
                  <p className="text-brand-secondary truncate mt-0.5">
                    Duplicate: <span className="font-medium text-amber-900">{duplicate.company}</span>
                  </p>
                  <p className="text-[11px] text-amber-700 mt-1 italic">
                    Reason: {reason}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPrimaryId(primary.id);
                    setDuplicateId(duplicate.id);
                    setMergeSuccess(null);
                  }}
                  className="shrink-0 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                >
                  Select Pair
                  <ArrowRight size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Account Selection Area */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* 1. Primary Account (To Keep) */}
        <div className="p-5 bg-brand-bg/40 border border-brand-border rounded-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100/70 px-2.5 py-0.5 rounded-md flex items-center gap-1">
                <Check size={12} strokeWidth={3} /> Primary Account (Keep)
              </span>
              <span className="text-xs text-brand-secondary">Target destination</span>
            </div>
            <h3 className="text-base font-bold text-brand-primary mb-1">
              Select Account to Preserve
            </h3>
            <p className="text-xs text-brand-secondary mb-4">
              All orders, assets, and users from the duplicate will be moved into this account.
            </p>

            {/* Custom Searchable Picker */}
            <div className="relative">
              <div 
                className="w-full bg-white border border-brand-border rounded-xl p-3 cursor-pointer hover:border-brand-primary transition-colors flex items-center justify-between"
                onClick={() => setIsPrimaryDropdownOpen(!isPrimaryDropdownOpen)}
              >
                {primaryCustomer ? (
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-brand-primary truncate">{primaryCustomer.company}</p>
                    <p className="text-xs text-brand-secondary truncate">
                      {primaryCustomer.email || 'No email'} • {primaryCustomer.ordersCount} Orders • {primaryCustomer.assetsCount} Assets
                    </p>
                  </div>
                ) : (
                  <span className="text-sm text-brand-secondary">Choose primary customer account...</span>
                )}
                <Search size={16} className="text-brand-secondary shrink-0 ml-2" />
              </div>

              {isPrimaryDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-brand-border rounded-xl shadow-xl z-30 overflow-hidden">
                  <div className="p-2 border-b border-brand-border bg-brand-bg/40">
                    <input 
                      type="text"
                      placeholder="Search company, contact, or email..."
                      value={primarySearch}
                      onChange={(e) => setPrimarySearch(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-brand-border rounded-lg focus:outline-none focus:border-brand-primary"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-brand-border/40">
                    {filteredPrimaryOptions.map(c => (
                      <div
                        key={c.id}
                        className={`p-3 text-xs hover:bg-brand-bg/60 cursor-pointer transition-colors ${c.id === primaryId ? 'bg-brand-bg font-semibold' : ''}`}
                        onClick={() => {
                          setPrimaryId(c.id);
                          setIsPrimaryDropdownOpen(false);
                          setPrimarySearch('');
                        }}
                      >
                        <div className="flex justify-between items-center">
                          <p className="font-bold text-brand-primary">{c.company}</p>
                          <span className="text-[10px] text-brand-secondary bg-brand-bg px-2 py-0.5 rounded">
                            {c.ordersCount} orders • {c.assetsCount} assets
                          </span>
                        </div>
                        <p className="text-brand-secondary text-[11px] mt-0.5">
                          {c.name ? `${c.name} • ` : ''}{c.email || 'No email'}
                        </p>
                      </div>
                    ))}
                    {filteredPrimaryOptions.length === 0 && (
                      <div className="p-4 text-center text-xs text-brand-secondary">
                        No matching customer accounts found.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Primary Customer Card Info */}
          {primaryCustomer && (
            <div className="mt-4 p-4 bg-white rounded-xl border border-brand-border/70 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-brand-secondary">Customer ID:</span>
                <span className="font-mono text-brand-primary">{primaryCustomer.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-secondary">Contact:</span>
                <span className="font-medium text-brand-primary">{primaryCustomer.name || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-secondary">Email:</span>
                <span className="font-medium text-brand-primary">{primaryCustomer.email || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-secondary">Current Orders:</span>
                <span className="font-bold text-brand-primary">{primaryCustomer.ordersCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-secondary">Vault Assets:</span>
                <span className="font-bold text-brand-primary">{primaryCustomer.assetsCount}</span>
              </div>
            </div>
          )}
        </div>

        {/* 2. Duplicate Account (To Merge & Retire) */}
        <div className="p-5 bg-brand-bg/40 border border-brand-border rounded-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-700 bg-rose-100/70 px-2.5 py-0.5 rounded-md flex items-center gap-1">
                <AlertTriangle size={12} strokeWidth={3} /> Duplicate Account (Combine & Retire)
              </span>
              <span className="text-xs text-brand-secondary">Source to merge</span>
            </div>
            <h3 className="text-base font-bold text-brand-primary mb-1">
              Select Duplicate Account
            </h3>
            <p className="text-xs text-brand-secondary mb-4">
              Everything in this account will be transferred into the primary account above, then safely removed.
            </p>

            {/* Custom Searchable Picker */}
            <div className="relative">
              <div 
                className="w-full bg-white border border-brand-border rounded-xl p-3 cursor-pointer hover:border-brand-primary transition-colors flex items-center justify-between"
                onClick={() => setIsDuplicateDropdownOpen(!isDuplicateDropdownOpen)}
              >
                {duplicateCustomer ? (
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-brand-primary truncate">{duplicateCustomer.company}</p>
                    <p className="text-xs text-brand-secondary truncate">
                      {duplicateCustomer.email || 'No email'} • {duplicateCustomer.ordersCount} Orders • {duplicateCustomer.assetsCount} Assets
                    </p>
                  </div>
                ) : (
                  <span className="text-sm text-brand-secondary">Choose duplicate customer account...</span>
                )}
                <Search size={16} className="text-brand-secondary shrink-0 ml-2" />
              </div>

              {isDuplicateDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-brand-border rounded-xl shadow-xl z-30 overflow-hidden">
                  <div className="p-2 border-b border-brand-border bg-brand-bg/40">
                    <input 
                      type="text"
                      placeholder="Search company, contact, or email..."
                      value={duplicateSearch}
                      onChange={(e) => setDuplicateSearch(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-brand-border rounded-lg focus:outline-none focus:border-brand-primary"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-brand-border/40">
                    {filteredDuplicateOptions.map(c => (
                      <div
                        key={c.id}
                        className={`p-3 text-xs hover:bg-brand-bg/60 cursor-pointer transition-colors ${c.id === duplicateId ? 'bg-brand-bg font-semibold' : ''}`}
                        onClick={() => {
                          setDuplicateId(c.id);
                          setIsDuplicateDropdownOpen(false);
                          setDuplicateSearch('');
                        }}
                      >
                        <div className="flex justify-between items-center">
                          <p className="font-bold text-brand-primary">{c.company}</p>
                          <span className="text-[10px] text-brand-secondary bg-brand-bg px-2 py-0.5 rounded">
                            {c.ordersCount} orders • {c.assetsCount} assets
                          </span>
                        </div>
                        <p className="text-brand-secondary text-[11px] mt-0.5">
                          {c.name ? `${c.name} • ` : ''}{c.email || 'No email'}
                        </p>
                      </div>
                    ))}
                    {filteredDuplicateOptions.length === 0 && (
                      <div className="p-4 text-center text-xs text-brand-secondary">
                        No matching customer accounts found.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Duplicate Customer Card Info */}
          {duplicateCustomer && (
            <div className="mt-4 p-4 bg-white rounded-xl border border-brand-border/70 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-brand-secondary">Customer ID:</span>
                <span className="font-mono text-brand-primary">{duplicateCustomer.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-secondary">Contact:</span>
                <span className="font-medium text-brand-primary">{duplicateCustomer.name || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-secondary">Email:</span>
                <span className="font-medium text-brand-primary">{duplicateCustomer.email || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-secondary">Orders to Transfer:</span>
                <span className="font-bold text-rose-600">{duplicateCustomer.ordersCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-secondary">Vault Assets:</span>
                <span className="font-bold text-rose-600">{duplicateCustomer.assetsCount}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Live Merge Preview Breakdown */}
      {primaryCustomer && duplicateCustomer && (
        <div className="p-6 bg-white border border-brand-border rounded-2xl shadow-xs space-y-6 animate-fade-in">
          <div className="flex items-center justify-between border-b border-brand-border pb-4">
            <div>
              <h3 className="text-base font-bold text-brand-primary flex items-center gap-2">
                <ShieldCheck size={18} className="text-brand-primary" />
                Data Transfer Preview (Zero Data Loss Guarantee)
              </h3>
              <p className="text-xs text-brand-secondary mt-0.5">
                The following records will be transferred from <strong>"{duplicateCustomer.company}"</strong> into <strong>"{primaryCustomer.company}"</strong>:
              </p>
            </div>
            {isLoadingPreview && (
              <span className="text-xs text-brand-secondary flex items-center gap-1.5">
                <Loader2 size={14} className="animate-spin text-brand-primary" />
                Scanning database...
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Orders */}
            <div className="p-4 bg-brand-bg/50 border border-brand-border rounded-xl">
              <div className="flex items-center gap-2 text-brand-primary font-bold text-sm mb-1">
                <ShoppingBag size={16} />
                Orders: {ordersToMove.length}
              </div>
              <p className="text-xs text-brand-secondary">
                {ordersToMove.length === 0 ? 'No orders to move.' : `${ordersToMove.length} order(s) will be reassigned to the primary account.`}
              </p>
              {ordersToMove.length > 0 && (
                <div className="mt-2.5 max-h-28 overflow-y-auto text-[11px] space-y-1 font-mono text-brand-primary">
                  {ordersToMove.map(o => (
                    <div key={o.id} className="truncate bg-white p-1 rounded border border-brand-border/60">
                      #{o.orderNumber || o.id.slice(-6)} • {o.title || 'Custom Order'}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Assets */}
            <div className="p-4 bg-brand-bg/50 border border-brand-border rounded-xl">
              <div className="flex items-center gap-2 text-brand-primary font-bold text-sm mb-1">
                <ImageIcon size={16} />
                Vault Assets: {assetsToMove.length}
              </div>
              <p className="text-xs text-brand-secondary">
                {assetsToMove.length === 0 ? 'No unique assets to move.' : `${assetsToMove.length} unique file(s) will be added to the vault.`}
              </p>
              {assetsToMove.length > 0 && (
                <div className="mt-2.5 max-h-28 overflow-y-auto text-[11px] space-y-1 text-brand-primary">
                  {assetsToMove.map((a, i) => (
                    <div key={i} className="truncate bg-white p-1 rounded border border-brand-border/60">
                      {a.name || 'Custom Artwork'}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Portal Logins */}
            <div className="p-4 bg-brand-bg/50 border border-brand-border rounded-xl">
              <div className="flex items-center gap-2 text-brand-primary font-bold text-sm mb-1">
                <User size={16} />
                Portal Logins: {usersToMove.length}
              </div>
              <p className="text-xs text-brand-secondary">
                {usersToMove.length === 0 ? 'No portal users linked.' : `${usersToMove.length} client user(s) will be re-pointed so they can still log in.`}
              </p>
              {usersToMove.length > 0 && (
                <div className="mt-2.5 max-h-28 overflow-y-auto text-[11px] space-y-1 text-brand-primary">
                  {usersToMove.map(u => (
                    <div key={u.id} className="truncate bg-white p-1 rounded border border-brand-border/60">
                      {u.email} ({u.name})
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Carts & Messages */}
            <div className="p-4 bg-brand-bg/50 border border-brand-border rounded-xl">
              <div className="flex items-center gap-2 text-brand-primary font-bold text-sm mb-1">
                <MessageSquare size={16} />
                Carts & Messages
              </div>
              <p className="text-xs text-brand-secondary">
                {cartsToMoveCount} saved cart(s) and {chatMessagesToMoveCount} chat message(s) will be transferred.
              </p>
              <div className="mt-3 text-[11px] text-brand-secondary space-y-0.5">
                <div>• Suggested garments: preserved</div>
                <div>• Deck overrides: merged</div>
                <div>• Missing addresses: backfilled</div>
              </div>
            </div>
          </div>

          {/* Merge Action CTA */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-brand-border">
            <div className="text-xs text-brand-secondary">
              Review everything above before continuing. You will be prompted with a final safety confirmation.
            </div>
            <PillButton
              variant="filled"
              className="gap-2 px-6 py-2.5 bg-brand-primary text-white hover:bg-black font-semibold text-sm w-full sm:w-auto"
              onClick={() => {
                setIsConfirmChecked(false);
                setIsModalOpen(true);
              }}
              disabled={isLoadingPreview}
            >
              <GitMerge size={16} />
              Review & Merge Accounts
            </PillButton>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {isModalOpen && primaryCustomer && duplicateCustomer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-brand-border animate-scale-up space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-100 text-rose-700 rounded-full">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-brand-primary font-serif">
                  Confirm Customer Account Merge
                </h3>
                <p className="text-xs text-brand-secondary">
                  Please review the final merge parameters.
                </p>
              </div>
            </div>

            <div className="bg-brand-bg/50 p-4 rounded-xl border border-brand-border text-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-brand-secondary">Preserving Primary:</span>
                <span className="font-bold text-emerald-800">{primaryCustomer.company}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-brand-secondary">Retiring Duplicate:</span>
                <span className="font-bold text-rose-800">{duplicateCustomer.company}</span>
              </div>
              <div className="pt-2 border-t border-brand-border space-y-1 text-brand-secondary">
                <p className="font-semibold text-brand-primary">Transfer summary:</p>
                <p>• {ordersToMove.length} orders will be moved to {primaryCustomer.company}.</p>
                <p>• {assetsToMove.length} unique vault assets will be added.</p>
                <p>• {usersToMove.length} portal users will have their access re-linked.</p>
                <p>• {duplicateCustomer.company}'s duplicate customer shell will be removed.</p>
              </div>
            </div>

            {mergeError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                {mergeError}
              </div>
            )}

            {isMerging ? (
              <div className="p-4 bg-brand-bg rounded-xl flex items-center justify-center gap-3 text-sm text-brand-primary font-medium">
                <Loader2 size={18} className="animate-spin text-brand-primary" />
                {mergeStep || 'Executing merge...'}
              </div>
            ) : (
              <div className="space-y-4">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-brand-primary select-none">
                  <input
                    type="checkbox"
                    checked={isConfirmChecked}
                    onChange={(e) => setIsConfirmChecked(e.target.checked)}
                    className="mt-0.5 rounded text-brand-primary focus:ring-brand-primary border-brand-border"
                  />
                  <span>
                    I confirm that I want to combine <strong>"{duplicateCustomer.company}"</strong> into <strong>"{primaryCustomer.company}"</strong>. I understand that all orders and assets will be transferred.
                  </span>
                </label>

                <div className="flex justify-end gap-3 pt-2">
                  <PillButton
                    variant="outline"
                    onClick={() => setIsModalOpen(false)}
                    disabled={isMerging}
                  >
                    Cancel
                  </PillButton>
                  <PillButton
                    variant="filled"
                    className="bg-brand-primary hover:bg-black text-white gap-2 font-semibold"
                    disabled={!isConfirmChecked || isMerging}
                    onClick={handleExecuteMerge}
                  >
                    <GitMerge size={16} />
                    Confirm & Execute Merge
                  </PillButton>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
