import { useState, useEffect, useRef } from 'react';
import { tokens } from '../../lib/tokens';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useOrders } from '../../hooks/useOrders';
import { Plus, X, Loader2, Clock, Trash2 } from 'lucide-react';

const getColumns = (range: string) => {
  if (range === 'Week') return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((name, i) => ({ id: `wk-${i}`, label: name, startVal: i, snapMode: 0.5 })); 
  if (range === 'Month') return ['Week 1', 'Week 2', 'Week 3', 'Week 4'].map((name, i) => ({ id: `mo-${i}`, label: name, startVal: i, snapMode: 0.25 }));
  // Day (default)
  return Array.from({ length: 14 }, (_, i) => ({ id: `dy-${i + 6}`, label: `${i+6 > 12 ? i-6 : (i+6===12 ? 12 : i+6)} ${i+6>=12 ? 'PM' : 'AM'}`, startVal: i + 6, snapMode: 0.5 }));
};

interface TeamMember {
  id: string;
  name: string;
  initials: string;
}

export const OPEN_NEW_TASK_EVENT = 'open-new-timeline-task';

function formatTaskTime(val: number, range: string) {
  if (range === 'Week') {
     const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Weekend', 'Weekend'];
     const dayIdx = Math.max(0, Math.floor(val));
     const day = days[dayIdx] || 'Weekend';
     const fraction = val % 1;
     const time = fraction < 0.3 ? 'AM' : (fraction < 0.7 ? 'Noon' : 'PM');
     return fraction > 0 ? `${day} ${time}` : day;
  }
  if (range === 'Month') {
     return `Day ${Math.floor(val) + 1}`;
  }

  const time = val + 0.01;
  const h = Math.floor(time);
  const m = Math.floor((time % 1) * 60) >= 30 ? '30' : '00';
  const displayH = h > 12 ? h - 12 : h;
  return `${displayH}:${m}`;
}

interface TimelineTask {
  id: string;
  memberId: string;
  title: string;
  start: number; // 6.0 = 6am, 6.5 = 6:30am
  duration: number; // 1 = 1 hour, 1.5 = 1.5 hours
  color: string;
  rowOffset?: number;
  orderId?: string;
  range?: string;
}

const STATUS_COLORS = [
  { label: 'Active', value: 'bg-blue-500' },
  { label: 'Not Started', value: 'bg-amber-500' },
  { label: 'Complete', value: 'bg-green-500' },
  { label: 'Delayed', value: 'bg-red-500' },
];

interface TimelinePlannerProps {
  activeRange?: string;
}

export function TimelinePlanner({ activeRange = 'Day' }: TimelinePlannerProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [tasks, setTasks] = useState<TimelineTask[]>([]);
  const [loading, setLoading] = useState(true);
  const { orders } = useOrders();
  const [customers, setCustomers] = useState<Record<string, any>>({});
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TimelineTask | null>(null);
  
  const gridRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const [dragState, setDragState] = useState<{ 
    taskId: string, 
    type: 'move' | 'resize', 
    startX: number, 
    startY: number, 
    initialStart: number, 
    initialDuration: number, 
    initialMemberId: string,
    currentStart: number,
    currentDuration: number,
    currentMemberId: string
  } | null>(null);

  const dragStateRef = useRef(dragState);
  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  const [formData, setFormData] = useState({
    memberIds: [] as string[],
    title: '',
    start: '9',
    duration: '1',
    color: 'bg-blue-500',
    orderId: '',
    range: activeRange
  });

  const columns = getColumns(activeRange);
  const startOffset = columns[0].startVal;

  const [currentTimeLeft, setCurrentTimeLeft] = useState(0);

  useEffect(() => {
    // Current time indicator logic
    const updateTime = () => {
      const now = new Date();
      const hour = now.getHours() + (now.getMinutes() / 60);
      
      // Calculate percentage within the 6am - 8pm window (14 hours)
      if (hour >= 6 && hour <= 20) {
        const percent = ((hour - 6) / 14) * 100;
        setCurrentTimeLeft(percent);
      } else if (hour < 6) {
        setCurrentTimeLeft(0);
      } else {
        setCurrentTimeLeft(100);
      }
    };
    
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      if (!gridRef.current) return;
      
      const currentDrag = dragStateRef.current;
      if (!currentDrag) return;
      
      const gridRect = gridRef.current.getBoundingClientRect();
      const timelineWidth = gridRect.width - 200; // 200px is the member name column
      const pxPerUnit = timelineWidth / columns.length;
      
      const deltaX = e.clientX - currentDrag.startX;
      const unitsDelta = deltaX / pxPerUnit;
      const currentSnap = columns[0].snapMode || 0.5;
      const snappedUnitsDelta = Math.round(unitsDelta / currentSnap) * currentSnap;
      
      if (currentDrag.type === 'resize') {
         const newDuration = Math.max(currentSnap, currentDrag.initialDuration + snappedUnitsDelta);
         setDragState(prev => prev ? { ...prev, currentDuration: newDuration } : null);
      } else if (currentDrag.type === 'move') {
         let newStart = currentDrag.initialStart + snappedUnitsDelta;
         // Clamp start so it doesn't overflow backwards or forwards past available units
         newStart = Math.max(startOffset, Math.min(startOffset + columns.length - currentDrag.currentDuration, newStart));
         
         let newMemberId = currentDrag.currentMemberId;
         // Detect which member row is underneath the cursor for vertical draggability
         const el = document.elementFromPoint(e.clientX, e.clientY);
         const rowEl = el?.closest('[data-member-id]');
         if (rowEl) {
           newMemberId = rowEl.getAttribute('data-member-id') || currentDrag.currentMemberId;
         }
         
         setDragState(prev => prev ? { ...prev, currentStart: newStart, currentMemberId: newMemberId } : null);
      }
    };

    const handleMouseUp = async () => {
      const currentDrag = dragStateRef.current;
      if (currentDrag) {
         if (currentDrag.currentStart !== currentDrag.initialStart || 
             currentDrag.currentDuration !== currentDrag.initialDuration || 
             currentDrag.currentMemberId !== currentDrag.initialMemberId) {
             
             updateDoc(doc(db, 'timelineTasks', currentDrag.taskId), {
               start: currentDrag.currentStart,
               duration: currentDrag.currentDuration,
               memberId: currentDrag.currentMemberId,
               updatedAt: serverTimestamp()
             }).catch(err => console.error(err));
         }
      }
      setDragState(null);
      setTimeout(() => {
         isDraggingRef.current = false;
      }, 50);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [!!dragState]);

  useEffect(() => {
    // Fetch customers to map company names
    getDocs(collection(db, 'customers')).then(snap => {
      const obj: Record<string,any> = {};
      snap.forEach(d => { obj[d.id] = d.data(); });
      setCustomers(obj);
    }).catch(e => console.error("Error fetching customers for timeline:", e));
  }, []);

  useEffect(() => {
    // Fetch users who are not clients
    const qUsers = query(collection(db, 'users'));
    const unsubUsers = onSnapshot(qUsers, (snap) => {
      const staff: TeamMember[] = [];
      snap.forEach(doc => {
        const data = doc.data();
        if (data.role !== 'Client') {
          const name = data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Unknown Staff';
          const initials = name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
          staff.push({ id: doc.id, name, initials });
        }
      });
      // Sort alphabetically
      staff.sort((a, b) => a.name.localeCompare(b.name));
      setMembers(staff);
    });

    // Fetch daily timeline tasks
    const qTasks = query(collection(db, 'timelineTasks'));
    const unsubTasks = onSnapshot(qTasks, (snap) => {
      const liveTasks: TimelineTask[] = [];
      snap.forEach(doc => {
        const data = doc.data();
        liveTasks.push({
          id: doc.id,
          memberId: data.memberId,
          title: data.title,
          start: data.start,
          duration: data.duration,
          color: data.color || 'bg-blue-500',
          rowOffset: data.rowOffset || 0,
          range: data.range || 'Day'
        });
      });
      setTasks(liveTasks.filter(t => t.range === activeRange || (!t.range && activeRange === 'Day')));
      setLoading(false);
    });

    return () => {
      unsubUsers();
      unsubTasks();
    };
  }, [activeRange]);

  const handleOpenModal = (memberId?: string, trackVal?: number) => {
    setFormData({
      memberIds: memberId ? [memberId] : (members.length > 0 ? [members[0].id] : []),
      title: '',
      start: trackVal !== undefined ? trackVal.toString() : startOffset.toString(),
      duration: activeRange === 'Day' ? '1' : activeRange === 'Week' ? '1' : '1',
      color: 'bg-blue-500',
      orderId: '',
      range: activeRange
    });
    setEditingTask(null);
    setIsModalOpen(true);
  };

  useEffect(() => {
    const handleNewTask = () => handleOpenModal();
    window.addEventListener(OPEN_NEW_TASK_EVENT, handleNewTask);
    return () => window.removeEventListener(OPEN_NEW_TASK_EVENT, handleNewTask);
  }, [members]);

  const handleEditTask = (task: TimelineTask) => {
    setFormData({
      memberIds: [task.memberId],
      title: task.title,
      start: task.start.toString(),
      duration: task.duration.toString(),
      color: task.color,
      orderId: task.orderId || '',
      range: task.range || 'Day'
    });
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (formData.memberIds.length === 0 || !formData.title.trim()) return;

    const baseTaskData = {
      title: formData.title,
      start: parseFloat(formData.start),
      duration: parseFloat(formData.duration),
      color: formData.color,
      orderId: formData.orderId || null,
      range: activeRange,
      updatedAt: serverTimestamp()
    };

    try {
      if (editingTask) {
        await updateDoc(doc(db, 'timelineTasks', editingTask.id), {
          ...baseTaskData,
          memberId: formData.memberIds[0] // Update single task if editing
        });
      } else {
        // Create duplicate tasks for each selected member when assigning multiple
        for (const mId of formData.memberIds) {
          await addDoc(collection(db, 'timelineTasks'), {
            ...baseTaskData,
            memberId: mId,
            createdAt: serverTimestamp()
          });
        }
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error saving task:", error);
    }
  };

  const handleDelete = async () => {
    if (!editingTask) return;
    try {
      await deleteDoc(doc(db, 'timelineTasks', editingTask.id));
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error deleting task:", error);
    }
  };

  if (loading) {
     return (
        <div className="bg-white border border-brand-border rounded-card h-64 flex flex-col items-center justify-center text-brand-secondary gap-3">
          <Loader2 className="animate-spin" size={32} />
        </div>
     );
  }

  return (
    <div className="bg-white border border-brand-border rounded-card overflow-hidden">
      <div className="p-6 border-b border-brand-border flex justify-between items-center bg-brand-bg/50">
        <div>
          <h2 className={tokens.typography.h3}>Team Timeline</h2>
          <p className="text-xs text-brand-secondary mt-1 tracking-wide">Organize staff schedules and dictate daily tasks.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-brand-primary text-white text-xs font-semibold px-4 py-2 rounded-pill uppercase tracking-wider flex items-center gap-2 hover:bg-black transition-colors shadow-sm"
        >
          <Plus size={14} /> Assign Task
        </button>
      </div>

      <div className="overflow-x-auto custom-scrollbar" ref={gridRef}>
        {activeRange === 'Month' ? (
          <div className="min-w-[800px] border-t border-brand-border">
            <div className="grid grid-cols-7 border-b border-brand-border bg-brand-bg/50">
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                <div key={d} className="p-3 text-center text-[10px] font-bold uppercase tracking-widest text-brand-secondary">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 grid-rows-5 bg-brand-border gap-[1px]">
              {Array.from({length: 35}).map((_, i) => {
                const dayTasks = tasks.filter(t => t.range === 'Month' && i >= t.start && i < t.start + t.duration);
                return (
                   <div 
                     key={i} 
                     onClick={() => handleOpenModal(undefined, i)}
                     className="bg-white min-h-[140px] p-2 hover:bg-brand-bg/30 transition-colors cursor-crosshair flex flex-col group relative"
                   >
                      <div className="text-[11px] font-bold text-brand-secondary mb-1.5 group-hover:text-brand-primary transition-colors">{i + 1 <= 31 ? i + 1 : ''}</div>
                      <div className="flex flex-col gap-1 overflow-y-auto custom-scrollbar flex-1 pr-1">
                        {dayTasks.map(task => {
                          const member = members.find(m => m.id === task.memberId);
                          return (
                            <div 
                               key={task.id} 
                               onClick={(e) => { e.stopPropagation(); handleEditTask(task); }}
                               className={`text-white text-[10px] px-1.5 py-1 rounded shadow-sm truncate font-semibold cursor-pointer hover:scale-[1.02] transition-transform ${task.color}`}
                            >
                               <span className="font-bold opacity-80 mr-1">{member?.initials}</span>
                               {task.title}
                            </div>
                          );
                        })}
                      </div>
                   </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="min-w-[1000px] select-none">
          {/* Header Row */}
          <div className="grid grid-cols-[200px_1fr] border-b border-brand-border relative">
            <div className="p-4 text-xs font-semibold uppercase tracking-wider text-brand-secondary">
              Team Members
            </div>
            <div className="flex relative">
              {columns.map((col) => (
                <div key={col.id} className="flex-1 border-l border-brand-border/50 p-4 text-[10px] font-bold text-brand-secondary/70 uppercase tracking-widest text-center">
                  {col.label}
                </div>
              ))}
              {/* Current Time Indicator line (Only for Day) */}
              {activeRange === 'Day' && currentTimeLeft > 0 && currentTimeLeft < 100 && (
                <div 
                  className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10 flex flex-col items-center shadow-[0_0_8px_rgba(248,113,113,0.5)] transition-all duration-1000"
                  style={{ left: `${currentTimeLeft}%` }}
                >
                   <div className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm mt-3 tracking-widest shadow-sm">
                     NOW
                   </div>
                </div>
              )}
            </div>
          </div>

          {/* Member Rows */}
          {members.length === 0 ? (
            <div className="p-8 text-center text-brand-secondary text-sm">
              No staff members found. Add production staff in the team settings.
            </div>
          ) : (
            members.map((member) => (
              <div key={member.id} data-member-id={member.id} className="grid grid-cols-[200px_1fr] border-b border-brand-border/50 group transition-colors hover:bg-brand-bg/30">
                <div className="p-4 flex items-center gap-3 border-r border-brand-border/50 bg-white group-hover:bg-brand-bg/50 transition-colors relative z-20">
                  <span className="w-8 h-8 rounded-full bg-brand-bg border border-brand-border flex items-center justify-center text-[11px] font-bold tracking-wider text-brand-primary shadow-sm">
                    {member.initials}
                  </span>
                  <span className="text-sm font-semibold text-brand-primary">{member.name}</span>
                </div>
                
                {/* Timeline Track */}
                <div className="relative min-h-[70px] py-3 cursor-crosshair" onClick={() => handleOpenModal(member.id)}>
                  {/* Background grid lines */}
                  <div className="absolute inset-0 flex">
                     {columns.map((col) => (
                       <div key={col.id} className="flex-1 border-l border-brand-border/50 border-dashed hover:bg-brand-primary/5 transition-colors group-hover:border-brand-border" onClick={(e) => { e.stopPropagation(); handleOpenModal(member.id, col.startVal); }}></div>
                     ))}
                  </div>

                  {/* Tasks */}
                  {(() => {
                    const displayTasks = tasks.map(t => {
                       if (dragState && dragState.taskId === t.id) {
                          return { ...t, start: dragState.currentStart, duration: dragState.currentDuration, memberId: dragState.currentMemberId };
                       }
                       return t;
                    });
                    
                    return displayTasks.filter(t => t.memberId === member.id && (t.range === activeRange || (!t.range && activeRange === 'Day'))).map((task) => {
                      const unitWidth = 100 / columns.length;
                      const left = (task.start - startOffset) * unitWidth;
                      const width = task.duration * unitWidth;
                      const isDragging = dragState?.taskId === task.id;
                      
                      return (
                        <div 
                          key={task.id}
                          onClick={(e) => { 
                             e.stopPropagation(); 
                             if (!isDraggingRef.current) handleEditTask(task); 
                          }}
                          onMouseDown={(e) => {
                             // Default drag (move) action unless they precisely click the resize handle
                             if ((e.target as HTMLElement).getAttribute('data-resize-handle')) return;
                             setDragState({
                               taskId: task.id, type: 'move', startX: e.clientX, startY: e.clientY,
                               initialStart: task.start, initialDuration: task.duration, initialMemberId: task.memberId,
                               currentStart: task.start, currentDuration: task.duration, currentMemberId: task.memberId
                             });
                          }}
                          className={`absolute h-[42px] rounded-lg text-white px-3 flex flex-col justify-center shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md hover:scale-[1.01] hover:-translate-y-0.5 transition-all overflow-hidden border border-black/10 ${task.color} ${isDragging ? 'opacity-80 shadow-2xl scale-[1.02] z-50 pointer-events-none' : 'z-20'}`}
                          style={{ 
                            left: `${Math.max(0, left)}%`, 
                            width: `calc(${width}% - 6px)`, 
                            top: `14px`,
                            transition: isDragging ? 'none' : 'all 0.2s ease-in-out' // Disable CSS transition while dragging for responsiveness
                          }}
                        >
                          <span className="font-semibold text-xs truncate leading-tight tracking-wide pointer-events-none">{task.title}</span>
                          <span className="text-[9px] opacity-80 uppercase font-bold tracking-widest mt-0.5 pointer-events-none">
                            {formatTaskTime(task.start, activeRange)} - {formatTaskTime(task.start + task.duration, activeRange)}
                          </span>

                          <div 
                             data-resize-handle="true"
                             className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/30 transition-colors flex flex-col justify-center items-center opacity-0 hover:opacity-100 group-hover:opacity-100"
                             onMouseDown={(e) => {
                                e.stopPropagation();
                                setDragState({
                                  taskId: task.id, type: 'resize', startX: e.clientX, startY: e.clientY,
                                  initialStart: task.start, initialDuration: task.duration, initialMemberId: task.memberId,
                                  currentStart: task.start, currentDuration: task.duration, currentMemberId: task.memberId
                                });
                             }}
                          >
                             <div className="w-[3px] h-3 border-l border-r border-white/50 pointer-events-none"></div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            ))
          )}
        </div>
        )}
      </div>
      
      {/* Legend */}
      <div className="p-4 border-t border-brand-border bg-brand-bg flex items-center gap-6 overflow-x-auto">
        <span className="text-[10px] font-bold text-brand-secondary uppercase tracking-widest mr-2">Status Legend:</span>
        {STATUS_COLORS.map(status => (
           <div key={status.value} className="flex items-center gap-2 text-xs font-semibold text-brand-secondary uppercase tracking-widest">
             <div className={`w-3.5 h-3.5 rounded-sm shadow-sm ${status.value}`}></div>
             {status.label}
           </div>
        ))}
      </div>

      {/* Unassigned Orders Tray */}
      <div className="p-5 border-t border-brand-border bg-white flex flex-col gap-3">
        <h3 className="text-[10px] font-bold text-brand-secondary uppercase tracking-widest">Active Orders (Click to Assign)</h3>
        <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar flex-nowrap">
          {orders.filter(o => o.statusIndex !== undefined && o.statusIndex >= 0 && o.statusIndex <= 6).length === 0 ? (
            <span className="text-sm text-brand-muted italic">No active orders right now.</span>
          ) : (
            orders.filter(o => o.statusIndex !== undefined && o.statusIndex >= 0 && o.statusIndex <= 6).map(order => {
              const companyName = customers[order.customerId]?.company || customers[order.customerId]?.name || order.customerId || 'Unknown Client';
              const displayId = order.portalId || order.id.substring(0, 8);
              return (
                <button 
                  key={order.id} 
                  onClick={() => {
                     setFormData({
                       memberIds: members.length > 0 ? [members[0].id] : [],
                       title: `#${displayId} - ${companyName}`,
                       start: startOffset.toString(),
                       duration: activeRange === 'Day' ? '1' : activeRange === 'Week' ? '1' : '1',
                       color: 'bg-blue-500',
                       orderId: order.id,
                       range: activeRange
                     });
                     setEditingTask(null);
                     setIsModalOpen(true);
                  }}
                  className="flex-shrink-0 bg-brand-bg/50 border border-brand-border rounded-lg p-3 text-left hover:border-brand-primary hover:shadow-sm transition-all min-w-[220px] max-w-[220px] group cursor-copy"
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="text-[10px] font-bold text-brand-secondary uppercase tracking-wider group-hover:text-brand-primary transition-colors truncate">#{displayId}</div>
                    <span className="text-[9px] bg-white border border-brand-border px-1.5 py-0.5 rounded-sm font-bold text-brand-secondary shrink-0 ml-2">Assign +</span>
                  </div>
                  <div className="text-sm font-semibold text-brand-primary truncate">{companyName}</div>
                  <div className="text-xs text-brand-secondary truncate">{order.title || 'Standard Order'}</div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Task Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-card shadow-2xl overflow-hidden border border-brand-border">
            <div className="px-6 py-4 border-b border-brand-border flex justify-between items-center bg-brand-bg/50">
              <h3 className="font-serif text-2xl text-brand-primary">
                {editingTask ? 'Edit Task' : 'Assign Task'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-brand-secondary hover:text-brand-primary transition-colors p-1 rounded-full hover:bg-white cursor-pointer">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5 flex items-center gap-1.5"><Clock size={12}/> Task Description</label>
                <input 
                  type="text" 
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  placeholder="e.g. Calibrate Printers"
                  className="w-full border border-brand-border rounded-lg p-3 text-sm focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all placeholder:text-brand-muted"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5 flex items-center justify-between">
                  <span>Assign To {editingTask ? '' : '(Select Multiple)'}</span>
                  {formData.memberIds.length > 1 && <span className="text-brand-primary">{formData.memberIds.length} Selected</span>}
                </label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar p-1">
                  {members.map(m => {
                    const isSelected = formData.memberIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        onClick={() => {
                          if (editingTask) {
                            setFormData({...formData, memberIds: [m.id]});
                          } else {
                            if (isSelected) {
                              setFormData({...formData, memberIds: formData.memberIds.filter(id => id !== m.id)});
                            } else {
                              setFormData({...formData, memberIds: [...formData.memberIds, m.id]});
                            }
                          }
                        }}
                        className={`px-3 py-1.5 rounded-pill border text-xs font-semibold transition-all ${isSelected ? 'bg-brand-primary text-white border-brand-primary shadow-sm' : 'bg-white text-brand-secondary border-brand-border hover:border-brand-primary/50'}`}
                      >
                        {m.name}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5">Start Time</label>
                  <select 
                    value={formData.start}
                    onChange={e => setFormData({...formData, start: e.target.value})}
                    className="w-full border border-brand-border rounded-lg p-3 text-sm focus:outline-none focus:border-brand-primary appearance-none bg-brand-bg/30"
                  >
                    {activeRange === 'Day' ? Array.from({length: 27}, (_, i) => 6 + (i * 0.5)).map(hour => {
                      const displayHour = Math.floor(hour) > 12 ? Math.floor(hour) - 12 : Math.floor(hour);
                      const displayMin = hour % 1 === 0 ? ':00' : ':30';
                      const ampm = Math.floor(hour) >= 12 ? 'PM' : 'AM';
                      return <option key={hour} value={hour}>{displayHour}{displayMin} {ampm}</option>;
                    }) : activeRange === 'Week' ? 
                       ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].flatMap((d, i) => [
                          <option key={`${i}-am`} value={i}>{d} AM</option>,
                          <option key={`${i}-pm`} value={i + 0.5}>{d} PM</option>
                       ])
                     : Array.from({length: 31}).map((_, i) => (
                          <option key={i} value={i}>Day {i + 1}</option>
                       ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5">Duration</label>
                  <select 
                    value={formData.duration}
                    onChange={e => setFormData({...formData, duration: e.target.value})}
                    className="w-full border border-brand-border rounded-lg p-3 text-sm focus:outline-none focus:border-brand-primary appearance-none bg-brand-bg/30"
                  >
                    {activeRange === 'Day' ? (
                      <>
                        <option value="0.5">30 Minutes</option>
                        <option value="1">1 Hour</option>
                        <option value="1.5">1.5 Hours</option>
                        <option value="2">2 Hours</option>
                        <option value="2.5">2.5 Hours</option>
                        <option value="3">3 Hours</option>
                        <option value="4">4 Hours</option>
                        <option value="8">Full Day (8 Hrs)</option>
                      </>
                    ) : activeRange === 'Week' ? (
                      <>
                        <option value="0.5">Half Day</option>
                        <option value="1">1 Day</option>
                        <option value="1.5">1.5 Days</option>
                        <option value="2">2 Days</option>
                        <option value="3">3 Days</option>
                        <option value="4">4 Days</option>
                        <option value="5">Full Week</option>
                      </>
                    ) : (
                      <>
                        <option value="1">1 Day</option>
                        <option value="2">2 Days</option>
                        <option value="3">3 Days</option>
                        <option value="4">4 Days</option>
                        <option value="5">5 Days</option>
                        <option value="7">1 Week</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">Status / Color</label>
                <div className="grid grid-cols-2 gap-2">
                  {STATUS_COLORS.map(status => (
                    <button
                      key={status.value}
                      onClick={() => setFormData({...formData, color: status.value})}
                      className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-all ${
                        formData.color === status.value 
                          ? 'border-brand-primary bg-brand-bg shadow-sm' 
                          : 'border-brand-border hover:bg-brand-bg/50'
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-sm ${status.value}`}></div>
                      <span className="font-semibold">{status.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className={`p-4 border-t border-brand-border bg-brand-bg/50 flex ${editingTask ? 'justify-between' : 'justify-end'} gap-3`}>
              {editingTask && (
                <button 
                  onClick={handleDelete}
                  className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
                >
                  <Trash2 size={14} /> Delete
                </button>
              )}
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-brand-secondary hover:text-brand-primary hover:bg-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave}
                  className="bg-brand-primary text-white text-xs font-bold px-6 py-2 rounded-lg uppercase tracking-widest hover:bg-black transition-colors shadow-sm disabled:opacity-50"
                  disabled={formData.memberIds.length === 0 || !formData.title.trim()}
                >
                  Save Task
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
