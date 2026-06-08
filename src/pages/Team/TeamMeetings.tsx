import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
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
  Search
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


const parseGeminiNotes = (text: string) => {
  const lines = text.split('\n').map(l => l.trim());
  let parsedTitle = '';
  let parsedDate = new Date().toISOString().split('T')[0];
  const actionItems: any[] = [];

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

    const actionMatch = line.match(/^[-*+]\s+(.*)/) || line.match(/^\d+\.\s+(.*)/);
    if (actionMatch) {
      const itemText = actionMatch[1];
      if (!itemText.toLowerCase().includes('action item') && !itemText.toLowerCase().includes('todo') && !itemText.startsWith('[ ]') && !itemText.startsWith('[x]')) {
        actionItems.push({ text: itemText, completed: false });
      }
    }
  });

  return {
    title: parsedTitle || `Gemini Meeting Notes - ${new Date(parsedDate).toLocaleDateString()}`,
    date: parsedDate,
    notes: text,
    summary: lines.filter(l => l && !l.startsWith('#')).slice(0, 2).join(' ').substring(0, 120) + '...',
    actionItems
  };
};

export function TeamMeetings() {
  const { userData } = useAuth();
  const [meetings, setMeetings] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal toggle states
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isParsingText, setIsParsingText] = useState(false);
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
  const [isEditingMyCheckin, setIsEditingMyCheckin] = useState(false);

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

  // Pre-select all team members by default when opening the New Meeting modal
  useEffect(() => {
    if (isNewModalOpen && teamMembers.length > 0) {
      setNewAttendees(teamMembers.map(m => m.name));
    }
  }, [isNewModalOpen, teamMembers]);

  // Sync logged in user's capacity sliders with their existing check-in score
  useEffect(() => {
    if (selectedMeeting && userData) {
      const existing = selectedMeeting.capacityScores?.find(
        (c: any) => c.memberName === userData.name || c.memberId === userData.id
      );
      if (existing) {
        setMyWorkload(existing.categories?.workload ?? 5);
        setMyUrgency(existing.categories?.urgency ?? 5);
        setMyStress(existing.categories?.stress ?? 5);
        setMyAvailability(existing.categories?.availability ?? 5);
        setMyFriction(existing.categories?.friction ?? 5);
        setMyConfidence(existing.confidence ?? 'Green');
        setMyNotes(existing.notes ?? '');
        setIsEditingMyCheckin(false);
      } else {
        // Reset to default
        setMyWorkload(5);
        setMyUrgency(5);
        setMyStress(5);
        setMyAvailability(5);
        setMyFriction(5);
        setMyConfidence('Green');
        setMyNotes('');
        setIsEditingMyCheckin(false);
      }
    }
  }, [selectedMeeting, userData]);

  // Fetch users and meetings from Firestore
  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const list: any[] = [];
      snap.forEach(d => {
        const data = d.data();
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

      // Select first meeting by default if none selected
      if (list.length > 0 && !selectedMeeting) {
        setSelectedMeeting(list[0]);
      }
    });

    return () => {
      unsubUsers();
      unsubMeetings();
    };
  }, []);

  // Fetch meeting templates and seed defaults if empty
  useEffect(() => {
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
      memberId: userData.id,
      memberName: userData.name || 'Unknown Member',
      score,
      status: getStatus(score),
      confidence: myConfidence,
      notes: myNotes.trim() || 'No blockers noted.',
      categories: {
        workload: myWorkload,
        urgency: myUrgency,
        stress: myStress,
        availability: myAvailability,
        friction: myFriction
      }
    };

    try {
      const existingScores = selectedMeeting.capacityScores || [];
      const updatedScores = [
        ...existingScores.filter((c: any) => c.memberName !== userData.name && c.memberId !== userData.id),
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

      setIsEditingMyCheckin(false);
    } catch (err) {
      console.error("Failed to submit capacity check-in", err);
      alert("Failed to save check-in. Please try again.");
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
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'meetingTemplates'), payload);
      
      // Reset form fields
      setTemplateNameInput('');
      setTemplateAttendeesInput([]);
      setTemplateSectionsInput(['']);
      alert("Template saved successfully!");
    } catch (err) {
      console.error("Failed to save template", err);
      alert("Failed to save template. Please try again.");
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    const confirmed = window.confirm("Are you sure you want to delete this template? Everyday meetings using this template will not be deleted, but the template structure will be removed.");
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'meetingTemplates', templateId));
    } catch (err) {
      console.error("Failed to delete template", err);
    }
  };

  const handleSaveMeeting = async () => {
    if (!newTitle.trim()) {
      alert("Please enter a meeting title.");
      return;
    }

    try {
      const finalSections = selectedTemplateId 
        ? meetingSections 
        : [{ name: 'Discussion Notes', notes: newNotes.trim() || 'No detailed notes.' }];
      
      const finalNotes = selectedTemplateId
        ? meetingSections.map(s => `## ${s.name}\n${s.notes}`).join('\n\n')
        : newNotes.trim() || 'No detailed notes.';

      const payload = {
        title: newTitle.trim(),
        date: newDate,
        createdAt: new Date().toISOString(),
        summary: newSummary.trim() || 'Weekly sync meeting.',
        notes: finalNotes,
        sections: finalSections,
        templateId: selectedTemplateId || '',
        templateName: selectedTemplateId ? (templates.find(t => t.id === selectedTemplateId)?.name || '') : '',
        attendees: newAttendees,
        actionItems: newActionItems,
        capacityScores: capacityCheckins,
        totalAmount: Math.round((capacityCheckins.reduce((sum: number, c: any) => sum + (c.score || 0), 0) / (capacityCheckins.length || 1)) * 10) / 10
      };

      await addDoc(collection(db, 'meetings'), payload);
      
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

  // Perform manual Gemini copy-paste parsing
  const handlePerformManualParse = () => {
    if (!rawPasteText.trim()) return;
    const parsed = parseGeminiNotes(rawPasteText);
    setNewTitle(parsed.title);
    setNewDate(parsed.date);
    setNewSummary(parsed.summary);
    setNewNotes(parsed.notes);
    setNewActionItems(parsed.actionItems);
    setRawPasteText('');
    setIsParsingText(false);
  };

  const filteredMeetings = meetings.filter(m => 
    m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.notes.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.summary.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
    templates.forEach(t => {
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start animate-in fade-in zoom-in-95 duration-300">
      
      {/* Left Column: Meetings Sidebar List */}
      <div className="lg:col-span-1 flex flex-col gap-4">
        <div className="bg-white p-4 rounded-card border border-brand-border shadow-sm flex flex-col gap-3">
          <div className="flex justify-between items-center gap-2">
            <h2 className="font-serif text-base font-bold text-brand-primary">Meetings Log</h2>
            <div className="flex gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(true)}
                className="py-1 px-2.5 text-[10px] font-bold border border-brand-border rounded-full hover:bg-neutral-50 flex items-center gap-1 transition-all h-8 text-brand-primary"
                title="Manage Templates"
              >
                Templates
              </button>
              <PillButton 
                variant="filled" 
                onClick={() => setIsNewModalOpen(true)}
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
              className="w-full bg-brand-bg border border-transparent rounded-lg pl-9 pr-4 py-2 text-xs focus:bg-white focus:border-brand-primary outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="p-8 text-center text-xs text-brand-secondary">Loading meetings...</div>
          ) : filteredMeetings.length === 0 ? (
            <div className="bg-white p-8 rounded-card border border-brand-border text-center text-xs text-brand-secondary">
              No meetings recorded.
            </div>
          ) : (
            (() => {
              const grouped = getGroupedMeetings();
              return Object.entries(grouped).map(([groupId, group]) => {
                if (group.meetings.length === 0) return null;
                const isExpanded = expandedTemplates[groupId] !== false;
                return (
                  <div key={groupId} className="flex flex-col gap-2 border-b border-brand-border/30 pb-3 last:border-0 last:pb-0">
                    <button
                      onClick={() => toggleTemplateExpansion(groupId)}
                      className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-brand-secondary hover:text-brand-primary transition-colors py-1 px-1.5 w-full text-left"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="text-neutral-400 font-sans">📁</span>
                        {group.name} ({group.meetings.length})
                      </span>
                      <span className="text-[9px]">{isExpanded ? '▼' : '►'}</span>
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
                              className={`p-3.5 rounded-card border transition-all cursor-pointer bg-white flex flex-col gap-2 shadow-sm ${isActive ? 'border-brand-primary ring-1 ring-brand-primary' : 'border-brand-border hover:border-neutral-400'}`}
                            >
                              <div className="flex justify-between items-start gap-2">
                                <h3 className="font-serif text-xs font-bold text-brand-primary line-clamp-1">{meet.title}</h3>
                                {hasCheckins && (
                                  <span className={`text-[9px] font-black border px-1.5 py-0.5 rounded-full shrink-0 ${getScoreColor(avgScore)}`}>
                                    {avgScore.toFixed(1)}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-brand-secondary line-clamp-2 leading-relaxed">{meet.summary}</p>
                              
                              <div className="flex justify-between items-center text-[9px] text-brand-secondary border-t border-brand-border/50 pt-2 mt-1">
                                <span className="flex items-center gap-1 font-medium"><Calendar size={9} /> {new Date(meet.date).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}</span>
                                <span>{meet.actionItems?.length || 0} tasks</span>
                              </div>
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
      <div className="lg:col-span-2">
        {selectedMeeting ? (
          <div className="bg-white p-6 md:p-8 rounded-card border border-brand-border shadow-sm flex flex-col gap-6 animate-in fade-in duration-300">
            
            {/* Detail Header */}
            <div className="flex justify-between items-start border-b border-brand-border pb-6 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-brand-secondary uppercase tracking-widest">
                  <Calendar size={12} />
                  <span>{new Date(selectedMeeting.date).toLocaleDateString(undefined, {weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'})}</span>
                </div>
                <h1 className="font-serif text-2xl md:text-3xl text-brand-primary leading-tight">{selectedMeeting.title}</h1>
                
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
              <button 
                onClick={() => handleDeleteMeeting(selectedMeeting.id)}
                className="text-brand-secondary hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-lg shrink-0"
                title="Delete Meeting Log"
              >
                <Trash2 size={16} />
              </button>
            </div>

            {/* Capacity Score Circle (Integrated Call Score) */}
            {selectedMeeting.capacityScores && selectedMeeting.capacityScores.length > 0 ? (
              <div className="bg-brand-bg/25 border border-brand-border rounded-2xl p-6 flex flex-col md:flex-row gap-6 items-center">
                {/* Visual Score Badge */}
                {(() => {
                  const scores = selectedMeeting.capacityScores;
                  const total = scores.reduce((sum: number, c: any) => sum + (c.score || 0), 0);
                  const avg = Math.round((total / scores.length) * 10) / 10;
                  
                  const getStatusDetails = (s: number) => {
                    if (s <= 2.9) return { status: "Underutilized", desc: "Healthy resource availability. More initiatives can be added.", style: "border-green-300 bg-green-500 text-white" };
                    if (s <= 4.4) return { status: "Comfortable", desc: "Stable team load. Ready to absorb new projects as needed.", style: "border-green-300 bg-green-600 text-white" };
                    if (s <= 6.4) return { status: "Optimal Zone", desc: "Fully engaged, moving priorities, and keeping small backlogs.", style: "border-indigo-300 bg-indigo-600 text-white" };
                    if (s <= 8.4) return { status: "Constrained", desc: "Prioritisation required. Adding new goals will force tradeoffs.", style: "border-amber-300 bg-amber-600 text-white" };
                    if (s <= 9.4) return { status: "Overloaded", desc: "Action required. Team performance and morale may suffer.", style: "border-red-300 bg-red-500 text-white" };
                    return { status: "Unsustainable", desc: "Immediate support needed. Remove friction and shift tasks.", style: "border-red-300 bg-red-700 text-white animate-pulse" };
                  };

                  const details = getStatusDetails(avg);

                  return (
                    <>
                      <div className={`w-28 h-28 rounded-full border-4 flex flex-col justify-center items-center shrink-0 ${details.style}`}>
                        <span className="text-3xl font-black tracking-tight">{avg.toFixed(1)}</span>
                        <span className="text-[8px] uppercase font-bold tracking-widest opacity-80">Capacity</span>
                      </div>
                      <div className="flex-1 text-center md:text-left space-y-1">
                        <h3 className="font-bold text-brand-primary text-base flex items-center justify-center md:justify-start gap-2">
                          Team Capacity Status: 
                          <span className="underline decoration-dotted decoration-indigo-500 underline-offset-4">{details.status}</span>
                        </h3>
                        <p className="text-xs text-brand-secondary leading-relaxed max-w-md">{details.desc}</p>
                        <p className="text-[10px] text-brand-secondary font-medium">Aggregated across {scores.length} members checked in prior to this call.</p>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : null}

            {/* Live Capacity Check-in Section */}
            {isTagged && (
              <div className="flex flex-col gap-6 p-6 rounded-2xl bg-[#f7f4ef]/80 border border-[#ded8ce] animate-in fade-in duration-300">
                {(!myExistingCheckin || isEditingMyCheckin) ? (
                  <div className="space-y-6">
                    {/* Header */}
                    <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-xl font-bold text-[#171717] tracking-tight">WOVN Leadership Capacity Score</h2>
                        <p className="text-[11px] text-[#666] leading-relaxed mt-1">
                          Use this daily to create a shared language around workload, stress, availability, and execution friction. 
                          The target operating zone is <span className="font-bold text-[#171717]">5–6</span>: fully engaged, moving priorities, and still able to absorb meaningful work.
                        </p>
                      </div>
                      {myExistingCheckin && (
                        <button 
                          onClick={() => setIsEditingMyCheckin(false)}
                          className="text-xs font-bold text-[#111] hover:underline bg-white border border-[#ded8ce] rounded-full px-3.5 py-1.5 shadow-sm shrink-0"
                        >
                          Cancel Update
                        </button>
                      )}
                    </div>

                    {/* Card 1: Sliders */}
                    <div className="bg-white border border-[#ded8ce] rounded-[18px] p-6 space-y-6 shadow-sm">
                      {/* Workload */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-baseline">
                          <label className="font-bold text-sm text-[#171717]">1. Workload Volume</label>
                          <span className="text-sm font-extrabold text-[#171717]">{myWorkload}</span>
                        </div>
                        <p className="text-[11px] text-[#666] leading-snug">How full is your plate today? 1 = light / open capacity. 10 = too many active responsibilities.</p>
                        <input 
                          type="range" 
                          min="1" 
                          max="10" 
                          value={myWorkload} 
                          onChange={e => setMyWorkload(Number(e.target.value))}
                          className="w-full accent-[#111111] cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-[#666] px-0.5">
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
                          type="range" 
                          min="1" 
                          max="10" 
                          value={myUrgency} 
                          onChange={e => setMyUrgency(Number(e.target.value))}
                          className="w-full accent-[#111111] cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-[#666] px-0.5">
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
                          type="range" 
                          min="1" 
                          max="10" 
                          value={myStress} 
                          onChange={e => setMyStress(Number(e.target.value))}
                          className="w-full accent-[#111111] cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-[#666] px-0.5">
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
                          type="range" 
                          min="1" 
                          max="10" 
                          value={myAvailability} 
                          onChange={e => setMyAvailability(Number(e.target.value))}
                          className="w-full accent-[#111111] cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-[#666] px-0.5">
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
                          type="range" 
                          min="1" 
                          max="10" 
                          value={myFriction} 
                          onChange={e => setMyFriction(Number(e.target.value))}
                          className="w-full accent-[#111111] cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-[#666] px-0.5">
                          <span>Smooth</span>
                          <span>Some Drag</span>
                          <span>Blocked</span>
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Results & Actions */}
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
                          <div className="w-[130px] h-[130px] rounded-full bg-[#f0ebe3] border border-[#ded8ce] flex flex-col items-center justify-center shrink-0">
                            <span className="text-4xl font-black text-[#171717] leading-none tracking-tight">{liveScore.toFixed(1)}</span>
                            <span className="text-[10px] text-[#666] font-bold uppercase tracking-[0.12em] mt-1">Capacity</span>
                          </div>

                          {/* Details & Confidence row */}
                          <div className="flex-1 space-y-4 text-center md:text-left">
                            <div>
                              <h4 className="text-lg font-extrabold text-[#171717]">{liveDetails.status}</h4>
                              <p className="text-xs text-[#666] leading-relaxed mt-1">{liveDetails.desc}</p>
                            </div>

                            {/* Confidence buttons */}
                            <div className="flex flex-wrap justify-center md:justify-start gap-2">
                              {['Green', 'Yellow', 'Red'].map(c => {
                                const isSelected = myConfidence === c;
                                let btnText = '';
                                if (c === 'Green') btnText = 'Green: I can deliver';
                                if (c === 'Yellow') btnText = 'Yellow: tradeoffs needed';
                                if (c === 'Red') btnText = 'Red: intervention needed';

                                return (
                                  <button
                                    key={c}
                                    type="button"
                                    onClick={() => setMyConfidence(c)}
                                    className={`text-[11px] font-bold px-4 py-2 border rounded-full transition-all ${
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

                            {/* Main CTA buttons */}
                            <div className="flex flex-wrap justify-center md:justify-start gap-2 pt-2 border-t border-brand-border/40">
                              <button
                                type="button"
                                onClick={handleSubmitMyCheckin}
                                className="bg-[#111] hover:bg-black text-white text-[11px] font-extrabold px-6 py-2.5 rounded-full shadow-sm transition-colors"
                              >
                                {myExistingCheckin ? 'Update Pre-Meeting Check-in' : 'Submit Pre-Meeting Check-in'}
                              </button>
                              {myExistingCheckin && (
                                <button
                                  type="button"
                                  onClick={() => setIsEditingMyCheckin(false)}
                                  className="bg-white text-[#111] border border-[#ded8ce] hover:bg-neutral-50 text-[11px] font-extrabold px-6 py-2.5 rounded-full transition-colors"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Card 3: Notes & Blockers */}
                    <div className="bg-white border border-[#ded8ce] rounded-[18px] p-6 shadow-sm space-y-2">
                      <label className="font-bold text-sm text-[#171717] block">Notes / blockers / asks</label>
                      <p className="text-[11px] text-[#666]">Use this to capture what needs to change today.</p>
                      <textarea
                        value={myNotes}
                        onChange={e => setMyNotes(e.target.value)}
                        placeholder="Example: Need priority call on client deliverables vs platform sprint. Waiting on design approval before production handoff."
                        className="w-full min-h-[90px] border border-[#ded8ce] rounded-[14px] p-3.5 text-xs outline-none focus:border-black transition-colors resize-y font-sans leading-relaxed text-[#171717]"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border border-[#ded8ce] rounded-[18px] p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#111] flex items-center justify-center text-white font-bold text-xs shrink-0">✓</div>
                      <div>
                        <p className="text-xs font-extrabold text-[#171717]">You've checked in for this meeting</p>
                        <p className="text-[10px] text-[#666] font-medium mt-0.5">
                          Score: <span className="font-bold text-[#171717]">{myExistingCheckin.score.toFixed(1)}</span> ({myExistingCheckin.status}) • Confidence: <span className={`font-bold text-xs ${myExistingCheckin.confidence === 'Green' ? 'text-green-700' : myExistingCheckin.confidence === 'Yellow' ? 'text-yellow-700' : 'text-red-700'}`}>{myExistingCheckin.confidence}</span>
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setIsEditingMyCheckin(true)}
                      className="text-xs font-bold text-[#111] bg-white border border-[#ded8ce] hover:border-neutral-400 px-3.5 py-1.5 rounded-full transition-all shadow-sm shrink-0"
                    >
                      Update Your Check-in
                    </button>
                  </div>
                )}
              </div>
            )}

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
                      selectedMeeting.capacityScores.map((c: any) => (
                        <div key={c.memberId} className="border border-brand-border p-4 rounded-xl bg-white flex flex-col gap-3 shadow-sm">
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
                            <p className="text-[10px] text-brand-secondary bg-brand-bg p-2 rounded-lg italic line-clamp-2">
                              "{c.notes}"
                            </p>
                          )}
                          {/* Categories details */}
                          {c.categories && (
                            <div className="grid grid-cols-5 gap-1 text-center border-t border-brand-border/50 pt-2 text-[8px] font-bold text-brand-secondary">
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
                                <div>FRC</div>
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
                <div className="border border-brand-border rounded-xl p-4 flex flex-col gap-2 bg-brand-bg/10">
                  {(!selectedMeeting.actionItems || selectedMeeting.actionItems.length === 0) ? (
                    <div className="text-xs text-brand-secondary italic p-2">No action items recorded for this meeting.</div>
                  ) : (
                    selectedMeeting.actionItems.map((item: any, idx: number) => (
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
                    ))
                  )}
                </div>
              </div>

              {/* Full Notes Markdown */}
              <div className="flex flex-col gap-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-brand-secondary">
                  {selectedMeeting.sections && selectedMeeting.sections.length > 0 ? 'Meeting Sections & Notes' : 'Discussion Notes'}
                </h3>
                <div className="border border-brand-border rounded-xl p-4 bg-brand-bg/5 max-h-[350px] overflow-y-auto custom-scrollbar flex flex-col gap-4">
                  {selectedMeeting.sections && selectedMeeting.sections.length > 0 ? (
                    selectedMeeting.sections.map((sec: any, idx: number) => (
                      <div key={idx} className="border-b border-brand-border/30 last:border-0 pb-3 last:pb-0">
                        <h4 className="font-bold text-xs text-brand-primary mb-1 uppercase tracking-wider">{sec.name}</h4>
                        <p className="text-xs text-[#222] leading-relaxed whitespace-pre-wrap font-sans">
                          {sec.notes || <span className="italic text-neutral-400">No notes written for this section.</span>}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="prose prose-sm max-w-none text-brand-primary text-xs leading-relaxed whitespace-pre-wrap font-sans">
                      {selectedMeeting.notes}
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>
        ) : (
          <div className="bg-white p-12 text-center text-brand-secondary border border-brand-border rounded-card shadow-sm flex flex-col justify-center items-center min-h-[40vh] gap-3">
            <FileText size={40} className="text-brand-secondary/40" />
            <h3 className="font-serif text-lg font-bold text-brand-primary">No Meeting Selected</h3>
            <p className="text-xs text-brand-secondary max-w-xs mx-auto">Select a meeting log from the sidebar or click "Record Meeting" to construct a new report.</p>
          </div>
        )}
      </div>

      {/* Record New Meeting Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-brand-bg max-w-[95vw] lg:max-w-[1000px] w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-brand-border my-auto">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-brand-border flex justify-between items-center bg-white sticky top-0 z-10">
              <div>
                <h3 className="font-serif text-xl text-brand-primary">Record Meeting Minutes</h3>
                <p className="text-xs font-medium text-brand-secondary mt-1">Date, record check-in scores, and write or import your discussions.</p>
              </div>
              <button 
                onClick={() => setIsNewModalOpen(false)} 
                className="text-brand-secondary hover:text-brand-primary transition-colors bg-brand-bg border border-brand-border rounded-md p-1"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-y-auto custom-scrollbar max-h-[70vh] bg-white">
              
              {/* Left Column: Basic Details & Action Items */}
              <div className="lg:col-span-2 flex flex-col gap-5">
                
                {/* Form Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-3">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5">Meeting Template Selection</label>
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
                          }
                        } else {
                          // Reset to custom
                          setMeetingSections([]);
                        }
                      }}
                      className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-xs focus:border-brand-primary outline-none cursor-pointer font-bold text-brand-primary"
                    >
                      <option value="">-- Custom / Ad-hoc Meeting --</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5">Meeting Title</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Weekly Sync"
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-3 py-2 text-xs focus:border-brand-primary outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5">Date</label>
                    <input 
                      type="date" 
                      value={newDate}
                      onChange={e => setNewDate(e.target.value)}
                      className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-3 py-2 text-xs focus:border-brand-primary outline-none"
                    />
                  </div>
                </div>

                {/* Gemini AI Integrator Section */}
                <div className="border border-indigo-100 bg-indigo-50/30 rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-indigo-900 flex items-center gap-1.5">
                      <Sparkles size={14} className="text-indigo-600 animate-pulse" />
                      Google Meet & Gemini AI Integrator
                    </span>
                    <button 
                      onClick={() => setIsSyncModalOpen(true)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-colors shadow-sm flex items-center gap-1"
                    >
                      <Plus size={10} /> Sync Google Meet
                    </button>
                  </div>
                  <p className="text-[10px] text-indigo-950 leading-relaxed">
                    Instantly sync Gemini-generated summaries and checklists from your Google Meet, or paste them manually below.
                  </p>
                  
                  {isParsingText ? (
                    <div className="flex flex-col gap-2 animate-in fade-in duration-200">
                      <textarea 
                        placeholder="Paste your Gemini meeting notes summary here... (bullet points will be extracted as action items)"
                        value={rawPasteText}
                        onChange={e => setRawPasteText(e.target.value)}
                        className="text-xs"
                      />
                      <div className="flex gap-2 justify-end">
                        <PillButton variant="outline" className="py-1 px-3 text-[10px]" onClick={() => setIsParsingText(false)}>Cancel</PillButton>
                        <PillButton variant="filled" className="py-1 px-3 text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white border-transparent" onClick={handlePerformManualParse}>Parse Notes</PillButton>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setIsParsingText(true)}
                      className="border border-dashed border-indigo-200 bg-white hover:bg-indigo-50/50 rounded-lg py-2.5 text-center text-[10px] font-bold text-indigo-600 transition-colors"
                    >
                      + Paste & Parse Gemini Notes Text
                    </button>
                  )}
                </div>

                {/* Summary & Discussion notes */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5">Brief Summary</label>
                    <input 
                      type="text" 
                      placeholder="Enter a brief high-level sentence summarizing outcomes"
                      value={newSummary}
                      onChange={e => setNewSummary(e.target.value)}
                      className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-3 py-2 text-xs focus:border-brand-primary outline-none"
                    />
                  </div>

                  {selectedTemplateId ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary">Meeting Sections</label>
                        <button
                          type="button"
                          onClick={() => {
                            setMeetingSections(prev => [...prev, { name: 'New Section', notes: '' }]);
                          }}
                          className="text-[10px] font-bold text-black border border-[#ded8ce] rounded-full px-3 py-1 hover:bg-neutral-50 shadow-sm"
                        >
                          + Add Section
                        </button>
                      </div>

                      {meetingSections.map((sec, idx) => (
                        <div key={idx} className="border border-[#ded8ce] rounded-xl p-4 bg-[#f7f4ef]/30 flex flex-col gap-2 relative shadow-sm">
                          <div className="flex justify-between items-center gap-2">
                            <input
                              type="text"
                              value={sec.name}
                              onChange={e => {
                                const newSecs = [...meetingSections];
                                newSecs[idx].name = e.target.value;
                                setMeetingSections(newSecs);
                              }}
                              className="bg-transparent border-b border-transparent hover:border-brand-border focus:border-brand-primary font-bold text-xs text-brand-primary outline-none py-0.5"
                              placeholder="Section Name"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setMeetingSections(prev => prev.filter((_, i) => i !== idx));
                              }}
                              className="text-brand-secondary hover:text-red-500 transition-colors p-1"
                              title="Remove Section"
                            >
                              <X size={12} />
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
                            className="w-full bg-white border border-brand-border rounded-lg px-3 py-2 text-xs focus:border-brand-primary outline-none min-h-[80px]"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1.5">Meeting Discussion / Notes</label>
                      <textarea 
                        placeholder="Write comprehensive meeting notes, topics discussed, or copy-paste detailed logs here..."
                        value={newNotes}
                        onChange={e => setNewNotes(e.target.value)}
                        className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-3 py-2 text-xs focus:border-brand-primary outline-none min-h-[120px]"
                      />
                    </div>
                  )}
                </div>

                {/* Attendees Comma Field / Select */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary">Attendees Present</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setNewAttendees(teamMembers.map(m => m.name))}
                        className="text-[9px] text-brand-primary hover:underline font-bold"
                      >
                        Select All
                      </button>
                      <span className="text-[9px] text-brand-secondary">•</span>
                      <button
                        type="button"
                        onClick={() => setNewAttendees([])}
                        className="text-[9px] text-brand-secondary hover:text-brand-primary hover:underline font-bold"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 p-2 bg-brand-bg/40 border border-brand-border rounded-lg min-h-[40px]">
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
                          className={`text-[10px] px-2.5 py-1 rounded-full font-bold border transition-colors ${isSelected ? 'bg-black text-white border-black' : 'bg-white text-brand-primary border-brand-border hover:border-neutral-400'}`}
                        >
                          {member.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Action Items construction */}
                <div className="space-y-3">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary">Construct Action Items</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      id="itemInput"
                      placeholder="e.g. Write platform unit tests (Bob)"
                      className="flex-1 bg-brand-bg/50 border border-brand-border rounded-lg px-3 py-2 text-xs focus:border-brand-primary outline-none"
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
                      className="py-2 text-[10px]"
                    >
                      Add
                    </PillButton>
                  </div>

                  {newActionItems.length > 0 && (
                    <div className="border border-brand-border rounded-xl p-3 flex flex-col gap-2 max-h-[150px] overflow-y-auto custom-scrollbar">
                      {newActionItems.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-brand-bg/50 p-2 rounded-lg border border-brand-border/30">
                          <span className="text-[10px] text-brand-primary font-medium">{item.text}</span>
                          <button onClick={() => handleRemoveActionItemInput(idx)} className="text-brand-secondary hover:text-red-500 transition-colors p-1">
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              {/* Right Column: Pre-Meeting Capacity Check-in (Call Score Sliders) */}
              <div className="lg:col-span-1 border-l lg:border-l border-brand-border pl-0 lg:pl-6 flex flex-col gap-5">
                <div>
                  <h4 className="text-xs font-bold text-brand-primary border-b border-brand-border pb-2 mb-3 flex items-center gap-1.5">
                    <UserPlus size={14} className="text-brand-secondary" />
                    Capacity Check-in (Call Score)
                  </h4>
                  <p className="text-[10px] text-brand-secondary leading-relaxed mb-4">
                    Have team members record their scores before starting the meeting.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-widest text-brand-secondary mb-1">Select Member</label>
                      <select 
                        value={checkinMemberId}
                        onChange={e => setCheckinMemberId(e.target.value)}
                        className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-3 py-2 text-xs focus:border-brand-primary outline-none cursor-pointer font-medium"
                      >
                        <option value="">-- Choose Member --</option>
                        {teamMembers.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Capacity sliders */}
                    {checkinMemberId && (
                      <div className="space-y-3 animate-in slide-in-from-top-2 duration-300">
                        {/* Slider 1: Workload */}
                        <div>
                          <div className="flex justify-between text-[9px] font-bold text-brand-primary mb-1">
                            <span>1. Workload Volume</span>
                            <span>{checkinWorkload}/10</span>
                          </div>
                          <input 
                            type="range" min="1" max="10" 
                            value={checkinWorkload} 
                            onChange={e => setCheckinWorkload(parseInt(e.target.value))}
                            className="w-full accent-black h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Slider 2: Urgency */}
                        <div>
                          <div className="flex justify-between text-[9px] font-bold text-brand-primary mb-1">
                            <span>2. Deadline Pressure</span>
                            <span>{checkinUrgency}/10</span>
                          </div>
                          <input 
                            type="range" min="1" max="10" 
                            value={checkinUrgency} 
                            onChange={e => setCheckinUrgency(parseInt(e.target.value))}
                            className="w-full accent-black h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Slider 3: Stress */}
                        <div>
                          <div className="flex justify-between text-[9px] font-bold text-brand-primary mb-1">
                            <span>3. Stress Load</span>
                            <span>{checkinStress}/10</span>
                          </div>
                          <input 
                            type="range" min="1" max="10" 
                            value={checkinStress} 
                            onChange={e => setCheckinStress(parseInt(e.target.value))}
                            className="w-full accent-black h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Slider 4: Availability */}
                        <div>
                          <div className="flex justify-between text-[9px] font-bold text-brand-primary mb-1">
                            <span>4. Available Bandwidth</span>
                            <span>{checkinAvailability}/10</span>
                          </div>
                          <input 
                            type="range" min="1" max="10" 
                            value={checkinAvailability} 
                            onChange={e => setCheckinAvailability(parseInt(e.target.value))}
                            className="w-full accent-black h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Slider 5: Friction */}
                        <div>
                          <div className="flex justify-between text-[9px] font-bold text-brand-primary mb-1">
                            <span>5. Workflow Friction</span>
                            <span>{checkinFriction}/10</span>
                          </div>
                          <input 
                            type="range" min="1" max="10" 
                            value={checkinFriction} 
                            onChange={e => setCheckinFriction(parseInt(e.target.value))}
                            className="w-full accent-black h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Confidence Check-in */}
                        <div>
                          <label className="block text-[9px] font-bold uppercase tracking-widest text-brand-secondary mb-1">Confidence Status</label>
                          <div className="flex gap-2">
                            {['Green', 'Yellow', 'Red'].map(c => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setCheckinConfidence(c)}
                                className={`flex-1 text-[9px] font-bold py-1.5 rounded-lg border transition-all ${checkinConfidence === c ? 'bg-black text-white border-black scale-[1.02]' : 'bg-white border-brand-border text-brand-secondary'}`}
                              >
                                {c}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Notes Check-in */}
                        <div>
                          <label className="block text-[9px] font-bold uppercase tracking-widest text-brand-secondary mb-1">Blockers / Notes</label>
                          <textarea 
                            placeholder="Add specific blocker notes..."
                            value={checkinNotes}
                            onChange={e => setCheckinNotes(e.target.value)}
                            className="w-full bg-brand-bg/50 border border-brand-border rounded-lg p-2 text-xs focus:border-brand-primary outline-none min-h-[60px]"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleAddCheckin}
                          className="w-full bg-black text-white text-[10px] font-bold uppercase tracking-wider py-2 rounded-lg hover:bg-neutral-800 transition-all"
                        >
                          Submit Score check-in
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* List of active checked-in members */}
                {capacityCheckins.length > 0 && (
                  <div className="mt-4 flex flex-col gap-2.5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-brand-secondary">Checked-in Members</span>
                    <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto custom-scrollbar">
                      {capacityCheckins.map(c => (
                        <div key={c.memberId} className="flex justify-between items-center bg-brand-bg p-3 rounded-xl border border-brand-border/40">
                          <div>
                            <div className="font-bold text-xs text-brand-primary">{c.memberName}</div>
                            <div className="text-[9px] text-brand-secondary font-medium mt-0.5">{c.status} ({c.score.toFixed(1)}/10)</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase ${getConfidenceBadge(c.confidence)}`}>
                              {c.confidence}
                            </span>
                            <button onClick={() => handleRemoveCheckin(c.memberId)} className="text-brand-secondary hover:text-red-500 transition-colors p-1">
                              <X size={12} />
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
            <div className="p-6 bg-brand-bg flex gap-3 border-t border-brand-border sticky bottom-0 z-10">
              <PillButton variant="outline" onClick={() => setIsNewModalOpen(false)} className="flex-1 justify-center py-3">
                Cancel
              </PillButton>
              <PillButton variant="filled" onClick={handleSaveMeeting} className="flex-1 justify-center py-3">
                Save Meeting Minutes
              </PillButton>
            </div>
            
          </div>
        </div>
      )}

      {/* Template Manager Modal */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white max-w-[95vw] lg:max-w-[700px] w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-brand-border my-auto max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-brand-border flex justify-between items-center bg-white sticky top-0 z-10">
              <div>
                <h3 className="font-serif text-xl text-brand-primary font-bold">Manage Meeting Templates</h3>
                <p className="text-xs font-medium text-brand-secondary mt-1">Create and manage customized schemas for recurring everyday meetings.</p>
              </div>
              <button 
                onClick={() => setIsTemplateModalOpen(false)} 
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
                      <div key={t.id} className="border border-brand-border rounded-xl p-3.5 bg-brand-bg/10 flex justify-between items-start gap-4 shadow-sm">
                        <div className="space-y-1.5">
                          <h5 className="font-serif font-bold text-xs text-brand-primary">{t.name}</h5>
                          <div className="text-[10px] text-brand-secondary space-y-0.5">
                            <div><span className="font-bold text-brand-primary">Sections:</span> {t.sections?.length || 0} items</div>
                            <div><span className="font-bold text-brand-primary">Default Attendees:</span> {t.attendees?.length || 0} members</div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteTemplate(t.id)}
                          className="text-brand-secondary hover:text-red-600 transition-colors p-1.5 hover:bg-red-50 rounded"
                          title="Delete Template"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Create Template Section */}
              <div className="border border-[#ded8ce] rounded-2xl p-5 bg-[#f7f4ef]/50 space-y-5">
                <h4 className="text-xs font-bold uppercase tracking-widest text-brand-primary border-b border-[#ded8ce] pb-2">Create New Template</h4>
                
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
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  className="w-full bg-[#111] hover:bg-black text-white text-xs font-bold uppercase tracking-wider py-2.5 rounded-full shadow-sm transition-all"
                >
                  Save New Template
                </button>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-6 bg-brand-bg flex gap-3 border-t border-brand-border sticky bottom-0 z-10">
              <PillButton variant="outline" onClick={() => setIsTemplateModalOpen(false)} className="w-full justify-center py-2.5">
                Close Manager
              </PillButton>
            </div>

          </div>
        </div>
      )}

      {/* Sync from Google Meet Picker Modal */}
      {isSyncModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white max-w-[420px] w-full rounded-2xl p-6 shadow-2xl border border-brand-border flex flex-col gap-5">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="font-serif text-lg text-brand-primary font-bold flex items-center gap-1.5">
                  <Sparkles size={16} className="text-indigo-600 animate-pulse" />
                  Select Google Meet Summary
                </h4>
                <p className="text-[10px] text-brand-secondary mt-1">Found in your connected Google Workspace Drive</p>
              </div>
              <button onClick={() => setIsSyncModalOpen(false)} className="text-brand-secondary hover:text-brand-primary transition-colors bg-brand-bg border border-brand-border rounded-md p-1">
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
                    className="p-4 rounded-xl border border-brand-border hover:border-indigo-500 hover:bg-indigo-50/20 cursor-pointer transition-all flex flex-col gap-2 group"
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-serif text-xs font-black text-brand-primary group-hover:text-indigo-600 transition-colors leading-snug">{meet.title}</span>
                    </div>
                    <p className="text-[10px] text-brand-secondary line-clamp-1">{meet.summary}</p>
                    <div className="flex justify-between items-center text-[8px] font-bold text-brand-secondary border-t border-brand-border/30 pt-2 mt-1 uppercase tracking-wider">
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

    </div>
  );
}
