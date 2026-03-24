import { useState, useEffect } from 'react';
import { tokens } from '../../lib/tokens';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { KanbanBoard } from '../../components/shared/KanbanBoard';
import { TimelinePlanner } from '../Team/TimelinePlanner';
import { useAuth } from '../../contexts/AuthContext';
import { useOrders } from '../../hooks/useOrders';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';

export function Dashboard() {
  const { userData } = useAuth();
  const { orders } = useOrders();
  
  const [roleView, setRoleView] = useState('Production Staff');
  const [staffTimeframe, setStaffTimeframe] = useState('Day');
  const [activeStat, setActiveStat] = useState<string | null>(null);
  
  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Record<string, any>>({});

  useEffect(() => {
    if (userData && (userData.role === 'Admin' || userData.role === 'Manager')) {
      setRoleView('Manager / Admin');
    } else {
      setRoleView('Production Staff');
    }
  }, [userData]);

  useEffect(() => {
    getDocs(collection(db, 'customers')).then(snap => {
      const obj: Record<string,any> = {};
      snap.forEach(d => { obj[d.id] = d.data(); });
      setCustomers(obj);
    }).catch(e => console.error(e));
  }, []);

  useEffect(() => {
    if (!userData?.id) return;
    const qTasks = query(collection(db, 'timelineTasks'), where('memberId', '==', userData.id));
    const unsub = onSnapshot(qTasks, (snap) => {
      const tasks = snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      setMyTasks(tasks.sort((a, b) => (a.start || 0) - (b.start || 0)));
    });
    return unsub;
  }, [userData?.id]);

  const productionOrders = orders.filter(o => o.statusIndex === 6 || o.statusIndex === 7);

  const formatTaskTime = (start: number, duration: number) => {
    const formatHour = (h: number) => {
       const displayH = Math.floor(h) > 12 ? Math.floor(h) - 12 : Math.floor(h);
       const mins = h % 1 !== 0 ? ':30' : ':00';
       const ampm = Math.floor(h) >= 12 && h < 24 ? 'PM' : 'AM';
       return `${displayH}${mins} ${ampm}`;
    };
    return `${formatHour(start)} - ${formatHour(start + duration)}`;
  };

  return (
    <div className={tokens.layout.container}>
      {/* Header */}
      <div className={tokens.layout.pageHeader + " border-b border-brand-border pb-6"}>
        <div>
          <h1 className={tokens.typography.h1}>Dashboard</h1>
          <p className={tokens.typography.bodyMuted + " mt-2"}>
            Here is your daily production summary.
          </p>
        </div>
        
        <div>
           <SegmentedControl 
             options={['Production Staff', 'Manager / Admin']} 
             value={roleView} 
             onChange={setRoleView} 
           />
        </div>
      </div>
      
      {roleView === 'Manager / Admin' ? (
        <div className="mt-6 flex flex-col gap-10 pb-12">
          
          {/* Top Row: Quick Stats & Command Center */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left: Quick Stats */}
            <div className="lg:col-span-8 flex flex-col gap-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Awaiting Artwork', value: '12', trend: '+2 today' },
                { label: 'Pending Approval', value: '5', trend: 'Urgent' },
                { label: 'In Production', value: '28', trend: 'On schedule' },
                { label: 'Completed Today', value: '14', trend: '+15% vs yesterday' }
              ].map((stat) => (
                <button 
                  key={stat.label} 
                  onClick={() => setActiveStat(stat.label === activeStat ? null : stat.label)}
                  className={`p-4 rounded-card border text-left flex flex-col justify-between transition-all group ${
                    activeStat === stat.label 
                      ? 'bg-brand-bg border-brand-primary shadow-sm' 
                      : 'bg-white border-brand-border hover:border-brand-primary/30 hover:shadow-sm'
                  }`}
                >
                  <span className={`${tokens.typography.label} mb-3 leading-tight text-[11px] min-h-[2.5rem]`}>{stat.label}</span>
                  <div className="flex flex-col items-start gap-1 w-full">
                    <span className="font-serif text-3xl tracking-tight text-brand-primary leading-none">{stat.value}</span>
                    <span className={`text-[9px] uppercase font-bold tracking-wider mt-1 ${stat.trend.includes('Urgent') ? 'text-red-500' : 'text-brand-secondary'}`}>
                      {stat.trend}
                    </span>
                  </div>
                </button>
              ))}
              </div>
              
              {/* Breakdown Section */}
              {activeStat && (
                <div className="bg-brand-bg/50 rounded-card border border-brand-primary/30 p-5 mt-2 transition-all animate-in fade-in slide-in-from-top-1">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-serif text-xl tracking-tight text-brand-primary">
                      {activeStat} Summary
                    </h3>
                    <button 
                      onClick={() => setActiveStat(null)}
                      className="text-brand-secondary hover:text-brand-primary text-xs uppercase tracking-wider font-semibold p-1"
                    >
                      Close ✕
                    </button>
                  </div>
                  <div className="bg-white rounded-lg border border-brand-border overflow-hidden shadow-sm">
                    <div className="flex border-b border-brand-border bg-brand-bg px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-brand-secondary">
                      <div className="w-24">Order</div>
                      <div className="flex-1">Details</div>
                      <div className="w-24 text-right">Status</div>
                    </div>
                    <div className="divide-y divide-brand-border max-h-40 overflow-y-auto custom-scrollbar">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex px-4 py-3 text-sm hover:bg-brand-bg/50 transition-colors cursor-pointer items-center group">
                          <div className="w-24 font-medium text-brand-primary group-hover:underline">
                            ORD-20{i + Math.floor(Math.random() * 10)}
                          </div>
                          <div className="flex-1 text-brand-secondary truncate pr-4">
                            Sample task for {activeStat}
                          </div>
                          <div className="w-24 text-right flex justify-end">
                            <span className="text-[10px] bg-brand-bg border border-brand-border px-2 py-0.5 rounded-md text-brand-secondary font-semibold uppercase tracking-wide">
                              Action
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Command Center Focus */}
            <div className="lg:col-span-4 bg-brand-primary rounded-card p-6 flex flex-col justify-between relative overflow-hidden shadow-lg border border-brand-primary">
               {/* Background subtle decoration */}
               <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full border border-white/10"></div>
               <div className="absolute right-8 -bottom-12 w-48 h-48 rounded-full border border-white/5"></div>
               
               <div className="relative z-10">
                 <h3 className="font-serif text-2xl mb-1 text-white">Action Required</h3>
                 <p className="text-white/60 text-sm mb-6">Tools requiring immediate attention.</p>
                 
                 <div className="space-y-3 mb-6">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer group">
                      <span className="text-sm font-medium text-white/90 group-hover:text-white transition-colors">Review Client Proofs</span>
                      <span className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center font-bold text-xs shadow-sm">5</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer group">
                      <span className="text-sm font-medium text-white/90 group-hover:text-white transition-colors">Assign New Orders</span>
                      <span className="w-6 h-6 rounded-full bg-amber-500 text-brand-primary flex items-center justify-center font-bold text-xs shadow-sm">2</span>
                    </div>
                 </div>
               </div>

               <button className="relative z-10 w-full bg-white text-brand-primary font-semibold py-3 rounded-pill text-sm hover:bg-brand-bg transition-colors shadow-sm">
                 Open Command Center
               </button>
            </div>
          </div>

          {/* Team Schedule Overview */}
          <div className="bg-white rounded-card border border-brand-border p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between mb-6">
               <div>
                  <h2 className={tokens.typography.h2}>Today's Floor Schedule</h2>
                  <p className="text-sm text-brand-secondary mt-1">Real-time team allocation and timeline blocks.</p>
               </div>
               <a href="/team" className="px-4 py-2 border border-brand-border rounded-pill text-xs font-semibold uppercase tracking-widest text-brand-secondary hover:text-brand-primary hover:bg-brand-bg transition-colors">Manage Team</a>
            </div>
            <div className="border border-brand-border/50 rounded-2xl overflow-hidden">
              <TimelinePlanner />
            </div>
          </div>

          {/* Active Orders Kanban Overview */}
          <div className="bg-white rounded-card border border-brand-border p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between mb-6">
               <div>
                 <h2 className={tokens.typography.h2}>Live Production Pipeline</h2>
                 <p className="text-sm text-brand-secondary mt-1">Bird's-eye view of all active shop orders.</p>
               </div>
               <div className="flex items-center gap-3">
                 <button className="px-4 py-2 border border-brand-border rounded-pill text-xs font-semibold uppercase tracking-widest text-brand-secondary hover:text-brand-primary hover:bg-brand-bg transition-colors">Filter</button>
                 <a href="/orders" className="px-4 py-2 bg-brand-primary text-white rounded-pill text-xs font-semibold uppercase tracking-widest hover:bg-black transition-colors">View All</a>
               </div>
            </div>
            
            {/* We constrain the height of the dashboard Kanban so it acts as an overview tool */}
            <div className="max-h-[500px] overflow-y-auto overflow-x-hidden pr-2 pb-2 custom-scrollbar">
              <KanbanBoard />
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-8">
           <div className="flex items-center justify-between mb-6">
             <h2 className={tokens.typography.h2}>Your Dashboard</h2>
             <SegmentedControl 
               options={['Day', 'Week', 'Month']} 
               value={staffTimeframe} 
               onChange={setStaffTimeframe} 
             />
           </div>
           
           <div className="space-y-6">
             {/* Personal Tasks */}
             <div>
               <h3 className={tokens.typography.h3 + " mb-4"}>Assigned Tasks</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {myTasks.length === 0 ? (
                    <div className="md:col-span-2 text-sm text-brand-secondary italic p-4 bg-brand-bg/50 rounded-xl border border-brand-border">No tasks immediately assigned to you right now.</div>
                  ) : (
                    myTasks.map((task) => (
                     <div key={task.id} className="bg-white p-5 rounded-card border border-brand-border flex items-start gap-4 shadow-sm hover:shadow-md transition-shadow">
                       <div className={`w-3 h-3 rounded-sm mt-1 shrink-0 ${task.color || 'bg-blue-500'}`}></div>
                       <div>
                         <h4 className="font-semibold text-brand-primary mb-1 leading-tight">{task.title}</h4>
                         <span className="text-xs text-brand-secondary font-bold tracking-wider uppercase">{formatTaskTime(task.start, task.duration)}</span>
                       </div>
                     </div>
                    ))
                  )}
                </div>
             </div>

             {/* Order Assignments */}
             <div className="pt-4 border-t border-brand-border/50">
               <h3 className={tokens.typography.h3 + " mb-4"}>Production Orders</h3>
               <div className="bg-white rounded-card border border-brand-border overflow-hidden">
                 <div className="grid grid-cols-4 p-4 text-xs font-semibold uppercase tracking-wider text-brand-secondary border-b border-brand-border bg-brand-bg/50">
                   <div className="col-span-2">Order</div>
                   <div>Status</div>
                   <div>Due</div>
                 </div>
                 <div className="divide-y divide-brand-border max-h-[400px] overflow-y-auto">
                    {productionOrders.length === 0 ? (
                      <div className="p-8 text-center text-brand-secondary italic text-sm">No orders currently active on the floor.</div>
                    ) : (
                      productionOrders.map((order) => {
                        const companyName = customers[order.customerId]?.company || customers[order.customerId]?.name || order.customerId || 'Unknown Client';
                        const displayId = order.portalId || order.id.substring(0, 8);
                        
                        return (
                         <div key={order.id} className="grid grid-cols-4 p-4 items-center hover:bg-brand-bg transition-colors cursor-pointer group">
                           <div className="col-span-2 pr-4">
                             <div className="flex items-center gap-2 mb-1">
                               <span className="text-[10px] uppercase font-bold text-brand-secondary tracking-widest px-1.5 py-0.5 border border-brand-border/50 rounded">#{displayId}</span>
                               <span className="text-brand-primary font-serif">— {companyName}</span>
                             </div>
                             <p className="font-semibold text-brand-primary text-sm group-hover:underline line-clamp-1">{order.title}</p>
                           </div>
                           <div>
                             <span className={`text-[10px] border px-2.5 py-1 rounded-md font-bold tracking-wide uppercase ${order.statusIndex > 6 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-brand-bg border-brand-border/60 text-brand-secondary'}`}>
                               {order.statusIndex > 6 ? 'Kitting' : 'In Production'}
                             </span>
                           </div>
                           <div className="text-xs font-bold uppercase tracking-wider text-brand-secondary">
                             {order.shipDate ? new Date(order.shipDate).toLocaleDateString([], { month: 'short', day: 'numeric'}) : 'TBD'}
                           </div>
                         </div>
                        );
                      })
                    )}
                  </div>
               </div>
             </div>
           </div>
        </div>
      )}
    </div>
  );
}
