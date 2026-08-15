import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { type VisitorSession } from '../../lib/visitorTracking';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
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
  Trash2
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

export function VisitorFunnelPage() {
  const [sessions, setSessions] = useState<VisitorSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [timeRange, setTimeRange] = useState<'Today' | '7 Days' | '30 Days' | 'All Time'>('7 Days');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Converted' | 'Dropped Off'>('All');
  const [selectedVisitor, setSelectedVisitor] = useState<VisitorSession | null>(null);

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
        setLoading(false);
      },
      (err) => {
        console.warn('Error listening to visitor_sessions:', err);
        setLoading(false);
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

  // Timeframe filter logic
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
      // Date filter
      if (minTime > 0) {
        const lastSeenTime = new Date(s.lastSeen || s.firstSeen).getTime();
        if (lastSeenTime < minTime) return false;
      }

      // Status filter
      if (statusFilter === 'Converted' && !s.convertedQuote && !s.convertedAccount) return false;
      if (statusFilter === 'Dropped Off' && (s.convertedQuote || s.convertedAccount)) return false;

      // Search filter
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

  // Calculated Funnel Metrics
  const totalVisitors = filteredSessions.length;
  const convertedQuoteCount = useMemo(() => filteredSessions.filter((s) => s.convertedQuote).length, [filteredSessions]);
  const convertedAccountCount = useMemo(() => filteredSessions.filter((s) => s.convertedAccount).length, [filteredSessions]);
  const overallConversionRate = totalVisitors > 0 ? ((convertedQuoteCount / totalVisitors) * 100).toFixed(1) : '0.0';

  // Step counts for Funnel Stage progression
  const stageCounts = useMemo(() => {
    return FUNNEL_STAGES.map((stage) => {
      const reachedCount = filteredSessions.filter((s) => (s.furthestStep ?? 0) >= stage.step).length;
      const percentage = totalVisitors > 0 ? Math.round((reachedCount / totalVisitors) * 100) : 0;
      return { ...stage, count: reachedCount, percentage };
    });
  }, [filteredSessions, totalVisitors]);

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
      {/* Header */}
      <div className={tokens.layout.pageHeader}>
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-brand-primary/5 border border-brand-primary/10 rounded-xl text-brand-primary">
              <TrendingUp size={22} strokeWidth={2} />
            </div>
            <div>
              <h1 className={tokens.typography.h1}>Public Visitor Funnel</h1>
              <p className={tokens.typography.bodyMuted + " mt-1"}>
                Real-time tracking of unique visitors from <code className="px-1.5 py-0.5 bg-slate-100 rounded text-brand-primary font-mono text-xs">/start2</code> through quote submission and account creation.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            options={['Today', '7 Days', '30 Days', 'All Time']}
            value={timeRange}
            onChange={(val) => setTimeRange(val as any)}
          />
        </div>
      </div>

      {/* Top Stat Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
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

      {/* Visual Funnel Progression */}
      <div className="mt-6 bg-white border border-brand-border rounded-xl p-6 shadow-xs">
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

                {/* Progress Bar Container */}
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

      {/* Visitor Session Table Section */}
      <div className="mt-8 bg-white border border-brand-border rounded-xl shadow-xs overflow-hidden">
        {/* Table Header & Controls */}
        <div className="p-4 sm:p-5 border-b border-brand-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-serif font-semibold text-brand-primary">Unique Visitor Logs</h2>
            <span className="text-xs font-medium px-2.5 py-0.5 bg-slate-100 text-brand-secondary rounded-full border border-slate-200">
              {filteredSessions.length} sessions
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
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

            {/* Status Filter */}
            <SegmentedControl
              options={['All', 'Converted', 'Dropped Off']}
              value={statusFilter}
              onChange={(val) => setStatusFilter(val as any)}
            />
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
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
                  <th className="py-3 px-4">Furthest Step Reached</th>
                  <th className="py-3 px-4">Contact & Identity</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border text-xs">
                {filteredSessions.map((session) => {
                  return (
                    <tr 
                      key={session.visitorId} 
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                      onClick={() => setSelectedVisitor(session)}
                    >
                      {/* Visitor ID & Device */}
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

                      {/* Timestamps */}
                      <td className="py-3.5 px-4 text-brand-secondary">
                        <div>
                          <span className="font-medium text-brand-primary">{formatTimeAgo(session.lastSeen)}</span>
                        </div>
                        <div className="text-[11px] text-brand-muted mt-0.5">
                          First seen {new Date(session.firstSeen || session.lastSeen).toLocaleDateString()}
                        </div>
                      </td>

                      {/* Furthest Step */}
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${
                          session.furthestStep >= 5 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                            : session.furthestStep >= 2
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                          {session.furthestStepName || `Step ${session.furthestStep}`}
                        </span>
                      </td>

                      {/* Contact Info */}
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

                      {/* Status */}
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

                      {/* Action */}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Visitor Timeline Modal */}
      {selectedVisitor && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[200] animate-in fade-in duration-200">
          <div className="bg-white border border-brand-border rounded-2xl p-6 max-w-2xl w-full max-h-[85vh] flex flex-col shadow-xl">
            {/* Header */}
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

            {/* Details Bar */}
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

            {/* Chronological Event Stream */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 my-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-muted mb-2">Event Timeline</h4>
              {selectedVisitor.events && selectedVisitor.events.length > 0 ? (
                <div className="relative border-l-2 border-slate-200 ml-3 pl-4 space-y-4">
                  {selectedVisitor.events.map((evt, i) => (
                    <div key={evt.id || i} className="relative">
                      {/* Circle indicator */}
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

            {/* Footer */}
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
    </div>
  );
}
