import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { X, CreditCard, ShoppingCart, Package } from 'lucide-react';
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
        await updateDoc(orderRef, {
          statusIndex: 4, // Move to Sourcing
          paymentStatus: 'paid',
          paymentDate: new Date().toISOString(),
          paymentRead: false,
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200">
        <label className="text-xs font-bold text-neutral-750 mb-3 block uppercase tracking-wider">Card Information</label>
        <div className="bg-white p-3 rounded-lg border border-neutral-300 shadow-sm">
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
        <div className="text-sm text-red-500 font-semibold bg-red-50 p-3 rounded-lg border border-red-100">
          {error}
        </div>
      )}

      <div className="flex gap-3 mt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 bg-white border border-neutral-200 text-neutral-900 py-3 rounded-xl text-sm font-bold hover:bg-neutral-50 transition-all shadow-sm"
          disabled={isProcessing}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || isProcessing}
          className="flex-1 bg-black text-white py-3 rounded-xl text-sm font-bold tracking-wide hover:bg-neutral-800 transition-all shadow-md flex justify-center items-center gap-2"
        >
          {isProcessing ? (
            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
          ) : (
            <CreditCard size={16} />
          )}
          {isProcessing ? "Processing..." : `Pay ${order.totalFormatted || 'Now'}`}
        </button>
      </div>
    </form>
  );
};

export function StripePaymentModal({ order, onClose, onSuccess }: { order: any, onClose: () => void, onSuccess: () => void }) {
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

  const finalTotal = itemsSubtotal + taxAmount + shippingAmount;

  const formattedSubtotal = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(itemsSubtotal);
  const formattedTax = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(taxAmount);
  const formattedShipping = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(shippingAmount);
  const formattedTotal = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(finalTotal);

  const orderWithTotal = { ...order, totalFormatted: formattedTotal };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 md:p-6 animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-[2.5rem] w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col md:flex-row max-h-[90vh] md:max-h-[800px]"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Left Column: Cart Review & Details */}
        <div className="flex-1 p-6 md:p-8 flex flex-col overflow-y-auto border-b md:border-b-0 md:border-r border-neutral-100 max-h-[45vh] md:max-h-none">
          <div className="flex items-center justify-between mb-6 shrink-0">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-neutral-100 rounded-full flex items-center justify-center text-neutral-800">
                 <ShoppingCart size={20} />
               </div>
               <div>
                 <h2 className="text-xl font-bold text-neutral-900">Review Your Order</h2>
                 <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Please confirm order details</p>
               </div>
             </div>
             <button 
               onClick={onClose}
               className="md:hidden text-neutral-400 hover:text-neutral-900 transition-colors p-2 hover:bg-neutral-100 rounded-full"
             >
               <X size={20} />
             </button>
          </div>

          {/* Items List */}
          <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1 mb-6 custom-scrollbar min-h-0">
            {regularItems.map((item: any, idx: number) => (
              <div key={idx} className="flex gap-4 items-center bg-neutral-50/50 p-3 rounded-2xl border border-neutral-100/50">
                {item.image ? (
                  <div className="w-14 h-14 shrink-0 bg-white rounded-xl border border-neutral-200/50 p-1 flex items-center justify-center">
                    <img src={item.image} alt={item.style} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                  </div>
                ) : (
                  <div className="w-14 h-14 shrink-0 bg-neutral-100 rounded-xl flex items-center justify-center text-neutral-350 border border-neutral-200/40">
                    <Package size={20} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-neutral-900 text-sm truncate">{item.style || 'Custom Garment'}</p>
                  <p className="text-xs text-neutral-550 font-semibold mt-0.5 uppercase tracking-wide">
                    {item.color ? `${item.color} • ` : ''}{item.qty} {item.qty === 1 ? 'Unit' : 'Units'}
                  </p>
                  {/* Sizes display */}
                  {item.sizes && Object.keys(item.sizes).length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {Object.entries(item.sizes).map(([size, q]: [string, any]) => {
                        if (!q) return null;
                        return (
                          <span key={size} className="text-[10px] font-bold bg-white border border-neutral-200 text-neutral-700 px-1.5 py-0.5 rounded uppercase leading-none">
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

          {/* Pricing Breakdown */}
          <div className="mt-auto pt-4 border-t border-neutral-100 shrink-0 flex flex-col gap-2.5">
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
                {taxAmount > 0 ? formattedTax : '$0.00'}
              </span>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-neutral-150 mt-1">
              <span className="text-sm font-serif italic text-neutral-500">Quoted Total</span>
              <span className="text-2xl font-serif text-neutral-900 tracking-tight">{formattedTotal}</span>
            </div>
          </div>
        </div>

        {/* Right Column: Stripe Checkout Form */}
        <div className="w-full md:w-[380px] p-6 md:p-8 bg-neutral-50/50 flex flex-col justify-between max-h-[55vh] md:max-h-none overflow-y-auto shrink-0 border-t md:border-t-0 border-neutral-100">
          <div className="flex flex-col h-full justify-between">
            <div>
              <div className="flex items-center justify-between mb-6 pb-2 border-b border-neutral-200/50">
                <div className="flex items-center gap-2">
                  <CreditCard size={18} className="text-[#635BFF]" />
                  <span className="text-sm font-bold text-neutral-800 uppercase tracking-wider">Payment Details</span>
                </div>
                <button 
                  onClick={onClose}
                  className="hidden md:block text-neutral-450 hover:text-neutral-900 transition-colors p-1.5 hover:bg-neutral-200/50 rounded-full"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-neutral-200/50 mb-6">
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Paying For</p>
                <p className="text-sm font-bold text-neutral-800 line-clamp-1">{order.title}</p>
                <p className="text-xs text-neutral-500 font-semibold mt-1 uppercase tracking-wider">Order #{order.portalId || order.id.substring(0,8)}</p>
              </div>

              <Elements stripe={stripePromise}>
                <CheckoutForm order={orderWithTotal} onSuccess={onSuccess} onCancel={onClose} />
              </Elements>
            </div>

            <div className="mt-8 pt-4 border-t border-neutral-200/40 flex items-center justify-between text-[9px] font-bold tracking-wider text-neutral-400 uppercase">
              <span>Powered by Stripe</span>
              <span>Secure 256-bit SSL</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
