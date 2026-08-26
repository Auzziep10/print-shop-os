import { useEffect, useRef, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { Check, ImageIcon, Loader2, QrCode, Save, Trash2 } from 'lucide-react';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';

export interface ThankYouCardSettings {
  topImageUrl?: string;
  topImageOpacity?: number;    // 0-100
  bottomImageUrl?: string;
  bottomImageOpacity?: number; // 0-100
  studioQrUrl?: string;        // uploaded QR image (wins over studioLink)
  studioLink?: string;         // used to generate a QR when no image is set
}

export const DEFAULT_THANK_YOU_CARD: ThankYouCardSettings = {
  topImageUrl: '',
  topImageOpacity: 12,
  bottomImageUrl: '',
  bottomImageOpacity: 13,
  studioQrUrl: '',
  studioLink: 'https://quo.com',
};

export function ThankYouCardTab() {
  const [settings, setSettings] = useState<ThankYouCardSettings>(DEFAULT_THANK_YOU_CARD);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const inputs = {
    top: useRef<HTMLInputElement>(null),
    bottom: useRef<HTMLInputElement>(null),
    qr: useRef<HTMLInputElement>(null),
  };

  useEffect(() => {
    getDoc(doc(db, 'settings', 'thankYouCard'))
      .then(snap => {
        if (snap.exists()) {
          setSettings({ ...DEFAULT_THANK_YOU_CARD, ...(snap.data() as ThankYouCardSettings) });
        }
      })
      .catch(err => console.error('Failed to load thank you card settings:', err))
      .finally(() => setLoading(false));
  }, []);

  const persist = async (next: ThankYouCardSettings) => {
    setSettings(next);
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'thankYouCard'), {
        ...next,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      console.error('Failed to save thank you card settings:', err);
      alert('Could not save — please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    key: 'topImageUrl' | 'bottomImageUrl' | 'studioQrUrl',
    folder: string
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(key);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storageRef = ref(storage, `thank_you_card/${folder}/${Date.now()}_${safeName}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await persist({ ...settings, [key]: url });
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(null);
      e.target.value = '';
    }
  };

  const imageField = (
    label: string,
    hint: string,
    key: 'topImageUrl' | 'bottomImageUrl',
    opacityKey: 'topImageOpacity' | 'bottomImageOpacity',
    inputRef: React.RefObject<HTMLInputElement | null>,
    folder: string
  ) => {
    const url = settings[key];
    const opacity = settings[opacityKey] ?? 12;
    return (
      <div className="rounded-xl border border-brand-border bg-brand-bg/40 p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <label className={tokens.typography.label}>{label}</label>
            <p className="text-[11px] text-brand-secondary mt-0.5">{hint}</p>
          </div>
          {url && (
            <button
              onClick={() => persist({ ...settings, [key]: '' })}
              className="p-1.5 text-brand-secondary hover:text-red-600 transition-colors shrink-0"
              title="Remove image"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>

        <div
          onClick={() => inputRef.current?.click()}
          className="relative h-40 rounded-lg border border-dashed border-brand-border bg-white overflow-hidden cursor-pointer hover:border-brand-primary transition-colors flex items-center justify-center"
        >
          {url ? (
            <>
              {/* Preview at the same wash used on the printed card */}
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{
                  backgroundImage: `url('${url}')`,
                  filter: 'grayscale(1) brightness(1.5) contrast(0.85)',
                  opacity: opacity / 100,
                }}
              />
              <span className="relative text-[10px] font-bold uppercase tracking-widest text-brand-secondary bg-white/70 px-2 py-1 rounded">
                Click to replace
              </span>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-brand-secondary">
              {uploading === key ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
              <span className="text-xs">{uploading === key ? 'Uploading…' : 'Click to upload'}</span>
            </div>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleUpload(e, key, folder)}
        />

        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-semibold text-brand-secondary">Image strength</span>
            <span className="font-bold text-brand-primary">{opacity}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={60}
            value={opacity}
            onChange={(e) => setSettings(prev => ({ ...prev, [opacityKey]: parseInt(e.target.value) }))}
            onMouseUp={() => persist(settings)}
            onTouchEnd={() => persist(settings)}
            className="w-full accent-brand-primary cursor-pointer"
          />
          <p className="text-[10px] text-brand-secondary mt-1">
            Keep this low — the card's text sits directly on top of the photo.
          </p>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12 text-brand-secondary">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className={tokens.typography.h3}>Thank You Card</h3>
          <p className={tokens.typography.bodyMuted}>
            Artwork for the printable insert card (Order → Print Thank You Card).
          </p>
        </div>
        <span className="text-xs text-brand-secondary flex items-center gap-1.5 shrink-0 pt-1">
          {saving ? <><Loader2 size={13} className="animate-spin" /> Saving…</>
            : saved ? <><Check size={13} className="text-emerald-600" /> Saved</>
            : <><Save size={13} /> Saves automatically</>}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {imageField(
          'Top Panel Background',
          'Sits behind the "Thank you for supporting local" type.',
          'topImageUrl', 'topImageOpacity', inputs.top, 'top'
        )}
        {imageField(
          'Bottom Panel Background',
          'Your facility / studio photo.',
          'bottomImageUrl', 'bottomImageOpacity', inputs.bottom, 'bottom'
        )}
      </div>

      {/* Design Studio QR */}
      <div className="mt-4 rounded-xl border border-brand-border bg-brand-bg/40 p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <label className={tokens.typography.label}>Design Studio QR</label>
            <p className="text-[11px] text-brand-secondary mt-0.5">
              Upload your own QR image, or leave it empty and we'll generate one from the link below.
            </p>
          </div>
          {settings.studioQrUrl && (
            <button
              onClick={() => persist({ ...settings, studioQrUrl: '' })}
              className="p-1.5 text-brand-secondary hover:text-red-600 transition-colors shrink-0"
              title="Remove QR image"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div
            onClick={() => inputs.qr.current?.click()}
            className="w-28 h-28 shrink-0 rounded-lg border border-dashed border-brand-border bg-white flex items-center justify-center cursor-pointer hover:border-brand-primary transition-colors overflow-hidden"
          >
            {settings.studioQrUrl ? (
              <img src={settings.studioQrUrl} alt="Design Studio QR" className="w-full h-full object-contain p-1.5" />
            ) : (
              <div className="flex flex-col items-center gap-1.5 text-brand-secondary">
                {uploading === 'studioQrUrl' ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
                <span className="text-[10px]">{uploading === 'studioQrUrl' ? 'Uploading…' : 'Upload QR'}</span>
              </div>
            )}
          </div>
          <input
            ref={inputs.qr}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleUpload(e, 'studioQrUrl', 'qr')}
          />

          <div className="flex-1 min-w-[220px]">
            <label className={tokens.typography.label}>Booking Link (fallback QR)</label>
            <input
              className={tokens.components.input + ' mt-1.5 bg-white'}
              placeholder="https://quo.com/your-booking-link"
              value={settings.studioLink || ''}
              onChange={(e) => setSettings(prev => ({ ...prev, studioLink: e.target.value }))}
              onBlur={() => persist(settings)}
            />
          </div>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <PillButton variant="filled" onClick={() => persist(settings)} disabled={saving}>
          {saving ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Save size={14} className="mr-2" />}
          Save Changes
        </PillButton>
      </div>
    </div>
  );
}
