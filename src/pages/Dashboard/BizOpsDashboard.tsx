import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { doc, collection, onSnapshot, setDoc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { 
  Activity, 
  Plus, 
  Trash2, 
  Check, 
  X, 
  Award,
  Users, 
  Edit3, 
  FileText,
  ArrowRight
} from 'lucide-react';
import { tokens } from '../../lib/tokens';

interface TaskItem {
  id: string;
  title: string;
  details?: string;
  app?: string; // Project / App name
  status: 'todo' | 'progress' | 'active' | 'done';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignees: string[]; // Email strings
  startDate?: string;
  endDate?: string;
  progress?: number;
  order?: number;
  createdAt?: any;
}

interface BizOpsThemeData {
  title: string;
  objectives: string[];
}

interface TeamMember {
  email: string;
  name: string;
  initials: string;
}

const DEFAULT_THEME_DATA: BizOpsThemeData = {
  title: '🚀 Q2 Production Optimization & Lead Time Reductions',
  objectives: [
    'Reduce average screen print setup time by 15% across shifts',
    'Deploy QR tracking stickers for Shopify pick route validation',
    'Perform warehouse catalog inventory audit on SanMar blanks'
  ]
};

export function BizOpsDashboard() {
  const navigate = useNavigate();
  
  // Real-time Firestore State
  const [themeData, setThemeData] = useState<BizOpsThemeData | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loadingTheme, setLoadingTheme] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // Expanded Card Modal States
  const [expandedCard, setExpandedCard] = useState<'theme' | 'member' | 'parking' | null>(null);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Editing States for Modals
  const [editThemeTitle, setEditThemeTitle] = useState('');
  const [editObjectives, setEditObjectives] = useState<string[]>([]);
  const [newObjectiveText, setNewObjectiveText] = useState('');

  const [newDeliverableText, setNewDeliverableText] = useState('');
  const [newParkingText, setNewParkingText] = useState('');

  // Firestore Sync: settings/bizOpsTheme document
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'bizOpsTheme'), (docSnap) => {
      if (docSnap.exists()) {
        setThemeData(docSnap.data() as BizOpsThemeData);
      } else {
        // Initialize settings document with defaults
        setDoc(doc(db, 'settings', 'bizOpsTheme'), DEFAULT_THEME_DATA)
          .then(() => setThemeData(DEFAULT_THEME_DATA))
          .catch((err) => console.error('Failed to initialize settings/bizOpsTheme:', err));
      }
      setLoadingTheme(false);
    }, (err) => {
      console.error('Error listening to settings/bizOpsTheme:', err);
      setLoadingTheme(false);
    });

    return () => unsub();
  }, []);

  // Firestore Sync: tasks collection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tasks'), (snap) => {
      const list: TaskItem[] = [];
      snap.forEach((docSnap) => {
        list.push({
          id: docSnap.id,
          ...docSnap.data()
        } as TaskItem);
      });
      setTasks(list);
      setLoadingTasks(false);
    }, (err) => {
      console.error('Error listening to tasks collection:', err);
      setLoadingTasks(false);
    });

    return () => unsub();
  }, []);

  // Firestore Sync: users collection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const list: any[] = [];
      snap.forEach((docSnap) => {
        list.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });
      setUsers(list);
      setLoadingUsers(false);
    }, (err) => {
      console.error('Error listening to users collection:', err);
      setLoadingUsers(false);
    });

    return () => unsub();
  }, []);

  // Compute dynamic team members list based on bizOps: true
  const teamMembers = useMemo<TeamMember[]>(() => {
    const bizOpsUsers = users.filter((u: any) => u.bizOps === true);
    return bizOpsUsers.map((u: any) => ({
      email: u.email.toLowerCase(),
      name: u.name || u.email.split('@')[0],
      initials: (() => {
        const clean = (u.name || u.email.split('@')[0]).trim();
        const parts = clean.split(/[ ._\-+]+/).filter(Boolean);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return clean.slice(0, 2).toUpperCase();
      })()
    }));
  }, [users]);

  // Filter Tasks by Member Email (deliverables)
  const getMemberTasks = (email: string) => {
    return tasks.filter(t => t.assignees?.map(e => e.toLowerCase()).includes(email.toLowerCase()));
  };

  // Filter Unassigned Tasks (parking lot)
  const getParkingLotTasks = () => {
    return tasks.filter(t => !t.assignees || t.assignees.length === 0);
  };

  // Open theme editor
  const openThemeModal = () => {
    if (!themeData) return;
    setEditThemeTitle(themeData.title);
    setEditObjectives([...themeData.objectives]);
    setNewObjectiveText('');
    setExpandedCard('theme');
  };

  // Open member details
  const openMemberModal = (member: TeamMember) => {
    setSelectedMember(member);
    setNewDeliverableText('');
    setExpandedCard('member');
  };

  // Open parking lot editor
  const openParkingModal = () => {
    setNewParkingText('');
    setExpandedCard('parking');
  };

  // Save Weekly Theme to Firestore
  const handleSaveTheme = async () => {
    try {
      await setDoc(doc(db, 'settings', 'bizOpsTheme'), {
        title: editThemeTitle,
        objectives: editObjectives.filter(o => o.trim() !== '')
      });
      setExpandedCard(null);
    } catch (err) {
      console.error('Failed to save theme settings:', err);
    }
  };

  // Toggle deliverable checkbox status
  const handleToggleTaskStatus = async (task: TaskItem) => {
    const nextStatus = task.status === 'done' ? 'todo' : 'done';
    const nextProgress = nextStatus === 'done' ? 100 : 0;
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        status: nextStatus,
        progress: nextProgress
      });
    } catch (err) {
      console.error('Failed to toggle task status:', err);
    }
  };

  // Add deliverable for a specific member
  const handleAddDeliverable = async (e: React.FormEvent, email: string) => {
    e.preventDefault();
    if (!newDeliverableText.trim()) return;
    try {
      // Find current tasks count for ordering
      const colCount = tasks.filter(t => t.status === 'todo').length;
      await addDoc(collection(db, 'tasks'), {
        title: newDeliverableText.trim(),
        details: '',
        app: 'Biz Ops', // Default project tag
        status: 'todo',
        priority: 'medium',
        assignees: [email.toLowerCase()],
        startDate: '',
        endDate: '',
        progress: 0,
        order: colCount,
        createdAt: new Date().toISOString()
      });
      setNewDeliverableText('');
    } catch (err) {
      console.error('Failed to add deliverable:', err);
    }
  };

  // Add Parking Lot backlog item
  const handleAddParkingItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newParkingText.trim()) return;
    try {
      const colCount = tasks.filter(t => t.status === 'todo').length;
      await addDoc(collection(db, 'tasks'), {
        title: newParkingText.trim(),
        details: '',
        app: 'Backlog',
        status: 'todo',
        priority: 'medium',
        assignees: [], // Unassigned goes to Parking Lot
        startDate: '',
        endDate: '',
        progress: 0,
        order: colCount,
        createdAt: new Date().toISOString()
      });
      setNewParkingText('');
    } catch (err) {
      console.error('Failed to add parking lot task:', err);
    }
  };

  // Delete a task
  const handleDeleteTask = async (id: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await deleteDoc(doc(db, 'tasks', id));
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  // Loading Screen
  if (loadingTheme || loadingTasks || loadingUsers || !themeData) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-brand-secondary">
        <div className="animate-spin mr-2"><Activity size={20} /></div> Loading Operations Dashboard...
      </div>
    );
  }

  // Parking Lot computations
  const parkingLotTasks = getParkingLotTasks();

  return (
    <div className={tokens.layout.container + " space-y-10 max-w-6xl animate-in fade-in duration-300"}>
      {/* Header */}
      <div className={tokens.layout.pageHeader + " border-b border-brand-border pb-6"}>
        <div>
          <div className="flex items-center gap-3">
            <Activity className="text-neutral-900" size={24} />
            <h1 className={tokens.typography.h1 + " !text-neutral-900 font-serif"}>Biz Ops Dashboard</h1>
          </div>
          <p className={tokens.typography.bodyMuted + " mt-2"}>
            Weekly focus theme, team deliverables, and general backlog parking lot.
          </p>
        </div>
      </div>

      {/* TIER 1: WEEKLY THEME CARD (Full Width - Monotone Dark obsidian styling) */}
      <div 
        onClick={openThemeModal}
        className="w-full bg-neutral-950 text-white border border-neutral-800 rounded-2xl p-8 shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer relative overflow-hidden group"
      >
        <div className="flex justify-between items-start">
          <div className="space-y-4 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs font-bold uppercase tracking-wider">
              <Award size={14} /> Weekly Focus Theme
            </div>
            <h2 className="text-3xl sm:text-4xl font-serif font-semibold tracking-tight leading-tight text-neutral-50">
              {themeData.title}
            </h2>
            <div className="space-y-2.5 pt-3">
              {themeData.objectives.map((obj, index) => (
                <div key={index} className="flex items-start gap-3 text-neutral-300">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-neutral-800 text-neutral-100 font-bold text-xs shrink-0 mt-0.5 border border-neutral-700">
                    {index + 1}
                  </span>
                  <span className="text-sm sm:text-base leading-relaxed">{obj}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="shrink-0 p-2 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-400 group-hover:text-white transition-colors">
            <Edit3 size={18} />
          </div>
        </div>
      </div>

      {/* TIER 2: NAME CARDS ROW (Side-by-Side Grid - Monotone styling) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase font-extrabold tracking-widest text-brand-secondary flex items-center gap-2">
            <Users size={14} className="text-neutral-950" /> Member Deliverables
          </h3>
          <span className="text-[10px] text-brand-secondary font-semibold">Click cards to edit deliverables</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {teamMembers.map((member) => {
            const memberTasks = getMemberTasks(member.email);
            const completed = memberTasks.filter(t => t.status === 'done').length;
            const total = memberTasks.length;
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

            return (
              <div 
                key={member.email}
                onClick={() => openMemberModal(member)}
                className="bg-white border border-brand-border rounded-2xl p-5 shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex flex-col justify-between min-h-[220px] group relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-neutral-200 group-hover:bg-neutral-950 transition-colors"></div>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-neutral-100 text-neutral-800 border border-neutral-200 flex items-center justify-center font-bold text-xs shadow-sm group-hover:bg-neutral-950 group-hover:text-white transition-colors">
                      {member.initials}
                    </div>
                    <div>
                      <h4 className="font-serif text-base font-semibold text-brand-primary group-hover:text-neutral-950 transition-colors leading-tight">
                        {member.name}
                      </h4>
                      <p className="text-[9px] text-brand-secondary font-semibold uppercase tracking-wider">
                        Deliverables
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {memberTasks.slice(0, 3).map((task) => (
                      <div key={task.id} className="flex items-start gap-2 text-xs">
                        <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center mt-0.5 shrink-0 ${
                          task.status === 'done'
                            ? 'bg-neutral-950 border-neutral-950 text-white' 
                            : 'border-neutral-300'
                        }`}>
                          {task.status === 'done' && <Check size={10} strokeWidth={3} />}
                        </span>
                        <span className={`leading-snug truncate ${task.status === 'done' ? 'line-through text-brand-secondary opacity-60' : 'text-brand-primary font-medium'}`}>
                          {task.title}
                        </span>
                      </div>
                    ))}
                    {total === 0 && (
                      <p className="text-xs text-brand-secondary italic">No deliverables.</p>
                    )}
                    {total > 3 && (
                      <p className="text-[9px] text-neutral-600 font-extrabold uppercase tracking-wider pt-0.5">
                        + {total - 3} more items
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-brand-border/60 mt-3 flex items-center justify-between text-[10px] font-bold">
                  <span className="text-brand-secondary">
                    {completed}/{total} Done
                  </span>
                  <span className="text-neutral-800 bg-neutral-100 px-2 py-0.5 rounded-full">
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* TIER 3: PARKING LOT CARD (Full Width - Monotone slate/charcoal) */}
      <div 
        onClick={openParkingModal}
        className="w-full bg-neutral-900 border border-neutral-800 text-white rounded-2xl p-8 shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer relative overflow-hidden group"
      >
        <div className="flex justify-between items-start">
          <div className="space-y-4 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs font-bold uppercase tracking-wider">
              <FileText size={14} /> Parking Lot Backlog
            </div>
            <div>
              <h2 className="text-2xl font-serif font-semibold text-neutral-50">
                Non-Essential Backlog Tasks
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                Tasks not required for the current theme, to work on when core deliverables are finished.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 pt-3">
              {parkingLotTasks.slice(0, 4).map((task) => (
                <div key={task.id} className="flex items-center gap-3 text-xs text-neutral-300">
                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    task.status === 'done'
                      ? 'bg-neutral-700 border-neutral-600 text-neutral-400' 
                      : 'border-neutral-700 bg-neutral-950'
                  }`}>
                    {task.status === 'done' && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span className={`truncate leading-relaxed ${task.status === 'done' ? 'line-through text-neutral-500' : 'text-neutral-200 font-medium'}`}>
                    {task.title}
                  </span>
                </div>
              ))}
              {parkingLotTasks.length === 0 && (
                <p className="text-xs text-neutral-400 italic">No tasks in the parking lot.</p>
              )}
            </div>
            {parkingLotTasks.length > 4 && (
              <p className="text-[10px] text-neutral-400 font-extrabold uppercase tracking-widest pt-1">
                + {parkingLotTasks.length - 4} more backlog items
              </p>
            )}
          </div>

          <div className="shrink-0 p-2 bg-neutral-800 border border-neutral-700 rounded-xl text-neutral-400 group-hover:text-white transition-colors">
            <Edit3 size={18} />
          </div>
        </div>
      </div>

      {/* --- MODAL EDITORS (Click-to-expand monotone) --- */}

      {/* MODAL 1: WEEKLY THEME EDITOR */}
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
                  className="w-full text-sm border border-brand-border rounded-lg px-3 py-2 outline-none focus:border-neutral-900 font-medium text-brand-primary"
                  placeholder="e.g. Optimize Screen Printing Setup & Inventory"
                />
              </div>

              <div className="space-y-3">
                <label className="block text-xs uppercase font-extrabold tracking-wider text-brand-secondary">Weekly Objectives</label>
                
                {editObjectives.map((obj, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-neutral-100 text-neutral-800 text-[10px] font-bold shrink-0 border border-neutral-200">
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
                      className="flex-1 text-xs border border-brand-border rounded-lg px-3 py-1.5 outline-none focus:border-neutral-900"
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
                    className="flex-1 text-xs border border-brand-border rounded-lg px-3 py-1.5 outline-none focus:border-neutral-900"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newObjectiveText.trim()) return;
                      setEditObjectives(prev => [...prev, newObjectiveText.trim()]);
                      setNewObjectiveText('');
                    }}
                    className="bg-neutral-950 hover:bg-black text-white text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
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
                className="px-4 py-2 bg-neutral-950 hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors"
              >
                Save Theme Focus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: MEMBER CHECKLIST & REDIRECTION BUTTON */}
      {expandedCard === 'member' && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-brand-border shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-brand-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-neutral-100 text-neutral-800 flex items-center justify-center font-bold text-sm border border-neutral-200">
                  {selectedMember.initials}
                </div>
                <div>
                  <h3 className="font-serif text-xl font-bold text-brand-primary">{selectedMember.name}'s Deliverables</h3>
                  <p className="text-xs text-brand-secondary mt-0.5">Tasks assigned to {selectedMember.name} for the weekly theme.</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setExpandedCard(null);
                  setSelectedMember(null);
                }}
                className="p-1 rounded-lg text-brand-secondary hover:bg-neutral-100 hover:text-brand-primary transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {/* Header Action Row: REDIRECTION BUTTON */}
              <div className="pb-3 border-b border-brand-border/60 flex items-center justify-between">
                <span className="text-xs text-brand-secondary font-medium">Want full Kanban card editing?</span>
                <button
                  type="button"
                  onClick={() => {
                    navigate(`/biz-ops/kanban?assignee=${selectedMember.email}`);
                    setExpandedCard(null);
                    setSelectedMember(null);
                  }}
                  className="px-4 py-2 bg-neutral-950 hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  Go to Kanban <ArrowRight size={13} />
                </button>
              </div>

              <div className="divide-y divide-brand-border/60">
                {getMemberTasks(selectedMember.email).map((task) => (
                  <div key={task.id} className="py-3 flex items-center justify-between gap-3 group">
                    <label className="flex items-start gap-3 cursor-pointer select-none min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={task.status === 'done'}
                        onChange={() => handleToggleTaskStatus(task)}
                        className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 mt-1 cursor-pointer"
                      />
                      <span className={`text-sm leading-snug ${task.status === 'done' ? 'line-through text-brand-secondary opacity-60' : 'text-brand-primary font-medium'}`}>
                        {task.title}
                      </span>
                    </label>
                    
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="text-neutral-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-1.5"
                      title="Delete task"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {getMemberTasks(selectedMember.email).length === 0 && (
                  <div className="py-8 text-center text-brand-secondary text-xs italic">
                    No deliverables assigned. Add one below!
                  </div>
                )}
              </div>

              <form onSubmit={(e) => handleAddDeliverable(e, selectedMember.email)} className="flex gap-2 pt-4 border-t border-brand-border/40">
                <input
                  type="text"
                  value={newDeliverableText}
                  onChange={(e) => setNewDeliverableText(e.target.value)}
                  placeholder="Add a new deliverable..."
                  className="flex-1 text-xs border border-brand-border rounded-lg px-3 py-1.5 outline-none focus:border-neutral-900"
                />
                <button
                  type="submit"
                  className="bg-neutral-950 hover:bg-black text-white text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                >
                  <Plus size={12} /> Add
                </button>
              </form>
            </div>

            <div className="p-6 border-t border-brand-border flex justify-end bg-brand-bg/40">
              <button 
                onClick={() => {
                  setExpandedCard(null);
                  setSelectedMember(null);
                }}
                className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 border border-brand-border rounded-lg text-xs font-bold text-brand-primary transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: PARKING LOT BACKLOG EDITOR */}
      {expandedCard === 'parking' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-brand-border shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-brand-border flex items-center justify-between">
              <div>
                <h3 className="font-serif text-xl font-bold text-brand-primary">Manage Parking Lot Backlog</h3>
                <p className="text-xs text-brand-secondary mt-0.5">Non-essential backlog tasks. Checked items are completed.</p>
              </div>
              <button 
                onClick={() => setExpandedCard(null)}
                className="p-1 rounded-lg text-brand-secondary hover:bg-neutral-100 hover:text-brand-primary transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="pb-3 border-b border-brand-border/60 flex items-center justify-between">
                <span className="text-xs text-brand-secondary font-medium">View these unassigned backlog tasks on the Board:</span>
                <button
                  type="button"
                  onClick={() => {
                    navigate('/biz-ops/kanban?assignee=__none__');
                    setExpandedCard(null);
                  }}
                  className="px-4 py-2 bg-neutral-950 hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  Go to Kanban <ArrowRight size={13} />
                </button>
              </div>

              <div className="divide-y divide-brand-border/60">
                {parkingLotTasks.map((task) => (
                  <div key={task.id} className="py-3 flex items-center justify-between gap-3 group">
                    <label className="flex items-start gap-3 cursor-pointer select-none min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={task.status === 'done'}
                        onChange={() => handleToggleTaskStatus(task)}
                        className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 mt-1 cursor-pointer"
                      />
                      <span className={`text-sm leading-snug ${task.status === 'done' ? 'line-through text-brand-secondary opacity-60' : 'text-brand-primary font-medium'}`}>
                        {task.title}
                      </span>
                    </label>
                    
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="text-neutral-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-1.5"
                      title="Delete task"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {parkingLotTasks.length === 0 && (
                  <div className="py-8 text-center text-brand-secondary text-xs italic">
                    Parking lot is empty. Add backlog tasks below!
                  </div>
                )}
              </div>

              <form onSubmit={handleAddParkingItem} className="flex gap-2 pt-4 border-t border-brand-border/40">
                <input
                  type="text"
                  value={newParkingText}
                  onChange={(e) => setNewParkingText(e.target.value)}
                  placeholder="Add a backlog item..."
                  className="flex-1 text-xs border border-brand-border rounded-lg px-3 py-1.5 outline-none focus:border-neutral-900"
                />
                <button
                  type="submit"
                  className="bg-neutral-950 hover:bg-black text-white text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                >
                  <Plus size={12} /> Add
                </button>
              </form>
            </div>

            <div className="p-6 border-t border-brand-border flex justify-end bg-brand-bg/40">
              <button 
                onClick={() => setExpandedCard(null)}
                className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 border border-brand-border rounded-lg text-xs font-bold text-brand-primary transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
