import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const STATUS_STEPS = ['Placed', 'Shopping', 'Ordered', 'Processing', 'Shipped', 'Received'];

const MOCK_PORTAL_ORDERS = [
  {
    id: '#2212',
    title: 'Polos, Jackets, Acess...',
    date: '3/29/26',
    statusIndex: 2, // Ordered
    logo: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200&h=200&fit=crop',
    items: [
      {
        id: 1,
        gender: 'Mens',
        style: 'Pique Polo',
        image: 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=150&h=150&fit=crop',
        itemNum: 'PB26-1015',
        color: 'White/Navy',
        logos: ['Left Chest', 'Nape', 'Right Collar'],
        sizes: { OSFA: 0, XS: 0, S: 20, M: 50, L: 75, XL: 45, '2XL': 25, '3XL': 15 },
        qty: 230,
        price: '$74.99',
        total: '$17,247.70'
      },
      {
        id: 2,
        gender: 'Womens',
        style: 'Long Sleeve 1/4 Zip Polo',
        image: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=150&h=150&fit=crop',
        itemNum: 'PB26-1015',
        color: 'Baby Blue',
        logos: ['Left Chest', 'Left Sleeve'],
        sizes: { OSFA: 0, XS: 20, S: 40, M: 75, L: 50, XL: 35, '2XL': 15, '3XL': 0 },
        qty: 235,
        price: '$80.00',
        total: '$18,800.00'
      },
      {
        id: 3,
        gender: 'Accessories',
        style: 'Leather Bag',
        image: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=150&h=150&fit=crop',
        itemNum: 'PB26-1027',
        color: 'Navy Leather',
        logos: ['Left Chest'],
        sizes: { OSFA: 500, XS: 0, S: 0, M: 0, L: 0, XL: 0, '2XL': 0, '3XL': 0 },
        qty: 500,
        price: '$120.00',
        total: '$60,000.00'
      }
    ]
  },
  {
    id: '#2213',
    title: 'Hats, Leggings',
    date: '3/30/26',
    statusIndex: 4, // Shipped
    logo: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200&h=200&fit=crop',
    items: []
  },
  {
    id: '#2214',
    title: 'Graphic T-Shirts',
    date: '4/01/26',
    statusIndex: 1, // Shopping
    logo: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200&h=200&fit=crop',
    items: []
  },
  {
    id: '#2215',
    title: 'Winter Gear',
    date: '4/02/26',
    statusIndex: 4, // Shipped
    logo: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200&h=200&fit=crop',
    items: []
  }
];

// Helper component for the little gray pills in the items breakdown
const DataPill = ({ label, value }: { label: string, value: string }) => (
  <div className="flex flex-col items-center justify-center bg-gray-100 px-4 py-1.5 rounded-3xl min-w-[100px]">
    <span className="text-[10px] text-gray-500 font-semibold mb-0.5">{label}:</span>
    <span className="text-xs text-gray-800 font-medium leading-none">{value}</span>
  </div>
);

export function PortalOrders() {
  const [expandedId, setExpandedId] = useState<string | null>('#2212');

  return (
    <div className="max-w-[1600px] mx-auto flex flex-col gap-6">
      
      {MOCK_PORTAL_ORDERS.map((order) => {
        const isExpanded = expandedId === order.id;
        // Calculate the percentage width for the progress bar fill
        const fillWidth = `${(order.statusIndex / (STATUS_STEPS.length - 1)) * 100}%`;

        return (
          <div key={order.id} className="flex gap-6 w-full items-start">
            
            {/* Main Gray Capsule */}
            <div className={`flex-1 bg-[#efeff1] rounded-[2.5rem] p-6 lg:px-10 transition-all ${isExpanded ? 'pb-8' : ''}`}>
              
              {/* Capsule Header Row */}
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8 h-[80px]">
                
                {/* Left: Logo & Title */}
                <div className="flex items-center gap-6 min-w-[250px]">
                  <div className="w-20 h-20 rounded-full border-2 border-gray-300 overflow-hidden shrink-0 bg-white">
                    <img src={order.logo} alt="Customer Logo" className="w-full h-full object-cover shrink-0 filter grayscale contrast-125 mix-blend-multiply opacity-80" />
                  </div>
                  <div>
                    <div 
                      className="flex items-center gap-3 cursor-pointer group"
                      onClick={() => setExpandedId(isExpanded ? null : order.id)}
                    >
                      <h2 className="text-2xl font-serif text-gray-900">Order {order.id}</h2>
                      <span className="text-gray-400 group-hover:text-black transition-colors">
                        {isExpanded ? <ChevronDown size={20} strokeWidth={2.5} /> : <ChevronRight size={20} strokeWidth={2.5} />}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-gray-500 mt-1 uppercase tracking-wider">{order.title}</p>
                  </div>
                </div>

                {/* Right: Progress Tracker */}
                <div className="flex-1 max-w-[800px] mx-auto w-full pt-4 xl:pt-0">
                  <div className="relative w-full">
                    {/* The Track Base */}
                    <div className="absolute top-[8px] left-0 w-full h-[12px] bg-gray-300 rounded-full"></div>
                    {/* The Fill */}
                    <div className="absolute top-[8px] left-0 h-[12px] bg-gray-500 rounded-full transition-all duration-700 ease-in-out" style={{ width: fillWidth }}></div>
                    
                    {/* Steps */}
                    <div className="relative flex justify-between items-center z-10 px-1">
                      {STATUS_STEPS.map((step, idx) => {
                        const isCompleted = idx <= order.statusIndex;
                        const isLastStep = idx === STATUS_STEPS.length - 1;
                        return (
                          <div key={step} className="flex flex-col items-center relative">
                            {/* The Step Dot */}
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors duration-300 ${isCompleted ? 'bg-black' : 'bg-[#efeff1] border-[4px] border-gray-300'}`}>
                            </div>
                            {/* Step Label below */}
                            <span className="absolute top-10 text-[11px] font-bold text-gray-600 w-24 text-center tracking-wide">{step}</span>
                            
                            {/* Completion Date (Floating over the last item naturally if complete, or mock placing it over received for layout) */}
                            {isLastStep && (
                               <span className="absolute -top-7 text-[12px] font-bold text-gray-900 w-24 text-center">{order.date}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                
                {/* Visual Spacer to maintain alignment if needed on desktop */}
                <div className="hidden xl:block w-[50px]"></div>
              </div>

              {/* Expanded Items Section */}
              {isExpanded && order.items.length > 0 && (
                <div className="mt-14 space-y-4">
                  {order.items.map((item) => (
                    <div key={item.id} className="bg-white rounded-3xl p-4 px-6 flex flex-wrap items-center justify-between gap-6 shadow-[0_4px_12px_rgb(0,0,0,0.02)]">
                      
                      {/* Product Visual */}
                      <div className="flex items-center gap-6 min-w-[200px]">
                        <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-black/5 bg-gray-50">
                          <img src={item.image} alt={item.style} className="w-full h-full object-cover mix-blend-multiply p-1" />
                        </div>
                        <div>
                           <h4 className="font-bold text-gray-900 text-[15px]">{item.gender}</h4>
                           <p className="text-xs font-semibold text-gray-500 mt-1">{item.style}</p>
                        </div>
                      </div>

                      {/* Specs */}
                      <div className="flex flex-wrap gap-2">
                         <DataPill label="Item #" value={item.itemNum} />
                         <DataPill label="Garment Color" value={item.color} />
                         {item.logos.map((logo, i) => (
                           <DataPill key={i} label={`Logo ${i+1}`} value={logo} />
                         ))}
                      </div>

                      {/* Sizing Grid Area */}
                      <div className="flex items-stretch gap-[2px] bg-[#eaeaec] p-[3px] rounded-xl font-sans">
                        {Object.entries(item.sizes).map(([size, qty]) => (
                          <div key={size} className="w-10 text-center flex flex-col">
                            <div className="bg-[#d5d5d8] text-gray-600 text-[10px] font-bold py-1.5 rounded-t-[8px] uppercase tracking-wide h-6 flex items-center justify-center">{size}</div>
                            <div className={`text-[12px] font-bold py-2 rounded-b-[8px] h-8 flex items-center justify-center bg-white ${qty > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                              {qty}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Pricing Summary */}
                      <div className="flex items-stretch gap-[2px] bg-[#eaeaec] p-[3px] rounded-xl font-sans ml-auto shrink-0">
                        <div className="w-12 text-center flex flex-col">
                          <div className="bg-[#d5d5d8] text-gray-600 text-[10px] font-bold py-1.5 rounded-t-[8px] uppercase tracking-wide h-6 flex items-center justify-center">QTY</div>
                          <div className="bg-[#f4f4f5] text-gray-900 text-[12px] font-bold py-2 rounded-b-[8px] h-8 flex items-center justify-center">{item.qty}</div>
                        </div>
                        <div className="w-16 text-center flex flex-col">
                          <div className="bg-[#d5d5d8] text-gray-600 text-[10px] font-bold py-1.5 rounded-t-[8px] uppercase tracking-wide h-6 flex items-center justify-center">Price</div>
                          <div className="bg-[#f4f4f5] text-gray-900 text-[12px] font-bold py-2 rounded-b-[8px] h-8 flex items-center justify-center">{item.price}</div>
                        </div>
                        <div className="w-20 text-center flex flex-col">
                          <div className="bg-[#d5d5d8] text-gray-600 text-[10px] font-bold py-1.5 rounded-t-[8px] uppercase tracking-wide h-6 flex items-center justify-center">Total</div>
                          <div className="bg-[#f4f4f5] text-gray-900 text-[12px] font-bold py-2 rounded-b-[8px] h-8 flex items-center justify-center">{item.total}</div>
                        </div>
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Action Side Buttons */}
            <div className="w-[140px] shrink-0 flex flex-col justify-center gap-3 h-[128px]">
               <button className="w-full bg-[#f0f0f0] hover:bg-[#e4e4e4] text-[13px] font-bold text-gray-800 rounded-full py-4 transition-all tracking-wide">
                 Tracking
               </button>
               <button className="w-full bg-[#f0f0f0] hover:bg-[#e4e4e4] text-[13px] font-bold text-gray-800 rounded-full py-4 transition-all tracking-wide">
                 Order Info
               </button>
            </div>
            
          </div>
        );
      })}

    </div>
  );
}
