import { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/firebase';
import { doc, collection, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { 
  Activity, 
  Plus, 
  Trash2, 
  Check, 
  X, 
  Award,
  Users, 
  Edit3, 
  FileText
} from 'lucide-react';
import { tokens } from '../../lib/tokens';

interface DeliverableItem {
  id: string;
  text: string;
  completed: boolean;
}

interface ParkingLotItem {
  id: string;
  text: string;
  completed: boolean;
}

interface BizOpsDashboardData {
  weeklyTheme: {
    title: string;
    objectives: string[];
  };
  memberDeliverables: Record<string, DeliverableItem[]>;
  parkingLot: ParkingLotItem[];
}

const DEFAULT_DASHBOARD_DATA: BizOpsDashboardData = {
  weeklyTheme: {
    title: '🚀 Q2 Production Optimization & Lead Time Reductions',
    objectives: [
      'Reduce average screen print setup time by 15% across shifts',
      'Deploy QR tracking stickers for Shopify pick route validation',
      'Perform warehouse catalog inventory audit on SanMar blanks'
    ]
  },
  memberDeliverables: {
    'Austin': [
      { id: 'a1', text: 'Optimize Shopify pick routing algorithm code', completed: false },
      { id: 'a2', text: 'Integrate QR code generation for pallet bins', completed: true },
      { id: 'a3', text: 'Resolve inventory subtraction on double print requests', completed: false }
    ],
    'Taylor': [
      { id: 't1', text: 'Conduct weekly staff capacity planner evaluations', completed: false },
      { id: 't2', text: 'Set up print shop scheduling templates', completed: false }
    ],
    'Morgan': [
      { id: 'm1', text: 'Reconcile invoice payments with Stripe dashboard', completed: true },
      { id: 'm2', text: 'Review client portal quote requests list', completed: false }
    ],
    'Jordan': [
      { id: 'j1', text: 'Verify DTF supplies stock levels (film & adhesive)', completed: false },
      { id: 'j2', text: 'Audit SanMar warehouse 3D builder coordinates', completed: false }
    ]
  },
  parkingLot: [
    { id: 'p1', text: 'Explore Vercel serverless functions migration', completed: false },
    { id: 'p2', text: 'Upgrade to Next.js React 19 framework', completed: false },
    { id: 'p3', text: 'Design custom corporate branding swag stickers', completed: true }
  ]
};

export function BizOpsDashboard() {
  
  // Real-time Dashboard Data
  const [bizOpsData, setBizOpsData] = useState<BizOpsDashboardData | null>(null);
  const [dbMembers, setDbMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Expanded Card Modal States
  const [expandedCard, setExpandedCard] = useState<'theme' | 'member' | 'parking' | null>(null);
  const [selectedMemberName, setSelectedMemberName] = useState<string | null>(null);

  // Editing States (cloned when opening modals)
  const [editThemeTitle, setEditThemeTitle] = useState('');
  const [editObjectives, setEditObjectives] = useState<string[]>([]);
  const [newObjectiveText, setNewObjectiveText] = useState('');

  const [editDeliverables, setEditDeliverables] = useState<DeliverableItem[]>([]);
  const [newDeliverableText, setNewDeliverableText] = useState('');

  const [editParkingLot, setEditParkingLot] = useState<ParkingLotItem[]>([]);
  const [newParkingText, setNewParkingText] = useState('');

  // Firestore Sync: settings/bizOps Document
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'bizOps'), (docSnap) => {
      if (docSnap.exists()) {
        setBizOpsData(docSnap.data() as BizOpsDashboardData);
      } else {
        // Initialize settings document with defaults if not present
        setDoc(doc(db, 'settings', 'bizOps'), DEFAULT_DASHBOARD_DATA)
          .then(() => setBizOpsData(DEFAULT_DASHBOARD_DATA))
          .catch((err) => console.error('Failed to initialize settings/bizOps:', err));
      }
      setLoading(false);
    }, (err) => {
      console.error('Error listening to settings/bizOps:', err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // Firestore Sync: Users list to grab all bizOps members dynamically
  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const list: any[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.bizOps) {
          list.push({
            id: docSnap.id,
            name: data.name || data.email.split('@')[0],
            ...data
          });
        }
      });
      setDbMembers(list);
    });

    return () => unsubUsers();
  }, []);

  // Compute active members list (fallback to defaults if no bizOps profiles exist)
  const activeMembers = useMemo(() => {
    if (dbMembers.length > 0) {
      return dbMembers.map(m => m.name);
    }
    // Standard mock list
    return ['Austin', 'Taylor', 'Morgan', 'Jordan'];
  }, [dbMembers]);

  // Open Modals & clone states
  const openThemeModal = () => {
    if (!bizOpsData) return;
    setEditThemeTitle(bizOpsData.weeklyTheme.title);
    setEditObjectives([...bizOpsData.weeklyTheme.objectives]);
    setNewObjectiveText('');
    setExpandedCard('theme');
  };

  const openMemberModal = (memberName: string) => {
    if (!bizOpsData) return;
    const deliverables = bizOpsData.memberDeliverables[memberName] || [];
    setEditDeliverables([...deliverables]);
    setNewDeliverableText('');
    setSelectedMemberName(memberName);
    setExpandedCard('member');
  };

  const openParkingModal = () => {
    if (!bizOpsData) return;
    setEditParkingLot([...bizOpsData.parkingLot]);
    setNewParkingText('');
    setExpandedCard('parking');
  };

  // Save changes back to Firestore
  const handleSaveTheme = async () => {
    if (!bizOpsData) return;
    try {
      await updateDoc(doc(db, 'settings', 'bizOps'), {
        'weeklyTheme.title': editThemeTitle,
        'weeklyTheme.objectives': editObjectives.filter(o => o.trim() !== '')
      });
      setExpandedCard(null);
    } catch (err) {
      console.error('Failed to save theme settings:', err);
    }
  };

  const handleSaveMemberDeliverables = async () => {
    if (!bizOpsData || !selectedMemberName) return;
    try {
      const updatedDeliverables = {
        ...bizOpsData.memberDeliverables,
        [selectedMemberName]: editDeliverables
      };
      await updateDoc(doc(db, 'settings', 'bizOps'), {
        memberDeliverables: updatedDeliverables
      });
      setExpandedCard(null);
      setSelectedMemberName(null);
    } catch (err) {
      console.error('Failed to save deliverables:', err);
    }
  };

  const handleSaveParkingLot = async () => {
    if (!bizOpsData) return;
    try {
      await updateDoc(doc(db, 'settings', 'bizOps'), {
        parkingLot: editParkingLot
      });
      setExpandedCard(null);
    } catch (err) {
      console.error('Failed to save parking lot tasks:', err);
    }
  };

  // Loading indicator
  if (loading || !bizOpsData) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-brand-secondary">
        <div className="animate-spin mr-2"><Activity size={20} /></div> Loading Operations board...
      </div>
    );
  }

  return (
    <div className={tokens.layout.container + " space-y-10 max-w-6xl"}>
      {/* Header */}
      <div className={tokens.layout.pageHeader + " border-b border-brand-border pb-6"}>
        <div>
          <div className="flex items-center gap-3">
            <Activity className="text-purple-600 animate-pulse animate-duration-1000" size={28} />
            <h1 className={tokens.typography.h1 + " !text-purple-950 font-serif"}>Biz Ops Dashboard</h1>
          </div>
          <p className={tokens.typography.bodyMuted + " mt-2"}>
            Weekly business focus, team deliverables coordination, and backlog parking lot.
          </p>
        </div>
      </div>

      {/* TIER 1: WEEKLY THEME CARD (Full Width) */}
      <div 
        onClick={openThemeModal}
        className="w-full bg-gradient-to-r from-neutral-950 to-neutral-900 border border-neutral-800 text-white rounded-2xl p-8 shadow-xl hover:shadow-2xl hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer relative overflow-hidden group"
      >
        {/* Subtle glowing radial background */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-purple-500/15 transition-colors"></div>
        
        <div className="flex justify-between items-start">
          <div className="space-y-4 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-bold uppercase tracking-wider">
              <Award size={14} /> Weekly Focus Theme
            </div>
            <h2 className="text-3xl sm:text-4xl font-serif font-semibold tracking-tight leading-tight text-neutral-50">
              {bizOpsData.weeklyTheme.title}
            </h2>
            <div className="space-y-2.5 pt-3">
              {bizOpsData.weeklyTheme.objectives.map((obj, index) => (
                <div key={index} className="flex items-start gap-3 text-neutral-300">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-purple-500/25 text-purple-300 font-bold text-xs shrink-0 mt-0.5">
                    {index + 1}
                  </span>
                  <span className="text-sm sm:text-base leading-relaxed">{obj}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="shrink-0 p-2 bg-neutral-800/80 border border-neutral-700/60 rounded-xl text-neutral-400 group-hover:text-purple-400 transition-colors">
            <Edit3 size={18} />
          </div>
        </div>
      </div>

      {/* TIER 2: NAME CARDS ROW (Side-by-Side Dynamic Grid) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase font-extrabold tracking-widest text-brand-secondary flex items-center gap-2">
            <Users size={14} className="text-purple-600" /> Member Deliverables
          </h3>
          <span className="text-[10px] text-brand-secondary font-semibold">Click cards to edit deliverables</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {activeMembers.map((name) => {
            const deliverables = bizOpsData.memberDeliverables[name] || [];
            const completed = deliverables.filter(d => d.completed).length;
            const total = deliverables.length;
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

            return (
              <div 
                key={name}
                onClick={() => openMemberModal(name)}
                className="bg-white border border-brand-border rounded-2xl p-6 shadow-sm hover:shadow-lg hover:scale-[1.03] active:scale-[0.98] transition-all cursor-pointer flex flex-col justify-between min-h-[220px] group relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-neutral-200 group-hover:bg-purple-600 transition-colors"></div>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-700 border border-purple-100 flex items-center justify-center font-bold text-sm shadow-sm group-hover:bg-purple-600 group-hover:text-white transition-colors">
                      {name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-serif text-lg font-semibold text-brand-primary group-hover:text-purple-950 transition-colors">
                        {name}
                      </h4>
                      <p className="text-[10px] text-brand-secondary font-semibold uppercase tracking-wider">
                        Biz Ops Member
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {deliverables.slice(0, 3).map((d) => (
                      <div key={d.id} className="flex items-start gap-2 text-xs">
                        <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center mt-0.5 shrink-0 ${
                          d.completed 
                            ? 'bg-purple-500 border-purple-500 text-white' 
                            : 'border-neutral-300'
                        }`}>
                          {d.completed && <Check size={10} strokeWidth={3} />}
                        </span>
                        <span className={`leading-snug truncate ${d.completed ? 'line-through text-brand-secondary opacity-60' : 'text-brand-primary font-medium'}`}>
                          {d.text}
                        </span>
                      </div>
                    ))}
                    {total === 0 && (
                      <p className="text-xs text-brand-secondary italic">No deliverables assigned.</p>
                    )}
                    {total > 3 && (
                      <p className="text-[10px] text-purple-600 font-bold uppercase tracking-wider pt-1">
                        + {total - 3} more deliverables
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-brand-border/60 mt-4 flex items-center justify-between text-[11px] font-bold">
                  <span className="text-brand-secondary">
                    {completed}/{total} Completed
                  </span>
                  <span className="text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* TIER 3: PARKING LOT CARD (Full Width) */}
      <div 
        onClick={openParkingModal}
        className="w-full bg-gradient-to-r from-neutral-900 to-neutral-950 border border-neutral-800 text-white rounded-2xl p-8 shadow-xl hover:shadow-2xl hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer relative overflow-hidden group"
      >
        <div className="absolute top-0 right-0 w-80 h-80 bg-neutral-500/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex justify-between items-start">
          <div className="space-y-4 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700/60 text-neutral-300 text-xs font-bold uppercase tracking-wider">
              <FileText size={14} /> Parking Lot Backlog
            </div>
            <div>
              <h2 className="text-2xl font-serif font-semibold text-neutral-50">
                Non-Essential Backlog Tasks
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                Tasks that are not required for this week's theme but should get completed if team members have downtime.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 pt-3">
              {bizOpsData.parkingLot.slice(0, 4).map((task) => (
                <div key={task.id} className="flex items-center gap-3 text-xs text-neutral-300">
                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    task.completed 
                      ? 'bg-neutral-700 border-neutral-600 text-neutral-400' 
                      : 'border-neutral-700 bg-neutral-900'
                  }`}>
                    {task.completed && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span className={`truncate leading-relaxed ${task.completed ? 'line-through text-neutral-500' : 'text-neutral-200'}`}>
                    {task.text}
                  </span>
                </div>
              ))}
              {bizOpsData.parkingLot.length === 0 && (
                <p className="text-xs text-neutral-400 italic">No tasks in the parking lot.</p>
              )}
            </div>
            {bizOpsData.parkingLot.length > 4 && (
              <p className="text-[10px] text-neutral-400 font-extrabold uppercase tracking-widest pt-1">
                + {bizOpsData.parkingLot.length - 4} more backlog items
              </p>
            )}
          </div>

          <div className="shrink-0 p-2 bg-neutral-800/80 border border-neutral-700/60 rounded-xl text-neutral-400 group-hover:text-purple-400 transition-colors">
            <Edit3 size={18} />
          </div>
        </div>
      </div>

      {/* --- MODAL DIALOGS --- */}

      {/* MODAL 1: WEEKLY THEME EDIT */}
      {expandedCard === 'theme' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-brand-border shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-brand-border flex items-center justify-between">
              <div>
                <h3 className="font-serif text-xl font-bold text-brand-primary">Edit Weekly Focus Theme</h3>
                <p className="text-xs text-brand-secondary mt-0.5">Define this week's title and key objectives.</p>
              </div>
              <button 
                onClick={() => setExpandedCard(null)}
                className="p-1 rounded-lg text-brand-secondary hover:bg-neutral-100 hover:text-brand-primary transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              <div>
                <label className="block text-xs uppercase font-extrabold tracking-wider text-brand-secondary mb-1">Theme Title</label>
                <input
                  type="text"
                  value={editThemeTitle}
                  onChange={(e) => setEditThemeTitle(e.target.value)}
                  className="w-full text-sm border border-brand-border rounded-lg px-3 py-2 outline-none focus:border-purple-600 font-medium text-brand-primary"
                  placeholder="e.g. Optimize Screen Printing Setup & Inventory"
                />
              </div>

              <div className="space-y-3">
                <label className="block text-xs uppercase font-extrabold tracking-wider text-brand-secondary">Weekly Objectives</label>
                
                {editObjectives.map((obj, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-purple-50 text-purple-700 text-[10px] font-bold shrink-0">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={obj}
                      onChange={(e) => {
                        const copy = [...editObjectives];
                        copy[idx] = e.target.value;
                        setEditObjectives(copy);
                      }}
                      className="flex-1 text-xs border border-brand-border rounded-lg px-3 py-1.5 outline-none focus:border-purple-600"
                    />
                    <button
                      onClick={() => setEditObjectives(prev => prev.filter((_, i) => i !== idx))}
                      className="p-1.5 text-neutral-400 hover:text-red-600 rounded-md transition-colors"
                      title="Remove objective"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}

                <div className="flex gap-2 pt-2">
                  <input
                    type="text"
                    value={newObjectiveText}
                    onChange={(e) => setNewObjectiveText(e.target.value)}
                    placeholder="Add a new objective..."
                    className="flex-1 text-xs border border-brand-border rounded-lg px-3 py-1.5 outline-none focus:border-purple-600"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newObjectiveText.trim()) return;
                      setEditObjectives(prev => [...prev, newObjectiveText.trim()]);
                      setNewObjectiveText('');
                    }}
                    className="bg-purple-900 hover:bg-black text-white text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                  >
                    <Plus size={12} /> Add
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-brand-border flex justify-end gap-3 bg-brand-bg/40">
              <button 
                onClick={() => setExpandedCard(null)}
                className="px-4 py-2 border border-brand-border rounded-lg text-xs font-bold text-brand-primary hover:bg-neutral-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveTheme}
                className="px-4 py-2 bg-purple-900 hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors"
              >
                Save Theme Focus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: MEMBER DELIVERABLES CHECKLIST */}
      {expandedCard === 'member' && selectedMemberName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-brand-border shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-brand-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm">
                  {selectedMemberName.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-serif text-xl font-bold text-brand-primary">{selectedMemberName}'s Deliverables</h3>
                  <p className="text-xs text-brand-secondary mt-0.5">Coordinate actions to support the weekly theme.</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setExpandedCard(null);
                  setSelectedMemberName(null);
                }}
                className="p-1 rounded-lg text-brand-secondary hover:bg-neutral-100 hover:text-brand-primary transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="divide-y divide-brand-border/60">
                {editDeliverables.map((item, idx) => (
                  <div key={item.id} className="py-3 flex items-center justify-between gap-3 group">
                    <label className="flex items-start gap-3 cursor-pointer select-none min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={() => {
                          const copy = [...editDeliverables];
                          copy[idx] = { ...item, completed: !item.completed };
                          setEditDeliverables(copy);
                        }}
                        className="rounded border-neutral-300 text-purple-600 focus:ring-purple-600 mt-1 cursor-pointer"
                      />
                      <span className={`text-sm leading-snug ${item.completed ? 'line-through text-brand-secondary opacity-60' : 'text-brand-primary font-medium'}`}>
                        {item.text}
                      </span>
                    </label>
                    
                    <button
                      onClick={() => setEditDeliverables(prev => prev.filter(d => d.id !== item.id))}
                      className="p-1.5 text-neutral-400 hover:text-red-600 rounded-md transition-colors"
                      title="Remove deliverable"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {editDeliverables.length === 0 && (
                  <div className="py-8 text-center text-brand-secondary text-xs italic">
                    No deliverables assigned. Add one below!
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-4 border-t border-brand-border/40">
                <input
                  type="text"
                  value={newDeliverableText}
                  onChange={(e) => setNewDeliverableText(e.target.value)}
                  placeholder="Add a new weekly deliverable..."
                  className="flex-1 text-xs border border-brand-border rounded-lg px-3 py-1.5 outline-none focus:border-purple-600"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newDeliverableText.trim()) return;
                    const newItem: DeliverableItem = {
                      id: `deliv-${Date.now()}-${Math.random()}`,
                      text: newDeliverableText.trim(),
                      completed: false
                    };
                    setEditDeliverables(prev => [...prev, newItem]);
                    setNewDeliverableText('');
                  }}
                  className="bg-purple-900 hover:bg-black text-white text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                >
                  <Plus size={12} /> Add
                </button>
              </div>
            </div>

            <div className="p-6 border-t border-brand-border flex justify-end gap-3 bg-brand-bg/40">
              <button 
                onClick={() => {
                  setExpandedCard(null);
                  setSelectedMemberName(null);
                }}
                className="px-4 py-2 border border-brand-border rounded-lg text-xs font-bold text-brand-primary hover:bg-neutral-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveMemberDeliverables}
                className="px-4 py-2 bg-purple-900 hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors"
              >
                Save Deliverables
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: PARKING LOT BACKLOG */}
      {expandedCard === 'parking' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-brand-border shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-brand-border flex items-center justify-between">
              <div>
                <h3 className="font-serif text-xl font-bold text-brand-primary">Manage Parking Lot Backlog</h3>
                <p className="text-xs text-brand-secondary mt-0.5">Non-essential tasks to grab when core weekly theme deliverables are completed.</p>
              </div>
              <button 
                onClick={() => setExpandedCard(null)}
                className="p-1 rounded-lg text-brand-secondary hover:bg-neutral-100 hover:text-brand-primary transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="divide-y divide-brand-border/60">
                {editParkingLot.map((item, idx) => (
                  <div key={item.id} className="py-3 flex items-center justify-between gap-3 group">
                    <label className="flex items-start gap-3 cursor-pointer select-none min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={() => {
                          const copy = [...editParkingLot];
                          copy[idx] = { ...item, completed: !item.completed };
                          setEditParkingLot(copy);
                        }}
                        className="rounded border-neutral-300 text-purple-600 focus:ring-purple-600 mt-1 cursor-pointer"
                      />
                      <span className={`text-sm leading-snug ${item.completed ? 'line-through text-brand-secondary opacity-60' : 'text-brand-primary font-medium'}`}>
                        {item.text}
                      </span>
                    </label>
                    
                    <button
                      onClick={() => setEditParkingLot(prev => prev.filter(p => p.id !== item.id))}
                      className="p-1.5 text-neutral-400 hover:text-red-600 rounded-md transition-colors"
                      title="Remove task"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {editParkingLot.length === 0 && (
                  <div className="py-8 text-center text-brand-secondary text-xs italic">
                    Parking lot is empty. Add tasks below!
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-4 border-t border-brand-border/40">
                <input
                  type="text"
                  value={newParkingText}
                  onChange={(e) => setNewParkingText(e.target.value)}
                  placeholder="Add a backlog item to the parking lot..."
                  className="flex-1 text-xs border border-brand-border rounded-lg px-3 py-1.5 outline-none focus:border-purple-600"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newParkingText.trim()) return;
                    const newItem: ParkingLotItem = {
                      id: `park-${Date.now()}-${Math.random()}`,
                      text: newParkingText.trim(),
                      completed: false
                    };
                    setEditParkingLot(prev => [...prev, newItem]);
                    setNewParkingText('');
                  }}
                  className="bg-purple-900 hover:bg-black text-white text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                >
                  <Plus size={12} /> Add
                </button>
              </div>
            </div>

            <div className="p-6 border-t border-brand-border flex justify-end gap-3 bg-brand-bg/40">
              <button 
                onClick={() => setExpandedCard(null)}
                className="px-4 py-2 border border-brand-border rounded-lg text-xs font-bold text-brand-primary hover:bg-neutral-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveParkingLot}
                className="px-4 py-2 bg-purple-900 hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors"
              >
                Save Backlog
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
