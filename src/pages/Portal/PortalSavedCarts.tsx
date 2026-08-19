import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { ShoppingCart, ArrowLeft, ArrowRight, Trash2, Loader2, Plus, FolderHeart } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export function PortalSavedCarts() {
  const { customerId: paramCustomerId } = useParams<{ customerId?: string }>();
  const { userData } = useAuth();
  const navigate = useNavigate();

  const customerId = paramCustomerId || userData?.customerId || '';

  const [savedCartsList, setSavedCartsList] = useState<any[]>([]);
  const [isLoadingSavedCarts, setIsLoadingSavedCarts] = useState(true);

  // Local storage helpers for fallback & fast loading
  const getLocalSavedCarts = (cId: string): any[] => {
    try {
      const raw = localStorage.getItem(`wovn_saved_carts_${cId}`);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  };

  const removeLocalSavedCart = (cId: string, cartId: string) => {
    try {
      const existing = getLocalSavedCarts(cId);
      const updated = existing.filter((c: any) => c.id !== cartId);
      localStorage.setItem(`wovn_saved_carts_${cId}`, JSON.stringify(updated));
    } catch (e) {
      console.error("Error deleting local saved cart:", e);
    }
  };

  // Realtime subscription for Saved Carts
  useEffect(() => {
    if (!customerId) {
      setIsLoadingSavedCarts(false);
      return;
    }

    setIsLoadingSavedCarts(true);
    const localCarts = getLocalSavedCarts(customerId);
    setSavedCartsList(localCarts);

    const q = query(
      collection(db, 'saved_carts'),
      where('customerId', '==', customerId)
    );

    const unsub = onSnapshot(q, (snap) => {
      const remoteCarts: any[] = [];
      snap.forEach(docSnap => {
        remoteCarts.push({ id: docSnap.id, ...docSnap.data() });
      });

      const local = getLocalSavedCarts(customerId);
      const combinedMap = new Map<string, any>();
      local.forEach(c => combinedMap.set(c.id, c));
      remoteCarts.forEach(c => combinedMap.set(c.id, c));

      const combined = Array.from(combinedMap.values());
      combined.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setSavedCartsList(combined);
      setIsLoadingSavedCarts(false);
    }, (err) => {
      console.warn("Firestore saved_carts listener error (using local storage fallback):", err);
      setIsLoadingSavedCarts(false);
    });

    return () => unsub();
  }, [customerId]);

  const handleLoadCart = (savedCart: any) => {
    if (!customerId) return;
    try {
      const cartKey = `wovn_reorder_cart_${customerId}`;
      localStorage.setItem(cartKey, JSON.stringify(savedCart.items || []));
      window.dispatchEvent(new Event('wovn_cart_updated'));
    } catch (e) {
      console.error("Failed to load saved cart into localStorage:", e);
    }
    navigate(`/portal/${customerId}/create?openCart=true`);
  };

  const handleDeleteCart = async (savedCart: any) => {
    if (!confirm(`Delete saved cart "${savedCart.name}"?`)) return;
    if (customerId) removeLocalSavedCart(customerId, savedCart.id);
    setSavedCartsList(prev => prev.filter(c => c.id !== savedCart.id));
    try {
      await deleteDoc(doc(db, 'saved_carts', savedCart.id));
    } catch (err) {
      console.warn("Firestore delete saved_carts warning:", err);
    }
  };

  return (
    <div className="min-h-screen bg-white font-sans text-neutral-900 pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        
        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(customerId ? `/portal/${customerId}` : '/portal')}
            className="inline-flex items-center gap-2 text-xs font-bold text-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} /> Back to Dashboard
          </button>
        </div>

        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-8 border-b border-neutral-200 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200/80 flex items-center justify-center text-indigo-600 shadow-3xs">
                <FolderHeart size={20} />
              </div>
              <h1 className="font-serif font-bold text-3xl sm:text-4xl text-neutral-900">
                Saved Carts
              </h1>
            </div>
            <p className="text-sm font-medium text-neutral-500 max-w-xl">
              Access your saved cart configurations and order drafts for instant 1-click re-ordering anytime.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate(customerId ? `/portal/${customerId}/create` : '/portal/create')}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-neutral-900 hover:bg-black text-white text-xs font-bold rounded-full transition-all shadow-md hover:shadow-lg cursor-pointer shrink-0"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>Start New Order</span>
          </button>
        </div>

        {/* Content Section */}
        {isLoadingSavedCarts ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-neutral-400" size={32} />
          </div>
        ) : savedCartsList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center bg-neutral-50/60 border border-dashed border-neutral-200 rounded-3xl max-w-2xl mx-auto my-6">
            <div className="w-16 h-16 rounded-3xl bg-white border border-neutral-200 shadow-sm flex items-center justify-center text-indigo-500 mb-4">
              <ShoppingCart size={28} />
            </div>
            <h3 className="font-serif font-bold text-xl text-neutral-900 mb-2">
              No Saved Carts Yet
            </h3>
            <p className="text-xs text-neutral-500 max-w-md font-medium leading-relaxed mb-6">
              When creating an order, click <strong>"Save Cart"</strong> inside your cart drawer to save your garment choices, artwork placements, and size breakdowns here for easy 1-click re-ordering!
            </p>
            <button
              type="button"
              onClick={() => navigate(customerId ? `/portal/${customerId}/create` : '/portal/create')}
              className="inline-flex items-center gap-2 px-6 py-3 bg-black hover:bg-neutral-800 text-white font-bold text-xs rounded-full transition-all shadow-sm cursor-pointer"
            >
              <Plus size={15} strokeWidth={2.5} />
              <span>Start Your First Order</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {savedCartsList.map((savedCart: any) => {
              const itemsCount = savedCart.items?.length || 0;
              const totalUnits = (savedCart.items || []).reduce((acc: number, item: any) => {
                const qValues: any[] = Object.values(item.quantities || item.sizes || {});
                const qSum = qValues.reduce((a: number, b: any) => a + (parseInt(b, 10) || 0), 0);
                return acc + (qSum > 0 ? qSum : 1);
              }, 0);

              const formattedDate = savedCart.createdAt ? new Date(savedCart.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              }) : 'Recent';

              return (
                <div
                  key={savedCart.id}
                  className="bg-white border border-neutral-200 hover:border-black rounded-3xl p-6 shadow-2xs hover:shadow-xl transition-all duration-300 flex flex-col justify-between gap-5 group relative"
                >
                  {/* Top row */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-serif font-bold text-neutral-900 text-xl leading-tight group-hover:text-black pr-2">
                        {savedCart.name}
                      </h3>
                      <button
                        type="button"
                        onClick={() => handleDeleteCart(savedCart)}
                        className="p-1.5 rounded-full hover:bg-rose-50 text-neutral-400 hover:text-rose-600 transition-colors cursor-pointer shrink-0 -mr-1 -mt-1"
                        title="Delete saved cart"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <p className="text-xs font-medium text-neutral-400">
                      Saved on {formattedDate} • by {savedCart.createdBy || 'Customer'}
                    </p>
                  </div>

                  {/* Garments Preview Thumbnails */}
                  <div className="bg-neutral-50/80 rounded-2xl p-3 border border-neutral-100 flex items-center gap-2.5 overflow-x-auto">
                    {(savedCart.items || []).slice(0, 4).map((cItem: any, idx: number) => (
                      <div key={idx} className="w-13 h-13 rounded-xl bg-white border border-neutral-200 p-1 flex items-center justify-center shrink-0 shadow-3xs" title={cItem.style}>
                        <img 
                          src={cItem.image || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200'} 
                          alt="" 
                          className="max-w-full max-h-full object-contain mix-blend-multiply" 
                        />
                      </div>
                    ))}
                    {(savedCart.items?.length || 0) > 4 && (
                      <span className="text-xs font-bold text-neutral-500 bg-white border border-neutral-200 rounded-xl px-2.5 py-1 shrink-0">
                        +{(savedCart.items.length - 4)} more
                      </span>
                    )}
                  </div>

                  {/* Stats & Load Action */}
                  <div className="pt-4 border-t border-neutral-100 flex items-center justify-between gap-3 mt-auto">
                    <div className="text-xs font-semibold text-neutral-700">
                      <span>{itemsCount} {itemsCount === 1 ? 'Garment' : 'Garments'}</span>
                      <span className="text-neutral-400 font-normal"> ({totalUnits} pcs)</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleLoadCart(savedCart)}
                      className="bg-black hover:bg-neutral-800 text-white font-bold text-xs px-5 py-2.5 rounded-full transition-all shadow-sm hover:shadow-md cursor-pointer inline-flex items-center gap-2 group-hover:scale-[1.02]"
                    >
                      <span>Load Cart</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
