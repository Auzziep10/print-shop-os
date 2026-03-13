import { useState } from 'react';
import { tokens } from '../../lib/tokens';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { PillButton } from '../../components/ui/PillButton';
import { Calendar, Users, Plus } from 'lucide-react';
import { TimelinePlanner } from './TimelinePlanner';

export function Team() {
  const [activeView, setActiveView] = useState('Timeline');
  const [activeRange, setActiveRange] = useState('Day');

  return (
    <div className={tokens.layout.container}>
      {/* Header */}
      <div className={tokens.layout.pageHeader}>
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="text-brand-primary" size={24} strokeWidth={1.5} />
            <h1 className={tokens.typography.h1}>Daily Planner</h1>
          </div>
          <p className={tokens.typography.bodyMuted + " mt-2"}>
            AI-powered schedule generation and task management.
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <SegmentedControl 
            options={['Day', 'Week', 'Month']} 
            value={activeRange} 
            onChange={setActiveRange} 
          />
          <SegmentedControl 
            options={['Timeline', 'Kanban']} 
            value={activeView} 
            onChange={setActiveView} 
          />
          <div className="w-px h-8 bg-brand-border mx-2"></div>
          <PillButton variant="outline" className="gap-2">
            <Users size={16} />
            Manage Teams
          </PillButton>
          <PillButton variant="filled" className="gap-2">
            <Plus size={16} />
            New Task
          </PillButton>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="mt-6">
        {activeView === 'Timeline' ? (
          <TimelinePlanner />
        ) : (
          <div className="p-12 text-center text-brand-secondary border border-brand-border rounded-card bg-white">
            Kanban view coming soon...
          </div>
        )}
      </div>
    </div>
  );
}
