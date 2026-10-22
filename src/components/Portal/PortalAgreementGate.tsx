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
  isPreviewMode?: boolean;
  onExitPreview?: () => void;
}

export function PortalAgreementGate({
  customerId,
  customer,
  userEmail,
  userName,
  onSignOut,
  isPreviewMode = false,
  onExitPreview
}: PortalAgreementGateProps) {
  const companyName = customer?.company || customer?.name || customer?.contactName || 'Client';
  const defaultSignerName = customer?.contactName || userName || '';
  const defaultEmail = customer?.email || userEmail || '';

  const enabledPages = useMemo(() => {
    const all = resolvePortalAgreements(customer?.portalAgreementPages, companyName);
    const active = all.filter(p => p.enabled !== false);
    return active.length > 0 ? active : all;
  }, [customer?.portalAgreementPages, companyName]);

  // Step 0..(enabledPages.length - 1) are the document pages; step === enabledPages.length is the Final Signature step
  const [currentStep, setCurrentStep] = useState(0);

  // Derive default initials from signer name
  const deriveInitials = (name: string) => {
    if (!name.trim()) return '';
    return name
      .trim()
      .split(/\s+/)
      .map(part => part[0]?.toUpperCase() || '')
      .join('')
      .slice(0, 4);
  };

  const [signerName, setSignerName] = useState(defaultSignerName);
  const [signerTitle, setSignerTitle] = useState('Authorized Representative');
  const [signerEmail, setSignerEmail] = useState(defaultEmail);
  const [initials, setInitials] = useState(() => deriveInitials(defaultSignerName));

  // Track which pages have been initialed & accepted: map of page.id -> { initials, initialedAt }
  const [acceptedPages, setAcceptedPages] = useState<Record<string, { initials: string; initialedAt: string }>>({});
  const [pageCheckboxChecked, setPageCheckboxChecked] = useState(false);

  // Final signature states
  const [signatureMode, setSignatureMode] = useState<'type' | 'draw'>('type');
  const [typedSignature, setTypedSignature] = useState(defaultSignerName);
  const [consentChecked, setConsentChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasDrawnStroke, setHasDrawnStroke] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const docScrollRef = useRef<HTMLDivElement | null>(null);

  // Keep defaults synced if customer loads slightly after mount
  useEffect(() => {
    if (!signerName && (customer?.contactName || userName)) {
      const name = customer?.contactName || userName || '';
      setSignerName(name);
      setTypedSignature(name);
      if (!initials) setInitials(deriveInitials(name));
    }
    if (!signerEmail && (customer?.email || userEmail)) {
      setSignerEmail(customer?.email || userEmail || '');
    }
  }, [customer?.contactName, customer?.email, userName, userEmail]);

  // Scroll document viewer to top when changing pages
  useEffect(() => {
    if (docScrollRef.current) {
      docScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    const currentPage = enabledPages[currentStep];
    if (currentPage) {
      setPageCheckboxChecked(Boolean(acceptedPages[currentPage.id]));
    }
  }, [currentStep, enabledPages]);

  // Setup drawing canvas when on final step and mode === 'draw'
  useEffect(() => {
    if (currentStep === enabledPages.length && signatureMode === 'draw' && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, [currentStep, enabledPages.length, signatureMode]);

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
    isDrawingRef.current = false;
  };

  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawnStroke(false);
  };

  const handleAcceptCurrentPage = () => {
    const page = enabledPages[currentStep];
    if (!page) return;
    const cleanInitials = initials.trim().toUpperCase();
    if (!cleanInitials) {
      alert('Please enter your initials to initial this page.');
      return;
    }
    if (!pageCheckboxChecked) {
      alert(`Please check the box confirming you have read and agree to ${page.title}.`);
      return;
    }

    setAcceptedPages(prev => ({
      ...prev,
      [page.id]: {
        initials: cleanInitials,
        initialedAt: prev[page.id]?.initialedAt || new Date().toISOString()
      }
    }));

    setCurrentStep(prev => Math.min(enabledPages.length, prev + 1));
  };

  // Renders a typed signature onto an offscreen canvas so we save a clean PNG data URL
  const renderTypedSignatureDataUrl = (text: string): string => {
    const offscreen = document.createElement('canvas');
    offscreen.width = 600;
    offscreen.height = 160;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return '';
    ctx.clearRect(0, 0, offscreen.width, offscreen.height);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'italic 48px "Georgia", "Times New Roman", serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.trim(), 28, 85);
    return offscreen.toDataURL('image/png');
  };

  const allPagesAccepted = enabledPages.every(p => Boolean(acceptedPages[p.id]));
  const totalSteps = enabledPages.length + 1;
  const completedCount = Object.keys(acceptedPages).filter(id => enabledPages.some(p => p.id === id)).length;
  const progressPercent = Math.round((completedCount / totalSteps) * 100);

  const handleFinishAndSign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allPagesAccepted) {
      alert('Please initial and accept all agreement pages before completing your signature.');
      return;
    }
    if (!signerName.trim()) {
      alert('Please enter your full legal name.');
      return;
    }
    if (signatureMode === 'type' && !typedSignature.trim()) {
      alert('Please type your signature.');
      return;
    }
    if (signatureMode === 'draw' && !hasDrawnStroke) {
      alert('Please draw your signature in the signature pad.');
      return;
    }
    if (!consentChecked) {
      alert('Please check the electronic signature consent box to finish.');
      return;
    }

    setIsSubmitting(true);
    try {
      let signatureDataUrl = '';
      if (signatureMode === 'draw' && canvasRef.current) {
        signatureDataUrl = canvasRef.current.toDataURL('image/png');
      } else {
        signatureDataUrl = renderTypedSignatureDataUrl(typedSignature.trim() || signerName.trim());
      }

      const signedAt = new Date().toISOString();
      const signedPages: SignedAgreementPageRecord[] = enabledPages.map(page => ({
        id: page.id,
        title: page.title,
        subtitle: page.subtitle,
        contentSnapshot: page.content,
        initials: acceptedPages[page.id]?.initials || initials.trim().toUpperCase(),
        initialedAt: acceptedPages[page.id]?.initialedAt || signedAt
      }));

      const signedPayload: PortalAgreementsSignedData = {
        signedAt,
        signerName: signerName.trim(),
        signerTitle: signerTitle.trim() || 'Authorized Representative',
        signerEmail: signerEmail.trim(),
        companyName,
        initials: initials.trim().toUpperCase(),
        signatureType: signatureMode,
        signatureText: signatureMode === 'type' ? (typedSignature.trim() || signerName.trim()) : signerName.trim(),
        signatureDataUrl,
        signedPages,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
      };

      await updateDoc(doc(db, 'customers', customerId), {
        portalAgreementsSigned: true,
        portalAgreementsData: signedPayload
      });

      if (isPreviewMode && onExitPreview) {
        onExitPreview();
      }
    } catch (err) {
      console.error('Failed to save signed portal agreements:', err);
      alert('Failed to save your signature. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFinalStep = currentStep === enabledPages.length;
  const activePage: PortalAgreementPage | undefined = enabledPages[currentStep];

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 flex flex-col font-sans selection:bg-black selection:text-white">
      {/* Preview Mode Banner for Admin */}
      {isPreviewMode && (
        <div className="bg-indigo-600 text-white px-6 py-2.5 text-xs font-bold flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 uppercase tracking-wider">
            <Eye size={15} />
            <span>Admin Preview Mode: Viewing the DocuSign Portal Agreement Gate for {companyName}</span>
          </div>
          {onExitPreview && (
            <button
              type="button"
              onClick={onExitPreview}
              className="bg-white text-indigo-700 hover:bg-indigo-50 px-3.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Exit Preview
            </button>
          )}
        </div>
      )}

      {/* Top DocuSign-style Header */}
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
                    {companyName} — Portal Onboarding Packet
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 font-medium mt-0.5">
                  Please review and initial all {enabledPages.length} agreement pages to unlock your Client Portal.
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
                  {isFinalStep
                    ? `Step ${totalSteps} of ${totalSteps}: Final Signature`
                    : `Document ${currentStep + 1} of ${enabledPages.length}`}
                </span>
                <span className="text-emerald-600">({completedCount}/{enabledPages.length} Initialed)</span>
              </div>
              <div className="w-full md:w-48 h-2 bg-neutral-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-neutral-900 transition-all duration-300 rounded-full"
                  style={{ width: `${isFinalStep && allPagesAccepted ? 92 : Math.max(8, progressPercent)}%` }}
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
              Required Documents ({enabledPages.length})
            </h2>
            <div className="space-y-2">
              {enabledPages.map((page, idx) => {
                const isAccepted = Boolean(acceptedPages[page.id]);
                const isCurrent = currentStep === idx;
                return (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => setCurrentStep(idx)}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 cursor-pointer ${
                      isCurrent
                        ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
                        : isAccepted
                        ? 'bg-emerald-50/60 border-emerald-200 text-neutral-900 hover:bg-emerald-50'
                        : 'bg-neutral-50/70 border-neutral-200/80 text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0 mt-0.5 ${
                        isAccepted
                          ? 'bg-emerald-500 text-white'
                          : isCurrent
                          ? 'bg-amber-400 text-neutral-950'
                          : 'bg-neutral-200 text-neutral-600'
                      }`}
                    >
                      {isAccepted ? <Check size={13} strokeWidth={3} /> : idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-bold truncate ${isCurrent ? 'text-white' : 'text-neutral-900'}`}>
                        {page.title}
                      </p>
                      <p
                        className={`text-[10px] mt-0.5 truncate ${
                          isCurrent ? 'text-neutral-300' : isAccepted ? 'text-emerald-700 font-semibold' : 'text-neutral-500'
                        }`}
                      >
                        {isAccepted
                          ? `Initialed (${acceptedPages[page.id].initials})`
                          : `Page ${idx + 1} of ${enabledPages.length} • Action Required`}
                      </p>
                    </div>
                  </button>
                );
              })}

              {/* Final Signature Step Pill */}
              <button
                type="button"
                onClick={() => {
                  if (allPagesAccepted) {
                    setCurrentStep(enabledPages.length);
                  } else {
                    alert('Please initial all document pages first before proceeding to final signature.');
                  }
                }}
                className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 ${
                  isFinalStep
                    ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm cursor-pointer'
                    : allPagesAccepted
                    ? 'bg-amber-50 border-amber-300 text-neutral-900 hover:bg-amber-100 cursor-pointer'
                    : 'bg-neutral-100 border-neutral-200 text-neutral-400 cursor-not-allowed opacity-75'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0 mt-0.5 ${
                    isFinalStep
                      ? 'bg-amber-400 text-neutral-950'
                      : allPagesAccepted
                      ? 'bg-amber-500 text-white'
                      : 'bg-neutral-200 text-neutral-500'
                  }`}
                >
                  <PenTool size={12} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-bold ${isFinalStep ? 'text-white' : 'text-neutral-900'}`}>
                    Execute & Sign Packet
                  </p>
                  <p className={`text-[10px] mt-0.5 ${isFinalStep ? 'text-neutral-300' : 'text-neutral-500'}`}>
                    {allPagesAccepted ? 'Ready for final signature' : 'Complete all pages above first'}
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Security / E-Sign Info Box */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-xs flex items-start gap-3">
            <ShieldCheck size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-[11px] text-neutral-600 leading-relaxed">
              <p className="font-bold text-neutral-900 mb-0.5">Verified Electronic Record</p>
              Once signed, a timestamped copy of all {enabledPages.length} agreements is permanently linked to{' '}
              <span className="font-semibold text-neutral-800">{companyName}</span> and your portal will unlock immediately.
            </div>
          </div>
        </aside>

        {/* Right Main Column: Document Sheet OR Final Signature Pad */}
        <section className="lg:col-span-8 flex flex-col">
          {!isFinalStep && activePage ? (
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-md overflow-hidden flex flex-col">
              {/* Document Top Metadata Bar */}
              <div className="bg-neutral-900 text-white px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400 block mb-1">
                    Page {currentStep + 1} of {enabledPages.length} • {activePage.subtitle}
                  </span>
                  <h1 className="font-serif text-xl sm:text-2xl tracking-tight text-white">
                    {activePage.title}
                  </h1>
                </div>
                <div className="text-left sm:text-right text-[11px] text-neutral-300 shrink-0 space-y-0.5">
                  <div className="flex items-center sm:justify-end gap-1.5">
                    <Building2 size={12} className="text-neutral-400" />
                    <span className="font-bold text-white">{companyName}</span>
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
                className="p-6 sm:p-10 bg-white max-h-[52vh] overflow-y-auto border-b border-neutral-200"
              >
                <div className="max-w-2xl mx-auto font-sans text-xs sm:text-[13px] text-neutral-800 leading-relaxed whitespace-pre-wrap">
                  {activePage.content}
                </div>
              </div>

              {/* DocuSign-Style Bottom Initial & Acceptance Bar */}
              <div className="p-6 bg-amber-50/70 border-t border-amber-200/80 flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Left: Checkbox confirmation */}
                  <label className="flex items-start gap-3 cursor-pointer select-none flex-1">
                    <input
                      type="checkbox"
                      checked={pageCheckboxChecked}
                      onChange={e => setPageCheckboxChecked(e.target.checked)}
                      className="w-4 h-4 mt-0.5 accent-neutral-900 rounded cursor-pointer"
                    />
                    <span className="text-xs font-bold text-neutral-900 leading-snug">
                      I have read, understand, and agree to the terms set forth in{' '}
                      <span className="underline">{activePage.title}</span> (Page {currentStep + 1} of {enabledPages.length}).
                    </span>
                  </label>

                  {/* Right: DocuSign Initial Stamp Box */}
                  <div className="flex items-center gap-3 shrink-0 bg-white border-2 border-amber-400 rounded-xl px-3.5 py-2 shadow-xs">
                    <div className="bg-amber-400 text-neutral-950 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded">
                      Initial Here
                    </div>
                    <input
                      type="text"
                      maxLength={5}
                      value={initials}
                      onChange={e => setInitials(e.target.value.toUpperCase())}
                      placeholder="JD"
                      className="w-16 text-center font-serif italic text-base font-bold text-neutral-900 border-b border-neutral-300 focus:border-black focus:outline-none uppercase bg-transparent"
                    />
                  </div>
                </div>

                {/* Navigation Buttons */}
                <div className="flex items-center justify-between pt-2 border-t border-amber-200/60">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
                    disabled={currentStep === 0}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-neutral-300 bg-white text-xs font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    <ChevronLeft size={15} />
                    Previous Page
                  </button>

                  <button
                    type="button"
                    onClick={handleAcceptCurrentPage}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-extrabold uppercase tracking-wider shadow-md transition-all cursor-pointer"
                  >
                    <Check size={15} strokeWidth={3} className="text-amber-400" />
                    {currentStep < enabledPages.length - 1
                      ? `Initial & Continue to Page ${currentStep + 2}`
                      : 'Initial & Proceed to Final Signature'}
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Final Signature Execution Card */
            <form
              onSubmit={handleFinishAndSign}
              className="bg-white rounded-2xl border border-neutral-200 shadow-md overflow-hidden flex flex-col"
            >
              <div className="bg-neutral-900 text-white px-6 py-5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 block mb-1">
                    Final Step • All {enabledPages.length} Pages Initialed
                  </span>
                  <h1 className="font-serif text-xl sm:text-2xl tracking-tight text-white">
                    Adopt Signature & Unlock Client Portal
                  </h1>
                </div>
                <ShieldCheck size={28} className="text-emerald-400 shrink-0" />
              </div>

              <div className="p-6 sm:p-8 space-y-6">
                {/* Summary of Initialed Pages */}
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-900 mb-2.5 flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-emerald-600" />
                    Initialed Agreement Pages ({enabledPages.length} of {enabledPages.length})
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {enabledPages.map((page, idx) => (
                      <div
                        key={page.id}
                        onClick={() => setCurrentStep(idx)}
                        className="bg-white border border-emerald-200/80 rounded-lg px-3 py-2 flex items-center justify-between text-xs cursor-pointer hover:border-emerald-400 transition-colors"
                      >
                        <span className="font-bold text-neutral-800 truncate pr-2">
                          {idx + 1}. {page.title}
                        </span>
                        <span className="text-[10px] font-serif italic font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded shrink-0">
                          {acceptedPages[page.id]?.initials || initials}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Signer Identity Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                        if (signatureMode === 'type') setTypedSignature(e.target.value);
                      }}
                      placeholder="Jane Doe"
                      className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-neutral-900 focus:bg-white focus:border-black focus:outline-none"
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
                      placeholder="Owner / Authorized Representative"
                      className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-neutral-900 focus:bg-white focus:border-black focus:outline-none"
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
                      className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-neutral-900 focus:bg-white focus:border-black focus:outline-none"
                    />
                  </div>
                </div>

                {/* Signature Method Tabs */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-500">
                      Electronic Signature *
                    </label>
                    <div className="inline-flex bg-neutral-100 p-1 rounded-xl border border-neutral-200">
                      <button
                        type="button"
                        onClick={() => setSignatureMode('type')}
                        className={`px-3 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                          signatureMode === 'type'
                            ? 'bg-white text-neutral-900 shadow-2xs'
                            : 'text-neutral-500 hover:text-neutral-800'
                        }`}
                      >
                        <Type size={13} />
                        Type Signature
                      </button>
                      <button
                        type="button"
                        onClick={() => setSignatureMode('draw')}
                        className={`px-3 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                          signatureMode === 'draw'
                            ? 'bg-white text-neutral-900 shadow-2xs'
                            : 'text-neutral-500 hover:text-neutral-800'
                        }`}
                      >
                        <PenTool size={13} />
                        Draw Signature
                      </button>
                    </div>
                  </div>

                  {signatureMode === 'type' ? (
                    <div className="bg-amber-50/40 border-2 border-amber-300 rounded-2xl p-5 space-y-3">
                      <input
                        type="text"
                        value={typedSignature}
                        onChange={e => setTypedSignature(e.target.value)}
                        placeholder="Type your full legal name to sign..."
                        className="w-full bg-white border border-neutral-300 rounded-xl px-4 py-2.5 text-xs font-bold text-neutral-900 focus:border-black focus:outline-none"
                      />
                      <div className="bg-white border border-dashed border-neutral-300 rounded-xl px-6 py-5 flex items-center justify-between">
                        <div className="flex items-baseline gap-3 min-w-0">
                          <span className="text-xs font-bold text-amber-600 uppercase tracking-widest shrink-0">
                            Sign Here:
                          </span>
                          <span className="font-serif italic text-3xl sm:text-4xl text-neutral-900 tracking-wide truncate">
                            {typedSignature || signerName || 'Your Signature'}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-neutral-400 shrink-0 hidden sm:inline">
                          DOCUSIGN-VERIFIED
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-amber-50/40 border-2 border-amber-300 rounded-2xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-amber-900">
                          Use your mouse or finger to sign on the line below:
                        </span>
                        <button
                          type="button"
                          onClick={handleClearCanvas}
                          className="text-[11px] font-bold text-neutral-600 hover:text-red-600 flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw size={12} /> Clear Pad
                        </button>
                      </div>
                      <div className="relative bg-white border border-neutral-300 rounded-xl overflow-hidden">
                        <canvas
                          ref={canvasRef}
                          width={640}
                          height={160}
                          onMouseDown={handleStartDraw}
                          onMouseMove={handleMoveDraw}
                          onMouseUp={handleEndDraw}
                          onMouseLeave={handleEndDraw}
                          onTouchStart={handleStartDraw}
                          onTouchMove={handleMoveDraw}
                          onTouchEnd={handleEndDraw}
                          className="w-full h-36 cursor-crosshair touch-none"
                        />
                        <div className="absolute bottom-6 left-6 right-6 border-b border-neutral-300 pointer-events-none flex items-center justify-between">
                          <span className="text-xs font-bold text-neutral-400 pb-1">X</span>
                          <span className="text-[9px] font-mono text-neutral-300 pb-1 uppercase">
                            Authorized Signature — {companyName}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Electronic Signature Legal Consent */}
                <label className="flex items-start gap-3 p-4 rounded-xl bg-neutral-50 border border-neutral-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={e => setConsentChecked(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-neutral-900 rounded cursor-pointer"
                  />
                  <span className="text-xs text-neutral-700 leading-relaxed font-medium">
                    By checking this box and clicking <strong>"Finish & Sign All Documents"</strong>, I confirm that I am authorized to sign on behalf of{' '}
                    <strong>{companyName}</strong>, and I agree that my electronic initials ({initials || '—'}) and signature constitute my legally binding execution of all {enabledPages.length} agreements in this packet.
                  </span>
                </label>
              </div>

              {/* Footer Actions */}
              <div className="px-6 sm:px-8 py-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep(enabledPages.length - 1)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-neutral-300 bg-white text-xs font-bold text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
                >
                  <ChevronLeft size={15} />
                  Back to Documents
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold uppercase tracking-wider shadow-lg transition-all disabled:opacity-50 cursor-pointer"
                >
                  <ShieldCheck size={16} />
                  {isSubmitting ? 'Executing Agreements...' : 'Finish & Sign All Documents'}
                </button>
              </div>
            </form>
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
    <div className="fixed inset-0 z-[150] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-neutral-200 max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-neutral-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <ShieldCheck size={22} className="text-emerald-400" />
            <div>
              <h3 className="font-serif text-lg text-white">
                {signedData ? 'Executed Portal Agreements & NDA Packet' : 'Portal Agreement Packet Preview'}
              </h3>
              <p className="text-[11px] text-neutral-300">
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
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer size={14} /> Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6 bg-neutral-50 flex-1">
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
                  <strong>Executed At:</strong> {new Date(signedData.signedAt).toLocaleString()} •{' '}
                  <strong>Initials:</strong> {signedData.initials}
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
                  <span className="font-serif italic text-2xl text-neutral-900">
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
              <div className="px-6 py-3.5 bg-neutral-100 border-b border-neutral-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                    Page {index + 1} of {pagesToDisplay.length}
                  </span>
                  <h4 className="text-sm font-bold text-neutral-900">{page.title}</h4>
                </div>
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 px-3 py-1 rounded-lg">
                  <span className="text-[10px] font-extrabold uppercase text-amber-900">Initials:</span>
                  <span className="font-serif italic font-bold text-sm text-neutral-900">
                    {page.initials || signedData?.initials || '—'}
                  </span>
                </div>
              </div>
              <div className="p-6 text-xs text-neutral-800 leading-relaxed whitespace-pre-wrap font-sans">
                {page.contentSnapshot}
              </div>
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
