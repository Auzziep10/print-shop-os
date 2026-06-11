import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../../contexts/AuthContext';
import { ImmersiveLanding, type StorefrontSettingsShape } from './ImmersiveLanding';

const DEFAULT_SETTINGS: StorefrontSettingsShape = {
  logoText: 'Custom Apparel',
  announcement: '🔥 Free Standard Shipping on all orders above 50 units!',
  heroTitle: 'Custom Apparel Lookbook',
  heroSubtitle:
    'Choose a themed collection to design a cohesive line, or start from our curated basics.',
  contactPhone: '(888) 896-8607',
  email: 'hello@inktheory.com',
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

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'storefront'));
        if (snap.exists()) {
          const data = snap.data() as Partial<StorefrontSettingsShape>;
          if (data.logoText === 'PRINT SHOP OS' || data.logoText === 'INK THEORY') {
            data.logoText = 'Custom Apparel';
          }
          setSettings((prev) => ({ ...prev, ...data }));
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

  return (
    <ImmersiveLanding
      settings={settings}
      user={user}
      userData={userData}
      canCustomize={false}
      currentTime={currentTime}
      onLogin={async () => {
        try {
          await signInWithGoogle();
        } catch (e) {
          console.error(e);
        }
      }}
      onSignOut={signOut}
      onCustomize={() => {}}
      onPortal={() =>
        navigate(userData?.customerId ? `/portal/${userData.customerId}` : '/portal')
      }
      onAdminPanel={() => navigate('/orders')}
      onStart={(mode) => navigate(`/start?mode=${mode}`)}
    />
  );
}
