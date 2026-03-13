import { tokens } from '../../lib/tokens';

const TEAM_MEMBERS = [
  { id: '1', name: 'Anna Garcia', initials: 'AG' },
  { id: '2', name: 'Austin Patterson', initials: 'AP' },
  { id: '3', name: 'Daniel Blackwell', initials: 'DB' },
  { id: '4', name: 'Joe Cdebaca', initials: 'JC' },
  { id: '5', name: 'Kurtis Hogue', initials: 'KH' },
  { id: '6', name: 'Vanessa Miller', initials: 'VM' },
];

const TASKS = [
  { id: 't1', memberId: '1', title: 'Research new methods for design...', start: 10, duration: 2, color: 'bg-blue-500' },
  { id: 't2', memberId: '2', title: 'Continue Pebble Beach Rend...', start: 9, duration: 2, color: 'bg-blue-500' },
  { id: 't3', memberId: '2', title: 'Work on Meado...', start: 11, duration: 1.5, color: 'bg-blue-500' },
  { id: 't4', memberId: '2', title: 'Move Catalyst Dashboard to ...', start: 13, duration: 2, color: 'bg-blue-500' },
  { id: 't5', memberId: '2', title: 'M...', start: 15, duration: 1, color: 'bg-green-500' },
  { id: 't6', memberId: '6', title: 'Finish procurement', start: 10, duration: 2.5, color: 'bg-green-500' },
  { id: 't7', memberId: '6', title: 'Prepare tomorrow schedule', start: 12.5, duration: 2, color: 'bg-blue-500' },
  { id: 't8', memberId: '6', title: 'Connect with team on progress', start: 12, duration: 4, color: 'bg-blue-500', rowOffset: 1 },
];

const HOURS = Array.from({ length: 14 }, (_, i) => i + 6); // 6am to 7pm

export function TimelinePlanner() {
  return (
    <div className="bg-white border border-brand-border rounded-card overflow-hidden">
      <div className="p-6 border-b border-brand-border flex justify-between items-center bg-brand-bg/50">
        <div>
          <h2 className={tokens.typography.h3}>Team Timeline</h2>
          <p className="text-xs text-brand-secondary mt-1 tracking-wide">Drag to move • Drag edges to resize</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[1000px]">
          {/* Header Row */}
          <div className="grid grid-cols-[200px_1fr] border-b border-brand-border relative">
            <div className="p-4 text-xs font-semibold uppercase tracking-wider text-brand-secondary">
              Team Members
            </div>
            <div className="flex relative">
              {HOURS.map((hour) => (
                <div key={hour} className="flex-1 border-l border-brand-border/50 p-4 text-xs font-medium text-brand-secondary/70">
                  {hour > 12 ? `${hour-12}pm` : hour === 12 ? '12pm' : `${hour}am`}
                </div>
              ))}
              {/* Current Time Indicator line */}
              <div className="absolute top-0 bottom-0 left-[58%] w-0.5 bg-red-400 z-10 flex flex-col items-center">
                 <div className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm mt-4 tracking-wider">
                   12:58 PM
                 </div>
              </div>
            </div>
          </div>

          {/* Member Rows */}
          {TEAM_MEMBERS.map((member) => (
            <div key={member.id} className="grid grid-cols-[200px_1fr] border-b border-brand-border/50 group hover:bg-brand-bg transition-colors">
              <div className="p-4 flex items-center gap-3 border-r border-brand-border/50 bg-white group-hover:bg-brand-bg transition-colors relative z-20">
                <span className="w-8 h-8 rounded-full bg-brand-muted border border-brand-border flex items-center justify-center text-xs font-semibold text-brand-primary">
                  {member.initials}
                </span>
                <span className="text-sm font-medium text-brand-primary">{member.name}</span>
              </div>
              
              {/* Timeline Track */}
              <div className="relative min-h-[60px] py-3">
                {/* Background grid lines */}
                <div className="absolute inset-0 flex">
                   {HOURS.map((hour) => (
                     <div key={hour} className="flex-1 border-l border-brand-border/50"></div>
                   ))}
                </div>

                {/* Tasks */}
                {TASKS.filter(t => t.memberId === member.id).map((task) => {
                  const hourWidth = 100 / HOURS.length;
                  const left = (task.start - HOURS[0]) * hourWidth;
                  const width = task.duration * hourWidth;
                  const topOffset = task.rowOffset ? task.rowOffset * 34 : 0;
                  
                  return (
                    <div 
                      key={task.id}
                      className={`absolute h-8 rounded-md text-white text-xs px-2 flex items-center shadow-sm cursor-pointer hover:opacity-90 transition-opacity whitespace-nowrap overflow-hidden ${task.color}`}
                      style={{ 
                        left: `${left}%`, 
                        width: `calc(${width}% - 4px)`, 
                        top: `12px`,
                        marginTop: `${topOffset}px`,
                        zIndex: 10
                      }}
                    >
                      <span className="font-semibold opacity-75 mr-1.5">{member.initials}</span> 
                      <span className="truncate">{task.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Legend */}
      <div className="p-4 border-t border-brand-border bg-brand-bg/50 flex items-center gap-6">
         <div className="flex items-center gap-2 text-xs font-medium text-brand-secondary"><div className="w-3 h-3 rounded-sm bg-amber-500"></div>Not Started</div>
         <div className="flex items-center gap-2 text-xs font-medium text-brand-secondary"><div className="w-3 h-3 rounded-sm bg-blue-500"></div>Active</div>
         <div className="flex items-center gap-2 text-xs font-medium text-brand-secondary"><div className="w-3 h-3 rounded-sm bg-green-500"></div>Complete</div>
         <div className="flex items-center gap-2 text-xs font-medium text-brand-secondary"><div className="w-3 h-3 rounded-sm bg-red-500"></div>Delayed</div>
      </div>
    </div>
  );
}
