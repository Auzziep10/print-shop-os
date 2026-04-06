import { useState } from 'react';
import { ArrowLeft, ChevronDown, Upload, Plus, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

export function PortalRequestQuote() {
  const navigate = useNavigate();
  const { customerId } = useParams();
  
  const [products, setProducts] = useState([
    { id: 1 }
  ]);

  const handleBack = () => {
    navigate(customerId ? `/portal/${customerId}` : '/portal');
  };

  const handleAddProduct = () => {
    setProducts(prev => [...prev, { id: Date.now() }]);
  };

  const handleRemoveProduct = (id: number) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className="max-w-[1200px] mx-auto w-full flex flex-col gap-8 animate-in fade-in zoom-in-95 duration-300 pb-20">
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
          Request New Quote
        </h1>
        <p className="text-neutral-500 font-medium text-sm max-w-xl leading-relaxed">
          Submit your project details for pricing
        </p>
      </div>

      <div className="flex flex-col gap-8 mt-4">
        
        {/* Contact Information */}
        <div className="bg-white rounded-3xl p-8 shadow-[0_4px_24px_rgb(0,0,0,0.02)] border border-neutral-100 flex flex-col gap-6 relative">
            <div className="flex flex-col gap-1 mb-2">
                <h2 className="text-xl font-bold text-neutral-900">Contact Information</h2>
                <p className="text-sm text-neutral-500">Provide your contact details so we can reach you about your quote</p>
            </div>
            
            <div className="grid grid-cols-1 gap-6">
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-neutral-900">Contact Name</label>
                    <input type="text" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all" />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-neutral-900">Email Address</label>
                    <input type="email" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all" />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-neutral-900">Phone Number (Optional)</label>
                    <input type="tel" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all" />
                </div>
            </div>
        </div>

        {/* Project ID */}
        <div className="bg-white rounded-3xl p-8 shadow-[0_4px_24px_rgb(0,0,0,0.02)] border border-neutral-100 flex flex-col gap-6 relative">
            <div className="flex flex-col gap-1 mb-2">
                <h2 className="text-xl font-bold text-neutral-900">Project ID</h2>
                <p className="text-sm text-neutral-500">Project details and ordering information</p>
            </div>

            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-neutral-900">Ordering on Behalf Of (Optional)</label>
                    <p className="text-xs text-neutral-500">Fill this out if you're placing this order for someone else in your department</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-neutral-700">Department/Team</label>
                            <input type="text" placeholder="e.g., Marketing, Sales, HR" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all" />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-neutral-700">Contact Person</label>
                            <input type="text" placeholder="Person you're ordering for" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all" />
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-4">
                    <label className="text-sm font-bold text-neutral-900 border-t border-neutral-100 pt-6">Shipping Address (Optional)</label>
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-neutral-700">Address Line 1</label>
                        <input type="text" placeholder="Street address" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-neutral-700">Address Line 2 (Optional)</label>
                        <input type="text" placeholder="Apt, suite, unit, etc." className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all" />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-neutral-700">City</label>
                            <input type="text" placeholder="City" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all" />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-neutral-700">State/Province</label>
                            <input type="text" placeholder="State or Province" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all" />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-neutral-700">ZIP/Postal Code</label>
                            <input type="text" placeholder="ZIP or Postal Code" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all" />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-neutral-700">Country</label>
                            <input type="text" placeholder="Country" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all" />
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-2 border-t border-neutral-100 pt-6">
                    <label className="text-sm font-bold text-neutral-900">In-Hands Date</label>
                    <input type="date" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 transition-all" />
                </div>

                <div className="flex flex-col gap-2 border-t border-neutral-100 pt-6">
                    <label className="text-sm font-bold text-neutral-900">Additional Notes (Optional)</label>
                    <textarea 
                        rows={4}
                        placeholder="Any special requirements, color preferences, or additional details..." 
                        className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all resize-none" 
                    />
                </div>
            </div>
        </div>

        {/* Products */}
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-bold text-neutral-900">Products</h2>
                    <p className="text-sm text-neutral-500">Add one or more products to your quote</p>
                </div>
                <button 
                  onClick={handleAddProduct}
                  className="bg-white border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 text-neutral-900 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm"
                >
                  <Plus size={16} /> Add Another Product
                </button>
            </div>

            {products.map((product, index) => (
                <div key={product.id} className="bg-white rounded-3xl p-8 shadow-[0_4px_24px_rgb(0,0,0,0.02)] border border-neutral-100 flex flex-col gap-6 relative animate-in slide-in-from-bottom-4 fade-in duration-300">
                    <div className="flex items-center justify-between">
                        <h3 className="text-md font-bold text-neutral-900">Product {index + 1}</h3>
                        {products.length > 1 && (
                            <button onClick={() => handleRemoveProduct(product.id)} className="text-neutral-400 hover:text-red-500 transition-colors p-2">
                                <Trash2 size={18} />
                            </button>
                        )}
                    </div>

                    <div className="flex flex-col gap-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-bold text-neutral-900">Product Type</label>
                            <div className="relative">
                                <select className="w-full appearance-none bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 cursor-pointer">
                                    <option value="">Select product type</option>
                                    <option value="tshirt">T-Shirt</option>
                                    <option value="hoodie">Hoodie</option>
                                    <option value="longsleeve">Long Sleeve</option>
                                    <option value="hat">Hat</option>
                                    <option value="other">Other</option>
                                </select>
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" size={16} />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-bold text-neutral-900">Garment Color</label>
                            <div className="relative">
                                <select className="w-full appearance-none bg-white border border-neutral-200 rounded-xl pl-12 pr-4 py-3 text-sm text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 cursor-pointer">
                                    <option value="white">White</option>
                                    <option value="black">Black</option>
                                    <option value="navy">Navy</option>
                                    <option value="heather">Heather Grey</option>
                                    <option value="custom">Custom Color</option>
                                </select>
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 rounded bg-white border border-neutral-200 pointer-events-none" />
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" size={16} />
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-0.5">
                                <label className="text-sm font-bold text-neutral-900">Quantities by Size</label>
                                <span className="text-xs text-neutral-500">Enter the number needed for each size</span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'].map((size) => (
                                    <div key={size} className="flex flex-col gap-2">
                                        <label className="text-xs font-bold text-neutral-700">{size}</label>
                                        <input type="number" min="0" placeholder="0" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all" />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 border-t border-neutral-100 pt-6">
                            <div className="flex flex-col gap-0.5">
                                <label className="text-sm font-bold text-neutral-900">Design Placements</label>
                                <span className="text-xs text-neutral-500">Specify where designs should be placed</span>
                            </div>
                            <div className="grid grid-cols-1 gap-3">
                                {['Front', 'Back', 'Left Chest', 'Right Chest', 'Left Sleeve', 'Right Sleeve'].map((placement) => (
                                    <label key={placement} className="flex items-center gap-3 p-4 border border-neutral-200 rounded-xl cursor-pointer hover:bg-neutral-50 transition-colors">
                                        <input type="checkbox" className="w-4 h-4 rounded border-neutral-300 text-black focus:ring-black" />
                                        <span className="text-sm font-bold text-neutral-900">{placement}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 border-t border-neutral-100 pt-6">
                            <div className="flex flex-col gap-0.5">
                                <label className="text-sm font-bold text-neutral-900">Artwork Files for This Product</label>
                                <span className="text-xs text-neutral-500">Upload design files specific to this product</span>
                            </div>
                            <label className="text-xs font-bold text-neutral-900 mt-2">Artwork File</label>
                            <div className="border-2 border-dashed border-neutral-200 rounded-2xl p-10 flex flex-col items-center justify-center text-center gap-3 hover:bg-neutral-50 hover:border-neutral-300 transition-all cursor-pointer group">
                                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                    <Upload size={20} className="text-neutral-500" strokeWidth={2} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-neutral-900">Upload artwork file</p>
                                    <p className="text-xs text-neutral-500 mt-1">Drag and drop your file here, or click to browse</p>
                                    <p className="text-xs text-neutral-400 mt-1">Supports: JPEG, PNG, GIF, WebP, PDF, Adobe Illustrator (.ai) (Max 10MB)</p>
                                </div>
                                <button className="mt-2 bg-white border border-neutral-200 hover:bg-neutral-50 px-6 py-2 rounded-xl text-sm font-bold text-neutral-900 shadow-sm transition-all flex items-center gap-2">
                                    <Upload size={14} /> Choose File
                                </button>
                            </div>
                        </div>

                    </div>
                </div>
            ))}
        </div>

        {/* Budget Information */}
        <div className="bg-white rounded-3xl p-8 shadow-[0_4px_24px_rgb(0,0,0,0.02)] border border-neutral-100 flex flex-col gap-6 relative">
            <div className="flex flex-col gap-1 mb-2">
                <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2"><span>$</span> Budget Information</h2>
                <p className="text-sm text-neutral-500">Help us provide accurate pricing by sharing your budget expectations</p>
            </div>
            
            <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-neutral-900">Select Your Budget Tier</label>
                <div className="relative">
                    <select className="w-full appearance-none bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-900 focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 cursor-pointer">
                        <option value="">Choose a pricing tier</option>
                        <option value="economy">Economy / Promo</option>
                        <option value="standard">Standard / Retail</option>
                        <option value="premium">Premium / Custom Cut & Sew</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" size={16} />
                </div>
                <p className="text-xs text-neutral-500 mt-1">This helps us tailor our recommendations to your budget range</p>
            </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4 mt-4">
            <button className="flex-1 bg-indigo-500 text-white py-4 rounded-xl text-sm font-bold tracking-wide hover:bg-indigo-600 transition-all shadow-md flex justify-center items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Submit Quote Request
            </button>
            <button 
                onClick={handleBack}
                className="bg-white border border-neutral-200 text-neutral-900 px-8 py-4 rounded-xl text-sm font-bold hover:bg-neutral-50 transition-all shadow-sm"
            >
                Cancel
            </button>
        </div>

      </div>
    </div>
  );
}
