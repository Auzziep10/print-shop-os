import { useState } from 'react';
import { ArrowLeft, PackagePlus, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

const MOCK_DECK = {
  name: "Summer 2026 Collection",
  items: [
    { id: "g1", style: "Pique Polo", gender: "Mens", itemNum: "PB26-1015", colors: ["White/Navy", "Pine Green"], image: "https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200" },
    { id: "g2", style: "Long Sleeve 1/4 Zip", gender: "Womens", itemNum: "PB26-1016", colors: ["Baby Blue", "Navy"], image: "https://images.unsplash.com/photo-1572889816658-54cdd93a0bcf?auto=format&fit=crop&q=80&w=200&h=200" },
    { id: "g3", style: "Leather Duffle Bag", gender: "Accessories", itemNum: "PB26-1027", colors: ["Navy Leather", "Black Leather"], image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&q=80&w=200&h=200" }
  ]
};

export function PortalCreateOrder() {
  const navigate = useNavigate();
  const { customerId } = useParams();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

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
            
            <button 
              onClick={() => setIsDrawerOpen(true)}
              className="mt-4 bg-black text-white px-8 py-3.5 rounded-full text-[13px] font-bold tracking-wide hover:bg-neutral-800 hover:scale-[1.02] transition-all shadow-md"
            >
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

      {/* Slide-out Catalog Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-[500px] h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="px-8 py-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
              <div>
                <h2 className="text-xl font-serif text-neutral-900">Your Catalog</h2>
                <p className="text-sm font-medium text-neutral-500 mt-1">Select from your approved styles.</p>
              </div>
              <button 
                onClick={() => setIsDrawerOpen(false)}
                className="w-10 h-10 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-500 hover:text-black hover:border-black transition-colors shadow-sm"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6">
              <div className="bg-[#f0ebe1] rounded-2xl p-6 border border-[#e6e2db] flex flex-col justify-center items-center text-center">
                 <h3 className="font-bold text-neutral-900 tracking-tight text-lg">{MOCK_DECK.name}</h3>
                 <p className="text-xs text-[#6b665c] font-bold mt-1 uppercase tracking-widest">Active Deck</p>
              </div>

              <div className="flex flex-col gap-4 mt-2">
                {MOCK_DECK.items.map(item => (
                  <div key={item.id} className="group flex items-center gap-5 bg-white border border-neutral-200 hover:border-black transition-colors rounded-2xl p-4 cursor-pointer shadow-[0_2px_10px_rgb(0,0,0,0.02)] hover:shadow-md">
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-neutral-50 border border-neutral-100 shrink-0">
                      <img src={item.image} alt={item.style} className="w-full h-full object-cover mix-blend-multiply" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                         <h4 className="font-bold text-neutral-900 text-[15px] truncate pr-2">{item.style}</h4>
                         <span className="text-[10px] font-bold text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded-full shrink-0">{item.gender}</span>
                      </div>
                      <p className="text-xs font-semibold text-neutral-500">{item.itemNum}</p>
                      <p className="text-xs text-neutral-400 font-medium mt-1 truncate">{item.colors.join(' • ')}</p>
                    </div>
                    <button className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-500 group-hover:bg-black group-hover:text-white flex items-center justify-center transition-colors shrink-0">
                       <PackagePlus size={16} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
