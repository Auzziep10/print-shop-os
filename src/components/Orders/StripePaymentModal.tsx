import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { X, CreditCard } from 'lucide-react';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../../lib/firebase';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || 'pk_test_TYooMQauvdEDq54NiTphI7jx');

const CheckoutForm = ({ order, onSuccess, onCancel }: { order: any, onSuccess: () => void, onCancel: () => void }) => {
  const stripe = useStripe();
  const elements = useElements();
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
        body: JSON.stringify({ amount, orderId: order.id, currency: 'usd' })
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
        <label className="text-sm font-bold text-neutral-900 mb-3 block">Card Information</label>
        <div className="bg-white p-3 rounded-lg border border-neutral-300 shadow-sm">
          <CardElement options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
              invalid: {
                color: '#9e2146',
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

      <div className="flex gap-3 mt-4">
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
            <CreditCard size={18} />
          )}
          {isProcessing ? "Processing..." : `Pay ${order.totalFormatted || 'Now'}`}
        </button>
      </div>
    </form>
  );
};

export function StripePaymentModal({ order, onClose, onSuccess }: { order: any, onClose: () => void, onSuccess: () => void }) {
  // Calculate total if not available
  const totalPriceRaw = order.items?.reduce((acc: number, i: any) => {
    const priceMatch = (i.total || '$0').toString().replace(/[^0-9.]/g, '');
    return acc + (parseFloat(priceMatch) || 0);
  }, 0) || 0;
  
  const totalFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalPriceRaw);
  const orderWithTotal = { ...order, totalFormatted: totalPriceRaw > 0 ? totalFormatted : '' };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-neutral-100">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-[#635BFF]/10 rounded-full flex items-center justify-center text-[#635BFF]">
               <CreditCard size={20} />
             </div>
             <div>
               <h2 className="text-xl font-bold text-neutral-900">Secure Checkout</h2>
               <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest">Powered by Stripe</p>
             </div>
          </div>
          <button 
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-900 transition-colors p-2 hover:bg-neutral-100 rounded-full"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 bg-neutral-50/50">
          <div className="flex justify-between items-center mb-6 pb-6 border-b border-neutral-200/60">
            <div>
               <p className="text-sm font-semibold text-neutral-500 mb-1">Payment for</p>
               <p className="text-base font-bold text-neutral-900 line-clamp-1">{order.title}</p>
            </div>
            <div className="text-right">
               <p className="text-sm font-semibold text-neutral-500 mb-1">Amount</p>
               <p className="text-xl font-bold text-neutral-900">{totalFormatted}</p>
            </div>
          </div>

          <Elements stripe={stripePromise}>
            <CheckoutForm order={orderWithTotal} onSuccess={onSuccess} onCancel={onClose} />
          </Elements>
        </div>
      </div>
    </div>
  );
}
