import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';
import { ArrowLeft, Mail, Phone, MapPin, Building2, ExternalLink, ShieldAlert, FileText, Plus, Loader2, Upload, X, Check } from 'lucide-react';
import { MOCK_CUSTOMERS_DB } from '../../lib/mockData';
import { useOrders } from '../../hooks/useOrders';
import { storage, db } from '../../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import Cropper from 'react-easy-crop';
import { getCroppedImg } from '../../lib/cropUtils';

export function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { orders, loading: ordersLoading } = useOrders(id);
  
  const mockCustomer = id ? MOCK_CUSTOMERS_DB[id] : MOCK_CUSTOMERS_DB['CUS-001'];

  const [liveLogo, setLiveLogo] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Cropper State
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const onCropComplete = (_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  useEffect(() => {
    // Try to fetch custom live logo overrides
    const fetchCustomer = async () => {
      if (!id) return;
      try {
        const d = await getDoc(doc(db, 'customers', id));
        if (d.exists() && d.data().logo) {
          setLiveLogo(d.data().logo);
        }
      } catch (err) {}
    };
    fetchCustomer();
  }, [id]);

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input so identical file can be picked again
  };

  const handleUploadCroppedLogo = async () => {
    if (!id || !cropImageSrc || !croppedAreaPixels) return;

    try {
      setUploadingLogo(true);
      const imageSrcToCrop = cropImageSrc;
      setCropImageSrc(null); // Close the cropper dialog UI early for better UX
      
      const croppedFile = await getCroppedImg(imageSrcToCrop, croppedAreaPixels);
      if (!croppedFile) throw new Error("Could not crop image");

      const storageRef = ref(storage, `customers/${id}/logo_${Date.now()}`);
      
      // Upload cropped file to Firebase Storage
      await uploadBytes(storageRef, croppedFile);
      const url = await getDownloadURL(storageRef);

      // Save the new URL to Firestore so it persists
      await setDoc(doc(db, 'customers', id), { logo: url }, { merge: true });
      
      setLiveLogo(url);
    } catch (err) {
      console.error("Error uploading logo", err);
    } finally {
      setUploadingLogo(false);
    }
  };

  const customer = { ...mockCustomer, logo: liveLogo || mockCustomer?.logo };

  return (
    <div className={tokens.layout.container}>
      {/* Top Breadcrumb & Actions */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-brand-border">
        <button 
          onClick={() => navigate('/customers')}
          className="flex items-center gap-2 text-sm text-brand-secondary hover:text-brand-primary transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Customers
        </button>
        <div className="flex items-center gap-3">
          <PillButton 
            variant="outline" 
            className="gap-2"
            onClick={() => window.open(`/portal/${id}`, '_blank')}
          >
            <ExternalLink size={16} />
            Login to Client Portal
          </PillButton>
          <PillButton variant="filled">
            Edit Company
          </PillButton>
        </div>
      </div>

      {/* Header Profile */}
      <div className="bg-white p-8 rounded-card border border-brand-border shadow-sm mb-8 flex flex-col md:flex-row gap-8 items-start justify-between">
          <div className="flex items-start gap-6">
            <div className={`relative w-24 h-24 rounded-xl border border-brand-border bg-brand-bg flex items-center justify-center text-brand-secondary flex-shrink-0 overflow-hidden group ${customer?.logo ? 'bg-white' : ''}`}>
               {uploadingLogo ? (
                 <Loader2 className="animate-spin text-brand-secondary" size={24} />
               ) : customer?.logo ? (
                 <img src={customer.logo} className="w-full h-full object-cover filter grayscale contrast-125 mix-blend-multiply opacity-80" alt={customer.company} />
               ) : (
                 <Building2 size={40} strokeWidth={1} />
               )}
               
               {/* Hover Upload Overlay */}
               {!uploadingLogo && (
                 <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center cursor-pointer text-white">
                   <Upload size={20} className="mb-1" />
                   <span className="text-[9px] font-bold uppercase tracking-widest text-white/90">Edit Logo</span>
                   <input type="file" className="hidden" accept="image/*" onChange={handleLogoSelect} />
                 </label>
               )}
            </div>
            <div>
               <div className="flex items-center gap-3 mb-2">
                 <h1 className="font-serif text-3xl text-brand-primary">{customer?.company || 'Unknown Company'}</h1>
                 <span className="text-[10px] bg-brand-bg border border-brand-border px-2 py-0.5 rounded text-brand-secondary font-semibold uppercase tracking-wider">{id}</span>
               </div>
               <div className="flex items-center gap-4 text-sm text-brand-secondary mb-4">
                  <span className="flex items-center gap-1.5"><MapPin size={14} /> {customer?.location}</span>
                  <span className="flex items-center gap-1.5"><Phone size={14} /> {customer?.phone}</span>
                  <span className="flex items-center gap-1.5"><Mail size={14} /> {customer?.email}</span>
               </div>
               <div className="flex gap-2">
                 <span className="text-[10px] bg-brand-bg border border-brand-border px-2.5 py-1 rounded-md text-brand-secondary font-semibold uppercase tracking-wider">{customer?.type}</span>
                 {customer?.type === 'B2B' && (
                   <span className="text-[10px] bg-blue-50 border border-blue-200 text-blue-700 px-2.5 py-1 rounded-md font-semibold uppercase tracking-wider">Net 30 Terms</span>
                 )}
               </div>
            </div>
         </div>
         <div className="flex gap-8 text-right bg-brand-bg/50 p-6 rounded-2xl border border-brand-border border-dashed">
            <div>
               <p className="text-xs uppercase font-bold tracking-widest text-brand-secondary mb-1">Total Orders</p>
               <p className="font-serif text-3xl">{id === 'CUS-001' ? '42' : '1'}</p>
            </div>
            <div>
               <p className="text-xs uppercase font-bold tracking-widest text-brand-secondary mb-1">Lifetime Value</p>
               <p className="font-serif text-3xl">{customer?.ltv}</p>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Contacts & Access */}
        <div className="space-y-8">
          
          {/* Company Logins */}
          <div className="bg-white p-6 rounded-card border border-brand-border shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)]">
            <div className="flex justify-between items-center mb-6">
               <h2 className={tokens.typography.h2}>Portal Access</h2>
               <button className="text-brand-secondary hover:text-brand-primary transition-colors"><Plus size={18} /></button>
            </div>
            <p className="text-sm text-brand-secondary mb-4 leading-relaxed">
              These contacts have active logins mapped to this company's client portal.
            </p>
            
            <div className="space-y-3">
              {[
                 { name: 'Bruce Wayne', role: 'Owner / Admin', email: 'bruce@wayne.ent', lastLogin: 'Today' },
                 { name: 'Lucius Fox', role: 'Purchasing', email: 'lfox@wayne.ent', lastLogin: '3 days ago' },
                 { name: 'Alfred P.', role: 'Accountant', email: 'billing@wayne.ent', lastLogin: 'Oct 12' }
              ].map((contact, i) => (
                <div key={i} className="p-3 border border-brand-border/60 rounded-xl bg-brand-bg flex items-center justify-between group cursor-pointer hover:border-brand-primary/30 transition-colors">
                   <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white border border-brand-border flex items-center justify-center text-xs font-bold text-brand-primary">
                        {contact.name.charAt(0)}
                      </div>
                      <div>
                         <p className="text-sm font-medium text-brand-primary">{contact.name}</p>
                         <p className="text-[10px] text-brand-secondary uppercase tracking-wide font-semibold mt-0.5">{contact.role}</p>
                      </div>
                   </div>
                   <div className="text-right">
                     <p className="text-xs text-brand-secondary">{contact.email}</p>
                     <p className="text-[10px] text-brand-secondary/60 mt-1">Logged in {contact.lastLogin}</p>
                   </div>
                </div>
              ))}
            </div>
          </div>

          {/* CRM Notes */}
          <div className="bg-white p-6 rounded-card border border-brand-border shadow-sm">
             <div className="flex items-center gap-2 mb-4">
                <FileText size={18} className="text-brand-secondary" />
                <h3 className={tokens.typography.h3}>Internal Notes</h3>
             </div>
             <textarea 
                className="w-full h-32 bg-brand-bg border border-brand-border rounded-xl p-3 text-sm resize-none focus:border-brand-primary focus:outline-none transition-colors"
                placeholder="Add a note about this company..."
                defaultValue="Always triple check the black ink opacity on their orders. They are very particular about the 'Vanta Black' look."
             ></textarea>
             <div className="mt-3 flex justify-end">
                <button className="text-xs font-semibold px-4 py-2 bg-brand-primary text-white rounded-lg">Save Note</button>
             </div>
          </div>

        </div>

        {/* Right Column: Order History */}
        <div className="lg:col-span-2 space-y-8">
          
          <div className="bg-white p-6 rounded-card border border-brand-border shadow-sm">
             <div className="flex items-center justify-between mb-6">
                <div>
                   <h2 className={tokens.typography.h2}>Active Quotes & Orders</h2>
                   <p className="text-sm text-brand-secondary mt-1">Current pipeline for this company.</p>
                </div>
                <button className="text-sm font-semibold uppercase tracking-widest text-brand-secondary hover:text-brand-primary transition-colors">View All History</button>
             </div>

             <div className="border border-brand-border rounded-xl overflow-hidden divide-y divide-brand-border">
                {ordersLoading ? (
                  <div className="p-8 flex flex-col items-center justify-center text-brand-secondary gap-2">
                    <Loader2 className="animate-spin" size={24} />
                    <p className="text-xs uppercase tracking-widest font-semibold">Loading orders...</p>
                  </div>
                ) : orders.length === 0 ? (
                  <div className="p-8 text-center text-brand-secondary">
                    <p className="text-sm font-medium">No active orders found.</p>
                  </div>
                ) : orders.map((order) => {
                  
                  const totalItems = order.items?.reduce((acc: number, i: any) => acc + (i.qty || 0), 0) || 0;
                  const totalPriceRaw = order.items?.reduce((acc: number, i: any) => {
                    const priceMatch = (i.total || '$0').replace(/[^0-9.]/g, '');
                    return acc + (parseFloat(priceMatch) || 0);
                  }, 0) || 0;
                  const totalFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalPriceRaw);

                  let badgeStatus = 'Quote';
                  let statusClass = 'bg-gray-100 text-gray-700';
                  
                  switch(order.statusIndex) {
                     case 0: badgeStatus = 'Placed'; statusClass= 'bg-gray-100 text-gray-700'; break;
                     case 1: badgeStatus = 'Approval'; statusClass = 'bg-blue-100 text-blue-700'; break;
                     case 2: badgeStatus = 'Ordered'; statusClass = 'bg-amber-100 text-amber-700'; break;
                     case 3: badgeStatus = 'Production'; statusClass = 'bg-amber-100 text-amber-700'; break;
                     case 4: badgeStatus = 'Shipped'; statusClass = 'bg-green-100 text-green-700'; break;
                     case 5: badgeStatus = 'Completed'; statusClass = 'bg-green-100 text-green-700'; break;
                  }

                  return (
                    <div key={order.portalId || order.id} onClick={() => navigate(`/orders/${order.id}`)} className="flex items-center justify-between p-4 hover:bg-brand-bg transition-colors cursor-pointer group">
                       <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded border border-brand-border bg-white flex items-center justify-center text-[10px] font-bold text-brand-secondary group-hover:text-brand-primary transition-colors">
                            {(order.portalId || order.id).replace('#', '').replace('ORD-', '')}
                          </div>
                          <div>
                             <div className="flex items-center gap-2 mb-1">
                                <p className="font-serif text-lg leading-none">{order.title}</p>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-widest ${statusClass}`}>
                                   {badgeStatus}
                                </span>
                             </div>
                             <p className="text-xs text-brand-secondary font-medium">{totalItems} qt &bull; {order.date}</p>
                          </div>
                       </div>
                       <div className="text-right">
                          <p className="font-serif text-lg">{totalFormatted}</p>
                       </div>
                    </div>
                  );
                })}
             </div>
          </div>
          
          {/* Resale Certificate / Tax Exemption Warning */}
          <div className="bg-amber-50 border border-amber-200/50 rounded-card p-6 flex gap-4">
             <ShieldAlert className="text-amber-500 shrink-0" />
             <div>
                <h3 className="font-semibold text-amber-800 mb-1">Tax Exemption Expiring Soon</h3>
                <p className="text-sm text-amber-700/80 mb-3">Wayne Enterprises resale certificate is set to expire in 30 days. They will be charged tax on future invoices if not updated.</p>
                <button className="text-xs font-bold text-amber-800 uppercase tracking-widest hover:underline">Request Update</button>
             </div>
          </div>

        </div>
      </div>

      {/* Crop Modal */}
      {cropImageSrc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
          <div className="bg-white max-w-lg w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-brand-border">
            <div className="p-4 border-b border-brand-border flex justify-between items-center bg-brand-bg/50">
              <h3 className="font-serif text-2xl text-brand-primary">Adjust Logo Fit</h3>
              <button onClick={() => setCropImageSrc(null)} className="text-brand-secondary hover:text-brand-primary transition-colors bg-white border border-brand-border rounded-md p-1">
                <X size={20} />
              </button>
            </div>
            
            <div className="relative w-full h-[400px] bg-checkerboard overflow-hidden rounded-t-lg">
              <Cropper
                image={cropImageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                objectFit="contain"
                restrictPosition={false}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
                showGrid={false}
              />
            </div>
            
            <div className="p-6 bg-white">
              <p className="text-xs text-brand-secondary mb-5 text-center font-medium">Pan and zoom the image below so no part of the logo is cropped out of the square box.</p>
              
              <div className="flex items-center gap-4 mb-6 px-4">
                 <span className="text-xs font-bold uppercase text-brand-secondary tracking-widest">Zoom</span>
                 <input
                   type="range"
                   value={zoom}
                   min={0.1}
                   max={3}
                   step={0.05}
                   aria-labelledby="Zoom"
                   onChange={(e) => setZoom(Number(e.target.value))}
                   className="flex-1 accent-brand-primary cursor-pointer"
                 />
              </div>

              <div className="flex gap-4">
                <PillButton variant="outline" onClick={() => setCropImageSrc(null)} className="flex-1 justify-center py-3">
                  Cancel
                </PillButton>
                <PillButton variant="filled" onClick={handleUploadCroppedLogo} className="flex-1 justify-center py-3">
                  <span className="flex items-center gap-2"><Check size={18} /> Format & Save Upload</span>
                </PillButton>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
