import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Plus, Trash2, Edit2, Search, X, Users, Info, 
  Upload, Check, RefreshCw, ArrowLeft
} from 'lucide-react';

interface TeamMember {
  id: string;
  name: string;
  size: string;
}

const AVAILABLE_SIZES = [
  'YXS', 'YS', 'YM', 'YL', 'YXL',
  'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL',
  'OSFA'
];

const sortSizes = (a: string, b: string) => {
  const orderMap: Record<string, number> = { 
    'yxs': -5, 'ys': -4, 'ym': -3, 'yl': -2, 'yxl': -1,
    'xxs': 1, 'xs': 2, 's': 3, 'm': 4, 'l': 5, 'xl': 6, 'xxl': 7, '2xl': 7, '3xl': 8, '4xl': 9, '5xl': 10, 'osfa': 11, 'os': 12 
  };
  const aKey = a.toLowerCase();
  const bKey = b.toLowerCase();
  const aVal = orderMap[aKey] || 99;
  const bVal = orderMap[bKey] || 99;
  if (aVal !== bVal) return aVal - bVal;
  return a.localeCompare(b);
};

export function PortalRoster() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const { userData } = useAuth();
  const currentCustomerId = customerId || userData?.customerId || 'CUS-001';

  const [roster, setRoster] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSizeFilter, setSelectedSizeFilter] = useState('All');

  // Tab control & Standard Sizing
  const [activeTab, setActiveTab] = useState<'roster' | 'standard'>('roster');
  const [standardOrder, setStandardOrder] = useState<Record<string, number>>({});
  const [isSavingStandard, setIsSavingStandard] = useState(false);

  // Single Member Form
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberSize, setNewMemberSize] = useState('M');
  const [isAdding, setIsAdding] = useState(false);

  // Edit Mode
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingSize, setEditingSize] = useState('M');

  // Bulk Import State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkDefaultSize, setBulkDefaultSize] = useState('M');
  const [importActionType, setImportActionType] = useState<'merge' | 'replace'>('merge');
  const [importPreview, setImportPreview] = useState<TeamMember[]>([]);

  // Real-time listener for customer roster data
  useEffect(() => {
    if (!currentCustomerId) return;
    setLoading(true);
    const unsub = onSnapshot(doc(db, 'customers', currentCustomerId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setRoster(data.teamRoster || []);

        // Populate standard order template
        const loadedStandard = data.standardOrder || {};
        const initialStandard: Record<string, number> = { ...loadedStandard };
        const DEFAULT_STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'OSFA'];
        DEFAULT_STANDARD_SIZES.forEach(s => {
          if (initialStandard[s] === undefined) {
            initialStandard[s] = 0;
          }
        });
        setStandardOrder(initialStandard);
      }
      setLoading(false);
    }, (err) => {
      console.error("Error listening to customer roster:", err);
      setLoading(false);
    });
    return () => unsub();
  }, [currentCustomerId]);

  // Handle single add
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;

    setIsAdding(true);
    const newMember: TeamMember = {
      id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: newMemberName.trim(),
      size: newMemberSize
    };

    const updatedRoster = [...roster, newMember];
    try {
      await updateDoc(doc(db, 'customers', currentCustomerId), {
        teamRoster: updatedRoster
      });
      setNewMemberName('');
      setNewMemberSize('M');
    } catch (err) {
      console.error("Error adding roster member:", err);
      alert("Failed to add member. Please try again.");
    } finally {
      setIsAdding(false);
    }
  };

  // Start editing a row
  const startEdit = (member: TeamMember) => {
    setEditingId(member.id);
    setEditingName(member.name);
    setEditingSize(member.size);
  };

  // Save inline edit
  const handleSaveEdit = async (id: string) => {
    if (!editingName.trim()) return;

    const updatedRoster = roster.map(m => m.id === id ? { ...m, name: editingName.trim(), size: editingSize } : m);
    try {
      await updateDoc(doc(db, 'customers', currentCustomerId), {
        teamRoster: updatedRoster
      });
      setEditingId(null);
    } catch (err) {
      console.error("Error editing roster member:", err);
      alert("Failed to save changes.");
    }
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingId(null);
  };

  // Delete member
  const handleDeleteMember = async (id: string) => {
    if (!confirm("Are you sure you want to remove this team member?")) return;

    const updatedRoster = roster.filter(m => m.id !== id);
    try {
      await updateDoc(doc(db, 'customers', currentCustomerId), {
        teamRoster: updatedRoster
      });
    } catch (err) {
      console.error("Error deleting roster member:", err);
      alert("Failed to remove member.");
    }
  };

  // Parse bulk text whenever it or default size changes
  useEffect(() => {
    if (!bulkText.trim()) {
      setImportPreview([]);
      return;
    }

    const lines = bulkText.split('\n');
    const parsed: TeamMember[] = [];
    
    lines.forEach((line, idx) => {
      const cleanLine = line.trim();
      if (!cleanLine) return;

      let name = cleanLine;
      let size = bulkDefaultSize;

      // Check for comma, tab, or hyphen separator
      const separators = [',', '\t', ' - '];
      let separatorFound = '';
      for (const sep of separators) {
        if (cleanLine.includes(sep)) {
          separatorFound = sep;
          break;
        }
      }

      if (separatorFound) {
        const parts = cleanLine.split(separatorFound);
        const firstPart = parts[0].trim();
        const secondPart = parts.slice(1).join(separatorFound).trim();

        // Check if second part matches a size, else first part might be size?
        const sizeMatch = AVAILABLE_SIZES.find(s => s.toLowerCase() === secondPart.toLowerCase());
        if (sizeMatch) {
          name = firstPart;
          size = sizeMatch;
        } else {
          const sizeMatchFirst = AVAILABLE_SIZES.find(s => s.toLowerCase() === firstPart.toLowerCase());
          if (sizeMatchFirst) {
            name = secondPart;
            size = sizeMatchFirst;
          } else {
            name = cleanLine;
          }
        }
      } else {
        // Look for sizing at the end of the text string, e.g. "John Doe L" or "Jane Doe M"
        const words = cleanLine.split(/\s+/);
        if (words.length > 1) {
          const lastWord = words[words.length - 1];
          const matchedSize = AVAILABLE_SIZES.find(s => s.toLowerCase() === lastWord.toLowerCase());
          if (matchedSize) {
            size = matchedSize;
            name = words.slice(0, -1).join(' ').trim();
          }
        }
      }

      parsed.push({
        id: `bulk-${idx}-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        name,
        size
      });
    });

    setImportPreview(parsed);
  }, [bulkText, bulkDefaultSize]);

  // Execute bulk import
  const handleBulkImport = async () => {
    if (importPreview.length === 0) return;

    let finalRoster = [...roster];
    if (importActionType === 'replace') {
      finalRoster = importPreview;
    } else {
      // Merge: append new entries
      finalRoster = [...finalRoster, ...importPreview];
    }

    try {
      await updateDoc(doc(db, 'customers', currentCustomerId), {
        teamRoster: finalRoster
      });
      setIsBulkModalOpen(false);
      setBulkText('');
      setImportPreview([]);
    } catch (err) {
      console.error("Error bulk importing roster:", err);
      alert("Failed to import team members. Please try again.");
    }
  };

  const handleSaveStandardOrder = async () => {
    setIsSavingStandard(true);
    try {
      await updateDoc(doc(db, 'customers', currentCustomerId), {
        standardOrder: standardOrder
      });
      alert("Standard Order sizing template saved successfully!");
    } catch (err) {
      console.error("Error saving standard order:", err);
      alert("Failed to save standard order. Please try again.");
    } finally {
      setIsSavingStandard(false);
    }
  };

  // Generate size spread data for visuals
  const sizeSpread = roster.reduce<Record<string, number>>((acc, member) => {
    acc[member.size] = (acc[member.size] || 0) + 1;
    return acc;
  }, {});

  const sortedActiveSizes = Object.keys(sizeSpread).sort(sortSizes);
  const maxSpreadCount = Math.max(...Object.values(sizeSpread), 1);

  // Filtered Roster for the table
  const filteredRoster = roster.filter(member => {
    const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSize = selectedSizeFilter === 'All' || member.size === selectedSizeFilter;
    return matchesSearch && matchesSize;
  });

  return (
    <div className="max-w-[1200px] mx-auto w-full flex flex-col gap-8 animate-in fade-in duration-300 pb-20">
      
      {/* Header Area */}
      <div className="flex items-center justify-between mt-4">
        <button 
          onClick={() => navigate(customerId ? `/portal/${customerId}` : '/portal')}
          className="flex items-center gap-2 text-neutral-500 hover:text-black transition-colors font-medium text-sm group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          Back to Dashboard
        </button>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-neutral-150 pb-6 mb-2">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-serif text-neutral-900 tracking-tight">
            Team Sizing Roster
          </h1>
          <p className="text-neutral-500 font-medium text-sm max-w-xl leading-relaxed font-sans">
            Manage your team's sizing profile here. When purchasing garments, you can apply this full size spread to any cart item in a single click.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsBulkModalOpen(true)}
            className="bg-white hover:bg-neutral-50 text-neutral-800 border border-neutral-300 px-5 py-3.5 rounded-full text-[13px] font-bold tracking-wide hover:scale-[1.02] active:scale-[0.98] transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <Upload size={16} />
            <span>Bulk Import Roster</span>
          </button>
        </div>
      </div>

      {/* Sub-tab selection */}
      <div className="flex border-b border-neutral-200 mb-8 gap-6">
        <button
          onClick={() => setActiveTab('roster')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'roster'
              ? 'text-black border-black font-bold'
              : 'text-neutral-400 border-transparent hover:text-black hover:border-black'
          }`}
        >
          Team Roster Sizing
        </button>
        <button
          onClick={() => setActiveTab('standard')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'standard'
              ? 'text-black border-black font-bold'
              : 'text-neutral-400 border-transparent hover:text-black hover:border-black'
          }`}
        >
          Standard Order Sizing
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-neutral-500">
          <RefreshCw size={32} className="animate-spin text-neutral-400" />
          <p className="text-sm font-semibold">Loading roster data...</p>
        </div>
      ) : activeTab === 'roster' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Stats & Add form */}
          <div className="lg:col-span-1 flex flex-col gap-8">
            
            {/* Quick Add Form */}
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-[0_2px_12px_rgb(0,0,0,0.02)]">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-900 mb-4 flex items-center gap-2">
                <Plus size={16} className="text-neutral-450" />
                <span>Add Team Member</span>
              </h2>
              
              <form onSubmit={handleAddMember} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider pl-0.5">Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sarah Connor"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-neutral-400 focus:bg-white transition-all placeholder:text-neutral-450"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider pl-0.5">Preferred Size</label>
                  <div className="relative">
                    <select
                      value={newMemberSize}
                      onChange={(e) => setNewMemberSize(e.target.value)}
                      className="w-full appearance-none bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-neutral-400 focus:bg-white cursor-pointer pr-10"
                    >
                      {AVAILABLE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
                      ▼
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isAdding || !newMemberName.trim()}
                  className="w-full bg-black text-white hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400 font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-all mt-2 cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                >
                  <Plus size={14} />
                  <span>{isAdding ? 'Adding...' : 'Add Member'}</span>
                </button>
              </form>
            </div>

            {/* Size Spread Visualizer */}
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-[0_2px_12px_rgb(0,0,0,0.02)]">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-900 mb-4 flex items-center gap-2">
                <span>Roster Size Spread ({roster.length})</span>
              </h2>

              {roster.length === 0 ? (
                <p className="text-xs text-neutral-450 text-center py-6 leading-relaxed">
                  Add team members to see your size distribution breakdown.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {sortedActiveSizes.map(size => {
                    const count = sizeSpread[size] || 0;
                    const percent = (count / maxSpreadCount) * 100;
                    return (
                      <div key={size} className="flex items-center gap-3">
                        <span className="w-12 text-xs font-bold text-neutral-800 text-right">{size}</span>
                        <div className="flex-1 bg-neutral-100 h-5 rounded-md overflow-hidden relative border border-neutral-200/40">
                          <div 
                            style={{ width: `${percent}%` }}
                            className="bg-black h-full rounded-l-md transition-all duration-500" 
                          />
                        </div>
                        <span className="w-8 text-xs font-bold text-neutral-900 pl-1">{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Roster List */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            
            {/* Filter controls */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full bg-white border border-neutral-200 p-4 rounded-2xl shadow-[0_2px_12px_rgb(0,0,0,0.01)]">
              <div className="relative flex-1 w-full">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search members by name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl pl-10 pr-4 py-2.5 text-xs focus:outline-none focus:border-neutral-400 focus:bg-white transition-all placeholder:text-neutral-450"
                />
              </div>

              <div className="relative w-full sm:w-48 shrink-0">
                <select
                  value={selectedSizeFilter}
                  onChange={(e) => setSelectedSizeFilter(e.target.value)}
                  className="w-full appearance-none bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-neutral-400 focus:bg-white cursor-pointer pr-10 font-medium text-neutral-700"
                >
                  <option value="All">All Sizes</option>
                  {AVAILABLE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none text-xs">
                  ▼
                </div>
              </div>
            </div>

            {/* Members List Card */}
            <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-[0_2px_12px_rgb(0,0,0,0.02)]">
              
              {filteredRoster.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                  <div className="w-12 h-12 bg-neutral-50 text-neutral-400 rounded-full flex items-center justify-center mb-4 border border-neutral-100">
                    <Users size={20} />
                  </div>
                  <h3 className="text-sm font-bold text-neutral-800 mb-1">No Team Members Found</h3>
                  <p className="text-xs text-neutral-450 max-w-sm leading-relaxed">
                    {searchTerm || selectedSizeFilter !== 'All' 
                      ? "Try adjusting your search criteria or filter to find who you're looking for." 
                      : "Your team roster is currently empty. Add members individually or use the bulk import tool to get started."}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-neutral-50 border-b border-neutral-200">
                        <th className="px-6 py-4 text-[10px] font-extrabold uppercase tracking-wider text-neutral-500">Name</th>
                        <th className="px-6 py-4 text-[10px] font-extrabold uppercase tracking-wider text-neutral-500 w-36">Size</th>
                        <th className="px-6 py-4 text-[10px] font-extrabold uppercase tracking-wider text-neutral-500 w-24 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-150">
                      {filteredRoster.map((member) => (
                        <tr key={member.id} className="hover:bg-neutral-50/50 transition-colors">
                          <td className="px-6 py-3.5">
                            {editingId === member.id ? (
                              <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="bg-white border border-neutral-350 rounded-lg px-2.5 py-1 text-sm font-medium w-full focus:outline-none focus:border-black"
                              />
                            ) : (
                              <span className="text-sm font-bold text-neutral-800">{member.name}</span>
                            )}
                          </td>
                          <td className="px-6 py-3.5">
                            {editingId === member.id ? (
                              <select
                                value={editingSize}
                                onChange={(e) => setEditingSize(e.target.value)}
                                className="bg-white border border-neutral-350 rounded-lg px-2 py-1 text-sm font-medium w-full focus:outline-none focus:border-black cursor-pointer"
                              >
                                {AVAILABLE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            ) : (
                              <span className="inline-flex items-center justify-center bg-neutral-100 border border-neutral-200 rounded-md px-2.5 py-1 text-xs font-bold text-neutral-700 min-w-[42px] uppercase">
                                {member.size}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {editingId === member.id ? (
                                <>
                                  <button
                                    onClick={() => handleSaveEdit(member.id)}
                                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer"
                                    title="Save changes"
                                  >
                                    <Check size={14} />
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    className="p-1.5 text-neutral-450 hover:bg-neutral-100 rounded-lg transition-all cursor-pointer"
                                    title="Cancel"
                                  >
                                    <X size={14} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => startEdit(member)}
                                    className="p-1.5 text-neutral-450 hover:text-black hover:bg-neutral-100 rounded-lg transition-all cursor-pointer"
                                    title="Edit member"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteMember(member.id)}
                                    className="p-1.5 text-neutral-450 hover:text-red-650 hover:bg-red-550 rounded-lg transition-all cursor-pointer"
                                    title="Delete member"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            
          </div>

        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-[0_2px_12px_rgb(0,0,0,0.02)] flex flex-col gap-6">
          <div>
            <h2 className="text-base font-bold text-neutral-900 mb-1">Predefined Standard Order Template</h2>
            <p className="text-xs text-neutral-500 max-w-2xl leading-relaxed">
              Define the size run quantities you regularly order for inventory restocks, marketing events, or recurring drops. You can quickly apply this template to any garment in your cart.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <button
              type="button"
              onClick={() => {
                const youthSizes = ['YXS', 'YS', 'YM', 'YL', 'YXL'];
                setStandardOrder(prev => {
                  const next = { ...prev };
                  youthSizes.forEach(s => {
                    if (next[s] === undefined) next[s] = 0;
                  });
                  return next;
                });
              }}
              className="text-xs font-bold bg-white border border-neutral-300 hover:border-black text-neutral-800 px-4 py-2 rounded-xl transition-all cursor-pointer"
            >
              + Include Youth Sizing
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm("Reset all standard order quantities to 0?")) {
                  const next: Record<string, number> = {};
                  Object.keys(standardOrder).forEach(k => {
                    next[k] = 0;
                  });
                  setStandardOrder(next);
                }
              }}
              className="text-xs font-bold text-red-650 bg-red-50 border border-red-200 hover:bg-red-100 px-4 py-2 rounded-xl transition-all cursor-pointer"
            >
              Reset Template
            </button>
          </div>

          {/* Matrix Inputs Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 border-t border-b border-neutral-100 py-6">
            {Object.keys(standardOrder).sort(sortSizes).map((size) => (
              <div key={size} className="flex flex-col bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden focus-within:border-black focus-within:ring-1 focus-within:ring-black transition-all">
                <div className="bg-neutral-100 text-neutral-500 text-[10px] font-bold py-2 uppercase tracking-wider flex items-center justify-center border-b border-neutral-200">
                  {size}
                </div>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={standardOrder[size] || ''}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    setStandardOrder(prev => ({ ...prev, [size]: Math.max(0, val) }));
                  }}
                  className="w-full h-10 text-center text-sm font-bold text-neutral-900 focus:outline-none bg-white font-semibold"
                />
              </div>
            ))}
          </div>

          {/* Visual Breakdown summary */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-neutral-50 p-4 border border-neutral-200 rounded-xl">
            <div>
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block mb-0.5">Template Summary</span>
              <span className="text-sm font-bold text-neutral-800">
                {Object.values(standardOrder).reduce((s, v) => s + (v || 0), 0)} Total units configured
              </span>
            </div>
            <button
              type="button"
              onClick={handleSaveStandardOrder}
              disabled={isSavingStandard}
              className="px-6 py-2.5 bg-black text-white hover:bg-neutral-800 disabled:bg-neutral-200 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              {isSavingStandard ? 'Saving...' : 'Save Standard Order Sizing'}
            </button>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col overflow-hidden max-h-[85vh] animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                <Upload size={18} className="text-neutral-500" />
                <span>Bulk Import Team Roster</span>
              </h3>
              <button 
                onClick={() => setIsBulkModalOpen(false)}
                className="p-1 text-neutral-450 hover:text-black hover:bg-neutral-100 rounded-lg transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex flex-col gap-5 overflow-y-auto min-h-0">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-xs leading-relaxed text-amber-800">
                <Info size={16} className="shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <p className="font-bold mb-1">Paste Format Instructions:</p>
                  <p>You can paste lists of names and sizes directly from spreadsheets, emails, or text files.</p>
                  <ul className="list-disc list-inside mt-1.5 space-y-0.5">
                    <li>Excel columns: <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">Name [Tab] Size</code></li>
                    <li>Comma separated: <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">John Doe, L</code></li>
                    <li>Plain list of names (one per line): will apply the default size selected below.</li>
                  </ul>
                </div>
              </div>

              {/* Text Input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider pl-0.5">Paste Names & Sizes</label>
                <textarea
                  rows={6}
                  placeholder={`Sarah Connor, S\nJohn Connor, M\nT-800, 3XL\nMarcus Wright`}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-neutral-400 focus:bg-white font-mono transition-all placeholder:text-neutral-450"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Default Size Selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider pl-0.5">Default size if missing</label>
                  <div className="relative">
                    <select
                      value={bulkDefaultSize}
                      onChange={(e) => setBulkDefaultSize(e.target.value)}
                      className="w-full appearance-none bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-neutral-400 focus:bg-white cursor-pointer pr-10"
                    >
                      {AVAILABLE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none text-xs">
                      ▼
                    </div>
                  </div>
                </div>

                {/* Import behavior Option */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider pl-0.5">Import Option</label>
                  <div className="grid grid-cols-2 gap-2 bg-neutral-100 p-1 rounded-xl border border-neutral-200 h-[38px] items-center">
                    <button
                      type="button"
                      onClick={() => setImportActionType('merge')}
                      className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        importActionType === 'merge'
                          ? 'bg-white text-black shadow-xs'
                          : 'text-neutral-500 hover:text-black'
                      }`}
                    >
                      Merge (Add)
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportActionType('replace')}
                      className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        importActionType === 'replace'
                          ? 'bg-white text-black shadow-xs'
                          : 'text-neutral-500 hover:text-black'
                      }`}
                    >
                      Replace Roster
                    </button>
                  </div>
                </div>
              </div>

              {/* Parsing Preview */}
              {importPreview.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-neutral-100 pt-4">
                  <span className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider pl-0.5">
                    Parsed Preview ({importPreview.length} members detected)
                  </span>
                  <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-3 max-h-36 overflow-y-auto flex flex-col gap-2">
                    {importPreview.map((item, index) => (
                      <div key={index} className="flex justify-between items-center bg-white px-3 py-1.5 border border-neutral-150 rounded-lg">
                        <span className="text-xs font-bold text-neutral-800 truncate max-w-[70%]">{item.name}</span>
                        <span className="bg-neutral-100 border border-neutral-200 rounded px-1.5 py-0.5 text-[10px] font-extrabold text-neutral-700 uppercase">
                          {item.size}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-neutral-100 flex items-center justify-end gap-3 bg-neutral-50/50">
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="px-4 py-2 bg-white border border-neutral-250 hover:border-black rounded-lg text-xs font-bold text-neutral-750 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkImport}
                disabled={importPreview.length === 0}
                className="px-5 py-2 bg-black text-white hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Check size={14} />
                <span>Import {importPreview.length} Members</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
