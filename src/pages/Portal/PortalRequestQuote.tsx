import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, ChevronDown, Upload, Plus, Trash2, FileText, Loader2, Sparkles, X, User, Copy } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { db, storage } from '../../lib/firebase';
import { doc, getDoc, setDoc, query, collection, where, getDocs, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { GarmentCustomizerModal } from '../../components/Portal/GarmentCustomizerModal';
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

export function PortalRequestQuote() {
  const navigate = useNavigate();
  const { customerId } = useParams();
  
  const [products, setProducts] = useState<any[]>([
    { id: 1, artworkUrl: null, artworkName: null, isUploading: false }
  ]);

  const hasLowQuantityItems = useMemo(() => {
    if (products.length === 0) return false;
    const configuredProducts = products.filter(p => p.garmentName || p.itemNum);
    if (configuredProducts.length === 0) return false;
    return configuredProducts.some(p => {
      const sizeQtySum = p.sizes ? Object.values(p.sizes).reduce((acc: number, val: any) => acc + (parseInt(val.toString()) || 0), 0) : 0;
      const totalQty = sizeQtySum || p.qty || 0;
      return totalQty < 20;
    });
  }, [products]);

  const [contactName, setContactName] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [phone, setPhone] = useState('');
  
  const [shippingAddress, setShippingAddress] = useState({
    line1: '',
    line2: '',
    city: '',
    state: '',
    zip: '',
    country: ''
  });

  const [orderOnBehalf, setOrderOnBehalf] = useState({
    department: '',
    contactPerson: ''
  });

  const [inHandsDate, setInHandsDate] = useState('');
  const [notes, setNotes] = useState('');
  const [budgetTier, setBudgetTier] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [suggestedItems, setSuggestedItems] = useState<any[]>([]);
  const [wovnRack, setWovnRack] = useState<any[]>([]);
  const [customerRacks, setCustomerRacks] = useState<Record<string, any>>(DEFAULT_RACKS);
  const [customNames, setCustomNames] = useState<any>({ racks: {}, basics: {} });
  const [customSpecs, setCustomSpecs] = useState<any>({ racks: {}, basics: {} });
  const [defaultColors, setDefaultColors] = useState<any>({ racks: {}, basics: {} });
  const [pastGarments, setPastGarments] = useState<any[]>([]);
  const [activeRackCategory, setActiveRackCategory] = useState('Athleisure');
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const [activeLibraryTab, setActiveLibraryTab] = useState('rack');
  const [customizingProduct, setCustomizingProduct] = useState<any | null>(null);
  const [hoveredProductId, setHoveredProductId] = useState<number | null>(null);
  const [showShipping, setShowShipping] = useState(true);
  const [showOnBehalf, setShowOnBehalf] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

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
  const [selectedPackaging, setSelectedPackaging] = useState('Retail (single folded)');

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
    }
  }, [customer]);

  useEffect(() => {
    const fetchCustomer = async () => {
      setIsLoadingLibrary(true);
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

        if (!customerId) {
          // If no customerId, still load global configurations
          setCustomerRacks(globalRacks);
          setCustomNames(globalCustomNames);
          setCustomSpecs(globalCustomSpecs);
          setDefaultColors(globalDefaultColors);
          const categories = Object.keys(globalRacks);
          if (categories.length > 0 && !categories.includes(activeRackCategory)) {
            setActiveRackCategory(categories[0]);
          }
          setIsLoadingLibrary(false);
          return;
        }

        const docRef = doc(db, 'customers', customerId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setCustomer(data);
          
          if (data.contactName || data.name) setContactName(data.contactName || data.name);
          if (data.email) setEmailAddress(data.email);
          if (data.phone) setPhone(data.phone);

          const street = data.shippingStreet || data.billingStreet || '';
          if (street) {
            setShowShipping(true);
          }

          // Auto-populate shipping address using top-level properties
          setShippingAddress({
            line1: street,
            line2: '',
            city: data.shippingCity || data.billingCity || '',
            state: data.shippingState || data.billingState || '',
            zip: data.shippingZip || data.billingZip || '',
            country: data.shippingCountry || data.billingCountry || 'US'
          });

          // 1. Fetch Suggested Items
          setSuggestedItems(data.suggestedItems || []);

          // 2. Fetch WOVN Rack Items (Decks)
          const deckIds = data.catalogLinkIds || (data.catalogLinkId ? [data.catalogLinkId] : []);
          if (deckIds.length > 0) {
            try {
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
              
              const validArrays = fetchedArrays.filter(d => d !== null && Array.isArray(d));
              const flatDecks = validArrays.flat();
              const allGarments = flatDecks.reduce((acc: any[], deck: any) => {
                const itemsList = deck.items || deck.garments || [];
                return [...acc, ...itemsList];
              }, []);
              
              setWovnRack(allGarments);
            } catch (deckErr) {
              console.error("Error loading customer decks:", deckErr);
            }
          }

          // 3. Fetch Past Ordered Garments
          try {
            const q = query(
              collection(db, 'orders'),
              where('customerId', '==', customerId)
            );
            const querySnapshot = await getDocs(q);
            const uniqueGarmentsMap: Record<string, any> = {};
            querySnapshot.forEach((docSnap) => {
              const orderData = docSnap.data();
              if (orderData.items && Array.isArray(orderData.items)) {
                orderData.items.forEach((item: any) => {
                  const styleKey = item.style || item.itemNum;
                  if (styleKey && !uniqueGarmentsMap[styleKey]) {
                    uniqueGarmentsMap[styleKey] = {
                      id: item.id || `past-${Date.now()}-${Math.random()}`,
                      style: item.style || 'Custom Garment',
                      itemNum: item.itemNum || '',
                      image: item.image || '',
                      colors: item.color ? [item.color] : ['Custom Color'],
                      price: parseFloat(item.price || 0)
                    };
                  }
                });
              }
            });
            setPastGarments(Object.values(uniqueGarmentsMap));
          } catch (orderErr) {
            console.error("Error loading past orders for quote:", orderErr);
          }

          // 4. Fetch Customer Custom Racks (fallback to global racks, then DEFAULT_RACKS)
          const fetchedRacks = data.racks || globalRacks;
          setCustomerRacks(fetchedRacks);
          setCustomNames(data.customNames || globalCustomNames);
          setCustomSpecs(data.customSpecs || globalCustomSpecs);
          setDefaultColors(data.defaultColors || globalDefaultColors);
          
          // Set active category to the first key if the current active category does not exist in fetched racks
          const categories = Object.keys(fetchedRacks);
          if (categories.length > 0 && !categories.includes(activeRackCategory)) {
            setActiveRackCategory(categories[0]);
          }
        }
      } catch (err) {
        console.error("Error fetching customer", err);
      } finally {
        setIsLoadingLibrary(false);
      }
    };
    fetchCustomer();
  }, [customerId]);

  const getGarmentImage = (item: any) => {
    if (item.image) return item.image;
    if (item.images) {
      const chosenColor = (item.defaultColor && item.images[item.defaultColor])
        ? item.defaultColor
        : (item.colors?.[0] || Object.keys(item.images)[0]);
      if (chosenColor && item.images[chosenColor]) {
        return item.images[chosenColor].front || item.images[chosenColor].swatch || '';
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
          title: customName || prod.title || prod.style,
          defaultColor,
          slot,
          slotLabel: slot.charAt(0).toUpperCase() + slot.slice(1),
          customSpecs: customSpec
        };
      }
      return null;
    }).filter(Boolean) as any[];
  }, [customerRacks, activeRackCategory, customNames, defaultColors, customSpecs]);

  const handleBack = () => {
    navigate(customerId ? `/portal/${customerId}` : '/portal');
  };

  const getActiveSidesCountForProduct = (p: any) => {
    if (!p.customized) return 1;
    let count = 0;
    if (p.logoUrl) count++;
    if (p.logoUrlBack) count++;
    if (p.logoUrlLeftSleeve) count++;
    if (p.logoUrlRightSleeve) count++;
    return count || 1;
  };

  const handleAddProduct = () => {
    const qtyMap: Record<string, number> = {};
    const defaultSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'OSFA'];
    defaultSizes.forEach(s => qtyMap[s] = 0);
    setProducts(prev => [...prev, { id: Date.now(), garmentName: '', color: '', qty: 0, artworkUrl: null, artworkName: null, isUploading: false, sizes: qtyMap }]);
  };

  const handleAddProductFromLibrary = (item: any) => {
    const style = item.title || item.style || item.garment_name || item.name || 'Custom Garment';
    const image = getGarmentImage(item);
    const colors = item.colors || ['Custom Color'];
    
    const parsedSizes = parseSizesFromItem(item, item.style || '');
    const qtyMap: Record<string, number> = {};
    parsedSizes.forEach(s => qtyMap[s] = 0);

    const newProduct = {
      id: Date.now() + Math.random(),
      garmentName: style,
      itemNum: item.style || item.itemNum || item.garment_id || item.sku || item.id || '',
      color: colors[0] || '',
      qty: 0,
      artworkUrl: image,
      artworkName: 'Garment Artwork',
      isUploading: false,
      colors: colors,
      sizes: qtyMap,
      customized: false,
      images: item.images || null
    };
    
    setProducts(prev => {
      if (prev.length === 1 && !prev[0].garmentName && !prev[0].artworkUrl) {
        return [newProduct];
      }
      return [...prev, newProduct];
    });
  };

  const handleRemoveProduct = (id: number) => {
    setProducts(prev => prev.filter((p: any) => p.id !== id));
  };

  const handleDuplicateProduct = (product: any) => {
    const parsedSizes = parseSizesFromItem(product, product.itemNum || product.style || '');
    const qtyMap: Record<string, number> = {};
    parsedSizes.forEach(s => qtyMap[s] = 0);

    const newProduct = {
      id: Date.now() + Math.random(),
      garmentName: product.garmentName,
      itemNum: product.itemNum || '',
      color: product.color || '',
      qty: 0,
      artworkUrl: product.images ? getGarmentImage(product) : product.artworkUrl,
      artworkName: product.artworkName || 'Garment Artwork',
      isUploading: false,
      colors: product.colors || [],
      sizes: qtyMap,
      customized: false,
      images: product.images || null
    };

    setProducts(prev => {
      const idx = prev.findIndex((p: any) => p.id === product.id);
      if (idx !== -1) {
        const copy = [...prev];
        copy.splice(idx + 1, 0, newProduct);
        return copy;
      }
      return [...prev, newProduct];
    });
  };

  const handleFileUpload = async (productId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !customerId) return;
    
    // Set uploading state
    setProducts(prev => prev.map((p: any) => p.id === productId ? { ...p, isUploading: true } : p));
    
    try {
      const storageRef = ref(storage, `portal/${customerId}/quote_artwork/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      
      setProducts(prev => prev.map((p: any) => p.id === productId ? { 
        ...p, 
        isUploading: false, 
        artworkUrl: url,
        artworkName: file.name
      } : p));

      // Save to Asset Vault automatically (only if it's an artwork/logo, i.e., NOT a custom garment mockup)
      const targetProduct = products.find((p: any) => p.id === productId);
      const isCustomGarment = targetProduct && !targetProduct.itemNum;

      if (!isCustomGarment) {
        try {
          const newAsset = {
            id: `asset-${Date.now()}`,
            name: file.name,
            url: url,
            uploadedAt: new Date().toISOString()
          };
          const docRef = doc(db, 'customers', customerId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const currentAssets = docSnap.data().assets || [];
            await updateDoc(docRef, {
              assets: [...currentAssets, newAsset]
            });
          }
        } catch (vaultErr) {
          console.error("Auto vault save failed:", vaultErr);
        }
      }
    } catch (err) {
      console.error("Upload failed", err);
      setProducts(prev => prev.map((p: any) => p.id === productId ? { ...p, isUploading: false } : p));
    }
  };

  const isProfileComplete = () => {
    return !!(
      profileContactName.trim() &&
      profileCompany.trim() &&
      profileEmail.trim() &&
      profilePhone.trim() &&
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

      setContactName(profileContactName.trim());
      setEmailAddress(profileEmail.trim());
      setPhone(profilePhone.trim());
      setShippingAddress({
        line1: profileStreet.trim(),
        line2: '',
        city: profileCity.trim(),
        state: profileState.trim(),
        zip: profileZip.trim(),
        country: 'US'
      });

      setShowIncompleteProfileModal(false);
      await handleSubmit(true);
    } catch (err) {
      console.error("Error saving profile details:", err);
      alert("Failed to save profile. Please try again.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSubmit = async (bypassProfileCheck: any = false) => {
    if (!customerId) return;
    if (hasLowQuantityItems) {
      alert("Each garment style in your request requires a minimum of 20 garments.");
      return;
    }
    
    const shouldBypass = bypassProfileCheck === true;
    if (!shouldBypass && !isProfileComplete()) {
      setShowIncompleteProfileModal(true);
      return;
    }

    if (!contactName || !emailAddress) {
       alert("Please provide at least a contact name and email.");
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

      const payload = {
        id: `quote-${Date.now()}`,
        portalId: portalId,
        customerId: customerId,
        title: `Quote Request from ${contactName}`,
        statusIndex: 0, 
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric'}),
        createdAt: new Date().toISOString(),
        packaging: selectedPackaging,
        items: products.map(p => {
           const sizeQtySum = p.sizes ? Object.values(p.sizes).reduce((acc: number, val: any) => acc + (parseInt(val.toString()) || 0), 0) : 0;
           const totalQty = sizeQtySum || p.qty || 0;
           
           const artworks = [];
           if (p.logoUrl) {
             artworks.push({ url: p.logoUrl, originalUrl: p.logoUrl, name: p.logoName || 'Front Logo', width: 3.5, height: 3.5, quantity: totalQty });
           }
           if (p.logoUrlBack) {
             artworks.push({ url: p.logoUrlBack, originalUrl: p.logoUrlBack, name: p.logoNameBack || 'Back Logo', width: 3.5, height: 3.5, quantity: totalQty });
           }
           if (p.logoUrlLeftSleeve) {
             artworks.push({ url: p.logoUrlLeftSleeve, originalUrl: p.logoUrlLeftSleeve, name: p.logoNameLeftSleeve || 'Left Sleeve Logo', width: 3.5, height: 3.5, quantity: totalQty });
           }
           if (p.logoUrlRightSleeve) {
             artworks.push({ url: p.logoUrlRightSleeve, originalUrl: p.logoUrlRightSleeve, name: p.logoNameRightSleeve || 'Right Sleeve Logo', width: 3.5, height: 3.5, quantity: totalQty });
           }
           if (artworks.length === 0 && p.artworkUrl) {
             artworks.push({ url: p.artworkUrl, originalUrl: p.artworkUrl, name: p.artworkName || 'Artwork', width: 3.5, height: 3.5, quantity: totalQty });
           }

           return {
              id: p.id || Date.now(),
              style: p.garmentName || 'Custom Garment',
              itemNum: p.itemNum || '',
              color: p.color || '',
              qty: totalQty,
              image: p.artworkUrl || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200',
              notes: p.logoPlacement ? `Mockup Placement: ${p.logoPlacement}` : '',
              sizes: p.sizes || {},
              artworks: artworks,
              logoUrl: p.logoUrl || null,
              logoName: p.logoName || null,
              logoUrlBack: p.logoUrlBack || null,
              logoNameBack: p.logoNameBack || null,
              logoUrlLeftSleeve: p.logoUrlLeftSleeve || null,
              logoNameLeftSleeve: p.logoNameLeftSleeve || null,
              logoUrlRightSleeve: p.logoUrlRightSleeve || null,
              logoNameRightSleeve: p.logoNameRightSleeve || null,
           };
        }),
        shippingAddress: {
           street1: shippingAddress.line1,
           city: shippingAddress.city,
           state: shippingAddress.state,
           zip: shippingAddress.zip,
           country: shippingAddress.country,
           name: orderOnBehalf.contactPerson || contactName
        },
        contactDetails: {
           name: contactName,
           email: emailAddress,
           phone: phone
        },
        inHandsDate: inHandsDate,
        notes: notes,
        budgetTier: budgetTier,
        activities: [{
          id: `act-${Date.now()}`,
          type: 'system',
          message: `Quote request submitted by ${contactName}`,
          user: emailAddress,
          timestamp: new Date().toISOString()
        }]
      };

      await setDoc(doc(db, 'orders', payload.id), payload);
      navigate(`/portal/${customerId}`);
    } catch (err) {
      console.error("Error submitting quote:", err);
      alert("There was an error submitting your quote request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
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
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-serif text-neutral-900 tracking-tight flex items-center gap-4">
          Request New Quote
        </h1>
        <p className="text-neutral-500 font-medium text-sm max-w-xl leading-relaxed">
          Submit your project details for pricing
        </p>
      </div>

      <div className="flex flex-col gap-8 mt-4">
        
        {/* Contact Information & Project Details side-by-side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Contact Information */}
          <div className="bg-white rounded-3xl p-6 shadow-[0_4px_24px_rgb(0,0,0,0.02)] border border-neutral-100 flex flex-col gap-4 relative animate-in fade-in duration-300">
              <div>
                  <h2 className="text-lg font-bold text-neutral-900">Contact Information</h2>
                  <p className="text-xs text-neutral-500 mt-0.5">Provide your contact details so we can reach you about your quote</p>
              </div>
              
              <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Contact Name</label>
                      <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} className="w-full bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-black rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none placeholder:text-neutral-400 transition-all font-bold" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Email Address</label>
                      <input type="email" value={emailAddress} onChange={e => setEmailAddress(e.target.value)} className="w-full bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-black rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none placeholder:text-neutral-400 transition-all font-bold" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Phone Number (Optional)</label>
                      <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-black rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none placeholder:text-neutral-400 transition-all font-bold" />
                  </div>
              </div>
          </div>

          {/* Project Details & Timeline */}
          <div className="bg-white rounded-3xl p-6 shadow-[0_4px_24px_rgb(0,0,0,0.02)] border border-neutral-100 flex flex-col gap-4 relative animate-in fade-in duration-300">
              <div>
                  <h2 className="text-lg font-bold text-neutral-900">Project Details & Timeline</h2>
                  <p className="text-xs text-neutral-500 mt-0.5">Project timeline, requirements, and budget expectations</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">In-Hands Date</label>
                      <input type="date" value={inHandsDate} onChange={e => setInHandsDate(e.target.value)} className="w-full bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-black rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none transition-all font-bold" />
                  </div>

                  <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Budget Tier</label>
                      <div className="relative">
                          <select value={budgetTier} onChange={e => setBudgetTier(e.target.value)} className="w-full appearance-none bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-black rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none cursor-pointer font-bold">
                              <option value="">Choose a pricing tier</option>
                              <option value="economy">Economy / Promo</option>
                              <option value="standard">Standard / Retail</option>
                              <option value="premium">Premium / Custom Cut & Sew</option>
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" size={16} />
                      </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Packaging Option</label>
                      <div className="relative">
                          <select value={selectedPackaging} onChange={e => setSelectedPackaging(e.target.value)} className="w-full appearance-none bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-black rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none cursor-pointer font-bold">
                              <option value="Factory Folded (10 garments per stack)">Factory Folded (10 garments per stack)</option>
                              <option value="Retail (single folded)">Retail (single folded)</option>
                              <option value="Individually Bagged and Labeled">Individually Bagged and Labeled</option>
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" size={16} />
                      </div>
                  </div>
              </div>

              <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Additional Notes (Optional)</label>
                  <textarea 
                      rows={3}
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Any special requirements, color preferences, or additional details..." 
                      className="w-full bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-black rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none placeholder:text-neutral-400 transition-all resize-none font-bold font-sans" 
                  />
              </div>

              {/* Optional Section Toggles */}
              <div className="flex flex-wrap items-center gap-6 mt-2 pt-2 border-t border-neutral-100">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={showOnBehalf} 
                    onChange={(e) => setShowOnBehalf(e.target.checked)} 
                    className="w-4 h-4 rounded border-neutral-300 text-black focus:ring-black accent-black"
                  />
                  <span className="text-xs font-bold text-neutral-700">Order on behalf of someone else</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={showShipping} 
                    onChange={(e) => setShowShipping(e.target.checked)} 
                    className="w-4 h-4 rounded border-neutral-300 text-black focus:ring-black accent-black"
                  />
                  <span className="text-xs font-bold text-neutral-700">Ship request to custom address</span>
                </label>
              </div>

              {/* On Behalf Of Fields (Conditional) */}
              {showOnBehalf && (
                <div className="bg-neutral-50/50 rounded-2xl p-4 border border-neutral-200/50 flex flex-col gap-3 mt-1 animate-in slide-in-from-top-3 duration-200">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Ordering on Behalf Of</h3>
                    <button type="button" onClick={() => { setShowOnBehalf(false); setOrderOnBehalf({department: '', contactPerson: ''}); }} className="text-[10px] font-bold text-red-500 hover:underline">Remove</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-neutral-700">Department/Team</label>
                          <input type="text" value={orderOnBehalf.department} onChange={e => setOrderOnBehalf(prev => ({...prev, department: e.target.value}))} placeholder="e.g., Marketing, Sales, HR" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none focus:border-black transition-all font-bold" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-neutral-700">Contact Person</label>
                          <input type="text" value={orderOnBehalf.contactPerson} onChange={e => setOrderOnBehalf(prev => ({...prev, contactPerson: e.target.value}))} placeholder="Person you're ordering for" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none focus:border-black transition-all font-bold" />
                      </div>
                  </div>
                </div>
              )}

              {/* Shipping Address Fields (Conditional) */}
              {showShipping && (
                <div className="bg-neutral-50/50 rounded-2xl p-4 border border-neutral-200/50 flex flex-col gap-3 mt-1 animate-in slide-in-from-top-3 duration-200">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Shipping Address</h3>
                    <button type="button" onClick={() => { setShowShipping(false); setShippingAddress({line1: '', line2: '', city: '', state: '', zip: '', country: 'US'}); }} className="text-[10px] font-bold text-red-500 hover:underline">Remove</button>
                  </div>
                  <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-neutral-700">Address Line 1</label>
                          <input type="text" value={shippingAddress.line1} onChange={e => setShippingAddress(prev => ({...prev, line1: e.target.value}))} placeholder="Street address" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none focus:border-black transition-all font-bold" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-neutral-700">Address Line 2 (Optional)</label>
                          <input type="text" value={shippingAddress.line2} onChange={e => setShippingAddress(prev => ({...prev, line2: e.target.value}))} placeholder="Apt, suite, unit, etc." className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none focus:border-black transition-all font-bold" />
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="flex flex-col gap-1.5">
                              <label className="text-xs font-bold text-neutral-700">City</label>
                              <input type="text" value={shippingAddress.city} onChange={e => setShippingAddress(prev => ({...prev, city: e.target.value}))} placeholder="City" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none focus:border-black transition-all font-bold" />
                          </div>
                          <div className="flex flex-col gap-1.5">
                              <label className="text-xs font-bold text-neutral-700">State/Province</label>
                              <input type="text" value={shippingAddress.state} onChange={e => setShippingAddress(prev => ({...prev, state: e.target.value}))} placeholder="State" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none focus:border-black transition-all font-bold" />
                          </div>
                          <div className="flex flex-col gap-1.5">
                              <label className="text-xs font-bold text-neutral-700">ZIP Code</label>
                              <input type="text" value={shippingAddress.zip} onChange={e => setShippingAddress(prev => ({...prev, zip: e.target.value}))} placeholder="ZIP" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none focus:border-black transition-all font-bold" />
                          </div>
                          <div className="flex flex-col gap-1.5">
                              <label className="text-xs font-bold text-neutral-700">Country</label>
                              <input type="text" value={shippingAddress.country} onChange={e => setShippingAddress(prev => ({...prev, country: e.target.value}))} placeholder="Country" className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 focus:outline-none focus:border-black transition-all font-bold" />
                          </div>
                      </div>
                  </div>
                </div>
              )}
          </div>
        </div>

        {/* Library Selector */}
        <div data-tour="quote-library" className="bg-white rounded-3xl p-8 shadow-[0_4px_24px_rgb(0,0,0,0.02)] border border-neutral-100 flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold text-neutral-900">Select Garments from Library</h2>
            <p className="text-sm text-neutral-500">Choose from suggested, past, or catalog garments to add to your quote request</p>
          </div>
          
          <div className="flex gap-4 border-b border-neutral-100 pb-3 overflow-x-auto">
            {['rack', 'wovn', 'suggested', 'past']
              .filter(tab => tab !== 'wovn' || wovnRack.length > 0)
              .map((tab) => {
              const label = tab === 'rack' ? 'Design Your Rack' : tab === 'wovn' ? 'WOVN Catalog' : tab === 'suggested' ? 'Suggested Items' : 'Past Garments';
              const count = tab === 'rack' 
                ? activeRackItems.length 
                : tab === 'wovn' 
                  ? wovnRack.length 
                  : tab === 'suggested' 
                    ? suggestedItems.length 
                    : pastGarments.length;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveLibraryTab(tab)}
                  className={`text-sm font-bold pb-2 border-b-2 whitespace-nowrap transition-all ${
                    activeLibraryTab === tab 
                      ? 'text-black border-black' 
                      : 'text-neutral-400 border-transparent hover:text-black hover:border-black'
                  }`}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>

          {activeLibraryTab === 'rack' && (
            <div className="flex flex-wrap gap-2 pb-2 border-b border-neutral-100">
              {Object.keys(customerRacks).map((catName) => (
                <button
                  key={catName}
                  type="button"
                  onClick={() => setActiveRackCategory(catName)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
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

          {isLoadingLibrary ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-neutral-400" size={24} />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-h-[600px] overflow-y-auto pr-1">
              {activeLibraryTab === 'rack' && activeRackItems.map((item, idx) => (
                <div 
                  key={item.id || `${item.style}-${idx}`} 
                  onClick={() => handleAddProductFromLibrary(item)}
                  className="group bg-white hover:bg-neutral-50/50 border border-neutral-200 hover:border-neutral-400 rounded-2xl p-4 flex flex-col items-center justify-between cursor-pointer transition-all hover:shadow-md relative"
                >
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedImage(getGarmentImage(item));
                    }}
                    className="w-full h-60 flex items-center justify-center mb-2 relative cursor-zoom-in"
                    title="Click to expand mockup"
                  >
                    <img 
                      src={getGarmentImage(item)} 
                      alt={item.title || item.style} 
                      className="max-w-full max-h-full object-contain mix-blend-multiply group-hover:scale-110 transition-transform duration-300" 
                    />
                  </div>
                  <div className="w-full flex flex-col items-center">
                    <p className="font-bold text-sm text-neutral-900 truncate w-full text-center">{item.title || item.style}</p>
                    <p className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider truncate w-full text-center mt-0.5">{item.style || 'Catalog'}</p>
                  </div>
                  <span className="text-xs font-bold text-neutral-800 bg-neutral-100 group-hover:bg-black group-hover:text-white px-3 py-1.5 rounded-lg transition-all mt-3 w-full text-center">+ Add to Request</span>
                </div>
              ))}

              {activeLibraryTab === 'wovn' && wovnRack.map((item, idx) => (
                <div 
                  key={item.id || idx} 
                  onClick={() => handleAddProductFromLibrary(item)}
                  className="group bg-white hover:bg-neutral-50/50 border border-neutral-200 hover:border-neutral-400 rounded-2xl p-4 flex flex-col items-center justify-between cursor-pointer transition-all hover:shadow-md relative"
                >
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedImage(item.image || item.original_image || item.mockup_image || item.mock_image || item.imageUrl || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200');
                    }}
                    className="w-full h-60 flex items-center justify-center mb-2 relative cursor-zoom-in"
                    title="Click to expand mockup"
                  >
                    <img 
                      src={item.image || item.original_image || item.mockup_image || item.mock_image || item.imageUrl || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200'} 
                      alt={item.style || item.name} 
                      className="max-w-full max-h-full object-contain mix-blend-multiply group-hover:scale-110 transition-transform duration-300" 
                    />
                  </div>
                  <div className="w-full flex flex-col items-center">
                    <p className="font-bold text-sm text-neutral-900 truncate w-full text-center">{item.style || item.name || item.garment_name}</p>
                    <p className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider truncate w-full text-center mt-0.5">{item.itemNum || item.garment_id || 'Catalog'}</p>
                  </div>
                  <span className="text-xs font-bold text-neutral-800 bg-neutral-100 group-hover:bg-black group-hover:text-white px-3 py-1.5 rounded-lg transition-all mt-3 w-full text-center">+ Add to Request</span>
                </div>
              ))}
              
              {activeLibraryTab === 'suggested' && suggestedItems.map((item, idx) => (
                <div 
                  key={item.id || idx} 
                  onClick={() => handleAddProductFromLibrary(item)}
                  className="group bg-white hover:bg-neutral-50/50 border border-neutral-200 hover:border-neutral-400 rounded-2xl p-4 flex flex-col items-center justify-between cursor-pointer transition-all hover:shadow-md relative"
                >
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedImage(item.image || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200');
                    }}
                    className="w-full h-60 flex items-center justify-center mb-2 relative cursor-zoom-in"
                    title="Click to expand mockup"
                  >
                    <img 
                      src={item.image || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200'} 
                      alt={item.style} 
                      className="max-w-full max-h-full object-contain mix-blend-multiply group-hover:scale-110 transition-transform duration-300" 
                    />
                  </div>
                  <div className="w-full flex flex-col items-center">
                    <p className="font-bold text-sm text-neutral-900 truncate w-full text-center">{item.style}</p>
                    <p className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider truncate w-full text-center mt-0.5">{item.itemNum || 'Suggested'}</p>
                  </div>
                  <span className="text-xs font-bold text-neutral-800 bg-neutral-100 group-hover:bg-black group-hover:text-white px-3 py-1.5 rounded-lg transition-all mt-3 w-full text-center">+ Add to Request</span>
                </div>
              ))}

              {activeLibraryTab === 'past' && pastGarments.map((item, idx) => (
                <div 
                  key={item.id || idx} 
                  onClick={() => handleAddProductFromLibrary(item)}
                  className="group bg-white hover:bg-neutral-50/50 border border-neutral-200 hover:border-neutral-400 rounded-2xl p-4 flex flex-col items-center justify-between cursor-pointer transition-all hover:shadow-md relative"
                >
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedImage(item.image || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200');
                    }}
                    className="w-full h-60 flex items-center justify-center mb-2 relative cursor-zoom-in"
                    title="Click to expand mockup"
                  >
                    <img 
                      src={item.image || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200'} 
                      alt={item.style} 
                      className="max-w-full max-h-full object-contain mix-blend-multiply group-hover:scale-110 transition-transform duration-300" 
                    />
                  </div>
                  <div className="w-full flex flex-col items-center">
                    <p className="font-bold text-sm text-neutral-900 truncate w-full text-center">{item.style}</p>
                    <p className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider truncate w-full text-center mt-0.5">{item.itemNum || 'Past Order'}</p>
                  </div>
                  <span className="text-xs font-bold text-neutral-800 bg-neutral-100 group-hover:bg-black group-hover:text-white px-3 py-1.5 rounded-lg transition-all mt-3 w-full text-center">+ Add to Request</span>
                </div>
              ))}

              {activeLibraryTab === 'rack' && activeRackItems.length === 0 && (
                <p className="col-span-full text-center py-6 text-sm text-neutral-400 italic">No rack garments configured.</p>
              )}
              {activeLibraryTab === 'wovn' && wovnRack.length === 0 && (
                <p className="col-span-full text-center py-6 text-sm text-neutral-400 italic">No catalog garments linked.</p>
              )}
              {activeLibraryTab === 'suggested' && suggestedItems.length === 0 && (
                <p className="col-span-full text-center py-6 text-sm text-neutral-400 italic">No suggested items recommendation found.</p>
              )}
              {activeLibraryTab === 'past' && pastGarments.length === 0 && (
                <p className="col-span-full text-center py-6 text-sm text-neutral-400 italic">No past orders found to pull items from.</p>
              )}
            </div>
          )}
        </div>

        {/* Products */}
        <div data-tour="quote-items" className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-bold text-neutral-900">Products</h2>
                    <p className="text-sm text-neutral-500">Add one or more products to your quote</p>
                </div>
                <button 
                  onClick={handleAddProduct}
                  className="bg-white border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 text-neutral-900 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm"
                >
                  <Plus size={16} /> Add Another Product
                </button>
            </div>

            {products.map((product, index) => {
              const N = getActiveSidesCountForProduct(product);
              const isHovered = hoveredProductId === product.id;
              const translatePercentage = isHovered && N > 1 ? (100 / N) : 0;
              const isCustomized = product.customized;

              return (
                <div key={product.id} className="bg-white rounded-3xl p-6 shadow-[0_4px_24px_rgb(0,0,0,0.02)] border border-neutral-100 flex flex-col gap-5 relative animate-in slide-in-from-bottom-4 fade-in duration-300">
                  
                  {/* Top Header Section */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
                    <div className="flex gap-4 items-center">
                      {/* Thumbnail Box */}
                      <div 
                        onMouseEnter={() => setHoveredProductId(product.id)}
                        onMouseLeave={() => setHoveredProductId(null)}
                        onClick={() => setExpandedImage(product.artworkUrl || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200')}
                        className={`w-16 h-16 rounded-xl overflow-hidden bg-neutral-50 border border-neutral-100 shrink-0 relative flex items-center ${isCustomized ? 'justify-start' : 'justify-center'} cursor-zoom-in`}
                        title="Click to expand mockup"
                      >
                        {isCustomized ? (
                          <img 
                            src={product.artworkUrl || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200'} 
                            alt={product.garmentName} 
                            style={{
                              width: `${N * 100}%`,
                              height: '100%',
                              maxWidth: 'none',
                              transform: `translateX(-${translatePercentage}%)`,
                              transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                            }}
                            className="object-cover mix-blend-multiply select-none p-1"
                          />
                        ) : (
                          <img 
                            src={product.artworkUrl || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200'} 
                            alt={product.garmentName} 
                            className="w-full h-full object-contain mix-blend-multiply select-none p-1"
                          />
                        )}
                      </div>

                      {/* Garment Details & Placement summary */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="w-5 h-5 rounded-full bg-neutral-100 flex items-center justify-center text-[10px] font-bold text-neutral-400 shrink-0">{index + 1}</span>
                          {product.itemNum ? (
                            <h3 className="text-md font-bold text-neutral-900 truncate">{product.garmentName}</h3>
                          ) : (
                            <input
                              type="text"
                              value={product.garmentName || ''}
                              onChange={(e) => setProducts(prev => prev.map((p: any) => p.id === product.id ? { ...p, garmentName: e.target.value } : p))}
                              placeholder="Enter garment name/type..."
                              className="bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1 text-xs font-bold text-neutral-900 focus:outline-none focus:border-neutral-450 focus:bg-white placeholder:text-neutral-400 transition-all w-[200px]"
                            />
                          )}
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-500 font-medium mt-1">
                          {isCustomized ? (
                            <span className="text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                              <Sparkles size={10} /> Customized Mockup
                            </span>
                          ) : (
                            <span className="text-neutral-400 font-bold bg-neutral-100 px-1.5 py-0.5 rounded">Blank Design</span>
                          )}
                          {product.color && <span className="uppercase tracking-wide text-[10px] bg-neutral-50 px-1.5 py-0.5 rounded border border-neutral-200 font-bold">{product.color}</span>}
                          {(() => {
                            const activePlacements = [];
                            if (product.logoUrl) activePlacements.push("Front");
                            if (product.logoUrlBack) activePlacements.push("Back");
                            if (product.logoUrlLeftSleeve) activePlacements.push("Left Sleeve");
                            if (product.logoUrlRightSleeve) activePlacements.push("Right Sleeve");
                            const count = activePlacements.length;
                            return (
                              <span className="text-[10px] bg-neutral-100 text-neutral-800 px-1.5 py-0.5 rounded border border-neutral-200 font-bold">
                                Placements ({count}): {count > 0 ? activePlacements.join(', ') : 'None'}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Product Header Actions */}
                    <div className="flex items-center gap-2 self-end md:self-auto">
                      <button
                        type="button"
                        onClick={() => handleDuplicateProduct(product)}
                        className="bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-neutral-800 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                        title="Add another color/design variation of this item"
                      >
                        <Copy size={12} className="text-neutral-500" /> + Variation
                      </button>
                      <button
                        type="button"
                        data-tour={index === 0 ? "open-mockup-creator" : undefined}
                        onClick={() => setCustomizingProduct(product)}
                        className="bg-neutral-900 hover:bg-neutral-800 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                      >
                        <Sparkles size={12} className="text-white animate-pulse" /> 
                        <span>{isCustomized ? 'Edit Customization' : 'Open Mockup Creator'}</span>
                      </button>
                      {products.length > 1 && (
                        <button 
                          onClick={() => handleRemoveProduct(product.id)} 
                          className="text-neutral-400 hover:text-red-500 transition-colors p-2 cursor-pointer"
                          title="Remove product"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </div>
{/* Customization Details & Sizing matrix */}
                  <div className="flex flex-col gap-4">
                    {/* Sizing Matrix */}
                    <div className="bg-neutral-50 rounded-2xl p-4 flex flex-col items-start border border-neutral-100 gap-3">
                        <div className="flex justify-between items-center w-full">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Quantities by Size</span>
                            <button
                              type="button"
                              onClick={() => {
                                const youthSizes = { 'YXS': 0, 'YS': 0, 'YM': 0, 'YL': 0, 'YXL': 0 };
                                setProducts(prev => prev.map((p: any) => p.id === product.id ? {
                                  ...p,
                                  sizes: { ...youthSizes, ...(p.sizes || {}) }
                                } : p));
                              }}
                              className="text-[9px] font-bold uppercase tracking-wider text-neutral-600 bg-white border border-neutral-200 hover:border-neutral-400 px-2.5 py-1 rounded-full transition-all cursor-pointer shadow-3xs"
                            >
                              + Add Youth Sizing
                            </button>
                          </div>
                          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                            Total Qty: {Object.values(product.sizes || {}).reduce((sum: number, val: any) => sum + (parseInt(val.toString()) || 0), 0) as number} units
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 w-full">
                          {(() => {
                            const keys = Object.keys(product.sizes || {});
                            const actualSizes = (keys.length > 0 ? keys : ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'OSFA']).sort((a, b) => {
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
                            });
                            return actualSizes.map((size) => (
                              <div key={size} className="flex-1 min-w-[50px] flex flex-col bg-white border border-neutral-200 rounded-lg overflow-hidden focus-within:border-black focus-within:ring-1 focus-within:ring-black transition-all">
                                <div className="bg-neutral-100 text-neutral-600 text-[10px] font-bold py-1.5 uppercase tracking-wide flex items-center justify-center border-b border-neutral-200">
                                  {size}
                                </div>
                                <input 
                                  type="number"
                                  min="0"
                                  value={product.sizes?.[size] === 0 ? '' : (product.sizes?.[size] || '')}
                                  placeholder="0"
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    setProducts(prev => prev.map((p: any) => p.id === product.id ? { 
                                      ...p, 
                                      sizes: { ...(p.sizes || {}), [size]: val } 
                                    } : p));
                                  }}
                                  className="w-full h-10 text-center text-sm font-bold text-neutral-900 focus:outline-none placeholder:text-neutral-300 font-bold"
                                />
                              </div>
                            ));
                          })()}
                        </div>
                    </div>

                    {/* Placements & Uploads (only visible if NOT customized) */}
                    {!isCustomized && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-neutral-100 pt-4 animate-in fade-in duration-200">
                        {/* Manual Design Placements */}
                        <div className="flex flex-col gap-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Design Placements</label>
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            {['Front', 'Back', 'Left Chest', 'Right Chest', 'Left Sleeve', 'Right Sleeve'].map((placement) => {
                              const isChecked = product.manualPlacements?.[placement] || false;
                              return (
                                <label key={placement} className={`flex items-center gap-2 p-2.5 border rounded-xl cursor-pointer transition-all ${
                                  isChecked ? 'bg-black text-white border-black' : 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-800'
                                }`}>
                                  <input 
                                    type="checkbox" 
                                    checked={isChecked}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setProducts(prev => prev.map((p: any) => p.id === product.id ? {
                                        ...p,
                                        manualPlacements: { ...(p.manualPlacements || {}), [placement]: checked },
                                        logoPlacement: Object.entries({ ...(p.manualPlacements || {}), [placement]: checked })
                                          .filter(([_, v]) => v)
                                          .map(([k]) => k)
                                          .join(', ')
                                      } : p));
                                    }}
                                    className="w-3.5 h-3.5 rounded border-neutral-300 text-black focus:ring-black accent-black" 
                                  />
                                  <span className="text-xs font-bold">{placement}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        {/* Manual Artwork File Uploader */}
                        <div data-tour="quote-upload" className="flex flex-col gap-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Artwork File</label>
                          {product.isUploading ? (
                            <div className="border border-dashed border-neutral-200 rounded-xl p-6 flex flex-col items-center justify-center text-center gap-2 bg-neutral-50">
                              <Loader2 className="animate-spin text-black" size={20} />
                              <p className="text-xs font-bold text-neutral-900">Uploading artwork...</p>
                            </div>
                          ) : product.artworkUrl && product.artworkUrl !== 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200' ? (
                            <div className="border border-neutral-200 rounded-xl p-4 flex items-center justify-between gap-3 bg-neutral-50 relative group">
                              <div className="flex items-center gap-3 min-w-0">
                                <div 
                                  onClick={() => {
                                    if (product.artworkUrl && product.artworkUrl.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i)) {
                                      setExpandedImage(product.artworkUrl);
                                    }
                                  }}
                                  className={`w-10 h-10 rounded-lg overflow-hidden bg-white border border-neutral-200 flex items-center justify-center p-1 shrink-0 ${
                                    product.artworkUrl && product.artworkUrl.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i) ? 'cursor-zoom-in hover:opacity-85' : ''
                                  }`}
                                  title={product.artworkUrl && product.artworkUrl.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i) ? 'Click to expand artwork' : undefined}
                                >
                                   {product.artworkUrl.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i) ? (
                                      <img src={product.artworkUrl} alt={product.artworkName || 'Artwork'} className="max-w-full max-h-full object-contain" />
                                   ) : (
                                      <FileText size={16} className="text-neutral-500" />
                                   )}
                                </div>
                                <span className="text-xs font-bold text-neutral-900 truncate">{product.artworkName}</span>
                              </div>
                              <button 
                                onClick={() => setProducts(prev => prev.map((p: any) => p.id === product.id ? {...p, artworkUrl: null, artworkName: null} : p))} 
                                className="text-xs font-bold text-red-500 hover:text-red-700 cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <label className="border border-dashed border-neutral-200 rounded-xl p-6 flex flex-col items-center justify-center text-center gap-2 hover:bg-neutral-50 hover:border-neutral-300 transition-all cursor-pointer group">
                              <input type="file" className="hidden" onChange={(e) => handleFileUpload(product.id, e)} accept="image/*,application/pdf,.ai,.eps,.psd,.cdr,.zip" />
                              <Upload size={16} className="text-neutral-500 group-hover:scale-110 transition-transform" />
                              <div>
                                <p className="text-xs font-bold text-neutral-900">Upload design file</p>
                                <p className="text-[10px] text-neutral-500">PDF, AI, PNG, JPEG, ZIP (Max 10MB)</p>
                              </div>
                            </label>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Placements & Artwork Summary (only visible if customized) */}
                    {isCustomized && (
                      <div className="text-xs font-semibold text-neutral-500 bg-neutral-50 px-4 py-3 rounded-xl border border-neutral-100 flex flex-wrap gap-x-4 gap-y-1 animate-in fade-in duration-200">
                        {product.logoUrl && <span>• <b>Front Placement:</b> {product.logoName || 'Logo'}</span>}
                        {product.logoUrlBack && <span>• <b>Back Placement:</b> {product.logoNameBack || 'Logo'}</span>}
                        {product.logoUrlLeftSleeve && <span>• <b>Left Sleeve:</b> {product.logoNameLeftSleeve || 'Logo'}</span>}
                        {product.logoUrlRightSleeve && <span>• <b>Right Sleeve:</b> {product.logoNameRightSleeve || 'Logo'}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>


        {hasLowQuantityItems && (
          <div className="text-xs text-red-650 bg-red-50 border border-red-100 rounded-xl p-3 flex flex-col gap-1 leading-relaxed mt-4">
            <span className="font-bold">⚠️ Order Minimum Requirement</span>
            <span className="font-medium text-neutral-500">Each garment style in your request requires a minimum of 20 garments. Please increase sizing quantities before submitting.</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-4 mt-4">
            <button 
              data-tour="quote-submit" 
              disabled={isSubmitting || hasLowQuantityItems} 
              onClick={handleSubmit} 
              className={`flex-1 py-4 rounded-xl text-sm font-bold tracking-wide transition-all shadow-md flex justify-center items-center gap-2 ${
                (!isSubmitting && !hasLowQuantityItems)
                  ? 'bg-black text-white hover:bg-neutral-800 cursor-pointer'
                  : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
              }`}
            >
                {isSubmitting ? (
                   <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                ) : (
                   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                   </svg>
                )}
                {isSubmitting ? "Submitting Request..." : "Submit Quote Request"}
            </button>
            <button 
                onClick={handleBack}
                className="bg-white border border-neutral-200 text-neutral-900 px-8 py-4 rounded-xl text-sm font-bold hover:bg-neutral-50 transition-all shadow-sm cursor-pointer"
            >
                Cancel
            </button>
        </div>

      </div>
      {customizingProduct && (
        <GarmentCustomizerModal
          isOpen={!!customizingProduct}
          onClose={() => setCustomizingProduct(null)}
          garment={{
            id: customizingProduct.id,
            style: customizingProduct.garmentName,
            itemNum: customizingProduct.itemNum,
            image: customizingProduct.artworkUrl,
            images: customizingProduct.images || null,
            backImages: customizingProduct.backImages || null,
            colors: customizingProduct.colors || ['Custom Color'],
            selectedColor: customizingProduct.color,
            originalFrontImage: customizingProduct.originalFrontImage || null,
            originalBackImage: customizingProduct.originalBackImage || null,
            originalSleeveImage: customizingProduct.originalSleeveImage || null,
            customizedFrontImage: customizingProduct.customizedFrontImage || null,
            customizedBackImage: customizingProduct.customizedBackImage || null,
            customizedSleeveImage: customizingProduct.customizedSleeveImage || null,
            customized: customizingProduct.customized || false,
            logoUrl: customizingProduct.logoUrl || null,
            logoName: customizingProduct.logoName || null,
            logoUrlBack: customizingProduct.logoUrlBack || null,
            logoNameBack: customizingProduct.logoNameBack || null,
            logoUrlLeftSleeve: customizingProduct.logoUrlLeftSleeve || null,
            logoNameLeftSleeve: customizingProduct.logoNameLeftSleeve || null,
            logoUrlRightSleeve: customizingProduct.logoUrlRightSleeve || null,
            logoNameRightSleeve: customizingProduct.logoNameRightSleeve || null,
            customScaleFront: customizingProduct.customScaleFront,
            customOffsetXFront: customizingProduct.customOffsetXFront,
            customOffsetYFront: customizingProduct.customOffsetYFront,
            customRotationFront: customizingProduct.customRotationFront,
            customScaleBack: customizingProduct.customScaleBack,
            customOffsetXBack: customizingProduct.customOffsetXBack,
            customOffsetYBack: customizingProduct.customOffsetYBack,
            customRotationBack: customizingProduct.customRotationBack,
            customScaleLeftSleeve: customizingProduct.customScaleLeftSleeve,
            customOffsetXLeftSleeve: customizingProduct.customOffsetXLeftSleeve,
            customOffsetYLeftSleeve: customizingProduct.customOffsetYLeftSleeve,
            customRotationLeftSleeve: customizingProduct.customRotationLeftSleeve,
            customScaleRightSleeve: customizingProduct.customScaleRightSleeve,
            customOffsetXRightSleeve: customizingProduct.customOffsetXRightSleeve,
            customOffsetYRightSleeve: customizingProduct.customOffsetYRightSleeve,
            customRotationRightSleeve: customizingProduct.customRotationRightSleeve
          }}
          customerId={customerId || 'CUS-001'}
          onSave={(customizedData) => {
            setProducts(prev => prev.map(p => p.id === customizingProduct.id ? {
              ...p,
              garmentName: customizedData.style,
              itemNum: customizedData.itemNum || p.itemNum || '',
              color: customizedData.selectedColor,
              artworkUrl: customizedData.image,
              artworkName: customizedData.logoName ? `Mockup with ${customizedData.logoName}` : 'Customized Mockup',
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
              colors: customizedData.colors || p.colors,
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
              customRotationRightSleeve: customizedData.customRotationRightSleeve
            } : p));
          }}
        />
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
              src={expandedImage} 
              alt="Expanded Preview" 
              style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '70vh' }}
              className="rounded-2xl select-none transition-transform duration-200 ease-out hover:scale-[2]" 
            />
          </div>
        </div>
      )}

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
              <div className="flex flex-col gap-4">
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest border-b border-neutral-50 pb-1">Shipping Address</h3>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold text-neutral-500 pl-1">Street Address</label>
                  <input 
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
                disabled={isSavingProfile || !profileContactName.trim() || !profileCompany.trim() || !profileEmail.trim() || !profilePhone.trim() || !profileStreet.trim() || !profileCity.trim() || !profileState.trim() || !profileZip.trim()}
                className="px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider bg-black text-white hover:bg-neutral-800 transition-all flex items-center gap-1.5 shadow-md cursor-pointer disabled:bg-neutral-300 disabled:cursor-not-allowed"
              >
                {isSavingProfile ? 'Saving...' : 'Save & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
