import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { type VisitorSession } from '../../lib/visitorTracking';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { sendMetaLeadSMS } from '../../lib/smsService';
import { 
  Users, 
  TrendingUp, 
  CheckCircle2, 
  UserCheck, 
  Search, 
  Monitor, 
  Smartphone, 
  Tablet, 
  X, 
  ChevronRight,
  Trash2,
  Share2,
  RefreshCw,
  Send,
  Loader2,
  MessageSquare,
  AlertCircle,
  Mail,
  Phone,
  PhoneCall,
  Settings,
  Sparkles
} from 'lucide-react';

const FUNNEL_STAGES = [
  { step: 0, label: 'Landing Page (/start2)', short: '/start2 Landing' },
  { step: 1, label: 'Garment & Category Select', short: 'Selection' },
  { step: 2, label: 'Upload Artwork / Logo', short: 'Upload Logo' },
  { step: 3, label: 'Placement & Proofing', short: 'Proofing' },
  { step: 4, label: 'Sizing & Quantities', short: 'Quantities' },
  { step: 5, label: 'Submitted Quote Request', short: 'Quote Submitted' },
  { step: 6, label: 'Account Created', short: 'Account Created' },
];

export interface MetaLead {
  id: string;
  leadId: string;
  formId?: string;
  name: string;
  phone: string;
  email: string;
  adName?: string;
  formName?: string;
  smsStatus?: 'not_sent' | 'sent' | 'failed';
  smsSentAt?: string;
  createdAt: string;
  rawFields?: string;
  lastMessage?: string;
  lastError?: string;
}

export function VisitorFunnelPage() {
  // Navigation View Switcher: Web Funnel vs Meta Ads Leads
  const [activeViewMode, setActiveViewMode] = useState<'Web Visitors' | 'Meta Lead Ads'>('Web Visitors');

  // Web Visitor State
  const [sessions, setSessions] = useState<VisitorSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [timeRange, setTimeRange] = useState<'Today' | '7 Days' | '30 Days' | 'All Time'>('7 Days');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Converted' | 'Dropped Off'>('All');
  const [selectedVisitor, setSelectedVisitor] = useState<VisitorSession | null>(null);

  // Meta Leads State
  const [metaLeads, setMetaLeads] = useState<MetaLead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [syncingLeads, setSyncingLeads] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ success: boolean; message: string } | null>(null);
  const [selectedLead, setSelectedLead] = useState<MetaLead | null>(null);
  const [leadSearchQuery, setLeadSearchQuery] = useState('');
  const [leadSmsFilter, setLeadSmsFilter] = useState<'All' | 'Text Sent' | 'Uncontacted'>('All');

  // Interactive SMS Composer Modal State
  const [smsModalLead, setSmsModalLead] = useState<MetaLead | null>(null);
  const [smsTemplateType, setSmsTemplateType] = useState<'voicemail' | 'welcome' | 'custom'>('voicemail');
  const [smsMessage, setSmsMessage] = useState('');
  const [smsMediaUrl, setSmsMediaUrl] = useState('');
  const [sendingModalSms, setSendingModalSms] = useState(false);

  // Global Default Lead SMS & GIF Settings Modal State
  const [showDefaultSmsModal, setShowDefaultSmsModal] = useState(false);
  const [defaultSmsMessage, setDefaultSmsMessage] = useState('');
  const [defaultSmsMediaUrl, setDefaultSmsMediaUrl] = useState('');
  const [autoSendSms, setAutoSendSms] = useState(false);
  const [loadingDefaultSmsSettings, setLoadingDefaultSmsSettings] = useState(false);
  const [savingDefaultSmsSettings, setSavingDefaultSmsSettings] = useState(false);

  // Subscribe to Visitor Sessions
  useEffect(() => {
    const q = query(collection(db, 'visitor_sessions'), orderBy('lastSeen', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const loaded: VisitorSession[] = [];
        snap.forEach((docSnap) => {
          loaded.push(docSnap.data() as VisitorSession);
        });
        setSessions(loaded);
        setLoadingSessions(false);
      },
      (err) => {
        console.warn('Error listening to visitor_sessions:', err);
        setLoadingSessions(false);
      }
    );
    return () => unsub();
  }, []);

  // Subscribe to Meta Leads
  useEffect(() => {
    const q = query(collection(db, 'meta_leads'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const loaded: MetaLead[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          loaded.push({
            id: docSnap.id,
            leadId: data.leadId || docSnap.id,
            formId: data.formId,
            name: data.name || 'Meta Lead',
            phone: data.phone || '',
            email: data.email || '',
            adName: data.adName || 'Meta Ad',
            formName: data.formName || 'Lead Form',
            smsStatus: data.smsStatus || 'not_sent',
            smsSentAt: data.smsSentAt,
            createdAt: data.createdAt || new Date().toISOString(),
            rawFields: data.rawFields,
            lastMessage: data.lastMessage,
            lastError: data.lastError
          });
        });
        setMetaLeads(loaded);
        setLoadingLeads(false);
      },
      (err) => {
        console.warn('Error listening to meta_leads:', err);
        setLoadingLeads(false);
      }
    );
    return () => unsub();
  }, []);

  const handleDeleteSession = async (visitorId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Delete this visitor session record?')) return;
    try {
      await deleteDoc(doc(db, 'visitor_sessions', visitorId));
      if (selectedVisitor?.visitorId === visitorId) {
        setSelectedVisitor(null);
      }
    } catch (err) {
      console.error('Failed to delete visitor session:', err);
      alert('Failed to delete session log.');
    }
  };

  const handleDeleteLead = async (leadId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Delete this Meta lead record?')) return;
    try {
      await deleteDoc(doc(db, 'meta_leads', leadId));
      if (selectedLead?.id === leadId) {
        setSelectedLead(null);
      }
    } catch (err) {
      console.error('Failed to delete lead:', err);
      alert('Failed to delete lead record.');
    }
  };

  // Manual Sync Meta Leads API Call
  const handleSyncMetaLeads = async () => {
    setSyncingLeads(true);
    setSyncStatusMsg(null);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('You must be logged in to sync leads.');
      }
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/meta/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        setSyncStatusMsg({ success: true, message: data.message || `Successfully synced ${data.syncedCount || 0} leads from Meta!` });
      } else {
        setSyncStatusMsg({ success: false, message: data.error || 'Failed to sync leads from Meta API.' });
      }
    } catch (err: any) {
      console.error('Meta sync error:', err);
      setSyncStatusMsg({ success: false, message: err.message || 'Error triggering Meta sync.' });
    } finally {
      setSyncingLeads(false);
    }
  };

  // Open Interactive SMS Composer Modal
  const handleOpenSmsModal = (lead: MetaLead, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!lead.phone) {
      alert('This lead does not have a valid phone number attached.');
      return;
    }
    setSmsModalLead(lead);
    applySmsTemplate('voicemail', lead);
  };

  // Apply Quick Template Presets
  const applySmsTemplate = (type: 'voicemail' | 'welcome' | 'custom', lead?: MetaLead | null) => {
    const targetLead = lead || smsModalLead;
    setSmsTemplateType(type);
    const firstName = targetLead?.name ? targetLead.name.split(' ')[0] : 'there';

    if (type === 'voicemail') {
      setSmsMessage(
        `Left you a VM!\n\nYou can get started with just a few clicks at www.inktheory.studio by clicking the START button.\n\nIn the meantime, I'm here if you have any questions or need help getting started!\n\n✌️ Jason (not ai or bot)\nINKTHEORY Customer Service`
      );
      setSmsMediaUrl('https://images.squarespace-cdn.com/content/v1/640b79f64c676766ebf04df5/1678500000000-sample/tutorial.gif');
    } else if (type === 'welcome') {
      setSmsMessage(
        `Hi ${firstName}, thank you for inquiring via our Meta ad! How can we help with your custom print order?\n\nYou can calculate instant pricing and start building at www.inktheory.studio!`
      );
      setSmsMediaUrl('');
    } else {
      setSmsMessage('');
      setSmsMediaUrl('');
    }
  };

  // Dispatch Custom SMS & GIF via Quo
  const handleSendCustomModalSms = async () => {
    if (!smsModalLead || !smsModalLead.phone) return;
    setSendingModalSms(true);
    try {
      const res = await sendMetaLeadSMS(smsModalLead, smsMessage, smsMediaUrl);
      if (res.success) {
        alert(`SMS & GIF sent successfully to ${smsModalLead.name} (${smsModalLead.phone}) via Quo!`);
        setSmsModalLead(null);
      } else {
        alert(`Failed to send SMS via Quo: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Error sending text: ${err.message || 'Unknown error'}`);
    } finally {
      setSendingModalSms(false);
    }
  };

  // Trigger Phone Call to Lead
  const handleCallLead = async (lead: MetaLead, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!lead.phone) {
      alert('This lead does not have a valid phone number attached.');
      return;
    }

    const cleanPhone = lead.phone.replace(/[^0-9+]/g, '');

    try {
      await setDoc(doc(db, 'meta_leads', lead.id), {
        callStatus: 'called',
        lastCalledAt: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.error('Error logging call status:', err);
    }

    window.location.href = `tel:${cleanPhone}`;
  };

  // Fetch & Open Default SMS & GIF Settings Modal
  const handleOpenDefaultSmsModal = async () => {
    setShowDefaultSmsModal(true);
    setLoadingDefaultSmsSettings(true);
    try {
      const metaSnap = await getDoc(doc(db, 'settings', 'meta'));
      const defaultText = `Left you a VM!\n\nYou can get started with just a few clicks at www.inktheory.studio by clicking the START button.\n\nIn the meantime, I'm here if you have any questions or need help getting started!\n\n✌️ Jason (not ai or bot)\nINKTHEORY Customer Service`;
      const defaultGif = `https://images.squarespace-cdn.com/content/v1/640b79f64c676766ebf04df5/1678500000000-sample/tutorial.gif`;

      if (metaSnap.exists()) {
        const data = metaSnap.data();
        setDefaultSmsMessage(data.smsTemplate || defaultText);
        setDefaultSmsMediaUrl(data.smsMediaUrl !== undefined ? data.smsMediaUrl : defaultGif);
        setAutoSendSms(data.autoSendSms ?? false);
      } else {
        setDefaultSmsMessage(defaultText);
        setDefaultSmsMediaUrl(defaultGif);
        setAutoSendSms(false);
      }
    } catch (err) {
      console.error('Error fetching default SMS settings:', err);
    } finally {
      setLoadingDefaultSmsSettings(false);
    }
  };

  // Save Default SMS & GIF Settings to Firestore
  const handleSaveDefaultSmsSettings = async () => {
    setSavingDefaultSmsSettings(true);
    try {
      await setDoc(
        doc(db, 'settings', 'meta'),
        {
          smsTemplate: defaultSmsMessage.trim(),
          smsMediaUrl: defaultSmsMediaUrl.trim(),
          autoSendSms,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );

      alert('Default Lead SMS & GIF Template saved successfully! All new leads will receive this automated text & GIF.');
      setShowDefaultSmsModal(false);
    } catch (err: any) {
      alert(`Failed to save settings: ${err.message || 'Unknown error'}`);
    } finally {
      setSavingDefaultSmsSettings(false);
    }
  };

  // Web Visitor Filtering
  const filteredSessions = useMemo(() => {
    const now = Date.now();
    let minTime = 0;
    if (timeRange === 'Today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      minTime = today.getTime();
    } else if (timeRange === '7 Days') {
      minTime = now - 7 * 24 * 60 * 60 * 1000;
    } else if (timeRange === '30 Days') {
      minTime = now - 30 * 24 * 60 * 60 * 1000;
    }

    return sessions.filter((s) => {
      if (minTime > 0) {
        const lastSeenTime = new Date(s.lastSeen || s.firstSeen).getTime();
        if (lastSeenTime < minTime) return false;
      }
      if (statusFilter === 'Converted' && !s.convertedQuote && !s.convertedAccount) return false;
      if (statusFilter === 'Dropped Off' && (s.convertedQuote || s.convertedAccount)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesId = s.visitorId?.toLowerCase().includes(q);
        const matchesEmail = s.userEmail?.toLowerCase().includes(q);
        const matchesBrowser = s.browser?.toLowerCase().includes(q);
        const matchesLanding = s.landingPage?.toLowerCase().includes(q);
        if (!matchesId && !matchesEmail && !matchesBrowser && !matchesLanding) return false;
      }
      return true;
    });
  }, [sessions, timeRange, statusFilter, searchQuery]);

  // Meta Leads Filtering
  const filteredMetaLeads = useMemo(() => {
    return metaLeads.filter((lead) => {
      if (leadSmsFilter === 'Text Sent' && lead.smsStatus !== 'sent') return false;
      if (leadSmsFilter === 'Uncontacted' && lead.smsStatus === 'sent') return false;
      if (leadSearchQuery.trim()) {
        const q = leadSearchQuery.toLowerCase();
        const matchesName = lead.name?.toLowerCase().includes(q);
        const matchesEmail = lead.email?.toLowerCase().includes(q);
        const matchesPhone = lead.phone?.toLowerCase().includes(q);
        const matchesAd = lead.adName?.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesPhone && !matchesAd) return false;
      }
      return true;
    });
  }, [metaLeads, leadSmsFilter, leadSearchQuery]);

  // Web Visitor Funnel Metrics
  const totalVisitors = filteredSessions.length;
  const convertedQuoteCount = useMemo(() => filteredSessions.filter((s) => s.convertedQuote).length, [filteredSessions]);
  const convertedAccountCount = useMemo(() => filteredSessions.filter((s) => s.convertedAccount).length, [filteredSessions]);
  const overallConversionRate = totalVisitors > 0 ? ((convertedQuoteCount / totalVisitors) * 100).toFixed(1) : '0.0';

  // Meta Lead Metrics
  const totalMetaLeads = metaLeads.length;
  const sentSmsCount = useMemo(() => metaLeads.filter((l) => l.smsStatus === 'sent').length, [metaLeads]);
  const uncontactedCount = totalMetaLeads - sentSmsCount;

  // Funnel stage counts
  const stageCounts = useMemo(() => {
    return FUNNEL_STAGES.map((stage) => {
      const reachedCount = filteredSessions.filter((s) => (s.furthestStep ?? 0) >= stage.step).length;
      const percentage = totalVisitors > 0 ? Math.round((reachedCount / totalVisitors) * 100) : 0;
      return { ...stage, count: reachedCount, percentage };
    });
  }, [filteredSessions, totalVisitors]);

  // Drop-off Locations Breakdown
  const dropoffLocations = useMemo(() => {
    const map: Record<string, { stepName: string; path: string; lastEvent: string; count: number }> = {};
    filteredSessions.forEach((s) => {
      const stepName = s.lastStepName || s.furthestStepName || `Step ${s.furthestStep || 0}`;
      const path = s.currentPath || s.landingPage || '/start2';
      const lastEvent = s.lastEventName || 'Visited page';
      const key = `${stepName}__${path}`;

      if (!map[key]) {
        map[key] = { stepName, path, lastEvent, count: 0 };
      }
      map[key].count += 1;
    });

    return Object.values(map)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [filteredSessions]);

  const renderDeviceIcon = (device: string) => {
    if (device === 'Mobile') return <Smartphone size={15} className="text-brand-muted" />;
    if (device === 'Tablet') return <Tablet size={15} className="text-brand-muted" />;
    return <Monitor size={15} className="text-brand-muted" />;
  };

  const formatTimeAgo = (isoDate: string) => {
    if (!isoDate) return 'N/A';
    const diffMs = Date.now() - new Date(isoDate).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <div className={tokens.layout.container}>
      {/* Page Header */}
      <div className={tokens.layout.pageHeader + " flex-col sm:flex-row items-start sm:items-center justify-between gap-4"}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand-primary/5 border border-brand-primary/10 rounded-xl text-brand-primary">
            <TrendingUp size={22} strokeWidth={2} />
          </div>
          <div>
            <h1 className={tokens.typography.h1}>Public Visitor & Lead Funnel</h1>
            <p className={tokens.typography.bodyMuted + " mt-1"}>
              Track real-time visitors from <code className="px-1.5 py-0.5 bg-slate-100 rounded text-brand-primary font-mono text-xs">/start2</code> and capture Meta Lead Ad submissions to text leads via Quo.
            </p>
          </div>
        </div>

        {/* View Mode Switcher: Web Visitors vs Meta Lead Ads */}
        <div className="flex items-center gap-3 bg-neutral-100 p-1 rounded-xl border border-neutral-200 shrink-0">
          <button
            onClick={() => setActiveViewMode('Web Visitors')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeViewMode === 'Web Visitors'
                ? 'bg-white shadow-xs text-brand-primary'
                : 'text-brand-secondary hover:text-brand-primary'
            }`}
          >
            <Users size={15} />
            Web Visitors Funnel
          </button>

          <button
            onClick={() => setActiveViewMode('Meta Lead Ads')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeViewMode === 'Meta Lead Ads'
                ? 'bg-white shadow-xs text-brand-primary'
                : 'text-brand-secondary hover:text-brand-primary'
            }`}
          >
            <Share2 size={15} />
            Meta Ad Leads ({totalMetaLeads})
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW MODE 1: WEB VISITORS FUNNEL                                         */}
      {/* ========================================================================= */}
      {activeViewMode === 'Web Visitors' && (
        <div className="space-y-6 mt-6 animate-in fade-in duration-200">
          {/* Controls Header */}
          <div className="flex justify-end">
            <SegmentedControl
              options={['Today', '7 Days', '30 Days', 'All Time']}
              value={timeRange}
              onChange={(val) => setTimeRange(val as any)}
            />
          </div>

          {/* Top Stat Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 bg-white border border-brand-border rounded-xl shadow-xs">
              <div className="flex items-center justify-between text-brand-secondary mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Unique Visitors</span>
                <Users size={18} className="text-blue-600" />
              </div>
              <div className="text-3xl font-serif text-brand-primary font-bold">{totalVisitors}</div>
              <p className="text-xs text-brand-muted mt-1">Unique visitor IDs in timeframe</p>
            </div>

            <div className="p-5 bg-white border border-brand-border rounded-xl shadow-xs">
              <div className="flex items-center justify-between text-brand-secondary mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider">Converted Quotes</span>
                <CheckCircle2 size={18} className="text-emerald-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-serif text-brand-primary font-bold">{convertedQuoteCount}</span>
                <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  {totalVisitors > 0 ? ((convertedQuoteCount / totalVisitors) * 100).toFixed(1) : 0}%
                </span>
              </div>
              <p className="text-xs text-brand-muted mt-1">Visitors who submitted a quote</p>
            </div>

            <div className="p-5 bg-white border border-brand-border rounded-xl shadow-xs">
              <div className="flex items-center justify-between text-brand-secondary mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider">Accounts Created</span>
                <UserCheck size={18} className="text-indigo-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-serif text-brand-primary font-bold">{convertedAccountCount}</span>
                <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                  {totalVisitors > 0 ? ((convertedAccountCount / totalVisitors) * 100).toFixed(1) : 0}%
                </span>
              </div>
              <p className="text-xs text-brand-muted mt-1">Visitors who registered an account</p>
            </div>

            <div className="p-5 bg-white border border-brand-border rounded-xl shadow-xs">
              <div className="flex items-center justify-between text-brand-secondary mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider">Funnel Conversion Rate</span>
                <TrendingUp size={18} className="text-amber-600" />
              </div>
              <div className="text-3xl font-serif text-brand-primary font-bold">{overallConversionRate}%</div>
              <p className="text-xs text-brand-muted mt-1">Landing visitors reaching checkout/quote</p>
            </div>
          </div>

          {/* Visual Funnel Progression & Exit Breakdown Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white border border-brand-border rounded-xl p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-serif font-semibold text-brand-primary">Funnel Conversion Stages</h2>
                    <p className="text-xs text-brand-muted mt-0.5">Progression through each step of the public onboarding builder</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {stageCounts.map((stage, idx) => {
                    const prevCount = idx > 0 ? stageCounts[idx - 1].count : stage.count;
                    const dropoffCount = prevCount - stage.count;
                    const dropoffPct = prevCount > 0 ? Math.round((dropoffCount / prevCount) * 100) : 0;

                    return (
                      <div key={stage.step} className="group">
                        <div className="flex items-center justify-between text-sm mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-slate-100 text-brand-secondary font-mono text-xs font-medium flex items-center justify-center border border-slate-200">
                              {stage.step}
                            </span>
                            <span className="font-medium text-brand-primary">{stage.label}</span>
                          </div>

                          <div className="flex items-center gap-4 text-xs">
                            {idx > 0 && dropoffCount > 0 && (
                              <span className="text-rose-500 font-medium">
                                -{dropoffCount} ({dropoffPct}% drop-off)
                              </span>
                            )}
                            <span className="font-semibold text-brand-primary">{stage.count} visitors</span>
                            <span className="w-12 text-right font-mono font-medium text-brand-secondary">{stage.percentage}%</span>
                          </div>
                        </div>

                        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex border border-slate-200/60">
                          <div 
                            className={`h-full transition-all duration-500 ${
                              stage.step === 5 || stage.step === 6 ? 'bg-emerald-500' : 'bg-brand-primary'
                            }`} 
                            style={{ width: `${stage.percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="bg-white border border-brand-border rounded-xl p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="mb-4">
                  <h2 className="text-base font-serif font-semibold text-brand-primary">Top Drop-off Locations</h2>
                  <p className="text-xs text-brand-muted mt-0.5">Where un-converted visitors left off</p>
                </div>

                {dropoffLocations.length === 0 ? (
                  <p className="text-xs text-brand-muted italic py-6">No exit data recorded yet.</p>
                ) : (
                  <div className="space-y-3">
                    {dropoffLocations.map((item, i) => (
                      <div key={i} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                        <div className="flex items-center justify-between font-semibold text-brand-primary">
                          <span className="truncate pr-2">{item.stepName}</span>
                          <span className="px-2 py-0.5 bg-rose-50 text-rose-700 rounded-full text-[11px] font-mono border border-rose-200">
                            {item.count} left here
                          </span>
                        </div>
                        <div className="text-[11px] text-brand-muted font-mono truncate mt-1">
                          {item.path}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Visitor Session Table */}
          <div className="bg-white border border-brand-border rounded-xl shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-brand-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-serif font-semibold text-brand-primary">Unique Visitor Logs</h2>
                <span className="text-xs font-medium px-2.5 py-0.5 bg-slate-100 text-brand-secondary rounded-full border border-slate-200">
                  {filteredSessions.length} sessions
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 sm:w-64">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
                  <input
                    type="text"
                    placeholder="Search visitor ID, email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-brand-border rounded-lg text-xs text-brand-primary focus:outline-none focus:border-brand-primary transition-colors"
                  />
                </div>

                <SegmentedControl
                  options={['All', 'Converted', 'Dropped Off']}
                  value={statusFilter}
                  onChange={(val) => setStatusFilter(val as any)}
                />
              </div>
            </div>

            {loadingSessions ? (
              <div className="p-12 text-center text-brand-muted text-sm font-serif">
                Loading visitor analytics...
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="p-12 text-center text-brand-secondary">
                <Users size={32} className="mx-auto mb-3 text-brand-muted stroke-1" />
                <p className="font-medium text-sm">No visitor sessions match the current filters.</p>
                <p className="text-xs text-brand-muted mt-1">Try expanding the date range or clearing search queries.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-brand-border text-[11px] font-semibold text-brand-muted uppercase tracking-wider">
                      <th className="py-3 px-4">Visitor & Device</th>
                      <th className="py-3 px-4">First / Last Active</th>
                      <th className="py-3 px-4">Exit Page / Last Reached</th>
                      <th className="py-3 px-4">Contact & Identity</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border text-xs">
                    {filteredSessions.map((session) => (
                      <tr 
                        key={session.visitorId} 
                        className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                        onClick={() => setSelectedVisitor(session)}
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            {renderDeviceIcon(session.deviceType)}
                            <div>
                              <div className="font-mono font-medium text-brand-primary text-[12px]">
                                {session.visitorId}
                              </div>
                              <div className="text-[11px] text-brand-muted flex items-center gap-1 mt-0.5">
                                <span>{session.deviceType}</span>
                                <span>·</span>
                                <span>{session.browser || 'Web'}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-brand-secondary">
                          <div>
                            <span className="font-medium text-brand-primary">{formatTimeAgo(session.lastSeen)}</span>
                          </div>
                          <div className="text-[11px] text-brand-muted mt-0.5">
                            First seen {new Date(session.firstSeen || session.lastSeen).toLocaleDateString()}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex flex-col">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium w-fit ${
                              session.furthestStep >= 5 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                : session.furthestStep >= 2
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                              {session.lastStepName || session.furthestStepName || `Step ${session.furthestStep}`}
                            </span>
                            <span className="text-[11px] font-mono text-brand-muted mt-1 truncate max-w-[200px]">
                              {session.currentPath || session.landingPage || '/start2'}
                            </span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-brand-primary font-medium">
                          {session.userEmail ? (
                            <div>
                              <div>{session.userEmail}</div>
                              {session.userName && (
                                <div className="text-[11px] text-brand-muted font-normal">{session.userName}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-brand-muted font-normal italic">Anonymous Visitor</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          {session.convertedQuote ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                              <CheckCircle2 size={12} />
                              Quote Submitted
                            </span>
                          ) : session.convertedAccount ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 text-indigo-800">
                              <UserCheck size={12} />
                              Account Created
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                              In Progress / Exited
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedVisitor(session);
                              }}
                              className="inline-flex items-center gap-1 text-xs font-medium text-brand-primary hover:text-black hover:underline"
                            >
                              Timeline
                              <ChevronRight size={14} />
                            </button>

                            <button
                              onClick={(e) => handleDeleteSession(session.visitorId, e)}
                              className="p-1 text-slate-400 hover:text-rose-600 transition-colors rounded"
                              title="Delete visitor session log"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW MODE 2: META LEAD ADS                                               */}
      {/* ========================================================================= */}
      {activeViewMode === 'Meta Lead Ads' && (
        <div className="space-y-6 mt-6 animate-in fade-in duration-200">
          {/* Sync Status Banner */}
          {syncStatusMsg && (
            <div className={`p-4 rounded-xl border flex items-start gap-3 animate-in slide-in-from-top-2 duration-300 ${
              syncStatusMsg.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
              {syncStatusMsg.success ? <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={18} /> : <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={18} />}
              <div className="text-sm font-medium">{syncStatusMsg.message}</div>
            </div>
          )}

          {/* Top Meta Leads Stat Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 bg-white border border-brand-border rounded-xl shadow-xs">
              <div className="flex items-center justify-between text-brand-secondary mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Meta Ad Leads</span>
                <Share2 size={18} className="text-blue-600" />
              </div>
              <div className="text-3xl font-serif text-brand-primary font-bold">{totalMetaLeads}</div>
              <p className="text-xs text-brand-muted mt-1">Leads captured from Meta Instant Forms</p>
            </div>

            <div className="p-5 bg-white border border-brand-border rounded-xl shadow-xs">
              <div className="flex items-center justify-between text-brand-secondary mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider">SMS Text Sent (Quo)</span>
                <MessageSquare size={18} className="text-emerald-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-serif text-brand-primary font-bold">{sentSmsCount}</span>
                <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  {totalMetaLeads > 0 ? Math.round((sentSmsCount / totalMetaLeads) * 100) : 0}%
                </span>
              </div>
              <p className="text-xs text-brand-muted mt-1">Contacted leads via Quo SMS</p>
            </div>

            <div className="p-5 bg-white border border-brand-border rounded-xl shadow-xs">
              <div className="flex items-center justify-between text-brand-secondary mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider">Uncontacted Leads</span>
                <Users size={18} className="text-amber-600" />
              </div>
              <div className="text-3xl font-serif text-brand-primary font-bold">{uncontactedCount}</div>
              <p className="text-xs text-brand-muted mt-1">Awaiting SMS outreach</p>
            </div>
          </div>

          {/* Meta Leads Table Container */}
          <div className="bg-white border border-brand-border rounded-xl shadow-xs overflow-hidden">
            {/* Header Controls & Manual Sync Button */}
            <div className="p-4 sm:p-5 border-b border-brand-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-serif font-semibold text-brand-primary">Meta Form Leads</h2>
                <span className="text-xs font-medium px-2.5 py-0.5 bg-slate-100 text-brand-secondary rounded-full border border-slate-200">
                  {filteredMetaLeads.length} leads
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Search Bar */}
                <div className="relative flex-1 sm:w-64">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
                  <input
                    type="text"
                    placeholder="Search name, phone, email..."
                    value={leadSearchQuery}
                    onChange={(e) => setLeadSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-brand-border rounded-lg text-xs text-brand-primary focus:outline-none focus:border-brand-primary transition-colors"
                  />
                </div>

                {/* SMS Filter */}
                <SegmentedControl
                  options={['All', 'Text Sent', 'Uncontacted']}
                  value={leadSmsFilter}
                  onChange={(val) => setLeadSmsFilter(val as any)}
                />

                {/* Default Template Settings Button */}
                <PillButton
                  variant="outline"
                  onClick={handleOpenDefaultSmsModal}
                  className="shrink-0 h-9 bg-slate-50 hover:bg-slate-100 border-slate-300 text-slate-800 font-bold"
                  title="Configure default automated text & GIF for incoming leads"
                >
                  <MessageSquare size={14} className="mr-1.5 text-blue-600" />
                  Default Lead Text & GIF Settings
                </PillButton>

                {/* Manual Sync Button */}
                <PillButton
                  variant="filled"
                  onClick={handleSyncMetaLeads}
                  disabled={syncingLeads}
                  className="shrink-0 h-9"
                >
                  {syncingLeads ? (
                    <>
                      <Loader2 className="animate-spin mr-1.5" size={14} />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={14} className="mr-1.5" />
                      Sync Meta Leads
                    </>
                  )}
                </PillButton>
              </div>
            </div>

            {/* Table Content */}
            {loadingLeads ? (
              <div className="p-12 text-center text-brand-muted text-sm font-serif">
                Loading Meta lead submissions...
              </div>
            ) : filteredMetaLeads.length === 0 ? (
              <div className="p-12 text-center text-brand-secondary">
                <Share2 size={32} className="mx-auto mb-3 text-brand-muted stroke-1" />
                <p className="font-medium text-sm">No Meta leads found matching current filters.</p>
                <p className="text-xs text-brand-muted mt-1">Click <strong>"Sync Meta Leads"</strong> above to pull recent form submissions from your Meta Ads campaign.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b-2 border-slate-200 text-xs font-bold text-slate-700 uppercase tracking-wider">
                      <th className="py-3 px-4">Lead Contact</th>
                      <th className="py-3 px-4">Phone & Email</th>
                      <th className="py-3 px-4">Ad / Form Name</th>
                      <th className="py-3 px-4">Captured Date</th>
                      <th className="py-3 px-4">SMS Status (Quo)</th>
                      <th className="py-3 px-4 text-right">Manual Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {filteredMetaLeads.map((lead) => (
                      <tr 
                        key={lead.id} 
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                        onClick={() => setSelectedLead(lead)}
                      >
                        {/* Name */}
                        <td className="py-3.5 px-4 font-medium text-slate-900">
                          <div className="text-sm font-bold text-slate-900">{lead.name}</div>
                          <div className="text-xs text-slate-600 font-mono mt-0.5">ID: {lead.leadId.substring(0, 12)}...</div>
                        </td>

                        {/* Phone & Email */}
                        <td className="py-3.5 px-4">
                          {lead.phone ? (
                            <a
                              href={`tel:${lead.phone}`}
                              onClick={(e) => handleCallLead(lead, e)}
                              className="inline-flex items-center gap-1.5 text-emerald-700 hover:text-emerald-900 font-bold font-mono hover:underline group text-xs"
                              title="Click to Call via OpenPhone / System Dialer"
                            >
                              <PhoneCall size={13} className="text-emerald-600 group-hover:scale-110 transition-transform" />
                              {lead.phone}
                            </a>
                          ) : (
                            <div className="flex items-center gap-1 text-slate-500 italic font-sans text-xs">
                              <Phone size={12} />
                              No Phone
                            </div>
                          )}
                          <div className="flex items-center gap-1 text-xs text-slate-700 font-medium mt-1 truncate max-w-[220px]">
                            <Mail size={13} className="shrink-0 text-slate-500" />
                            {lead.email || 'No email'}
                          </div>
                        </td>

                        {/* Ad & Form */}
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-slate-900 block text-xs">{lead.adName || 'Meta Ad'}</span>
                          <span className="text-xs text-slate-600 font-medium block mt-0.5">{lead.formName || 'Lead Form'}</span>
                        </td>

                        {/* Timestamp */}
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 text-xs">{formatTimeAgo(lead.createdAt)}</div>
                          <div className="text-xs text-slate-600 font-medium mt-0.5">
                            {new Date(lead.createdAt).toLocaleDateString()} {new Date(lead.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>

                        {/* SMS Status Badge */}
                        <td className="py-3.5 px-4">
                          {lead.smsStatus === 'sent' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 size={12} />
                              Text Sent via Quo
                            </span>
                          ) : lead.smsStatus === 'failed' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-200" title={lead.lastError}>
                              <AlertCircle size={12} />
                              Failed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                              Uncontacted
                            </span>
                          )}
                        </td>

                        {/* Manual Action Buttons (Call & SMS) */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={(e) => handleCallLead(lead, e)}
                              disabled={!lead.phone}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                              title={`Call ${lead.name} (${lead.phone})`}
                            >
                              <PhoneCall size={13} />
                              Call
                            </button>

                            <button
                              onClick={(e) => handleOpenSmsModal(lead, e)}
                              disabled={sendingModalSms || !lead.phone}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-2xs ${
                                lead.smsStatus === 'sent'
                                  ? 'bg-slate-100 text-brand-primary hover:bg-slate-200 border border-slate-200'
                                  : 'bg-brand-primary text-white hover:bg-black'
                              } disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer`}
                            >
                              {sendingModalSms && smsModalLead?.id === lead.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Send size={13} />
                              )}
                              {lead.smsStatus === 'sent' ? 'Resend Text & GIF' : 'Text & GIF'}
                            </button>

                            <button
                              onClick={(e) => handleDeleteLead(lead.id, e)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors rounded"
                              title="Delete lead record"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Visitor Timeline Modal */}
      {selectedVisitor && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[200] animate-in fade-in duration-200">
          <div className="bg-white border border-brand-border rounded-2xl p-6 max-w-2xl w-full max-h-[85vh] flex flex-col shadow-xl">
            <div className="flex items-start justify-between pb-4 border-b border-brand-border">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-serif font-semibold text-brand-primary">Visitor Session History</h3>
                  {selectedVisitor.convertedQuote && (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-semibold rounded-full">
                      Converted Quote
                    </span>
                  )}
                </div>
                <p className="text-xs font-mono text-brand-muted mt-1">{selectedVisitor.visitorId}</p>
              </div>

              <button
                onClick={() => setSelectedVisitor(null)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-brand-secondary transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 my-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-brand-muted block">Device & Browser:</span>
                <span className="font-medium text-brand-primary">{selectedVisitor.deviceType} ({selectedVisitor.browser})</span>
              </div>
              <div>
                <span className="text-brand-muted block">First Seen:</span>
                <span className="font-medium text-brand-primary">{new Date(selectedVisitor.firstSeen || selectedVisitor.lastSeen).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-brand-muted block">Total Events:</span>
                <span className="font-medium text-brand-primary">{selectedVisitor.events?.length || selectedVisitor.eventsCount || 1} logged</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4 my-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-2">Event Timeline</h4>
              {selectedVisitor.events && selectedVisitor.events.length > 0 ? (
                <div className="relative border-l-2 border-slate-200 ml-3 pl-4 space-y-4">
                  {selectedVisitor.events.map((evt, i) => (
                    <div key={evt.id || i} className="relative">
                      <div className="absolute -left-[23px] top-1 w-3 h-3 rounded-full bg-brand-primary border-2 border-white" />
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-semibold text-brand-primary">{evt.eventName}</p>
                          <p className="text-[11px] text-brand-muted font-mono mt-0.5">{evt.path}</p>
                        </div>
                        <span className="text-[10px] text-brand-muted font-medium">
                          {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      {evt.metadata && Object.keys(evt.metadata).length > 0 && (
                        <div className="mt-1.5 p-2 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono text-slate-700">
                          {JSON.stringify(evt.metadata)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-brand-muted italic py-4">No detailed timeline events available for this session.</p>
              )}
            </div>

            <div className="pt-4 border-t border-brand-border flex justify-between items-center">
              <button
                onClick={() => handleDeleteSession(selectedVisitor.visitorId)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors"
              >
                <Trash2 size={14} />
                Delete Session Log
              </button>

              <PillButton variant="outline" onClick={() => setSelectedVisitor(null)}>
                Close Window
              </PillButton>
            </div>
          </div>
        </div>
      )}

      {/* Meta Lead Details Modal */}
      {selectedLead && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[200] animate-in fade-in duration-200">
          <div className="bg-white border border-brand-border rounded-2xl p-6 max-w-xl w-full max-h-[85vh] flex flex-col shadow-xl">
            <div className="flex items-start justify-between pb-4 border-b border-brand-border">
              <div>
                <h3 className="text-lg font-serif font-semibold text-brand-primary">{selectedLead.name}</h3>
                <p className="text-xs font-mono text-brand-muted mt-0.5">Meta Lead ID: {selectedLead.leadId}</p>
              </div>

              <button
                onClick={() => setSelectedLead(null)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-brand-secondary transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 my-4 flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-brand-muted block">Phone Number:</span>
                  <span className="font-semibold text-brand-primary font-mono">{selectedLead.phone || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-brand-muted block">Email:</span>
                  <span className="font-medium text-brand-primary">{selectedLead.email || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-brand-muted block">Ad Name:</span>
                  <span className="font-medium text-brand-primary">{selectedLead.adName || 'Meta Ad'}</span>
                </div>
                <div>
                  <span className="text-brand-muted block">Submitted Date:</span>
                  <span className="font-medium text-brand-primary">{new Date(selectedLead.createdAt).toLocaleString()}</span>
                </div>
              </div>

              {selectedLead.lastMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs">
                  <span className="font-semibold text-emerald-800 block mb-1">Last SMS Sent (Quo):</span>
                  <p className="text-emerald-700 italic">"{selectedLead.lastMessage}"</p>
                  <span className="text-[10px] text-emerald-600 block mt-1">Sent on {selectedLead.smsSentAt ? new Date(selectedLead.smsSentAt).toLocaleString() : 'N/A'}</span>
                </div>
              )}

              {selectedLead.rawFields && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-2">Raw Form Submitted Fields</h4>
                  <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl text-[11px] font-mono whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(JSON.parse(selectedLead.rawFields || '{}'), null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-brand-border flex justify-between items-center">
              <button
                onClick={(e) => handleDeleteLead(selectedLead.id, e)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors"
              >
                <Trash2 size={14} />
                Delete Lead Record
              </button>

              <div className="flex items-center gap-2">
                <PillButton
                  variant="filled"
                  onClick={(e) => handleCallLead(selectedLead, e)}
                  disabled={!selectedLead.phone}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <PhoneCall size={14} className="mr-1.5" />
                  Call Lead
                </PillButton>

                <PillButton
                  variant="filled"
                  onClick={(e) => {
                    const l = selectedLead;
                    setSelectedLead(null);
                    handleOpenSmsModal(l, e);
                  }}
                  disabled={!selectedLead.phone}
                >
                  <Send size={14} className="mr-1.5" />
                  Customize & Send SMS / GIF
                </PillButton>
                <PillButton variant="outline" onClick={() => setSelectedLead(null)}>
                  Close
                </PillButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Interactive SMS & GIF Customizer Modal */}
      {smsModalLead && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 z-[220] animate-in fade-in duration-200">
          <div className="bg-white border border-brand-border rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-brand-border">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-600">
                  <MessageSquare size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-serif font-semibold text-brand-primary">
                    Compose SMS & GIF for {smsModalLead.name}
                  </h3>
                  <p className="text-xs font-mono text-brand-muted mt-0.5">
                    Sending to <span className="text-brand-primary font-bold">{smsModalLead.phone}</span> via Quo SMS/MMS
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSmsModalLead(null)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-brand-secondary transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Grid Body: Form Controls (Left) vs Live Mobile iMessage Preview (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 my-4 flex-1 overflow-y-auto pr-1">
              {/* Left Column: Preset Templates & Customizer */}
              <div className="lg:col-span-7 space-y-4">
                {/* 1. Quick Template Selector */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-brand-muted mb-2">
                    1. Select Template Preset
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => applySmsTemplate('voicemail')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        smsTemplateType === 'voicemail'
                          ? 'bg-blue-50/80 border-blue-500 text-blue-900 shadow-xs ring-1 ring-blue-500'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-xs font-bold flex items-center gap-1.5">
                        🎙️ Voicemail + GIF
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1 line-clamp-2">
                        Left VM + start guide GIF + Jason signature
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => applySmsTemplate('welcome')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        smsTemplateType === 'welcome'
                          ? 'bg-blue-50/80 border-blue-500 text-blue-900 shadow-xs ring-1 ring-blue-500'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-xs font-bold flex items-center gap-1.5">
                        ⚡ Welcome Lead
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1 line-clamp-2">
                        Greeting + link to quote builder
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => applySmsTemplate('custom')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        smsTemplateType === 'custom'
                          ? 'bg-blue-50/80 border-blue-500 text-blue-900 shadow-xs ring-1 ring-blue-500'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-xs font-bold flex items-center gap-1.5">
                        ✍️ Custom Message
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1 line-clamp-2">
                        Type a custom text & media URL from scratch
                      </div>
                    </button>
                  </div>
                </div>

                {/* 2. Message Body Textarea */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-brand-muted">
                      2. Edit Text Message Content
                    </label>
                    <span className="text-[11px] font-mono text-brand-muted">
                      {smsMessage.length} chars
                    </span>
                  </div>
                  <textarea
                    rows={6}
                    value={smsMessage}
                    onChange={(e) => setSmsMessage(e.target.value)}
                    placeholder="Type your SMS message here..."
                    className="w-full p-3 bg-slate-50 border border-brand-border rounded-xl text-xs text-brand-primary font-sans leading-relaxed focus:outline-none focus:border-brand-primary focus:bg-white transition-colors"
                  />

                  {/* Insert Variable Helper Tags */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="text-[10px] text-brand-muted font-semibold">Insert tags:</span>
                    <button
                      type="button"
                      onClick={() => setSmsMessage((prev) => prev + ' {leadName}')}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-mono border border-slate-200 cursor-pointer"
                    >
                      + {"{leadName}"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSmsMessage((prev) => prev + ' {adName}')}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-mono border border-slate-200 cursor-pointer"
                    >
                      + {"{adName}"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSmsMessage((prev) => prev + ' www.inktheory.studio')}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-mono border border-slate-200 cursor-pointer"
                    >
                      + website link
                    </button>
                  </div>
                </div>

                {/* 3. GIF / MMS Media Attachment */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-brand-primary flex items-center gap-1.5">
                      <Share2 size={14} className="text-blue-600" />
                      3. Attach GIF or Image (MMS)
                    </label>
                    {smsMediaUrl && (
                      <button
                        type="button"
                        onClick={() => setSmsMediaUrl('')}
                        className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                      >
                        Remove GIF
                      </button>
                    )}
                  </div>
                  <input
                    type="url"
                    value={smsMediaUrl}
                    onChange={(e) => setSmsMediaUrl(e.target.value)}
                    placeholder="https://example.com/your-gif.gif"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-brand-primary focus:outline-none focus:border-brand-primary"
                  />

                  {/* Preset GIF Buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[10px] text-brand-muted font-medium">Quick GIFs:</span>
                    <button
                      type="button"
                      onClick={() => setSmsMediaUrl('https://images.squarespace-cdn.com/content/v1/640b79f64c676766ebf04df5/1678500000000-sample/tutorial.gif')}
                      className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded text-[11px] border border-slate-200 shadow-2xs cursor-pointer"
                    >
                      🎬 Tutorial Start GIF
                    </button>
                    <button
                      type="button"
                      onClick={() => setSmsMediaUrl('')}
                      className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-500 rounded text-[11px] border border-slate-200 cursor-pointer"
                    >
                      🚫 No GIF
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Smartphone Messages Preview (Matching User Screenshot) */}
              <div className="lg:col-span-5 flex flex-col">
                <label className="block text-xs font-semibold uppercase tracking-wider text-brand-muted mb-2">
                  Live Quo Messages Preview
                </label>

                <div className="flex-1 bg-slate-950 p-4 rounded-3xl border border-slate-800 flex flex-col justify-between shadow-inner min-h-[380px]">
                  {/* Phone Header Bar */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-[11px] text-slate-400">
                    <span className="font-mono">{smsModalLead.phone}</span>
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Quo iMessage
                    </span>
                  </div>

                  {/* Message Bubble Stack */}
                  <div className="py-4 space-y-3 flex flex-col items-end">
                    {/* Media GIF Container */}
                    {smsMediaUrl ? (
                      <div className="rounded-2xl overflow-hidden shadow-md max-w-[260px] border border-slate-700 bg-slate-900 relative group">
                        <img
                          src={smsMediaUrl}
                          alt="Attached GIF preview"
                          className="w-full h-auto max-h-48 object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/70 backdrop-blur-xs text-white text-[9px] font-mono rounded">
                          GIF Attached
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-500 italic text-center w-full py-2">
                        (No GIF attached)
                      </div>
                    )}

                    {/* Blue Text Bubbles */}
                    {smsMessage.trim() ? (
                      smsMessage.split('\n\n').map((paragraph, pIdx) => (
                        <div
                          key={pIdx}
                          className="bg-blue-600 text-white rounded-2xl px-4 py-2.5 text-xs max-w-[260px] leading-relaxed shadow-sm font-sans whitespace-pre-wrap rounded-br-xs"
                        >
                          {paragraph}
                        </div>
                      ))
                    ) : (
                      <div className="bg-slate-800 text-slate-400 rounded-2xl px-4 py-2.5 text-xs max-w-[260px] italic">
                        Type a message above...
                      </div>
                    )}
                  </div>

                  {/* Footer status */}
                  <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-500 text-right">
                    Delivered via Quo OpenPhone API
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-4 border-t border-brand-border flex items-center justify-between">
              <PillButton variant="outline" onClick={() => setSmsModalLead(null)}>
                Cancel
              </PillButton>

              <PillButton
                variant="filled"
                onClick={handleSendCustomModalSms}
                disabled={sendingModalSms || !smsMessage.trim()}
                className="bg-blue-600 hover:bg-blue-700 h-10 px-6 text-sm"
              >
                {sendingModalSms ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-2" />
                    Sending Text & GIF...
                  </>
                ) : (
                  <>
                    <Send size={16} className="mr-2" />
                    Send Text & GIF via Quo Now
                  </>
                )}
              </PillButton>
            </div>
          </div>
        </div>
      )}

      {/* Default Lead SMS & GIF Settings Dialog Modal */}
      {showDefaultSmsModal && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 z-[230] animate-in fade-in duration-200">
          <div className="bg-white border border-brand-border rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-brand-border">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-600">
                  <Sparkles size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-serif font-semibold text-brand-primary">
                    Default Lead SMS & GIF Template Settings
                  </h3>
                  <p className="text-xs text-brand-muted mt-0.5">
                    Configure the default message & GIF sent automatically to new Meta Leads or used in quick responses.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowDefaultSmsModal(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-brand-secondary transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Loading Indicator */}
            {loadingDefaultSmsSettings ? (
              <div className="py-16 text-center text-brand-muted text-sm font-serif flex flex-col items-center justify-center">
                <Loader2 size={24} className="animate-spin mb-2 text-indigo-600" />
                Loading default template settings...
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 my-4 flex-1 overflow-y-auto pr-1">
                {/* Left Column: Form Controls */}
                <div className="lg:col-span-7 space-y-4">
                  {/* 1. Default Message Textarea */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-800">
                        Default Text Message Content
                      </label>
                      <span className="text-[11px] font-mono text-slate-500">
                        {defaultSmsMessage.length} chars
                      </span>
                    </div>
                    <textarea
                      rows={6}
                      value={defaultSmsMessage}
                      onChange={(e) => setDefaultSmsMessage(e.target.value)}
                      placeholder="Type the default message sent to new leads..."
                      className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 font-sans leading-relaxed focus:outline-none focus:border-brand-primary focus:bg-white transition-colors"
                    />

                    {/* Insert Tags */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="text-[10px] text-slate-500 font-semibold">Available tags:</span>
                      <button
                        type="button"
                        onClick={() => setDefaultSmsMessage((prev) => prev + ' {leadName}')}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-mono border border-slate-300 cursor-pointer"
                      >
                        + {"{leadName}"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDefaultSmsMessage((prev) => prev + ' {adName}')}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-mono border border-slate-300 cursor-pointer"
                      >
                        + {"{adName}"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDefaultSmsMessage((prev) => prev + ' www.inktheory.studio')}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-mono border border-slate-300 cursor-pointer"
                      >
                        + website link
                      </button>
                    </div>
                  </div>

                  {/* 2. Default GIF Attachment URL */}
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-300 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Share2 size={14} className="text-blue-600" />
                        Default Attached GIF or Image URL (MMS)
                      </label>
                      {defaultSmsMediaUrl && (
                        <button
                          type="button"
                          onClick={() => setDefaultSmsMediaUrl('')}
                          className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                        >
                          Remove GIF
                        </button>
                      )}
                    </div>
                    <input
                      type="url"
                      value={defaultSmsMediaUrl}
                      onChange={(e) => setDefaultSmsMediaUrl(e.target.value)}
                      placeholder="https://example.com/tutorial.gif"
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:border-brand-primary"
                    />

                    {/* Presets */}
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[10px] text-slate-500 font-medium">Quick GIFs:</span>
                      <button
                        type="button"
                        onClick={() => setDefaultSmsMediaUrl('https://images.squarespace-cdn.com/content/v1/640b79f64c676766ebf04df5/1678500000000-sample/tutorial.gif')}
                        className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-800 rounded text-[11px] border border-slate-300 shadow-2xs cursor-pointer font-medium"
                      >
                        🎬 Tutorial Start GIF
                      </button>
                      <button
                        type="button"
                        onClick={() => setDefaultSmsMediaUrl('')}
                        className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-500 rounded text-[11px] border border-slate-300 cursor-pointer"
                      >
                        🚫 No GIF
                      </button>
                    </div>
                  </div>

                  {/* 3. Auto-Send Toggle Switch */}
                  <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-200 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-indigo-950 block">Instant Auto-Send to New Leads</span>
                      <p className="text-[11px] text-indigo-800/80 mt-0.5">Automatically dispatch this text & GIF via Quo immediately when a new lead is captured from Meta Ads.</p>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer ml-3 shrink-0">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={autoSendSms}
                        onChange={(e) => setAutoSendSms(e.target.checked)}
                      />
                      <div className="w-10 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>
                </div>

                {/* Right Column: Live iMessage Smartphone Preview */}
                <div className="lg:col-span-5 flex flex-col">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">
                    Live Default Message Preview
                  </label>

                  <div className="flex-1 bg-slate-950 p-4 rounded-3xl border border-slate-800 flex flex-col justify-between shadow-inner min-h-[380px]">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-[11px] text-slate-400">
                      <span className="font-mono">+1 (555) 019-2831</span>
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Quo Auto-SMS
                      </span>
                    </div>

                    <div className="py-4 space-y-3 flex flex-col items-end">
                      {defaultSmsMediaUrl ? (
                        <div className="rounded-2xl overflow-hidden shadow-md max-w-[260px] border border-slate-700 bg-slate-900 relative">
                          <img
                            src={defaultSmsMediaUrl}
                            alt="Attached GIF preview"
                            className="w-full h-auto max-h-48 object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                          <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/70 backdrop-blur-xs text-white text-[9px] font-mono rounded">
                            Default GIF Attached
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-500 italic text-center w-full py-2">
                          (No default GIF attached)
                        </div>
                      )}

                      {defaultSmsMessage.trim() ? (
                        defaultSmsMessage.split('\n\n').map((paragraph, pIdx) => (
                          <div
                            key={pIdx}
                            className="bg-blue-600 text-white rounded-2xl px-4 py-2.5 text-xs max-w-[260px] leading-relaxed shadow-sm font-sans whitespace-pre-wrap rounded-br-xs"
                          >
                            {paragraph.replace(/{leadName}/g, 'Alex')}
                          </div>
                        ))
                      ) : (
                        <div className="bg-slate-800 text-slate-400 rounded-2xl px-4 py-2.5 text-xs max-w-[260px] italic">
                          Type a default message above...
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-500 text-right">
                      Delivered via Quo OpenPhone API
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Footer Actions */}
            <div className="pt-4 border-t border-brand-border flex items-center justify-between">
              <PillButton variant="outline" onClick={() => setShowDefaultSmsModal(false)}>
                Cancel
              </PillButton>

              <PillButton
                variant="filled"
                onClick={handleSaveDefaultSmsSettings}
                disabled={savingDefaultSmsSettings || loadingDefaultSmsSettings}
                className="bg-indigo-600 hover:bg-indigo-700 h-10 px-6 text-sm text-white font-bold"
              >
                {savingDefaultSmsSettings ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-2" />
                    Saving Template...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} className="mr-2" />
                    Save & Apply Default Lead Template
                  </>
                )}
              </PillButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
