import { useState, useRef, useMemo, useEffect } from 'react';
import { 
  ArrowRight, 
  ArrowLeft,
  Upload, 
  Shirt, 
  CheckCircle, 
  Check, 
  Loader2,
  Lock,
  FileText,
  Sparkles,
  Settings,
  Phone,
  ChevronLeft,
  X,
  CheckSquare,
  Square,
  Scissors,
  UserPlus
} from 'lucide-react';
import { db, storage } from '../../lib/firebase';
import { doc, getDoc, setDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { PillButton } from '../../components/ui/PillButton';
import sanmarCatalogJson from '../../data/sanmar-catalog.json';
import colorHexMapJson from '../../data/color-hex-map.json';

const colorHexMap = colorHexMapJson as Record<string, string>;

interface SanMarProduct {
  style: string;
  title: string;
  brand: string;
  description: string;
  category: string;
  price: number;
  colors: string[];
  images: Record<string, { front: string; back: string; swatch: string } | string | undefined>;
}

const sanmarCatalog = sanmarCatalogJson as SanMarProduct[];

const baseColors: Record<string, string> = {
  white: "#FFFFFF",
  snow: "#FBFBF9",
  bone: "#E3DAC9",
  cream: "#FFFDD0",
  alabaster: "#FAFAFA",
  marshmallow: "#F8F8F8",
  oatmeal: "#EAE6DF",
  cement: "#C5C6C6",
  ash: "#E5E7EB",
  silver: "#D1D5DB",
  heather: "#B0B5BC",
  athletic: "#B0B5BC",
  grey: "#808080",
  gray: "#808080",
  stone: "#8B8682",
  pebble: "#8F8E8A",
  graphite: "#3E424B",
  charcoal: "#36383E",
  carbon: "#2F3136",
  slate: "#708090",
  steel: "#7D848B",
  aluminum: "#A9ACB6",
  alumninum: "#A9ACB6",
  quarry: "#7A8187",
  smoke: "#8A95A5",
  black: "#1A1A1A",
  dark: "#1A1A1A",
  onyx: "#0F0F0F",
  coal: "#2A2A2A",
  obsidian: "#121212",
  navy: "#0A1128",
  patriot: "#0D1B2A",
  royal: "#0F4C81",
  blue: "#1E3A8A",
  columbia: "#87B2DA",
  sky: "#87CEEB",
  carolina: "#799FCB",
  cyan: "#00FFFF",
  aqua: "#00FFFF",
  turquoise: "#30D5C8",
  teal: "#008080",
  ice: "#DDF2FD",
  denim: "#2F4F4F",
  indigo: "#4B0082",
  parcel: "#1E507F",
  red: "#B91C1C",
  cardinal: "#800020",
  maroon: "#581845",
  crimson: "#990000",
  burgundy: "#800020",
  berry: "#8A1C14",
  plum: "#4D002B",
  cherry: "#D21F3C",
  flame: "#E2583E",
  rust: "#B7410E",
  pink: "#EC4899",
  rose: "#F43F5E",
  coral: "#FF7F50",
  peach: "#FFDAB9",
  apricot: "#FBCEB1",
  green: "#15803D",
  kelly: "#16A34A",
  emerald: "#047857",
  mint: "#A7F3D0",
  loden: "#3F6212",
  olive: "#556B2F",
  spruce: "#1E3F20",
  sage: "#9CAF88",
  hunter: "#355E3B",
  army: "#4B5320",
  forest: "#228B22",
  lime: "#84CC16",
  yellow: "#FACC15",
  gold: "#D97706",
  vegas: "#C5B358",
  amber: "#FFBF00",
  orange: "#F97316",
  tangerine: "#F28500",
  copper: "#B87333",
  bronze: "#CD7F32",
  mustard: "#FFDB58",
  purple: "#7C3AED",
  lavender: "#E9D5FF",
  violet: "#8F00FF",
  brown: "#451A03",
  chocolate: "#451A03",
  tan: "#D2B48C",
  khaki: "#C3B091",
  sand: "#C2B280",
  camel: "#C19A6B",
  biscuit: "#DEC49E",
  caramel: "#C68A4C",
  coffee: "#4B3621",
  mink: "#8A7F73",
  duck: "#966036"
};

function resolveSingleColor(part: string): string {
  const normalized = part.toLowerCase().trim();
  for (const [key, hex] of Object.entries(colorHexMap)) {
    if (key.toLowerCase() === normalized) return hex;
  }
  for (const [key, hex] of Object.entries(colorHexMap)) {
    const keyLower = key.toLowerCase();
    if (keyLower.includes(normalized) || normalized.includes(keyLower)) return hex;
  }
  if (baseColors[normalized]) return baseColors[normalized];
  for (const [key, hex] of Object.entries(baseColors)) {
    if (key.includes(' ') && normalized.includes(key)) return hex;
  }
  for (const [key, hex] of Object.entries(baseColors)) {
    if (!key.includes(' ') && normalized.includes(key)) return hex;
  }
  return "#D1D5DB";
}

export function getSwatchColor(colorName: string, returnGradient = false): string {
  if (!colorName) return "#D1D5DB";
  const parts = colorName.split('/').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return "#D1D5DB";
  const colors = parts.map(resolveSingleColor);
  if (!returnGradient || colors.length === 1) return colors[0];
  if (colors.length === 2) return `linear-gradient(135deg, ${colors[0]} 50%, ${colors[1]} 50%)`;
  if (colors.length === 3) return `linear-gradient(135deg, ${colors[0]} 33%, ${colors[1]} 33%, ${colors[1]} 66%, ${colors[2]} 66%)`;
  return colors[0];
}

const DEFAULT_RACKS = {
  Athleisure: { hat: 'STC70', shirt: 'BC3001', polo: 'ST640', crewneck: 'DT1304', hoodie: 'BC3719', longsleeve: 'BC3501' },
  Casual: { hat: '112', shirt: '64000', polo: '64800', crewneck: 'SF000', hoodie: '18500', longsleeve: '6014' },
  Formal: { hat: 'C402', shirt: 'BC3001', polo: 'K500', crewneck: 'DT1304', hoodie: '996M', longsleeve: 'BC3501' },
  Active: { hat: 'STC70', shirt: 'BC3001', polo: 'ST550', crewneck: 'S6000', hoodie: 'DT6100', longsleeve: '29LS' },
  Business: { hat: 'C402', shirt: 'K810', polo: 'K810', crewneck: 'DT1304', hoodie: 'BC3719', longsleeve: '6014' },
  'Work Wear': { hat: '212', shirt: '5000', polo: 'K420', crewneck: '562M', hoodie: '18500', longsleeve: '6014' },
  Outdoor: { hat: '112', shirt: 'BC3001', polo: 'K110', crewneck: '1566', hoodie: 'DT6100', longsleeve: '6014' },
  Team: { hat: '112', shirt: '64000', polo: 'ST665', crewneck: 'S6000', hoodie: '996M', longsleeve: '29LS' }
};

const DEFAULT_BASICS = {
  'T-Shirts': { good: '5000', better: '64000', best: 'BC3001' },
  Tanks: { good: 'BC8803', better: 'BC8800', best: '9360' },
  LS: { good: '29LS', better: 'BC3501', best: '6014' },
  Sweatshirt: { good: '18000', better: '996M', best: 'DT6100' },
  Hoodie: { good: 'DT6100', better: '18500', best: 'BC3719' },
  Jacket: { good: 'L217', better: 'J317', best: 'J333' }
};

interface DesignRackItem {
  id: string;
  slot: string; // hat, shirt, polo, crewneck, hoodie, longsleeve
  product: SanMarProduct;
  color: string;
  selected: boolean;
  // Placements overrides
  logoPos: { x: number; y: number };
  logoScale: number;
  logoRotation: number;
  printSize: 'Small' | 'Medium' | 'Large';
  decoration: 'Print' | 'Embroidery';
}

interface TiltCardProps {
  children: React.ReactNode;
  className: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

function TiltCard({ 
  children, 
  className, 
  onClick,
  onMouseEnter, 
  onMouseLeave 
}: TiltCardProps) {
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Normalized coordinates (-0.5 to 0.5)
    const normX = (mouseX / width) - 0.5;
    const normY = (mouseY / height) - 0.5;
    
    // Calculate rotation angles (max 8 degrees)
    const rotX = -normY * 8;
    const rotY = normX * 8;
    
    cardRef.current.style.transform = `perspective(1200px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(1.01, 1.01, 1.01)`;
    setCoords({ x: mouseX, y: mouseY });
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (onMouseEnter) onMouseEnter();
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (cardRef.current) {
      cardRef.current.style.transform = `perspective(1200px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
    }
    if (onMouseLeave) onMouseLeave();
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      style={{
        transformStyle: 'preserve-3d',
        transition: isHovered ? 'transform 0.08s cubic-bezier(0.25, 1, 0.5, 1)' : 'transform 0.4s ease-out',
        willChange: 'transform',
        contain: 'paint',
        WebkitMaskImage: '-webkit-radial-gradient(white, black)',
      }}
      className={`${className} relative cursor-pointer overflow-hidden rounded-3xl border border-neutral-200/50 bg-[#EFECE4]`}
    >
      {/* Spotlight reflection sheen */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-0 transition-opacity duration-300 z-20"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(400px circle at ${coords.x}px ${coords.y}px, rgba(255, 255, 255, 0.3) 0%, transparent 80%)`,
        }}
      />
      {children}
    </div>
  );
}

export function PublicQuoteRequest() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, userData, signInWithGoogle, signOut } = useAuth();
  const isAdmin = userData?.role === 'Admin' || userData?.role === 'Leadership';

  // Core Flow Steps:
  // 0: Branching Landing (Design Your Rack vs Build Basics)
  // 1: Selection (Theme collections or Good/Better/Best items)
  // 2: Upload logo
  // 3: The Clothing Rack (Projected Lookbook & Individual Edits)
  // 4: Size spreadsheets & details
  // 5: Contact Details & checkout/submit
  const [step, setStep] = useState(0);
  const [flowMode, setFlowMode] = useState<'racks' | 'basics' | null>(null);
  const [currentTime, setCurrentTime] = useState('');
  const [hoveredPlatform, setHoveredPlatform] = useState<'racks' | 'basics' | null>(null);

  useEffect(() => {
    if (step !== 0) return;
    const updateTime = () => {
      const date = new Date();
      setCurrentTime(date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [step]);

  // Deep-link entry from the immersive landing prototype (/start2): ?mode=racks|basics
  useEffect(() => {
    const modeParam = searchParams.get('mode');
    if (modeParam === 'racks' || modeParam === 'basics') {
      setFlowMode(modeParam);
      setStep(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Firestore dynamic curations (loaded on mount)
  const [catalogSettings, setCatalogSettings] = useState<{
    racks: Record<string, any>;
    basics: Record<string, any>;
  }>({
    racks: DEFAULT_RACKS,
    basics: DEFAULT_BASICS
  });

  const [cart, setCart] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [paymentSuccessMsg, setPaymentSuccessMsg] = useState('');

  // Logo Designer Tab selection
  const [designerTab, setDesignerTab] = useState<'upload' | 'text' | 'clipart' | 'ai'>('upload');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [artworkName, setArtworkName] = useState<string | null>(null);
  const [originalArtworkUrl, setOriginalArtworkUrl] = useState<string | null>(null);
  const [originalFileUrl, setOriginalFileUrl] = useState<string | null>(null);
  
  // Tab details
  const [customText, setCustomText] = useState('');
  const [textFont, setTextFont] = useState('Modern');
  const [textColor, setTextColor] = useState('#1E1E1E');
  const [clipartColor, setClipartColor] = useState('#1E1E1E');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiStyle, setAiStyle] = useState('Minimalist Vector Logo');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // Design Your Rack selections
  const [selectedThemeCategory, setSelectedThemeCategory] = useState<string>('Athleisure');
  const [rackItems, setRackItems] = useState<DesignRackItem[]>([]);

  // Build From Basics selections
  const [selectedBasicsCategory, setSelectedBasicsCategory] = useState<string>('T-Shirts');
  const [selectedBasicsItem, setSelectedBasicsItem] = useState<SanMarProduct | null>(null);
  const [selectedBasicsColor, setSelectedBasicsColor] = useState<string>('');

  // Checkout inputs
  const [customerInfo, setCustomerInfo] = useState({
    companyName: '',
    contactName: '',
    emailAddress: '',
    phone: '',
    website: ''
  });
  const [budgetTier, setBudgetTier] = useState('Retail Standard');
  const [inHandsDate, setInHandsDate] = useState('');
  const [notes, setNotes] = useState('');

  // Single Item Canvas Editor modal details
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingItemIdx, setEditingItemIdx] = useState<number | null>(null);
  const [editViewMode, setEditViewMode] = useState<'front' | 'back'>('front');
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorLogoRef = useRef<any>(null);
  const dragStartOffset = useRef({ x: 0, y: 0 });

  // Storefront Settings from DB
  const [storefrontSettings, setStorefrontSettings] = useState({
    logoText: 'Custom Apparel',
    announcement: '🔥 Free Standard Shipping on all orders above 50 units!',
    heroTitle: 'Custom Apparel Lookbook',
    heroSubtitle: 'Choose a themed collection to design a cohesive line, or start from our curated basics.',
    contactPhone: '(888) 896-8607',
    email: 'hello@inktheory.com'
  });
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isEditingStorefront, setIsEditingStorefront] = useState(false);
  const [editSettings, setEditSettings] = useState({ ...storefrontSettings });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Color Remover Tool
  const [isColorRemoverOpen, setIsColorRemoverOpen] = useState(false);
  const [removerColorsToRemove, setRemoverColorsToRemove] = useState<string[]>([]);
  const [removerTolerance, setRemoverTolerance] = useState(30);
  const [removerExtracted, setRemoverExtracted] = useState<string[]>([]);
  const removerCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Fetch configs
  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        const storeRef = doc(db, 'settings', 'storefront');
        const storeSnap = await getDoc(storeRef);
        if (storeSnap.exists()) {
          const sData = storeSnap.data();
          if (sData.logoText === 'PRINT SHOP OS' || sData.logoText === 'INK THEORY') {
            sData.logoText = 'Custom Apparel';
          }
          if (sData.heroTitle === 'Ink Theory Custom Lookbook' || sData.heroTitle === 'Print Shop OS Custom Lookbook') {
            sData.heroTitle = 'Custom Apparel Lookbook';
          }
          setStorefrontSettings(prev => ({ ...prev, ...sData }));
          setEditSettings(prev => ({ ...prev, ...sData }));
        }

        const catRef = doc(db, 'settings', 'storefront-catalog');
        const catSnap = await getDoc(catRef);
        if (catSnap.exists()) {
          const cData = catSnap.data();
          setCatalogSettings({
            racks: cData.racks || DEFAULT_RACKS,
            basics: cData.basics || DEFAULT_BASICS
          });
        }
      } catch (err) {
        console.error("Error loading storefront configurations:", err);
      } finally {
        setIsLoadingSettings(false);
      }
    };
    fetchConfigs();
  }, []);

  // Stripe callback
  useEffect(() => {
    const successParam = searchParams.get('success');
    const sessionId = searchParams.get('session_id');
    const orderId = searchParams.get('order_id');

    if (successParam === 'true' && sessionId && orderId) {
      const verifyPayment = async () => {
        setIsVerifyingPayment(true);
        try {
          const res = await fetch('/api/stripe/verify-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId })
          });
          const data = await res.json();
          if (res.ok && data.paid) {
            await setDoc(doc(db, 'orders', orderId), {
              paymentStatus: 'paid',
              statusIndex: 4, 
              stripePaymentIntent: data.payment_intent || '',
              activities: [
                {
                  id: `act-${Date.now()}`,
                  type: 'system',
                  message: `Payment of $${((data.amount_total || 0) / 100).toFixed(2)} processed successfully via Stripe. Order moved to Sourcing.`,
                  user: 'Stripe Integration',
                  timestamp: new Date().toISOString()
                }
              ]
            }, { merge: true });

            setPaymentSuccessMsg(`Thank you! Your secure payment of $${((data.amount_total || 0) / 100).toFixed(2)} was received. You can now log into your Client Portal with Google Auth to monitor progress.`);
            setSuccess(true);
          } else {
            alert("Could not verify secure payment status. Please contact support.");
          }
        } catch (err) {
          console.error("Payment verification error:", err);
          alert("Error verifying payment.");
        } finally {
          setIsVerifyingPayment(false);
        }
      };
      verifyPayment();
    }
  }, [searchParams]);

  // Populates the selected theme rack
  const populateThemeRack = (themeName: string) => {
    const stylesMap = catalogSettings.racks[themeName] || DEFAULT_RACKS.Athleisure;
    const items: DesignRackItem[] = [];

    const slots = ['hat', 'shirt', 'polo', 'crewneck', 'hoodie', 'longsleeve'];

    slots.forEach(slot => {
      const styleId = (stylesMap as any)[slot];
      const prod = sanmarCatalog.find(p => p.style === styleId);
      if (prod) {
        // Smart defaults for placements
        const isHat = slot === 'hat';
        const isPolo = slot === 'polo';

        items.push({
          id: `${slot}-${Date.now()}`,
          slot,
          product: prod,
          color: prod.colors[0],
          selected: true,
          logoPos: isHat ? { x: 50, y: 55 } : isPolo ? { x: 38, y: 30 } : { x: 50, y: 35 },
          logoScale: isHat ? 0.16 : isPolo ? 0.14 : 0.28,
          logoRotation: 0,
          printSize: isHat ? 'Small' : isPolo ? 'Small' : 'Medium',
          decoration: (isHat || isPolo) ? 'Embroidery' : 'Print'
        });
      }
    });

    setRackItems(items);
  };

  // Populate rack when theme or mode changes
  useEffect(() => {
    if (flowMode === 'racks' && selectedThemeCategory) {
      populateThemeRack(selectedThemeCategory);
    }
  }, [flowMode, selectedThemeCategory, catalogSettings]);

  // Populate basics selection
  const preCuratedBasicsOptions = useMemo(() => {
    const styles = catalogSettings.basics[selectedBasicsCategory] || DEFAULT_BASICS['T-Shirts'];
    return {
      good: sanmarCatalog.find(p => p.style === styles.good),
      better: sanmarCatalog.find(p => p.style === styles.better),
      best: sanmarCatalog.find(p => p.style === styles.best)
    };
  }, [selectedBasicsCategory, catalogSettings]);

  // Set default color when basic product chosen
  useEffect(() => {
    if (selectedBasicsItem) {
      setSelectedBasicsColor(selectedBasicsItem.colors[0]);
    }
  }, [selectedBasicsItem]);

  const handleSaveStorefrontSettings = async () => {
    setIsSavingSettings(true);
    try {
      await setDoc(doc(db, 'settings', 'storefront'), editSettings, { merge: true });
      setStorefrontSettings(editSettings);
      setIsEditingStorefront(false);
    } catch (err) {
      console.error("Error saving settings:", err);
      alert("Failed to save settings.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Helper dominant colors
  const rgbToHex = (r: number, g: number, b: number) => {
    return "#" + [r, g, b].map(x => {
      const hex = Math.max(0, Math.min(255, x)).toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    }).join("").toUpperCase();
  };

  const extractDominantColors = (dataUrl: string) => {
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = 50;
        canvas.height = 50;
        ctx.drawImage(img, 0, 0, 50, 50);
        const imgData = ctx.getImageData(0, 0, 50, 50).data;
        const colorCounts: Record<string, number> = {};
        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i+1];
          const b = imgData[i+2];
          const a = imgData[i+3];
          if (a < 128) continue;
          const isWhite = r > 235 && g > 235 && b > 235;
          const isBlack = r < 20 && g < 20 && b < 20;
          if (isWhite || isBlack) continue;
          const roundedR = Math.round(r / 24) * 24;
          const roundedG = Math.round(g / 24) * 24;
          const roundedB = Math.round(b / 24) * 24;
          const hex = rgbToHex(roundedR, roundedG, roundedB);
          colorCounts[hex] = (colorCounts[hex] || 0) + 1;
        }
        const sortedColors = Object.entries(colorCounts)
          .sort((a, b) => b[1] - a[1])
          .map(entry => entry[0])
          .slice(0, 5);
        setRemoverExtracted(sortedColors);
      } catch (err) {
        console.error("Dominant color extraction error:", err);
      }
    };
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingLogo(true);
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const dUrl = event.target.result as string;
          setOriginalArtworkUrl(dUrl);
          extractDominantColors(dUrl);
        }
      };
      reader.readAsDataURL(file);

      const tempId = `logo_${Date.now()}`;
      const storageRef = ref(storage, `public_quotes/logos/${tempId}/${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setLogoUrl(url);
      setOriginalFileUrl(url);
      setArtworkName(file.name);
    } catch (err) {
      console.error('Logo upload failed', err);
      alert('Failed to upload logo image.');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  // Render text to file
  const renderTextToImage = () => {
    if (!customText.trim()) return;
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let fontStr = `bold 64px sans-serif`;
    if (textFont === 'Serif') fontStr = `bold 64px Georgia, serif`;
    else if (textFont === 'Collegiate') fontStr = `bold 80px "Impact", "Arial Black", sans-serif`;
    else if (textFont === 'Script') fontStr = `italic 70px "Brush Script MT", cursive`;
    else if (textFont === 'Modern') fontStr = `bold 72px "Outfit", sans-serif`;
    
    ctx.font = fontStr;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    if (textFont === 'Collegiate') {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 10;
      ctx.strokeText(customText, canvas.width / 2, canvas.height / 2);
      ctx.strokeStyle = textColor;
      ctx.lineWidth = 3;
      ctx.strokeText(customText, canvas.width / 2, canvas.height / 2);
    }
    ctx.fillText(customText, canvas.width / 2, canvas.height / 2);
    
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `text_${Date.now()}.png`, { type: 'image/png' });
      setIsUploadingLogo(true);
      try {
        const tempId = `text_${Date.now()}`;
        const storageRef = ref(storage, `public_quotes/logos/${tempId}/${file.name}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        setLogoUrl(url);
        setOriginalArtworkUrl(url);
        setOriginalFileUrl(url);
        setArtworkName(`Text: "${customText}"`);
      } catch (err) {
        console.error('Text upload failed', err);
      } finally {
        setIsUploadingLogo(false);
      }
    }, 'image/png');
  };

  const renderClipartToImage = (clipartKey: string, svgContent: string) => {
    const coloredSvg = svgContent.replace(/COLOR/g, clipartColor);
    const base64Svg = btoa(coloredSvg);
    const dataUrl = `data:image/svg+xml;base64,${base64Svg}`;
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, 512, 512);
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `clipart_${clipartKey.toLowerCase()}_${Date.now()}.png`, { type: 'image/png' });
        setIsUploadingLogo(true);
        try {
          const tempId = `clip_${Date.now()}`;
          const storageRef = ref(storage, `public_quotes/logos/${tempId}/${file.name}`);
          await uploadBytes(storageRef, file);
          const url = await getDownloadURL(storageRef);
          setLogoUrl(url);
          setOriginalArtworkUrl(url);
          setOriginalFileUrl(url);
          setArtworkName(`Clipart: ${clipartKey}`);
        } catch (err) {
          console.error(err);
        } finally {
          setIsUploadingLogo(false);
        }
      });
    };
  };

  const generateAiLogo = async () => {
    if (!aiPrompt.trim()) return;
    setIsGeneratingAi(true);
    try {
      const fullPrompt = `${aiPrompt}, ${aiStyle}, high resolution vector logo, isolated graphic on flat solid white background, 4k`;
      const encodedPrompt = encodeURIComponent(fullPrompt);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
      
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = `/api/sanmar/proxy-image?url=${encodeURIComponent(imageUrl)}`;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 512, 512);
        canvas.toBlob(async (blob) => {
          if (!blob) {
            setIsGeneratingAi(false);
            return;
          }
          const file = new File([blob], `ai_${Date.now()}.png`, { type: 'image/png' });
          const tempId = `ai_${Date.now()}`;
          const storageRef = ref(storage, `public_quotes/logos/${tempId}/${file.name}`);
          await uploadBytes(storageRef, file);
          const url = await getDownloadURL(storageRef);
          
          setLogoUrl(url);
          setOriginalArtworkUrl(url);
          setOriginalFileUrl(url);
          setArtworkName(`AI: "${aiPrompt}"`);
          setIsGeneratingAi(false);
        }, 'image/png');
      };
      img.onerror = () => {
        setIsGeneratingAi(false);
        alert("Failed to compile AI logo. Please try again.");
      };
    } catch (err) {
      console.error(err);
      setIsGeneratingAi(false);
    }
  };

  // Clipart SVGs
  const clipartSVGs: Record<string, string> = {
    Star: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="COLOR" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    Heart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="COLOR" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
    Shield: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="COLOR" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    Trophy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34"/><path d="M12 2a6 6 0 0 1 6 6v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8a6 6 0 0 1 6-6z" fill="COLOR"/></svg>`,
    Flame: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="COLOR" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
    Crown: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="COLOR" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/></svg>`,
    Lightning: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="COLOR" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    Coffee: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" fill="COLOR"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>`
  };

  // Color remover presets
  useEffect(() => {
    if (!isColorRemoverOpen || !originalArtworkUrl || !removerCanvasRef.current) return;
    const canvas = removerCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = originalArtworkUrl;
    img.onload = () => {
      canvas.width = img.naturalWidth || 512;
      canvas.height = img.naturalHeight || 512;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      if (removerColorsToRemove.length > 0) {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        const targets = removerColorsToRemove.map(hex => {
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          return { r, g, b };
        });
        const threshold = (removerTolerance / 100) * 180;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i+1];
          const b = data[i+2];
          const a = data[i+3];
          if (a === 0) continue;
          let shouldRemove = false;
          for (const target of targets) {
            const dist = Math.sqrt(Math.pow(r - target.r, 2) + Math.pow(g - target.g, 2) + Math.pow(b - target.b, 2));
            if (dist <= threshold) {
              shouldRemove = true;
              break;
            }
          }
          if (shouldRemove) data[i+3] = 0;
        }
        ctx.putImageData(imgData, 0, 0);
      }
    };
  }, [isColorRemoverOpen, originalArtworkUrl, removerColorsToRemove, removerTolerance]);

  const applyColorRemoverChanges = () => {
    const canvas = removerCanvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `remover_${Date.now()}.png`, { type: 'image/png' });
      setIsUploadingLogo(true);
      try {
        const tempId = `remover_${Date.now()}`;
        const storageRef = ref(storage, `public_quotes/logos/${tempId}/${file.name}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        setLogoUrl(url);
        setIsColorRemoverOpen(false);
      } catch (err) {
        console.error(err);
      } finally {
        setIsUploadingLogo(false);
      }
    }, 'image/png');
  };

  // Compile Canvas Mockup per item
  const compileGarmentMockup = (product: SanMarProduct, color: string, itemLogoUrl: string | null, logoPos: { x: number; y: number }, logoScale: number, logoRotation: number, side: 'front' | 'back', decoration: 'Print' | 'Embroidery'): Promise<string | null> => {
    return new Promise(async (resolve, reject) => {
      if (!product || !color) {
        resolve(null);
        return;
      }
      const imageSet = product.images[color] || Object.values(product.images)[0];
      const garmentImgUrl = imageSet ? (typeof imageSet === 'string' ? imageSet : imageSet[side]) : '';
      if (!itemLogoUrl) {
        resolve(garmentImgUrl);
        return;
      }
      try {
        const proxiedGarmentUrl = garmentImgUrl.startsWith('http')
          ? `/api/sanmar/proxy-image?url=${encodeURIComponent(garmentImgUrl)}`
          : garmentImgUrl;

        const loadImage = (src: string): Promise<HTMLImageElement> => {
          return new Promise((res, rej) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = src;
            img.onload = () => res(img);
            img.onerror = () => rej(new Error(`Failed to load image: ${src}`));
          });
        };

        const [gImg, lImg] = await Promise.all([
          loadImage(proxiedGarmentUrl),
          loadImage(itemLogoUrl)
        ]);

        const canvas = document.createElement('canvas');
        canvas.width = gImg.naturalWidth;
        canvas.height = gImg.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas 2D context error');
        }

        ctx.drawImage(gImg, 0, 0);

        // Constants map position
        const containerW = 480;
        const containerH = 600;
        const logoAspect = lImg.naturalHeight / lImg.naturalWidth;
        const uiLogoW = containerW * logoScale;

        const garmentAspect = gImg.naturalWidth / gImg.naturalHeight;
        const containerAspect = containerW / containerH;

        let renderedW = containerW;
        let renderedH = containerH;
        let offsetX = 0;
        let offsetY = 0;

        if (garmentAspect > containerAspect) {
          renderedW = containerW;
          renderedH = containerW / garmentAspect;
          offsetY = (containerH - renderedH) / 2;
        } else {
          renderedH = containerH;
          renderedW = containerH * garmentAspect;
          offsetX = (containerW - renderedW) / 2;
        }

        const logoCenterXInImage = (logoPos.x / 100) * containerW - offsetX;
        const logoCenterYInImage = (logoPos.y / 100) * containerH - offsetY;

        const scaleFactor = canvas.width / renderedW;
        const canvasCenterX = logoCenterXInImage * scaleFactor;
        const canvasCenterY = logoCenterYInImage * scaleFactor;

        const canvasLogoW = uiLogoW * scaleFactor;
        const canvasLogoH = canvasLogoW * logoAspect;

        ctx.save();
        ctx.translate(canvasCenterX, canvasCenterY);
        ctx.rotate((logoRotation * Math.PI) / 180);

        // Smart decoration effect
        if (decoration === 'Embroidery') {
          // Subtle stitch shadow/emboss
          ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
          ctx.shadowBlur = 4;
          ctx.shadowOffsetX = 1.5;
          ctx.shadowOffsetY = 1.5;
        }

        // CSS Blend Modes logic translated to canvas operations
        // If color of garment is dark, we overlay/lighten, else multiply/darken
        const isGarmentDark = ['black', 'dark', 'navy', 'patriot', 'charcoal', 'graphite', 'carbon', 'obsidian', 'maroon', 'cardinal', 'burgundy'].some(c => color.toLowerCase().includes(c));
        if (isGarmentDark) {
          ctx.globalCompositeOperation = 'source-over';
        } else {
          ctx.globalCompositeOperation = 'multiply';
        }

        ctx.drawImage(lImg, -canvasLogoW / 2, -canvasLogoH / 2, canvasLogoW, canvasLogoH);
        ctx.restore();

        canvas.toBlob(async (blob) => {
          if (!blob) {
            reject(new Error('Canvas conversion to blob failed'));
            return;
          }
          const mockupId = `mockup_${Date.now()}`;
          const fileRef = ref(storage, `public_quotes/mockups/${mockupId}.png`);
          await uploadBytes(fileRef, blob, { contentType: 'image/png' });
          const finalDownloadUrl = await getDownloadURL(fileRef);
          resolve(finalDownloadUrl);
        }, 'image/png');
      } catch (err) {
        console.error(err);
        reject(err);
      }
    });
  };

  // Compile all selected mockups and load to cart
  const compileLookbookToCart = async () => {
    if (!logoUrl) {
      alert("Please upload a logo first to build your lookbook rack.");
      return;
    }
    setIsSubmitting(true);
    try {
      const itemsToCompile = flowMode === 'racks' 
        ? rackItems.filter(i => i.selected)
        : [
            {
              product: selectedBasicsItem!,
              color: selectedBasicsColor,
              logoPos: { x: 50, y: 35 },
              logoScale: 0.28,
              logoRotation: 0,
              printSize: 'Medium' as const,
              decoration: ['hat', 'cap', 'polo'].some(w => selectedBasicsItem!.category.toLowerCase().includes(w)) ? 'Embroidery' as const : 'Print' as const
            }
          ];

      if (itemsToCompile.length === 0) {
        alert("Please select at least one garment from the rack to customize.");
        setIsSubmitting(false);
        return;
      }

      const compiledCartItems = [];

      for (const item of itemsToCompile) {
        // Compile front mockup
        const fMockup = await compileGarmentMockup(
          item.product,
          item.color,
          logoUrl,
          item.logoPos,
          item.logoScale,
          item.logoRotation,
          'front',
          item.decoration
        );

        // Default sizing matrix
        const defaultSizes = { XS: 0, S: 10, M: 15, L: 15, XL: 10, '2XL': 0, '3XL': 0 };
        const totalQty = Object.values(defaultSizes).reduce((acc, v) => acc + v, 0);

        // Pricing Matrix
        let multiplier = 1.00;
        if (totalQty < 12) multiplier = 1.50;
        else if (totalQty < 24) multiplier = 1.20;
        else if (totalQty < 50) multiplier = 1.00;
        else if (totalQty < 100) multiplier = 0.85;
        else if (totalQty < 250) multiplier = 0.75;
        else multiplier = 0.65;

        const baseVal = item.product.price * multiplier;
        let decorationCost = item.decoration === 'Embroidery' ? 5.50 : 3.50;
        decorationCost *= multiplier;
        const finalUnitVal = baseVal + decorationCost;

        compiledCartItems.push({
          id: `cart-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          product: item.product,
          color: item.color,
          qty: totalQty,
          frontLogoUrl: logoUrl,
          frontOriginalFileUrl: originalFileUrl,
          frontArtworkName: artworkName,
          frontPrintSize: item.printSize,
          frontMockupUrl: fMockup,
          backLogoUrl: null,
          backMockupUrl: null,
          mockupUrl: fMockup || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200',
          decorationMethod: item.decoration,
          sizes: defaultSizes,
          pricingDetails: {
            base: baseVal,
            front: decorationCost,
            back: 0,
            surcharge: 0,
            total: finalUnitVal,
            discountPct: Math.round((1 - multiplier) * 100)
          }
        });
      }

      setCart(compiledCartItems);
      setStep(4); // Sizing spreadsheet step
    } catch (err) {
      console.error(err);
      alert("Failed to build lookbook mockups. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };


  const updateCartItemSize = (itemId: string, size: string, val: number) => {
    setCart(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const newSizes = { ...item.sizes, [size]: val };
      const newQty = (Object.values(newSizes) as number[]).reduce((acc: number, v: number) => acc + (v || 0), 0);

      // Re-evaluate discount
      let multiplier = 1.00;
      if (newQty < 12) multiplier = 1.50;
      else if (newQty < 24) multiplier = 1.20;
      else if (newQty < 50) multiplier = 1.00;
      else if (newQty < 100) multiplier = 0.85;
      else if (newQty < 250) multiplier = 0.75;
      else multiplier = 0.65;

      const baseVal = item.product.price * multiplier;
      let decorationCost = item.decorationMethod === 'Embroidery' ? 5.50 : 3.50;
      decorationCost *= multiplier;
      const finalUnitVal = baseVal + decorationCost;

      return {
        ...item,
        sizes: newSizes,
        qty: newQty,
        pricingDetails: {
          base: baseVal,
          front: decorationCost,
          back: 0,
          surcharge: 0,
          total: finalUnitVal,
          discountPct: Math.round((1 - multiplier) * 100)
        }
      };
    }));
  };

  // Pointer Canvas Drag/Resize (Single Item Editor Modal)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (editingItemIdx === null) return;
    const target = e.target as HTMLElement;
    const isResize = target.closest('.resize-handle');
    if (isResize) {
      e.preventDefault();
      setIsResizing(true);
      target.setPointerCapture(e.pointerId);
      return;
    }
    if (!logoUrl || !editorContainerRef.current || !editorLogoRef.current) return;
    const logoRect = editorLogoRef.current.getBoundingClientRect();
    const clickX = e.clientX;
    const clickY = e.clientY;
    if (clickX >= logoRect.left && clickX <= logoRect.right && clickY >= logoRect.top && clickY <= logoRect.bottom) {
      e.preventDefault();
      setIsDragging(true);
      target.setPointerCapture(e.pointerId);
      const logoCenterX = logoRect.left + logoRect.width / 2;
      const logoCenterY = logoRect.top + logoRect.height / 2;
      dragStartOffset.current = { x: clickX - logoCenterX, y: clickY - logoCenterY };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (editingItemIdx === null || !editorContainerRef.current) return;
    const containerRect = editorContainerRef.current.getBoundingClientRect();

    if (isResizing) {
      const activeItem = rackItems[editingItemIdx];
      const logoCenterX = containerRect.left + (activeItem.logoPos.x / 100) * containerRect.width;
      const dx = Math.abs(e.clientX - logoCenterX);
      const newScale = (dx * 2) / containerRect.width;
      setRackItems(prev => prev.map((item, idx) => idx === editingItemIdx ? { ...item, logoScale: Math.max(0.05, Math.min(1.0, newScale)) } : item));
      return;
    }

    if (!isDragging) return;
    const activeItem = rackItems[editingItemIdx];
    const newCenterX = e.clientX - containerRect.left - dragStartOffset.current.x;
    const newCenterY = e.clientY - containerRect.top - dragStartOffset.current.y;
    let xPct = (newCenterX / containerRect.width) * 100;
    let yPct = (newCenterY / containerRect.height) * 100;
    // Bounding Box Printable Area
    const isHat = activeItem.slot === 'hat';
    xPct = Math.max(isHat ? 30 : 22, Math.min(isHat ? 70 : 78, xPct));
    yPct = Math.max(isHat ? 40 : 18, Math.min(isHat ? 70 : 78, yPct));
    setRackItems(prev => prev.map((item, idx) => idx === editingItemIdx ? { ...item, logoPos: { x: xPct, y: yPct } } : item));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    setIsResizing(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  // Submit quote request or start checkout
  const submitOrderOrCheckout = async (isPayNow: boolean) => {
    if (!customerInfo.contactName || !customerInfo.emailAddress) {
      alert("Please provide at least your Contact Name and Email Address.");
      return;
    }

    setIsSubmitting(true);
    try {
      const customerId = `cust-${Date.now()}`;
      const orderId = `quote-${Date.now()}`;

      // Create Customer record
      await setDoc(doc(db, 'customers', customerId), {
        id: customerId,
        company: customerInfo.companyName || '-',
        contactName: customerInfo.contactName,
        email: customerInfo.emailAddress,
        phone: customerInfo.phone || '-',
        website: customerInfo.website || '',
        type: 'Web Lead',
        createdAt: new Date().toISOString()
      });

      // Create Portal User Doc
      const userQuery = query(collection(db, 'users'), where('email', '==', customerInfo.emailAddress.toLowerCase()));
      const userSnapshot = await getDocs(userQuery);
      if (userSnapshot.empty) {
        const newUserRef = doc(collection(db, 'users'));
        await setDoc(newUserRef, {
          id: newUserRef.id,
          email: customerInfo.emailAddress.toLowerCase(),
          name: customerInfo.contactName,
          role: 'Client',
          customerId: customerId,
          phone: customerInfo.phone || '-',
          companyName: customerInfo.companyName || '-',
          website: customerInfo.website || '',
          createdAt: new Date().toISOString()
        });
      }

      // Generate incremental ID
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      
      const ordersQuery = query(collection(db, 'orders'), where('createdAt', '>=', todayStart.toISOString()), where('createdAt', '<=', todayEnd.toISOString()));
      const ordersSnapshot = await getDocs(ordersQuery);
      const yy = String(todayStart.getFullYear()).slice(-2);
      const mm = String(todayStart.getMonth() + 1).padStart(2, '0');
      const dd = String(todayStart.getDate()).padStart(2, '0');
      const prefix = `${yy}${mm}${dd}-`;

      let maxCount = 0;
      ordersSnapshot.forEach(docSnap => {
          const data = docSnap.data();
          if (data.portalId && data.portalId.startsWith(prefix)) {
             const suffix = data.portalId.split('-')[1];
             if (suffix) {
                const numericCount = parseInt(suffix, 10);
                if (!isNaN(numericCount) && numericCount > maxCount) {
                   maxCount = numericCount;
                }
             }
          }
      });
      const portalId = `${prefix}${maxCount + 1}`;

      const totalUnits = cart.reduce((acc, item) => acc + item.qty, 0);
      const estimatedTotalPrice = cart.reduce((acc, item) => acc + (item.pricingDetails.total * item.qty), 0);
      const averageEstimatedPricePerUnit = totalUnits > 0 ? (estimatedTotalPrice / totalUnits) : 0;
      const orderTitle = `${storefrontSettings.logoText} Quote for ${cart.map(item => `${item.product.brand} ${item.product.style}`).join(', ')}`;

      const payload = {
        id: orderId,
        portalId: portalId,
        customerId: customerId,
        title: orderTitle.length > 100 ? orderTitle.slice(0, 97) + '...' : orderTitle,
        statusIndex: isPayNow ? 3 : 0, 
        paymentStatus: isPayNow ? 'pending' : 'unpaid',
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric'}),
        createdAt: new Date().toISOString(),
        items: cart.map((item, idx) => ({
          id: Date.now() + idx,
          style: `${item.product.brand} ${item.product.style} - ${item.product.title.replace(/®/g, '').trim()}`,
          color: item.color || '',
          qty: item.qty,
          image: item.mockupUrl || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200',
          notes: '',
          sizes: item.sizes || {},
          price: item.pricingDetails.total,
          total: item.pricingDetails.total * item.qty,
          logos: [`Front: ${item.frontPrintSize} (${item.decorationMethod})`],
          artworks: [{ url: item.frontLogoUrl, originalUrl: item.frontOriginalFileUrl || item.frontLogoUrl, name: item.frontArtworkName || `Front_Logo` }]
        })),
        contactDetails: {
           name: customerInfo.contactName,
           email: customerInfo.emailAddress,
           phone: customerInfo.phone || ''
        },
        inHandsDate: inHandsDate,
        notes: notes,
        budgetTier: budgetTier,
        estimatedPricePerUnit: averageEstimatedPricePerUnit,
        estimatedTotalPrice: estimatedTotalPrice,
        placements: cart.map(item => ({ side: 'front', size: item.frontPrintSize, logo: item.frontLogoUrl, mockup: item.frontMockupUrl })),
        activities: [{
          id: `act-${Date.now()}`,
          type: 'system',
          message: isPayNow 
            ? `Order created via online checkout. Initiating Stripe Checkout Session for $${estimatedTotalPrice.toFixed(2)}.` 
            : `${storefrontSettings.logoText} Web Quote Request submitted by ${customerInfo.contactName}`,
          user: customerInfo.emailAddress,
          timestamp: new Date().toISOString()
        }]
      };

      await setDoc(doc(db, 'orders', orderId), payload);

      if (isPayNow) {
        const successUrl = `${window.location.origin}${window.location.pathname}?success=true&order_id=${orderId}&session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${window.location.origin}${window.location.pathname}?canceled=true&order_id=${orderId}`;

        const lineItems = cart.map(item => {
          const sizeDescription = Object.entries(item.sizes || {})
            .filter(([_, v]) => (v as number) > 0)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
          
          return {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${item.product.brand} ${item.product.style} - ${item.product.title.replace(/®/g, '').trim()} (${item.color})`,
                description: `Decoration: ${item.decorationMethod} | Sizes: ${sizeDescription || 'Quote Pending'}`,
                images: item.mockupUrl && item.mockupUrl.startsWith('http') ? [item.mockupUrl] : undefined
              },
              unit_amount: Math.round(item.pricingDetails.total * 100)
            },
            quantity: item.qty
          };
        });

        const res = await fetch('/api/stripe/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId,
            customerId,
            title: payload.title,
            amount: averageEstimatedPricePerUnit,
            qty: totalUnits,
            email: customerInfo.emailAddress,
            successUrl,
            cancelUrl,
            lineItems
          })
        });

        const data = await res.json();
        if (res.ok && data.url) {
          window.location.href = data.url; 
        } else {
          alert("Failed to initiate secure checkout session. Please try again or submit quote instead.");
        }
      } else {
        setPaymentSuccessMsg(`Thank you, ${customerInfo.contactName}! We've received your ${storefrontSettings.logoText} design selections. Our design team will review your specifications and contact you shortly with a formal price quote.`);
        setSuccess(true);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to submit request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isVerifyingPayment) {
    return (
      <div className="min-h-screen bg-[#FBFBF9] flex items-center justify-center p-6 text-neutral-600 font-sans">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-neutral-900" size={32} />
          <p className="text-sm font-semibold">Verifying Secure Payment Status...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#FBFBF9] flex items-center justify-center p-6 font-sans text-neutral-900">
        <div className="max-w-md w-full bg-white border border-neutral-200 rounded-3xl p-10 text-center space-y-6 shadow-xs animate-in zoom-in-95 fade-in duration-500">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100">
            <CheckCircle size={40} />
          </div>
          <h1 className="text-3xl font-serif text-neutral-900 tracking-tight">
            Quote Request Received
          </h1>
          <p className="text-neutral-500 text-sm leading-relaxed">
            {paymentSuccessMsg}
          </p>
          <div className="pt-6">
            <button 
              onClick={() => navigate('/')} 
              className="w-full bg-neutral-900 text-white py-4 rounded-xl font-bold tracking-wide hover:bg-neutral-800 transition-all shadow-xs"
            >
              Return Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoadingSettings) {
    return (
      <div className="min-h-screen bg-[#FBFBF9] flex items-center justify-center p-6 text-neutral-600 font-sans">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-neutral-900" size={32} />
          <p className="text-sm font-semibold">Loading Custom Storefront...</p>
        </div>
      </div>
    );
  }

  // Pre-load flatlay for edit canvas
  const editingProduct = editingItemIdx !== null ? rackItems[editingItemIdx] : null;
  const editingImageSet = editingProduct ? (editingProduct.product.images[editingProduct.color] || Object.values(editingProduct.product.images)[0]) : null;
  const editingGarmentImg = editingImageSet ? (typeof editingImageSet === 'string' ? editingImageSet : editingImageSet[editViewMode]) : '';
  const editingGarmentProxied = editingGarmentImg.startsWith('http')
    ? `/api/sanmar/proxy-image?url=${encodeURIComponent(editingGarmentImg)}`
    : editingGarmentImg;

  return (
    <div className="w-full">
      {step === 0 ? (
        <div className="min-h-screen lg:h-screen lg:overflow-hidden flex flex-col bg-[#FAF9F5] text-zinc-900 font-sans selection:bg-neutral-900 selection:text-white w-full">
          {/* Minimal Editorial Header */}
          <header className="border-b border-zinc-200/40 backdrop-blur-md z-40 bg-[#FAF9F5]/90 px-6 py-3.5 md:px-12 shrink-0">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-serif text-lg tracking-tight text-zinc-955 font-bold">
                  {storefrontSettings.logoText}
                </span>
                <span className="h-4 w-px bg-zinc-200" />
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-[9px] tracking-wider uppercase text-zinc-400 font-bold">
                    DESIGN PORTALS OPEN
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="hidden md:flex flex-col text-right font-mono text-[9px] text-zinc-400 leading-none gap-0.5">
                  <span className="uppercase font-bold tracking-widest text-[8px]">LOCAL TIME</span>
                  <span className="text-zinc-600 font-semibold">{currentTime || '00:00:00'}</span>
                </div>
                
                <span className="hidden md:inline-block h-5 w-px bg-zinc-200" />

                <div className="flex items-center gap-4">
                  {(isAdmin || import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
                    <button
                      onClick={() => {
                        setEditSettings({ ...storefrontSettings });
                        setIsEditingStorefront(true);
                      }}
                      className="px-3.5 py-1.5 border border-zinc-200 rounded-lg text-xs font-bold text-zinc-500 hover:border-zinc-955 hover:text-zinc-955 transition-all bg-white shadow-3xs cursor-pointer"
                    >
                      Customize Store
                    </button>
                  )}

                  {user ? (
                    <div className="flex items-center gap-2">
                      {userData?.role === 'Client' ? (
                        <button
                          onClick={() => navigate(userData.customerId ? `/portal/${userData.customerId}` : '/portal')}
                          className="px-4 py-1.5 bg-zinc-950 text-white rounded-lg text-xs font-bold hover:bg-zinc-800 transition-all shadow-xs cursor-pointer"
                        >
                          View Portal
                        </button>
                      ) : (userData && ['Admin', 'Leadership', 'Manager', 'Staff', 'Printer'].includes(userData.role)) ? (
                        <button
                          onClick={() => navigate('/orders')}
                          className="px-4 py-1.5 bg-zinc-955 text-white rounded-lg text-xs font-bold hover:bg-zinc-900 transition-all shadow-xs cursor-pointer"
                        >
                          Admin Panel
                        </button>
                      ) : (
                        <span className="text-[9px] text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider">
                          Pending
                        </span>
                      )}
                      
                      <button
                        onClick={signOut}
                        className="px-3.5 py-1.5 border border-zinc-200 rounded-lg text-xs font-bold text-zinc-500 hover:border-red-400 hover:text-red-500 transition-all bg-white shadow-3xs cursor-pointer"
                      >
                        Sign Out
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={async () => {
                        try {
                          await signInWithGoogle();
                        } catch (e) {
                          console.error(e);
                        }
                      }}
                      className="px-4.5 py-1.5 bg-zinc-955 text-white hover:bg-zinc-900 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
                    >
                      Login
                    </button>
                  )}
                </div>
              </div>
            </div>
          </header>

          <main className="flex-grow w-full flex flex-col lg:flex-row gap-0 min-h-0 lg:overflow-hidden relative">
            {/* LEFT SIDE: Design Your Rack Card */}
            <TiltCard 
              className="flex-grow flex-1 flex flex-col justify-between p-8 relative overflow-hidden group min-h-[300px] lg:h-full border-b lg:border-b-0 lg:border-r border-zinc-200/50 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 text-white"
              onMouseEnter={() => setHoveredPlatform('racks')}
              onMouseLeave={() => setHoveredPlatform(null)}
              onClick={() => {
                setFlowMode('racks');
                setStep(1);
              }}
            >
              {/* Background Image with overlays */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <img 
                  src="/images/apparel_rack_hero.png" 
                  alt="Custom Apparel Rack" 
                  className="w-full h-full object-cover transition-transform duration-[2000ms] ease-out group-hover:scale-105 opacity-[0.88]"
                />
                <div className="absolute bottom-0 inset-x-0 h-[280px] bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent" />
                <div className="absolute top-0 inset-x-0 h-[120px] bg-gradient-to-b from-zinc-950/50 to-transparent" />
              </div>
              {/* Abstract CSS design element in background (glowing orb and blueprint lines) */}
              <div 
                className="absolute inset-0 pointer-events-none opacity-20 transition-transform duration-[1200ms] scale-100 group-hover:scale-110"
                style={{
                  background: `
                    radial-gradient(circle at 70% 30%, rgba(229, 224, 213, 0.15) 0%, transparent 60%),
                    radial-gradient(circle at 20% 80%, rgba(115, 115, 115, 0.1) 0%, transparent 50%)
                  `,
                }}
              />
              {/* Subtle blueprint grid overlay for lookbook feeling */}
              <div className="absolute inset-0 opacity-[0.02] bg-checkerboard pointer-events-none" />
              <div className="absolute inset-x-8 top-1/3 h-px bg-white/5 pointer-events-none" />
              <div className="absolute inset-x-8 top-2/3 h-px bg-white/5 pointer-events-none" />
              <div className="absolute inset-y-8 left-1/3 w-px bg-white/5 pointer-events-none" />
              <div className="absolute inset-y-8 left-2/3 w-px bg-white/5 pointer-events-none" />

              {/* Top Badge */}
              <div style={{ transform: hoveredPlatform === 'racks' ? 'translateZ(12px)' : 'none' }} className="flex justify-between items-start z-10 shrink-0">
                <span className="text-[9px] tracking-widest font-mono text-zinc-400 uppercase font-semibold">01 / DESIGN YOUR RACK</span>
                <span className="text-[8px] border border-white/20 text-zinc-300 px-2 py-0.5 rounded font-mono uppercase tracking-wider bg-white/5 backdrop-blur-xs">
                  Cohesive Collection
                </span>
              </div>

              {/* Bottom Card Content */}
              <div style={{ transform: hoveredPlatform === 'racks' ? 'translateZ(18px)' : 'none' }} className="flex flex-col gap-4 z-10 text-white max-w-lg mt-auto">
                <div className="flex flex-col gap-1.5">
                  <h2 className="font-serif text-3xl lg:text-4xl font-normal tracking-tight text-white">
                    Design Your Rack
                  </h2>
                  <p className="text-[11px] text-zinc-300 leading-relaxed font-light transition-opacity duration-300 opacity-80 group-hover:opacity-100 font-sans">
                    Configure a unified apparel collection with our standard 6-item rack (Hat, Tee, Polo, Crewneck, Hoodie, and Long Sleeve). All overlayed with your branding instantly.
                  </p>
                </div>

                <div 
                  className="w-full flex items-center justify-between px-5 py-3.5 bg-white text-zinc-950 rounded-xl font-bold uppercase tracking-wider text-[10px] transition-all hover:bg-zinc-100 shadow-md z-10 cursor-pointer"
                >
                  <span className="text-zinc-955">Design a Cohesive Line</span>
                  <ArrowRight className="w-4 h-4 text-zinc-955 group-hover:translate-x-1.5 transition-transform" />
                </div>
              </div>
            </TiltCard>

            {/* RIGHT SIDE: Build From Basics Card */}
            <TiltCard 
              className="flex-grow flex-1 flex flex-col justify-between p-8 relative overflow-hidden group min-h-[300px] lg:h-full bg-gradient-to-br from-bone-100 via-bone-50 to-[#FAF9F5] text-zinc-900 border-none"
              onMouseEnter={() => setHoveredPlatform('basics')}
              onMouseLeave={() => setHoveredPlatform(null)}
              onClick={() => {
                setFlowMode('basics');
                setStep(1);
              }}
            >
              {/* Background Image with overlays */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <img 
                  src="/images/blank_basics_hero.png" 
                  alt="Blank Basics" 
                  className="w-full h-full object-cover transition-transform duration-[2000ms] ease-out group-hover:scale-105 opacity-[0.92]"
                />
                <div className="absolute bottom-0 inset-x-0 h-[280px] bg-gradient-to-t from-[#FAF9F5] via-[#FAF9F5]/85 to-transparent" />
                <div className="absolute top-0 inset-x-0 h-[120px] bg-gradient-to-b from-[#FAF9F5]/45 to-transparent" />
              </div>
              {/* Abstract CSS design element in background (glowing warm orb and blueprint lines) */}
              <div 
                className="absolute inset-0 pointer-events-none opacity-30 transition-transform duration-[1200ms] scale-100 group-hover:scale-110"
                style={{
                  background: `
                    radial-gradient(circle at 30% 20%, rgba(214, 207, 191, 0.4) 0%, transparent 60%),
                    radial-gradient(circle at 80% 70%, rgba(229, 224, 213, 0.3) 0%, transparent 50%)
                  `,
                }}
              />
              {/* Subtle blueprint grid overlay for lookbook feeling */}
              <div className="absolute inset-0 opacity-[0.05] bg-checkerboard pointer-events-none" />
              <div className="absolute inset-x-8 top-1/3 h-px bg-zinc-900/5 pointer-events-none" />
              <div className="absolute inset-x-8 top-2/3 h-px bg-zinc-900/5 pointer-events-none" />
              <div className="absolute inset-y-8 left-1/3 w-px bg-zinc-900/5 pointer-events-none" />
              <div className="absolute inset-y-8 left-2/3 w-px bg-zinc-900/5 pointer-events-none" />

              {/* Top Badge */}
              <div style={{ transform: hoveredPlatform === 'basics' ? 'translateZ(12px)' : 'none' }} className="flex justify-between items-start z-10 shrink-0">
                <span className="text-[9px] tracking-widest font-mono text-zinc-500 uppercase font-semibold">02 / BUILD FROM BASICS</span>
                <span className="text-[8px] border border-zinc-200 text-zinc-650 px-2 py-0.5 rounded font-mono uppercase tracking-wider bg-zinc-900/5 backdrop-blur-xs">
                  Essential Blanks
                </span>
              </div>

              {/* Bottom Card Content */}
              <div style={{ transform: hoveredPlatform === 'basics' ? 'translateZ(18px)' : 'none' }} className="flex flex-col gap-4 z-10 text-zinc-900 max-w-lg mt-auto">
                <div className="flex flex-col gap-1.5">
                  <h2 className="font-serif text-3xl lg:text-4xl font-normal tracking-tight text-zinc-950">
                    Build From Basics
                  </h2>
                  <p className="text-[11px] text-zinc-650 leading-relaxed font-light transition-opacity duration-300 opacity-80 group-hover:opacity-100 font-sans">
                    Start from a single essential custom blank (t-shirt, sweatshirt, jacket, caps, etc.). Compare Good, Better, and Best curated options side-by-side.
                  </p>
                </div>

                <div 
                  className="w-full flex items-center justify-between px-5 py-3.5 bg-zinc-950 text-white rounded-xl font-bold uppercase tracking-wider text-[10px] transition-all hover:bg-zinc-800 shadow-md z-10 cursor-pointer"
                >
                  <span className="text-white">Explore Premium Blanks</span>
                  <ArrowRight className="w-4 h-4 text-white group-hover:translate-x-1.5 transition-transform" />
                </div>
              </div>
            </TiltCard>
          </main>

          {/* Editorial Footer */}
          <footer className="border-t border-zinc-200/40 bg-[#FAF9F5] py-3.5 px-6 md:px-12 shrink-0 z-30">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div className="flex items-center gap-3">
                <span className="font-serif text-sm tracking-tight font-bold text-zinc-950">{storefrontSettings.logoText}</span>
                <span className="hidden md:inline-block text-[9px] text-zinc-400 tracking-wider font-semibold">
                  © {new Date().getFullYear()} {storefrontSettings.logoText.toUpperCase()} APPAREL GROUP. ALL RIGHTS RESERVED.
                </span>
              </div>
              <div className="flex items-center gap-6 text-[9px] font-bold uppercase tracking-widest text-zinc-400">
                {storefrontSettings.email && (
                  <a href={`mailto:${storefrontSettings.email}`} className="hover:text-zinc-955 transition-colors">
                    EMAIL: {storefrontSettings.email.toUpperCase()}
                  </a>
                )}
                {storefrontSettings.contactPhone && (
                  <span>•</span>
                )}
                {storefrontSettings.contactPhone && (
                  <span className="text-zinc-400">PHONE: {storefrontSettings.contactPhone}</span>
                )}
              </div>
            </div>
          </footer>
        </div>
      ) : (
        <div className="min-h-screen bg-gradient-to-tr from-[#EAE6DF] via-[#F6F4EE] to-[#FDFDFB] font-sans pb-32 text-neutral-900 selection:bg-neutral-900 selection:text-white">
          {/* Announcement Bar */}
          {storefrontSettings.announcement && (
            <div className="bg-neutral-900 text-white text-center py-2 px-4 text-xs font-bold tracking-wide shadow-sm flex items-center justify-center gap-2">
              <span>{storefrontSettings.announcement}</span>
            </div>
          )}

          {/* customizable store navbar */}
          <header className="bg-white/80 backdrop-blur-md border-b border-neutral-200/60 py-4 px-6 sticky top-0 z-50 shadow-2xs">
            <div className="max-w-[1200px] mx-auto flex items-center justify-between gap-6">
              <div className="flex items-center gap-3">
                <span className="font-serif font-extrabold text-lg tracking-wider text-neutral-900">
                  {storefrontSettings.logoText}
                </span>
              </div>
              
              <div className="flex items-center gap-4">
                {storefrontSettings.contactPhone && (
                  <a 
                    href={`tel:${storefrontSettings.contactPhone}`} 
                    className="hidden md:flex items-center gap-2 px-3 h-9 rounded-xl text-xs font-bold text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50 transition-all duration-200"
                  >
                    <Phone size={14} className="text-neutral-900" />
                    <span>{storefrontSettings.contactPhone}</span>
                  </a>
                )}
                
                {(isAdmin || import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
                  <button
                    onClick={() => {
                      setEditSettings({ ...storefrontSettings });
                      setIsEditingStorefront(true);
                    }}
                    className="flex items-center justify-center gap-1.5 px-4 h-9 border border-neutral-200 rounded-xl text-xs font-bold text-neutral-500 hover:border-neutral-900 hover:text-neutral-900 hover:bg-neutral-50 transition-all bg-white shadow-3xs"
                  >
                    <Settings size={13} />
                    <span>Customize Store</span>
                  </button>
                )}

                {user ? (
                  <div className="flex items-center gap-2">
                    {userData?.role === 'Client' ? (
                      <button
                        onClick={() => navigate(userData.customerId ? `/portal/${userData.customerId}` : '/portal')}
                        className="flex items-center justify-center gap-1.5 px-4 h-9 bg-neutral-900 text-white rounded-xl text-xs font-bold hover:bg-neutral-800 transition-all shadow-xs animate-in"
                      >
                        <span>View Portal</span>
                      </button>
                    ) : (userData && ['Admin', 'Leadership', 'Manager', 'Staff', 'Printer'].includes(userData.role)) ? (
                      <button
                        onClick={() => navigate('/orders')}
                        className="flex items-center justify-center gap-1.5 px-4 h-9 bg-neutral-900 text-white rounded-xl text-xs font-bold hover:bg-neutral-800 transition-all shadow-xs"
                      >
                        <span>Admin Panel</span>
                      </button>
                    ) : (
                      <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-3 h-9 flex items-center justify-center rounded-xl font-bold uppercase tracking-wider">
                        Pending
                      </span>
                    )}
                    
                    <button
                      onClick={signOut}
                      className="px-4 h-9 flex items-center justify-center border border-neutral-200 rounded-xl text-xs font-bold text-neutral-500 hover:border-red-400 hover:text-red-500 transition-all bg-white shadow-3xs"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={async () => {
                      try {
                        await signInWithGoogle();
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                    className="flex items-center justify-center gap-1.5 px-4.5 h-9 bg-neutral-900 text-white hover:bg-neutral-800 rounded-xl text-xs font-bold transition-all shadow-xs"
                  >
                    <span>Login</span>
                  </button>
                )}

                <div className="flex items-center justify-center gap-1.5 bg-neutral-50 px-3.5 h-9 border border-neutral-200 rounded-xl">
                  <Lock size={12} className="text-neutral-400" />
                  <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Secure</span>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content Area */}
          <div className="max-w-[1200px] mx-auto px-6 w-full mt-10">

        {/* STEP 1: SELECT COLLECTION CATEGORY / BASICS */}
        {step === 1 && (
          <div className="space-y-8 animate-in fade-in duration-300">
            
            {/* Design Your Rack Path Step 1 */}
            {flowMode === 'racks' && (
              <div className="bg-white/80 backdrop-blur-md rounded-3xl p-8 border border-neutral-200 shadow-sm max-w-4xl mx-auto space-y-8">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setStep(0)}
                    className="p-2 border border-neutral-200 hover:border-neutral-450 text-neutral-500 hover:text-neutral-900 bg-neutral-50 rounded-xl transition-all shadow-3xs cursor-pointer"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-400">Design your rack</span>
                    <h3 className="text-2xl font-serif text-neutral-900 mt-0.5">Select a Theme Collection</h3>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.keys(DEFAULT_RACKS).map(catName => {
                    const isSelected = selectedThemeCategory === catName;
                    return (
                      <button
                        key={catName}
                        onClick={() => setSelectedThemeCategory(catName)}
                        className={`p-6 rounded-2xl border text-center font-serif text-sm transition-all ${
                          isSelected 
                            ? 'bg-neutral-900 border-neutral-900 text-white shadow-sm font-extrabold'
                            : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-400'
                        }`}
                      >
                        {catName}
                      </button>
                    );
                  })}
                </div>

                {/* Pre-selected garments rack representation */}
                <div className="space-y-4 pt-4 border-t border-neutral-200/50">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-400 block">Curated Standard 6-Item Rack</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                    {rackItems.map(item => (
                      <div 
                        key={item.id} 
                        onClick={() => {
                          setRackItems(prev => prev.map(ri => ri.id === item.id ? { ...ri, selected: !ri.selected } : ri));
                        }}
                        className={`bg-white border p-3 rounded-xl transition-all flex flex-col justify-between gap-3 text-center cursor-pointer relative group ${
                          item.selected 
                            ? 'border-neutral-900 ring-2 ring-neutral-900/5 shadow-2xs' 
                            : 'border-neutral-200 opacity-60 hover:opacity-100'
                        }`}
                      >
                        {item.selected && (
                          <div className="absolute top-2 right-2 text-neutral-950">
                            <CheckSquare size={13} />
                          </div>
                        )}
                        {!item.selected && (
                          <div className="absolute top-2 right-2 text-neutral-300">
                            <Square size={13} />
                          </div>
                        )}
                        <span className="text-[8px] font-bold uppercase tracking-widest text-neutral-400">{item.slot}</span>
                        <div className="h-28 flex items-center justify-center p-1 overflow-hidden">
                          {(() => {
                            const imgSet = item.product.images[item.color] || Object.values(item.product.images)[0];
                            const imgSrc = imgSet ? (typeof imgSet === 'string' ? imgSet : (imgSet as any).front) : '';
                            return (
                              <img 
                                src={imgSrc} 
                                className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300" 
                                alt={item.product.style} 
                              />
                            );
                          })()}
                        </div>
                        <span className="text-[10px] font-bold text-neutral-800 truncate">{item.product.brand} {item.product.style}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-6 border-t border-neutral-200/50 flex justify-end">
                  <PillButton variant="filled" onClick={() => setStep(2)} className="gap-2">
                    Proceed to Logo Upload <ArrowRight size={14} />
                  </PillButton>
                </div>
              </div>
            )}

            {/* Build From Basics Step 1 */}
            {flowMode === 'basics' && (
              <div className="bg-white/80 backdrop-blur-md rounded-3xl p-8 border border-neutral-200 shadow-sm max-w-4xl mx-auto space-y-8">
                <div className="flex items-center justify-between border-b border-neutral-200/60 pb-5 gap-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setStep(0)}
                      className="p-2 border border-neutral-200 hover:border-neutral-450 text-neutral-500 hover:text-neutral-900 bg-neutral-50 rounded-xl transition-all shadow-3xs cursor-pointer"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-400">Build from basics</span>
                      <h3 className="text-2xl font-serif text-neutral-900 mt-0.5">Select a Basic Canvas</h3>
                    </div>
                  </div>

                  <select
                    value={selectedBasicsCategory}
                    onChange={(e) => {
                      setSelectedBasicsCategory(e.target.value);
                      setSelectedBasicsItem(null);
                    }}
                    className="bg-white border border-neutral-200 rounded-xl px-3 py-2 text-xs font-bold text-brand-primary focus:outline-none"
                  >
                    {['T-Shirts', 'Tanks', 'LS', 'Sweatshirt', 'Hoodie', 'Jacket'].map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Pre-curated Good/Better/Best 3-item Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {['good', 'better', 'best'].map(slot => {
                    const item = (preCuratedBasicsOptions as any)[slot];
                    if (!item) return null;
                    const isSelected = selectedBasicsItem?.style === item.style;
                    const previewColor = item.colors[0];
                    const imgSet = item.images[previewColor] || Object.values(item.images)[0];
                    const previewImg = imgSet ? (typeof imgSet === 'string' ? imgSet : (imgSet as any).front) : '';

                    return (
                      <div
                        key={slot}
                        onClick={() => setSelectedBasicsItem(item)}
                        className={`bg-white border rounded-2xl p-6 flex flex-col justify-between gap-4 cursor-pointer hover:shadow-md transition-all ${
                          isSelected 
                            ? 'border-neutral-900 ring-2 ring-neutral-900/5' 
                            : 'border-neutral-200'
                        }`}
                      >
                        <div className="space-y-3">
                          <span className={`text-[9px] font-bold uppercase tracking-widest ${
                            slot === 'good' ? 'text-neutral-400' : slot === 'better' ? 'text-blue-500' : 'text-emerald-500'
                          }`}>{slot} Option</span>
                          <div className="aspect-[4/5] bg-white rounded-xl flex items-center justify-center p-4">
                            <img src={previewImg} alt={item.title} className="max-h-full max-w-full object-contain" />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-neutral-400 uppercase">{item.brand} • {item.style}</span>
                            <h4 className="text-sm font-bold text-neutral-800 truncate mt-0.5">{item.title}</h4>
                            <p className="text-xs text-neutral-500 line-clamp-2 mt-1 leading-relaxed">{item.description}</p>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-neutral-100 flex items-center justify-end">
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                            isSelected ? 'bg-neutral-900 border-neutral-900 text-white' : 'border-neutral-300 text-transparent'
                          }`}>
                            <Check size={10} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-6 border-t border-neutral-200/50 flex justify-end">
                  <PillButton 
                    variant="filled" 
                    onClick={() => setStep(2)} 
                    disabled={!selectedBasicsItem}
                    className="gap-2"
                  >
                    Proceed to Logo Upload <ArrowRight size={14} />
                  </PillButton>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: LOGO DESIGN & UPLOAD */}
        {step === 2 && (
          <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in duration-300">
            <div className="bg-white/80 backdrop-blur-md rounded-3xl p-8 border border-neutral-200 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="p-2 border border-neutral-200 hover:border-neutral-450 text-neutral-500 hover:text-neutral-900 bg-neutral-50 rounded-xl transition-all shadow-3xs cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-400">Custom Brand Identity</span>
                  <h3 className="text-2xl font-serif text-neutral-900 mt-0.5">Upload or Generate Logo</h3>
                </div>
              </div>

              {/* Designer Tabs Header */}
              <div className="flex border border-neutral-200 bg-neutral-50 p-1 rounded-xl gap-1">
                {[
                  { id: 'upload', label: 'Upload File' },
                  { id: 'text', label: 'Add Custom Text' },
                  { id: 'clipart', label: 'Clip Art' },
                  { id: 'ai', label: 'AI Logo Generator' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setDesignerTab(tab.id as any)}
                    className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex-1 text-center ${
                      designerTab === tab.id
                        ? 'bg-white text-neutral-900 shadow-3xs font-extrabold'
                        : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="min-h-[160px] flex flex-col justify-center border border-neutral-200/50 bg-neutral-50/20 rounded-2xl p-6">
                
                {/* Upload File Tab */}
                {designerTab === 'upload' && (
                  <div className="space-y-4 text-center">
                    {isUploadingLogo ? (
                      <div className="flex flex-col items-center gap-2 animate-pulse">
                        <Loader2 className="animate-spin text-neutral-400" size={24} />
                        <span className="text-xs text-neutral-500 font-semibold">Uploading artwork to server...</span>
                      </div>
                    ) : logoUrl ? (
                      <div className="flex items-center justify-between gap-6 bg-white border border-neutral-200 rounded-xl p-4 max-w-md mx-auto shadow-3xs">
                        <div className="w-16 h-16 bg-checkerboard border border-neutral-200 rounded-lg flex items-center justify-center p-1.5 overflow-hidden shrink-0">
                          <img src={logoUrl} alt="Logo active" className="max-h-full max-w-full object-contain" />
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <span className="text-xs font-bold text-neutral-800 block truncate">{artworkName}</span>
                          <span className="text-[10px] text-neutral-500 block mt-0.5">Success! Custom artwork loaded.</span>
                        </div>
                        <label className="text-xs text-neutral-900 hover:underline font-bold cursor-pointer shrink-0">
                          Replace
                          <input type="file" accept="image/*,.pdf,.eps,.ai,.psd,.cdr,.zip" onChange={handleLogoUpload} className="hidden" />
                        </label>
                      </div>
                    ) : (
                      <label className="border-2 border-dashed border-neutral-200 hover:border-neutral-400 rounded-xl p-8 flex flex-col items-center justify-center gap-2 bg-white/40 hover:bg-white transition-all cursor-pointer group text-center">
                        <Upload size={24} className="text-neutral-400 group-hover:text-neutral-900 transition-colors" />
                        <span className="text-xs font-bold text-neutral-700 group-hover:text-neutral-900">Select Artwork File</span>
                        <span className="text-[10px] text-neutral-400">PNG, SVG, JPG, PDF, EPS, AI, PSD, CDR, ZIP up to 20MB</span>
                        <input type="file" accept="image/*,.pdf,.eps,.ai,.psd,.cdr,.zip" onChange={handleLogoUpload} className="hidden" />
                      </label>
                    )}
                  </div>
                )}

                {/* Custom Text Tab */}
                {designerTab === 'text' && (
                  <div className="space-y-4 max-w-md mx-auto w-full">
                    <input
                      type="text"
                      value={customText}
                      onChange={e => setCustomText(e.target.value)}
                      placeholder="Type custom text..."
                      className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-bold text-neutral-900 outline-none focus:border-neutral-400"
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Font Family</span>
                        <select
                          value={textFont}
                          onChange={e => setTextFont(e.target.value)}
                          className="bg-white border border-neutral-200 rounded-xl px-2.5 py-1.5 text-xs font-bold focus:outline-none"
                        >
                          <option value="Modern">Modern Sans</option>
                          <option value="Serif">Serif Georgia</option>
                          <option value="Collegiate">Collegiate Impact</option>
                          <option value="Script">Brush Script</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Text Color</span>
                        <div className="flex gap-2 items-center">
                          <input
                            type="color"
                            value={textColor}
                            onChange={e => setTextColor(e.target.value)}
                            className="w-8 h-8 rounded-lg cursor-pointer border border-neutral-200 bg-transparent"
                          />
                          <span className="text-[10px] font-bold text-neutral-600 uppercase font-mono">{textColor}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={renderTextToImage}
                      disabled={!customText.trim() || isUploadingLogo}
                      className="w-full py-2 bg-neutral-900 text-white hover:bg-neutral-800 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {isUploadingLogo ? <Loader2 size={13} className="animate-spin" /> : null}
                      Apply Custom Text
                    </button>
                  </div>
                )}

                {/* Clipart Tab */}
                {designerTab === 'clipart' && (
                  <div className="space-y-4 max-w-md mx-auto w-full">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Select Vector Clipart</span>
                      <div className="flex gap-2 items-center">
                        <input
                          type="color"
                          value={clipartColor}
                          onChange={e => setClipartColor(e.target.value)}
                          className="w-6 h-6 rounded-lg cursor-pointer border border-neutral-200 bg-transparent"
                        />
                        <span className="text-[9px] font-bold text-neutral-600 uppercase font-mono">{clipartColor}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-8 gap-2 bg-white p-3 border border-neutral-200 rounded-xl max-h-[120px] overflow-y-auto">
                      {Object.entries(clipartSVGs).map(([key, svg]) => {
                        const coloredSvg = svg.replace(/COLOR/g, clipartColor);
                        const base64Svg = btoa(coloredSvg);
                        const dataUrl = `data:image/svg+xml;base64,${base64Svg}`;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => renderClipartToImage(key, svg)}
                            className="aspect-square p-2 bg-neutral-50 border border-neutral-200 hover:border-neutral-900 rounded-lg flex items-center justify-center transition-all shadow-3xs"
                          >
                            <img src={dataUrl} alt={key} className="max-h-full max-w-full object-contain" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* AI Generator Tab */}
                {designerTab === 'ai' && (
                  <div className="space-y-4 max-w-md mx-auto w-full">
                    <input
                      type="text"
                      value={aiPrompt}
                      onChange={e => setAiPrompt(e.target.value)}
                      placeholder="Describe your logo graphic details..."
                      className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-bold text-neutral-900 outline-none focus:border-neutral-400"
                    />
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Logo Art Style</span>
                      <select
                        value={aiStyle}
                        onChange={e => setAiStyle(e.target.value)}
                        className="bg-white border border-neutral-200 rounded-xl px-2.5 py-1.5 text-xs font-bold focus:outline-none"
                      >
                        <option value="Minimalist Vector Logo">Minimalist Vector</option>
                        <option value="Mascot Sports Logo">Sports Mascot</option>
                        <option value="Retro Vintage Emblem Logo">Retro Vintage Emblem</option>
                        <option value="Modern Corporate Icon">Modern Corporate</option>
                      </select>
                    </div>
                    <button
                      onClick={generateAiLogo}
                      disabled={!aiPrompt.trim() || isGeneratingAi}
                      className="w-full py-2 bg-neutral-900 text-white hover:bg-neutral-800 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {isGeneratingAi ? (
                        <><Loader2 size={13} className="animate-spin" /> Generating AI Vector...</>
                      ) : (
                        <><Sparkles size={13} /> Generate AI Logo</>
                      )}
                    </button>
                  </div>
                )}

              </div>

              {/* Dominant Colors / Background Remover Option */}
              {logoUrl && originalArtworkUrl && (
                <div className="pt-4 border-t border-neutral-200/50 flex justify-between items-center text-xs">
                  <span className="text-neutral-500 font-medium">Dominant palette extracted.</span>
                  <button
                    onClick={() => {
                      const img = new Image();
                      img.crossOrigin = 'anonymous';
                      img.src = originalArtworkUrl;
                      img.onload = () => {
                        setIsColorRemoverOpen(true);
                      };
                    }}
                    className="text-neutral-900 hover:underline font-bold"
                  >
                    Clean Background / Colors
                  </button>
                </div>
              )}

              {/* Navigation button */}
              <div className="pt-6 border-t border-neutral-200/50 flex justify-end">
                <PillButton 
                  variant="filled" 
                  onClick={() => setStep(3)} 
                  disabled={!logoUrl || isUploadingLogo}
                  className="gap-2"
                >
                  Proceed to Lookbook Rack <ArrowRight size={14} />
                </PillButton>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: THE CLOTHING LOOKBOOK RACK */}
        {step === 3 && logoUrl && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header step card */}
            <div className="w-full bg-white/85 backdrop-blur-md rounded-3xl p-6 border border-neutral-200 shadow-3xs flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="p-2 border border-neutral-200 hover:border-neutral-450 text-neutral-500 hover:text-neutral-900 bg-neutral-50 rounded-xl transition-all shadow-3xs cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-400">Step 3 of 5</span>
                  <h3 className="text-2xl font-serif text-neutral-900 mt-0.5">Your Curated Collection Lookbook</h3>
                </div>
              </div>

              {/* Logo mini thumbnail */}
              <div className="flex items-center gap-3 bg-neutral-50 border border-neutral-200/60 p-2 rounded-xl">
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-neutral-400 pl-1">Active Logo</span>
                <div className="w-9 h-9 bg-checkerboard border border-neutral-200 rounded-lg flex items-center justify-center p-1 overflow-hidden">
                  <img src={logoUrl} className="max-h-full max-w-full object-contain" alt="mini logo" />
                </div>
              </div>
            </div>

            {/* Standard Rack visual lookbook */}
            <div className="space-y-6">
              {/* Rack Hanger graphic line */}
              <div className="relative w-full h-[6px] bg-neutral-900/10 border-y border-neutral-900/15 rounded-full flex items-center justify-center">
                <div className="absolute top-1/2 left-4 w-4 h-8 bg-neutral-900/35 rounded-md -translate-y-1/2 border border-neutral-900/40"></div>
                <div className="absolute top-1/2 right-4 w-4 h-8 bg-neutral-900/35 rounded-md -translate-y-1/2 border border-neutral-900/40"></div>
              </div>

              {flowMode === 'racks' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                  {rackItems.filter(i => i.selected).map((item, itemIdx) => {
                    const previewColor = item.color;
                    const imageSet = item.product.images[previewColor] || Object.values(item.product.images)[0];
                    const previewImg = imageSet ? (typeof imageSet === 'string' ? imageSet : imageSet.front) : '';

                    return (
                      <div 
                        key={item.id} 
                        className="bg-white border border-neutral-200/80 rounded-2xl overflow-hidden flex flex-col justify-between group shadow-3xs hover:shadow-md hover:-translate-y-1 transition-all duration-350"
                      >
                        <div className="relative aspect-[4/5] bg-white flex items-center justify-center p-6 border-b border-neutral-100 overflow-hidden select-none">
                          
                          {/* Smart Decoration Badge */}
                          <div className="absolute top-4 left-4 z-10 bg-neutral-900/90 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-1 shadow-sm">
                            {item.decoration === 'Embroidery' ? (
                              <><Scissors size={10} /> Embroidery</>
                            ) : (
                              <><Shirt size={10} /> Premium Print</>
                            )}
                          </div>

                          <div className="absolute top-4 right-4 z-10 bg-neutral-50 border border-neutral-200 text-neutral-500 text-[8px] uppercase font-bold tracking-widest px-2 py-0.5 rounded">
                            {item.slot}
                          </div>

                          {/* Garment Image */}
                          <img src={previewImg} className="max-w-[85%] max-h-[85%] object-contain pointer-events-none" alt={item.product.style} />

                          {/* Overlay Projected Logo */}
                          <div 
                            style={{
                              position: 'absolute',
                              left: `${item.logoPos.x}%`,
                              top: `${item.logoPos.y}%`,
                              width: `${item.logoScale * 100}%`,
                              transform: 'translate(-50%, -50%)',
                              pointerEvents: 'none'
                            }}
                          >
                            <img 
                              src={logoUrl} 
                              alt="overlay" 
                              style={{
                                transform: `rotate(${item.logoRotation}deg)`,
                                width: '100%',
                                height: 'auto',
                                filter: item.decoration === 'Embroidery' ? 'drop-shadow(1.5px 1.5px 1.5px rgba(0,0,0,0.38))' : 'none',
                                mixBlendMode: ['black', 'dark', 'navy', 'patriot', 'charcoal', 'graphite', 'carbon', 'obsidian', 'maroon', 'cardinal', 'burgundy'].some(c => item.color.toLowerCase().includes(c)) ? 'normal' : 'multiply'
                              }}
                              className="object-contain"
                            />
                          </div>
                        </div>

                        {/* Card details Footer */}
                        <div className="p-5 space-y-4">
                          <div>
                            <span className="text-[9px] font-extrabold uppercase tracking-widest text-neutral-400">{item.product.brand} • {item.product.style}</span>
                            <h4 className="text-sm font-bold text-neutral-800 truncate mt-0.5">{item.product.title.replace(/®/g, '').trim()}</h4>
                          </div>

                          <div className="flex gap-3">
                            {/* Color Selector */}
                            <div className="flex-1 flex gap-1 items-center overflow-x-auto scrollbar-none">
                              {item.product.colors.slice(0, 5).map(c => {
                                const swatchHex = getSwatchColor(c, true);
                                const isColorActive = item.color === c;
                                return (
                                  <button
                                    key={c}
                                    type="button"
                                    onClick={() => setRackItems(prev => prev.map(ri => ri.id === item.id ? { ...ri, color: c } : ri))}
                                    className={`w-5 h-5 rounded-full border transition-all ${
                                      isColorActive ? 'ring-2 ring-neutral-900 ring-offset-1 scale-105' : 'border-neutral-350'
                                    }`}
                                    style={{
                                      backgroundColor: swatchHex.startsWith('linear-gradient') ? 'transparent' : swatchHex,
                                      backgroundImage: swatchHex.startsWith('linear-gradient') ? swatchHex : 'none'
                                    }}
                                    title={c}
                                  />
                                );
                              })}
                            </div>

                            <button
                              onClick={() => {
                                setEditingItemIdx(itemIdx);
                                setEditViewMode('front');
                                setIsEditorOpen(true);
                              }}
                              className="px-3.5 py-1.5 border border-neutral-200 text-neutral-700 hover:border-neutral-900 rounded-xl text-[10px] font-bold transition-all shadow-3xs"
                            >
                              Edit Design
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Basics single product lookbook card
                selectedBasicsItem && (
                  <div className="max-w-md mx-auto bg-white border border-neutral-200/80 rounded-2xl overflow-hidden flex flex-col justify-between group shadow-3xs select-none">
                    <div className="relative aspect-[4/5] bg-white flex items-center justify-center p-6 border-b border-neutral-100 overflow-hidden">
                      {/* Decoration badge */}
                      <div className="absolute top-4 left-4 z-10 bg-neutral-900/90 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shadow-sm">
                        Premium Print
                      </div>

                      {(() => {
                        const imgSet = selectedBasicsItem.images[selectedBasicsColor] || Object.values(selectedBasicsItem.images)[0];
                        const imgSrc = imgSet ? (typeof imgSet === 'string' ? imgSet : (imgSet as any).front) : '';
                        return (
                          <img src={imgSrc} className="max-w-[85%] max-h-[85%] object-contain pointer-events-none" alt={selectedBasicsItem.style} />
                        );
                      })()}

                      {/* Projected logo */}
                      <div 
                        style={{
                          position: 'absolute',
                          left: '50%',
                          top: '35%',
                          width: '28%',
                          transform: 'translate(-50%, -50%)',
                          pointerEvents: 'none'
                        }}
                      >
                        <img 
                          src={logoUrl} 
                          alt="overlay" 
                          style={{
                            width: '100%',
                            height: 'auto',
                            mixBlendMode: ['black', 'dark', 'navy', 'patriot', 'charcoal', 'graphite', 'carbon', 'obsidian', 'maroon', 'cardinal', 'burgundy'].some(c => selectedBasicsColor.toLowerCase().includes(c)) ? 'normal' : 'multiply'
                          }}
                          className="object-contain"
                        />
                      </div>
                    </div>

                    <div className="p-5 space-y-4">
                      <div>
                        <span className="text-[9px] font-extrabold uppercase tracking-widest text-neutral-400">{selectedBasicsItem.brand} • {selectedBasicsItem.style}</span>
                        <h4 className="text-sm font-bold text-neutral-800 truncate mt-0.5">{selectedBasicsItem.title.replace(/®/g, '').trim()}</h4>
                      </div>

                      <div className="flex gap-1 overflow-x-auto scrollbar-none py-1">
                        {selectedBasicsItem.colors.slice(0, 8).map(c => {
                          const swatchHex = getSwatchColor(c, true);
                          const isColorActive = selectedBasicsColor === c;
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setSelectedBasicsColor(c)}
                              className={`w-5 h-5 rounded-full border transition-all ${
                                isColorActive ? 'ring-2 ring-neutral-900 ring-offset-1 scale-105' : 'border-neutral-350'
                              }`}
                              style={{
                                backgroundColor: swatchHex.startsWith('linear-gradient') ? 'transparent' : swatchHex,
                                backgroundImage: swatchHex.startsWith('linear-gradient') ? swatchHex : 'none'
                              }}
                              title={c}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Actions Footer */}
            <div className="pt-8 border-t border-neutral-200/50 flex justify-between items-center">
              <button
                onClick={() => setStep(2)}
                className="px-5 h-11 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-3xs"
              >
                <ArrowLeft size={14} /> Back
              </button>
              <PillButton 
                variant="filled" 
                onClick={compileLookbookToCart} 
                disabled={isSubmitting}
                className="gap-2"
              >
                {isSubmitting ? (
                  <><Loader2 className="animate-spin" size={14} /> Generating Lookbook Mockups...</>
                ) : (
                  <>Continue to Sizes <ArrowRight size={14} /></>
                )}
              </PillButton>
            </div>
          </div>
        )}

        {/* STEP 4: SIZES & QUANTITIES BREAKDOWN */}
        {step === 4 && cart.length > 0 && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="w-full bg-white/85 backdrop-blur-md rounded-3xl p-6 border border-neutral-200 shadow-3xs flex items-center gap-3">
              <button
                onClick={() => setStep(3)}
                className="p-2 border border-neutral-200 hover:border-neutral-450 text-neutral-500 hover:text-neutral-900 bg-neutral-50 rounded-xl transition-all shadow-3xs cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-400">Step 4 of 5</span>
                <h3 className="text-2xl font-serif text-neutral-900 mt-0.5">Sizing Distribution & Quantities</h3>
              </div>
            </div>

            {/* Sizes Spread Matrices per Item */}
            <div className="space-y-6">
              {cart.map((item) => (
                <div key={item.id} className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-3xs grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                  <div className="lg:col-span-4 flex gap-4 items-center">
                    <div className="w-14 h-16 bg-white border border-neutral-200 rounded-lg flex items-center justify-center p-1.5 overflow-hidden flex-shrink-0">
                      <img src={item.mockupUrl} alt={item.product.title} className="max-h-full max-w-full object-contain" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">{item.product.brand} {item.product.style}</span>
                      <h4 className="text-xs font-bold text-neutral-850 truncate">{item.product.title.replace(/®/g, '').trim()}</h4>
                      <p className="text-[10px] text-neutral-500 mt-0.5">Color: <span className="font-bold text-neutral-800">{item.color}</span> | Decoration: <span className="font-bold text-neutral-800">{item.decorationMethod}</span></p>
                    </div>
                  </div>

                  {/* XS to 3XL Spreadsheet Input */}
                  <div className="lg:col-span-6 grid grid-cols-7 gap-2">
                    {['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'].map((size) => (
                      <div key={size} className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-neutral-400 text-center uppercase tracking-wider">{size}</label>
                        <input
                          type="number"
                          min="0"
                          value={item.sizes?.[size] ?? 0}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            updateCartItemSize(item.id, size, val);
                          }}
                          className="w-full bg-neutral-50 border border-neutral-200 rounded-lg py-1.5 text-center text-xs font-bold text-neutral-900 outline-none focus:border-neutral-400 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="lg:col-span-2 text-right border-t lg:border-t-0 lg:border-l border-neutral-100 pt-4 lg:pt-0 lg:pl-6">
                    <span className="text-[9px] text-neutral-400 block font-bold uppercase">Total Units</span>
                    <span className="text-base font-extrabold text-neutral-900 block mt-0.5">{item.qty} units</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="pt-8 border-t border-neutral-200/50 flex justify-between items-center">
              <button
                onClick={() => setStep(3)}
                className="px-5 h-11 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-3xs"
              >
                <ArrowLeft size={14} /> Back
              </button>
              <PillButton 
                variant="filled" 
                onClick={() => setStep(5)} 
                className="gap-2"
              >
                Continue to Review <ArrowRight size={14} />
              </PillButton>
            </div>
          </div>
        )}

        {/* STEP 5: REVIEW DETAILS & CHECKOUT */}
        {step === 5 && cart.length > 0 && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="w-full bg-white/85 backdrop-blur-md rounded-3xl p-6 border border-neutral-200 shadow-3xs flex items-center gap-3">
              <button
                onClick={() => setStep(4)}
                className="p-2 border border-neutral-200 hover:border-neutral-450 text-neutral-500 hover:text-neutral-900 bg-neutral-50 rounded-xl transition-all shadow-3xs cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-400">Step 5 of 5</span>
                <h3 className="text-2xl font-serif text-neutral-900 mt-0.5">Finalize Project & Submit Quote</h3>
              </div>
            </div>

            {/* Client Registration Notice */}
            <div className="bg-white/80 backdrop-blur-md border border-neutral-200 rounded-3xl p-5 flex gap-4 items-start text-xs text-neutral-600 leading-relaxed shadow-3xs max-w-4xl">
              <div className="bg-neutral-100 p-2 rounded-xl text-neutral-900 shrink-0">
                <UserPlus size={18} />
              </div>
              <div className="space-y-1">
                <span className="font-extrabold text-neutral-855 block text-sm">Quote Request & Client Registration</span>
                <p>Submit your design selections as a quote request. No payment is required today. This will register you as a new client and automatically prepare your portal account, where you can log in with Google to monitor project status and view custom pricing quotes once completed by our design team.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Form Info Panel */}
              <div className="lg:col-span-8 bg-white border border-neutral-200 rounded-3xl p-8 shadow-3xs space-y-6">
                <div>
                  <h4 className="text-sm font-bold text-neutral-850 uppercase tracking-wider">Contact & Vision</h4>
                  <p className="text-xs text-neutral-500 mt-1">Provide details for contact and project delivery.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-neutral-700">Contact Name *</label>
                    <input 
                      type="text" 
                      required
                      value={customerInfo.contactName} 
                      onChange={e => setCustomerInfo({...customerInfo, contactName: e.target.value})} 
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:outline-none focus:border-neutral-400" 
                      placeholder="Jane Doe" 
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-neutral-700">Email Address *</label>
                    <input 
                      type="email" 
                      required
                      value={customerInfo.emailAddress} 
                      onChange={e => setCustomerInfo({...customerInfo, emailAddress: e.target.value})} 
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:outline-none focus:border-neutral-400" 
                      placeholder="jane@company.com" 
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-neutral-700">Company Name</label>
                    <input 
                      type="text" 
                      value={customerInfo.companyName} 
                      onChange={e => setCustomerInfo({...customerInfo, companyName: e.target.value})} 
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:outline-none focus:border-neutral-400" 
                      placeholder="Acme Corp" 
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-neutral-700">Phone Number</label>
                    <input 
                      type="tel" 
                      value={customerInfo.phone} 
                      onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})} 
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:outline-none focus:border-neutral-400" 
                      placeholder="(555) 123-4567" 
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-neutral-700">Budget Tier</label>
                    <select
                      value={budgetTier}
                      onChange={e => setBudgetTier(e.target.value)}
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:outline-none"
                    >
                      <option value="Promo / Bulk">Promo / Event Bulk (Economy)</option>
                      <option value="Retail Standard">Retail Standard (Premium Blanks)</option>
                      <option value="Cut & Sew">Custom Cut & Sew (Luxury)</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-neutral-700">Target In-Hands Date</label>
                    <input 
                      type="date" 
                      value={inHandsDate} 
                      onChange={e => setInHandsDate(e.target.value)} 
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:outline-none" 
                    />
                  </div>
                  <div className="md:col-span-2 flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-neutral-700">Vision & Notes</label>
                    <textarea 
                      rows={4} 
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Additional specs or design notes..."
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none resize-none"
                    />
                  </div>
                </div>

                <div className="pt-6 border-t border-neutral-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 justify-between">
                  <button
                    onClick={() => setStep(4)}
                    disabled={isSubmitting}
                    className="px-5 h-11 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <ArrowLeft size={14} /> Back
                  </button>
                  <div className="flex-1 flex justify-end">
                    <button
                      onClick={() => submitOrderOrCheckout(false)}
                      disabled={isSubmitting}
                      className="w-full sm:w-auto px-8 h-11 bg-neutral-900 text-white hover:bg-neutral-800 rounded-xl text-xs font-bold tracking-wide transition-all shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {isSubmitting ? <Loader2 className="animate-spin" size={14} /> : <FileText size={14} />}
                      Submit Quote Request
                    </button>
                  </div>
                </div>
              </div>

              {/* Summary panel */}
              <div className="lg:col-span-4 bg-white border border-neutral-200 rounded-3xl p-6 shadow-3xs space-y-6">
                <h3 className="text-lg font-serif text-neutral-900 border-b border-neutral-150 pb-3">Collection Summary</h3>
                <div className="divide-y divide-neutral-100 text-xs">
                  <div className="py-2.5 flex justify-between">
                    <span className="text-neutral-500 font-semibold">Curated Styles</span>
                    <span className="text-neutral-800 font-bold">{cart.length}</span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-neutral-500 font-semibold">Total Units</span>
                    <span className="text-neutral-800 font-bold">
                      {cart.reduce((acc, item) => acc + item.qty, 0)}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

          </div>
        </div>
      )}

      {/* SINGLE ITEM DESIGN CANVAS EDITOR MODAL */}
      {isEditorOpen && editingItemIdx !== null && editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-neutral-200 rounded-3xl shadow-2xl max-w-4xl w-full p-6 space-y-6 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-start border-b border-neutral-100 pb-3">
              <div>
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-neutral-400">Position & Alignment</span>
                <h3 className="text-lg font-serif text-neutral-900">
                  Tweak Customization for {editingProduct.product.brand} {editingProduct.product.style}
                </h3>
              </div>
              <button 
                onClick={() => setIsEditorOpen(false)}
                className="p-1 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-50 rounded-lg transition-colors border border-transparent"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-6 overflow-y-auto pr-1">
              {/* Canvas Box */}
              <div className="md:col-span-7 flex flex-col gap-4 items-center justify-center bg-neutral-50 rounded-2xl p-6 border border-neutral-200/60 relative min-h-[380px]">
                <div 
                  ref={editorContainerRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  className="w-full max-w-[340px] aspect-[4/5] relative bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs cursor-move"
                >
                  <img src={editingGarmentProxied} className="w-full h-full object-contain pointer-events-none select-none" alt="Editor garment" draggable="false" />
                  
                  {/* Bounding printable area box */}
                  <div 
                    className="absolute border border-dashed border-neutral-350 bg-black/[0.005] rounded-xl pointer-events-none"
                    style={{
                      left: editingProduct.slot === 'hat' ? '30%' : '22%',
                      right: editingProduct.slot === 'hat' ? '30%' : '22%',
                      top: editingProduct.slot === 'hat' ? '40%' : '18%',
                      bottom: editingProduct.slot === 'hat' ? '30%' : '22%'
                    }}
                  >
                    <span className="absolute top-1 left-2 text-[7px] font-bold text-neutral-400/80 uppercase tracking-widest">Printable</span>
                  </div>

                  {/* Logo overlay element */}
                  <div
                    style={{
                      position: 'absolute',
                      left: `${editingProduct.logoPos.x}%`,
                      top: `${editingProduct.logoPos.y}%`,
                      width: `${editingProduct.logoScale * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      pointerEvents: 'none'
                    }}
                  >
                    <div className={`relative w-full h-full p-0.5 border ${isDragging || isResizing ? 'border-neutral-900 border-dashed bg-black/[0.01]' : 'border-transparent'}`}>
                      <div 
                        className="resize-handle absolute bottom-0 right-0 w-3 h-3 bg-white border border-neutral-900 rounded-full shadow-sm cursor-se-resize pointer-events-auto"
                        style={{ transform: 'translate(50%, 50%)', zIndex: 10 }}
                        title="Resize logo"
                      />
                      <img
                        ref={editorLogoRef}
                        src={logoUrl!}
                        style={{
                          transform: `rotate(${editingProduct.logoRotation}deg)`,
                          width: '100%',
                          height: 'auto',
                          mixBlendMode: ['black', 'dark', 'navy', 'patriot', 'charcoal', 'graphite', 'carbon', 'obsidian', 'maroon', 'cardinal', 'burgundy'].some(c => editingProduct.color.toLowerCase().includes(c)) ? 'normal' : 'multiply'
                        }}
                        className="object-contain pointer-events-none"
                        alt="Logo"
                        draggable="false"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Controls Box */}
              <div className="md:col-span-5 space-y-6">
                {/* Print vs Embroidery selection */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-neutral-400 block uppercase tracking-wider">Decoration Method</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setRackItems(prev => prev.map((item, idx) => idx === editingItemIdx ? { ...item, decoration: 'Print' } : item))}
                      className={`py-2.5 border rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        editingProduct.decoration === 'Print'
                          ? 'bg-neutral-900 border-neutral-900 text-white shadow-3xs'
                          : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      Premium Print
                    </button>
                    <button
                      onClick={() => setRackItems(prev => prev.map((item, idx) => idx === editingItemIdx ? { ...item, decoration: 'Embroidery' } : item))}
                      className={`py-2.5 border rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        editingProduct.decoration === 'Embroidery'
                          ? 'bg-neutral-900 border-neutral-900 text-white shadow-3xs'
                          : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      Embroidery
                    </button>
                  </div>
                </div>

                {/* Print placement presets */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-neutral-400 block uppercase tracking-wider">Placement Presets</span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => {
                        setRackItems(prev => prev.map((item, idx) => idx === editingItemIdx ? { ...item, logoPos: { x: 50, y: 35 }, logoScale: 0.28 } : item));
                      }}
                      className="py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold hover:bg-neutral-100 flex items-center justify-center gap-1"
                    >
                      Center
                    </button>
                    <button
                      onClick={() => {
                        setRackItems(prev => prev.map((item, idx) => idx === editingItemIdx ? { ...item, logoPos: { x: 38, y: 30 }, logoScale: 0.14 } : item));
                      }}
                      className="py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold hover:bg-neutral-100 flex items-center justify-center gap-1"
                    >
                      Left Chest
                    </button>
                    <button
                      onClick={() => {
                        setRackItems(prev => prev.map((item, idx) => idx === editingItemIdx ? { ...item, logoPos: { x: 50, y: 35 }, logoScale: 0.28, logoRotation: 0 } : item));
                      }}
                      className="py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold hover:bg-neutral-100 flex items-center justify-center gap-1"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* Sizing Slider Scale */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-neutral-600">Logo Scale</span>
                    <span className="font-bold text-neutral-900">{Math.round(editingProduct.logoScale * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="0.8"
                    step="0.01"
                    value={editingProduct.logoScale}
                    onChange={e => setRackItems(prev => prev.map((item, idx) => idx === editingItemIdx ? { ...item, logoScale: parseFloat(e.target.value) } : item))}
                    className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-neutral-900"
                  />
                </div>

                {/* Sizing Slider Rotation */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-neutral-600">Logo Rotation</span>
                    <span className="font-bold text-neutral-900">{editingProduct.logoRotation}°</span>
                  </div>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={editingProduct.logoRotation}
                    onChange={e => setRackItems(prev => prev.map((item, idx) => idx === editingItemIdx ? { ...item, logoRotation: parseInt(e.target.value) } : item))}
                    className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-neutral-900"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-neutral-100 flex justify-end">
              <PillButton variant="filled" onClick={() => setIsEditorOpen(false)}>
                Save Positioning
              </PillButton>
            </div>
          </div>
        </div>
      )}

      {/* RETAIL ANNOUNCEMENT/STOREFRONT SETTINGS MODAL */}
      {isEditingStorefront && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-6 z-[100] animate-in fade-in duration-200">
          <div className="bg-white border border-neutral-200 rounded-3xl p-8 max-w-lg w-full space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="text-2xl font-serif text-brand-primary flex items-center gap-2">
                Customize Storefront
              </h3>
              <p className="text-brand-secondary text-xs mt-1">
                Branding settings here update the public storefront look.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-brand-primary">Shop / Logo Text</label>
                <input
                  type="text"
                  value={editSettings.logoText}
                  onChange={e => setEditSettings({ ...editSettings, logoText: e.target.value })}
                  className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-brand-primary">Announcement Bar</label>
                <input
                  type="text"
                  value={editSettings.announcement}
                  onChange={e => setEditSettings({ ...editSettings, announcement: e.target.value })}
                  className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-brand-primary">Hero Title</label>
                <input
                  type="text"
                  value={editSettings.heroTitle}
                  onChange={e => setEditSettings({ ...editSettings, heroTitle: e.target.value })}
                  className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-brand-primary">Hero Subtitle</label>
                <textarea
                  rows={2}
                  value={editSettings.heroSubtitle}
                  onChange={e => setEditSettings({ ...editSettings, heroSubtitle: e.target.value })}
                  className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2 text-sm font-medium resize-none"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-neutral-100 flex items-center justify-between gap-3">
              <button
                onClick={() => setIsEditingStorefront(false)}
                className="px-5 py-2.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStorefrontSettings}
                disabled={isSavingSettings}
                className="flex-1 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-bold tracking-wide transition-all shadow-sm flex items-center justify-center gap-1.5"
              >
                {isSavingSettings ? <Loader2 className="animate-spin" size={14} /> : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BACKGROUND COLOR REMOVER preset MODAL */}
      {isColorRemoverOpen && originalArtworkUrl && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-6 z-[110] animate-in fade-in duration-200">
          <div className="bg-white border border-neutral-200 rounded-3xl p-8 max-w-3xl w-full space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-2xl font-serif text-neutral-900">
                  Manual Background & Color Remover
                </h3>
                <p className="text-brand-secondary text-xs mt-1">
                  Click on specific pixels or choose dominant presets below to make colors transparent.
                </p>
              </div>
              <button 
                onClick={() => setIsColorRemoverOpen(false)}
                className="p-1 border border-neutral-100 rounded-full text-neutral-400 hover:text-neutral-900 transition-all cursor-pointer bg-neutral-50"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Canvas viewport */}
              <div className="md:col-span-8 flex items-center justify-center p-4 bg-checkerboard rounded-2xl border border-neutral-200/60 overflow-hidden select-none min-h-[320px]">
                <canvas 
                  ref={removerCanvasRef} 
                  onClick={(e) => {
                    const canvas = removerCanvasRef.current;
                    if (!canvas || !originalArtworkUrl) return;
                    const rect = canvas.getBoundingClientRect();
                    const xRatio = (e.clientX - rect.left) / rect.width;
                    const yRatio = (e.clientY - rect.top) / rect.height;
                    const x = Math.floor(xRatio * canvas.width);
                    const y = Math.floor(yRatio * canvas.height);
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.src = originalArtworkUrl;
                    img.onload = () => {
                      const offscreen = document.createElement('canvas');
                      offscreen.width = canvas.width;
                      offscreen.height = canvas.height;
                      const offscreenCtx = offscreen.getContext('2d');
                      if (!offscreenCtx) return;
                      offscreenCtx.drawImage(img, 0, 0, canvas.width, canvas.height);
                      const pixel = offscreenCtx.getImageData(x, y, 1, 1).data;
                      const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
                      if (!removerColorsToRemove.includes(hex)) {
                        setRemoverColorsToRemove(prev => [...prev, hex]);
                      }
                    };
                  }}
                  className="max-h-[380px] max-w-full object-contain cursor-crosshair shadow-sm rounded-lg"
                />
              </div>

              {/* Remover Options */}
              <div className="md:col-span-4 space-y-6">
                {/* Removed list */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block">Active Removal List</span>
                  {removerColorsToRemove.length === 0 ? (
                    <p className="text-xs text-neutral-500 italic">No colors selected for removal.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {removerColorsToRemove.map(hex => (
                        <div 
                          key={hex} 
                          onClick={() => setRemoverColorsToRemove(prev => prev.filter(c => c !== hex))}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-neutral-100 hover:bg-red-50 hover:text-red-600 rounded-lg text-[10px] font-bold border border-neutral-200 transition-all cursor-pointer group"
                        >
                          <span className="w-2.5 h-2.5 rounded-full border border-black/15 shrink-0" style={{ backgroundColor: hex }} />
                          <span className="font-mono">{hex}</span>
                          <span className="text-neutral-400 group-hover:text-red-500 font-normal">✕</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Dominant presets */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block">Dominant Palette</span>
                  <div className="flex flex-wrap gap-2">
                    {removerExtracted.map(hex => {
                      const isActive = removerColorsToRemove.includes(hex);
                      return (
                        <button
                          key={hex}
                          onClick={() => {
                            if (isActive) setRemoverColorsToRemove(prev => prev.filter(c => c !== hex));
                            else setRemoverColorsToRemove(prev => [...prev, hex]);
                          }}
                          className={`w-8 h-8 rounded-full border shadow-3xs relative flex items-center justify-center transition-all ${
                            isActive ? 'ring-2 ring-neutral-900 ring-offset-2 scale-110' : 'border-neutral-300 hover:scale-105'
                          }`}
                          style={{ backgroundColor: hex }}
                          title={`Click to toggle removal of ${hex}`}
                        >
                          {isActive && <span className="text-[10px] text-white">✕</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Tolerance slider */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-neutral-600">Color Fuzziness Tolerance</span>
                    <span className="font-bold text-neutral-900">{removerTolerance}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="80"
                    step="1"
                    value={removerTolerance}
                    onChange={e => setRemoverTolerance(parseInt(e.target.value))}
                    className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-neutral-900"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-neutral-100 flex items-center justify-between gap-3">
              <button 
                onClick={() => {
                  setRemoverColorsToRemove([]);
                  setRemoverTolerance(30);
                }}
                className="px-4 py-2 border border-neutral-200 text-xs font-bold hover:bg-neutral-50 rounded-xl"
              >
                Clear All
              </button>
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsColorRemoverOpen(false)}
                  className="px-4 py-2 border border-neutral-200 text-xs font-bold hover:bg-neutral-50 rounded-xl"
                >
                  Cancel
                </button>
                <button 
                  onClick={applyColorRemoverChanges}
                  className="px-6 py-2 bg-neutral-900 text-white text-xs font-bold hover:bg-neutral-800 rounded-xl shadow-xs"
                >
                  Apply & Save Transparency
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
