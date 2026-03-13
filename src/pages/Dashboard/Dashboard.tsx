import { useState } from 'react';
import { tokens } from '../../lib/tokens';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { KanbanBoard } from '../../components/shared/KanbanBoard';
import { TimelinePlanner } from '../Team/TimelinePlanner';

export function Dashboard() {
  const [roleView, setRoleView] = useState('Manager / Admin');
  const [staffTimeframe, setStaffTimeframe] = useState('Day');

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
            <div className="lg:col-span-8 grid grid-cols-2 gap-4">
              {[
                { label: 'Awaiting Artwork', value: '12', trend: '+2 today' },
                { label: 'Pending Approval', value: '5', trend: 'Urgent' },
                { label: 'In Production', value: '28', trend: 'On schedule' },
                { label: 'Completed Today', value: '14', trend: '+15% vs yesterday' }
              ].map((stat) => (
                <div key={stat.label} className="bg-white p-5 rounded-card border border-brand-border flex flex-col justify-center">
                  <span className={tokens.typography.label + " mb-2"}>{stat.label}</span>
                  <div className="flex items-end justify-between">
                    <span className="font-serif text-4xl tracking-tight text-brand-primary">{stat.value}</span>
                    <span className={`text-[10px] uppercase font-bold tracking-wider ${stat.trend.includes('Urgent') ? 'text-red-500' : 'text-brand-secondary'}`}>
                      {stat.trend}
                    </span>
                  </div>
                </div>
              ))}
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
            <div className="max-h-[500px] overflow-y-auto pr-2 pb-2 custom-scrollbar">
              <KanbanBoard />
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
                 {[
                   { title: 'Research ColDesi information', time: '10:00 AM - 12:00 PM', status: 'Active', color: 'bg-blue-500' },
                   { title: 'Calibrate Printers', time: '1:00 PM - 2:00 PM', status: 'Not Started', color: 'bg-amber-500' },
                 ].map((task, i) => (
                   <div key={i} className="bg-white p-5 rounded-card border border-brand-border flex items-start gap-4">
                     <div className={`w-3 h-3 rounded-sm mt-1 shrink-0 ${task.color}`}></div>
                     <div>
                       <h4 className="font-semibold text-brand-primary mb-1">{task.title}</h4>
                       <span className="text-xs text-brand-secondary font-medium tracking-wide uppercase">{task.time}</span>
                     </div>
                   </div>
                 ))}
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
                 <div className="divide-y divide-brand-border">
                   {[
                     { id: 'ORD-103', title: '250x Event Polos', customer: 'Wayne Ent', status: 'Printing', due: 'Today' },
                     { id: 'ORD-105', title: '1000x Tote Bags', customer: 'Daily Bugle', status: 'Curing', due: 'Tomorrow' },
                   ].map((order) => (
                     <div key={order.id} className="grid grid-cols-4 p-4 items-center hover:bg-brand-bg transition-colors cursor-pointer group">
                       <div className="col-span-2">
                         <div className="flex items-center gap-2 mb-1">
                           <span className="text-xs font-semibold text-brand-secondary">{order.id}</span>
                           <span className="text-brand-primary font-serif">— {order.customer}</span>
                         </div>
                         <p className="font-medium text-brand-primary group-hover:underline">{order.title}</p>
                       </div>
                       <div>
                         <span className="text-[10px] bg-brand-bg border border-brand-border/60 px-2.5 py-1 rounded-md text-brand-secondary font-semibold tracking-wide uppercase">
                           {order.status}
                         </span>
                       </div>
                       <div className="text-sm font-medium text-brand-primary">
                         {order.due}
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
             </div>
           </div>
        </div>
      )}
    </div>
  );
}
