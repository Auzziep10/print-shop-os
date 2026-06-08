import { tokens } from '../../lib/tokens';
import { MessageSquare } from 'lucide-react';
import { TeamMeetings } from './TeamMeetings';

export function TeamMeetingsPage() {
  return (
    <div className={tokens.layout.container}>
      {/* Page Header */}
      <div className={tokens.layout.pageHeader}>
        <div>
          <div className="flex items-center gap-3 mb-2">
            <MessageSquare className="text-brand-primary" size={24} strokeWidth={1.5} />
            <h1 className={tokens.typography.h1}>Team Meetings</h1>
          </div>
          <p className={tokens.typography.bodyMuted + " mt-2"}>
            Record pre-meeting capacity check-in scores and sync or parse discussions.
          </p>
        </div>
      </div>

      {/* Main Content Dashboard */}
      <div className="mt-6">
        <TeamMeetings />
      </div>
    </div>
  );
}

export default TeamMeetingsPage;
