import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';
import { ArrowLeft, Mail, Phone, MapPin, Building2, ExternalLink, Plus, Loader2, Upload, X, Check, Edit3, ChevronRight, ChevronDown, ChevronUp, Trash2, FileText, Crop, Eye, EyeOff, Search, Send, MessageSquare, Image, Zap, DollarSign, Palette, QrCode, GitMerge, Percent, Tag, Truck, Users, UserPlus, Copy, AlertTriangle, ShieldCheck, PenTool, RotateCcw } from 'lucide-react';
import { DEFAULT_PORTAL_AGREEMENTS, type PortalAgreementPage } from '../../lib/portalAgreements';
import { SignedAgreementsViewerModal } from '../../components/Portal/PortalAgreementGate';

export interface ColorVariation {
  id: string;
  color: string;
  frontImage: string;
  backImage: string;
  isUploadingFront?: boolean;
  isUploadingBack?: boolean;
}

import { storage, db } from '../../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, getDoc, setDoc, addDoc, collection, query, where, getDocs, updateDoc, deleteDoc, onSnapshot, orderBy } from 'firebase/firestore';
import Cropper from 'react-easy-crop';
import { getCroppedImg, autoCropLogoToPng, processUploadedLogoFile } from '../../lib/cropUtils';
import { ShoppingBag } from 'lucide-react';
import { AddressAutocompleteInput } from '../../components/ui/AddressAutocompleteInput';
import { ShopifyImportModal } from '../../components/Orders/ShopifyImportModal';
import { PortalOrders } from '../Portal/PortalOrders';
import { useOrders } from '../../hooks/useOrders';
import { isPlacedOrder, calculateOrderFinalTotal } from '../../lib/utils';
import { GarmentBrowser, getSwatchColor } from '../../components/shared/GarmentBrowser';
import { Shirt } from 'lucide-react';
import { CustomerPortalQrModal } from '../../components/Customers/CustomerPortalQrModal';
import { ImageLightboxModal } from '../../components/shared/ImageLightboxModal';
import { NewCustomerModal } from './NewCustomerModal';

export function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  
  const { orders } = useOrders(id);

  const pastGarments = useMemo(() => {
    if (!orders) return [];
    const uniqueGarmentsMap: Record<string, any> = {};
    orders.forEach((orderData) => {
      if (orderData.items && Array.isArray(orderData.items)) {
        orderData.items.forEach((item: any) => {
          const styleLower = (item.style || '').toLowerCase();
          const isShipping = styleLower.includes('shipping') || styleLower.includes('delivery') || (item.id && item.id.toString().startsWith('ship-')) || item.itemType === 'shipping';
          const isTax = styleLower.includes('tax');
          if (isShipping || isTax) return;
          
          const styleKey = item.style || item.itemNum;
          if (styleKey && !uniqueGarmentsMap[styleKey]) {
            uniqueGarmentsMap[styleKey] = {
              id: item.id || `past-${Date.now()}-${Math.random()}`,
              style: item.style || 'Custom Garment',
              itemNum: item.itemNum || '',
              image: item.image || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200',
              colors: item.colors || (item.color ? [item.color] : ['Custom Color']),
              price: parseFloat(item.price || 0)
            };
          }
        });
      }
    });
    return Object.values(uniqueGarmentsMap);
  }, [orders]);

  const [liveLogo, setLiveLogo] = useState<string | null>(null);
  const [liveCroppedLogo, setLiveCroppedLogo] = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [liveCustomerData, setLiveCustomerData] = useState<any>({});
  const [fetchingLogo, setFetchingLogo] = useState(true);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);
  const [catalogLinkIds, setCatalogLinkIds] = useState<string[]>([]);
  const [savingLinkId, setSavingLinkId] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCatalogDialogOpen, setIsCatalogDialogOpen] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [isNotesExpanded, setIsNotesExpanded] = useState(false);
  const [noteText, setNoteText] = useState('');

  // New Order State
  const [isNewOrderDialogOpen, setIsNewOrderDialogOpen] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isShopifyMenuOpen, setIsShopifyMenuOpen] = useState(false);
  const [isShopifyImportOpen, setIsShopifyImportOpen] = useState(false);
  
  const initialToday = new Date();
  const initRawDate = initialToday.toLocaleDateString('en-CA'); // Gets YYYY-MM-DD format elegantly

  const [newOrderForm, setNewOrderForm] = useState({
    title: '',
    rawDate: initRawDate,
    date: initialToday.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }),
    fulfillmentType: '',
    statusIndex: 0,
    trackingCarrier: '',
    trackingNumber: ''
  });

  // Edit Company & Portal State
  const [editCompanyForm, setEditCompanyForm] = useState({
    name: '',
    email: '',
    phone: '',
    location: '',
    shippingStreet: '',
    shippingCity: '',
    shippingState: '',
    shippingZip: '',
    type: 'B2C',
    highPriority: false,
    net30Terms: true,
    fulfillmentType: 'Standard',
    disableRack: false,
    taxExempt: false,
    bypassMinimumRequirement: false,
    autoQuotingEnabled: 'inherit' as 'inherit' | 'enabled' | 'disabled',
    allowLocalDelivery: true,
    freeShipping: false,
    requirePortalAgreements: false,
    portalAgreementPages: DEFAULT_PORTAL_AGREEMENTS as PortalAgreementPage[],
    resaleCertificateUrl: '',
    resaleCertificateName: '',
    accountDiscount: {
      enabled: false,
      type: 'percent' as 'percent' | 'fixed',
      value: 0,
      expires: '',
      note: ''
    }
  });
  const [editingAgreementPageId, setEditingAgreementPageId] = useState<string | null>(null);
  const [isSignedAgreementsModalOpen, setIsSignedAgreementsModalOpen] = useState(false);

  const [customPricing, setCustomPricing] = useState<{
    enabled: boolean;
    autoQuotingEnabled: 'inherit' | 'enabled' | 'disabled';
    ladder: { priceAtLowTier?: number; priceAtHighTier?: number; marginFloor?: number };
    costs: any;
  }>({
    enabled: false,
    autoQuotingEnabled: 'inherit',
    ladder: { priceAtLowTier: 5.50, priceAtHighTier: 3.00, marginFloor: 0.35 },
    costs: {}
  });

  const [invoiceForm, setInvoiceForm] = useState({
    brandLogo: 'inktheory' as 'inktheory' | 'xcollab',
    subtitle: "For your Consideration",
    categoryTag: "VCG • ADHOC ORDERS",
    statementOfWork: "This invoice represents the agreed upon deliverables and services as outlined in the project scope.",
    feeSchedule: "Payment is due upon receipt unless otherwise specified in your terms.",
    confidentiality: "Pricing and terms contained within are confidential and intended only for the recipient.",
    footerTagline: "YOUR TRUST IS OUR HIGHEST PRIORITY",
    wireBankName: "Pinnacle Bank",
    wireBankAddress: "2300 West End Avenue\nNashville, TN 37203",
    wireRoutingNumber: "XXXXXXXX",
    wireSwiftCode: "XXXXXXXX",
    wireAccountName: "Catalyst",
    wireAccountNumber: "XXXXXXXX",
    showPayButton: false,
    payButtonText: "CLICK TO PAY BY CREDIT CARD +3.5%",
    payButtonUrl: "https://stripe.com"
  });

  const [isPricingSectionCollapsed, setIsPricingSectionCollapsed] = useState(true);
  const [isInvoiceSectionCollapsed, setIsInvoiceSectionCollapsed] = useState(true);
  const [isGarmentsSectionCollapsed, setIsGarmentsSectionCollapsed] = useState(true);
  const [isVaultSectionCollapsed, setIsVaultSectionCollapsed] = useState(true);
  const [isBrandsSectionCollapsed, setIsBrandsSectionCollapsed] = useState(true);
  const [isDesignerRackCollapsed, setIsDesignerRackCollapsed] = useState(true);
  const [designerRack, setDesignerRack] = useState<any[]>([]);
  const [isDesignerRackModalOpen, setIsDesignerRackModalOpen] = useState(false);
  const [editingDesignerRackId, setEditingDesignerRackId] = useState<string | null>(null);
  const [editingDesignerRackSourceCustomerId, setEditingDesignerRackSourceCustomerId] = useState<string | null>(null);
  const [editingDesignerRackTargetCustomerId, setEditingDesignerRackTargetCustomerId] = useState<string | null>(null);
  const [selectedDesignerRackBrandFilter, setSelectedDesignerRackBrandFilter] = useState<string>('all');
  const [designerRackForm, setDesignerRackForm] = useState<{
    title: string;
    frontMockupUrl: string;
    frontMockupName: string;
    backMockupUrl: string;
    backMockupName: string;
    otherMockups: { id: string; name: string; url: string }[];
    logos: { id: string; name: string; url: string }[];
    psdDriveLink: string;
    garmentSourcingLink: string;
    finalDesignApproved: boolean;
    approvedForOrder: boolean;
  }>({
    title: '',
    frontMockupUrl: '',
    frontMockupName: '',
    backMockupUrl: '',
    backMockupName: '',
    otherMockups: [],
    logos: [],
    psdDriveLink: '',
    garmentSourcingLink: '',
    finalDesignApproved: false,
    approvedForOrder: false
  });
  const [uploadingRackMockupSlot, setUploadingRackMockupSlot] = useState<'front' | 'back' | 'other' | null>(null);
  const [isUploadingRackLogos, setIsUploadingRackLogos] = useState(false);
  const [draggingRackMockupSlot, setDraggingRackMockupSlot] = useState<'front' | 'back' | 'other' | null>(null);
  const [isDraggingRackLogos, setIsDraggingRackLogos] = useState(false);
  const [isSavingDesignerRack, setIsSavingDesignerRack] = useState(false);
  const [subBrands, setSubBrands] = useState<any[]>([]);
  const [isNewBrandModalOpen, setIsNewBrandModalOpen] = useState(false);
  const [deletingBrandId, setDeletingBrandId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setSubBrands([]);
      return;
    }
    const q = query(collection(db, 'customers'), where('parentCustomerId', '==', id));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      list.sort((a: any, b: any) => (a.company || a.contactName || '').localeCompare(b.company || b.contactName || ''));
      setSubBrands(list);
    }, (err) => {
      console.error('Error fetching sub-brands:', err);
    });
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (location.search.includes('rack=open')) {
      setIsDesignerRackCollapsed(false);
    }
  }, [location.search]);

  // Real-time sync for designerRack & assets so team members never overwrite each other
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'customers', id), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (Array.isArray(data.designerRack)) {
        setDesignerRack(data.designerRack);
        setLiveCustomerData((prev: any) => (prev ? { ...prev, designerRack: data.designerRack } : prev));
      }
      if (Array.isArray(data.assets)) {
        setAssets(data.assets);
      }
    });
    return () => unsub();
  }, [id]);

  const handleDeleteBrand = async (e: React.MouseEvent, brandId: string, brandName: string) => {
    e.stopPropagation();
    const display = brandName && brandName !== '-' ? brandName : 'this brand';
    if (!window.confirm(`Are you sure you want to delete "${display}"?\n\nThis will permanently delete the brand profile and remove portal access for all linked users.`)) {
      return;
    }
    setDeletingBrandId(brandId);
    try {
      const userQuery = query(collection(db, 'users'), where('customerId', '==', brandId));
      const userSnap = await getDocs(userQuery);
      await Promise.all(userSnap.docs.map(u => deleteDoc(u.ref)));
      await deleteDoc(doc(db, 'customers', brandId));
    } catch (err: any) {
      console.error('Error deleting brand:', err);
      alert('Failed to delete brand: ' + (err?.message || 'Unknown error'));
    } finally {
      setDeletingBrandId(null);
    }
  };

  const [contacts, setContacts] = useState<any[]>([]);
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [isUploadingResaleCert, setIsUploadingResaleCert] = useState(false);
  const [isDeletingCompany, setIsDeletingCompany] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', role: '', email: '', viewAll: false });

  const handleAddContact = async () => {
    if (!newContact.name || !newContact.email || !id) return;
    try {
      const newUserRef = doc(collection(db, 'users'));
      const newUserObj = {
        id: newUserRef.id,
        email: newContact.email.toLowerCase(),
        name: newContact.name,
        role: 'Client',
        roleDescription: newContact.role || 'Client',
        customerId: id,
        createdAt: new Date().toISOString(),
        viewAll: newContact.viewAll,
        phone: '-',
        companyName: editCompanyForm.name || '-'
      };
      await setDoc(newUserRef, newUserObj);
      
      setContacts([...contacts, {
        id: newUserRef.id,
        name: newContact.name,
        role: newContact.role || 'Client',
        email: newContact.email.toLowerCase(),
        lastLogin: 'Never Logged In',
        viewAll: newContact.viewAll
      }]);
      
      setIsAddingContact(false);
      setNewContact({ name: '', role: '', email: '', viewAll: false });
    } catch (e) {
      console.error("Error adding contact user:", e);
    }
  };

  // Client Team Roster Management
  const ROSTER_SIZES = [
    'YXS', 'YS', 'YM', 'YL', 'YXL',
    'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL',
    'OSFA'
  ];

  const [teamRoster, setTeamRoster] = useState<any[]>([]);
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterSizeFilter, setRosterSizeFilter] = useState('All');
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<any | null>(null);
  const [memberForm, setMemberForm] = useState({
    name: '',
    role: '',
    size: 'M',
    phone: '',
    street1: '',
    street2: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
    notes: ''
  });
  const [isSavingMember, setIsSavingMember] = useState(false);

  const handleOpenAddMemberModal = () => {
    setEditingMember(null);
    setMemberForm({
      name: '',
      role: '',
      size: 'M',
      phone: '',
      street1: '',
      street2: '',
      city: '',
      state: '',
      zip: '',
      country: 'US',
      notes: ''
    });
    setIsMemberModalOpen(true);
  };

  const handleOpenEditMemberModal = (member: any) => {
    setEditingMember(member);
    setMemberForm({
      name: member.name || '',
      role: member.role || '',
      size: member.size || 'M',
      phone: member.phone || '',
      street1: member.street1 || '',
      street2: member.street2 || '',
      city: member.city || '',
      state: member.state || '',
      zip: member.zip || '',
      country: member.country || 'US',
      notes: member.notes || ''
    });
    setIsMemberModalOpen(true);
  };

  const handleCopyCompanyAddressToMember = () => {
    const compStreet = liveCustomerData?.shippingStreet || (customer as any)?.shippingStreet || '';
    const compCity = liveCustomerData?.shippingCity || (customer as any)?.shippingCity || '';
    const compState = liveCustomerData?.shippingState || (customer as any)?.shippingState || '';
    const compZip = liveCustomerData?.shippingZip || (customer as any)?.shippingZip || '';
    
    setMemberForm(prev => ({
      ...prev,
      street1: compStreet || prev.street1,
      city: compCity || prev.city,
      state: compState || prev.state,
      zip: compZip || prev.zip
    }));
  };

  const handleSaveTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !memberForm.name.trim()) return;

    setIsSavingMember(true);
    try {
      let updatedRoster: any[];
      if (editingMember) {
        updatedRoster = teamRoster.map(m => 
          m.id === editingMember.id 
            ? { ...m, ...memberForm, name: memberForm.name.trim(), updatedAt: new Date().toISOString() } 
            : m
        );
      } else {
        const newMember = {
          id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          ...memberForm,
          name: memberForm.name.trim(),
          createdAt: new Date().toISOString()
        };
        updatedRoster = [...teamRoster, newMember];
      }

      await updateDoc(doc(db, 'customers', id), {
        teamRoster: updatedRoster
      });

      setTeamRoster(updatedRoster);
      setLiveCustomerData((prev: any) => prev ? { ...prev, teamRoster: updatedRoster } : prev);
      setIsMemberModalOpen(false);
      setEditingMember(null);
    } catch (err) {
      console.error("Error saving team member:", err);
      alert("Failed to save team member. Please try again.");
    } finally {
      setIsSavingMember(false);
    }
  };

  const handleDeleteTeamMember = async (memberId: string, memberName: string) => {
    if (!id) return;
    if (!window.confirm(`Are you sure you want to remove ${memberName || 'this team member'} from the roster?`)) return;

    try {
      const updatedRoster = teamRoster.filter(m => m.id !== memberId);
      await updateDoc(doc(db, 'customers', id), {
        teamRoster: updatedRoster
      });
      setTeamRoster(updatedRoster);
      setLiveCustomerData((prev: any) => prev ? { ...prev, teamRoster: updatedRoster } : prev);
    } catch (err) {
      console.error("Error deleting team member:", err);
      alert("Failed to delete team member.");
    }
  };

  const filteredTeamMembers = useMemo(() => {
    return teamRoster.filter(m => {
      if (rosterSizeFilter !== 'All' && m.size !== rosterSizeFilter) return false;
      if (rosterSearch.trim()) {
        const query = rosterSearch.toLowerCase().trim();
        const nameMatch = (m.name || '').toLowerCase().includes(query);
        const roleMatch = (m.role || '').toLowerCase().includes(query);
        const sizeMatch = (m.size || '').toLowerCase().includes(query);
        const cityMatch = (m.city || '').toLowerCase().includes(query);
        const streetMatch = (m.street1 || '').toLowerCase().includes(query);
        return nameMatch || roleMatch || sizeMatch || cityMatch || streetMatch;
      }
      return true;
    });
  }, [teamRoster, rosterSearch, rosterSizeFilter]);

  const rosterSizeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    teamRoster.forEach(m => {
      const s = m.size || 'Unspecified';
      counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  }, [teamRoster]);

  const [suggestedItems, setSuggestedItems] = useState<any[]>([]);
  const [sampleItems, setSampleItems] = useState<any[]>([]);
  const [activeGarmentTab, setActiveGarmentTab] = useState<'suggested' | 'samples' | 'past'>('suggested');
  const [suggestedModalType, setSuggestedModalType] = useState<'suggested' | 'sample'>('suggested');
  const [assets, setAssets] = useState<any[]>([]);
  const [isAddingSuggestedModalOpen, setIsAddingSuggestedModalOpen] = useState(false);
  const [editingSuggestedItem, setEditingSuggestedItem] = useState<any | null>(null);
  const [customSuggestedItem, setCustomSuggestedItem] = useState({
    style: '',
    itemNum: '',
    description: '',
    image: '',
    colors: '',
    price: '',
    gender: 'Unisex',
    visible: true
  });
  const [isUploadingLogoVault, setIsUploadingLogoVault] = useState(false);
  const [isUploadingMockup, setIsUploadingMockup] = useState(false);
  const [uploadingDeckItemKey, setUploadingDeckItemKey] = useState<string | null>(null);
  const [isGarmentBrowserOpen, setIsGarmentBrowserOpen] = useState(false);
  const [selectedSanMarProduct, setSelectedSanMarProduct] = useState<any | null>(null);
  const [selectedColors, setSelectedColors] = useState<Record<string, boolean>>({});
  const [selectedInitialColor, setSelectedInitialColor] = useState<string>('');

  const [allOtherSuggestions, setAllOtherSuggestions] = useState<any[]>([]);
  const [suggestionsSearchQuery, setSuggestionsSearchQuery] = useState('');
  const [colorVariations, setColorVariations] = useState<ColorVariation[]>([]);

  const handleAddColorVariation = (colorName = '') => {
    setColorVariations(prev => {
      const next = [
        ...prev,
        {
          id: `col-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          color: colorName,
          frontImage: '',
          backImage: ''
        }
      ];
      if (colorName) {
        setCustomSuggestedItem(curr => ({
          ...curr,
          colors: next.map(cv => cv.color).filter(Boolean).join(', ')
        }));
        setSelectedColors(curr => ({ ...curr, [colorName]: true }));
      }
      return next;
    });
  };

  const handleAddQuickColors = (colorsArr: string[]) => {
    setColorVariations(prev => {
      const existingNames = new Set(prev.map(c => c.color.toLowerCase().trim()));
      const newVars: ColorVariation[] = [];
      colorsArr.forEach(col => {
        if (!existingNames.has(col.toLowerCase().trim())) {
          newVars.push({
            id: `col-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            color: col,
            frontImage: '',
            backImage: ''
          });
        }
      });
      const next = [...prev, ...newVars];
      setCustomSuggestedItem(curr => ({
        ...curr,
        colors: next.map(cv => cv.color).filter(Boolean).join(', ')
      }));
      setSelectedColors(curr => {
        const nextSel = { ...curr };
        colorsArr.forEach(c => { nextSel[c] = true; });
        return nextSel;
      });
      return next;
    });
  };

  const handleRemoveColorVariation = (varId: string) => {
    const removedVar = colorVariations.find(c => c.id === varId);
    if (removedVar) {
      const cNorm = removedVar.color.toLowerCase().trim();
      setSelectedColors(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => {
          if (k.toLowerCase().trim() === cNorm) {
            next[k] = false;
          }
        });
        return next;
      });
    }
    setColorVariations(prev => {
      const next = prev.filter(c => c.id !== varId);
      setCustomSuggestedItem(curr => ({
        ...curr,
        colors: next.map(cv => cv.color).filter(Boolean).join(', ')
      }));
      return next;
    });
  };

  const handleUpdateColorVariation = (varId: string, updates: Partial<ColorVariation>) => {
    setColorVariations(prev => {
      const next = prev.map(c => c.id === varId ? { ...c, ...updates } : c);
      if (updates.color !== undefined) {
        setCustomSuggestedItem(curr => ({
          ...curr,
          colors: next.map(cv => cv.color).filter(Boolean).join(', ')
        }));
      }
      return next;
    });
  };

  const handleUploadColorMockup = async (varId: string, side: 'front' | 'back', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    
    handleUpdateColorVariation(varId, { [side === 'front' ? 'isUploadingFront' : 'isUploadingBack']: true });

    try {
      const storageRef = ref(storage, `suggested_items/${id}/${Date.now()}_${side}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);
      
      setColorVariations(prev => prev.map(c => {
        if (c.id !== varId) return c;
        return {
          ...c,
          [side === 'front' ? 'frontImage' : 'backImage']: downloadUrl,
          [side === 'front' ? 'isUploadingFront' : 'isUploadingBack']: false
        };
      }));

      if (side === 'front' && !customSuggestedItem.image) {
        setCustomSuggestedItem(prev => ({ ...prev, image: downloadUrl }));
      }
    } catch (err) {
      console.error(`Upload ${side} mockup failed:`, err);
      alert(`Failed to upload ${side} mockup image.`);
      handleUpdateColorVariation(varId, { [side === 'front' ? 'isUploadingFront' : 'isUploadingBack']: false });
    }
  };

  const openEditModal = (item: any, type: 'suggested' | 'sample') => {
    setEditingSuggestedItem(item);
    setSuggestedModalType(type);
    setCustomSuggestedItem({
      style: item.style || '',
      itemNum: item.itemNum || '',
      description: item.description || '',
      image: item.image || '',
      colors: Array.isArray(item.colors) ? item.colors.join(', ') : (item.colors || ''),
      price: String(item.price || ''),
      gender: item.gender || 'Unisex',
      visible: item.visible ?? true
    });

    const rawColors: string[] = Array.isArray(item.colors) 
      ? item.colors 
      : (typeof item.colors === 'string' && item.colors ? item.colors.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
    
    const itemImages = item.images || {};
    const itemBackImages = item.backImages || {};

    // Only fallback to image keys if rawColors is empty, otherwise deleted colors will resurrect!
    const allColorNames = rawColors.length > 0 
      ? rawColors 
      : Array.from(new Set([
          ...Object.keys(itemImages),
          ...Object.keys(itemBackImages)
        ])).filter(Boolean);

    if (allColorNames.length === 0 && item.image) {
      allColorNames.push('Custom Color');
    }

    const initialVariations: ColorVariation[] = allColorNames.map((c, i) => ({
      id: `col-${Date.now()}-${i}-${Math.random().toString(36).substring(7)}`,
      color: c,
      frontImage: itemImages[c] || (i === 0 && typeof item.image === 'string' ? item.image : ''),
      backImage: itemBackImages[c] || ''
    }));

    const initialColors: Record<string, boolean> = {};
    allColorNames.forEach((c: string) => {
      initialColors[c] = true;
    });
    setSelectedColors(initialColors);

    setColorVariations(initialVariations);
    setIsAddingSuggestedModalOpen(true);
  };

  useEffect(() => {
    if (!isAddingSuggestedModalOpen) return;
    
    const fetchOtherSuggestions = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'customers'));
        const suggestions: any[] = [];
        const seenKeys = new Set<string>();
        
        querySnapshot.forEach((docSnap) => {
          if (docSnap.id === id) return;
          const data = docSnap.data();
          const items = [
            ...(data.suggestedItems || []),
            ...(data.sampleItems || [])
          ];
          
          items.forEach((item: any) => {
            const style = item.style || item.name || '';
            const itemNum = item.itemNum || '';
            const image = item.image || '';
            const key = `${style.trim()}_${itemNum.trim()}_${image.trim()}`;
            
            if (style && !seenKeys.has(key)) {
              seenKeys.add(key);
              suggestions.push({
                ...item,
                fromCustomer: data.company || data.contactName || 'Other Customer'
              });
            }
          });
        });
        
        suggestions.sort((a, b) => (a.style || '').localeCompare(b.style || ''));
        setAllOtherSuggestions(suggestions);
      } catch (err) {
        console.error("Failed to fetch other customer suggestions:", err);
      }
    };
    
    fetchOtherSuggestions();
  }, [isAddingSuggestedModalOpen, id]);

  const handleMockupUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setIsUploadingMockup(true);
    try {
      const storageRef = ref(storage, `suggested_items/${id}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);
      setCustomSuggestedItem(prev => ({ ...prev, image: downloadUrl }));
      alert("Mockup uploaded successfully!");
    } catch (err) {
      console.error("Upload mockup failed:", err);
      alert("Failed to upload mockup image.");
    } finally {
      setIsUploadingMockup(false);
    }
  };

  const handleDeckItemMockupUpload = async (item: any, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    const itemKey = item.itemNum || item.garment_id || item.sku || item.style || item.id || '';
    if (!itemKey) {
      alert("Cannot identify item unique key.");
      return;
    }
    setUploadingDeckItemKey(itemKey);
    try {
      const storageRef = ref(storage, `deck_mockups/${id}/${itemKey}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);
      
      const updatedOverrides = {
        ...(liveCustomerData?.deckMockupOverrides || {}),
        [itemKey]: downloadUrl
      };

      await updateDoc(doc(db, 'customers', id), {
        deckMockupOverrides: updatedOverrides
      });

      setLiveCustomerData((prev: any) => ({
        ...prev,
        deckMockupOverrides: updatedOverrides
      }));

      alert("Deck item mockup updated successfully!");
    } catch (err) {
      console.error("Upload deck mockup failed:", err);
      alert("Failed to upload mockup image.");
    } finally {
      setUploadingDeckItemKey(null);
    }
  };

  const handleRemoveDeckItemMockupOverride = async (item: any) => {
    if (!id || !window.confirm("Restore original catalog mockup image for this item?")) return;
    const itemKey = item.itemNum || item.garment_id || item.sku || item.style || item.id || '';
    if (!itemKey) return;
    
    setUploadingDeckItemKey(itemKey);
    try {
      const updatedOverrides = { ...(liveCustomerData?.deckMockupOverrides || {}) };
      delete updatedOverrides[itemKey];

      await updateDoc(doc(db, 'customers', id), {
        deckMockupOverrides: updatedOverrides
      });

      setLiveCustomerData((prev: any) => ({
        ...prev,
        deckMockupOverrides: updatedOverrides
      }));

      alert("Restored original mockup.");
    } catch (err) {
      console.error("Remove deck mockup override failed:", err);
      alert("Failed to remove mockup override.");
    } finally {
      setUploadingDeckItemKey(null);
    }
  };

  const handleSelectSanMarGarment = (product: any, initialColor: string) => {
    const swatchImg = product.images[initialColor];
    const swatchUrl = swatchImg ? (typeof swatchImg === 'string' ? swatchImg : swatchImg.front) : '';
    setCustomSuggestedItem({
      style: `${product.brand} ${product.title}`.trim(),
      itemNum: product.style,
      description: product.description || '',
      image: swatchUrl || (Object.values(product.images)[0] as any)?.front || (Object.values(product.images)[0] as any) || '',
      colors: product.colors.join(', '),
      price: product.price.toString(),
      gender: 'Unisex',
      visible: true
    });
    setSelectedSanMarProduct(product);
    setSelectedInitialColor(initialColor);
    const initialColors: Record<string, boolean> = {};
    product.colors.forEach((c: string) => {
      initialColors[c] = true;
    });
    setSelectedColors(initialColors);

    // Pre-populate colorVariations from SanMar product colors & images
    const sanMarVariations: ColorVariation[] = (product.colors || []).map((c: string, i: number) => {
      const imgSet = product.images?.[c];
      const frontUrl = imgSet ? (typeof imgSet === 'string' ? imgSet : imgSet.front || '') : '';
      const backUrl = imgSet && typeof imgSet !== 'string' ? imgSet.back || '' : '';
      return {
        id: `col-${Date.now()}-${i}`,
        color: c,
        frontImage: frontUrl,
        backImage: backUrl
      };
    });
    setColorVariations(sanMarVariations);

    setIsGarmentBrowserOpen(false);
  };

  const handleAddSuggestedItem = async (garmentToAdd?: any) => {
    if (!id) return;
    const isSample = suggestedModalType === 'sample';
    let itemObj: any = {};
    if (garmentToAdd) {
      itemObj = {
        id: isSample ? `samp-${Date.now()}` : `sugg-${Date.now()}`,
        style: garmentToAdd.style || garmentToAdd.name || garmentToAdd.garment_name || (isSample ? 'Sample Garment' : 'Suggested Garment'),
        itemNum: garmentToAdd.itemNum || garmentToAdd.garment_id || garmentToAdd.sku || '',
        description: garmentToAdd.description || '',
        image: garmentToAdd.image || garmentToAdd.original_image || garmentToAdd.mockup_image || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200',
        colors: garmentToAdd.colors || ['Custom Color'],
        images: garmentToAdd.images || {},
        backImages: garmentToAdd.backImages || {},
        price: parseFloat(garmentToAdd.price || garmentToAdd.msrp || 0),
        gender: garmentToAdd.gender || 'Unisex',
        ...(isSample ? { visible: garmentToAdd.visible ?? true } : {})
      };
    } else {
      if (!customSuggestedItem.style) {
        alert("Please enter at least a style or garment name.");
        return;
      }

      let finalColors: string[] = [];
      let imagesMap: Record<string, string> = {};
      let backImagesMap: Record<string, string> = {};
      let mainImage = customSuggestedItem.image || '';

      // If color variations are present, they are the primary source of truth for color options & mockups!
      if (colorVariations.length > 0) {
        colorVariations.forEach(cv => {
          const cName = cv.color.trim();
          if (!cName) return;
          finalColors.push(cName);

          let defaultFront = '';
          let defaultBack = '';
          if (selectedSanMarProduct) {
            const imgSet = selectedSanMarProduct.images?.[cName] || selectedSanMarProduct.images?.[cv.color];
            defaultFront = imgSet ? (typeof imgSet === 'string' ? imgSet : imgSet.front) : '';
            defaultBack = imgSet && typeof imgSet !== 'string' ? imgSet.back : '';
          }

          const frontUrl = cv.frontImage || defaultFront;
          const backUrl = cv.backImage || defaultBack;

          if (frontUrl) imagesMap[cName] = frontUrl;
          if (backUrl) backImagesMap[cName] = backUrl;
        });

        if (!mainImage) {
          const firstFront = colorVariations.find(cv => !!cv.frontImage)?.frontImage;
          if (firstFront) {
            mainImage = firstFront;
          } else if (finalColors.length > 0 && imagesMap[finalColors[0]]) {
            mainImage = imagesMap[finalColors[0]];
          }
        }
      } else if (selectedSanMarProduct) {
        const chosenColors = selectedSanMarProduct.colors.filter((c: string) => !!selectedColors[c]);
        if (chosenColors.length > 0) {
          finalColors = chosenColors;
          chosenColors.forEach((color: string) => {
            const imgSet = selectedSanMarProduct.images[color];
            const defaultFront = imgSet ? (typeof imgSet === 'string' ? imgSet : imgSet.front) : '';
            const defaultBack = imgSet && typeof imgSet !== 'string' ? imgSet.back : '';

            if (defaultFront) imagesMap[color] = defaultFront;
            if (defaultBack) backImagesMap[color] = defaultBack;
          });
          const defaultColor = (selectedInitialColor && chosenColors.includes(selectedInitialColor))
            ? selectedInitialColor
            : chosenColors[0];
          if (defaultColor && imagesMap[defaultColor] && !mainImage) {
            mainImage = imagesMap[defaultColor];
          }
        }
      } else if (customSuggestedItem.colors) {
        finalColors = customSuggestedItem.colors.split(',').map(s => s.trim()).filter(Boolean);
      }

      if (finalColors.length === 0) {
        finalColors = ['Custom Color'];
      }

      if (!mainImage) {
        mainImage = 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';
      }

      itemObj = {
        id: editingSuggestedItem ? editingSuggestedItem.id : (isSample ? `samp-${Date.now()}` : `sugg-${Date.now()}`),
        style: customSuggestedItem.style,
        itemNum: customSuggestedItem.itemNum || '',
        description: customSuggestedItem.description || '',
        image: mainImage,
        colors: finalColors,
        images: imagesMap,
        backImages: backImagesMap,
        price: parseFloat(customSuggestedItem.price) || 0,
        gender: customSuggestedItem.gender || 'Unisex',
        hasFixedColors: true,
        isSuggested: !isSample,
        isSample: isSample,
        ...(isSample ? { visible: customSuggestedItem.visible ?? true } : {})
      };
    }

    const currentList = isSample ? sampleItems : suggestedItems;
    const updated = editingSuggestedItem
      ? currentList.map(item => item.id === editingSuggestedItem.id ? itemObj : item)
      : [...currentList, itemObj];
      
    try {
      if (isSample) {
        await updateDoc(doc(db, 'customers', id), {
          sampleItems: updated
        });
        setSampleItems(updated);
      } else {
        await updateDoc(doc(db, 'customers', id), {
          suggestedItems: updated
        });
        setSuggestedItems(updated);
      }
      setIsAddingSuggestedModalOpen(false);
      setCustomSuggestedItem({ style: '', itemNum: '', description: '', image: '', colors: '', price: '', gender: 'Unisex', visible: true });
      setColorVariations([]);
      setEditingSuggestedItem(null);
      setSelectedSanMarProduct(null);
      setSelectedColors({});
      setSelectedInitialColor('');
      setSuggestionsSearchQuery('');
    } catch (err) {
      console.error(`Error saving ${isSample ? 'sample' : 'suggested'} item:`, err);
      alert(`Failed to save ${isSample ? 'sample' : 'suggested'} garment.`);
    }
  };

  const handleDeleteSuggestedItem = async (itemId: string) => {
    if (!id) return;
    if (!window.confirm("Remove this suggested garment?")) return;
    
    const updated = suggestedItems.filter(item => item.id !== itemId);
    try {
      await updateDoc(doc(db, 'customers', id), {
        suggestedItems: updated
      });
      setSuggestedItems(updated);
    } catch (err) {
      console.error("Error deleting suggested item:", err);
    }
  };

  const handleDeleteSampleItem = async (itemId: string) => {
    if (!id) return;
    if (!window.confirm("Remove this sample garment?")) return;
    
    const updated = sampleItems.filter(item => item.id !== itemId);
    try {
      await updateDoc(doc(db, 'customers', id), {
        sampleItems: updated
      });
      setSampleItems(updated);
    } catch (err) {
      console.error("Error deleting sample item:", err);
      alert("Failed to delete sample garment.");
    }
  };

  const handleToggleSampleVisibility = async (itemId: string, currentVisible: boolean) => {
    if (!id) return;
    const updated = sampleItems.map(item => 
      item.id === itemId ? { ...item, visible: !currentVisible } : item
    );
    try {
      await updateDoc(doc(db, 'customers', id), {
        sampleItems: updated
      });
      setSampleItems(updated);
    } catch (err) {
      console.error("Error toggling sample visibility:", err);
      alert("Failed to update visibility.");
    }
  };

  const handleUploadLogoVault = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;

    setIsUploadingLogoVault(true);
    try {
      const fileToUpload = await processUploadedLogoFile(file);
      const storageRef = ref(storage, `portal/${id}/vault/${Date.now()}_${fileToUpload.name}`);
      await uploadBytes(storageRef, fileToUpload);
      const downloadUrl = await getDownloadURL(storageRef);

      const newAsset = {
        id: `asset-${Date.now()}`,
        name: fileToUpload.name,
        url: downloadUrl,
        uploadedAt: new Date().toISOString()
      };

      const updated = [...assets, newAsset];
      
      await updateDoc(doc(db, 'customers', id), {
        assets: updated
      });

      setAssets(updated);
      alert("Logo uploaded to vault!");
    } catch (err) {
      console.error("Vault logo upload failed:", err);
      alert("Failed to upload logo to vault.");
    } finally {
      setIsUploadingLogoVault(false);
    }
  };

  const handleDeleteVaultLogo = async (assetId: string) => {
    if (!id) return;
    if (!window.confirm("Delete this logo from the customer vault?")) return;

    const updated = assets.filter(a => a.id !== assetId);
    try {
      await updateDoc(doc(db, 'customers', id), {
        assets: updated
      });
      setAssets(updated);
    } catch (err) {
      console.error("Error deleting vault logo:", err);
    }
  };

  const combinedDesignerRack = useMemo(() => {
    const parentName = editCompanyForm.name || liveCustomerData?.company || liveCustomerData?.contactName || 'Parent Company';
    const ownItems = (Array.isArray(designerRack) ? designerRack : []).map((d: any) => ({
      ...d,
      _sourceCustomerId: id || '',
      _sourceCustomerName: parentName,
      _isSubBrand: false
    }));
    const brandItems = (Array.isArray(subBrands) ? subBrands : []).flatMap((b: any) => {
      const bName = b.company || b.contactName || 'Sub-Brand';
      const bRack = Array.isArray(b.designerRack) ? b.designerRack : [];
      return bRack.map((d: any) => ({
        ...d,
        _sourceCustomerId: b.id,
        _sourceCustomerName: bName,
        _isSubBrand: true
      }));
    });
    return [...ownItems, ...brandItems];
  }, [designerRack, subBrands, id, editCompanyForm.name, liveCustomerData?.company, liveCustomerData?.contactName]);

  const filteredDesignerRack = useMemo(() => {
    if (selectedDesignerRackBrandFilter === 'all') return combinedDesignerRack;
    return combinedDesignerRack.filter((d: any) => d._sourceCustomerId === selectedDesignerRackBrandFilter);
  }, [combinedDesignerRack, selectedDesignerRackBrandFilter]);

  const handleOpenNewDesignerRackModal = () => {
    setEditingDesignerRackId(null);
    setEditingDesignerRackSourceCustomerId(null);
    setEditingDesignerRackTargetCustomerId(
      selectedDesignerRackBrandFilter !== 'all' ? selectedDesignerRackBrandFilter : (id || null)
    );
    setDesignerRackForm({
      title: '',
      frontMockupUrl: '',
      frontMockupName: '',
      backMockupUrl: '',
      backMockupName: '',
      otherMockups: [],
      logos: [],
      psdDriveLink: '',
      garmentSourcingLink: '',
      finalDesignApproved: false,
      approvedForOrder: false
    });
    setIsDesignerRackModalOpen(true);
  };

  const handleOpenEditDesignerRackModal = (design: any) => {
    setEditingDesignerRackId(design.id);
    const sourceCustId = design._sourceCustomerId || id || null;
    setEditingDesignerRackSourceCustomerId(sourceCustId);
    setEditingDesignerRackTargetCustomerId(sourceCustId);
    const legacyMockups: { id: string; name: string; url: string }[] = Array.isArray(design.mockups)
      ? design.mockups
      : [];
    const frontUrl = design.frontMockupUrl || legacyMockups[0]?.url || design.mockupUrl || design.url || '';
    const frontName = design.frontMockupName || legacyMockups[0]?.name || design.mockupName || design.name || '';
    const backUrl = design.backMockupUrl || legacyMockups[1]?.url || '';
    const backName = design.backMockupName || legacyMockups[1]?.name || '';
    const existingOther: { id: string; name: string; url: string }[] = Array.isArray(design.otherMockups)
      ? design.otherMockups
      : legacyMockups.length > 2
      ? legacyMockups.slice(2)
      : [];

    setDesignerRackForm({
      title: design.title || design.name || '',
      frontMockupUrl: frontUrl,
      frontMockupName: frontName,
      backMockupUrl: backUrl,
      backMockupName: backName,
      otherMockups: existingOther,
      logos: Array.isArray(design.logos) ? design.logos : [],
      psdDriveLink: design.psdDriveLink || '',
      garmentSourcingLink: design.garmentSourcingLink || '',
      finalDesignApproved: Boolean(design.finalDesignApproved),
      approvedForOrder: Boolean(design.approvedForOrder)
    });
    setIsDesignerRackModalOpen(true);
  };

  const autoPersistEditingDesignerRack = async (
    nextForm: typeof designerRackForm,
    overrideTargetCustomerId?: string
  ) => {
    const targetCustomerId = overrideTargetCustomerId || editingDesignerRackTargetCustomerId || id;
    const sourceCustomerId = editingDesignerRackSourceCustomerId || targetCustomerId;
    if (!targetCustomerId || !editingDesignerRackId) return;
    try {
      const custRef = doc(db, 'customers', targetCustomerId);
      const latestSnap = await getDoc(custRef);
      const fallbackRack = targetCustomerId === id
        ? designerRack
        : (subBrands.find(b => b.id === targetCustomerId)?.designerRack || []);
      const latestRack: any[] = latestSnap.exists() && Array.isArray(latestSnap.data().designerRack)
        ? latestSnap.data().designerRack
        : fallbackRack;

      const displayTitle = nextForm.title.trim();
      const primaryMockupUrl =
        nextForm.frontMockupUrl ||
        nextForm.backMockupUrl ||
        nextForm.otherMockups[0]?.url ||
        '';
      const primaryMockupName =
        nextForm.frontMockupName ||
        nextForm.backMockupName ||
        nextForm.otherMockups[0]?.name ||
        '';
      const combinedMockups: { id: string; name: string; url: string }[] = [
        ...(nextForm.frontMockupUrl
          ? [{ id: 'front', name: nextForm.frontMockupName || 'Front Mock-up', url: nextForm.frontMockupUrl }]
          : []),
        ...(nextForm.backMockupUrl
          ? [{ id: 'back', name: nextForm.backMockupName || 'Back Mock-up', url: nextForm.backMockupUrl }]
          : []),
        ...nextForm.otherMockups
      ];

      let existingDesignItem: any = latestRack.find(d => d.id === editingDesignerRackId);

      if (sourceCustomerId && sourceCustomerId !== targetCustomerId) {
        const sourceRef = doc(db, 'customers', sourceCustomerId);
        const sourceSnap = await getDoc(sourceRef);
        const sourceFallbackRack = sourceCustomerId === id
          ? designerRack
          : (subBrands.find(b => b.id === sourceCustomerId)?.designerRack || []);
        const sourceLatestRack: any[] = sourceSnap.exists() && Array.isArray(sourceSnap.data().designerRack)
          ? sourceSnap.data().designerRack
          : sourceFallbackRack;

        if (!existingDesignItem) {
          existingDesignItem = sourceLatestRack.find(d => d.id === editingDesignerRackId);
        }

        const filteredSourceRack = sourceLatestRack.filter(d => d.id !== editingDesignerRackId);
        await updateDoc(sourceRef, { designerRack: filteredSourceRack });
        if (sourceCustomerId === id) {
          setDesignerRack(filteredSourceRack);
          setLiveCustomerData((prev: any) => (prev ? { ...prev, designerRack: filteredSourceRack } : prev));
        }
      }

      const baseItem = existingDesignItem || { id: editingDesignerRackId, uploadedAt: new Date().toISOString() };
      const updatedItem = {
        ...baseItem,
        title: displayTitle || baseItem.title || baseItem.name || 'Untitled Design',
        name: displayTitle || baseItem.name || baseItem.title || 'Untitled Design',
        frontMockupUrl: nextForm.frontMockupUrl,
        frontMockupName: nextForm.frontMockupName,
        backMockupUrl: nextForm.backMockupUrl,
        backMockupName: nextForm.backMockupName,
        otherMockups: nextForm.otherMockups,
        mockupUrl: primaryMockupUrl,
        mockupName: primaryMockupName,
        mockups: combinedMockups,
        url: primaryMockupUrl,
        logos: nextForm.logos,
        psdDriveLink: nextForm.psdDriveLink.trim(),
        garmentSourcingLink: nextForm.garmentSourcingLink.trim(),
        finalDesignApproved: Boolean(nextForm.finalDesignApproved),
        finalDesignApprovedNotificationRead:
          Boolean(nextForm.finalDesignApproved) && !baseItem.finalDesignApproved
            ? false
            : Boolean(baseItem.finalDesignApprovedNotificationRead),
        approvedForOrder: Boolean(nextForm.approvedForOrder),
        approvedForOrderNotificationRead:
          Boolean(nextForm.approvedForOrder) && !baseItem.approvedForOrder
            ? false
            : Boolean(baseItem.approvedForOrderNotificationRead),
        updatedAt: new Date().toISOString()
      };

      const existsInTarget = latestRack.some(d => d.id === editingDesignerRackId);
      const updated = existsInTarget
        ? latestRack.map(d => (d.id === editingDesignerRackId ? updatedItem : d))
        : [...latestRack, updatedItem];

      await updateDoc(custRef, { designerRack: updated });
      if (targetCustomerId === id) {
        setDesignerRack(updated);
        setLiveCustomerData((prev: any) => (prev ? { ...prev, designerRack: updated } : prev));
      }
      setEditingDesignerRackSourceCustomerId(targetCustomerId);
    } catch (err) {
      console.error("Failed to auto-persist Designer Rack edit:", err);
    }
  };

  const uploadRackMockupForSlot = async (slot: 'front' | 'back' | 'other', files: FileList | File[]) => {
    const targetCustomerId = editingDesignerRackTargetCustomerId || id;
    if (!files || files.length === 0 || !targetCustomerId) return;

    setUploadingRackMockupSlot(slot);
    try {
      if (slot === 'front' || slot === 'back') {
        const file = files[0];
        const storageRef = ref(storage, `customers/${targetCustomerId}/designer_rack/mockups/${Date.now()}_${slot}_${file.name}`);
        await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(storageRef);
        const nextForm =
          slot === 'front'
            ? { ...designerRackForm, frontMockupUrl: downloadUrl, frontMockupName: file.name }
            : { ...designerRackForm, backMockupUrl: downloadUrl, backMockupName: file.name };
        setDesignerRackForm(nextForm);
        await autoPersistEditingDesignerRack(nextForm);
      } else {
        const uploadedOthers: { id: string; name: string; url: string }[] = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const storageRef = ref(storage, `customers/${targetCustomerId}/designer_rack/mockups/${Date.now()}_other_${i}_${file.name}`);
          await uploadBytes(storageRef, file);
          const downloadUrl = await getDownloadURL(storageRef);
          uploadedOthers.push({
            id: `rack-other-mockup-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
            name: file.name,
            url: downloadUrl
          });
        }
        const nextForm = {
          ...designerRackForm,
          otherMockups: [...designerRackForm.otherMockups, ...uploadedOthers]
        };
        setDesignerRackForm(nextForm);
        await autoPersistEditingDesignerRack(nextForm);
      }
    } catch (err) {
      console.error("Designer Rack mockup upload failed:", err);
      alert("Failed to upload mock-up file(s).");
    } finally {
      setUploadingRackMockupSlot(null);
    }
  };

  const handleUploadRackMockupForSlot = async (
    slot: 'front' | 'back' | 'other',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (e.target.files && e.target.files.length > 0) {
      await uploadRackMockupForSlot(slot, e.target.files);
    }
    e.target.value = '';
  };

  const handleRemoveOtherMockupFromForm = (mockupId: string) => {
    const nextForm = {
      ...designerRackForm,
      otherMockups: designerRackForm.otherMockups.filter(m => m.id !== mockupId)
    };
    setDesignerRackForm(nextForm);
    void autoPersistEditingDesignerRack(nextForm);
  };

  const uploadRackLogoFiles = async (files: FileList | File[]) => {
    const targetCustomerId = editingDesignerRackTargetCustomerId || id;
    if (!files || files.length === 0 || !targetCustomerId) return;

    setIsUploadingRackLogos(true);
    try {
      const uploadedLogos: { id: string; name: string; url: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const storageRef = ref(storage, `customers/${targetCustomerId}/designer_rack/logos/${Date.now()}_${i}_${file.name}`);
        await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(storageRef);
        uploadedLogos.push({
          id: `rack-logo-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
          name: file.name,
          url: downloadUrl
        });
      }
      const nextForm = {
        ...designerRackForm,
        logos: [...designerRackForm.logos, ...uploadedLogos]
      };
      setDesignerRackForm(nextForm);
      await autoPersistEditingDesignerRack(nextForm);
    } catch (err) {
      console.error("Designer Rack logo upload failed:", err);
      alert("Failed to upload logo file(s).");
    } finally {
      setIsUploadingRackLogos(false);
    }
  };

  const handleUploadRackLogos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await uploadRackLogoFiles(e.target.files);
    }
    e.target.value = '';
  };

  const handleRemoveRackLogoFromForm = (logoId: string) => {
    const nextForm = {
      ...designerRackForm,
      logos: designerRackForm.logos.filter(l => l.id !== logoId)
    };
    setDesignerRackForm(nextForm);
    void autoPersistEditingDesignerRack(nextForm);
  };

  const handleSaveDesignerRackModal = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetCustomerId = editingDesignerRackTargetCustomerId || id;
    if (!targetCustomerId) return;
    if (!designerRackForm.title.trim()) {
      alert("Please enter a title for what the garment should be called.");
      return;
    }
    if (
      !designerRackForm.frontMockupUrl &&
      !designerRackForm.backMockupUrl &&
      designerRackForm.otherMockups.length === 0 &&
      designerRackForm.logos.length === 0 &&
      !designerRackForm.psdDriveLink.trim() &&
      !designerRackForm.garmentSourcingLink.trim()
    ) {
      alert("Please upload a mock-up/logo or enter a link before saving.");
      return;
    }

    setIsSavingDesignerRack(true);
    try {
      const custRef = doc(db, 'customers', targetCustomerId);
      const latestSnap = await getDoc(custRef);
      const fallbackRack = targetCustomerId === id
        ? designerRack
        : (subBrands.find(b => b.id === targetCustomerId)?.designerRack || []);
      const latestRack: any[] = latestSnap.exists() && Array.isArray(latestSnap.data().designerRack)
        ? latestSnap.data().designerRack
        : fallbackRack;

      const displayTitle = designerRackForm.title.trim();
      const primaryMockupUrl =
        designerRackForm.frontMockupUrl ||
        designerRackForm.backMockupUrl ||
        designerRackForm.otherMockups[0]?.url ||
        '';
      const primaryMockupName =
        designerRackForm.frontMockupName ||
        designerRackForm.backMockupName ||
        designerRackForm.otherMockups[0]?.name ||
        '';
      const combinedMockups: { id: string; name: string; url: string }[] = [
        ...(designerRackForm.frontMockupUrl
          ? [{ id: 'front', name: designerRackForm.frontMockupName || 'Front Mock-up', url: designerRackForm.frontMockupUrl }]
          : []),
        ...(designerRackForm.backMockupUrl
          ? [{ id: 'back', name: designerRackForm.backMockupName || 'Back Mock-up', url: designerRackForm.backMockupUrl }]
          : []),
        ...designerRackForm.otherMockups
      ];

      let updated: any[];
      if (editingDesignerRackId) {
        const sourceCustomerId = editingDesignerRackSourceCustomerId || targetCustomerId;
        let existingDesignItem: any = latestRack.find(d => d.id === editingDesignerRackId);

        if (sourceCustomerId && sourceCustomerId !== targetCustomerId) {
          const sourceRef = doc(db, 'customers', sourceCustomerId);
          const sourceSnap = await getDoc(sourceRef);
          const sourceFallbackRack = sourceCustomerId === id
            ? designerRack
            : (subBrands.find(b => b.id === sourceCustomerId)?.designerRack || []);
          const sourceLatestRack: any[] = sourceSnap.exists() && Array.isArray(sourceSnap.data().designerRack)
            ? sourceSnap.data().designerRack
            : sourceFallbackRack;

          if (!existingDesignItem) {
            existingDesignItem = sourceLatestRack.find(d => d.id === editingDesignerRackId);
          }

          const filteredSourceRack = sourceLatestRack.filter(d => d.id !== editingDesignerRackId);
          await updateDoc(sourceRef, { designerRack: filteredSourceRack });
          if (sourceCustomerId === id) {
            setDesignerRack(filteredSourceRack);
            setLiveCustomerData((prev: any) => (prev ? { ...prev, designerRack: filteredSourceRack } : prev));
          }
        }

        const baseItem = existingDesignItem || { id: editingDesignerRackId, uploadedAt: new Date().toISOString() };
        const updatedItem = {
          ...baseItem,
          title: displayTitle,
          name: displayTitle,
          frontMockupUrl: designerRackForm.frontMockupUrl,
          frontMockupName: designerRackForm.frontMockupName,
          backMockupUrl: designerRackForm.backMockupUrl,
          backMockupName: designerRackForm.backMockupName,
          otherMockups: designerRackForm.otherMockups,
          mockupUrl: primaryMockupUrl,
          mockupName: primaryMockupName,
          mockups: combinedMockups,
          url: primaryMockupUrl,
          logos: designerRackForm.logos,
          psdDriveLink: designerRackForm.psdDriveLink.trim(),
          garmentSourcingLink: designerRackForm.garmentSourcingLink.trim(),
          finalDesignApproved: Boolean(designerRackForm.finalDesignApproved),
          finalDesignApprovedNotificationRead:
            Boolean(designerRackForm.finalDesignApproved) && !baseItem.finalDesignApproved
              ? false
              : Boolean(baseItem.finalDesignApprovedNotificationRead),
          approvedForOrder: Boolean(designerRackForm.approvedForOrder),
          approvedForOrderNotificationRead:
            Boolean(designerRackForm.approvedForOrder) && !baseItem.approvedForOrder
              ? false
              : Boolean(baseItem.approvedForOrderNotificationRead),
          updatedAt: new Date().toISOString()
        };

        const existsInTarget = latestRack.some(d => d.id === editingDesignerRackId);
        updated = existsInTarget
          ? latestRack.map(d => (d.id === editingDesignerRackId ? updatedItem : d))
          : [...latestRack, updatedItem];
      } else {
        const newItem = {
          id: `design-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          title: displayTitle,
          name: displayTitle,
          frontMockupUrl: designerRackForm.frontMockupUrl,
          frontMockupName: designerRackForm.frontMockupName,
          backMockupUrl: designerRackForm.backMockupUrl,
          backMockupName: designerRackForm.backMockupName,
          otherMockups: designerRackForm.otherMockups,
          mockupUrl: primaryMockupUrl,
          mockupName: primaryMockupName,
          mockups: combinedMockups,
          url: primaryMockupUrl,
          logos: designerRackForm.logos,
          psdDriveLink: designerRackForm.psdDriveLink.trim(),
          garmentSourcingLink: designerRackForm.garmentSourcingLink.trim(),
          finalDesignApproved: Boolean(designerRackForm.finalDesignApproved),
          finalDesignApprovedNotificationRead: false,
          approvedForOrder: Boolean(designerRackForm.approvedForOrder),
          approvedForOrderNotificationRead: false,
          uploadedAt: new Date().toISOString()
        };
        updated = [...latestRack, newItem];
      }

      await updateDoc(custRef, {
        designerRack: updated
      });
      if (targetCustomerId === id) {
        setDesignerRack(updated);
        setLiveCustomerData((prev: any) => (prev ? { ...prev, designerRack: updated } : prev));
      }
      setIsDesignerRackModalOpen(false);
      setEditingDesignerRackId(null);
      setEditingDesignerRackSourceCustomerId(null);
      setEditingDesignerRackTargetCustomerId(null);
      setIsDesignerRackCollapsed(false);
    } catch (err) {
      console.error("Failed to save Designer Rack item:", err);
      alert("Failed to save design to Designer Rack.");
    } finally {
      setIsSavingDesignerRack(false);
    }
  };

  const handleDeleteDesignerRackItem = async (designId: string, sourceCustomerId?: string) => {
    const targetCustomerId = sourceCustomerId || id;
    if (!targetCustomerId) return;
    if (!window.confirm("Remove this design from the Designer Rack?")) return;

    try {
      const custRef = doc(db, 'customers', targetCustomerId);
      const latestSnap = await getDoc(custRef);
      const fallbackRack = targetCustomerId === id
        ? designerRack
        : (subBrands.find(b => b.id === targetCustomerId)?.designerRack || []);
      const latestRack: any[] = latestSnap.exists() && Array.isArray(latestSnap.data().designerRack)
        ? latestSnap.data().designerRack
        : fallbackRack;
      const updated = latestRack.filter(d => d.id !== designId);
      await updateDoc(custRef, {
        designerRack: updated
      });
      if (targetCustomerId === id) {
        setDesignerRack(updated);
        setLiveCustomerData((prev: any) => prev ? { ...prev, designerRack: updated } : prev);
      }
    } catch (err) {
      console.error("Error deleting design from Designer Rack:", err);
      alert("Failed to delete design.");
    }
  };

  const [isTrimmingVaultLogos, setIsTrimmingVaultLogos] = useState(false);

  const handleAutoCropSingleAsset = async (asset: any) => {
    if (!id || !asset.url) return;
    setIsTrimmingVaultLogos(true);
    try {
      const cropped = await autoCropLogoToPng(asset.url, { trimWhiteBackground: true, padding: 0 });
      if (!cropped) {
        alert(`Failed to process "${asset.name}".`);
        return;
      }

      const cleanFileName = asset.name.replace(/\.[^/.]+$/, "") + '_trimmed.png';
      const storageRef = ref(storage, `customers/${id}/vault/${Date.now()}_${cleanFileName}`);
      await uploadBytes(storageRef, cropped.file);
      const downloadUrl = await getDownloadURL(storageRef);

      const updated = assets.map(a => a.id === asset.id ? { ...a, url: downloadUrl, name: cleanFileName, lastTrimmedAt: new Date().toISOString() } : a);
      await updateDoc(doc(db, 'customers', id), { assets: updated });
      setAssets(updated);
      alert(`Successfully converted and trimmed "${asset.name}" to high-resolution PNG!`);
    } catch (err) {
      console.error("Failed to trim asset logo:", err);
      alert("Failed to auto-crop logo.");
    } finally {
      setIsTrimmingVaultLogos(false);
    }
  };

  const handleAutoCropAllAssets = async () => {
    if (!id || assets.length === 0) return;
    if (!window.confirm("Auto-crop and convert ALL logos in this vault to PNG trimmed to exact visible edges?")) return;

    setIsTrimmingVaultLogos(true);
    let trimmedCount = 0;
    try {
      const updatedAssets = [...assets];
      for (let i = 0; i < updatedAssets.length; i++) {
        const asset = updatedAssets[i];
        if (!asset.url || !asset.name.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i)) continue;

        const cropped = await autoCropLogoToPng(asset.url, { trimWhiteBackground: true, padding: 0 });
        if (cropped) {
          const cleanFileName = asset.name.replace(/\.[^/.]+$/, "") + '_trimmed.png';
          const storageRef = ref(storage, `customers/${id}/vault/${Date.now()}_${i}_${cleanFileName}`);
          await uploadBytes(storageRef, cropped.file);
          const downloadUrl = await getDownloadURL(storageRef);

          updatedAssets[i] = {
            ...asset,
            url: downloadUrl,
            name: cleanFileName,
            lastTrimmedAt: new Date().toISOString()
          };
          trimmedCount++;
        }
      }

      if (trimmedCount > 0) {
        await updateDoc(doc(db, 'customers', id), { assets: updatedAssets });
        setAssets(updatedAssets);
        alert(`Successfully trimmed and converted ${trimmedCount} logo(s) to exact PNG edges!`);
      } else {
        alert("All vault logos are already trimmed to exact visible edges.");
      }
    } catch (err) {
      console.error("Failed to bulk auto-crop vault logos:", err);
      alert("Failed to crop some logos.");
    } finally {
      setIsTrimmingVaultLogos(false);
    }
  };

  const [wovnCustomers, setWovnCustomers] = useState<any[]>([]);
  const [isLoadingWovnCustomers, setIsLoadingWovnCustomers] = useState(false);
  const [wovnCustomersError, setWovnCustomersError] = useState<string | null>(null);
  const [selectedWovnCustomer, setSelectedWovnCustomer] = useState<any | null>(null);

  const [availableCatalogs, setAvailableCatalogs] = useState<any[]>([]);
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(false);

  const [customerDecks, setCustomerDecks] = useState<any[]>([]);
  const [isLoadingCustomerDecks, setIsLoadingCustomerDecks] = useState(false);

  useEffect(() => {
    const loadFullDecks = async () => {
      if (catalogLinkIds.length === 0) {
        setCustomerDecks([]);
        return;
      }
      setIsLoadingCustomerDecks(true);
      try {
        const fetchedArrays = await Promise.all(
          catalogLinkIds.map(async (deckId: string) => {
            try {
              const response = await fetch(`https://wovn-garment-catalog.vercel.app/api/decks?deckId=${deckId}`);
              if (response.ok) return await response.json();
            } catch (e) {
              console.error("Failed to fetch deck:", deckId, e);
            }
            return null;
          })
        );
        const validArrays = fetchedArrays.filter(d => d !== null && Array.isArray(d));
        setCustomerDecks(validArrays.flat());
      } catch (err) {
        console.error("Error loading full decks", err);
      } finally {
         setIsLoadingCustomerDecks(false);
      }
    };
    if (!fetchingLogo) {
      loadFullDecks();
    }
  }, [catalogLinkIds, fetchingLogo]);

  useEffect(() => {
    if (isCatalogDialogOpen && wovnCustomers.length === 0) {
      const fetchWovnCustomers = async () => {
        setIsLoadingWovnCustomers(true);
        setWovnCustomersError(null);
        try {
          const response = await fetch('https://wovn-garment-catalog.vercel.app/api/customers');
          if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) {
              setWovnCustomers(data);
            } else if (data && typeof data === 'object') {
              // Try to find an array inside
              const possibleArray = Object.values(data).find(v => Array.isArray(v));
              setWovnCustomers(possibleArray as any[] || [data]);
            }
          } else {
            const errText = await response.text();
            setWovnCustomersError(`HTTP Error ${response.status}: ${errText}`);
          }
        } catch(e: any) {
          console.error("Error fetching wovn customers", e);
          setWovnCustomersError(e.message || "Network Error or CORS issue");
        } finally {
          setIsLoadingWovnCustomers(false);
        }
      };
      fetchWovnCustomers();
    }
  }, [isCatalogDialogOpen, wovnCustomers.length]);

  const handleSelectWovnCustomer = async (customer: any) => {
    setSelectedWovnCustomer(customer);
    setIsLoadingCatalogs(true);
    try {
      const response = await fetch(`https://wovn-garment-catalog.vercel.app/api/decks?customerId=${customer.id}`);
      if (response.ok) {
        const decks = await response.json();
        setAvailableCatalogs(prev => {
          const newDecks = [...prev];
          decks.forEach((newDeck: any) => {
            const deckId = newDeck.id || newDeck.deckId;
            if (!newDecks.find(d => (d.id || d.deckId) === deckId)) {
              newDecks.push(newDeck);
            }
          });
          return newDecks;
        });
      }
    } catch(e) {
      console.error(e);
    } finally {
      setIsLoadingCatalogs(false);
    }
  };

  // Cropper State
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<{
    src: string;
    alt: string;
    images?: { src: string; alt?: string; label?: string }[];
  } | null>(null);
  
  // Right Column Tab (Asset Vault vs Chat vs Team Roster)
  const [activeRightTab, setActiveRightTab] = useState<'vault' | 'chat' | 'roster'>('vault');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'chat') {
      setActiveRightTab('chat');
    } else if (tabParam === 'vault') {
      setActiveRightTab('vault');
    } else if (tabParam === 'roster') {
      setActiveRightTab('roster');
      setIsVaultSectionCollapsed(false);
    }
  }, [location.search]);
  const isOnline = () => {
    if (!customer?.isOnline) return false;
    if (!customer?.lastActiveAt) return false;
    const lastActive = new Date(customer.lastActiveAt).getTime();
    const now = new Date().getTime();
    return now - lastActive < 60000;
  };

  const [adminChatMessages, setAdminChatMessages] = useState<any[]>([]);
  const [adminNewMessageText, setAdminNewMessageText] = useState('');
  const [adminUnreadChatCount, setAdminUnreadChatCount] = useState(0);
  const adminChatContainerRef = useRef<HTMLDivElement>(null);

  // Real-time chat message listener
  useEffect(() => {
    if (!id) return;

    const msgsRef = collection(db, 'customers', id, 'chat_messages');
    const q = query(msgsRef, orderBy('timestamp', 'asc'));

    const unsub = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAdminChatMessages(msgs);

      // Count unread client messages
      const unread = msgs.filter((m: any) => m.senderRole === 'Client' && !m.read).length;
      setAdminUnreadChatCount(unread);
    }, (err) => {
      console.error("Error listening to admin chat messages:", err);
    });

    return () => unsub();
  }, [id]);

  // Mark customer messages as read when the admin views the chat tab
  useEffect(() => {
    if (activeRightTab === 'chat' && id) {
      const customerDocRef = doc(db, 'customers', id);
      updateDoc(customerDocRef, { hasUnreadSupport: false }).catch(err => {
        console.error("Failed to clear customer unread support flag:", err);
      });

      if (adminChatMessages.length > 0) {
        const unreadMsgs = adminChatMessages.filter(
          (m: any) => m.senderRole === 'Client' && !m.read
        );

        if (unreadMsgs.length > 0) {
          unreadMsgs.forEach(async (m) => {
            try {
              const msgRef = doc(db, 'customers', id, 'chat_messages', m.id);
              await updateDoc(msgRef, { read: true });
            } catch (err) {
              console.error("Failed to mark admin message as read:", err);
            }
          });
        }
      }
    }
  }, [activeRightTab, adminChatMessages, id]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (activeRightTab === 'chat' && adminChatContainerRef.current) {
      adminChatContainerRef.current.scrollTop = adminChatContainerRef.current.scrollHeight;
    }
  }, [adminChatMessages, activeRightTab]);

  const [isAdminUploadingChatImage, setIsAdminUploadingChatImage] = useState(false);

  const uploadAndSendAdminImage = async (file: File) => {
    setIsAdminUploadingChatImage(true);
    try {
      const storageRef = ref(storage, `customers/${id}/chat_attachments/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      const msgsRef = collection(db, 'customers', id || '', 'chat_messages');
      await addDoc(msgsRef, {
        text: '',
        imageUrl: downloadUrl,
        senderId: 'admin',
        senderName: 'Shop Staff',
        senderRole: 'Admin',
        timestamp: new Date().toISOString(),
        read: false
      });
    } catch (err) {
      console.error("Failed to upload/send admin chat image:", err);
      alert("Failed to send image attachment.");
    } finally {
      setIsAdminUploadingChatImage(false);
    }
  };

  const handleAdminChatImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    await uploadAndSendAdminImage(file);
  };

  const handleAdminChatPaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          await uploadAndSendAdminImage(file);
        }
      }
    }
  };

  const handleSendAdminChatMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!adminNewMessageText.trim() || !id) return;

    const textToSend = adminNewMessageText.trim();
    setAdminNewMessageText('');

    try {
      const msgsRef = collection(db, 'customers', id, 'chat_messages');
      await addDoc(msgsRef, {
        text: textToSend,
        senderId: 'admin',
        senderName: 'Shop Staff',
        senderRole: 'Admin',
        timestamp: new Date().toISOString(),
        read: false
      });
    } catch (err) {
      console.error("Failed to send admin chat message:", err);
      alert("Failed to send message. Please try again.");
    }
  };
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const onCropComplete = (_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  useEffect(() => {
    // Try to fetch custom live logo overrides
    const fetchCustomer = async () => {
      if (!id) {
        setFetchingLogo(false);
        return;
      }
      try {
        const d = await getDoc(doc(db, 'customers', id));
        if (d.exists()) {
          const data = d.data();
          setLiveCustomerData(data);
          setNoteText(data.brandingNotes !== undefined ? data.brandingNotes : (data.notes || ''));
          setSuggestedItems(data.suggestedItems || []);
          setSampleItems(data.sampleItems || []);
          setAssets(data.assets || []);
          setDesignerRack(data.designerRack || []);
          setTeamRoster(data.teamRoster || []);
          
          if (data.hasUnreadCreation) {
            updateDoc(doc(db, 'customers', id), { hasUnreadCreation: false }).catch(err => {
              console.error("Error clearing customer unread creation flag:", err);
            });
          }
          
          setLiveLogo(data.logo || null);
          setLiveCroppedLogo(data.croppedLogo || null);
          
          let fetchedLinks: string[] = [];
          if (data.catalogLinkIds) fetchedLinks = data.catalogLinkIds;
          else if (data.catalogLinkId) fetchedLinks = [data.catalogLinkId];
          
          setCatalogLinkIds(fetchedLinks);

          if (data.customPricing) {
            setCustomPricing({
              enabled: !!data.customPricing.enabled,
              autoQuotingEnabled: data.customPricing.autoQuotingEnabled || data.autoQuotingEnabled || 'inherit',
              ladder: data.customPricing.ladder || { priceAtLowTier: 5.50, priceAtHighTier: 3.00, marginFloor: 0.35 },
              costs: data.customPricing.costs || {}
            });
          } else if (data.autoQuotingEnabled) {
            setCustomPricing(prev => ({
              ...prev,
              autoQuotingEnabled: data.autoQuotingEnabled || 'inherit'
            }));
          }
          
          if (data.invoiceSettings) {
            setInvoiceForm({
              brandLogo: data.invoiceSettings.brandLogo ?? 'inktheory',
              subtitle: data.invoiceSettings.subtitle ?? "For your Consideration",
              categoryTag: data.invoiceSettings.categoryTag ?? "VCG • ADHOC ORDERS",
              statementOfWork: data.invoiceSettings.statementOfWork ?? "This invoice represents the agreed upon deliverables and services as outlined in the project scope.",
              feeSchedule: data.invoiceSettings.feeSchedule ?? "Payment is due upon receipt unless otherwise specified in your terms.",
              confidentiality: data.invoiceSettings.confidentiality ?? "Pricing and terms contained within are confidential and intended only for the recipient.",
              footerTagline: data.invoiceSettings.footerTagline ?? "YOUR TRUST IS OUR HIGHEST PRIORITY",
              wireBankName: data.invoiceSettings.wireBankName ?? "Pinnacle Bank",
              wireBankAddress: data.invoiceSettings.wireBankAddress ?? "2300 West End Avenue\nNashville, TN 37203",
              wireRoutingNumber: data.invoiceSettings.wireRoutingNumber ?? "XXXXXXXX",
              wireSwiftCode: data.invoiceSettings.wireSwiftCode ?? "XXXXXXXX",
              wireAccountName: data.invoiceSettings.wireAccountName ?? "Catalyst",
              wireAccountNumber: data.invoiceSettings.wireAccountNumber ?? "XXXXXXXX",
              showPayButton: data.invoiceSettings.showPayButton ?? false,
              payButtonText: data.invoiceSettings.payButtonText ?? "CLICK TO PAY BY CREDIT CARD +3.5%",
              payButtonUrl: data.invoiceSettings.payButtonUrl ?? "https://stripe.com"
            });
          }

          setEditCompanyForm({
            name: data.company || data.contactName || '',
            email: data.email || '',
            phone: data.phone || '',
            location: data.location || '',
            shippingStreet: data.shippingStreet || '',
            shippingCity: data.shippingCity || '',
            shippingState: data.shippingState || '',
            shippingZip: data.shippingZip || '',
            type: data.type || 'B2C',
            highPriority: Boolean(data.highPriority),
            net30Terms: data.net30Terms ?? true,
            fulfillmentType: data.fulfillmentType ?? 'Standard',
            disableRack: data.disableRack ?? false,
            taxExempt: data.taxExempt ?? false,
            bypassMinimumRequirement: data.bypassMinimumRequirement ?? false,
            autoQuotingEnabled: data.autoQuotingEnabled || 'inherit',
            allowLocalDelivery: data.allowLocalDelivery ?? true,
            freeShipping: data.freeShipping ?? false,
            requirePortalAgreements: Boolean(data.requirePortalAgreements),
            portalAgreementPages: Array.isArray(data.portalAgreementPages) && data.portalAgreementPages.length > 0
              ? data.portalAgreementPages
              : DEFAULT_PORTAL_AGREEMENTS,
            resaleCertificateUrl: data.resaleCertificateUrl || '',
            resaleCertificateName: data.resaleCertificateName || '',
            accountDiscount: {
              enabled: !!data.accountDiscount?.enabled,
              type: data.accountDiscount?.type === 'fixed' ? 'fixed' : 'percent',
              value: typeof data.accountDiscount?.value === 'number' ? data.accountDiscount.value : (parseFloat(data.accountDiscount?.value) || 0),
              expires: data.accountDiscount?.expires || '',
              note: data.accountDiscount?.note || ''
            }
          });

           // Fetch the names for the linked catalogs immediately so they don't say "Linked WOVN Deck"
           if (fetchedLinks.length > 0) {
              Promise.all(fetchedLinks.map(async (linkId) => {
                try {
                  const res = await fetch(`https://wovn-garment-catalog.vercel.app/api/decks?deckId=${linkId}`);
                  if (res.ok) {
                     const deckData = await res.json();
                     if (Array.isArray(deckData) && deckData.length > 0 && deckData[0].name) {
                        setAvailableCatalogs(prev => {
                           const existing = [...prev];
                           if (!existing.find(d => d.id === linkId)) {
                              existing.push({ id: linkId, name: deckData[0].name });
                           }
                           return existing;
                        });
                     }
                  }
                } catch (err) {
                  console.error("Error fetching native deck name", err);
                }
              }));
           }

           // Fetch users linked to this customerId
           const usersQuery = query(collection(db, 'users'), where('customerId', '==', id));
           const usersSnapshot = await getDocs(usersQuery);
           const loadedContacts = usersSnapshot.docs.map(docSnap => {
             const u = docSnap.data();
             return {
               id: docSnap.id,
               name: u.name || 'Unnamed User',
               role: u.roleDescription || u.role || 'Client',
               email: u.email || '',
               lastLogin: u.uid ? 'Yes (Registered)' : 'Never Logged In',
               viewAll: u.viewAll ?? true
             };
           });
           setContacts(loadedContacts);

        }
      } catch (err) {
        console.error("Error fetching live profile:", err);
      } finally {
        setFetchingLogo(false);
      }
    };
    fetchCustomer();
  }, [id]);

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOriginalFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input so identical file can be picked again
  };

  const handleSaveBrandingNotes = async () => {
    if (!id) {
      setIsEditingNote(false);
      return;
    }
    setSavingNote(true);
    try {
      await setDoc(doc(db, 'customers', id), {
        brandingNotes: noteText,
        notes: noteText
      }, { merge: true });
      setLiveCustomerData((prev: any) => ({
        ...prev,
        brandingNotes: noteText,
        notes: noteText
      }));
      setIsEditingNote(false);
    } catch (err) {
      console.error('Failed to save branding notes:', err);
      alert('Failed to save branding notes.');
    } finally {
      setSavingNote(false);
    }
  };

  const handleToggleCustomerHighPriority = async () => {
    if (!id) return;
    const isCurrentlyHighPriority = Boolean(liveCustomerData?.highPriority);
    const nextHighPriority = !isCurrentlyHighPriority;
    try {
      await setDoc(doc(db, 'customers', id), {
        highPriority: nextHighPriority
      }, { merge: true });
      setLiveCustomerData((prev: any) => ({
        ...prev,
        highPriority: nextHighPriority
      }));
      setEditCompanyForm(prev => ({
        ...prev,
        highPriority: nextHighPriority
      }));
    } catch (err) {
      console.error('Failed to toggle customer high priority:', err);
    }
  };

  const handleSaveCompany = async () => {
    if (!id) return;
    setSavingCompany(true);
    try {
      await setDoc(doc(db, 'customers', id), {
        company: editCompanyForm.name,
        email: editCompanyForm.email,
        phone: editCompanyForm.phone,
        location: editCompanyForm.location,
        shippingStreet: editCompanyForm.shippingStreet,
        shippingCity: editCompanyForm.shippingCity,
        shippingState: editCompanyForm.shippingState,
        shippingZip: editCompanyForm.shippingZip,
        type: editCompanyForm.type,
        highPriority: Boolean(editCompanyForm.highPriority),
        net30Terms: editCompanyForm.net30Terms,
        fulfillmentType: editCompanyForm.fulfillmentType,
        disableRack: editCompanyForm.disableRack,
        taxExempt: editCompanyForm.taxExempt,
        bypassMinimumRequirement: editCompanyForm.bypassMinimumRequirement,
        autoQuotingEnabled: customPricing.autoQuotingEnabled || 'inherit',
        allowLocalDelivery: editCompanyForm.allowLocalDelivery ?? true,
        freeShipping: editCompanyForm.freeShipping ?? false,
        requirePortalAgreements: Boolean(editCompanyForm.requirePortalAgreements),
        portalAgreementPages: editCompanyForm.portalAgreementPages || DEFAULT_PORTAL_AGREEMENTS,
        resaleCertificateUrl: editCompanyForm.resaleCertificateUrl,
        resaleCertificateName: editCompanyForm.resaleCertificateName,
        accountDiscount: editCompanyForm.accountDiscount,
        customPricing: customPricing,
        invoiceSettings: invoiceForm
      }, { merge: true });
      
      setLiveCustomerData({
        ...liveCustomerData,
        company: editCompanyForm.name,
        email: editCompanyForm.email,
        phone: editCompanyForm.phone,
        location: editCompanyForm.location,
        type: editCompanyForm.type,
        highPriority: Boolean(editCompanyForm.highPriority),
        net30Terms: editCompanyForm.net30Terms,
        fulfillmentType: editCompanyForm.fulfillmentType,
        disableRack: editCompanyForm.disableRack,
        taxExempt: editCompanyForm.taxExempt,
        bypassMinimumRequirement: editCompanyForm.bypassMinimumRequirement,
        autoQuotingEnabled: customPricing.autoQuotingEnabled || 'inherit',
        allowLocalDelivery: editCompanyForm.allowLocalDelivery ?? true,
        freeShipping: editCompanyForm.freeShipping ?? false,
        requirePortalAgreements: Boolean(editCompanyForm.requirePortalAgreements),
        portalAgreementPages: editCompanyForm.portalAgreementPages || DEFAULT_PORTAL_AGREEMENTS,
        resaleCertificateUrl: editCompanyForm.resaleCertificateUrl,
        resaleCertificateName: editCompanyForm.resaleCertificateName,
        accountDiscount: editCompanyForm.accountDiscount,
        customPricing: customPricing,
        invoiceSettings: invoiceForm
      });
      setIsEditDialogOpen(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingCompany(false);
    }
  };

  const handleDeleteCompany = async () => {
    if (!id) return;
    const companyName = editCompanyForm.name || customer?.company || customer?.name || 'this company';
    const confirmMsg = `Are you sure you want to delete "${companyName}"?\n\nThis will permanently delete the company profile and remove portal access for all linked users. This action cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;

    setIsDeletingCompany(true);
    try {
      // 1. Delete associated portal users linked to this company
      const userQuery = query(collection(db, 'users'), where('customerId', '==', id));
      const userSnap = await getDocs(userQuery);
      await Promise.all(userSnap.docs.map(userDoc => deleteDoc(userDoc.ref)));

      // 2. Delete the company document
      await deleteDoc(doc(db, 'customers', id));

      alert(`"${companyName}" has been deleted.`);
      navigate('/customers');
    } catch (err: any) {
      console.error("Error deleting company:", err);
      alert("Failed to delete company: " + (err?.message || "Unknown error"));
    } finally {
      setIsDeletingCompany(false);
    }
  };

  const handleUploadCroppedLogo = async () => {
    if (!id || !cropImageSrc || !croppedAreaPixels) return;

    try {
      setUploadingLogo(true);
      const imageSrcToCrop = cropImageSrc;
      setCropImageSrc(null); // Close the cropper dialog UI early for better UX
      
      const croppedFile = await getCroppedImg(imageSrcToCrop, croppedAreaPixels);
      if (!croppedFile) throw new Error("Could not crop image");

      // Upload cropped file to Firebase Storage
      const croppedStorageRef = ref(storage, `customers/${id}/logo_cropped_${Date.now()}`);
      await uploadBytes(croppedStorageRef, croppedFile);
      const croppedUrl = await getDownloadURL(croppedStorageRef);

      // Upload original full logo to Firebase Storage if a new file was uploaded
      let fullUrl = croppedUrl;
      if (originalFile) {
        const fullStorageRef = ref(storage, `customers/${id}/logo_full_${Date.now()}`);
        await uploadBytes(fullStorageRef, originalFile);
        fullUrl = await getDownloadURL(fullStorageRef);
      } else {
        // If recropping an existing logo, keep the existing logo URL
        fullUrl = customer.logo || croppedUrl;
      }

      // Save both URLs to Firestore so they persist
      await setDoc(doc(db, 'customers', id), { 
        logo: fullUrl,
        croppedLogo: croppedUrl
      }, { merge: true });
      
      setLiveLogo(fullUrl);
      setLiveCroppedLogo(croppedUrl);
    } catch (err) {
      console.error("Error uploading logo", err);
    } finally {
      setUploadingLogo(false);
      setOriginalFile(null);
    }
  };

  const handleSaveCatalogId = async () => {
    if (!id) return;
    setSavingLinkId(true);
    try {
      await setDoc(doc(db, 'customers', id), { catalogLinkIds }, { merge: true });
    } catch (e) {
      console.error("Error saving catalog ids", e);
    } finally {
      setSavingLinkId(false);
    }
  };

  const toggleCatalogLink = (catalogId: string) => {
    if (catalogLinkIds.includes(catalogId)) {
      setCatalogLinkIds(prev => prev.filter(c => c !== catalogId));
    } else {
      setCatalogLinkIds(prev => [...prev, catalogId]);
    }
  };

  const handleCreateOrder = async () => {
    if (!id || !newOrderForm.title) return;
    setIsCreatingOrder(true);
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
      
      const fulfillmentTypeToUse = newOrderForm.fulfillmentType || (liveCustomerData?.fulfillmentType ?? 'Standard');
      
      const newOrder = {
        customerId: id,
        portalId: portalId,
        title: newOrderForm.title,
        date: newOrderForm.date,
        fulfillmentType: fulfillmentTypeToUse,
        statusIndex: newOrderForm.statusIndex,
        tracking: {
          carrier: newOrderForm.trackingCarrier,
          number: newOrderForm.trackingNumber,
          url: ''
        },
        items: [],
        activities: [],
        createdAt: new Date().toISOString()
      };
      
      await addDoc(collection(db, 'orders'), newOrder);
      
      setIsNewOrderDialogOpen(false);
      const resetToday = new Date();
      setNewOrderForm({
        title: '',
        rawDate: resetToday.toLocaleDateString('en-CA'),
        date: resetToday.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }),
        fulfillmentType: '',
        statusIndex: 0,
        trackingCarrier: '',
        trackingNumber: ''
      });
    } catch (e) {
      console.error("Error creating order:", e);
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const customer = { 
    ...liveCustomerData,
    logo: liveLogo || liveCustomerData?.logo,
    croppedLogo: liveCroppedLogo || liveCustomerData?.croppedLogo
  };

  const placedOrders = useMemo(() => {
    return (orders || []).filter(o => isPlacedOrder(o));
  }, [orders]);

  const totalOrders = placedOrders.length;
  const lifetimeValue = useMemo(() => {
    return placedOrders.reduce((acc, order) => {
      return acc + calculateOrderFinalTotal(order);
    }, 0);
  }, [placedOrders]);
  const formattedLTV = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(lifetimeValue);

  const hasNet30 = customer?.net30Terms ?? (customer?.type === 'B2B');

  return (
    <div className={tokens.layout.container}>
      <NewCustomerModal
        isOpen={isNewBrandModalOpen}
        onClose={() => setIsNewBrandModalOpen(false)}
        parentCustomerId={id}
        parentCompanyName={editCompanyForm.name || liveCustomerData?.company || liveCustomerData?.contactName || ''}
        onSuccess={() => {
          setIsBrandsSectionCollapsed(false);
        }}
      />

      {/* Designer Rack Upload Design Modal (4 Quadrants) */}
      {isDesignerRackModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
          onClick={() => setIsDesignerRackModalOpen(false)}
        >
          <div
            className="bg-white max-w-3xl w-full rounded-2xl shadow-2xl border border-brand-border overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-brand-border flex items-center justify-between bg-brand-bg/40">
              <div>
                <h3 className="font-serif text-2xl text-brand-primary">
                  {editingDesignerRackId ? 'Edit Design' : 'Upload Design'}
                </h3>
                <p className="text-xs text-brand-secondary mt-0.5">
                  Name the garment and complete the 4 quadrants below.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDesignerRackModalOpen(false)}
                className="text-brand-secondary hover:text-brand-primary transition-colors bg-white border border-brand-border rounded-lg p-1.5 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveDesignerRackModal} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
              {subBrands.length > 0 && (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-secondary mb-1.5">
                    Assign to Brand / Customer
                  </label>
                  <select
                    value={editingDesignerRackTargetCustomerId || id || ''}
                    onChange={(e) => {
                      const nextTargetId = e.target.value;
                      setEditingDesignerRackTargetCustomerId(nextTargetId);
                      if (editingDesignerRackId) {
                        void autoPersistEditingDesignerRack(designerRackForm, nextTargetId);
                      }
                    }}
                    className="w-full bg-brand-bg/40 border border-brand-border focus:bg-white focus:border-brand-primary rounded-xl px-4 py-2.5 text-sm font-medium text-brand-primary focus:outline-none transition-all cursor-pointer"
                  >
                    <option value={id || ''}>
                      {editCompanyForm.name || liveCustomerData?.company || liveCustomerData?.contactName || 'Parent Company'} (Parent)
                    </option>
                    {subBrands.map((b: any) => (
                      <option key={b.id} value={b.id}>
                        {b.company || b.contactName || 'Sub-Brand'} (Brand)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Required Garment Title */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-secondary mb-1.5">
                  Garment Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={designerRackForm.title}
                  onChange={(e) => setDesignerRackForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter what this garment should be called (e.g. Windbreaker, Heavyweight Tee)"
                  className="w-full bg-brand-bg/40 border border-brand-border focus:bg-white focus:border-brand-primary rounded-xl px-4 py-2.5 text-sm font-medium text-brand-primary focus:outline-none transition-all"
                />
              </div>

              {/* 4 Quadrants Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Quadrant 1: Mock-up (Front, Back & Optional Other Mock-ups) */}
                <div className="rounded-2xl border border-brand-border bg-brand-bg/25 p-4 flex flex-col justify-between min-h-[210px]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-brand-primary">
                      1. Mock-up
                    </span>
                    {designerRackForm.frontMockupUrl && designerRackForm.backMockupUrl ? (
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center" title="Front & Back mock-ups uploaded">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    ) : (
                      <span
                        className="w-5 h-5 rounded-full bg-red-500 text-white text-[11px] font-black flex items-center justify-center"
                        title="Both Front and Back mock-ups are required"
                      >
                        !
                      </span>
                    )}
                  </div>

                  {/* Required Front & Back Sub-Boxes (Each with its own ! / ✓ and Drag & Drop) */}
                  <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                    {/* FRONT MOCK-UP */}
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (draggingRackMockupSlot !== 'front') setDraggingRackMockupSlot('front');
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDraggingRackMockupSlot(null);
                        }
                      }}
                      onDrop={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDraggingRackMockupSlot(null);
                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                          await uploadRackMockupForSlot('front', e.dataTransfer.files);
                        }
                      }}
                      className={`rounded-xl border border-dashed bg-white p-2.5 flex flex-col justify-between transition-all ${
                        draggingRackMockupSlot === 'front'
                          ? 'border-brand-primary bg-brand-primary/5 ring-2 ring-brand-primary/20'
                          : 'border-brand-border'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-primary">
                          Front <span className="text-[9px] font-medium text-brand-secondary normal-case">(Thumbnail)</span>
                        </span>
                        {designerRackForm.frontMockupUrl ? (
                          <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                            <Check size={10} strokeWidth={3} />
                          </span>
                        ) : (
                          <span
                            className="w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center"
                            title="Front mock-up required"
                          >
                            !
                          </span>
                        )}
                      </div>

                      <div className="h-24 flex items-center justify-center relative my-1 overflow-hidden">
                        {designerRackForm.frontMockupUrl ? (
                          <>
                            {designerRackForm.frontMockupName?.match(/\.(pdf|ai|eps|psd)(\?.*)?$/i) ? (
                              <div className="flex flex-col items-center gap-1 text-center">
                                <FileText size={22} className="text-neutral-600" />
                                <span className="text-[9px] font-bold text-brand-primary truncate max-w-[110px]">
                                  {designerRackForm.frontMockupName}
                                </span>
                              </div>
                            ) : (
                              <img
                                src={designerRackForm.frontMockupUrl}
                                alt="Front Mock-up"
                                className="max-h-22 max-w-full object-contain mix-blend-multiply"
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                const nextForm = {
                                  ...designerRackForm,
                                  frontMockupUrl: '',
                                  frontMockupName: ''
                                };
                                setDesignerRackForm(nextForm);
                                void autoPersistEditingDesignerRack(nextForm);
                              }}
                              className="absolute top-0 right-0 w-4 h-4 rounded-full bg-white border border-neutral-200 shadow-xs text-neutral-400 hover:text-red-600 hover:border-red-400 flex items-center justify-center cursor-pointer"
                              title="Remove Front Mock-up"
                            >
                              <X size={10} strokeWidth={2.5} />
                            </button>
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-center text-brand-secondary pointer-events-none">
                            <Image size={20} className={draggingRackMockupSlot === 'front' ? 'text-brand-primary' : 'text-neutral-300'} />
                            <span className="text-[10px]">
                              {draggingRackMockupSlot === 'front' ? 'Drop Front here' : 'Drag or upload Front'}
                            </span>
                          </div>
                        )}
                      </div>

                      <label className="w-full inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-bg/40 hover:bg-neutral-100 border border-brand-border text-[11px] font-bold text-brand-primary transition-all cursor-pointer">
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => handleUploadRackMockupForSlot('front', e)}
                          accept="image/*,application/pdf"
                          disabled={uploadingRackMockupSlot !== null}
                        />
                        {uploadingRackMockupSlot === 'front' ? (
                          <Loader2 className="animate-spin" size={12} />
                        ) : (
                          <Upload size={12} />
                        )}
                        <span>
                          {uploadingRackMockupSlot === 'front'
                            ? 'Uploading...'
                            : designerRackForm.frontMockupUrl
                            ? 'Replace Front'
                            : 'Upload Front'}
                        </span>
                      </label>
                    </div>

                    {/* BACK MOCK-UP */}
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (draggingRackMockupSlot !== 'back') setDraggingRackMockupSlot('back');
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDraggingRackMockupSlot(null);
                        }
                      }}
                      onDrop={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDraggingRackMockupSlot(null);
                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                          await uploadRackMockupForSlot('back', e.dataTransfer.files);
                        }
                      }}
                      className={`rounded-xl border border-dashed bg-white p-2.5 flex flex-col justify-between transition-all ${
                        draggingRackMockupSlot === 'back'
                          ? 'border-brand-primary bg-brand-primary/5 ring-2 ring-brand-primary/20'
                          : 'border-brand-border'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-primary">
                          Back
                        </span>
                        {designerRackForm.backMockupUrl ? (
                          <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                            <Check size={10} strokeWidth={3} />
                          </span>
                        ) : (
                          <span
                            className="w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center"
                            title="Back mock-up required"
                          >
                            !
                          </span>
                        )}
                      </div>

                      <div className="h-24 flex items-center justify-center relative my-1 overflow-hidden">
                        {designerRackForm.backMockupUrl ? (
                          <>
                            {designerRackForm.backMockupName?.match(/\.(pdf|ai|eps|psd)(\?.*)?$/i) ? (
                              <div className="flex flex-col items-center gap-1 text-center">
                                <FileText size={22} className="text-neutral-600" />
                                <span className="text-[9px] font-bold text-brand-primary truncate max-w-[110px]">
                                  {designerRackForm.backMockupName}
                                </span>
                              </div>
                            ) : (
                              <img
                                src={designerRackForm.backMockupUrl}
                                alt="Back Mock-up"
                                className="max-h-22 max-w-full object-contain mix-blend-multiply"
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                const nextForm = {
                                  ...designerRackForm,
                                  backMockupUrl: '',
                                  backMockupName: ''
                                };
                                setDesignerRackForm(nextForm);
                                void autoPersistEditingDesignerRack(nextForm);
                              }}
                              className="absolute top-0 right-0 w-4 h-4 rounded-full bg-white border border-neutral-200 shadow-xs text-neutral-400 hover:text-red-600 hover:border-red-400 flex items-center justify-center cursor-pointer"
                              title="Remove Back Mock-up"
                            >
                              <X size={10} strokeWidth={2.5} />
                            </button>
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-center text-brand-secondary pointer-events-none">
                            <Image size={20} className={draggingRackMockupSlot === 'back' ? 'text-brand-primary' : 'text-neutral-300'} />
                            <span className="text-[10px]">
                              {draggingRackMockupSlot === 'back' ? 'Drop Back here' : 'Drag or upload Back'}
                            </span>
                          </div>
                        )}
                      </div>

                      <label className="w-full inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-bg/40 hover:bg-neutral-100 border border-brand-border text-[11px] font-bold text-brand-primary transition-all cursor-pointer">
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => handleUploadRackMockupForSlot('back', e)}
                          accept="image/*,application/pdf"
                          disabled={uploadingRackMockupSlot !== null}
                        />
                        {uploadingRackMockupSlot === 'back' ? (
                          <Loader2 className="animate-spin" size={12} />
                        ) : (
                          <Upload size={12} />
                        )}
                        <span>
                          {uploadingRackMockupSlot === 'back'
                            ? 'Uploading...'
                            : designerRackForm.backMockupUrl
                            ? 'Replace Back'
                            : 'Upload Back'}
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Optional Other Mock-ups (No Exclamation Mark) */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (draggingRackMockupSlot !== 'other') setDraggingRackMockupSlot('other');
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDraggingRackMockupSlot(null);
                      }
                    }}
                    onDrop={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDraggingRackMockupSlot(null);
                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        await uploadRackMockupForSlot('other', e.dataTransfer.files);
                      }
                    }}
                    className={`rounded-xl border border-dashed bg-white p-2.5 transition-all ${
                      draggingRackMockupSlot === 'other'
                        ? 'border-brand-primary bg-brand-primary/5 ring-2 ring-brand-primary/20'
                        : 'border-brand-border'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary">
                        Other Mock-ups <span className="font-normal normal-case">(Optional • {designerRackForm.otherMockups.length})</span>
                      </span>
                      <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-bg/40 hover:bg-neutral-100 border border-brand-border text-[10px] font-bold text-brand-primary transition-all cursor-pointer">
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => handleUploadRackMockupForSlot('other', e)}
                          accept="image/*,application/pdf"
                          disabled={uploadingRackMockupSlot !== null}
                        />
                        {uploadingRackMockupSlot === 'other' ? (
                          <Loader2 className="animate-spin" size={11} />
                        ) : (
                          <Plus size={11} />
                        )}
                        <span>{uploadingRackMockupSlot === 'other' ? 'Uploading...' : 'Upload Other'}</span>
                      </label>
                    </div>

                    {designerRackForm.otherMockups.length > 0 && (
                      <div className="flex items-center gap-2 overflow-x-auto pt-2 mt-2 border-t border-brand-border/50">
                        {designerRackForm.otherMockups.map((m) => {
                          const isImg = !m.name?.match(/\.(pdf|ai|eps|psd)(\?.*)?$/i);
                          return (
                            <div
                              key={m.id}
                              className="relative shrink-0 w-10 h-10 rounded-lg border border-brand-border/80 p-1 flex items-center justify-center bg-brand-bg/20"
                              title={m.name}
                            >
                              {isImg ? (
                                <img src={m.url} alt={m.name} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                              ) : (
                                <span className="text-[8px] font-black uppercase text-neutral-500">
                                  {m.name?.split('.').pop() || 'FILE'}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveOtherMockupFromForm(m.id)}
                                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white border border-neutral-200 shadow-xs text-neutral-400 hover:text-red-600 hover:border-red-400 flex items-center justify-center cursor-pointer"
                                title="Remove Mock-up"
                              >
                                <X size={9} strokeWidth={2.5} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Quadrant 2: Logo or Logos */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isDraggingRackLogos) setIsDraggingRackLogos(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setIsDraggingRackLogos(false);
                    }
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingRackLogos(false);
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      await uploadRackLogoFiles(e.dataTransfer.files);
                    }
                  }}
                  className={`rounded-2xl border p-4 flex flex-col justify-between min-h-[210px] transition-all ${
                    isDraggingRackLogos
                      ? 'border-brand-primary bg-brand-primary/5 ring-2 ring-brand-primary/20'
                      : 'border-brand-border bg-brand-bg/25'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-brand-primary">
                      2. Logo or Logos ({designerRackForm.logos.length})
                    </span>
                    {designerRackForm.logos.length > 0 ? (
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[11px] font-black flex items-center justify-center" title="No logos uploaded yet">
                        !
                      </span>
                    )}
                  </div>

                  <div
                    className={`flex-1 bg-white border border-dashed rounded-xl p-3 mb-3 flex items-center justify-center overflow-y-auto max-h-32 transition-colors ${
                      isDraggingRackLogos ? 'border-brand-primary bg-brand-primary/5' : 'border-brand-border'
                    }`}
                  >
                    {designerRackForm.logos.length === 0 ? (
                      <div className="flex flex-col items-center gap-1.5 text-center py-4 text-brand-secondary pointer-events-none">
                        <Palette size={24} className={isDraggingRackLogos ? 'text-brand-primary' : 'text-neutral-300'} />
                        <span className="text-[11px]">
                          {isDraggingRackLogos ? 'Drop logo file(s) here...' : 'Drag & drop or upload logo files'}
                        </span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 w-full">
                        {designerRackForm.logos.map((logo) => {
                          const isLogoImg = Boolean(logo.name?.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i));
                          return (
                            <div
                              key={logo.id}
                              className="relative group bg-brand-bg/30 border border-brand-border/70 rounded-lg p-1.5 flex flex-col items-center gap-1"
                            >
                              <div className="w-11 h-11 rounded bg-checkerboard flex items-center justify-center p-1 overflow-hidden">
                                {isLogoImg ? (
                                  <img src={logo.url} alt={logo.name} className="max-w-full max-h-full object-contain" />
                                ) : (
                                  <span className="text-[8px] font-black uppercase text-neutral-500">
                                    {logo.name?.split('.').pop() || 'FILE'}
                                  </span>
                                )}
                              </div>
                              <span className="text-[9px] font-medium text-brand-primary truncate w-full text-center" title={logo.name}>
                                {logo.name}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveRackLogoFromForm(logo.id)}
                                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white border border-neutral-200 shadow-sm text-neutral-400 hover:text-red-600 hover:border-red-400 flex items-center justify-center cursor-pointer"
                                title="Remove Logo"
                              >
                                <X size={10} strokeWidth={2.5} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <label className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-brand-border hover:bg-neutral-50 text-xs font-bold text-brand-primary shadow-2xs transition-all cursor-pointer">
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleUploadRackLogos}
                      accept="image/*,application/pdf,.ai,.eps,.svg"
                      disabled={isUploadingRackLogos}
                    />
                    {isUploadingRackLogos ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      <Plus size={14} />
                    )}
                    <span>{isUploadingRackLogos ? 'Uploading...' : 'Upload Logo(s)'}</span>
                  </label>
                </div>

                {/* Quadrant 3: PSD Google Drive Link */}
                <div className="rounded-2xl border border-brand-border bg-brand-bg/25 p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-brand-primary">
                      3. PSD Google Drive Link
                    </span>
                    {designerRackForm.psdDriveLink.trim() ? (
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[11px] font-black flex items-center justify-center" title="PSD link not entered yet">
                        !
                      </span>
                    )}
                  </div>
                  <input
                    type="url"
                    value={designerRackForm.psdDriveLink}
                    onChange={(e) => setDesignerRackForm((prev) => ({ ...prev, psdDriveLink: e.target.value }))}
                    placeholder="https://drive.google.com/file/d/..."
                    className="w-full bg-white border border-brand-border focus:border-brand-primary rounded-xl px-3.5 py-2.5 text-xs text-brand-primary focus:outline-none transition-all"
                  />
                </div>

                {/* Quadrant 4: Garment Sourcing Link */}
                <div className="rounded-2xl border border-brand-border bg-brand-bg/25 p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-brand-primary">
                        4. Garment Sourcing Link
                      </span>
                      {designerRackForm.garmentSourcingLink.trim() ? (
                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[11px] font-black flex items-center justify-center shrink-0" title="Garment sourcing link not entered yet">
                          !
                        </span>
                      )}
                    </div>
                    <input
                      type="url"
                      value={designerRackForm.garmentSourcingLink}
                      onChange={(e) => setDesignerRackForm((prev) => ({ ...prev, garmentSourcingLink: e.target.value }))}
                      placeholder="https://www.sanmar.com/... or supplier URL"
                      className="w-full bg-white border border-brand-border focus:border-brand-primary rounded-xl px-3.5 py-2.5 text-xs text-brand-primary focus:outline-none transition-all"
                    />
                  </div>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => {
                        const nextForm = {
                          ...designerRackForm,
                          approvedForOrder: !designerRackForm.approvedForOrder
                        };
                        setDesignerRackForm(nextForm);
                        void autoPersistEditingDesignerRack(nextForm);
                      }}
                      disabled={isSavingDesignerRack}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer select-none ${
                        designerRackForm.approvedForOrder
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                          : 'bg-white hover:bg-neutral-50 text-brand-primary border-brand-border hover:border-brand-primary'
                      }`}
                    >
                      {designerRackForm.approvedForOrder && <Check size={12} strokeWidth={3} />}
                      <span>{designerRackForm.approvedForOrder ? 'Approved For Order' : 'Approve For Order'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-brand-border flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const nextForm = {
                      ...designerRackForm,
                      finalDesignApproved: !designerRackForm.finalDesignApproved
                    };
                    setDesignerRackForm(nextForm);
                    void autoPersistEditingDesignerRack(nextForm);
                  }}
                  disabled={isSavingDesignerRack}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold border transition-all cursor-pointer select-none shadow-2xs ${
                    designerRackForm.finalDesignApproved
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                      : 'bg-white hover:bg-neutral-50 text-brand-primary border-brand-border hover:border-brand-primary'
                  }`}
                >
                  {designerRackForm.finalDesignApproved && <Check size={14} strokeWidth={3} />}
                  <span>{designerRackForm.finalDesignApproved ? 'Final Design Approved' : 'Approve Final Design'}</span>
                </button>

                <div className="flex items-center gap-3 ml-auto">
                  <PillButton
                    type="button"
                    variant="outline"
                    onClick={() => setIsDesignerRackModalOpen(false)}
                    disabled={isSavingDesignerRack}
                  >
                    Cancel
                  </PillButton>
                  <PillButton
                    type="submit"
                    variant="filled"
                    className="gap-1.5"
                    disabled={isSavingDesignerRack || uploadingRackMockupSlot !== null || isUploadingRackLogos}
                  >
                    {isSavingDesignerRack ? (
                      <>
                        <Loader2 className="animate-spin" size={14} /> Saving...
                      </>
                    ) : (
                      <>
                        <Check size={14} /> {editingDesignerRackId ? 'Save Changes' : 'Save Design'}
                      </>
                    )}
                  </PillButton>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8 pb-4 border-b border-brand-border">
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          <button 
            onClick={() => navigate('/customers')}
            className="flex items-center gap-2 text-sm font-medium text-brand-secondary hover:text-brand-primary transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft size={16} className="shrink-0" />
            <span>Back to Customers</span>
          </button>
          {liveCustomerData?.parentCustomerId && (
            <>
              <span className="text-brand-border select-none">/</span>
              <button
                type="button"
                onClick={() => navigate(`/customers/${liveCustomerData.parentCustomerId}`)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-full transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Building2 size={13} className="shrink-0" />
                <span>Parent: {liveCustomerData.parentCompanyName || 'Parent Customer'}</span>
              </button>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <button
            type="button"
            onClick={handleToggleCustomerHighPriority}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-pill text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              liveCustomerData?.highPriority
                ? 'bg-red-600 text-white border-red-600 hover:bg-red-700 shadow-xs'
                : 'bg-white text-brand-primary border-brand-border hover:border-red-500 hover:text-red-600'
            }`}
            title={liveCustomerData?.highPriority ? 'Remove High Priority from Customer' : 'Mark Customer as High Priority'}
          >
            <AlertTriangle size={14} className="shrink-0" />
            <span>{liveCustomerData?.highPriority ? 'High Priority' : 'Mark High Priority'}</span>
          </button>
          <PillButton 
            variant="outline" 
            className="gap-1.5 px-4 py-2 text-xs whitespace-nowrap shrink-0"
            onClick={() => setIsQrModalOpen(true)}
          >
            <QrCode size={15} className="shrink-0" />
            <span>Share Portal QR</span>
          </PillButton>
          <PillButton 
            variant="outline" 
            className="gap-1.5 px-4 py-2 text-xs whitespace-nowrap shrink-0"
            onClick={() => navigate(`/settings?tab=merge-customers&primaryId=${id}`)}
          >
            <GitMerge size={15} className="shrink-0" />
            <span>Merge Account</span>
          </PillButton>
          <PillButton 
            variant="outline" 
            className="gap-1.5 px-4 py-2 text-xs whitespace-nowrap shrink-0"
            onClick={() => window.open(`/portal/${id}`, '_blank')}
          >
            <ExternalLink size={15} className="shrink-0" />
            <span>Login to Client Portal</span>
          </PillButton>
          <PillButton 
            variant="outline" 
            className="gap-1.5 px-4 py-2 text-xs whitespace-nowrap shrink-0"
            onClick={() => {
              setActiveRightTab('roster');
              setIsVaultSectionCollapsed(false);
              const el = document.getElementById('vault-roster-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            <Users size={15} className="shrink-0" />
            <span>Team Roster ({teamRoster.length})</span>
          </PillButton>
          <PillButton
            variant="filled"
            className="px-4 py-2 text-xs whitespace-nowrap shrink-0"
            onClick={() => {
            if (liveCustomerData) {
              setEditCompanyForm(prev => ({
                ...prev,
                name: liveCustomerData.company || liveCustomerData.contactName || prev.name,
                email: liveCustomerData.email || prev.email,
                phone: liveCustomerData.phone || prev.phone,
                location: liveCustomerData.location || prev.location,
                shippingStreet: liveCustomerData.shippingStreet || prev.shippingStreet,
                shippingCity: liveCustomerData.shippingCity || prev.shippingCity,
                shippingState: liveCustomerData.shippingState || prev.shippingState,
                shippingZip: liveCustomerData.shippingZip || prev.shippingZip,
                type: liveCustomerData.type || prev.type,
                highPriority: Boolean(liveCustomerData.highPriority),
                net30Terms: liveCustomerData.net30Terms ?? prev.net30Terms,
                fulfillmentType: liveCustomerData.fulfillmentType ?? prev.fulfillmentType,
                disableRack: liveCustomerData.disableRack ?? prev.disableRack,
                taxExempt: liveCustomerData.taxExempt ?? prev.taxExempt,
                bypassMinimumRequirement: liveCustomerData.bypassMinimumRequirement ?? prev.bypassMinimumRequirement,
                autoQuotingEnabled: liveCustomerData.autoQuotingEnabled || prev.autoQuotingEnabled,
                allowLocalDelivery: liveCustomerData.allowLocalDelivery ?? prev.allowLocalDelivery,
                freeShipping: liveCustomerData.freeShipping ?? prev.freeShipping,
                requirePortalAgreements: Boolean(liveCustomerData.requirePortalAgreements),
                portalAgreementPages: Array.isArray(liveCustomerData.portalAgreementPages) && liveCustomerData.portalAgreementPages.length > 0
                  ? liveCustomerData.portalAgreementPages
                  : prev.portalAgreementPages || DEFAULT_PORTAL_AGREEMENTS,
                resaleCertificateUrl: liveCustomerData.resaleCertificateUrl || prev.resaleCertificateUrl,
                resaleCertificateName: liveCustomerData.resaleCertificateName || prev.resaleCertificateName,
                accountDiscount: {
                  enabled: !!liveCustomerData.accountDiscount?.enabled,
                  type: liveCustomerData.accountDiscount?.type === 'fixed' ? 'fixed' : 'percent',
                  value: typeof liveCustomerData.accountDiscount?.value === 'number' ? liveCustomerData.accountDiscount.value : (parseFloat(liveCustomerData.accountDiscount?.value) || 0),
                  expires: liveCustomerData.accountDiscount?.expires || '',
                  note: liveCustomerData.accountDiscount?.note || ''
                }
              }));
            }
            setIsEditDialogOpen(true);
          }}>
            Edit Company
          </PillButton>
        </div>
      </div>

      {/* Header Profile */}
      <div className={`bg-white p-8 rounded-card border ${isNotesExpanded ? 'border-brand-primary/20 shadow-md pb-6' : 'border-brand-border shadow-sm'} transition-all duration-300 flex flex-col gap-6`}>
        <div className="flex flex-col md:flex-row gap-8 items-start justify-between">
          <div className="flex items-start gap-6">
            <div className={`relative w-24 h-24 rounded-xl flex items-center justify-center text-brand-secondary flex-shrink-0 overflow-hidden group ${customer?.croppedLogo || customer?.logo ? '' : 'border border-brand-border bg-brand-bg'}`}>
               {uploadingLogo || fetchingLogo ? (
                 <Loader2 className="animate-spin text-brand-secondary" size={24} />
               ) : (customer?.croppedLogo || customer?.logo) ? (
                 <img src={customer.croppedLogo || customer.logo} className="w-full h-full object-contain animate-fade-in" alt={customer.company} />
               ) : (
                 <Building2 size={40} strokeWidth={1} />
               )}
               
               {/* Hover Upload Overlay */}
               {!uploadingLogo && (
                 <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-stretch justify-center text-white text-[9px] font-bold uppercase tracking-wider select-none">
                   <label className="flex-1 flex flex-col items-center justify-center cursor-pointer hover:bg-white/10 transition-colors border-b border-white/10">
                     <Upload size={14} className="mb-1" />
                     <span>Upload New</span>
                     <input type="file" className="hidden" accept="image/*" onChange={handleLogoSelect} />
                   </label>
                   {customer?.logo && (
                     <button 
                       type="button" 
                       onClick={() => {
                         setCropImageSrc(customer.logo);
                         setOriginalFile(null); // recropping existing logo
                       }}
                       className="flex-1 flex flex-col items-center justify-center hover:bg-white/10 transition-colors"
                     >
                       <Crop size={14} className="mb-1" />
                       <span>Recrop</span>
                     </button>
                   )}
                 </div>
               )}
            </div>
            <div>
               <div className="flex items-center gap-3 mb-2 cursor-pointer group w-fit" onClick={() => setIsNotesExpanded(!isNotesExpanded)}>
                 <h1 className="font-serif text-3xl text-brand-primary group-hover:text-black transition-colors">{editCompanyForm.name || 'Unknown Company'}</h1>
                 <ChevronRight size={22} strokeWidth={3} className={`text-brand-secondary group-hover:text-brand-primary transition-all duration-300 ease-out ${isNotesExpanded ? 'rotate-90' : ''}`} />
               </div>
               <div className="flex items-center gap-4 text-sm text-brand-secondary mb-4">
                  <span className="flex items-center gap-1.5"><MapPin size={14} /> {editCompanyForm.location}</span>
                  <span className="flex items-center gap-1.5"><Phone size={14} /> {editCompanyForm.phone}</span>
                  <span className="flex items-center gap-1.5"><Mail size={14} /> {editCompanyForm.email}</span>
               </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(liveCustomerData?.highPriority || customer?.highPriority) && (
                    <span className="text-[10px] bg-red-600 text-white px-2.5 py-1 rounded-md font-bold uppercase tracking-wider flex items-center gap-1 shadow-xs">
                      <AlertTriangle size={11} /> High Priority
                    </span>
                  )}
                  <span className="text-[10px] bg-brand-bg border border-brand-border px-2.5 py-1 rounded-md text-brand-secondary font-semibold uppercase tracking-wider">{customer?.type || 'B2C'}</span>
                  {isOnline() ? (
                    <span className="text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Active Portal Session
                    </span>
                  ) : (
                    <span className="text-[10px] bg-neutral-50 border border-neutral-200 text-neutral-500 px-2.5 py-1 rounded-md font-semibold uppercase tracking-wider">
                      {customer?.lastActiveAt ? `Last active: ${new Date(customer.lastActiveAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}` : 'Portal Offline'}
                    </span>
                  )}
                  {hasNet30 && (
                    <span className="text-[10px] bg-blue-50 border border-blue-200 text-blue-700 px-2.5 py-1 rounded-md font-semibold uppercase tracking-wider">Net 30 Terms</span>
                  )}
                  {customer?.taxExempt && (
                    <span className="text-[10px] bg-purple-50 border border-purple-200 text-purple-700 px-2.5 py-1 rounded-md font-semibold uppercase tracking-wider">Tax Exempt</span>
                  )}
                  {(liveCustomerData?.freeShipping || customer?.freeShipping) && (
                    <span className="text-[10px] bg-emerald-50 border border-emerald-300 text-emerald-800 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm">
                      <Truck size={10} className="text-emerald-600" /> Free Shipping
                    </span>
                  )}
                  {customer?.bypassMinimumRequirement && (
                    <span className="text-[10px] bg-amber-50 border border-amber-200 text-amber-800 px-2.5 py-1 rounded-md font-semibold uppercase tracking-wider">No Order Minimum</span>
                  )}
                  {customer?.autoQuotingEnabled === 'enabled' && (
                    <span className="text-[10px] bg-amber-50 border border-amber-250 text-amber-800 px-2.5 py-1 rounded-md font-semibold uppercase tracking-wider flex items-center gap-1">
                      <Zap size={10} className="fill-amber-500 text-amber-600" /> Auto-Quote: Forced ON
                    </span>
                  )}
                  {customer?.autoQuotingEnabled === 'disabled' && (
                    <span className="text-[10px] bg-red-50 border border-red-200 text-red-700 px-2.5 py-1 rounded-md font-semibold uppercase tracking-wider flex items-center gap-1">
                      <Zap size={10} className="text-red-500" /> Auto-Quote: Forced OFF
                    </span>
                  )}
                  {(() => {
                    const accDisc = liveCustomerData?.accountDiscount || customer?.accountDiscount;
                    if (!accDisc?.enabled || !(accDisc.value > 0)) return null;
                    const isExpired = accDisc.expires ? new Date(`${accDisc.expires}T23:59:59`).getTime() < Date.now() : false;
                    return (
                      <span className={`text-[10px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm ${
                        isExpired 
                          ? 'bg-amber-50 border border-amber-300 text-amber-700' 
                          : 'bg-emerald-50 border border-emerald-300 text-emerald-800'
                      }`}>
                        <Tag size={10} className={isExpired ? 'text-amber-600' : 'text-emerald-600'} />
                        {accDisc.note ? accDisc.note : 'Account Discount'}: {accDisc.type === 'percent' ? `${accDisc.value}% Off` : `$${accDisc.value} Off`}
                        {isExpired ? ' (Expired)' : accDisc.expires ? ` (Exp: ${accDisc.expires})` : ' (Forever)'}
                      </span>
                    );
                  })()}
                  {customer?.resaleCertificateUrl && (
                    <a 
                      href={customer.resaleCertificateUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-[10px] bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-md font-semibold uppercase tracking-wider flex items-center gap-1 transition-colors"
                    >
                      <FileText size={10} /> Resale Cert
                    </a>
                  )}
                  {(liveCustomerData?.requirePortalAgreements || customer?.requirePortalAgreements) && (
                    <button
                      type="button"
                      onClick={() => setIsSignedAgreementsModalOpen(true)}
                      className={`text-[10px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider flex items-center gap-1 shadow-xs cursor-pointer transition-colors ${
                        liveCustomerData?.portalAgreementsSigned
                          ? 'bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800'
                          : 'bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800'
                      }`}
                      title="Click to view or preview Portal Agreements & NDA Packet"
                    >
                      <ShieldCheck size={11} className={liveCustomerData?.portalAgreementsSigned ? 'text-emerald-600' : 'text-amber-600'} />
                      {liveCustomerData?.portalAgreementsSigned
                        ? 'NDA & Agreements Signed'
                        : 'Awaiting NDA / Portal Signature'}
                    </button>
                  )}
                </div>
            </div>
          </div>
         <div className="flex gap-8 text-right bg-brand-bg/50 p-6 rounded-2xl border border-brand-border border-dashed">
            <div>
               <p className="text-xs uppercase font-bold tracking-widest text-brand-secondary mb-1">Total Orders</p>
               <p className="font-serif text-3xl">{totalOrders}</p>
            </div>
            <div>
               <p className="text-xs uppercase font-bold tracking-widest text-brand-secondary mb-1">Lifetime Value</p>
               <p className="font-serif text-3xl">{formattedLTV}</p>
            </div>
         </div>
        </div>

        {/* Expanded Logistics & Branding Notes (Nested in Header Card) */}
        <div className={`grid transition-all duration-500 ease-in-out ${isNotesExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'}`}>
          <div className="overflow-hidden">
             <div className="bg-brand-bg/50 rounded-[1.5rem] p-6 lg:p-8 flex flex-col lg:flex-row gap-8 shadow-inner border border-brand-border/40 mt-6 lg:mt-8">
                 <div className="flex-1">
                    <h4 className="flex items-center gap-2 text-[11px] uppercase font-bold tracking-widest text-brand-secondary mb-3">
                      <Phone size={14} className="opacity-70" /> Shipping Info
                    </h4>
                    {editCompanyForm.shippingStreet || editCompanyForm.shippingCity ? (
                      <div className="text-brand-primary text-[15px] font-medium pl-6 leading-relaxed">
                        <p>{editCompanyForm.shippingStreet}</p>
                        <p>{editCompanyForm.shippingCity}{editCompanyForm.shippingState ? `, ${editCompanyForm.shippingState}` : ''} {editCompanyForm.shippingZip}</p>
                      </div>
                    ) : (
                      <p className="text-brand-primary text-[15px] font-medium pl-6 text-brand-secondary/60 italic">{editCompanyForm.location || 'No preferred location set'}</p>
                    )}
                 </div>
                 
                 <div className="hidden lg:block w-px bg-brand-border/60" />
                 <div className="block lg:hidden h-px bg-brand-border/60" />
                 
                 <div className="flex-[2]">
                    <div className="flex items-center gap-2 mb-3">
                       <h4 className="text-[11px] uppercase font-bold tracking-widest text-brand-secondary">Branding Notes</h4>
                       {!isEditingNote && (
                         <button onClick={(e) => { e.stopPropagation(); setIsEditingNote(true); }} className="text-sm bg-brand-border/40 hover:bg-brand-border p-1.5 rounded-md text-brand-secondary hover:text-brand-primary transition-colors inline-flex items-center">
                            <Edit3 size={14} />
                         </button>
                       )}
                    </div>
                    {isEditingNote ? (
                      <div className="flex items-center gap-3 max-w-3xl pl-1" onClick={e => e.stopPropagation()}>
                         <input 
                           type="text" 
                           value={noteText}
                           onChange={e => setNoteText(e.target.value)}
                           className="flex-1 bg-white border border-brand-border rounded-xl px-4 py-3 text-[15px] focus:border-brand-primary focus:outline-none text-brand-primary shadow-sm"
                           placeholder="Add internal branding notes..."
                           autoFocus
                           disabled={savingNote}
                           onKeyDown={(e) => {
                             if (e.key === 'Enter') handleSaveBrandingNotes();
                             if (e.key === 'Escape') {
                               setNoteText(liveCustomerData?.brandingNotes !== undefined ? liveCustomerData.brandingNotes : (liveCustomerData?.notes || ''));
                               setIsEditingNote(false);
                             }
                           }}
                         />
                         <button
                           onClick={handleSaveBrandingNotes}
                           disabled={savingNote}
                           className="text-[13px] bg-brand-primary text-white px-5 py-3 rounded-xl font-bold tracking-wide hover:bg-black transition-colors shadow-sm cursor-pointer z-10 disabled:opacity-50"
                         >
                           {savingNote ? 'Saving...' : 'Save'}
                         </button>
                      </div>
                    ) : (
                      <p className="text-brand-primary text-[15px] leading-relaxed pl-1 max-w-4xl">{noteText || 'No internal branding notes added.'}</p>
                    )}
                 </div>
             </div>
          </div>
        </div>
      </div>



      {/* Main Content Area */}
      <div className="flex flex-col gap-8">

        {/* Active Catalogs */}
        {isLoadingCustomerDecks ? (
          <div className="mt-4 flex flex-col items-center justify-center p-12 bg-white rounded-card border border-brand-border border-dashed">
            <Loader2 className="animate-spin text-brand-primary mb-4" size={28} />
            <p className="text-sm font-medium text-brand-secondary">Syncing assigned design decks...</p>
          </div>
        ) : customerDecks.length > 0 && (
          <div className="mt-4">
             <div className="flex items-center justify-between mb-6">
                <div>
                   <h2 className={tokens.typography.h2}>Assigned Garment Decks</h2>
                   <p className="text-sm text-brand-secondary mt-1">Collections pulled from the WOVN catalog for this customer.</p>
                </div>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
               {customerDecks.map((deck) => (
                 <div key={deck.id || deck.name} className="bg-white rounded-card border border-brand-border shadow-sm p-6 overflow-hidden">
                   <div className="flex items-center justify-between border-b border-brand-border/60 pb-4 mb-4">
                      <h3 className="font-bold text-lg text-brand-primary tracking-tight">{deck.name || "Catalog Deck"}</h3>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary bg-brand-bg px-2 py-1 rounded-md">{(deck.items || deck.garments || []).length} Styles</span>
                   </div>
                   <div className="flex items-center gap-3 overflow-x-auto custom-scrollbar pb-2 relative">
                      {(deck.items || deck.garments || []).map((item: any, idx: number) => {
                        const style = item.garment_name || item.name || item.style || item.title || 'Unknown Style';
                        const itemKey = item.itemNum || item.garment_id || item.sku || item.style || item.id || '';
                        const overriddenImage = liveCustomerData?.deckMockupOverrides?.[itemKey];
                        const image = overriddenImage || item.mockup_image || item.mock_image || item.original_image || item.image || item.imageUrl || 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&q=80&w=200&h=200';
                        return (
                           <div 
                             key={idx} 
                             className="w-16 h-16 rounded-xl overflow-hidden bg-transparent shrink-0 hover:scale-[1.05] transition-transform tooltip relative group/deckitem cursor-pointer"
                           >
                             <img 
                               src={image} 
                               alt={style} 
                               className="w-full h-full object-contain mix-blend-multiply" 
                               onClick={() => setExpandedImage({src: image, alt: style})}
                             />
                             <span className="tooltiptext whitespace-nowrap z-[110]">{style}</span>
                             
                             {uploadingDeckItemKey === itemKey ? (
                                <div className="absolute inset-0 bg-black/55 flex items-center justify-center rounded-xl">
                                  <Loader2 size={14} className="animate-spin text-white" />
                                </div>
                              ) : (
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/deckitem:opacity-100 flex items-center justify-center gap-1.5 transition-opacity rounded-xl">
                                  <label className="p-1 hover:bg-neutral-800 rounded transition-colors cursor-pointer" title="Upload custom mockup">
                                    <input 
                                      type="file" 
                                      className="hidden" 
                                      accept="image/*" 
                                      onChange={(e) => handleDeckItemMockupUpload(item, e)} 
                                    />
                                    <Edit3 size={12} className="text-white" />
                                  </label>
                                  {overriddenImage && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveDeckItemMockupOverride(item);
                                      }}
                                      className="p-1 hover:bg-neutral-800 rounded transition-colors"
                                      title="Remove mockup override"
                                    >
                                      <Trash2 size={12} className="text-white hover:text-red-400" />
                                    </button>
                                  )}
                                </div>
                              )}
                           </div>
                        );
                      })}
                   </div>
                 </div>
               ))}
             </div>
          </div>
        )}

        {/* Brands (Sub-Customers) Full-Width Dropdown Box - Hidden on subcustomer pages */}
        {!liveCustomerData?.parentCustomerId && (
        <div
          onClick={() => {
            if (isBrandsSectionCollapsed) setIsBrandsSectionCollapsed(false);
          }}
          className={`w-full bg-white rounded-card border border-brand-border shadow-sm p-6 mt-4 ${
            isBrandsSectionCollapsed ? 'cursor-pointer hover:border-brand-primary/30 transition-colors' : ''
          }`}
        >
          <div
            onClick={(e) => {
              e.stopPropagation();
              setIsBrandsSectionCollapsed(!isBrandsSectionCollapsed);
            }}
            className="flex flex-col gap-3 border-b border-brand-border/60 pb-4 cursor-pointer select-none"
          >
            <div className="flex items-center justify-between">
              <div className="flex gap-6 items-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsBrandsSectionCollapsed(!isBrandsSectionCollapsed);
                  }}
                  className="flex items-center pb-2 text-sm font-bold transition-all border-b-2 text-neutral-900 border-neutral-900 cursor-pointer"
                >
                  <span>Brands</span>
                  <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-900 text-white">
                    {subBrands.length}
                  </span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                {!isBrandsSectionCollapsed && (
                  <PillButton
                    variant="outline"
                    className="px-4 text-xs font-bold gap-1 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsNewBrandModalOpen(true);
                    }}
                  >
                    <Plus size={14} /> Add Brand
                  </PillButton>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsBrandsSectionCollapsed(!isBrandsSectionCollapsed);
                  }}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-brand-primary hover:bg-neutral-100 transition-colors cursor-pointer"
                  title={isBrandsSectionCollapsed ? "Expand Brands" : "Collapse Brands"}
                >
                  {isBrandsSectionCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                </button>
              </div>
            </div>

            {!isBrandsSectionCollapsed && (
              <p className="text-xs text-brand-secondary">
                Sub-customers and brands managed under this customer account, each with its own shipping address, assets, and orders.
              </p>
            )}
          </div>

          {!isBrandsSectionCollapsed && (
            <div className="mt-4">
              {subBrands.length === 0 ? (
                <div className="bg-brand-bg/50 rounded-xl p-8 text-center text-sm font-medium text-brand-secondary border border-dashed border-brand-border/60 my-2 flex flex-col items-center justify-center gap-3">
                  <p>No brands added under this customer yet. Click below to create a sub-brand.</p>
                  <PillButton
                    variant="filled"
                    className="gap-1.5 text-xs"
                    onClick={() => setIsNewBrandModalOpen(true)}
                  >
                    <Plus size={14} /> New Brand
                  </PillButton>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {subBrands.map((brand: any) => {
                    const brandName = brand.company && brand.company !== '-' ? brand.company : (brand.contactName || 'Unnamed Brand');
                    const shippingLine = brand.shippingStreet
                      ? `${brand.shippingStreet}${brand.shippingCity ? `, ${brand.shippingCity}` : ''}${brand.shippingState ? `, ${brand.shippingState}` : ''} ${brand.shippingZip || ''}`.trim()
                      : (brand.location || '');
                    return (
                      <div
                        key={brand.id}
                        onClick={() => navigate(`/customers/${brand.id}`)}
                        className="flex items-start justify-between gap-4 bg-brand-bg/30 hover:bg-brand-bg/70 border border-brand-border/70 hover:border-brand-primary/40 rounded-2xl p-4 transition-all cursor-pointer group"
                      >
                        <div className="flex items-start gap-3.5 min-w-0 flex-1">
                          <div className="w-12 h-12 rounded-xl bg-white border border-brand-border flex items-center justify-center text-brand-secondary shrink-0 overflow-hidden p-1">
                            {brand.croppedLogo || brand.logo ? (
                              <img src={brand.croppedLogo || brand.logo} alt={brandName} className="w-full h-full object-contain mix-blend-multiply" />
                            ) : (
                              <Building2 size={20} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-serif text-lg text-brand-primary group-hover:text-black truncate">
                                {brandName}
                              </h4>
                              <span className="text-[9px] bg-white border border-brand-border px-1.5 py-0.5 rounded text-brand-secondary font-bold uppercase tracking-wider shrink-0">
                                {brand.type || 'B2B'}
                              </span>
                            </div>
                            {brand.contactName && brand.company && brand.company !== '-' && (
                              <p className="text-xs font-medium text-brand-primary/80 truncate mt-0.5">
                                {brand.contactName}
                              </p>
                            )}
                            <div className="flex flex-col gap-1 mt-1.5 text-[11px] text-brand-secondary">
                              {shippingLine ? (
                                <span className="flex items-center gap-1.5 truncate" title={shippingLine}>
                                  <MapPin size={12} className="shrink-0 text-brand-secondary" />
                                  <span className="truncate">{shippingLine}</span>
                                </span>
                              ) : (
                                <span className="text-[10px] italic text-brand-secondary/60">No shipping address set</span>
                              )}
                              {(brand.email || brand.phone) && (
                                <div className="flex items-center gap-3 flex-wrap text-[10px] text-brand-secondary/80">
                                  {brand.phone && (
                                    <span className="flex items-center gap-1 truncate">
                                      <Phone size={10} className="shrink-0" /> {brand.phone}
                                    </span>
                                  )}
                                  {brand.email && (
                                    <span className="flex items-center gap-1 truncate">
                                      <Mail size={10} className="shrink-0" /> {brand.email}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(`/portal/${brand.id}`, '_blank');
                            }}
                            className="p-1.5 text-brand-secondary hover:text-brand-primary hover:bg-white rounded-lg transition-colors cursor-pointer"
                            title="Open Brand Client Portal"
                          >
                            <ExternalLink size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteBrand(e, brand.id, brandName)}
                            disabled={deletingBrandId === brand.id}
                            className="p-1.5 text-brand-secondary hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                            title="Delete Brand"
                          >
                            <Trash2 size={15} />
                          </button>
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

        {/* Designer Rack Full-Width Dropdown Box - Shown on parent companies (under Brands) and subcustomers */}
          <div
            onClick={() => {
              if (isDesignerRackCollapsed) setIsDesignerRackCollapsed(false);
            }}
            className={`w-full bg-white rounded-card border border-brand-border shadow-sm p-6 mt-4 ${
              isDesignerRackCollapsed ? 'cursor-pointer hover:border-brand-primary/30 transition-colors' : ''
            }`}
          >
            <div
              onClick={(e) => {
                e.stopPropagation();
                setIsDesignerRackCollapsed(!isDesignerRackCollapsed);
              }}
              className="flex flex-col gap-3 border-b border-brand-border/60 pb-4 cursor-pointer select-none"
            >
              <div className="flex items-center justify-between">
                <div className="flex gap-6 items-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDesignerRackCollapsed(!isDesignerRackCollapsed);
                    }}
                    className="flex items-center pb-2 text-sm font-bold transition-all border-b-2 text-neutral-900 border-neutral-900 cursor-pointer"
                  >
                    <span>Designer Rack</span>
                    <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-900 text-white">
                      {combinedDesignerRack.length}
                    </span>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {!isDesignerRackCollapsed && subBrands.length === 0 && (
                    <PillButton
                      variant="outline"
                      className="px-3.5 py-1.5 text-xs font-bold gap-1 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenNewDesignerRackModal();
                      }}
                    >
                      <Plus size={14} /> Design
                    </PillButton>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDesignerRackCollapsed(!isDesignerRackCollapsed);
                    }}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-brand-primary hover:bg-neutral-100 transition-colors cursor-pointer"
                    title={isDesignerRackCollapsed ? 'Expand Designer Rack' : 'Collapse Designer Rack'}
                  >
                    {isDesignerRackCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                  </button>
                </div>
              </div>

              {!isDesignerRackCollapsed && (
                <div className="flex flex-col gap-2.5">
                  <p className="text-xs text-brand-secondary">
                    {subBrands.length > 0
                      ? 'Uploaded designs, mockups, logos, PSD links, and garment sourcing links curated across this parent company and all its brands.'
                      : 'Uploaded designs, mockups, logos, PSD links, and garment sourcing links curated for this brand.'}
                  </p>
                  {subBrands.length > 0 && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex flex-wrap items-center gap-2.5 pt-1"
                    >
                      <label className="text-[11px] font-bold uppercase tracking-wider text-brand-secondary shrink-0">
                        Brand Rack:
                      </label>
                      <div className="relative">
                        <select
                          value={selectedDesignerRackBrandFilter}
                          onChange={(e) => setSelectedDesignerRackBrandFilter(e.target.value)}
                          className="appearance-none bg-white border border-brand-border hover:border-brand-primary focus:border-brand-primary rounded-xl pl-3.5 pr-8 py-1.5 text-xs font-bold text-brand-primary focus:outline-none transition-all cursor-pointer shadow-2xs"
                        >
                          <option value="all">
                            All ({combinedDesignerRack.length})
                          </option>
                          <option value={id || ''}>
                            {editCompanyForm.name || liveCustomerData?.company || liveCustomerData?.contactName || 'Parent'} ({designerRack.length})
                          </option>
                          {subBrands.map((b: any) => {
                            const bCount = Array.isArray(b.designerRack) ? b.designerRack.length : 0;
                            const bName = b.company || b.contactName || 'Sub-Brand';
                            return (
                              <option key={b.id} value={b.id}>
                                {bName} ({bCount})
                              </option>
                            );
                          })}
                        </select>
                        <ChevronDown
                          size={14}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-secondary pointer-events-none"
                        />
                      </div>
                      <PillButton
                        variant="outline"
                        className="px-3.5 py-1.5 text-xs font-bold gap-1 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenNewDesignerRackModal();
                        }}
                      >
                        <Plus size={14} /> Design
                      </PillButton>
                    </div>
                  )}
                </div>
              )}
            </div>

            {!isDesignerRackCollapsed && (
              <div className="mt-4">
                {filteredDesignerRack.length === 0 ? (
                  <div className="bg-brand-bg/50 rounded-xl p-8 text-center text-sm font-medium text-brand-secondary border border-dashed border-brand-border/60 my-2 flex flex-col items-center justify-center gap-3">
                    <p>No designs uploaded to the Designer Rack yet. Click below to upload a design.</p>
                    <PillButton
                      variant="filled"
                      className="gap-1.5 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenNewDesignerRackModal();
                      }}
                    >
                      <Upload size={14} /> Upload Design
                    </PillButton>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filteredDesignerRack.map((design: any) => {
                      const legacyMockups: { id: string; name: string; url: string }[] = Array.isArray(design.mockups)
                        ? design.mockups
                        : [];
                      const frontSrc = design.frontMockupUrl || legacyMockups[0]?.url || design.mockupUrl || design.url || '';
                      const frontName = design.frontMockupName || legacyMockups[0]?.name || design.mockupName || design.name || 'Front Mock-up';
                      const backSrc = design.backMockupUrl || legacyMockups[1]?.url || '';
                      const otherMockups: { id: string; name: string; url: string }[] = Array.isArray(design.otherMockups)
                        ? design.otherMockups
                        : legacyMockups.length > 2
                        ? legacyMockups.slice(2)
                        : [];

                      const designMockups: { id: string; name: string; url: string }[] = [
                        ...(frontSrc ? [{ id: 'front', name: 'Front Mock-up', url: frontSrc }] : []),
                        ...(backSrc ? [{ id: 'back', name: 'Back Mock-up', url: backSrc }] : []),
                        ...otherMockups.map((m, idx) => ({
                          id: m.id || `other-${idx}`,
                          name: m.name || `Other Mock-up ${idx + 1}`,
                          url: m.url
                        }))
                      ];
                      const lightboxMockupImages = designMockups
                        .filter((m) => Boolean(m.url && !m.url.match(/\.(pdf|ai|eps|psd)(\?.*)?$/i)))
                        .map((m) => ({
                          src: m.url,
                          alt: `${ design.title || design.name || 'Untitled Design' } - ${m.name}`,
                          label: m.name
                        }));
                      const mockupSrc = frontSrc || designMockups[0]?.url || '';
                      const mockupLabel = frontSrc ? frontName : designMockups[0]?.name || 'Mock-up';
                      const displayTitle = design.title || design.name || 'Untitled Design';
                      const isMockupImage = Boolean(
                        mockupSrc &&
                          (mockupLabel.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i) ||
                            mockupSrc.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i) ||
                            !mockupLabel.includes('.'))
                      );
                      const designLogos: { id: string; name: string; url: string }[] = Array.isArray(design.logos)
                        ? design.logos
                        : [];

                      const missingFields: string[] = [];
                      if (!frontSrc) missingFields.push('Front Mock-up');
                      if (!backSrc) missingFields.push('Back Mock-up');
                      if (designLogos.length === 0) missingFields.push('Logo(s)');
                      if (!design.psdDriveLink?.trim()) missingFields.push('PSD Drive Link');
                      if (!design.garmentSourcingLink?.trim()) missingFields.push('Garment Sourcing Link');
                      const isIncomplete = missingFields.length > 0;

                      return (
                        <div
                          key={`${design._sourceCustomerId || 'own'}-${design.id}`}
                          className="flex flex-col justify-between bg-white hover:bg-brand-bg/20 border border-brand-border rounded-2xl p-5 transition-all group relative gap-4 shadow-2xs"
                        >
                          {/* Top-Right Status Badge: Green Checkmark when Final Design Approved, or Red Exclamation when Incomplete */}
                          {design.finalDesignApproved ? (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditDesignerRackModal(design);
                              }}
                              className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-md ring-2 ring-white cursor-pointer z-10"
                              title="Final Design Approved — Click to edit"
                            >
                              <Check size={13} strokeWidth={3} />
                            </div>
                          ) : isIncomplete ? (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditDesignerRackModal(design);
                              }}
                              className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-red-600 text-white text-xs font-black flex items-center justify-center shadow-md ring-2 ring-white cursor-pointer z-10"
                              title={`Incomplete — Missing: ${missingFields.join(', ')}. Click to edit.`}
                            >
                              !
                            </div>
                          ) : null}

                          <div className="flex items-start gap-5">
                            {/* Larger Front Mock-up Preview */}
                            <div
                              onClick={() => {
                                if (!mockupSrc) return;
                                if (isMockupImage) {
                                  setExpandedImage({
                                    src: mockupSrc,
                                    alt: displayTitle,
                                    images: lightboxMockupImages.length > 0 ? lightboxMockupImages : undefined
                                  });
                                } else {
                                  window.open(mockupSrc, '_blank');
                                }
                              }}
                              className={`w-36 h-36 sm:w-40 sm:h-40 rounded-2xl border border-brand-border/60 bg-neutral-50/70 flex items-center justify-center p-2.5 overflow-hidden shrink-0 ${
                                mockupSrc ? 'cursor-pointer' : ''
                              }`}
                              title={mockupSrc ? 'Click to view Front Mock-up' : 'No Front Mock-up uploaded'}
                            >
                              {mockupSrc ? (
                                isMockupImage ? (
                                  <img
                                    src={mockupSrc}
                                    alt={displayTitle}
                                    className="w-full h-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform duration-200"
                                  />
                                ) : (
                                  <div className="flex flex-col items-center gap-1 text-center">
                                    <FileText size={28} className="text-neutral-500" />
                                    <span className="text-[10px] font-black uppercase text-neutral-500 truncate max-w-[90px]">
                                      {mockupLabel.split('.').pop() || 'MOCKUP'}
                                    </span>
                                  </div>
                                )
                              ) : (
                                <span className="text-xs text-neutral-400 font-semibold text-center">No Mock-up</span>
                              )}
                            </div>

                            {/* Design Info & Logos */}
                            <div className="min-w-0 flex-1 flex flex-col justify-between h-full">
                              <div>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <h4 className="font-bold text-base text-brand-primary truncate" title={displayTitle}>
                                        {displayTitle}
                                      </h4>
                                    </div>
                                    {subBrands.length > 0 && design._sourceCustomerName && (
                                      <div className="mt-1">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                          design._isSubBrand
                                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                            : 'bg-neutral-100 text-neutral-700 border-neutral-200'
                                        }`}>
                                          <Building2 size={10} />
                                          <span className="truncate max-w-[140px]">{design._sourceCustomerName}</span>
                                        </span>
                                      </div>
                                    )}
                                    {design.uploadedAt && (
                                      <p className="text-[11px] text-brand-secondary mt-0.5">
                                        Added {new Date(design.uploadedAt).toLocaleDateString()}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenEditDesignerRackModal(design);
                                      }}
                                      className="p-1.5 text-brand-secondary hover:text-brand-primary hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                                      title="Edit Design"
                                    >
                                      <Edit3 size={15} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteDesignerRackItem(design.id, design._sourceCustomerId);
                                      }}
                                      className="p-1.5 text-brand-secondary hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                      title="Remove Design"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                </div>

                                {/* Logos Row */}
                                <div className="mt-4">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary mb-1.5">
                                    Logos ({designLogos.length})
                                  </p>
                                  {designLogos.length === 0 ? (
                                    <p className="text-[11px] italic text-brand-secondary/60">No logos attached</p>
                                  ) : (
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {designLogos.map((logo) => {
                                        const isLogoImg = Boolean(logo.name?.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i));
                                        return (
                                          <div
                                            key={logo.id}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (isLogoImg) {
                                                setExpandedImage({ src: logo.url, alt: logo.name });
                                              } else {
                                                window.open(logo.url, '_blank');
                                              }
                                            }}
                                            className="w-11 h-11 rounded-xl border border-brand-border/70 bg-checkerboard p-1.5 flex items-center justify-center cursor-pointer hover:border-brand-primary transition-colors overflow-hidden"
                                            title={`Logo: ${logo.name}`}
                                          >
                                            {isLogoImg ? (
                                              <img src={logo.url} alt={logo.name} className="max-w-full max-h-full object-contain" />
                                            ) : (
                                              <span className="text-[8px] font-black uppercase text-neutral-600">
                                                {logo.name?.split('.').pop() || 'FILE'}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Plain Black Links Footer (PSD Drive Link & Garment Sourcing Link) */}
                          <div className="flex flex-wrap items-center gap-5 pt-3 border-t border-brand-border/50">
                            {design.psdDriveLink ? (
                              <a
                                href={design.psdDriveLink.startsWith('http') ? design.psdDriveLink : `https://${design.psdDriveLink}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-900 hover:text-black hover:underline transition-colors"
                                title={design.psdDriveLink}
                              >
                                <FileText size={13} />
                                <span>PSD Drive Link</span>
                                <ExternalLink size={11} />
                              </a>
                            ) : (
                              <span className="text-xs text-brand-secondary/50 italic">No PSD link</span>
                            )}

                            {design.garmentSourcingLink ? (
                              <div className="inline-flex items-center gap-1.5">
                                <a
                                  href={design.garmentSourcingLink.startsWith('http') ? design.garmentSourcingLink : `https://${design.garmentSourcingLink}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-900 hover:text-black hover:underline transition-colors"
                                  title={design.garmentSourcingLink}
                                >
                                  <Shirt size={13} />
                                  <span>Garment Sourcing Link</span>
                                  <ExternalLink size={11} />
                                </a>
                                {Boolean(design.approvedForOrder) && (
                                  <span
                                    className="w-4 h-4 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center shrink-0"
                                    title="Approved for Order"
                                  >
                                    <Check size={10} strokeWidth={3} />
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs text-brand-secondary/50 italic">
                                <span>No sourcing link</span>
                                {Boolean(design.approvedForOrder) && (
                                  <span
                                    className="w-4 h-4 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center shrink-0 not-italic"
                                    title="Approved for Order"
                                  >
                                    <Check size={10} strokeWidth={3} />
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

        {/* Suggested Items & Asset Vault Row */}
        <div
          className={`grid grid-cols-1 lg:grid-cols-2 gap-8 ${
            liveCustomerData?.parentCustomerId
              ? 'order-last mt-8 border-t border-brand-border pt-12'
              : 'mt-4'
          }`}
        >
          
          {/* Suggested Items (Recommendations) */}
          <div
            onClick={() => {
              if (isGarmentsSectionCollapsed) setIsGarmentsSectionCollapsed(false);
            }}
            className={`bg-white rounded-card border border-brand-border shadow-sm p-6 flex flex-col justify-between ${
              isGarmentsSectionCollapsed ? 'cursor-pointer hover:border-brand-primary/30 transition-colors' : ''
            }`}
          >
            <div>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setIsGarmentsSectionCollapsed(!isGarmentsSectionCollapsed);
                }}
                className="flex flex-col gap-3 border-b border-brand-border/60 pb-4 mb-4 cursor-pointer select-none"
              >
                <div className="flex items-center justify-between">
                  <div className="flex gap-6 items-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isGarmentsSectionCollapsed) {
                          setActiveGarmentTab('suggested');
                          setIsGarmentsSectionCollapsed(false);
                        } else if (activeGarmentTab !== 'suggested') {
                          setActiveGarmentTab('suggested');
                        } else {
                          setIsGarmentsSectionCollapsed(true);
                        }
                      }}
                      className={`flex items-center pb-2 text-sm font-bold transition-all border-b-2 cursor-pointer ${
                        activeGarmentTab === 'suggested'
                          ? 'text-neutral-900 border-neutral-900'
                          : 'text-neutral-400 border-transparent hover:text-neutral-700 hover:border-neutral-200'
                      }`}
                    >
                      <span>Suggested</span>
                      <span className={`ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                        activeGarmentTab === 'suggested'
                          ? 'bg-neutral-900 text-white'
                          : 'bg-neutral-100 text-neutral-500'
                      }`}>
                        {suggestedItems.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isGarmentsSectionCollapsed) {
                          setActiveGarmentTab('samples');
                          setIsGarmentsSectionCollapsed(false);
                        } else if (activeGarmentTab !== 'samples') {
                          setActiveGarmentTab('samples');
                        } else {
                          setIsGarmentsSectionCollapsed(true);
                        }
                      }}
                      className={`flex items-center pb-2 text-sm font-bold transition-all border-b-2 cursor-pointer ${
                        activeGarmentTab === 'samples'
                          ? 'text-neutral-900 border-neutral-900'
                          : 'text-neutral-400 border-transparent hover:text-neutral-700 hover:border-neutral-200'
                      }`}
                    >
                      <span>Sample Items</span>
                      <span className={`ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                        activeGarmentTab === 'samples'
                          ? 'bg-neutral-900 text-white'
                          : 'bg-neutral-100 text-neutral-500'
                      }`}>
                        {sampleItems.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isGarmentsSectionCollapsed) {
                          setActiveGarmentTab('past');
                          setIsGarmentsSectionCollapsed(false);
                        } else if (activeGarmentTab !== 'past') {
                          setActiveGarmentTab('past');
                        } else {
                          setIsGarmentsSectionCollapsed(true);
                        }
                      }}
                      className={`flex items-center pb-2 text-sm font-bold transition-all border-b-2 cursor-pointer ${
                        activeGarmentTab === 'past'
                          ? 'text-neutral-900 border-neutral-900'
                          : 'text-neutral-400 border-transparent hover:text-neutral-700 hover:border-neutral-200'
                      }`}
                    >
                      <span>Past Ordered</span>
                      <span className={`ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                        activeGarmentTab === 'past'
                          ? 'bg-neutral-900 text-white'
                          : 'bg-neutral-100 text-neutral-500'
                      }`}>
                        {pastGarments.length}
                      </span>
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isGarmentsSectionCollapsed && activeGarmentTab === 'suggested' && (
                      <PillButton variant="outline" className="px-4 text-xs font-bold gap-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); setSuggestedModalType('suggested'); setIsAddingSuggestedModalOpen(true); }}>
                        <Plus size={14} /> Add Suggestion
                      </PillButton>
                    )}
                    {!isGarmentsSectionCollapsed && activeGarmentTab === 'samples' && (
                      <PillButton variant="outline" className="px-4 text-xs font-bold gap-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); setSuggestedModalType('sample'); setIsAddingSuggestedModalOpen(true); }}>
                        <Plus size={14} /> Add Sample Item
                      </PillButton>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsGarmentsSectionCollapsed(!isGarmentsSectionCollapsed);
                      }}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-brand-primary hover:bg-neutral-100 transition-colors cursor-pointer"
                      title={isGarmentsSectionCollapsed ? "Expand section" : "Collapse section"}
                    >
                      {isGarmentsSectionCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                    </button>
                  </div>
                </div>

                {!isGarmentsSectionCollapsed && (
                  <p className="text-xs text-brand-secondary">
                    {activeGarmentTab === 'suggested' 
                      ? 'Items recommended for this customer to order or quote.' 
                      : activeGarmentTab === 'samples'
                      ? 'Blank or sample garments available to client portal.'
                      : 'Garments previously ordered by this customer.'}
                  </p>
                )}
              </div>

              {!isGarmentsSectionCollapsed && (
                <>
                  {activeGarmentTab === 'suggested' && (
                suggestedItems.length === 0 ? (
                  <div className="bg-brand-bg/50 rounded-xl p-8 text-center text-sm font-medium text-brand-secondary border border-dashed border-brand-border/60 my-4">
                    No recommended garments yet. Click above to suggest some.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                    {suggestedItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-4 bg-brand-bg/30 border border-brand-border/60 rounded-2xl p-3 hover:border-brand-primary/20 transition-colors">
                        <div className="w-12 h-12 bg-white border border-brand-border rounded-xl overflow-hidden flex items-center justify-center p-1 shrink-0">
                          <img src={item.image} alt={item.style} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-neutral-900 text-sm truncate">{item.style}</h4>
                            <span className="text-[9px] font-bold text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded-full shrink-0">
                              {item.gender || 'Unisex'}
                            </span>
                          </div>
                          <p className="text-xs text-brand-secondary truncate mt-0.5">{item.itemNum || 'Custom Item'} • ${item.price.toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => openEditModal(item, 'suggested')}
                            className="text-neutral-400 hover:text-brand-primary transition-colors p-2 cursor-pointer"
                            title="Edit Suggestion"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button 
                            onClick={() => handleDeleteSuggestedItem(item.id)}
                            className="text-neutral-400 hover:text-red-500 transition-colors p-2 cursor-pointer"
                            title="Remove Suggestion"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {activeGarmentTab === 'samples' && (
                sampleItems.length === 0 ? (
                  <div className="bg-brand-bg/50 rounded-xl p-8 text-center text-sm font-medium text-brand-secondary border border-dashed border-brand-border/60 my-4">
                    No sample items yet. Click above to add some.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                    {sampleItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-4 bg-brand-bg/30 border border-brand-border/60 rounded-2xl p-3 hover:border-brand-primary/20 transition-colors">
                        <div className="w-12 h-12 bg-white border border-brand-border rounded-xl overflow-hidden flex items-center justify-center p-1 shrink-0">
                          <img src={item.image} alt={item.style} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-neutral-900 text-sm truncate">{item.style}</h4>
                            <span className="text-[9px] font-bold text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded-full shrink-0">
                              {item.gender || 'Unisex'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleToggleSampleVisibility(item.id, item.visible ?? true)}
                              className={`flex items-center gap-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border transition-all ${
                                (item.visible ?? true)
                                  ? 'bg-emerald-50 border-emerald-250 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100'
                              }`}
                              title={item.visible ?? true ? "Visible to client portal. Click to hide." : "Hidden from client portal. Click to show."}
                            >
                              {(item.visible ?? true) ? <Eye size={10} /> : <EyeOff size={10} />}
                              <span>{(item.visible ?? true) ? 'Visible' : 'Hidden'}</span>
                            </button>
                          </div>
                          <p className="text-xs text-brand-secondary truncate mt-0.5">{item.itemNum || 'Custom Item'} • ${item.price.toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditModal(item, 'sample')}
                            className="text-neutral-400 hover:text-brand-primary transition-colors p-2 cursor-pointer"
                            title="Edit Sample Item"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button 
                            type="button"
                            onClick={() => handleDeleteSampleItem(item.id)}
                            className="text-neutral-400 hover:text-red-500 transition-colors p-2 cursor-pointer"
                            title="Remove Sample Item"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {activeGarmentTab === 'past' && (
                pastGarments.length === 0 ? (
                  <div className="bg-brand-bg/50 rounded-xl p-8 text-center text-sm font-medium text-brand-secondary border border-dashed border-brand-border/60 my-4">
                    No past garments found for this customer.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                    {pastGarments.map((item: any, idx: number) => {
                      const isAlreadySuggested = suggestedItems.some((s: any) => s.itemNum === item.itemNum || s.style === item.style);
                      return (
                        <div key={item.id || idx} className="flex items-center gap-4 bg-brand-bg/30 border border-brand-border/60 rounded-2xl p-3 hover:border-brand-primary/20 transition-colors">
                          <div className="w-12 h-12 bg-white border border-brand-border rounded-xl overflow-hidden flex items-center justify-center p-1 shrink-0">
                            <img src={item.image} alt={item.style} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-neutral-900 text-sm truncate">{item.style}</h4>
                            <p className="text-xs text-brand-secondary truncate mt-0.5">{item.itemNum || 'Past Item'} {item.price > 0 ? `• $${item.price.toFixed(2)}` : ''}</p>
                          </div>
                          {!isAlreadySuggested ? (
                            <button
                              onClick={async () => {
                                try {
                                  const updated = [...suggestedItems, {
                                    id: `sugg-${Date.now()}`,
                                    style: item.style,
                                    itemNum: item.itemNum,
                                    image: item.image,
                                    price: item.price || 0,
                                    colors: item.colors || ['Custom Color'],
                                    description: ''
                                  }];
                                  await updateDoc(doc(db, 'customers', id!), {
                                    suggestedItems: updated
                                  });
                                  setSuggestedItems(updated);
                                } catch (err) {
                                  console.error("Error suggesting past item:", err);
                                  alert("Failed to suggest garment.");
                                }
                              }}
                              className="text-xs font-bold text-brand-primary hover:text-black border border-brand-border hover:border-black bg-white px-2.5 py-1 rounded-lg shadow-sm transition-all shrink-0 cursor-pointer"
                              title="Suggest to client"
                            >
                              + Suggest
                            </button>
                          ) : (
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full shrink-0">
                              Suggested
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}
                </>
              )}
            </div>
          </div>

          {/* Customer Asset Vault & Chat Card */}
          <div
            id="vault-roster-section"
            onClick={() => {
              if (isVaultSectionCollapsed) setIsVaultSectionCollapsed(false);
            }}
            className={`bg-white rounded-card border border-brand-border shadow-sm p-6 flex flex-col justify-between ${
              !isVaultSectionCollapsed ? 'min-h-[450px]' : 'cursor-pointer hover:border-brand-primary/30 transition-colors'
            }`}
          >
            <div>
              {/* Header Tabs */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setIsVaultSectionCollapsed(!isVaultSectionCollapsed);
                }}
                className="flex items-center justify-between border-b border-brand-border/60 pb-4 mb-4 cursor-pointer select-none"
              >
                <div className="flex gap-6 items-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isVaultSectionCollapsed) {
                        setActiveRightTab('vault');
                        setIsVaultSectionCollapsed(false);
                      } else if (activeRightTab !== 'vault') {
                        setActiveRightTab('vault');
                      } else {
                        setIsVaultSectionCollapsed(true);
                      }
                    }}
                    className={`flex items-center pb-2 text-sm font-bold transition-all border-b-2 cursor-pointer ${
                      activeRightTab === 'vault'
                        ? 'text-neutral-900 border-neutral-900'
                        : 'text-neutral-400 border-transparent hover:text-neutral-700 hover:border-neutral-200'
                    }`}
                  >
                    Asset Vault
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isVaultSectionCollapsed) {
                        setActiveRightTab('chat');
                        setIsVaultSectionCollapsed(false);
                      } else if (activeRightTab !== 'chat') {
                        setActiveRightTab('chat');
                      } else {
                        setIsVaultSectionCollapsed(true);
                      }
                    }}
                    className={`flex items-center pb-2 text-sm font-bold transition-all border-b-2 cursor-pointer relative gap-1.5 ${
                      activeRightTab === 'chat'
                        ? 'text-neutral-900 border-neutral-900'
                        : 'text-neutral-400 border-transparent hover:text-neutral-700 hover:border-neutral-200'
                    }`}
                  >
                    <span>Customer Chat</span>
                    {isOnline() && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)] animate-pulse shrink-0" />
                    )}
                    {adminUnreadChatCount > 0 && (
                      <span className="absolute -top-1.5 -right-3.5 bg-red-500 text-white text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center border border-white">
                        {adminUnreadChatCount}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isVaultSectionCollapsed) {
                        setActiveRightTab('roster');
                        setIsVaultSectionCollapsed(false);
                      } else if (activeRightTab !== 'roster') {
                        setActiveRightTab('roster');
                      } else {
                        setIsVaultSectionCollapsed(true);
                      }
                    }}
                    className={`flex items-center pb-2 text-sm font-bold transition-all border-b-2 cursor-pointer relative gap-1.5 ${
                      activeRightTab === 'roster'
                        ? 'text-neutral-900 border-neutral-900'
                        : 'text-neutral-400 border-transparent hover:text-neutral-700 hover:border-neutral-200'
                    }`}
                  >
                    <Users size={15} />
                    <span>Team Roster</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200">
                      {teamRoster.length}
                    </span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {!isVaultSectionCollapsed && activeRightTab === 'vault' && (
                    <>
                      {assets.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAutoCropAllAssets();
                          }}
                          disabled={isTrimmingVaultLogos}
                          className="bg-white border border-brand-border hover:bg-neutral-50 px-3 py-2 rounded-xl text-xs font-bold text-neutral-900 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          title="Auto-crop all logos to PNG trimmed to exact visible edges"
                        >
                          {isTrimmingVaultLogos ? (
                            <Loader2 className="animate-spin" size={14} />
                          ) : (
                            <Crop size={14} className="text-emerald-600" />
                          )}
                          {isTrimmingVaultLogos ? "Trimming..." : "Trim All to PNG"}
                        </button>
                      )}
                      <label
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white border border-brand-border hover:bg-neutral-50 px-4 py-2 rounded-xl text-xs font-bold text-neutral-900 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <input type="file" className="hidden" onChange={handleUploadLogoVault} accept="image/*,application/pdf,.ai,.eps,.svg" />
                        {isUploadingLogoVault ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <Upload size={14} />
                        )}
                        {isUploadingLogoVault ? "Uploading..." : "Upload Logo"}
                      </label>
                    </>
                  )}

                  {!isVaultSectionCollapsed && activeRightTab === 'roster' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenAddMemberModal();
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <UserPlus size={14} />
                      Add Member
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsVaultSectionCollapsed(!isVaultSectionCollapsed);
                    }}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-brand-primary hover:bg-neutral-100 transition-colors cursor-pointer"
                    title={isVaultSectionCollapsed ? "Expand section" : "Collapse section"}
                  >
                    {isVaultSectionCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                  </button>
                </div>
              </div>

              {!isVaultSectionCollapsed && (
                <>
                  {activeRightTab === 'vault' ? (
                /* Asset Vault Content */
                <>
                  {assets.length === 0 ? (
                    <div className="bg-brand-bg/50 rounded-xl p-8 text-center text-sm font-medium text-brand-secondary border border-dashed border-brand-border/60 my-4">
                      No logos in vault yet. Upload files to save them for the customer.
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-3 max-h-[350px] overflow-y-auto pr-1">
                      {assets.map((asset) => (
                        <div key={asset.id} className="aspect-square rounded-xl border border-brand-border/60 p-1 bg-checkerboard relative group flex items-center justify-center">
                          {asset.name.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i) ? (
                            <img src={asset.url} alt={asset.name} className="max-w-full max-h-full object-contain cursor-pointer" onClick={() => window.open(asset.url, '_blank')} title={asset.name} />
                          ) : (
                            <div className="flex flex-col items-center gap-0.5 cursor-pointer text-center" onClick={() => window.open(asset.url, '_blank')} title={asset.name}>
                              <FileText size={18} className="text-neutral-500" />
                              <span className="text-[8px] font-black uppercase text-neutral-500 truncate max-w-[45px]">{asset.name.split('.').pop() || 'FILE'}</span>
                            </div>
                          )}

                          {asset.name.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i) && (
                            <button
                              type="button"
                              onClick={() => handleAutoCropSingleAsset(asset)}
                              disabled={isTrimmingVaultLogos}
                              className="absolute -top-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-white border border-neutral-200 shadow-sm text-[9px] font-bold text-neutral-700 hover:text-emerald-600 hover:border-emerald-500 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Auto-crop transparent & white margins to exact PNG edges"
                            >
                              <Crop size={10} className="text-emerald-600" />
                              Trim
                            </button>
                          )}
                          
                          <button 
                            onClick={() => handleDeleteVaultLogo(asset.id)}
                            className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-white border border-neutral-200 shadow-sm text-neutral-400 hover:text-red-500 hover:border-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Delete Logo"
                          >
                            <X size={12} strokeWidth={2.5} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : activeRightTab === 'chat' ? (
                /* Customer Chat Content */
                <div className="flex flex-col h-[350px] justify-between">
                  {/* Messages Area */}
                  <div ref={adminChatContainerRef} className="flex-1 overflow-y-auto pr-1 mb-4 flex flex-col gap-3 custom-scrollbar">
                    {adminChatMessages.length === 0 ? (
                      <div className="my-auto text-center flex flex-col items-center justify-center p-6 gap-2 text-neutral-400">
                        <MessageSquare size={32} className="stroke-[1.5] text-neutral-300" />
                        <p className="text-xs font-semibold">No messages yet</p>
                        <p className="text-[10px] leading-relaxed max-w-[220px]">Send a message to start chatting with the customer on their portal.</p>
                      </div>
                    ) : (
                      adminChatMessages.map((msg: any) => {
                        const isMe = msg.senderRole !== 'Client';
                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col max-w-[80%] relative group/msg ${isMe ? 'self-end items-end' : 'self-start items-start'}`}
                          >
                            {!isMe && (
                              <span className="text-[9px] text-neutral-450 font-bold uppercase tracking-wider mb-1 ml-1">
                                {msg.senderName} ({msg.senderRole})
                              </span>
                            )}
                            <div className="flex items-center gap-2 w-full">
                              {!isMe && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (confirm("Delete this message?")) {
                                      try {
                                        await deleteDoc(doc(db, 'customers', id || '', 'chat_messages', msg.id));
                                      } catch (err) {
                                        console.error("Failed to delete message:", err);
                                      }
                                    }
                                  }}
                                  className="opacity-0 group-hover/msg:opacity-100 transition-opacity text-neutral-400 hover:text-red-500 p-1 rounded shrink-0 cursor-pointer"
                                  title="Delete Message"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}

                              <div
                                className={`p-3 rounded-2xl text-xs font-semibold leading-relaxed shadow-3xs break-words flex-1 ${
                                  isMe
                                    ? 'bg-neutral-900 text-white rounded-br-none'
                                    : 'bg-neutral-100 text-neutral-800 rounded-bl-none'
                                }`}
                              >
                                {msg.imageUrl ? (
                                  <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer" className="block max-w-full overflow-hidden rounded-xl mt-1 border border-neutral-200 cursor-zoom-in">
                                    <img src={msg.imageUrl} alt="Chat Attachment" className="max-w-full max-h-[220px] object-contain mx-auto" />
                                  </a>
                                ) : null}
                                {msg.text && <p className={msg.imageUrl ? 'mt-2' : ''}>{msg.text}</p>}
                              </div>

                              {isMe && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (confirm("Delete this message?")) {
                                      try {
                                        await deleteDoc(doc(db, 'customers', id || '', 'chat_messages', msg.id));
                                      } catch (err) {
                                        console.error("Failed to delete message:", err);
                                      }
                                    }
                                  }}
                                  className="opacity-0 group-hover/msg:opacity-100 transition-opacity text-neutral-400 hover:text-red-500 p-1 rounded shrink-0 cursor-pointer"
                                  title="Delete Message"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                            <span className="text-[8px] text-neutral-400 mt-1 font-semibold">
                              {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </div>
                        );
                      })
                    )}

                  </div>

                  {/* Input Form */}
                  <form
                    onSubmit={handleSendAdminChatMessage}
                    className="flex gap-2 items-center shrink-0 border-t border-neutral-100 pt-3 bg-white"
                  >
                    <label className="w-9 h-9 rounded-xl border border-neutral-200 hover:bg-neutral-50 flex items-center justify-center text-neutral-500 cursor-pointer shrink-0 transition-colors relative">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAdminChatImageUpload}
                        disabled={isAdminUploadingChatImage}
                      />
                      {isAdminUploadingChatImage ? (
                        <Loader2 className="animate-spin text-brand-primary" size={14} />
                      ) : (
                        <Image size={14} />
                      )}
                    </label>
                    <input
                      type="text"
                      placeholder="Reply to customer or paste image..."
                      value={adminNewMessageText}
                      onChange={(e) => setAdminNewMessageText(e.target.value)}
                      onPaste={handleAdminChatPaste}
                      className="flex-1 bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-black rounded-xl px-4 py-2.5 text-xs text-neutral-900 focus:outline-none font-semibold transition-all"
                    />
                    <button
                      type="submit"
                      disabled={!adminNewMessageText.trim()}
                      className="w-9 h-9 rounded-xl bg-black hover:bg-neutral-800 text-white flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
                    >
                      <Send size={14} />
                    </button>
                  </form>
                </div>
              ) : (
                /* Team Roster Content */
                <div className="flex flex-col h-[400px]">
                  {/* Search & Filter Bar */}
                  <div className="flex flex-col sm:flex-row gap-2 items-center justify-between pb-3 border-b border-brand-border/60 shrink-0">
                    <div className="relative flex-1 w-full">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                      <input
                        type="text"
                        placeholder="Search member name, role, size, address..."
                        value={rosterSearch}
                        onChange={(e) => setRosterSearch(e.target.value)}
                        className="w-full bg-neutral-50 border border-neutral-200 focus:bg-white focus:border-brand-primary rounded-xl pl-9 pr-3 py-1.5 text-xs text-neutral-900 focus:outline-none font-medium transition-all"
                      />
                      {rosterSearch && (
                        <button
                          type="button"
                          onClick={() => setRosterSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 shrink-0">
                      <select
                        value={rosterSizeFilter}
                        onChange={(e) => setRosterSizeFilter(e.target.value)}
                        className="bg-neutral-50 border border-neutral-200 text-neutral-700 text-xs font-bold rounded-xl px-2.5 py-1.5 outline-none cursor-pointer"
                      >
                        <option value="All">All Sizes ({teamRoster.length})</option>
                        {ROSTER_SIZES.map(s => {
                          const count = rosterSizeCounts[s] || 0;
                          if (count === 0) return null;
                          return (
                            <option key={s} value={s}>{s} ({count})</option>
                          );
                        })}
                      </select>
                      <button
                        type="button"
                        onClick={handleOpenAddMemberModal}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <Plus size={14} /> Add Member
                      </button>
                    </div>
                  </div>

                  {/* Members List */}
                  <div className="flex-1 overflow-y-auto pr-1 py-3 space-y-2.5 custom-scrollbar min-h-0">
                    {teamRoster.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-brand-bg/40 rounded-xl border border-dashed border-brand-border/80 my-auto">
                        <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-3 shadow-sm">
                          <Users size={22} />
                        </div>
                        <h4 className="text-sm font-bold text-neutral-900 mb-1">No Team Members Added</h4>
                        <p className="text-xs text-neutral-500 max-w-sm mb-4 leading-relaxed">
                          Save client team members, their garment sizes, and delivery addresses. Addresses will automatically port as optional shipping locations across all client orders.
                        </p>
                        <button
                          type="button"
                          onClick={handleOpenAddMemberModal}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <UserPlus size={14} /> Add First Team Member
                        </button>
                      </div>
                    ) : filteredTeamMembers.length === 0 ? (
                      <div className="py-12 text-center text-xs text-neutral-500">
                        No team members match "{rosterSearch}"
                      </div>
                    ) : (
                      filteredTeamMembers.map((member) => (
                        <div
                          key={member.id}
                          className="p-3.5 bg-neutral-50/80 hover:bg-white border border-brand-border/80 hover:border-indigo-300 rounded-xl transition-all shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex items-start justify-between gap-3 group"
                        >
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 font-black text-xs flex items-center justify-center shrink-0 border border-indigo-200 shadow-xs">
                              {(member.name || 'M').charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-extrabold text-neutral-900 truncate">
                                  {member.name}
                                </span>
                                {member.role && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-200/70 text-neutral-700 border border-neutral-300/60">
                                    {member.role}
                                  </span>
                                )}
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-xs">
                                  Size: {member.size || 'M'}
                                </span>
                              </div>

                              {/* Address */}
                              {member.street1 || member.city ? (
                                <div className="flex items-center gap-1 text-[11px] text-neutral-600 mt-1.5 truncate">
                                  <MapPin size={12} className="text-indigo-500 shrink-0" />
                                  <span className="truncate">
                                    {member.street1}{member.street2 ? `, ${member.street2}` : ''}, {member.city ? `${member.city}, ` : ''}{member.state} {member.zip}
                                  </span>
                                </div>
                              ) : (
                                <div className="text-[10px] text-neutral-400 italic mt-1">
                                  No shipping address
                                </div>
                              )}

                              {/* Notes & Phone */}
                              <div className="flex items-center gap-3 text-[10px] text-neutral-500 mt-1 flex-wrap">
                                {member.phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone size={10} className="text-neutral-400" />
                                    {member.phone}
                                  </span>
                                )}
                                {member.notes && (
                                  <span className="italic text-neutral-600 bg-amber-50/80 border border-amber-200/60 px-1.5 py-0.5 rounded text-[10px]">
                                    Note: {member.notes}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => handleOpenEditMemberModal(member)}
                              className="p-1.5 text-neutral-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              title="Edit Team Member"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTeamMember(member.id, member.name)}
                              className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete Team Member"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Footer status */}
                  {teamRoster.length > 0 && (
                    <div className="pt-2 border-t border-brand-border/60 flex items-center justify-between text-[11px] text-neutral-500 shrink-0">
                      <span>Showing {filteredTeamMembers.length} of {teamRoster.length} members</span>
                      <span className="text-[10px] text-indigo-600 font-semibold flex items-center gap-1">
                        <Truck size={12} />
                        {teamRoster.filter(m => m.street1 || m.city).length} with shipping address
                      </span>
                    </div>
                  )}
                </div>
              )}
                </>
              )}
            </div>
          </div>

        </div>

        {/* Quotes using Portal Component */}
        <div className="mt-4">
           <div className="flex items-center justify-between mb-8">
              <div>
                 <h2 className={tokens.typography.h2}>Active Quotes</h2>
                 <p className="text-sm text-brand-secondary mt-1">Estimates and requests pending approval.</p>
              </div>
              <div className="relative">
                <PillButton variant="filled" className="gap-2" onClick={() => setIsShopifyMenuOpen(!isShopifyMenuOpen)}>
                  <Plus size={16} />
                  New Quote
                </PillButton>
                {isShopifyMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsShopifyMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-brand-border py-2 z-50 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                      <button 
                        className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-brand-primary hover:bg-neutral-50 transition-colors text-left"
                        onClick={() => { setIsShopifyMenuOpen(false); setIsNewOrderDialogOpen(true); }}
                      >
                        <div className="bg-brand-bg p-1.5 rounded-md text-brand-secondary">
                          <Plus size={16} />
                        </div>
                        <div>
                          <p className="font-bold">Blank Quote</p>
                          <p className="text-[10px] text-brand-secondary uppercase tracking-widest mt-0.5">Start from scratch</p>
                        </div>
                      </button>
                      <button 
                        className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-brand-primary hover:bg-neutral-50 transition-colors border-t border-brand-border/40 text-left"
                        onClick={() => { setIsShopifyMenuOpen(false); setIsShopifyImportOpen(true); }}
                      >
                         <div className="bg-brand-bg p-1.5 rounded-md text-brand-secondary">
                           <ShoppingBag size={16} />
                         </div>
                         <div>
                          <p className="font-bold flex items-center gap-2">Import Shopify</p>
                          <p className="text-[10px] text-brand-secondary uppercase tracking-widest mt-0.5">Sync cart items</p>
                         </div>
                      </button>
                    </div>
                  </>
                )}
              </div>
           </div>
           {/* Injecting the exact visual component the customer sees! */}
           <div className="w-full">
             <PortalOrders overrideCustomerId={id} hideHeader={true} filterType="quotes" />
           </div>
        </div>

        {/* Active Orders using Portal Component */}
        <div className="mt-8 border-t border-brand-border pt-12">
           <div className="flex items-center justify-between mb-8">
              <div>
                 <h2 className={tokens.typography.h2}>Active Orders</h2>
                 <p className="text-sm text-brand-secondary mt-1">Approved pipeline and history for this company.</p>
              </div>
           </div>
           {/* Injecting the exact visual component the customer sees! */}
           <div className="w-full">
             <PortalOrders overrideCustomerId={id} hideHeader={true} filterType="orders" />
           </div>
        </div>
      </div>

      {/* Crop Modal */}
      {cropImageSrc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
          <div className="bg-white max-w-lg w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-brand-border">
            <div className="p-4 border-b border-brand-border flex justify-between items-center bg-brand-bg/50">
              <h3 className="font-serif text-2xl text-brand-primary">Adjust Logo Fit</h3>
              <button onClick={() => setCropImageSrc(null)} className="text-brand-secondary hover:text-brand-primary transition-colors bg-white border border-brand-border rounded-md p-1">
                <X size={20} />
              </button>
            </div>
            
            <div className="relative w-full h-[400px] bg-checkerboard overflow-hidden rounded-t-lg">
              <Cropper
                image={cropImageSrc || ''}
                crop={crop}
                zoom={zoom}
                aspect={1}
                objectFit="contain"
                restrictPosition={false}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
                showGrid={false}
              />
            </div>
            
            <div className="p-6 bg-white">
              <p className="text-xs text-brand-secondary mb-5 text-center font-medium">Pan and zoom the image below so no part of the logo is cropped out of the square box.</p>
              
              <div className="flex items-center gap-4 mb-6 px-4">
                 <span className="text-xs font-bold uppercase text-brand-secondary tracking-widest">Zoom</span>
                 <input
                   type="range"
                   value={zoom}
                   min={0.1}
                   max={3}
                   step={0.05}
                   aria-labelledby="Zoom"
                   onChange={(e) => setZoom(Number(e.target.value))}
                   className="flex-1 accent-brand-primary cursor-pointer"
                 />
              </div>

              <div className="flex gap-4">
                <PillButton variant="outline" onClick={() => setCropImageSrc(null)} className="flex-1 justify-center py-3">
                  Cancel
                </PillButton>
                <PillButton variant="filled" onClick={handleUploadCroppedLogo} className="flex-1 justify-center py-3">
                  <span className="flex items-center gap-2"><Check size={18} /> Format & Save Upload</span>
                </PillButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Team Member Modal */}
      {isMemberModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white max-w-lg w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-brand-border my-auto animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-6 border-b border-brand-border flex items-center justify-between bg-neutral-50/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 shadow-xs">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-neutral-900">
                    {editingMember ? 'Edit Team Member' : 'Add Team Member'}
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Configure garment size and delivery address for this client contact.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMemberModalOpen(false)}
                className="p-2 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveTeamMember} className="flex flex-col">
              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
                {/* Basic Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1.5">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Jane Doe"
                      value={memberForm.name}
                      onChange={(e) => setMemberForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full bg-neutral-50 border border-neutral-300 focus:bg-white focus:border-indigo-600 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-neutral-900 focus:outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1.5">
                      Role / Title
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Project Manager"
                      value={memberForm.role}
                      onChange={(e) => setMemberForm(prev => ({ ...prev, role: e.target.value }))}
                      className="w-full bg-neutral-50 border border-neutral-300 focus:bg-white focus:border-indigo-600 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-neutral-900 focus:outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1.5">
                      Garment Size <span className="text-indigo-600">*</span>
                    </label>
                    <select
                      value={memberForm.size}
                      onChange={(e) => setMemberForm(prev => ({ ...prev, size: e.target.value }))}
                      className="w-full bg-neutral-50 border border-neutral-300 focus:bg-white focus:border-indigo-600 rounded-xl px-3.5 py-2.5 text-sm font-bold text-neutral-900 focus:outline-none transition-all cursor-pointer"
                    >
                      {ROSTER_SIZES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1.5">
                      Direct Phone
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. (555) 234-5678"
                      value={memberForm.phone}
                      onChange={(e) => setMemberForm(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full bg-neutral-50 border border-neutral-300 focus:bg-white focus:border-indigo-600 rounded-xl px-3.5 py-2.5 text-sm font-medium text-neutral-900 focus:outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Shipping Address Section */}
                <div className="pt-3 border-t border-brand-border/60">
                  <div className="flex items-center justify-between pb-2 mb-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-900">
                      <MapPin size={14} className="text-indigo-600" />
                      <span>Shipping Address (Optional)</span>
                    </div>
                    {Boolean(liveCustomerData?.shippingStreet || (customer as any)?.shippingStreet) && (
                      <button
                        type="button"
                        onClick={handleCopyCompanyAddressToMember}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer"
                        title="Copy customer's primary address"
                      >
                        <Copy size={11} />
                        Copy Company Address
                      </button>
                    )}
                  </div>

                  <p className="text-[11px] text-neutral-500 mb-3">
                    If populated, this address will be automatically available as a quick destination in all orders.
                  </p>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
                        Street Address
                      </label>
                      <input
                        type="text"
                        placeholder="123 Main Street"
                        value={memberForm.street1}
                        onChange={(e) => setMemberForm(prev => ({ ...prev, street1: e.target.value }))}
                        className="w-full bg-neutral-50 border border-neutral-300 focus:bg-white focus:border-indigo-600 rounded-xl px-3 py-2 text-xs font-medium text-neutral-900 focus:outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
                        Apt / Suite / Bldg (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="Suite 400"
                        value={memberForm.street2}
                        onChange={(e) => setMemberForm(prev => ({ ...prev, street2: e.target.value }))}
                        className="w-full bg-neutral-50 border border-neutral-300 focus:bg-white focus:border-indigo-600 rounded-xl px-3 py-2 text-xs font-medium text-neutral-900 focus:outline-none transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
                          City
                        </label>
                        <input
                          type="text"
                          placeholder="Austin"
                          value={memberForm.city}
                          onChange={(e) => setMemberForm(prev => ({ ...prev, city: e.target.value }))}
                          className="w-full bg-neutral-50 border border-neutral-300 focus:bg-white focus:border-indigo-600 rounded-xl px-3 py-2 text-xs font-medium text-neutral-900 focus:outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
                          State
                        </label>
                        <input
                          type="text"
                          placeholder="TX"
                          value={memberForm.state}
                          onChange={(e) => setMemberForm(prev => ({ ...prev, state: e.target.value }))}
                          className="w-full bg-neutral-50 border border-neutral-300 focus:bg-white focus:border-indigo-600 rounded-xl px-3 py-2 text-xs font-medium text-neutral-900 focus:outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
                          ZIP
                        </label>
                        <input
                          type="text"
                          placeholder="78701"
                          value={memberForm.zip}
                          onChange={(e) => setMemberForm(prev => ({ ...prev, zip: e.target.value }))}
                          className="w-full bg-neutral-50 border border-neutral-300 focus:bg-white focus:border-indigo-600 rounded-xl px-3 py-2 text-xs font-medium text-neutral-900 focus:outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sizing & Shipping Notes */}
                <div className="pt-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1.5">
                    Sizing & Delivery Notes
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Prefers oversized fit, gate code 1234, leave with front desk"
                    value={memberForm.notes}
                    onChange={(e) => setMemberForm(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-full bg-neutral-50 border border-neutral-300 focus:bg-white focus:border-indigo-600 rounded-xl px-3.5 py-2 text-xs font-medium text-neutral-900 focus:outline-none transition-all resize-none"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 px-6 border-t border-brand-border bg-neutral-50 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsMemberModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-neutral-600 hover:text-neutral-900 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingMember || !memberForm.name.trim()}
                  className="bg-black hover:bg-neutral-800 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingMember && <Loader2 size={13} className="animate-spin" />}
                  {editingMember ? 'Save Changes' : 'Add Team Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Company Dialog */}
      {isEditDialogOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 overflow-y-auto">
          <div className="bg-brand-bg max-w-4xl w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-brand-border my-auto">
            <div className="p-6 border-b border-brand-border flex justify-between items-center bg-white">
              <h3 className="font-serif text-2xl text-brand-primary">Edit Company</h3>
              <button onClick={() => setIsEditDialogOpen(false)} className="text-brand-secondary hover:text-brand-primary transition-colors bg-brand-bg border border-brand-border rounded-md p-1">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">
               {/* Contact Information Form */}
               <div className="bg-white p-6 rounded-card border border-brand-border shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] grid grid-cols-2 gap-4">
                 <div className="col-span-2">
                    <h2 className={tokens.typography.h2}>Company Details</h2>
                 </div>
                 <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-brand-secondary uppercase tracking-widest">Company Name</label>
                    <input className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-primary/30 transition-colors placeholder:text-brand-secondary/40 font-medium" value={editCompanyForm.name} onChange={e => setEditCompanyForm({...editCompanyForm, name: e.target.value})} />
                 </div>
                 <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-brand-secondary uppercase tracking-widest">Phone</label>
                    <input className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-primary/30 transition-colors placeholder:text-brand-secondary/40 font-medium" value={editCompanyForm.phone} onChange={e => setEditCompanyForm({...editCompanyForm, phone: e.target.value})} />
                 </div>
                 <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-brand-secondary uppercase tracking-widest">Email</label>
                    <input className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-primary/30 transition-colors placeholder:text-brand-secondary/40 font-medium" value={editCompanyForm.email} onChange={e => setEditCompanyForm({...editCompanyForm, email: e.target.value})} />
                 </div>
                 <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-brand-secondary uppercase tracking-widest">Location Badge (City, State)</label>
                    <input className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-primary/30 transition-colors placeholder:text-brand-secondary/40 font-medium" value={editCompanyForm.location} onChange={e => setEditCompanyForm({...editCompanyForm, location: e.target.value})} placeholder="e.g. Petaluma, CA" />
                 </div>

                  <div className="col-span-2 mt-2 pt-4 border-t border-brand-border/60">
                    <h3 className="font-serif text-xl text-brand-primary mb-4">Shipping Information</h3>
                  </div>
                  <div className="col-span-2 flex flex-col gap-1">
                     <label className="text-xs font-bold text-brand-secondary uppercase tracking-widest">Street Address</label>
                     <AddressAutocompleteInput 
                       value={editCompanyForm.shippingStreet} 
                       onChange={val => setEditCompanyForm(prev => ({...prev, shippingStreet: val}))} 
                       onAddressSelect={(parsed) => {
                         setEditCompanyForm(prev => ({
                           ...prev,
                           shippingStreet: parsed.street,
                           shippingCity: parsed.city || prev.shippingCity,
                           shippingState: parsed.state || prev.shippingState,
                           shippingZip: parsed.zip || prev.shippingZip
                         }));
                       }}
                       placeholder="123 Main St" 
                       className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-primary/30 transition-colors placeholder:text-brand-secondary/40 font-medium"
                     />
                  </div>
                 <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-brand-secondary uppercase tracking-widest">City</label>
                    <input className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-primary/30 transition-colors placeholder:text-brand-secondary/40 font-medium" value={editCompanyForm.shippingCity} onChange={e => setEditCompanyForm({...editCompanyForm, shippingCity: e.target.value})} placeholder="City" />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                       <label className="text-xs font-bold text-brand-secondary uppercase tracking-widest">State</label>
                       <input className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-primary/30 transition-colors placeholder:text-brand-secondary/40 font-medium" value={editCompanyForm.shippingState} onChange={e => setEditCompanyForm({...editCompanyForm, shippingState: e.target.value})} placeholder="CA" />
                    </div>
                    <div className="flex flex-col gap-1">
                       <label className="text-xs font-bold text-brand-secondary uppercase tracking-widest">Zip</label>
                       <input className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-primary/30 transition-colors placeholder:text-brand-secondary/40 font-medium" value={editCompanyForm.shippingZip} onChange={e => setEditCompanyForm({...editCompanyForm, shippingZip: e.target.value})} placeholder="90210" />
                    </div>
                 </div>

                 <div className="col-span-2 mt-2 pt-4 border-t border-brand-border/60">
                    <h3 className="font-serif text-xl text-brand-primary mb-4">Account Config</h3>
                 </div>
                 <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-brand-secondary uppercase tracking-widest">Company Type</label>
                    <select className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-primary/30 transition-colors font-medium text-brand-primary" value={editCompanyForm.type} onChange={e => setEditCompanyForm({...editCompanyForm, type: e.target.value})}>
                      <option value="B2B">B2B (Business)</option>
                      <option value="B2C">B2C (Consumer)</option>
                    </select>
                 </div>
                 <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-brand-secondary uppercase tracking-widest">Fulfillment Type</label>
                    <select className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-primary/30 transition-colors font-medium text-brand-primary" value={editCompanyForm.fulfillmentType} onChange={e => setEditCompanyForm({...editCompanyForm, fulfillmentType: e.target.value})}>
                      <option value="Standard">Delivered</option>
                      <option value="Kitting">Inventory & Kitting</option>
                    </select>
                 </div>
                  <div className="col-span-2 flex flex-col gap-2.5 pt-2 pl-2 mb-2">
                    <div className={`flex items-center gap-3 p-2.5 -ml-2 rounded-xl border transition-colors ${
                      editCompanyForm.highPriority
                        ? 'bg-red-50 border-red-300'
                        : 'bg-brand-bg/50 border-brand-border/60'
                    }`}>
                      <input
                        type="checkbox"
                        id="highPriorityCustomer"
                        checked={Boolean(editCompanyForm.highPriority)}
                        onChange={e => setEditCompanyForm({ ...editCompanyForm, highPriority: e.target.checked })}
                        className="w-4 h-4 accent-red-600 cursor-pointer"
                      />
                      <label htmlFor="highPriorityCustomer" className="text-xs font-bold text-red-700 uppercase tracking-widest cursor-pointer mt-0.5 flex items-center gap-1.5">
                        <AlertTriangle size={14} className="text-red-600" />
                        HIGH PRIORITY CUSTOMER (PIN TO DASHBOARD)
                      </label>
                    </div>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" id="net30" checked={editCompanyForm.net30Terms} onChange={e => setEditCompanyForm({...editCompanyForm, net30Terms: e.target.checked})} className="w-4 h-4 accent-brand-primary cursor-pointer" />
                      <label htmlFor="net30" className="text-xs font-bold text-brand-primary uppercase tracking-widest cursor-pointer mt-0.5">ALLOW NET 30 TERMS</label>
                    </div>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" id="allowLocalDelivery" checked={editCompanyForm.allowLocalDelivery ?? true} onChange={e => setEditCompanyForm({...editCompanyForm, allowLocalDelivery: e.target.checked})} className="w-4 h-4 accent-brand-primary cursor-pointer" />
                      <label htmlFor="allowLocalDelivery" className="text-xs font-bold text-brand-primary uppercase tracking-widest cursor-pointer mt-0.5">ALLOW LOCAL DELIVERY OPTION IN CART & CHECKOUT</label>
                    </div>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" id="freeShipping" checked={editCompanyForm.freeShipping ?? false} onChange={e => setEditCompanyForm({...editCompanyForm, freeShipping: e.target.checked})} className="w-4 h-4 accent-brand-primary cursor-pointer" />
                      <label htmlFor="freeShipping" className="text-xs font-bold text-brand-primary uppercase tracking-widest cursor-pointer mt-0.5">FREE SHIPPING (ALWAYS FREE SHIPPING ON ALL ORDERS)</label>
                    </div>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" id="disableRack" checked={editCompanyForm.disableRack} onChange={e => setEditCompanyForm({...editCompanyForm, disableRack: e.target.checked})} className="w-4 h-4 accent-brand-primary cursor-pointer" />
                      <label htmlFor="disableRack" className="text-xs font-bold text-brand-primary uppercase tracking-widest cursor-pointer mt-0.5">DISABLE "YOUR RACK" TAB IN CLIENT PORTAL</label>
                    </div>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" id="taxExempt" checked={editCompanyForm.taxExempt} onChange={e => setEditCompanyForm({...editCompanyForm, taxExempt: e.target.checked})} className="w-4 h-4 accent-brand-primary cursor-pointer" />
                      <label htmlFor="taxExempt" className="text-xs font-bold text-brand-primary uppercase tracking-widest cursor-pointer mt-0.5">TAX EXEMPT STATUS (WAIVE SALES TAX)</label>
                    </div>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" id="bypassMinimumRequirement" checked={editCompanyForm.bypassMinimumRequirement} onChange={e => setEditCompanyForm({...editCompanyForm, bypassMinimumRequirement: e.target.checked})} className="w-4 h-4 accent-brand-primary cursor-pointer" />
                      <label htmlFor="bypassMinimumRequirement" className="text-xs font-bold text-brand-primary uppercase tracking-widest cursor-pointer mt-0.5">BYPASS MINIMUM GARMENT REQUIREMENT PER STYLE (ALLOW &lt;20 UNITS)</label>
                    </div>
                    <div className={`flex items-center gap-3 p-2.5 -ml-2 rounded-xl border transition-colors ${
                      editCompanyForm.requirePortalAgreements
                        ? 'bg-amber-50 border-amber-300'
                        : 'bg-brand-bg/50 border-brand-border/60'
                    }`}>
                      <input
                        type="checkbox"
                        id="requirePortalAgreementsCheckbox"
                        checked={Boolean(editCompanyForm.requirePortalAgreements)}
                        onChange={e => setEditCompanyForm({ ...editCompanyForm, requirePortalAgreements: e.target.checked })}
                        className="w-4 h-4 accent-amber-600 cursor-pointer"
                      />
                      <label htmlFor="requirePortalAgreementsCheckbox" className="text-xs font-bold text-amber-900 uppercase tracking-widest cursor-pointer mt-0.5 flex items-center gap-1.5">
                        <PenTool size={13} className="text-amber-700" />
                        REQUIRE NDA &amp; PORTAL AGREEMENTS BEFORE PORTAL ACCESS (DOCUSIGN GATE)
                      </label>
                    </div>


                    {/* Resale Certificate uploader */}
                    <div className="mt-3 bg-brand-bg/50 border border-brand-border/60 rounded-2xl p-4 flex flex-col gap-3 max-w-md">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary">Resale Certificate (Tax Exemption)</span>
                        {!editCompanyForm.resaleCertificateUrl && (
                          <label className="bg-brand-primary hover:bg-brand-primary/90 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 shadow-sm">
                            <input 
                              type="file" 
                              className="hidden" 
                              accept=".pdf,.png,.jpg,.jpeg,.svg"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file || !id) return;
                                setIsUploadingResaleCert(true);
                                try {
                                  const storageRef = ref(storage, `customers/${id}/resale_certificates/${Date.now()}_${file.name}`);
                                  await uploadBytes(storageRef, file);
                                  const downloadUrl = await getDownloadURL(storageRef);
                                  setEditCompanyForm(prev => ({
                                    ...prev,
                                    resaleCertificateUrl: downloadUrl,
                                    resaleCertificateName: file.name
                                  }));
                                } catch (err) {
                                  console.error("Resale certificate upload failed:", err);
                                  alert("Failed to upload resale certificate.");
                                } finally {
                                  setIsUploadingResaleCert(false);
                                }
                              }} 
                            />
                            <Upload size={12} /> Upload File
                          </label>
                        )}
                      </div>

                      {isUploadingResaleCert ? (
                        <div className="flex items-center gap-1.5 text-xs text-brand-secondary font-semibold">
                          <Loader2 className="animate-spin text-brand-primary" size={12} /> Uploading certificate...
                        </div>
                      ) : editCompanyForm.resaleCertificateUrl ? (
                        <div className="text-xs text-green-700 font-semibold bg-green-50 border border-green-200/50 rounded-xl p-3 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2 truncate">
                            <FileText size={16} className="text-green-600 shrink-0" />
                            <a 
                              href={editCompanyForm.resaleCertificateUrl} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="truncate hover:underline flex items-center gap-1 cursor-pointer"
                              title="Click to view document"
                            >
                              <span className="truncate">{editCompanyForm.resaleCertificateName}</span>
                              <ExternalLink size={12} className="shrink-0 opacity-70" />
                            </a>
                          </div>
                          <button 
                            type="button" 
                            onClick={() => {
                              setEditCompanyForm(prev => ({
                                ...prev,
                                resaleCertificateUrl: '',
                                resaleCertificateName: ''
                              }));
                            }}
                            className="text-gray-400 hover:text-red-500 transition-colors p-1"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-brand-secondary italic">No resale certificate uploaded yet.</span>
                      )}
                    </div>
                  </div>
               </div>

               {/* Portal Onboarding & NDA Agreement Gate Card (DocuSign-style) */}
               <div className="bg-white rounded-card border border-brand-border shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] overflow-hidden">
                 <div className="p-5 flex items-center justify-between">
                   <div className="flex items-center gap-3">
                     <div className="p-2 bg-amber-500/10 text-amber-600 rounded-xl shrink-0">
                       <PenTool size={18} />
                     </div>
                     <div>
                       <div className="flex items-center gap-2 flex-wrap">
                         <h3 className="text-sm font-bold text-brand-primary">
                           Portal NDA &amp; Onboarding Agreements (DocuSign Gate)
                         </h3>
                         <span className={`text-[9px] px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wider ${
                           liveCustomerData?.portalAgreementsSigned
                             ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                             : editCompanyForm.requirePortalAgreements
                             ? 'bg-amber-100 text-amber-800 border border-amber-300'
                             : 'bg-neutral-100 text-neutral-600 border border-neutral-250'
                         }`}>
                           {liveCustomerData?.portalAgreementsSigned
                             ? `Signed • ${liveCustomerData?.portalAgreementsData?.signedAt ? new Date(liveCustomerData.portalAgreementsData.signedAt).toLocaleDateString() : 'Completed'}`
                             : editCompanyForm.requirePortalAgreements
                             ? 'Required • Awaiting Client Signature'
                             : 'Disabled (Not Required)'}
                         </span>
                       </div>
                       <p className="text-[11px] text-brand-secondary mt-0.5">
                         When enabled, this client must review, initial, and e-sign the 4 onboarding agreement pages (NDA + 3 Portal Agreements) before they can view their Client Portal.
                       </p>
                     </div>
                   </div>

                   {/* Enable / Disable Toggle Switch */}
                   <button
                     type="button"
                     onClick={() => setEditCompanyForm(prev => ({
                       ...prev,
                       requirePortalAgreements: !prev.requirePortalAgreements
                     }))}
                     className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                       editCompanyForm.requirePortalAgreements ? 'bg-amber-500' : 'bg-neutral-300'
                     }`}
                   >
                     <span
                       className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                         editCompanyForm.requirePortalAgreements ? 'translate-x-5' : 'translate-x-0'
                       }`}
                     />
                   </button>
                 </div>

                 {(editCompanyForm.requirePortalAgreements || liveCustomerData?.portalAgreementsSigned) && (
                   <div className="p-5 pt-0 border-t border-brand-border/40 mt-1 space-y-4">
                     {/* Signed Status Certificate Box */}
                     {liveCustomerData?.portalAgreementsSigned && liveCustomerData?.portalAgreementsData && (
                       <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                         <div className="space-y-1">
                           <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-emerald-900">
                             <ShieldCheck size={15} className="text-emerald-600" />
                             <span>Signed by {liveCustomerData.portalAgreementsData.signerName} ({liveCustomerData.portalAgreementsData.signerTitle})</span>
                           </div>
                           <p className="text-[11px] text-emerald-800">
                             Executed on {new Date(liveCustomerData.portalAgreementsData.signedAt).toLocaleString()} • Initials: <strong>{liveCustomerData.portalAgreementsData.initials}</strong>
                           </p>
                         </div>
                         <div className="flex items-center gap-2 shrink-0">
                           <button
                             type="button"
                             onClick={() => setIsSignedAgreementsModalOpen(true)}
                             className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                           >
                             <Eye size={13} /> View Signed Packet
                           </button>
                           <button
                             type="button"
                             onClick={async () => {
                               if (!id) return;
                               if (!window.confirm('Reset signature status so this client is required to sign the agreement pages again upon next portal visit?')) return;
                               try {
                                 await updateDoc(doc(db, 'customers', id), {
                                   portalAgreementsSigned: false,
                                   portalAgreementsData: null
                                 });
                                 setLiveCustomerData((prev: any) => ({
                                   ...prev,
                                   portalAgreementsSigned: false,
                                   portalAgreementsData: null
                                 }));
                               } catch (err) {
                                 console.error('Failed to reset signature status:', err);
                                 alert('Failed to reset signature status.');
                               }
                             }}
                             className="px-3 py-1.5 rounded-lg bg-white border border-emerald-300 hover:bg-red-50 hover:border-red-300 hover:text-red-700 text-emerald-900 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                           >
                             <RotateCcw size={12} /> Require Re-Sign
                           </button>
                         </div>
                       </div>
                     )}

                     {/* 4 Agreement Pages List & Inline Customizer */}
                     <div className="pt-3 space-y-2.5">
                       <div className="flex items-center justify-between">
                         <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary">
                           Included Agreement Pages ({(editCompanyForm.portalAgreementPages || DEFAULT_PORTAL_AGREEMENTS).filter(p => p.enabled !== false).length} of {(editCompanyForm.portalAgreementPages || DEFAULT_PORTAL_AGREEMENTS).length})
                         </span>
                         <div className="flex items-center gap-2">
                           <button
                             type="button"
                             onClick={() => setIsSignedAgreementsModalOpen(true)}
                             className="text-[10px] font-bold text-brand-primary hover:underline flex items-center gap-1 cursor-pointer"
                           >
                             <Eye size={12} /> Preview Packet
                           </button>
                           <button
                             type="button"
                             onClick={() => {
                               setEditCompanyForm(prev => ({
                                 ...prev,
                                 portalAgreementPages: DEFAULT_PORTAL_AGREEMENTS
                               }));
                               setEditingAgreementPageId(null);
                             }}
                             className="text-[10px] font-semibold text-brand-secondary hover:text-red-600 cursor-pointer"
                           >
                             Reset Default Text
                           </button>
                         </div>
                       </div>

                       <div className="space-y-2">
                         {(editCompanyForm.portalAgreementPages || DEFAULT_PORTAL_AGREEMENTS).map((page, idx) => {
                           const isEditingThisPage = editingAgreementPageId === page.id;
                           return (
                             <div
                               key={page.id || idx}
                               className="border border-brand-border/70 rounded-xl bg-brand-bg/40 p-3 space-y-3"
                             >
                               <div className="flex items-center justify-between gap-3">
                                 <label className="flex items-center gap-2.5 cursor-pointer select-none min-w-0 flex-1">
                                   <input
                                     type="checkbox"
                                     checked={page.enabled !== false}
                                     onChange={e => {
                                       const checked = e.target.checked;
                                       setEditCompanyForm(prev => ({
                                         ...prev,
                                         portalAgreementPages: (prev.portalAgreementPages || DEFAULT_PORTAL_AGREEMENTS).map((p, i) =>
                                           i === idx ? { ...p, enabled: checked } : p
                                         )
                                       }));
                                     }}
                                     className="w-4 h-4 accent-brand-primary rounded cursor-pointer"
                                   />
                                   <span className="text-xs font-bold text-brand-primary truncate">
                                     Page {idx + 1}: {page.title}
                                   </span>
                                 </label>

                                 <button
                                   type="button"
                                   onClick={() => setEditingAgreementPageId(isEditingThisPage ? null : page.id)}
                                   className="px-2.5 py-1 rounded-lg bg-white border border-brand-border text-[10px] font-bold text-brand-secondary hover:text-brand-primary transition-colors cursor-pointer shrink-0"
                                 >
                                   {isEditingThisPage ? 'Done Editing' : 'Edit Page Text'}
                                 </button>
                               </div>

                               {isEditingThisPage && (
                                 <div className="space-y-2 pt-2 border-t border-brand-border/50">
                                   <div>
                                     <label className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary block mb-1">
                                       Page Title
                                     </label>
                                     <input
                                       type="text"
                                       value={page.title}
                                       onChange={e => {
                                         const val = e.target.value;
                                         setEditCompanyForm(prev => ({
                                           ...prev,
                                           portalAgreementPages: (prev.portalAgreementPages || DEFAULT_PORTAL_AGREEMENTS).map((p, i) =>
                                             i === idx ? { ...p, title: val } : p
                                           )
                                         }));
                                       }}
                                       className="w-full bg-white border border-brand-border rounded-lg px-3 py-1.5 text-xs font-bold text-brand-primary focus:outline-none focus:border-brand-primary"
                                     />
                                   </div>
                                   <div>
                                     <label className="text-[10px] font-bold uppercase tracking-wider text-brand-secondary block mb-1">
                                       Agreement Body Text (Supports {'{{COMPANY_NAME}}'} and {'{{DATE}}'})
                                     </label>
                                     <textarea
                                       rows={7}
                                       value={page.content}
                                       onChange={e => {
                                         const val = e.target.value;
                                         setEditCompanyForm(prev => ({
                                           ...prev,
                                           portalAgreementPages: (prev.portalAgreementPages || DEFAULT_PORTAL_AGREEMENTS).map((p, i) =>
                                             i === idx ? { ...p, content: val } : p
                                           )
                                         }));
                                       }}
                                       className="w-full bg-white border border-brand-border rounded-lg p-3 text-xs font-mono text-brand-primary focus:outline-none focus:border-brand-primary leading-relaxed"
                                     />
                                   </div>
                                 </div>
                               )}
                             </div>
                           );
                         })}
                       </div>
                     </div>
                   </div>
                 )}
               </div>

               {/* Automatic Account Discount Card */}
               <div className="bg-white rounded-card border border-brand-border shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] overflow-hidden">
                 <div className="p-5 flex items-center justify-between">
                   <div className="flex items-center gap-3">
                     <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-xl shrink-0">
                       <Percent size={18} />
                     </div>
                     <div>
                       <div className="flex items-center gap-2">
                         <h3 className="text-sm font-bold text-brand-primary">
                           Automatic Account Discount
                         </h3>
                         <span className={`text-[9px] px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wider ${
                           editCompanyForm.accountDiscount?.enabled
                             ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                             : 'bg-neutral-100 text-neutral-600 border border-neutral-250'
                         }`}>
                           {editCompanyForm.accountDiscount?.enabled
                             ? editCompanyForm.accountDiscount.expires
                               ? `Active • Exp: ${editCompanyForm.accountDiscount.expires}`
                               : 'Active • Forever'
                             : 'Disabled'}
                         </span>
                       </div>
                       <p className="text-[11px] text-brand-secondary mt-0.5">
                         Applies automatically to all cart orders for this customer account only. Active forever until turned off or expiration date is met.
                       </p>
                     </div>
                   </div>

                   {/* Enable / Disable Toggle Switch */}
                   <button
                     type="button"
                     onClick={() => setEditCompanyForm(prev => ({
                       ...prev,
                       accountDiscount: {
                         ...prev.accountDiscount,
                         enabled: !prev.accountDiscount?.enabled
                       }
                     }))}
                     className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                       editCompanyForm.accountDiscount?.enabled ? 'bg-emerald-500' : 'bg-neutral-300'
                     }`}
                   >
                     <span
                       className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                         editCompanyForm.accountDiscount?.enabled ? 'translate-x-5' : 'translate-x-0'
                       }`}
                     />
                   </button>
                 </div>

                 {editCompanyForm.accountDiscount?.enabled && (
                   <div className="p-5 pt-0 border-t border-brand-border/40 mt-1 space-y-4">
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                       {/* Discount Type */}
                       <div className="space-y-1">
                         <label className="text-[10px] font-bold text-brand-secondary uppercase tracking-widest block">
                           Discount Type
                         </label>
                         <select
                           value={editCompanyForm.accountDiscount.type}
                           onChange={(e) => setEditCompanyForm(prev => ({
                             ...prev,
                             accountDiscount: {
                               ...prev.accountDiscount,
                               type: e.target.value as 'percent' | 'fixed'
                             }
                           }))}
                           className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-3 py-2 text-xs font-bold text-brand-primary focus:outline-none focus:border-brand-primary/30"
                         >
                           <option value="percent">Percentage (%)</option>
                           <option value="fixed">Fixed Dollar ($)</option>
                         </select>
                       </div>

                       {/* Discount Amount */}
                       <div className="space-y-1">
                         <label className="text-[10px] font-bold text-brand-secondary uppercase tracking-widest block">
                           Discount Value {editCompanyForm.accountDiscount.type === 'percent' ? '(%)' : '($)'}
                         </label>
                         <div className="relative">
                           {editCompanyForm.accountDiscount.type === 'fixed' && (
                             <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-secondary" />
                           )}
                           <input
                             type="number"
                             min="0"
                             step={editCompanyForm.accountDiscount.type === 'percent' ? '1' : '0.50'}
                             max={editCompanyForm.accountDiscount.type === 'percent' ? '100' : undefined}
                             value={editCompanyForm.accountDiscount.value || ''}
                             onChange={(e) => setEditCompanyForm(prev => ({
                               ...prev,
                               accountDiscount: {
                                 ...prev.accountDiscount,
                                 value: parseFloat(e.target.value) || 0
                               }
                             }))}
                             placeholder={editCompanyForm.accountDiscount.type === 'percent' ? '10' : '25.00'}
                             className={`w-full bg-brand-bg border border-brand-border/60 rounded-xl py-2 pr-3 text-xs font-bold text-brand-primary focus:outline-none focus:border-brand-primary/30 ${
                               editCompanyForm.accountDiscount.type === 'fixed' ? 'pl-8' : 'pl-3'
                             }`}
                           />
                           {editCompanyForm.accountDiscount.type === 'percent' && (
                             <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-brand-secondary">%</span>
                           )}
                         </div>
                       </div>

                       {/* Expiration Date */}
                       <div className="space-y-1">
                         <div className="flex items-center justify-between">
                           <label className="text-[10px] font-bold text-brand-secondary uppercase tracking-widest block">
                             Expiration Date
                           </label>
                           {editCompanyForm.accountDiscount.expires ? (
                             <button
                               type="button"
                               onClick={() => setEditCompanyForm(prev => ({
                                 ...prev,
                                 accountDiscount: { ...prev.accountDiscount, expires: '' }
                               }))}
                               className="text-[10px] text-brand-secondary hover:text-red-500 font-semibold"
                             >
                               Set to Forever
                             </button>
                           ) : (
                             <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                               Forever Active
                             </span>
                           )}
                         </div>
                         <input
                           type="date"
                           value={editCompanyForm.accountDiscount.expires || ''}
                           onChange={(e) => setEditCompanyForm(prev => ({
                             ...prev,
                             accountDiscount: {
                               ...prev.accountDiscount,
                               expires: e.target.value
                             }
                           }))}
                           className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-3 py-2 text-xs font-medium text-brand-primary focus:outline-none focus:border-brand-primary/30"
                         />
                         <p className="text-[10px] text-brand-secondary/80">
                           {editCompanyForm.accountDiscount.expires
                             ? `Valid through end of ${editCompanyForm.accountDiscount.expires}`
                             : 'Leave blank to stay active forever until turned off'}
                         </p>
                       </div>

                       {/* Custom Label / Note */}
                       <div className="col-span-1 md:col-span-3 space-y-1">
                         <label className="text-[10px] font-bold text-brand-secondary uppercase tracking-widest block">
                           Discount Label / Cart Note (Optional)
                         </label>
                         <input
                           type="text"
                           value={editCompanyForm.accountDiscount.note || ''}
                           onChange={(e) => setEditCompanyForm(prev => ({
                             ...prev,
                             accountDiscount: {
                               ...prev.accountDiscount,
                               note: e.target.value
                             }
                           }))}
                           placeholder="e.g. VIP Partner 10% Off or Contract Discount"
                           className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-3 py-2 text-xs font-medium text-brand-primary focus:outline-none focus:border-brand-primary/30"
                         />
                         <p className="text-[10px] text-brand-secondary/80">
                           Appears on the customer's portal cart, checkout discount tag, and order invoice. Defaults to "ACCOUNT DISCOUNT" if blank.
                         </p>
                       </div>
                     </div>

                     {/* Live Summary Preview Box */}
                     <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-xl p-3 flex items-start gap-2.5 text-xs text-emerald-900">
                       <Tag size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                       <div>
                         <p className="font-semibold">
                           Customer Automatic Cart Discount Summary:
                         </p>
                         <p className="text-[11px] text-emerald-800 mt-0.5">
                           Every order placed in the customer portal by this account will automatically receive{' '}
                           <span className="font-bold underline">
                             {editCompanyForm.accountDiscount.type === 'percent'
                               ? `${editCompanyForm.accountDiscount.value || 0}% off`
                               : `$${(editCompanyForm.accountDiscount.value || 0).toFixed(2)} off`}
                           </span>{' '}
                           under label "<span className="font-semibold">{editCompanyForm.accountDiscount.note?.trim() || 'ACCOUNT DISCOUNT'}</span>"{' '}
                           {editCompanyForm.accountDiscount.expires
                             ? `through ${editCompanyForm.accountDiscount.expires}`
                             : 'forever until turned off (no expiration)'}
                           .
                         </p>
                       </div>
                     </div>
                   </div>
                 )}
               </div>

               {/* Customer Custom Auto-Quoting & Pricing Overrides Card */}
               <div className="bg-white rounded-card border border-brand-border shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] overflow-hidden">
                 <div 
                   onClick={() => setIsPricingSectionCollapsed(!isPricingSectionCollapsed)}
                   className="p-5 flex items-center justify-between cursor-pointer hover:bg-neutral-50/80 transition-colors select-none"
                 >
                   <div className="flex items-center gap-3">
                     <div className="p-2 bg-amber-500/10 text-amber-600 rounded-xl shrink-0">
                       <Zap size={18} />
                     </div>
                     <div>
                       <h3 className="text-sm font-bold text-brand-primary flex items-center gap-2">
                         Customer Auto-Quoting & Pricing Overrides
                         <span className={`text-[9px] px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wider ${
                            customPricing.enabled || (customPricing.autoQuotingEnabled && customPricing.autoQuotingEnabled !== 'inherit')
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                              : 'bg-neutral-100 text-neutral-600 border border-neutral-250'
                          }`}>
                            {(() => {
                              const hasAutoQuote = customPricing.autoQuotingEnabled && customPricing.autoQuotingEnabled !== 'inherit';
                              const hasCustomPricing = !!customPricing.enabled;
                              if (hasCustomPricing && hasAutoQuote) {
                                return customPricing.autoQuotingEnabled === 'disabled'
                                  ? 'Custom Pricing Active • Manual Review'
                                  : 'Custom Pricing Active • Auto-Quote ON';
                              }
                              if (hasCustomPricing) return 'Custom Pricing Active';
                              if (customPricing.autoQuotingEnabled === 'enabled') return 'Auto-Quoting Forced ON';
                              if (customPricing.autoQuotingEnabled === 'disabled') return 'Manual Review Required';
                              return 'Inheriting Shop Defaults';
                            })()}
                          </span>
                       </h3>
                       <p className="text-[11px] text-brand-secondary mt-0.5">
                         Override global shop auto-quoting behavior and custom price ladder anchors specifically for this customer.
                       </p>
                     </div>
                   </div>

                   <button
                     type="button"
                     className="p-1.5 rounded-lg text-neutral-400 hover:text-brand-primary hover:bg-neutral-200/50 transition-colors"
                   >
                     {isPricingSectionCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                   </button>
                 </div>

                 {!isPricingSectionCollapsed && (
                   <div className="p-5 pt-0 border-t border-brand-border/40 mt-1 space-y-5">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                       {/* 1. Auto-Quoting Behavior */}
                       <div className="space-y-2 bg-neutral-50/70 p-4 rounded-2xl border border-neutral-200">
                         <label className="text-xs font-bold text-brand-primary uppercase tracking-wider flex items-center gap-1.5">
                           <Zap size={14} className="text-amber-500" />
                           <span>Portal Auto-Quoting Behavior</span>
                         </label>
                         <select
                           value={customPricing.autoQuotingEnabled}
                           onChange={(e) => setCustomPricing({ ...customPricing, autoQuotingEnabled: e.target.value as any })}
                           className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 py-2 text-xs font-bold text-brand-primary focus:outline-none focus:border-brand-primary transition-colors cursor-pointer"
                         >
                           <option value="inherit">⚡ Shop Default (Inherit Global Settings)</option>
                           <option value="enabled">✅ Always Auto-Quote Portal Orders (Forced ON)</option>
                           <option value="disabled">❌ Require Manual Shop Review (Forced OFF)</option>
                         </select>
                         <p className="text-[11px] text-neutral-500 font-medium italic">
                           Determines if quote requests submitted by this customer skip manual review and present instant prices.
                         </p>
                       </div>

                       {/* 2. Custom Price Ladder Overrides */}
                       <div className="space-y-2 bg-neutral-50/70 p-4 rounded-2xl border border-neutral-200 flex flex-col justify-between">
                         <div>
                           <div className="flex items-center justify-between">
                             <label className="text-xs font-bold text-brand-primary uppercase tracking-wider flex items-center gap-1.5">
                               <Zap size={14} className="text-brand-secondary" />
                               <span>Custom Price Ladder & Margin Floor</span>
                             </label>

                             <button
                               type="button"
                               onClick={(e) => {
                                 e.stopPropagation();
                                 setCustomPricing({ ...customPricing, enabled: !customPricing.enabled });
                               }}
                               className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                 customPricing.enabled ? 'bg-emerald-500' : 'bg-neutral-300'
                               }`}
                             >
                               <span
                                 className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                   customPricing.enabled ? 'translate-x-5' : 'translate-x-0'
                                 }`}
                               />
                             </button>
                           </div>
                           <p className="text-[11px] text-neutral-500 font-medium italic mt-1">
                             {customPricing.enabled 
                               ? 'Custom pricing rules are active for this customer.' 
                               : 'Toggle ON to set custom tier pricing anchors or margin floors different from shop defaults.'}
                           </p>
                         </div>

                         {customPricing.enabled && (
                           <div className="grid grid-cols-3 gap-2 pt-2 border-t border-neutral-200 mt-2">
                             <div>
                               <span className="text-[9px] font-bold text-neutral-400 uppercase block">1-24 Tier Anchor</span>
                               <div className="relative mt-1">
                                 <DollarSign size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" />
                                 <input
                                   type="number"
                                   step="0.25"
                                   value={customPricing.ladder?.priceAtLowTier ?? 5.50}
                                   onChange={(e) => setCustomPricing({
                                     ...customPricing,
                                     ladder: { ...customPricing.ladder, priceAtLowTier: parseFloat(e.target.value) || 0 }
                                   })}
                                   className="w-full pl-5 pr-1 py-1 text-xs bg-white border border-neutral-300 rounded-lg font-bold text-brand-primary"
                                 />
                               </div>
                             </div>

                             <div>
                               <span className="text-[9px] font-bold text-neutral-400 uppercase block">1,000+ Tier Anchor</span>
                               <div className="relative mt-1">
                                 <DollarSign size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" />
                                 <input
                                   type="number"
                                   step="0.25"
                                   value={customPricing.ladder?.priceAtHighTier ?? 3.00}
                                   onChange={(e) => setCustomPricing({
                                     ...customPricing,
                                     ladder: { ...customPricing.ladder, priceAtHighTier: parseFloat(e.target.value) || 0 }
                                   })}
                                   className="w-full pl-5 pr-1 py-1 text-xs bg-white border border-neutral-300 rounded-lg font-bold text-brand-primary"
                                 />
                               </div>
                             </div>

                             <div>
                               <span className="text-[9px] font-bold text-neutral-400 uppercase block">Margin Floor</span>
                               <div className="relative mt-1">
                                 <input
                                   type="number"
                                   step="1"
                                   min="0"
                                   max="60"
                                   value={Math.round((customPricing.ladder?.marginFloor ?? 0.35) * 100)}
                                   onChange={(e) => setCustomPricing({
                                     ...customPricing,
                                     ladder: { ...customPricing.ladder, marginFloor: (parseInt(e.target.value) || 0) / 100 }
                                   })}
                                   className="w-full px-2 py-1 text-xs bg-white border border-neutral-300 rounded-lg font-bold text-brand-primary text-center"
                                 />
                               </div>
                             </div>
                           </div>
                         )}
                       </div>
                     </div>
                   </div>
                 )}
               </div>

               {/* Company Invoice Template & Defaults Card */}
               <div className="bg-white rounded-card border border-brand-border shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] overflow-hidden">
                 <div 
                   onClick={() => setIsInvoiceSectionCollapsed(!isInvoiceSectionCollapsed)}
                   className="p-5 flex items-center justify-between cursor-pointer hover:bg-neutral-50/80 transition-colors select-none"
                 >
                   <div className="flex items-center gap-3">
                     <div className="p-2 bg-blue-500/10 text-blue-600 rounded-xl shrink-0">
                       <FileText size={18} />
                     </div>
                     <div>
                       <h3 className="text-sm font-bold text-brand-primary flex items-center gap-2">
                         Company Invoice Template & Defaults
                       </h3>
                       <p className="text-[11px] text-brand-secondary mt-0.5">
                         Configure custom invoice terms, branding headers, wire transfer info, and payment buttons for this customer.
                       </p>
                     </div>
                   </div>

                   <button
                     type="button"
                     className="p-1.5 rounded-lg text-neutral-400 hover:text-brand-primary hover:bg-neutral-200/50 transition-colors"
                   >
                     {isInvoiceSectionCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                   </button>
                 </div>

                 {!isInvoiceSectionCollapsed && (
                   <div className="p-5 pt-0 border-t border-brand-border/40 mt-1 space-y-5">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                       {/* Header & Branding Defaults */}
                       <div className="space-y-4 bg-neutral-50/70 p-4 rounded-2xl border border-neutral-200">
                         <h4 className="text-xs font-bold text-brand-primary uppercase tracking-wider">Header & Branding</h4>

                         <div>
                           <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block mb-1.5">
                             Default Header Logo
                           </label>
                           <div className="grid grid-cols-2 gap-2.5">
                             <button
                               type="button"
                               onClick={() => setInvoiceForm({ ...invoiceForm, brandLogo: 'inktheory' })}
                               className={`flex flex-col items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border transition-all cursor-pointer ${
                                 (invoiceForm.brandLogo || 'inktheory') === 'inktheory'
                                   ? 'bg-white border-brand-primary ring-1 ring-brand-primary shadow-xs'
                                   : 'bg-white/60 border-neutral-200 hover:border-neutral-300 opacity-70 hover:opacity-100'
                               }`}
                             >
                               <img src="/inktheory-logo-black.png" alt="INKTHEORY" className="h-4 object-contain" />
                               <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-wider">Ink Theory</span>
                             </button>

                             <button
                               type="button"
                               onClick={() => setInvoiceForm({ ...invoiceForm, brandLogo: 'xcollab' })}
                               className={`flex flex-col items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border transition-all cursor-pointer ${
                                 invoiceForm.brandLogo === 'xcollab'
                                   ? 'bg-white border-brand-primary ring-1 ring-brand-primary shadow-xs'
                                   : 'bg-white/60 border-neutral-200 hover:border-neutral-300 opacity-70 hover:opacity-100'
                               }`}
                             >
                               <img src="/xcollab-logo-black.png" alt="xCOLLAB" className="h-4 object-contain" />
                               <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-wider">xCollab</span>
                             </button>
                           </div>
                         </div>
                         
                         <div>
                           <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block mb-1">
                             Header Subtitle Tagline
                           </label>
                           <input
                             type="text"
                             value={invoiceForm.subtitle}
                             onChange={(e) => setInvoiceForm({ ...invoiceForm, subtitle: e.target.value })}
                             placeholder="e.g. For your Consideration"
                             className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 py-2 text-xs font-medium text-brand-primary focus:outline-none focus:border-brand-primary"
                           />
                         </div>

                         <div>
                           <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block mb-1">
                             Category Tag (Vertical Bar)
                           </label>
                           <input
                             type="text"
                             value={invoiceForm.categoryTag}
                             onChange={(e) => setInvoiceForm({ ...invoiceForm, categoryTag: e.target.value })}
                             placeholder="e.g. VCG • ADHOC ORDERS"
                             className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 py-2 text-xs font-medium text-brand-primary focus:outline-none focus:border-brand-primary"
                           />
                         </div>

                         <div className="grid grid-cols-3 gap-2.5">
                           <div>
                             <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-wider block mb-1">
                               Default Manager
                             </label>
                             <input
                               type="text"
                               value={(invoiceForm as any).accountManager || ''}
                               onChange={(e) => setInvoiceForm({ ...invoiceForm, accountManager: e.target.value } as any)}
                               placeholder="e.g. Sarah Jenkins"
                               className="w-full bg-white border border-neutral-300 rounded-xl px-2.5 py-2 text-xs font-medium text-brand-primary focus:outline-none focus:border-brand-primary"
                             />
                           </div>

                           <div>
                             <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-wider block mb-1">
                               Manager Email
                             </label>
                             <input
                               type="email"
                               value={(invoiceForm as any).accountManagerEmail || ''}
                               onChange={(e) => setInvoiceForm({ ...invoiceForm, accountManagerEmail: e.target.value } as any)}
                               placeholder="e.g. sarah@company.com"
                               className="w-full bg-white border border-neutral-300 rounded-xl px-2.5 py-2 text-xs font-medium text-brand-primary focus:outline-none focus:border-brand-primary"
                             />
                           </div>

                           <div>
                             <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-wider block mb-1">
                               Manager Phone
                             </label>
                             <input
                               type="text"
                               value={(invoiceForm as any).accountManagerPhone || ''}
                               onChange={(e) => setInvoiceForm({ ...invoiceForm, accountManagerPhone: e.target.value } as any)}
                               placeholder="e.g. 555-0192"
                               className="w-full bg-white border border-neutral-300 rounded-xl px-2.5 py-2 text-xs font-medium text-brand-primary focus:outline-none focus:border-brand-primary"
                             />
                           </div>
                         </div>

                         <div>
                           <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block mb-1">
                             Default Additional Billing / CC Emails
                           </label>
                           <input
                             type="text"
                             value={(invoiceForm as any).additionalEmails || ''}
                             onChange={(e) => setInvoiceForm({ ...invoiceForm, additionalEmails: e.target.value } as any)}
                             placeholder="e.g. ap@mcevoyranch.com, accounting@mcevoyranch.com"
                             className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 py-2 text-xs font-medium text-brand-primary focus:outline-none focus:border-brand-primary"
                           />
                           <p className="text-[10px] text-brand-secondary mt-1">
                             Separate multiple emails with commas. All additional emails will populate by default on invoices for this customer.
                           </p>
                         </div>

                         <div>
                           <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block mb-1">
                             Footer Tagline
                           </label>
                           <input
                             type="text"
                             value={invoiceForm.footerTagline}
                             onChange={(e) => setInvoiceForm({ ...invoiceForm, footerTagline: e.target.value })}
                             placeholder="e.g. YOUR TRUST IS OUR HIGHEST PRIORITY"
                             className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 py-2 text-xs font-medium text-brand-primary focus:outline-none focus:border-brand-primary"
                           />
                         </div>
                       </div>

                       {/* Terms & Statements */}
                       <div className="space-y-4 bg-neutral-50/70 p-4 rounded-2xl border border-neutral-200">
                         <h4 className="text-xs font-bold text-brand-primary uppercase tracking-wider">Statements & Terms</h4>

                         <div>
                           <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block mb-1">
                             Statement of Work
                           </label>
                           <textarea
                             rows={2}
                             value={invoiceForm.statementOfWork}
                             onChange={(e) => setInvoiceForm({ ...invoiceForm, statementOfWork: e.target.value })}
                             placeholder="Scope of work statement..."
                             className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 py-2 text-xs font-medium text-brand-primary focus:outline-none focus:border-brand-primary resize-none"
                           />
                         </div>

                         <div>
                           <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block mb-1">
                             Fee Schedule / Payment Terms
                           </label>
                           <textarea
                             rows={2}
                             value={invoiceForm.feeSchedule}
                             onChange={(e) => setInvoiceForm({ ...invoiceForm, feeSchedule: e.target.value })}
                             placeholder="Payment due upon receipt..."
                             className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 py-2 text-xs font-medium text-brand-primary focus:outline-none focus:border-brand-primary resize-none"
                           />
                         </div>

                         <div>
                           <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block mb-1">
                             Confidentiality Notice
                           </label>
                           <textarea
                             rows={2}
                             value={invoiceForm.confidentiality}
                             onChange={(e) => setInvoiceForm({ ...invoiceForm, confidentiality: e.target.value })}
                             placeholder="Pricing and terms contained within are confidential..."
                             className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 py-2 text-xs font-medium text-brand-primary focus:outline-none focus:border-brand-primary resize-none"
                           />
                         </div>
                       </div>

                       {/* Bank Wire & ACH Info */}
                       <div className="space-y-4 bg-neutral-50/70 p-4 rounded-2xl border border-neutral-200">
                         <h4 className="text-xs font-bold text-brand-primary uppercase tracking-wider">Bank Wire & ACH Transfer Info</h4>

                         <div className="grid grid-cols-2 gap-3">
                           <div>
                             <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block mb-1">
                               Bank Name
                             </label>
                             <input
                               type="text"
                               value={invoiceForm.wireBankName}
                               onChange={(e) => setInvoiceForm({ ...invoiceForm, wireBankName: e.target.value })}
                               placeholder="e.g. Pinnacle Bank"
                               className="w-full bg-white border border-neutral-300 rounded-xl px-3 py-1.5 text-xs font-medium text-brand-primary focus:outline-none focus:border-brand-primary"
                             />
                           </div>

                           <div>
                             <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block mb-1">
                               Account Name
                             </label>
                             <input
                               type="text"
                               value={invoiceForm.wireAccountName}
                               onChange={(e) => setInvoiceForm({ ...invoiceForm, wireAccountName: e.target.value })}
                               placeholder="e.g. Catalyst"
                               className="w-full bg-white border border-neutral-300 rounded-xl px-3 py-1.5 text-xs font-medium text-brand-primary focus:outline-none focus:border-brand-primary"
                             />
                           </div>
                         </div>

                         <div>
                           <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block mb-1">
                             Bank Address
                           </label>
                           <textarea
                             rows={2}
                             value={invoiceForm.wireBankAddress}
                             onChange={(e) => setInvoiceForm({ ...invoiceForm, wireBankAddress: e.target.value })}
                             placeholder="2300 West End Avenue, Nashville, TN 37203"
                             className="w-full bg-white border border-neutral-300 rounded-xl px-3 py-1.5 text-xs font-medium text-brand-primary focus:outline-none focus:border-brand-primary resize-none"
                           />
                         </div>

                         <div className="grid grid-cols-3 gap-2">
                           <div>
                             <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-wider block mb-1">
                               Routing #
                             </label>
                             <input
                               type="text"
                               value={invoiceForm.wireRoutingNumber}
                               onChange={(e) => setInvoiceForm({ ...invoiceForm, wireRoutingNumber: e.target.value })}
                               className="w-full bg-white border border-neutral-300 rounded-xl px-2.5 py-1.5 text-xs font-medium text-brand-primary focus:outline-none focus:border-brand-primary"
                             />
                           </div>

                           <div>
                             <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-wider block mb-1">
                               SWIFT Code
                             </label>
                             <input
                               type="text"
                               value={invoiceForm.wireSwiftCode}
                               onChange={(e) => setInvoiceForm({ ...invoiceForm, wireSwiftCode: e.target.value })}
                               className="w-full bg-white border border-neutral-300 rounded-xl px-2.5 py-1.5 text-xs font-medium text-brand-primary focus:outline-none focus:border-brand-primary"
                             />
                           </div>

                           <div>
                             <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-wider block mb-1">
                               Account #
                             </label>
                             <input
                               type="text"
                               value={invoiceForm.wireAccountNumber}
                               onChange={(e) => setInvoiceForm({ ...invoiceForm, wireAccountNumber: e.target.value })}
                               className="w-full bg-white border border-neutral-300 rounded-xl px-2.5 py-1.5 text-xs font-medium text-brand-primary focus:outline-none focus:border-brand-primary"
                             />
                           </div>
                         </div>
                       </div>

                       {/* Credit Card Payment Settings */}
                       <div className="space-y-4 bg-neutral-50/70 p-4 rounded-2xl border border-neutral-200">
                         <div className="flex items-center justify-between">
                           <h4 className="text-xs font-bold text-brand-primary uppercase tracking-wider">Credit Card Payment Button</h4>
                           <button
                             type="button"
                             onClick={() => setInvoiceForm({ ...invoiceForm, showPayButton: !invoiceForm.showPayButton })}
                             className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                               invoiceForm.showPayButton ? 'bg-emerald-500' : 'bg-neutral-300'
                             }`}
                           >
                             <span
                               className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                 invoiceForm.showPayButton ? 'translate-x-4' : 'translate-x-0'
                               }`}
                             />
                           </button>
                         </div>

                         {invoiceForm.showPayButton && (
                           <>
                             <div>
                               <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block mb-1">
                                 Pay Button Label
                               </label>
                               <input
                                 type="text"
                                 value={invoiceForm.payButtonText}
                                 onChange={(e) => setInvoiceForm({ ...invoiceForm, payButtonText: e.target.value })}
                                 placeholder="e.g. CLICK TO PAY BY CREDIT CARD +3.5%"
                                 className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 py-2 text-xs font-medium text-brand-primary focus:outline-none focus:border-brand-primary"
                               />
                             </div>

                             <div>
                               <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block mb-1">
                                 Direct Payment Link / Stripe URL
                               </label>
                               <input
                                 type="text"
                                 value={invoiceForm.payButtonUrl}
                                 onChange={(e) => setInvoiceForm({ ...invoiceForm, payButtonUrl: e.target.value })}
                                 placeholder="Leave blank for native Stripe payment modal or enter custom link"
                                 className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 py-2 text-xs font-medium text-brand-primary focus:outline-none focus:border-brand-primary"
                               />
                               <p className="text-[10px] text-brand-secondary mt-1">
                                 If left empty or default, clicking the invoice payment button automatically launches the app's native Stripe credit card modal!
                               </p>
                             </div>
                           </>
                         )}
                       </div>
                     </div>
                   </div>
                 )}
               </div>

               {/* WOVN Catalog Link */}
               <div className="bg-white p-6 rounded-card border border-brand-border shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)]">
                 <div className="flex justify-between items-center mb-6">
                    <h2 className={tokens.typography.h2}>WOVN Catalog Link</h2>
                    <PillButton 
                      variant="outline" 
                      className="px-4"
                      onClick={() => setIsCatalogDialogOpen(true)}
                    >
                      <Plus size={16} /> Select Decks
                    </PillButton>
                 </div>
                 <p className="text-sm text-brand-secondary mb-4 leading-relaxed">
                   Connect this profile to multiple Garment Catalog decks to enable seamless ordering in the Client Portal.
                 </p>
                 
                 <div className="flex flex-col gap-3">
                    {catalogLinkIds.length === 0 ? (
                       <div className="bg-brand-bg rounded-xl p-4 text-center text-sm font-medium text-brand-secondary border border-dashed border-brand-border">
                         No catalog decks connected. Click above to add some.
                       </div>
                    ) : (
                       <div className="flex flex-wrap gap-2">
                         {catalogLinkIds.map(linkId => {
                           // If the catalog is fetched, map its name. Otherwise just show the ID.
                           const c = availableCatalogs.find(m => m.id === linkId);
                           return (
                             <div key={linkId} className="flex items-center gap-2 bg-white border border-brand-border/60 rounded-lg pl-3 pr-1 py-1 shadow-sm">
                               <span className="text-xs font-bold text-brand-primary">{c && c.name ? c.name : 'Linked WOVN Deck'}</span>
                               <button 
                                 onClick={() => toggleCatalogLink(linkId)}
                                 className="w-6 h-6 rounded flex items-center justify-center text-brand-secondary hover:bg-brand-bg hover:text-red-500 transition-colors"
                               >
                                 <X size={14} />
                               </button>
                             </div>
                           )
                         })}
                       </div>
                    )}
                 </div>

                 <div className="mt-6 flex justify-end border-t border-brand-border pt-6">
                    <PillButton 
                      variant="filled" 
                      className="px-6 whitespace-nowrap"
                      onClick={handleSaveCatalogId}
                      disabled={savingLinkId}
                    >
                      {savingLinkId ? 'Saving...' : 'Save Catalog Links'}
                    </PillButton>
                 </div>
               </div>

               {/* Portal Access */}
               <div className="bg-white p-6 rounded-card border border-brand-border shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)]">
                 <div className="flex justify-between items-center mb-4">
                    <h2 className={tokens.typography.h2}>Portal Access</h2>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setIsQrModalOpen(true)} 
                        className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg transition-colors flex items-center gap-1.5 text-xs font-bold shadow-sm"
                      >
                        <QrCode size={14} /> Share Portal QR
                      </button>
                      {!isAddingContact && (
                        <button onClick={() => setIsAddingContact(true)} className="text-brand-secondary hover:text-brand-primary transition-colors flex items-center gap-1 text-xs font-bold ml-2">
                          <Plus size={16} /> Add Contact
                        </button>
                      )}
                    </div>
                 </div>
                 
                 {isAddingContact && (
                    <div className="mb-6 p-4 bg-brand-bg border border-brand-border/60 rounded-xl flex flex-col gap-3">
                       <h4 className="text-xs font-bold uppercase tracking-widest text-brand-primary mb-1">New Portal User</h4>
                       <div className="grid grid-cols-2 gap-3">
                         <input placeholder="Full Name" value={newContact.name} onChange={e => setNewContact({...newContact, name: e.target.value})} className="w-full bg-white border border-brand-border/60 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:border-brand-primary/30" />
                         <input placeholder="Email Address" value={newContact.email} onChange={e => setNewContact({...newContact, email: e.target.value})} className="w-full bg-white border border-brand-border/60 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:border-brand-primary/30" />
                         <input placeholder="Role (e.g. Designer)" value={newContact.role} onChange={e => setNewContact({...newContact, role: e.target.value})} className="w-full bg-white border border-brand-border/60 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:border-brand-primary/30" />
                         <select value={newContact.viewAll ? "all" : "own"} onChange={e => setNewContact({...newContact, viewAll: e.target.value === "all"})} className="w-full bg-white border border-brand-border/60 rounded-lg px-3 py-2 text-sm font-medium text-brand-secondary focus:outline-none focus:border-brand-primary/30">
                           <option value="own">View Own Orders</option>
                           <option value="all">View All Company Orders</option>
                         </select>
                       </div>
                       <div className="flex gap-2 justify-end mt-2">
                         <button onClick={() => setIsAddingContact(false)} className="text-xs px-3 py-1.5 font-bold text-brand-secondary hover:text-brand-primary">Cancel</button>
                         <button onClick={handleAddContact} className="text-xs px-4 py-1.5 bg-brand-primary text-white rounded-md font-bold hover:bg-black transition-colors">Add User</button>
                       </div>
                    </div>
                 )}
                 
                  <div className="space-y-3">
                    {contacts.length === 0 ? (
                      <p className="text-sm text-brand-secondary/60 text-center py-4 italic">No portal contacts linked to this company yet.</p>
                    ) : (
                      contacts.map((contact) => (
                        <div key={contact.id} className="p-3 border border-brand-border/60 rounded-xl bg-brand-bg flex items-center justify-between group cursor-pointer hover:border-brand-primary/30 transition-colors">
                           <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-white border border-brand-border flex items-center justify-center text-xs font-bold text-brand-primary">
                                {contact.name.charAt(0)}
                              </div>
                              <div>
                                 <p className="text-sm font-medium text-brand-primary">{contact.name}</p>
                                 <p className="text-[10px] text-brand-secondary uppercase tracking-wide font-semibold mt-0.5">{contact.role}</p>
                              </div>
                           </div>
                           <div className="flex items-center gap-6">
                             <select 
                               value={contact.viewAll ? "all" : "own"} 
                               onChange={async (e) => {
                                 const viewAllVal = e.target.value === "all";
                                 setContacts(contacts.map(c => c.id === contact.id ? { ...c, viewAll: viewAllVal } : c));
                                 try {
                                   await updateDoc(doc(db, 'users', contact.id), { viewAll: viewAllVal });
                                 } catch (err) {
                                   console.error("Error updating user viewAll:", err);
                                 }
                               }} 
                               className="bg-transparent text-xs font-semibold text-brand-secondary focus:outline-none cursor-pointer hover:text-brand-primary"
                             >
                               <option value="own">View Own Orders</option>
                               <option value="all">View All Company Orders</option>
                             </select>
                             <div className="text-right w-36">
                               <p className="text-xs text-brand-secondary truncate">{contact.email}</p>
                               <p className="text-[10px] text-brand-secondary/60 mt-1">Status: {contact.lastLogin}</p>
                             </div>
                             <button 
                               type="button" 
                               onClick={async (e) => {
                                 e.stopPropagation();
                                 if (!confirm(`Are you sure you want to remove portal access for ${contact.name}?`)) return;
                                 try {
                                   await deleteDoc(doc(db, 'users', contact.id));
                                   setContacts(contacts.filter(c => c.id !== contact.id));
                                 } catch (err) {
                                   console.error("Error deleting user:", err);
                                 }
                               }}
                               className="p-1.5 text-brand-secondary hover:text-red-600 rounded transition-colors"
                               title="Delete Portal User"
                             >
                               <Trash2 size={16} />
                             </button>
                           </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
             </div>
            
            <div className="p-6 border-t border-brand-border bg-white flex justify-between items-center">
                <button
                  type="button"
                  onClick={handleDeleteCompany}
                  disabled={isDeletingCompany || savingCompany}
                  className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200/80 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 size={15} />
                  {isDeletingCompany ? 'Deleting Company...' : 'Delete Company'}
                </button>
                <div className="flex gap-3">
                  <PillButton variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</PillButton>
                  <PillButton variant="filled" onClick={handleSaveCompany} disabled={savingCompany}>
                    {savingCompany ? 'Saving...' : 'Save Changes'}
                  </PillButton>
                </div>
            </div>
          </div>
        </div>
      )}

      {/* Catalog Selection Overlay */}
      {isCatalogDialogOpen && (
         <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm p-6 animate-in fade-in zoom-in-95 duration-200">
           <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl p-6 border border-brand-border flex flex-col">
              <div className="flex justify-between items-center mb-4">
                 <h3 className="font-serif text-xl text-brand-primary">Select Catalog Deck</h3>
                 <button onClick={() => { setIsCatalogDialogOpen(false); setSelectedWovnCustomer(null); }} className="text-brand-secondary hover:text-brand-primary transition-colors bg-brand-bg border border-brand-border rounded-md p-1">
                   <X size={16} />
                 </button>
              </div>

              {!selectedWovnCustomer ? (
                <>
                  <p className="text-sm text-brand-secondary mb-6 leading-relaxed">Select a WOVN Catalog profile to view their connected active decks.</p>
                  
                  <div className="space-y-3 mb-6 max-h-[400px] overflow-y-auto">
                    {isLoadingWovnCustomers ? (
                      <div className="flex justify-center p-6 bg-brand-bg rounded-xl border border-brand-border/60 text-brand-secondary text-sm font-medium">
                        <span className="animate-pulse">Loading profiles from WOVN Catalog...</span>
                      </div>
                    ) : wovnCustomersError ? (
                      <div className="flex flex-col justify-center p-6 bg-red-50 rounded-xl border border-red-200 text-red-600 text-sm font-medium text-center">
                        <p className="font-bold mb-1">Failed to load profiles</p>
                        <p className="text-xs opacity-80">{wovnCustomersError}</p>
                      </div>
                    ) : wovnCustomers.length === 0 ? (
                      <div className="flex justify-center p-6 bg-brand-bg rounded-xl border border-brand-border/60 text-brand-secondary text-sm font-medium text-center">
                        No profiles found.
                      </div>
                    ) : (
                      wovnCustomers.map(c => (
                        <button 
                          key={c.id} 
                          onClick={() => handleSelectWovnCustomer(c)}
                          className="w-full flex items-center justify-between p-4 rounded-xl border bg-white border-brand-border/60 hover:border-brand-primary/40 transition-colors group text-left"
                        >
                          <div>
                            <p className="font-medium text-brand-primary mb-0.5">{c.company || c.name}</p>
                            <p className="text-[10px] font-bold tracking-widest text-brand-secondary uppercase">{c.id}</p>
                          </div>
                          <span className="text-xs font-bold text-brand-primary opacity-0 group-hover:opacity-100 transition-opacity pr-2">→</span >
                        </button>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-6 bg-brand-bg p-2 rounded-xl border border-brand-border/60">
                    <button onClick={() => setSelectedWovnCustomer(null)} className="text-brand-primary transition-colors bg-white border border-brand-border shadow-sm rounded px-2 flex items-center h-7 text-xs font-bold">
                       &larr; Back
                    </button>
                    <p className="text-sm text-brand-secondary font-medium leading-relaxed truncate ml-1">Decks for <span className="text-brand-primary font-bold">{selectedWovnCustomer.company || selectedWovnCustomer.name}</span></p>
                  </div>

                  <div className="space-y-3 mb-6 max-h-[400px] overflow-y-auto">
                    {(() => {
                      const customerDecks = availableCatalogs.filter(d => (d.customer_id || d.customerId) === selectedWovnCustomer.id);
                      
                      if (isLoadingCatalogs) {
                        return (
                          <div className="flex justify-center p-6 bg-brand-bg rounded-xl border border-brand-border/60 text-brand-secondary text-sm font-medium">
                            <span className="animate-pulse">Loading active decks...</span>
                          </div>
                        );
                      }
                      
                      if (customerDecks.length === 0) {
                        return (
                          <div className="flex justify-center p-6 bg-brand-bg rounded-xl border border-brand-border/60 text-brand-secondary text-sm font-medium text-center">
                            No decks discovered for this profile.
                          </div>
                        );
                      }

                      return customerDecks.map(catalog => {
                        const catalogId = catalog.id || catalog.deckId;
                        const isSelected = catalogLinkIds.includes(catalogId);
                        const itemCount = Array.isArray(catalog.garments) ? catalog.garments.length : Array.isArray(catalog.items) ? catalog.items.length : 0;
                        return (
                          <button 
                            key={catalogId} 
                            onClick={() => toggleCatalogLink(catalogId)}
                            className={`w-full flex items-center justify-between p-4 rounded-xl border transition-colors group text-left ${
                              isSelected ? 'bg-brand-bg border-brand-primary/50' : 'bg-white border-brand-border/60 hover:border-brand-primary/40'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                isSelected ? 'bg-brand-primary border-brand-primary text-white' : 'bg-white border-brand-border group-hover:border-brand-primary/40'
                              }`}>
                                {isSelected && <Check size={12} strokeWidth={3} />}
                              </div>
                              <div>
                                <p className="font-medium text-brand-primary mb-0.5">{catalog.name || "Unnamed Deck"}</p>
                                <p className="text-[10px] font-bold tracking-widest text-brand-secondary uppercase">{catalogId}</p>
                              </div>
                            </div>
                            <span className="text-xs font-bold text-brand-secondary bg-white border border-brand-border px-2 py-1 rounded-md transition-colors">{itemCount} Items</span>
                          </button>
                        );
                      });
                    })()}
                  </div>
                </>
              )}
              
              <div className="flex justify-end pt-4 border-t border-brand-border">
                 <PillButton variant="filled" onClick={() => { setIsCatalogDialogOpen(false); setSelectedWovnCustomer(null); }}>Done</PillButton>
              </div>
           </div>
         </div>
      )}

      {/* New Order Dialog */}
      {isNewOrderDialogOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 overflow-y-auto">
          <div className="bg-brand-bg max-w-lg w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-brand-border my-auto">
            <div className="p-6 border-b border-brand-border flex justify-between items-center bg-white">
              <h3 className="font-serif text-2xl text-brand-primary">Create New Order</h3>
              <button 
                onClick={() => setIsNewOrderDialogOpen(false)} 
                className="text-brand-secondary hover:text-brand-primary transition-colors bg-brand-bg border border-brand-border rounded-md p-1"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Order Title</label>
                <input 
                  type="text" 
                  value={newOrderForm.title}
                  onChange={(e) => setNewOrderForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                  placeholder="e.g. Polos, Jackets, Accessories"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Due Date</label>
                <input 
                  type="date" 
                  value={newOrderForm.rawDate || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      setNewOrderForm(prev => ({ ...prev, rawDate: '', date: '' }));
                      return;
                    }
                    const [y, m, d] = val.split('-');
                    const formatted = `${m}/${d}/${y.substring(2)}`;
                    setNewOrderForm(prev => ({ ...prev, rawDate: val, date: formatted }));
                  }}
                  className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm flex items-center justify-between text-brand-primary focus:border-brand-primary focus:outline-none transition-colors accent-brand-primary min-h-[46px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Fulfillment Type</label>
                  <select 
                    value={newOrderForm.fulfillmentType}
                    onChange={(e) => setNewOrderForm(prev => ({ ...prev, fulfillmentType: e.target.value }))}
                    className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                  >
                    <option value="">Default (From Customer)</option>
                    <option value="Standard">Delivered</option>
                    <option value="Kitting">Inventory & Kitting</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Pipeline Status</label>
                  <select 
                    value={newOrderForm.statusIndex.toString()}
                    onChange={(e) => setNewOrderForm(prev => ({ ...prev, statusIndex: parseInt(e.target.value) }))}
                    className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                  >
                    {(() => {
                      const custFulfillment = liveCustomerData?.fulfillmentType ?? 'Standard';
                      const formIsKitting = newOrderForm.fulfillmentType === 'Kitting' || (!newOrderForm.fulfillmentType && custFulfillment === 'Kitting');
                      return (
                        <>
                          <option value="0">0 - Quote</option>
                          <option value="1">1 - Mgmt Notified</option>
                          <option value="2">2 - Quote Sent</option>
                          <option value="3">3 - Approved</option>
                          <option value="4">4 - Shopping</option>
                          <option value="5">5 - Ordered</option>
                          <option value="6">6 - Processing</option>
                          <option value="7">7 - {formIsKitting ? 'Inventory' : 'Shipped'}</option>
                          <option value="8">8 - {formIsKitting ? 'Live (Shopify)' : 'Received'}</option>
                        </>
                      );
                    })()}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Carrier</label>
                  <select 
                    value={newOrderForm.trackingCarrier}
                    onChange={(e) => setNewOrderForm(prev => ({ ...prev, trackingCarrier: e.target.value }))}
                    className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                  >
                    <option value="">Pickup / Local</option>
                    <option value="UPS">UPS</option>
                    <option value="FedEx">FedEx</option>
                    <option value="USPS">USPS</option>
                    <option value="DHL">DHL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-2">Tracking Number</label>
                  <input 
                    type="text" 
                    value={newOrderForm.trackingNumber}
                    onChange={(e) => setNewOrderForm(prev => ({ ...prev, trackingNumber: e.target.value }))}
                    className="w-full bg-white border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                    placeholder="e.g. 1Z9999..."
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-brand-border">
                <PillButton variant="outline" onClick={() => setIsNewOrderDialogOpen(false)} className="flex-1 justify-center py-3">
                  Cancel
                </PillButton>
                <PillButton variant="filled" onClick={handleCreateOrder} className="flex-1 justify-center py-3" disabled={isCreatingOrder || !newOrderForm.title}>
                  {isCreatingOrder ? <Loader2 className="animate-spin" size={18} /> : <span>Create Order</span>}
                </PillButton>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Add Suggested Item Modal */}
      {isAddingSuggestedModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm p-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white max-w-lg w-full rounded-2xl shadow-2xl p-6 border border-brand-border flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-serif text-xl text-brand-primary">
                {suggestedModalType === 'sample' 
                  ? (editingSuggestedItem ? "Edit Sample Garment" : "Add Sample Garment") 
                  : (editingSuggestedItem ? "Edit Suggested Garment" : "Add Suggested Garment")}
              </h3>
              <button 
                onClick={() => {
                  setIsAddingSuggestedModalOpen(false);
                  setEditingSuggestedItem(null);
                  setCustomSuggestedItem({ style: '', itemNum: '', description: '', image: '', colors: '', price: '', gender: 'Unisex', visible: true });
                  setSelectedSanMarProduct(null);
                  setSelectedColors({});
                  setSelectedInitialColor('');
                  setColorVariations([]);
                  setSuggestionsSearchQuery('');
                }} 
                className="text-brand-secondary hover:text-brand-primary transition-colors bg-brand-bg border border-brand-border rounded-md p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
              
              {/* Option A: Select from active customer decks */}
              {!editingSuggestedItem && customerDecks.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                    {suggestedModalType === 'sample' ? "A. Add Sample from Assigned Decks" : "A. Suggest from Assigned Decks"}
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    {customerDecks.map((deck) => 
                      (deck.items || deck.garments || []).map((item: any, idx: number) => {
                        const style = item.garment_name || item.name || item.style || item.title || 'Unknown Style';
                        const itemKey = item.itemNum || item.garment_id || item.sku || item.style || item.id || '';
                        const overriddenImage = liveCustomerData?.deckMockupOverrides?.[itemKey];
                        const image = overriddenImage || item.mockup_image || item.mock_image || item.original_image || item.image || item.imageUrl || '';
                        return (
                          <button
                            key={idx}
                            onClick={() => handleAddSuggestedItem({ ...item, style, image })}
                            className="flex items-center gap-3 w-full p-2 border border-brand-border/60 hover:border-brand-primary/40 rounded-xl hover:bg-neutral-50 text-left transition-colors"
                          >
                            <div className="w-10 h-10 bg-white border rounded overflow-hidden flex items-center justify-center p-0.5 shrink-0">
                              <img src={image} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-neutral-900 truncate">{style}</p>
                              <p className="text-[10px] text-neutral-500 font-semibold">{item.itemNum || item.garment_id || ''}</p>
                            </div>
                            <span className="text-xs text-brand-primary font-bold pr-2">
                              {suggestedModalType === 'sample' ? "+ Add Sample" : "+ Suggest"}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Copy from Previous Suggestions (Other Customers) */}
              {!editingSuggestedItem && allOtherSuggestions.length > 0 && (
                <div className="flex flex-col gap-2.5 bg-neutral-50/50 p-4 border border-brand-border/60 rounded-2xl">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                      Copy from Previous Suggestions
                    </h4>
                    <span className="text-[9px] bg-neutral-200 text-neutral-600 px-2 py-0.5 rounded font-bold">
                      {allOtherSuggestions.length} items
                    </span>
                  </div>
                  
                  {/* Search inside previous suggestions */}
                  <div className="relative mt-1">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input 
                      type="text"
                      placeholder="Search previous suggestions by name or SKU..."
                      value={suggestionsSearchQuery}
                      onChange={e => setSuggestionsSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-medium focus:outline-none focus:ring-1 focus:ring-brand-primary"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-2 max-h-[180px] overflow-y-auto pr-1 mt-1 custom-scrollbar">
                    {allOtherSuggestions
                      .filter(item => {
                        const term = suggestionsSearchQuery.toLowerCase();
                        return (
                          (item.style || '').toLowerCase().includes(term) ||
                          (item.itemNum && item.itemNum.toLowerCase().includes(term)) ||
                          (item.fromCustomer && item.fromCustomer.toLowerCase().includes(term))
                        );
                      })
                      .map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setCustomSuggestedItem({
                              style: item.style || '',
                              itemNum: item.itemNum || '',
                              description: item.description || '',
                              image: item.image || '',
                              colors: Array.isArray(item.colors) ? item.colors.join(', ') : (item.colors || ''),
                              price: item.price?.toString() || '',
                              gender: item.gender || 'Unisex',
                              visible: item.visible ?? true
                            });
                            const rawColors: string[] = Array.isArray(item.colors) 
                              ? item.colors 
                              : (typeof item.colors === 'string' && item.colors ? item.colors.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
                            
                            const itemImages = item.images || {};
                            const itemBackImages = item.backImages || {};

                            const allColorNames = rawColors.length > 0 
                              ? rawColors 
                              : Array.from(new Set([
                                  ...Object.keys(itemImages),
                                  ...Object.keys(itemBackImages)
                                ])).filter(Boolean);

                            if (allColorNames.length === 0 && item.image) {
                              allColorNames.push('Custom Color');
                            }

                            const initialVariations: ColorVariation[] = allColorNames.map((c, i) => ({
                              id: `col-${Date.now()}-${i}-${Math.random().toString(36).substring(7)}`,
                              color: c,
                              frontImage: itemImages[c] || (i === 0 && typeof item.image === 'string' ? item.image : ''),
                              backImage: itemBackImages[c] || ''
                            }));

                            const initialColors: Record<string, boolean> = {};
                            allColorNames.forEach((c: string) => {
                              initialColors[c] = true;
                            });
                            setSelectedColors(initialColors);

                            setColorVariations(initialVariations);
                            setSelectedSanMarProduct(null);
                          }}
                          className="flex items-center gap-3 w-full p-2 bg-white border border-neutral-200 hover:border-brand-primary/40 rounded-xl hover:bg-neutral-50 text-left transition-colors cursor-pointer group"
                        >
                          <div className="w-10 h-10 bg-white border rounded overflow-hidden flex items-center justify-center p-0.5 shrink-0">
                            <img src={item.image} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between items-start gap-1">
                              <p className="text-xs font-bold text-neutral-900 truncate flex-1">{item.style}</p>
                              <span className="text-[8px] bg-brand-bg text-neutral-400 border px-1 rounded truncate shrink-0 max-w-[100px]" title={`Suggested for ${item.fromCustomer}`}>
                                {item.fromCustomer}
                              </span>
                            </div>
                            <p className="text-[10px] text-neutral-500 font-semibold mt-0.5">
                              SKU: {item.itemNum || 'N/A'} • ${item.price || 0}
                            </p>
                          </div>
                          <span className="text-[10px] text-brand-primary font-bold pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            Use
                          </span>
                        </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Option B: Add completely custom suggested item */}
              <div className="flex flex-col gap-4 border-t border-neutral-100 pt-6">
                <h4 className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                  {editingSuggestedItem 
                    ? "Garment Details" 
                    : "Create Custom Recommendation"}
                </h4>
                
                {!editingSuggestedItem && (
                  /* SanMar selector button */
                  <button
                    type="button"
                    onClick={() => setIsGarmentBrowserOpen(true)}
                    className="flex items-center justify-center gap-2 w-full p-4 border border-dashed border-black/20 hover:border-black rounded-xl hover:bg-neutral-50 text-left transition-all text-xs font-bold text-neutral-700 cursor-pointer"
                  >
                    <Shirt size={16} />
                    Select Blank from SanMar Catalog
                  </button>
                )}

                {selectedSanMarProduct && (
                  <div className="flex items-center justify-between bg-neutral-50 border border-neutral-200/60 rounded-xl p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white border border-neutral-100 rounded overflow-hidden flex items-center justify-center p-0.5">
                        <img 
                          src={customSuggestedItem.image || (Object.values(selectedSanMarProduct.images)[0] as any)?.front || (Object.values(selectedSanMarProduct.images)[0] as any)} 
                          className="max-w-full max-h-full object-contain mix-blend-multiply" 
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-neutral-900 truncate">Selected SanMar product</p>
                        <p className="text-[10px] text-neutral-500 font-semibold">{selectedSanMarProduct.brand} {selectedSanMarProduct.style}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSanMarProduct(null);
                        setSelectedColors({});
                        setCustomSuggestedItem({ style: '', itemNum: '', description: '', image: '', colors: '', price: '', gender: 'Unisex', visible: true });
                      }}
                      className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                )}

                {selectedSanMarProduct && (
                  <div className="flex flex-col gap-2 bg-neutral-50 p-4 border border-brand-border rounded-xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                        Choose Available Colors ({Object.values(selectedColors).filter(Boolean).length} selected)
                      </span>
                      <button 
                        type="button" 
                        onClick={() => {
                          const allActive = Object.values(selectedColors).every(Boolean);
                          const nextVal = !allActive;
                          const nextColors: Record<string, boolean> = {};
                          selectedSanMarProduct.colors.forEach((c: string) => {
                            nextColors[c] = nextVal;
                          });
                          setSelectedColors(nextColors);
                          if (!nextVal) {
                            setColorVariations([]);
                            setCustomSuggestedItem(curr => ({ ...curr, colors: '' }));
                          } else {
                            const allVars: ColorVariation[] = (selectedSanMarProduct.colors || []).map((c: string, i: number) => {
                              const imgSet = selectedSanMarProduct.images?.[c];
                              const frontUrl = imgSet ? (typeof imgSet === 'string' ? imgSet : imgSet.front || '') : '';
                              const backUrl = imgSet && typeof imgSet !== 'string' ? imgSet.back || '' : '';
                              return {
                                id: `col-${Date.now()}-${i}`,
                                color: c,
                                frontImage: frontUrl,
                                backImage: backUrl
                              };
                            });
                            setColorVariations(allVars);
                            setCustomSuggestedItem(curr => ({ ...curr, colors: selectedSanMarProduct.colors.join(', ') }));
                          }
                        }}
                        className="text-[10px] font-bold text-neutral-400 hover:text-black uppercase tracking-wider cursor-pointer"
                      >
                        Toggle All
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto pr-1 mt-1">
                      {selectedSanMarProduct.colors.map((color: string) => {
                        const isChecked = !!selectedColors[color];
                        const swatchHex = getSwatchColor(color, true);
                        return (
                          <label 
                            key={color} 
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer transition-all select-none ${
                              isChecked 
                                ? 'bg-white border-black shadow-sm text-neutral-900' 
                                : 'bg-white border-neutral-200 text-neutral-400 hover:border-neutral-300 hover:text-neutral-600'
                            }`}
                          >
                            <input 
                              type="checkbox" 
                              className="hidden" 
                              checked={isChecked} 
                              onChange={() => {
                                const willBeChecked = !selectedColors[color];
                                setSelectedColors(prev => ({ ...prev, [color]: willBeChecked }));
                                if (!willBeChecked) {
                                  setColorVariations(prev => {
                                    const next = prev.filter(cv => cv.color.toLowerCase().trim() !== color.toLowerCase().trim());
                                    setCustomSuggestedItem(curr => ({
                                      ...curr,
                                      colors: next.map(cv => cv.color).filter(Boolean).join(', ')
                                    }));
                                    return next;
                                  });
                                } else {
                                  setColorVariations(prev => {
                                    const exists = prev.some(cv => cv.color.toLowerCase().trim() === color.toLowerCase().trim());
                                    if (exists) return prev;
                                    const imgSet = selectedSanMarProduct?.images?.[color];
                                    const frontUrl = imgSet ? (typeof imgSet === 'string' ? imgSet : imgSet.front || '') : '';
                                    const backUrl = imgSet && typeof imgSet !== 'string' ? imgSet.back || '' : '';
                                    const next = [
                                      ...prev,
                                      {
                                        id: `col-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                                        color,
                                        frontImage: frontUrl,
                                        backImage: backUrl
                                      }
                                    ];
                                    setCustomSuggestedItem(curr => ({
                                      ...curr,
                                      colors: next.map(cv => cv.color).filter(Boolean).join(', ')
                                    }));
                                    return next;
                                  });
                                }
                              }} 
                            />
                            <span 
                              className="w-3.5 h-3.5 rounded-full border border-neutral-200 shrink-0" 
                              style={{
                                backgroundColor: swatchHex.startsWith('linear-gradient') ? 'transparent' : swatchHex,
                                backgroundImage: swatchHex.startsWith('linear-gradient') ? swatchHex : 'none',
                              }}
                            />
                            <span>{color}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Garment Name/Style</label>
                  <input 
                    className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-primary/30 font-medium" 
                    value={customSuggestedItem.style} 
                    onChange={e => setCustomSuggestedItem({...customSuggestedItem, style: e.target.value})} 
                    placeholder="e.g. Classic Organic Tee"
                  />
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Item / SKU #</label>
                  <input 
                    className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-primary/30 font-medium" 
                    value={customSuggestedItem.itemNum} 
                    onChange={e => setCustomSuggestedItem({...customSuggestedItem, itemNum: e.target.value})} 
                    placeholder="e.g. Org-T01"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Description</label>
                  <textarea 
                    rows={2}
                    className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-primary/30 font-medium resize-none" 
                    value={customSuggestedItem.description} 
                    onChange={e => setCustomSuggestedItem({...customSuggestedItem, description: e.target.value})} 
                    placeholder="Why this item is recommended..."
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Mockup Image</label>
                  <div className="flex items-center gap-3">
                    {customSuggestedItem.image && (
                      <div className="w-14 h-14 border border-brand-border rounded-xl overflow-hidden bg-neutral-50 flex items-center justify-center p-1 relative shrink-0">
                        <img src={customSuggestedItem.image} className="max-w-full max-h-full object-contain" />
                        <button 
                          type="button"
                          onClick={() => setCustomSuggestedItem(prev => ({ ...prev, image: '' }))}
                          className="absolute top-0 right-0 bg-red-500 text-white rounded-bl p-0.5 hover:bg-red-600 transition-colors"
                          title="Remove mockup image"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    )}
                    <div className="flex-1">
                      <label className="flex items-center justify-center gap-2 border border-dashed border-neutral-300 hover:border-brand-primary/50 rounded-xl px-4 py-3 bg-neutral-50 hover:bg-neutral-100/50 cursor-pointer transition-all text-xs font-bold text-neutral-600">
                        <input type="file" className="hidden" accept="image/*" onChange={handleMockupUpload} />
                        {isUploadingMockup ? (
                          <>
                            <Loader2 size={14} className="animate-spin text-neutral-500" />
                            <span>Uploading Mockup...</span>
                          </>
                        ) : (
                          <>
                            <Upload size={14} />
                            <span>{customSuggestedItem.image ? "Change Mockup File" : "Upload Mockup File"}</span>
                          </>
                        )}
                      </label>
                    </div>
                  </div>
                  <div className="relative">
                    <span className="text-[10px] text-neutral-400 font-bold uppercase block my-1 text-center">or specify image URL</span>
                    <input 
                      className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-primary/30 font-medium placeholder:text-neutral-400" 
                      value={customSuggestedItem.image} 
                      onChange={e => setCustomSuggestedItem({...customSuggestedItem, image: e.target.value})} 
                      placeholder="Image URL link"
                    />
                  </div>
                </div>

                {/* Color Variations & Mockup Images Section */}
                <div className="flex flex-col gap-3 bg-neutral-50 p-4 border border-brand-border/80 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
                        <Palette size={14} className="text-brand-primary" />
                        <span>Color Variations & Mockups</span>
                      </h4>
                      <p className="text-[11px] text-neutral-500 font-medium mt-0.5">
                        Add color options and upload front/back mockup images per color.
                      </p>
                    </div>
                    <span className="text-[10px] font-bold bg-white border border-neutral-200 text-neutral-600 px-2 py-0.5 rounded-full shrink-0">
                      {colorVariations.length} {colorVariations.length === 1 ? 'Color' : 'Colors'}
                    </span>
                  </div>

                  {/* Quick Add Actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleAddColorVariation('')}
                      className="flex items-center gap-1 text-xs font-bold bg-white text-neutral-800 border border-neutral-300 hover:border-black px-3 py-1.5 rounded-lg shadow-2xs hover:bg-neutral-100 transition-all cursor-pointer"
                    >
                      <Plus size={13} />
                      <span>Add Color</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => handleAddQuickColors(['Black', 'White', 'Navy', 'Heather Grey'])}
                      className="text-[11px] font-bold text-neutral-600 bg-white hover:bg-neutral-100 border border-neutral-200 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      + Basics
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAddQuickColors(['Red', 'Royal Blue', 'Forest Green', 'Sand'])}
                      className="text-[11px] font-bold text-neutral-600 bg-white hover:bg-neutral-100 border border-neutral-200 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      + Accents
                    </button>

                    {colorVariations.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("Remove all color variations?")) {
                            setColorVariations([]);
                            setSelectedColors({});
                            setCustomSuggestedItem(curr => ({ ...curr, colors: '' }));
                          }
                        }}
                        className="text-[11px] font-bold text-red-500 hover:text-red-700 ml-auto cursor-pointer"
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  {/* Variations List */}
                  <div className="space-y-3 mt-1 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                    {colorVariations.length === 0 ? (
                      <div className="text-center py-4 border border-dashed border-neutral-200 rounded-xl bg-white text-xs text-neutral-400 font-medium">
                        No color variations added yet. Click "+ Add Color" above.
                      </div>
                    ) : (
                      colorVariations.map((cv, idx) => {
                        const swatchHex = getSwatchColor(cv.color, true);
                        return (
                          <div key={cv.id || idx} className="bg-white border border-neutral-200 rounded-xl p-3 shadow-2xs space-y-3">
                            {/* Color Header */}
                            <div className="flex items-center gap-2">
                              <span 
                                className="w-5 h-5 rounded-full border border-neutral-300 shrink-0 shadow-2xs" 
                                style={{
                                  backgroundColor: swatchHex.startsWith('linear-gradient') ? 'transparent' : swatchHex,
                                  backgroundImage: swatchHex.startsWith('linear-gradient') ? swatchHex : 'none',
                                }}
                                title={cv.color || 'Color Preview'}
                              />
                              <input 
                                type="text" 
                                placeholder="Color Name (e.g. Vintage Black)" 
                                value={cv.color} 
                                onChange={(e) => handleUpdateColorVariation(cv.id, { color: e.target.value })}
                                className="flex-1 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-1.5 text-xs font-bold text-neutral-900 focus:outline-none focus:bg-white focus:border-brand-primary"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveColorVariation(cv.id)}
                                className="text-neutral-400 hover:text-red-500 p-1 rounded-md transition-colors cursor-pointer"
                                title="Remove color variation"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>

                            {/* Front & Back Mockups Uploaders */}
                            <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                              
                              {/* Front Mockup */}
                              <div className="flex flex-col gap-1 bg-neutral-50 p-2 border border-neutral-200/80 rounded-lg">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Front Mockup</span>
                                
                                {cv.frontImage ? (
                                  <div className="relative group w-full h-18 bg-white border border-neutral-200 rounded-md overflow-hidden flex items-center justify-center p-1">
                                    <img src={cv.frontImage} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateColorVariation(cv.id, { frontImage: '' })}
                                      className="absolute top-1 right-1 bg-red-500 text-white p-0.5 rounded shadow hover:bg-red-600 transition-colors"
                                      title="Clear front mockup"
                                    >
                                      <X size={10} />
                                    </button>
                                  </div>
                                ) : (
                                  <label className="flex flex-col items-center justify-center h-18 border border-dashed border-neutral-300 hover:border-brand-primary/50 bg-white rounded-md cursor-pointer transition-all p-1 text-center">
                                    <input 
                                      type="file" 
                                      className="hidden" 
                                      accept="image/*" 
                                      onChange={(e) => handleUploadColorMockup(cv.id, 'front', e)} 
                                    />
                                    {cv.isUploadingFront ? (
                                      <Loader2 size={14} className="animate-spin text-neutral-400" />
                                    ) : (
                                      <>
                                        <Upload size={13} className="text-neutral-400 mb-0.5" />
                                        <span className="text-[10px] font-bold text-neutral-600">Upload Front</span>
                                      </>
                                    )}
                                  </label>
                                )}

                                <input 
                                  type="text" 
                                  placeholder="or Front URL" 
                                  value={cv.frontImage} 
                                  onChange={(e) => handleUpdateColorVariation(cv.id, { frontImage: e.target.value })}
                                  className="w-full bg-white border border-neutral-200 rounded px-2 py-1 text-[10px] font-medium text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:border-brand-primary"
                                />
                              </div>

                              {/* Back Mockup */}
                              <div className="flex flex-col gap-1 bg-neutral-50 p-2 border border-neutral-200/80 rounded-lg">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Back Mockup</span>
                                
                                {cv.backImage ? (
                                  <div className="relative group w-full h-18 bg-white border border-neutral-200 rounded-md overflow-hidden flex items-center justify-center p-1">
                                    <img src={cv.backImage} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateColorVariation(cv.id, { backImage: '' })}
                                      className="absolute top-1 right-1 bg-red-500 text-white p-0.5 rounded shadow hover:bg-red-600 transition-colors"
                                      title="Clear back mockup"
                                    >
                                      <X size={10} />
                                    </button>
                                  </div>
                                ) : (
                                  <label className="flex flex-col items-center justify-center h-18 border border-dashed border-neutral-300 hover:border-brand-primary/50 bg-white rounded-md cursor-pointer transition-all p-1 text-center">
                                    <input 
                                      type="file" 
                                      className="hidden" 
                                      accept="image/*" 
                                      onChange={(e) => handleUploadColorMockup(cv.id, 'back', e)} 
                                    />
                                    {cv.isUploadingBack ? (
                                      <Loader2 size={14} className="animate-spin text-neutral-400" />
                                    ) : (
                                      <>
                                        <Upload size={13} className="text-neutral-400 mb-0.5" />
                                        <span className="text-[10px] font-bold text-neutral-600">Upload Back</span>
                                      </>
                                    )}
                                  </label>
                                )}

                                <input 
                                  type="text" 
                                  placeholder="or Back URL" 
                                  value={cv.backImage} 
                                  onChange={(e) => handleUpdateColorVariation(cv.id, { backImage: e.target.value })}
                                  className="w-full bg-white border border-neutral-200 rounded px-2 py-1 text-[10px] font-medium text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:border-brand-primary"
                                />
                              </div>

                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Gender / Fit</label>
                  <select 
                    className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-primary/30 font-medium cursor-pointer"
                    value={customSuggestedItem.gender || 'Unisex'} 
                    onChange={e => setCustomSuggestedItem({...customSuggestedItem, gender: e.target.value})} 
                  >
                    <option value="Unisex">Unisex</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Price per Unit</label>
                    <input 
                      type="number"
                      step="0.01"
                      className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-primary/30 font-medium" 
                      value={customSuggestedItem.price} 
                      onChange={e => setCustomSuggestedItem({...customSuggestedItem, price: e.target.value})} 
                      placeholder="0.00"
                    />
                  </div>
                  {!selectedSanMarProduct && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Colors (Comma separated)</label>
                      <input 
                        className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-brand-primary/30 font-medium" 
                        value={customSuggestedItem.colors} 
                        onChange={e => setCustomSuggestedItem({...customSuggestedItem, colors: e.target.value})} 
                        placeholder="e.g. Red, Blue, White"
                      />
                    </div>
                  )}
                </div>

                {suggestedModalType === 'sample' && (
                  <label className="flex items-center gap-2 mt-4 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={customSuggestedItem.visible ?? true} 
                      onChange={e => setCustomSuggestedItem({...customSuggestedItem, visible: e.target.checked})} 
                      className="rounded border-neutral-300 accent-black text-black w-4 h-4 focus:ring-0"
                    />
                    <span className="text-xs font-bold text-neutral-700 uppercase tracking-wide">Visible in Client Portal</span>
                  </label>
                )}

                <PillButton variant="filled" className="w-full justify-center py-3 mt-4 animate-scale-in" onClick={() => handleAddSuggestedItem()}>
                  {editingSuggestedItem 
                    ? "Save Changes" 
                    : (suggestedModalType === 'sample' ? "Add Sample Garment" : "Suggest Custom Garment")}
                </PillButton>
              </div>

            </div>
          </div>
        </div>
      )}

      <ShopifyImportModal 
         isOpen={isShopifyImportOpen}
         onClose={() => setIsShopifyImportOpen(false)}
         customerId={id || ''}
      />
      <GarmentBrowser 
         isOpen={isGarmentBrowserOpen}
         onClose={() => setIsGarmentBrowserOpen(false)}
         onSelect={handleSelectSanMarGarment}
      />
      {/* Image Overlay */}
      {expandedImage && (
        <ImageLightboxModal
          src={expandedImage.src}
          alt={expandedImage.alt}
          images={expandedImage.images}
          onClose={() => setExpandedImage(null)}
        />
      )}

      {/* Customer Portal QR Modal */}
      <CustomerPortalQrModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        customer={{
          id: id || '',
          company: liveCustomerData?.company || liveCustomerData?.name,
          contactName: liveCustomerData?.contactName || liveCustomerData?.email,
          logo: liveCustomerData?.logo,
          croppedLogo: liveCustomerData?.croppedLogo,
          portalId: liveCustomerData?.portalId
        }}
      />

      {/* Signed Agreements & NDA Packet Viewer Modal */}
      <SignedAgreementsViewerModal
        isOpen={isSignedAgreementsModalOpen}
        onClose={() => setIsSignedAgreementsModalOpen(false)}
        companyName={editCompanyForm.name || liveCustomerData?.company || liveCustomerData?.name || 'Client'}
        signedData={liveCustomerData?.portalAgreementsData || null}
        fallbackPages={editCompanyForm.portalAgreementPages || liveCustomerData?.portalAgreementPages || DEFAULT_PORTAL_AGREEMENTS}
      />
    </div>
  );
}
