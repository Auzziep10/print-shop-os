import { useState } from 'react';
import { ArrowRight, Upload, Plus, Trash2, Camera, Paintbrush, DollarSign, Shirt, CheckCircle, Building2 } from 'lucide-react';
import { db, storage } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigate } from 'react-router-dom';

export function PublicQuoteRequest() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Customer Details
  const [customerInfo, setCustomerInfo] = useState({
    companyName: '',
    contactName: '',
    emailAddress: '',
    phone: '',
    website: ''
  });

  // Project Details
  const [products, setProducts] = useState<any[]>([
    { id: 1, artworkUrl: null, artworkName: null, isUploading: false, garmentName: '', color: '', qty: '', budgetTier: '' }
  ]);
  const [inHandsDate, setInHandsDate] = useState('');
  const [notes, setNotes] = useState('');
  const [budgetTier, setBudgetTier] = useState('');

  const handleAddProduct = () => {
    setProducts(prev => [...prev, { id: Date.now(), artworkUrl: null, artworkName: null, isUploading: false, garmentName: '', color: '', qty: '', budgetTier: '' }]);
  };

  const handleRemoveProduct = (id: number) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  const handleFileUpload = async (productId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, isUploading: true } : p));
    
    try {
      const tempId = `temp_${Date.now()}`;
      const storageRef = ref(storage, `public_quotes/${tempId}/${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      
      setProducts(prev => prev.map(p => p.id === productId ? { 
        ...p, 
        isUploading: false, 
        artworkUrl: url,
        artworkName: file.name
      } : p));
    } catch (err) {
      console.error("Upload failed", err);
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, isUploading: false } : p));
    }
  };

  const handleSubmit = async () => {
    if (!customerInfo.contactName || !customerInfo.emailAddress) {
      alert("Please provide at least your Contact Name and Email Address.");
      return;
    }

    setIsSubmitting(true);
    try {
      const customerId = `cust-${Date.now()}`;
      const orderId = `quote-${Date.now()}`;

      // 1. Create Customer
      await setDoc(doc(db, 'customers', customerId), {
        id: customerId,
        company: customerInfo.companyName || '-',
        contactName: customerInfo.contactName,
        email: customerInfo.emailAddress,
        phone: customerInfo.phone,
        website: customerInfo.website,
        type: 'Web Lead',
        createdAt: new Date().toISOString()
      });

      // 2. Create Quote Request (Order)
      const payload = {
        id: orderId,
        portalId: Math.floor(Math.random() * 100000).toString(),
        customerId: customerId,
        title: `Quote Request from ${customerInfo.companyName || customerInfo.contactName}`,
        statusIndex: 0, 
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric'}),
        createdAt: new Date().toISOString(),
        items: products.map(p => ({
           id: p.id || Date.now(),
           style: p.garmentName || 'Custom Garment',
           color: p.color || '',
           qty: p.qty ? parseInt(p.qty) : 0,
           image: p.artworkUrl || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200',
           notes: '',
           sizes: {}
        })),
        contactDetails: {
           name: customerInfo.contactName,
           email: customerInfo.emailAddress,
           phone: customerInfo.phone
        },
        inHandsDate: inHandsDate,
        notes: notes,
        budgetTier: budgetTier,
        activities: [{
          id: `act-${Date.now()}`,
          type: 'system',
          message: `Web Quote Request submitted by ${customerInfo.contactName}`,
          user: customerInfo.emailAddress,
          timestamp: new Date().toISOString()
        }]
      };

      await setDoc(doc(db, 'orders', orderId), payload);
      setSuccess(true);
    } catch (err) {
      console.error("Error submitting quote:", err);
      alert("There was an error submitting your request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6 font-sans text-brand-primary">
        <div className="max-w-md w-full bg-white border border-brand-border rounded-3xl p-10 text-center space-y-6 shadow-sm animate-in zoom-in-95 fade-in duration-500">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100">
            <CheckCircle size={40} />
          </div>
          <h1 className="text-3xl font-serif text-brand-primary">Request Submitted</h1>
          <p className="text-brand-secondary text-sm leading-relaxed">
            Thank you, {customerInfo.contactName}! We've received your project details. Our team will review your specifications and get back to you shortly with a personalized quote.
          </p>
          <div className="pt-6">
            <button 
              onClick={() => navigate('/')} 
              className="w-full bg-brand-primary text-white py-4 rounded-xl font-bold tracking-wide hover:bg-brand-primary/90 transition-all shadow-sm"
            >
              Return Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg font-sans pb-32 text-brand-primary selection:bg-brand-primary selection:text-white">
      {/* Header Area */}
      <div className="bg-white border-b border-brand-border py-8 px-6 mb-8">
        <div className="max-w-[1200px] mx-auto">
          <h1 className="text-4xl font-serif text-brand-primary tracking-tight">
            Start a Project
          </h1>
          <p className="text-brand-secondary font-medium text-sm mt-2 max-w-xl">
            Give us the details of your project and we'll craft a custom quote tailored to your needs.
          </p>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 w-full flex flex-col lg:flex-row gap-8 items-start">
        <div className="flex-1 w-full space-y-8 animate-in slide-in-from-bottom-4 duration-500 fade-in">
          
          {/* Step 1: Customer Info */}
          <div className={`bg-white rounded-3xl p-8 shadow-[0_4px_24px_rgb(0,0,0,0.02)] border border-brand-border flex flex-col gap-6 relative transition-all duration-300 ${step === 1 ? 'ring-1 ring-brand-primary/10' : 'opacity-80'}`}>
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-bold text-brand-primary flex items-center gap-3">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-brand-bg text-brand-primary text-xs font-bold border border-brand-border">1</span>
                  Your Details
                </h2>
                <p className="text-sm text-brand-secondary ml-9">Provide your contact info to get started</p>
              </div>
              {step > 1 && (
                <button onClick={() => setStep(1)} className="text-sm font-bold text-brand-secondary hover:text-brand-primary transition-colors">Edit</button>
              )}
            </div>
            
            {step === 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2 ml-9">
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-brand-primary">Contact Name *</label>
                    <input type="text" value={customerInfo.contactName} onChange={e => setCustomerInfo({...customerInfo, contactName: e.target.value})} className="w-full bg-white border border-brand-border rounded-xl px-4 py-3 text-sm text-brand-primary focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all font-medium" placeholder="Jane Doe" />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-brand-primary">Email Address *</label>
                    <input type="email" value={customerInfo.emailAddress} onChange={e => setCustomerInfo({...customerInfo, emailAddress: e.target.value})} className="w-full bg-white border border-brand-border rounded-xl px-4 py-3 text-sm text-brand-primary focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all font-medium" placeholder="jane@company.com" />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-brand-primary">Company / Brand Name</label>
                    <input type="text" value={customerInfo.companyName} onChange={e => setCustomerInfo({...customerInfo, companyName: e.target.value})} className="w-full bg-white border border-brand-border rounded-xl px-4 py-3 text-sm text-brand-primary focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all font-medium" placeholder="Acme Corp" />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-bold text-brand-primary">Phone Number</label>
                    <input type="tel" value={customerInfo.phone} onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})} className="w-full bg-white border border-brand-border rounded-xl px-4 py-3 text-sm text-brand-primary focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all font-medium" placeholder="(555) 123-4567" />
                </div>
                
                <div className="md:col-span-2 mt-2">
                  <button 
                    onClick={() => {
                        if(!customerInfo.contactName || !customerInfo.emailAddress) return alert("Please fill out required fields");
                        setStep(2);
                    }}
                    className="bg-brand-primary text-white px-8 py-3.5 rounded-xl text-sm font-bold tracking-wide hover:bg-brand-primary/90 transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    Continue <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Project Details */}
          <div className={`bg-white rounded-3xl p-8 shadow-[0_4px_24px_rgb(0,0,0,0.02)] border border-brand-border flex flex-col gap-6 relative transition-all duration-300 ${step === 2 ? 'ring-1 ring-brand-primary/10' : 'opacity-80'}`}>
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-bold text-brand-primary flex items-center gap-3">
                  <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border transition-colors ${step >= 2 ? 'bg-brand-primary text-white border-brand-primary' : 'bg-brand-bg text-brand-primary border-brand-border'}`}>2</span>
                  Project Scope
                </h2>
                <p className="text-sm text-brand-secondary ml-9">Add the items you need to be quoted</p>
              </div>
            </div>

            {step === 2 && (
              <div className="space-y-8 mt-2 ml-9">
                <div className="flex flex-col gap-6">
                  {products.map((product, index) => (
                    <div key={product.id} className="p-6 bg-brand-bg/50 border border-brand-border rounded-2xl flex flex-col gap-5 relative group">
                        {products.length > 1 && (
                            <button onClick={() => handleRemoveProduct(product.id)} className="absolute right-4 top-4 text-brand-secondary hover:text-red-500 transition-colors p-2">
                                <Trash2 size={16} />
                            </button>
                        )}
                        <h3 className="text-sm font-bold text-brand-primary flex items-center gap-2 border-b border-brand-border pb-3"><Shirt size={16}/> Item {index + 1}</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-brand-secondary uppercase tracking-wider">Garment Style</label>
                                <select 
                                    value={product.garmentName}
                                    onChange={(e) => setProducts(prev => prev.map(p => p.id === product.id ? { ...p, garmentName: e.target.value } : p))}
                                    className="w-full bg-white border border-brand-border rounded-xl px-4 py-3 text-sm text-brand-primary focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 appearance-none"
                                >
                                    <option value="">Select style...</option>
                                    <option value="Standard T-Shirt">Standard T-Shirt</option>
                                    <option value="Premium T-Shirt">Premium Heavy T-Shirt</option>
                                    <option value="Hoodie">Hoodie / Sweatshirt</option>
                                    <option value="Polo">Polo</option>
                                    <option value="Hats">Headwear</option>
                                    <option value="Other">Other Custom</option>
                                </select>
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-brand-secondary uppercase tracking-wider">Estimated Quantity</label>
                                <input type="number" placeholder="50" value={product.qty} onChange={e => setProducts(prev => prev.map(p => p.id === product.id ? { ...p, qty: e.target.value } : p))} className="w-full bg-white border border-brand-border rounded-xl px-4 py-3 text-sm text-brand-primary focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all font-medium" />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-brand-secondary uppercase tracking-wider">Color Preferences</label>
                                <input type="text" placeholder="Black, Navy" value={product.color} onChange={e => setProducts(prev => prev.map(p => p.id === product.id ? { ...p, color: e.target.value } : p))} className="w-full bg-white border border-brand-border rounded-xl px-4 py-3 text-sm text-brand-primary focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all font-medium" />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-brand-secondary uppercase tracking-wider flex items-center gap-2"><Paintbrush size={14}/> Artwork/Logo File (Optional)</label>
                            {product.isUploading ? (
                              <div className="border border-dashed border-brand-border rounded-xl p-8 flex flex-col items-center justify-center bg-white gap-3">
                                  <div className="w-6 h-6 border-2 border-brand-border border-t-brand-primary rounded-full animate-spin"></div>
                                  <span className="text-xs text-brand-secondary font-medium tracking-wide">Uploading...</span>
                              </div>
                            ) : product.artworkUrl ? (
                              <div className="border border-brand-border rounded-xl p-4 bg-white flex items-center gap-4 group/file">
                                  <div className="w-12 h-12 rounded-lg bg-brand-bg flex items-center justify-center overflow-hidden shrink-0 border border-brand-border">
                                      {product.artworkUrl.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i) ? (
                                        <img src={product.artworkUrl} className="w-full h-full object-cover" />
                                      ) : <Camera size={20} className="text-brand-secondary" />}
                                  </div>
                                  <div className="flex-1 truncate">
                                      <p className="text-sm font-bold text-brand-primary truncate">{product.artworkName}</p>
                                      <button onClick={() => setProducts(prev => prev.map(p => p.id === product.id ? {...p, artworkUrl: null, artworkName: null} : p))} className="text-xs text-red-500 hover:text-red-700 font-medium">Remove File</button>
                                  </div>
                              </div>
                            ) : (
                              <label className="border border-dashed border-brand-border rounded-xl p-8 flex flex-col items-center justify-center bg-white hover:bg-brand-bg transition-all cursor-pointer gap-2 group/upload">
                                  <Upload size={24} className="text-brand-secondary group-hover/upload:text-brand-primary transition-colors" />
                                  <span className="text-sm text-brand-primary font-medium">Click to upload design file</span>
                                  <span className="text-xs text-brand-secondary">Supports .ai, .png, .pdf up to 20MB</span>
                                  <input type="file" className="hidden" onChange={(e) => handleFileUpload(product.id, e)} />
                              </label>
                            )}
                        </div>
                    </div>
                  ))}
                </div>

                <button onClick={handleAddProduct} className="w-full py-4 border border-dashed border-brand-border rounded-2xl text-brand-secondary hover:text-brand-primary hover:bg-white transition-all flex items-center justify-center gap-2 font-bold text-sm bg-brand-bg/50">
                    <Plus size={16} /> Add Another Item
                </button>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-brand-border">
                  <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold text-brand-secondary uppercase tracking-wider flex items-center gap-2"><DollarSign size={14}/> Budget Tier</label>
                      <select value={budgetTier} onChange={e => setBudgetTier(e.target.value)} className="w-full bg-white border border-brand-border rounded-xl px-4 py-3.5 text-sm text-brand-primary focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 appearance-none font-medium">
                          <option value="">Select your quality tier</option>
                          <option value="Promo / Bulk">Promo / Event Bulk (Economy)</option>
                          <option value="Retail Standard">Retail Standard (Premium Blanks)</option>
                          <option value="Cut & Sew">Custom Cut & Sew (Luxury)</option>
                      </select>
                  </div>
                  <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold text-brand-secondary uppercase tracking-wider">Target In-Hands Date</label>
                      <input type="date" value={inHandsDate} onChange={e => setInHandsDate(e.target.value)} className="w-full bg-white border border-brand-border rounded-xl px-4 py-3.5 text-sm text-brand-primary focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 transition-all font-medium" />
                  </div>
                </div>

                <div className="flex flex-col gap-2 border-t border-brand-border pt-6">
                    <label className="text-xs font-bold text-brand-secondary uppercase tracking-wider">Additional Details</label>
                    <textarea 
                      rows={4} 
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Tell us about the project vision..."
                      className="w-full bg-white border border-brand-border rounded-xl px-4 py-4 text-sm text-brand-primary focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all resize-none font-medium"
                    />
                </div>

                <button 
                  disabled={isSubmitting}
                  onClick={handleSubmit}
                  className="w-full bg-brand-primary text-white py-4 rounded-xl text-md font-bold tracking-wide hover:bg-brand-primary/90 transition-all shadow-md flex items-center justify-center gap-2 mt-8 disabled:opacity-50"
                >
                  {isSubmitting ? <span className="animate-pulse">Submitting...</span> : 'Submit Quote Request'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Info Column */}
        <div className="w-full lg:w-[320px] shrink-0 lg:sticky lg:top-8">
           <div className="bg-white border text-sm border-brand-border rounded-2xl p-6 shadow-[0_2px_12px_rgb(0,0,0,0.02)]">
               <div className="w-12 h-12 bg-brand-bg rounded-lg flex items-center justify-center mb-4 border border-brand-border">
                   <Building2 className="text-brand-primary" size={24} />
               </div>
               <h3 className="text-brand-primary font-bold mb-3 font-serif text-lg">Partner With Us</h3>
               <p className="text-brand-secondary leading-relaxed mb-6">
                 We've built our reputation on quality, speed, and clear communication. From ideation to final delivery, you'll have a dedicated team keeping your project on track.
               </p>
               <ul className="space-y-4">
                   <li className="flex gap-3">
                       <CheckCircle size={18} className="text-emerald-500 shrink-0 mt-0.5"/>
                       <p className="text-brand-secondary leading-snug"><strong className="text-brand-primary">Premium Execution</strong> - We use state of the art equipment and meticulously selected blanks.</p>
                   </li>
                   <li className="flex gap-3">
                       <CheckCircle size={18} className="text-emerald-500 shrink-0 mt-0.5"/>
                       <p className="text-brand-secondary leading-snug"><strong className="text-brand-primary">Full Transparency</strong> - Transparent pricing guarantees, no unexpected setup or run fees.</p>
                   </li>
                   <li className="flex gap-3">
                       <CheckCircle size={18} className="text-emerald-500 shrink-0 mt-0.5"/>
                       <p className="text-brand-secondary leading-snug"><strong className="text-brand-primary">Fast Turnarounds</strong> - Real-time tracking and aggressive production timelines.</p>
                   </li>
               </ul>
           </div>
        </div>
      </div>
    </div>
  );
}
