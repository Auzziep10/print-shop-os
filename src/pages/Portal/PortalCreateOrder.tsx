import { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, PackagePlus, X, Trash2, ChevronDown, RotateCcw, Calendar, Loader2, Sparkles, Save, User, Copy, Upload, ShoppingCart, Users, Info } from 'lucide-react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { db, storage } from '../../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../contexts/AuthContext';
import { GarmentCustomizerModal } from '../../components/Portal/GarmentCustomizerModal';
import { GarmentBrowser } from '../../components/shared/GarmentBrowser';
import sanmarCatalogJson from '../../data/sanmar-catalog.json';

const sanmarCatalog = sanmarCatalogJson as any[];

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

const sortSizes = (a: string, b: string) => {
  const orderMap: Record<string, number> = { 
    'yxs':-5, 'ys':-4, 'ym':-3, 'yl':-2, 'yxl':-1,
    'xxs':1, 'xs':2, 's':3, 'm':4, 'l':5, 'xl':6, 'xxl':7, '2xl':7, '3xl':8, '4xl':9, '5xl':10, 'osfa':11, 'os':12 
  };
  const aKey = a.split(' ')[0].toLowerCase();
  const bKey = b.split(' ')[0].toLowerCase();
  const aVal = orderMap[aKey] || 99;
  const bVal = orderMap[bKey] || 99;
  if (aVal !== bVal) return aVal - bVal;
  return a.localeCompare(b);
};
const findColorsInObj = (obj: any, maxDepth = 4): string[] | null => {
  if (!obj || typeof obj !== 'object' || maxDepth === 0) return null;
  const colorKeys = ['availableColors', 'available_colors', 'colors', 'Colors', 'color', 'Color', 'AvailableColors'];
  for (const k of colorKeys) {
      if (obj[k]) {
          const val = obj[k];
          if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string') return val;
          if (typeof val === 'string' && val.trim().length > 0) return val.split(',').map(s=>s.trim());
      }
  }
  if (Array.isArray(obj)) {
      for (const i of obj) {
          const res = findColorsInObj(i, maxDepth - 1);
          if (res) return res;
      }
  } else {
      for (const k of Object.keys(obj)) {
          if (typeof obj[k] === 'object') {
              const res = findColorsInObj(obj[k], maxDepth - 1);
              if (res) return res;
          }
      }
  }
  return null;
};

const parseSizesFromItem = (item: any, style = ''): string[] => {
  const sUpper = style.toUpperCase().trim();
  
  // Specific style overrides
  if (sUpper === 'STC70' || sUpper === '112' || sUpper === 'C402' || sUpper === '212' || sUpper === '115') return ['OSFA'];
  if (sUpper === 'BC3001' || sUpper === 'BC3001CVC' || sUpper === '3001' || sUpper === '3001CVC') return ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
  if (sUpper === 'ST640' || sUpper === 'ST665' || sUpper === 'ST550' || sUpper === 'S6000' || sUpper === 'DT6100' || sUpper === 'DT1304' || sUpper === 'DT6000' || sUpper === 'DT6001') return ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];
  if (sUpper === 'BC3719' || sUpper === 'BC3501' || sUpper === '3719' || sUpper === '3501') return ['XS', 'S', 'M', 'L', 'XL', '2XL'];
  if (sUpper === '64000' || sUpper === '64800' || sUpper === '64000B') return ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];
  if (sUpper === 'SF000' || sUpper === 'SF500' || sUpper === '18500' || sUpper === '996M' || sUpper === '29LS' || sUpper === '5000' || sUpper === '562M') return ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
  if (sUpper === '6014' || sUpper === '1717' || sUpper === '1566' || sUpper === '6030') return ['S', 'M', 'L', 'XL', '2XL', '3XL'];
  if (sUpper === 'K500' || sUpper === 'L500' || sUpper === 'K810' || sUpper === 'K420' || sUpper === 'K110' || sUpper === 'K540') return ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'];

  let sizes: string[] = [];
  if (Array.isArray(item.sizes) && item.sizes.length > 0) {
      sizes = item.sizes;
  } else if (typeof item.sizes === 'string' && item.sizes.trim()) {
      sizes = item.sizes.split(',').map((s:string) => s.trim());
  } else if (Array.isArray(item.availableSizes) && item.availableSizes.length > 0) {
      sizes = item.availableSizes;
  } else if (typeof item.availableSizes === 'string' && item.availableSizes.trim()) {
      sizes = item.availableSizes.split(',').map((s:string) => s.trim());
  } else if (item.sizeSpread && typeof item.sizeSpread === 'string' && item.sizeSpread.trim()) {
      sizes = item.sizeSpread.split(',').map((s:string) => s.trim());
  } else if (item.size_spread && typeof item.size_spread === 'string' && item.size_spread.trim()) {
      sizes = item.size_spread.split(',').map((s:string) => s.trim());
  } else if (Array.isArray(item.variations) && item.variations[0]?.sizes) {
      sizes = item.variations[0].sizes;
  } else if (
    style.toLowerCase().includes('chill') || 
    style.toLowerCase().includes('tumbler') || 
    style.toLowerCase().includes('bag') || 
    style.toLowerCase().includes('hat') ||
    style.toLowerCase().includes('cap') ||
    (item.category && item.category.toLowerCase().includes('hat')) ||
    (item.category && item.category.toLowerCase().includes('cap')) ||
    (item.title && item.title.toLowerCase().includes('hat')) ||
    (item.title && item.title.toLowerCase().includes('cap'))
  ) {
      sizes = ['OSFA'];
  }

  if (sizes.length === 0) {
    const styleLower = style.toLowerCase();
    const titleLower = (item.title || '').toLowerCase();
    const catLower = (item.category || '').toLowerCase();

    // Ladies' styles
    if (styleLower.startsWith('l') && /^[l|L]\d+/.test(styleLower)) {
      return ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];
    }
    if (titleLower.includes('ladies') || titleLower.includes('women')) {
      return ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
    }

    // Brand defaults
    const brandLower = (item.brand || '').toLowerCase();
    if (brandLower.includes('gildan')) {
      return ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
    }
    if (brandLower.includes('comfort colors')) {
      return ['S', 'M', 'L', 'XL', '2XL', '3XL'];
    }
    if (brandLower.includes('bella') || brandLower.includes('canvas')) {
      if (catLower.includes('hoodie') || catLower.includes('sweatshirt') || catLower.includes('sleeve')) {
        return ['XS', 'S', 'M', 'L', 'XL', '2XL'];
      }
      return ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];
    }

    sizes = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
  }
  return sizes;
};

export function PortalCreateOrder() {
  const navigate = useNavigate();
  const { customerId } = useParams();
  const location = useLocation();
  const { user, userData } = useAuth();
  
  // Saved Carts States
  const [savedCarts, setSavedCarts] = useState<any[]>([]);
  const [isLoadingSavedCarts, setIsLoadingSavedCarts] = useState(false);
  const [isSavingCart, setIsSavingCart] = useState(false);
  const [showSaveCartModal, setShowSaveCartModal] = useState(false);
  const [savedCartName, setSavedCartName] = useState('');

  // Customer Profile & Completeness States
  const [customer, setCustomer] = useState<any>(null);
  const [showIncompleteProfileModal, setShowIncompleteProfileModal] = useState(false);
  const [profileContactName, setProfileContactName] = useState('');
  const [profileCompany, setProfileCompany] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileStreet, setProfileStreet] = useState('');
  const [profileCity, setProfileCity] = useState('');
  const [profileState, setProfileState] = useState('');
  const [profileZip, setProfileZip] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Selected Packaging preference
  const selectedPackaging = 'Retail (single folded)';

  // Selected Delivery option
  const [deliveryOption, setDeliveryOption] = useState('Shipping');

  // Additional checkout details
  const neededByDate = '';
  const [orderType, setOrderType] = useState<'Retail' | 'Wholesale'>('Retail');
  const [resaleCertificateUrl, setResaleCertificateUrl] = useState<string | null>(null);
  const [resaleCertificateName, setResaleCertificateName] = useState<string | null>(null);
  const [specialRequests, setSpecialRequests] = useState('');
  const [isUploadingResaleCert, setIsUploadingResaleCert] = useState(false);

  // Success Pop-up modal states
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [optInEmail, setOptInEmail] = useState(true);
  const [optInText, setOptInText] = useState(true);

  useEffect(() => {
    if (customer) {
      setProfileContactName(customer.contactName || '');
      setProfileCompany(customer.company || customer.name || '');
      setProfileEmail(customer.email || '');
      setProfilePhone(customer.phone || '');
      setProfileStreet(customer.shippingStreet || '');
      setProfileCity(customer.shippingCity || '');
      setProfileState(customer.shippingState || '');
      setProfileZip(customer.shippingZip || '');
      setOptInEmail(customer.emailOptIn !== false);
      setOptInText(customer.textOptIn !== false);
    }
  }, [customer]);

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isGarmentBrowserOpen, setIsGarmentBrowserOpen] = useState(false);
  const [orderItems, setOrderItems] = useState<any[]>([]);

  const hasLowQuantityItems = useMemo(() => {
    if (orderItems.length === 0) return false;
    return orderItems.some(item => {
      const totalQty = Object.values(item.quantities as Record<string, number>).reduce((sum, qty) => sum + qty, 0);
      return totalQty < 20;
    });
  }, [orderItems]);
  const [customerDecks, setCustomerDecks] = useState<any[]>([]);
  const [isLoadingDecks, setIsLoadingDecks] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previousOrders, setPreviousOrders] = useState<any[]>([]);
  const [isLoadingPreviousOrders, setIsLoadingPreviousOrders] = useState(true);
  const [isRepeatModalOpen, setIsRepeatModalOpen] = useState(false);
  const [hasWovnRack, setHasWovnRack] = useState(false);
  const [customerRacks, setCustomerRacks] = useState<Record<string, any>>(DEFAULT_RACKS);
  const [customNames, setCustomNames] = useState<any>({ racks: {}, basics: {} });
  const [customSpecs, setCustomSpecs] = useState<any>({ racks: {}, basics: {} });
  const [defaultColors, setDefaultColors] = useState<any>({ racks: {}, basics: {} });
  const [activeRackCategory, setActiveRackCategory] = useState('Athleisure');
  const [activeLibraryTab, setActiveLibraryTab] = useState('rack');
  const [suggestedItems, setSuggestedItems] = useState<any[]>([]);
  const [sampleItems, setSampleItems] = useState<any[]>([]);
  const [pastGarments, setPastGarments] = useState<any[]>([]);
  const [customizingItem, setCustomizingItem] = useState<any | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [applySizingItem, setApplySizingItem] = useState<{ item: any; type: 'roster' | 'standard' } | null>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null);

  const [pendingPreselected, setPendingPreselected] = useState<any[] | null>(null);
  const [isInitialLoadDone, setIsInitialLoadDone] = useState(false);

  const addressInputRef = useRef<HTMLInputElement>(null);
  const modalAddressInputRef = useRef<HTMLInputElement>(null);

  // Load Google Maps API script dynamically
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
    if (!apiKey) {
      console.warn("VITE_GOOGLE_MAPS_API_KEY is not configured. Google Places address autocomplete is disabled.");
      return;
    }
    
    if ((window as any).google?.maps?.places) return;
    
    const existingScript = document.getElementById('google-maps-sdk');
    if (existingScript) return;
    
    const script = document.createElement('script');
    script.id = 'google-maps-sdk';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, []);

  // Initialize Autocomplete for address inputs
  useEffect(() => {
    let autocomplete: any = null;
    let modalAutocomplete: any = null;
    
    const initAutocomplete = () => {
      const maps = (window as any).google?.maps;
      if (!maps || !maps.places) return;
      
      // 1. Drawer Autocomplete
      if (addressInputRef.current && !autocomplete) {
        autocomplete = new maps.places.Autocomplete(addressInputRef.current, {
          types: ['address'],
          componentRestrictions: { country: 'us' }
        });
        
        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          if (!place.address_components) return;
          
          let streetNumber = '';
          let route = '';
          let city = '';
          let state = '';
          let zip = '';
          
          place.address_components.forEach((component: any) => {
            const types = component.types;
            if (types.includes('street_number')) {
              streetNumber = component.long_name;
            } else if (types.includes('route')) {
              route = component.long_name;
            } else if (types.includes('locality')) {
              city = component.long_name;
            } else if (types.includes('administrative_area_level_1')) {
              state = component.short_name;
            } else if (types.includes('postal_code')) {
              zip = component.long_name;
            }
          });
          
          setProfileStreet(`${streetNumber} ${route}`.trim());
          setProfileCity(city);
          setProfileState(state);
          setProfileZip(zip);
        });
      }
      
      // 2. Modal Autocomplete
      if (modalAddressInputRef.current && !modalAutocomplete) {
        modalAutocomplete = new maps.places.Autocomplete(modalAddressInputRef.current, {
          types: ['address'],
          componentRestrictions: { country: 'us' }
        });
        
        modalAutocomplete.addListener('place_changed', () => {
          const place = modalAutocomplete.getPlace();
          if (!place.address_components) return;
          
          let streetNumber = '';
          let route = '';
          let city = '';
          let state = '';
          let zip = '';
          
          place.address_components.forEach((component: any) => {
            const types = component.types;
            if (types.includes('street_number')) {
              streetNumber = component.long_name;
            } else if (types.includes('route')) {
              route = component.long_name;
            } else if (types.includes('locality')) {
              city = component.long_name;
            } else if (types.includes('administrative_area_level_1')) {
              state = component.short_name;
            } else if (types.includes('postal_code')) {
              zip = component.long_name;
            }
          });
          
          setProfileStreet(`${streetNumber} ${route}`.trim());
          setProfileCity(city);
          setProfileState(state);
          setProfileZip(zip);
        });
      }
    };

    const script = document.getElementById('google-maps-sdk');
    
    if ((window as any).google?.maps?.places) {
      const timer = setTimeout(initAutocomplete, 100);
      return () => clearTimeout(timer);
    } else if (script) {
      script.addEventListener('load', initAutocomplete);
      return () => script.removeEventListener('load', initAutocomplete);
    }
  }, [isCartOpen, showIncompleteProfileModal]);

  // Listen to custom event for opening cart drawer from parent layout
  useEffect(() => {
    const handleOpenDrawer = () => setIsCartOpen(true);
    window.addEventListener('wovn_open_cart_drawer', handleOpenDrawer);
    return () => window.removeEventListener('wovn_open_cart_drawer', handleOpenDrawer);
  }, []);

  // Read initial tab and drawer state from URL query parameters
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get('tab');
    if (tabParam === 'saved') {
      setActiveLibraryTab('saved');
    } else if (tabParam) {
      setActiveLibraryTab(tabParam);
    }
    
    if (searchParams.get('openCart') === 'true') {
      setIsCartOpen(true);
      // Clean up URL search param
      const newUrl = window.location.pathname + (searchParams.get('tab') ? `?tab=${searchParams.get('tab')}` : '');
      window.history.replaceState(null, '', newUrl);
    }
  }, [location.search]);

  const getGarmentImage = (item: any) => {
    if (item.images) {
      const chosenColor = (item.defaultColor && item.images[item.defaultColor])
        ? item.defaultColor
        : (item.colors?.[0] || Object.keys(item.images)[0]);
      if (chosenColor && item.images[chosenColor]) {
        const val = item.images[chosenColor];
        if (typeof val === 'string') return val;
        return val.front || val.swatch || val.back || '';
      }
    }
    return 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';
  };

  const activeRackItems = useMemo(() => {
    const categoryRacks = customerRacks[activeRackCategory] || DEFAULT_RACKS.Athleisure;
    return Object.entries(categoryRacks).map(([slot, styleId]) => {
      const prod = sanmarCatalog.find(p => p.style.toLowerCase() === String(styleId).toLowerCase());
      if (prod) {
        const customName = customNames.racks?.[activeRackCategory]?.[slot] || '';
        const defaultColor = defaultColors.racks?.[activeRackCategory]?.[slot] || '';
        const customSpec = customSpecs?.racks?.[activeRackCategory]?.[slot] || null;
        return {
          ...prod,
          id: `${slot}-${Date.now()}-${Math.random()}`,
          customName,
          defaultColor,
          customSpecs: customSpec
        };
      }
      return null;
    }).filter(Boolean);
  }, [customerRacks, activeRackCategory, customNames, defaultColors, customSpecs]);

  const allowedStyleCodes = useMemo(() => {
    if (!customerRacks) return [];
    const codes = new Set<string>();
    Object.values(customerRacks).forEach(rackObj => {
      if (rackObj && typeof rackObj === 'object') {
        Object.values(rackObj).forEach(val => {
          if (val && typeof val === 'string') {
            codes.add(val.trim());
          }
        });
      }
    });
    return Array.from(codes);
  }, [customerRacks]);

  useEffect(() => {
    if (isInitialLoadDone) return;
    let preselected: any[] = [];
    if (location.state?.preselectedItems && Array.isArray(location.state.preselectedItems)) {
      preselected = [...location.state.preselectedItems];
      // Clear location state to avoid repeating on reload
      window.history.replaceState({}, document.title);
    }

    // Check localStorage cart items
    const cartKey = `wovn_reorder_cart_${customerId || 'CUS-001'}`;
    try {
      const savedCart = JSON.parse(localStorage.getItem(cartKey) || '[]');
      if (savedCart && savedCart.length > 0) {
        preselected = [...preselected, ...savedCart];
      }
    } catch (e) {
      console.error(e);
    }

    if (preselected.length > 0) {
      setPendingPreselected(preselected);
    }
  }, [location.state, customerId, isInitialLoadDone]);

  useEffect(() => {
    if (location.state?.openLibrary || location.state?.openCart) {
      setIsCartOpen(true);
      // Clear location state flag
      window.history.replaceState({ ...location.state, openLibrary: undefined, openCart: undefined }, document.title);
    }
  }, [location.state]);

  const mapPrevItemToBuilderItem = (item: any, decks: any[]) => {
    // If it's already in builder format, don't re-map it
    if (item.quantities && typeof item.quantities === 'object' && !Array.isArray(item.quantities)) {
      return item;
    }

    const quantities = (item.sizes && typeof item.sizes === 'object' && !Array.isArray(item.sizes)) ? item.sizes : {};
    
    const matchingCatalogGarment = decks.find(dItem => 
      (dItem.garment_id || dItem.sku || dItem.id) === item.itemNum ||
      (dItem.garment_name || dItem.name || dItem.style || dItem.title) === item.style
    );
    
    let colors = ['Custom Color'];
    if (matchingCatalogGarment) {
      const catalogColors = findColorsInObj({ ...matchingCatalogGarment });
      if (catalogColors && catalogColors.length > 0) {
        colors = catalogColors;
      }
    } else if (item.color) {
      colors = [item.color];
    }
    
    const sizes = parseSizesFromItem(matchingCatalogGarment || {}, item.style || '');
    
    const quantitiesMap: any = {};
    sizes.forEach((s: string) => {
      quantitiesMap[s] = 0;
    });
    
    Object.keys(quantities).forEach((s: string) => {
      quantitiesMap[s] = quantities[s] || 0;
    });

    const artwork = item.artworks?.[0] || {};

    return {
      instanceId: Math.random().toString(36).substring(7),
      style: item.style || 'Custom Garment',
      itemNum: item.itemNum || '',
      gender: item.gender || 'Unisex',
      price: item.price || 0,
      image: item.image || '',
      colors: colors,
      selectedColor: item.color || colors[0],
      quantities: quantitiesMap,
      sizes: sizes,
      customized: item.customized || false,
      logoPlacement: item.notes?.replace('Mockup Placement: ', '') || '',
      logoUrl: artwork.url || item.logoUrl || null,
      logoName: artwork.name || item.logoName || null,
      logoUrlBack: item.logoUrlBack || null,
      logoNameBack: item.logoNameBack || null,
      logoUrlLeftSleeve: item.logoUrlLeftSleeve || null,
      logoNameLeftSleeve: item.logoNameLeftSleeve || null,
      logoUrlRightSleeve: item.logoUrlRightSleeve || null,
      logoNameRightSleeve: item.logoNameRightSleeve || null
    };
  };

  useEffect(() => {
    if (pendingPreselected && !isLoadingDecks) {
      const flatGarments = customerDecks.reduce((acc: any[], deck: any) => {
        const items = deck.items || deck.garments || [];
        return [...acc, ...items];
      }, []);
      const mapped = pendingPreselected.map(item => mapPrevItemToBuilderItem(item, flatGarments));
      setOrderItems(prev => [...prev, ...mapped]);
      setPendingPreselected(null);
    }
  }, [pendingPreselected, isLoadingDecks, customerDecks]);

  useEffect(() => {
    if (!isLoadingDecks && pendingPreselected === null) {
      setIsInitialLoadDone(true);
    }
  }, [isLoadingDecks, pendingPreselected]);

  // Synchronize orderItems with localStorage cart once initial load is complete
  useEffect(() => {
    if (!isInitialLoadDone || !customerId) return;
    const cartKey = `wovn_reorder_cart_${customerId}`;
    try {
      localStorage.setItem(cartKey, JSON.stringify(orderItems));
      window.dispatchEvent(new Event('wovn_cart_updated'));
    } catch (e) {
      console.error("Failed to sync order items to local storage:", e);
    }
  }, [orderItems, customerId, isInitialLoadDone]);

  // Fetch saved carts for this customer
  useEffect(() => {
    const fetchSavedCarts = async () => {
      if (!customerId) return;
      setIsLoadingSavedCarts(true);
      try {
        const q = query(
          collection(db, 'saved_carts'),
          where('customerId', '==', customerId)
        );
        const snapshot = await getDocs(q);
        const list: any[] = [];
        snapshot.forEach(doc => {
          list.push({ id: doc.id, ...doc.data() });
        });
        list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        setSavedCarts(list);
      } catch (err) {
        console.error("Failed to fetch saved carts:", err);
      } finally {
        setIsLoadingSavedCarts(false);
      }
    };
    fetchSavedCarts();
  }, [customerId]);

  const handleSaveCart = async () => {
    if (!customerId || orderItems.length === 0 || !savedCartName.trim()) return;
    setIsSavingCart(true);
    try {
      const cartId = `cart-${Date.now()}`;
      const payload = {
        id: cartId,
        customerId,
        name: savedCartName.trim(),
        createdAt: new Date().toISOString(),
        items: orderItems,
        createdBy: userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Customer'
      };
      await setDoc(doc(db, 'saved_carts', cartId), payload);
      
      setSavedCarts(prev => [payload, ...prev]);
      setShowSaveCartModal(false);
      setSavedCartName('');
      // Cart saved successfully
    } catch (err) {
      console.error("Failed to save cart:", err);
      alert("Failed to save cart. Please try again.");
    } finally {
      setIsSavingCart(false);
    }
  };

  const handleLoadSavedCart = (savedCart: any) => {
    if (window.confirm(`Are you sure you want to load the saved cart "${savedCart.name}"? This will replace your current cart.`)) {
      setOrderItems(savedCart.items || []);
      setIsCartOpen(true);
    }
  };

  const handleDeleteSavedCart = async (cartId: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete the saved cart "${name}"?`)) {
      try {
        await deleteDoc(doc(db, 'saved_carts', cartId));
        setSavedCarts(prev => prev.filter(c => c.id !== cartId));
      } catch (err) {
        console.error("Failed to delete saved cart:", err);
        alert("Failed to delete saved cart.");
      }
    }
  };

  useEffect(() => {
    const fetchPreviousOrders = async () => {
      if (!customerId) return;
      setIsLoadingPreviousOrders(true);
      try {
        const q = query(
          collection(db, 'orders'),
          where('customerId', '==', customerId)
        );
        const querySnapshot = await getDocs(q);
        const ordersList: any[] = [];
        querySnapshot.forEach((docSnap) => {
          ordersList.push(docSnap.data());
        });
        ordersList.sort((a, b) => {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeB - timeA;
        });
        setPreviousOrders(ordersList);

        // Compute unique past garments
        const uniqueGarmentsMap: Record<string, any> = {};
        ordersList.forEach((orderData) => {
          if (orderData.items && Array.isArray(orderData.items)) {
            orderData.items.forEach((item: any) => {
              const styleKey = item.style || item.itemNum;
              if (styleKey && !uniqueGarmentsMap[styleKey]) {
                uniqueGarmentsMap[styleKey] = {
                  ...item,
                  id: item.id || `past-${Date.now()}-${Math.random()}`,
                  style: item.style || 'Custom Garment',
                  itemNum: item.itemNum || '',
                  image: item.image || '',
                  colors: item.colors || (item.color ? [item.color] : ['Custom Color']),
                  price: parseFloat(item.price || 0),
                  selectedColor: item.color || item.selectedColor || ''
                };
              }
            });
          }
        });
        setPastGarments(Object.values(uniqueGarmentsMap));
      } catch (err) {
        console.error("Failed to fetch previous orders", err);
      } finally {
        setIsLoadingPreviousOrders(false);
      }
    };
    fetchPreviousOrders();
  }, [customerId]);

  const handleRepeatOrder = (prevOrder: any) => {
    if (!prevOrder || !Array.isArray(prevOrder.items)) return;

    const newItems = prevOrder.items.map((item: any) => {
      const quantities = item.sizes || {};
      
      const matchingCatalogGarment = customerDecks.find(dItem => 
        (dItem.garment_id || dItem.sku || dItem.id) === item.itemNum ||
        (dItem.garment_name || dItem.name || dItem.style || dItem.title) === item.style
      );
      
      let colors = ['Custom Color'];
      if (matchingCatalogGarment) {
        const catalogColors = findColorsInObj({ ...matchingCatalogGarment });
        if (catalogColors && catalogColors.length > 0) {
          colors = catalogColors;
        }
      } else if (item.color) {
        colors = [item.color];
      }
      
      const sizes = parseSizesFromItem(matchingCatalogGarment || {}, item.style || '');
      
      const quantitiesMap: any = {};
      sizes.forEach((s: string) => {
        quantitiesMap[s] = 0;
      });
      
      Object.keys(quantities).forEach((s: string) => {
        quantitiesMap[s] = quantities[s] || 0;
      });

      return {
        instanceId: Math.random().toString(36).substring(7),
        style: item.style || 'Custom Garment',
        itemNum: item.itemNum || '',
        gender: item.gender || 'Unisex',
        price: item.price || 0,
        image: item.image || '',
        colors: colors,
        selectedColor: item.color || colors[0],
        quantities: quantitiesMap,
        sizes: sizes
      };
    });

    setOrderItems(newItems);
    setIsRepeatModalOpen(false);
  };

  useEffect(() => {
    const fetchDecks = async () => {
      if (!customerId) return;
      setIsLoadingDecks(true);
      
      try {
        // Fetch Global Storefront Settings first
        let globalRacks = DEFAULT_RACKS;
        let globalCustomNames = { racks: {}, basics: {} };
        let globalCustomSpecs = { racks: {}, basics: {} };
        let globalDefaultColors = { racks: {}, basics: {} };
        try {
          const globalRef = doc(db, 'settings', 'storefront-catalog');
          const globalSnap = await getDoc(globalRef);
          if (globalSnap.exists()) {
            const globalData = globalSnap.data();
            if (globalData.racks) {
              globalRacks = globalData.racks;
            }
            if (globalData.customNames) {
              globalCustomNames = globalData.customNames;
            }
            if (globalData.customSpecs) {
              globalCustomSpecs = globalData.customSpecs;
            }
            if (globalData.defaultColors) {
              globalDefaultColors = globalData.defaultColors;
            }
          }
        } catch (globalErr) {
          console.error("Error fetching global catalog settings:", globalErr);
        }

        const customerDoc = await getDoc(doc(db, 'customers', customerId));
        if (customerDoc.exists()) {
          const customerData = customerDoc.data();
          setCustomer(customerData);
          // Support both array and single string for backwards compatibility
          const deckIds = customerData.catalogLinkIds || (customerData.catalogLinkId ? [customerData.catalogLinkId] : []);
          
          // Set customer custom racks, fall back to global settings or defaults
          const fetchedRacks = customerData.racks || globalRacks;
          setCustomerRacks(fetchedRacks);
          setCustomNames(customerData.customNames || globalCustomNames);
          setCustomSpecs(customerData.customSpecs || globalCustomSpecs);
          setDefaultColors(customerData.defaultColors || globalDefaultColors);

          const categories = Object.keys(fetchedRacks);
          if (categories.length > 0 && !categories.includes(activeRackCategory)) {
            setActiveRackCategory(categories[0]);
          }

          const isRackActive = deckIds.length > 0;
          setHasWovnRack(isRackActive);
          setSuggestedItems(customerData.suggestedItems || []);
          const visibleSamples = (customerData.sampleItems || []).filter((item: any) => item.visible !== false);
          setSampleItems(visibleSamples);
          
          const searchParams = new URLSearchParams(window.location.search);
          const tabParam = searchParams.get('tab');
          if (tabParam) {
            setActiveLibraryTab(tabParam);
          } else {
            if (customerData.suggestedItems && customerData.suggestedItems.length > 0) {
              setActiveLibraryTab('suggested');
            } else if (visibleSamples.length > 0) {
              setActiveLibraryTab('samples');
            } else if (categories.length > 0) {
              setActiveLibraryTab('rack');
            } else if (isRackActive) {
              setActiveLibraryTab('wovn');
            } else {
              setActiveLibraryTab('past');
            }
          }
          
          if (deckIds.length > 0) {
            const fetchedArrays = await Promise.all(
              deckIds.map(async (deckId: string) => {
                try {
                  const response = await fetch(`https://wovn-garment-catalog.vercel.app/api/decks?deckId=${deckId}`);
                  if (response.ok) {
                    return await response.json();
                  }
                } catch (e) {
                  console.error("Failed to fetch deck:", deckId, e);
                }
                return null;
              })
            );
            
            // The API returns an array for each deck request. Flatten them all together.
            const validArrays = fetchedArrays.filter(d => d !== null && Array.isArray(d));
            const flatDecks = validArrays.flat();
            setCustomerDecks(flatDecks);
          }
        }
      } catch (err) {
         console.error("Error fetching customer or decks", err);
      } finally {
         setIsLoadingDecks(false);
      }
    };
    
    fetchDecks();
  }, [customerId]);

  const handleBack = () => {
    navigate(customerId ? `/portal/${customerId}` : '/portal');
  };

  const isProfileComplete = () => {
    const basicComplete = !!(
      profileContactName.trim() &&
      profileCompany.trim() &&
      profileEmail.trim() &&
      profilePhone.trim()
    );
    return !!(
      basicComplete &&
      profileStreet.trim() &&
      profileCity.trim() &&
      profileState.trim() &&
      profileZip.trim()
    );
  };

  const handleSaveProfileAndSubmit = async () => {
    if (!customerId) return;
    setIsSavingProfile(true);
    try {
      await setDoc(doc(db, 'customers', customerId), {
        contactName: profileContactName.trim(),
        company: profileCompany.trim(),
        name: profileCompany.trim(),
        email: profileEmail.trim(),
        phone: profilePhone.trim(),
        shippingStreet: profileStreet.trim(),
        shippingCity: profileCity.trim(),
        shippingState: profileState.trim(),
        shippingZip: profileZip.trim(),
      }, { merge: true });

      setCustomer((prev: any) => ({
        ...prev,
        contactName: profileContactName.trim(),
        company: profileCompany.trim(),
        name: profileCompany.trim(),
        email: profileEmail.trim(),
        phone: profilePhone.trim(),
        shippingStreet: profileStreet.trim(),
        shippingCity: profileCity.trim(),
        shippingState: profileState.trim(),
        shippingZip: profileZip.trim(),
      }));

      setShowIncompleteProfileModal(false);
      await handleSubmitOrder(true);
    } catch (err) {
      console.error("Error saving profile details:", err);
      alert("Failed to save profile. Please try again.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSubmitOrder = async (bypassProfileCheck: any = false) => {
    if (!customerId || orderItems.length === 0) return;
    if (hasLowQuantityItems) {
      alert("A minimum of 20 garments per product style is required to submit a quote request.");
      return;
    }

    const shouldBypass = bypassProfileCheck === true;
    if (!shouldBypass && !isProfileComplete()) {
      setShowIncompleteProfileModal(true);
      return;
    }

    setIsSubmitting(true);
    
    try {
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

      const orderId = `order-${Date.now()}`;
      
      const payload = {
        id: orderId,
        portalId: portalId,
        customerId: customerId,
        title: `${profileCompany ? profileCompany.trim() : 'Portal'} Order - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric'})}`,
        statusIndex: 0, 
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric'}),
        createdAt: new Date().toISOString(),
        packaging: selectedPackaging,
        deliveryOption: deliveryOption,
        neededByDate: neededByDate,
        orderType: orderType,
        resaleCertificateUrl: resaleCertificateUrl,
        resaleCertificateName: resaleCertificateName,
        specialRequests: specialRequests,
        shippingAddress: {
          name: profileContactName.trim(),
          company: profileCompany.trim(),
          street1: profileStreet.trim(),
          street2: '',
          city: profileCity.trim(),
          state: profileState.trim(),
          zip: profileZip.trim(),
          country: 'US'
        },
        totalAmount: Math.round(orderItems.reduce((sum, item) => {
           const totalQty = Object.values(item.quantities as Record<string, number>).reduce((q, val) => q + val, 0);
           return sum + (totalQty * (parseFloat(item.price) || 0));
        }, 0) * 100) / 100,
        items: orderItems.map(item => {
           const totalQty = Object.values(item.quantities as Record<string, number>).reduce((q, val) => q + val, 0);
           const p = parseFloat(item.price) || 0;
           
           const artworks = [];
           if (item.logoUrl) {
             artworks.push({ url: item.logoUrl, originalUrl: item.logoUrl, name: item.logoName || 'Front Logo', width: 3.5, height: 3.5, quantity: totalQty });
           }
           if (item.logoUrlBack) {
             artworks.push({ url: item.logoUrlBack, originalUrl: item.logoUrlBack, name: item.logoNameBack || 'Back Logo', width: 3.5, height: 3.5, quantity: totalQty });
           }
           if (item.logoUrlLeftSleeve) {
             artworks.push({ url: item.logoUrlLeftSleeve, originalUrl: item.logoUrlLeftSleeve, name: item.logoNameLeftSleeve || 'Left Sleeve Logo', width: 3.5, height: 3.5, quantity: totalQty });
           }
           if (item.logoUrlRightSleeve) {
             artworks.push({ url: item.logoUrlRightSleeve, originalUrl: item.logoUrlRightSleeve, name: item.logoNameRightSleeve || 'Right Sleeve Logo', width: 3.5, height: 3.5, quantity: totalQty });
           }
           if (item.logoUrlTag) {
             artworks.push({ url: item.logoUrlTag, originalUrl: item.logoUrlTag, name: 'Size Tag Print', width: 2.5, height: 2.5, quantity: totalQty });
           }

           return {
              id: item.instanceId || Date.now().toString(),
              itemType: 'garment',
              style: item.style || 'Custom Garment',
              color: item.selectedColor || '',
              price: Math.round(p * 100) / 100,
              total: Math.round(p * totalQty * 100) / 100,
              itemNum: item.itemNum || '',
              gender: item.gender || 'Unisex',
              qty: totalQty,
              image: item.customized ? item.image : (item.images?.[item.selectedColor] || item.image || ''),
              notes: item.logoPlacement ? `Mockup Placement: ${item.logoPlacement}` : '',
              sizes: item.quantities,
              artworks: artworks,
              customized: item.customized || false,
              logoPlacement: item.logoPlacement || '',
              logoUrl: item.logoUrl || null,
              logoName: item.logoName || null,
              logoUrlBack: item.logoUrlBack || null,
              logoNameBack: item.logoNameBack || null,
              logoUrlLeftSleeve: item.logoUrlLeftSleeve || null,
              logoNameLeftSleeve: item.logoNameLeftSleeve || null,
              logoUrlRightSleeve: item.logoUrlRightSleeve || null,
              logoNameRightSleeve: item.logoNameRightSleeve || null,
              customScaleFront: item.customScaleFront ?? null,
              customOffsetXFront: item.customOffsetXFront ?? null,
              customOffsetYFront: item.customOffsetYFront ?? null,
              customRotationFront: item.customRotationFront ?? null,
              customScaleBack: item.customScaleBack ?? null,
              customOffsetXBack: item.customOffsetXBack ?? null,
              customOffsetYBack: item.customOffsetYBack ?? null,
              customRotationBack: item.customRotationBack ?? null,
              customScaleLeftSleeve: item.customScaleLeftSleeve ?? null,
              customOffsetXLeftSleeve: item.customOffsetXLeftSleeve ?? null,
              customOffsetYLeftSleeve: item.customOffsetYLeftSleeve ?? null,
              customRotationLeftSleeve: item.customRotationLeftSleeve ?? null,
              customScaleRightSleeve: item.customScaleRightSleeve ?? null,
              customOffsetXRightSleeve: item.customOffsetXRightSleeve ?? null,
              customOffsetYRightSleeve: item.customOffsetYRightSleeve ?? null,
              customRotationRightSleeve: item.customRotationRightSleeve ?? null,
              logoUrlTag: item.logoUrlTag || null,
              tagLayout: item.tagLayout || null,
              tagSizeX: item.tagSizeX ?? null,
              tagSizeY: item.tagSizeY ?? null,
              tagSizeScale: item.tagSizeScale ?? null,
              tagSizeFont: item.tagSizeFont ?? null,
              tagSizeColor: item.tagSizeColor ?? null,
              tagSizeBold: item.tagSizeBold ?? null,
              tagSizeItalic: item.tagSizeItalic ?? null,
            }
        })
      };

      await setDoc(doc(db, 'orders', orderId), payload);

      const cartKey = `wovn_reorder_cart_${customerId || 'CUS-001'}`;
      localStorage.removeItem(cartKey);
      window.dispatchEvent(new Event('wovn_cart_updated'));

      setShowSuccessModal(true);
    } catch (err) {
      console.error("Failed to submit order", err);
      alert("Failed to submit order. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuccessModalClose = async () => {
    if (customerId) {
      try {
        await setDoc(doc(db, 'customers', customerId), {
          emailOptIn: optInEmail,
          textOptIn: optInText
        }, { merge: true });
      } catch (err) {
        console.error("Failed to save opt-in preferences:", err);
      }
      navigate(`/portal/${customerId}`);
    } else {
      navigate('/portal');
    }
    setShowSuccessModal(false);
  };

  const handleAddItem = (item: any) => {
    // Determine dynamic size run specific to this garment
    const defaultSizes = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
    const itemSizes = item.sizes && item.sizes.length > 0 ? item.sizes : defaultSizes;
    
    // Create zeroed quantity map strictly from the provided sizes
    const qtyMap: any = {};
    itemSizes.forEach((s: string) => qtyMap[s] = 0);

    let defaultColor = item.selectedColor || item.colors?.[0] || 'Custom Color';
    if (!item.selectedColor && item.image && item.images) {
      const matchedColor = Object.keys(item.images).find(color => {
        const val = item.images[color];
        const imgUrl = typeof val === 'string' ? val : val?.front;
        return imgUrl === item.image;
      });
      if (matchedColor) {
        defaultColor = matchedColor;
      }
    }

    const newItem = {
      ...item,
      instanceId: Math.random().toString(36).substring(7),
      selectedColor: defaultColor,
      quantities: qtyMap
    };
    setOrderItems(prev => [...prev, newItem]);
    setCustomizingItem(newItem); // Open the customizer modal right away
    setIsCartOpen(false); // Ensure cart drawer is closed so customizer is visible
  };

  const handleSelectSanMarGarment = (product: any, initialColor: string) => {
    const swatchImg = product.images[initialColor];
    const swatchUrl = swatchImg ? (typeof swatchImg === 'string' ? swatchImg : swatchImg.front) : '';
    const image = swatchUrl || (Object.values(product.images)[0] as any)?.front || (Object.values(product.images)[0] as any) || '';
    
    const style = `${product.brand} ${product.title}`.trim();
    const itemNum = product.style;
    const colors = product.colors || ['Custom Color'];
    const sizes = parseSizesFromItem(product, product.style || '');
    const price = parseFloat(product.price || 0);
    const gender = 'Unisex';
    
    handleAddItem({
      style,
      itemNum,
      description: product.description || '',
      image,
      colors,
      sizes,
      price,
      gender,
      selectedColor: initialColor
    });
    
    setIsGarmentBrowserOpen(false);
  };

  const handleUpdateQuantity = (instanceId: string, size: string, qty: string) => {
    const parsedQty = parseInt(qty) || 0;
    setOrderItems(prev => prev.map(item => {
      if (item.instanceId === instanceId) {
        return {
          ...item,
          quantities: { ...item.quantities, [size]: parsedQty }
        };
      }
      return item;
    }));
  };

  const handleApplyPredefinedSizing = (item: any, type: 'roster' | 'standard', mode: 'overwrite' | 'add') => {
    if (type === 'roster' && (!customer?.teamRoster || customer.teamRoster.length === 0)) return;
    if (type === 'standard' && !customer?.standardOrder) return;

    // 1. Get spread map
    const spread: Record<string, number> = {};
    if (type === 'roster') {
      customer.teamRoster.forEach((member: any) => {
        const size = member.size.toUpperCase();
        spread[size] = (spread[size] || 0) + 1;
      });
    } else {
      // type === 'standard'
      Object.keys(customer.standardOrder).forEach(size => {
        const val = customer.standardOrder[size] || 0;
        if (val > 0) {
          spread[size.toUpperCase()] = val;
        }
      });
    }

    if (Object.keys(spread).length === 0) return;

    // 2. Identify youth sizes
    const youthSizes = ['YXS', 'YS', 'YM', 'YL', 'YXL'];
    const hasYouthSizes = Object.keys(spread).some(s => youthSizes.includes(s));

    // 3. Prepare quantities map
    const baseQuantities = { ...(item.quantities || {}) };
    if (hasYouthSizes) {
      youthSizes.forEach(s => {
        if (baseQuantities[s] === undefined) {
          baseQuantities[s] = 0;
        }
      });
    }

    const newQuantities = { ...baseQuantities };

    // Reset values if overwriting
    if (mode === 'overwrite') {
      Object.keys(newQuantities).forEach(k => {
        newQuantities[k] = 0;
      });
    }

    // 4. Apply spread counts
    const skippedSizes: string[] = [];
    Object.keys(spread).forEach(size => {
      if (newQuantities[size] !== undefined) {
        newQuantities[size] += spread[size];
      } else {
        let matched = false;
        const normalizedSize = size.trim();

        const keyMatch = Object.keys(newQuantities).find(k => {
          const kNorm = k.toUpperCase().trim();
          if (kNorm === normalizedSize) return true;
          if ((kNorm === '2XL' || kNorm === 'XXL') && (normalizedSize === '2XL' || normalizedSize === 'XXL')) return true;
          if ((kNorm === '3XL' || kNorm === 'XXXL') && (normalizedSize === '3XL' || normalizedSize === 'XXXL')) return true;
          if ((kNorm === '4XL' || kNorm === 'XXXXL') && (normalizedSize === '4XL' || normalizedSize === 'XXXXL')) return true;
          if ((kNorm === '5XL' || kNorm === 'XXXXXL') && (normalizedSize === '5XL' || normalizedSize === 'XXXXXL')) return true;
          return false;
        });

        if (keyMatch) {
          newQuantities[keyMatch] += spread[size];
          matched = true;
        }

        if (!matched) {
          skippedSizes.push(size);
        }
      }
    });

    // 5. Update state
    setOrderItems(prev => prev.map(o => {
      if (o.instanceId === item.instanceId) {
        const updatedSizes = Array.from(new Set([...(o.sizes || []), ...Object.keys(newQuantities)]));
        return {
          ...o,
          sizes: updatedSizes,
          quantities: newQuantities
        };
      }
      return o;
    }));

    setApplySizingItem(null);

    if (skippedSizes.length > 0) {
      alert(`Applied sizing template! However, some sizes were skipped because they are not available for this garment style: ${Array.from(new Set(skippedSizes)).join(', ')}`);
    }
  };

  const handleRemoveItem = (instanceId: string) => {
    const itemToRemove = orderItems.find(item => item.instanceId === instanceId);
    setOrderItems(prev => prev.filter(item => item.instanceId !== instanceId));

    if (itemToRemove) {
      const cartKey = `wovn_reorder_cart_${customerId || 'CUS-001'}`;
      try {
        const savedCart = JSON.parse(localStorage.getItem(cartKey) || '[]');
        const updatedCart = savedCart.filter((ci: any) => ci.id !== itemToRemove.id && ci.style !== itemToRemove.style);
        localStorage.setItem(cartKey, JSON.stringify(updatedCart));
        window.dispatchEvent(new Event('wovn_cart_updated'));
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleDuplicateItem = (item: any) => {
    const parsedSizes = parseSizesFromItem(item, item.style || '');
    const qtyMap: Record<string, number> = {};
    parsedSizes.forEach(s => {
      qtyMap[s] = 0;
    });

    const newItem = {
      instanceId: `item-${Date.now()}-${Math.random()}`,
      style: item.style,
      itemNum: item.itemNum,
      description: item.description || '',
      image: item.image,
      colors: item.colors || [],
      sizes: parsedSizes,
      price: item.price,
      gender: item.gender || 'Unisex',
      selectedColor: item.colors?.[0] || 'Custom Color',
      quantities: qtyMap,
      customized: false,
      logoUrl: null,
      logoName: null,
      logoUrlBack: null,
      logoNameBack: null,
      logoUrlLeftSleeve: null,
      logoNameLeftSleeve: null,
      logoUrlRightSleeve: null,
      logoNameRightSleeve: null,
      images: item.images || null
    };

    setOrderItems(prev => {
      const idx = prev.findIndex(o => o.instanceId === item.instanceId);
      if (idx !== -1) {
        const copy = [...prev];
        copy.splice(idx + 1, 0, newItem);
        return copy;
      }
      return [...prev, newItem];
    });
  };

  const getActiveSidesCount = (item: any) => {
    if (!item.customized) return 1;
    let count = 0;
    if (item.logoUrl) count++;
    if (item.logoUrlBack) count++;
    if (item.logoUrlLeftSleeve) count++;
    if (item.logoUrlRightSleeve) count++;
    if (item.logoUrlTag) count++;
    return count || 1;
  };

  return (
    <div className="max-w-[1200px] mx-auto w-full flex flex-col gap-8 animate-in fade-in zoom-in-95 duration-300 pb-20">
      {/* Header Area */}
      <div className="flex items-center justify-between mt-4">
        <button 
          onClick={handleBack}
          className="flex items-center gap-2 text-neutral-500 hover:text-black transition-colors font-medium text-sm group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          Back to Orders
        </button>

        <div className="flex items-center gap-4">
          {previousOrders.length > 0 && (
            <button 
              onClick={() => setIsRepeatModalOpen(true)}
              className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-neutral-500 hover:text-black hover:underline transition-colors cursor-pointer"
            >
              <RotateCcw size={12} />
              Repeat Past Order
            </button>
          )}

          {/* Cart Toggle Button */}
          <button 
            onClick={() => setIsCartOpen(true)}
            className="relative flex items-center gap-2 bg-black hover:bg-neutral-800 text-white px-5 py-2.5 rounded-full text-xs font-bold shadow-md transition-all cursor-pointer select-none"
          >
            <ShoppingCart size={14} />
            <span>View Cart</span>
            {orderItems.length > 0 && (
              <span className="bg-emerald-500 text-white text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center border border-black animate-scale-in ml-1">
                {orderItems.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-serif text-neutral-900 tracking-tight flex items-center gap-4">
          Create New Quote Request
        </h1>
        <p className="text-neutral-500 font-medium text-sm max-w-xl leading-relaxed">
          Select garments, upload artwork, and construct your request. We'll generate mockups for your review.
        </p>
      </div>

      {/* Main Full Screen Catalog Selector */}
      <div data-tour="catalog-grid" className="bg-white rounded-3xl p-8 shadow-[0_4px_24px_rgb(0,0,0,0.02)] border border-neutral-100 flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-serif text-neutral-900">Your Catalog</h3>
            <p className="text-sm font-medium text-neutral-500 mt-1">Select from your approved collection, suggested, or past styles to begin building your order.</p>
          </div>
        </div>

        {/* Library Tabs */}
        <div className="flex gap-4 border-b border-neutral-100 py-3 overflow-x-auto shrink-0 bg-neutral-50/50 px-4 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveLibraryTab('rack')}
            className={`text-sm font-bold pb-1.5 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
              activeLibraryTab === 'rack' 
                ? 'text-black border-black' 
                : 'text-neutral-400 border-transparent hover:text-black hover:border-black'
            }`}
          >
            Design Your Rack ({activeRackItems.length})
          </button>
          {hasWovnRack && (
            <button
              type="button"
              onClick={() => setActiveLibraryTab('wovn')}
              className={`text-sm font-bold pb-1.5 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                activeLibraryTab === 'wovn' 
                  ? 'text-black border-black' 
                  : 'text-neutral-400 border-transparent hover:text-black hover:border-black'
              }`}
            >
              WOVN Catalog ({customerDecks.reduce((acc, deck) => acc + (deck.items || deck.garments || []).length, 0)})
            </button>
          )}
          {suggestedItems.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveLibraryTab('suggested')}
              className={`text-sm font-bold pb-1.5 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                activeLibraryTab === 'suggested' 
                  ? 'text-black border-black' 
                  : 'text-neutral-450 hover:text-black hover:border-black border-transparent'
              }`}
            >
              Suggested ({suggestedItems.length})
            </button>
          )}
          {sampleItems.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveLibraryTab('samples')}
              className={`text-sm font-bold pb-1.5 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                activeLibraryTab === 'samples' 
                  ? 'text-black border-black' 
                  : 'text-neutral-450 hover:text-black hover:border-black border-transparent'
              }`}
            >
              Sample Items ({sampleItems.length})
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveLibraryTab('past')}
            className={`text-sm font-bold pb-1.5 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
              activeLibraryTab === 'past' 
                ? 'text-black border-black' 
                : 'text-neutral-400 border-transparent hover:text-black hover:border-black'
            }`}
          >
            Past Garments ({pastGarments.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveLibraryTab('saved')}
            className={`text-sm font-bold pb-1.5 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
              activeLibraryTab === 'saved' 
                ? 'text-black border-black' 
                : 'text-neutral-400 border-transparent hover:text-black hover:border-black'
            }`}
          >
            Saved Carts ({savedCarts.length})
          </button>
        </div>

        {activeLibraryTab === 'rack' && (
          <div className="flex flex-wrap gap-2 pb-2 border-b border-neutral-100">
            {Object.keys(customerRacks).map((catName) => (
              <button
                key={catName}
                type="button"
                onClick={() => setActiveRackCategory(catName)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  activeRackCategory === catName
                    ? 'bg-black text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {catName}
              </button>
            ))}
          </div>
        )}

        {/* Library Grid Content */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {activeLibraryTab === 'rack' && (
            activeRackItems.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center p-8 text-center text-neutral-500 min-h-[200px]">
                <PackagePlus size={32} className="mb-4 text-neutral-300" />
                <p>No garments configured for this category.</p>
              </div>
            ) : (
              activeRackItems.map((item: any, idx: number) => {
                const style = item.customName || item.title || item.style || 'Custom Garment';
                const gender = item.gender || 'Unisex';
                const itemNum = item.style;
                const colors = item.colors || ['Custom Color'];
                const sizes = parseSizesFromItem(item, item.style || '');
                const image = getGarmentImage(item);
                const price = parseFloat(item.price || 0);

                return (
                  <div 
                    key={item.id || idx} 
                    onClick={() => handleAddItem({ ...item, style, gender, itemNum, colors, sizes, image, price })}
                    className="group bg-white hover:bg-neutral-50/50 border border-neutral-200 hover:border-neutral-450 rounded-3xl p-5 flex flex-col items-center justify-between cursor-pointer transition-all hover:shadow-md relative"
                  >
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedImage({ src: image, alt: style });
                      }}
                      className="w-full h-64 flex items-center justify-center mb-3 relative cursor-zoom-in"
                      title="Click to expand mockup"
                    >
                      <img 
                        src={image} 
                        alt={style} 
                        className="max-w-full max-h-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform duration-300" 
                      />
                    </div>
                    <div className="w-full flex flex-col items-center">
                      <div className="flex items-center justify-center gap-2 mb-1 w-full">
                        <h4 className="font-bold text-neutral-900 text-sm truncate max-w-[80%] text-center">{style}</h4>
                        <span className="text-[9px] font-bold text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-full shrink-0">{gender}</span>
                      </div>
                      {(() => {
                        const desc = item.customSpecs?.description !== undefined ? item.customSpecs.description : item.description;
                        if (!desc) return null;
                        return (
                          <p className="text-[10px] text-neutral-500 font-semibold mt-0.5 text-center line-clamp-2" title={desc}>
                            {desc}
                          </p>
                        );
                      })()}
                      <p className="text-[10px] text-neutral-400 font-medium mt-1 truncate w-full text-center">{colors.join(' • ')}</p>
                    </div>
                    <span className="text-xs font-bold text-neutral-800 bg-neutral-100 group-hover:bg-black group-hover:text-white px-4 py-2 rounded-xl transition-all mt-4 w-full text-center">+ Add to Request</span>
                  </div>
                );
              })
            )
          )}

          {activeLibraryTab === 'wovn' && (
            isLoadingDecks ? (
              <div className="col-span-full flex items-center justify-center p-8">
                <Loader2 className="animate-spin text-neutral-400" size={24} />
              </div>
            ) : customerDecks.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center p-8 text-center text-neutral-500 min-h-[200px]">
                <PackagePlus size={32} className="mb-4 text-neutral-300" />
                <p>No catalog decks connected for this client.</p>
              </div>
            ) : (
              (() => {
                const flatGarments = customerDecks.reduce((acc: any[], deck: any) => {
                  const items = deck.items || deck.garments || [];
                  return [...acc, ...items];
                }, []);
                if (flatGarments.length === 0) {
                  return (
                    <div className="col-span-full flex flex-col items-center justify-center p-8 text-center text-neutral-500 min-h-[200px]">
                      <PackagePlus size={32} className="mb-4 text-neutral-300" />
                      <p>No catalog garments found in connected decks.</p>
                    </div>
                  );
                }
                return flatGarments.map((item: any, idx: number) => {
                  const style = item.garment_name || item.name || item.style || item.title || 'Unknown Style';
                  const gender = item.gender || 'Unisex';
                  const itemNum = item.itemNum || item.garment_id || item.sku || item.id || `GARMENT-${idx+1}`;
                  let colors = findColorsInObj({ ...item }) || ['Custom Color'];
                  if (colors.length === 0) colors = ['Custom Color'];
                  let sizes = parseSizesFromItem(item, style);
                  const image = item.mockup_image || item.mock_image || item.original_image || item.image || item.imageUrl || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';
                  const price = parseFloat(item.msrp || item.price || item.unit_cost || 0);

                  return (
                    <div 
                      key={item.id || idx} 
                      onClick={() => handleAddItem({ ...item, style, gender, itemNum, colors, sizes, image, price })}
                      className="group bg-white hover:bg-neutral-50/50 border border-neutral-200 hover:border-neutral-450 rounded-3xl p-5 flex flex-col items-center justify-between cursor-pointer transition-all hover:shadow-md relative"
                    >
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedImage({ src: image, alt: style });
                        }}
                        className="w-full h-64 flex items-center justify-center mb-3 relative cursor-zoom-in"
                        title="Click to expand mockup"
                      >
                        <img 
                          src={image} 
                          alt={style} 
                          className="max-w-full max-h-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform duration-300" 
                        />
                      </div>
                      <div className="w-full flex flex-col items-center">
                        <div className="flex items-center justify-center gap-2 mb-1 w-full">
                          <h4 className="font-bold text-neutral-900 text-sm truncate max-w-[85%] text-center">{style}</h4>
                        </div>
                        <p className="text-[10px] text-neutral-400 font-medium mt-1 truncate w-full text-center">{colors.join(' • ')}</p>
                      </div>
                      <span className="text-xs font-bold text-neutral-800 bg-neutral-100 group-hover:bg-black group-hover:text-white px-4 py-2 rounded-xl transition-all mt-4 w-full text-center">+ Add to Request</span>
                    </div>
                  );
                });
              })()
            )
          )}

          {activeLibraryTab === 'suggested' && (
            suggestedItems.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center p-8 text-center text-neutral-500 min-h-[200px]">
                <PackagePlus size={32} className="mb-4 text-neutral-300" />
                <p>No suggested items recommendation found.</p>
              </div>
            ) : (
              suggestedItems.map((item: any, idx: number) => {
                const style = item.style || item.title || 'Suggested Style';
                const gender = item.gender || 'Unisex';
                const itemNum = item.itemNum || item.style;
                const colors = item.colors || ['Custom Color'];
                const sizes = parseSizesFromItem(item, item.style || '');
                const image = item.image || item.mockup_image || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';
                const price = parseFloat(item.price || 0);

                return (
                  <div 
                    key={item.id || idx} 
                    onClick={() => handleAddItem({ ...item, style, gender, itemNum, colors, sizes, image, price })}
                    className="group bg-white hover:bg-neutral-50/50 border border-neutral-200 hover:border-neutral-450 rounded-3xl p-5 flex flex-col items-center justify-between cursor-pointer transition-all hover:shadow-md relative"
                  >
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedImage({ src: image, alt: style });
                      }}
                      className="w-full h-64 flex items-center justify-center mb-3 relative cursor-zoom-in"
                      title="Click to expand mockup"
                    >
                      <img 
                        src={image} 
                        alt={style} 
                        className="max-w-full max-h-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform duration-300" 
                      />
                    </div>
                    <div className="w-full flex flex-col items-center">
                      <div className="flex items-center justify-center gap-2 mb-1 w-full">
                        <h4 className="font-bold text-neutral-900 text-sm truncate max-w-[80%] text-center">{style}</h4>
                        <span className="text-[9px] font-bold text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-full shrink-0">{gender}</span>
                      </div>
                      <p className="text-[10px] text-neutral-400 font-medium mt-1 truncate w-full text-center">{colors.join(' • ')}</p>
                    </div>
                    <span className="text-xs font-bold text-neutral-800 bg-neutral-100 group-hover:bg-black group-hover:text-white px-4 py-2 rounded-xl transition-all mt-4 w-full text-center">+ Add to Request</span>
                  </div>
                );
              })
            )
          )}

          {activeLibraryTab === 'samples' && (
            sampleItems.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center p-8 text-center text-neutral-500 min-h-[200px]">
                <PackagePlus size={32} className="mb-4 text-neutral-300" />
                <p>No sample items found.</p>
              </div>
            ) : (
              sampleItems.map((item: any, idx: number) => {
                const style = item.style || item.title || 'Sample Style';
                const gender = item.gender || 'Unisex';
                const itemNum = item.itemNum || item.style;
                const colors = item.colors || ['Custom Color'];
                const sizes = parseSizesFromItem(item, item.style || '');
                const image = item.image || item.mockup_image || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';
                const price = parseFloat(item.price || 0);

                return (
                  <div 
                    key={item.id || idx} 
                    onClick={() => handleAddItem({ ...item, style, gender, itemNum, colors, sizes, image, price })}
                    className="group bg-white hover:bg-neutral-50/50 border border-neutral-200 hover:border-neutral-450 rounded-3xl p-5 flex flex-col items-center justify-between cursor-pointer transition-all hover:shadow-md relative"
                  >
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedImage({ src: image, alt: style });
                      }}
                      className="w-full h-64 flex items-center justify-center mb-3 relative cursor-zoom-in"
                      title="Click to expand mockup"
                    >
                      <img 
                        src={image} 
                        alt={style} 
                        className="max-w-full max-h-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform duration-300" 
                      />
                    </div>
                    <div className="w-full flex flex-col items-center">
                      <div className="flex items-center justify-center gap-2 mb-1 w-full">
                        <h4 className="font-bold text-neutral-900 text-sm truncate max-w-[80%] text-center">{style}</h4>
                        <span className="text-[9px] font-bold text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-full shrink-0">{gender}</span>
                      </div>
                      <p className="text-[10px] text-neutral-400 font-medium mt-1 truncate w-full text-center">{colors.join(' • ')}</p>
                    </div>
                    <span className="text-xs font-bold text-neutral-800 bg-neutral-100 group-hover:bg-black group-hover:text-white px-4 py-2 rounded-xl transition-all mt-4 w-full text-center">+ Add to Request</span>
                  </div>
                );
              })
            )
          )}

          {activeLibraryTab === 'past' && (
            pastGarments.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center p-8 text-center text-neutral-500 min-h-[200px]">
                <PackagePlus size={32} className="mb-4 text-neutral-300" />
                <p>No past orders found to pull items from.</p>
              </div>
            ) : (
              pastGarments.map((item: any, idx: number) => {
                const style = item.style || item.title || 'Past Style';
                const gender = item.gender || 'Unisex';
                const itemNum = item.itemNum || item.style;
                const colors = item.colors || ['Custom Color'];
                const sizes = parseSizesFromItem(item, item.style || '');
                const image = item.image || item.mockup_image || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';
                const price = parseFloat(item.price || 0);

                return (
                  <div 
                    key={item.id || idx} 
                    onClick={() => handleAddItem({ ...item, style, gender, itemNum, colors, sizes, image, price })}
                    className="group bg-white hover:bg-neutral-50/50 border border-neutral-200 hover:border-neutral-455 rounded-3xl p-5 flex flex-col items-center justify-between cursor-pointer transition-all hover:shadow-md relative"
                  >
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedImage({ src: image, alt: style });
                      }}
                      className="w-full h-64 flex items-center justify-center mb-3 relative cursor-zoom-in"
                      title="Click to expand mockup"
                    >
                      <img 
                        src={image} 
                        alt={style} 
                        className="max-w-full max-h-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform duration-300" 
                      />
                    </div>
                    <div className="w-full flex flex-col items-center">
                      <div className="flex items-center justify-center gap-2 mb-1 w-full">
                        <h4 className="font-bold text-neutral-900 text-sm truncate max-w-[80%] text-center">{style}</h4>
                        <span className="text-[9px] font-bold text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-full shrink-0">{gender}</span>
                      </div>
                      <p className="text-[10px] text-neutral-400 font-medium mt-1 truncate w-full text-center">{colors.join(' • ')}</p>
                    </div>
                    <span className="text-xs font-bold text-neutral-800 bg-neutral-100 group-hover:bg-black group-hover:text-white px-4 py-2 rounded-xl transition-all mt-4 w-full text-center">+ Add to Request</span>
                  </div>
                );
              })
            )
          )}

          {activeLibraryTab === 'saved' && (
            <div className="col-span-full flex flex-col gap-4">
              {isLoadingSavedCarts ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="animate-spin text-neutral-400" size={24} />
                </div>
              ) : savedCarts.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-neutral-500 bg-neutral-50/50 border border-neutral-200 border-dashed rounded-3xl min-h-[200px] w-full">
                  <Save size={32} className="mb-4 text-neutral-300" />
                  <p className="font-semibold text-sm text-neutral-600">No saved carts yet.</p>
                  <p className="text-xs text-neutral-400 mt-1 max-w-sm">Add items to your cart, then click "Save Cart for Later" to preserve your potential order.</p>
                </div>
              ) : (
                savedCarts.map((cartItem) => {
                  const totalQuantity = (cartItem.items || []).reduce((acc: number, it: any) => {
                    return acc + Object.values(it.quantities || {}).reduce((sum: number, q: any) => sum + (Number(q) || 0), 0);
                  }, 0);

                  return (
                    <div key={cartItem.id} className="bg-neutral-50/50 border border-neutral-200 hover:border-neutral-300 transition-all rounded-2xl p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 w-full animate-in fade-in duration-350">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-neutral-900 text-sm truncate">{cartItem.name}</h4>
                        <div className="flex items-center gap-3 text-[10px] text-neutral-400 font-medium mt-1">
                          <span>{new Date(cartItem.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          <span>•</span>
                          <span>{cartItem.items?.length || 0} styles ({totalQuantity} garments total)</span>
                          <span>•</span>
                          <span>Saved by {cartItem.createdBy}</span>
                        </div>
                        
                        <div className="mt-4 flex flex-col gap-2 max-w-xl">
                          {(cartItem.items || []).map((it: any, idx: number) => {
                            const qty = Object.values(it.quantities || {}).reduce((sum: number, q: any) => sum + (Number(q) || 0), 0);
                            const itImage = it.image || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';
                            return (
                              <div key={idx} className="flex items-center gap-3 bg-white border border-neutral-100 rounded-xl p-2 shadow-sm">
                                <div className="w-8 h-8 rounded-lg bg-neutral-50 border border-neutral-100 flex items-center justify-center p-0.5 shrink-0">
                                  <img src={itImage} alt="" className="w-full h-full object-contain mix-blend-multiply" />
                                </div>
                                <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
                                  <div>
                                    <p className="text-xs font-bold text-neutral-800 truncate">{it.style}</p>
                                    <p className="text-[10px] text-neutral-500 font-semibold truncate">Color: {it.selectedColor || 'Default'}</p>
                                  </div>
                                  <span className="text-[11px] font-extrabold text-neutral-600 bg-neutral-50 px-2 py-0.5 rounded-md border border-neutral-100 shrink-0">
                                    {qty} pcs
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleLoadSavedCart(cartItem)}
                          className="bg-black hover:bg-neutral-800 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-sm cursor-pointer"
                        >
                          Load Cart
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSavedCart(cartItem.id, cartItem.name)}
                          className="p-2 text-neutral-450 hover:text-red-650 hover:bg-red-50 rounded-xl transition-all cursor-pointer border border-transparent hover:border-red-100"
                          title="Delete saved cart"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Slide-out Cart Drawer */}
      {isCartOpen && (
        <>
          <div 
            onClick={() => setIsCartOpen(false)}
            className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm animate-in fade-in duration-200 cursor-pointer"
          />
          <div className="fixed top-0 right-0 z-50 w-full max-w-[650px] h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="px-6 py-5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50 shrink-0">
              <div>
                <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
                  <ShoppingCart size={20} className="text-neutral-700" />
                  Your Cart
                </h2>
                <p className="text-xs font-medium text-neutral-505 mt-1">Review selected garments, sizes, quantities, and upload artwork</p>
              </div>
              <button 
                onClick={() => setIsCartOpen(false)}
                className="w-9 h-9 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-505 hover:text-black hover:border-black transition-colors shadow-sm cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              {orderItems.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-neutral-500 min-h-[300px]">
                  <ShoppingCart size={48} className="mb-4 text-neutral-300 animate-pulse" />
                  <p className="font-bold text-neutral-800">Your cart is currently empty</p>
                  <p className="text-xs mt-1 text-neutral-505 font-medium">Choose garments from the catalog on the main page to get started.</p>
                  <button
                    onClick={() => setIsCartOpen(false)}
                    className="mt-6 bg-black hover:bg-neutral-800 text-white text-xs font-bold px-6 py-3 rounded-full transition-all shadow-md cursor-pointer hover:scale-105 active:scale-95 duration-200"
                  >
                    Browse Catalog
                  </button>
                </div>
              ) : (
                <>
                  {/* Cart Items Section */}
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-extrabold uppercase tracking-widest text-neutral-400">Garments in Cart ({orderItems.length})</h3>
                      <button
                        onClick={() => setIsCartOpen(false)}
                        className="text-xs font-bold text-neutral-505 hover:text-black transition-colors"
                      >
                        + Add More
                      </button>
                    </div>
                    {orderItems.map((item) => (
                      <div key={item.instanceId} className="bg-white border border-neutral-200 rounded-2xl p-4 flex flex-col gap-4 shadow-[0_2px_10px_rgb(0,0,0,0.01)] relative">
                        {/* Cart Item Header */}
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex gap-4 items-center min-w-0">
                            {(() => {
                              const N = getActiveSidesCount(item);
                              const isHovered = hoveredItemId === item.instanceId;
                              const translatePercentage = isHovered && N > 1 ? (100 / N) : 0;
                              const getPreviewUrl = () => {
                                if (item.customized) return item.image;
                                const colorVal = item.images?.[item.selectedColor];
                                if (!colorVal) return item.image;
                                if (typeof colorVal === 'string') return colorVal;
                                return colorVal.front || colorVal.swatch || colorVal.back || item.image;
                              };
                              const srcUrl = getPreviewUrl();
                              return (
                                <div 
                                  onClick={() => setPreviewImageUrl(srcUrl)}
                                  onMouseEnter={() => setHoveredItemId(item.instanceId)}
                                  onMouseLeave={() => setHoveredItemId(null)}
                                  className={`w-16 h-16 rounded-xl overflow-hidden bg-neutral-50 border border-neutral-100 shrink-0 cursor-pointer flex items-center relative group ${
                                    item.customized ? 'justify-start' : 'justify-center'
                                  }`}
                                  title="Hover to slide mockup, click to view full screen"
                                >
                                  <img 
                                    src={srcUrl} 
                                    alt={item.style} 
                                    style={{
                                      width: item.customized ? `${N * 100}%` : '100%',
                                      height: '100%',
                                      maxWidth: 'none',
                                      transform: item.customized ? `translateX(-${translatePercentage}%)` : 'none',
                                      transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                                    }}
                                    className={`${item.customized ? 'object-cover' : 'object-contain'} mix-blend-multiply select-none p-1`}
                                  />
                                </div>
                              );
                            })()}
                            <div className="min-w-0">
                              <h4 className="font-bold text-neutral-900 text-sm truncate">{item.style}</h4>
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-[10px] uppercase font-bold text-neutral-450">Color</span>
                                <div className="relative min-w-[140px]">
                                  <select 
                                    value={item.selectedColor || ''}
                                    onChange={(e) => {
                                      const newCol = e.target.value;
                                      setOrderItems(prev => prev.map(o => o.instanceId === item.instanceId ? { ...o, selectedColor: newCol } : o));
                                    }}
                                    className="w-full appearance-none bg-neutral-50 border border-neutral-200 rounded-lg px-2 py-0.5 text-xs font-semibold text-neutral-800 focus:outline-none focus:border-neutral-450 cursor-pointer pr-6"
                                  >
                                    {item.colors?.map((c: string) => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                  <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" size={10} />
                                </div>
                              </div>
                              {(() => {
                                const activePlacements = [];
                                if (item.logoUrl) activePlacements.push("Front");
                                if (item.logoUrlBack) activePlacements.push("Back");
                                if (item.logoUrlLeftSleeve) activePlacements.push("Left Sleeve");
                                if (item.logoUrlRightSleeve) activePlacements.push("Right Sleeve");
                                if (item.logoUrlTag) activePlacements.push("Size Tag");
                                const count = activePlacements.length;
                                return (
                                  <div className="flex flex-col gap-1.5 mt-1.5">
                                    <p className="text-[10px] font-semibold text-neutral-500">
                                      Placements ({count}): {count > 0 ? activePlacements.join(', ') : 'None'}
                                    </p>
                                    <button
                                      type="button"
                                      data-tour="customize-btn"
                                      onClick={() => setCustomizingItem(item)}
                                      className="flex items-center gap-1.5 bg-black hover:bg-neutral-800 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all shadow-xs w-fit cursor-pointer select-none"
                                    >
                                      <Sparkles size={11} className="text-emerald-400" />
                                      <span>{item.customized ? "Adjust Saved Mockup" : "Customize Placements & Artwork"}</span>
                                    </button>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleDuplicateItem(item)}
                              className="p-1.5 text-neutral-450 hover:text-black hover:bg-neutral-100 rounded-lg transition-all cursor-pointer"
                              title="Add another color/design variation of this item"
                            >
                              <Copy size={13} />
                            </button>
                            <button 
                              onClick={() => handleRemoveItem(item.instanceId)}
                              className="p-1.5 text-neutral-450 hover:text-red-500 transition-all cursor-pointer"
                              title="Remove item"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Sizing inputs */}
                        <div className="bg-neutral-50 rounded-xl p-3 flex flex-col items-start border border-neutral-200/60 gap-2">
                          <div className="flex justify-between items-center w-full">
                            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Quantities</span>
                            <div className="flex items-center gap-1.5">
                              {customer?.teamRoster && customer.teamRoster.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setApplySizingItem({ item, type: 'roster' })}
                                  className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 hover:text-emerald-700 bg-emerald-50 border border-emerald-250 hover:border-emerald-350 px-2.5 py-0.5 rounded-full transition-all cursor-pointer flex items-center gap-1"
                                >
                                  <Users size={10} /> Apply Roster ({customer.teamRoster.length})
                                </button>
                              )}
                              {customer?.standardOrder && Object.values(customer.standardOrder).some(v => (v as number) > 0) && (
                                <button
                                  type="button"
                                  onClick={() => setApplySizingItem({ item, type: 'standard' })}
                                  className="text-[9px] font-bold uppercase tracking-wider text-blue-600 hover:text-blue-700 bg-blue-50 border border-blue-200 hover:border-blue-350 px-2.5 py-0.5 rounded-full transition-all cursor-pointer flex items-center gap-1"
                                >
                                  Apply Standard
                                </button>
                              )}
                              <button
                                type="button"
                                data-tour="add-youth-sizing-btn"
                                onClick={() => {
                                  const youthSizes = { 'YXS': 0, 'YS': 0, 'YM': 0, 'YL': 0, 'YXL': 0 };
                                  setOrderItems(prev => prev.map(o => o.instanceId === item.instanceId ? {
                                    ...o,
                                    quantities: { ...youthSizes, ...(o.quantities || {}) }
                                  } : o));
                                }}
                                className="text-[9px] font-bold uppercase tracking-wider text-neutral-500 hover:text-black bg-white border border-neutral-200 hover:border-neutral-450 px-2 py-0.5 rounded-full transition-all cursor-pointer"
                              >
                                + Youth Sizing
                              </button>
                            </div>
                          </div>
                          <div data-tour="sizing-matrix" className="flex flex-wrap gap-1.5 w-full">
                            {Object.keys(item.quantities).sort(sortSizes).map((size) => (
                              <div key={size} className="flex-1 min-w-[45px] flex flex-col bg-white border border-neutral-200 rounded-lg overflow-hidden focus-within:border-black focus-within:ring-1 focus-within:ring-black transition-all">
                                <div className="bg-neutral-50 text-neutral-505 text-[9px] font-bold py-1 uppercase tracking-wide flex items-center justify-center border-b border-neutral-200">
                                  {size}
                                </div>
                                <input 
                                  type="number"
                                  min="0"
                                  value={item.quantities[size] || ''}
                                  placeholder="0"
                                  onChange={(e) => handleUpdateQuantity(item.instanceId, size, e.target.value)}
                                  className="w-full h-8 text-center text-xs font-bold text-neutral-900 focus:outline-none placeholder:text-neutral-350 font-semibold"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Checkout Form Details */}
                  <div className="border-t border-neutral-100 pt-6 flex flex-col gap-5">
                    <h3 className="text-xs font-extrabold uppercase tracking-widest text-neutral-400">Order Details</h3>
                    
                    {/* Delivery Options */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider pl-1">Delivery Option</label>
                      <div className="grid grid-cols-2 gap-2 bg-neutral-100 p-1 rounded-xl border border-neutral-200">
                        {['Local Delivery', 'Shipping'].map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setDeliveryOption(opt)}
                            className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              deliveryOption === opt
                                ? 'bg-white text-black shadow-xs'
                                : 'text-neutral-500 hover:text-black'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Delivery Option details or Address input */}
                    <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 flex flex-col gap-3">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-600">
                        {deliveryOption === 'Local Delivery' ? 'Delivery Address' : 'Shipping Address'}
                      </span>
                      <div className="flex flex-col gap-2.5">
                        <input
                          ref={addressInputRef}
                          type="text"
                          placeholder="Street Address"
                          value={profileStreet}
                          onChange={(e) => setProfileStreet(e.target.value)}
                          className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-black transition-all"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            type="text"
                            placeholder="City"
                            value={profileCity}
                            onChange={(e) => setProfileCity(e.target.value)}
                            className="col-span-1 w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-black transition-all"
                          />
                          <input
                            type="text"
                            placeholder="State"
                            value={profileState}
                            onChange={(e) => setProfileState(e.target.value)}
                            className="col-span-1 w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-black transition-all"
                          />
                          <input
                            type="text"
                            placeholder="ZIP"
                            value={profileZip}
                            onChange={(e) => setProfileZip(e.target.value)}
                            className="col-span-1 w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-black transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Resale Certificate for Wholesale */}
                    <div className="flex flex-col gap-2">
                      {/* Order Type Selection */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider pl-1">Order Type</label>
                        <div className="grid grid-cols-2 gap-2 bg-neutral-100 p-1 rounded-xl border border-neutral-200">
                          {['Retail', 'Wholesale'].map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => setOrderType(type as any)}
                              className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                orderType === type
                                  ? 'bg-white text-black shadow-xs'
                                  : 'text-neutral-500 hover:text-black'
                              }`}
                            >
                              {type}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      {orderType === 'Wholesale' && (
                        <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Resale Certificate (Tax Exemption)</span>
                            <label className="bg-black hover:bg-neutral-800 text-white text-[9px] font-bold px-2 py-1 rounded-lg cursor-pointer transition-colors flex items-center gap-1">
                              <input 
                                type="file" 
                                className="hidden" 
                                accept=".pdf,.png,.jpg,.jpeg,.svg"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file || !customerId) return;
                                  setIsUploadingResaleCert(true);
                                  try {
                                    const storageRef = ref(storage, `customers/${customerId}/resale_certificates/${Date.now()}_${file.name}`);
                                    await uploadBytes(storageRef, file);
                                    const downloadUrl = await getDownloadURL(storageRef);
                                    setResaleCertificateUrl(downloadUrl);
                                    setResaleCertificateName(file.name);
                                  } catch (err) {
                                    console.error("Resale certificate upload failed:", err);
                                    alert("Failed to upload resale certificate.");
                                  } finally {
                                    setIsUploadingResaleCert(false);
                                  }
                                }} 
                              />
                              <Upload size={8} /> Upload File
                            </label>
                          </div>
                          {isUploadingResaleCert ? (
                            <div className="flex items-center gap-1 text-[9px] text-neutral-550 font-semibold">
                              <Loader2 className="animate-spin" size={8} /> Uploading...
                            </div>
                          ) : resaleCertificateUrl ? (
                            <div className="text-[9px] text-emerald-600 font-bold bg-white border border-emerald-100 rounded-lg p-1.5 flex items-center justify-between">
                              <span className="truncate max-w-[120px]">{resaleCertificateName}</span>
                              <button 
                                type="button" 
                                onClick={() => {
                                  setResaleCertificateUrl(null);
                                  setResaleCertificateName(null);
                                }}
                                className="text-neutral-400 hover:text-red-500"
                              >
                                <X size={8} />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[9px] text-neutral-400 italic leading-snug">Upload resale certificate to waive sales tax.</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Special Requests */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider pl-1">Special Requests & Comments</label>
                      <textarea
                        value={specialRequests}
                        onChange={(e) => setSpecialRequests(e.target.value)}
                        placeholder="Add any specific requirements, sizing details..."
                        className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-xs font-semibold text-neutral-800 focus:outline-none focus:border-black transition-all h-16 resize-none"
                      />
                    </div>
                  </div>

                  {/* Summary & Buttons (Sticky/Fixed at bottom of Drawer) */}
                  <div className="border-t border-neutral-100 pt-4 mt-auto flex flex-col gap-3 shrink-0">
                    <div className="flex justify-between items-center text-xs font-bold text-neutral-500">
                      <span>Total Styles Selected</span>
                      <span>{orderItems.length} styles</span>
                    </div>

                    {hasLowQuantityItems && (
                      <div className="text-[9px] text-red-655 bg-red-50/55 border border-red-100 rounded-xl p-3 flex flex-col gap-0.5 leading-snug animate-in fade-in duration-300">
                        <span className="font-extrabold">⚠️ Order Minimum Requirement</span>
                        <span className="font-medium text-neutral-550">Minimum 20 garments per style is required to submit a quote request.</span>
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      <button 
                        data-tour="quote-submit"
                        onClick={handleSubmitOrder}
                        disabled={hasLowQuantityItems || isSubmitting} 
                        className={`w-full py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm duration-200 ${
                          hasLowQuantityItems || isSubmitting
                            ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed shadow-none'
                            : 'bg-black text-white hover:bg-neutral-900 hover:scale-[1.01] active:scale-[0.99] cursor-pointer'
                        }`}
                      >
                        {isSubmitting ? 'Submitting...' : 'Submit Quote Request'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowSaveCartModal(true)}
                        className="w-full py-2.5 rounded-xl text-[10px] font-bold bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 shadow-sm transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Save size={12} /> Save Cart for Later
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
      {isRepeatModalOpen && (
        <>
          <div 
            onClick={() => setIsRepeatModalOpen(false)}
            className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm animate-in fade-in duration-200 cursor-pointer"
          />
          <div className="fixed top-0 right-0 z-50 w-full max-w-[500px] h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            
            {/* Drawer Header */}
            <div className="px-8 py-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
              <div>
                <h2 className="text-xl font-serif text-neutral-900">Repeat Previous Order</h2>
                <p className="text-sm font-medium text-neutral-500 mt-1">Select a past order to copy its garments and quantities.</p>
              </div>
              <button 
                onClick={() => setIsRepeatModalOpen(false)}
                className="w-10 h-10 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-500 hover:text-black hover:border-black transition-colors shadow-sm"
              >
                <X size={20} />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-4">
              {isLoadingPreviousOrders ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="animate-spin w-8 h-8 text-black" />
                </div>
              ) : previousOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-neutral-500">
                  <RotateCcw size={32} className="mb-4 text-neutral-300 animate-pulse" />
                  <p className="font-bold text-neutral-800">No previous orders found</p>
                  <p className="text-xs mt-1 text-neutral-500">Place your first order to enable repeating.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {previousOrders.map((prevOrder) => {
                    const totalQty = prevOrder.items?.reduce((sum: number, i: any) => sum + (i.qty || 0), 0) || 0;
                    return (
                      <div 
                        key={prevOrder.id} 
                        className="group flex flex-col bg-white border border-neutral-200 hover:border-black transition-all rounded-2xl p-5 cursor-pointer shadow-[0_2px_10px_rgb(0,0,0,0.02)] hover:shadow-md gap-3"
                        onClick={() => handleRepeatOrder(prevOrder)}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-serif text-lg text-neutral-900 leading-tight group-hover:text-black transition-colors">{prevOrder.title}</h4>
                            <p className="text-xs font-bold text-neutral-500 mt-1 uppercase tracking-wider">{prevOrder.portalId || 'Portal Order'}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-xs font-medium text-neutral-500 border-t border-neutral-100 pt-3">
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            {prevOrder.date}
                          </span>
                          <span>•</span>
                          <span>{prevOrder.items?.length || 0} styles</span>
                          <span>•</span>
                          <span>{totalQty} total units</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {customizingItem && (
        <GarmentCustomizerModal
          isOpen={!!customizingItem}
          onClose={() => setCustomizingItem(null)}
          garment={{
            id: customizingItem.instanceId,
            style: customizingItem.style,
            itemNum: customizingItem.itemNum,
            image: customizingItem.image,
            images: customizingItem.images || null,
            backImages: customizingItem.backImages || null,
            colors: customizingItem.colors || ['Custom Color'],
            selectedColor: customizingItem.selectedColor,
            originalFrontImage: customizingItem.originalFrontImage || null,
            originalBackImage: customizingItem.originalBackImage || null,
            originalSleeveImage: customizingItem.originalSleeveImage || null,
            customizedFrontImage: customizingItem.customizedFrontImage || null,
            customizedBackImage: customizingItem.customizedBackImage || null,
            customizedSleeveImage: customizingItem.customizedSleeveImage || null,
            customized: customizingItem.customized || false,
            logoUrl: customizingItem.logoUrl || null,
            logoName: customizingItem.logoName || null,
            logoUrlBack: customizingItem.logoUrlBack || null,
            logoNameBack: customizingItem.logoNameBack || null,
            logoUrlLeftSleeve: customizingItem.logoUrlLeftSleeve || null,
            logoNameLeftSleeve: customizingItem.logoNameLeftSleeve || null,
            logoUrlRightSleeve: customizingItem.logoUrlRightSleeve || null,
            logoNameRightSleeve: customizingItem.logoNameRightSleeve || null,
            customScaleFront: customizingItem.customScaleFront,
            customOffsetXFront: customizingItem.customOffsetXFront,
            customOffsetYFront: customizingItem.customOffsetYFront,
            customRotationFront: customizingItem.customRotationFront,
            customScaleBack: customizingItem.customScaleBack,
            customOffsetXBack: customizingItem.customOffsetXBack,
            customOffsetYBack: customizingItem.customOffsetYBack,
            customRotationBack: customizingItem.customRotationBack,
            customScaleLeftSleeve: customizingItem.customScaleLeftSleeve,
            customOffsetXLeftSleeve: customizingItem.customOffsetXLeftSleeve,
            customOffsetYLeftSleeve: customizingItem.customOffsetYLeftSleeve,
            customRotationLeftSleeve: customizingItem.customRotationLeftSleeve,
            customScaleRightSleeve: customizingItem.customScaleRightSleeve,
            customOffsetXRightSleeve: customizingItem.customOffsetXRightSleeve,
            customOffsetYRightSleeve: customizingItem.customOffsetYRightSleeve,
            customRotationRightSleeve: customizingItem.customRotationRightSleeve,
            // Tag properties
            logoUrlTag: customizingItem.logoUrlTag || null,
            tagLayout: customizingItem.tagLayout || null,
            tagSizeX: customizingItem.tagSizeX,
            tagSizeY: customizingItem.tagSizeY,
            tagSizeScale: customizingItem.tagSizeScale,
            tagSizeFont: customizingItem.tagSizeFont,
            tagSizeColor: customizingItem.tagSizeColor,
            tagSizeBold: customizingItem.tagSizeBold,
            tagSizeItalic: customizingItem.tagSizeItalic
          }}
          customerId={customerId || 'CUS-001'}
          onSave={(customizedData) => {
            setOrderItems(prev => prev.map(item => item.instanceId === customizingItem.instanceId ? {
              ...item,
              style: customizedData.style,
              itemNum: customizedData.itemNum || item.itemNum || '',
              selectedColor: customizedData.selectedColor,
              image: customizedData.image,
              customized: true,
              logoPlacement: customizedData.logoPlacement,
              originalFrontImage: customizedData.originalFrontImage,
              originalBackImage: customizedData.originalBackImage,
              originalSleeveImage: customizedData.originalSleeveImage,
              customizedFrontImage: customizedData.customizedFrontImage,
              customizedBackImage: customizedData.customizedBackImage,
              customizedSleeveImage: customizedData.customizedSleeveImage,
              logoUrl: customizedData.logoUrl,
              logoName: customizedData.logoName,
              logoUrlBack: customizedData.logoUrlBack,
              logoNameBack: customizedData.logoNameBack,
              logoUrlLeftSleeve: customizedData.logoUrlLeftSleeve || null,
              logoNameLeftSleeve: customizedData.logoNameLeftSleeve || null,
              logoUrlRightSleeve: customizedData.logoUrlRightSleeve || null,
              logoNameRightSleeve: customizedData.logoNameRightSleeve || null,
              colors: customizedData.colors || item.colors,
              customScaleFront: customizedData.customScaleFront,
              customOffsetXFront: customizedData.customOffsetXFront,
              customOffsetYFront: customizedData.customOffsetYFront,
              customRotationFront: customizedData.customRotationFront,
              customScaleBack: customizedData.customScaleBack,
              customOffsetXBack: customizedData.customOffsetXBack,
              customOffsetYBack: customizedData.customOffsetYBack,
              customRotationBack: customizedData.customRotationBack,
              customScaleLeftSleeve: customizedData.customScaleLeftSleeve,
              customOffsetXLeftSleeve: customizedData.customOffsetXLeftSleeve,
              customOffsetYLeftSleeve: customizedData.customOffsetYLeftSleeve,
              customRotationLeftSleeve: customizedData.customRotationLeftSleeve,
              customScaleRightSleeve: customizedData.customScaleRightSleeve,
              customOffsetXRightSleeve: customizedData.customOffsetXRightSleeve,
              customOffsetYRightSleeve: customizedData.customOffsetYRightSleeve,
              customRotationRightSleeve: customizedData.customRotationRightSleeve,
              // Tag properties
              logoUrlTag: customizedData.logoUrlTag || null,
              tagLayout: customizedData.tagLayout || null,
              tagSizeX: customizedData.tagSizeX,
              tagSizeY: customizedData.tagSizeY,
              tagSizeScale: customizedData.tagSizeScale,
              tagSizeFont: customizedData.tagSizeFont,
              tagSizeColor: customizedData.tagSizeColor,
              tagSizeBold: customizedData.tagSizeBold,
              tagSizeItalic: customizedData.tagSizeItalic
            } : item));
            setIsCartOpen(true);
          }}
        />
      )}

      {applySizingItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-2xl max-w-md w-full flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                <Users size={18} className="text-neutral-500" />
                <span>
                  {applySizingItem.type === 'roster' ? 'Apply Team Sizing Spread' : 'Apply Predefined Standard Sizing'}
                </span>
              </h3>
              <button 
                onClick={() => setApplySizingItem(null)}
                className="p-1 text-neutral-400 hover:text-black hover:bg-neutral-100 rounded-lg transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 flex flex-col gap-4">
              <p className="text-xs text-neutral-500 leading-relaxed">
                Apply sizing distribution to <strong className="text-neutral-800">{applySizingItem.item.style}</strong>.
              </p>

              {/* Spread Display */}
              {(() => {
                const spread: Record<string, number> = {};
                if (applySizingItem.type === 'roster') {
                  customer?.teamRoster?.forEach((member: any) => {
                    const size = member.size.toUpperCase();
                    spread[size] = (spread[size] || 0) + 1;
                  });
                } else {
                  Object.keys(customer?.standardOrder || {}).forEach(size => {
                    const val = customer.standardOrder[size] || 0;
                    if (val > 0) {
                      spread[size.toUpperCase()] = val;
                    }
                  });
                }

                const sortedSizes = Object.keys(spread).sort(sortSizes);
                
                // Check for skipped sizes
                const youthSizes = ['YXS', 'YS', 'YM', 'YL', 'YXL'];
                const hasYouthSizes = Object.keys(spread).some(s => youthSizes.includes(s));
                const availableGarmentSizes = applySizingItem.item.sizes || [];
                
                const skipped: string[] = [];
                Object.keys(spread).forEach(s => {
                  const isYouth = youthSizes.includes(s);
                  const isSupported = availableGarmentSizes.includes(s) || isYouth; // youth sizes will be auto-enabled
                  if (!isSupported) {
                    skipped.push(s);
                  }
                });

                const totalUnits = Object.values(spread).reduce((sum, v) => sum + v, 0);

                return (
                  <div className="flex flex-col gap-3">
                    <span className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider pl-0.5">
                      Spread to apply ({totalUnits} total units)
                    </span>
                    <div className="bg-neutral-50 rounded-xl border border-neutral-200/60 p-3.5 flex flex-wrap gap-2">
                      {sortedSizes.map(size => (
                        <div key={size} className="bg-white border border-neutral-150 rounded-lg px-2.5 py-1.5 flex items-center gap-2 shadow-xs">
                          <span className="text-[10px] font-extrabold text-neutral-500 uppercase">{size}</span>
                          <span className="text-xs font-bold text-neutral-800 bg-neutral-100 px-1.5 py-0.5 rounded-sm">{spread[size]}</span>
                        </div>
                      ))}
                    </div>

                    {hasYouthSizes && (
                      <div className="flex items-center gap-2 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
                        <Sparkles size={12} className="shrink-0 text-emerald-500 animate-pulse" />
                        <span>Youth Sizing will be automatically enabled for this garment to accommodate youth size inputs.</span>
                      </div>
                    )}

                    {skipped.length > 0 && (
                      <div className="flex items-start gap-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2.5">
                        <Info size={12} className="shrink-0 text-amber-500 mt-0.5" />
                        <span>Warning: The sizes <strong>{skipped.join(', ')}</strong> are not available for this garment style and will be skipped.</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="border-t border-neutral-100 pt-4 flex flex-col gap-2">
                <span className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider pl-0.5">Application Method</span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleApplyPredefinedSizing(applySizingItem.item, applySizingItem.type, 'overwrite')}
                    className="flex flex-col items-center justify-center p-3 border border-neutral-200 hover:border-black rounded-xl bg-neutral-50/50 hover:bg-white text-center cursor-pointer transition-all"
                  >
                    <span className="text-xs font-bold text-neutral-900">Overwrite</span>
                    <span className="text-[9px] text-neutral-455 mt-1">Replace current quantities</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPredefinedSizing(applySizingItem.item, applySizingItem.type, 'add')}
                    className="flex flex-col items-center justify-center p-3 border border-neutral-200 hover:border-black rounded-xl bg-neutral-50/50 hover:bg-white text-center cursor-pointer transition-all"
                  >
                    <span className="text-xs font-bold text-neutral-900">Add / Merge</span>
                    <span className="text-[9px] text-neutral-455 mt-1">Add to current quantities</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-neutral-100 flex items-center justify-end bg-neutral-50/50">
              <button
                type="button"
                onClick={() => setApplySizingItem(null)}
                className="px-4 py-2 bg-white border border-neutral-250 hover:border-black rounded-lg text-xs font-bold text-neutral-750 transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Image Preview Modal */}
      {previewImageUrl && (
        <div 
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div 
            className="relative max-w-[95vw] max-h-[90vh] bg-white rounded-[2rem] p-6 md:p-10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex items-center justify-center border border-neutral-200/50 cursor-crosshair"
            onClick={(e) => e.stopPropagation()}
            onMouseMove={(e) => {
              const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
              const x = (e.clientX - left) / width;
              const y = (e.clientY - top) / height;
              const img = e.currentTarget.querySelector('img');
              if (img) img.style.transformOrigin = `${x * 100}% ${y * 100}%`;
            }}
            title="Hover to zoom"
          >
            <button 
              onClick={() => setPreviewImageUrl(null)}
              className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-neutral-800 hover:text-black flex items-center justify-center shadow-lg transition-all z-50 cursor-pointer border border-neutral-100 hover:scale-105"
            >
              <X size={20} />
            </button>
            <img 
              src={previewImageUrl} 
              alt="Mockup Preview" 
              style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '75vh' }}
              className="rounded-2xl select-none transition-transform duration-200 ease-out hover:scale-[2]" 
            />
          </div>
        </div>
      )}

      {/* Save Cart Modal */}
      {showSaveCartModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => { setShowSaveCartModal(false); setSavedCartName(''); }}>
          <div 
            className="bg-white rounded-3xl p-6 max-w-md w-full flex flex-col gap-6 shadow-2xl border border-neutral-200/50 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="font-serif text-xl text-neutral-900">Save Cart for Later</h3>
              <p className="text-xs font-medium text-neutral-400 mt-1">Enter a name to easily identify this potential order later.</p>
            </div>
            
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-500 pl-1">Saved Cart Name</label>
              <input 
                type="text" 
                placeholder="e.g. Fall Event 2026, Basketball Team..."
                value={savedCartName}
                onChange={(e) => setSavedCartName(e.target.value)}
                className="w-full bg-neutral-50 border border-neutral-200 hover:border-neutral-350 focus:border-black focus:bg-white rounded-xl px-4 py-3.5 text-sm font-bold transition-all outline-none"
              />
            </div>
            
            <div className="flex gap-3 justify-end pt-2">
              <button 
                type="button"
                onClick={() => {
                  setShowSaveCartModal(false);
                  setSavedCartName('');
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-neutral-100 hover:bg-neutral-200 text-neutral-600 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleSaveCart}
                disabled={!savedCartName.trim() || isSavingCart}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  savedCartName.trim() && !isSavingCart
                    ? 'bg-black text-white hover:bg-neutral-800 shadow-md'
                    : 'bg-neutral-200 text-neutral-450 cursor-not-allowed'
                }`}
              >
                {isSavingCart ? 'Saving...' : 'Save Cart'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Garment Browser Dialog */}
      <GarmentBrowser 
        isOpen={isGarmentBrowserOpen}
        onClose={() => setIsGarmentBrowserOpen(false)}
        onSelect={handleSelectSanMarGarment}
        allowedStyleCodes={allowedStyleCodes}
      />

      {/* Incomplete Profile Modal */}
      {showIncompleteProfileModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] border border-neutral-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-8 pt-8 pb-4 flex justify-between items-center border-b border-neutral-100">
              <div>
                <h2 className="text-2xl font-serif text-neutral-900 tracking-tight flex items-center gap-2">
                  <User className="text-black" size={22} />
                  Complete Your Profile
                </h2>
                <p className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider mt-1">Required to submit your quote request</p>
              </div>
              <button 
                onClick={() => setShowIncompleteProfileModal(false)}
                className="w-10 h-10 rounded-full border border-black/10 hover:border-black flex items-center justify-center hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-8 max-h-[60vh] overflow-y-auto flex flex-col gap-6">
              <p className="text-xs text-neutral-550 leading-relaxed font-semibold">
                Please complete your contact and shipping details to submit this request. This information will be saved to your profile for faster checkout next time.
              </p>

              {/* Basic Info */}
              <div className="flex flex-col gap-4">
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest border-b border-neutral-50 pb-1">Basic Information</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase font-bold text-neutral-500 pl-1">Primary Contact Name</label>
                    <input 
                      type="text"
                      value={profileContactName}
                      onChange={(e) => setProfileContactName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-400 focus:bg-white transition-all font-bold"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase font-bold text-neutral-500 pl-1">Company Name</label>
                    <input 
                      type="text"
                      value={profileCompany}
                      onChange={(e) => setProfileCompany(e.target.value)}
                      placeholder="e.g. Acme Corp"
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-400 focus:bg-white transition-all font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase font-bold text-neutral-500 pl-1">Email Address</label>
                    <input 
                      type="email"
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      placeholder="e.g. john@example.com"
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-400 focus:bg-white transition-all font-bold"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase font-bold text-neutral-500 pl-1">Phone Number</label>
                    <input 
                      type="text"
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      placeholder="e.g. (555) 555-5555"
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-400 focus:bg-white transition-all font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Shipping Address */}
              {(deliveryOption === 'Shipping' || deliveryOption === 'Local Delivery' || deliveryOption === 'Delivery') && (
                <div className="flex flex-col gap-4">
                  <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest border-b border-neutral-50 pb-1">Shipping Address</h3>
                  
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase font-bold text-neutral-500 pl-1">Street Address</label>
                    <input 
                      ref={modalAddressInputRef}
                      type="text"
                      value={profileStreet}
                      onChange={(e) => setProfileStreet(e.target.value)}
                      placeholder="e.g. 123 Main St"
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-400 focus:bg-white transition-all font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1.5 sm:col-span-1">
                      <label className="text-[10px] uppercase font-bold text-neutral-500 pl-1">City</label>
                      <input 
                        type="text"
                        value={profileCity}
                        onChange={(e) => setProfileCity(e.target.value)}
                        placeholder="e.g. Austin"
                        className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-400 focus:bg-white transition-all font-bold"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] uppercase font-bold text-neutral-500 pl-1">State</label>
                      <input 
                        type="text"
                        value={profileState}
                        onChange={(e) => setProfileState(e.target.value)}
                        placeholder="e.g. TX"
                        className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-400 focus:bg-white transition-all font-bold"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] uppercase font-bold text-neutral-500 pl-1">Zip Code</label>
                      <input 
                        type="text"
                        value={profileZip}
                        onChange={(e) => setProfileZip(e.target.value)}
                        placeholder="e.g. 78701"
                        className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs font-medium text-neutral-900 focus:outline-none focus:border-neutral-400 focus:bg-white transition-all font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-8 py-6 bg-neutral-50 border-t border-neutral-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowIncompleteProfileModal(false)}
                className="px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-neutral-550 hover:bg-neutral-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveProfileAndSubmit}
                disabled={isSavingProfile || !profileContactName.trim() || !profileCompany.trim() || !profileEmail.trim() || !profilePhone.trim() || ((deliveryOption === 'Delivery' || deliveryOption === 'Shipping' || deliveryOption === 'Local Delivery') && (!profileStreet.trim() || !profileCity.trim() || !profileState.trim() || !profileZip.trim()))}
                className="px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider bg-black text-white hover:bg-neutral-800 transition-all flex items-center gap-1.5 shadow-md cursor-pointer disabled:bg-neutral-300 disabled:cursor-not-allowed"
              >
                {isSavingProfile ? 'Saving...' : 'Save & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] border border-neutral-200/55 shadow-2xl w-full max-w-md p-8 flex flex-col items-center text-center gap-6 animate-in zoom-in-95 duration-300">
            {/* Checkmark Icon Container */}
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 scale-100 hover:scale-105 transition-transform shadow-xs">
              <svg className="w-8 h-8 animate-in stroke-dash duration-1000" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-serif text-neutral-900 tracking-tight">Request Sent!</h2>
              <p className="text-xs text-neutral-500 font-semibold leading-relaxed">
                Check your dashboard for updates regarding your quote.
              </p>
            </div>

            {/* Notification Consent Checkboxes */}
            <div className="w-full bg-neutral-50 rounded-2xl p-4 border border-neutral-150 flex flex-col gap-3.5 text-left">
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-neutral-400 block">Stay Updated</span>
              
              <label className="flex items-center gap-3 cursor-pointer group select-none">
                <input 
                  type="checkbox"
                  checked={optInEmail}
                  onChange={(e) => setOptInEmail(e.target.checked)}
                  className="rounded border-neutral-350 text-black focus:ring-black w-4 h-4 cursor-pointer"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-neutral-800 group-hover:text-black transition-colors">Email Updates</span>
                  <span className="text-[10px] text-neutral-400">Receive quotes and messages via email.</span>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer group select-none">
                <input 
                  type="checkbox"
                  checked={optInText}
                  onChange={(e) => setOptInText(e.target.checked)}
                  className="rounded border-neutral-350 text-black focus:ring-black w-4 h-4 cursor-pointer"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-neutral-800 group-hover:text-black transition-colors">Text Message Updates</span>
                  <span className="text-[10px] text-neutral-400">Get instant SMS status alerts on your phone.</span>
                </div>
              </label>
            </div>

            <button
              type="button"
              onClick={handleSuccessModalClose}
              className="w-full py-3.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-black text-white hover:bg-neutral-800 transition-all shadow-md text-center cursor-pointer"
            >
              Done & Go to Dashboard
            </button>
          </div>
        </div>
      )}

      {expandedImage && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setExpandedImage(null)}
        >
          <div 
            className="relative max-w-3xl max-h-[85vh] w-full bg-white rounded-[2rem] p-6 md:p-10 shadow-2xl overflow-hidden flex items-center justify-center border border-neutral-200/50 cursor-crosshair"
            onClick={(e) => e.stopPropagation()}
            onMouseMove={(e) => {
              const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
              const x = (e.clientX - left) / width;
              const y = (e.clientY - top) / height;
              const img = e.currentTarget.querySelector('img');
              if (img) img.style.transformOrigin = `${x * 100}% ${y * 100}%`;
            }}
            title="Hover to zoom"
          >
            <button 
              onClick={() => setExpandedImage(null)}
              className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-neutral-800 hover:text-black flex items-center justify-center shadow-lg transition-all z-50 cursor-pointer border border-neutral-100 hover:scale-105"
            >
              <X size={20} />
            </button>
            <img 
              src={expandedImage.src} 
              alt={expandedImage.alt} 
              style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '70vh' }}
              className="rounded-2xl select-none transition-transform duration-200 ease-out hover:scale-[2]" 
            />
          </div>
        </div>
      )}

      <style>{`
        .pac-container {
          border-radius: 16px !important;
          border: 1px solid #e5e5e0 !important;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08) !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
          padding: 8px 0 !important;
          margin-top: 4px !important;
          z-index: 99999 !important;
        }
        .pac-item {
          padding: 8px 16px !important;
          font-size: 13px !important;
          color: #444 !important;
          cursor: pointer !important;
          border-top: none !important;
        }
        .pac-item:hover, .pac-item-selected {
          background-color: #f7f7f5 !important;
        }
        .pac-item-query {
          font-size: 13px !important;
          color: #111 !important;
        }
        .pac-matched {
          font-weight: 700 !important;
        }
        .pac-icon {
          display: none !important;
        }
      `}</style>

    </div>
  );
}
