import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Lock, Minus, Package, Plus, ShoppingBag, Truck } from 'lucide-react';
import {
  SHOP_PRODUCTS_COLLECTION,
  formatShopPrice,
  type ShopProduct,
} from './shopTypes';
import { useCart } from './useCart';
import { CartDrawer, useShopSettings } from './ShopPage';
import './shop.css';

export function ShopProductPage() {
  const { id } = useParams<{ id: string }>();
  const settings = useShopSettings();
  const cart = useCart();
  const [cartOpen, setCartOpen] = useState(false);
  // undefined = loading, null = not found
  const [product, setProduct] = useState<ShopProduct | null | undefined>(undefined);
  const [imageIdx, setImageIdx] = useState(0);
  const [size, setSize] = useState('');
  const [qty, setQty] = useState(1);
  const [sizeError, setSizeError] = useState(false);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      doc(db, SHOP_PRODUCTS_COLLECTION, id),
      snap => {
        if (snap.exists()) {
          const p = { id: snap.id, ...snap.data() } as ShopProduct;
          setProduct(p.active ? p : null);
          if (p.sizes?.length === 1) setSize(p.sizes[0]);
        } else {
          setProduct(null);
        }
      },
      err => {
        console.warn('Shop product listener error:', err);
        setProduct(null);
      }
    );
    return unsub;
  }, [id]);

  useEffect(() => {
    if (product) document.title = `${product.name} — ${settings.brandLine}`;
    return () => { document.title = 'INKTHEORY'; };
  }, [product, settings.brandLine]);

  useEffect(() => {
    document.body.style.overflow = cartOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [cartOpen]);

  const needsSize = (product?.sizes?.length ?? 0) > 0;

  const addToCart = () => {
    if (!product) return;
    if (needsSize && !size) {
      setSizeError(true);
      return;
    }
    cart.addItem({
      productId: product.id,
      name: product.name,
      colorway: product.colorway,
      size: needsSize ? size : '',
      price: product.price,
      image: product.images[0],
      qty,
    });
    setCartOpen(true);
  };

  const flatRate = settings.shippingFlatRate ?? 0;
  const freeOver = settings.freeShippingOver ?? 0;
  const shippingPerk =
    flatRate === 0
      ? 'Free standard shipping'
      : `${formatShopPrice(flatRate)} flat-rate shipping${freeOver > 0 ? ` — free over ${formatShopPrice(freeOver)}` : ''}`;

  return (
    <div className="shop-root min-h-screen">
      {/* Top strip */}
      <div className="relative z-20 bg-neutral-950 py-2.5 text-center">
        <Link to="/shop" className="absolute left-4 top-1/2 -translate-y-1/2 text-[9px] font-bold uppercase tracking-[0.25em] text-white/90 hover:text-white">
          ← Shop
        </Link>
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

      {product === undefined && (
        <div className="py-32 text-center text-[10px] uppercase tracking-[0.3em] text-neutral-400">
          Loading…
        </div>
      )}

      {product === null && (
        <div className="flex flex-col items-center py-32 text-center">
          <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-400">
            This piece is no longer available
          </div>
          <Link
            to="/shop"
            className="mt-8 bg-neutral-900 px-8 py-3 text-[10px] font-bold uppercase tracking-[0.3em] text-white hover:bg-black"
          >
            Back to shop
          </Link>
        </div>
      )}

      {product && (
        <div className="mx-auto max-w-[1240px] px-5 py-8 md:px-8">
          {/* Breadcrumb */}
          <nav className="mb-6 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
            <Link to="/shop" className="hover:text-neutral-900">{settings.brandLine}</Link>
            <span>/</span>
            <Link to="/shop" className="hover:text-neutral-900">{settings.collectionTitle}</Link>
            <span>/</span>
            <span className="text-neutral-900">{product.name}</span>
          </nav>

          <div className="flex flex-col gap-8 md:flex-row md:gap-10">
            {/* Thumbnail rail (desktop) */}
            {product.images.length > 1 && (
              <div className="hidden w-20 shrink-0 flex-col gap-3 md:flex">
                {product.images.map((img, i) => (
                  <button
                    key={i}
                    onMouseEnter={() => setImageIdx(i)}
                    onClick={() => setImageIdx(i)}
                    className={`aspect-[4/5] w-full overflow-hidden bg-[#f2f2f0] transition-opacity ${
                      i === imageIdx ? 'ring-1 ring-neutral-900' : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Main image */}
            <div className="min-w-0 flex-1">
              <div className="aspect-[4/5] w-full overflow-hidden bg-[#f2f2f0]">
                {product.images[imageIdx] ? (
                  <img src={product.images[imageIdx]} alt={product.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-[0.3em] text-neutral-400">
                    No image
                  </div>
                )}
              </div>
              {/* Thumbnail row (mobile) */}
              {product.images.length > 1 && (
                <div className="mt-3 flex gap-2 md:hidden">
                  {product.images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setImageIdx(i)}
                      className={`h-20 w-16 shrink-0 overflow-hidden bg-[#f2f2f0] ${
                        i === imageIdx ? 'ring-1 ring-neutral-900' : 'opacity-70'
                      }`}
                    >
                      <img src={img} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Details column */}
            <div className="w-full shrink-0 md:w-[380px]">
              <div className="md:sticky md:top-8">
                <h1 className="text-lg font-bold uppercase tracking-[0.16em] text-neutral-900">
                  {product.name}
                </h1>
                {product.colorway && (
                  <div className="mt-2 text-[9px] font-semibold uppercase tracking-[0.25em] text-neutral-400">
                    {product.colorway}
                  </div>
                )}
                <div className="mt-4 text-lg font-medium tracking-wide">{formatShopPrice(product.price)}</div>

                {needsSize && (
                  <div className="mt-8">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-neutral-500">Size</span>
                      {sizeError && (
                        <span className="text-[9px] uppercase tracking-widest text-red-600">Select a size</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {product.sizes.map(s => (
                        <button
                          key={s}
                          onClick={() => { setSize(s); setSizeError(false); }}
                          className={`min-w-[52px] border px-3 py-3 text-[11px] font-semibold uppercase tracking-widest transition-colors ${
                            size === s
                              ? 'border-neutral-900 bg-neutral-900 text-white'
                              : 'border-neutral-300 text-neutral-700 hover:border-neutral-900'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-8 flex items-center gap-3">
                  <div className="flex items-center border border-neutral-300">
                    <button onClick={() => setQty(q => Math.max(1, q - 1))} className="flex h-12 w-11 items-center justify-center hover:bg-neutral-100" aria-label="Decrease quantity">
                      <Minus size={12} />
                    </button>
                    <span className="w-8 text-center text-xs font-semibold">{qty}</span>
                    <button onClick={() => setQty(q => q + 1)} className="flex h-12 w-11 items-center justify-center hover:bg-neutral-100" aria-label="Increase quantity">
                      <Plus size={12} />
                    </button>
                  </div>
                  <button
                    onClick={addToCart}
                    className="h-12 flex-1 rounded-full bg-neutral-900 text-[11px] font-bold uppercase tracking-[0.25em] text-white transition-colors hover:bg-black"
                  >
                    Add to cart
                  </button>
                </div>

                {/* Perks */}
                <div className="mt-8 space-y-3 border-t border-neutral-200 pt-6">
                  <div className="flex items-center gap-3 text-xs text-neutral-600">
                    <Truck size={15} strokeWidth={1.5} className="shrink-0" />
                    {shippingPerk}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-neutral-600">
                    <Package size={15} strokeWidth={1.5} className="shrink-0" />
                    Ships in 3–7 business days
                  </div>
                  <div className="flex items-center gap-3 text-xs text-neutral-600">
                    <Lock size={15} strokeWidth={1.5} className="shrink-0" />
                    Secure checkout powered by Stripe
                  </div>
                </div>

                {product.description && (
                  <div className="mt-6 border-t border-neutral-200 pt-6">
                    <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.25em] text-neutral-500">Details</div>
                    <p className="text-xs leading-relaxed text-neutral-600">{product.description}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {cartOpen && <CartDrawer cart={cart} settings={settings} onClose={() => setCartOpen(false)} />}
    </div>
  );
}
