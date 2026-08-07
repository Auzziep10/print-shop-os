import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { SHOP_ORDERS_COLLECTION, formatShopPrice, type ShopOrder } from './shopTypes';
import { clearStoredCart } from './useCart';
import { useShopSettings } from './ShopPage';
import './shop.css';

type Phase = 'verifying' | 'confirmed' | 'failed';

export function ShopSuccess() {
  const [searchParams] = useSearchParams();
  const settings = useShopSettings();
  const [phase, setPhase] = useState<Phase>('verifying');
  const [order, setOrder] = useState<ShopOrder | null>(null);
  const ran = useRef(false);

  const orderId = searchParams.get('order');
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const verify = async () => {
      if (!orderId || !sessionId) {
        setPhase('failed');
        return;
      }
      try {
        const res = await fetch('/api/stripe/shop-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'verify', sessionId }),
        });
        const data = await res.json();
        if (!res.ok || !data.paid) {
          setPhase('failed');
          return;
        }

        clearStoredCart();

        const orderRef = doc(db, SHOP_ORDERS_COLLECTION, orderId);
        const snap = await getDoc(orderRef);
        if (snap.exists()) {
          const current = snap.data() as ShopOrder;
          // Only upgrade pending → paid; never downgrade a fulfilled order.
          if (current.status === 'pending') {
            const update = {
              status: 'paid' as const,
              paidAt: Date.now(),
              amountTotal: typeof data.amount_total === 'number' ? data.amount_total / 100 : current.subtotal,
              currency: data.currency || 'usd',
              email: data.email || '',
              customerName: data.name || '',
              shippingAddress: data.shipping || null,
            };
            await updateDoc(orderRef, update);
            setOrder({ ...current, ...update, id: orderId });
          } else {
            setOrder({ ...current, id: orderId });
          }
        }
        setPhase('confirmed');
      } catch (err) {
        console.error('Order verification error:', err);
        setPhase('failed');
      }
    };
    verify();
  }, [orderId, sessionId]);

  return (
    <div className="shop-root flex min-h-screen flex-col">
      <div className="bg-neutral-950 py-2.5 text-center">
        <span className="text-[9px] font-semibold uppercase tracking-[0.4em] text-white">
          {settings.topBanner}
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        {phase === 'verifying' && (
          <div className="text-[10px] uppercase tracking-[0.4em] text-neutral-400">
            Confirming your order…
          </div>
        )}

        {phase === 'failed' && (
          <>
            <div className="text-[10px] font-semibold uppercase tracking-[0.5em] text-neutral-400">
              {settings.brandLine}
            </div>
            <h1 className="mt-4 text-2xl font-light uppercase tracking-[0.3em]">
              Payment not confirmed
            </h1>
            <p className="mt-4 max-w-sm text-xs leading-relaxed text-neutral-500">
              We couldn't confirm this payment. If you were charged, your order is safe — reach out
              and we'll make it right.
            </p>
            <Link
              to="/shop"
              className="mt-8 bg-neutral-900 px-8 py-3 text-[10px] font-bold uppercase tracking-[0.3em] text-white hover:bg-black"
            >
              Back to shop
            </Link>
          </>
        )}

        {phase === 'confirmed' && (
          <>
            <div className="text-[10px] font-semibold uppercase tracking-[0.5em] text-neutral-400">
              {settings.brandLine}
            </div>
            <h1 className="mt-4 text-3xl font-light uppercase tracking-[0.3em]">Order confirmed</h1>
            <p className="mt-4 max-w-sm text-xs leading-relaxed text-neutral-500">
              Thank you. A receipt has been sent to your email
              {order?.email ? ` (${order.email})` : ''}. We'll get your gear moving.
            </p>

            {order && order.items?.length > 0 && (
              <div className="mt-10 w-full max-w-sm border border-neutral-200 p-6 text-left">
                <div className="mb-4 text-[9px] font-bold uppercase tracking-[0.3em] text-neutral-400">
                  Order · {order.id.slice(0, 8).toUpperCase()}
                </div>
                {order.items.map((item, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-3 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">
                      {item.name}
                      {item.size ? ` · ${item.size}` : ''} × {item.qty}
                    </span>
                    <span className="text-[10px]">{formatShopPrice(item.price * item.qty)}</span>
                  </div>
                ))}
                <div className="mt-4 flex items-baseline justify-between border-t border-neutral-200 pt-3 text-[11px] font-bold uppercase tracking-[0.2em]">
                  <span>Total</span>
                  <span>{formatShopPrice(order.amountTotal ?? order.subtotal)}</span>
                </div>
              </div>
            )}

            <Link
              to="/shop"
              className="mt-10 bg-neutral-900 px-8 py-3 text-[10px] font-bold uppercase tracking-[0.3em] text-white hover:bg-black"
            >
              Back to shop
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
