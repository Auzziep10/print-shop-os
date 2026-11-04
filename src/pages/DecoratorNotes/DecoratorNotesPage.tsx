import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { collection, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  Archive,
  BookOpen,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Filter,
  Flame,
  Image as ImageIcon,
  Layers,
  Maximize2,
  Plus,
  Printer,
  Ruler,
  Save,
  Search,
  Shirt,
  Sparkles,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { db, storage } from '../../lib/firebase';
import { tokens } from '../../lib/tokens';
import { useAuth } from '../../contexts/AuthContext';

export interface PlacementSpec {
  id: string;
  location: string; // e.g., "Front Center", "Left Chest", "Back Center", "Left Sleeve", "Right Sleeve", "Neck Tag"
  method: string; // e.g., "DTF", "Screen Print", "Embroidery", "Puff Print", "Heat Transfer", "Woven Label"
  widthInches: string;
  heightInches: string;
  distanceFromCollar: string;
  platenOrHoop: string;
  inkOrThreadColors: string;
  placementNotes: string;
}

export interface DecoratorNoteRecord {
  id: string; // `${customerId}__${designId}`
  customerId: string;
  customerName: string;
  parentCustomerId?: string;
  parentCustomerName?: string;
  designId: string;
  designTitle: string;
  garmentColor: string;
  sizingAdjustment: string;
  garmentSourcingLink: string;
  psdDriveLink: string;
  // Archived file snapshots (preserved even if removed from live rack)
  frontMockupUrl: string;
  frontMockupName: string;
  backMockupUrl: string;
  backMockupName: string;
  otherMockups: { id: string; name: string; url: string }[];
  logos: { id: string; name: string; url: string }[];
  productionPhotos?: { id: string; name: string; url: string; uploadedAt: string }[];
  // Structured Decorator Specs
  decorationMethod: string;
  pressTempF: string;
  pressTimeSec: string;
  pressPressure: string;
  peelType: string;
  secondPressSec: string;
  preTreatNotes: string;
  curingNotes: string;
  specialHandlingNotes: string;
  decoratorNotes: string;
  placements: PlacementSpec[];
  verifiedForRepeat: boolean;
  verifiedByName?: string;
  verifiedAt?: string;
  updatedByName?: string;
  updatedByRole?: string;
  updatedAt?: string;
  archivedAt?: string;
}

interface UnifiedDecoratorItem {
  archiveKey: string;
  customerId: string;
  customerName: string;
  parentCustomerId: string;
  parentCustomerName: string;
  isSubBrand: boolean;
  designId: string;
  designTitle: string;
  garmentColor: string;
  sizingAdjustment: string;
  garmentSourcingLink: string;
  psdDriveLink: string;
  frontMockupUrl: string;
  frontMockupName: string;
  backMockupUrl: string;
  backMockupName: string;
  otherMockups: { id: string; name: string; url: string }[];
  logos: { id: string; name: string; url: string }[];
  finalDesignApproved: boolean;
  approvedForOrder: boolean;
  uploadedAt: string;
  isLiveOnRack: boolean;
  noteRecord?: DecoratorNoteRecord;
}

const DECORATION_METHODS = [
  'DTF (Direct to Film)',
  'Screen Print',
  'Embroidery',
  'DTG (Direct to Garment)',
  'Puff / 3D Print',
  'Silicone / High Density Transfer',
  'Sublimation',
  'Woven / Neck Label Relabeling',
  'Mixed / Multi-Method'
];

const PLACEMENT_LOCATIONS = [
  'Front Center',
  'Left Chest',
  'Right Chest',
  'Back Center',
  'Upper Back / Locker Patch',
  'Left Sleeve',
  'Right Sleeve',
  'Inside Neck Label',
  'Lower Hem / Hip',
  'Hood',
  'Custom Location'
];

const PEEL_OPTIONS = [
  'Hot Peel',
  'Warm Peel',
  'Cold Peel',
  'Instant Peel',
  'N/A'
];

const PRESSURE_OPTIONS = [
  'Medium-Firm (40-50 PSI)',
  'Heavy / Firm (60+ PSI)',
  'Light-Medium (30 PSI)',
  'Standard',
  'N/A'
];

function createDefaultPlacement(location = 'Front Center', method = 'DTF (Direct to Film)'): PlacementSpec {
  return {
    id: `pl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    location,
    method,
    widthInches: '',
    heightInches: '',
    distanceFromCollar: '',
    platenOrHoop: '',
    inkOrThreadColors: '',
    placementNotes: ''
  };
}

export function DecoratorNotesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, userData } = useAuth();

  const [customers, setCustomers] = useState<any[]>([]);
  const [notesByKey, setNotesByKey] = useState<Record<string, DecoratorNoteRecord>>({});
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '');
  const [customerFilter, setCustomerFilter] = useState(() => searchParams.get('customer') || 'all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'has_notes' | 'needs_notes' | 'verified'>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');

  // Active item in detail editor modal
  const [activeKey, setActiveKey] = useState<string | null>(() => searchParams.get('item') || null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessToast, setSaveSuccessToast] = useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Lightbox state
  const [lightbox, setLightbox] = useState<{
    images: { src: string; label: string }[];
    index: number;
  } | null>(null);

  // Editor form state
  const [formState, setFormState] = useState<{
    decorationMethod: string;
    pressTempF: string;
    pressTimeSec: string;
    pressPressure: string;
    peelType: string;
    secondPressSec: string;
    preTreatNotes: string;
    curingNotes: string;
    specialHandlingNotes: string;
    decoratorNotes: string;
    placements: PlacementSpec[];
    productionPhotos: { id: string; name: string; url: string; uploadedAt: string }[];
    verifiedForRepeat: boolean;
  }>({
    decorationMethod: 'DTF (Direct to Film)',
    pressTempF: '',
    pressTimeSec: '',
    pressPressure: 'Medium-Firm (40-50 PSI)',
    peelType: 'Cold Peel',
    secondPressSec: '',
    preTreatNotes: '',
    curingNotes: '',
    specialHandlingNotes: '',
    decoratorNotes: '',
    placements: [],
    productionPhotos: [],
    verifiedForRepeat: false
  });

  // Subscribe to all customers (to pull every Designer Rack item)
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'customers'),
      (snap) => {
        setCustomers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoadingCustomers(false);
      },
      (err) => {
        console.error('Error loading customers for Decorator Notes:', err);
        setLoadingCustomers(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to decorator_notes archive collection
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'decorator_notes'),
      (snap) => {
        const map: Record<string, DecoratorNoteRecord> = {};
        snap.docs.forEach((d) => {
          map[d.id] = { id: d.id, ...(d.data() as Omit<DecoratorNoteRecord, 'id'>) };
        });
        setNotesByKey(map);
        setLoadingNotes(false);
      },
      (err) => {
        console.error('Error loading decorator_notes collection:', err);
        setLoadingNotes(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Build unified list combining all live Designer Rack items + any archived decorator_notes items
  const unifiedItems = useMemo<UnifiedDecoratorItem[]>(() => {
    const customerMap = new Map<string, any>();
    customers.forEach((c) => {
      if (c && c.id) customerMap.set(c.id, c);
    });

    const itemsByKey = new Map<string, UnifiedDecoratorItem>();

    // 1. Pull every live item from every customer's designerRack
    customers.forEach((cust) => {
      if (!cust || !Array.isArray(cust.designerRack)) return;
      const custName =
        (cust.company && cust.company !== '-' ? cust.company : '') ||
        cust.contactName ||
        cust.name ||
        'Customer';
      const parentCust = cust.parentCustomerId ? customerMap.get(cust.parentCustomerId) : null;
      const parentName = parentCust
        ? (parentCust.company && parentCust.company !== '-' ? parentCust.company : '') ||
          parentCust.contactName ||
          parentCust.name ||
          custName
        : custName;

      cust.designerRack.forEach((design: any) => {
        if (!design || !design.id) return;
        const archiveKey = `${cust.id}__${design.id}`;
        const savedNote = notesByKey[archiveKey];

        const legacyMockups: { id: string; name: string; url: string }[] = Array.isArray(design.mockups)
          ? design.mockups
          : [];
        const frontMockupUrl =
          design.frontMockupUrl ||
          legacyMockups[0]?.url ||
          design.mockupUrl ||
          design.url ||
          savedNote?.frontMockupUrl ||
          '';
        const frontMockupName =
          design.frontMockupName ||
          legacyMockups[0]?.name ||
          design.mockupName ||
          savedNote?.frontMockupName ||
          'Front Mock-up';
        const backMockupUrl =
          design.backMockupUrl ||
          legacyMockups[1]?.url ||
          savedNote?.backMockupUrl ||
          '';
        const backMockupName =
          design.backMockupName ||
          legacyMockups[1]?.name ||
          savedNote?.backMockupName ||
          'Back Mock-up';
        const otherMockups: { id: string; name: string; url: string }[] = Array.isArray(design.otherMockups)
          ? design.otherMockups
          : legacyMockups.length > 2
            ? legacyMockups.slice(2)
            : savedNote?.otherMockups || [];
        const logos: { id: string; name: string; url: string }[] = Array.isArray(design.logos)
          ? design.logos
          : savedNote?.logos || [];

        itemsByKey.set(archiveKey, {
          archiveKey,
          customerId: cust.id,
          customerName: custName,
          parentCustomerId: cust.parentCustomerId || cust.id,
          parentCustomerName: parentName,
          isSubBrand: Boolean(cust.parentCustomerId),
          designId: design.id,
          designTitle: (design.title || design.name || savedNote?.designTitle || 'Untitled Garment').trim(),
          garmentColor: (design.garmentColor || design.color || savedNote?.garmentColor || '').trim(),
          sizingAdjustment: design.sizingAdjustment || savedNote?.sizingAdjustment || 'True to Size',
          garmentSourcingLink: (design.garmentSourcingLink || savedNote?.garmentSourcingLink || '').trim(),
          psdDriveLink: (design.psdDriveLink || savedNote?.psdDriveLink || '').trim(),
          frontMockupUrl,
          frontMockupName,
          backMockupUrl,
          backMockupName,
          otherMockups,
          logos,
          finalDesignApproved: Boolean(design.finalDesignApproved),
          approvedForOrder: Boolean(design.approvedForOrder),
          uploadedAt: design.updatedAt || design.uploadedAt || savedNote?.updatedAt || '',
          isLiveOnRack: true,
          noteRecord: savedNote
        });
      });
    });

    // 2. Include any archived DecoratorNoteRecord whose design was later deleted from the live rack
    //    so the archive is permanent and never loses historical production recipes
    Object.values(notesByKey).forEach((note) => {
      if (!note || !note.id || itemsByKey.has(note.id)) return;
      itemsByKey.set(note.id, {
        archiveKey: note.id,
        customerId: note.customerId,
        customerName: note.customerName || 'Archived Brand',
        parentCustomerId: note.parentCustomerId || note.customerId,
        parentCustomerName: note.parentCustomerName || note.customerName || 'Archived Brand',
        isSubBrand: Boolean(note.parentCustomerId && note.parentCustomerId !== note.customerId),
        designId: note.designId,
        designTitle: note.designTitle || 'Archived Garment',
        garmentColor: note.garmentColor || '',
        sizingAdjustment: note.sizingAdjustment || 'True to Size',
        garmentSourcingLink: note.garmentSourcingLink || '',
        psdDriveLink: note.psdDriveLink || '',
        frontMockupUrl: note.frontMockupUrl || '',
        frontMockupName: note.frontMockupName || 'Front Mock-up',
        backMockupUrl: note.backMockupUrl || '',
        backMockupName: note.backMockupName || 'Back Mock-up',
        otherMockups: Array.isArray(note.otherMockups) ? note.otherMockups : [],
        logos: Array.isArray(note.logos) ? note.logos : [],
        finalDesignApproved: true,
        approvedForOrder: true,
        uploadedAt: note.updatedAt || note.archivedAt || '',
        isLiveOnRack: false,
        noteRecord: note
      });
    });

    return Array.from(itemsByKey.values()).sort((a, b) => {
      const aHasNotes = Boolean(
        a.noteRecord?.decoratorNotes?.trim() ||
          a.noteRecord?.specialHandlingNotes?.trim() ||
          (a.noteRecord?.placements && a.noteRecord.placements.length > 0)
      );
      const bHasNotes = Boolean(
        b.noteRecord?.decoratorNotes?.trim() ||
          b.noteRecord?.specialHandlingNotes?.trim() ||
          (b.noteRecord?.placements && b.noteRecord.placements.length > 0)
      );
      if (aHasNotes !== bHasNotes) return aHasNotes ? -1 : 1;
      const aTime = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      const bTime = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      if (bTime !== aTime) return bTime - aTime;
      return a.designTitle.localeCompare(b.designTitle);
    });
  }, [customers, notesByKey]);

  const itemHasDecoratorNotes = (item: UnifiedDecoratorItem): boolean => {
    const r = item.noteRecord;
    if (!r) return false;
    return Boolean(
      r.decoratorNotes?.trim() ||
        r.specialHandlingNotes?.trim() ||
        r.preTreatNotes?.trim() ||
        r.curingNotes?.trim() ||
        r.pressTempF?.trim() ||
        r.pressTimeSec?.trim() ||
        (Array.isArray(r.placements) &&
          r.placements.some(
            (p) =>
              p.widthInches?.trim() ||
              p.heightInches?.trim() ||
              p.distanceFromCollar?.trim() ||
              p.inkOrThreadColors?.trim() ||
              p.placementNotes?.trim()
          )) ||
        (Array.isArray(r.productionPhotos) && r.productionPhotos.length > 0)
    );
  };

  // Unique customers for dropdown filter
  const customerFilterOptions = useMemo(() => {
    const map = new Map<string, { id: string; label: string; count: number }>();
    unifiedItems.forEach((item) => {
      const key = item.customerId;
      const label =
        item.isSubBrand && item.parentCustomerName !== item.customerName
          ? `${item.parentCustomerName} — ${item.customerName}`
          : item.customerName;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { id: key, label, count: 1 });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [unifiedItems]);

  // Summary counters
  const stats = useMemo(() => {
    let total = unifiedItems.length;
    let documented = 0;
    let verified = 0;
    let totalFilesArchived = 0;

    unifiedItems.forEach((item) => {
      if (itemHasDecoratorNotes(item)) documented++;
      if (item.noteRecord?.verifiedForRepeat) verified++;
      const mockupCount =
        (item.frontMockupUrl ? 1 : 0) +
        (item.backMockupUrl ? 1 : 0) +
        item.otherMockups.length +
        item.logos.length +
        (item.noteRecord?.productionPhotos?.length || 0);
      totalFilesArchived += mockupCount;
    });

    return {
      total,
      documented,
      needsNotes: Math.max(0, total - documented),
      verified,
      totalFilesArchived
    };
  }, [unifiedItems]);

  // Filtered items
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return unifiedItems.filter((item) => {
      if (customerFilter !== 'all' && item.customerId !== customerFilter && item.parentCustomerId !== customerFilter) {
        return false;
      }
      const hasNotes = itemHasDecoratorNotes(item);
      if (statusFilter === 'has_notes' && !hasNotes) return false;
      if (statusFilter === 'needs_notes' && hasNotes) return false;
      if (statusFilter === 'verified' && !item.noteRecord?.verifiedForRepeat) return false;

      if (methodFilter !== 'all') {
        const itemMethod = item.noteRecord?.decorationMethod || '';
        const placementMethods = (item.noteRecord?.placements || []).map((p) => p.method).join(' ');
        if (!itemMethod.includes(methodFilter) && !placementMethods.includes(methodFilter)) {
          return false;
        }
      }

      if (q) {
        const placementsText = (item.noteRecord?.placements || [])
          .map(
            (p) =>
              `${p.location} ${p.method} ${p.widthInches} ${p.heightInches} ${p.distanceFromCollar} ${p.inkOrThreadColors} ${p.placementNotes}`
          )
          .join(' ');
        const haystack = [
          item.designTitle,
          item.customerName,
          item.parentCustomerName,
          item.garmentColor,
          item.sizingAdjustment,
          item.noteRecord?.decorationMethod,
          item.noteRecord?.decoratorNotes,
          item.noteRecord?.specialHandlingNotes,
          item.noteRecord?.preTreatNotes,
          item.noteRecord?.curingNotes,
          placementsText
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [unifiedItems, customerFilter, statusFilter, methodFilter, searchQuery]);

  const activeItem = useMemo(
    () => (activeKey ? unifiedItems.find((i) => i.archiveKey === activeKey) || null : null),
    [activeKey, unifiedItems]
  );

  // Populate editor form whenever activeItem changes
  useEffect(() => {
    if (!activeItem) return;
    const rec = activeItem.noteRecord;
    const defaultPlacements: PlacementSpec[] = [];
    if (activeItem.frontMockupUrl) {
      defaultPlacements.push(createDefaultPlacement('Front Center', rec?.decorationMethod || 'DTF (Direct to Film)'));
    }
    if (activeItem.backMockupUrl) {
      defaultPlacements.push(createDefaultPlacement('Back Center', rec?.decorationMethod || 'DTF (Direct to Film)'));
    }
    if (defaultPlacements.length === 0) {
      defaultPlacements.push(createDefaultPlacement('Front Center', rec?.decorationMethod || 'DTF (Direct to Film)'));
    }

    setFormState({
      decorationMethod: rec?.decorationMethod || 'DTF (Direct to Film)',
      pressTempF: rec?.pressTempF || '',
      pressTimeSec: rec?.pressTimeSec || '',
      pressPressure: rec?.pressPressure || 'Medium-Firm (40-50 PSI)',
      peelType: rec?.peelType || 'Cold Peel',
      secondPressSec: rec?.secondPressSec || '',
      preTreatNotes: rec?.preTreatNotes || '',
      curingNotes: rec?.curingNotes || '',
      specialHandlingNotes: rec?.specialHandlingNotes || '',
      decoratorNotes: rec?.decoratorNotes || '',
      placements:
        rec?.placements && rec.placements.length > 0 ? rec.placements : defaultPlacements,
      productionPhotos: Array.isArray(rec?.productionPhotos) ? rec.productionPhotos : [],
      verifiedForRepeat: Boolean(rec?.verifiedForRepeat)
    });
  }, [activeItem?.archiveKey]);

  const handleOpenItemModal = (item: UnifiedDecoratorItem) => {
    setActiveKey(item.archiveKey);
    const next = new URLSearchParams(searchParams);
    next.set('item', item.archiveKey);
    setSearchParams(next, { replace: true });
  };

  const handleCloseItemModal = () => {
    setActiveKey(null);
    const next = new URLSearchParams(searchParams);
    next.delete('item');
    setSearchParams(next, { replace: true });
  };

  const persistProductionPhotos = async (
    nextPhotos: { id: string; name: string; url: string; uploadedAt: string }[]
  ) => {
    if (!activeItem) return;
    const actorName =
      userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Team Member';
    const actorRole = userData?.role || 'Staff';
    const nowIso = new Date().toISOString();

    await setDoc(
      doc(db, 'decorator_notes', activeItem.archiveKey),
      {
        id: activeItem.archiveKey,
        customerId: activeItem.customerId,
        customerName: activeItem.customerName,
        parentCustomerId: activeItem.parentCustomerId,
        parentCustomerName: activeItem.parentCustomerName,
        designId: activeItem.designId,
        designTitle: activeItem.designTitle,
        garmentColor: activeItem.garmentColor,
        sizingAdjustment: activeItem.sizingAdjustment,
        garmentSourcingLink: activeItem.garmentSourcingLink,
        psdDriveLink: activeItem.psdDriveLink,
        frontMockupUrl: activeItem.frontMockupUrl,
        frontMockupName: activeItem.frontMockupName,
        backMockupUrl: activeItem.backMockupUrl,
        backMockupName: activeItem.backMockupName,
        otherMockups: activeItem.otherMockups,
        logos: activeItem.logos,
        productionPhotos: nextPhotos,
        updatedByName: actorName,
        updatedByRole: actorRole,
        updatedAt: nowIso,
        archivedAt: activeItem.noteRecord?.archivedAt || nowIso
      },
      { merge: true }
    );

    const custDoc = customers.find((c) => c.id === activeItem.customerId);
    if (custDoc && Array.isArray(custDoc.designerRack)) {
      const exists = custDoc.designerRack.some((d: any) => d && d.id === activeItem.designId);
      if (exists) {
        const updatedRack = custDoc.designerRack.map((d: any) => {
          if (!d || d.id !== activeItem.designId) return d;
          return {
            ...d,
            productionPhotos: nextPhotos,
            decoratorUpdatedAt: nowIso,
            decoratorUpdatedBy: actorName
          };
        });
        await updateDoc(doc(db, 'customers', activeItem.customerId), {
          designerRack: updatedRack
        });
      }
    }
  };

  const uploadProductionPhotoFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => f && f.type.startsWith('image/'));
    if (files.length === 0 || !activeItem) return;
    setUploadingPhoto(true);
    try {
      const uploaded: { id: string; name: string; url: string; uploadedAt: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storageRef = ref(
          storage,
          `decorator_notes/${activeItem.customerId}/${activeItem.designId}/${Date.now()}_${safeName}`
        );
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        uploaded.push({
          id: `photo-${Date.now()}-${i}`,
          name: file.name,
          url,
          uploadedAt: new Date().toISOString()
        });
      }
      const nextPhotos = [...formState.productionPhotos, ...uploaded];
      setFormState((prev) => ({
        ...prev,
        productionPhotos: nextPhotos
      }));
      await persistProductionPhotos(nextPhotos);
      setSaveSuccessToast(
        `Uploaded & saved ${uploaded.length} completed garment photo${uploaded.length === 1 ? '' : 's'}!`
      );
      setTimeout(() => setSaveSuccessToast(null), 3500);
    } catch (err) {
      console.error('Error uploading production reference photo:', err);
      alert('Failed to upload photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleUploadProductionPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await uploadProductionPhotoFiles(files);
    e.target.value = '';
  };

  const handleRemoveProductionPhoto = async (photoId: string) => {
    const nextPhotos = formState.productionPhotos.filter((p) => p.id !== photoId);
    setFormState((prev) => ({
      ...prev,
      productionPhotos: nextPhotos
    }));
    try {
      await persistProductionPhotos(nextPhotos);
    } catch (err) {
      console.error('Failed to remove production photo:', err);
    }
  };

  const handleSaveDecoratorNote = async () => {
    if (!activeItem) return;
    setIsSaving(true);
    try {
      const actorName =
        userData?.name || user?.displayName || user?.email?.split('@')[0] || 'Team Member';
      const actorRole = userData?.role || 'Staff';
      const nowIso = new Date().toISOString();

      const payload: DecoratorNoteRecord = {
        id: activeItem.archiveKey,
        customerId: activeItem.customerId,
        customerName: activeItem.customerName,
        parentCustomerId: activeItem.parentCustomerId,
        parentCustomerName: activeItem.parentCustomerName,
        designId: activeItem.designId,
        designTitle: activeItem.designTitle,
        garmentColor: activeItem.garmentColor,
        sizingAdjustment: activeItem.sizingAdjustment,
        garmentSourcingLink: activeItem.garmentSourcingLink,
        psdDriveLink: activeItem.psdDriveLink,
        frontMockupUrl: activeItem.frontMockupUrl,
        frontMockupName: activeItem.frontMockupName,
        backMockupUrl: activeItem.backMockupUrl,
        backMockupName: activeItem.backMockupName,
        otherMockups: activeItem.otherMockups,
        logos: activeItem.logos,
        productionPhotos: formState.productionPhotos,
        decorationMethod: formState.decorationMethod,
        pressTempF: formState.pressTempF.trim(),
        pressTimeSec: formState.pressTimeSec.trim(),
        pressPressure: formState.pressPressure,
        peelType: formState.peelType,
        secondPressSec: formState.secondPressSec.trim(),
        preTreatNotes: formState.preTreatNotes.trim(),
        curingNotes: formState.curingNotes.trim(),
        specialHandlingNotes: formState.specialHandlingNotes.trim(),
        decoratorNotes: formState.decoratorNotes.trim(),
        placements: formState.placements,
        verifiedForRepeat: formState.verifiedForRepeat,
        ...(formState.verifiedForRepeat
          ? {
              verifiedByName: activeItem.noteRecord?.verifiedByName || actorName,
              verifiedAt: activeItem.noteRecord?.verifiedAt || nowIso
            }
          : {}),
        updatedByName: actorName,
        updatedByRole: actorRole,
        updatedAt: nowIso,
        archivedAt: activeItem.noteRecord?.archivedAt || nowIso
      };

      await setDoc(doc(db, 'decorator_notes', activeItem.archiveKey), payload, { merge: true });

      // Also sync summary decorator notes onto the customer's designerRack item if it exists live
      const custDoc = customers.find((c) => c.id === activeItem.customerId);
      if (custDoc && Array.isArray(custDoc.designerRack)) {
        const exists = custDoc.designerRack.some((d: any) => d && d.id === activeItem.designId);
        if (exists) {
          const updatedRack = custDoc.designerRack.map((d: any) => {
            if (!d || d.id !== activeItem.designId) return d;
            return {
              ...d,
              decoratorNotes: formState.decoratorNotes.trim(),
              decorationMethod: formState.decorationMethod,
              verifiedForRepeat: formState.verifiedForRepeat,
              decoratorUpdatedAt: nowIso,
              decoratorUpdatedBy: actorName
            };
          });
          await updateDoc(doc(db, 'customers', activeItem.customerId), {
            designerRack: updatedRack
          });
        }
      }

      setSaveSuccessToast(`Saved decorator archive for "${activeItem.designTitle}"`);
      setTimeout(() => setSaveSuccessToast(null), 3500);
    } catch (err) {
      console.error('Failed to save decorator notes:', err);
      alert('Failed to save decorator notes.');
    } finally {
      setIsSaving(false);
    }
  };

  // Snapshot all current Designer Rack items into decorator_notes so files are permanently archived
  const handleSyncAllRackItemsToArchive = async () => {
    setIsSyncingAll(true);
    try {
      const nowIso = new Date().toISOString();
      const unarchived = unifiedItems.filter((item) => !item.noteRecord);
      for (const item of unarchived) {
        const payload: DecoratorNoteRecord = {
          id: item.archiveKey,
          customerId: item.customerId,
          customerName: item.customerName,
          parentCustomerId: item.parentCustomerId,
          parentCustomerName: item.parentCustomerName,
          designId: item.designId,
          designTitle: item.designTitle,
          garmentColor: item.garmentColor,
          sizingAdjustment: item.sizingAdjustment,
          garmentSourcingLink: item.garmentSourcingLink,
          psdDriveLink: item.psdDriveLink,
          frontMockupUrl: item.frontMockupUrl,
          frontMockupName: item.frontMockupName,
          backMockupUrl: item.backMockupUrl,
          backMockupName: item.backMockupName,
          otherMockups: item.otherMockups,
          logos: item.logos,
          productionPhotos: [],
          decorationMethod: 'DTF (Direct to Film)',
          pressTempF: '',
          pressTimeSec: '',
          pressPressure: 'Medium-Firm (40-50 PSI)',
          peelType: 'Cold Peel',
          secondPressSec: '',
          preTreatNotes: '',
          curingNotes: '',
          specialHandlingNotes: '',
          decoratorNotes: '',
          placements: [],
          verifiedForRepeat: false,
          archivedAt: nowIso,
          updatedAt: nowIso
        };
        await setDoc(doc(db, 'decorator_notes', item.archiveKey), payload, { merge: true });
      }
      setSaveSuccessToast(
        unarchived.length > 0
          ? `Archived ${unarchived.length} Designer Rack garment(s) into the permanent Decorator Archive!`
          : 'All Designer Rack garments are already backed up in the archive!'
      );
      setTimeout(() => setSaveSuccessToast(null), 4000);
    } catch (err) {
      console.error('Error syncing Designer Rack items to archive:', err);
      alert('Failed to sync all items to archive.');
    } finally {
      setIsSyncingAll(false);
    }
  };

  const getAllItemImages = (
    item: UnifiedDecoratorItem,
    overridePhotos?: { id: string; name: string; url: string; uploadedAt: string }[]
  ): { src: string; label: string }[] => {
    const list: { src: string; label: string }[] = [];
    if (item.frontMockupUrl) {
      list.push({ src: item.frontMockupUrl, label: 'Front Mock-up' });
    }
    if (item.backMockupUrl) {
      list.push({ src: item.backMockupUrl, label: 'Back Mock-up' });
    }
    item.otherMockups.forEach((m, idx) => {
      if (m.url) list.push({ src: m.url, label: m.name || `Mock-up ${idx + 3}` });
    });
    item.logos.forEach((l, idx) => {
      if (l.url && l.name?.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i)) {
        list.push({ src: l.url, label: `Logo: ${l.name || idx + 1}` });
      }
    });
    const photos = overridePhotos ?? item.noteRecord?.productionPhotos ?? [];
    photos.forEach((p, idx) => {
      if (p.url) {
        list.push({ src: p.url, label: `Completed Garment Photo ${idx + 1}` });
      }
    });
    return list;
  };

  return (
    <div className={tokens.layout.container}>
      {/* Toast Notification */}
      {saveSuccessToast && (
        <div className="fixed bottom-6 right-6 z-[300] bg-neutral-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-neutral-700 flex items-center gap-2.5 text-xs font-bold animate-in fade-in slide-in-from-bottom-4 duration-200">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span>{saveSuccessToast}</span>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[260] bg-black/85 backdrop-blur-xs flex flex-col items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative max-w-5xl w-full flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between text-white px-2">
              <span className="text-sm font-bold">
                {lightbox.images[lightbox.index]?.label} ({lightbox.index + 1} / {lightbox.images.length})
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={lightbox.images[lightbox.index]?.src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors"
                >
                  <Download size={13} />
                  <span>Open / Download Original</span>
                </a>
                <button
                  type="button"
                  onClick={() => setLightbox(null)}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="relative w-full h-[75vh] bg-white rounded-2xl p-6 flex items-center justify-center overflow-hidden">
              <img
                src={lightbox.images[lightbox.index]?.src}
                alt={lightbox.images[lightbox.index]?.label}
                className="max-w-full max-h-full object-contain"
              />
              {lightbox.images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setLightbox((prev) =>
                        prev
                          ? {
                              ...prev,
                              index: (prev.index - 1 + prev.images.length) % prev.images.length
                            }
                          : null
                      )
                    }
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-neutral-900/80 hover:bg-neutral-900 text-white flex items-center justify-center shadow-lg cursor-pointer"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setLightbox((prev) =>
                        prev
                          ? {
                              ...prev,
                              index: (prev.index + 1) % prev.images.length
                            }
                          : null
                      )
                    }
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-neutral-900/80 hover:bg-neutral-900 text-white flex items-center justify-center shadow-lg cursor-pointer"
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-brand-border">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center shrink-0 shadow-xs">
              <BookOpen size={20} />
            </div>
            <div>
              <h1 className={tokens.typography.h1}>Decorator Notes &amp; Production Archive</h1>
              <p className="text-xs text-brand-secondary mt-1">
                Centralized archive of every Designer Rack mock-up, artwork file, placement measurement, press temperature, and decorator note so any garment can be reproduced identically.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleSyncAllRackItemsToArchive}
            disabled={isSyncingAll || loadingCustomers}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-neutral-900 hover:bg-neutral-800 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50"
          >
            <Archive size={14} />
            <span>{isSyncingAll ? 'Archiving Rack Files...' : 'Snapshot All Rack Mock-ups to Archive'}</span>
          </button>
        </div>
      </div>

      {/* Summary Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mt-6">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'all'
              ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
              : 'bg-white hover:bg-neutral-50 text-brand-primary border-brand-border'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-75">
              Total Rack Garments
            </span>
            <Shirt size={15} className="opacity-70" />
          </div>
          <div className="text-2xl font-black mt-1.5 tabular-nums">{stats.total}</div>
          <div className="text-[11px] opacity-75 mt-0.5">
            {stats.totalFilesArchived} mock-ups &amp; logo files indexed
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'has_notes' ? 'all' : 'has_notes')}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'has_notes'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
              : 'bg-white hover:bg-emerald-50/50 text-brand-primary border-brand-border'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-80">
              Documented Recipes
            </span>
            <FileText size={15} className="opacity-80" />
          </div>
          <div className="text-2xl font-black mt-1.5 tabular-nums">{stats.documented}</div>
          <div className="text-[11px] opacity-80 mt-0.5">
            With decorator specs &amp; notes
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'needs_notes' ? 'all' : 'needs_notes')}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'needs_notes'
              ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
              : 'bg-white hover:bg-amber-50/50 text-brand-primary border-brand-border'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-80">
              Needs Decorator Notes
            </span>
            <Edit3 size={15} className="opacity-80" />
          </div>
          <div className="text-2xl font-black mt-1.5 tabular-nums">{stats.needsNotes}</div>
          <div className="text-[11px] opacity-80 mt-0.5">
            Awaiting production specs
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'verified' ? 'all' : 'verified')}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'verified'
              ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
              : 'bg-white hover:bg-purple-50/50 text-brand-primary border-brand-border'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-80">
              Verified Master Recipes
            </span>
            <Sparkles size={15} className="opacity-80" />
          </div>
          <div className="text-2xl font-black mt-1.5 tabular-nums">{stats.verified}</div>
          <div className="text-[11px] opacity-80 mt-0.5">
            Locked for exact repeat runs
          </div>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-brand-border rounded-2xl p-4 mt-5 shadow-2xs flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by garment title, brand/customer, garment color, placement, ink/DTF spec, or decorator note..."
            className="w-full pl-9 pr-8 py-2.5 text-xs font-medium bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:bg-white focus:border-neutral-900 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-500 mr-1">
            <Filter size={13} />
            <span>Filter:</span>
          </div>

          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="px-3 py-2 text-xs font-bold bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-800 focus:outline-none focus:border-neutral-900 cursor-pointer"
          >
            <option value="all">All Brands / Customers ({customerFilterOptions.length})</option>
            {customerFilterOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} ({c.count})
              </option>
            ))}
          </select>

          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="px-3 py-2 text-xs font-bold bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-800 focus:outline-none focus:border-neutral-900 cursor-pointer"
          >
            <option value="all">All Decoration Methods</option>
            {DECORATION_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {(customerFilter !== 'all' ||
            statusFilter !== 'all' ||
            methodFilter !== 'all' ||
            searchQuery.trim() !== '') && (
            <button
              type="button"
              onClick={() => {
                setCustomerFilter('all');
                setStatusFilter('all');
                setMethodFilter('all');
                setSearchQuery('');
              }}
              className="px-3 py-2 text-xs font-bold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition-colors cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Main Garment Archive Grid */}
      <div className="mt-6">
        {loadingCustomers && loadingNotes ? (
          <div className="bg-white border border-brand-border rounded-2xl p-12 text-center text-sm text-brand-secondary">
            Loading Designer Rack mock-ups and Decorator Archive...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="bg-white border border-brand-border rounded-2xl p-12 text-center">
            <Shirt size={32} className="mx-auto text-neutral-300 mb-2" />
            <p className="text-sm font-bold text-brand-primary">No matching garments found</p>
            <p className="text-xs text-brand-secondary mt-1">
              Upload designs to any customer&apos;s Designer Rack or adjust your search filters above.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredItems.map((item) => {
              const hasNotes = itemHasDecoratorNotes(item);
              const rec = item.noteRecord;
              const isVerified = Boolean(rec?.verifiedForRepeat);
              const allImages = getAllItemImages(item);
              const placements = rec?.placements || [];

              return (
                <div
                  key={item.archiveKey}
                  onClick={() => handleOpenItemModal(item)}
                  className={`bg-white border rounded-2xl p-5 flex flex-col justify-between gap-4 shadow-2xs hover:shadow-md transition-all cursor-pointer group ${
                    isVerified
                      ? 'border-purple-300 ring-1 ring-purple-200/60'
                      : hasNotes
                        ? 'border-emerald-300/90'
                        : 'border-brand-border hover:border-neutral-400'
                  }`}
                >
                  {/* Top Header: Brand + Status Badge */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-neutral-100 text-neutral-800 border border-neutral-200 truncate">
                          <Building2 size={10} className="shrink-0" />
                          <span className="truncate">
                            {item.isSubBrand && item.parentCustomerName !== item.customerName
                              ? `${item.parentCustomerName} · ${item.customerName}`
                              : item.customerName}
                          </span>
                        </span>
                        {!item.isLiveOnRack && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-neutral-800 text-white">
                            Archived Copy
                          </span>
                        )}
                      </div>

                      {isVerified ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-purple-50 text-purple-800 border border-purple-200 shrink-0">
                          <Sparkles size={10} />
                          <span>Verified Recipe</span>
                        </span>
                      ) : hasNotes ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
                          <Check size={10} strokeWidth={3} />
                          <span>Notes Saved</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                          <Edit3 size={10} />
                          <span>Add Notes</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-black text-brand-primary truncate" title={item.designTitle}>
                        {item.designTitle}
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {item.garmentColor && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-neutral-100 text-neutral-700 border border-neutral-200">
                          Color: {item.garmentColor}
                        </span>
                      )}
                      {item.sizingAdjustment && item.sizingAdjustment !== 'True to Size' && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          {item.sizingAdjustment}
                        </span>
                      )}
                      {rec?.decorationMethod && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                          {rec.decorationMethod}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Mockups Visual Strip (Front + Back + Logos) */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Front Mockup */}
                    <div
                      onClick={(e) => {
                        if (allImages.length > 0) {
                          e.stopPropagation();
                          setLightbox({ images: allImages, index: 0 });
                        }
                      }}
                      className="relative h-36 rounded-xl border border-neutral-200 bg-neutral-50/80 p-2 flex flex-col items-center justify-center overflow-hidden group/img"
                    >
                      <span className="absolute top-1.5 left-2 text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/90 text-neutral-700 border border-neutral-200 z-10">
                        Front
                      </span>
                      {item.frontMockupUrl ? (
                        <>
                          <img
                            src={item.frontMockupUrl}
                            alt={`${item.designTitle} Front`}
                            className="w-full h-full object-contain mix-blend-multiply group-hover/img:scale-105 transition-transform"
                          />
                          <span className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-lg bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                            <Maximize2 size={11} />
                          </span>
                        </>
                      ) : (
                        <span className="text-[11px] text-neutral-400 font-semibold">No Front Mock-up</span>
                      )}
                    </div>

                    {/* Back Mockup */}
                    <div
                      onClick={(e) => {
                        if (item.backMockupUrl && allImages.length > 0) {
                          e.stopPropagation();
                          const backIdx = item.frontMockupUrl ? 1 : 0;
                          setLightbox({ images: allImages, index: backIdx });
                        }
                      }}
                      className="relative h-36 rounded-xl border border-neutral-200 bg-neutral-50/80 p-2 flex flex-col items-center justify-center overflow-hidden group/img"
                    >
                      <span className="absolute top-1.5 left-2 text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/90 text-neutral-700 border border-neutral-200 z-10">
                        Back
                      </span>
                      {item.backMockupUrl ? (
                        <>
                          <img
                            src={item.backMockupUrl}
                            alt={`${item.designTitle} Back`}
                            className="w-full h-full object-contain mix-blend-multiply group-hover/img:scale-105 transition-transform"
                          />
                          <span className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-lg bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                            <Maximize2 size={11} />
                          </span>
                        </>
                      ) : (
                        <span className="text-[11px] text-neutral-400 font-semibold">No Back Mock-up</span>
                      )}
                    </div>
                  </div>

                  {/* Logos & Files Strip */}
                  <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-600 bg-neutral-50 border border-neutral-200/70 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Layers size={13} className="text-neutral-500 shrink-0" />
                      <span className="font-bold text-neutral-800 truncate">
                        {item.logos.length} Logo{item.logos.length === 1 ? '' : 's'} ·{' '}
                        {(item.frontMockupUrl ? 1 : 0) +
                          (item.backMockupUrl ? 1 : 0) +
                          item.otherMockups.length}{' '}
                        Mock-up(s)
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.psdDriveLink && (
                        <a
                          href={
                            item.psdDriveLink.startsWith('http')
                              ? item.psdDriveLink
                              : `https://${item.psdDriveLink}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] font-extrabold text-neutral-900 hover:underline inline-flex items-center gap-0.5"
                        >
                          <span>PSD</span>
                          <ExternalLink size={10} />
                        </a>
                      )}
                      {item.garmentSourcingLink && (
                        <a
                          href={
                            item.garmentSourcingLink.startsWith('http')
                              ? item.garmentSourcingLink
                              : `https://${item.garmentSourcingLink}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] font-extrabold text-neutral-900 hover:underline inline-flex items-center gap-0.5"
                        >
                          <span>Blank</span>
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Decorator Notes Preview */}
                  <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-3 min-h-[78px] flex flex-col justify-between">
                    {hasNotes ? (
                      <div className="space-y-1.5">
                        {(rec?.pressTempF || rec?.pressTimeSec || rec?.peelType) && (
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-neutral-700">
                            {rec.pressTempF && (
                              <span className="px-1.5 py-0.5 rounded bg-white border border-neutral-200">
                                {rec.pressTempF}°F
                              </span>
                            )}
                            {rec.pressTimeSec && (
                              <span className="px-1.5 py-0.5 rounded bg-white border border-neutral-200">
                                {rec.pressTimeSec}s
                              </span>
                            )}
                            {rec.pressPressure && rec.pressPressure !== 'N/A' && (
                              <span className="px-1.5 py-0.5 rounded bg-white border border-neutral-200">
                                {rec.pressPressure}
                              </span>
                            )}
                            {rec.peelType && rec.peelType !== 'N/A' && (
                              <span className="px-1.5 py-0.5 rounded bg-white border border-neutral-200">
                                {rec.peelType}
                              </span>
                            )}
                          </div>
                        )}

                        {placements.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {placements.slice(0, 3).map((pl) => (
                              <span
                                key={pl.id}
                                className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-200"
                              >
                                {pl.location}
                                {pl.widthInches || pl.heightInches
                                  ? `: ${pl.widthInches || '?'}" × ${pl.heightInches || '?'}"`
                                  : ''}
                                {pl.distanceFromCollar ? ` (${pl.distanceFromCollar} from collar)` : ''}
                              </span>
                            ))}
                          </div>
                        )}

                        {rec?.decoratorNotes && (
                          <p className="text-xs text-neutral-800 line-clamp-2 font-medium leading-snug">
                            {rec.decoratorNotes}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-neutral-400 italic flex items-center gap-1.5 my-auto">
                        <Edit3 size={13} className="shrink-0" />
                        <span>
                          Click to record how we decorated this garment (measurements, press temp/time, placement, notes)...
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Card Footer */}
                  <div className="flex items-center justify-between pt-1 border-t border-neutral-100 text-[11px]">
                    <Link
                      to={`/customers/${item.parentCustomerId}?rack=open`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-bold text-neutral-500 hover:text-neutral-900 inline-flex items-center gap-1"
                    >
                      <span>Open Brand Rack</span>
                      <ExternalLink size={11} />
                    </Link>

                    <span className="font-extrabold text-neutral-900 group-hover:underline inline-flex items-center gap-1">
                      <span>{hasNotes ? 'View / Edit Recipe' : 'Add Decorator Notes'}</span>
                      <ChevronRight size={13} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FULL DECORATOR RECIPE & FILE ARCHIVE MODAL */}
      {activeItem && (
        <div
          className="fixed inset-0 z-[220] bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={handleCloseItemModal}
        >
          <div
            className="bg-white max-w-5xl w-full rounded-2xl shadow-2xl border border-brand-border overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-brand-border bg-neutral-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-neutral-900 text-white">
                    <Building2 size={10} />
                    <span>
                      {activeItem.isSubBrand && activeItem.parentCustomerName !== activeItem.customerName
                        ? `${activeItem.parentCustomerName} · ${activeItem.customerName}`
                        : activeItem.customerName}
                    </span>
                  </span>
                  {activeItem.garmentColor && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white border border-neutral-200 text-neutral-700">
                      Color: {activeItem.garmentColor}
                    </span>
                  )}
                  {activeItem.sizingAdjustment && activeItem.sizingAdjustment !== 'True to Size' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 border border-amber-200 text-amber-800">
                      {activeItem.sizingAdjustment}
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-black text-neutral-900 mt-1 truncate">
                  {activeItem.designTitle}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200 transition-colors cursor-pointer"
                  title="Print Production Recipe Sheet"
                >
                  <Printer size={14} />
                  <span className="hidden sm:inline">Print Sheet</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveDecoratorNote}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-neutral-900 hover:bg-neutral-800 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Save size={14} />
                  <span>{isSaving ? 'Saving...' : 'Save Recipe & Archive'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCloseItemModal}
                  className="p-2 rounded-xl text-neutral-400 hover:text-neutral-800 hover:bg-neutral-200/60 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* SECTION 1: ARCHIVED MOCK-UPS, LOGOS & PRODUCTION FILES */}
              <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5">
                      <ImageIcon size={14} />
                      <span>Archived Mock-ups, Artwork Files &amp; Sourcing Links</span>
                    </h3>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      Pulled directly from the Designer Rack and stored in the Decorator Archive for future production runs.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600 text-xs font-bold shadow-2xs transition-colors cursor-pointer">
                      <Upload size={13} />
                      <span>
                        {uploadingPhoto ? 'Uploading Photo...' : 'Upload Completed Garment Photo'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleUploadProductionPhoto}
                        className="hidden"
                      />
                    </label>
                    {activeItem.psdDriveLink && (
                      <a
                        href={
                          activeItem.psdDriveLink.startsWith('http')
                            ? activeItem.psdDriveLink
                            : `https://${activeItem.psdDriveLink}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-neutral-900 text-neutral-900 hover:text-white border border-neutral-300 text-xs font-bold transition-colors"
                      >
                        <FileText size={13} />
                        <span>Open PSD / Print Files</span>
                        <ExternalLink size={11} />
                      </a>
                    )}
                    {activeItem.garmentSourcingLink && (
                      <a
                        href={
                          activeItem.garmentSourcingLink.startsWith('http')
                            ? activeItem.garmentSourcingLink
                            : `https://${activeItem.garmentSourcingLink}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-neutral-900 text-neutral-900 hover:text-white border border-neutral-300 text-xs font-bold transition-colors"
                      >
                        <Shirt size={13} />
                        <span>Blank Supplier Link</span>
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                </div>

                {/* Mockups + Logos Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Front Mockup */}
                  <div className="bg-white border border-neutral-200 rounded-xl p-2.5 flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-600">
                        Front Mock-up
                      </span>
                      {activeItem.frontMockupUrl && (
                        <a
                          href={activeItem.frontMockupUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-bold text-blue-600 hover:underline inline-flex items-center gap-0.5"
                        >
                          <Download size={10} />
                          <span>File</span>
                        </a>
                      )}
                    </div>
                    <div
                      onClick={() => {
                        const imgs = getAllItemImages(activeItem);
                        if (imgs.length > 0) setLightbox({ images: imgs, index: 0 });
                      }}
                      className="h-36 rounded-lg bg-neutral-50 flex items-center justify-center p-2 cursor-pointer overflow-hidden"
                    >
                      {activeItem.frontMockupUrl ? (
                        <img
                          src={activeItem.frontMockupUrl}
                          alt="Front Mockup"
                          className="max-w-full max-h-full object-contain mix-blend-multiply"
                        />
                      ) : (
                        <span className="text-xs text-neutral-400">No Front Mock-up</span>
                      )}
                    </div>
                  </div>

                  {/* Back Mockup */}
                  <div className="bg-white border border-neutral-200 rounded-xl p-2.5 flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-600">
                        Back Mock-up
                      </span>
                      {activeItem.backMockupUrl && (
                        <a
                          href={activeItem.backMockupUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-bold text-blue-600 hover:underline inline-flex items-center gap-0.5"
                        >
                          <Download size={10} />
                          <span>File</span>
                        </a>
                      )}
                    </div>
                    <div
                      onClick={() => {
                        const imgs = getAllItemImages(activeItem);
                        if (activeItem.backMockupUrl && imgs.length > 0) {
                          setLightbox({ images: imgs, index: activeItem.frontMockupUrl ? 1 : 0 });
                        }
                      }}
                      className="h-36 rounded-lg bg-neutral-50 flex items-center justify-center p-2 cursor-pointer overflow-hidden"
                    >
                      {activeItem.backMockupUrl ? (
                        <img
                          src={activeItem.backMockupUrl}
                          alt="Back Mockup"
                          className="max-w-full max-h-full object-contain mix-blend-multiply"
                        />
                      ) : (
                        <span className="text-xs text-neutral-400">No Back Mock-up</span>
                      )}
                    </div>
                  </div>

                  {/* Logos Box */}
                  <div className="bg-white border border-neutral-200 rounded-xl p-2.5 flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-600">
                        Artwork / Logos ({activeItem.logos.length})
                      </span>
                    </div>
                    {activeItem.logos.length === 0 ? (
                      <div className="h-36 rounded-lg bg-neutral-50 flex items-center justify-center text-xs text-neutral-400">
                        No Logo Files
                      </div>
                    ) : (
                      <div className="h-36 overflow-y-auto space-y-1.5 pr-1">
                        {activeItem.logos.map((logo) => {
                          const isImg = Boolean(logo.name?.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i));
                          return (
                            <div
                              key={logo.id}
                              className="flex items-center justify-between gap-2 p-1.5 rounded-lg border border-neutral-200 bg-neutral-50"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-8 h-8 rounded bg-white border border-neutral-200 flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
                                  {isImg ? (
                                    <img
                                      src={logo.url}
                                      alt={logo.name}
                                      className="max-w-full max-h-full object-contain"
                                    />
                                  ) : (
                                    <FileText size={14} className="text-neutral-500" />
                                  )}
                                </div>
                                <span className="text-[11px] font-bold text-neutral-800 truncate" title={logo.name}>
                                  {logo.name || 'Logo File'}
                                </span>
                              </div>
                              <a
                                href={logo.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 rounded hover:bg-neutral-200 text-neutral-700 shrink-0"
                                title="Download / Open Logo File"
                              >
                                <Download size={12} />
                              </a>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Production Reference Photos (Uploaded by Decorator Team) */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        void uploadProductionPhotoFiles(e.dataTransfer.files);
                      }
                    }}
                    className="bg-white border border-neutral-200 rounded-xl p-2.5 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-600 truncate">
                        Real Garment ({formState.productionPhotos.length})
                      </span>
                      <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-900 hover:bg-neutral-800 text-white text-[10px] font-bold cursor-pointer shrink-0 transition-colors">
                        <Upload size={10} />
                        <span>{uploadingPhoto ? 'Uploading...' : 'Upload'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleUploadProductionPhoto}
                          className="hidden"
                        />
                      </label>
                    </div>
                    {formState.productionPhotos.length === 0 ? (
                      <label className="h-36 rounded-lg border-2 border-dashed border-emerald-300/90 bg-emerald-50/40 hover:bg-emerald-50 flex flex-col items-center justify-center gap-1.5 text-center p-2.5 cursor-pointer transition-colors">
                        <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-2xs">
                          <Upload size={14} />
                        </div>
                        <span className="text-[11px] font-extrabold text-neutral-800">
                          {uploadingPhoto ? 'Uploading photo...' : 'Upload Completed Garment'}
                        </span>
                        <span className="text-[10px] font-medium text-neutral-500 leading-tight">
                          Click or drag &amp; drop real-life photos of the produced garment
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleUploadProductionPhoto}
                          className="hidden"
                        />
                      </label>
                    ) : (
                      <div className="h-36 overflow-y-auto grid grid-cols-2 gap-1.5 pr-0.5">
                        {formState.productionPhotos.map((photo, pIdx) => (
                          <div
                            key={photo.id}
                            onClick={() => {
                              const imgs = getAllItemImages(activeItem, formState.productionPhotos);
                              const targetIdx = Math.max(
                                0,
                                imgs.findIndex((im) => im.src === photo.url)
                              );
                              if (imgs.length > 0) {
                                setLightbox({ images: imgs, index: targetIdx });
                              }
                            }}
                            className="relative h-16 rounded-lg border border-neutral-200 bg-neutral-50 overflow-hidden group/ph cursor-pointer"
                            title="Click to enlarge completed garment photo"
                          >
                            <img
                              src={photo.url}
                              alt={photo.name || `Completed Garment ${pIdx + 1}`}
                              className="w-full h-full object-cover group-hover/ph:scale-105 transition-transform"
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleRemoveProductionPhoto(photo.id);
                              }}
                              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/75 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover/ph:opacity-100 transition-opacity cursor-pointer"
                              title="Remove photo"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION 2: PRESS / MACHINE PARAMETERS & VERIFICATION */}
              <div className="bg-white border border-brand-border rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5">
                    <Flame size={14} className="text-amber-600" />
                    <span>Primary Decoration Method &amp; Machine / Press Settings</span>
                  </h3>

                  <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-xs font-extrabold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formState.verifiedForRepeat}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, verifiedForRepeat: e.target.checked }))
                      }
                      className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                    />
                    <Sparkles size={13} className="text-purple-600" />
                    <span>Verified Master Recipe (Ready for Repeat Production)</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="col-span-2 sm:col-span-1 lg:col-span-2">
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-neutral-500 mb-1">
                      Decoration Method
                    </label>
                    <select
                      value={formState.decorationMethod}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, decorationMethod: e.target.value }))
                      }
                      className="w-full px-3 py-2 text-xs font-bold bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:bg-white focus:border-neutral-900"
                    >
                      {DECORATION_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-neutral-500 mb-1">
                      Temp (°F)
                    </label>
                    <input
                      type="text"
                      value={formState.pressTempF}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, pressTempF: e.target.value }))
                      }
                      placeholder="e.g. 305"
                      className="w-full px-3 py-2 text-xs font-bold bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:bg-white focus:border-neutral-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-neutral-500 mb-1">
                      1st Press (Sec)
                    </label>
                    <input
                      type="text"
                      value={formState.pressTimeSec}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, pressTimeSec: e.target.value }))
                      }
                      placeholder="e.g. 12"
                      className="w-full px-3 py-2 text-xs font-bold bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:bg-white focus:border-neutral-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-neutral-500 mb-1">
                      Peel Type
                    </label>
                    <select
                      value={formState.peelType}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, peelType: e.target.value }))
                      }
                      className="w-full px-3 py-2 text-xs font-bold bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:bg-white focus:border-neutral-900"
                    >
                      {PEEL_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-neutral-500 mb-1">
                      2nd Press / Seal
                    </label>
                    <input
                      type="text"
                      value={formState.secondPressSec}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, secondPressSec: e.target.value }))
                      }
                      placeholder="e.g. 5s w/ parchment"
                      className="w-full px-3 py-2 text-xs font-bold bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:bg-white focus:border-neutral-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-neutral-500 mb-1">
                      Pressure / Platen Tension
                    </label>
                    <select
                      value={formState.pressPressure}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, pressPressure: e.target.value }))
                      }
                      className="w-full px-3 py-2 text-xs font-bold bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:bg-white focus:border-neutral-900"
                    >
                      {PRESSURE_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-neutral-500 mb-1">
                      Pre-Press / Pre-Treat Notes
                    </label>
                    <input
                      type="text"
                      value={formState.preTreatNotes}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, preTreatNotes: e.target.value }))
                      }
                      placeholder="e.g. 4s pre-press for moisture, use Teflon pillow"
                      className="w-full px-3 py-2 text-xs font-medium bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:bg-white focus:border-neutral-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-neutral-500 mb-1">
                      Cover Sheet / Curing / Finishing
                    </label>
                    <input
                      type="text"
                      value={formState.curingNotes}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, curingNotes: e.target.value }))
                      }
                      placeholder="e.g. Matte finishing sheet, avoid seam edges"
                      className="w-full px-3 py-2 text-xs font-medium bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:bg-white focus:border-neutral-900"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 3: EXACT PLACEMENT BREAKDOWN (FRONT, BACK, SLEEVES, NECK, ETC.) */}
              <div className="bg-white border border-brand-border rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5">
                      <Ruler size={14} className="text-blue-600" />
                      <span>Exact Print Placements &amp; Dimensions ({formState.placements.length})</span>
                    </h3>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      Record exact width/height, distance down from collar/seam, platen size, and alignment notes for each print location.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setFormState((prev) => ({
                        ...prev,
                        placements: [
                          ...prev.placements,
                          createDefaultPlacement('Left Sleeve', prev.decorationMethod)
                        ]
                      }))
                    }
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>Add Placement</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {formState.placements.map((pl, idx) => (
                    <div
                      key={pl.id}
                      className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-neutral-900">
                          Placement #{idx + 1}
                        </span>
                        {formState.placements.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setFormState((prev) => ({
                                ...prev,
                                placements: prev.placements.filter((p) => p.id !== pl.id)
                              }))
                            }
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 hover:underline cursor-pointer"
                          >
                            <Trash2 size={12} />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                        <div className="col-span-2 sm:col-span-1">
                          <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">
                            Location
                          </label>
                          <select
                            value={pl.location}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormState((prev) => ({
                                ...prev,
                                placements: prev.placements.map((p) =>
                                  p.id === pl.id ? { ...p, location: val } : p
                                )
                              }));
                            }}
                            className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-neutral-200 rounded-lg"
                          >
                            {PLACEMENT_LOCATIONS.map((loc) => (
                              <option key={loc} value={loc}>
                                {loc}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">
                            Width (in)
                          </label>
                          <input
                            type="text"
                            value={pl.widthInches}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormState((prev) => ({
                                ...prev,
                                placements: prev.placements.map((p) =>
                                  p.id === pl.id ? { ...p, widthInches: val } : p
                                )
                              }));
                            }}
                            placeholder='e.g. 11.5"'
                            className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-neutral-200 rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">
                            Height (in)
                          </label>
                          <input
                            type="text"
                            value={pl.heightInches}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormState((prev) => ({
                                ...prev,
                                placements: prev.placements.map((p) =>
                                  p.id === pl.id ? { ...p, heightInches: val } : p
                                )
                              }));
                            }}
                            placeholder='e.g. 14"'
                            className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-neutral-200 rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">
                            Distance From Collar
                          </label>
                          <input
                            type="text"
                            value={pl.distanceFromCollar}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormState((prev) => ({
                                ...prev,
                                placements: prev.placements.map((p) =>
                                  p.id === pl.id ? { ...p, distanceFromCollar: val } : p
                                )
                              }));
                            }}
                            placeholder='e.g. 3" down / 3 fingers'
                            className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-neutral-200 rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">
                            Platen / Hoop Size
                          </label>
                          <input
                            type="text"
                            value={pl.platenOrHoop}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormState((prev) => ({
                                ...prev,
                                placements: prev.placements.map((p) =>
                                  p.id === pl.id ? { ...p, platenOrHoop: val } : p
                                )
                              }));
                            }}
                            placeholder='e.g. 16x20" / Sleeve Platen'
                            className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-neutral-200 rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">
                            Ink / Thread / Film Spec
                          </label>
                          <input
                            type="text"
                            value={pl.inkOrThreadColors}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormState((prev) => ({
                                ...prev,
                                placements: prev.placements.map((p) =>
                                  p.id === pl.id ? { ...p, inkOrThreadColors: val } : p
                                )
                              }));
                            }}
                            placeholder="e.g. Hot Peel DTF / PMS 186C"
                            className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-neutral-200 rounded-lg"
                          />
                        </div>
                      </div>

                      <div>
                        <input
                          type="text"
                          value={pl.placementNotes}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormState((prev) => ({
                              ...prev,
                              placements: prev.placements.map((p) =>
                                p.id === pl.id ? { ...p, placementNotes: val } : p
                              )
                            }));
                          }}
                          placeholder="Specific alignment or placement notes for this location (e.g., center between pocket seam and collar, scale down 15% on XS/S)..."
                          className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-lg"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* SECTION 4: FULL DECORATOR PRODUCTION NOTES & SPECIAL WARNINGS */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-white border border-brand-border rounded-2xl p-5">
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-neutral-900 mb-1">
                    Step-by-Step Decorator Notes (How We Decorated This Garment)
                  </label>
                  <p className="text-[11px] text-neutral-500 mb-2.5">
                    Write down everything the production team needs to know to reproduce this garment identically in the future.
                  </p>
                  <textarea
                    rows={5}
                    value={formState.decoratorNotes}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, decoratorNotes: e.target.value }))
                    }
                    placeholder="Example:&#10;1. Thread garment onto 16x20 platen so neck seam hangs off the front edge.&#10;2. Lint roll acid wash fabric thoroughly before pressing.&#10;3. Pre-press 4 seconds to flatten heavy seams.&#10;4. Align front graphic 3 inches below collar rib; press at 305°F for 12s, cold peel, then 5s finish press with matte parchment..."
                    className="w-full p-3.5 text-xs leading-relaxed bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:bg-white focus:border-neutral-900"
                  />
                </div>

                <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-5 flex flex-col justify-between">
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-amber-950 mb-1">
                      Watch-Outs &amp; Garment Quirks
                    </label>
                    <p className="text-[11px] text-amber-800/80 mb-2.5">
                      Dye migration risks, scorch sensitivity, thick seams, zipper/pocket clearance, or sizing scaling rules.
                    </p>
                    <textarea
                      rows={5}
                      value={formState.specialHandlingNotes}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, specialHandlingNotes: e.target.value }))
                      }
                      placeholder="e.g.Pink Hombre hoodie bleeds if pressed over 300°F! Use low-temp 285°F transfer and Teflon pillow under kangaroo pocket seam."
                      className="w-full p-3 text-xs leading-relaxed bg-white border border-amber-200 rounded-xl focus:outline-none focus:border-amber-600"
                    />
                  </div>

                  {activeItem.noteRecord?.updatedAt && (
                    <div className="mt-3 pt-2.5 border-t border-amber-200/60 text-[10px] text-amber-900 flex items-center gap-1.5">
                      <Clock size={11} />
                      <span>
                        Last updated by <strong>{activeItem.noteRecord.updatedByName || 'Team'}</strong> on{' '}
                        {new Date(activeItem.noteRecord.updatedAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-brand-border bg-neutral-50 flex items-center justify-between shrink-0">
              <Link
                to={`/customers/${activeItem.parentCustomerId}?rack=open`}
                className="text-xs font-bold text-neutral-600 hover:text-neutral-900 inline-flex items-center gap-1.5"
              >
                <span>Go to {activeItem.customerName} Designer Rack</span>
                <ExternalLink size={12} />
              </Link>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleCloseItemModal}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60 transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSaveDecoratorNote}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-neutral-900 hover:bg-neutral-800 text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Save size={14} />
                  <span>{isSaving ? 'Saving...' : 'Save Decorator Notes'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
