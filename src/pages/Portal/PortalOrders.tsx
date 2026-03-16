import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Loader2, PackageOpen, Building2 } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { useOrders } from '../../hooks/useOrders';
import { MOCK_CUSTOMERS_DB } from '../../lib/mockData';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'OSFA'];

const sortSizes = (a: string, b: string) => {
  const iA = SIZE_ORDER.indexOf(a.toUpperCase());
  const iB = SIZE_ORDER.indexOf(b.toUpperCase());
  if (iA === -1 && iB === -1) return a.localeCompare(b);
  if (iA === -1) return 1;
  if (iB === -1) return -1;
  return iA - iB;
};

const STATUS_STEPS = ['Placed', 'Shopping', 'Ordered', 'Processing', 'Shipped', 'Received'];

// Helper component for the little gray pills in the items breakdown
const DataPill = ({ label, value }: { label: string, value: string }) => (
  <div className="flex flex-col items-center justify-center bg-neutral-100 px-3 py-1.5 rounded-2xl min-w-[84px] max-w-[140px]">
    <span className="text-[10px] text-neutral-500 font-semibold mb-0.5 truncate w-full text-center">{label}:</span>
    <span className="text-xs text-neutral-800 font-semibold leading-none truncate w-full text-center">{value}</span>
  </div>
);

export function PortalOrders({ overrideCustomerId, hideHeader = false }: { overrideCustomerId?: string, hideHeader?: boolean }) {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const currentCustomerId = overrideCustomerId || customerId || 'CUS-001';
  
  // If no customerId is in the URL, fallback to Wayne Enterprises 'CUS-001' to demo it!
  const { orders, loading } = useOrders(currentCustomerId);
  const mockCustomer = MOCK_CUSTOMERS_DB[currentCustomerId];

  const [liveLogo, setLiveLogo] = useState<string | null>(null);

  useEffect(() => {
    const fetchCustomer = async () => {
      try {
        const d = await getDoc(doc(db, 'customers', currentCustomerId));
        if (d.exists() && d.data().logo) {
          setLiveLogo(d.data().logo);
        }
      } catch (err) {}
    };
    fetchCustomer();
  }, [currentCustomerId]);

  const customer = { ...mockCustomer, logo: liveLogo || mockCustomer?.logo };

  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-gray-400 gap-3">
        <Loader2 className="animate-spin" size={32} />
        <p className="font-semibold uppercase tracking-widest text-xs">Loading Live Pipeline...</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="max-w-[800px] mx-auto mt-24 flex flex-col items-center justify-center text-center gap-6">
        <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 border border-gray-100">
          <PackageOpen strokeWidth={1.5} size={40} />
        </div>
        <div>
          <h2 className="text-3xl font-serif text-gray-900 mb-2">No active orders yet.</h2>
          <p className="text-gray-500 font-medium max-w-sm mx-auto leading-relaxed">
            You don't currently have any orders in the pipeline. Once a new order is placed or quoted, you'll be able to track its progress here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`max-w-[1600px] mx-auto flex flex-col gap-6 ${hideHeader ? 'mt-0' : 'mt-8'}`}>
      {orders.map((order: any) => {
        const isExpanded = expandedId === order.id;
        // Calculate the percentage width for the progress bar fill
        const fillWidth = `${(order.statusIndex / (STATUS_STEPS.length - 1)) * 100}%`;

        return (
          <div key={order.id} className="flex gap-6 w-full items-start">
            
            {/* Main Gray Capsule */}
            <div 
              onClick={() => {
                if (overrideCustomerId) {
                  navigate(`/orders/${order.id}`);
                }
              }}
              className={`flex-1 bg-[#f0f0f0] rounded-[2.5rem] p-6 lg:px-10 transition-all ${overrideCustomerId ? 'cursor-pointer hover:bg-[#e4e4e4]' : ''} ${isExpanded ? 'pb-8' : ''}`}
            >
              
              {/* Capsule Header Row */}
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8 h-[80px]">
                
                {/* Left: Logo & Title */}
                <div className="flex items-center gap-6 w-[320px] shrink-0">
                  <div className={`w-20 h-20 rounded-full border-2 border-neutral-200 overflow-hidden shrink-0 flex items-center justify-center text-neutral-300 ${customer?.logo ? 'bg-white' : 'bg-neutral-50'}`}>
                    {customer?.logo ? (
                      <img src={customer.logo} alt="Customer Logo" className="w-full h-full object-cover shrink-0 filter grayscale contrast-125 mix-blend-multiply opacity-80" />
                    ) : (
                      <Building2 size={32} strokeWidth={1.5} />
                    )}
                  </div>
                  <div>
                    <div 
                      className="flex items-center gap-3 cursor-pointer group z-20 relative"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (overrideCustomerId) {
                          navigate(`/orders/${order.id}`);
                        } else {
                          setExpandedId(isExpanded ? null : order.id);
                        }
                      }}
                    >
                      <h2 className="text-2xl font-serif text-gray-900 hover:text-brand-primary transition-colors">Order {order.portalId}</h2>
                      {!overrideCustomerId && (
                        <span className="text-gray-400 group-hover:text-black transition-colors">
                          {isExpanded ? <ChevronDown size={20} strokeWidth={2.5} /> : <ChevronRight size={20} strokeWidth={2.5} />}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-gray-500 mt-1 uppercase tracking-wider">{order.title}</p>
                  </div>
                </div>

                {/* Right: Progress Tracker */}
                <div className="flex-1 w-full pt-4 xl:pt-0">
                  <div className="relative w-full">
                    {/* The Track Base */}
                    <div className="absolute top-0 left-0 w-full h-[12px] bg-neutral-200 rounded-full"></div>
                    {/* The Fill */}
                    <div className="absolute top-0 left-0 h-[12px] bg-neutral-800 rounded-full transition-all duration-700 ease-in-out" style={{ width: fillWidth }}></div>
                    
                    {/* Steps */}
                    <div className="relative flex justify-between items-center z-10 px-0">
                      {STATUS_STEPS.map((step, idx) => {
                        const isCompleted = idx <= order.statusIndex;
                        const isLastStep = idx === STATUS_STEPS.length - 1;
                        return (
                          <div key={step} className="flex flex-col items-center relative">
                            {/* The Step Dot */}
                            <div className={`w-[12px] h-[12px] rounded-full flex items-center justify-center transition-colors duration-300 ${isCompleted ? 'bg-black' : 'bg-[#f0f0f0] border-[2px] border-neutral-300'}`}>
                            </div>
                            {/* Step Label below */}
                            <span className="absolute top-6 text-[11px] font-bold text-neutral-500 w-24 text-center tracking-wide">{step}</span>
                            
                            {/* Completion Date (Floating over the last item naturally if complete, or mock placing it over received for layout) */}
                            {isLastStep && (
                               <span className="absolute -top-7 text-[12px] font-bold text-neutral-900 w-24 text-center">{order.date}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded Items Section */}
              {isExpanded && order.items.length > 0 && (
                <div className="mt-14 space-y-4">
                  {order.items?.map((item: any) => (
                    <div key={item.id} className="bg-white rounded-3xl p-4 px-6 flex flex-col xl:flex-row xl:items-center justify-between gap-6 shadow-[0_4px_12px_rgb(0,0,0,0.02)]">
                      
                      {/* Left Side: Visual & Specs */}
                      <div className={`flex flex-col lg:flex-row lg:items-center gap-4 flex-1 min-w-0 ${hideHeader ? 'pr-2' : ''}`}>
                        {/* Product Visual */}
                        <div className="flex items-center gap-4 w-[160px] shrink-0">
                          <div className={`w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-black/5 bg-gray-50 ${hideHeader ? 'flex items-center justify-center' : ''}`}>
                            <img src={item.image} alt={item.style} className="w-full h-full object-cover mix-blend-multiply p-1" />
                          </div>
                          <div>
                             <h4 className="font-bold text-gray-900 text-[15px]">{item.gender || 'Unisex'}</h4>
                             <p className="text-xs font-semibold text-gray-500 mt-1">{item.style}</p>
                          </div>
                        </div>

                        {/* Specs */}
                        <div className="flex flex-wrap gap-2 flex-1">
                           {item.itemNum && <DataPill label="Item #" value={item.itemNum} />}
                           {item.color && <DataPill label="Garment Color" value={item.color} />}
                           {item.logos?.map((logo: string, i: number) => (
                             <DataPill key={i} label={`Logo ${i+1}`} value={logo} />
                           ))}
                        </div>
                      </div>

                      {/* Right Side: Sizing & Pricing */}
                      <div className="flex flex-wrap lg:flex-nowrap items-end lg:items-center gap-4 shrink-0">
                        {/* Sizing Grid Area */}
                        <div className="flex items-stretch gap-[2px] bg-neutral-200 p-[3px] rounded-xl font-sans">
                          {item.sizes && Object.entries(item.sizes).sort(([a], [b]) => sortSizes(a, b)).map(([size, qty]: [string, any]) => (
                            <div key={size} className="w-10 text-center flex flex-col">
                              <div className="bg-neutral-300 text-neutral-600 text-[10px] font-bold py-1.5 rounded-t-[8px] uppercase tracking-wide h-6 flex items-center justify-center">{size}</div>
                              <div className={`text-[12px] font-bold py-2 rounded-b-[8px] h-8 flex items-center justify-center bg-white ${qty > 0 ? 'text-neutral-800' : 'text-neutral-400'}`}>
                                {qty}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Pricing Summary */}
                        <div className="flex items-stretch gap-[2px] bg-neutral-200 p-[3px] rounded-xl font-sans shrink-0">
                          <div className="w-12 text-center flex flex-col">
                            <div className="bg-neutral-300 text-neutral-600 text-[10px] font-bold py-1.5 rounded-t-[8px] uppercase tracking-wide h-6 flex items-center justify-center">QTY</div>
                            <div className="bg-neutral-50 text-neutral-800 text-[12px] font-bold py-2 rounded-b-[8px] h-8 flex items-center justify-center">{item.qty}</div>
                          </div>
                          <div className="w-16 text-center flex flex-col">
                            <div className="bg-neutral-300 text-neutral-600 text-[10px] font-bold py-1.5 rounded-t-[8px] uppercase tracking-wide h-6 flex items-center justify-center">Price</div>
                            <div className="bg-neutral-50 text-neutral-800 text-[12px] font-bold py-2 rounded-b-[8px] h-8 flex items-center justify-center">{item.price}</div>
                          </div>
                          <div className="w-20 text-center flex flex-col">
                            <div className="bg-neutral-300 text-neutral-600 text-[10px] font-bold py-1.5 rounded-t-[8px] uppercase tracking-wide h-6 flex items-center justify-center">Total</div>
                            <div className="bg-neutral-50 text-neutral-800 text-[12px] font-bold py-2 rounded-b-[8px] h-8 flex items-center justify-center">{item.total}</div>
                          </div>
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
               <button 
                 className="w-full bg-[#f0f0f0] hover:bg-[#e4e4e4] text-[13px] font-bold text-gray-800 rounded-full py-4 transition-all tracking-wide z-20"
                 onClick={() => {
                   if (overrideCustomerId) navigate(`/orders/${order.id}`);
                 }}
               >
                 Order Info
               </button>
            </div>
            
          </div>
        );
      })}

    </div>
  );
}
