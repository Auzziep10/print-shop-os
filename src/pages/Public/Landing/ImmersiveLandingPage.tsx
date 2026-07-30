import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Upload, Loader2 } from 'lucide-react';
import { db, storage } from '../../../lib/firebase';
import { useAuth } from '../../../contexts/AuthContext';
import { ImmersiveLanding, type StorefrontSettingsShape } from './ImmersiveLanding';

const DEFAULT_SETTINGS: StorefrontSettingsShape = {
  logoText: 'INKTHEORY',
  announcement: '🔥 Free Standard Shipping on all orders above 50 units!',
  heroTitle: 'Better Apparel',
  heroSubtitle:
    'Choose a themed collection to design a cohesive line, or start from our curated basics.',
  contactPhone: '(888) 896-8607',
  email: 'hello@inktheory.studio',
};

/**
 * Prototype route (/start2) for the immersive landing direction.
 * Standalone on purpose — the live /start flow is untouched. CTAs hand off
 * to the existing quote flow via /start?mode=racks|basics.
 */
export function ImmersiveLandingPage() {
  const navigate = useNavigate();
  const { user, userData, signInWithGoogle, signOut } = useAuth();
  const [settings, setSettings] = useState<StorefrontSettingsShape>(DEFAULT_SETTINGS);
  const [currentTime, setCurrentTime] = useState('');
  const [isEditingStorefront, setIsEditingStorefront] = useState(false);
  const [editSettings, setEditSettings] = useState<StorefrontSettingsShape>(DEFAULT_SETTINGS);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);

  const isAdmin = true;

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'storefront'));
        if (snap.exists()) {
          const data = snap.data() as Partial<StorefrontSettingsShape>;
          if (!data.logoText || data.logoText === 'PRINT SHOP OS' || data.logoText === 'INK THEORY' || data.logoText === 'Custom Apparel') {
            data.logoText = 'INKTHEORY';
          }
          data.heroTitle = 'Better Apparel';
          setSettings((prev) => ({ ...prev, ...data }));
          setEditSettings((prev) => ({ ...prev, ...data }));
        }
      } catch (e) {
        console.error('Failed to load storefront settings', e);
      }
    };
    fetchSettings();
  }, []);

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

  const handleSaveStorefrontSettings = async () => {
    setIsSavingSettings(true);
    try {
      await setDoc(doc(db, 'settings', 'storefront'), editSettings, { merge: true });
      setSettings(editSettings);
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
          setEditSettings({ ...settings });
          setIsEditingStorefront(true);
        }}
        onPortal={() =>
          navigate(userData?.customerId ? `/portal/${userData.customerId}` : '/portal')
        }
        onAdminPanel={() => navigate('/orders')}
        onStart={() => navigate('/start?mode=racks')}
      />

      {isEditingStorefront && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-6 z-[200] animate-in fade-in duration-200">
          <div className="bg-white border border-neutral-200 rounded-3xl p-8 max-w-lg w-full space-y-6 shadow-2xl animate-in zoom-in-95 duration-200 text-zinc-950">
            <div>
              <h3 className="text-2xl font-serif text-zinc-950 flex items-center gap-2">
                Customize Storefront
              </h3>
              <p className="text-zinc-500 text-xs mt-1">
                Branding & video settings here update the storefront live across all pages.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-zinc-900">Shop / Logo Text</label>
                <input
                  type="text"
                  value={editSettings.logoText}
                  onChange={e => setEditSettings({ ...editSettings, logoText: e.target.value })}
                  className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-zinc-900">Announcement Bar</label>
                <input
                  type="text"
                  value={editSettings.announcement || ''}
                  onChange={e => setEditSettings({ ...editSettings, announcement: e.target.value })}
                  className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-zinc-900">Hero Title</label>
                <input
                  type="text"
                  value={editSettings.heroTitle || ''}
                  onChange={e => setEditSettings({ ...editSettings, heroTitle: e.target.value })}
                  className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-zinc-900">Hero Subtitle</label>
                <textarea
                  rows={2}
                  value={editSettings.heroSubtitle || ''}
                  onChange={e => setEditSettings({ ...editSettings, heroSubtitle: e.target.value })}
                  className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium resize-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-900">Hero Background Video</label>
                  <label className="text-xs font-bold text-zinc-900 bg-zinc-100 hover:bg-zinc-200 border border-zinc-300 px-3 py-1 rounded-lg cursor-pointer flex items-center gap-1.5 transition-all shadow-3xs">
                    {isUploadingVideo ? (
                      <>
                        <Loader2 className="animate-spin" size={12} />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <Upload size={12} />
                        <span>Upload Video File</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime,video/*"
                      className="hidden"
                      disabled={isUploadingVideo}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setIsUploadingVideo(true);
                        try {
                          const storageRef = ref(storage, `storefront_videos/${Date.now()}_${file.name}`);
                          await uploadBytes(storageRef, file);
                          const url = await getDownloadURL(storageRef);
                          setEditSettings(prev => ({ ...prev, heroVideoUrl: url }));
                        } catch (err) {
                          console.error("Failed to upload video file:", err);
                          alert("Failed to upload video file. Please try again.");
                        } finally {
                          setIsUploadingVideo(false);
                        }
                      }}
                    />
                  </label>
                </div>

                <input
                  type="url"
                  placeholder="https://... or click Upload Video File"
                  value={editSettings.heroVideoUrl || ''}
                  onChange={e => setEditSettings({ ...editSettings, heroVideoUrl: e.target.value })}
                  className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                />
                <div className="flex justify-between items-center text-[10px] text-neutral-400">
                  <span>Upload an MP4/WebM file or paste a direct video / YouTube URL.</span>
                  {editSettings.heroVideoUrl && (
                    <button
                      type="button"
                      onClick={() => setEditSettings({ ...editSettings, heroVideoUrl: '' })}
                      className="text-red-500 hover:underline font-semibold cursor-pointer"
                    >
                      Remove Video
                    </button>
                  )}
                </div>
              </div>
            </div>

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
                {isSavingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
