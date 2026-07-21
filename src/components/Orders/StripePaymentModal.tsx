import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { X, CreditCard, ShoppingCart, Package, MapPin, Building2 } from 'lucide-react';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || 'pk_test_TYooMQauvdEDq54NiTphI7jx');

const CheckoutForm = ({ order, onSuccess, onCancel }: { order: any, onSuccess: () => void, onCancel: () => void }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { user } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const amount = order.totalFormatted 
        ? parseFloat(order.totalFormatted.replace(/[^0-9.]/g, ''))
        : 0;

      if (amount <= 0) {
        throw new Error("Invalid order amount for payment.");
      }

      // 1. Fetch Payment Intent from backend
      const response = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, orderId: order.id, currency: 'usd', receiptEmail: user?.email || order.customerEmail })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to initialize payment.');
      }

      const clientSecret = data.clientSecret;
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) throw new Error("Card element not found.");

      // 2. Confirm card payment with Stripe
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
        }
      });

      if (stripeError) {
        throw new Error(stripeError.message || 'Payment failed.');
      }

      if (paymentIntent && paymentIntent.status === 'succeeded') {
        // 3. Update Firestore
        const orderRef = doc(db, 'orders', order.id);
        
        // Remove existing tax items and append the new calculated tax item if tax > 0
        const finalTaxAmount = order.calculatedTax || 0;
        const cleanItems = (order.items || []).filter((item: any) => !(item.style || '').toLowerCase().includes('tax'));
        
        if (finalTaxAmount > 0) {
          cleanItems.push({
            id: `tax-${Date.now()}`,
            style: 'Sales Tax (Stripe Calculated)',
            itemType: 'service',
            qty: 1,
            price: finalTaxAmount,
            total: finalTaxAmount
          });
        }

        await updateDoc(orderRef, {
          statusIndex: 4, // Move to Sourcing
          paymentStatus: 'paid',
          paymentDate: new Date().toISOString(),
          paymentRead: false,
          items: cleanItems,
          tax: finalTaxAmount,
          total: order.calculatedTotal || 0,
          activities: arrayUnion({
            id: `act-${Date.now()}`,
            type: 'system',
            message: `Payment of ${order.totalFormatted || 'balance'} processed successfully via Stripe.`,
            user: order.customerId || 'Customer',
            timestamp: new Date().toISOString()
          })
        });

        setIsProcessing(false);
        onSuccess();
      } else {
        throw new Error("Payment could not be verified.");
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while processing payment.");
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200/60">
        <label className="text-[10px] font-bold text-neutral-500 mb-3 block uppercase tracking-widest">Card Information</label>
        <div className="bg-white p-3 rounded-xl border border-neutral-300 shadow-sm">
          <CardElement options={{
            style: {
              base: {
                fontSize: '15px',
                color: '#1a1a1a',
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
              invalid: {
                color: '#dc2626',
              },
            },
          }} />
        </div>
      </div>
      
      {error && (
        <div className="text-sm text-red-500 font-semibold bg-red-50 p-3 rounded-xl border border-red-100">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 bg-white border border-neutral-200 text-neutral-900 py-3.5 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-neutral-50 transition-all shadow-sm"
          disabled={isProcessing}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || isProcessing}
          className="flex-1 bg-[#635BFF] text-white py-3.5 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-[#5249e5] transition-all shadow-md flex justify-center items-center gap-2 animate-pulse-purple cursor-pointer"
        >
          {isProcessing ? (
            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
          ) : (
            <CreditCard size={14} />
          )}
          {isProcessing ? "Processing..." : `Pay ${order.totalFormatted || 'Now'}`}
        </button>
      </div>
    </form>
  );
};

export function StripePaymentModal({ order, onClose, onSuccess }: { order: any, onClose: () => void, onSuccess: () => void }) {
  const [statusIndex, setStatusIndex] = useState<number>(order.statusIndex);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [calculatedTax, setCalculatedTax] = useState<number | null>(null);
  const [isCalculatingTax, setIsCalculatingTax] = useState<boolean>(false);

  const handleApproveQuote = async () => {
    setIsApproving(true);
    try {
      const orderRef = doc(db, 'orders', order.id);
      await updateDoc(orderRef, {
        statusIndex: 3, // Move to pending payment
        activities: arrayUnion({
          id: `act-${Date.now()}`,
          type: 'system',
          message: 'Quote approved by customer.',
          user: 'Customer',
          timestamp: new Date().toISOString()
        })
      });
      setStatusIndex(3);
    } catch (err) {
      console.error("Failed to approve quote:", err);
      alert("Failed to approve quote.");
    } finally {
      setIsApproving(false);
    }
  };

  // Parse regular items, tax, and shipping
  let itemsSubtotal = 0;
  let taxAmount = 0;
  let shippingAmount = 0;
  const regularItems: any[] = [];

  order.items?.forEach((item: any) => {
    const priceStr = String(item.price || '0').replace(/[^0-9.]/g, '');
    const price = parseFloat(priceStr) || 0;
    
    let qty = 0;
    if (item.itemType === 'service' || !item.sizes || Object.keys(item.sizes).length === 0) {
      qty = parseInt(item.qty || 1);
    } else {
      qty = Object.values(item.sizes || {}).reduce((a: any, b: any) => a + (parseInt(b) || 0), 0) as number;
    }
    
    const total = price * qty;
    const styleLower = (item.style || '').toLowerCase();
    
    if (styleLower.includes('tax')) {
      taxAmount += total;
    } else if (styleLower.includes('shipping')) {
      shippingAmount += total;
    } else {
      itemsSubtotal += total;
      regularItems.push({ ...item, qty, total, unitPrice: price });
    }
  });

  // Fallbacks if not configured as line items
  if (taxAmount === 0 && order.tax) {
    taxAmount = parseFloat(String(order.tax).replace(/[^0-9.]/g, '')) || 0;
  }
  if (shippingAmount === 0 && order.shipping) {
    shippingAmount = parseFloat(String(order.shipping).replace(/[^0-9.]/g, '')) || 0;
  }
  if (shippingAmount === 0 && order.shippingCost) {
    shippingAmount = parseFloat(String(order.shippingCost).replace(/[^0-9.]/g, '')) || 0;
  }

  const hasShippingAddress = !!(order.shippingAddress && 
    (order.shippingAddress.street1 || order.shippingAddress.street || order.shippingAddress.city));

  useEffect(() => {
    const calculateStripeTax = async () => {
      if (!hasShippingAddress || regularItems.length === 0) return;
      setIsCalculatingTax(true);
      try {
        const response = await fetch('/api/stripe/calculate-tax', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shippingAddress: order.shippingAddress,
            items: regularItems.map(item => ({
              id: item.id || item.style || 'item',
              amount: item.total,
            })),
          }),
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`HTTP ${response.status}: ${text}`);
        }
        const data = await response.json();
        if (data.taxAmount !== undefined) {
          setCalculatedTax(data.taxAmount);
        }
      } catch (err) {
        console.error('Failed to calculate Stripe tax:', err);
      } finally {
        setIsCalculatingTax(false);
      }
    };

    calculateStripeTax();
  }, [order.id, hasShippingAddress]);

  const finalTaxAmount = calculatedTax !== null ? calculatedTax : taxAmount;
  const finalTotal = itemsSubtotal + finalTaxAmount + shippingAmount;

  const formattedSubtotal = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(itemsSubtotal);
  const formattedTax = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(finalTaxAmount);
  const formattedShipping = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(shippingAmount);
  const formattedTotal = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(finalTotal);

  const orderWithTotal = { 
    ...order, 
    totalFormatted: formattedTotal,
    calculatedTax: finalTaxAmount,
    calculatedTotal: finalTotal
  };

  return (
    <div 
      className="fixed inset-0 z-[250] flex justify-end bg-black/35 backdrop-blur-xs animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div 
        className="bg-white w-full sm:max-w-[500px] h-full shadow-2xl overflow-hidden animate-in slide-in-from-right duration-300 flex flex-col relative border-l border-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Drawer Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-100 shrink-0">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-neutral-100 rounded-full flex items-center justify-center text-neutral-800">
               <ShoppingCart size={20} />
             </div>
             <div>
               <h2 className="text-lg font-bold text-neutral-900">Your Order Checkout</h2>
               <p className="text-[10px] font-bold text-neutral-450 uppercase tracking-widest">Order #{order.portalId || order.id.substring(0,8)}</p>
             </div>
          </div>
          <button 
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-900 transition-colors p-2 hover:bg-neutral-100 rounded-full"
          >
            <X size={20} />
          </button>
        </div>

        {/* Drawer Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-neutral-50/20 flex flex-col gap-6 custom-scrollbar animate-in fade-in duration-350">
          
          {/* Garments List Section */}
          <div className="flex flex-col gap-3">
            <h3 className="text-[10px] font-bold tracking-widest text-neutral-450 uppercase mb-1">Garments in Cart ({regularItems.length})</h3>
            <div className="flex flex-col gap-3">
              {regularItems.map((item: any, idx: number) => (
                <div key={idx} className="flex gap-4 items-center bg-white p-4 rounded-2xl border border-neutral-200/50 shadow-2xs animate-in slide-in-from-bottom duration-250" style={{ animationDelay: `${idx * 50}ms` }}>
                  {item.image ? (
                    <div className="w-14 h-14 shrink-0 bg-white rounded-xl border border-neutral-100 p-1 flex items-center justify-center animate-in zoom-in duration-200">
                      <img src={item.image} alt={item.style} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                    </div>
                  ) : (
                    <div className="w-14 h-14 shrink-0 bg-neutral-50 rounded-xl flex items-center justify-center text-neutral-350 border border-neutral-100">
                      <Package size={20} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-neutral-900 text-sm truncate">{item.style || 'Custom Garment'}</p>
                    <p className="text-xs text-neutral-500 font-semibold mt-0.5 uppercase tracking-wide">
                      {item.color ? `${item.color} • ` : ''}{item.qty} {item.qty === 1 ? 'Unit' : 'Units'}
                    </p>
                    {/* Sizes Display Spread */}
                    {item.sizes && Object.keys(item.sizes).length > 0 && (
                      <div className="flex gap-1 mt-1.5 flex-wrap animate-in fade-in duration-300">
                        {Object.entries(item.sizes).map(([size, q]: [string, any]) => {
                          if (!q) return null;
                          return (
                            <span key={size} className="text-[9px] font-bold bg-neutral-50 border border-neutral-200 text-neutral-600 px-1.5 py-0.5 rounded uppercase leading-none">
                              {size}: {q}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0 pl-2">
                    <p className="font-bold text-neutral-900 text-sm">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.total || (item.unitPrice * item.qty))}
                    </p>
                    {item.qty > 1 && (
                      <p className="text-[10px] text-neutral-400 font-semibold mt-0.5">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.unitPrice)} ea
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {regularItems.length === 0 && (
                <p className="text-center py-6 text-sm text-neutral-400 italic">No items found in this order.</p>
              )}
            </div>
          </div>

          {/* Delivery Details Section */}
          <div className="flex flex-col gap-3">
            <h3 className="text-[10px] font-bold tracking-widest text-neutral-450 uppercase mb-1">Delivery Details</h3>
            <div className="bg-white rounded-2xl p-4 border border-neutral-200/50 shadow-2xs flex gap-3 items-start animate-in slide-in-from-bottom duration-250" style={{ animationDelay: '100ms' }}>
              {hasShippingAddress ? (
                <>
                  <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-600 shrink-0 mt-0.5 animate-in zoom-in duration-200">
                    <MapPin size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-neutral-900 uppercase tracking-wide">Ship To</p>
                    <div className="text-xs text-neutral-600 leading-relaxed font-semibold mt-1">
                      {order.shippingAddress.name && <span className="block text-neutral-800 font-bold">{order.shippingAddress.name}</span>}
                      {order.shippingAddress.company && <span className="block text-neutral-400 text-[10px] uppercase tracking-wider">{order.shippingAddress.company}</span>}
                      <span className="block">{order.shippingAddress.street1 || order.shippingAddress.street}</span>
                      {order.shippingAddress.street2 && <span className="block">{order.shippingAddress.street2}</span>}
                      <span className="block">
                        {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zip}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-600 shrink-0 mt-0.5 animate-in zoom-in duration-200">
                    <Building2 size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-neutral-900 uppercase tracking-wide">Local Pickup</p>
                    <p className="text-xs text-neutral-600 leading-relaxed font-semibold mt-1">
                      Pickup from print shop office.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Pricing Breakdown Section */}
          <div className="flex flex-col gap-3">
            <h3 className="text-[10px] font-bold tracking-widest text-neutral-450 uppercase mb-1">Pricing Details</h3>
            <div className="bg-white rounded-2xl p-4 border border-neutral-200/50 shadow-2xs flex flex-col gap-3">
              <div className="flex justify-between items-center text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <span>Items Subtotal</span>
                <span className="font-bold text-neutral-800">{formattedSubtotal}</span>
              </div>
              
              <div className="flex justify-between items-center text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <span>Shipping & Handling</span>
                <span className="font-bold text-neutral-800">
                  {shippingAmount > 0 ? formattedShipping : 'Free'}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <span>Estimated Sales Tax</span>
                <span className="font-bold text-neutral-800">
                  {isCalculatingTax ? (
                    <span className="text-[10px] text-neutral-400 italic font-medium animate-pulse">Calculating...</span>
                  ) : (
                    finalTaxAmount > 0 ? formattedTax : '$0.00'
                  )}
                </span>
              </div>

              <div className="flex justify-between items-center pt-3.5 border-t border-neutral-100 mt-1">
                <span className="text-xs font-bold uppercase tracking-widest text-neutral-900">Total Price</span>
                <span className="text-xl font-bold text-neutral-900 tracking-tight">{formattedTotal}</span>
              </div>
            </div>
          </div>

        </div>

        {/* Sticky Payment / Approval Footer Container */}
        <div className="shrink-0 bg-white border-t border-neutral-200 p-6 shadow-[0_-8px_30px_rgb(0,0,0,0.06)] z-20">
          <style>{`
            @keyframes pulse-subtle-purple {
              0%, 100% { transform: scale(1); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
              50% { transform: scale(1.02); box-shadow: 0 10px 15px -3px rgba(99, 91, 255, 0.45), 0 4px 6px -2px rgba(99, 91, 255, 0.25); }
            }
            @keyframes pulse-subtle-black {
              0%, 100% { transform: scale(1); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
              50% { transform: scale(1.02); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.35), 0 4px 6px -2px rgba(0, 0, 0, 0.2); }
            }
            .animate-pulse-purple {
              animation: pulse-subtle-purple 2s infinite ease-in-out;
            }
            .animate-pulse-black {
              animation: pulse-subtle-black 2s infinite ease-in-out;
            }
          `}</style>
          
          {statusIndex === 2 ? (
            <div className="flex flex-col gap-3 animate-in fade-in duration-300">
              <button
                type="button"
                onClick={handleApproveQuote}
                disabled={isApproving}
                className="w-full bg-black text-white hover:bg-neutral-800 py-4 rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-md flex justify-center items-center gap-2 animate-pulse-black cursor-pointer"
              >
                {isApproving ? (
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                ) : (
                  <span>Approve Quote</span>
                )}
              </button>
              <span className="text-[10px] text-neutral-400 font-semibold text-center leading-normal block">
                Review garments & total pricing above before approving.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-3 animate-in fade-in duration-300">
              <div className="flex items-center gap-2 pb-2 border-b border-neutral-100 mb-1">
                <CreditCard size={15} className="text-[#635BFF]" />
                <span className="text-[10px] font-extrabold text-neutral-500 uppercase tracking-widest">Pay Securely with Card</span>
              </div>
              <Elements stripe={stripePromise}>
                <CheckoutForm order={orderWithTotal} onSuccess={onSuccess} onCancel={onClose} />
              </Elements>
            </div>
          )}
        </div>

        {/* Footer Security Badges */}
        <div className="p-4 bg-neutral-100 border-t border-neutral-200/60 shrink-0 flex items-center justify-between text-[9px] font-bold tracking-wider text-neutral-400 uppercase">
          <span>Secure Checkout</span>
          <span>Powered by Stripe</span>
        </div>

      </div>
    </div>
  );
}
