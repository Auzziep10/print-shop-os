import { useState, useRef, useMemo, useEffect } from 'react';
import { 
  ArrowRight, 
  ArrowLeft,
  Upload, 
  DollarSign, 
  Shirt, 
  CheckCircle, 
  Search, 
  Check, 
  RotateCw, 
  Maximize2, 
  AlignCenter, 
  AlignLeft, 
  RefreshCw,
  Loader2,
  Lock,
  FileText,
  Truck,
  Sparkles,
  Layers,
  Settings,
  Phone,
  ChevronLeft,
  X,
  Sliders
} from 'lucide-react';
import { db, storage } from '../../lib/firebase';
import { doc, getDoc, setDoc, getDocs, collection, query, where, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
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

const isRenderableImage = (fileName: string | null): boolean => {
  if (!fileName) return true;
  if (fileName.startsWith('AI Prompt:') || fileName.startsWith('AI Logo')) return true;
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '');
};

const baseColors: Record<string, string> = {
  // Whites / Light / Greys
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

  // Blacks / Darks
  black: "#1A1A1A",
  dark: "#1A1A1A",
  onyx: "#0F0F0F",
  coal: "#2A2A2A",
  obsidian: "#121212",

  // Blues
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

  // Reds / Pinks
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

  // Greens
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

  // Yellows / Golds / Oranges
  yellow: "#FACC15",
  gold: "#D97706",
  vegas: "#C5B358",
  amber: "#FFBF00",
  orange: "#F97316",
  tangerine: "#F28500",
  copper: "#B87333",
  bronze: "#CD7F32",
  mustard: "#FFDB58",

  // Purples
  purple: "#7C3AED",
  lavender: "#E9D5FF",
  violet: "#8F00FF",

  // Browns / Tans
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
  
  // 1. Try exact case-insensitive match in generated color-hex-map
  for (const [key, hex] of Object.entries(colorHexMap)) {
    if (key.toLowerCase() === normalized) {
      return hex;
    }
  }

  // 2. Try substring match in generated color-hex-map (e.g. if "biscuit" matches "biscuit/ true blue")
  for (const [key, hex] of Object.entries(colorHexMap)) {
    const keyLower = key.toLowerCase();
    if (keyLower.includes(normalized) || normalized.includes(keyLower)) {
      return hex;
    }
  }

  // 3. Fall back to baseColors exact match
  if (baseColors[normalized]) {
    return baseColors[normalized];
  }
  
  // 4. Fall back to baseColors multi-word and sub-matches
  for (const [key, hex] of Object.entries(baseColors)) {
    if (key.includes(' ') && normalized.includes(key)) {
      return hex;
    }
  }
  
  for (const [key, hex] of Object.entries(baseColors)) {
    if (!key.includes(' ') && normalized.includes(key)) {
      return hex;
    }
  }
  
  return "#D1D5DB";
}

export function getSwatchColor(colorName: string, returnGradient = false): string {
  if (!colorName) return "#D1D5DB";
  
  const parts = colorName.split('/').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return "#D1D5DB";
  
  const colors = parts.map(resolveSingleColor);
  
  if (!returnGradient || colors.length === 1) {
    return colors[0];
  }
  
  if (colors.length === 2) {
    return `linear-gradient(135deg, ${colors[0]} 50%, ${colors[1]} 50%)`;
  }
  
  if (colors.length === 3) {
    return `linear-gradient(135deg, ${colors[0]} 33%, ${colors[1]} 33%, ${colors[1]} 66%, ${colors[2]} 66%)`;
  }
  
  return colors[0];
}

export function PublicQuoteRequest() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, userData, signInWithGoogle, signOut } = useAuth();
  const isAdmin = userData?.role === 'Admin' || userData?.role === 'Leadership';

  const [step, setStep] = useState(1);
  const [cart, setCart] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [paymentSuccessMsg, setPaymentSuccessMsg] = useState('');

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
            // Update Firestore Order status to paid and statusIndex to 4 (Sourcing)
            await setDoc(doc(db, 'orders', orderId), {
              paymentStatus: 'paid',
              statusIndex: 4, // 4 = Sourcing
              stripePaymentIntent: data.payment_intent || '',
              activities: [
                {
                  id: `act-${Date.now()}`,
                  type: 'system',
                  message: `Payment of $${((data.amount_total || 0) / 100).toFixed(2)} processed successfully via Stripe Checkout. Order moved to Sourcing.`,
                  user: 'Stripe Integration',
                  timestamp: new Date().toISOString()
                }
              ]
            }, { merge: true });

            setPaymentSuccessMsg(`Thank you! Your payment of $${((data.amount_total || 0) / 100).toFixed(2)} was received successfully. Your account has been setup and you can log in using Google Auth at any time with your email to track progress in your Client Portal.`);
            setSuccess(true);
          } else {
            console.error("Payment not verified:", data);
            alert("Could not verify your payment status. Please contact support.");
          }
        } catch (err) {
          console.error("Verification error:", err);
          alert("Error verifying payment.");
        } finally {
          setIsVerifyingPayment(false);
        }
      };
      verifyPayment();
    }
  }, [searchParams]);

  // Step 4: Checkout details (moved up for pricing access)
  const [qty, setQty] = useState('50');
  const [budgetTier, setBudgetTier] = useState('Retail Standard');
  const [inHandsDate, setInHandsDate] = useState('');
  const [notes, setNotes] = useState('');

  // Step 1: Catalog Selection State
  const [selectedProduct, setSelectedProduct] = useState<SanMarProduct | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [productPreviewColors, setProductPreviewColors] = useState<Record<string, string>>({});

  // Storefront Customization State
  const [storefrontSettings, setStorefrontSettings] = useState({
    logoText: 'PRINT SHOP OS',
    announcement: '🔥 Free Standard Shipping on all orders above 50 units!',
    heroTitle: 'Custom T-shirts & Promotional Products for Your Group',
    heroSubtitle: 'Select a category below to browse our curated, premium blanks. Choose a style to start decorating.',
    contactPhone: '(800) 555-0199',
    email: 'hello@printshopos.com'
  });
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isEditingStorefront, setIsEditingStorefront] = useState(false);
  const [editSettings, setEditSettings] = useState({ ...storefrontSettings });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  useEffect(() => {
    const fetchStorefrontSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'storefront');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setStorefrontSettings(prev => ({ ...prev, ...data }));
          setEditSettings(prev => ({ ...prev, ...data }));
        }
      } catch (err) {
        console.error("Error fetching storefront settings:", err);
      } finally {
        setIsLoadingSettings(false);
      }
    };
    fetchStorefrontSettings();
  }, []);


  const handleSaveStorefrontSettings = async () => {
    setIsSavingSettings(true);
    try {
      await setDoc(doc(db, 'settings', 'storefront'), editSettings, { merge: true });
      setStorefrontSettings(editSettings);
      setIsEditingStorefront(false);
    } catch (err) {
      console.error("Error saving storefront settings:", err);
      alert("Failed to save storefront settings.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Step 2: Designer Canvas State
  const [viewMode, setViewMode] = useState<'front' | 'back'>('front');
  
  // Front placement state
  const [frontLogoUrl, setFrontLogoUrl] = useState<string | null>(null);
  const [frontArtworkName, setFrontArtworkName] = useState<string | null>(null);
  const [frontLogoPos, setFrontLogoPos] = useState({ x: 50, y: 35 });
  const [frontLogoScale, setFrontLogoScale] = useState(0.3);
  const [frontLogoRotation, setFrontLogoRotation] = useState(0);
  const [frontPrintSize, setFrontPrintSize] = useState<'Small' | 'Medium' | 'Large'>('Medium');

  // Back placement state
  const [backLogoUrl, setBackLogoUrl] = useState<string | null>(null);
  const [backArtworkName, setBackArtworkName] = useState<string | null>(null);
  const [backLogoPos, setBackLogoPos] = useState({ x: 50, y: 35 });
  const [backLogoScale, setBackLogoScale] = useState(0.3);
  const [backLogoRotation, setBackLogoRotation] = useState(0);
  const [backPrintSize, setBackPrintSize] = useState<'Small' | 'Medium' | 'Large'>('Medium');

  const [extractedColors, setExtractedColors] = useState<string[]>([]);
  const [frontOriginalArtworkUrl, setFrontOriginalArtworkUrl] = useState<string | null>(null);
  const [backOriginalArtworkUrl, setBackOriginalArtworkUrl] = useState<string | null>(null);
  const [frontOriginalFileUrl, setFrontOriginalFileUrl] = useState<string | null>(null);
  const [backOriginalFileUrl, setBackOriginalFileUrl] = useState<string | null>(null);
  const originalArtworkUrl = viewMode === 'front' ? frontOriginalArtworkUrl : backOriginalArtworkUrl;
  const setOriginalArtworkUrl = (url: string | null) => {
    if (viewMode === 'front') setFrontOriginalArtworkUrl(url);
    else setBackOriginalArtworkUrl(url);
  };

  const [isColorRemoverOpen, setIsColorRemoverOpen] = useState(false);
  const [removerColorsToRemove, setRemoverColorsToRemove] = useState<string[]>([]);
  const [removerTolerance, setRemoverTolerance] = useState(30);
  const [removerExtracted, setRemoverExtracted] = useState<string[]>([]);
  const removerCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [frontMockupUrl, setFrontMockupUrl] = useState<string | null>(null);
  const [backMockupUrl, setBackMockupUrl] = useState<string | null>(null);
  const [isCompilingMockup, setIsCompilingMockup] = useState(false);

  // Custom Studio Designer States
  const [designerTab, setDesignerTab] = useState<'upload' | 'text' | 'clipart' | 'ai'>('upload');
  const [customText, setCustomText] = useState('');
  const [textFont, setTextFont] = useState('Modern');
  const [textColor, setTextColor] = useState('#1E1E1E');
  const [clipartColor, setClipartColor] = useState('#1E1E1E');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiStyle, setAiStyle] = useState('Minimalist Vector Logo');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // Getter/Setter Helpers that bind controls to active side
  const logoUrl = viewMode === 'front' ? frontLogoUrl : backLogoUrl;
  const artworkName = viewMode === 'front' ? frontArtworkName : backArtworkName;
  const logoPos = viewMode === 'front' ? frontLogoPos : backLogoPos;
  const logoScale = viewMode === 'front' ? frontLogoScale : backLogoScale;
  const logoRotation = viewMode === 'front' ? frontLogoRotation : backLogoRotation;
  const printSize = viewMode === 'front' ? frontPrintSize : backPrintSize;

  const setLogoUrl = (url: string | null) => {
    if (viewMode === 'front') setFrontLogoUrl(url);
    else setBackLogoUrl(url);
  };
  const setArtworkName = (name: string | null) => {
    if (viewMode === 'front') setFrontArtworkName(name);
    else setBackArtworkName(name);
  };
  const setLogoPos = (pos: { x: number, y: number }) => {
    if (viewMode === 'front') setFrontLogoPos(pos);
    else setBackLogoPos(pos);
  };
  const setLogoScale = (scale: number) => {
    if (viewMode === 'front') setFrontLogoScale(scale);
    else setBackLogoScale(scale);
  };
  const setLogoRotation = (rotation: number) => {
    if (viewMode === 'front') setFrontLogoRotation(rotation);
    else setBackLogoRotation(rotation);
  };
  const setPrintSize = (size: 'Small' | 'Medium' | 'Large') => {
    if (viewMode === 'front') {
      setFrontPrintSize(size);
      if (size === 'Small') setFrontLogoScale(0.15);
      else if (size === 'Medium') setFrontLogoScale(0.30);
      else setFrontLogoScale(0.50);
    } else {
      setBackPrintSize(size);
      if (size === 'Small') setBackLogoScale(0.15);
      else if (size === 'Medium') setBackLogoScale(0.30);
      else setBackLogoScale(0.50);
    }
  };

  // Helper to convert rgb to hex
  const rgbToHex = (r: number, g: number, b: number) => {
    return "#" + [r, g, b].map(x => {
      const hex = Math.max(0, Math.min(255, x)).toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    }).join("").toUpperCase();
  };

  // Helper to convert hex to rgb
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };

  // Auto-match closest garment color to target hex
  const matchClosestGarmentColor = (targetHex: string, product: SanMarProduct | null) => {
    if (!product) return;
    
    let closestColor = product.colors[0];
    let minDistance = Infinity;
    
    const targetRgb = hexToRgb(targetHex);
    if (!targetRgb) return;
    
    for (const colorName of product.colors) {
      const swatchHex = getSwatchColor(colorName);
      const swatchRgb = hexToRgb(swatchHex);
      if (!swatchRgb) continue;
      
      // Calculate Euclidean distance in RGB space
      const distance = Math.sqrt(
        Math.pow(targetRgb.r - swatchRgb.r, 2) +
        Math.pow(targetRgb.g - swatchRgb.g, 2) +
        Math.pow(targetRgb.b - swatchRgb.b, 2)
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        closestColor = colorName;
      }
    }
    
    setSelectedColor(closestColor);
  };

  // Extract top 5 dominant colors from logo data url
  const extractDominantColors = (dataUrl: string) => {
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        // Downsample to 50x50 to speed up and average colors
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
          
          // Ignore transparent or highly semi-transparent pixels
          if (a < 128) continue;
          
          // Ignore highly white/black colors
          const isWhite = r > 235 && g > 235 && b > 235;
          const isBlack = r < 20 && g < 20 && b < 20;
          if (isWhite || isBlack) continue;
          
          // Group colors by rounding to nearest 24
          const roundedR = Math.round(r / 24) * 24;
          const roundedG = Math.round(g / 24) * 24;
          const roundedB = Math.round(b / 24) * 24;
          
          const hex = rgbToHex(roundedR, roundedG, roundedB);
          colorCounts[hex] = (colorCounts[hex] || 0) + 1;
        }
        
        // Sort colors by frequency
        const sortedColors = Object.entries(colorCounts)
          .sort((a, b) => b[1] - a[1])
          .map(entry => entry[0])
          .slice(0, 5); // Take top 5 dominant colors
          
        setExtractedColors(sortedColors);

        // Auto-match closest garment color to the dominant logo color!
        if (sortedColors.length > 0) {
          matchClosestGarmentColor(sortedColors[0], selectedProduct);
        }
      } catch (err) {
        console.error("Error extracting colors:", err);
      }
    };
  };

  // Extract top 10 dominant colors (including white and black) for the Manual Color Remover presets
  const extractRemoverDominantColors = (img: HTMLImageElement): string[] => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return [];
      
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
        
        // Quantize colors slightly finer (nearest 16)
        const roundedR = Math.round(r / 16) * 16;
        const roundedG = Math.round(g / 16) * 16;
        const roundedB = Math.round(b / 16) * 16;
        
        const hex = rgbToHex(roundedR, roundedG, roundedB);
        colorCounts[hex] = (colorCounts[hex] || 0) + 1;
      }
      
      const sorted = Object.entries(colorCounts)
        .sort((a, b) => b[1] - a[1])
        .map(entry => entry[0])
        .slice(0, 10);
        
      return sorted;
    } catch (err) {
      console.error("Error extracting remover colors:", err);
      return [];
    }
  };

  const openColorRemover = () => {
    if (!originalArtworkUrl) return;
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = originalArtworkUrl;
    img.onload = () => {
      const extracted = extractRemoverDominantColors(img);
      setRemoverExtracted(extracted);
      
      // Auto-select white (#FFFFFF) for removal if present
      const whiteHex = "#FFFFFF";
      const hasWhite = extracted.some(c => c.toUpperCase() === whiteHex);
      if (hasWhite) {
        setRemoverColorsToRemove([whiteHex]);
      } else {
        setRemoverColorsToRemove([]);
      }
      setRemoverTolerance(30);
      setIsColorRemoverOpen(true);
    };
    img.onerror = () => {
      alert("Failed to load original image for background removal.");
    };
  };

  const openColorRemoverWithImage = (imageUrl: string, friendlyName: string) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => {
      const extracted = extractRemoverDominantColors(img);
      setRemoverExtracted(extracted);
      
      const whiteHex = "#FFFFFF";
      const hasWhite = extracted.some(c => c.toUpperCase() === whiteHex);
      if (hasWhite) {
        setRemoverColorsToRemove([whiteHex]);
      } else {
        setRemoverColorsToRemove([]);
      }
      setRemoverTolerance(30);
      setArtworkName(friendlyName);
      setIsColorRemoverOpen(true);
    };
  };

  const handleRemoverCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
  };

  const applyColorRemoverChanges = () => {
    const canvas = removerCanvasRef.current;
    if (!canvas) return;
    
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `modified_logo_${Date.now()}.png`, { type: 'image/png' });
      
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          extractDominantColors(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
      
      await uploadGeneratedLogo(file, artworkName || 'Modified Artwork');
      setIsColorRemoverOpen(false);
    }, 'image/png');
  };

  // Real-time canvas preview processing for the color remover
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
            const dist = Math.sqrt(
              Math.pow(r - target.r, 2) +
              Math.pow(g - target.g, 2) +
              Math.pow(b - target.b, 2)
            );
            if (dist <= threshold) {
              shouldRemove = true;
              break;
            }
          }
          
          if (shouldRemove) {
            data[i+3] = 0;
          }
        }
        
        ctx.putImageData(imgData, 0, 0);
      }
    };
  }, [isColorRemoverOpen, originalArtworkUrl, removerColorsToRemove, removerTolerance]);

  // Automatically sync print sizes when scale changes
  useEffect(() => {
    if (frontLogoScale < 0.20) {
      setFrontPrintSize('Small');
    } else if (frontLogoScale < 0.40) {
      setFrontPrintSize('Medium');
    } else {
      setFrontPrintSize('Large');
    }
  }, [frontLogoScale]);

  useEffect(() => {
    if (backLogoScale < 0.20) {
      setBackPrintSize('Small');
    } else if (backLogoScale < 0.40) {
      setBackPrintSize('Medium');
    } else {
      setBackPrintSize('Large');
    }
  }, [backLogoScale]);


  // Pricing Matrix Logic
  const pricingDetails = useMemo(() => {
    if (!selectedProduct) return { base: 0, front: 0, back: 0, surcharge: 0, total: 0, discountPct: 0, multiplier: 1 };
    
    const q = parseInt(qty || '0') || 50;
    let multiplier = 1.00;
    let discountPct = 0;
    
    if (q < 12) {
      multiplier = 1.50; // low run premium (+50% surcharge)
      discountPct = -50;
    } else if (q < 24) {
      multiplier = 1.20; // (+20% surcharge)
      discountPct = -20;
    } else if (q < 50) {
      multiplier = 1.00; // base wholesale rate
      discountPct = 0;
    } else if (q < 100) {
      multiplier = 0.85; // 15% discount
      discountPct = 15;
    } else if (q < 250) {
      multiplier = 0.75; // 25% discount
      discountPct = 25;
    } else if (q < 500) {
      multiplier = 0.65; // 35% discount
      discountPct = 35;
    } else {
      multiplier = 0.55; // 45% discount
      discountPct = 45;
    }

    const basePrice = selectedProduct.price * multiplier;
    let frontCost = 0;
    let backCost = 0;

    if (frontLogoUrl) {
      if (frontPrintSize === 'Small') frontCost = 2.50;
      else if (frontPrintSize === 'Medium') frontCost = 4.50;
      else frontCost = 6.50;
      frontCost *= multiplier;
    }

    if (backLogoUrl) {
      if (backPrintSize === 'Small') backCost = 2.50;
      else if (backPrintSize === 'Medium') backCost = 4.50;
      else backCost = 6.50;
      backCost *= multiplier;
    }

    // Double-sided setups surcharge
    const setupSurcharge = ((frontLogoUrl && backLogoUrl) ? 2.00 : 0) * multiplier;
    const unitPrice = basePrice + frontCost + backCost + setupSurcharge;

    return {
      base: basePrice,
      front: frontCost,
      back: backCost,
      surcharge: setupSurcharge,
      total: unitPrice,
      discountPct,
      multiplier
    };
  }, [selectedProduct, frontLogoUrl, frontPrintSize, backLogoUrl, backPrintSize, qty]);

  // Step 3: Customer details
  const [customerInfo, setCustomerInfo] = useState({
    companyName: '',
    contactName: '',
    emailAddress: '',
    phone: '',
    website: ''
  });



  // Refs for Step 2 Canvas
  const containerRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<any>(null);
  const dragStartOffset = useRef({ x: 0, y: 0 });

  // Get unique brands for Step 1
  const brands = useMemo(() => {
    const unique = new Set(sanmarCatalog.map(p => p.brand));
    return ['All', ...Array.from(unique)];
  }, []);

  // Filtered products list for Step 1
  const filteredProducts = useMemo(() => {
    return sanmarCatalog.filter(p => {
      const matchesSearch = 
        p.style.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesBrand = selectedBrand === 'All' || p.brand === selectedBrand;
      const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;

      return matchesSearch && matchesBrand && matchesCategory;
    });
  }, [searchQuery, selectedBrand, selectedCategory]);

  // Pointer dragging event handlers for Step 2 Canvas
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!logoUrl || !containerRef.current || !logoRef.current) return;
    
    const logoRect = logoRef.current.getBoundingClientRect();
    const clickX = e.clientX;
    const clickY = e.clientY;

    // Check if click occurred inside bounds of the logo image
    if (
      clickX >= logoRect.left &&
      clickX <= logoRect.right &&
      clickY >= logoRect.top &&
      clickY <= logoRect.bottom
    ) {
      e.preventDefault();
      setIsDragging(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      const logoCenterX = logoRect.left + logoRect.width / 2;
      const logoCenterY = logoRect.top + logoRect.height / 2;
      dragStartOffset.current = {
        x: clickX - logoCenterX,
        y: clickY - logoCenterY
      };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !containerRef.current || !logoUrl) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const newCenterX = e.clientX - containerRect.left - dragStartOffset.current.x;
    const newCenterY = e.clientY - containerRect.top - dragStartOffset.current.y;

    const xPct = Math.max(0, Math.min(100, (newCenterX / containerRect.width) * 100));
    const yPct = Math.max(0, Math.min(100, (newCenterY / containerRect.height) * 100));

    setLogoPos({ x: xPct, y: yPct });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Safe fallback if target doesn't support capture
      }
    }
  };

  const applyPreset = (preset: 'center' | 'left' | 'reset') => {
    if (preset === 'center') {
      setLogoPos({ x: 50, y: 35 });
      setLogoScale(0.3);
    } else if (preset === 'left') {
      setLogoPos({ x: 38, y: 30 });
      setLogoScale(0.18);
    } else {
      setLogoPos({ x: 50, y: 35 });
      setLogoScale(0.3);
      setLogoRotation(0);
    }
  };

  // Curated Clipart Vectors
  const clipartSVGs: Record<string, string> = {
    Star: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="COLOR" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    Heart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="COLOR" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
    Shield: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="COLOR" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    Trophy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34"/><path d="M12 2a6 6 0 0 1 6 6v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8a6 6 0 0 1 6-6z" fill="COLOR"/></svg>`,
    Flame: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="COLOR" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
    Crown: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="COLOR" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/></svg>`,
    Lightning: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="COLOR" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    Gear: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="COLOR" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    Skull: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="COLOR" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a8 8 0 0 0-8 8c0 3.2 2 6.1 4.9 7.2L9 22h6l.1-4.8C18 16.1 20 13.2 20 10a8 8 0 0 0-8-8z"/><circle cx="9" cy="11" r="1.5"/><circle cx="15" cy="11" r="1.5"/><path d="M12 14v2"/></svg>`,
    Anchor: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="22"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/><circle cx="12" cy="5" r="1"/></svg>`,
    Coffee: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" fill="COLOR"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>`,
    Compass: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="COLOR"/></svg>`
  };

  // Helper to upload generated client-side designs to Firebase
  const uploadGeneratedLogo = async (file: File, friendlyName: string) => {
    setIsUploadingLogo(true);
    try {
      const tempId = `temp_logo_${Date.now()}`;
      const storageRef = ref(storage, `public_quotes/logos/${tempId}/${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setLogoUrl(url);
      if (viewMode === 'front') {
        if (!frontOriginalFileUrl) setFrontOriginalFileUrl(url);
      } else {
        if (!backOriginalFileUrl) setBackOriginalFileUrl(url);
      }
      setArtworkName(friendlyName);
    } catch (err) {
      console.error('Generated logo upload failed', err);
      alert('Failed to save generated design.');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  // Render Custom Text to transparent PNG
  const renderTextToImage = () => {
    if (!customText.trim()) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Assign custom selected font families
    let fontStr = `bold 64px sans-serif`;
    if (textFont === 'Serif') fontStr = `bold 64px Georgia, serif`;
    else if (textFont === 'Collegiate') fontStr = `bold 80px "Impact", "Arial Black", sans-serif`;
    else if (textFont === 'Script') fontStr = `italic 70px "Brush Script MT", cursive`;
    else if (textFont === 'Modern') fontStr = `bold 72px "Outfit", "Inter", sans-serif`;
    
    ctx.font = fontStr;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Special Collegiate Outline
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
      const file = new File([blob], `text_design_${Date.now()}.png`, { type: 'image/png' });
      
      // Auto-extract colors from generated text logo
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          extractDominantColors(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);

      await uploadGeneratedLogo(file, `Text: "${customText}"`);
    }, 'image/png');
  };

  // Render Vector Clip Art to transparent PNG
  const renderClipartToImage = (clipartKey: string) => {
    const rawSvg = clipartSVGs[clipartKey];
    if (!rawSvg) return;
    
    const coloredSvg = rawSvg.replace(/COLOR/g, clipartColor);
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
        
        // Auto-extract color list
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            extractDominantColors(event.target.result as string);
          }
        };
        reader.readAsDataURL(file);

        await uploadGeneratedLogo(file, `Clip Art: ${clipartKey}`);
      }, 'image/png');
    };
  };

  // Generate AI Logo via Pollinations API
  const generateAiLogo = async () => {
    if (!aiPrompt.trim()) return;
    
    setIsGeneratingAi(true);
    try {
      const fullPrompt = `${aiPrompt}, ${aiStyle}, high resolution vector logo, isolated graphic on flat solid white background, 4k`;
      const encodedPrompt = encodeURIComponent(fullPrompt);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
      
      const img = new Image();
      img.crossOrigin = 'anonymous';
      // Route through proxy to bypass CORS
      img.src = `/api/sanmar/proxy-image?url=${encodeURIComponent(imageUrl)}`;
      img.onload = () => {
        try {
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
            const file = new File([blob], `ai_logo_${Date.now()}.png`, { type: 'image/png' });
            
            // Upload unmodified generated AI logo to storage
            const tempId = `temp_logo_${Date.now()}`;
            const storageRef = ref(storage, `public_quotes/logos/${tempId}/${file.name}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            
            setLogoUrl(url);
            setOriginalArtworkUrl(url);
            if (viewMode === 'front') {
              setFrontOriginalFileUrl(url);
            } else {
              setBackOriginalFileUrl(url);
            }
            setArtworkName(`AI Prompt: "${aiPrompt}"`);
            setIsGeneratingAi(false);
            
            // Auto-extract palette from the original unmodified image
            const reader = new FileReader();
            reader.onload = (event) => {
              if (event.target?.result) {
                extractDominantColors(event.target.result as string);
              }
            };
            reader.readAsDataURL(file);

            // Automatically open the color remover dialog so they can pick/confirm transparency!
            openColorRemoverWithImage(url, `AI Prompt: "${aiPrompt}"`);
          }, 'image/png');
          
        } catch (err) {
          console.error("AI image processing error", err);
          setIsGeneratingAi(false);
          alert("AI image completed, but we failed to process it. Displaying raw logo.");
          setLogoUrl(imageUrl);
          setOriginalArtworkUrl(imageUrl);
          if (viewMode === 'front') {
            setFrontOriginalFileUrl(imageUrl);
          } else {
            setBackOriginalFileUrl(imageUrl);
          }
          setArtworkName(`AI Prompt: "${aiPrompt}"`);
        }
      };
      img.onerror = () => {
        setIsGeneratingAi(false);
        alert("Failed to compile AI logo. Please check prompt and try again.");
      };
    } catch (err) {
      console.error("AI Logo Generator Error", err);
      setIsGeneratingAi(false);
      alert("AI Generation failed. Please try again.");
    }
  };

  // Upload logo file
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isRenderable = isRenderableImage(file.name);
    if (isRenderable) {
      // Extract dominant colors locally from the uploaded file (CORS-safe)
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          extractDominantColors(event.target.result as string);
          setOriginalArtworkUrl(event.target.result as string); // Save unmodified source!
        }
      };
      reader.readAsDataURL(file);
    } else {
      // Non-renderable vector/document formats: clear canvas color extraction and background remover cache
      setExtractedColors([]);
      setOriginalArtworkUrl(null);
    }

    setIsUploadingLogo(true);
    try {
      const tempId = `temp_logo_${Date.now()}`;
      const storageRef = ref(storage, `public_quotes/logos/${tempId}/${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setLogoUrl(url);
      if (viewMode === 'front') {
        setFrontOriginalFileUrl(url);
      } else {
        setBackOriginalFileUrl(url);
      }
      setArtworkName(file.name);
    } catch (err) {
      console.error('Logo upload failed', err);
      alert('Failed to upload logo image.');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  // Compile Canvas Mockup for a specific side (front or back)
  const compileMockupSide = (side: 'front' | 'back'): Promise<string | null> => {
    return new Promise(async (resolve, reject) => {
      if (!selectedProduct || !selectedColor) {
        resolve(null);
        return;
      }
      
      const imageSet = selectedProduct.images[selectedColor] || Object.values(selectedProduct.images)[0];
      const garmentImgUrl = imageSet ? (typeof imageSet === 'string' ? imageSet : imageSet[side]) : '';
      const sideLogoUrl = side === 'front' ? frontLogoUrl : backLogoUrl;
      
      // If no custom logo has been uploaded for this side, just resolve the blank garment image
      if (!sideLogoUrl) {
        resolve(garmentImgUrl);
        return;
      }

      const sideLogoScale = side === 'front' ? frontLogoScale : backLogoScale;
      const sideLogoPos = side === 'front' ? frontLogoPos : backLogoPos;
      const sideLogoRotation = side === 'front' ? frontLogoRotation : backLogoRotation;

      try {
        const proxiedGarmentUrl = garmentImgUrl.startsWith('http')
          ? `/api/sanmar/proxy-image?url=${encodeURIComponent(garmentImgUrl)}`
          : garmentImgUrl;

        const sideArtworkName = side === 'front' ? frontArtworkName : backArtworkName;
        const isRenderable = isRenderableImage(sideArtworkName);

        const loadImage = (src: string): Promise<HTMLImageElement> => {
          return new Promise((res, rej) => {
            const img = new Image();
            if (src.startsWith('http') || src.startsWith('//')) {
              img.crossOrigin = 'anonymous';
            }
            img.src = src;
            img.onload = () => res(img);
            img.onerror = () => rej(new Error(`Failed to load image: ${src}`));
          });
        };

        let garmentImg: HTMLImageElement;
        let logoImg: HTMLImageElement | null = null;

        if (isRenderable) {
          const [gImg, lImg] = await Promise.all([
            loadImage(proxiedGarmentUrl),
            loadImage(sideLogoUrl)
          ]);
          garmentImg = gImg;
          logoImg = lImg;
        } else {
          garmentImg = await loadImage(proxiedGarmentUrl);
        }

        const canvas = document.createElement('canvas');
        canvas.width = garmentImg.naturalWidth;
        canvas.height = garmentImg.naturalHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('Could not create 2D context');
        }

        ctx.drawImage(garmentImg, 0, 0);

        if (containerRef.current) {
          const containerW = containerRef.current.clientWidth;
          const containerH = containerRef.current.clientHeight;

          const logoAspect = (isRenderable && logoImg) ? (logoImg.naturalHeight / logoImg.naturalWidth) : 1.0;
          const uiLogoW = containerW * sideLogoScale;

          // Calculate exact object-contain dimensions and offsets of the garment image in the UI
          const garmentAspect = garmentImg.naturalWidth / garmentImg.naturalHeight;
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

          // Map logo position from container to the actual rendered garment boundaries
          const logoCenterXInImage = (sideLogoPos.x / 100) * containerW - offsetX;
          const logoCenterYInImage = (sideLogoPos.y / 100) * containerH - offsetY;

          // Map to canvas dimensions
          const scaleFactor = canvas.width / renderedW;
          const canvasCenterX = logoCenterXInImage * scaleFactor;
          const canvasCenterY = logoCenterYInImage * scaleFactor;

          const canvasLogoW = uiLogoW * scaleFactor;
          const canvasLogoH = canvasLogoW * logoAspect;

          ctx.save();
          ctx.translate(canvasCenterX, canvasCenterY);
          ctx.rotate((sideLogoRotation * Math.PI) / 180);

          if (isRenderable && logoImg) {
            ctx.drawImage(
              logoImg,
              -canvasLogoW / 2,
              -canvasLogoH / 2,
              canvasLogoW,
              canvasLogoH
            );
          } else {
            // Draw a beautiful vector placeholder badge directly onto the canvas
            const x = -canvasLogoW / 2;
            const y = -canvasLogoH / 2;
            const w = canvasLogoW;
            const h = canvasLogoH;
            const radius = Math.min(w, h) * 0.1;

            // Draw rounded rectangle background with card styling
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + w - radius, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
            ctx.lineTo(x + w, y + h - radius);
            ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
            ctx.lineTo(x + radius, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();

            ctx.fillStyle = '#FFFFFF';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 4;
            ctx.fill();
            
            ctx.shadowColor = 'transparent'; // Reset canvas shadow

            // Draw border
            ctx.lineWidth = Math.max(1, w * 0.02);
            ctx.strokeStyle = '#E5E7EB';
            ctx.stroke();

            // Draw uppercase extension header banner
            const ext = (sideArtworkName || '').split('.').pop()?.toUpperCase() || 'FILE';
            ctx.fillStyle = '#171717'; // Brand primary color
            const bannerHeight = h * 0.28;
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + w - radius, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
            ctx.lineTo(x + w, y + bannerHeight);
            ctx.lineTo(x, y + bannerHeight);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
            ctx.fill();

            // Write extension text
            ctx.fillStyle = '#FFFFFF';
            const fontSizeExt = Math.max(10, Math.floor(h * 0.16));
            ctx.font = `bold ${fontSizeExt}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ext, 0, y + bannerHeight / 2);

            // Draw standard paper outline icon
            ctx.strokeStyle = '#737373';
            ctx.lineWidth = Math.max(1, w * 0.02);
            const iconW = w * 0.25;
            const iconH = h * 0.3;
            const iconX = -iconW / 2;
            const iconY = y + bannerHeight + (h - bannerHeight - iconH) / 2 - h * 0.05;
            
            ctx.beginPath();
            ctx.moveTo(iconX, iconY);
            ctx.lineTo(iconX + iconW * 0.7, iconY);
            ctx.lineTo(iconX + iconW, iconY + iconH * 0.3);
            ctx.lineTo(iconX + iconW, iconY + iconH);
            ctx.lineTo(iconX, iconY + iconH);
            ctx.closePath();
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(iconX + iconW * 0.7, iconY);
            ctx.lineTo(iconX + iconW * 0.7, iconY + iconH * 0.3);
            ctx.lineTo(iconX + iconW, iconY + iconH * 0.3);
            ctx.stroke();

            // Write truncated file name below the icon
            ctx.fillStyle = '#404040';
            const fontSizeName = Math.max(8, Math.floor(h * 0.09));
            ctx.font = `${fontSizeName}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            let displayName = sideArtworkName || 'Uploaded File';
            if (displayName.length > 15) {
              displayName = displayName.substring(0, 12) + '...';
            }
            ctx.fillText(displayName, 0, y + h - (h - bannerHeight - iconH) / 4);
          }
          ctx.restore();
        }

        canvas.toBlob(async (blob) => {
          if (!blob) {
            reject(new Error('Canvas conversion to blob failed'));
            return;
          }

          const mockupId = `mockup_${side}_${Date.now()}`;
          const fileRef = ref(storage, `public_quotes/mockups/${mockupId}.png`);
          await uploadBytes(fileRef, blob, { contentType: 'image/png' });
          const finalDownloadUrl = await getDownloadURL(fileRef);
          resolve(finalDownloadUrl);
        }, 'image/png');

      } catch (err) {
        console.error(`Error generating ${side} mockup canvas:`, err);
        reject(err);
      }
    });
  };

  const calculateItemPrice = (product: any, quantity: number, hasFront: boolean, frontSize: string, hasBack: boolean, backSize: string) => {
    if (!product) return { base: 0, front: 0, back: 0, surcharge: 0, total: 0 };
    
    const q = quantity || 50;
    let multiplier = 1.00;
    
    if (q < 12) multiplier = 1.50;
    else if (q < 24) multiplier = 1.20;
    else if (q < 50) multiplier = 1.00;
    else if (q < 100) multiplier = 0.85;
    else if (q < 250) multiplier = 0.75;
    else if (q < 500) multiplier = 0.65;
    else multiplier = 0.55;

    const basePrice = product.price * multiplier;
    let frontCost = 0;
    let backCost = 0;

    if (hasFront) {
      if (frontSize === 'Small') frontCost = 2.50;
      else if (frontSize === 'Medium') frontCost = 4.50;
      else frontCost = 6.50;
      frontCost *= multiplier;
    }

    if (hasBack) {
      if (backSize === 'Small') backCost = 2.50;
      else if (backSize === 'Medium') backCost = 4.50;
      else backCost = 6.50;
      backCost *= multiplier;
    }

    const setupSurcharge = ((hasFront && hasBack) ? 2.00 : 0) * multiplier;
    const unitPrice = basePrice + frontCost + backCost + setupSurcharge;

    return {
      base: basePrice,
      front: frontCost,
      back: backCost,
      surcharge: setupSurcharge,
      total: unitPrice
    };
  };

  const updateCartItemQty = (itemId: string, newQty: number) => {
    setCart(prevCart => {
      return prevCart.map(item => {
        if (item.id !== itemId) return item;
        
        const newPricing = calculateItemPrice(
          item.product,
          newQty,
          !!item.frontLogoUrl,
          item.frontPrintSize,
          !!item.backLogoUrl,
          item.backPrintSize
        );

        return {
          ...item,
          qty: newQty,
          pricingDetails: { ...item.pricingDetails, ...newPricing }
        };
      });
    });
  };

  const updateCartItemSize = (itemId: string, size: string, val: number) => {
    setCart(prevCart => {
      return prevCart.map(item => {
        if (item.id !== itemId) return item;
        
        const newSizes = { ...item.sizes, [size]: val };
        const newQty = Object.values(newSizes).reduce((acc: number, v: any) => acc + (v || 0), 0);
        
        const newPricing = calculateItemPrice(
          item.product,
          newQty,
          !!item.frontLogoUrl,
          item.frontPrintSize,
          !!item.backLogoUrl,
          item.backPrintSize
        );

        return {
          ...item,
          sizes: newSizes,
          qty: newQty,
          pricingDetails: { ...item.pricingDetails, ...newPricing }
        };
      });
    });
  };

  const handleSaveActiveToCartAndReset = async () => {
    if (!selectedProduct) return;
    setIsCompilingMockup(true);
    try {
      let fMockup = null;
      let bMockup = null;

      if (frontLogoUrl) {
        fMockup = await compileMockupSide('front');
        setFrontMockupUrl(fMockup);
      }
      if (backLogoUrl) {
        bMockup = await compileMockupSide('back');
        setBackMockupUrl(bMockup);
      }

      const primaryMockup = fMockup || bMockup || currentGarmentImg;
      
      const newItem = {
        id: `item-${Date.now()}`,
        product: selectedProduct,
        color: selectedColor,
        qty: parseInt(qty || '0') || 50,
        frontLogoUrl,
        frontOriginalFileUrl,
        frontArtworkName,
        frontPrintSize,
        frontMockupUrl: fMockup || frontMockupUrl,
        backLogoUrl,
        backOriginalFileUrl,
        backArtworkName,
        backPrintSize,
        backMockupUrl: bMockup || backMockupUrl,
        mockupUrl: primaryMockup,
        pricingDetails: { ...pricingDetails },
        sizes: { XS: 0, S: 0, M: 0, L: 0, XL: 0, '2XL': 0, '3XL': 0 }
      };

      setCart(prevCart => [...prevCart, newItem]);

      // Reset active designer state
      setSelectedProduct(null);
      setSelectedColor('');
      setFrontLogoUrl('');
      setFrontOriginalFileUrl('');
      setFrontArtworkName('');
      setFrontMockupUrl('');
      setBackLogoUrl('');
      setBackOriginalFileUrl('');
      setBackArtworkName('');
      setBackMockupUrl('');
      setQty('50');

      setStep(1);
    } catch (err) {
      console.error("Error adding garment to cart:", err);
      alert("Failed to add garment. Please try again.");
    } finally {
      setIsCompilingMockup(false);
    }
  };

  const handleProceedToStep3 = async () => {
    // If there is an active design, save it to the cart
    if (selectedProduct) {
      setIsCompilingMockup(true);
      try {
        let fMockup = null;
        let bMockup = null;

        if (frontLogoUrl) {
          fMockup = await compileMockupSide('front');
          setFrontMockupUrl(fMockup);
        }
        if (backLogoUrl) {
          bMockup = await compileMockupSide('back');
          setBackMockupUrl(bMockup);
        }

        const primaryMockup = fMockup || bMockup || currentGarmentImg;
        
        const newItem = {
          id: `item-${Date.now()}`,
          product: selectedProduct,
          color: selectedColor,
          qty: parseInt(qty || '0') || 50,
          frontLogoUrl,
          frontOriginalFileUrl,
          frontArtworkName,
          frontPrintSize,
          frontMockupUrl: fMockup || frontMockupUrl,
          backLogoUrl,
          backOriginalFileUrl,
          backArtworkName,
          backPrintSize,
          backMockupUrl: bMockup || backMockupUrl,
          mockupUrl: primaryMockup,
          pricingDetails: { ...pricingDetails },
          sizes: { XS: 0, S: 0, M: 0, L: 0, XL: 0, '2XL': 0, '3XL': 0 }
        };

        setCart(prevCart => [...prevCart, newItem]);

        // Clear active designer state
        setSelectedProduct(null);
        setSelectedColor('');
        setFrontLogoUrl('');
        setFrontOriginalFileUrl('');
        setFrontArtworkName('');
        setFrontMockupUrl('');
        setBackLogoUrl('');
        setBackOriginalFileUrl('');
        setBackArtworkName('');
        setBackMockupUrl('');
        setQty('50');
      } catch (err) {
        console.error("Error compiling active design mockup:", err);
        alert("Failed to compile mockup. Please try again.");
        setIsCompilingMockup(false);
        return;
      } finally {
        setIsCompilingMockup(false);
      }
    }
    
    setStep(3);
  };

  const handleBackToStep2 = () => {
    if (cart.length > 0) {
      const lastItem = cart[cart.length - 1];
      setSelectedProduct(lastItem.product);
      setSelectedColor(lastItem.color);
      setQty(lastItem.qty.toString());
      setFrontLogoUrl(lastItem.frontLogoUrl);
      setFrontOriginalFileUrl(lastItem.frontOriginalFileUrl);
      setFrontArtworkName(lastItem.frontArtworkName);
      setFrontPrintSize(lastItem.frontPrintSize);
      setFrontMockupUrl(lastItem.frontMockupUrl);
      setBackLogoUrl(lastItem.backLogoUrl);
      setBackOriginalFileUrl(lastItem.backOriginalFileUrl);
      setBackArtworkName(lastItem.backArtworkName);
      setBackPrintSize(lastItem.backPrintSize);
      setBackMockupUrl(lastItem.backMockupUrl);
      
      setCart(prev => prev.slice(0, -1));
    }
    setStep(2);
  };

  // Submit quote request or start checkout
  // Submit quote request or start checkout
  const submitOrderOrCheckout = async (isPayNow: boolean) => {
    if (!customerInfo.contactName || !customerInfo.emailAddress) {
      alert("Please provide at least your Contact Name and Email Address.");
      return;
    }

    if (isPayNow) {
      if (cart.length === 0) {
        alert("Please add at least one customized style to your cart first.");
        return;
      }
      for (const item of cart) {
        const sizeSum = Object.values(item.sizes || {}).reduce((acc: number, v: any) => acc + (v || 0), 0);
        if (sizeSum === 0) {
          alert(`Please specify a size spread breakdown for "${item.product.brand} ${item.product.style}". Sizing details are required to complete secure checkout.`);
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      const customerId = `cust-${Date.now()}`;
      const orderId = `quote-${Date.now()}`;

      // 1. Create/Update Customer record
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

      // 2. Pre-create User document for Client Portal mapping
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
      } else {
        // User already exists, update their profile with these details so we can reach out
        const userDoc = userSnapshot.docs[0];
        const existingData = userDoc.data();
        const updatedFields: any = {
          phone: customerInfo.phone || existingData.phone || '-',
          companyName: customerInfo.companyName || existingData.companyName || '-',
          website: customerInfo.website || existingData.website || '',
          customerId: existingData.customerId || customerId
        };
        // Upgrade Pending users who are submitting a quote/order to Client
        if (existingData.role === 'Pending') {
          updatedFields.role = 'Client';
        }
        await updateDoc(userDoc.ref, updatedFields);
      }

      // 3. Determine unique portal Id incremented by day
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

      const count = maxCount + 1;
      const portalId = `${prefix}${count}`;

      // 4. Create Quote Request Order
      const totalUnits = cart.reduce((acc, item) => acc + item.qty, 0);
      const estimatedTotalPrice = cart.reduce((acc, item) => acc + (item.pricingDetails.total * item.qty), 0);
      const averageEstimatedPricePerUnit = totalUnits > 0 ? (estimatedTotalPrice / totalUnits) : 0;
      const orderTitle = `Storefront Quote/Order for ${cart.map(item => `${item.product.brand} ${item.product.style}`).join(', ')}`;

      const payload = {
        id: orderId,
        portalId: portalId,
        customerId: customerId,
        title: orderTitle.length > 100 ? orderTitle.slice(0, 97) + '...' : orderTitle,
        statusIndex: isPayNow ? 3 : 0, // 3 = Awaiting Payment, 0 = Request Created
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
          logos: [
            ...(item.frontLogoUrl ? [`Front: ${item.frontPrintSize}`] : []),
            ...(item.backLogoUrl ? [`Back: ${item.backPrintSize}`] : [])
          ],
          artworks: [
            ...(item.frontLogoUrl ? [{ url: item.frontLogoUrl, originalUrl: item.frontOriginalFileUrl || item.frontLogoUrl, name: item.frontArtworkName || `Front_${item.frontPrintSize}_Logo` }] : []),
            ...(item.backLogoUrl ? [{ url: item.backLogoUrl, originalUrl: item.backOriginalFileUrl || item.backLogoUrl, name: item.backArtworkName || `Back_${item.backPrintSize}_Logo` }] : [])
          ]
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
        placements: cart.flatMap(item => [
          ...(item.frontLogoUrl ? [{ side: 'front', size: item.frontPrintSize, logo: item.frontLogoUrl, mockup: item.frontMockupUrl }] : []),
          ...(item.backLogoUrl ? [{ side: 'back', size: item.backPrintSize, logo: item.backLogoUrl, mockup: item.backMockupUrl }] : [])
        ]),
        activities: [{
          id: `act-${Date.now()}`,
          type: 'system',
          message: isPayNow 
            ? `Order created via online checkout. Initiating Stripe payment Session for $${estimatedTotalPrice.toFixed(2)}.` 
            : `Web Quote Request submitted by ${customerInfo.contactName}`,
          user: customerInfo.emailAddress,
          timestamp: new Date().toISOString()
        }]
      };

      await setDoc(doc(db, 'orders', orderId), payload);

      if (isPayNow) {
        // Stripe Checkout integration
        const successUrl = `${window.location.origin}${window.location.pathname}?success=true&order_id=${orderId}&session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${window.location.origin}${window.location.pathname}?canceled=true&order_id=${orderId}`;

        // Construct lineItems
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
                description: sizeDescription ? `Sizes: ${sizeDescription}` : `Sizes: Quote Pending`,
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
          window.location.href = data.url; // Redirect to Stripe Checkout page
        } else {
          console.error("Stripe Checkout Session error:", data);
          alert("Failed to initiate secure checkout session. Please try again or submit quote instead.");
        }
      } else {
        setSuccess(true);
      }
    } catch (err) {
      console.error("Error submitting quote/order:", err);
      alert("There was an error submitting your request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Payment verification loading view
  if (isVerifyingPayment) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6 text-brand-secondary font-sans">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-brand-primary" size={32} />
          <p className="text-sm font-semibold">Verifying Secure Payment Status...</p>
        </div>
      </div>
    );
  }

  // Success view
  if (success) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6 font-sans text-brand-primary">
        <div className="max-w-md w-full bg-white border border-brand-border rounded-3xl p-10 text-center space-y-6 shadow-sm animate-in zoom-in-95 fade-in duration-500">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100">
            <CheckCircle size={40} />
          </div>
          <h1 className="text-3xl font-serif text-brand-primary">
            {paymentSuccessMsg ? 'Payment Completed!' : 'Request Submitted'}
          </h1>
          <p className="text-brand-secondary text-sm leading-relaxed">
            {paymentSuccessMsg ? paymentSuccessMsg : `Thank you, ${customerInfo.contactName}! We've received your product design and details. Our design team will review your specifications and follow up with you shortly with a personalized quote.`}
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

  // Loading Storefront Settings view
  if (isLoadingSettings) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6 text-brand-secondary font-sans">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-brand-primary" size={32} />
          <p className="text-sm font-semibold">Loading Custom Storefront...</p>
        </div>
      </div>
    );
  }

  // Pre-load default preview url helper for Step 2
  const imageSet = selectedProduct ? (selectedProduct.images[selectedColor] || Object.values(selectedProduct.images)[0]) : null;
  const currentGarmentImg = imageSet ? (typeof imageSet === 'string' ? imageSet : imageSet[viewMode]) : '';

  const proxiedGarmentUrl = currentGarmentImg.startsWith('http')
    ? `/api/sanmar/proxy-image?url=${encodeURIComponent(currentGarmentImg)}`
    : currentGarmentImg;

  return (
    <div className="min-h-screen bg-brand-bg font-sans pb-32 text-brand-primary selection:bg-brand-primary selection:text-white">
      {/* Announcement Bar */}
      {storefrontSettings.announcement && (
        <div className="bg-brand-primary text-white text-center py-2 px-4 text-xs font-bold tracking-wide shadow-sm flex items-center justify-center gap-2">
          <span>{storefrontSettings.announcement}</span>
        </div>
      )}

      {/* Customizable Store Navbar */}
      <header className="bg-white border-b border-brand-border py-4 px-6 sticky top-0 z-50 shadow-xs">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-primary rounded-xl flex items-center justify-center text-white font-serif font-bold text-xl shadow-xs">
              {storefrontSettings.logoText.slice(0, 1).toUpperCase()}
            </div>
            <span className="text-lg font-serif font-extrabold tracking-tight text-brand-primary">
              {storefrontSettings.logoText}
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            {storefrontSettings.contactPhone && (
              <a 
                href={`tel:${storefrontSettings.contactPhone}`} 
                className="hidden md:flex items-center gap-2 text-xs font-bold text-brand-secondary hover:text-brand-primary transition-colors"
              >
                <Phone size={14} className="text-brand-primary" />
                <span>{storefrontSettings.contactPhone}</span>
              </a>
            )}
            
            {(isAdmin || import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
              <button
                onClick={() => {
                  setEditSettings({ ...storefrontSettings });
                  setIsEditingStorefront(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-brand-border rounded-xl text-xs font-bold text-brand-secondary hover:border-brand-primary hover:text-brand-primary transition-all bg-neutral-50 shadow-2xs"
              >
                <Settings size={13} className="animate-spin-slow" />
                <span>Customize Store</span>
              </button>
            )}

            {user ? (
              <div className="flex items-center gap-2">
                {userData?.role === 'Client' ? (
                  <button
                    onClick={() => navigate(userData.customerId ? `/portal/${userData.customerId}` : '/portal')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-primary text-white rounded-xl text-xs font-bold hover:bg-brand-primary/90 transition-all shadow-xs"
                  >
                    <span>View Portal</span>
                  </button>
                ) : (userData?.role === 'Admin' || userData?.role === 'Staff' || userData?.role === 'Leadership') ? (
                  <button
                    onClick={() => navigate('/orders')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-primary text-white rounded-xl text-xs font-bold hover:bg-brand-primary/90 transition-all shadow-xs"
                  >
                    <span>Admin Panel</span>
                  </button>
                ) : (
                  <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg font-bold uppercase tracking-wider">
                    Pending Approval
                  </span>
                )}
                
                <button
                  onClick={signOut}
                  className="px-3 py-1.5 border border-brand-border rounded-xl text-xs font-bold text-brand-secondary hover:border-red-400 hover:text-red-500 transition-all bg-white shadow-2xs"
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
                    console.error("Sign in failed", e);
                  }
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 border border-brand-primary/30 hover:border-brand-primary text-brand-primary bg-brand-primary/5 hover:bg-brand-primary/10 rounded-xl text-xs font-bold transition-all shadow-2xs"
              >
                <span>Client Login</span>
              </button>
            )}

            <div className="flex items-center gap-1.5 bg-neutral-50 px-3 py-1.5 border border-brand-border rounded-xl">
              <Lock size={12} className="text-neutral-400" />
              <span className="text-[10px] text-neutral-500 font-extrabold uppercase tracking-wider">Secure</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="max-w-[1200px] mx-auto px-6 w-full mt-10">
        {/* Horizontal Wizard Progress Tracker */}
        {selectedCategory !== '' && (
          <div className="max-w-3xl mx-auto mb-12">
            <div className="flex items-center justify-between relative">
              <div className="absolute left-4 right-4 top-5 -translate-y-1/2 h-[2px] bg-brand-border z-0"></div>
              <div 
                className="absolute left-4 top-5 -translate-y-1/2 h-[2px] bg-brand-primary transition-all duration-500 z-0"
                style={{ width: `${((step - 1) / 3) * 92}%` }}
              ></div>

              {[
                { num: 1, label: '1. Select Product' },
                { num: 2, label: '2. Add Design' },
                { num: 3, label: '3. Your Details' },
                { num: 4, label: '4. Review & Quote' }
              ].map((s) => {
                const isCompleted = step > s.num;
                const isActive = step === s.num;
                return (
                  <button
                    key={s.num}
                    onClick={() => {
                      if (s.num < step) {
                        setStep(s.num);
                      }
                    }}
                    disabled={s.num > step}
                    className="flex flex-col items-center gap-2.5 relative z-10 focus:outline-none disabled:cursor-not-allowed group"
                  >
                    <div 
                      className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold text-sm transition-all duration-300 ${
                        isCompleted 
                          ? 'bg-brand-primary border-brand-primary text-white' 
                          : isActive 
                            ? 'bg-white border-brand-primary text-brand-primary ring-4 ring-brand-primary/10 scale-105 shadow-sm' 
                            : 'bg-white border-brand-border text-brand-secondary group-hover:border-neutral-400'
                      }`}
                    >
                      {isCompleted ? <Check size={16} /> : s.num}
                    </div>
                    <span 
                      className={`text-[11px] font-bold tracking-wider uppercase transition-colors duration-300 ${
                        isActive ? 'text-brand-primary font-extrabold' : 'text-brand-secondary'
                      }`}
                    >
                      {s.label.split('. ')[1]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Wizard Step Content */}
        <div className="w-full">
          
          {/* STEP 1: CHOOSE PRODUCT */}
          {step === 1 && (
            <div className="space-y-8 animate-in fade-in duration-300">
              
              {/* Category-First Selection View */}
              {selectedCategory === '' ? (
                <div className="space-y-12">
                  
                  {/* Hero Header Area */}
                  <div className="text-center max-w-3xl mx-auto space-y-4 py-4">
                    <h2 className="text-4xl md:text-5xl font-serif text-brand-primary tracking-tight leading-tight">
                      {storefrontSettings.heroTitle}
                    </h2>
                    <p className="text-brand-secondary text-sm md:text-base max-w-2xl mx-auto font-medium">
                      {storefrontSettings.heroSubtitle}
                    </p>
                  </div>

                  {/* Trust Badges */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-6 border-y border-brand-border/60 max-w-5xl mx-auto text-center text-xs text-brand-secondary font-bold">
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
                      <CheckCircle className="text-brand-primary shrink-0" size={18} />
                      <span>100% Satisfaction Guarantee</span>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
                      <Sparkles className="text-brand-primary shrink-0" size={18} />
                      <span>Easy Customization Tools</span>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
                      <Layers className="text-brand-primary shrink-0" size={18} />
                      <span>10,000+ Premium Products</span>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
                      <Truck className="text-brand-primary shrink-0" size={18} />
                      <span>Free Standard Delivery</span>
                    </div>
                  </div>

                  {/* Store Category Selection Grid */}
                  <div className="max-w-[1100px] mx-auto space-y-6">
                    <div className="text-center">
                      <span className="text-[11px] font-extrabold uppercase tracking-widest text-brand-primary bg-brand-primary/5 border border-brand-primary/10 px-3 py-1 rounded-full">
                        Browse by Category
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 pt-4">
                      {[
                        { id: 'T-Shirts', label: 'T-shirts', img: '/images/categories/tshirts.png', count: 50 },
                        { id: 'Sweatshirts & Hoodies', label: 'Sweatshirts', img: '/images/categories/sweatshirts.png', count: 40 },
                        { id: 'Polos', label: 'Polos', img: '/images/categories/polos.png', count: 30 },
                        { id: 'Hats & Caps', label: 'Hats & Caps', img: '/images/categories/hats.png', count: 25 },
                        { id: 'Jackets & Vests', label: 'Jackets & Vests', img: '/images/categories/jackets.png', count: 25 },
                        { id: 'Bags & Accessories', label: 'Bags & Accessories', img: '/images/categories/bags.png', count: 15 }
                      ].map((cat) => (
                        <div
                          key={cat.id}
                          onClick={() => setSelectedCategory(cat.id)}
                          className="group cursor-pointer bg-white border border-brand-border rounded-3xl overflow-hidden shadow-2xs hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col"
                        >
                          {/* Image Container with white bg */}
                          <div className="aspect-[4/5] bg-white flex items-center justify-center p-6 border-b border-brand-border/60 relative overflow-hidden transition-colors">
                            <img
                              src={cat.img}
                              alt={cat.label}
                              className="max-w-[82%] max-h-[82%] object-contain filter drop-shadow-sm transition-transform duration-500 group-hover:scale-103"
                            />
                          </div>
                          
                          {/* Text Container */}
                          <div className="p-5 flex items-center justify-between bg-white">
                            <div>
                              <h4 className="text-base font-bold text-brand-primary group-hover:text-brand-primary/95 transition-colors">
                                {cat.label}
                              </h4>
                              <p className="text-xs text-brand-secondary mt-0.5 font-medium">
                                {cat.count} styles available
                              </p>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-neutral-50 flex items-center justify-center border border-brand-border text-brand-secondary group-hover:bg-brand-primary group-hover:text-white group-hover:border-brand-primary transition-all shadow-3xs">
                              <ArrowRight size={14} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* View All Products Alternative */}
                    <div className="text-center pt-8">
                      <button
                        onClick={() => setSelectedCategory('All')}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-neutral-100 hover:bg-neutral-200 border border-brand-border rounded-full text-xs font-bold text-brand-primary transition-all shadow-3xs hover:shadow-2xs"
                      >
                        <span>Or browse all 185 premium products</span>
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>

                </div>
              ) : (
                
                // Detailed Catalog Grid View (Filtered by Category)
                <div className="bg-white rounded-3xl p-8 border border-brand-border shadow-[0_4px_24px_rgb(0,0,0,0.01)] space-y-6">
                  
                  {/* Category sub-header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-brand-border/60 pb-6 gap-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setSelectedCategory('')}
                        className="p-2 border border-brand-border hover:border-neutral-400 text-brand-secondary hover:text-brand-primary bg-neutral-50 rounded-xl transition-all shadow-2xs"
                        title="Back to Categories"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-secondary">Store Catalog</span>
                        <h3 className="text-2xl font-serif text-brand-primary mt-0.5">
                          {selectedCategory === 'All' ? 'All Blanks Collection' : selectedCategory}
                        </h3>
                      </div>
                    </div>

                    {/* Category Filter Pills (Inside Catalog) */}
                    <div className="flex gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                      {[
                        { id: 'All', label: 'All Products' },
                        { id: 'T-Shirts', label: 'T-Shirts' },
                        { id: 'Sweatshirts & Hoodies', label: 'Sweatshirts' },
                        { id: 'Polos', label: 'Polos' },
                        { id: 'Hats & Caps', label: 'Hats' },
                        { id: 'Jackets & Vests', label: 'Jackets' },
                        { id: 'Bags & Accessories', label: 'Bags' }
                      ].map((catTab) => {
                        const isTabActive = selectedCategory === catTab.id;
                        return (
                          <button
                            key={catTab.id}
                            type="button"
                            onClick={() => setSelectedCategory(catTab.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border whitespace-nowrap transition-all ${
                              isTabActive
                                ? 'bg-brand-primary text-white border-brand-primary'
                                : 'bg-neutral-50 text-brand-secondary border-brand-border hover:bg-neutral-100'
                            }`}
                          >
                            {catTab.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Filters search and brand list */}
                  <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center pb-2">
                    <div className="relative flex-1 max-w-md">
                      <input 
                        type="text" 
                        placeholder="Search style numbers, brands, descriptions..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-neutral-50 border border-brand-border rounded-xl pl-10 pr-4 py-3 text-sm text-brand-primary focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all font-medium"
                      />
                      <Search className="absolute left-3.5 top-3.5 text-neutral-400" size={18} />
                    </div>

                    <div className="flex gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                      {brands.map(brand => (
                        <button
                          key={brand}
                          onClick={() => setSelectedBrand(brand)}
                          className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                            selectedBrand === brand 
                              ? 'bg-brand-primary text-white border-brand-primary shadow-xs' 
                              : 'bg-white text-brand-secondary border-brand-border hover:bg-neutral-50 hover:text-brand-primary'
                          }`}
                        >
                          {brand}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Product Grid */}
                  {filteredProducts.length === 0 ? (
                    <div className="text-center py-16 bg-neutral-50 border border-brand-border rounded-2xl">
                      <Shirt className="mx-auto text-neutral-300 mb-3" size={36} />
                      <h3 className="text-base font-bold text-brand-primary">No Garments Found</h3>
                      <p className="text-xs text-brand-secondary mt-1">Try adjusting your filters or search keywords.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                      {filteredProducts.map(product => {
                        const currentPreviewColor = productPreviewColors[product.style] || product.colors[0];
                        const imageSet = product.images[currentPreviewColor] || Object.values(product.images)[0];
                        const previewImgUrl = imageSet ? (typeof imageSet === 'string' ? imageSet : imageSet.front) : '';

                        return (
                          <div 
                            key={product.style}
                            onClick={() => {
                              setSelectedProduct(product);
                              setSelectedColor(currentPreviewColor);
                              setStep(2);
                            }}
                            className="bg-white border border-brand-border rounded-2xl overflow-hidden flex flex-col hover:shadow-[0_12px_32px_rgba(0,0,0,0.04)] hover:-translate-y-1 transition-all duration-300 group cursor-pointer"
                          >
                            <div className="aspect-[4/5] bg-white border-b border-brand-border flex items-center justify-center p-6 relative overflow-hidden shrink-0 transition-colors">
                              {/* Price Tag */}
                              <div className="absolute top-4 left-4 z-10 bg-white/95 backdrop-blur-xs border border-brand-border text-brand-primary text-[11px] font-extrabold px-3 py-1.5 rounded-full flex items-center gap-0.5 shadow-sm">
                                <DollarSign size={10} />{product.price.toFixed(2)}
                              </div>
                              {/* Category */}
                              <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-xs border border-brand-border text-brand-secondary text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded">
                                {product.category}
                              </div>
                              {/* Flatlay Image */}
                              <img 
                                src={previewImgUrl} 
                                alt={product.title}
                                className="max-w-[82%] max-h-[82%] object-contain filter drop-shadow-xs transition-transform duration-500 group-hover:scale-103"
                              />
                            </div>

                            <div className="p-6 flex-1 flex flex-col justify-between gap-5">
                              <div className="space-y-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">{product.brand}</span>
                                  <span className="text-[9px] bg-neutral-100 text-neutral-600 font-bold px-1.5 py-0.25 rounded uppercase">{product.style}</span>
                                </div>
                                <h4 className="text-base font-bold text-brand-primary leading-snug group-hover:text-brand-primary/95 transition-colors">
                                  {product.title.replace(`${product.brand} `, '').replace(/®/g, '').trim()}
                                </h4>
                                <p className="text-xs text-brand-secondary line-clamp-2 leading-relaxed">
                                  {product.description}
                                </p>
                              </div>

                              <div className="space-y-4 pt-3 border-t border-brand-border/60">
                                {/* Swatches */}
                                <div className="space-y-2">
                                  <span className="text-[9px] font-bold text-brand-secondary uppercase tracking-wider block">Available Colors ({product.colors.length})</span>
                                  <div className="flex flex-wrap gap-1.5" onClick={e => e.stopPropagation()}>
                                    {product.colors.slice(0, 8).map(color => {
                                      const hex = getSwatchColor(color, true);
                                      const swatchData = product.images[color];
                                      const swatchImgUrl = swatchData && typeof swatchData === 'object' ? swatchData.swatch : '';
                                      const isActive = currentPreviewColor === color;
                                      const isWhite = color.toLowerCase() === 'white';

                                      return (
                                        <button
                                          key={color}
                                          type="button"
                                          title={color}
                                          onClick={() => {
                                            setProductPreviewColors(prev => ({
                                              ...prev,
                                              [product.style]: color
                                            }));
                                          }}
                                          className={`w-5 h-5 rounded-full border transition-all relative ${
                                            isActive 
                                              ? 'ring-2 ring-brand-primary ring-offset-2 scale-110' 
                                              : 'border-neutral-300 hover:scale-105'
                                          }`}
                                          style={{ 
                                            backgroundColor: hex.startsWith('linear-gradient') ? 'transparent' : hex,
                                            backgroundImage: swatchImgUrl 
                                              ? `url(/api/sanmar/proxy-image?url=${encodeURIComponent(swatchImgUrl)})` 
                                              : (hex.startsWith('linear-gradient') ? hex : 'none'),
                                            backgroundSize: 'cover',
                                            backgroundPosition: 'center',
                                            borderColor: isWhite ? '#D1D5DB' : 'transparent' 
                                          }}
                                        >
                                          {isActive && (
                                            <span className="absolute inset-0 flex items-center justify-center">
                                              <Check 
                                                size={10} 
                                                className={color.toLowerCase() === 'white' || color.toLowerCase() === 'silver' || color.toLowerCase() === 'athletic heather' ? 'text-black' : 'text-white'} 
                                              />
                                            </span>
                                          )}
                                        </button>
                                      );
                                    })}
                                    {product.colors.length > 8 && (
                                      <span className="text-[10px] font-bold text-neutral-400 self-center pl-1 select-none">
                                        +{product.colors.length - 8}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  className="w-full py-3 bg-brand-primary hover:bg-brand-primary/95 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
                                >
                                  Select & Design <ArrowRight size={13} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>
              )}

            </div>
          )}

          {/* STEP 2: DESIGN & CUSTOMIZATION */}
          {step === 2 && selectedProduct && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in duration-300">
              
              {/* Designer Canvas Container & Colors (Left Column) */}
              <div className="lg:col-span-7 flex flex-col gap-6">
                <div className="bg-white rounded-3xl p-6 border border-brand-border flex items-center justify-center min-h-[640px] relative select-none shadow-[0_4px_24px_rgb(0,0,0,0.01)] overflow-hidden">
                  <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-brand-border shadow-xs flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-brand-primary animate-pulse"></span>
                    <span className="text-[10px] font-bold text-brand-primary tracking-wider uppercase">Interactive Designer</span>
                  </div>

                  <div className="absolute top-4 right-4 z-10 bg-neutral-100 p-0.5 rounded-xl border border-brand-border flex gap-1">
                    <button
                      onClick={() => setViewMode('front')}
                      className={`px-3.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                        viewMode === 'front'
                          ? 'bg-white text-brand-primary shadow-xs'
                          : 'text-brand-secondary hover:text-brand-primary'
                      }`}
                    >
                      Front
                    </button>
                    <button
                      onClick={() => setViewMode('back')}
                      className={`px-3.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                        viewMode === 'back'
                          ? 'bg-white text-brand-primary shadow-xs'
                          : 'text-brand-secondary hover:text-brand-primary'
                      }`}
                    >
                      Back
                    </button>
                  </div>

                  <div 
                    ref={containerRef}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    className="w-full max-w-[480px] aspect-[4/5] relative bg-white rounded-2xl border border-brand-border/60 overflow-hidden flex items-center justify-center cursor-move shadow-inner animate-in zoom-in-95 duration-200"
                  >
                    <img 
                      src={proxiedGarmentUrl} 
                      alt={selectedProduct.title} 
                      className="w-full h-full object-contain pointer-events-none select-none"
                      draggable="false"
                    />

                    {logoUrl ? (
                      <div
                        style={{
                          position: 'absolute',
                          left: `${logoPos.x}%`,
                          top: `${logoPos.y}%`,
                          width: `${logoScale * 100}%`,
                          transform: 'translate(-50%, -50%)',
                          pointerEvents: 'none'
                        }}
                        className="flex items-center justify-center"
                      >
                        <div className={`relative w-full h-full flex items-center justify-center p-1 transition-all ${isDragging ? 'border-2 border-dashed border-brand-primary' : 'border border-transparent'}`}>
                          {isRenderableImage(artworkName) ? (
                            <img
                              ref={logoRef}
                              src={logoUrl}
                              alt="Overlay Artwork"
                              style={{
                                transform: `rotate(${logoRotation}deg)`,
                                width: '100%',
                                height: 'auto'
                              }}
                              className="object-contain select-none pointer-events-none"
                              draggable="false"
                            />
                          ) : (
                            <div
                              ref={logoRef}
                              style={{
                                transform: `rotate(${logoRotation}deg)`,
                                width: '100%',
                                aspectRatio: '1',
                              }}
                              className="bg-white rounded-xl shadow-md border border-neutral-200 select-none pointer-events-none overflow-hidden flex flex-col justify-between"
                            >
                              {/* File Header Banner */}
                              <div className="bg-brand-primary py-2 px-3 flex items-center justify-center shrink-0">
                                <span className="text-[11px] font-black uppercase tracking-wider text-white">
                                  {(artworkName || '').split('.').pop() || 'FILE'}
                                </span>
                              </div>
                              {/* File Icon Symbol */}
                              <div className="flex-1 flex flex-col items-center justify-center p-2 gap-1.5 bg-neutral-50/50">
                                <div className="p-2 bg-white rounded-lg border border-neutral-200 shadow-3xs">
                                  <FileText className="w-6 h-6 text-neutral-500" />
                                </div>
                                <span className="text-[9px] font-bold text-neutral-600 truncate max-w-[110px] text-center px-1">
                                  {artworkName || 'Uploaded File'}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <label className="absolute inset-0 bg-white/30 backdrop-blur-[1px] flex flex-col items-center justify-center p-6 text-center gap-3 cursor-pointer hover:bg-white/40 transition-all group">
                        <input 
                          type="file" 
                          accept="image/*,.pdf,.eps,.ai,.psd,.cdr,.zip" 
                          onChange={handleLogoUpload} 
                          className="hidden" 
                        />
                        <div className="w-12 h-12 bg-white border border-brand-border text-brand-secondary rounded-full flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                          <Upload size={18} className="group-hover:text-brand-primary transition-colors" />
                        </div>
                        <p className="text-xs font-bold text-brand-primary group-hover:text-brand-primary/80 transition-colors">No Logo/Artwork Overlay Active</p>
                        <p className="text-[10px] text-brand-secondary max-w-[200px] leading-relaxed">
                          Click here or upload a design file on the right control panel to position it onto this shirt.
                        </p>
                      </label>
                    )}
                  </div>
                </div>

                {/* Garment Color Swatches Selection */}
                <div className="bg-white rounded-3xl p-6 border border-brand-border shadow-[0_4px_24px_rgb(0,0,0,0.01)] space-y-3">
                  <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest block">Available Garment Colors ({selectedProduct.colors.length})</span>
                  <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto p-1.5 border border-brand-border bg-neutral-50/50 rounded-xl scrollbar-thin">
                    {selectedProduct.colors.map(color => {
                      const hex = getSwatchColor(color, true);
                      const swatchData = selectedProduct.images[color];
                      const swatchImgUrl = swatchData && typeof swatchData === 'object' ? swatchData.swatch : '';
                      const isActive = selectedColor === color;
                      const isWhite = color.toLowerCase() === 'white';

                      return (
                        <button
                          key={color}
                          type="button"
                          title={color}
                          onClick={() => setSelectedColor(color)}
                          className={`w-7 h-7 rounded-full border transition-all relative ${
                            isActive 
                              ? 'ring-2 ring-brand-primary ring-offset-2 scale-110' 
                              : 'border-neutral-350 hover:scale-105'
                          }`}
                          style={{ 
                            backgroundColor: hex.startsWith('linear-gradient') ? 'transparent' : hex,
                            backgroundImage: swatchImgUrl 
                              ? `url(/api/sanmar/proxy-image?url=${encodeURIComponent(swatchImgUrl)})` 
                              : (hex.startsWith('linear-gradient') ? hex : 'none'),
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            borderColor: isWhite ? '#D1D5DB' : 'transparent' 
                          }}
                        >
                          {isActive && (
                            <span className="absolute inset-0 flex items-center justify-center">
                              <Check 
                                size={12} 
                                className={color.toLowerCase() === 'white' || color.toLowerCase() === 'silver' || color.toLowerCase() === 'athletic heather' ? 'text-black' : 'text-white'} 
                              />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Designer Setup dashboard (Right Column) */}
              <div className="lg:col-span-5 bg-white rounded-3xl p-8 border border-brand-border shadow-[0_4px_24px_rgb(0,0,0,0.01)] flex flex-col justify-between gap-8 min-h-[450px]">
                <div className="space-y-6">
                  <div>
                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{selectedProduct.brand}</span>
                    <h3 className="text-2xl font-serif text-brand-primary leading-tight mt-1">{selectedProduct.title.replace(/®/g, '').trim()}</h3>
                    <p className="text-xs font-semibold text-brand-secondary mt-1 flex items-center gap-1.5">
                      Selected Style: <span className="text-brand-primary font-bold">{selectedProduct.style}</span> | Color: <span className="text-brand-primary font-bold">{selectedColor}</span>
                    </p>
                  </div>

                  {/* Studio Tabs Header */}
                  <div className="space-y-4 pt-2 border-t border-brand-border/60">
                    <label className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider block">1. Design / Upload Artwork</label>
                    <div className="flex border border-brand-border bg-neutral-50 p-1 rounded-xl gap-1 overflow-x-auto scrollbar-none">
                      {[
                        { id: 'upload', label: 'Upload File' },
                        { id: 'text', label: 'Add Text' },
                        { id: 'clipart', label: 'Clip Art' },
                        { id: 'ai', label: 'AI Generator' }
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setDesignerTab(tab.id as any)}
                          className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all flex-1 text-center ${
                            designerTab === tab.id
                              ? 'bg-white text-brand-primary shadow-xs font-extrabold'
                              : 'text-brand-secondary hover:text-brand-primary'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Tab Contents */}
                    <div className="min-h-[140px] flex flex-col justify-center">
                      
                      {/* TAB 1: UPLOAD FILE */}
                      {designerTab === 'upload' && (
                        <div className="space-y-3 animate-in fade-in duration-200">
                          {isUploadingLogo ? (
                            <div className="border border-dashed border-brand-border rounded-xl p-6 flex flex-col items-center justify-center gap-2 bg-neutral-50 animate-pulse">
                              <Loader2 className="animate-spin text-neutral-400" size={20} />
                              <span className="text-xs text-neutral-500 font-semibold">Uploading artwork to server...</span>
                            </div>
                          ) : logoUrl ? (
                            <div className="flex items-center gap-4 p-4 border border-brand-border rounded-xl bg-neutral-50/50">
                              <div className="w-14 h-14 bg-checkerboard border border-brand-border rounded-lg overflow-hidden flex items-center justify-center shrink-0">
                                {isRenderableImage(artworkName) ? (
                                  <img src={logoUrl} className="w-full h-full object-contain" alt="Logo preview" />
                                ) : (
                                  <div className="flex flex-col items-center justify-center gap-0.5 w-full h-full bg-white">
                                    <FileText size={18} className="text-neutral-500" />
                                    <span className="text-[8px] font-black uppercase text-neutral-600">
                                      {(artworkName || '').split('.').pop() || 'FILE'}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-xs font-bold text-brand-primary block truncate">{artworkName || 'Artwork Active'}</span>
                                <span className="text-[10px] text-brand-secondary block mt-0.5">Drag artwork on mockup to reposition</span>
                                <div className="flex gap-4 items-center mt-2">
                                  <label className="text-xs text-brand-primary hover:underline font-bold cursor-pointer inline-block">
                                    Replace File
                                    <input type="file" accept="image/*,.pdf,.eps,.ai,.psd,.cdr,.zip" onChange={handleLogoUpload} className="hidden" />
                                  </label>
                                  {originalArtworkUrl && isRenderableImage(artworkName) && (
                                    <button
                                      type="button"
                                      onClick={openColorRemover}
                                      className="text-xs text-brand-primary hover:underline font-bold"
                                    >
                                      Remove Background/Colors
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <label className="border-2 border-dashed border-brand-border hover:border-brand-primary/40 rounded-xl p-6 flex flex-col items-center justify-center gap-2 bg-neutral-50/40 hover:bg-neutral-50 transition-all cursor-pointer group text-center">
                              <Upload size={20} className="text-neutral-400 group-hover:text-brand-primary transition-colors" />
                              <span className="text-xs font-bold text-neutral-700 group-hover:text-brand-primary transition-colors">Select Artwork/Logo File</span>
                              <span className="text-[10px] text-neutral-400">PNG, SVG, JPG, PDF, EPS, AI, PSD, CDR, ZIP up to 20MB</span>
                              <input type="file" accept="image/*,.pdf,.eps,.ai,.psd,.cdr,.zip" onChange={handleLogoUpload} className="hidden" />
                            </label>
                          )}
                        </div>
                      )}

                      {/* TAB 2: ADD TEXT */}
                      {designerTab === 'text' && (
                        <div className="space-y-3.5 animate-in fade-in duration-200">
                          <div className="flex flex-col gap-1.5">
                            <input
                              type="text"
                              value={customText}
                              onChange={(e) => setCustomText(e.target.value)}
                              placeholder="Type your text here..."
                              className="w-full bg-neutral-50 border border-brand-border rounded-xl px-3.5 py-2 text-xs text-brand-primary focus:outline-none focus:border-neutral-400 font-bold"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                              <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Font Family</span>
                              <select
                                value={textFont}
                                onChange={(e) => setTextFont(e.target.value)}
                                className="bg-neutral-50 border border-brand-border rounded-xl px-2 py-1.5 text-xs text-brand-primary focus:outline-none font-bold"
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
                                  onChange={(e) => setTextColor(e.target.value)}
                                  className="w-8 h-8 rounded-lg cursor-pointer border border-brand-border"
                                />
                                <span className="text-[10px] font-bold text-neutral-600 uppercase font-mono">{textColor}</span>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={renderTextToImage}
                            disabled={!customText.trim() || isUploadingLogo}
                            className="w-full py-2 bg-brand-primary text-white hover:bg-brand-primary/95 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isUploadingLogo ? <Loader2 size={13} className="animate-spin"/> : null}
                            Apply Custom Text
                          </button>
                        </div>
                      )}

                      {/* TAB 3: CLIP ART */}
                      {designerTab === 'clipart' && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Select Clipart & Color</span>
                            <div className="flex gap-2 items-center">
                              <input
                                type="color"
                                value={clipartColor}
                                onChange={(e) => setClipartColor(e.target.value)}
                                className="w-6 h-6 rounded-lg cursor-pointer border border-brand-border"
                              />
                              <span className="text-[9px] font-bold text-neutral-600 uppercase font-mono">{clipartColor}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-6 gap-2 bg-neutral-50 p-2 border border-brand-border rounded-xl max-h-[120px] overflow-y-auto">
                            {Object.keys(clipartSVGs).map((svgKey) => {
                              const coloredSvg = clipartSVGs[svgKey].replace(/COLOR/g, clipartColor);
                              const base64Svg = btoa(coloredSvg);
                              const dataUrl = `data:image/svg+xml;base64,${base64Svg}`;
                              
                              return (
                                <button
                                  key={svgKey}
                                  type="button"
                                  title={svgKey}
                                  onClick={() => renderClipartToImage(svgKey)}
                                  className="aspect-square p-2 bg-white border border-brand-border hover:border-brand-primary rounded-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-3xs"
                                >
                                  <img src={dataUrl} alt={svgKey} className="w-full h-full object-contain" />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* TAB 4: AI LOGO GENERATOR */}
                      {designerTab === 'ai' && (
                        <div className="space-y-3.5 animate-in fade-in duration-200">
                          <div className="flex flex-col gap-1">
                            <input
                              type="text"
                              value={aiPrompt}
                              onChange={(e) => setAiPrompt(e.target.value)}
                              placeholder="Describe your logo (e.g. vintage golden eagle shield)..."
                              className="w-full bg-neutral-50 border border-brand-border rounded-xl px-3.5 py-2 text-xs text-brand-primary focus:outline-none focus:border-neutral-400 font-bold"
                            />
                          </div>

                          <div className="grid grid-cols-1 gap-3">
                            <div className="flex flex-col gap-1">
                              <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Logo Style</span>
                              <select
                                value={aiStyle}
                                onChange={(e) => setAiStyle(e.target.value)}
                                className="w-full bg-neutral-50 border border-brand-border rounded-xl px-3.5 py-2 text-xs text-brand-primary focus:outline-none font-bold"
                              >
                                <option value="Minimalist Vector Logo">Minimalist Vector</option>
                                <option value="Mascot Sports Logo">Sports Mascot</option>
                                <option value="Retro Vintage Emblem Logo">Retro Vintage Emblem</option>
                                <option value="Modern Corporate Icon">Modern Corporate</option>
                              </select>
                            </div>
                            <span className="text-[10px] text-neutral-450 leading-relaxed font-medium italic block mt-0.5">
                              * The generator produces images on a solid background, then automatically opens the Manual Color Remover so you can isolate your design.
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={generateAiLogo}
                            disabled={!aiPrompt.trim() || isGeneratingAi}
                            className="w-full py-2 bg-brand-primary text-white hover:bg-brand-primary/95 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isGeneratingAi ? (
                              <>
                                <Loader2 size={13} className="animate-spin"/>
                                Generating AI Logo...
                              </>
                            ) : (
                              <>
                                <Sparkles size={13} />
                                Generate AI Logo
                              </>
                            )}
                          </button>
                        </div>
                      )}

                    </div>
                  </div>

                  {/* Extracted Logo Colors */}
                  {logoUrl && isRenderableImage(artworkName) && extractedColors.length > 0 && (
                    <div className="space-y-2.5 pt-3.5 border-t border-brand-border/60 animate-in fade-in duration-300">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-neutral-450 uppercase tracking-widest block">Extracted Logo Colors</span>
                        <span className="text-[9px] bg-neutral-100 text-neutral-500 font-bold px-1.5 py-0.25 rounded uppercase">Click to match garment</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {extractedColors.map((color) => (
                          <button
                            key={color}
                            type="button"
                            title={`Match garment color to ${color}`}
                            onClick={() => matchClosestGarmentColor(color, selectedProduct)}
                            className="w-7 h-7 rounded-full border border-neutral-300 transition-all hover:scale-110 active:scale-95 shadow-xs flex items-center justify-center relative hover:ring-2 hover:ring-brand-primary hover:ring-offset-1"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Positioning Tools */}
                  {logoUrl && (
                    <div className="space-y-5 pt-4 border-t border-brand-border/60 animate-in fade-in duration-300">
                      <label className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider block">2. Customization Controls</label>
                      {originalArtworkUrl && isRenderableImage(artworkName) && (
                        <button
                          type="button"
                          onClick={openColorRemover}
                          className="w-full py-2.5 bg-neutral-50 hover:bg-neutral-100 border border-brand-border text-brand-primary rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-3xs"
                        >
                          <Layers size={14} className="text-brand-primary" />
                          Manual Background & Color Remover
                        </button>
                      )}

                      {/* Scale */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-semibold text-neutral-600 flex items-center gap-1.5"><Maximize2 size={12}/> Logo Scale</span>
                          <span className="font-bold text-neutral-700">{Math.round(logoScale * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.05"
                          max="0.8"
                          step="0.01"
                          value={logoScale}
                          onChange={(e) => setLogoScale(parseFloat(e.target.value))}
                          className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                        />
                      </div>

                      {/* Rotation */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-semibold text-neutral-600 flex items-center gap-1.5"><RotateCw size={12}/> Logo Rotation</span>
                          <span className="font-bold text-neutral-700">{logoRotation}°</span>
                        </div>
                        <input
                          type="range"
                          min="-180"
                          max="180"
                          step="1"
                          value={logoRotation}
                          onChange={(e) => setLogoRotation(parseInt(e.target.value))}
                          className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                        />
                      </div>

                      {/* Print Size Selection */}
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-neutral-400 block uppercase tracking-wider">Placement Print Size</span>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: 'Small', label: 'Small (Left Chest/Sleeve)' },
                            { id: 'Medium', label: 'Medium (Mid Chest)' },
                            { id: 'Large', label: 'Large (Full Chest/Back)' }
                          ].map((sizeItem) => (
                            <button
                              key={sizeItem.id}
                              type="button"
                              onClick={() => setPrintSize(sizeItem.id as 'Small' | 'Medium' | 'Large')}
                              className={`px-1 py-2.5 border rounded-xl text-[10px] font-bold transition-all text-center flex flex-col justify-center items-center ${
                                printSize === sizeItem.id
                                  ? 'bg-brand-primary border-brand-primary text-white shadow-2xs'
                                  : 'bg-neutral-50 border-brand-border text-neutral-700 hover:bg-neutral-100'
                              }`}
                            >
                              <span>{sizeItem.id}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Alignment Presets */}
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-neutral-400 block uppercase tracking-wider">Placement Presets</span>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            onClick={() => applyPreset('center')}
                            className="px-2 py-2 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-brand-border rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1"
                          >
                            <AlignCenter size={12} /> Center
                          </button>
                          <button
                            onClick={() => applyPreset('left')}
                            className="px-2 py-2 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-brand-border rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1"
                          >
                            <AlignLeft size={12} /> Left Chest
                          </button>
                          <button
                            onClick={() => applyPreset('reset')}
                            className="px-2 py-2 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-brand-border rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1"
                          >
                            <RefreshCw size={12} /> Reset
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Pricing Matrix details */}
                  <div className="pt-4 border-t border-brand-border/60 space-y-4">
                    <label className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider block">3. Live Price Estimate</label>
                    
                    {/* Quantity Selector inside Pricing Block */}
                    <div className="bg-neutral-50 border border-brand-border rounded-2xl p-4 space-y-3.5 shadow-2xs">
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-semibold text-neutral-600">Order Quantity</span>
                          <span className="font-bold text-brand-primary">{qty} units</span>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min="1"
                            max="10000"
                            value={qty}
                            onChange={(e) => setQty(e.target.value)}
                            className="w-20 bg-white border border-brand-border rounded-xl px-2 py-1.5 text-xs text-center text-brand-primary focus:outline-none focus:border-neutral-450 font-bold"
                          />
                          <div className="flex-1 flex gap-1 overflow-x-auto scrollbar-none pb-0.5">
                            {['12', '24', '50', '100', '250', '500'].map((qVal) => (
                              <button
                                key={qVal}
                                type="button"
                                onClick={() => setQty(qVal)}
                                className={`px-2.5 py-1 border rounded-lg text-[9px] font-bold transition-all shrink-0 ${
                                  qty === qVal
                                    ? 'bg-brand-primary border-brand-primary text-white shadow-3xs'
                                    : 'bg-white border-brand-border text-neutral-700 hover:bg-neutral-50'
                                }`}
                              >
                                {qVal}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-brand-border/60 pt-3 space-y-2.5 text-xs">
                        <div className="flex justify-between items-center text-brand-secondary font-medium">
                          <span>Base Garment ({selectedProduct.brand})</span>
                          <span className="font-bold text-brand-primary">${pricingDetails.base.toFixed(2)}</span>
                        </div>
                        
                        {frontLogoUrl && (
                          <div className="flex justify-between items-center text-brand-secondary font-medium animate-in slide-in-from-top-1 duration-200">
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              Front Placement ({frontPrintSize})
                            </span>
                            <span className="font-bold text-brand-primary">+${pricingDetails.front.toFixed(2)}</span>
                          </div>
                        )}
                        
                        {backLogoUrl && (
                          <div className="flex justify-between items-center text-brand-secondary font-medium animate-in slide-in-from-top-1 duration-200">
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              Back Placement ({backPrintSize})
                            </span>
                            <span className="font-bold text-brand-primary">+${pricingDetails.back.toFixed(2)}</span>
                          </div>
                        )}

                        {pricingDetails.surcharge > 0 && (
                          <div className="flex justify-between items-center text-brand-secondary font-medium animate-in slide-in-from-top-1 duration-200">
                            <span>Double-Sided Setup Surcharge</span>
                            <span className="font-bold text-brand-primary">+${pricingDetails.surcharge.toFixed(2)}</span>
                          </div>
                        )}

                        {pricingDetails.discountPct !== 0 && (
                          <div className={`flex justify-between items-center font-bold ${pricingDetails.discountPct > 0 ? 'text-emerald-600' : 'text-amber-600'} animate-in slide-in-from-top-1 duration-200`}>
                            <span>
                              {pricingDetails.discountPct > 0 
                                ? `Volume Discount (${qty} units)` 
                                : `Low Run Surcharge (<24 units)`}
                            </span>
                            <span>
                              {pricingDetails.discountPct > 0 
                                ? `-${pricingDetails.discountPct}%` 
                                : `+${Math.abs(pricingDetails.discountPct)}%`}
                            </span>
                          </div>
                        )}

                        <div className="pt-2 border-t border-brand-border/60 flex justify-between items-center text-sm font-bold text-brand-primary">
                          <span>Estimated Unit Price</span>
                          <span className="text-base text-brand-primary">${pricingDetails.total.toFixed(2)}</span>
                        </div>

                        <div className="pt-2 border-t border-brand-border/40 flex justify-between items-center text-[10px] text-brand-secondary font-bold">
                          <span>Estimated Total ({qty} units)</span>
                          <span className="text-xs text-brand-primary">${(pricingDetails.total * (parseInt(qty || '0') || 1)).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-brand-border flex flex-col sm:flex-row items-stretch sm:items-center gap-3 justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <button
                      onClick={() => setStep(1)}
                      className="px-5 py-3.5 bg-neutral-50 hover:bg-neutral-100 border border-brand-border rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0"
                    >
                      <ArrowLeft size={14} /> Back
                    </button>
                    <button
                      onClick={handleSaveActiveToCartAndReset}
                      disabled={isCompilingMockup}
                      className="flex-1 sm:flex-none px-5 py-3.5 bg-white hover:bg-neutral-50 border border-brand-border text-brand-primary rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-75 disabled:cursor-not-allowed"
                    >
                      {isCompilingMockup ? (
                        <Loader2 className="animate-spin" size={14} />
                      ) : (
                        <>+ Add & Customize Another</>
                      )}
                    </button>
                  </div>
                  <button
                    onClick={handleProceedToStep3}
                    disabled={isCompilingMockup}
                    className="flex-1 py-3.5 bg-brand-primary text-white hover:bg-brand-primary/95 rounded-xl font-bold tracking-wide transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-75 disabled:cursor-not-allowed text-xs"
                  >
                    {isCompilingMockup ? (
                      <>
                        <Loader2 className="animate-spin" size={14} />
                        Compiling Canvas Mockup...
                      </>
                    ) : (
                      <>
                        Continue to Details <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* STEP 3: CUSTOMER DETAILS */}
          {step === 3 && (cart.length > 0 || selectedProduct) && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in duration-300">
              
              {/* Form Input fields */}
              <div className="lg:col-span-8 bg-white rounded-3xl p-8 border border-brand-border shadow-[0_4px_24px_rgb(0,0,0,0.01)] flex flex-col gap-6">
                <div>
                  <h2 className="text-2xl font-serif text-brand-primary tracking-tight">Step 3: Tell Us About Yourself</h2>
                  <p className="text-brand-secondary text-xs mt-1">Provide your contact info so we can deliver your custom price quote and consult on your project.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                  <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold text-brand-primary">Contact Name *</label>
                      <input 
                        type="text" 
                        value={customerInfo.contactName} 
                        onChange={e => setCustomerInfo({...customerInfo, contactName: e.target.value})} 
                        className="w-full bg-white border border-brand-border rounded-xl px-4 py-3 text-sm text-brand-primary focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all font-medium" 
                        placeholder="Jane Doe" 
                      />
                  </div>
                  <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold text-brand-primary">Email Address *</label>
                      <input 
                        type="email" 
                        value={customerInfo.emailAddress} 
                        onChange={e => setCustomerInfo({...customerInfo, emailAddress: e.target.value})} 
                        className="w-full bg-white border border-brand-border rounded-xl px-4 py-3 text-sm text-brand-primary focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all font-medium" 
                        placeholder="jane@company.com" 
                      />
                  </div>
                  <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold text-brand-primary">Company / Brand Name</label>
                      <input 
                        type="text" 
                        value={customerInfo.companyName} 
                        onChange={e => setCustomerInfo({...customerInfo, companyName: e.target.value})} 
                        className="w-full bg-white border border-brand-border rounded-xl px-4 py-3 text-sm text-brand-primary focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all font-medium" 
                        placeholder="Acme Corp" 
                      />
                  </div>
                  <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold text-brand-primary">Phone Number</label>
                      <input 
                        type="tel" 
                        value={customerInfo.phone} 
                        onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})} 
                        className="w-full bg-white border border-brand-border rounded-xl px-4 py-3 text-sm text-brand-primary focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all font-medium" 
                        placeholder="(555) 123-4567" 
                      />
                  </div>
                  <div className="md:col-span-2 flex flex-col gap-2">
                      <label className="text-xs font-bold text-brand-primary">Website URL (Optional)</label>
                      <input 
                        type="url" 
                        value={customerInfo.website} 
                        onChange={e => setCustomerInfo({...customerInfo, website: e.target.value})} 
                        className="w-full bg-white border border-brand-border rounded-xl px-4 py-3 text-sm text-brand-primary focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all font-medium" 
                        placeholder="www.company.com" 
                      />
                  </div>
                </div>

                <div className="pt-6 border-t border-brand-border flex items-center gap-3 justify-between">
                  <button
                    onClick={handleBackToStep2}
                    className="px-5 py-3.5 bg-neutral-50 hover:bg-neutral-100 border border-brand-border rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                  >
                    <ArrowLeft size={14} /> Back
                  </button>
                  <button
                    onClick={() => {
                      if (!customerInfo.contactName || !customerInfo.emailAddress) {
                        return alert("Please fill out required fields (Contact Name and Email Address).");
                      }
                      if (cart.length === 0) {
                        return alert("Please add at least one customized style to your cart first.");
                      }
                      setStep(4);
                    }}
                    className="px-8 py-3.5 bg-brand-primary text-white hover:bg-brand-primary/95 rounded-xl text-xs font-bold tracking-wide transition-all shadow-sm flex items-center gap-1.5"
                  >
                    Continue to Review <ArrowRight size={14} />
                  </button>
                </div>
              </div>

              {/* Designer product preview card (Right Column) */}
              <div className="lg:col-span-4 bg-white rounded-3xl p-6 border border-brand-border shadow-[0_4px_24px_rgb(0,0,0,0.01)] flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center border-b border-brand-border/60 pb-3">
                  <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Your Cart ({cart.length} style{cart.length > 1 ? 's' : ''})</h4>
                  <button
                    onClick={() => setStep(1)}
                    className="text-xs text-brand-primary font-bold hover:underline flex items-center gap-1"
                  >
                    + Add Another Style
                  </button>
                </div>
                
                {cart.length === 0 ? (
                  <p className="text-xs text-brand-secondary py-4 text-center">Your cart is empty.</p>
                ) : (
                  <div className="flex flex-col gap-4 divide-y divide-brand-border/40">
                    {cart.map((item, idx) => {
                      const itemTotal = item.pricingDetails.total * item.qty;
                      return (
                        <div key={item.id} className={`pt-4 ${idx === 0 ? 'pt-0' : ''} flex flex-col gap-3`}>
                          <div className="flex gap-3">
                            <div className="w-16 h-20 bg-neutral-50 border border-brand-border rounded-lg flex items-center justify-center p-2 overflow-hidden flex-shrink-0">
                              <img src={item.mockupUrl} alt={item.product.title} className="w-full h-full object-contain filter drop-shadow-xs" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{item.product.brand} {item.product.style}</span>
                              <h5 className="text-xs font-bold text-brand-primary truncate">{item.product.title.replace(/®/g, '').trim()}</h5>
                              <p className="text-[11px] text-brand-secondary">Color: <strong className="text-brand-primary">{item.color}</strong></p>
                              <p className="text-[11px] text-brand-secondary font-semibold">Unit Price: <strong className="text-brand-primary">${item.pricingDetails.total.toFixed(2)}</strong></p>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between mt-1 bg-neutral-50 p-2 rounded-xl border border-brand-border/40 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-neutral-400 font-semibold">Qty:</span>
                              <input
                                type="number"
                                min="1"
                                value={item.qty}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  updateCartItemQty(item.id, val);
                                }}
                                className="w-16 bg-white border border-brand-border rounded px-1.5 py-0.5 text-center font-bold text-brand-primary"
                              />
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] text-neutral-400 block">Subtotal</span>
                              <span className="font-bold text-brand-primary">${itemTotal.toFixed(2)}</span>
                            </div>
                          </div>

                          <div className="flex justify-end">
                            <button
                              onClick={() => setCart(prev => prev.filter(c => c.id !== item.id))}
                              className="text-[10px] text-red-500 hover:text-red-600 font-bold flex items-center gap-1"
                            >
                              Remove Item
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {cart.length > 0 && (
                  <div className="border-t border-brand-border/60 pt-4 mt-2">
                    <div className="flex justify-between items-center text-sm font-bold text-brand-primary">
                      <span>Estimated Subtotal</span>
                      <span>
                        ${cart.reduce((acc, item) => acc + (item.pricingDetails.total * item.qty), 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* STEP 4: REVIEW & CHECKOUT */}
          {step === 4 && (cart.length > 0 || selectedProduct) && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in duration-300">
              
              {/* Checkout details input (Left Column) */}
              <div className="lg:col-span-7 bg-white rounded-3xl p-8 border border-brand-border shadow-[0_4px_24px_rgb(0,0,0,0.01)] flex flex-col gap-6">
                <div>
                  <h2 className="text-2xl font-serif text-brand-primary tracking-tight">Step 4: Finalize Project Scope</h2>
                  <p className="text-brand-secondary text-xs mt-1">Specify size distributions, target deadlines, and select your preferred quality tier.</p>
                </div>

                {/* Sizing Spread Grid for each cart item */}
                <div className="space-y-6">
                  <div className="border-b border-brand-border/60 pb-3">
                    <h3 className="text-sm font-bold text-brand-primary uppercase tracking-wider">Sizes & Quantities</h3>
                    <p className="text-xs text-brand-secondary mt-1">Specify your size breakdown for each custom style. Sizing details are required for Pay Now checkouts.</p>
                  </div>

                  <div className="space-y-6">
                    {cart.map((item) => (
                      <div key={item.id} className="p-5 bg-neutral-50 rounded-2xl border border-brand-border/60 space-y-4">
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{item.product.brand} {item.product.style}</span>
                            <h4 className="text-xs font-bold text-brand-primary truncate">{item.product.title.replace(/®/g, '').trim()}</h4>
                            <p className="text-[11px] text-brand-secondary mt-0.5">Color: <span className="font-bold text-brand-primary">{item.color}</span></p>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-neutral-400 block font-semibold uppercase">Total Qty</span>
                            <span className="text-sm font-bold text-brand-primary bg-white border border-brand-border/60 px-2.5 py-1 rounded-lg inline-block mt-0.5 min-w-[3rem] text-center">{item.qty}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                          {['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'].map((size) => (
                            <div key={size} className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-brand-secondary text-center uppercase tracking-wider">{size}</label>
                              <input
                                type="number"
                                min="0"
                                placeholder="0"
                                value={item.sizes?.[size] ?? 0}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  updateCartItemSize(item.id, size, val);
                                }}
                                className="w-full bg-white border border-brand-border rounded-lg py-1.5 text-center text-xs font-bold text-brand-primary focus:outline-none focus:border-neutral-400 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4 border-t border-brand-border/60 pt-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-brand-primary uppercase tracking-wider flex items-center gap-1.5"><DollarSign size={13}/> Budget Tier</label>
                    <div className="relative">
                      <select 
                        value={budgetTier} 
                        onChange={e => setBudgetTier(e.target.value)} 
                        className="w-full bg-white border border-brand-border rounded-xl px-4 py-3.5 text-sm text-brand-primary focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 appearance-none font-medium pr-10"
                      >
                        <option value="Promo / Bulk">Promo / Event Bulk (Economy)</option>
                        <option value="Retail Standard">Retail Standard (Premium Blanks)</option>
                        <option value="Cut & Sew">Custom Cut & Sew (Luxury)</option>
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 border-r-2 border-b-2 border-neutral-400 transform rotate-45 pointer-events-none"></div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-brand-primary uppercase tracking-wider">Target In-Hands Date</label>
                    <input 
                      type="date" 
                      value={inHandsDate} 
                      onChange={e => setInHandsDate(e.target.value)} 
                      className="w-full bg-white border border-brand-border rounded-xl px-4 py-3.5 text-sm text-brand-primary focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 transition-all font-medium" 
                    />
                  </div>

                  <div className="md:col-span-2 flex flex-col gap-2">
                    <label className="text-xs font-bold text-brand-primary uppercase tracking-wider">Project Vision / Additional Details</label>
                    <textarea 
                      rows={5} 
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Include details about sizing ranges, specific print locations (e.g. back print, sleeve), or any design questions you have..."
                      className="w-full bg-white border border-brand-border rounded-xl px-4 py-4 text-sm text-brand-primary focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 placeholder:text-neutral-400 transition-all resize-none font-medium"
                    />
                  </div>
                </div>

                <div className="pt-6 border-t border-brand-border flex flex-col sm:flex-row items-stretch sm:items-center gap-3 justify-between">
                  <button
                    onClick={() => setStep(3)}
                    disabled={isSubmitting}
                    className="px-5 py-3.5 bg-neutral-50 hover:bg-neutral-100 border border-brand-border rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <ArrowLeft size={14} /> Back
                  </button>
                  <div className="flex-1 flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => submitOrderOrCheckout(false)}
                      disabled={isSubmitting}
                      className="flex-1 py-3.5 bg-white border border-brand-border hover:bg-neutral-50 text-brand-secondary rounded-xl text-xs font-bold tracking-wide transition-all shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? <Loader2 className="animate-spin" size={14} /> : <FileText size={14} />}
                      Submit Quote Only
                    </button>
                    <button
                      onClick={() => submitOrderOrCheckout(true)}
                      disabled={isSubmitting}
                      className="flex-1 py-3.5 bg-brand-primary text-white hover:bg-brand-primary/95 rounded-xl text-xs font-bold tracking-wide transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? <Loader2 className="animate-spin" size={14} /> : <Lock size={14} />}
                      Checkout & Pay Now
                    </button>
                  </div>
                </div>
              </div>

              {/* Order Summary Breakdown Card (Right Column) */}
              <div className="lg:col-span-5 bg-white rounded-3xl p-6 border border-brand-border shadow-[0_4px_24px_rgb(0,0,0,0.01)] flex flex-col gap-6">
                <div>
                  <h3 className="text-lg font-serif text-brand-primary border-b border-brand-border pb-3 flex items-center gap-2"><FileText size={18} /> Quote Order Summary</h3>
                </div>

                {/* List of items in Step 4 Summary */}
                <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                  {cart.map((item) => {
                    const itemTotal = item.pricingDetails.total * item.qty;
                    return (
                      <div key={item.id} className="flex items-center gap-3 p-3 bg-neutral-50 border border-brand-border rounded-xl">
                        <div className="w-12 h-14 bg-white border border-brand-border rounded-md flex items-center justify-center p-1.5 overflow-hidden flex-shrink-0">
                          <img src={item.mockupUrl} alt={item.product.title} className="w-full h-full object-contain" />
                        </div>
                        <div className="flex-1 min-w-0 text-xs">
                          <h5 className="font-bold text-brand-primary truncate">{item.product.brand} {item.product.style}</h5>
                          <p className="text-[10px] text-brand-secondary">Color: <strong>{item.color}</strong> | Qty: <strong>{item.qty}</strong></p>
                          {item.sizes && Object.values(item.sizes).some(v => (v as number) > 0) && (
                            <p className="text-[9px] text-neutral-400 truncate">
                              Sizes: {Object.entries(item.sizes)
                                .filter(([_, v]) => (v as number) > 0)
                                .map(([k, v]) => `${k}:${v}`)
                                .join(', ')}
                            </p>
                          )}
                        </div>
                        <div className="text-right text-xs font-bold text-brand-primary">
                          ${itemTotal.toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="divide-y divide-brand-border/60 text-xs">
                  <div className="py-3 flex justify-between">
                    <span className="text-neutral-500 font-semibold">Total Styles</span>
                    <span className="text-brand-primary font-bold">{cart.length} style{cart.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="py-3 flex justify-between">
                    <span className="text-neutral-500 font-semibold">Total Units</span>
                    <span className="text-brand-primary font-bold">
                      {cart.reduce((acc, item) => acc + item.qty, 0)} units
                    </span>
                  </div>
                  <div className="py-3 flex justify-between">
                    <span className="text-neutral-500 font-semibold">Quality tier</span>
                    <span className="text-brand-primary font-bold">{budgetTier}</span>
                  </div>
                  <div className="py-3 flex justify-between bg-neutral-50 p-2.5 rounded-lg border border-brand-border/60 my-1">
                    <span className="text-brand-primary font-bold">Estimated Grand Total</span>
                    <span className="text-brand-primary font-extrabold text-sm">
                      ${cart.reduce((acc, item) => acc + (item.pricingDetails.total * item.qty), 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="py-3 flex justify-between">
                    <span className="text-neutral-500 font-semibold">Customer info</span>
                    <span className="text-brand-primary font-bold text-right">
                      {customerInfo.contactName}
                      <span className="block text-[10px] text-neutral-400 font-medium normal-case">{customerInfo.emailAddress}</span>
                    </span>
                  </div>
                </div>
              </div>

            </div>
          )}

        </div>
      </div>

      {/* Customize Storefront Drawer/Modal */}
      {isEditingStorefront && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-6 z-[100] animate-in fade-in duration-200">
          <div className="bg-white border border-brand-border rounded-3xl p-8 max-w-lg w-full space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="text-2xl font-serif text-brand-primary flex items-center gap-2">
                <Settings className="text-brand-primary animate-spin-slow" size={24} />
                Customize Storefront
              </h3>
              <p className="text-brand-secondary text-xs mt-1">
                Branding configurations here update the public quote request page in real-time. Changes are stored globally.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-brand-primary">Logo / Shop Name</label>
                <input
                  type="text"
                  value={editSettings.logoText}
                  onChange={e => setEditSettings({ ...editSettings, logoText: e.target.value })}
                  className="w-full bg-white border border-brand-border rounded-xl px-4 py-2.5 text-sm font-medium"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-brand-primary">Announcement Bar Text</label>
                <input
                  type="text"
                  value={editSettings.announcement}
                  onChange={e => setEditSettings({ ...editSettings, announcement: e.target.value })}
                  className="w-full bg-white border border-brand-border rounded-xl px-4 py-2.5 text-sm font-medium"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-brand-primary">Hero Banner Title</label>
                <input
                  type="text"
                  value={editSettings.heroTitle}
                  onChange={e => setEditSettings({ ...editSettings, heroTitle: e.target.value })}
                  className="w-full bg-white border border-brand-border rounded-xl px-4 py-2.5 text-sm font-medium"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-brand-primary">Hero Banner Subtitle</label>
                <textarea
                  rows={2}
                  value={editSettings.heroSubtitle}
                  onChange={e => setEditSettings({ ...editSettings, heroSubtitle: e.target.value })}
                  className="w-full bg-white border border-brand-border rounded-xl px-4 py-2.5 text-sm font-medium resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-brand-primary">Support Phone</label>
                  <input
                    type="text"
                    value={editSettings.contactPhone}
                    onChange={e => setEditSettings({ ...editSettings, contactPhone: e.target.value })}
                    className="w-full bg-white border border-brand-border rounded-xl px-4 py-2.5 text-sm font-medium"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-brand-primary">Support Email</label>
                  <input
                    type="email"
                    value={editSettings.email}
                    onChange={e => setEditSettings({ ...editSettings, email: e.target.value })}
                    className="w-full bg-white border border-brand-border rounded-xl px-4 py-2.5 text-sm font-medium"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-brand-border flex items-center justify-between gap-3">
              <button
                onClick={() => setIsEditingStorefront(false)}
                className="px-5 py-2.5 bg-neutral-50 hover:bg-neutral-100 border border-brand-border rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStorefrontSettings}
                disabled={isSavingSettings}
                className="flex-1 py-2.5 bg-brand-primary hover:bg-brand-primary/95 text-white rounded-xl text-xs font-bold tracking-wide transition-all shadow-sm flex items-center justify-center gap-1.5"
              >
                {isSavingSettings ? (
                  <>
                    <Loader2 className="animate-spin" size={14} />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Background / Color Remover Modal */}
      {isColorRemoverOpen && originalArtworkUrl && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-6 z-[110] animate-in fade-in duration-200">
          <div className="bg-white border border-brand-border rounded-3xl p-8 max-w-3xl w-full space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-serif text-brand-primary flex items-center gap-2">
                  <Layers className="text-brand-primary animate-pulse" size={24} />
                  Manual Background & Color Remover
                </h3>
                <p className="text-brand-secondary text-xs mt-1">
                  Click on the image or choose swatches below to remove colors and make them transparent.
                </p>
              </div>
              <button 
                onClick={() => setIsColorRemoverOpen(false)}
                className="p-2 bg-neutral-50 hover:bg-neutral-100 rounded-full border border-brand-border text-neutral-450 hover:text-brand-primary transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-stretch">
              {/* Left Column: Canvas Preview */}
              <div className="md:col-span-7 flex flex-col items-center justify-center bg-checkerboard border border-brand-border rounded-2xl p-4 overflow-hidden relative min-h-[320px] max-h-[400px] select-none">
                <canvas
                  ref={removerCanvasRef}
                  onClick={handleRemoverCanvasClick}
                  className="max-w-full max-h-[360px] object-contain cursor-crosshair border border-dashed border-neutral-300 shadow-sm"
                  title="Click directly on the image to pick and remove a color!"
                />
              </div>

              {/* Right Column: Controls */}
              <div className="md:col-span-5 flex flex-col justify-between gap-6">
                <div className="space-y-5">
                  
                  {/* Presets / Extracted Colors */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-neutral-450 uppercase tracking-widest block">Colors Found in Image</span>
                    <div className="flex flex-wrap gap-2 p-3 bg-neutral-50 border border-brand-border rounded-xl max-h-[100px] overflow-y-auto scrollbar-thin">
                      {removerExtracted.map((hex) => {
                        const isSelected = removerColorsToRemove.includes(hex);
                        const isWhite = hex === "#FFFFFF";
                        return (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setRemoverColorsToRemove(prev => prev.filter(c => c !== hex));
                              } else {
                                setRemoverColorsToRemove(prev => [...prev, hex]);
                              }
                            }}
                            className={`w-7 h-7 rounded-full border transition-all relative ${
                              isSelected 
                                ? 'ring-2 ring-brand-primary ring-offset-2 scale-110' 
                                : 'border-neutral-350 hover:scale-105'
                            }`}
                            style={{ 
                              backgroundColor: hex,
                              borderColor: isWhite ? '#D1D5DB' : 'transparent'
                            }}
                            title={`Click to toggle removal for ${hex}`}
                          >
                            {isSelected && (
                              <span className="absolute inset-0 flex items-center justify-center">
                                <Check 
                                  size={12} 
                                  className={hex === '#FFFFFF' || hex === '#E0E0E0' ? 'text-black' : 'text-white'} 
                                />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tolerance Slider */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-neutral-600 flex items-center gap-1.5"><Sliders size={12}/> Clean Edges Tolerance</span>
                      <span className="font-bold text-neutral-700">{removerTolerance}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="80"
                      step="1"
                      value={removerTolerance}
                      onChange={(e) => setRemoverTolerance(parseInt(e.target.value))}
                      className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                    />
                    <span className="text-[9px] text-neutral-400 block leading-tight">Increase tolerance to remove similar shades (e.g. shadows near edges). Decrease to preserve fine details.</span>
                  </div>

                  {/* Active list of removed colors */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block">Active Transparent Colors ({removerColorsToRemove.length})</span>
                    {removerColorsToRemove.length === 0 ? (
                      <span className="text-xs text-neutral-450 italic">No colors selected. Click the image or swatches to select.</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-h-[75px] overflow-y-auto pr-1">
                        {removerColorsToRemove.map(hex => (
                          <span 
                            key={hex}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-neutral-100 border border-brand-border rounded-lg text-[10px] font-bold text-brand-primary"
                          >
                            <span className="w-2.5 h-2.5 rounded-full border border-neutral-300" style={{ backgroundColor: hex }} />
                            <span>{hex}</span>
                            <button
                              type="button"
                              onClick={() => setRemoverColorsToRemove(prev => prev.filter(c => c !== hex))}
                              className="text-neutral-400 hover:text-brand-primary ml-0.5 cursor-pointer"
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                </div>

                {/* Footer Buttons */}
                <div className="pt-4 border-t border-brand-border flex items-center justify-between gap-3 shrink-0">
                  <button
                    onClick={() => setRemoverColorsToRemove([])}
                    className="px-4 py-2.5 bg-neutral-50 hover:bg-neutral-100 border border-brand-border rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Clear All
                  </button>
                  <button
                    onClick={applyColorRemoverChanges}
                    className="flex-1 py-2.5 bg-brand-primary hover:bg-brand-primary/95 text-white rounded-xl text-xs font-bold tracking-wide transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    Apply & Save Transparent Logo
                  </button>
                </div>

              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
