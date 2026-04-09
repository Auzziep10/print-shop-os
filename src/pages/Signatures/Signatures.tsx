import { useState, useRef, useEffect } from 'react';
import { Copy, CheckCircle, User, Globe, Image as ImageIcon, Upload, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';

export function Signatures() {
  const { userData } = useAuth();
  const [copied, setCopied] = useState(false);
  const signatureRef = useRef<HTMLDivElement>(null);
  const [savingBanner, setSavingBanner] = useState(false);
  const [loadingBanner, setLoadingBanner] = useState(true);
  const [uploadingProfile, setUploadingProfile] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  
  // Local state for the generator
  const [formData, setFormData] = useState({
    name: userData?.name || 'Your Name',
    title: 'Your Title',
    location: 'Your Location',
    profileImageUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?ixlib=rb-4.0.3&auto=format&fit=crop&w=256&h=256&q=80',
    phone: '555-019-2093',
    email: userData?.email || 'email@example.com',
    website: 'https://wovn.com',
    linkedin: 'https://linkedin.com/'
  });

  // Global marketing template state
  const [marketingData, setMarketingData] = useState({
    bannerImageUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=200&q=80',
    logoUrl: 'https://printshopos.com/assets/wovn-production-logo.png',
    disclaimer: 'CONFIDENTIALITY NOTICE:\nThe contents of this email message and any attachments are intended solely for the addressee(s) and may contain confidential and/or privileged information and may be legally protected from disclosure. If you are not the intended recipient of this message or their agent, or if this message has been addressed to you in error, please immediately alert the sender by reply email and then delete this message and any attachments. If you are not the intended recipient, you are hereby notified that any use, dissemination, copying, or storage of this message or its attachments is strictly prohibited.'
  });

  useEffect(() => {
    const fetchGlobalMarketing = async () => {
      try {
        const docRef = doc(db, 'settings', 'signatures');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setMarketingData(prev => ({ ...prev, ...docSnap.data() }));
        }
      } catch (error) {
        console.error("Error fetching signature settings:", error);
      } finally {
        setLoadingBanner(false);
      }
    };
    fetchGlobalMarketing();
  }, []);

  const handleSaveBanner = async () => {
    setSavingBanner(true);
    try {
      await setDoc(doc(db, 'settings', 'signatures'), marketingData, { merge: true });
      // Optionally show a success toast here
    } catch (error) {
      console.error("Error saving signature settings:", error);
    } finally {
      setSavingBanner(false);
    }
  };

  const handleCopy = () => {
    if (!signatureRef.current) return;
    
    // Create a range and select the signature content
    const range = document.createRange();
    range.selectNode(signatureRef.current);
    const windowSelection = window.getSelection();
    if (windowSelection) {
      windowSelection.removeAllRanges();
      windowSelection.addRange(range);
      
      try {
        // Execute copy using document.execCommand to preserve rich text (HTML) formatting
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy', err);
      }
      
      windowSelection.removeAllRanges();
    }
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'profile' | 'banner' | 'logo'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === 'profile') setUploadingProfile(true);
    else if (type === 'banner') setUploadingBanner(true);
    else setUploadingLogo(true);

    try {
      const fileRef = ref(storage, `signatures/${type}/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(fileRef, file);

      uploadTask.on('state_changed', 
        null,
        (error) => {
          console.error(`Error uploading ${type}:`, error);
          if (type === 'profile') setUploadingProfile(false);
          else if (type === 'banner') setUploadingBanner(false);
          else setUploadingLogo(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          if (type === 'profile') {
            setFormData(prev => ({ ...prev, profileImageUrl: downloadURL }));
            setUploadingProfile(false);
          } else if (type === 'banner') {
            setMarketingData(prev => ({ ...prev, bannerImageUrl: downloadURL }));
            setUploadingBanner(false);
          } else {
            setMarketingData(prev => ({ ...prev, logoUrl: downloadURL }));
            setUploadingLogo(false);
          }
        }
      );
    } catch (error) {
      console.error("Upload failed", error);
      if (type === 'profile') setUploadingProfile(false);
      else if (type === 'banner') setUploadingBanner(false);
      else setUploadingLogo(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 w-full">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-brand-primary">Email Signatures</h1>
        <p className="text-brand-secondary mt-1">Generate and copy your custom brand signature.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* Left Column: Form Controls */}
        <div className="xl:col-span-5 space-y-6">
          
          <div className="bg-white rounded-xl border border-brand-border shadow-sm overflow-hidden">
            <div className="p-4 border-b border-brand-border bg-brand-bg/50">
              <h2 className="font-medium text-brand-primary flex items-center gap-2">
                <User size={18} className="text-brand-secondary" />
                Personal Details
              </h2>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <label className="text-sm font-medium text-brand-secondary">Full Name</label>
                  <input 
                    type="text" 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full px-3 py-2 bg-white border border-brand-border rounded-lg text-sm focus:ring-2 focus:ring-brand-primary focus:border-transparent transition-all outline-none"
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-sm font-medium text-brand-secondary">Title & Tagline</label>
                  <input 
                    type="text" 
                    value={formData.title}
                    onChange={e => setFormData({...formData, title: e.target.value})}
                    className="w-full px-3 py-2 bg-white border border-brand-border rounded-lg text-sm focus:ring-2 focus:ring-brand-primary focus:border-transparent transition-all outline-none"
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-sm font-medium text-brand-secondary">Location</label>
                  <input 
                    type="text" 
                    value={formData.location}
                    onChange={e => setFormData({...formData, location: e.target.value})}
                    className="w-full px-3 py-2 bg-white border border-brand-border rounded-lg text-sm focus:ring-2 focus:ring-brand-primary focus:border-transparent transition-all outline-none"
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-sm font-medium text-brand-secondary">Profile Image</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={formData.profileImageUrl}
                      onChange={e => setFormData({...formData, profileImageUrl: e.target.value})}
                      className="flex-1 px-3 py-2 bg-white border border-brand-border rounded-lg text-sm focus:ring-2 focus:ring-brand-primary focus:border-transparent transition-all outline-none"
                    />
                    <label className="flex items-center justify-center gap-2 px-4 py-2 bg-brand-bg hover:bg-gray-100 border border-brand-border text-brand-primary text-sm font-medium rounded-lg cursor-pointer transition-colors whitespace-nowrap">
                      {uploadingProfile ? <Loader2 size={16} className="animate-spin text-brand-secondary" /> : <Upload size={16} className="text-brand-secondary" />}
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => handleFileUpload(e, 'profile')}
                        disabled={uploadingProfile}
                      />
                    </label>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-brand-secondary">Phone Number</label>
                  <input 
                    type="text" 
                    value={formData.phone}
                    onChange={e => setFormData({...formData, phone: e.target.value})}
                    className="w-full px-3 py-2 bg-white border border-brand-border rounded-lg text-sm focus:ring-2 focus:ring-brand-primary focus:border-transparent transition-all outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-brand-secondary">Email Address</label>
                  <input 
                    type="email" 
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    className="w-full px-3 py-2 bg-white border border-brand-border rounded-lg text-sm focus:ring-2 focus:ring-brand-primary focus:border-transparent transition-all outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-brand-secondary">LinkedIn URL</label>
                  <input 
                    type="text" 
                    value={formData.linkedin}
                    onChange={e => setFormData({...formData, linkedin: e.target.value})}
                    className="w-full px-3 py-2 bg-white border border-brand-border rounded-lg text-sm focus:ring-2 focus:ring-brand-primary focus:border-transparent transition-all outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-brand-secondary">Website URL</label>
                  <input 
                    type="text" 
                    value={formData.website}
                    onChange={e => setFormData({...formData, website: e.target.value})}
                    className="w-full px-3 py-2 bg-white border border-brand-border rounded-lg text-sm focus:ring-2 focus:ring-brand-primary focus:border-transparent transition-all outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {userData?.role === 'Admin' && (
            <div className="bg-white rounded-xl border border-brand-border shadow-sm overflow-hidden">
              <div className="p-4 border-b border-brand-border bg-brand-bg/50">
                <h2 className="font-medium text-brand-primary flex items-center gap-2">
                  <Globe size={18} className="text-brand-secondary" />
                  Global Banner Details (Admin)
                </h2>
              </div>
              <div className="p-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-brand-secondary flex items-center gap-2">
                    <ImageIcon size={14} /> Background Banner
                  </label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={marketingData.bannerImageUrl}
                      onChange={e => setMarketingData({...marketingData, bannerImageUrl: e.target.value})}
                      className="flex-1 px-3 py-2 bg-white border border-brand-border rounded-lg text-sm focus:ring-2 focus:ring-brand-primary focus:border-transparent transition-all outline-none"
                      disabled={loadingBanner}
                    />
                    <label className="flex items-center justify-center gap-2 px-4 py-2 bg-brand-bg hover:bg-gray-100 border border-brand-border text-brand-primary text-sm font-medium rounded-lg cursor-pointer transition-colors whitespace-nowrap">
                      {uploadingBanner ? <Loader2 size={16} className="animate-spin text-brand-secondary" /> : <Upload size={16} className="text-brand-secondary" />}
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => handleFileUpload(e, 'banner')}
                        disabled={loadingBanner || uploadingBanner}
                      />
                    </label>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-brand-secondary flex items-center gap-2">
                    <ImageIcon size={14} /> Global Logo
                  </label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={marketingData.logoUrl}
                      onChange={e => setMarketingData({...marketingData, logoUrl: e.target.value})}
                      className="flex-1 px-3 py-2 bg-white border border-brand-border rounded-lg text-sm focus:ring-2 focus:ring-brand-primary focus:border-transparent transition-all outline-none"
                      disabled={loadingBanner}
                    />
                    <label className="flex items-center justify-center gap-2 px-4 py-2 bg-brand-bg hover:bg-gray-100 border border-brand-border text-brand-primary text-sm font-medium rounded-lg cursor-pointer transition-colors whitespace-nowrap">
                      {uploadingLogo ? <Loader2 size={16} className="animate-spin text-brand-secondary" /> : <Upload size={16} className="text-brand-secondary" />}
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => handleFileUpload(e, 'logo')}
                        disabled={loadingBanner || uploadingLogo}
                      />
                    </label>
                  </div>
                </div>
                <button 
                  onClick={handleSaveBanner}
                  disabled={savingBanner || loadingBanner}
                  className="w-full py-2 bg-brand-primary text-white text-sm font-medium rounded-lg hover:bg-brand-primary/90 transition-colors disabled:opacity-50"
                >
                  {savingBanner ? 'Saving...' : 'Save Global Banner'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Preview & HTML */}
        <div className="xl:col-span-7 flex flex-col h-full">
          <div className="bg-white rounded-xl border border-brand-border shadow-sm overflow-hidden flex flex-col h-full">
            <div className="p-4 border-b border-brand-border bg-brand-bg/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-medium text-brand-primary">Live Preview</h2>
                <p className="text-xs text-brand-secondary">What you see is what gets copied.</p>
              </div>
              <button 
                onClick={handleCopy}
                className="flex items-center justify-center gap-2 px-6 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors shadow-sm"
              >
                {copied ? <CheckCircle size={16} className="text-green-400" /> : <Copy size={16} />}
                {copied ? 'Copied HTML!' : 'Copy Signature'}
              </button>
            </div>
            
            <div className="p-8 lg:p-12 flex-1 overflow-x-auto bg-gray-50 flex items-start justify-center min-h-[500px]">
              
              {/* Actual Signature HTML Structure */}
              <div 
                ref={signatureRef} 
                className="select-all block w-full bg-white relative p-6 rounded-tl-[40px] rounded-br-[40px] shadow-sm transform-gpu"
                style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}
              >
                <div style={{ maxWidth: '650px', margin: '0 auto' }}>
                  
                  {/* Banner Wrapper */}
                  <div style={{ paddingBottom: '0' }}>
                    <img 
                      src={marketingData.bannerImageUrl}
                      alt="Banner"
                      style={{ 
                        display: 'block', 
                        width: '100%', 
                        maxWidth: '100%',
                        height: 'auto',
                        borderTopLeftRadius: '32px',
                        borderTopRightRadius: '32px',
                        borderBottomRightRadius: '32px',
                        objectFit: 'cover',
                        maxHeight: '180px'
                      }}
                    />
                  </div>

                  {/* Profile Wrapper - Overlapping the banner. Using negative margin which gracefully degrades on Outlook Desktop */}
                  <div style={{ marginTop: '-75px', paddingLeft: '24px', position: 'relative', zIndex: 10 }}>
                    <img 
                      src={formData.profileImageUrl}
                      alt={formData.name}
                      style={{
                        display: 'block',
                        width: '150px',
                        height: '150px',
                        borderRadius: '50%',
                        border: '5px solid white',
                        backgroundColor: 'white',
                        objectFit: 'cover',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}
                    />
                  </div>

                  {/* Details Secion */}
                  <div style={{ paddingLeft: '24px', paddingTop: '16px' }}>
                    <h1 style={{ 
                      margin: '0', 
                      fontSize: '28px', 
                      fontWeight: '700', 
                      color: '#000000',
                      letterSpacing: '-0.5px'
                    }}>
                      {formData.name}
                    </h1>
                    
                    <p style={{ 
                      margin: '4px 0 0 0', 
                      fontSize: '15px', 
                      color: '#4B5563',
                      fontWeight: '400'
                    }}>
                      {formData.title}
                    </p>
                    
                    <p style={{ 
                      margin: '2px 0 0 0', 
                      fontSize: '15px', 
                      color: '#9CA3AF',
                      fontWeight: '300'
                    }}>
                      {formData.location}
                    </p>

                    {/* Social/Contact Icons Row */}
                    <table cellPadding="0" cellSpacing="0" border={0} style={{ marginTop: '20px', marginBottom: '24px' }}>
                      <tbody>
                        <tr>
                          {/* Mobile Phone Icon */}
                          <td style={{ paddingRight: '8px' }}>
                            <a href={`tel:${formData.phone.replace(/\D/g,'')}`} style={{ textDecoration: 'none' }}>
                              <table cellPadding="0" cellSpacing="0" border={0} style={{ backgroundColor: '#c8b693', borderRadius: '50%', width: '36px', height: '36px' }}>
                                <tbody>
                                  <tr>
                                    <td align="center" valign="middle">
                                      <img src="https://img.icons8.com/ios-filled/50/ffffff/iphone-x.png" width="18" height="18" style={{ display: 'block', marginTop: '2px' }} alt="Phone" />
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </a>
                          </td>

                          {/* Email/Chat Icon */}
                          <td style={{ paddingRight: '8px' }}>
                            <a href={`mailto:${formData.email}`} style={{ textDecoration: 'none' }}>
                              <table cellPadding="0" cellSpacing="0" border={0} style={{ backgroundColor: '#c8b693', borderRadius: '50%', width: '36px', height: '36px' }}>
                                <tbody>
                                  <tr>
                                    <td align="center" valign="middle">
                                      <img src="https://img.icons8.com/ios-filled/50/ffffff/speech-bubble-with-dots.png" width="18" height="18" style={{ display: 'block', marginTop: '2px' }} alt="Email" />
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </a>
                          </td>

                          {/* Website / Globe Icon */}
                          <td style={{ paddingRight: '8px' }}>
                            <a href={formData.website} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                              <table cellPadding="0" cellSpacing="0" border={0} style={{ backgroundColor: '#c8b693', borderRadius: '50%', width: '36px', height: '36px' }}>
                                <tbody>
                                  <tr>
                                    <td align="center" valign="middle">
                                      <img src="https://img.icons8.com/ios-filled/50/ffffff/globe--v1.png" width="18" height="18" style={{ display: 'block' }} alt="Website" />
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </a>
                          </td>

                          {/* LinkedIn Icon */}
                          <td>
                            <a href={formData.linkedin} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                              <table cellPadding="0" cellSpacing="0" border={0} style={{ backgroundColor: '#c8b693', borderRadius: '50%', width: '36px', height: '36px' }}>
                                <tbody>
                                  <tr>
                                    <td align="center" valign="middle">
                                      <img src="https://img.icons8.com/ios-filled/50/ffffff/linkedin.png" width="18" height="18" style={{ display: 'block', marginBottom: '2px' }} alt="LinkedIn" />
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </a>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Logo */}
                    <div style={{ marginBottom: '24px' }}>
                      <img 
                        src={marketingData.logoUrl} 
                        alt="WOVN" 
                        style={{ display: 'block', height: '45px', width: 'auto' }} 
                      />
                    </div>

                    {/* Disclaimer Text */}
                    <div style={{ 
                      fontSize: '8px', 
                      color: '#D1D5DB', 
                      lineHeight: '1.4', 
                      marginTop: '20px',
                      textTransform: 'uppercase',
                      textAlign: 'left'
                    }}>
                      <strong style={{ display: 'block', marginBottom: '4px' }}>CONFIDENTIALITY NOTICE:</strong>
                      {marketingData.disclaimer}
                    </div>

                  </div>
                </div>
              </div>
              {/* End Signature HTML Structure */}

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
