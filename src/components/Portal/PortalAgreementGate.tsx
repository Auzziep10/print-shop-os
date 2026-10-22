import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Check,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  PenTool,
  Type,
  RotateCcw,
  Lock,
  LogOut,
  CheckCircle2,
  Building2,
  Calendar,
  UserCheck,
  Printer,
  X,
  Eye
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  type PortalAgreementPage,
  type PortalAgreementsSignedData,
  type SignedAgreementPageRecord,
  resolvePortalAgreements
} from '../../lib/portalAgreements';

interface PortalAgreementGateProps {
  customerId: string;
  customer: any;
  userEmail?: string;
  userName?: string;
  onSignOut?: () => void;
  isAdminUser?: boolean;
  onAdminBypass?: () => void;
}

interface PageSignatureState {
  signedAt: string;
  signerName: string;
  signerTitle: string;
  signatureType: 'type' | 'draw';
  signatureText: string;
  signatureDataUrl: string;
}

export function PortalAgreementGate({
  customerId,
  customer,
  userEmail,
  userName,
  onSignOut,
  isAdminUser = false,
  onAdminBypass
}: PortalAgreementGateProps) {
  const companyName = customer?.company || customer?.name || customer?.contactName || 'Client';
  const defaultSignerName = customer?.contactName || userName || '';
  const defaultEmail = customer?.email || userEmail || '';

  const enabledPages = useMemo(() => {
    const all = resolvePortalAgreements(customer?.portalAgreementPages, companyName);
    const active = all.filter(p => p.enabled !== false);
    return active.length > 0 ? active : all;
  }, [customer?.portalAgreementPages, companyName]);

  const [currentStep, setCurrentStep] = useState(0);

  const [signerName, setSignerName] = useState(defaultSignerName);
  const [signerTitle, setSignerTitle] = useState('Authorized Representative');
  const [signerEmail, setSignerEmail] = useState(defaultEmail);

  // Track signed state for each individual document page: page.id -> PageSignatureState
  const [signedPagesMap, setSignedPagesMap] = useState<Record<string, PageSignatureState>>({});
  const [pageCheckboxChecked, setPageCheckboxChecked] = useState(false);

  // Signature input state for current document
  const [signatureMode, setSignatureMode] = useState<'type' | 'draw'>('draw');
  const [typedSignature, setTypedSignature] = useState(defaultSignerName);
  const [handwritingFont, setHandwritingFont] = useState<string>("'Great Vibes', cursive");
  const [hasDrawnStroke, setHasDrawnStroke] = useState(false);
  const [savedDrawnDataUrl, setSavedDrawnDataUrl] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const docScrollRef = useRef<HTMLDivElement | null>(null);

  // Sync defaults if customer data arrives after initial mount
  useEffect(() => {
    if (!signerName && (customer?.contactName || userName)) {
      const name = customer?.contactName || userName || '';
      setSignerName(name);
      if (!typedSignature) setTypedSignature(name);
    }
    if (!signerEmail && (customer?.email || userEmail)) {
      setSignerEmail(customer?.email || userEmail || '');
    }
  }, [customer?.contactName, customer?.email, userName, userEmail]);

  // When switching between document pages, scroll to top and restore checkbox / signature state
  useEffect(() => {
    if (docScrollRef.current) {
      docScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    const currentPage = enabledPages[currentStep];
    if (currentPage) {
      const existingSig = signedPagesMap[currentPage.id];
      setPageCheckboxChecked(Boolean(existingSig));
    }
  }, [currentStep, enabledPages]);

  // Initialize and restore canvas strokes when in draw mode
  useEffect(() => {
    if (signatureMode === 'draw' && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#111827';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const activePage = enabledPages[currentStep];
        const pageSigUrl = (activePage && signedPagesMap[activePage.id]?.signatureType === 'draw' && signedPagesMap[activePage.id]?.signatureDataUrl)
          || savedDrawnDataUrl;

        if (pageSigUrl) {
          const img = new Image();
          img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            setHasDrawnStroke(true);
          };
          img.src = pageSigUrl;
        } else {
          setHasDrawnStroke(false);
        }
      }
    }
  }, [currentStep, signatureMode, enabledPages]);

  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY
      };
    } else {
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }
  };

  const handleStartDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    isDrawingRef.current = true;
    const { x, y } = getCanvasPoint(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handleMoveDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasPoint(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawnStroke(true);
  };

  const handleEndDraw = () => {
    if (isDrawingRef.current && canvasRef.current) {
      setSavedDrawnDataUrl(canvasRef.current.toDataURL('image/png'));
    }
    isDrawingRef.current = false;
  };

  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawnStroke(false);
    setSavedDrawnDataUrl('');
  };

  const renderTypedSignatureDataUrl = (text: string, fontFamily = handwritingFont): string => {
    const offscreen = document.createElement('canvas');
    offscreen.width = 640;
    offscreen.height = 160;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return '';
    ctx.clearRect(0, 0, offscreen.width, offscreen.height);
    ctx.fillStyle = '#0f172a';
    ctx.font = `54px ${fontFamily}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(text.trim(), 28, 82);
    return offscreen.toDataURL('image/png');
  };

  const deriveInitials = (name: string) => {
    if (!name.trim()) return 'SIGNED';
    return name
      .trim()
      .split(/\s+/)
      .map(part => part[0]?.toUpperCase() || '')
      .join('')
      .slice(0, 4);
  };

  const activePage: PortalAgreementPage | undefined = enabledPages[currentStep];
  const signedCount = enabledPages.filter(p => Boolean(signedPagesMap[p.id])).length;
  const progressPercent = Math.round((signedCount / enabledPages.length) * 100);

  // Strip redundant "Document X of Y • " prefix from subtitle if present
  const formatCleanSubtitle = (subtitle: string) => {
    return subtitle.replace(/^Document\s+\d+\s+of\s+\d+\s*•\s*/i, '').trim();
  };

  const handleSignCurrentDocument = async () => {
    if (!activePage) return;

    if (!signerName.trim()) {
      alert('Please enter your Full Legal Name before signing.');
      return;
    }
    if (signatureMode === 'type' && !(typedSignature.trim() || signerName.trim())) {
      alert('Please type your signature in the signature box.');
      return;
    }
    if (signatureMode === 'draw' && !hasDrawnStroke) {
      alert('Please draw your signature with your mouse/finger, or switch to "Type Name (Writing Font)".');
      return;
    }
    if (!pageCheckboxChecked) {
      alert(`Please check the box confirming you agree to and sign "${activePage.title}".`);
      return;
    }

    let currentSigDataUrl = '';
    if (signatureMode === 'draw' && canvasRef.current) {
      currentSigDataUrl = canvasRef.current.toDataURL('image/png');
      setSavedDrawnDataUrl(currentSigDataUrl);
    } else {
      currentSigDataUrl = renderTypedSignatureDataUrl(typedSignature.trim() || signerName.trim());
    }

    const nowIso = new Date().toISOString();
    const pageSig: PageSignatureState = {
      signedAt: nowIso,
      signerName: signerName.trim(),
      signerTitle: signerTitle.trim() || 'Authorized Representative',
      signatureType: signatureMode,
      signatureText: signatureMode === 'type' ? (typedSignature.trim() || signerName.trim()) : signerName.trim(),
      signatureDataUrl: currentSigDataUrl
    };

    const nextSignedMap: Record<string, PageSignatureState> = {
      ...signedPagesMap,
      [activePage.id]: pageSig
    };
    setSignedPagesMap(nextSignedMap);

    // Check if there are any unsigned documents remaining
    const nextUnsignedIndex = enabledPages.findIndex((p, idx) => idx > currentStep && !nextSignedMap[p.id]);
    const anyUnsignedIndex = enabledPages.findIndex(p => !nextSignedMap[p.id]);

    if (nextUnsignedIndex !== -1) {
      setCurrentStep(nextUnsignedIndex);
      return;
    }
    if (anyUnsignedIndex !== -1) {
      setCurrentStep(anyUnsignedIndex);
      return;
    }

    // All documents are now signed! Save to Firestore and unlock the portal.
    setIsSubmitting(true);
    try {
      const computedInitials = deriveInitials(signerName);
      const signedPages: SignedAgreementPageRecord[] = enabledPages.map(page => {
        const sig = nextSignedMap[page.id] || pageSig;
        return {
          id: page.id,
          title: page.title,
          subtitle: page.subtitle,
          contentSnapshot: page.content,
          initials: computedInitials,
          initialedAt: sig.signedAt
        };
      });

      const signedPayload: PortalAgreementsSignedData = {
        signedAt: nowIso,
        signerName: signerName.trim(),
        signerTitle: signerTitle.trim() || 'Authorized Representative',
        signerEmail: signerEmail.trim(),
        companyName,
        initials: computedInitials,
        signatureType: signatureMode,
        signatureText: pageSig.signatureText,
        signatureDataUrl: currentSigDataUrl,
        signedPages,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
      };

      await updateDoc(doc(db, 'customers', customerId), {
        portalAgreementsSigned: true,
        portalAgreementsData: signedPayload
      });
    } catch (err) {
      console.error('Failed to save signed portal agreements:', err);
      alert('Failed to save your signature. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 flex flex-col font-sans selection:bg-black selection:text-white">
      {/* Subtle Admin Notice Bar if an Admin is viewing the customer's portal */}
      {isAdminUser && (
        <div className="bg-amber-100 border-b border-amber-200 text-amber-950 px-6 py-2 text-xs font-bold flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Eye size={14} className="text-amber-700" />
            <span>
              Admin View: Client Portal Gate is active for <strong>{companyName}</strong>. The customer must sign all {enabledPages.length} documents below before seeing their portal.
            </span>
          </div>
          {onAdminBypass && (
            <button
              type="button"
              onClick={onAdminBypass}
              className="bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider transition-colors cursor-pointer shrink-0"
            >
              Skip Gate (Admin Only)
            </button>
          )}
        </div>
      )}

      {/* Top Header */}
      <header className="bg-white border-b border-neutral-200 px-6 lg:px-10 py-4 sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-3">
              {customer?.logo ? (
                <img
                  src={customer.logo}
                  alt={companyName}
                  className="h-10 object-contain max-w-[160px]"
                />
              ) : (
                <span className="font-sans text-xl font-black tracking-tighter uppercase text-neutral-900">
                  INKTHEORY
                </span>
              )}
              <div className="h-6 w-px bg-neutral-200 hidden sm:block" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider">
                    <Lock size={10} /> Signature Required
                  </span>
                  <span className="text-xs font-bold text-neutral-800 hidden sm:inline">
                    {companyName} — Portal Agreements
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 font-medium mt-0.5">
                  Please review and sign each of the {enabledPages.length} documents below to unlock your Client Portal.
                </p>
              </div>
            </div>

            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="md:hidden text-xs font-bold text-neutral-500 hover:text-neutral-900 flex items-center gap-1"
              >
                <LogOut size={14} /> Log Out
              </button>
            )}
          </div>

          {/* Right: Progress & Sign Out */}
          <div className="flex items-center gap-5 w-full md:w-auto justify-between md:justify-end">
            <div className="flex flex-col items-end flex-1 md:flex-initial">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
                <span>
                  Document {currentStep + 1} of {enabledPages.length}
                </span>
                <span className="text-emerald-600">
                  ({signedCount}/{enabledPages.length} Signed)
                </span>
              </div>
              <div className="w-full md:w-48 h-2 bg-neutral-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 transition-all duration-300 rounded-full"
                  style={{ width: `${Math.max(10, progressPercent)}%` }}
                />
              </div>
            </div>

            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="hidden md:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-neutral-200 text-xs font-bold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                <LogOut size={14} />
                Log Out
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-10 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Sidebar: Document Packet Stepper */}
        <aside className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-xs">
            <h2 className="text-xs font-extrabold uppercase tracking-widest text-neutral-400 mb-3">
              Documents to Sign ({signedCount}/{enabledPages.length})
            </h2>
            <div className="space-y-2">
              {enabledPages.map((page, idx) => {
                const isSigned = Boolean(signedPagesMap[page.id]);
                const isCurrent = currentStep === idx;
                return (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => setCurrentStep(idx)}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 cursor-pointer ${
                      isCurrent
                        ? 'bg-amber-50/90 border-amber-400 text-neutral-900 shadow-xs ring-1 ring-amber-300'
                        : isSigned
                        ? 'bg-emerald-50/60 border-emerald-200 text-neutral-900 hover:bg-emerald-50'
                        : 'bg-neutral-50/70 border-neutral-200/80 text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0 mt-0.5 ${
                        isSigned
                          ? 'bg-emerald-500 text-white'
                          : isCurrent
                          ? 'bg-amber-500 text-white'
                          : 'bg-neutral-200 text-neutral-600'
                      }`}
                    >
                      {isSigned ? <Check size={13} strokeWidth={3} /> : idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold truncate text-neutral-900">
                        {page.title}
                      </p>
                      <p
                        className={`text-[10px] mt-0.5 truncate ${
                          isSigned
                            ? 'text-emerald-700 font-bold'
                            : isCurrent
                            ? 'text-amber-800 font-semibold'
                            : 'text-neutral-500'
                        }`}
                      >
                        {isSigned
                          ? `Signed by ${signedPagesMap[page.id].signerName}`
                          : `Document ${idx + 1} of ${enabledPages.length} • Signature Required`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Security / E-Sign Info Box */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-xs flex items-start gap-3">
            <ShieldCheck size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-[11px] text-neutral-600 leading-relaxed">
              <p className="font-bold text-neutral-900 mb-0.5">Verified Electronic Signature</p>
              Each document must be signed below. Once all {enabledPages.length} documents are signed, your Client Portal will unlock immediately.
            </div>
          </div>
        </aside>

        {/* Right Main Column: Document Sheet + Direct Signature Block */}
        <section className="lg:col-span-8 flex flex-col">
          {activePage && (
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-md overflow-hidden flex flex-col">
              {/* Light, Clean Document Header (No Black Background) */}
              <div className="bg-neutral-50 border-b border-neutral-200 px-6 sm:px-8 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-700 block mb-1">
                    Document {currentStep + 1} of {enabledPages.length} • {formatCleanSubtitle(activePage.subtitle)}
                  </span>
                  <h1 className="font-serif text-xl sm:text-2xl tracking-tight text-neutral-900">
                    {activePage.title}
                  </h1>
                </div>
                <div className="text-left sm:text-right text-[11px] text-neutral-500 shrink-0 space-y-0.5">
                  <div className="flex items-center sm:justify-end gap-1.5">
                    <Building2 size={12} className="text-neutral-400" />
                    <span className="font-bold text-neutral-800">{companyName}</span>
                  </div>
                  <div className="flex items-center sm:justify-end gap-1.5">
                    <Calendar size={12} className="text-neutral-400" />
                    <span>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                </div>
              </div>

              {/* Paper Document Body */}
              <div
                ref={docScrollRef}
                className="p-6 sm:p-10 bg-white max-h-[42vh] overflow-y-auto border-b border-neutral-200"
              >
                <div className="max-w-2xl mx-auto font-sans text-xs sm:text-[13px] text-neutral-800 leading-relaxed whitespace-pre-wrap">
                  {activePage.content}
                </div>
              </div>

              {/* Direct Document Signature Block */}
              <div className="p-6 sm:p-8 bg-neutral-50/70 space-y-5">
                <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="bg-amber-400 text-neutral-950 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md flex items-center gap-1">
                      <PenTool size={11} /> Sign Document {currentStep + 1} of {enabledPages.length}
                    </div>
                    {signedPagesMap[activePage.id] && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md">
                        <CheckCircle2 size={12} /> Signed
                      </span>
                    )}
                  </div>

                  {/* Switch between Draw & Type Signature */}
                  <div className="inline-flex bg-white p-1 rounded-xl border border-neutral-200 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setSignatureMode('draw')}
                      className={`px-3 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                        signatureMode === 'draw'
                          ? 'bg-neutral-900 text-white'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      <PenTool size={12} />
                      Draw Signature
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignatureMode('type')}
                      className={`px-3 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                        signatureMode === 'type'
                          ? 'bg-neutral-900 text-white'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      <Type size={12} />
                      Type Signature
                    </button>
                  </div>
                </div>

                {/* Signer Name & Title Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-500 block mb-1">
                      Full Legal Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={signerName}
                      onChange={e => {
                        setSignerName(e.target.value);
                        if (!typedSignature || typedSignature === signerName) {
                          setTypedSignature(e.target.value);
                        }
                      }}
                      placeholder="Jane Doe"
                      className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 py-2 text-xs font-bold text-neutral-900 focus:border-neutral-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-500 block mb-1">
                      Title / Role *
                    </label>
                    <input
                      type="text"
                      required
                      value={signerTitle}
                      onChange={e => setSignerTitle(e.target.value)}
                      placeholder="Authorized Representative"
                      className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 py-2 text-xs font-bold text-neutral-900 focus:border-neutral-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-500 block mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={signerEmail}
                      onChange={e => setSignerEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 py-2 text-xs font-bold text-neutral-900 focus:border-neutral-900 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Unified Signature Box (Draw with Mouse OR Type Name in Writing Font) */}
                <div className="bg-amber-50/50 border-2 border-amber-300 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {/* Prominent Mode Tabs right inside the yellow signature box */}
                    <div className="inline-flex bg-white p-1 rounded-xl border border-amber-300 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => setSignatureMode('draw')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                          signatureMode === 'draw'
                            ? 'bg-neutral-900 text-white shadow-2xs'
                            : 'text-neutral-600 hover:text-neutral-900'
                        }`}
                      >
                        <PenTool size={13} />
                        Draw with Mouse
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSignatureMode('type');
                          if (!typedSignature && signerName) {
                            setTypedSignature(signerName);
                          }
                        }}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                          signatureMode === 'type'
                            ? 'bg-neutral-900 text-white shadow-2xs'
                            : 'text-neutral-600 hover:text-neutral-900'
                        }`}
                      >
                        <Type size={13} />
                        Type Name (Writing Font)
                      </button>
                    </div>

                    {signatureMode === 'draw' ? (
                      <div className="flex items-center gap-3">
                        {signerName.trim() && (
                          <button
                            type="button"
                            onClick={() => {
                              setSignatureMode('type');
                              if (!typedSignature) setTypedSignature(signerName);
                            }}
                            className="text-[11px] font-bold text-amber-800 hover:text-amber-950 underline cursor-pointer"
                          >
                            Or auto-sign as "{signerName.trim()}" in writing font
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleClearCanvas}
                          className="text-[11px] font-bold text-neutral-600 hover:text-red-600 flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw size={12} /> Clear Signature
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900 mr-1">
                          Writing Style:
                        </span>
                        {[
                          { label: 'Classic Script', font: "'Great Vibes', cursive" },
                          { label: 'Flowing Cursive', font: "'Dancing Script', cursive" },
                          { label: 'Signature Pen', font: "'Alex Brush', cursive" }
                        ].map(option => (
                          <button
                            key={option.label}
                            type="button"
                            onClick={() => setHandwritingFont(option.font)}
                            className={`px-2.5 py-1 rounded-lg text-xs border transition-all cursor-pointer ${
                              handwritingFont === option.font
                                ? 'bg-amber-400/30 border-amber-500 text-neutral-950 font-bold'
                                : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300'
                            }`}
                            style={{ fontFamily: option.font, fontSize: '15px' }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {signatureMode === 'draw' ? (
                    <>
                      <p className="text-[11px] font-bold text-amber-950">
                        Sign with your mouse or finger on the signature line below:
                      </p>
                      <div className="relative bg-white border border-neutral-300 rounded-xl overflow-hidden shadow-inner">
                        <canvas
                          ref={canvasRef}
                          width={640}
                          height={140}
                          onMouseDown={handleStartDraw}
                          onMouseMove={handleMoveDraw}
                          onMouseUp={handleEndDraw}
                          onMouseLeave={handleEndDraw}
                          onTouchStart={handleStartDraw}
                          onTouchMove={handleMoveDraw}
                          onTouchEnd={handleEndDraw}
                          className="w-full h-32 cursor-crosshair touch-none"
                        />
                        <div className="absolute bottom-5 left-6 right-6 border-b border-neutral-300 pointer-events-none flex items-center justify-between">
                          <span className="text-xs font-bold text-amber-600 pb-1">SIGN HERE ✕</span>
                          <span className="text-[9px] font-mono text-neutral-400 pb-1 uppercase">
                            {companyName} • Document {currentStep + 1} of {enabledPages.length}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="text-[11px] font-bold text-amber-950 block mb-1.5">
                          Type your name below and it will sign on the line in a handwriting font:
                        </label>
                        <input
                          type="text"
                          value={typedSignature}
                          onChange={e => {
                            setTypedSignature(e.target.value);
                            if (!signerName) setSignerName(e.target.value);
                          }}
                          placeholder="Type your full name to sign..."
                          className="w-full bg-white border border-neutral-300 rounded-xl px-4 py-2.5 text-xs font-bold text-neutral-900 focus:border-neutral-900 focus:outline-none"
                        />
                      </div>

                      <div className="relative bg-white border border-neutral-300 rounded-xl h-32 px-6 flex items-center overflow-hidden shadow-inner">
                        <div
                          className="text-neutral-900 truncate pb-3 select-none pl-24 sm:pl-28"
                          style={{
                            fontFamily: handwritingFont,
                            fontSize: '46px',
                            lineHeight: 1.15
                          }}
                        >
                          {typedSignature || signerName || 'Your Signature'}
                        </div>
                        <div className="absolute bottom-5 left-6 right-6 border-b border-neutral-300 pointer-events-none flex items-center justify-between">
                          <span className="text-xs font-bold text-amber-600 pb-1">SIGN HERE ✕</span>
                          <span className="text-[9px] font-mono text-neutral-400 pb-1 uppercase">
                            {companyName} • Document {currentStep + 1} of {enabledPages.length}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Agreement Confirmation Checkbox */}
                <label className="flex items-start gap-3 cursor-pointer select-none bg-white p-3.5 rounded-xl border border-neutral-200">
                  <input
                    type="checkbox"
                    checked={pageCheckboxChecked}
                    onChange={e => setPageCheckboxChecked(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-emerald-600 rounded cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-neutral-800 leading-snug">
                    I have read, understand, and agree to the terms of{' '}
                    <strong className="text-neutral-950 underline">{activePage.title}</strong> (Document {currentStep + 1} of {enabledPages.length}), and I execute this document with my legally binding electronic signature on behalf of <strong>{companyName}</strong>.
                  </span>
                </label>

                {/* Bottom Navigation & Sign Button */}
                <div className="flex items-center justify-between pt-2 border-t border-neutral-200">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
                    disabled={currentStep === 0 || isSubmitting}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-neutral-300 bg-white text-xs font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    <ChevronLeft size={15} />
                    Previous Document
                  </button>

                  <button
                    type="button"
                    onClick={handleSignCurrentDocument}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold uppercase tracking-wider shadow-md transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <PenTool size={14} />
                    {isSubmitting
                      ? 'Saving Signed Documents...'
                      : currentStep < enabledPages.length - 1
                      ? `Sign Document ${currentStep + 1} & Continue`
                      : `Sign Final Document & Unlock Portal`}
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

interface SignedAgreementsViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyName: string;
  signedData?: PortalAgreementsSignedData | null;
  fallbackPages?: PortalAgreementPage[] | null;
}

export function SignedAgreementsViewerModal({
  isOpen,
  onClose,
  companyName,
  signedData,
  fallbackPages
}: SignedAgreementsViewerModalProps) {
  if (!isOpen) return null;

  const pagesToDisplay = signedData?.signedPages?.length
    ? signedData.signedPages
    : resolvePortalAgreements(fallbackPages, companyName)
        .filter(p => p.enabled !== false)
        .map(p => ({
          id: p.id,
          title: p.title,
          subtitle: p.subtitle,
          contentSnapshot: p.content,
          initials: signedData?.initials || '—',
          initialedAt: signedData?.signedAt || ''
        }));

  return (
    <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-neutral-200 max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Clean Light Modal Header (No Black Background) */}
        <div className="px-6 py-4 bg-neutral-50 border-b border-neutral-200 text-neutral-900 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <ShieldCheck size={22} className="text-emerald-600" />
            <div>
              <h3 className="font-serif text-lg text-neutral-900">
                {signedData ? 'Executed Portal Agreements & NDA Packet' : 'Portal Agreement Packet Preview'}
              </h3>
              <p className="text-[11px] text-neutral-500">
                {companyName} •{' '}
                {signedData?.signedAt
                  ? `Signed on ${new Date(signedData.signedAt).toLocaleString()}`
                  : `${pagesToDisplay.length} Active Documents`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-lg bg-white border border-neutral-200 hover:bg-neutral-100 text-neutral-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer size={14} /> Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white border border-neutral-200 hover:bg-neutral-100 text-neutral-600 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6 bg-neutral-50/50 flex-1">
          {/* Signature Certificate Summary */}
          {signedData && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <UserCheck size={16} className="text-emerald-700" />
                  <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-900">
                    Electronic Signature Certificate
                  </span>
                </div>
                <p className="text-xs text-emerald-900">
                  <strong>Signed By:</strong> {signedData.signerName} ({signedData.signerTitle})
                </p>
                {signedData.signerEmail && (
                  <p className="text-xs text-emerald-800">
                    <strong>Email:</strong> {signedData.signerEmail}
                  </p>
                )}
                <p className="text-xs text-emerald-800">
                  <strong>Executed At:</strong> {new Date(signedData.signedAt).toLocaleString()}
                </p>
              </div>

              <div className="bg-white border border-emerald-300 rounded-xl px-5 py-3 flex flex-col items-center justify-center min-w-[220px]">
                {signedData.signatureDataUrl ? (
                  <img
                    src={signedData.signatureDataUrl}
                    alt="Client Signature"
                    className="h-12 object-contain"
                  />
                ) : (
                  <span
                    className="text-3xl text-neutral-900"
                    style={{ fontFamily: "'Great Vibes', 'Dancing Script', cursive" }}
                  >
                    {signedData.signatureText || signedData.signerName}
                  </span>
                )}
                <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-400 border-t border-neutral-200 pt-1 mt-1 w-full text-center">
                  Verified E-Signature
                </span>
              </div>
            </div>
          )}

          {/* Individual Pages */}
          {pagesToDisplay.map((page, index) => (
            <div
              key={page.id || index}
              className="bg-white rounded-2xl border border-neutral-200 shadow-2xs overflow-hidden"
            >
              <div className="px-6 py-3.5 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                    Document {index + 1} of {pagesToDisplay.length}
                  </span>
                  <h4 className="text-sm font-bold text-neutral-900">{page.title}</h4>
                </div>
                {signedData && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
                    <CheckCircle2 size={13} className="text-emerald-600" />
                    <span className="text-[10px] font-extrabold uppercase text-emerald-900">
                      Signed by {signedData.signerName}
                    </span>
                  </div>
                )}
              </div>
              <div className="p-6 text-xs text-neutral-800 leading-relaxed whitespace-pre-wrap font-sans">
                {page.contentSnapshot}
              </div>
              {signedData && (
                <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-[11px] text-neutral-600">
                    <strong>Signed By:</strong> {signedData.signerName} ({signedData.signerTitle}) •{' '}
                    <span>{new Date(page.initialedAt || signedData.signedAt).toLocaleString()}</span>
                  </div>
                  {signedData.signatureDataUrl && (
                    <img
                      src={signedData.signatureDataUrl}
                      alt="Signature"
                      className="h-9 object-contain bg-white border border-neutral-200 rounded px-3 py-1"
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white border-t border-neutral-200 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-bold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
