import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
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
  Phone
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
  const [sendingSmsId, setSendingSmsId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<MetaLead | null>(null);
  const [leadSearchQuery, setLeadSearchQuery] = useState('');
  const [leadSmsFilter, setLeadSmsFilter] = useState<'All' | 'Text Sent' | 'Uncontacted'>('All');

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

  // Manual Send SMS via Quo API Call
  const handleSendLeadSMS = async (lead: MetaLead, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!lead.phone) {
      alert('This lead does not have a phone number attached.');
      return;
    }

    setSendingSmsId(lead.id);
    try {
      const res = await sendMetaLeadSMS(lead);
      if (res.success) {
        alert(`SMS text sent successfully to ${lead.name} (${lead.phone}) via Quo!`);
      } else {
        alert(`Failed to send SMS via Quo: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Error sending text: ${err.message || 'Unknown error'}`);
    } finally {
      setSendingSmsId(null);
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
                    <tr className="bg-slate-50/80 border-b border-brand-border text-[11px] font-semibold text-brand-muted uppercase tracking-wider">
                      <th className="py-3 px-4">Lead Contact</th>
                      <th className="py-3 px-4">Phone & Email</th>
                      <th className="py-3 px-4">Ad / Form Name</th>
                      <th className="py-3 px-4">Captured Date</th>
                      <th className="py-3 px-4">SMS Status (Quo)</th>
                      <th className="py-3 px-4 text-right">Manual Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border text-xs">
                    {filteredMetaLeads.map((lead) => (
                      <tr 
                        key={lead.id} 
                        className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                        onClick={() => setSelectedLead(lead)}
                      >
                        {/* Name */}
                        <td className="py-3.5 px-4 font-medium text-brand-primary">
                          <div className="text-sm font-semibold">{lead.name}</div>
                          <div className="text-[11px] text-brand-muted font-mono">ID: {lead.leadId.substring(0, 10)}...</div>
                        </td>

                        {/* Phone & Email */}
                        <td className="py-3.5 px-4 text-brand-secondary">
                          <div className="flex items-center gap-1 text-brand-primary font-mono">
                            <Phone size={12} className="text-brand-muted" />
                            {lead.phone || <span className="text-brand-muted italic font-sans">No Phone</span>}
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-brand-muted mt-0.5 truncate max-w-[200px]">
                            <Mail size={12} className="shrink-0" />
                            {lead.email || 'No email'}
                          </div>
                        </td>

                        {/* Ad & Form */}
                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-brand-primary block">{lead.adName || 'Meta Ad'}</span>
                          <span className="text-[11px] text-brand-muted">{lead.formName || 'Lead Form'}</span>
                        </td>

                        {/* Timestamp */}
                        <td className="py-3.5 px-4 text-brand-secondary">
                          <div>{formatTimeAgo(lead.createdAt)}</div>
                          <div className="text-[11px] text-brand-muted mt-0.5">
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

                        {/* Manual SMS Action Button */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={(e) => handleSendLeadSMS(lead, e)}
                              disabled={sendingSmsId === lead.id || !lead.phone}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-2xs ${
                                lead.smsStatus === 'sent'
                                  ? 'bg-slate-100 text-brand-primary hover:bg-slate-200 border border-slate-200'
                                  : 'bg-brand-primary text-white hover:bg-black'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              {sendingSmsId === lead.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Send size={13} />
                              )}
                              {lead.smsStatus === 'sent' ? 'Resend SMS' : 'Send SMS via Quo'}
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
                  onClick={(e) => handleSendLeadSMS(selectedLead, e)}
                  disabled={sendingSmsId === selectedLead.id || !selectedLead.phone}
                >
                  {sendingSmsId === selectedLead.id ? (
                    <Loader2 size={14} className="animate-spin mr-1.5" />
                  ) : (
                    <Send size={14} className="mr-1.5" />
                  )}
                  Send SMS via Quo
                </PillButton>
                <PillButton variant="outline" onClick={() => setSelectedLead(null)}>
                  Close
                </PillButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
