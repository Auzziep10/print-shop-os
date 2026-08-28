import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Upload, Loader2, Sparkles } from 'lucide-react';
import { db, storage } from '../../../lib/firebase';
import { useAuth } from '../../../contexts/AuthContext';
import { ImmersiveLanding, type StorefrontSettingsShape } from './ImmersiveLanding';
import { trackVisitorEvent } from '../../../lib/visitorTracking';

const DEFAULT_SETTINGS: StorefrontSettingsShape = {
  logoText: 'INKTHEORY',
  announcement: '🔥 Free Standard Shipping on all orders above 50 units!',
  heroBadge: '',
  heroTitle: 'Better Apparel',
  heroSubtitle: 'Choose a themed collection to design a cohesive line, or start from our curated basics.',
  heroPrimaryCta: 'Start your project',
  heroSecondaryCta: 'How it works',
  heroFooterTagline: 'Print · Embroidery · Cut & Sew',
  manifestoLabel: '( Our promise )',
  manifestoText: 'Your brand deserves better than clip-art on a blank. We turn logos into lookbooks — cohesive collections built on premium garments, designed by you in minutes and produced by people who print every day.',
  showDecorationSection: true,
  decorationLabel: '( The decoration )',
  decorationTitle: 'Better *Decoration*',
  decorationBody: 'State-of-the-Art Design Studio — built to provide design solutions to level up your brand.',
  decorationImageUrl: '',
  decorationBtnText: 'Book a Consultation',
  decorationBtnUrl: '',
  decorationFooterText: 'DTF · Screen Printing · Dye Sub · Embroidery · Vinyl',
  showInterludeSection: true,
  interludeLabel: '( What better looks like )',
  interludeText: 'Better blanks make better merch — every piece starts on a garment people actually want to wear.',
  showFinishSection: true,
  finishLabel: '( One logo )',
  finishTitle: 'One logo — *every finish*',
  finishBody: 'Upload your logo once. We match it across print, puff and stitch so every piece on the rack looks like family.',
  finishImageUrl: '',
  showSubscribe: true,
  subscribeTitle: 'Theory Trends',
  subscribeBody: 'Give your brand the edge.\nSubscribe to get notified on our latest products and trends.',
  subscribeBtnText: 'Subscribe',
  footerAbout:
    'INKTHEORY is a design and decoration studio built around one idea: brands deserve better. Better blanks, better design, better decoration and a better process — all handled in-house from concept through production.\n\nWe make the things your brand asks for, and solve the details it hasn’t thought of yet.',
  footerQuicklinks:
    'Our Story | #manifesto\nGallery | /gallery\nClient Portal | /portal\nShop | /shop\nContact | mailto:hello@inktheory.studio',
  footerCopyright: '© {year} INKTHEORY | Rio Rancho NM · Nashville TN | www.inktheory.studio',
  footerFacebookUrl: '',
  footerXUrl: '',
  footerInstagramUrl: '',
  showPaymentMarks: true,
  footerPaymentImageUrl: '',
  showFooterBadge: true,
  footerBadgeTopText: 'NM ORIGINAL',
  footerBadgeMainText: 'NO. 505',
  footerBadgeSubText: 'CERTIFIED',
  footerBadgeImageUrl: '',
  showStandardSection: true,
  standardLabel: '( Our standard )',
  standardStatement: 'What touches the garment matters.',
  standardTitle: 'Non-toxic\n*Certified*',
  standardBody: "Better Decoration shouldn't come with a toxic tradeoff",
  standardImageUrl: '',
  standardBadgeImageUrl: '',
  standardFooterText: 'Inks · Threads · Production · Air Quality · Press · Fabrics',
  showcaseLabel: '( The catalog )',
  showcaseTitle: 'Built on premium blanks',
  showcaseSubtitle: 'Every category is curated Good / Better / Best — compare options side by side, then make them yours.',
  showcaseBadge: 'Good · Better · Best',
  showcaseFooterText: 'T-Shirt · Long Sleeve · Sweatshirts · Hats · Jackets · Accessories',
  rackCardTitle: 'Or design the *entire rack* at once.',
  rackCardBody: 'Hat, tee, polo, crewneck, hoodie and long sleeve — one cohesive collection, your branding on every piece.',
  rackCardBtnText: 'Design a cohesive line',
  processLabel: '( The process )',
  processTitle: 'From logo to loading dock',
  processSubtitle: 'Four steps. One portal. A human checks every order before it ever hits a press.',
  processStep1Title: 'Design',
  processStep1Body: 'Pick a themed rack or start from premium blanks. Your logo is placed instantly — move it, scale it, see it live on every garment.',
  processStep2Title: 'Quote',
  processStep2Body: 'Submit your build with sizes and dates. Our team reviews every detail and returns a formal quote — no guesswork, no hidden fees.',
  processStep3Title: 'Approve',
  processStep3Body: 'Create your account, approve your proof, and follow every status change from your client portal — current and future orders in one place.',
  processStep4Title: 'Production',
  processStep4Body: 'Printed, pressed and embroidered in-house, quality-checked piece by piece, and tracked from press to porch.',
  showCtaSection: true,
  showCtaHeading: false,
  ctaSectionLabel: '( Choose your path )',
  ctaSectionTitle: 'Start designing',
  ctaCardTitle: 'Design Your Rack',
  ctaCardBody: 'Configure a unified apparel collection with our standard 6-item rack — hat, tee, polo, crewneck, hoodie and long sleeve — all overlayed with your branding instantly.',
  ctaCardBtnText: 'Design a cohesive line',
  ctaCardImageUrl: '',
  ctaCardMobileImageUrl: '',
  contactPhone: '(888) 896-8607',
  email: 'hello@inktheory.studio',
  showGalleryNav: true,
};

export function ImmersiveLandingPage() {
  const navigate = useNavigate();
  const { user, userData, signInWithGoogle, signOut } = useAuth();
  const [settings, setSettings] = useState<StorefrontSettingsShape>(() => {
    try {
      const cached = localStorage.getItem('inktheory_storefront_settings');
      if (cached) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(cached) };
      }
    } catch (e) {
      // ignore
    }
    return DEFAULT_SETTINGS;
  });
  const [currentTime, setCurrentTime] = useState('');
  const [isEditingStorefront, setIsEditingStorefront] = useState(false);
  const [activeTab, setActiveTab] = useState<'branding' | 'hero' | 'manifesto' | 'sections' | 'showcase' | 'process' | 'cta'>('branding');
  const [editSettings, setEditSettings] = useState<StorefrontSettingsShape>(settings);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  const isAdmin = userData?.role === 'Admin';

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', 'storefront'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<StorefrontSettingsShape>;
          const merged = { ...DEFAULT_SETTINGS, ...data };
          setSettings(merged);
          try {
            localStorage.setItem('inktheory_storefront_settings', JSON.stringify(merged));
          } catch (e) {
            // ignore
          }
        }
      },
      (err) => {
        console.warn('Storefront settings realtime listener error:', err);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    trackVisitorEvent('Visited Landing Page', { step: 0, stepName: 'Landing (/)' });
  }, []);

  // Freeze the page behind the customizer: Lenis drives window scroll, so the
  // modal marks itself data-lenis-prevent and the body is locked while open.
  useEffect(() => {
    if (!isEditingStorefront) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('customizer-open');
    return () => {
      document.body.style.overflow = overflow;
      document.body.classList.remove('customizer-open');
    };
  }, [isEditingStorefront]);

  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(
        new Date().toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleFileUpload = async (file: File, fieldKey: string, isShowcaseItem?: string, isShowcaseHoverItem?: string) => {
    setUploadingField(fieldKey);
    try {
      const storageRef = ref(storage, `storefront_media/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      if (isShowcaseHoverItem) {
        setEditSettings(prev => ({
          ...prev,
          showcaseHoverImages: {
            ...(prev.showcaseHoverImages || {}),
            [isShowcaseHoverItem]: url
          }
        }));
      } else if (isShowcaseItem) {
        setEditSettings(prev => ({
          ...prev,
          showcaseImages: {
            ...(prev.showcaseImages || {}),
            [isShowcaseItem]: url
          }
        }));
      } else {
        setEditSettings(prev => ({ ...prev, [fieldKey]: url }));
      }
    } catch (err) {
      console.error(`Failed to upload ${fieldKey}:`, err);
      alert("Failed to upload file. Please try again.");
    } finally {
      setUploadingField(null);
    }
  };

  const handleSaveStorefrontSettings = async () => {
    setIsSavingSettings(true);
    try {
      await setDoc(doc(db, 'settings', 'storefront'), editSettings, { merge: true });
      setSettings(editSettings);
      try {
        localStorage.setItem('inktheory_storefront_settings', JSON.stringify(editSettings));
      } catch (e) {
        // ignore
      }
      setIsEditingStorefront(false);
    } catch (err) {
      console.error("Error saving storefront settings:", err);
      alert("Failed to save settings. Please try again.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <>
      <ImmersiveLanding
        settings={settings}
        user={user}
        userData={userData}
        canCustomize={isAdmin}
        currentTime={currentTime}
        onLogin={async () => {
          try {
            await signInWithGoogle();
          } catch (e) {
            console.error(e);
          }
        }}
        onSignOut={signOut}
        onCustomize={() => {
          setEditSettings({ ...DEFAULT_SETTINGS, ...settings });
          setIsEditingStorefront(true);
        }}
        onPortal={() =>
          navigate(userData?.customerId ? `/portal/${userData.customerId}` : '/portal')
        }
        onAdminPanel={() => navigate('/orders')}
        onStart={(mode) => {
          trackVisitorEvent('Clicked Start Project CTA', { step: 1, metadata: { mode: mode || 'types' } });
          navigate(`/start?mode=${mode || 'types'}`);
        }}
      />

      {isEditingStorefront && (
        <div
          data-lenis-prevent
          onWheel={(e) => e.stopPropagation()}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 z-[200] animate-in fade-in duration-200"
        >
          <div className="bg-white border border-neutral-200 rounded-3xl p-6 sm:p-8 max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 text-zinc-950">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
              <div>
                <h3 className="text-xl sm:text-2xl font-serif text-zinc-950 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  Site Customizer & Brand Editor
                </h3>
                <p className="text-zinc-500 text-xs mt-0.5">
                  Customize every text string, uploaded logo, category image, background video & CTA section.
                </p>
              </div>
              <button
                onClick={() => setIsEditingStorefront(false)}
                className="p-2 text-zinc-400 hover:text-zinc-950 hover:bg-zinc-100 rounded-full transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex flex-wrap gap-1.5 border-b border-neutral-100 py-3">
              {[
                { id: 'branding', label: 'Branding & Logo' },
                { id: 'hero', label: 'Hero Media & Copy' },
                { id: 'manifesto', label: 'Manifesto' },
                { id: 'sections', label: 'Photo Sections' },
                { id: 'showcase', label: 'Showcase Cards' },
                { id: 'process', label: 'Process Steps' },
                { id: 'cta', label: 'CTA & Footer' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-zinc-950 text-white shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Modal Body */}
            <div
              data-lenis-prevent
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-6 space-y-5 pr-2"
            >
              {/* TAB 1: BRANDING & LOGO */}
              {activeTab === 'branding' && (
                <div className="space-y-4">
                  {/* Brand Logo Upload */}
                  <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-zinc-900 block">Brand Logo Image</span>
                        <span className="text-[10px] text-zinc-500">Upload a custom PNG, SVG, or JPG logo file to display in header/footer.</span>
                      </div>
                      <label className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 shadow-xs transition-all">
                        {uploadingField === 'logoImageUrl' ? (
                          <>
                            <Loader2 className="animate-spin" size={13} />
                            <span>Uploading...</span>
                          </>
                        ) : (
                          <>
                            <Upload size={13} />
                            <span>Upload Logo File</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingField === 'logoImageUrl'}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFileUpload(f, 'logoImageUrl');
                          }}
                        />
                      </label>
                    </div>

                    {editSettings.logoImageUrl ? (
                      <div className="flex items-center justify-between p-3 bg-white border border-zinc-200 rounded-xl">
                        <img src={editSettings.logoImageUrl} alt="Uploaded logo" className="h-8 max-w-[160px] object-contain" />
                        <button
                          type="button"
                          onClick={() => setEditSettings({ ...editSettings, logoImageUrl: '' })}
                          className="text-xs text-red-500 hover:underline font-bold"
                        >
                          Remove Logo
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-zinc-400 italic">No custom image logo uploaded. Text logo fallback will be used.</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-zinc-900">Brand Logo Text</label>
                      <input
                        type="text"
                        value={editSettings.logoText}
                        onChange={e => setEditSettings({ ...editSettings, logoText: e.target.value })}
                        className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-zinc-900">Announcement Bar Text</label>
                      <input
                        type="text"
                        value={editSettings.announcement || ''}
                        onChange={e => setEditSettings({ ...editSettings, announcement: e.target.value })}
                        className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-zinc-900">Contact Email</label>
                      <input
                        type="email"
                        value={editSettings.email || ''}
                        onChange={e => setEditSettings({ ...editSettings, email: e.target.value })}
                        className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-zinc-900">Contact Phone</label>
                      <input
                        type="text"
                        value={editSettings.contactPhone || ''}
                        onChange={e => setEditSettings({ ...editSettings, contactPhone: e.target.value })}
                        className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                      />
                    </div>
                  </div>

                  {/* Lookbook Gallery Toggle */}
                  <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-zinc-900 block">Show Lookbook Gallery Link</span>
                      <span className="text-[10px] text-zinc-500">Toggle ON/OFF to show or hide Gallery links in header navigation, CTA section, and footer.</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editSettings.showGalleryNav !== false}
                        onChange={e => setEditSettings({ ...editSettings, showGalleryNav: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-950"></div>
                    </label>
                  </div>
                </div>
              )}

              {/* TAB 2: HERO MEDIA & COPY */}
              {activeTab === 'hero' && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-zinc-900">Hero Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Better Apparel"
                      value={editSettings.heroTitle || DEFAULT_SETTINGS.heroTitle || ''}
                      onChange={e => setEditSettings({ ...editSettings, heroTitle: e.target.value })}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-zinc-900">Hero Subtitle</label>
                    <textarea
                      rows={2}
                      value={editSettings.heroSubtitle || DEFAULT_SETTINGS.heroSubtitle || ''}
                      onChange={e => setEditSettings({ ...editSettings, heroSubtitle: e.target.value })}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium resize-none"
                    />
                  </div>

                  {/* Video Upload Box */}
                  <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-zinc-900 block">Background Hero Video</span>
                        <span className="text-[10px] text-zinc-500">Upload an MP4/WebM file or paste a direct video / YouTube URL.</span>
                      </div>
                      <label className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 shadow-xs transition-all">
                        {uploadingField === 'heroVideoUrl' ? (
                          <>
                            <Loader2 className="animate-spin" size={13} />
                            <span>Uploading...</span>
                          </>
                        ) : (
                          <>
                            <Upload size={13} />
                            <span>Upload Video File</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="video/mp4,video/webm,video/quicktime,video/*"
                          className="hidden"
                          disabled={uploadingField === 'heroVideoUrl'}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFileUpload(f, 'heroVideoUrl');
                          }}
                        />
                      </label>
                    </div>

                    <input
                      type="url"
                      placeholder="https://... or YouTube video link"
                      value={editSettings.heroVideoUrl || ''}
                      onChange={e => setEditSettings({ ...editSettings, heroVideoUrl: e.target.value })}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                    />
                  </div>

                  {/* Custom Hero Image Upload */}
                  <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-zinc-900 block">Custom Hero Background Image</span>
                        <span className="text-[10px] text-zinc-500">Upload a high-res image file to use if no video is selected.</span>
                      </div>
                      <label className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 shadow-xs transition-all">
                        {uploadingField === 'heroImageUrl' ? (
                          <>
                            <Loader2 className="animate-spin" size={13} />
                            <span>Uploading...</span>
                          </>
                        ) : (
                          <>
                            <Upload size={13} />
                            <span>Upload Image File</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingField === 'heroImageUrl'}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFileUpload(f, 'heroImageUrl');
                          }}
                        />
                      </label>
                    </div>

                    {editSettings.heroImageUrl && (
                      <div className="flex items-center justify-between p-2 bg-white border border-zinc-200 rounded-xl">
                        <img src={editSettings.heroImageUrl} alt="Hero bg" className="h-12 w-20 object-cover rounded-lg" />
                        <button
                          type="button"
                          onClick={() => setEditSettings({ ...editSettings, heroImageUrl: '' })}
                          className="text-xs text-red-500 hover:underline font-bold"
                        >
                          Remove Image
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-zinc-900">Primary Button Label</label>
                      <input
                        type="text"
                        placeholder="e.g. Start your project"
                        value={editSettings.heroPrimaryCta || DEFAULT_SETTINGS.heroPrimaryCta || ''}
                        onChange={e => setEditSettings({ ...editSettings, heroPrimaryCta: e.target.value })}
                        className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-zinc-900">Secondary Button Label</label>
                      <input
                        type="text"
                        placeholder="e.g. How it works"
                        value={editSettings.heroSecondaryCta || DEFAULT_SETTINGS.heroSecondaryCta || ''}
                        onChange={e => setEditSettings({ ...editSettings, heroSecondaryCta: e.target.value })}
                        className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-zinc-900">Bottom Hero Tagline (Under Buttons)</label>
                    <input
                      type="text"
                      placeholder="e.g. Print · Embroidery · Cut & Sew"
                      value={editSettings.heroFooterTagline ?? DEFAULT_SETTINGS.heroFooterTagline ?? ''}
                      onChange={e => setEditSettings({ ...editSettings, heroFooterTagline: e.target.value })}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                    />
                  </div>
                </div>
              )}

              {/* TAB 3: MANIFESTO */}
              {activeTab === 'manifesto' && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-zinc-900">Manifesto Eyebrow Label</label>
                    <input
                      type="text"
                      placeholder="e.g. ( Our promise )"
                      value={editSettings.manifestoLabel || DEFAULT_SETTINGS.manifestoLabel || ''}
                      onChange={e => setEditSettings({ ...editSettings, manifestoLabel: e.target.value })}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-zinc-900">Manifesto Brand Text</label>
                    <textarea
                      rows={6}
                      placeholder={'e.g. State-of-the-Art*ist*.\n\nWorldclass design + decoration studio -\nthat your brand can trust.'}
                      value={editSettings.manifestoText || DEFAULT_SETTINGS.manifestoText || ''}
                      onChange={e => setEditSettings({ ...editSettings, manifestoText: e.target.value })}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium resize-y"
                    />
                    <p className="text-[10px] text-zinc-500">
                      Line breaks are kept exactly as you type them — press Enter twice for a paragraph gap.
                      Wrap anything in *asterisks* to italicize it, even mid-word (Art*ist*).
                    </p>
                  </div>
                </div>
              )}

              {/* TAB: PHOTO SECTIONS (Decoration / Interlude / Finish) */}
              {activeTab === 'sections' && (
                <div className="space-y-4">
                  {/* Decoration feature */}
                  <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-zinc-900 block">Decoration Photo Section</span>
                        <span className="text-[10px] text-zinc-500">Full-screen photo feature after the manifesto. Use *word* in the title for italic accent.</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={editSettings.showDecorationSection !== false}
                          onChange={e => setEditSettings({ ...editSettings, showDecorationSection: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-950"></div>
                      </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Title — e.g. Better *Decoration*"
                        value={editSettings.decorationTitle || DEFAULT_SETTINGS.decorationTitle || ''}
                        onChange={e => setEditSettings({ ...editSettings, decorationTitle: e.target.value })}
                        className="bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium"
                      />
                      <input
                        type="text"
                        placeholder="Bottom strip — e.g. DTF · Screen Printing · Dye Sub..."
                        value={editSettings.decorationFooterText || DEFAULT_SETTINGS.decorationFooterText || ''}
                        onChange={e => setEditSettings({ ...editSettings, decorationFooterText: e.target.value })}
                        className="bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium"
                      />
                    </div>
                    <textarea
                      rows={2}
                      placeholder="Supporting copy..."
                      value={editSettings.decorationBody || DEFAULT_SETTINGS.decorationBody || ''}
                      onChange={e => setEditSettings({ ...editSettings, decorationBody: e.target.value })}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium resize-none"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Button label — e.g. Book a Consultation"
                        value={editSettings.decorationBtnText || DEFAULT_SETTINGS.decorationBtnText || ''}
                        onChange={e => setEditSettings({ ...editSettings, decorationBtnText: e.target.value })}
                        className="bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium"
                      />
                      <input
                        type="text"
                        placeholder="Button link (blank = starts the design flow)"
                        value={editSettings.decorationBtnUrl || ''}
                        onChange={e => setEditSettings({ ...editSettings, decorationBtnUrl: e.target.value })}
                        className="bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium"
                      />
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-zinc-500">Background photo (high-res, fills the screen)</span>
                      <label className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 shadow-xs transition-all">
                        {uploadingField === 'decorationImageUrl' ? (
                          <><Loader2 className="animate-spin" size={13} /><span>Uploading...</span></>
                        ) : (
                          <><Upload size={13} /><span>Upload Photo</span></>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingField === 'decorationImageUrl'}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFileUpload(f, 'decorationImageUrl');
                          }}
                        />
                      </label>
                    </div>
                    {editSettings.decorationImageUrl && (
                      <div className="flex items-center justify-between p-2 bg-white border border-zinc-200 rounded-xl">
                        <img src={editSettings.decorationImageUrl} alt="Decoration section" className="h-12 w-20 object-cover rounded-lg" />
                        <button
                          type="button"
                          onClick={() => setEditSettings({ ...editSettings, decorationImageUrl: '' })}
                          className="text-xs text-red-500 hover:underline font-bold"
                        >
                          Remove Photo
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Interlude statement */}
                  <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-zinc-900 block">Interlude Statement</span>
                        <span className="text-[10px] text-zinc-500">Big scroll-reveal line before the catalog cards ("Better blanks...").</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={editSettings.showInterludeSection !== false}
                          onChange={e => setEditSettings({ ...editSettings, showInterludeSection: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-950"></div>
                      </label>
                    </div>
                    <input
                      type="text"
                      placeholder="Eyebrow label — e.g. ( The blanks )"
                      value={editSettings.interludeLabel || DEFAULT_SETTINGS.interludeLabel || ''}
                      onChange={e => setEditSettings({ ...editSettings, interludeLabel: e.target.value })}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium"
                    />
                    <textarea
                      rows={3}
                      placeholder="Statement text — line breaks kept, *asterisks* italicize"
                      value={editSettings.interludeText || DEFAULT_SETTINGS.interludeText || ''}
                      onChange={e => setEditSettings({ ...editSettings, interludeText: e.target.value })}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium resize-y"
                    />
                  </div>

                  {/* Finish feature */}
                  <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-zinc-900 block">"One Logo — Every Finish" Section</span>
                        <span className="text-[10px] text-zinc-500">Copy + full-width photo after the catalog. Use *word* in the title for italic accent.</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={editSettings.showFinishSection !== false}
                          onChange={e => setEditSettings({ ...editSettings, showFinishSection: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-950"></div>
                      </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Eyebrow label — e.g. ( One logo )"
                        value={editSettings.finishLabel || DEFAULT_SETTINGS.finishLabel || ''}
                        onChange={e => setEditSettings({ ...editSettings, finishLabel: e.target.value })}
                        className="bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium"
                      />
                      <input
                        type="text"
                        placeholder="Title — e.g. One logo — *every finish*"
                        value={editSettings.finishTitle || DEFAULT_SETTINGS.finishTitle || ''}
                        onChange={e => setEditSettings({ ...editSettings, finishTitle: e.target.value })}
                        className="bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium"
                      />
                    </div>
                    <textarea
                      rows={2}
                      placeholder="Supporting copy..."
                      value={editSettings.finishBody || DEFAULT_SETTINGS.finishBody || ''}
                      onChange={e => setEditSettings({ ...editSettings, finishBody: e.target.value })}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium resize-none"
                    />
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-zinc-500">Full-width photo (the big tee shot)</span>
                      <label className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 shadow-xs transition-all">
                        {uploadingField === 'finishImageUrl' ? (
                          <><Loader2 className="animate-spin" size={13} /><span>Uploading...</span></>
                        ) : (
                          <><Upload size={13} /><span>Upload Photo</span></>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingField === 'finishImageUrl'}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFileUpload(f, 'finishImageUrl');
                          }}
                        />
                      </label>
                    </div>
                    {editSettings.finishImageUrl && (
                      <div className="flex items-center justify-between p-2 bg-white border border-zinc-200 rounded-xl">
                        <img src={editSettings.finishImageUrl} alt="Finish section" className="h-12 w-20 object-cover rounded-lg" />
                        <button
                          type="button"
                          onClick={() => setEditSettings({ ...editSettings, finishImageUrl: '' })}
                          className="text-xs text-red-500 hover:underline font-bold"
                        >
                          Remove Photo
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'sections' && (
                <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-zinc-900 block">"Non-toxic Certified" Section</span>
                      <span className="text-[10px] text-zinc-500">A statement line, then a full-screen photo panel. Sits after the tee photo, before the process steps.</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={editSettings.showStandardSection !== false}
                        onChange={e => setEditSettings({ ...editSettings, showStandardSection: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-950"></div>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Eyebrow — e.g. ( Our standard )"
                      value={editSettings.standardLabel ?? DEFAULT_SETTINGS.standardLabel ?? ''}
                      onChange={e => setEditSettings({ ...editSettings, standardLabel: e.target.value })}
                      className="bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium"
                    />
                    <input
                      type="text"
                      placeholder="Statement — e.g. What touches the garment matters."
                      value={editSettings.standardStatement ?? DEFAULT_SETTINGS.standardStatement ?? ''}
                      onChange={e => setEditSettings({ ...editSettings, standardStatement: e.target.value })}
                      className="bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-zinc-500">
                      Big title — one line per row, *asterisks* italicize
                    </label>
                    <textarea
                      rows={2}
                      placeholder={'Non-toxic\n*Certified*'}
                      value={editSettings.standardTitle ?? DEFAULT_SETTINGS.standardTitle ?? ''}
                      onChange={e => setEditSettings({ ...editSettings, standardTitle: e.target.value })}
                      className="mt-1 w-full bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium resize-y"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Subtitle under the title"
                      value={editSettings.standardBody ?? DEFAULT_SETTINGS.standardBody ?? ''}
                      onChange={e => setEditSettings({ ...editSettings, standardBody: e.target.value })}
                      className="bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium"
                    />
                    <input
                      type="text"
                      placeholder="Bottom strip — Inks · Threads · Production..."
                      value={editSettings.standardFooterText ?? DEFAULT_SETTINGS.standardFooterText ?? ''}
                      onChange={e => setEditSettings({ ...editSettings, standardFooterText: e.target.value })}
                      className="bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium"
                    />
                  </div>

                  {[
                    { key: 'standardImageUrl' as const, label: 'Background photo (fills the panel)', btn: 'Upload Photo' },
                    { key: 'standardBadgeImageUrl' as const, label: 'Certification emblem (optional, sits by the title)', btn: 'Upload Emblem' },
                  ].map(({ key, label, btn }) => (
                    <div key={key} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-zinc-500">{label}</span>
                        <label className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 shadow-xs transition-all shrink-0">
                          {uploadingField === key ? (
                            <><Loader2 className="animate-spin" size={13} /><span>Uploading...</span></>
                          ) : (
                            <><Upload size={13} /><span>{btn}</span></>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploadingField === key}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleFileUpload(f, key);
                            }}
                          />
                        </label>
                      </div>
                      {editSettings[key] && (
                        <div className="flex items-center justify-between p-2 bg-white border border-zinc-200 rounded-xl">
                          <img src={editSettings[key]} alt="" className="h-12 w-20 object-contain" />
                          <button
                            type="button"
                            onClick={() => setEditSettings({ ...editSettings, [key]: '' })}
                            className="text-xs text-red-500 hover:underline font-bold"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 4: SHOWCASE CARDS */}
              {activeTab === 'showcase' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-zinc-900">Section Eyebrow Label</label>
                      <input
                        type="text"
                        placeholder="e.g. ( The catalog )"
                        value={editSettings.showcaseLabel || DEFAULT_SETTINGS.showcaseLabel || ''}
                        onChange={e => setEditSettings({ ...editSettings, showcaseLabel: e.target.value })}
                        className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-zinc-900">Section Title (big left title — use *word* for italic)</label>
                      <input
                        type="text"
                        placeholder="e.g. Better *Blanks*"
                        value={editSettings.showcaseTitle || DEFAULT_SETTINGS.showcaseTitle || ''}
                        onChange={e => setEditSettings({ ...editSettings, showcaseTitle: e.target.value })}
                        className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-zinc-900">Counter Caption (shown after "1 of {'{count}'}" under the title)</label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Blanks that set your brand apart."
                      value={editSettings.showcaseSubtitle || DEFAULT_SETTINGS.showcaseSubtitle || ''}
                      onChange={e => setEditSettings({ ...editSettings, showcaseSubtitle: e.target.value })}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-zinc-900">Default Card Pill Badge Text</label>
                      <input
                        type="text"
                        placeholder="e.g. Good · Better · Best"
                        value={editSettings.showcaseBadge || DEFAULT_SETTINGS.showcaseBadge || ''}
                        onChange={e => setEditSettings({ ...editSettings, showcaseBadge: e.target.value })}
                        className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-zinc-900">Bottom Category Strip Text</label>
                      <input
                        type="text"
                        placeholder="e.g. T-Shirt · Long Sleeve · Sweatshirts · Hats..."
                        value={editSettings.showcaseFooterText || DEFAULT_SETTINGS.showcaseFooterText || ''}
                        onChange={e => setEditSettings({ ...editSettings, showcaseFooterText: e.target.value })}
                        className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <span className="text-xs font-bold text-zinc-900 block mb-2">Category Cards: Primary & Hover Images & Badge Overrides</span>
                    <div className="grid grid-cols-1 gap-3">
                      {['T-Shirts', 'Sweatshirts', 'Hats', 'Polos', 'Jackets', 'Bags'].map((cat) => {
                        const currentImg = editSettings.showcaseImages?.[cat];
                        const currentHoverImg = editSettings.showcaseHoverImages?.[cat];
                        const currentBadge = editSettings.showcaseBadges?.[cat] || '';
                        return (
                          <div key={cat} className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <span className="text-xs font-bold text-zinc-900 block">{cat}</span>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {currentImg ? (
                                    <span className="text-[10px] text-emerald-600 font-semibold">Primary Active</span>
                                  ) : (
                                    <span className="text-[10px] text-zinc-400">Default primary image</span>
                                  )}
                                  <span className="text-zinc-300">•</span>
                                  {currentHoverImg ? (
                                    <span className="text-[10px] text-amber-600 font-semibold">Hover Image Active</span>
                                  ) : (
                                    <span className="text-[10px] text-zinc-400">No hover image</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                <label className="px-3 py-1 bg-zinc-900 hover:bg-zinc-800 text-white text-[11px] font-bold rounded-xl cursor-pointer flex items-center gap-1 shadow-xs transition-all shrink-0">
                                  {uploadingField === `showcase_${cat}` ? (
                                    <Loader2 className="animate-spin" size={12} />
                                  ) : (
                                    <Upload size={12} />
                                  )}
                                  <span>{currentImg ? 'Change Primary' : 'Upload Primary'}</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    disabled={uploadingField === `showcase_${cat}`}
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) handleFileUpload(f, `showcase_${cat}`, cat);
                                    }}
                                  />
                                </label>
                                <label className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold rounded-xl cursor-pointer flex items-center gap-1 shadow-xs transition-all shrink-0">
                                  {uploadingField === `showcase_hover_${cat}` ? (
                                    <Loader2 className="animate-spin" size={12} />
                                  ) : (
                                    <Upload size={12} />
                                  )}
                                  <span>{currentHoverImg ? 'Change Hover' : 'Upload Hover'}</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    disabled={uploadingField === `showcase_hover_${cat}`}
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) handleFileUpload(f, `showcase_hover_${cat}`, undefined, cat);
                                    }}
                                  />
                                </label>
                                {currentHoverImg && (
                                  <button
                                    type="button"
                                    title="Remove Hover Image"
                                    onClick={() => {
                                      const updated = { ...(editSettings.showcaseHoverImages || {}) };
                                      delete updated[cat];
                                      setEditSettings({ ...editSettings, showcaseHoverImages: updated });
                                    }}
                                    className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-[10px] font-bold rounded-xl transition-all"
                                  >
                                    Remove Hover
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-semibold text-zinc-500">Custom Badge Text (optional override)</label>
                              <input
                                type="text"
                                placeholder={`Default: ${editSettings.showcaseBadge || 'Good · Better · Best'}`}
                                value={currentBadge}
                                onChange={e => {
                                  const updated = { ...(editSettings.showcaseBadges || {}) };
                                  if (e.target.value.trim() === '') {
                                    delete updated[cat];
                                  } else {
                                    updated[cat] = e.target.value;
                                  }
                                  setEditSettings({ ...editSettings, showcaseBadges: updated });
                                }}
                                className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-1.5 text-xs font-medium"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Terminal Rack Card Customization */}
                  <div className="pt-2">
                    <div className="p-4 bg-amber-50/50 border border-amber-200/80 rounded-2xl space-y-3">
                      <div>
                        <span className="text-xs font-bold text-amber-950 block">Terminal Card (Full Rack CTA Card)</span>
                        <span className="text-[10px] text-amber-700">Customize the last card in the catalog carousel. Use *word* in title for italic accent.</span>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-zinc-900">Card Title</label>
                        <input
                          type="text"
                          placeholder="e.g. Or design the *entire rack* at once."
                          value={editSettings.rackCardTitle || DEFAULT_SETTINGS.rackCardTitle || ''}
                          onChange={e => setEditSettings({ ...editSettings, rackCardTitle: e.target.value })}
                          className="w-full bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium text-zinc-900"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-zinc-900">Card Description</label>
                        <textarea
                          rows={2}
                          placeholder="e.g. Hat, tee, polo, crewneck, hoodie and long sleeve — one cohesive collection..."
                          value={editSettings.rackCardBody || DEFAULT_SETTINGS.rackCardBody || ''}
                          onChange={e => setEditSettings({ ...editSettings, rackCardBody: e.target.value })}
                          className="w-full bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium text-zinc-900 resize-none"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-zinc-900">Card Button CTA Label</label>
                        <input
                          type="text"
                          placeholder="e.g. Design a cohesive line"
                          value={editSettings.rackCardBtnText || DEFAULT_SETTINGS.rackCardBtnText || ''}
                          onChange={e => setEditSettings({ ...editSettings, rackCardBtnText: e.target.value })}
                          className="w-full bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium text-zinc-900"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: PROCESS STEPS */}
              {activeTab === 'process' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-zinc-900">Process Label</label>
                      <input
                        type="text"
                        placeholder="e.g. ( The process )"
                        value={editSettings.processLabel || DEFAULT_SETTINGS.processLabel || ''}
                        onChange={e => setEditSettings({ ...editSettings, processLabel: e.target.value })}
                        className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-zinc-900">Process Title</label>
                      <input
                        type="text"
                        placeholder="e.g. From logo to loading dock"
                        value={editSettings.processTitle || DEFAULT_SETTINGS.processTitle || ''}
                        onChange={e => setEditSettings({ ...editSettings, processTitle: e.target.value })}
                        className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-zinc-900">Process Subtitle</label>
                    <input
                      type="text"
                      placeholder="e.g. Four steps. One portal. A human checks every order..."
                      value={editSettings.processSubtitle || DEFAULT_SETTINGS.processSubtitle || ''}
                      onChange={e => setEditSettings({ ...editSettings, processSubtitle: e.target.value })}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                    />
                  </div>

                  <div className="space-y-3 pt-2">
                    {[
                      { num: '01', titleKey: 'processStep1Title', bodyKey: 'processStep1Body', defaultTitle: 'Design' },
                      { num: '02', titleKey: 'processStep2Title', bodyKey: 'processStep2Body', defaultTitle: 'Quote' },
                      { num: '03', titleKey: 'processStep3Title', bodyKey: 'processStep3Body', defaultTitle: 'Approve' },
                      { num: '04', titleKey: 'processStep4Title', bodyKey: 'processStep4Body', defaultTitle: 'Production' },
                    ].map((step) => (
                      <div key={step.num} className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-2">
                        <span className="text-xs font-bold text-zinc-900 block">Step {step.num}</span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="text"
                            placeholder={step.defaultTitle}
                            value={(editSettings as any)[step.titleKey] || (DEFAULT_SETTINGS as any)[step.titleKey] || ''}
                            onChange={e => setEditSettings({ ...editSettings, [step.titleKey]: e.target.value })}
                            className="bg-white border border-neutral-200 rounded-xl px-3 py-1.5 text-xs font-bold"
                          />
                          <input
                            type="text"
                            placeholder="Step description body..."
                            value={(editSettings as any)[step.bodyKey] || (DEFAULT_SETTINGS as any)[step.bodyKey] || ''}
                            onChange={e => setEditSettings({ ...editSettings, [step.bodyKey]: e.target.value })}
                            className="sm:col-span-2 bg-white border border-neutral-200 rounded-xl px-3 py-1.5 text-xs font-medium"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 6: CTA & FOOTER */}
              {activeTab === 'cta' && (
                <div className="space-y-4">
                  <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-zinc-900 block">Show CTA Card</span>
                        <span className="text-[10px] text-zinc-500">The image card with the buttons, between the process steps and the footer.</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={editSettings.showCtaSection !== false}
                          onChange={e => setEditSettings({ ...editSettings, showCtaSection: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-950"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-zinc-200">
                      <div>
                        <span className="text-xs font-bold text-zinc-900 block">Show "Start Designing" Heading Band</span>
                        <span className="text-[10px] text-zinc-500">The black band with the eyebrow and title above the card. Currently hidden.</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={!!editSettings.showCtaHeading}
                          onChange={e => setEditSettings({ ...editSettings, showCtaHeading: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-950"></div>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-zinc-900">CTA Section Eyebrow Label</label>
                      <input
                        type="text"
                        placeholder="e.g. ( Choose your path )"
                        value={editSettings.ctaSectionLabel || DEFAULT_SETTINGS.ctaSectionLabel || ''}
                        onChange={e => setEditSettings({ ...editSettings, ctaSectionLabel: e.target.value })}
                        className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-zinc-900">CTA Section Title</label>
                      <input
                        type="text"
                        placeholder="e.g. Start designing"
                        value={editSettings.ctaSectionTitle || DEFAULT_SETTINGS.ctaSectionTitle || ''}
                        onChange={e => setEditSettings({ ...editSettings, ctaSectionTitle: e.target.value })}
                        className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3">
                    <span className="text-xs font-bold text-zinc-900 block">Rack CTA Card Settings</span>
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        placeholder="Card Title (e.g. Design Your Rack)"
                        value={editSettings.ctaCardTitle || DEFAULT_SETTINGS.ctaCardTitle || ''}
                        onChange={e => setEditSettings({ ...editSettings, ctaCardTitle: e.target.value })}
                        className="bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                      />
                      <textarea
                        rows={2}
                        placeholder="Card Description..."
                        value={editSettings.ctaCardBody || DEFAULT_SETTINGS.ctaCardBody || ''}
                        onChange={e => setEditSettings({ ...editSettings, ctaCardBody: e.target.value })}
                        className="bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium resize-none"
                      />
                      <input
                        type="text"
                        placeholder="Card Button Text (e.g. Design a cohesive line)"
                        value={editSettings.ctaCardBtnText || DEFAULT_SETTINGS.ctaCardBtnText || ''}
                        onChange={e => setEditSettings({ ...editSettings, ctaCardBtnText: e.target.value })}
                        className="bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-200">
                      <div>
                        <span className="text-xs font-bold text-zinc-900 block">CTA Card Background Image (Desktop)</span>
                        <span className="text-[10px] text-zinc-500">Upload a custom image for the CTA card background on desktop screens.</span>
                      </div>
                      <label className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 shadow-xs transition-all">
                        {uploadingField === 'ctaCardImageUrl' ? (
                          <>
                            <Loader2 className="animate-spin" size={12} />
                            <span>Uploading...</span>
                          </>
                        ) : (
                          <>
                            <Upload size={12} />
                            <span>Upload Image</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingField === 'ctaCardImageUrl'}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFileUpload(f, 'ctaCardImageUrl');
                          }}
                        />
                      </label>
                    </div>

                    {editSettings.ctaCardImageUrl && (
                      <div className="flex items-center justify-between p-2 bg-white border border-zinc-200 rounded-xl">
                        <img src={editSettings.ctaCardImageUrl} alt="CTA card bg" className="h-12 w-20 object-cover rounded-lg" />
                        <button
                          type="button"
                          onClick={() => setEditSettings({ ...editSettings, ctaCardImageUrl: '' })}
                          className="text-xs text-red-500 hover:underline font-bold"
                        >
                          Remove Image
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-200">
                      <div>
                        <span className="text-xs font-bold text-zinc-900 block">CTA Card Background Image (Mobile)</span>
                        <span className="text-[10px] text-zinc-500">Upload a custom image for the CTA card background on mobile screens.</span>
                      </div>
                      <label className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 shadow-xs transition-all">
                        {uploadingField === 'ctaCardMobileImageUrl' ? (
                          <>
                            <Loader2 className="animate-spin" size={12} />
                            <span>Uploading...</span>
                          </>
                        ) : (
                          <>
                            <Upload size={12} />
                            <span>Upload Mobile Image</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingField === 'ctaCardMobileImageUrl'}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFileUpload(f, 'ctaCardMobileImageUrl');
                          }}
                        />
                      </label>
                    </div>

                    {editSettings.ctaCardMobileImageUrl && (
                      <div className="flex items-center justify-between p-2 bg-white border border-zinc-200 rounded-xl">
                        <img src={editSettings.ctaCardMobileImageUrl} alt="CTA card mobile bg" className="h-12 w-20 object-cover rounded-lg" />
                        <button
                          type="button"
                          onClick={() => setEditSettings({ ...editSettings, ctaCardMobileImageUrl: '' })}
                          className="text-xs text-red-500 hover:underline font-bold"
                        >
                          Remove Mobile Image
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Footer Newsletter */}
                  <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-zinc-900 block">Footer Newsletter Signup</span>
                        <span className="text-[10px] text-zinc-500">The "Theory Trends" subscribe block in the footer. Signups save to the newsletter_signups collection.</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={editSettings.showSubscribe !== false}
                          onChange={e => setEditSettings({ ...editSettings, showSubscribe: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-950"></div>
                      </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Newsletter title — e.g. Theory Trends"
                        value={editSettings.subscribeTitle || DEFAULT_SETTINGS.subscribeTitle || ''}
                        onChange={e => setEditSettings({ ...editSettings, subscribeTitle: e.target.value })}
                        className="bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium"
                      />
                      <input
                        type="text"
                        placeholder="Button label — e.g. Subscribe"
                        value={editSettings.subscribeBtnText || DEFAULT_SETTINGS.subscribeBtnText || ''}
                        onChange={e => setEditSettings({ ...editSettings, subscribeBtnText: e.target.value })}
                        className="bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium"
                      />
                    </div>
                    <textarea
                      rows={2}
                      placeholder="Short pitch under the title..."
                      value={editSettings.subscribeBody || DEFAULT_SETTINGS.subscribeBody || ''}
                      onChange={e => setEditSettings({ ...editSettings, subscribeBody: e.target.value })}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium resize-y"
                    />
                  </div>

                  {/* Footer content */}
                  <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-3">
                    <div>
                      <span className="text-xs font-bold text-zinc-900 block">Footer — About Text</span>
                      <span className="text-[10px] text-zinc-500">Sits under the big wordmark. Leave a blank line between paragraphs.</span>
                    </div>
                    <textarea
                      rows={5}
                      placeholder="INKTHEORY is a design and decoration studio built around one idea..."
                      value={editSettings.footerAbout ?? DEFAULT_SETTINGS.footerAbout ?? ''}
                      onChange={e => setEditSettings({ ...editSettings, footerAbout: e.target.value })}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium resize-y"
                    />

                    <div>
                      <span className="text-xs font-bold text-zinc-900 block">Footer — Quicklinks</span>
                      <span className="text-[10px] text-zinc-500">
                        One per line as <code className="font-mono">Label | /path</code>. Use <code className="font-mono">/portal</code> for the client portal and <code className="font-mono">start</code> to open the design flow.
                      </span>
                    </div>
                    <textarea
                      rows={6}
                      placeholder={'Our Story | #manifesto\nGallery | /gallery\nClient Portal | /portal'}
                      value={editSettings.footerQuicklinks ?? DEFAULT_SETTINGS.footerQuicklinks ?? ''}
                      onChange={e => setEditSettings({ ...editSettings, footerQuicklinks: e.target.value })}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium font-mono resize-y"
                    />

                    <input
                      type="text"
                      placeholder="Copyright line — {year} is replaced automatically"
                      value={editSettings.footerCopyright ?? DEFAULT_SETTINGS.footerCopyright ?? ''}
                      onChange={e => setEditSettings({ ...editSettings, footerCopyright: e.target.value })}
                      className="w-full bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium"
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        placeholder="Facebook URL"
                        value={editSettings.footerFacebookUrl || ''}
                        onChange={e => setEditSettings({ ...editSettings, footerFacebookUrl: e.target.value })}
                        className="bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium"
                      />
                      <input
                        type="text"
                        placeholder="X / Twitter URL"
                        value={editSettings.footerXUrl || ''}
                        onChange={e => setEditSettings({ ...editSettings, footerXUrl: e.target.value })}
                        className="bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium"
                      />
                      <input
                        type="text"
                        placeholder="Instagram URL"
                        value={editSettings.footerInstagramUrl || ''}
                        onChange={e => setEditSettings({ ...editSettings, footerInstagramUrl: e.target.value })}
                        className="bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium"
                      />
                    </div>
                    <p className="text-[10px] text-zinc-500 -mt-1">Social icons only appear for the URLs you fill in.</p>

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-200">
                      <div>
                        <span className="text-xs font-bold text-zinc-900 block">Show Payment Marks</span>
                        <span className="text-[10px] text-zinc-500">Amex, Apple Pay, Diners, Discover, G Pay, Mastercard and Visa.</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={editSettings.showPaymentMarks !== false}
                          onChange={e => setEditSettings({ ...editSettings, showPaymentMarks: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-950"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-zinc-500">
                        Optional: upload your own marks strip to replace the built-in one
                      </span>
                      <label className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 shadow-xs transition-all shrink-0">
                        {uploadingField === 'footerPaymentImageUrl' ? (
                          <><Loader2 className="animate-spin" size={13} /><span>Uploading...</span></>
                        ) : (
                          <><Upload size={13} /><span>Upload Marks</span></>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingField === 'footerPaymentImageUrl'}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFileUpload(f, 'footerPaymentImageUrl');
                          }}
                        />
                      </label>
                    </div>
                    {editSettings.footerPaymentImageUrl && (
                      <div className="flex items-center justify-between p-2 bg-zinc-900 border border-zinc-200 rounded-xl">
                        <img src={editSettings.footerPaymentImageUrl} alt="Payment marks" className="h-6 object-contain" />
                        <button
                          type="button"
                          onClick={() => setEditSettings({ ...editSettings, footerPaymentImageUrl: '' })}
                          className="text-xs text-red-400 hover:underline font-bold"
                        >
                          Remove Marks Image
                        </button>
                      </div>
                    )}

                    {/* Certified badge */}
                    <div className="pt-2 border-t border-zinc-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-zinc-900 block">Certified Badge (footer center)</span>
                          <span className="text-[10px] text-zinc-500">Upload your own mark, or leave it blank to use the typeset version.</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={editSettings.showFooterBadge !== false}
                            onChange={e => setEditSettings({ ...editSettings, showFooterBadge: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-950"></div>
                        </label>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          placeholder="Top line — NM ORIGINAL"
                          value={editSettings.footerBadgeTopText ?? DEFAULT_SETTINGS.footerBadgeTopText ?? ''}
                          onChange={e => setEditSettings({ ...editSettings, footerBadgeTopText: e.target.value })}
                          className="bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium"
                        />
                        <input
                          type="text"
                          placeholder="Main — NO. 505"
                          value={editSettings.footerBadgeMainText ?? DEFAULT_SETTINGS.footerBadgeMainText ?? ''}
                          onChange={e => setEditSettings({ ...editSettings, footerBadgeMainText: e.target.value })}
                          className="bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium"
                        />
                        <input
                          type="text"
                          placeholder="Sub — CERTIFIED"
                          value={editSettings.footerBadgeSubText ?? DEFAULT_SETTINGS.footerBadgeSubText ?? ''}
                          onChange={e => setEditSettings({ ...editSettings, footerBadgeSubText: e.target.value })}
                          className="bg-white border border-neutral-200 rounded-xl px-3.5 py-2 text-xs font-medium"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-zinc-500">Badge image (optional, replaces the text above)</span>
                        <label className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 shadow-xs transition-all">
                          {uploadingField === 'footerBadgeImageUrl' ? (
                            <><Loader2 className="animate-spin" size={13} /><span>Uploading...</span></>
                          ) : (
                            <><Upload size={13} /><span>Upload Badge</span></>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploadingField === 'footerBadgeImageUrl'}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleFileUpload(f, 'footerBadgeImageUrl');
                            }}
                          />
                        </label>
                      </div>
                      {editSettings.footerBadgeImageUrl && (
                        <div className="flex items-center justify-between p-2 bg-white border border-zinc-200 rounded-xl">
                          <img src={editSettings.footerBadgeImageUrl} alt="Footer badge" className="h-10 object-contain" />
                          <button
                            type="button"
                            onClick={() => setEditSettings({ ...editSettings, footerBadgeImageUrl: '' })}
                            className="text-xs text-red-500 hover:underline font-bold"
                          >
                            Remove Badge
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="pt-4 border-t border-neutral-100 flex items-center justify-between gap-3">
              <button
                onClick={() => setIsEditingStorefront(false)}
                className="px-5 py-2.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStorefrontSettings}
                disabled={isSavingSettings}
                className="flex-1 py-2.5 bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold tracking-wide transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isSavingSettings ? 'Saving Settings...' : 'Save Storefront Settings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
