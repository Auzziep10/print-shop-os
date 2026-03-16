import { ArrowLeft, PackagePlus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

export function PortalCreateOrder() {
  const navigate = useNavigate();
  const { customerId } = useParams();

  const handleBack = () => {
    navigate(customerId ? `/portal/${customerId}` : '/portal');
  };

  return (
    <div className="max-w-[1200px] mx-auto w-full flex flex-col gap-8 animate-in fade-in zoom-in-95 duration-300">
      {/* Header Area */}
      <div className="flex items-center justify-between mt-4">
        <button 
          onClick={handleBack}
          className="flex items-center gap-2 text-neutral-500 hover:text-black transition-colors font-medium text-sm group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          Back to Orders
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-serif text-neutral-900 tracking-tight flex items-center gap-4">
          Create New Order
        </h1>
        <p className="text-neutral-500 font-medium text-sm max-w-xl leading-relaxed">
          Use the builder below to select garments, upload artwork, and construct your order. We'll provide real-time pricing and mockups as you go.
        </p>
      </div>

      {/* Builder Layout - Starting simple */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-4">
        
        {/* Left Column: Form / Steps */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="bg-white rounded-3xl p-8 shadow-[0_4px_24px_rgb(0,0,0,0.02)] border border-neutral-100 flex flex-col items-center justify-center min-h-[400px] text-center gap-4">
            <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center text-neutral-400">
              <PackagePlus size={28} strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-neutral-900 mb-1">Let's start building</h3>
              <p className="text-neutral-500 text-sm max-w-xs mx-auto">
                Select your first garment style to begin assembling your custom order.
              </p>
            </div>
            
            <button className="mt-4 bg-black text-white px-8 py-3.5 rounded-full text-[13px] font-bold tracking-wide hover:bg-neutral-800 hover:scale-[1.02] transition-all shadow-md">
              + Add Garment
            </button>
          </div>
        </div>

        {/* Right Column: Order Summary (Sticky) */}
        <div className="lg:col-span-1">
          <div className="sticky top-8 bg-neutral-50 rounded-3xl p-6 border border-neutral-200/60 min-h-[400px] flex flex-col">
            <h3 className="font-serif text-xl text-neutral-900 border-b border-neutral-200 pb-4 mb-4">
              Order Summary
            </h3>
            
            <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 gap-3">
              <p className="text-sm font-medium text-center">Your order is currently empty.</p>
            </div>

            <div className="mt-auto border-t border-neutral-200 pt-4 space-y-3">
              <div className="flex justify-between items-center text-sm font-bold text-neutral-500">
                <span>Total Items</span>
                <span>0</span>
              </div>
              <div className="flex justify-between items-center text-lg font-black text-neutral-900">
                <span>Estimated Total</span>
                <span>$0.00</span>
              </div>
              
              <button disabled className="w-full mt-4 bg-neutral-200 text-neutral-400 py-3.5 rounded-xl text-sm font-bold transition-all">
                Submit Order
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
