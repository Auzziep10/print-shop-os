import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { PillButton } from '../../components/ui/PillButton';
import { 
  Calendar, 
  Clock, 
  Plus, 
  X, 
  Trash2, 
  Sparkles, 
  Check, 
  FileText, 
  UserPlus, 
  Loader2, 
  Search,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Pencil,
  Settings
} from 'lucide-react';

// Predefined fallbacks to prevent empty states
const FALLBACK_USERS = [
  { id: 'usr-1', name: 'Alice Smith', email: 'alice@wovn.com' },
  { id: 'usr-2', name: 'Bob Jones', email: 'bob@wovn.com' },
  { id: 'usr-3', name: 'Charlie Brown', email: 'charlie@wovn.com' },
  { id: 'usr-4', name: 'Diana Prince', email: 'diana@wovn.com' }
];

const MOCK_MEETINGS_CATALOG = [
  {
    id: 'meet-1',
    title: 'Weekly Sync & Print Shop Pipeline Review',
    date: new Date().toISOString().split('T')[0],
    summary: 'Discussed order queue, signatures placement in settings, and layout changes. Aligned on moving public quote link.',
    notes: `## Meeting Notes - Weekly Sync

### 1. Production Queue Status
* Standard orders are running on time. We have about 12 active orders in the pipeline.
* DTF Supplies are fully stocked.
* Large customer order from AION is currently in stage "1 - Mgmt Notified".

### 2. UI Reorganization
* Nesting **Artwork** pipeline inside **Production** (Pipeline sub-tab).
* Nesting **Reports** under **Orders/Quotes** sub-tab.
* Relocated **Public Quote** link to the top header next to the notification bell.

### 3. Open Issues
* Tradeoffs needed for upcoming rush orders. Alice to coordinate with production.
* Need priority call on platform sprint vs client deliverables.`,
    attendees: ['Alice Smith', 'Bob Jones', 'Charlie Brown'],
    actionItems: [
      { text: 'Coordinate with production on upcoming rush orders (Alice)', completed: false },
      { text: 'Verify Shopify order webhook sync (Bob)', completed: false },
      { text: 'Double check DTF supplies levels (Charlie)', completed: true }
    ],
    capacityScores: [
      {
        memberId: 'usr-1',
        memberName: 'Alice Smith',
        score: 6.2,
        status: 'Optimal Zone',
        confidence: 'Green',
        notes: 'Good energy, but workload is getting high with the new rush orders.',
        categories: { workload: 7, urgency: 6, stress: 5, availability: 6, friction: 7 }
      },
      {
        memberId: 'usr-2',
        memberName: 'Bob Jones',
        score: 5.4,
        status: 'Optimal Zone',
        confidence: 'Green',
        notes: 'No blockers, waiting on Shopify developer account credentials.',
        categories: { workload: 6, urgency: 5, stress: 5, availability: 5, friction: 6 }
      },
      {
        memberId: 'usr-3',
        memberName: 'Charlie Brown',
        score: 4.8,
        status: 'Comfortable',
        confidence: 'Green',
        notes: 'Calm day. Finished stock checks early.',
        categories: { workload: 5, urgency: 4, stress: 4, availability: 6, friction: 5 }
      }
    ]
  },
  {
    id: 'meet-2',
    title: 'Production Review & Artwork Signoff',
    date: new Date(Date.now() - 86400000 * 3).toISOString().split('T')[0],
    summary: 'Focused on resolving design bottlenecks for custom garments. Agreed on a new proof approval flow.',
    notes: `## Meeting Notes - Production & Artwork

### 1. Bottlenecks
* Design approvals are taking too long.
* Clients are changing artwork after production start.

### 2. Resolutions
* Introduced lock state on orders once approved.
* Created dedicated signoff modal for proof verification.`,
    attendees: ['Alice Smith', 'Charlie Brown'],
    actionItems: [
      { text: 'Deploy lock state validation rule on Firestore (Bob)', completed: true },
      { text: 'Reach out to AION for proof signoff (Alice)', completed: false }
    ],
    capacityScores: [
      {
        memberId: 'usr-1',
        memberName: 'Alice Smith',
        score: 7.2,
        status: 'Constrained',
        confidence: 'Yellow',
        notes: 'Waiting on client approvals, blocked on several quotes.',
        categories: { workload: 8, urgency: 8, stress: 7, availability: 8, friction: 5 }
      },
      {
        memberId: 'usr-3',
        memberName: 'Charlie Brown',
        score: 5.0,
        status: 'Optimal Zone',
        confidence: 'Green',
        notes: 'Smooth progress on warehouse mapping.',
        categories: { workload: 5, urgency: 5, stress: 5, availability: 5, friction: 5 }
      }
    ]
  }
];


const formatLocalDate = (dateStr: string, options?: Intl.DateTimeFormatOptions) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts.map(Number);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      const date = new Date(Date.UTC(year, month - 1, day));
      return date.toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });
    }
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString(undefined, options);
};

const TASK_KEYWORDS = ['action item', 'todo', 'task', 'follow-up', 'follow up', 'next step', 'action checklist', 'action items', 'todos', 'tasks', 'next steps'];

const ACTION_VERBS = [
  'register', 'finish', 'verify', 'coordinate', 'check', 'review', 'finalize', 'deploy', 'fix',
  'update', 'create', 'add', 'remove', 'delete', 'build', 'test', 'design', 'setup', 'send',
  'contact', 'reach', 'follow', 'investigate', 'prepare', 'schedule', 'discuss', 'resolve',
  'clean', 'publish', 'submit', 'implement', 'configure', 'integrate', 'document', 'write',
  'analyze', 'research', 'migrate', 'refactor', 'do', 'make', 'get', 'run', 'push', 'pull',
  'sync', 'draft', 'launch', 'track', 'monitor', 'audit', 'request', 'approve'
];

const parseSectionsFromText = (text: string) => {
  const lines = text.split(/\r?\n/);
  const sections: { name: string; notes: string }[] = [];
  let currentSectionName = '';
  let currentSectionLines: string[] = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    const cleanLine = trimmed.replace(/^[-*+]\s+/, '');
    
    const markdownMatch = cleanLine.match(/^#{1,6}\s+(.+)$/);
    const boldMatch = cleanLine.match(/^\*\*([^*]+)\*\*:?$/) || cleanLine.match(/^__([^_]+)__:?$/);
    const colonMatch = cleanLine.match(/^([A-Z][a-zA-Z\s?]{2,40}):$/);
    
    const isTaskHeader = TASK_KEYWORDS.some(kw => {
      const cleanL = cleanLine.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanK = kw.toLowerCase().replace(/[^a-z0-9]/g, '');
      return cleanL === cleanK && cleanL.length > 2;
    });

    const headerMatch = markdownMatch || boldMatch || colonMatch || isTaskHeader;

    if (headerMatch) {
      if (currentSectionName || currentSectionLines.length > 0) {
        sections.push({
          name: currentSectionName,
          notes: currentSectionLines.join('\n').trim()
        });
      }
      let rawName = '';
      if (markdownMatch) rawName = markdownMatch[1];
      else if (boldMatch) rawName = boldMatch[1];
      else if (colonMatch) rawName = colonMatch[1];
      else rawName = cleanLine;

      currentSectionName = rawName.replace(/:$/, '').replace(/\*\*$/, '').replace(/^\*\*/, '').trim();
      currentSectionLines = [];
    } else {
      currentSectionLines.push(line);
    }
  });

  if (currentSectionName || currentSectionLines.length > 0) {
    sections.push({
      name: currentSectionName,
      notes: currentSectionLines.join('\n').trim()
    });
  }

  return sections;
};

const parseGeminiNotes = (text: string, memberNames: string[] = []) => {
  try {
    const lines = (text || '').split(/\r?\n/).map(l => l.trim());
    let parsedTitle = '';
    let parsedDate = new Date().toISOString().split('T')[0];
    const actionItems: { text: string; completed: boolean }[] = [];

    const dateRegex = /\b(19|20)\d\d[- /.](0[1-9]|1[012])[- /.](0[1-9]|[12][0-9]|3[01])\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/i;

    lines.forEach((line, index) => {
      if (!line) return;

      if (!parsedTitle && (line.startsWith('#') || line.startsWith('**') || index === 0)) {
        parsedTitle = line.replace(/^[#\*\s]+/, '').replace(/[\*\s]+$/, '');
      }

      const dateMatch = line.match(dateRegex);
      if (dateMatch) {
        try {
          const parsed = new Date(dateMatch[0]);
          if (!isNaN(parsed.getTime())) {
            parsedDate = parsed.toISOString().split('T')[0];
          }
        } catch (e) {
          console.error(e);
        }
      }
    });

    const parsedSections = parseSectionsFromText(text || '');

    const taskSections = (parsedSections || []).filter(sec => 
      sec && sec.name && TASK_KEYWORDS.some(keyword => sec.name.toLowerCase().includes(keyword))
    );

    const seenTexts = new Set<string>();

    const simplifyActionText = (actionText: string): string => {
      let cleaned = actionText.trim();

      // Suffix/filler patterns to strip
      const fillers = [
        /\s+(?:immediately\s+)?following\s+the\s+meeting\.?/i,
        /\s+as\s+soon\s+as\s+possible\.?/i,
        /\s+by\s+the\s+end\s+of\s+the\s+(?:day|week|sprint|month)\.?/i,
        /\s+during\s+the\s+meeting\.?/i,
        /\s+to\s+enable\s+.+$/i,
        /\s+so\s+that\s+.+$/i,
        /\s+in\s+order\s+to\s+.+$/i,
        /\s+to\s+allow\s+.+$/i,
        /\s+to\s+help\s+with\s+.+$/i,
        /\s+regarding\s+the\s+.+$/i
      ];

      fillers.forEach(regex => {
        cleaned = cleaned.replace(regex, '');
      });

      // Simplify common wordy phrases
      cleaned = cleaned
        .replace(/\bfinish\s+the\s+remaining\s+sections\s+of\s+the\b/i, 'Finish remaining')
        .replace(/\bfinish\s+the\s+remaining\s+sections\s+of\b/i, 'Finish remaining')
        .replace(/\bcheck\s+on\s+the\s+status\s+of\s+the\b/i, 'Check')
        .replace(/\bcoordinate\s+with\s+([A-Za-z\s]+)\s+to\s+coordinate\b/i, 'Coordinate with $1 for')
        .replace(/\breview\s+and\s+verify\b/i, 'Verify')
        .replace(/\bmake\s+sure\s+to\s+check\b/i, 'Check');

      // Capitalize first letter of the actual action part
      const colonIdx = cleaned.indexOf(':');
      if (colonIdx !== -1) {
        const namePart = cleaned.slice(0, colonIdx + 1);
        let actionPart = cleaned.slice(colonIdx + 1).trim();
        if (actionPart) {
          actionPart = actionPart.charAt(0).toUpperCase() + actionPart.slice(1);
        }
        cleaned = namePart + ' ' + actionPart;
      } else {
        // Also handle "Name to Action" capitalization and format to Name: Action
        const toMatch = cleaned.match(/^([A-Za-z\s]+)\s+to\s+(.+)/i);
        if (toMatch) {
          const namePart = toMatch[1].trim();
          let actionPart = toMatch[2].trim();
          actionPart = actionPart.charAt(0).toUpperCase() + actionPart.slice(1);
          cleaned = `${namePart}: ${actionPart}`;
        } else {
          cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
        }
      }

      // Truncate to maximum words if still excessively wordy
      const words = cleaned.split(/\s+/);
      if (words.length > 15) {
        cleaned = words.slice(0, 12).join(' ') + '...';
      }

      return cleaned.trim();
    };

    const addActionItem = (itemText: string) => {
      if (!itemText) return;
      const cleaned = itemText.trim().replace(/^\[[ x]\]\s*/i, '');
      if (!cleaned) return;
      if (TASK_KEYWORDS.some(keyword => cleaned.toLowerCase() === keyword)) return;

      const simplified = simplifyActionText(cleaned);
      if (!simplified) return;

      if (!seenTexts.has(simplified)) {
        seenTexts.add(simplified);
        actionItems.push({ text: simplified, completed: false });
      }
    };

    // 1. Extract from task-related sections
    taskSections.forEach(sec => {
      if (sec && sec.notes) {
        const secLines = sec.notes.split(/\r?\n/);
        secLines.forEach(line => {
          const trimmedLine = line.trim();
          if (!trimmedLine) return;
          const match = trimmedLine.match(/^[-*+]\s+(.*)/) || trimmedLine.match(/^\d+\.\s+(.*)/);
          if (match) {
            addActionItem(match[1]);
          } else {
            addActionItem(trimmedLine);
          }
        });
      }
    });

    // Build sets for known member names
    const knownNames = new Set<string>();
    const knownFirstNames = new Set<string>();
    (memberNames || []).forEach(name => {
      if (!name) return;
      const lower = name.toLowerCase().trim();
      knownNames.add(lower);
      const parts = lower.split(/\s+/);
      if (parts[0]) {
        knownFirstNames.add(parts[0]);
      }
    });

    // Add robust fallback names
    const defaultNames = ['alice', 'bob', 'charlie', 'diana', 'austin', 'mel', 'patterson', 'pete', 'john', 'sarah', 'kate'];
    defaultNames.forEach(n => {
      knownFirstNames.add(n);
      knownNames.add(n);
    });

    const namesForRegex = Array.from(knownNames)
      .concat(Array.from(knownFirstNames))
      .filter(n => n.length > 2)
      .map(n => n.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));

    namesForRegex.sort((a, b) => b.length - a.length);

    const namesPatternStr = `\\b(${namesForRegex.join('|')})\\b`;

    const checkLineForAssignee = (cleanText: string): boolean => {
      if (cleanText.length > 250) return false;

      // 1. Check parenthesized name like "(Austin)" or "(Austin Patterson)" or "(Austin P.)"
      const parenMatch = cleanText.match(/\(([^)]+)\)/);
      if (parenMatch) {
        const nameCandidate = parenMatch[1].trim().toLowerCase();
        if (knownNames.has(nameCandidate) || knownFirstNames.has(nameCandidate)) {
          return true;
        }
        const words = nameCandidate.split(/\s+/);
        if (words.some(w => knownFirstNames.has(w))) {
          return true;
        }
      }

      // 2. Check prefix name with colon, like "Austin: finalize..." or "Austin Patterson: finalize..."
      const colonMatch = cleanText.match(/^([^:]+):\s+(.+)/);
      if (colonMatch) {
        const nameCandidate = colonMatch[1].trim().toLowerCase();
        if (knownNames.has(nameCandidate) || knownFirstNames.has(nameCandidate)) {
          return true;
        }
        const words = nameCandidate.split(/\s+/);
        if (words.length <= 2 && words.some(w => knownFirstNames.has(w))) {
          return true;
        }
      }

      // 3. Check suffix name with dash, like "Action - Mel" or "Action - Austin Patterson"
      const dashMatch = cleanText.match(/-\s+([A-Za-z\s]+)$/);
      if (dashMatch) {
        const nameCandidate = dashMatch[1].trim().toLowerCase();
        if (knownNames.has(nameCandidate) || knownFirstNames.has(nameCandidate)) {
          return true;
        }
        const words = nameCandidate.split(/\s+/);
        if (words.length <= 2 && words.some(w => knownFirstNames.has(w))) {
          return true;
        }
      }

      // 4. Check "Name to [action]" or "First Last to [action]" at the start of the line
      const toMatch = cleanText.match(/^([A-Za-z\s]+)\s+to\s+([a-z]+)/i);
      if (toMatch) {
        const nameCandidate = toMatch[1].trim().toLowerCase();
        if (knownNames.has(nameCandidate) || knownFirstNames.has(nameCandidate)) {
          return true;
        }
        const words = nameCandidate.split(/\s+/);
        if (words.length <= 2 && words.some(w => knownFirstNames.has(w))) {
          return true;
        }
      }

      return false;
    };

    const checkLineForActionVerb = (cleanText: string): boolean => {
      const firstWord = cleanText.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '');
      if (!firstWord) return false;
      return ACTION_VERBS.includes(firstWord);
    };

    const extractSemanticCommitments = (text: string): string[] => {
      const results: string[] = [];
      const localRegex = new RegExp(
        namesPatternStr + 
        `\\s+(?:agreed\\s+to|will|to|needs?\\s+to|should|is\\s+going\\s+to|is\\s+tasked\\s+with)\\s+([a-z]+(?:\\s+[a-z0-9,.'\"-]+){2,20})`,
        'gi'
      );
      let match;
      while ((match = localRegex.exec(text)) !== null) {
        const name = match[1].trim();
        const action = match[2].trim();
        const formattedName = name.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        results.push(`${formattedName}: ${action}`);
      }
      return results;
    };

    // 2. Scan all sections for lines containing person-assignee indicators, action verbs or commitments
    (parsedSections || []).forEach(sec => {
      if (sec && sec.notes) {
        const secLines = sec.notes.split(/\r?\n/);
        secLines.forEach(line => {
          const trimmedLine = line.trim();
          if (!trimmedLine) return;
          const match = trimmedLine.match(/^[-*+]\s+(.*)/) || trimmedLine.match(/^\d+\.\s+(.*)/);
          const itemText = match ? match[1] : trimmedLine;
          
          const cleanText = itemText.trim();
          
          // Heuristic A: Direct list-style assignee formats
          if (checkLineForAssignee(cleanText)) {
            addActionItem(cleanText);
            return;
          }

          // Heuristic B: Line starts with present-tense action verb (bulleted tasks)
          if (checkLineForActionVerb(cleanText)) {
            addActionItem(cleanText);
            return;
          }

          // Heuristic C: Paragraph contains a semantic commitment clause
          const commitments = extractSemanticCommitments(trimmedLine);
          if (commitments.length > 0) {
            commitments.forEach(c => addActionItem(c));
          }
        });
      }
    });

    return {
      title: parsedTitle || `Gemini Meeting Notes - ${formatLocalDate(parsedDate)}`,
      date: parsedDate,
      notes: text,
      summary: lines.filter(l => l && !l.startsWith('#')).slice(0, 2).join(' ').substring(0, 120) + '...',
      actionItems,
      parsedSections
    };
  } catch (err) {
    console.error("Error inside parseGeminiNotes:", err);
    return {
      title: `Gemini Meeting Notes - ${formatLocalDate(new Date().toISOString().split('T')[0])}`,
      date: new Date().toISOString().split('T')[0],
      notes: text,
      summary: 'Error parsing notes format. Loaded raw content.',
      actionItems: [],
      parsedSections: [{ name: 'Raw Notes', notes: text }]
    };
  }
};

export function TeamMeetings() {
  const { userData } = useAuth();
  useEffect(() => {
    console.log("TeamMeetings v1.0.8 loaded");
  }, []);
  const location = useLocation();
  const [meetings, setMeetings] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFutureMeetings, setShowFutureMeetings] = useState(false);
  const [recurrenceStart, setRecurrenceStart] = useState('');
  const [recurrenceEnd, setRecurrenceEnd] = useState('');
  const [isGeneratingMeetings, setIsGeneratingMeetings] = useState(false);
  
  // Modal toggle states
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isParsingText, setIsParsingText] = useState(false);
  const [parseSuccessMessage, setParseSuccessMessage] = useState<string | null>(null);
  const [rawPasteText, setRawPasteText] = useState('');

  // Form states
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newSummary, setNewSummary] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newAttendees, setNewAttendees] = useState<string[]>([]);
  const [newActionItems, setNewActionItems] = useState<any[]>([]);
  const [capacityCheckins, setCapacityCheckins] = useState<any[]>([]);

  // Call Score input states for a single participant check-in
  const [checkinMemberId, setCheckinMemberId] = useState('');
  const [checkinWorkload, setCheckinWorkload] = useState(5);
  const [checkinUrgency, setCheckinUrgency] = useState(5);
  const [checkinStress, setCheckinStress] = useState(5);
  const [checkinAvailability, setCheckinAvailability] = useState(5);
  const [checkinFriction, setCheckinFriction] = useState(5);
  const [checkinConfidence, setCheckinConfidence] = useState('Green');
  const [checkinNotes, setCheckinNotes] = useState('');

  // Live pre-meeting check-in states
  const [myWorkload, setMyWorkload] = useState(5);
  const [myUrgency, setMyUrgency] = useState(5);
  const [myStress, setMyStress] = useState(5);
  const [myAvailability, setMyAvailability] = useState(5);
  const [myFriction, setMyFriction] = useState(5);
  const [myConfidence, setMyConfidence] = useState('Green');
  const [myNotes, setMyNotes] = useState('');

  // Loading indicator for simulated Google Meet Sync
  const [isSyncing, setIsSyncing] = useState(false);

  // Template states
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [meetingSections, setMeetingSections] = useState<any[]>([]);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [expandedTemplates, setExpandedTemplates] = useState<Record<string, boolean>>({});

  // Template Form states
  const [templateNameInput, setTemplateNameInput] = useState('');
  const [templateAttendeesInput, setTemplateAttendeesInput] = useState<string[]>([]);
  const [templateSectionsInput, setTemplateSectionsInput] = useState<string[]>(['']);
  const [templateVisibleRolesInput, setTemplateVisibleRolesInput] = useState<string[]>([]);

  // View mode and calendar states
  const [viewMode, setViewMode] = useState<'feed' | 'calendar'>('feed');
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [newVisibleRoles, setNewVisibleRoles] = useState<string[]>([]);

  // Editing states
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [isEditingMeeting, setIsEditingMeeting] = useState(false);
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);

  // New Capacity Check-in states
  const [newEnableCapacityCheckin, setNewEnableCapacityCheckin] = useState(true);
  const [templateEnableCapacityCheckin, setTemplateEnableCapacityCheckin] = useState(true);
  const [isCheckinModalOpen, setIsCheckinModalOpen] = useState(false);
  const [viewingCheckin, setViewingCheckin] = useState<any | null>(null);
  const [dismissedMeetingCheckinId, setDismissedMeetingCheckinId] = useState<string | null>(null);

  // Section Notes editing states
  const [editingSectionIdx, setEditingSectionIdx] = useState<number | null>(null);
  const [editingSectionNotes, setEditingSectionNotes] = useState<string>('');

  // Inline Notes editing states
  const [isEditingAllNotes, setIsEditingAllNotes] = useState(false);
  const [localSections, setLocalSections] = useState<any[]>([]);
  const [localGeneralNotes, setLocalGeneralNotes] = useState('');

  // Reset notes editor when selected meeting changes
  useEffect(() => {
    setIsEditingAllNotes(false);
  }, [selectedMeeting?.id]);

  // Mobile active tab ('list' | 'detail')
  const [mobileActiveTab, setMobileActiveTab] = useState<'list' | 'detail'>('list');

  // Auto-switch to detail tab on mobile when a meeting is selected
  useEffect(() => {
    if (selectedMeeting) {
      setMobileActiveTab('detail');
    }
  }, [selectedMeeting?.id]);

  // Auto-open capacity check-in modal for tagged attendees who haven't checked in yet (templated meetings only)
  useEffect(() => {
    if (selectedMeeting && selectedMeeting.status === 'live' && selectedMeeting.templateId && selectedMeeting.enableCapacityCheckin !== false && userData) {
      const isAttendee = selectedMeeting.attendees?.includes(userData.name);
      const alreadyCheckedIn = selectedMeeting.capacityScores?.some(
        (c: any) => c.memberName === userData.name || c.memberId === userData.id || (userData.uid && c.memberId === userData.uid)
      );
      if (isAttendee && !alreadyCheckedIn && dismissedMeetingCheckinId !== selectedMeeting.id) {
        setIsCheckinModalOpen(true);
      }
    } else {
      setIsCheckinModalOpen(false);
    }
  }, [selectedMeeting, userData, dismissedMeetingCheckinId]);

  const handleAddTemplateSectionInput = () => {
    setTemplateSectionsInput(prev => [...prev, '']);
  };

  const handleUpdateTemplateSectionInput = (index: number, val: string) => {
    const newSecs = [...templateSectionsInput];
    newSecs[index] = val;
    setTemplateSectionsInput(newSecs);
  };

  const handleRemoveTemplateSectionInput = (index: number) => {
    setTemplateSectionsInput(prev => prev.filter((_, i) => i !== index));
  };

  // Pre-select all team members by default when opening the New Meeting modal (if not editing)
  useEffect(() => {
    if (isNewModalOpen && !isEditingMeeting && teamMembers.length > 0) {
      setNewAttendees(teamMembers.map(m => m.name));
    }
  }, [isNewModalOpen, isEditingMeeting, teamMembers]);

  // Sync logged in user's capacity sliders with their existing check-in score
  useEffect(() => {
    if (selectedMeeting && userData) {
      const existing = selectedMeeting.capacityScores?.find(
        (c: any) => c.memberName === userData.name || c.memberId === userData.id || (userData.uid && c.memberId === userData.uid)
      );
      if (existing) {
        setMyWorkload(existing.categories?.workload ?? 5);
        setMyUrgency(existing.categories?.urgency ?? 5);
        setMyStress(existing.categories?.stress ?? 5);
        setMyAvailability(existing.categories?.availability ?? 5);
        setMyFriction(existing.categories?.friction ?? 5);
        setMyConfidence(existing.confidence ?? 'Green');
        setMyNotes(existing.notes ?? '');
      } else {
        // Reset to default
        setMyWorkload(5);
        setMyUrgency(5);
        setMyStress(5);
        setMyAvailability(5);
        setMyFriction(5);
        setMyConfidence('Green');
        setMyNotes('');
      }
    }
  }, [selectedMeeting, userData]);

  // Fetch users and meetings from Firestore
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('bypassAuth=true')) {
      setTeamMembers(FALLBACK_USERS);
      const mockMeetings = [
        {
          id: 'meet-1',
          title: 'Daily Standup - 2026-06-10',
          date: '2026-06-10',
          summary: 'Standup notes',
          notes: 'Standup notes detail',
          attendees: FALLBACK_USERS.map(u => u.name),
          actionItems: [],
          status: 'completed'
        }
      ];
      setMeetings(mockMeetings);
      setSelectedMeeting(mockMeetings[0]);
      setLoading(false);
      return;
    }

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const list: any[] = [];
      snap.forEach(d => {
        const data = d.data();
        // Exclude clients and pending users from meetings list
        if (data.role === 'Client' || data.role === 'Pending') {
          return;
        }
        list.push({ id: d.id, name: data.name || data.displayName || data.email, email: data.email });
      });
      setTeamMembers(list.length > 0 ? list : FALLBACK_USERS);
    });

    const unsubMeetings = onSnapshot(collection(db, 'meetings'), (snap) => {
      const list: any[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });
      // Sort by date descending
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setMeetings(list);
      setLoading(false);

      // Determine default selected meeting & keep it updated in real-time
      setSelectedMeeting((prevSelected: any) => {
        // 1. If we have a state from navigation, select it
        const navMeetingId = location.state?.selectMeetingId;
        if (navMeetingId) {
          const found = list.find(m => m.id === navMeetingId);
          if (found) return found;
        }
        
        // 2. If no meeting is selected, select a live meeting if it exists, otherwise select the first visible one
        if (!prevSelected) {
          const live = list.find(m => m.status === 'live');
          if (live) return live;
          
          const todayDateStr = new Date().toISOString().split('T')[0];
          const visibleList = list.filter(m => {
            // Filter out future scheduled meetings by default (matching the sidebar default view)
            if (m.status === 'scheduled' && m.date > todayDateStr) {
              return false;
            }
            return true;
          });
          return visibleList[0] || list[0] || null;
        }

        // 3. If a meeting is selected, find its latest version in the list
        const updated = list.find(m => m.id === prevSelected.id);
        return updated || prevSelected;
      });
    });

    return () => {
      unsubUsers();
      unsubMeetings();
    };
  }, []);

  // Fetch meeting templates and seed defaults if empty
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('bypassAuth=true')) {
      const mockTemplates = [
        {
          id: 'temp-1',
          name: 'Daily Standup',
          attendees: FALLBACK_USERS.map(u => u.name),
          sections: ['What did you do yesterday?', 'What are you doing today?', 'Any blockers?'],
          createdAt: new Date().toISOString()
        },
        {
          id: 'temp-2',
          name: 'Weekly Production Review',
          attendees: FALLBACK_USERS.map(u => u.name),
          sections: ['Production Queue Status', 'DTF & Supply Levels', 'Rush Orders Review', 'Blocked Orders'],
          createdAt: new Date().toISOString()
        }
      ];
      setTemplates(mockTemplates);
      return;
    }

    const unsubTemplates = onSnapshot(collection(db, 'meetingTemplates'), (snap) => {
      const list: any[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });

      if (list.length === 0) {
        // Seed default templates
        const defaultTemplates = [
          {
            name: 'Daily Standup',
            attendees: FALLBACK_USERS.map(u => u.name),
            sections: ['What did you do yesterday?', 'What are you doing today?', 'Any blockers?'],
            createdAt: new Date().toISOString()
          },
          {
            name: 'Weekly Production Review',
            attendees: FALLBACK_USERS.map(u => u.name),
            sections: ['Production Queue Status', 'DTF & Supply Levels', 'Rush Orders Review', 'Blocked Orders'],
            createdAt: new Date().toISOString()
          },
          {
            name: 'Weekly Leadership Sync',
            attendees: [FALLBACK_USERS[0].name, FALLBACK_USERS[1].name], // Alice & Bob
            sections: ['Key Metrics Review', 'Operational Blockers', 'Strategic Alignment'],
            createdAt: new Date().toISOString()
          }
        ];

        defaultTemplates.forEach(async (t) => {
          try {
            await addDoc(collection(db, 'meetingTemplates'), t);
          } catch (e) {
            console.error("Failed to seed template", e);
          }
        });
      } else {
        // Sort by name
        list.sort((a, b) => a.name.localeCompare(b.name));
        setTemplates(list);
      }
    });

    return () => unsubTemplates();
  }, []);

  const visibleTemplates = templates.filter(t => {
    const userRole = userData?.role || 'Pending';
    if (userRole === 'Admin') return true;
    if (!t.visibleRoles || t.visibleRoles.length === 0) return true;
    return t.visibleRoles.includes(userRole);
  });

  const handleToggleActionItem = async (meetingId: string, index: number) => {
    if (!selectedMeeting) return;
    const updatedItems = [...selectedMeeting.actionItems];
    updatedItems[index].completed = !updatedItems[index].completed;

    try {
      await updateDoc(doc(db, 'meetings', meetingId), {
        actionItems: updatedItems
      });
      setSelectedMeeting((prev: any) => ({ ...prev, actionItems: updatedItems }));
    } catch (err) {
      console.error("Failed to toggle action item", err);
    }
  };

  const handleAddActionItemInput = (text: string) => {
    if (!text.trim()) return;
    setNewActionItems(prev => [...prev, { text: text.trim(), completed: false }]);
  };

  const handleRemoveActionItemInput = (index: number) => {
    setNewActionItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddCheckin = () => {
    if (!checkinMemberId) return;
    const member = teamMembers.find(u => u.id === checkinMemberId) || { name: 'Unknown Member' };
    
    const avg = (checkinWorkload + checkinUrgency + checkinStress + checkinAvailability + checkinFriction) / 5;
    const score = Math.round(avg * 10) / 10;

    const getStatus = (s: number) => {
      if (s <= 2.9) return "Underutilized";
      if (s <= 4.4) return "Comfortable";
      if (s <= 6.4) return "Optimal Zone";
      if (s <= 8.4) return "Constrained";
      if (s <= 9.4) return "Overloaded";
      return "Unsustainable";
    };

    const status = getStatus(score);

    const newCheckin = {
      memberId: checkinMemberId,
      memberName: member.name,
      score,
      status,
      confidence: checkinConfidence,
      notes: checkinNotes.trim() || 'No notes.',
      categories: {
        workload: checkinWorkload,
        urgency: checkinUrgency,
        stress: checkinStress,
        availability: checkinAvailability,
        friction: checkinFriction
      }
    };

    setCapacityCheckins((prev: any[]) => [...prev.filter(c => c.memberId !== checkinMemberId), newCheckin]);

    // Reset check-in sliders
    setCheckinMemberId('');
    setCheckinWorkload(5);
    setCheckinUrgency(5);
    setCheckinStress(5);
    setCheckinAvailability(5);
    setCheckinFriction(5);
    setCheckinConfidence('Green');
    setCheckinNotes('');
  };

  const handleRemoveCheckin = (memberId: string) => {
    setCapacityCheckins(prev => prev.filter(c => c.memberId !== memberId));
  };

  const handleSubmitMyCheckin = async () => {
    if (!selectedMeeting || !userData) return;

    const avg = (myWorkload + myUrgency + myStress + myAvailability + myFriction) / 5;
    const score = Math.round(avg * 10) / 10;

    const getStatus = (s: number) => {
      if (s <= 2.9) return "Underutilized";
      if (s <= 4.4) return "Comfortable";
      if (s <= 6.4) return "Optimal Zone";
      if (s <= 8.4) return "Constrained";
      if (s <= 9.4) return "Overloaded";
      return "Unsustainable";
    };

    const myCheckinObj = {
      memberId: userData.id || userData.uid || '',
      memberName: userData.name || 'Unknown Member',
      score,
      status: getStatus(score),
      confidence: myConfidence || 'Green',
      notes: myNotes?.trim() || 'No blockers noted.',
      categories: {
        workload: myWorkload ?? 5,
        urgency: myUrgency ?? 5,
        stress: myStress ?? 5,
        availability: myAvailability ?? 5,
        friction: myFriction ?? 5
      }
    };

    try {
      const existingScores = selectedMeeting.capacityScores || [];
      const currentUserId = userData.id || userData.uid || '';
      const updatedScores = [
        ...existingScores.filter((c: any) => c.memberName !== userData.name && c.memberId !== currentUserId),
        myCheckinObj
      ];

      const newTotalAmount = Math.round((updatedScores.reduce((sum: number, c: any) => sum + (c.score || 0), 0) / (updatedScores.length || 1)) * 10) / 10;

      await updateDoc(doc(db, 'meetings', selectedMeeting.id), {
        capacityScores: updatedScores,
        totalAmount: newTotalAmount
      });

      setSelectedMeeting((prev: any) => ({
        ...prev,
        capacityScores: updatedScores,
        totalAmount: newTotalAmount
      }));
    } catch (err) {
      console.error("Failed to submit capacity check-in", err);
      alert("Failed to save check-in. Please try again.");
    }
  };

  const handleSaveSectionNotes = async (idx: number) => {
    if (!selectedMeeting) return;
    try {
      const updatedSections = [...(selectedMeeting.sections || [])];
      updatedSections[idx] = {
        ...updatedSections[idx],
        notes: editingSectionNotes
      };
      
      const finalNotes = updatedSections.map(s => `## ${s.name}\n${s.notes}`).join('\n\n');

      const meetingRef = doc(db, 'meetings', selectedMeeting.id);
      await updateDoc(meetingRef, {
        sections: updatedSections,
        notes: finalNotes
      });

      setSelectedMeeting((prev: any) => ({
        ...prev,
        sections: updatedSections,
        notes: finalNotes
      }));

      setEditingSectionIdx(null);
    } catch (err) {
      console.error("Failed to save section notes", err);
      alert("Failed to save notes. Please try again.");
    }
  };

  const handleStartInlineNotesEditing = () => {
    if (!selectedMeeting) return;
    setIsEditingAllNotes(true);
    if (selectedMeeting.sections && selectedMeeting.sections.length > 0) {
      setLocalSections(selectedMeeting.sections.map((s: any) => ({ name: s.name, notes: s.notes || '' })));
    } else {
      setLocalGeneralNotes(selectedMeeting.notes || '');
    }
  };

  const handleSaveAllInlineNotes = async () => {
    if (!selectedMeeting) return;
    try {
      const meetingRef = doc(db, 'meetings', selectedMeeting.id);
      if (selectedMeeting.sections && selectedMeeting.sections.length > 0) {
        const finalNotes = localSections.map(s => `## ${s.name}\n${s.notes}`).join('\n\n');
        await updateDoc(meetingRef, {
          sections: localSections,
          notes: finalNotes
        });
        setSelectedMeeting((prev: any) => ({
          ...prev,
          sections: localSections,
          notes: finalNotes
        }));
      } else {
        await updateDoc(meetingRef, {
          notes: localGeneralNotes
        });
        setSelectedMeeting((prev: any) => ({
          ...prev,
          notes: localGeneralNotes
        }));
      }
      setIsEditingAllNotes(false);
    } catch (err) {
      console.error("Failed to save inline notes", err);
      alert("Failed to save notes. Please try again.");
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateNameInput.trim()) {
      alert("Please enter a template name.");
      return;
    }
    const filteredSections = templateSectionsInput.filter(s => s.trim());
    if (filteredSections.length === 0) {
      alert("Please enter at least one meeting section.");
      return;
    }

    try {
      const payload = {
        name: templateNameInput.trim(),
        attendees: templateAttendeesInput,
        sections: filteredSections,
        enableCapacityCheckin: templateEnableCapacityCheckin,
        visibleRoles: templateVisibleRolesInput
      };

      if (editingTemplateId) {
        await updateDoc(doc(db, 'meetingTemplates', editingTemplateId), payload);
        alert("Template updated successfully!");
        setEditingTemplateId(null);
      } else {
        await addDoc(collection(db, 'meetingTemplates'), {
          ...payload,
          createdAt: new Date().toISOString()
        });
        alert("Template saved successfully!");
      }
      
      // Reset form fields
      setTemplateNameInput('');
      setTemplateAttendeesInput([]);
      setTemplateSectionsInput(['']);
      setTemplateEnableCapacityCheckin(true);
      setTemplateVisibleRolesInput([]);
    } catch (err) {
      console.error("Failed to save template", err);
      alert("Failed to save template. Please try again.");
    }
  };

  const handleStartEditTemplate = (template: any) => {
    setEditingTemplateId(template.id);
    setTemplateNameInput(template.name);
    setTemplateAttendeesInput(template.attendees || []);
    setTemplateSectionsInput(template.sections || ['']);
    setTemplateEnableCapacityCheckin(template.enableCapacityCheckin !== false);
    setTemplateVisibleRolesInput(template.visibleRoles || []);
  };

  const handleCancelEditTemplate = () => {
    setEditingTemplateId(null);
    setTemplateNameInput('');
    setTemplateAttendeesInput([]);
    setTemplateSectionsInput(['']);
    setTemplateEnableCapacityCheckin(true);
    setTemplateVisibleRolesInput([]);
  };

  const handleDeleteTemplate = async (templateId: string) => {
    const confirmed = window.confirm("Are you sure you want to delete this template? Everyday meetings using this template will not be deleted, but the template structure will be removed.");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'meetingTemplates', templateId));
      if (editingTemplateId === templateId) {
        handleCancelEditTemplate();
      }
    } catch (err) {
      console.error("Failed to delete template", err);
    }
  };

  const handleStartEditMeeting = (meeting: any) => {
    setParseSuccessMessage(null);
    setIsEditingMeeting(true);
    setEditingMeetingId(meeting.id);
    setSelectedTemplateId(meeting.templateId || '');
    
    // Load fields
    setNewTitle(meeting.title || '');
    setNewDate(meeting.date || new Date().toISOString().split('T')[0]);
    setNewSummary(meeting.summary || '');
    setNewNotes(meeting.notes || '');
    setNewAttendees(meeting.attendees || []);
    setNewActionItems(meeting.actionItems || []);
    setNewEnableCapacityCheckin(meeting.enableCapacityCheckin !== false);
    setNewVisibleRoles(meeting.visibleRoles || []);
    
    // If it has sections, load them. Otherwise initialize from template or empty
    if (meeting.sections && meeting.sections.length > 0) {
      setMeetingSections(meeting.sections);
    } else if (meeting.templateId) {
      const t = templates.find(temp => temp.id === meeting.templateId);
      if (t) {
        setMeetingSections((t.sections || []).map((s: string) => ({ name: s, notes: '' })));
      } else {
        setMeetingSections([]);
      }
    } else {
      setMeetingSections([]);
    }
    
    // Crucial: Load capacity checkins already entered by members
    setCapacityCheckins(meeting.capacityScores || []);
    
    // Open the modal
    setIsNewModalOpen(true);
  };

  const handleSaveMeeting = async (statusType: 'live' | 'completed' | 'scheduled') => {
    if (!selectedTemplateId && !newTitle.trim()) {
      alert("Please enter a meeting title.");
      return;
    }

    try {
      const templateName = selectedTemplateId 
        ? (templates.find(t => t.id === selectedTemplateId)?.name || 'Template Meeting')
        : '';
      const finalTitle = selectedTemplateId
        ? `${templateName} - ${newDate}`
        : newTitle.trim();

      const finalSections = selectedTemplateId 
        ? meetingSections 
        : [{ name: 'Discussion Notes', notes: newNotes.trim() || 'No detailed notes.' }];
      
      const finalNotes = selectedTemplateId
        ? meetingSections.map(s => `## ${s.name}\n${s.notes}`).join('\n\n')
        : newNotes.trim() || 'No detailed notes.';

      const payload = {
        title: finalTitle,
        date: newDate,
        summary: newSummary.trim() || `${templateName || 'Meeting'} minutes.`,
        notes: finalNotes,
        sections: finalSections,
        templateId: selectedTemplateId || '',
        templateName: templateName,
        attendees: newAttendees,
        actionItems: newActionItems,
        capacityScores: capacityCheckins,
        status: statusType,
        enableCapacityCheckin: newEnableCapacityCheckin,
        visibleRoles: selectedTemplateId ? newVisibleRoles : [],
        totalAmount: Math.round((capacityCheckins.reduce((sum: number, c: any) => sum + (c.score || 0), 0) / (capacityCheckins.length || 1)) * 10) / 10
      };

      if (isEditingMeeting && editingMeetingId) {
        // Update existing meeting document
        await updateDoc(doc(db, 'meetings', editingMeetingId), payload);
        
        // Find updated meeting from current list to keep selection updated
        const updatedObj = { id: editingMeetingId, ...payload };
        setSelectedMeeting(updatedObj);
      } else {
        // Create new meeting document
        const docRef = await addDoc(collection(db, 'meetings'), {
          ...payload,
          createdAt: new Date().toISOString()
        });
        
        // Select it immediately
        const newObj = { id: docRef.id, ...payload, createdAt: new Date().toISOString() };
        setSelectedMeeting(newObj);
      }
      
      // Reset form fields
      setNewTitle('');
      setNewDate(new Date().toISOString().split('T')[0]);
      setNewSummary('');
      setNewNotes('');
      setNewAttendees([]);
      setNewActionItems([]);
      setCapacityCheckins([]);
      setSelectedTemplateId('');
      setMeetingSections([]);
      setNewEnableCapacityCheckin(true);
      setNewVisibleRoles([]);
      setIsEditingMeeting(false);
      setEditingMeetingId(null);
      setIsNewModalOpen(false);
    } catch (err) {
      console.error("Failed to save meeting", err);
      alert("Failed to save meeting. Please try again.");
    }
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    const confirmed = window.confirm("Are you sure you want to delete this meeting log? This cannot be undone.");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'meetings', meetingId));
      setSelectedMeeting(null);
    } catch (err) {
      console.error("Failed to delete meeting", err);
    }
  };

  const handleOpenNewMeeting = () => {
    setParseSuccessMessage(null);
    setNewTitle('');
    setNewDate(new Date().toISOString().split('T')[0]);
    setNewSummary('');
    setNewNotes('');
    setNewAttendees(teamMembers.map(m => m.name));
    setNewActionItems([]);
    setCapacityCheckins([]);
    setSelectedTemplateId('');
    setMeetingSections([]);
    setNewEnableCapacityCheckin(true);
    setIsEditingMeeting(false);
    setEditingMeetingId(null);
    setIsNewModalOpen(true);
  };

  // Perform Google Meet / Gemini mock Sync
  const handlePerformMeetSync = (meet: any) => {
    setIsSyncing(true);
    setTimeout(() => {
      setNewTitle(meet.title);
      setNewDate(meet.date);
      setNewSummary(meet.summary);
      setNewNotes(meet.notes);
      setNewAttendees(meet.attendees);
      setNewActionItems(meet.actionItems);
      setCapacityCheckins(meet.capacityScores);
      setIsSyncing(false);
      setIsSyncModalOpen(false);
    }, 1200);
  };

  const handleGenerateRecurringMeetings = async () => {
    if (!editingTemplateId) {
      alert("Please save or select a template first before generating recurring meetings.");
      return;
    }
    if (!recurrenceStart || !recurrenceEnd) {
      alert("Please select both a start and end date.");
      return;
    }
    const start = new Date(recurrenceStart);
    const end = new Date(recurrenceEnd);
    if (end < start) {
      alert("End date must be after start date.");
      return;
    }

    setIsGeneratingMeetings(true);
    try {
      const template = templates.find(t => t.id === editingTemplateId);
      if (!template) {
        alert("Template not found.");
        setIsGeneratingMeetings(false);
        return;
      }

      // Generate dates using UTC to prevent off-by-one errors
      const datesToCreate: string[] = [];
      const current = new Date(start);
      while (current <= end) {
        const dayOfWeek = current.getUTCDay();
        // 0 = Sunday, 6 = Saturday. We want Mon-Fri (1-5)
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          const dateStr = current.toISOString().split('T')[0];
          datesToCreate.push(dateStr);
        }
        current.setUTCDate(current.getUTCDate() + 1);
      }

      if (datesToCreate.length === 0) {
        alert("No weekdays found in the specified date range.");
        setIsGeneratingMeetings(false);
        return;
      }

      // Fetch existing meetings for this template to prevent duplicates
      const existingQ = query(
        collection(db, 'meetings'),
        where('templateId', '==', editingTemplateId)
      );
      const existingSnap = await getDocs(existingQ);
      const existingDates = new Set<string>();
      existingSnap.forEach(d => {
        const date = d.data().date;
        if (date) existingDates.add(date);
      });

      let createdCount = 0;
      for (const dateStr of datesToCreate) {
        if (!existingDates.has(dateStr)) {
          const payload = {
            title: `${template.name} - ${dateStr}`,
            date: dateStr,
            summary: `${template.name} scheduled.`,
            notes: (template.sections || []).map((s: string) => `## ${s}\nNo detailed notes.`).join('\n\n'),
            sections: (template.sections || []).map((s: string) => ({ name: s, notes: '' })),
            templateId: template.id,
            templateName: template.name,
            visibleRoles: template.visibleRoles || [],
            attendees: template.attendees || [],
            actionItems: [],
            capacityScores: [],
            status: 'scheduled',
            enableCapacityCheckin: template.enableCapacityCheckin !== false,
            totalAmount: 0,
            createdAt: new Date().toISOString()
          };
          await addDoc(collection(db, 'meetings'), payload);
          createdCount++;
        }
      }

      alert(`Successfully generated ${createdCount} scheduled meetings (skipped ${datesToCreate.length - createdCount} duplicates).`);
      setRecurrenceStart('');
      setRecurrenceEnd('');
    } catch (err) {
      console.error("Failed to generate recurring meetings", err);
      alert("Error generating meetings. Please check console for details.");
    } finally {
      setIsGeneratingMeetings(false);
    }
  };

  // Perform manual Gemini copy-paste parsing
  const handlePerformManualParse = () => {
    try {
      if (!rawPasteText.trim()) return;
      const parsed = parseGeminiNotes(rawPasteText, teamMembers.map(m => m.name));
      setNewTitle(parsed.title || newTitle);
      setNewDate(parsed.date || newDate);
      setNewSummary(parsed.summary || newSummary);
      
      if (selectedTemplateId) {
        let currentSections = meetingSections || [];
        if (currentSections.length === 0) {
          const t = templates.find(temp => temp.id === selectedTemplateId);
          if (t && t.sections && t.sections.length > 0) {
            currentSections = t.sections.map((s: string) => ({ name: s, notes: '' }));
          }
        }

        // Create a copy of the current meetingSections with empty/cleared notes to populate
        const updatedSections = currentSections.map(s => ({ ...s, notes: '' }));
        
        const cleanString = (str: string) => {
          return str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        };
        
        const cleanWords = (str: string) => {
          return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).filter(Boolean);
        };
        
        const isWordSimilar = (w1: string, w2: string) => {
          return w1 === w2 || w1.startsWith(w2) || w2.startsWith(w1);
        };

        const fuzzyMatchIndex = (parsedName: string, tempSecs: any[]) => {
          const cleanedParsed = cleanString(parsedName);
          if (!cleanedParsed) return -1;

          // 1. Exact match (cleaned)
          let bestIndex = tempSecs.findIndex(s => cleanString(s?.name || '') === cleanedParsed);
          if (bestIndex !== -1) return bestIndex;

          // 2. Contains match (one contains the other)
          bestIndex = tempSecs.findIndex(s => {
            const cleanedTemp = cleanString(s?.name || '');
            return cleanedTemp && (cleanedParsed.includes(cleanedTemp) || cleanedTemp.includes(cleanedParsed));
          });
          if (bestIndex !== -1) return bestIndex;

          // 3. Keyword / word overlap match
          let highestScore = 0;
          let scoreIndex = -1;
          const parsedWords = cleanWords(parsedName);
          
          tempSecs.forEach((s, idx) => {
            const tempWords = cleanWords(s?.name || '');
            const commonCount = parsedWords.filter(pw => tempWords.some(tw => isWordSimilar(pw, tw))).length;
            if (commonCount > 0) {
              const score = commonCount / Math.max(parsedWords.length, tempWords.length);
              if (score > highestScore) {
                highestScore = score;
                scoreIndex = idx;
              }
            }
          });

          if (highestScore >= 0.3) {
            return scoreIndex;
          }

          return -1;
        };

        const unmatched: any[] = [];
        
        (parsed.parsedSections || []).forEach(parsedSec => {
          // Skip task/action sections so they are not treated as unmatched and dumped into the first template section
          const isTaskSec = TASK_KEYWORDS.some(keyword => parsedSec.name.toLowerCase().includes(keyword));
          if (isTaskSec) {
            return;
          }

          const idx = fuzzyMatchIndex(parsedSec.name, updatedSections);
          if (idx !== -1 && updatedSections[idx]) {
            if (updatedSections[idx].notes) {
              updatedSections[idx].notes += '\n\n' + parsedSec.notes;
            } else {
              updatedSections[idx].notes = parsedSec.notes;
            }
          } else {
            unmatched.push(parsedSec);
          }
        });

        // Append unmatched sections cleanly to the first section's notes to prevent loss of information
        if (unmatched.length > 0 && updatedSections.length > 0 && updatedSections[0]) {
          const extraNotes = unmatched.map(sec => {
            if (sec.name) {
              return `### ${sec.name}\n${sec.notes}`;
            }
            return sec.notes;
          }).filter(Boolean).join('\n\n');

          if (extraNotes) {
            if (updatedSections[0].notes) {
              updatedSections[0].notes += '\n\n' + extraNotes;
            } else {
              updatedSections[0].notes = extraNotes;
            }
          }
        }

        if (updatedSections.length === 0) {
          setSelectedTemplateId('');
          setNewNotes(parsed.notes);
        } else {
          setMeetingSections(updatedSections);
          setNewNotes(''); // Clear custom notes since we are in template mode
        }
      } else {
        setNewNotes(parsed.notes);
      }
      
      setNewActionItems(parsed.actionItems || []);
      setRawPasteText('');
      setIsParsingText(false);

      // Set visual success feedback message
      let successMsg = "Notes parsed successfully!";
      if (selectedTemplateId) {
        const t = templates.find(temp => temp.id === selectedTemplateId);
        successMsg = `Notes parsed successfully into "${t?.name || 'template'}" sections!`;
      } else {
        successMsg = "Notes parsed successfully into Custom / Ad-hoc notes!";
      }
      setParseSuccessMessage(successMsg);
      setTimeout(() => {
        setParseSuccessMessage(null);
      }, 5000);
    } catch (err) {
      console.error("Failed to parse Gemini notes manual text:", err);
      alert("Failed to parse notes. Please check the pasted format and try again.");
    }
  };

  const filteredMeetings = meetings.filter(m => {
    const todayDateStr = new Date().toISOString().split('T')[0];
    if (m.status === 'scheduled' && m.date > todayDateStr && !showFutureMeetings) {
      return false;
    }
    
    // Role-based visibility check
    const userRole = userData?.role || 'Pending';
    if (userRole !== 'Admin') {
      const visibleRoles = m.visibleRoles || (m.templateId ? templates.find(t => t.id === m.templateId)?.visibleRoles : null);
      if (visibleRoles && visibleRoles.length > 0 && !visibleRoles.includes(userRole)) {
        return false;
      }
    }

    return (
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.notes.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.summary.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Math helper for overall score styling
  const getScoreColor = (score: number) => {
    if (score <= 4.4) return 'text-green-600 bg-green-50 border-green-200';
    if (score <= 6.4) return 'text-indigo-600 bg-indigo-50 border-indigo-200';
    if (score <= 8.4) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getConfidenceBadge = (conf: string) => {
    switch(conf) {
      case 'Green': return 'bg-green-100 text-green-800 border-green-200';
      case 'Yellow': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Red': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-neutral-100 text-neutral-800 border-neutral-200';
    }
  };

  const isTagged = selectedMeeting?.attendees?.includes(userData?.name || '');
  const myExistingCheckin = selectedMeeting?.capacityScores?.find(
    (c: any) => c.memberName === userData?.name || c.memberId === userData?.id
  );
  const pendingCheckins = selectedMeeting?.attendees?.filter((name: string) => 
    !selectedMeeting?.capacityScores?.some((c: any) => c.memberName === name)
  ) || [];

  // Group meetings by template
  const getGroupedMeetings = () => {
    const groups: Record<string, { name: string; meetings: any[] }> = {};
    
    // Initialize templates in groups
    visibleTemplates.forEach(t => {
      groups[t.id] = { name: t.name, meetings: [] };
    });
    // Add "Custom / Ad-hoc" group
    groups['custom'] = { name: 'Custom / Ad-hoc Meetings', meetings: [] };

    // Group each meeting
    filteredMeetings.forEach(meet => {
      const tId = meet.templateId;
      if (tId && groups[tId]) {
        groups[tId].meetings.push(meet);
      } else {
        groups['custom'].meetings.push(meet);
      }
    });

    return groups;
  };

  const toggleTemplateExpansion = (templateId: string) => {
    setExpandedTemplates(prev => ({
      ...prev,
      [templateId]: prev[templateId] === false ? true : false
    }));
  };

  const renderCalendarView = () => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
    const getFirstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();

    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDayIndex = getFirstDayOfMonth(currentYear, currentMonth);

    // Filter meetings for this calendar month & year
    const calendarMeetings = meetings.filter(m => {
      // Role-based visibility check
      const userRole = userData?.role || 'Pending';
      if (userRole !== 'Admin') {
        const visibleRoles = m.visibleRoles || (m.templateId ? templates.find(t => t.id === m.templateId)?.visibleRoles : null);
        if (visibleRoles && visibleRoles.length > 0 && !visibleRoles.includes(userRole)) {
          return false;
        }
      }
      return true;
    });

    const handlePrevMonth = () => {
      if (currentMonth === 0) {
        setCurrentMonth(11);
        setCurrentYear(prev => prev - 1);
      } else {
        setCurrentMonth(prev => prev - 1);
      }
    };

    const handleNextMonth = () => {
      if (currentMonth === 11) {
        setCurrentMonth(0);
        setCurrentYear(prev => prev + 1);
      } else {
        setCurrentMonth(prev => prev + 1);
      }
    };

    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const cells = [];
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push({ day: null, dateStr: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const monthStr = String(currentMonth + 1).padStart(2, '0');
      const dayStr = String(d).padStart(2, '0');
      const dateStr = `${currentYear}-${monthStr}-${dayStr}`;
      cells.push({ day: d, dateStr });
    }

    const todayStr = new Date().toISOString().split('T')[0];

    return (
      <div className="flex flex-col gap-4">
        {/* Calendar Header Controls */}
        <div className="flex justify-between items-center border-b border-[#ded8ce] pb-4 bg-white shrink-0">
          <div className="flex items-center gap-1">
            <h3 className="font-serif text-xl font-bold text-brand-primary">
              {months[currentMonth]} {currentYear}
            </h3>
            <span className="text-[10px] uppercase font-bold text-brand-secondary px-2.5 py-1 rounded-full bg-brand-bg border border-brand-border ml-2">
              {calendarMeetings.length} Total Logs
            </span>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 border border-[#ded8ce] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer text-brand-primary"
              title="Previous Month"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => {
                const today = new Date();
                setCurrentMonth(today.getMonth());
                setCurrentYear(today.getFullYear());
              }}
              className="py-1 px-3 text-[10px] font-bold border border-[#ded8ce] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer text-brand-primary"
            >
              Today
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 border border-[#ded8ce] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer text-brand-primary"
              title="Next Month"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-2">
          {/* Day Headers */}
          {dayHeaders.map(day => (
            <div key={day} className="text-center text-[10px] font-bold uppercase tracking-wider text-brand-secondary py-1 bg-brand-bg/40 border border-brand-border/40 rounded-md">
              {day}
            </div>
          ))}

          {/* Grid Cells */}
          {cells.map((cell, idx) => {
            if (!cell.day || !cell.dateStr) {
              return <div key={`empty-${idx}`} className="min-h-[110px] bg-neutral-50/20 border border-brand-border/20 rounded-[14px]" />;
            }

            const dayMeetings = calendarMeetings.filter(m => m.date === cell.dateStr);
            const isToday = cell.dateStr === todayStr;

            return (
              <div
                key={cell.dateStr}
                className={`min-h-[110px] p-2 rounded-[14px] border bg-white flex flex-col gap-1.5 transition-all group ${
                  isToday 
                    ? 'border-black ring-1 ring-black shadow-sm' 
                    : 'border-[#ded8ce] hover:border-neutral-400'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className={`text-[10px] font-bold ${isToday ? 'text-black' : 'text-neutral-400 font-medium'}`}>
                    {cell.day}
                  </span>
                  {isToday && (
                    <span className="text-[8px] font-extrabold uppercase tracking-widest text-black bg-neutral-100 px-1 rounded">
                      Today
                    </span>
                  )}
                </div>

                <div className="flex-1 flex flex-col gap-1 overflow-y-auto max-h-[85px] custom-scrollbar pr-0.5 animate-in fade-in duration-300">
                  {dayMeetings.map(meet => {
                    let badgeColor = 'bg-neutral-50 text-neutral-800 border-neutral-200 hover:border-neutral-400';
                    if (meet.status === 'live') {
                      badgeColor = 'bg-red-50 text-red-700 border-red-200 hover:border-red-400';
                    } else if (meet.status === 'scheduled') {
                      badgeColor = 'bg-blue-50 text-blue-700 border-blue-200 hover:border-blue-400';
                    } else {
                      badgeColor = 'bg-green-50 text-green-700 border-green-200 hover:border-green-400';
                    }

                    const displayTitle = meet.templateId && meet.templateName 
                      ? meet.templateName 
                      : meet.title;

                    return (
                      <button
                        key={meet.id}
                        onClick={() => {
                          setSelectedMeeting(meet);
                          setViewMode('feed');
                          setMobileActiveTab('detail');
                        }}
                        className={`text-[9px] font-bold py-1 px-1.5 rounded-lg border w-full text-left truncate transition-all ${badgeColor}`}
                        title={displayTitle}
                      >
                        {meet.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-red-600 inline-block mr-1 animate-pulse" />}
                        {displayTitle}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* View Mode Tab Switcher */}
      <div className="flex border-b border-[#ded8ce] pb-px">
        <button
          onClick={() => setViewMode('feed')}
          className={`pb-2 px-4 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
            viewMode === 'feed' 
              ? 'border-black text-black font-extrabold' 
              : 'border-transparent text-brand-secondary hover:text-brand-primary'
          }`}
        >
          Meetings Log & Feed
        </button>
        <button
          onClick={() => setViewMode('calendar')}
          className={`pb-2 px-4 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
            viewMode === 'calendar' 
              ? 'border-black text-black font-extrabold' 
              : 'border-transparent text-brand-secondary hover:text-brand-primary'
          }`}
        >
          Calendar View
        </button>
      </div>

      {viewMode === 'feed' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start animate-in fade-in zoom-in-95 duration-300">
      
      {/* Left Column: Meetings Sidebar List */}
      <div className={`lg:col-span-1 flex flex-col gap-4 ${mobileActiveTab === 'list' ? 'flex' : 'hidden lg:flex'}`}>
        <div className="bg-white p-4 rounded-[18px] border border-[#ded8ce] shadow-sm flex flex-col gap-3">
          <div className="flex justify-between items-center gap-2">
            <h2 className="font-serif text-base font-bold text-brand-primary">Meetings Log</h2>
            <div className="flex gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(true)}
                className="py-1 px-2.5 text-[10px] font-bold border border-[#ded8ce] rounded-full hover:bg-neutral-50 flex items-center gap-1 transition-all h-8 text-brand-primary"
                title="Manage Templates"
              >
                Templates
              </button>
              <PillButton 
                variant="filled" 
                onClick={handleOpenNewMeeting}
                className="py-1 px-2.5 text-[10px] gap-1 h-8"
              >
                <Plus size={12} />
                Record
              </PillButton>
            </div>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-secondary" size={14} />
            <input 
              type="text" 
              placeholder="Search meeting topics..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-[#ded8ce] rounded-lg pl-9 pr-4 py-2 text-xs focus:bg-white focus:border-brand-primary outline-none transition-all"
            />
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-[#ded8ce]/30">
            <label className="flex items-center gap-1.5 text-[9px] font-bold text-brand-secondary cursor-pointer uppercase tracking-wider select-none">
              <input
                type="checkbox"
                checked={showFutureMeetings}
                onChange={e => setShowFutureMeetings(e.target.checked)}
                className="w-3.5 h-3.5 accent-black rounded cursor-pointer border-[#ded8ce]"
              />
              Show future scheduled logs
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="p-8 text-center text-xs text-brand-secondary">Loading meetings...</div>
          ) : filteredMeetings.length === 0 ? (
            <div className="bg-white p-8 rounded-[18px] border border-[#ded8ce] text-center text-xs text-brand-secondary">
              No meetings recorded.
            </div>
          ) : (
            (() => {
              const grouped = getGroupedMeetings();
              return Object.entries(grouped).map(([groupId, group]) => {
                if (group.meetings.length === 0) return null;
                const isExpanded = expandedTemplates[groupId] !== false;
                return (
                  <div key={groupId} className="flex flex-col gap-2 border-b border-[#ded8ce]/30 pb-3 last:border-0 last:pb-0">
                    <button
                      onClick={() => toggleTemplateExpansion(groupId)}
                      className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-brand-secondary hover:text-brand-primary transition-colors py-1 px-1.5 w-full text-left"
                    >
                      <span className="flex items-center gap-1.5">
                        {isExpanded ? (
                          <FolderOpen size={12} className="text-neutral-400 shrink-0" />
                        ) : (
                          <Folder size={12} className="text-neutral-400 shrink-0" />
                        )}
                        {group.name} ({group.meetings.length})
                      </span>
                      <span className="text-neutral-400">
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="flex flex-col gap-2 pl-2 animate-in fade-in duration-200">
                        {group.meetings.map((meet) => {
                          const isActive = selectedMeeting?.id === meet.id;
                          const hasCheckins = meet.capacityScores && meet.capacityScores.length > 0;
                          
                          // Calculate average capacity score
                          let avgScore = 0;
                          if (hasCheckins) {
                            const total = meet.capacityScores.reduce((sum: number, c: any) => sum + (c.score || 0), 0);
                            avgScore = Math.round((total / meet.capacityScores.length) * 10) / 10;
                          }

                          return (
                            <div 
                              key={meet.id} 
                              onClick={() => setSelectedMeeting(meet)}
                              className={`p-3.5 rounded-[18px] border transition-all cursor-pointer bg-white flex flex-col gap-2 ${isActive ? 'border-black border-2' : 'border-[#ded8ce] hover:border-neutral-400 shadow-sm'}`}
                            >
                              {(() => {
                                const displayCardTitle = meet.templateId && meet.templateName 
                                  ? meet.templateName 
                                  : meet.title;
                                return (
                                  <>
                                    <div className="flex justify-between items-start gap-2 w-full">
                                      <h3 className="font-serif text-xs font-bold text-brand-primary line-clamp-1 flex items-center gap-1.5">
                                        {meet.status === 'live' && (
                                          <span className="w-2 h-3.5 rounded bg-red-200/60 inline-block shrink-0" title="Meeting in progress" />
                                        )}
                                        {meet.status === 'scheduled' && (
                                          <span className="w-2 h-3.5 rounded bg-blue-200/60 inline-block shrink-0" title="Meeting scheduled" />
                                        )}
                                        {displayCardTitle}
                                      </h3>
                                      {meet.status === 'live' ? (
                                        <span className="text-[8px] font-bold uppercase tracking-wider text-red-600 bg-red-50 border border-red-200 px-1 py-0.5 rounded shrink-0">
                                          Live
                                        </span>
                                      ) : meet.status === 'scheduled' ? (
                                        <span className="text-[8px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 border border-blue-200 px-1 py-0.5 rounded shrink-0">
                                          Scheduled
                                        </span>
                                      ) : (
                                        hasCheckins && (
                                          <span className={`text-[9px] font-black border px-1.5 py-0.5 rounded-full shrink-0 ${getScoreColor(avgScore)}`}>
                                            {avgScore.toFixed(1)}
                                          </span>
                                        )
                                      )}
                                    </div>
                                    <p className="text-[10px] text-brand-secondary line-clamp-2 leading-relaxed">{meet.summary}</p>
                                    
                                    <div className="flex justify-between items-center text-[9px] text-brand-secondary border-t border-[#ded8ce]/50 pt-2 mt-1">
                                      <span className="flex items-center gap-1 text-[8px] font-bold text-neutral-400 uppercase tracking-wider">
                                        <Calendar size={10} className="text-neutral-400/80 mr-0.5" /> 
                                        {formatLocalDate(meet.date, { month: 'long', day: 'numeric', year: 'numeric' })}
                                      </span>
                                      <span className="text-neutral-400">{meet.actionItems?.length || 0} tasks</span>
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              });
            })()
          )}
        </div>
      </div>

      {/* Right Column: Detailed Meeting View */}
      <div className={`lg:col-span-2 ${mobileActiveTab === 'detail' ? 'block' : 'hidden lg:block'}`}>
        {selectedMeeting ? (
          <div className="bg-[#f7f4ef] p-6 md:p-8 rounded-[18px] border border-[#ded8ce] shadow-sm flex flex-col gap-6 animate-in fade-in duration-300">
            
            {/* Mobile Back Button */}
            <div className="lg:hidden flex items-center mb-1">
              <button
                type="button"
                onClick={() => setMobileActiveTab('list')}
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-extrabold text-neutral-500 hover:text-black transition-colors py-1.5 px-3 rounded-full bg-brand-bg border border-[#ded8ce] shadow-sm cursor-pointer"
              >
                ← Back to Meetings List
              </button>
            </div>
            
            {/* Detail Header */}
            <div className="flex justify-between items-start border-b border-brand-border pb-6 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-brand-secondary uppercase tracking-widest">
                  <Calendar size={12} />
                  <span>{formatLocalDate(selectedMeeting.date, {weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'})}</span>
                </div>
                {(() => {
                  const selectedTemplate = templates.find(t => t.id === selectedMeeting.templateId);
                  const isDetailAutoTitle = selectedMeeting.templateId && selectedMeeting.title.includes(selectedMeeting.date);
                  const displayDetailTitle = isDetailAutoTitle && selectedTemplate
                    ? selectedTemplate.name
                    : selectedMeeting.title;
                  return (
                    <h1 className="font-serif text-2xl md:text-3xl text-brand-primary leading-tight">{displayDetailTitle}</h1>
                  );
                })()}
                
                {/* Attendees list */}
                {selectedMeeting.attendees && selectedMeeting.attendees.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center mt-2">
                    <span className="text-[10px] font-bold text-brand-secondary uppercase tracking-wider mr-1">Attendees:</span>
                    {selectedMeeting.attendees.map((att: string) => (
                      <span key={att} className="bg-brand-bg text-brand-primary text-[10px] px-2 py-0.5 rounded-full font-bold border border-brand-border">{att}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <button 
                  onClick={() => handleStartEditMeeting(selectedMeeting)}
                  className="text-brand-secondary hover:text-brand-primary transition-colors p-2 hover:bg-neutral-50 rounded-lg"
                  title="Meeting Settings"
                >
                  <Settings size={16} />
                </button>
                <button 
                  onClick={() => handleDeleteMeeting(selectedMeeting.id)}
                  className="text-brand-secondary hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg"
                  title="Delete Meeting Log"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {/* Live Meeting Banner */}
            {selectedMeeting.status === 'live' && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 animate-in fade-in shrink-0">
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-red-600 animate-ping shrink-0" />
                  <span className="text-xs font-bold text-red-900">This meeting is currently LIVE. Everyone in attendance should submit their Capacity score.</span>
                </div>
                <div className="flex gap-2 shrink-0 w-full sm:w-auto justify-end">
                  {isTagged && selectedMeeting.enableCapacityCheckin !== false && (
                    <button
                      onClick={() => setIsCheckinModalOpen(true)}
                      className="bg-black hover:bg-neutral-900 text-white text-[10px] font-extrabold uppercase tracking-widest px-3.5 py-1.5 rounded-full shadow-sm transition-all flex items-center gap-1.5"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" /> {myExistingCheckin ? 'Update Check-in' : 'Submit Check-in'}
                    </button>
                  )}
                  <button
                    onClick={() => handleStartEditMeeting(selectedMeeting)}
                    className="bg-red-600 hover:bg-red-700 text-white text-[10px] font-extrabold uppercase tracking-widest px-3.5 py-1.5 rounded-full shadow-sm transition-all animate-pulse cursor-pointer"
                  >
                    Save Meeting
                  </button>
                </div>
              </div>
            )}

            {/* Scheduled Meeting Banner */}
            {selectedMeeting.status === 'scheduled' && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 animate-in fade-in shrink-0">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-blue-600 shrink-0" />
                  <span className="text-xs font-bold text-blue-900">This meeting is scheduled. Team members should submit their pre-meeting Capacity scores.</span>
                </div>
                <div className="flex gap-2 shrink-0 w-full sm:w-auto justify-end">
                  {isTagged && selectedMeeting.enableCapacityCheckin !== false && (
                    <button
                      onClick={() => setIsCheckinModalOpen(true)}
                      className="bg-black hover:bg-neutral-900 text-white text-[10px] font-extrabold uppercase tracking-widest px-3.5 py-1.5 rounded-full shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" /> {myExistingCheckin ? 'Update Check-in' : 'Submit Check-in'}
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      try {
                        await updateDoc(doc(db, 'meetings', selectedMeeting.id), { status: 'live' });
                        setSelectedMeeting((prev: any) => prev ? { ...prev, status: 'live' } : null);
                      } catch (err) {
                        console.error("Failed to start meeting", err);
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-extrabold uppercase tracking-widest px-3.5 py-1.5 rounded-full shadow-sm transition-all cursor-pointer"
                  >
                    Start Meeting
                  </button>
                </div>
              </div>
            )}

            {/* Capacity Score Card (Redesigned to match the capacity score card style) */}
            {selectedMeeting.capacityScores && selectedMeeting.capacityScores.length > 0 ? (
              <div className="bg-white border border-[#ded8ce] rounded-[18px] p-5 shadow-sm flex flex-col gap-4">
                {(() => {
                  const scores = selectedMeeting.capacityScores;
                  const total = scores.reduce((sum: number, c: any) => sum + (c.score || 0), 0);
                  const avg = Math.round((total / scores.length) * 10) / 10;
                  
                  // Calculate averages of each category
                  let avgWkl = 0, avgDln = 0, avgStr = 0, avgBnd = 0, avgFrc = 0;
                  let count = 0;
                  scores.forEach((c: any) => {
                    if (c.categories) {
                      avgWkl += c.categories.workload ?? 5;
                      avgDln += c.categories.urgency ?? 5;
                      avgStr += c.categories.stress ?? 5;
                      avgBnd += c.categories.availability ?? 5;
                      avgFrc += c.categories.friction ?? 5;
                      count++;
                    }
                  });
                  if (count > 0) {
                    avgWkl = Math.round((avgWkl / count) * 10) / 10;
                    avgDln = Math.round((avgDln / count) * 10) / 10;
                    avgStr = Math.round((avgStr / count) * 10) / 10;
                    avgBnd = Math.round((avgBnd / count) * 10) / 10;
                    avgFrc = Math.round((avgFrc / count) * 10) / 10;
                  }

                  const getStatusDetails = (s: number) => {
                    if (s <= 2.9) return { status: "Underutilized", desc: "Healthy resource availability. More initiatives can be added.", confidence: "Green" };
                    if (s <= 4.4) return { status: "Comfortable", desc: "Stable team load. Ready to absorb new projects as needed.", confidence: "Green" };
                    if (s <= 6.4) return { status: "Optimal Zone", desc: "Fully engaged, priorities are moving, and keeping small backlogs.", confidence: "Green" };
                    if (s <= 8.4) return { status: "Constrained", desc: "Prioritisation required. Adding new goals will force tradeoffs.", confidence: "Yellow" };
                    if (s <= 9.4) return { status: "Overloaded", desc: "Action required. Team performance and morale may suffer.", confidence: "Red" };
                    return { status: "Unsustainable", desc: "Immediate support needed. Remove friction and shift tasks.", confidence: "Red" };
                  };

                  const details = getStatusDetails(avg);

                  return (
                    <>
                      {/* Top section: Circle & Details */}
                      <div className="flex flex-col md:flex-row gap-6 items-center">
                        {/* Rating Circle */}
                        <div className="w-[110px] h-[110px] rounded-full bg-[#f0ebe3] border border-[#ded8ce] flex flex-col items-center justify-center shrink-0">
                          <span className="text-3xl font-black text-[#171717] leading-none tracking-tight">{avg.toFixed(1)}</span>
                          <span className="text-[9px] text-[#666] font-bold uppercase tracking-[0.12em] mt-1">Capacity</span>
                        </div>
                        
                        {/* Details & Confidence Row */}
                        <div className="flex-1 space-y-2 text-center md:text-left">
                          <div>
                            <span className="text-[9px] uppercase font-bold text-[#666] tracking-[0.12em]">Team Capacity Status</span>
                            <h4 className="text-base font-extrabold text-[#171717]">{details.status}</h4>
                          </div>
                          <p className="text-[11px] text-[#666] leading-relaxed">
                            "{details.desc}"
                          </p>
                          
                          {/* Confidence Buttons */}
                          <div className="flex flex-wrap justify-center md:justify-start gap-1.5 pt-1">
                            <span className={`text-[10px] font-bold px-3 py-1.5 border rounded-full transition-all select-none ${
                              details.confidence === 'Green' 
                                ? 'bg-[#111] text-white border-[#111]' 
                                : 'bg-white text-[#111] border-[#ded8ce]'
                            }`}>
                              Green: I can deliver
                            </span>
                            <span className={`text-[10px] font-bold px-3 py-1.5 border rounded-full transition-all select-none ${
                              details.confidence === 'Yellow' 
                                ? 'bg-[#111] text-white border-[#111]' 
                                : 'bg-white text-[#111] border-[#ded8ce]'
                            }`}>
                              Yellow: tradeoffs needed
                            </span>
                            <span className={`text-[10px] font-bold px-3 py-1.5 border rounded-full transition-all select-none ${
                              details.confidence === 'Red' 
                                ? 'bg-[#111] text-white border-[#111]' 
                                : 'bg-white text-[#111] border-[#ded8ce]'
                            }`}>
                              Red: intervention needed
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Bottom Section: Category Averages Grid */}
                      {count > 0 && (
                        <div className="grid grid-cols-5 gap-1 text-center border-t border-[#ded8ce] pt-3 text-[9px] font-bold text-brand-secondary">
                          <div>
                            <div>WKL</div>
                            <div className="text-brand-primary text-xs mt-0.5">{avgWkl.toFixed(1)}</div>
                          </div>
                          <div>
                            <div>DLN</div>
                            <div className="text-brand-primary text-xs mt-0.5">{avgDln.toFixed(1)}</div>
                          </div>
                          <div>
                            <div>STR</div>
                            <div className="text-brand-primary text-xs mt-0.5">{avgStr.toFixed(1)}</div>
                          </div>
                          <div>
                            <div>BND</div>
                            <div className="text-brand-primary text-xs mt-0.5">{avgBnd.toFixed(1)}</div>
                          </div>
                          <div>
                            <div>PRC</div>
                            <div className="text-brand-primary text-xs mt-0.5">{avgFrc.toFixed(1)}</div>
                          </div>
                        </div>
                      )}
                      
                      <div className="text-[8px] text-[#666] font-medium border-t border-[#ded8ce]/40 pt-2 text-center">
                        Aggregated across {scores.length} members checked in prior to this call.
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : null}

            {/* Subsections: Notes vs Action Items vs Call Scores */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              
              {/* Detailed Check-ins List */}
              {((selectedMeeting.capacityScores && selectedMeeting.capacityScores.length > 0) || pendingCheckins.length > 0) && (
                <div className="md:col-span-2 flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-brand-secondary">Pre-Meeting Capacity Check-ins</h3>
                    {pendingCheckins.length > 0 && (
                      <span className="text-[10px] text-brand-secondary font-medium italic">
                        Waiting for: <span className="text-brand-primary font-semibold">{pendingCheckins.join(', ')}</span>
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedMeeting.capacityScores && selectedMeeting.capacityScores.length > 0 ? (
                      selectedMeeting.capacityScores
                        .filter((c: any) => selectedMeeting.attendees?.includes(c.memberName))
                        .map((c: any) => (
                          <div 
                            key={c.memberId} 
                            onClick={() => setViewingCheckin(c)}
                            className="border border-[#ded8ce] p-4 rounded-[18px] bg-white flex flex-col gap-3 shadow-sm cursor-pointer hover:border-black hover:shadow-md transition-all"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="font-bold text-xs text-brand-primary">{c.memberName}</span>
                                <div className="text-[9px] uppercase font-semibold text-brand-secondary">{c.status}</div>
                              </div>
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${getConfidenceBadge(c.confidence)}`}>
                                {c.score.toFixed(1)} • {c.confidence}
                              </span>
                            </div>
                            {c.notes && (
                              <p className="text-[10px] text-[#555] bg-[#f7f4ef]/40 border border-[#ded8ce]/40 p-2.5 rounded-[12px] italic line-clamp-2">
                                "{c.notes}"
                              </p>
                            )}
                            {/* Categories details */}
                            {c.categories && (
                              <div className="grid grid-cols-5 gap-1 text-center border-t border-[#ded8ce]/50 pt-2 text-[8px] font-bold text-brand-secondary">
                                <div>
                                  <div>WKL</div>
                                  <div className="text-brand-primary">{c.categories.workload}</div>
                                </div>
                                <div>
                                  <div>DLN</div>
                                  <div className="text-brand-primary">{c.categories.urgency}</div>
                                </div>
                                <div>
                                  <div>STR</div>
                                  <div className="text-brand-primary">{c.categories.stress}</div>
                                </div>
                                <div>
                                  <div>BND</div>
                                  <div className="text-brand-primary">{c.categories.availability}</div>
                                </div>
                                <div>
                                  <div>PRC</div>
                                  <div className="text-brand-primary">{c.categories.friction}</div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))
                    ) : (
                      <div className="sm:col-span-2 border border-dashed border-brand-border p-6 rounded-xl bg-white text-center text-xs text-brand-secondary">
                        No team member capacity check-ins recorded yet. Tagged members can submit their scores above.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action Items List */}
              <div className="flex flex-col gap-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-brand-secondary">Meeting Action Items</h3>
                <div className="bg-white border border-[#ded8ce] rounded-[18px] p-4 shadow-sm flex flex-col gap-3">
                  {(() => {
                    const items = selectedMeeting.actionItems || [];
                    const completedCount = items.filter((i: any) => i.completed).length;
                    const totalCount = items.length;
                    
                    return (
                      <>
                        <div className="flex justify-between items-start border-b border-[#ded8ce]/30 pb-2">
                          <div>
                            <span className="font-bold text-xs text-brand-primary">Action Items List</span>
                            <div className="text-[9px] uppercase font-semibold text-brand-secondary">Tasks & Follow-ups</div>
                          </div>
                          {totalCount > 0 && (
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                              completedCount === totalCount 
                                ? 'bg-green-100 text-green-800 border-green-200' 
                                : 'bg-neutral-100 text-neutral-800 border-neutral-200'
                            }`}>
                              {completedCount}/{totalCount} Completed
                            </span>
                          )}
                        </div>
                        
                        {totalCount === 0 ? (
                          <div className="text-xs text-brand-secondary italic p-2">No action items recorded for this meeting.</div>
                        ) : (
                          <div className="flex flex-col gap-2.5">
                            {items.map((item: any, idx: number) => (
                              <div 
                                key={idx} 
                                onClick={() => handleToggleActionItem(selectedMeeting.id, idx)}
                                className="flex items-start gap-2.5 p-2 bg-white rounded-lg border border-brand-border/50 hover:border-brand-primary cursor-pointer transition-colors shadow-sm"
                              >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${item.completed ? 'bg-black border-black text-white' : 'border-brand-border bg-white'}`}>
                                  {item.completed && <Check size={10} strokeWidth={3} />}
                                </div>
                                <span className={`text-[11px] leading-tight font-medium ${item.completed ? 'line-through text-brand-secondary font-normal' : 'text-brand-primary'}`}>
                                  {item.text}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-brand-secondary">
                  {selectedMeeting.sections && selectedMeeting.sections.length > 0 ? 'Meeting Sections & Notes' : 'Discussion Notes'}
                </h3>
                <div className="bg-white border border-[#ded8ce] rounded-[18px] p-4 shadow-sm flex flex-col gap-3">
                  {/* Card Header inside Notes Card */}
                  <div className="flex justify-between items-start border-b border-[#ded8ce]/30 pb-2">
                    <div>
                      <span className="font-bold text-xs text-brand-primary">
                        {selectedMeeting.sections && selectedMeeting.sections.length > 0 ? 'Notes & Discussions' : 'Discussion Notes'}
                      </span>
                      <div className="text-[9px] uppercase font-semibold text-brand-secondary">Agenda & Minutes</div>
                    </div>
                    {!isEditingAllNotes ? (
                      <button
                        onClick={handleStartInlineNotesEditing}
                        className="text-[9px] font-bold text-neutral-500 hover:text-black hover:border-black flex items-center gap-1 transition-colors border border-[#ded8ce] rounded-full px-2.5 py-0.5 bg-white shadow-sm"
                        title="Edit all notes at once"
                      >
                        <Pencil size={9} className="text-neutral-400" /> Edit All Notes
                      </button>
                    ) : (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border border-red-200 bg-red-50 text-red-600">
                        Editing Notes
                      </span>
                    )}
                  </div>
                  
                  {/* Scrollable Body inside Notes Card */}
                  <div className="max-h-[290px] overflow-y-auto custom-scrollbar flex flex-col gap-4">
                    {isEditingAllNotes ? (
                      <div className="space-y-4">
                        {selectedMeeting.sections && selectedMeeting.sections.length > 0 ? (
                          localSections.map((sec, idx) => (
                            <div key={idx} className="space-y-1.5">
                              <label className="block text-[10px] font-bold text-brand-secondary uppercase tracking-wider">{sec.name}</label>
                              <textarea
                                value={sec.notes}
                                onChange={e => {
                                  const updated = [...localSections];
                                  updated[idx].notes = e.target.value;
                                  setLocalSections(updated);
                                }}
                                className="w-full min-h-[100px] bg-white border border-[#ded8ce] rounded-xl p-3 text-xs outline-none focus:border-black transition-colors resize-y font-sans leading-relaxed text-[#171717]"
                                placeholder={`Enter notes for ${sec.name}...`}
                                autoFocus={idx === 0}
                              />
                            </div>
                          ))
                        ) : (
                          <div className="space-y-1.5">
                            <label className="block text-[10px] font-bold text-brand-secondary uppercase tracking-wider">Discussion Notes</label>
                            <textarea
                              value={localGeneralNotes}
                              onChange={e => setLocalGeneralNotes(e.target.value)}
                              className="w-full min-h-[180px] bg-white border border-[#ded8ce] rounded-xl p-3.5 text-xs outline-none focus:border-black transition-colors resize-y font-sans leading-relaxed text-[#171717]"
                              placeholder="Enter discussion notes..."
                              autoFocus
                            />
                          </div>
                        )}
                        <div className="flex gap-2 justify-end pt-2 border-t border-brand-border/30">
                          <button
                            onClick={() => setIsEditingAllNotes(false)}
                            className="px-4 py-1.5 text-xs font-bold border border-[#ded8ce] rounded-full bg-white hover:bg-neutral-50 shadow-sm transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveAllInlineNotes}
                            className="px-4 py-1.5 text-xs font-bold text-white bg-black rounded-full hover:bg-neutral-900 shadow-sm transition-colors"
                          >
                            Save Notes
                          </button>
                        </div>
                      </div>
                    ) : (
                      selectedMeeting.sections && selectedMeeting.sections.length > 0 ? (
                        selectedMeeting.sections.map((sec: any, idx: number) => (
                          editingSectionIdx === idx ? (
                            <div key={idx} className="border-b border-brand-border/30 last:border-0 pb-3 last:pb-0 space-y-2">
                              <h4 className="font-bold text-xs text-brand-primary uppercase tracking-wider">{sec.name}</h4>
                              <textarea
                                value={editingSectionNotes}
                                onChange={e => setEditingSectionNotes(e.target.value)}
                                className="w-full min-h-[80px] bg-white border border-[#ded8ce] rounded-xl p-3 text-xs outline-none focus:border-black transition-colors resize-y font-sans leading-relaxed text-[#171717]"
                                placeholder={`Enter notes for ${sec.name}...`}
                                autoFocus
                              />
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={() => setEditingSectionIdx(null)}
                                  className="px-3 py-1 text-[10px] font-bold border border-[#ded8ce] rounded-full bg-white hover:bg-neutral-50"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleSaveSectionNotes(idx)}
                                  className="px-3 py-1 text-[10px] font-bold text-white bg-black rounded-full hover:bg-neutral-900"
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div key={idx} className="border-b border-brand-border/30 last:border-0 pb-3 last:pb-0 group">
                              <div className="flex justify-between items-center mb-1">
                                <h4 className="font-bold text-xs text-brand-primary uppercase tracking-wider">{sec.name}</h4>
                                <button
                                  onClick={() => {
                                    setEditingSectionIdx(idx);
                                    setEditingSectionNotes(sec.notes || '');
                                  }}
                                  className="text-[10px] font-bold text-neutral-500 hover:text-black transition-colors opacity-0 group-hover:opacity-100 flex items-center gap-1"
                                  title="Edit notes for this section"
                                >
                                  <Pencil size={10} className="text-neutral-400" /> Edit
                                </button>
                              </div>
                              <p 
                                className="text-xs text-[#222] leading-relaxed whitespace-pre-wrap font-sans cursor-pointer hover:bg-neutral-50/50 p-1 rounded transition-colors"
                                onClick={() => {
                                  setEditingSectionIdx(idx);
                                  setEditingSectionNotes(sec.notes || '');
                                }}
                              >
                                {sec.notes || <span className="italic text-neutral-400 font-medium">No notes written for this section. Click here to add notes.</span>}
                              </p>
                            </div>
                          )
                        ))
                      ) : (
                        editingSectionIdx === -1 ? (
                          <div className="space-y-2">
                            <textarea
                              value={editingSectionNotes}
                              onChange={e => setEditingSectionNotes(e.target.value)}
                              className="w-full min-h-[150px] bg-white border border-[#ded8ce] rounded-xl p-3.5 text-xs outline-none focus:border-black transition-colors resize-y font-sans leading-relaxed text-[#171717]"
                              placeholder="Enter discussion notes..."
                              autoFocus
                            />
                            <div className="flex gap-2 justify-end">
                              <button
                                  onClick={() => setEditingSectionIdx(null)}
                                  className="px-3 py-1 text-[10px] font-bold border border-[#ded8ce] rounded-full bg-white hover:bg-neutral-50"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={async () => {
                                    if (!selectedMeeting) return;
                                    try {
                                      const meetingRef = doc(db, 'meetings', selectedMeeting.id);
                                      await updateDoc(meetingRef, {
                                        notes: editingSectionNotes
                                      });
                                      setSelectedMeeting((prev: any) => ({
                                        ...prev,
                                        notes: editingSectionNotes
                                      }));
                                      setEditingSectionIdx(null);
                                    } catch (err) {
                                      console.error("Failed to save discussion notes", err);
                                      alert("Failed to save notes. Please try again.");
                                    }
                                  }}
                                  className="px-3 py-1 text-[10px] font-bold text-white bg-black rounded-full hover:bg-neutral-900"
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="group relative">
                              <button
                                onClick={() => {
                                  setEditingSectionIdx(-1);
                                  setEditingSectionNotes(selectedMeeting.notes || '');
                                }}
                                className="absolute right-0 top-0 text-[10px] font-bold text-neutral-500 hover:text-black transition-colors opacity-0 group-hover:opacity-100 flex items-center gap-1"
                                title="Edit discussion notes"
                              >
                                <Pencil size={10} className="text-neutral-400" /> Edit
                              </button>
                              <div 
                                className="prose prose-sm max-w-none text-brand-primary text-xs leading-relaxed whitespace-pre-wrap font-sans cursor-pointer hover:bg-neutral-50/50 p-2 rounded transition-colors"
                                onClick={() => {
                                  setEditingSectionIdx(-1);
                                  setEditingSectionNotes(selectedMeeting.notes || '');
                                }}
                              >
                                {selectedMeeting.notes || <span className="italic text-neutral-400 font-medium">No discussion notes written yet. Click here to add notes.</span>}
                              </div>
                            </div>
                          )
                        )
                      )}
                  </div>
                </div>
              </div>

            </div>

          </div>
        ) : (
          <div className="bg-white p-12 text-center text-brand-secondary border border-[#ded8ce] rounded-[18px] shadow-sm flex flex-col justify-center items-center min-h-[40vh] gap-3">
            <FileText size={40} className="text-brand-secondary/40" />
            <h3 className="font-serif text-lg font-bold text-brand-primary">No Meeting Selected</h3>
            <p className="text-xs text-brand-secondary max-w-xs mx-auto">Select a meeting log from the sidebar or click "Record Meeting" to construct a new report.</p>
          </div>
        )}
      </div>
      </div>
      ) : (
        <div className="bg-white border border-[#ded8ce] rounded-[18px] p-6 shadow-sm animate-in fade-in zoom-in-95 duration-300">
          {renderCalendarView()}
        </div>
      )}

      {/* Record New Meeting Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#f7f4ef] w-screen h-screen overflow-hidden animate-in fade-in duration-200">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-[#ded8ce] flex justify-between items-center bg-white shrink-0">
              <div>
                <h3 className="font-serif text-2xl text-brand-primary font-bold">Record Meeting Minutes (v1.0.8)</h3>
                <p className="text-sm font-medium text-brand-secondary mt-1">Date, record capacity check-in scores, and write or import your discussions.</p>
              </div>
              <button 
                onClick={() => setIsNewModalOpen(false)} 
                className="text-brand-secondary hover:text-brand-primary transition-colors bg-white border border-[#ded8ce] rounded-full p-2.5 hover:bg-neutral-50 shadow-sm cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Success Toast / Notification Banner */}
            {parseSuccessMessage && (
              <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-3 flex items-center justify-between shrink-0 animate-in slide-in-from-top duration-300">
                <div className="flex items-center gap-2 text-emerald-800 text-sm font-semibold">
                  <Check size={16} className="text-emerald-600 animate-bounce" />
                  <span>{parseSuccessMessage}</span>
                </div>
                <button onClick={() => setParseSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-800 text-xs font-bold uppercase tracking-wider">
                  Dismiss
                </button>
              </div>
            )}
            
            {/* Modal Content */}
            <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8 overflow-y-auto custom-scrollbar flex-1 bg-[#f7f4ef]">
              
              {/* Left Column: Basic Details & Action Items */}
              <div className="lg:col-span-2 flex flex-col gap-6">
                
                {/* Form Inputs */}
                <div className="bg-white p-6 border border-[#ded8ce] rounded-[18px] shadow-sm flex flex-col gap-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-1.5">Meeting Template Selection</label>
                      <select
                        value={selectedTemplateId}
                        onChange={e => {
                          const val = e.target.value;
                          setSelectedTemplateId(val);
                          if (val) {
                            const t = templates.find(temp => temp.id === val);
                            if (t) {
                              // Preselect attendees
                              setNewAttendees(t.attendees || []);
                              // Set dynamic sections
                              setMeetingSections((t.sections || []).map((sec: string) => ({ name: sec, notes: '' })));
                              // Prepopulate the capacity check-in setting from template
                              setNewEnableCapacityCheckin(t.enableCapacityCheckin !== false);
                              // Set visibleRoles
                              setNewVisibleRoles(t.visibleRoles || []);
                            }
                          } else {
                            // Reset to custom
                            setMeetingSections([]);
                            setNewVisibleRoles([]);
                          }
                        }}
                        className="w-full bg-[#fcfbf9] border border-[#ded8ce] rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary outline-none cursor-pointer font-bold text-brand-primary"
                      >
                        <option value="">-- Custom / Ad-hoc Meeting --</option>
                        {visibleTemplates.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-3 flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        id="newEnableCapacityCheckin"
                        checked={newEnableCapacityCheckin}
                        onChange={e => setNewEnableCapacityCheckin(e.target.checked)}
                        className="w-4 h-4 accent-black cursor-pointer rounded border-[#ded8ce]"
                      />
                      <label htmlFor="newEnableCapacityCheckin" className="text-xs font-bold uppercase tracking-widest text-brand-secondary cursor-pointer select-none">
                        Enable Capacity Check-in (Call Score) for this meeting
                      </label>
                    </div>
                    
                    {!selectedTemplateId ? (
                      <div className="sm:col-span-2 animate-in fade-in duration-200">
                        <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-1.5">Meeting Title</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Weekly Sync"
                          value={newTitle}
                          onChange={e => setNewTitle(e.target.value)}
                          className="w-full bg-neutral-50/50 border border-[#ded8ce] rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary outline-none text-brand-primary font-medium"
                        />
                      </div>
                    ) : null}
                    
                    <div className={selectedTemplateId ? "sm:col-span-3" : "sm:col-span-1"}>
                      <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-1.5">Date</label>
                      <input 
                        type="date" 
                        value={newDate}
                        onChange={e => setNewDate(e.target.value)}
                        className="w-full bg-neutral-50/50 border border-[#ded8ce] rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary outline-none text-brand-primary font-medium"
                      />
                    </div>
                  </div>
                </div>

                {/* Gemini AI Integrator Section */}
                <div className="bg-white border border-[#ded8ce] rounded-[18px] p-6 shadow-sm flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-black text-indigo-900 flex items-center gap-1.5">
                      <Sparkles size={16} className="text-indigo-600 animate-pulse" />
                      Google Meet & Gemini AI Integrator
                    </span>
                    <button 
                      onClick={() => setIsSyncModalOpen(true)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-wider px-3.5 py-2 rounded-lg transition-colors shadow-sm flex items-center gap-1 cursor-pointer"
                    >
                      <Plus size={12} /> Sync Google Meet
                    </button>
                  </div>
                  <p className="text-xs text-indigo-950 leading-relaxed">
                    Instantly sync Gemini-generated summaries and checklists from your Google Meet, or paste them manually below.
                  </p>
                  
                  {isParsingText ? (
                    <div className="flex flex-col gap-3 animate-in fade-in duration-200">
                      <textarea 
                        placeholder="Paste your Gemini meeting notes summary here... (bullet points will be extracted as action items)"
                        value={rawPasteText}
                        onChange={e => setRawPasteText(e.target.value)}
                        className="w-full bg-white border border-[#ded8ce] rounded-lg p-3 text-sm focus:border-brand-primary outline-none min-h-[120px]"
                      />
                      <div className="flex gap-2 justify-end">
                        <PillButton variant="outline" className="py-1.5 px-4 text-xs border-[#ded8ce] hover:bg-neutral-50" onClick={() => setIsParsingText(false)}>Cancel</PillButton>
                        <PillButton variant="filled" className="py-1.5 px-4 text-xs bg-indigo-600 hover:bg-indigo-700 text-white border-transparent" onClick={handlePerformManualParse}>Parse Notes</PillButton>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setIsParsingText(true)}
                      className="border border-dashed border-indigo-200/80 bg-[#fcfbf9] hover:bg-indigo-50/50 rounded-lg py-3 text-center text-xs font-bold text-indigo-600 transition-colors cursor-pointer"
                    >
                      + Paste & Parse Gemini Notes Text
                    </button>
                  )}
                </div>

                {/* Summary & Discussion notes */}
                <div className="bg-white p-6 border border-[#ded8ce] rounded-[18px] shadow-sm flex flex-col gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-1.5">Brief Summary</label>
                    <input 
                      type="text" 
                      placeholder="Enter a brief high-level sentence summarizing outcomes"
                      value={newSummary}
                      onChange={e => setNewSummary(e.target.value)}
                      className="w-full bg-neutral-50/50 border border-[#ded8ce] rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary outline-none text-brand-primary font-medium"
                    />
                  </div>

                  {selectedTemplateId ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary">Meeting Sections</label>
                        <button
                          type="button"
                          onClick={() => {
                            setMeetingSections(prev => [...prev, { name: 'New Section', notes: '' }]);
                          }}
                          className="text-xs font-bold text-black border border-[#ded8ce] rounded-full px-3.5 py-1 hover:bg-neutral-50 shadow-sm cursor-pointer"
                        >
                          + Add Section
                        </button>
                      </div>

                      {meetingSections.map((sec, idx) => (
                        <div key={idx} className="bg-[#f7f4ef]/30 border border-[#ded8ce] rounded-xl p-5 flex flex-col gap-3 relative shadow-sm animate-in fade-in duration-150">
                          <div className="flex justify-between items-center gap-2">
                            <input
                              type="text"
                              value={sec.name}
                              onChange={e => {
                                const newSecs = [...meetingSections];
                                newSecs[idx].name = e.target.value;
                                setMeetingSections(newSecs);
                              }}
                              className="flex-1 bg-transparent border-b border-transparent hover:border-[#ded8ce] focus:border-brand-primary font-bold text-sm text-brand-primary outline-none py-0.5"
                              placeholder="Section Name"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setMeetingSections(prev => prev.filter((_, i) => i !== idx));
                              }}
                              className="text-brand-secondary hover:text-red-500 transition-colors p-1 cursor-pointer"
                              title="Remove Section"
                            >
                              <X size={14} />
                            </button>
                          </div>
                          <textarea
                            value={sec.notes}
                            onChange={e => {
                              const newSecs = [...meetingSections];
                              newSecs[idx].notes = e.target.value;
                              setMeetingSections(newSecs);
                            }}
                            placeholder={`Enter notes for "${sec.name}"...`}
                            className="w-full bg-white border border-[#ded8ce] rounded-lg px-3.5 py-2.5 text-sm focus:border-brand-primary outline-none min-h-[90px]"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-1.5">Meeting Discussion / Notes</label>
                      <textarea 
                        placeholder="Write comprehensive meeting notes, topics discussed, or copy-paste detailed logs here..."
                        value={newNotes}
                        onChange={e => setNewNotes(e.target.value)}
                        className="w-full bg-neutral-50/50 border border-[#ded8ce] rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary outline-none min-h-[140px]"
                      />
                    </div>
                  )}
                </div>

                {/* Attendees Comma Field / Select */}
                <div className="bg-white p-6 border border-[#ded8ce] rounded-[18px] shadow-sm flex flex-col gap-4">
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary">Attendees Present</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setNewAttendees(teamMembers.map(m => m.name))}
                        className="text-xs text-brand-primary hover:underline font-bold cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-xs text-brand-secondary">•</span>
                      <button
                        type="button"
                        onClick={() => setNewAttendees([])}
                        className="text-xs text-brand-secondary hover:text-brand-primary hover:underline font-bold cursor-pointer"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 p-3 bg-neutral-50/50 border border-[#ded8ce] rounded-lg min-h-[48px]">
                    {teamMembers.map(member => {
                      const isSelected = newAttendees.includes(member.name);
                      return (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setNewAttendees(prev => prev.filter(a => a !== member.name));
                            } else {
                              setNewAttendees(prev => [...prev, member.name]);
                            }
                          }}
                          className={`text-xs px-3.5 py-1.5 rounded-full font-bold border transition-colors cursor-pointer ${isSelected ? 'bg-black text-white border-black' : 'bg-white text-brand-primary border-[#ded8ce] hover:border-neutral-400'}`}
                        >
                          {member.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Action Items construction */}
                <div className="bg-white p-6 border border-[#ded8ce] rounded-[18px] shadow-sm flex flex-col gap-4">
                  <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary">Construct Action Items</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      id="itemInput"
                      placeholder="e.g. Write platform unit tests (Bob)"
                      className="flex-1 bg-neutral-50/50 border border-[#ded8ce] rounded-lg px-4 py-2.5 text-sm focus:border-brand-primary outline-none text-brand-primary font-medium"
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = e.currentTarget;
                          handleAddActionItemInput(input.value);
                          input.value = '';
                        }
                      }}
                    />
                    <PillButton 
                      variant="filled" 
                      onClick={() => {
                        const el = document.getElementById('itemInput') as HTMLInputElement;
                        if (el) {
                          handleAddActionItemInput(el.value);
                          el.value = '';
                        }
                      }}
                      className="py-2.5 px-4 text-xs font-bold shrink-0"
                    >
                      Add
                    </PillButton>
                  </div>

                  {newActionItems.length > 0 && (
                    <div className="border border-[#ded8ce] rounded-[14px] p-4 flex flex-col gap-2 max-h-[180px] overflow-y-auto custom-scrollbar">
                      {newActionItems.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-neutral-50/50 p-2.5 rounded-lg border border-[#ded8ce]/30">
                          <span className="text-xs text-brand-primary font-medium">{item.text}</span>
                          <button onClick={() => handleRemoveActionItemInput(idx)} className="text-brand-secondary hover:text-red-500 transition-colors p-1 cursor-pointer">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              {/* Right Column: Pre-Meeting Capacity Check-in (Call Score Sliders) */}
              <div className="lg:col-span-1 bg-white p-6 border border-[#ded8ce] rounded-[18px] shadow-sm flex flex-col gap-6 self-start">
                <div>
                  <h4 className="text-sm font-bold text-brand-primary border-b border-[#ded8ce] pb-2.5 mb-4 flex items-center gap-1.5">
                    <UserPlus size={16} className="text-brand-secondary" />
                    Capacity Check-in (Call Score)
                  </h4>
                  <p className="text-xs text-brand-secondary leading-relaxed mb-4">
                    Have team members record their scores before starting the meeting.
                  </p>

                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-1.5">Select Member</label>
                      <select 
                        value={checkinMemberId}
                        onChange={e => setCheckinMemberId(e.target.value)}
                        className="w-full bg-[#fcfbf9] border border-[#ded8ce] rounded-lg px-3.5 py-2.5 text-sm focus:border-brand-primary outline-none cursor-pointer font-bold text-brand-primary"
                      >
                        <option value="">-- Choose Member --</option>
                        {teamMembers
                          .filter(m => newAttendees.includes(m.name))
                          .map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))
                        }
                      </select>
                    </div>

                    {/* Capacity sliders */}
                    {checkinMemberId && (
                      <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                        {/* Slider 1: Workload */}
                        <div>
                          <div className="flex justify-between text-xs font-bold text-brand-primary mb-1">
                            <span>1. Workload Volume</span>
                            <span>{checkinWorkload}/10</span>
                          </div>
                          <input 
                            type="range" min="1" max="10" 
                            value={checkinWorkload} 
                            onChange={e => setCheckinWorkload(parseInt(e.target.value))}
                            className="w-full accent-black h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Slider 2: Urgency */}
                        <div>
                          <div className="flex justify-between text-xs font-bold text-brand-primary mb-1">
                            <span>2. Deadline Pressure</span>
                            <span>{checkinUrgency}/10</span>
                          </div>
                          <input 
                            type="range" min="1" max="10" 
                            value={checkinUrgency} 
                            onChange={e => setCheckinUrgency(parseInt(e.target.value))}
                            className="w-full accent-black h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Slider 3: Stress */}
                        <div>
                          <div className="flex justify-between text-xs font-bold text-brand-primary mb-1">
                            <span>3. Stress Load</span>
                            <span>{checkinStress}/10</span>
                          </div>
                          <input 
                            type="range" min="1" max="10" 
                            value={checkinStress} 
                            onChange={e => setCheckinStress(parseInt(e.target.value))}
                            className="w-full accent-black h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Slider 4: Availability */}
                        <div>
                          <div className="flex justify-between text-xs font-bold text-brand-primary mb-1">
                            <span>4. Available Bandwidth</span>
                            <span>{checkinAvailability}/10</span>
                          </div>
                          <input 
                            type="range" min="1" max="10" 
                            value={checkinAvailability} 
                            onChange={e => setCheckinAvailability(parseInt(e.target.value))}
                            className="w-full accent-black h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Slider 5: Friction */}
                        <div>
                          <div className="flex justify-between text-xs font-bold text-brand-primary mb-1">
                            <span>5. Workflow Friction</span>
                            <span>{checkinFriction}/10</span>
                          </div>
                          <input 
                            type="range" min="1" max="10" 
                            value={checkinFriction} 
                            onChange={e => setCheckinFriction(parseInt(e.target.value))}
                            className="w-full accent-black h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Confidence Check-in */}
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-1.5">Confidence Status</label>
                          <div className="flex gap-2">
                            {['Green', 'Yellow', 'Red'].map(c => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setCheckinConfidence(c)}
                                className={`flex-1 text-xs font-bold py-2 rounded-lg border transition-all cursor-pointer ${checkinConfidence === c ? 'bg-black text-white border-black scale-[1.02]' : 'bg-white border-[#ded8ce] text-brand-secondary hover:border-neutral-400'}`}
                              >
                                {c}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Notes Check-in */}
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-widest text-brand-secondary mb-1.5">Blockers / Notes</label>
                          <textarea 
                            placeholder="Add specific blocker notes..."
                            value={checkinNotes}
                            onChange={e => setCheckinNotes(e.target.value)}
                            className="w-full bg-neutral-50/50 border border-[#ded8ce] rounded-lg p-3 text-sm focus:border-brand-primary outline-none min-h-[70px]"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleAddCheckin}
                          className="w-full bg-black text-white text-xs font-bold uppercase tracking-wider py-3 rounded-lg hover:bg-neutral-800 transition-all shadow-sm cursor-pointer"
                        >
                          Submit Score check-in
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* List of active checked-in members */}
                {capacityCheckins.length > 0 && (
                  <div className="mt-6 flex flex-col gap-3">
                    <span className="text-xs font-black uppercase tracking-widest text-brand-secondary border-b border-[#ded8ce] pb-1">Checked-in Members</span>
                    <div className="flex flex-col gap-2.5 max-h-[250px] overflow-y-auto custom-scrollbar">
                      {capacityCheckins.map(c => (
                        <div key={c.memberId} className="bg-[#f7f4ef]/30 flex justify-between items-center p-3.5 rounded-xl border border-[#ded8ce]/70">
                          <div>
                            <div className="font-bold text-sm text-brand-primary">{c.memberName}</div>
                            <div className="text-xs text-brand-secondary font-medium mt-0.5">{c.status} ({c.score.toFixed(1)}/10)</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded border uppercase ${getConfidenceBadge(c.confidence)}`}>
                              {c.confidence}
                            </span>
                            <button onClick={() => handleRemoveCheckin(c.memberId)} className="text-brand-secondary hover:text-red-500 transition-colors p-1 cursor-pointer">
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-6 bg-white flex gap-4 border-t border-[#ded8ce] sticky bottom-0 z-10 shrink-0">
              <PillButton 
                variant="outline" 
                onClick={() => {
                  setIsNewModalOpen(false);
                  setIsEditingMeeting(false);
                  setEditingMeetingId(null);
                }} 
                className="flex-1 justify-center py-3 text-sm border-[#ded8ce] hover:bg-neutral-50"
              >
                Cancel
              </PillButton>
              {isEditingMeeting && selectedMeeting ? (
                <>
                  {selectedMeeting.status === 'scheduled' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSaveMeeting('scheduled')}
                        className="flex-1 justify-center py-3 text-sm font-bold text-black border border-[#ded8ce] rounded-full hover:bg-neutral-50 shadow-sm cursor-pointer"
                      >
                        Save Changes (Scheduled)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveMeeting('live')}
                        className="flex-1 justify-center py-3 text-sm font-bold text-black border border-[#ded8ce] rounded-full hover:bg-neutral-50 shadow-sm cursor-pointer"
                      >
                        Start Live Meeting
                      </button>
                      <PillButton variant="filled" onClick={() => handleSaveMeeting('completed')} className="flex-1 justify-center py-3 text-sm">
                        Complete Meeting
                      </PillButton>
                    </>
                  )}
                  {selectedMeeting.status === 'live' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSaveMeeting('live')}
                        className="flex-1 justify-center py-3 text-sm font-bold text-black border border-[#ded8ce] rounded-full hover:bg-neutral-50 shadow-sm cursor-pointer"
                      >
                        Keep as Live Meeting
                      </button>
                      <PillButton variant="filled" onClick={() => handleSaveMeeting('completed')} className="flex-1 justify-center py-3 text-sm">
                        Complete Meeting
                      </PillButton>
                    </>
                  )}
                  {selectedMeeting.status === 'completed' && (
                    <>
                      <PillButton variant="filled" onClick={() => handleSaveMeeting('completed')} className="flex-1 justify-center py-3 text-sm">
                        Save Changes
                      </PillButton>
                    </>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleSaveMeeting('scheduled')}
                    className="flex-1 justify-center py-3 text-sm font-bold text-black border border-[#ded8ce] rounded-full hover:bg-neutral-50 shadow-sm cursor-pointer"
                  >
                    Schedule for Later
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveMeeting('live')}
                    className="flex-1 justify-center py-3 text-sm font-bold text-black border border-[#ded8ce] rounded-full hover:bg-neutral-50 shadow-sm cursor-pointer"
                  >
                    Start Live Meeting
                  </button>
                  <PillButton variant="filled" onClick={() => handleSaveMeeting('completed')} className="flex-1 justify-center py-3 text-sm">
                    Save Completed Minutes
                  </PillButton>
                </>
              )}
            </div>
            
        </div>
      )}

      {/* Template Manager Modal */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white max-w-[95vw] lg:max-w-[700px] w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-brand-border my-auto max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-brand-border flex justify-between items-center bg-white shrink-0">
              <div>
                <h3 className="font-serif text-2xl text-brand-primary font-bold">
                  Manage Meeting Templates
                </h3>
                <p className="text-xs font-medium text-brand-secondary mt-1">Create and manage customized schemas for recurring everyday meetings.</p>
              </div>
              <button 
                onClick={() => {
                  setIsTemplateModalOpen(false);
                  handleCancelEditTemplate();
                }} 
                className="text-brand-secondary hover:text-brand-primary transition-colors bg-brand-bg border border-brand-border rounded-md p-1"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-white space-y-6">
              
              {/* Existing Templates Section */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-brand-secondary border-b border-brand-border pb-1">Existing Templates</h4>
                {templates.length === 0 ? (
                  <p className="text-xs text-brand-secondary italic">No custom templates defined yet.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {templates.map(t => (
                      <div key={t.id} className={`border rounded-xl p-3.5 flex justify-between items-start gap-4 shadow-sm transition-all ${editingTemplateId === t.id ? 'border-brand-primary bg-brand-bg/10 ring-1 ring-brand-primary' : 'border-brand-border bg-white'}`}>
                        <div className="space-y-1.5">
                          <h5 className="font-serif font-bold text-xs text-brand-primary flex items-center gap-1.5">
                            {editingTemplateId === t.id && <Pencil size={10} className="text-brand-primary shrink-0" />}
                            {t.name}
                          </h5>
                          <div className="text-[10px] text-brand-secondary space-y-0.5">
                            <div><span className="font-bold text-brand-primary">Sections:</span> {t.sections?.length || 0} items</div>
                            <div><span className="font-bold text-brand-primary">Default Attendees:</span> {t.attendees?.length || 0} members</div>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => handleStartEditTemplate(t)}
                            className="text-brand-secondary hover:text-brand-primary transition-colors p-1.5 hover:bg-white/80 rounded border border-transparent hover:border-brand-border"
                            title="Edit Template"
                          >
                            <Pencil size={12} className="text-neutral-500" />
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(t.id)}
                            className="text-brand-secondary hover:text-red-600 transition-colors p-1.5 hover:bg-red-50 rounded"
                            title="Delete Template"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Create/Edit Template Section */}
              <div className="bg-white border border-[#ded8ce] rounded-2xl p-5 shadow-sm space-y-5">
                <div className="flex justify-between items-center border-b border-[#ded8ce] pb-2">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-brand-primary">
                    {editingTemplateId ? `Edit Template: ${templates.find(t => t.id === editingTemplateId)?.name}` : 'Create New Template'}
                  </h4>
                  {editingTemplateId && (
                    <button
                      type="button"
                      onClick={handleCancelEditTemplate}
                      className="text-[10px] font-bold text-red-600 hover:underline"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>
                
                {/* Template Name */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary">Template Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Daily Standup, Weekly Design Sync"
                    value={templateNameInput}
                    onChange={e => setTemplateNameInput(e.target.value)}
                    className="w-full bg-white border border-[#ded8ce] rounded-lg px-3 py-2 text-xs focus:border-black outline-none font-medium text-brand-primary"
                  />
                </div>

                {/* Enable Capacity Check-in Checkbox Toggle */}
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id="templateEnableCapacityCheckin"
                    checked={templateEnableCapacityCheckin}
                    onChange={e => setTemplateEnableCapacityCheckin(e.target.checked)}
                    className="w-4 h-4 accent-black cursor-pointer rounded border-[#ded8ce]"
                  />
                  <label htmlFor="templateEnableCapacityCheckin" className="text-[10px] font-bold uppercase tracking-widest text-[#171717] cursor-pointer select-none">
                    Enable Capacity Check-in (Call Score) for meetings under this template
                  </label>
                </div>

                {/* Visible to Roles Toggle List */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary">Visible to Roles (Leave empty for everyone)</label>
                  <div className="flex flex-wrap gap-1.5 p-2 bg-white border border-[#ded8ce] rounded-lg min-h-[40px]">
                    {['Admin', 'Leadership', 'Manager', 'Staff'].map(role => {
                      const isSelected = templateVisibleRolesInput.includes(role);
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setTemplateVisibleRolesInput(prev => prev.filter(r => r !== role));
                            } else {
                              setTemplateVisibleRolesInput(prev => [...prev, role]);
                            }
                          }}
                          className={`text-[9px] px-2.5 py-1 rounded-full font-bold border transition-colors ${
                            isSelected 
                              ? 'bg-black text-white border-black' 
                              : 'bg-white text-brand-primary border-[#ded8ce] hover:border-neutral-400'
                          }`}
                        >
                          {role}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Default Attendees */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary">Preselected Attendees</label>
                  <div className="flex flex-wrap gap-1.5 p-2 bg-white border border-[#ded8ce] rounded-lg min-h-[40px]">
                    {teamMembers.map(member => {
                      const isSelected = templateAttendeesInput.includes(member.name);
                      return (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setTemplateAttendeesInput(prev => prev.filter(a => a !== member.name));
                            } else {
                              setTemplateAttendeesInput(prev => [...prev, member.name]);
                            }
                          }}
                          className={`text-[9px] px-2 py-0.5 rounded-full font-bold border transition-colors ${isSelected ? 'bg-black text-white border-black' : 'bg-white text-brand-primary border-[#ded8ce] hover:border-neutral-400'}`}
                        >
                          {member.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Sections */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary">Template Sections</label>
                    <button
                      type="button"
                      onClick={handleAddTemplateSectionInput}
                      className="text-[9px] font-bold text-black border border-[#ded8ce] bg-white rounded-full px-2 py-0.5 hover:bg-neutral-50 shadow-sm"
                    >
                      + Add Section Input
                    </button>
                  </div>
                  <div className="flex flex-col gap-2 max-h-[180px] overflow-y-auto custom-scrollbar pr-1">
                    {templateSectionsInput.map((sec, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input
                          type="text"
                          placeholder={`Section ${idx + 1} Name (e.g. Blockers)`}
                          value={sec}
                          onChange={e => handleUpdateTemplateSectionInput(idx, e.target.value)}
                          className="flex-1 bg-white border border-[#ded8ce] rounded-lg px-3 py-1.5 text-xs focus:border-black outline-none font-medium text-brand-primary"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveTemplateSectionInput(idx)}
                          className="text-brand-secondary hover:text-red-500 transition-colors p-1"
                          disabled={templateSectionsInput.length === 1}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex gap-3">
                  {editingTemplateId && (
                    <button
                      type="button"
                      onClick={handleCancelEditTemplate}
                      className="flex-1 border border-[#ded8ce] hover:border-neutral-400 bg-white text-brand-primary text-xs font-bold uppercase tracking-wider py-2.5 rounded-full shadow-sm transition-all"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveTemplate}
                    className="flex-1 bg-[#111] hover:bg-black text-white text-xs font-bold uppercase tracking-wider py-2.5 rounded-full shadow-sm transition-all"
                  >
                    {editingTemplateId ? 'Save Template Changes' : 'Save New Template'}
                  </button>
                </div>

                {/* Generate Recurring Scheduled Meetings (Only when editing a template) */}
                {editingTemplateId && (
                  <div className="border-t border-[#ded8ce]/60 pt-4 mt-2 space-y-3">
                    <h5 className="text-[10px] font-extrabold uppercase tracking-widest text-[#171717]">
                      Generate Recurring Scheduled Meetings
                    </h5>
                    <p className="text-[9px] text-[#666] leading-relaxed">
                      Pre-create scheduled meeting logs for every weekday (Mon - Fri) within a specified date range for this template.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                      <div className="space-y-1">
                        <label className="block text-[8px] font-bold uppercase tracking-widest text-brand-secondary">Start Date</label>
                        <input
                          type="date"
                          value={recurrenceStart}
                          onChange={e => setRecurrenceStart(e.target.value)}
                          className="w-full bg-[#fcfbf9] border border-[#ded8ce] rounded-lg px-2.5 py-1.5 text-xs focus:border-black outline-none font-medium text-brand-primary"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[8px] font-bold uppercase tracking-widest text-brand-secondary">End Date</label>
                        <input
                          type="date"
                          value={recurrenceEnd}
                          onChange={e => setRecurrenceEnd(e.target.value)}
                          className="w-full bg-[#fcfbf9] border border-[#ded8ce] rounded-lg px-2.5 py-1.5 text-xs focus:border-black outline-none font-medium text-brand-primary"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleGenerateRecurringMeetings}
                        disabled={isGeneratingMeetings}
                        className="bg-black hover:bg-neutral-900 text-white text-[10px] font-extrabold uppercase tracking-widest py-2 px-3 rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 h-8"
                      >
                        {isGeneratingMeetings ? 'Generating...' : 'Generate Logs'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-6 bg-brand-bg flex gap-3 border-t border-brand-border sticky bottom-0 z-10">
              <PillButton 
                variant="outline" 
                onClick={() => {
                  setIsTemplateModalOpen(false);
                  handleCancelEditTemplate();
                }} 
                className="w-full justify-center py-2.5"
              >
                Close Manager
              </PillButton>
            </div>

          </div>
        </div>
      )}

      {/* Sync from Google Meet Picker Modal */}
      {isSyncModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#f7f4ef] max-w-[420px] w-full rounded-2xl p-6 shadow-2xl border border-[#ded8ce] flex flex-col gap-5">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="font-serif text-lg text-brand-primary font-bold flex items-center gap-1.5">
                  <Sparkles size={16} className="text-indigo-600 animate-pulse" />
                  Select Google Meet Summary
                </h4>
                <p className="text-[10px] text-brand-secondary mt-1">Found in your connected Google Workspace Drive</p>
              </div>
              <button onClick={() => setIsSyncModalOpen(false)} className="text-brand-secondary hover:text-brand-primary transition-colors bg-white border border-[#ded8ce] rounded-full p-1.5 shadow-sm cursor-pointer">
                <X size={16} />
              </button>
            </div>

            {isSyncing ? (
              <div className="flex flex-col items-center justify-center p-8 gap-3">
                <Loader2 className="animate-spin text-indigo-600 w-8 h-8" />
                <p className="text-xs font-bold text-indigo-950 uppercase tracking-widest">Syncing Gemini summaries...</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                {MOCK_MEETINGS_CATALOG.map(meet => (
                  <div 
                    key={meet.id}
                    onClick={() => handlePerformMeetSync(meet)}
                    className="p-4 bg-white rounded-[14px] border border-[#ded8ce] hover:border-indigo-500 hover:bg-indigo-50/20 cursor-pointer transition-all flex flex-col gap-2 group"
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-serif text-xs font-black text-brand-primary group-hover:text-indigo-600 transition-colors leading-snug">{meet.title}</span>
                    </div>
                    <p className="text-[10px] text-brand-secondary line-clamp-1">{meet.summary}</p>
                    <div className="flex justify-between items-center text-[8px] font-bold text-brand-secondary border-t border-[#ded8ce]/30 pt-2 mt-1 uppercase tracking-wider">
                      <span className="flex items-center gap-1"><Clock size={10} /> {meet.date}</span>
                      <span>{meet.attendees.length} present</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Capacity Check-in Popup Modal */}
      {isCheckinModalOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#f7f4ef] max-w-[650px] w-full rounded-2xl p-6 md:p-8 border border-[#ded8ce] my-auto shadow-2xl flex flex-col gap-6 max-h-[95vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-[#ded8ce] pb-4">
              <div>
                <h2 className="text-xl font-bold text-[#171717] tracking-tight font-serif">WOVN Leadership Capacity Score</h2>
                <p className="text-[11px] text-[#666] leading-relaxed mt-1">
                  Use this daily to create a shared language around workload, stress, availability, and execution friction. 
                  The target operating zone is <span className="font-bold text-[#171717]">5–6</span>.
                </p>
              </div>
              <button 
                onClick={() => {
                  setDismissedMeetingCheckinId(selectedMeeting.id);
                  setIsCheckinModalOpen(false);
                }} 
                className="text-brand-secondary hover:text-[#111] transition-colors p-1 bg-white border border-[#ded8ce] rounded-full"
                title="Dismiss check-in"
              >
                <X size={18} />
              </button>
            </div>

            {/* Sliders Card */}
            <div className="bg-white border border-[#ded8ce] rounded-[18px] p-6 space-y-6 shadow-sm">
              {/* Workload */}
              <div className="space-y-2">
                <div className="flex justify-between items-baseline">
                  <label className="font-bold text-sm text-[#171717]">1. Workload Volume</label>
                  <span className="text-sm font-extrabold text-[#171717]">{myWorkload}</span>
                </div>
                <p className="text-[11px] text-[#666] leading-snug">How full is your plate today? 1 = light / open capacity. 10 = too many active responsibilities.</p>
                <input 
                  type="range" min="1" max="10" 
                  value={myWorkload} 
                  onChange={e => setMyWorkload(Number(e.target.value))}
                  className="w-full accent-[#111111] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-[#666] px-0.5 font-bold">
                  <span>Light</span>
                  <span>Optimal</span>
                  <span>Overloaded</span>
                </div>
              </div>

              {/* Urgency */}
              <div className="space-y-2">
                <div className="flex justify-between items-baseline">
                  <label className="font-bold text-sm text-[#171717]">2. Deadline Pressure</label>
                  <span className="text-sm font-extrabold text-[#171717]">{myUrgency}</span>
                </div>
                <p className="text-[11px] text-[#666] leading-snug">How much deadline pressure are you carrying? 1 = calm. 10 = everything feels urgent.</p>
                <input 
                  type="range" min="1" max="10" 
                  value={myUrgency} 
                  onChange={e => setMyUrgency(Number(e.target.value))}
                  className="w-full accent-[#111111] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-[#666] px-0.5 font-bold">
                  <span>Calm</span>
                  <span>Managed</span>
                  <span>Critical</span>
                </div>
              </div>

              {/* Stress */}
              <div className="space-y-2">
                <div className="flex justify-between items-baseline">
                  <label className="font-bold text-sm text-[#171717]">3. Stress Load</label>
                  <span className="text-sm font-extrabold text-[#171717]">{myStress}</span>
                </div>
                <p className="text-[11px] text-[#666] leading-snug">How mentally/emotionally taxed are you? 1 = clear and calm. 10 = overwhelmed.</p>
                <input 
                  type="range" min="1" max="10" 
                  value={myStress} 
                  onChange={e => setMyStress(Number(e.target.value))}
                  className="w-full accent-[#111111] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-[#666] px-0.5 font-bold">
                  <span>Calm</span>
                  <span>Engaged</span>
                  <span>Overwhelmed</span>
                </div>
              </div>

              {/* Availability */}
              <div className="space-y-2">
                <div className="flex justify-between items-baseline">
                  <label className="font-bold text-sm text-[#171717]">4. Available Bandwidth</label>
                  <span className="text-sm font-extrabold text-[#171717]">{myAvailability}</span>
                </div>
                <p className="text-[11px] text-[#666] leading-snug">How much room do you have to absorb new requests? 1 = wide open. 10 = no room without dropping something.</p>
                <input 
                  type="range" min="1" max="10" 
                  value={myAvailability} 
                  onChange={e => setMyAvailability(Number(e.target.value))}
                  className="w-full accent-[#111111] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-[#666] px-0.5 font-bold">
                  <span>Available</span>
                  <span>Selective</span>
                  <span>No Room</span>
                </div>
              </div>

              {/* Friction */}
              <div className="space-y-2">
                <div className="flex justify-between items-baseline">
                  <label className="font-bold text-sm text-[#171717]">5. Workflow Friction</label>
                  <span className="text-sm font-extrabold text-[#171717]">{myFriction}</span>
                </div>
                <p className="text-[11px] text-[#666] leading-snug">How much drag is coming from unclear priorities, dependencies, approvals, tools, or blocked decisions?</p>
                <input 
                  type="range" min="1" max="10" 
                  value={myFriction} 
                  onChange={e => setMyFriction(Number(e.target.value))}
                  className="w-full accent-[#111111] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-[#666] px-0.5 font-bold">
                  <span>Smooth</span>
                  <span>Some Drag</span>
                  <span>Blocked</span>
                </div>
              </div>
            </div>

            {/* Results & Actions Card */}
            {(() => {
              const liveScore = Math.round(((myWorkload + myUrgency + myStress + myAvailability + myFriction) / 5) * 10) / 10;
              const getStatusDetails = (s: number) => {
                if (s <= 2.9) return { status: "Underutilized", desc: "More ownership or responsibility can likely be added." };
                if (s <= 4.4) return { status: "Comfortable", desc: "Healthy bandwidth. This person can likely absorb a meaningful new initiative." };
                if (s <= 6.4) return { status: "Optimal Zone", desc: "Fully engaged, priorities are moving, and small-to-medium requests can still be absorbed." };
                if (s <= 8.4) return { status: "Constrained", desc: "Prioritization is required. New work will create tradeoffs." };
                if (s <= 9.4) return { status: "Overloaded", desc: "Something needs to move. Quality, speed, or morale may suffer." };
                return { status: "Unsustainable", desc: "Immediate intervention required. Remove work, reset expectations, or add support." };
              };
              const liveDetails = getStatusDetails(liveScore);

              return (
                <div className="bg-white border border-[#ded8ce] rounded-[18px] p-6 shadow-sm flex flex-col md:flex-row items-center gap-6">
                  {/* Score Circle */}
                  <div className="w-[110px] h-[110px] rounded-full bg-[#f0ebe3] border border-[#ded8ce] flex flex-col items-center justify-center shrink-0">
                    <span className="text-3xl font-black text-[#171717] leading-none tracking-tight">{liveScore.toFixed(1)}</span>
                    <span className="text-[9px] text-[#666] font-bold uppercase tracking-[0.12em] mt-1">Capacity</span>
                  </div>

                  {/* Details & Confidence row */}
                  <div className="flex-1 space-y-4 text-center md:text-left">
                    <div>
                      <h4 className="text-base font-extrabold text-[#171717]">{liveDetails.status}</h4>
                      <p className="text-[11px] text-[#666] leading-relaxed mt-1">{liveDetails.desc}</p>
                    </div>

                    {/* Confidence buttons */}
                    <div className="flex flex-wrap justify-center md:justify-start gap-1.5">
                      {['Green', 'Yellow', 'Red'].map(c => {
                        const isSelected = myConfidence === c;
                        let btnText = '';
                        if (c === 'Green') btnText = 'Green: I can deliver';
                        if (c === 'Yellow') btnText = 'Yellow: tradeoffs';
                        if (c === 'Red') btnText = 'Red: intervention';

                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setMyConfidence(c)}
                            className={`text-[10px] font-bold px-3 py-1.5 border rounded-full transition-all ${
                              isSelected 
                                ? 'bg-[#111] text-white border-[#111]' 
                                : 'bg-white text-[#111] border-[#ded8ce] hover:bg-neutral-50'
                            }`}
                          >
                            {btnText}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Notes & Blockers Card */}
            <div className="bg-white border border-[#ded8ce] rounded-[18px] p-6 shadow-sm space-y-2">
              <label className="font-bold text-sm text-[#171717] block">Notes / blockers / asks</label>
              <textarea
                value={myNotes}
                onChange={e => setMyNotes(e.target.value)}
                placeholder="Example: Need priority call on client deliverables. Blocked on design approval."
                className="w-full min-h-[80px] border border-[#ded8ce] rounded-[14px] p-3 text-xs outline-none focus:border-black transition-colors resize-y font-sans leading-relaxed text-[#171717]"
              />
            </div>

            {/* Footer CTAs */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDismissedMeetingCheckinId(selectedMeeting.id);
                  setIsCheckinModalOpen(false);
                }}
                className="flex-1 bg-white hover:bg-neutral-50 text-[#111] border border-[#ded8ce] text-xs font-bold uppercase tracking-wider py-3 rounded-full shadow-sm transition-all"
              >
                Close
              </button>
              <button
                type="button"
                onClick={async () => {
                  await handleSubmitMyCheckin();
                  setIsCheckinModalOpen(false);
                }}
                className="flex-1 bg-[#111] hover:bg-black text-white text-xs font-bold uppercase tracking-wider py-3 rounded-full shadow-sm transition-all animate-pulse"
              >
                {myExistingCheckin ? 'Update Check-in' : 'Submit Check-in'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Read-Only Capacity Score Detail View Popup */}
      {viewingCheckin && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#f7f4ef] max-w-[600px] w-full rounded-2xl p-6 md:p-8 border border-[#ded8ce] my-auto shadow-2xl flex flex-col gap-6 max-h-[90vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-[#ded8ce] pb-4">
              <div>
                <h3 className="font-serif text-lg font-bold text-brand-primary">{viewingCheckin.memberName}'s Capacity Check-in</h3>
                <p className="text-[10px] text-brand-secondary uppercase font-bold tracking-widest mt-0.5">Submitted Details</p>
              </div>
              <button 
                onClick={() => setViewingCheckin(null)} 
                className="text-brand-secondary hover:text-[#111] transition-colors p-1.5 bg-white border border-[#ded8ce] rounded-full"
              >
                <X size={16} />
              </button>
            </div>

            {/* Read-only Sliders Card */}
            <div className="bg-white border border-[#ded8ce] rounded-[18px] p-6 space-y-5 shadow-sm pointer-events-none">
              {/* Workload */}
              <div className="space-y-1">
                <div className="flex justify-between items-baseline text-xs font-bold text-[#171717]">
                  <span>1. Workload Volume</span>
                  <span>{viewingCheckin.categories?.workload ?? 5}/10</span>
                </div>
                <input 
                  type="range" min="1" max="10" 
                  value={viewingCheckin.categories?.workload ?? 5} 
                  disabled
                  className="w-full accent-neutral-400 cursor-not-allowed"
                />
              </div>

              {/* Urgency */}
              <div className="space-y-1">
                <div className="flex justify-between items-baseline text-xs font-bold text-[#171717]">
                  <span>2. Deadline Pressure</span>
                  <span>{viewingCheckin.categories?.urgency ?? 5}/10</span>
                </div>
                <input 
                  type="range" min="1" max="10" 
                  value={viewingCheckin.categories?.urgency ?? 5} 
                  disabled
                  className="w-full accent-neutral-400 cursor-not-allowed"
                />
              </div>

              {/* Stress */}
              <div className="space-y-1">
                <div className="flex justify-between items-baseline text-xs font-bold text-[#171717]">
                  <span>3. Stress Load</span>
                  <span>{viewingCheckin.categories?.stress ?? 5}/10</span>
                </div>
                <input 
                  type="range" min="1" max="10" 
                  value={viewingCheckin.categories?.stress ?? 5} 
                  disabled
                  className="w-full accent-neutral-400 cursor-not-allowed"
                />
              </div>

              {/* Availability */}
              <div className="space-y-1">
                <div className="flex justify-between items-baseline text-xs font-bold text-[#171717]">
                  <span>4. Available Bandwidth</span>
                  <span>{viewingCheckin.categories?.availability ?? 5}/10</span>
                </div>
                <input 
                  type="range" min="1" max="10" 
                  value={viewingCheckin.categories?.availability ?? 5} 
                  disabled
                  className="w-full accent-neutral-400 cursor-not-allowed"
                />
              </div>

              {/* Friction */}
              <div className="space-y-1">
                <div className="flex justify-between items-baseline text-xs font-bold text-[#171717]">
                  <span>5. Workflow Friction</span>
                  <span>{viewingCheckin.categories?.friction ?? 5}/10</span>
                </div>
                <input 
                  type="range" min="1" max="10" 
                  value={viewingCheckin.categories?.friction ?? 5} 
                  disabled
                  className="w-full accent-neutral-400 cursor-not-allowed"
                />
              </div>
            </div>

            {/* Score Summary Card */}
            <div className="bg-white border border-[#ded8ce] rounded-[18px] p-6 shadow-sm flex items-center gap-6">
              <div className="w-[90px] h-[90px] rounded-full bg-[#f0ebe3] border border-[#ded8ce] flex flex-col items-center justify-center shrink-0">
                <span className="text-2xl font-black text-[#171717] leading-none tracking-tight">{(viewingCheckin.score || 0).toFixed(1)}</span>
                <span className="text-[8px] text-[#666] font-bold uppercase tracking-[0.12em] mt-0.5">Capacity</span>
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-[#171717]">{viewingCheckin.status}</h4>
                <div className="mt-2">
                  <span className={`text-[10px] font-bold px-3 py-1 border rounded-full ${
                    viewingCheckin.confidence === 'Green' 
                      ? 'bg-green-50 text-green-700 border-green-200' 
                      : viewingCheckin.confidence === 'Yellow'
                        ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    Confidence: {viewingCheckin.confidence}
                  </span>
                </div>
              </div>
            </div>

            {/* Notes / Blockers */}
            <div className="bg-white border border-[#ded8ce] rounded-[18px] p-5 shadow-sm space-y-2">
              <span className="text-xs font-bold text-[#171717] block">Notes & Blockers</span>
              <p className="text-xs text-[#555] bg-[#f7f4ef]/40 border border-brand-border/40 p-3 rounded-lg italic leading-relaxed whitespace-pre-wrap font-sans">
                "{viewingCheckin.notes || 'No blockers or notes reported.'}"
              </p>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => setViewingCheckin(null)}
              className="w-full bg-[#111] hover:bg-black text-white text-xs font-bold uppercase tracking-wider py-3 rounded-full shadow-sm transition-all"
            >
              Close Details
            </button>

          </div>
        </div>
      )}

    </div>
  );
}
