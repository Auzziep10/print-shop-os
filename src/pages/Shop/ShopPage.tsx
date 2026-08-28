import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDoc, collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Minus, Plus, ShoppingBag, X } from 'lucide-react';
import {
  DEFAULT_SHOP_SETTINGS,
  SHOP_ORDERS_COLLECTION,
  SHOP_PRODUCTS_COLLECTION,
  SHOP_SETTINGS_DOC,
  cartItemKey,
  formatShopPrice,
  type ShopProduct,
  type ShopSettings,
} from './shopTypes';
import { useCart } from './useCart';
import './shop.css';

/* ------------------------------------------------------------------ */
/* Data hooks                                                         */
/* ------------------------------------------------------------------ */

export function useShopSettings(): ShopSettings {
  const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SHOP_SETTINGS);
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', SHOP_SETTINGS_DOC),
      snap => {
        if (snap.exists()) {
          setSettings({ ...DEFAULT_SHOP_SETTINGS, ...(snap.data() as Partial<ShopSettings>) });
        }
      },
      err => console.warn('Shop settings listener error:', err)
    );
    return unsub;
  }, []);
  return settings;
}

function useShopProducts(): { products: ShopProduct[]; loading: boolean } {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, SHOP_PRODUCTS_COLLECTION),
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ShopProduct));
        list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
        setProducts(list);
        setLoading(false);
      },
      err => {
        console.warn('Shop products listener error:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, []);
  return { products, loading };
}

/* ------------------------------------------------------------------ */
/* Product card                                                       */
/* ------------------------------------------------------------------ */

function ProductCard({ product }: { product: ShopProduct }) {
  const hasSecondary = Boolean(product.images?.[1]);

  return (
    <Link to={`/shop/product/${product.id}`} className="shop-card group block w-full cursor-pointer text-left">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-md bg-[#f2f2f0]">
        {product.images?.[0] ? (
          <>
            <img
              src={product.images[0]}
              alt={product.name}
              loading="lazy"
              className="shop-card-img h-full w-full object-cover"
            />
            {hasSecondary && (
              <img
                src={product.images[1]}
                alt={`${product.name} alternate view`}
                loading="lazy"
                className="shop-card-img absolute inset-0 h-full w-full object-cover opacity-0 group-hover:opacity-100"
              />
            )}
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-[0.3em] text-neutral-400">
            Coming soon
          </div>
        )}
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-900">
          {product.name}
        </span>
        <span className="text-[11px] font-medium tracking-wide text-neutral-900">
          {formatShopPrice(product.price)}
        </span>
      </div>
      {product.colorway && (
        <div className="mt-1 text-[8px] font-semibold uppercase tracking-[0.22em] text-neutral-400">
          {product.colorway}
        </div>
      )}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Cart drawer + checkout                                             */
/* ------------------------------------------------------------------ */

export function CartDrawer({
  cart,
  settings,
  onClose,
}: {
  cart: ReturnType<typeof useCart>;
  settings: ShopSettings;
  onClose: () => void;
}) {
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  const startCheckout = async () => {
    if (cart.items.length === 0 || checkingOut) return;
    setCheckingOut(true);
    setCheckoutError('');
    try {
      // 1. Record a pending order so every checkout attempt is tracked.
      const orderRef = await addDoc(collection(db, SHOP_ORDERS_COLLECTION), {
        items: cart.items.map(i => ({
          productId: i.productId,
          name: i.name,
          colorway: i.colorway,
          size: i.size,
          price: i.price,
          qty: i.qty,
        })),
        subtotal: cart.subtotal,
        status: 'pending',
        createdAt: Date.now(),
      });

      // 2. Create the Stripe Checkout session.
      const origin = window.location.origin;
      const lineItems = cart.items.map(i => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: i.size ? `${i.name} — ${i.size}` : i.name,
            ...(i.image ? { images: [i.image] } : {}),
            tax_code: 'txcd_30011000', // apparel — same code the portal's tax calc uses
          },
          unit_amount: Math.round(i.price * 100),
          tax_behavior: 'exclusive',
        },
        quantity: i.qty,
      }));

      const flatRate = settings.shippingFlatRate ?? 0;
      const freeOver = settings.freeShippingOver ?? 0;
      const shipsFree = freeOver > 0 && cart.subtotal >= freeOver;
      const shippingCents = shipsFree ? 0 : Math.max(0, Math.round(flatRate * 100));

      const res = await fetch('/api/stripe/shop-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          orderId: orderRef.id,
          lineItems,
          shippingCents,
          collectTax: settings.collectTax !== false,
          successUrl: `${origin}/shop/success?order=${orderRef.id}&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${origin}/shop`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Could not start checkout');
      }
      await updateDoc(doc(db, SHOP_ORDERS_COLLECTION, orderRef.id), { stripeSessionId: data.id });
      window.location.href = data.url;
    } catch (err: any) {
      console.error('Checkout error:', err);
      setCheckoutError(err.message || 'Checkout failed. Please try again.');
      setCheckingOut(false);
    }
  };

  return (
    <div className="shop-fade-in fixed inset-0 z-[80] bg-black/50" onClick={onClose}>
      <div
        className="shop-slide-in absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-5">
          <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Cart ({cart.count})</span>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900" aria-label="Close cart">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {cart.items.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.3em] text-neutral-400">
              Your cart is empty
            </div>
          ) : (
            cart.items.map(item => {
              const key = cartItemKey(item);
              return (
                <div key={key} className="flex gap-4 border-b border-neutral-100 py-4">
                  <div className="h-20 w-16 shrink-0 overflow-hidden bg-[#f2f2f0]">
                    {item.image && <img src={item.image} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="flex flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em]">{item.name}</span>
                      <span className="text-[10px] font-medium">{formatShopPrice(item.price * item.qty)}</span>
                    </div>
                    <div className="mt-1 text-[8px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
                      {[item.colorway, item.size].filter(Boolean).join(' · ')}
                    </div>
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <div className="flex items-center border border-neutral-200">
                        <button onClick={() => cart.updateQty(key, item.qty - 1)} className="flex h-7 w-7 items-center justify-center hover:bg-neutral-100" aria-label="Decrease quantity">
                          <Minus size={10} />
                        </button>
                        <span className="w-6 text-center text-[10px] font-semibold">{item.qty}</span>
                        <button onClick={() => cart.updateQty(key, item.qty + 1)} className="flex h-7 w-7 items-center justify-center hover:bg-neutral-100" aria-label="Increase quantity">
                          <Plus size={10} />
                        </button>
                      </div>
                      <button
                        onClick={() => cart.removeItem(key)}
                        className="text-[8px] font-semibold uppercase tracking-[0.2em] text-neutral-400 underline-offset-2 hover:text-neutral-900 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {cart.items.length > 0 && (
          <div className="border-t border-neutral-200 px-6 py-5">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.2em]">
              <span>Subtotal</span>
              <span>{formatShopPrice(cart.subtotal)}</span>
            </div>
            {settings.shippingNote && (
              <p className="mt-2 text-[9px] tracking-wide text-neutral-400">{settings.shippingNote}</p>
            )}
            {checkoutError && (
              <p className="mt-2 text-[9px] uppercase tracking-widest text-red-600">{checkoutError}</p>
            )}
            <button
              onClick={startCheckout}
              disabled={checkingOut}
              className="mt-4 h-11 w-full bg-neutral-900 text-[10px] font-bold uppercase tracking-[0.3em] text-white transition-colors hover:bg-black disabled:opacity-60"
            >
              {checkingOut ? 'Redirecting…' : 'Checkout'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export function ShopPage() {
  const settings = useShopSettings();
  const { products, loading } = useShopProducts();
  const cart = useCart();
  const [cartOpen, setCartOpen] = useState(false);

  const activeProducts = useMemo(() => products.filter(p => p.active), [products]);

  const { mainProducts, secondaryProducts } = useMemo(() => {
    const hasExplicitSecondary = activeProducts.some(p => p.section === 'secondary');
    if (hasExplicitSecondary) {
      return {
        mainProducts: activeProducts.filter(p => p.section !== 'secondary'),
        secondaryProducts: activeProducts.filter(p => p.section === 'secondary'),
      };
    }
    if (activeProducts.length >= 8) {
      const splitPoint = Math.min(8, activeProducts.length - 4);
      return {
        mainProducts: activeProducts.slice(0, splitPoint),
        secondaryProducts: activeProducts.slice(splitPoint),
      };
    }
    return {
      mainProducts: activeProducts,
      secondaryProducts: [],
    };
  }, [activeProducts]);

  useEffect(() => {
    document.title = `${settings.brandLine} — ${settings.collectionTitle}`;
    return () => { document.title = 'INKTHEORY'; };
  }, [settings.brandLine, settings.collectionTitle]);

  useEffect(() => {
    document.body.style.overflow = cartOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [cartOpen]);

  if (!settings.storeEnabled) {
    return (
      <div className="shop-root flex min-h-screen flex-col items-center justify-center bg-neutral-950 text-white">
        <div className="text-[10px] font-bold uppercase tracking-[0.5em]">{settings.brandLine}</div>
        <div className="mt-4 text-3xl font-light uppercase tracking-[0.4em]">{settings.collectionTitle}</div>
        <div className="mt-6 text-[9px] uppercase tracking-[0.4em] text-neutral-500">Coming soon</div>
      </div>
    );
  }

  return (
    <div className="shop-root">
      {/* Top strip */}
      <div className="relative z-20 bg-neutral-950 py-2.5 text-center">
        <a
          href="https://inktheory.studio"
          className="absolute left-4 top-1/2 flex -translate-y-1/2 items-center gap-1 text-[9px] font-bold uppercase tracking-[0.25em] text-white/90 transition-colors hover:text-white"
        >
          ← inktheory.studio
        </a>
        <span className="text-[9px] font-semibold uppercase tracking-[0.4em] text-white">
          {settings.topBanner}
        </span>
        <button
          onClick={() => setCartOpen(true)}
          className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-white/90 transition-colors hover:text-white"
          aria-label="Open cart"
        >
          <ShoppingBag size={13} strokeWidth={1.75} />
          <span className="text-[9px] font-bold tracking-[0.2em]">{cart.count}</span>
        </button>
      </div>

      {/* Hero 1 */}
      <div className="relative flex h-[300px] items-center justify-center overflow-hidden bg-neutral-900 md:h-[380px]">
        {settings.heroImageUrl && (
          <img
            src={settings.heroImageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-90"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/40" />
        <div className="relative z-10 flex flex-col items-center text-white px-4 text-center">
          {settings.logoUrl ? (
            <img
              src={settings.logoUrl}
              alt={settings.collectionTitle || 'Header Logo'}
              className="max-h-[68px] w-auto max-w-[40vw] object-contain md:max-h-[92px] drop-shadow-md"
            />
          ) : (
            <>
              <span className="text-[10px] font-semibold uppercase tracking-[0.5em] md:text-xs">
                {settings.brandLine}
              </span>
              <h1 className="mt-3 text-4xl font-light uppercase tracking-[0.3em] md:text-6xl md:tracking-[0.35em]">
                {settings.collectionTitle}
              </h1>
              <span className="mt-3 text-[10px] font-medium uppercase tracking-[0.5em] md:text-xs">
                {settings.collectionSubtitle}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Top Product grid */}
      <div className="mx-auto max-w-[1240px] px-5 py-14 md:px-8 md:py-20">
        {loading ? (
          <div className="py-24 text-center text-[10px] uppercase tracking-[0.3em] text-neutral-400">
            Loading…
          </div>
        ) : mainProducts.length === 0 && secondaryProducts.length === 0 ? (
          <div className="py-24 text-center text-[10px] uppercase tracking-[0.3em] text-neutral-400">
            New drop loading — check back soon
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-4 md:gap-x-8 md:gap-y-16">
            {mainProducts.map(p => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>

      {/* Second Banner (NM Original) */}
      <div className="relative h-[260px] overflow-hidden bg-neutral-800 md:h-[340px]">
        {settings.footerImageUrl && (
          <img src={settings.footerImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-black/10" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="shop-script -rotate-3 text-6xl text-white drop-shadow-lg md:text-8xl select-none">
            {settings.footerScript}
          </span>
        </div>
        {settings.footerVertical && (
          <span className="shop-vertical absolute bottom-6 right-3 text-[8px] font-semibold uppercase tracking-[0.4em] text-white/80">
            {settings.footerVertical}
          </span>
        )}
      </div>

      {/* Bottom Product grid (Under second banner) */}
      {secondaryProducts.length > 0 && (
        <div className="mx-auto max-w-[1240px] px-5 py-14 md:px-8 md:py-20">
          <div className="grid grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-4 md:gap-x-8 md:gap-y-16">
            {secondaryProducts.map(p => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}

      {/* Bottom footer strip */}
      <div className="bg-neutral-950 py-8 text-center border-t border-white/5">
        <span className="text-[9px] font-semibold uppercase tracking-[0.4em] text-neutral-500">
          © {new Date().getFullYear()} {settings.brandLine || 'NM ORIGINAL'} · ALL RIGHTS RESERVED
        </span>
      </div>

      {cartOpen && <CartDrawer cart={cart} settings={settings} onClose={() => setCartOpen(false)} />}
    </div>
  );
}
