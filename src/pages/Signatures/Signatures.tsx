import { useState, useRef, useEffect } from 'react';
import { Copy, CheckCircle, User, Globe, Image as ImageIcon, Upload, Loader2, Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { flushSync } from 'react-dom';
import { db, storage } from '../../lib/firebase';

export function Signatures() {
  const { userData } = useAuth();
  const [copied, setCopied] = useState(false);
  const signatureRef = useRef<HTMLTableElement>(null);
  const [savingBanner, setSavingBanner] = useState(false);
  const [loadingBanner, setLoadingBanner] = useState(true);
  const [uploadingProfile, setUploadingProfile] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [compositeUrl, setCompositeUrl] = useState<string | null>(null);
  const [generatingComposite, setGeneratingComposite] = useState(false);
  
  // Multiple profiles state
  const [savedSignatures, setSavedSignatures] = useState<any[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>('default');
  const [profileName, setProfileName] = useState('Main Signature');
  
  // Local state for the generator
  const [formData, setFormData] = useState({
    name: userData?.name || 'Your Name',
    title: 'Your Title',
    location: 'Your Location',
    profileImageUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?ixlib=rb-4.0.3&auto=format&fit=crop&w=256&h=256&q=80',
    profileImageAlignment: 'center',
    phone: '555-019-2093',
    email: userData?.email || 'email@example.com',
    website: 'https://wovn.com',
    linkedin: 'https://linkedin.com/'
  });

  // Global marketing template state
  const [marketingData, setMarketingData] = useState({
    bannerImageUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=200&q=80',
    logoUrl: window.location.origin + '/wovn-signature-logo.png',
    disclaimer: 'CONFIDENTIALITY NOTICE:\nThe contents of this email message and any attachments are intended solely for the addressee(s) and may contain confidential and/or privileged information and may be legally protected from disclosure. If you are not the intended recipient of this message or their agent, or if this message has been addressed to you in error, please immediately alert the sender by reply email and then delete this message and any attachments. If you are not the intended recipient, you are hereby notified that any use, dissemination, copying, or storage of this message or its attachments is strictly prohibited.'
  });

  useEffect(() => {
    const fetchGlobalMarketing = async () => {
      try {
        const docRef = doc(db, 'settings', 'signatures');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.logoUrl?.includes('printshopos.com') || !data.logoUrl) {
            data.logoUrl = window.location.origin + '/wovn-signature-logo.png';
          }
          setMarketingData(prev => ({ ...prev, ...data }));
        }
      } catch (error) {
        console.error("Error fetching signature settings:", error);
      } finally {
        setLoadingBanner(false);
      }
    };
    fetchGlobalMarketing();
  }, []);

  useEffect(() => {
    if (userData?.id) {
      const fetchPersonalDetails = async () => {
        try {
          const userDoc = await getDoc(doc(db, 'users', userData.id));
          if (userDoc.exists()) {
            const data = userDoc.data();
            let sigs = data.savedSignatures || [];
            
            // Migrate legacy flat signatureDetails if necessary
            if (sigs.length === 0 && data.signatureDetails) {
              sigs = [{ id: 'default', name: 'Main Signature', data: data.signatureDetails }];
            }
            
            if (sigs.length > 0) {
              setSavedSignatures(sigs);
              setActiveProfileId(sigs[0].id);
              setProfileName(sigs[0].name);
              setFormData(prev => ({ ...prev, ...sigs[0].data }));
            }
          }
        } catch (error) {
          console.error("Error loading personal signature details:", error);
        }
      };
      fetchPersonalDetails();
    }
  }, [userData?.id]);

  // Clear composite preview when source images change
  useEffect(() => {
    setCompositeUrl(null);
  }, [formData.profileImageUrl, marketingData.bannerImageUrl]);

  const handleSavePersonal = async () => {
    if (!userData?.id) return;
    setSavingPersonal(true);

    let updatedSigs = [...savedSignatures];
    const existingIndex = updatedSigs.findIndex(s => s.id === activeProfileId);
    
    if (existingIndex >= 0) {
      updatedSigs[existingIndex] = { ...updatedSigs[existingIndex], name: profileName, data: formData };
    } else {
      updatedSigs.push({ id: activeProfileId, name: profileName, data: formData });
    }

    try {
      await setDoc(doc(db, 'users', userData.id), { savedSignatures: updatedSigs }, { merge: true });
      setSavedSignatures(updatedSigs);
    } catch (error) {
      console.error("Error saving signature details:", error);
    } finally {
      setSavingPersonal(false);
    }
  };

  const handleCreateNewProfile = () => {
    const newId = Date.now().toString();
    setActiveProfileId(newId);
    setProfileName('New Profile');
    // Keeping current formData gives them a starting point instead of wiping it
  };

  const handleProfileChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setActiveProfileId(id);
    const sig = savedSignatures.find(s => s.id === id);
    if (sig) {
      setProfileName(sig.name);
      setFormData(prev => ({ ...prev, ...sig.data }));
    }
  };

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

  const generateCompositeAndCopy = async () => {
    if (!signatureRef.current) return;
    setGeneratingComposite(true);

    try {
      // Create a high-density canvas (Retina @3x scale) to prevent upscaling blur on large monitors
      const SCALE = 3;
      const canvas = document.createElement('canvas');
      canvas.width = 800 * SCALE;
      canvas.height = 280 * SCALE; // 200px banner + 80px overlap area underneath
      const ctx = canvas.getContext('2d');
      
      if (!ctx) throw new Error("Could not get canvas context");
      
      // Auto-scale all canvas math commands to seamlessly draw at the new high-res pixel density
      ctx.scale(SCALE, SCALE);
      
      // Fill background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 800, 280);

      // 1. Draw Banner Image
      const bannerImg = new Image();
      bannerImg.crossOrigin = "anonymous";
      bannerImg.src = marketingData.bannerImageUrl;
      
      await new Promise((resolve, reject) => {
        bannerImg.onload = resolve;
        bannerImg.onerror = () => reject(new Error("Failed to load banner for composite"));
      });
      
      // Calculate banner dimensions to cover 800x200
      const bRatio = Math.max(800 / bannerImg.width, 200 / bannerImg.height);
      const bWidth = bannerImg.width * bRatio;
      const bHeight = bannerImg.height * bRatio;
      const bX = (800 - bWidth) / 2;
      const bY = (200 - bHeight) / 2;
      
      // Draw banner with border radius approximation manually or just rectangular is fine for composite top
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(24, 0);
      ctx.lineTo(776, 0);
      ctx.quadraticCurveTo(800, 0, 800, 24);
      ctx.lineTo(800, 200);
      ctx.lineTo(0, 200);
      ctx.lineTo(0, 24);
      ctx.quadraticCurveTo(0, 0, 24, 0);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(bannerImg, bX, bY, bWidth, bHeight);
      ctx.restore();

      // 2. Draw Profile Image (overlapping)
      const profileImg = new Image();
      profileImg.crossOrigin = "anonymous";
      profileImg.src = formData.profileImageUrl;
      
      await new Promise((resolve, reject) => {
        profileImg.onload = resolve;
        profileImg.onerror = () => reject(new Error("Failed to load profile for composite"));
      });

      const centerX = 24 + 80; // Left padding 24, radius 80 => 104
      const centerY = 200; // Overlapping equally at the 200px banner cutoff
      
      // Draw white stroke circle background
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, 80, 0, Math.PI * 2);
      ctx.fillStyle = 'white';
      ctx.fill();
      
      // Draw image inside circle
      ctx.beginPath();
      ctx.arc(centerX, centerY, 75, 0, Math.PI * 2); // 5px border
      ctx.clip();
      
      // Calculate cover for profile
      const pRatio = Math.max(150 / profileImg.width, 150 / profileImg.height);
      const pWidth = profileImg.width * pRatio;
      const pHeight = profileImg.height * pRatio;
      let pX = centerX - pWidth / 2;
      let pY = centerY - pHeight / 2;
      
      if (formData.profileImageAlignment === 'top') {
        pY = centerY - 75;
      } else if (formData.profileImageAlignment === 'bottom') {
        pY = centerY + 75 - pHeight;
      }
      
      ctx.drawImage(profileImg, pX, pY, pWidth, pHeight);
      ctx.restore();

      // Export high-res canvas natively to compressed JPEG to optimize large dimensions footprint
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      if (!blob) throw new Error("Canvas export failed");
      
      const fileRef = ref(storage, `signatures/composites/${userData?.id}_${Date.now()}.jpg`);
      const uploadTask = uploadBytesResumable(fileRef, blob);
      
      await new Promise<void>((resolve, reject) => {
        uploadTask.on('state_changed', null, reject, () => resolve());
      });
      
      const downloadURL = await getDownloadURL(fileRef);
      
      // Force React to synchronously update the DOM with the new composite URL
      flushSync(() => {
        setCompositeUrl(downloadURL);
      });
      
      // Copy raw HTML string to completely bypass Chrome's visual layout engine converting % to fixed px
      if (!signatureRef.current) return;
      const htmlContent = signatureRef.current.outerHTML;
      const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
      const textBlob = new Blob([`Signature for ${formData.name}`], { type: 'text/plain' });
      
      try {
        const clipboardItem = new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob
        });
        await navigator.clipboard.write([clipboardItem]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy natively', err);
      }
      setGeneratingComposite(false);

    } catch (e) {
      console.error(e);
      alert("Failed to composite overlap image. Ensure your Firebase Storage allows CORS origin '*'");
      setGeneratingComposite(false);
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
              {/* Profile Switcher */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-2 pb-6 border-b border-brand-border">
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs font-medium text-brand-secondary uppercase tracking-wider">Active Profile</label>
                  <div className="flex gap-2">
                    <select 
                      value={activeProfileId}
                      onChange={handleProfileChange}
                      className="flex-1 px-3 py-2 bg-white border border-brand-border rounded-lg text-sm focus:ring-2 focus:ring-brand-primary outline-none"
                    >
                      {savedSignatures.map(s => (
                        <option key={s.id} value={s.id}>{s.name || 'Unnamed Profile'}</option>
                      ))}
                      {savedSignatures.length === 0 && <option value="default">Main Signature</option>}
                      {savedSignatures.length > 0 && !savedSignatures.find(s => s.id === activeProfileId) && (
                        <option value={activeProfileId}>{profileName}</option>
                      )}
                    </select>
                    <button 
                      onClick={handleCreateNewProfile}
                      className="px-3 py-2 bg-brand-bg border border-brand-border rounded-lg text-brand-secondary hover:text-brand-primary hover:bg-brand-muted transition-colors flex items-center justify-center shrink-0"
                      title="Create New Profile"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs font-medium text-brand-secondary uppercase tracking-wider">Profile Name</label>
                  <input 
                    type="text" 
                    value={profileName}
                    onChange={e => setProfileName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-brand-border rounded-lg text-sm focus:ring-2 focus:ring-brand-primary outline-none"
                    placeholder="e.g. Internal Comm"
                  />
                </div>
              </div>

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
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-brand-secondary font-medium">Framing:</span>
                    <select
                      value={formData.profileImageAlignment || 'center'}
                      onChange={e => setFormData({ ...formData, profileImageAlignment: e.target.value })}
                      className="text-xs px-2 py-1 bg-white border border-brand-border rounded outline-none cursor-pointer"
                    >
                      <option value="top">Top Aligned</option>
                      <option value="center">Center</option>
                      <option value="bottom">Bottom Aligned</option>
                    </select>
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
              <button 
                onClick={handleSavePersonal}
                disabled={savingPersonal}
                className="w-full mt-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {savingPersonal ? 'Saving Details...' : 'Save My Details'}
              </button>
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
                onClick={generateCompositeAndCopy}
                disabled={generatingComposite}
                className="flex items-center justify-center gap-2 px-6 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors shadow-sm disabled:opacity-50"
              >
                {generatingComposite ? <Loader2 size={16} className="animate-spin" /> : copied ? <CheckCircle size={16} className="text-green-400" /> : <Copy size={16} />}
                {generatingComposite ? 'Generating...' : copied ? 'Copied HTML!' : 'Copy Signature'}
              </button>
            </div>
            
            <div className="p-8 lg:p-12 flex-1 overflow-x-auto bg-gray-50 flex items-start justify-center min-h-[500px]">
              
              {/* Actual Signature HTML Structure */}
              <div 
                className="select-all bg-white relative p-6"
                style={{ width: '100%', minWidth: '100%', display: 'block' }}
              >
                {/* Email Clients require tables for structural guarantees */}
                <table 
                  ref={signatureRef}
                  cellPadding="0" 
                  cellSpacing="0" 
                  border={0} 
                  width="100%"
                  style={{ 
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                    width: '100%',
                    margin: '0',
                    backgroundColor: '#ffffff',
                    textAlign: 'left'
                  }}
                >
                  <tbody>
                    {/* Top Composite Row - This is only shown if composite exists */}
                    {compositeUrl ? (
                      <tr>
                        <td colSpan={2}>
                          <img 
                            src={compositeUrl}
                            alt="Signature Header"
                            width="100%"
                            style={{ 
                              display: 'block', 
                              width: '100%', 
                              height: 'auto',
                              borderTopLeftRadius: '24px',
                              borderTopRightRadius: '24px'
                            }}
                          />
                        </td>
                      </tr>
                    ) : (
                      /* Live Preview Row (Only visible until they hit copy) */
                      <tr>
                        <td colSpan={2} style={{ paddingBottom: '0' }}>
                           <div style={{ position: 'relative', width: '100%', aspectRatio: '800 / 280' }}>
                             {/* Mock overlap for the browser using modern CSS */}
                              <img 
                                src={marketingData.bannerImageUrl}
                                alt="Banner"
                                style={{ 
                                  display: 'block', 
                                  width: '100%', 
                                  height: '71.42%', // 200/280
                                  objectFit: 'cover',
                                  borderTopLeftRadius: '24px',
                                  borderTopRightRadius: '24px'
                                }}
                              />
                              <img 
                                src={formData.profileImageUrl}
                                alt="Profile"
                                style={{
                                  position: 'absolute',
                                  top: '42.85%', // (200 - 80) / 280
                                  left: '3%', // 24 / 800
                                  width: '20%', // 160 / 800
                                  height: '57.14%', // 160 / 280
                                  borderRadius: '50%',
                                  border: '5px solid white',
                                  backgroundColor: 'white',
                                  objectFit: 'cover',
                                  objectPosition: formData.profileImageAlignment === 'top' ? 'center top' : formData.profileImageAlignment === 'bottom' ? 'center bottom' : 'center center',
                                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                }}
                              />
                           </div>
                        </td>
                      </tr>
                    )}

                    {/* Details Row */}
                    <tr>
                      <td colSpan={2} valign="top" style={{ paddingLeft: '24px', paddingTop: compositeUrl ? '16px' : '0', textAlign: 'left' }}>
                        <h1 style={{ 
                          margin: '0 0 4px 0', 
                          fontSize: '28px', 
                          fontWeight: '700', 
                          color: '#000000',
                          letterSpacing: '-0.5px'
                        }}>
                          {formData.name}
                        </h1>
                        
                        <p style={{ 
                          margin: '0 0 2px 0', 
                          fontSize: '15px', 
                          color: '#4B5563',
                          fontWeight: '400'
                        }}>
                          {formData.title}
                        </p>
                        
                        <p style={{ 
                          margin: '0', 
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
                        <div style={{ marginBottom: '20px' }}>
                          <img 
                            src={marketingData.logoUrl} 
                            alt="WOVN" 
                            style={{ display: 'block', height: '40px', width: 'auto' }} 
                          />
                        </div>
                      </td>
                    </tr>
                    
                    {/* Footer Row */}
                    <tr>
                      <td colSpan={2} style={{ paddingTop: '16px', borderTop: '1px solid #E5E7EB' }}>
                        {/* Disclaimer Text */}
                        <div style={{ 
                          fontSize: '8px', 
                          color: '#9CA3AF', 
                          lineHeight: '1.4', 
                          textTransform: 'uppercase',
                          textAlign: 'left'
                        }}>
                          <strong style={{ display: 'block', marginBottom: '4px' }}>CONFIDENTIALITY NOTICE:</strong>
                          {marketingData.disclaimer}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {/* End Signature HTML Structure */}

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
