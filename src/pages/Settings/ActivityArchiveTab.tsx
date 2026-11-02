import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import {
  Archive,
  ArrowRight,
  Clock,
  ExternalLink,
  Filter,
  Search,
  Shirt,
  ShoppingBag,
  Sparkles,
  Trash2,
  UserCheck,
  X
} from 'lucide-react';
import { db } from '../../lib/firebase';
import {
  ACTIVITY_POPUPS_DOC_ID,
  ActivityPopupEvent
} from '../../lib/roleActivityTracker';
import { useOrders } from '../../hooks/useOrders';
import { useCustomers } from '../../hooks/useCustomers';
import { useAuth } from '../../contexts/AuthContext';

type CategoryFilter = 'all' | 'sales_order' | 'designer_rack' | 'designer_platform';

function formatExactDateTime(ms: number): string {
  try {
    return new Date(ms).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

function formatRelativeTime(ms: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 45) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(ms).toLocaleDateString();
}

export function ActivityArchiveTab() {
  const navigate = useNavigate();
  const { userData } = useAuth();
  const { orders } = useOrders();
  const { customers } = useCustomers();

  const [storedEvents, setStoredEvents] = useState<ActivityPopupEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [actorFilter, setActorFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [clearingArchive, setClearingArchive] = useState(false);

  const isAdmin =
    userData?.role?.toLowerCase() === 'admin' ||
    userData?.role?.toLowerCase() === 'leadership';

  // Subscribe to settings/activityPopups for the master archive list
  useEffect(() => {
    const ref = doc(db, 'settings', ACTIVITY_POPUPS_DOC_ID);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists() && Array.isArray(snap.data()?.events)) {
          setStoredEvents(snap.data().events as ActivityPopupEvent[]);
        } else {
          setStoredEvents([]);
        }
        setLoading(false);
      },
      (err) => {
        console.debug('Error reading settings/activityPopups in archive:', err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Merge storedEvents with any lastActivityPopup attached directly to orders or customers
  const allEvents = useMemo(() => {
    const byId = new Map<string, ActivityPopupEvent>();

    storedEvents.forEach((ev) => {
      if (ev && ev.id) {
        byId.set(ev.id, ev);
      }
    });

    orders.forEach((o: any) => {
      const ev = o?.lastActivityPopup as ActivityPopupEvent | undefined;
      if (ev && ev.id && !byId.has(ev.id)) {
        byId.set(ev.id, ev);
      }
    });

    customers.forEach((c: any) => {
      const ev = c?.lastActivityPopup as ActivityPopupEvent | undefined;
      if (ev && ev.id && !byId.has(ev.id)) {
        byId.set(ev.id, ev);
      }
    });

    return Array.from(byId.values()).sort(
      (a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)
    );
  }, [storedEvents, orders, customers]);

  // Unique actors & roles for filter dropdowns
  const uniqueActors = useMemo(() => {
    const set = new Set<string>();
    allEvents.forEach((e) => {
      if (e.actorName) set.add(e.actorName);
    });
    return Array.from(set).sort();
  }, [allEvents]);

  const uniqueRoles = useMemo(() => {
    const set = new Set<string>();
    allEvents.forEach((e) => {
      if (e.actorRole) set.add(e.actorRole);
    });
    return Array.from(set).sort();
  }, [allEvents]);

  // Counts by category
  const counts = useMemo(() => {
    let salesOrder = 0;
    let designerRack = 0;
    let designerPlatform = 0;
    allEvents.forEach((e) => {
      if (e.category === 'sales_order') salesOrder++;
      else if (e.category === 'designer_rack') designerRack++;
      else if (e.category === 'designer_platform') designerPlatform++;
    });
    return {
      total: allEvents.length,
      salesOrder,
      designerRack,
      designerPlatform
    };
  }, [allEvents]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allEvents.filter((ev) => {
      if (categoryFilter !== 'all' && ev.category !== categoryFilter) {
        return false;
      }
      if (roleFilter !== 'all' && ev.actorRole !== roleFilter) {
        return false;
      }
      if (actorFilter !== 'all' && ev.actorName !== actorFilter) {
        return false;
      }
      if (q) {
        const detailsText = Array.isArray(ev.changeDetails)
          ? ev.changeDetails
              .map((d) => `${d.field || ''} ${d.before || ''} ${d.after || ''} ${d.summary || ''}`)
              .join(' ')
          : '';
        const haystack = [
          ev.actionTitle,
          ev.actionSummary,
          ev.targetLabel,
          ev.actorName,
          ev.actorEmail,
          ev.actorRole,
          ev.designTitle,
          detailsText
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [allEvents, categoryFilter, roleFilter, actorFilter, searchQuery]);

  const handleRemoveEntry = async (eventId: string) => {
    try {
      const next = storedEvents.filter((e) => e.id !== eventId);
      await setDoc(
        doc(db, 'settings', ACTIVITY_POPUPS_DOC_ID),
        {
          events: next,
          updatedAt: new Date().toISOString(),
          updatedAtMs: Date.now()
        },
        { merge: true }
      );
    } catch (err) {
      console.error('Failed to remove archive entry:', err);
    }
  };

  const handleClearStoredArchive = async () => {
    if (!window.confirm('Clear stored popup archive history from settings?')) return;
    setClearingArchive(true);
    try {
      await setDoc(
        doc(db, 'settings', ACTIVITY_POPUPS_DOC_ID),
        {
          events: [],
          updatedAt: new Date().toISOString(),
          updatedAtMs: Date.now()
        },
        { merge: true }
      );
    } catch (err) {
      console.error('Failed to clear archive:', err);
    } finally {
      setClearingArchive(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-brand-border rounded-card p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-neutral-900 text-white flex items-center justify-center shrink-0">
                <Archive size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-brand-primary leading-tight">
                  Sales &amp; Designer Activity Archive
                </h2>
                <p className="text-xs text-brand-secondary mt-0.5">
                  Complete audit log of every order edit, Designer Rack addition/update, and platform change that triggers an Admin/Staff pop-up.
                </p>
              </div>
            </div>
          </div>

          {isAdmin && storedEvents.length > 0 && (
            <button
              type="button"
              onClick={handleClearStoredArchive}
              disabled={clearingArchive}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 transition-colors self-start sm:self-auto cursor-pointer"
            >
              <Trash2 size={14} />
              <span>{clearingArchive ? 'Clearing...' : 'Clear Stored History'}</span>
            </button>
          )}
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
              categoryFilter === 'all'
                ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
                : 'bg-neutral-50 hover:bg-neutral-100 text-brand-primary border-neutral-200'
            }`}
          >
            <div className="text-[10px] font-extrabold uppercase tracking-wider opacity-75">
              All Logged Updates
            </div>
            <div className="text-2xl font-black mt-1">{counts.total}</div>
          </button>

          <button
            type="button"
            onClick={() => setCategoryFilter('sales_order')}
            className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
              categoryFilter === 'sales_order'
                ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                : 'bg-amber-50/60 hover:bg-amber-50 text-amber-950 border-amber-200'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider opacity-80">
              <ShoppingBag size={12} />
              <span>Sales Order Updates</span>
            </div>
            <div className="text-2xl font-black mt-1">{counts.salesOrder}</div>
          </button>

          <button
            type="button"
            onClick={() => setCategoryFilter('designer_rack')}
            className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
              categoryFilter === 'designer_rack'
                ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                : 'bg-purple-50/60 hover:bg-purple-50 text-purple-950 border-purple-200'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider opacity-80">
              <Sparkles size={12} />
              <span>Designer Rack Updates</span>
            </div>
            <div className="text-2xl font-black mt-1">{counts.designerRack}</div>
          </button>

          <button
            type="button"
            onClick={() => setCategoryFilter('designer_platform')}
            className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
              categoryFilter === 'designer_platform'
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-blue-50/60 hover:bg-blue-50 text-blue-950 border-blue-200'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider opacity-80">
              <Shirt size={12} />
              <span>Designer Platform Edits</span>
            </div>
            <div className="text-2xl font-black mt-1">{counts.designerPlatform}</div>
          </button>
        </div>

        {/* Search & Filter Controls */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 mt-5 pt-5 border-t border-neutral-100">
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by order, customer, team member, or specific field updated..."
              className="w-full pl-9 pr-8 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:bg-white focus:border-neutral-900 transition-colors"
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
            <div className="inline-flex items-center gap-1.5 text-xs text-neutral-500 font-semibold mr-1">
              <Filter size={13} />
              <span>Filters:</span>
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 text-xs font-semibold bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-800 focus:outline-none focus:border-neutral-900"
            >
              <option value="all">All Roles</option>
              {uniqueRoles.map((role) => (
                <option key={role} value={role}>
                  Role: {role}
                </option>
              ))}
            </select>

            <select
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              className="px-3 py-2 text-xs font-semibold bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-800 focus:outline-none focus:border-neutral-900"
            >
              <option value="all">All Team Members</option>
              {uniqueActors.map((actor) => (
                <option key={actor} value={actor}>
                  {actor}
                </option>
              ))}
            </select>

            {(categoryFilter !== 'all' ||
              roleFilter !== 'all' ||
              actorFilter !== 'all' ||
              searchQuery.trim() !== '') && (
              <button
                type="button"
                onClick={() => {
                  setCategoryFilter('all');
                  setRoleFilter('all');
                  setActorFilter('all');
                  setSearchQuery('');
                }}
                className="px-2.5 py-2 text-xs font-bold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Archive List */}
      {loading ? (
        <div className="bg-white border border-brand-border rounded-card p-12 text-center text-sm text-brand-secondary">
          Loading activity archive...
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="bg-white border border-brand-border rounded-card p-12 text-center">
          <Archive size={28} className="mx-auto text-neutral-300 mb-2" />
          <p className="text-sm font-bold text-brand-primary">No matching activity updates found</p>
          <p className="text-xs text-brand-secondary mt-1">
            Whenever a Sales or Designer team member updates an order, Designer Rack, or customer setting, the full breakdown of what changed will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEvents.map((event) => {
            const isRack = event.category === 'designer_rack';
            const isSalesOrder = event.category === 'sales_order';
            const accentClass = isRack
              ? 'border-l-4 border-l-purple-600'
              : isSalesOrder
                ? 'border-l-4 border-l-amber-500'
                : 'border-l-4 border-l-blue-600';
            const badgeClass = isRack
              ? 'bg-purple-50 text-purple-800 border-purple-200'
              : isSalesOrder
                ? 'bg-amber-50 text-amber-900 border-amber-200'
                : 'bg-blue-50 text-blue-800 border-blue-200';
            const details = Array.isArray(event.changeDetails) ? event.changeDetails : [];

            return (
              <div
                key={event.id}
                className={`bg-white border border-neutral-200 rounded-2xl p-5 shadow-xs hover:shadow-md transition-shadow ${accentClass}`}
              >
                {/* Top Metadata Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-100">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider border ${badgeClass}`}
                    >
                      {isRack ? (
                        <Sparkles size={11} className="shrink-0" />
                      ) : isSalesOrder ? (
                        <ShoppingBag size={11} className="shrink-0" />
                      ) : (
                        <Shirt size={11} className="shrink-0" />
                      )}
                      <span>{event.actionTitle}</span>
                    </span>

                    {/* Actor Pill */}
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-900 text-xs font-bold">
                      <span className="w-4 h-4 rounded-full bg-neutral-900 text-white text-[9px] font-black flex items-center justify-center uppercase">
                        {(event.actorName || 'U').substring(0, 2)}
                      </span>
                      <span>{event.actorName}</span>
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-white border border-neutral-200 text-neutral-700">
                        <UserCheck size={9} />
                        <span>{event.actorRole}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-neutral-500">
                    <span className="inline-flex items-center gap-1 font-medium">
                      <Clock size={12} className="text-neutral-400" />
                      <span>{formatExactDateTime(event.createdAtMs)}</span>
                      <span className="text-[10px] font-bold text-neutral-400">
                        ({formatRelativeTime(event.createdAtMs)})
                      </span>
                    </span>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleRemoveEntry(event.id)}
                        title="Remove entry from stored archive"
                        className="p-1 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Main Body */}
                <div className="flex flex-col sm:flex-row items-start justify-between gap-4 pt-3.5">
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    {event.mockupUrl && (
                      <div className="w-16 h-16 rounded-xl border border-neutral-200 bg-neutral-50 p-1.5 flex items-center justify-center shrink-0 overflow-hidden">
                        <img
                          src={event.mockupUrl}
                          alt={event.designTitle || event.targetLabel}
                          className="w-full h-full object-contain mix-blend-multiply"
                        />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-black text-neutral-900">
                          {event.targetLabel}
                        </h3>
                        {event.designTitle && (
                          <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-200 text-[10px] font-bold">
                            Design: {event.designTitle}
                          </span>
                        )}
                      </div>

                      <p className="text-xs font-semibold text-neutral-700 mt-1 leading-relaxed">
                        {event.actionSummary}
                      </p>

                      {/* Granular Field-by-Field Breakdown */}
                      {details.length > 0 && (
                        <div className="mt-3 bg-neutral-50 border border-neutral-200/80 rounded-xl p-3 space-y-2">
                          <div className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-500">
                            Specific Updates &amp; Additions ({details.length})
                          </div>
                          <ul className="space-y-1.5">
                            {details.map((item, idx) => (
                              <li
                                key={`${event.id}_detail_${idx}`}
                                className="text-xs flex flex-wrap items-center gap-1.5 text-neutral-800"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 shrink-0" />
                                <span className="font-extrabold text-neutral-900">
                                  {item.field}:
                                </span>
                                {item.before !== undefined && item.after !== undefined ? (
                                  <span className="inline-flex flex-wrap items-center gap-1.5">
                                    <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200/70 line-through text-[11px] font-medium">
                                      {item.before}
                                    </span>
                                    <ArrowRight size={11} className="text-neutral-400 shrink-0" />
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200/70 text-[11px] font-bold">
                                      {item.after}
                                    </span>
                                  </span>
                                ) : item.after !== undefined ? (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200/70 text-[11px] font-bold">
                                    {item.after}
                                  </span>
                                ) : (
                                  <span className="text-neutral-700 font-medium">
                                    {item.summary}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => navigate(event.targetRoute)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-neutral-900 hover:bg-neutral-800 text-white shadow-xs transition-colors cursor-pointer"
                    >
                      <span>
                        {isRack
                          ? 'Open Designer Rack'
                          : event.targetType === 'order'
                            ? 'Open Order'
                            : event.targetType === 'customer'
                              ? 'Open Customer'
                              : 'View Target'}
                      </span>
                      <ExternalLink size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
