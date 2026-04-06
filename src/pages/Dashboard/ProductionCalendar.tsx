import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, FileText, CheckCircle2, Factory, Flag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface ProductionCalendarProps {
  orders: any[];
}

export function ProductionCalendar({ orders }: ProductionCalendarProps) {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const [draggedOrder, setDraggedOrder] = useState<any>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [hoveredOrder, setHoveredOrder] = useState<{ order: any, x: number, y: number } | null>(null);

  const formatStatus = (index: number) => {
    const statuses = ['Quote Created', 'Under Review', 'Quote Prepared', 'Approved', 'Sourcing', 'Ordered', 'In Production', 'Shipped / Inventory', 'Received / Live'];
    return statuses[index] || 'Open';
  };

  const getOrderSummary = (order: any) => {
    let total = 0;
    const styles: string[] = [];
    (order.items || []).forEach((item: any) => {
       const qty = parseInt(item.qty as string) || Object.values(item.sizes || {}).reduce((a: any, b: any) => a + (parseInt(b) || 0), 0) as number;
       total += qty;
       styles.push(`${qty}x ${item.style}`);
    });
    return { total, styles };
  };

  const calendarData = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const firstDayOfWeek = firstDayOfMonth.getDay(); // 0-6 (Sun-Sat)
    const daysInMonth = lastDayOfMonth.getDate();

    const days = [];
    
    // Add padding for first week
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = 0; i < firstDayOfWeek; i++) {
       days.push(new Date(year, month - 1, prevMonthDays - firstDayOfWeek + i + 1));
    }
    
    // Add days of month
    for (let i = 1; i <= daysInMonth; i++) {
       days.push(new Date(year, month, i));
    }

    return { days, year, month };
  }, [currentDate]);

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  // Group events by YYYY-MM-DD
  const eventsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    
    orders.forEach(o => {
       if (o.isMetricsArchived || o.isProjectGroup) return; // Skip metrics archived and groups to prevent duplicates
       
       let targetDateStr = o.targetCompletionDate;
       if (!targetDateStr && o.createdAt) {
           try {
             targetDateStr = new Date(o.createdAt).toISOString().split('T')[0];
           } catch(e) {}
       }
       
       if (targetDateStr) {
           if (!map[targetDateStr]) map[targetDateStr] = [];
           map[targetDateStr].push(o);
       }
    });
    
    return map;
  }, [orders]);

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const getEventStyles = (statusIndex: number) => {
     if (statusIndex <= 2) {
         return 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 hover:border-amber-300';
     } else if (statusIndex === 6) {
         return 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 hover:border-indigo-300';
     } else if (statusIndex >= 7) {
         return 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100 hover:border-green-300';
     } else {
         return 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:border-blue-300';
     }
  };

  const getEventIcon = (statusIndex: number) => {
      if (statusIndex <= 2) return <FileText size={10} className="shrink-0" />;
      if (statusIndex === 6) return <Factory size={10} className="shrink-0" />;
      if (statusIndex >= 7) return <CheckCircle2 size={10} className="shrink-0" />;
      return <Flag size={10} className="shrink-0" />;
  };

  // Calculate grid rows accurately to maintain solid structure
  const totalSlots = calendarData.days.length;
  const trailingEmpty = totalSlots % 7 === 0 ? 0 : 7 - (totalSlots % 7);
  
  const paddedDays = useMemo(() => {
    const arr = [...calendarData.days];
    for (let i = 0; i < trailingEmpty; i++) {
      arr.push(new Date(calendarData.year, calendarData.month + 1, i + 1));
    }
    return arr;
  }, [calendarData, trailingEmpty]);

  const handleDragStart = (e: React.DragEvent, order: any) => {
     setDraggedOrder(order);
     e.dataTransfer.effectAllowed = 'move';
     // Optional: store id if needed, but we have state
     e.dataTransfer.setData('text/plain', order.id);
     
     // Hack for making the drag image look cleaner (optional)
     const rect = (e.target as HTMLElement).getBoundingClientRect();
     e.dataTransfer.setDragImage(e.target as HTMLElement, rect.width / 2, rect.height / 2);
  };

  const handleDragOver = (e: React.DragEvent, dateStr: string | null) => {
     if (!dateStr) return;
     e.preventDefault();
     if (dragOverDate !== dateStr) {
        setDragOverDate(dateStr);
     }
  };

  const handleDragLeave = () => {
     setDragOverDate(null);
  };

  const handleDrop = async (e: React.DragEvent, dateStr: string | null) => {
     e.preventDefault();
     setDragOverDate(null);
     
     if (!dateStr || !draggedOrder) return;
     
     // Prevent unnecessary writes
     let targetDateStr = draggedOrder.targetCompletionDate;
     if (!targetDateStr && draggedOrder.createdAt) {
         try { targetDateStr = new Date(draggedOrder.createdAt).toISOString().split('T')[0]; } catch(err){}
     }
     
     if (targetDateStr === dateStr) return; // Dropped on the same date

     // If dropped on a padding day, optionally switch to that month
     const dropDate = new Date(dateStr + "T00:00:00");
     if (dropDate.getMonth() !== calendarData.month) {
        setCurrentDate(new Date(dropDate.getFullYear(), dropDate.getMonth(), 1));
     }

     try {
       await updateDoc(doc(db, 'orders', draggedOrder.id), { 
         targetCompletionDate: dateStr 
       });
     } catch(err) {
       console.error("Failed to update date:", err);
     }
     setDraggedOrder(null);
  };

  return (
    <div className="bg-white rounded-card border border-brand-border p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] flex flex-col h-full min-h-[600px] relative">
       
       {/* Hover Popover */}
       {hoveredOrder && (
          <div 
            className="fixed z-50 w-72 bg-white border border-brand-border shadow-xl rounded-xl p-4 pointer-events-none transform -translate-y-full -translate-x-1/2"
            style={{ top: hoveredOrder.y - 12, left: hoveredOrder.x }}
          >
             <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white px-2 py-0.5 rounded-md shadow-sm" style={{ backgroundColor: hoveredOrder.order.statusIndex >= 7 ? '#10B981' : hoveredOrder.order.statusIndex === 6 ? '#6366F1' : '#3B82F6' }}>
                   {formatStatus(hoveredOrder.order.statusIndex || 0)}
                </span>
                <span className="text-[11px] font-bold text-brand-secondary ml-auto">{hoveredOrder.order.targetCompletionDate || 'No Due Date'}</span>
             </div>
             <h4 className="font-serif text-lg text-brand-primary leading-tight mb-2 line-clamp-2">{hoveredOrder.order.title || 'Untitled'}</h4>
             
             {(() => {
                const { total, styles } = getOrderSummary(hoveredOrder.order);
                return (
                  <div>
                    <div className="text-xs font-semibold text-brand-primary mb-1">{total} Garment{total !== 1 ? 's' : ''}</div>
                    <ul className="text-[11px] text-brand-secondary list-disc pl-4 space-y-0.5 max-h-24 overflow-hidden relative">
                       {styles.slice(0, 4).map((s, i) => <li key={i} className="truncate">{s}</li>)}
                       {styles.length > 4 && <li className="text-[10px] italic">+{styles.length - 4} more items</li>}
                    </ul>
                  </div>
                );
             })()}
             
             {/* Caret */}
             <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-white relative z-10"></div>
             <div className="absolute top-[calc(100%+1px)] left-1/2 -translate-x-1/2 border-8 border-transparent border-t-brand-border z-0"></div>
          </div>
       )}
       <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-serif text-2xl text-brand-primary">{monthNames[calendarData.month]} {calendarData.year}</h2>
            <p className="text-sm text-brand-secondary mt-0.5">Production & Quote Schedule</p>
          </div>
          <div className="flex items-center gap-1 bg-brand-bg/50 p-1.5 rounded-xl border border-brand-border/60">
             <button 
               onClick={prevMonth}
               onDragEnter={(e) => { e.preventDefault(); prevMonth(); }}
               onDragOver={(e) => e.preventDefault()}
               className="p-1.5 rounded-md hover:bg-white hover:shadow-sm text-brand-secondary hover:text-brand-primary transition-all"
             >
               <ChevronLeft size={18} />
             </button>
             <button 
               onClick={() => {
                   const d = new Date();
                   d.setDate(1);
                   setCurrentDate(d);
               }}
               className="px-3 py-1 text-xs font-bold uppercase tracking-widest text-brand-secondary hover:text-brand-primary transition-colors"
             >
                Today
             </button>
             <button 
               onClick={nextMonth}
               onDragEnter={(e) => { e.preventDefault(); nextMonth(); }}
               onDragOver={(e) => e.preventDefault()}
               className="p-1.5 rounded-md hover:bg-white hover:shadow-sm text-brand-secondary hover:text-brand-primary transition-all"
             >
               <ChevronRight size={18} />
             </button>
          </div>
       </div>

       <div className="grid grid-cols-7 border-t border-l border-brand-border/60 bg-brand-bg/30 flex-1 rounded-bl-lg rounded-br-lg overflow-hidden">
          {dayNames.map(day => (
             <div key={day} className="px-2 py-3 text-center border-r border-b border-brand-border/60 bg-white shadow-sm z-10">
                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary">{day}</span>
             </div>
          ))}

          {paddedDays.map((date, i) => {
             const dtStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
             const events = eventsByDate[dtStr] || [];
             const isToday = dtStr === new Date().toISOString().split('T')[0];
             const isDragOver = dragOverDate === dtStr;
             const isCurrentMonth = date.getMonth() === calendarData.month;

             return (
                <div 
                  key={i} 
                  className={`min-h-[100px] border-r border-b border-brand-border/60 p-1.5 flex flex-col gap-1 transition-colors relative ${isCurrentMonth ? 'bg-white hover:bg-brand-bg/20' : 'bg-neutral-50/50 hover:bg-neutral-100'} ${isDragOver ? 'bg-brand-primary/5 border-brand-primary/30 ring-2 ring-inset ring-brand-primary/20 z-10' : ''}`}
                  onDragOver={(e) => handleDragOver(e, dtStr)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, dtStr)}
                  onDragEnter={(e) => {
                      if (!isCurrentMonth) {
                          e.preventDefault();
                          if (date.getTime() < new Date(calendarData.year, calendarData.month, 1).getTime()) {
                             prevMonth();
                          } else {
                             nextMonth();
                          }
                      }
                  }}
                >
                   <div className={`text-xs ml-1 mt-0.5 mb-1 font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-brand-primary text-white shadow-sm' : isCurrentMonth ? 'text-neutral-400' : 'text-neutral-300'}`}>
                      {date.getDate()}
                   </div>
                   <div className="flex flex-col gap-1 overflow-y-auto custom-scrollbar flex-1 max-h-[80px]">
                      {events.map((ev, idx) => (
                         <div 
                           key={idx}
                           draggable
                           onDragStart={(e) => { handleDragStart(e, ev); setHoveredOrder(null); }}
                           onMouseEnter={(e) => {
                               const rect = e.currentTarget.getBoundingClientRect();
                               setHoveredOrder({ order: ev, x: rect.left + rect.width / 2, y: rect.top });
                           }}
                           onMouseLeave={() => setHoveredOrder(null)}
                           onClick={() => navigate(`/orders/${ev.id}`)}
                           className={`px-1.5 py-1 text-[10px] sm:text-[11px] font-medium border rounded-[4px] cursor-pointer truncate flex items-center gap-1.5 transition-all shadow-sm ${getEventStyles(ev.statusIndex || 0)} ${draggedOrder?.id === ev.id ? 'opacity-30' : 'opacity-100'}`}
                           title={ev.title}
                         >
                            {getEventIcon(ev.statusIndex || 0)}
                            <span className="truncate">{ev.title || 'Untitled'}</span>
                         </div>
                      ))}
                   </div>
                </div>
             );
          })}
       </div>
    </div>
  );
}
