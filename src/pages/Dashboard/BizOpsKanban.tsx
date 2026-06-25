import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { 
  collection, 
  doc, 
  onSnapshot, 
  updateDoc, 
  addDoc, 
  deleteDoc, 
  writeBatch, 
  serverTimestamp 
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { tokens } from '../../lib/tokens';
import { 
  Activity, 
  Plus, 
  Trash2, 
  Check, 
  X, 
  Users, 
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Folder,
  Calendar
} from 'lucide-react';

interface TaskUpdate {
  author: string;
  text: string;
  timestamp: number;
}

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
  updates?: TaskUpdate[];
  createdAt?: any;
  createdBy?: string;
}

const TEAM_MEMBERS = [
  { email: 'austin@wovnapparel.com', name: 'Austin', initials: 'AU' },
  { email: 'clayton@wovnapparel.com', name: 'Clayton', initials: 'CL' },
  { email: 'garrett@wovnapparel.com', name: 'Garrett', initials: 'GA' },
  { email: 'josh@wovnapparel.com', name: 'Josh', initials: 'JO' },
  { email: 'malena@wovnapparel.com', name: 'Malena', initials: 'MA' }
];

const STATUSES = ['todo', 'progress', 'active', 'done'] as const;

const PRIORITY_LABELS = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low'
};

export function BizOpsKanban() {
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Firestore Tasks List
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State (sync with URL params)
  const currentView = (searchParams.get('view') as 'board' | 'list' | 'timeline') || 'board';
  const projectFilter = searchParams.get('project') || '__all__';
  const assigneeFilter = searchParams.get('assignee') || '__all__';

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  
  // Task fields in modal
  const [modalTitle, setModalTitle] = useState('');
  const [modalDetails, setModalDetails] = useState('');
  const [modalProject, setModalProject] = useState('');
  const [modalStatus, setModalStatus] = useState<'todo' | 'progress' | 'active' | 'done'>('todo');
  const [modalPriority, setModalPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [modalAssignees, setModalAssignees] = useState<string[]>([]);
  
  // Custom Calendar State inside Modal
  const [modalStartDate, setModalStartDate] = useState('');
  const [modalEndDate, setModalEndDate] = useState('');
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [drMode, setDrMode] = useState<'first' | 'second'>('first');

  // Expanded Comment Thread Card IDs
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Drag and Drop (HTML5 Board view)
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [draggedOverCardId, setDraggedOverCardId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);

  // Timeline (Gantt) State
  const [timelineStart, setTimelineStart] = useState<Date>(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday of current week
    now.setDate(now.getDate() + diff);
    return now;
  });

  // Progress Popover State
  const [popoverTask, setPopoverTask] = useState<TaskItem | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [popoverValue, setPopoverValue] = useState(0);
  const progressTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Timeline dragging ref
  const timelineDragRef = useRef<{
    taskId: string;
    mode: 'move' | 'left' | 'right';
    startX: number;
    startLeft: number;
    startWidth: number;
    task: TaskItem;
    barEl: HTMLDivElement;
    trackEl: HTMLDivElement;
  } | null>(null);

  // Sync tasks collection from Firestore
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
      setLoading(false);
    }, (err) => {
      console.error('Error listening to tasks collection:', err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // Sync redirect parameter if passed on mount/location change
  useEffect(() => {
    const assigneeParam = new URLSearchParams(location.search).get('assignee');
    if (assigneeParam) {
      const nextParams = new URLSearchParams(searchParams);
      if (assigneeParam === '__none__' || assigneeParam === 'unassigned') {
        nextParams.set('assignee', '__none__');
      } else {
        nextParams.set('assignee', assigneeParam.toLowerCase());
      }
      setSearchParams(nextParams);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Extract unique projects/apps from tasks
  const availableProjects = useMemo(() => {
    const apps = tasks.map(t => t.app).filter((a): a is string => !!a && a.trim() !== '');
    return Array.from(new Set(apps)).sort();
  }, [tasks]);

  // Filters tasks according to current settings
  const filteredTasks = useMemo(() => {
    const currentMe = (user?.email || '').toLowerCase();
    return tasks.filter(t => {
      // Project filter
      if (projectFilter !== '__all__' && t.app !== projectFilter) {
        return false;
      }
      // Assignee filter
      const tAssignees = (t.assignees || []).map(e => e.toLowerCase());
      if (assigneeFilter === '__none__') {
        if (tAssignees.length > 0) return false;
      } else if (assigneeFilter === '__me__') {
        if (!tAssignees.includes(currentMe)) return false;
      } else if (assigneeFilter !== '__all__') {
        if (!tAssignees.includes(assigneeFilter.toLowerCase())) return false;
      }
      return true;
    });
  }, [tasks, projectFilter, assigneeFilter, user?.email]);

  // Get progress percentage of task
  const getTaskProgress = (t: TaskItem) => {
    if (t.status === 'done') return 100;
    return Math.max(0, Math.min(100, Number(t.progress) || 0));
  };

  // Set filter parameter in URL search params
  const setFilter = (key: string, value: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set(key, value);
    setSearchParams(nextParams);
  };

  // Toggle card expanded state for comments thread
  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // HTML5 Card Drag and Drop Functions
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      e.preventDefault();
      return;
    }
    setDraggedCardId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  };

  const handleDragEnd = () => {
    setDraggedCardId(null);
    setDraggedOverCardId(null);
    setDropPosition(null);
  };

  const handleTaskDragOver = (e: React.DragEvent, cardId: string) => {
    if (!draggedCardId || draggedCardId === cardId) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const before = (e.clientY - rect.top) < rect.height / 2;
    setDraggedOverCardId(cardId);
    setDropPosition(before ? 'before' : 'after');
  };

  const handleTaskDragLeave = () => {
    setDraggedOverCardId(null);
    setDropPosition(null);
  };

  const handleTaskDrop = async (e: React.DragEvent, targetCardId: string, columnStatus: TaskItem['status']) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedCardId || draggedCardId === targetCardId) return;
    
    const before = dropPosition === 'before';
    await moveTaskInDB(draggedCardId, targetCardId, before, columnStatus);
    
    setDraggedCardId(null);
    setDraggedOverCardId(null);
    setDropPosition(null);
  };

  const handleColumnDrop = async (e: React.DragEvent, columnStatus: TaskItem['status']) => {
    if (!draggedCardId) return;
    // If dropped directly in column container (not on a specific task)
    if (e.target !== e.currentTarget && (e.target as HTMLElement).closest('.task-card-el')) return;
    e.preventDefault();
    await moveTaskInDB(draggedCardId, null, false, columnStatus);
    
    setDraggedCardId(null);
    setDraggedOverCardId(null);
    setDropPosition(null);
  };

  // DB Reorder writebatch logic
  const moveTaskInDB = async (
    id: string, 
    targetId: string | null, 
    before: boolean, 
    targetStatus: TaskItem['status']
  ) => {
    const movedTask = tasks.find(t => t.id === id);
    if (!movedTask) return;

    // Filter destination column tasks excluding current
    const columnTasks = tasks
      .filter(t => t.status === targetStatus && t.id !== id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    let insertAt = columnTasks.length;
    if (targetId) {
      const idx = columnTasks.findIndex(t => t.id === targetId);
      if (idx >= 0) {
        insertAt = before ? idx : idx + 1;
      }
    }

    const reorderedList = [
      ...columnTasks.slice(0, insertAt),
      { ...movedTask, status: targetStatus },
      ...columnTasks.slice(insertAt)
    ];

    try {
      const batch = writeBatch(db);
      reorderedList.forEach((t, index) => {
        const docRef = doc(db, 'tasks', t.id);
        const updates: Partial<TaskItem> = { order: index };
        if (t.id === id) {
          updates.status = targetStatus;
          if (targetStatus === 'done') {
            updates.progress = 100;
          } else if (movedTask.status === 'done' && movedTask.progress === 100) {
            updates.progress = 0; // reset progress from done if dragged back
          }
        }
        batch.update(docRef, updates);
      });
      await batch.commit();
    } catch (err) {
      console.error('Failed to save drag-and-drop order batch:', err);
    }
  };

  // Timeline (Gantt) Pointer Drag/Resize handlers
  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>, 
    task: TaskItem, 
    mode: 'move' | 'left' | 'right'
  ) => {
    if (e.button !== 0) return; // Primary pointer only
    e.preventDefault();
    e.stopPropagation();

    const barEl = e.currentTarget.closest('.timeline-bar-el') as HTMLDivElement;
    const trackEl = barEl?.parentElement as HTMLDivElement;
    if (!barEl || !trackEl) return;

    timelineDragRef.current = {
      taskId: task.id,
      mode,
      startX: e.clientX,
      startLeft: parseFloat(barEl.style.left) || 0,
      startWidth: parseFloat(barEl.style.width) || 0,
      task,
      barEl,
      trackEl
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);
    
    barEl.classList.add('opacity-90', 'scale-[1.01]', 'shadow-md');
  };

  const handlePointerMove = (e: PointerEvent) => {
    const drag = timelineDragRef.current;
    if (!drag) return;

    const deltaX = e.clientX - drag.startX;
    const trackWidth = drag.trackEl.clientWidth;
    const dayWidth = trackWidth / 28;
    const deltaDays = Math.round(deltaX / dayWidth);

    const oneDayPct = 100 / 28;

    if (drag.mode === 'move') {
      const newLeft = drag.startLeft + deltaDays * oneDayPct;
      drag.barEl.style.left = `${newLeft}%`;
    } else if (drag.mode === 'left') {
      const newLeft = drag.startLeft + deltaDays * oneDayPct;
      const newWidth = drag.startWidth - deltaDays * oneDayPct;
      if (newWidth >= oneDayPct) {
        drag.barEl.style.left = `${newLeft}%`;
        drag.barEl.style.width = `${newWidth}%`;
      }
    } else if (drag.mode === 'right') {
      const newWidth = drag.startWidth + deltaDays * oneDayPct;
      if (newWidth >= oneDayPct) {
        drag.barEl.style.width = `${newWidth}%`;
      }
    }
  };

  const handlePointerUp = async (e: PointerEvent) => {
    const drag = timelineDragRef.current;
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
    document.removeEventListener('pointercancel', handlePointerUp);
    
    if (!drag) return;
    drag.barEl.classList.remove('opacity-90', 'scale-[1.01]', 'shadow-md');
    timelineDragRef.current = null;

    const deltaX = e.clientX - drag.startX;
    const trackWidth = drag.trackEl.clientWidth;
    const dayWidth = trackWidth / 28;
    const deltaDays = Math.round(deltaX / dayWidth);

    // Simple pointer click -> open modal
    if (Math.abs(deltaX) < 4) {
      openEditModal(drag.task);
      return;
    }

    if (deltaDays === 0) {
      // Re-trigger tasks list mapping to clear raw HTML style changes
      setTasks(prev => [...prev]);
      return;
    }

    let newStart = drag.task.startDate || drag.task.endDate || '';
    let newEnd = drag.task.endDate || drag.task.startDate || '';

    const addDays = (dateStr: string, offset: number) => {
      if (!dateStr) return '';
      const d = new Date(dateStr + 'T00:00:00');
      d.setDate(d.getDate() + offset);
      return d.toISOString().split('T')[0];
    };

    if (drag.mode === 'move') {
      newStart = addDays(newStart, deltaDays);
      newEnd = addDays(newEnd, deltaDays);
    } else if (drag.mode === 'left') {
      newStart = addDays(newStart, deltaDays);
      if (newStart > newEnd) newStart = newEnd;
    } else if (drag.mode === 'right') {
      newEnd = addDays(newEnd, deltaDays);
      if (newEnd < newStart) newEnd = newStart;
    }

    try {
      await updateDoc(doc(db, 'tasks', drag.task.id), {
        startDate: newStart,
        endDate: newEnd
      });
    } catch (err) {
      console.error('Failed to update task dates on Gantt chart drag:', err);
    }
  };

  // Custom Inline Calendar Date Selection
  const handleCalendarPickDate = (dateStr: string) => {
    if (drMode === 'first') {
      setModalStartDate(dateStr);
      setModalEndDate(dateStr);
      setDrMode('second');
    } else {
      if (dateStr < modalStartDate) {
        setModalStartDate(dateStr);
      } else {
        setModalEndDate(dateStr);
      }
      setDrMode('first');
    }
  };

  // Generate calendar days for custom inline datepicker grid
  const calendarCells = useMemo(() => {
    const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const startOfGrid = new Date(monthStart);
    startOfGrid.setDate(1 - monthStart.getDay()); // Sunday offset

    const list = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(startOfGrid);
      d.setDate(d.getDate() + i);
      const dStr = d.toISOString().split('T')[0];
      list.push({
        date: d,
        dateStr: dStr,
        isOtherMonth: d.getMonth() !== calendarMonth.getMonth()
      });
    }
    return list;
  }, [calendarMonth]);

  // Open Edit / Create Modals
  const openCreateModal = () => {
    setEditingTask(null);
    setModalTitle('');
    setModalDetails('');
    setModalProject('');
    setModalStatus('todo');
    setModalPriority('medium');
    setModalAssignees([]);
    setModalStartDate('');
    setModalEndDate('');
    setDrMode('first');
    
    const now = new Date();
    setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setIsModalOpen(true);
  };

  const openEditModal = (task: TaskItem) => {
    setEditingTask(task);
    setModalTitle(task.title || '');
    setModalDetails(task.details || '');
    setModalProject(task.app || '');
    setModalStatus(task.status || 'todo');
    setModalPriority(task.priority || 'medium');
    setModalAssignees(task.assignees || []);
    setModalStartDate(task.startDate || '');
    setModalEndDate(task.endDate || '');
    setDrMode('first');

    if (task.startDate) {
      const [y, m] = task.startDate.split('-').map(Number);
      setCalendarMonth(new Date(y, m - 1, 1));
    } else {
      const now = new Date();
      setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    }
    setIsModalOpen(true);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalTitle.trim()) return;

    if (modalStartDate && modalEndDate && modalStartDate > modalEndDate) {
      alert('Start date must be before or equal to End date');
      return;
    }

    const tProgress = modalStatus === 'done' ? 100 : (editingTask ? getTaskProgress(editingTask) : 0);

    const taskData: Omit<TaskItem, 'id'> = {
      title: modalTitle.trim(),
      details: modalDetails,
      app: modalProject.trim() || 'Biz Ops',
      status: modalStatus,
      priority: modalPriority,
      assignees: modalAssignees,
      startDate: modalStartDate,
      endDate: modalEndDate,
      progress: tProgress
    };

    try {
      if (editingTask) {
        const changes: Partial<TaskItem> = { ...taskData };
        if (editingTask.status !== modalStatus) {
          // Put at end of new column
          const colCount = tasks.filter(t => t.status === modalStatus).length;
          changes.order = colCount;
        }
        await updateDoc(doc(db, 'tasks', editingTask.id), changes);
      } else {
        const colCount = tasks.filter(t => t.status === modalStatus).length;
        await addDoc(collection(db, 'tasks'), {
          ...taskData,
          order: colCount,
          createdAt: serverTimestamp(),
          createdBy: user?.email || 'unknown'
        });
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error('Failed to save task document:', err);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await deleteDoc(doc(db, 'tasks', id));
      setIsModalOpen(false);
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  // Add a post/update to comments thread
  const handlePostUpdate = async (taskId: string, text: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !text.trim()) return;

    const newUpdate: TaskUpdate = {
      author: user?.email || 'unknown',
      text: text.trim(),
      timestamp: Date.now()
    };

    const nextUpdates = [...(task.updates || []), newUpdate];

    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        updates: nextUpdates
      });
    } catch (err) {
      console.error('Failed to add post to updates thread:', err);
    }
  };

  // Delete a post from comments thread
  const handleDeletePost = async (taskId: string, timestamp: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    if (!confirm('Delete this update post?')) return;

    const nextUpdates = (task.updates || []).filter(u => u.timestamp !== timestamp);

    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        updates: nextUpdates
      });
    } catch (err) {
      console.error('Failed to delete post:', err);
    }
  };

  // Progress Popover Slider Drag debounce logic
  const handleOpenProgressPopover = (e: React.MouseEvent, task: TaskItem) => {
    e.stopPropagation();
    setPopoverTask(task);
    setPopoverValue(getTaskProgress(task));

    const rect = e.currentTarget.getBoundingClientRect();
    setPopoverPosition({
      x: rect.left + window.scrollX,
      y: rect.bottom + window.scrollY + 8
    });
  };

  const handleProgressSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setPopoverValue(val);

    if (progressTimeoutRef.current) clearTimeout(progressTimeoutRef.current);
    progressTimeoutRef.current = setTimeout(async () => {
      if (!popoverTask) return;
      
      const updates: Partial<TaskItem> = { progress: val };
      if (val === 100) {
        updates.status = 'done';
      } else if (popoverTask.status === 'done' && val < 100) {
        updates.status = 'progress'; // move back to progress if marked under 100%
      }

      try {
        await updateDoc(doc(db, 'tasks', popoverTask.id), updates);
      } catch (err) {
        console.error('Failed to save task progress:', err);
      }
    }, 250);
  };

  const handlePresetProgress = async (val: number) => {
    if (!popoverTask) return;
    setPopoverValue(val);
    if (progressTimeoutRef.current) clearTimeout(progressTimeoutRef.current);

    const updates: Partial<TaskItem> = { progress: val };
    if (val === 100) {
      updates.status = 'done';
    } else if (popoverTask.status === 'done' && val < 100) {
      updates.status = 'progress';
    }

    try {
      await updateDoc(doc(db, 'tasks', popoverTask.id), updates);
    } catch (err) {
      console.error('Failed to save task progress:', err);
    }
  };

  // Close progress popover on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const popoverEl = document.getElementById('progress-slider-popover');
      if (popoverEl && !popoverEl.contains(e.target as Node)) {
        setPopoverTask(null);
        setPopoverPosition(null);
      }
    };

    if (popoverTask) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [popoverTask]);

  // Helpers for displaying formatting info
  const formatDateChip = (start?: string, end?: string) => {
    if (!start && !end) return '';
    const formatS = (s: string) => {
      const parts = s.split('-');
      if (parts.length !== 3) return '';
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    if (start && end) {
      if (start === end) return formatS(start);
      return `${formatS(start)} – ${formatS(end)}`;
    }
    if (end) return `Due ${formatS(end)}`;
    if (start) return `From ${formatS(start)}`;
    return '';
  };

  const getDateChipClass = (end?: string, status?: string) => {
    if (!end || status === 'done') return 'bg-neutral-100 text-neutral-600 border-neutral-200';
    const parts = end.split('-');
    const eDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const today = new Date();
    today.setHours(0,0,0,0);
    const diff = Math.floor((eDate.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return 'bg-neutral-900 text-neutral-100 border-neutral-900 font-bold'; // overdue (monotone dark)
    if (diff <= 2) return 'bg-neutral-800 text-neutral-50 border-neutral-800 font-semibold'; // due soon (monotone dark slate)
    return 'bg-neutral-100 text-neutral-600 border-neutral-200';
  };

  const getMemberInitials = (email: string) => {
    const match = TEAM_MEMBERS.find(m => m.email.toLowerCase() === email.toLowerCase());
    return match ? match.initials : initialsFor(email);
  };

  const getMemberColorIndex = (email: string) => {
    const e = email.toLowerCase();
    let hash = 0;
    for (let i = 0; i < e.length; i++) {
      hash = ((hash << 5) - hash + e.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 5;
  };

  const initialsFor = (email: string) => {
    const local = email.split('@')[0];
    if (!local) return '?';
    const parts = local.split(/[._\-+]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return local.slice(0, 2).toUpperCase();
  };

  // Renders loading panel
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-brand-secondary font-sans">
        <div className="animate-spin mr-2"><Activity size={20} /></div> Loading Operations Board...
      </div>
    );
  }

  return (
    <div className={tokens.layout.container + " space-y-8 animate-in fade-in duration-300 select-none"}>
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-brand-border">
        <div>
          <div className="flex items-center gap-3">
            <Activity className="text-neutral-950" size={24} />
            <h1 className="font-serif text-3xl font-semibold text-neutral-950 tracking-tight">Operations Kanban</h1>
          </div>
          <p className="text-xs text-brand-secondary mt-1">
            Global task board, list views, and Gantt charts for the business operations team.
          </p>
        </div>

        {/* View toggles and task action */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="bg-neutral-100 p-1 rounded-lg inline-flex border border-neutral-200">
            <button
              onClick={() => setFilter('view', 'board')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all ${
                currentView === 'board' 
                  ? 'bg-white text-neutral-950 shadow-sm border border-neutral-200/50' 
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              Board
            </button>
            <button
              onClick={() => setFilter('view', 'list')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all ${
                currentView === 'list' 
                  ? 'bg-white text-neutral-950 shadow-sm border border-neutral-200/50' 
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              List
            </button>
            <button
              onClick={() => setFilter('view', 'timeline')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all ${
                currentView === 'timeline' 
                  ? 'bg-white text-neutral-950 shadow-sm border border-neutral-200/50' 
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              Timeline
            </button>
          </div>

          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-950 hover:bg-black text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
          >
            <Plus size={14} /> New Task
          </button>
        </div>
      </div>

      {/* Filters toolbar */}
      <div className="flex flex-wrap items-center gap-4 bg-neutral-50 border border-brand-border p-4 rounded-xl">
        <div className="flex items-center gap-2">
          <Folder size={15} className="text-neutral-500" />
          <label className="text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Project:</label>
          <select
            value={projectFilter}
            onChange={(e) => setFilter('project', e.target.value)}
            className="text-xs bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-neutral-900 font-medium text-neutral-800"
          >
            <option value="__all__">All projects</option>
            {availableProjects.map(proj => (
              <option key={proj} value={proj}>{proj}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Users size={15} className="text-neutral-500" />
          <label className="text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Assignee:</label>
          <select
            value={assigneeFilter}
            onChange={(e) => setFilter('assignee', e.target.value)}
            className="text-xs bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-neutral-900 font-medium text-neutral-800"
          >
            <option value="__all__">Anyone</option>
            <option value="__me__">Me</option>
            <option value="__none__">Unassigned</option>
            {TEAM_MEMBERS.map(m => (
              <option key={m.email} value={m.email}>{m.name}</option>
            ))}
          </select>
        </div>
        
        {currentView === 'timeline' && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => {
                const prev = new Date(timelineStart);
                prev.setDate(prev.getDate() - 7);
                setTimelineStart(prev);
              }}
              className="p-1 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => {
                const today = new Date();
                today.setHours(0,0,0,0);
                const day = today.getDay();
                const diff = day === 0 ? -6 : 1 - day;
                today.setDate(today.getDate() + diff);
                setTimelineStart(today);
              }}
              className="text-xs font-bold uppercase tracking-wider px-2 py-1.5 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50"
            >
              Today
            </button>
            <button
              onClick={() => {
                const next = new Date(timelineStart);
                next.setDate(next.getDate() + 7);
                setTimelineStart(next);
              }}
              className="p-1 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50"
            >
              <ChevronRight size={16} />
            </button>
            <span className="text-xs font-bold text-neutral-700 bg-white border border-neutral-200 px-3 py-1.5 rounded-lg">
              {(() => {
                const end = new Date(timelineStart);
                end.setDate(end.getDate() + 27);
                return `${timelineStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
              })()}
            </span>
          </div>
        )}
      </div>

      {/* MAIN VIEW CONTENTS */}

      {/* --- BOARD VIEW --- */}
      {currentView === 'board' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
          {STATUSES.map(colStatus => {
            const colTasks = filteredTasks
              .filter(t => t.status === colStatus)
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            const count = colTasks.length;

            return (
              <div 
                key={colStatus} 
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleColumnDrop(e, colStatus)}
                className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 flex flex-col min-h-[500px]"
              >
                {/* Column header */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-200/80">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${
                      colStatus === 'todo' ? 'bg-neutral-400' :
                      colStatus === 'progress' ? 'bg-neutral-700' :
                      colStatus === 'active' ? 'bg-neutral-900' : 'bg-neutral-950'
                    }`} />
                    <h3 className="font-serif text-sm font-bold uppercase tracking-wider text-neutral-800">
                      {colStatus === 'todo' ? 'To do' :
                       colStatus === 'progress' ? 'In Progress' :
                       colStatus === 'active' ? 'Active' : 'Done'}
                    </h3>
                  </div>
                  <span className="text-xs bg-white text-neutral-500 font-extrabold uppercase px-2 py-0.5 border border-neutral-200 rounded-full">
                    {count}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="space-y-3 flex-1 flex flex-col">
                  {colTasks.map(task => {
                    const progress = getTaskProgress(task);
                    const isExpanded = expandedIds.has(task.id);
                    const isDraggedOver = draggedOverCardId === task.id;

                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleTaskDragOver(e, task.id)}
                        onDragLeave={handleTaskDragLeave}
                        onDrop={(e) => handleTaskDrop(e, task.id, colStatus)}
                        className={`task-card-el bg-white border rounded-xl p-3 shadow-sm hover:shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all cursor-grab flex flex-col justify-between ${
                          isDraggedOver && dropPosition === 'before' ? 'border-t-neutral-950 border-t-2 shadow-inner pt-2' : ''
                        } ${
                          isDraggedOver && dropPosition === 'after' ? 'border-b-neutral-950 border-b-2 shadow-inner pb-2' : ''
                        } ${
                          task.status === 'done' ? 'opacity-70' : ''
                        } ${
                          task.priority === 'critical' ? 'border-l-neutral-950 border-l-[3px]' :
                          task.priority === 'high' ? 'border-l-neutral-700 border-l-[3px]' :
                          task.priority === 'medium' ? 'border-l-neutral-400 border-l-[3px]' : 'border-l-neutral-200 border-l-[3px]'
                        }`}
                      >
                        <div>
                          <div 
                            onClick={() => openEditModal(task)}
                            className="font-serif text-sm font-semibold text-neutral-900 leading-snug hover:underline cursor-pointer"
                          >
                            {task.title}
                          </div>

                          <div className="flex flex-wrap gap-1.5 mt-2.5 items-center">
                            <span className={`text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                              task.priority === 'critical' ? 'bg-neutral-900 border-neutral-900 text-neutral-50' :
                              task.priority === 'high' ? 'bg-neutral-800 border-neutral-800 text-neutral-100' :
                              task.priority === 'medium' ? 'bg-neutral-100 border-neutral-200 text-neutral-800' : 'bg-neutral-50 border-neutral-100 text-neutral-500'
                            }`}>
                              {PRIORITY_LABELS[task.priority]}
                            </span>

                            {task.app && (
                              <span className="text-[10px] font-semibold bg-neutral-100 border border-neutral-200/50 text-neutral-600 px-1.5 py-0.5 rounded">
                                {task.app}
                              </span>
                            )}

                            {/* Date range chip */}
                            {(task.startDate || task.endDate) && (
                              <span className={`text-[10px] inline-flex items-center gap-1 border px-1.5 py-0.5 rounded ${getDateChipClass(task.endDate, task.status)}`}>
                                <Calendar size={10} />
                                {formatDateChip(task.startDate, task.endDate)}
                              </span>
                            )}
                          </div>

                          {/* Details description block */}
                          {task.details && task.details.trim() && isExpanded && (
                            <p className="mt-3 text-xs text-neutral-600 bg-neutral-50 border border-neutral-200 p-2 rounded-lg leading-relaxed whitespace-pre-wrap">
                              {task.details}
                            </p>
                          )}
                        </div>

                        {/* Card Footer row */}
                        <div className="mt-3 pt-2.5 border-t border-neutral-100 flex items-center justify-between">
                          {/* Assignee circles */}
                          <div className="flex -space-x-1.5 overflow-hidden">
                            {(task.assignees || []).map(email => (
                              <div
                                key={email}
                                title={email}
                                className={`w-5 h-5 rounded-full border border-white text-white flex items-center justify-center text-[9px] font-extrabold shadow-sm ${
                                  getMemberColorIndex(email) === 0 ? 'bg-neutral-900' :
                                  getMemberColorIndex(email) === 1 ? 'bg-neutral-700' :
                                  getMemberColorIndex(email) === 2 ? 'bg-neutral-600' :
                                  getMemberColorIndex(email) === 3 ? 'bg-neutral-500' : 'bg-neutral-400'
                                }`}
                              >
                                {getMemberInitials(email)}
                              </div>
                            ))}
                            {(!task.assignees || task.assignees.length === 0) && (
                              <span className="text-[10px] text-neutral-400 italic">Unassigned</span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-neutral-500">
                            {/* Comments Count indicator */}
                            {(task.updates && task.updates.length > 0) && (
                              <span className="text-[10px] font-semibold flex items-center gap-0.5">
                                <MessageSquare size={11} /> {task.updates.length}
                              </span>
                            )}

                            {/* Progress bar popover trigger */}
                            <button
                              onClick={(e) => handleOpenProgressPopover(e, task)}
                              className={`text-[10px] font-bold border px-1.5 py-0.5 rounded-full shadow-sm ${
                                progress === 100 
                                  ? 'bg-neutral-900 text-white border-neutral-900' 
                                  : 'bg-neutral-50 text-neutral-800 border-neutral-200 hover:border-neutral-800 hover:text-neutral-950'
                              }`}
                            >
                              {progress}%
                            </button>

                            {/* Expand Comments */}
                            <button
                              onClick={() => toggleExpand(task.id)}
                              className={`p-0.5 hover:bg-neutral-100 rounded text-neutral-400 hover:text-neutral-800 transition-colors ${
                                isExpanded ? 'rotate-180' : ''
                              }`}
                              title={isExpanded ? 'Collapse thread' : 'Expand thread'}
                            >
                              <ChevronRight size={14} className="rotate-90" />
                            </button>
                          </div>
                        </div>

                        {/* Progress display bar */}
                        <div className="w-full bg-neutral-100 h-1 mt-2.5 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${progress === 100 ? 'bg-neutral-900' : 'bg-neutral-500'}`} 
                            style={{ width: `${progress}%` }} 
                          />
                        </div>

                        {/* Expanded Thread Posts Panel */}
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-neutral-200 space-y-3">
                            <div className="max-h-[200px] overflow-y-auto space-y-2 pr-1">
                              {(task.updates || []).map((up, uIdx) => (
                                <div key={uIdx} className="bg-neutral-50 border border-neutral-200 p-2 rounded-lg text-[11px] group relative">
                                  <div className="flex items-center justify-between font-bold text-neutral-700 mb-0.5">
                                    <span>{up.author.split('@')[0]}</span>
                                    <span className="font-normal text-[9px] text-neutral-400">
                                      {new Date(up.timestamp).toLocaleDateString()}
                                    </span>
                                  </div>
                                  <p className="text-neutral-800 leading-relaxed break-words">{up.text}</p>
                                  
                                  {/* Delete post button */}
                                  {((user?.email && user.email.toLowerCase() === up.author.toLowerCase())) && (
                                    <button
                                      onClick={() => handleDeletePost(task.id, up.timestamp)}
                                      className="absolute right-1 top-1 text-neutral-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                                      title="Delete comment"
                                    >
                                      <X size={10} />
                                    </button>
                                  )}
                                </div>
                              ))}
                              {(!task.updates || task.updates.length === 0) && (
                                <p className="text-[10px] text-neutral-400 italic text-center py-2">No comments posted yet.</p>
                              )}
                            </div>

                            {/* Add comment row */}
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const form = e.currentTarget;
                                const input = form.elements.namedItem('commentText') as HTMLInputElement;
                                if (input && input.value.trim()) {
                                  handlePostUpdate(task.id, input.value);
                                  input.value = '';
                                }
                              }}
                              className="flex gap-1.5"
                            >
                              <input
                                name="commentText"
                                type="text"
                                placeholder="Add a comment..."
                                className="flex-1 text-[11px] border border-neutral-200 rounded px-2 py-1 outline-none focus:border-neutral-900"
                              />
                              <button
                                type="submit"
                                className="bg-neutral-950 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded"
                              >
                                Post
                              </button>
                            </form>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {count === 0 && (
                    <div className="text-center py-8 text-xs text-neutral-400 italic border border-dashed border-neutral-200 rounded-xl bg-white">
                      No tasks
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- LIST VIEW --- */}
      {currentView === 'list' && (
        <div className="space-y-6">
          {(() => {
            const projectsMap: Record<string, TaskItem[]> = {};
            filteredTasks.forEach(t => {
              const proj = t.app || '(No Project)';
              if (!projectsMap[proj]) projectsMap[proj] = [];
              projectsMap[proj].push(t);
            });

            const projKeys = Object.keys(projectsMap).sort();

            if (projKeys.length === 0) {
              return (
                <div className="text-center py-12 text-sm text-neutral-400 italic border border-dashed border-neutral-200 rounded-2xl bg-white">
                  No tasks match current filters.
                </div>
              );
            }

            return projKeys.map(proj => {
              const projTasks = projectsMap[proj].sort((a, b) => {
                // Done tasks last, otherwise manual order or status order
                if (a.status === 'done' && b.status !== 'done') return 1;
                if (a.status !== 'done' && b.status === 'done') return -1;
                return (a.order ?? 0) - (b.order ?? 0);
              });

              return (
                <div key={proj} className="bg-white border border-neutral-200 rounded-2xl shadow-sm overflow-hidden">
                  {/* Group header */}
                  <div className="bg-neutral-50 px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between">
                    <h3 className="font-serif text-sm font-bold uppercase tracking-wider text-neutral-800 flex items-center gap-2">
                      <Folder size={14} className="text-neutral-500" /> {proj}
                    </h3>
                    <span className="text-xs bg-white text-neutral-500 font-extrabold uppercase px-2.5 py-0.5 border border-neutral-200 rounded-full">
                      {projTasks.length} {projTasks.length === 1 ? 'task' : 'tasks'}
                    </span>
                  </div>

                  {/* Tasks Table */}
                  <div className="divide-y divide-neutral-100">
                    {projTasks.map(task => {
                      const isExpanded = expandedIds.has(task.id);
                      const progress = getTaskProgress(task);

                      return (
                        <div key={task.id} className={`flex flex-col ${isExpanded ? 'bg-neutral-50/40' : ''}`}>
                          {/* Row wrapper */}
                          <div 
                            onClick={() => openEditModal(task)}
                            className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 hover:bg-neutral-50/60 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                task.status === 'done'
                                  ? 'bg-neutral-900 border-neutral-900 text-white' 
                                  : 'border-neutral-300'
                              }`}>
                                {task.status === 'done' && <Check size={10} strokeWidth={3} />}
                              </span>
                              
                              <span className={`text-sm leading-snug font-medium truncate ${
                                task.status === 'done' ? 'line-through text-neutral-400 font-normal' : 'text-neutral-900'
                              }`}>
                                {task.title}
                              </span>
                            </div>

                            {/* Tags / Badges */}
                            <div className="flex items-center gap-3 shrink-0 flex-wrap" onClick={e => e.stopPropagation()}>
                              <span className={`text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                                task.priority === 'critical' ? 'bg-neutral-900 border-neutral-900 text-neutral-50' :
                                task.priority === 'high' ? 'bg-neutral-800 border-neutral-800 text-neutral-100' :
                                task.priority === 'medium' ? 'bg-neutral-100 border-neutral-200 text-neutral-800' : 'bg-neutral-50 border-neutral-100 text-neutral-500'
                              }`}>
                                {PRIORITY_LABELS[task.priority]}
                              </span>

                              {/* Assignees */}
                              <div className="flex -space-x-1.5 overflow-hidden">
                                {(task.assignees || []).map(email => (
                                  <div
                                    key={email}
                                    title={email}
                                    className={`w-5 h-5 rounded-full border border-white text-white flex items-center justify-center text-[9px] font-extrabold shadow-sm ${
                                      getMemberColorIndex(email) === 0 ? 'bg-neutral-900' :
                                      getMemberColorIndex(email) === 1 ? 'bg-neutral-700' :
                                      getMemberColorIndex(email) === 2 ? 'bg-neutral-600' :
                                      getMemberColorIndex(email) === 3 ? 'bg-neutral-500' : 'bg-neutral-400'
                                    }`}
                                  >
                                    {getMemberInitials(email)}
                                  </div>
                                ))}
                              </div>

                              {/* Dates */}
                              {(task.startDate || task.endDate) && (
                                <span className={`text-[10px] inline-flex items-center gap-1 border px-1.5 py-0.5 rounded ${getDateChipClass(task.endDate, task.status)}`}>
                                  <Calendar size={10} />
                                  {formatDateChip(task.startDate, task.endDate)}
                                </span>
                              )}

                              {/* Progress Badge */}
                              <button
                                onClick={(e) => handleOpenProgressPopover(e, task)}
                                className={`text-[10px] font-bold border px-1.5 py-0.5 rounded-full shadow-sm ${
                                  progress === 100 
                                    ? 'bg-neutral-900 text-white border-neutral-900' 
                                    : 'bg-neutral-50 text-neutral-800 border-neutral-200 hover:border-neutral-800 hover:text-neutral-950'
                                }`}
                              >
                                {progress}%
                              </button>

                              {/* Message Count */}
                              {(task.updates && task.updates.length > 0) && (
                                <span className="text-xs font-semibold flex items-center gap-0.5 text-neutral-500">
                                  <MessageSquare size={11} /> {task.updates.length}
                                </span>
                              )}

                              {/* Expand comments toggle */}
                              <button
                                onClick={() => toggleExpand(task.id)}
                                className={`p-1 hover:bg-neutral-100 rounded text-neutral-400 hover:text-neutral-800 transition-colors ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                                title={isExpanded ? 'Collapse comments' : 'Expand comments'}
                              >
                                <ChevronRight size={14} className="rotate-90" />
                              </button>
                            </div>
                          </div>

                          {/* Expanded Comments Thread panel */}
                          {isExpanded && (
                            <div className="px-5 pb-4 border-t border-neutral-100 bg-neutral-50/20" onClick={e => e.stopPropagation()}>
                              {task.details && task.details.trim() && (
                                <div className="mt-3 text-xs text-neutral-600 bg-white border border-neutral-200 p-3 rounded-lg leading-relaxed whitespace-pre-wrap">
                                  <div className="font-bold text-[9px] uppercase tracking-wider text-neutral-400 mb-1">Details:</div>
                                  {task.details}
                                </div>
                              )}

                              <div className="mt-3 space-y-2.5 max-w-2xl">
                                <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-500 flex items-center gap-1">
                                  <MessageSquare size={11} /> Update Comments
                                </h4>
                                
                                <div className="space-y-2">
                                  {(task.updates || []).map((up, uIdx) => (
                                    <div key={uIdx} className="bg-white border border-neutral-200 p-2.5 rounded-lg text-xs group relative flex gap-2.5 items-start">
                                      <div className={`w-6 h-6 rounded-full text-white flex items-center justify-center text-[9px] font-extrabold shrink-0 shadow-sm ${
                                        getMemberColorIndex(up.author) === 0 ? 'bg-neutral-900' :
                                        getMemberColorIndex(up.author) === 1 ? 'bg-neutral-700' :
                                        getMemberColorIndex(up.author) === 2 ? 'bg-neutral-600' :
                                        getMemberColorIndex(up.author) === 3 ? 'bg-neutral-500' : 'bg-neutral-400'
                                      }`}>
                                        {getMemberInitials(up.author)}
                                      </div>
                                      
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 font-bold text-neutral-700 mb-0.5">
                                          <span>{up.author.split('@')[0]}</span>
                                          <span className="font-normal text-[10px] text-neutral-400">
                                            {new Date(up.timestamp).toLocaleString()}
                                          </span>
                                        </div>
                                        <p className="text-neutral-800 leading-relaxed break-words">{up.text}</p>
                                      </div>

                                      {/* Delete comment */}
                                      {((user?.email && user.email.toLowerCase() === up.author.toLowerCase())) && (
                                        <button
                                          onClick={() => handleDeletePost(task.id, up.timestamp)}
                                          className="text-neutral-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-1 ml-auto"
                                          title="Delete comment"
                                        >
                                          <X size={12} />
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                  {(!task.updates || task.updates.length === 0) && (
                                    <p className="text-xs text-neutral-400 italic py-2 pl-1">No comments posted yet.</p>
                                  )}
                                </div>

                                {/* Add comment input */}
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    const form = e.currentTarget;
                                    const input = form.elements.namedItem('commentText') as HTMLInputElement;
                                    if (input && input.value.trim()) {
                                      handlePostUpdate(task.id, input.value);
                                      input.value = '';
                                    }
                                  }}
                                  className="flex gap-2 max-w-xl"
                                >
                                  <input
                                    name="commentText"
                                    type="text"
                                    placeholder="Add a comment..."
                                    className="flex-1 text-xs border border-neutral-200 bg-white rounded-lg px-3 py-1.5 outline-none focus:border-neutral-900"
                                  />
                                  <button
                                    type="submit"
                                    className="bg-neutral-950 hover:bg-black text-white text-xs font-bold uppercase tracking-wider px-4 py-1.5 rounded-lg transition-colors"
                                  >
                                    Post
                                  </button>
                                </form>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* --- TIMELINE VIEW (GANTT CHART) --- */}
      {currentView === 'timeline' && (
        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
          <div className="overflow-x-auto w-full relative">
            <div className="min-w-[1100px] select-none">
              
              {/* Timeline Header Row (Days of Week) */}
              <div className="flex border-b border-neutral-200 bg-neutral-50 text-xs font-bold text-neutral-500">
                {/* Left side title column */}
                <div className="w-[240px] px-5 py-3 border-r border-neutral-200 shrink-0 sticky left-0 bg-neutral-50 z-20 flex items-center">
                  TASK DETAILS
                </div>

                {/* Right side tracks headers */}
                <div className="flex-1 flex relative">
                  {/* Grid week spans */}
                  {Array.from({ length: 4 }).map((_, wIdx) => {
                    const startW = new Date(timelineStart);
                    startW.setDate(startW.getDate() + wIdx * 7);
                    return (
                      <div 
                        key={wIdx} 
                        className="flex-1 py-1.5 border-r border-neutral-200/80 text-center text-[10px] font-extrabold uppercase tracking-widest text-neutral-400"
                        style={{ flexGrow: 7 }}
                      >
                        Week of {startW.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Day details subheader row */}
              <div className="flex border-b border-neutral-200 bg-neutral-50/50 text-[10px] text-neutral-400">
                <div className="w-[240px] border-r border-neutral-200 shrink-0 sticky left-0 bg-neutral-50/50 z-20" />
                <div className="flex-1 flex">
                  {Array.from({ length: 28 }).map((_, idx) => {
                    const day = new Date(timelineStart);
                    day.setDate(day.getDate() + idx);
                    const isToday = day.toDateString() === new Date().toDateString();
                    return (
                      <div 
                        key={idx} 
                        className={`flex-1 py-1 text-center border-r border-neutral-100 flex flex-col items-center justify-center ${
                          day.getDay() === 0 || day.getDay() === 6 ? 'bg-neutral-100/30' : ''
                        }`}
                      >
                        <span className="text-[8px] font-semibold">{['Su','Mo','Tu','We','Th','Fr','Sa'][day.getDay()]}</span>
                        <span className={`font-bold mt-0.5 ${isToday ? 'text-neutral-900 bg-neutral-200 px-1 rounded-full' : 'text-neutral-600'}`}>
                          {day.getDate()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Grid content rows grouped by project */}
              <div className="relative">
                {(() => {
                  const tasksWithDates = filteredTasks.filter(t => t.startDate || t.endDate);
                  
                  if (tasksWithDates.length === 0) {
                    return (
                      <div className="text-center py-16 text-xs text-neutral-400 italic">
                        No tasks scheduled in this window. Set a Start or End date on a task to view it on the Gantt chart.
                      </div>
                    );
                  }

                  const projectsMap: Record<string, TaskItem[]> = {};
                  tasksWithDates.forEach(t => {
                    const proj = t.app || '(No Project)';
                    if (!projectsMap[proj]) projectsMap[proj] = [];
                    projectsMap[proj].push(t);
                  });

                  const projKeys = Object.keys(projectsMap).sort();

                  return projKeys.map(proj => {
                    const projTasks = projectsMap[proj].sort((a,b) => (a.startDate || '').localeCompare(b.startDate || ''));
                    
                    return (
                      <div key={proj} className="contents">
                        {/* Project subheader row in Gantt */}
                        <div className="flex border-b border-neutral-200/80 bg-neutral-50/20">
                          <div className="w-[240px] px-5 py-2.5 font-bold text-xs uppercase tracking-wider text-neutral-800 border-r border-neutral-200 shrink-0 sticky left-0 bg-neutral-50/90 z-20 flex items-center">
                            {proj}
                          </div>
                          <div className="flex-grow relative h-8 bg-neutral-50/10">
                            {/* draw column background divider lines */}
                            {Array.from({ length: 28 }).map((_, idx) => (
                              <div key={idx} className="absolute top-0 bottom-0 border-r border-neutral-100" style={{ left: `${(idx / 28) * 100}%`, width: `${100 / 28}%` }} />
                            ))}
                          </div>
                        </div>

                        {/* Task rows */}
                        {projTasks.map(task => {
                          const startLimit = task.startDate || task.endDate || '';
                          const endLimit = task.endDate || task.startDate || '';

                          const tStart = new Date(startLimit + 'T00:00:00');
                          const tEnd = new Date(endLimit + 'T00:00:00');

                          const rangeEnd = new Date(timelineStart);
                          rangeEnd.setDate(rangeEnd.getDate() + 27);

                          const visibleStart = tStart < timelineStart ? timelineStart : tStart;
                          const visibleEnd = tEnd > rangeEnd ? rangeEnd : tEnd;

                          // calculate positions in percent
                          const diffStartDays = Math.floor((visibleStart.getTime() - timelineStart.getTime()) / 86400000);
                          const diffDurationDays = Math.floor((visibleEnd.getTime() - visibleStart.getTime()) / 86400000) + 1;

                          // Skip if falls completely outside the 28-day window
                          if (tEnd < timelineStart || tStart > rangeEnd) return null;

                          const leftPct = (diffStartDays / 28) * 100;
                          const widthPct = (diffDurationDays / 28) * 100;

                          const progress = getTaskProgress(task);

                          return (
                            <div key={task.id} className="flex border-b border-neutral-100 hover:bg-neutral-50/20 group h-12">
                              {/* Sticky task name left cell */}
                              <div 
                                onClick={() => openEditModal(task)}
                                className="w-[240px] px-5 py-2 text-xs font-semibold text-neutral-800 border-r border-neutral-200 shrink-0 sticky left-0 bg-white z-20 flex items-center hover:underline cursor-pointer truncate"
                                title={task.title}
                              >
                                {task.title}
                              </div>

                              {/* Gantt chart track right cell */}
                              <div className="flex-1 relative h-full">
                                {/* Grid day dividers */}
                                {Array.from({ length: 28 }).map((_, idx) => (
                                  <div key={idx} className="absolute top-0 bottom-0 border-r border-neutral-100" style={{ left: `${(idx / 28) * 100}%`, width: `${100 / 28}%` }} />
                                ))}

                                {/* Task Bar element */}
                                <div
                                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                                  className={`timeline-bar-el absolute top-2.5 bottom-2.5 rounded-lg shadow-sm text-[10px] font-bold text-white flex items-center relative overflow-hidden select-none select-none ${
                                    task.status === 'done' ? 'opacity-55 line-through' : ''
                                  } ${
                                    task.priority === 'critical' ? 'bg-neutral-900 border border-neutral-950' :
                                    task.priority === 'high' ? 'bg-neutral-700 border border-neutral-800' :
                                    task.priority === 'medium' ? 'bg-neutral-400 border border-neutral-500 text-neutral-900' :
                                    'bg-neutral-200 border border-neutral-300 text-neutral-700'
                                  }`}
                                >
                                  {/* Progress fill overlay */}
                                  {progress > 0 && (
                                    <div 
                                      className="absolute left-0 top-0 bottom-0 bg-neutral-950/15 pointer-events-none rounded-l-lg"
                                      style={{ width: `${progress}%` }}
                                    />
                                  )}

                                  {/* Left drag resize handle */}
                                  <div
                                    onPointerDown={(e) => handlePointerDown(e, task, 'left')}
                                    className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-neutral-400/40 hover:w-2.5 z-10"
                                  />

                                  {/* Center bar drag handle */}
                                  <div
                                    onPointerDown={(e) => handlePointerDown(e, task, 'move')}
                                    className="flex-1 h-full px-2 flex items-center justify-start cursor-grab active:cursor-grabbing truncate select-none"
                                  >
                                    <span className="pointer-events-none truncate pl-1 select-none pr-1">
                                      {task.title}
                                    </span>
                                  </div>

                                  {/* Right drag resize handle */}
                                  <div
                                    onPointerDown={(e) => handlePointerDown(e, task, 'right')}
                                    className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-neutral-400/40 hover:w-2.5 z-10"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  });
                })()}

                {/* Vertical today line in Gantt */}
                {(() => {
                  const today = new Date();
                  today.setHours(0,0,0,0);
                  const startMs = timelineStart.getTime();
                  const todayMs = today.getTime();
                  const diffDays = Math.floor((todayMs - startMs) / 86400000);
                  if (diffDays >= 0 && diffDays < 28) {
                    const lineLeft = ((diffDays + 0.5) / 28) * 100;
                    return (
                      <div 
                        className="absolute top-0 bottom-0 w-0.5 bg-neutral-950 pointer-events-none z-10 shadow-sm"
                        style={{ left: `calc(240px + (100% - 240px) * ${lineLeft} / 100)` }}
                      />
                    );
                  }
                  return null;
                })()}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* --- TASK DETAILED FORM EDIT / CREATE MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-neutral-100 flex items-center justify-between">
              <div>
                <h3 className="font-serif text-xl font-bold text-neutral-900">
                  {editingTask ? 'Edit Task Details' : 'Create New Operation Task'}
                </h3>
                <p className="text-xs text-neutral-400 mt-1">Specify parameters, dates, and assign team owners.</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form Content */}
            <form onSubmit={handleSaveTask} className="p-6 overflow-y-auto space-y-4 flex-grow flex-1">
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-neutral-500 mb-1">Task Title</label>
                <input
                  type="text"
                  required
                  value={modalTitle}
                  onChange={(e) => setModalTitle(e.target.value)}
                  className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-neutral-900 font-medium text-neutral-800"
                  placeholder="e.g. Roll out QR scanner validation tests"
                />
              </div>

              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-neutral-500 mb-1">Details / Context</label>
                <textarea
                  value={modalDetails}
                  onChange={(e) => setModalDetails(e.target.value)}
                  rows={3}
                  className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-neutral-900 text-neutral-800"
                  placeholder="Provide checklist requirements, background info, links, etc."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-neutral-500 mb-1">Project Tag</label>
                  <input
                    type="text"
                    value={modalProject}
                    onChange={(e) => setModalProject(e.target.value)}
                    list="suggested-projects-list"
                    className="w-full text-xs border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-neutral-900 font-semibold text-neutral-800"
                    placeholder="e.g. Biz Ops"
                  />
                  <datalist id="suggested-projects-list">
                    {availableProjects.map(p => <option key={p} value={p} />)}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-neutral-500 mb-1">Status</label>
                  <select
                    value={modalStatus}
                    onChange={(e) => setModalStatus(e.target.value as any)}
                    className="w-full text-xs border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-neutral-900 font-semibold text-neutral-800"
                  >
                    <option value="todo">To do</option>
                    <option value="progress">In Progress</option>
                    <option value="active">Active</option>
                    <option value="done">Done</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-neutral-500 mb-1">Importance</label>
                  <select
                    value={modalPriority}
                    onChange={(e) => setModalPriority(e.target.value as any)}
                    className="w-full text-xs border border-neutral-200 rounded-lg px-3 py-2 outline-none focus:border-neutral-900 font-semibold text-neutral-800"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              {/* Datepicker and inline calendar grid */}
              <div className="border border-neutral-100 rounded-xl p-4 bg-neutral-50/40">
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-neutral-500 mb-2">Task Date Range</label>
                
                {/* Selected Displays */}
                <div className="flex items-center justify-between gap-4 pb-3 border-b border-neutral-200">
                  <div className="flex gap-6 text-[11px]">
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-neutral-400 block font-semibold">Start Date</span>
                      <span className={`font-bold ${modalStartDate ? 'text-neutral-900' : 'text-neutral-400 italic'}`}>
                        {modalStartDate ? new Date(modalStartDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '— pick a day —'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-neutral-400 block font-semibold">End Date</span>
                      <span className={`font-bold ${modalEndDate ? 'text-neutral-900' : 'text-neutral-400 italic'}`}>
                        {modalEndDate ? new Date(modalEndDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '— pick a day —'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setModalStartDate('');
                      setModalEndDate('');
                      setDrMode('first');
                    }}
                    className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 hover:text-neutral-900 hover:bg-white px-2.5 py-1.5 border border-neutral-200 rounded-lg transition-colors bg-white shadow-sm"
                  >
                    Clear Dates
                  </button>
                </div>

                {/* Calendar Grid navigation */}
                <div className="pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <button
                      type="button"
                      onClick={() => {
                        const prev = new Date(calendarMonth);
                        prev.setMonth(prev.getMonth() - 1);
                        setCalendarMonth(prev);
                      }}
                      className="p-1 rounded hover:bg-white border border-transparent hover:border-neutral-200"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs font-bold text-neutral-800">
                      {calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = new Date(calendarMonth);
                        next.setMonth(next.getMonth() + 1);
                        setCalendarMonth(next);
                      }}
                      className="p-1 rounded hover:bg-white border border-transparent hover:border-neutral-200"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  {/* Calendar day names */}
                  <div className="grid grid-cols-7 text-center text-[9px] font-extrabold text-neutral-400 uppercase pb-1 border-b border-neutral-100">
                    {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d}>{d}</div>)}
                  </div>

                  {/* Calendar days grid */}
                  <div className="grid grid-cols-7 mt-1.5">
                    {calendarCells.map((cell, idx) => {
                      const isSelectedStart = modalStartDate === cell.dateStr;
                      const isSelectedEnd = modalEndDate === cell.dateStr;
                      const isInRange = modalStartDate && modalEndDate && cell.dateStr >= modalStartDate && cell.dateStr <= modalEndDate;
                      const isToday = cell.date.toDateString() === new Date().toDateString();

                      return (
                        <div
                          key={idx}
                          onClick={() => handleCalendarPickDate(cell.dateStr)}
                          className={`text-center py-2 text-xs font-semibold cursor-pointer rounded transition-all select-none ${
                            cell.isOtherMonth ? 'opacity-30' : ''
                          } ${
                            isToday ? 'border border-neutral-800 font-extrabold' : ''
                          } ${
                            isInRange ? 'bg-neutral-100 text-neutral-900' : 'hover:bg-neutral-100'
                          } ${
                            isSelectedStart || isSelectedEnd ? '!bg-neutral-900 !text-white !font-bold' : ''
                          }`}
                        >
                          {cell.date.getDate()}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-neutral-400 mt-2 text-center italic">
                    {drMode === 'first' ? 'Click a cell to set range start day' : 'Click another cell to set range end day'}
                  </p>
                </div>
              </div>

              {/* Multi Assignees selection pills */}
              <div>
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-neutral-500 mb-1.5">Assignees</label>
                <div className="flex flex-wrap gap-2 bg-neutral-50 border border-neutral-200 p-3.5 rounded-xl min-h-[50px] items-center">
                  {TEAM_MEMBERS.map(m => {
                    const isSelected = modalAssignees.includes(m.email);
                    return (
                      <div
                        key={m.email}
                        onClick={() => {
                          setModalAssignees(prev => {
                            if (prev.includes(m.email)) {
                              return prev.filter(e => e !== m.email);
                            } else {
                              return [...prev, m.email];
                            }
                          });
                        }}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold cursor-pointer transition-all ${
                          isSelected 
                            ? 'bg-neutral-900 border-neutral-900 text-white shadow-sm' 
                            : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-400'
                        }`}
                      >
                        <div className={`w-4.5 h-4.5 rounded-full text-[8px] font-extrabold flex items-center justify-center ${
                          isSelected ? 'bg-white text-neutral-950' : 'bg-neutral-100 text-neutral-800'
                        }`}>
                          {m.initials}
                        </div>
                        {m.name}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-neutral-400 mt-1 pl-1">Toggle members to assign. Task shows up under all checked assignees.</p>
              </div>

              {/* Modal action buttons */}
              <div className="pt-6 border-t border-neutral-100 flex justify-between">
                {editingTask ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteTask(editingTask.id)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-neutral-400 hover:text-red-600 transition-colors uppercase tracking-wider"
                  >
                    <Trash2 size={13} /> Delete Task
                  </button>
                ) : <div />}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 border border-neutral-200 rounded-lg text-xs font-bold text-neutral-700 hover:bg-neutral-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-neutral-950 hover:bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors shadow-sm"
                  >
                    Save Task
                  </button>
                </div>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* --- DEBOUNCED PROGRESS SLIDER POPOVER --- */}
      {popoverTask && popoverPosition && (
        <div
          id="progress-slider-popover"
          style={{ left: `${popoverPosition.x}px`, top: `${popoverPosition.y}px` }}
          className="absolute bg-white border border-neutral-200 rounded-xl p-4 shadow-xl z-40 min-w-[240px] animate-in fade-in duration-100"
        >
          <div className="flex justify-between items-baseline mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Progress Slider</span>
            <span className="text-base font-bold text-neutral-900">{popoverValue}%</span>
          </div>

          <input 
            type="range"
            min="0"
            max="100"
            step="5"
            value={popoverValue}
            onChange={handleProgressSliderChange}
            className="w-full accent-neutral-900 cursor-pointer"
          />

          <div className="flex gap-1 mt-3">
            {[0, 25, 50, 75, 100].map(val => (
              <button
                key={val}
                onClick={() => handlePresetProgress(val)}
                className="flex-1 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-neutral-600 rounded text-[9px] font-extrabold py-1"
              >
                {val}%
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
