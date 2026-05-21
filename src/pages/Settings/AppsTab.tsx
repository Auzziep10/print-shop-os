import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  Link2, 
  Calendar, 
  CheckSquare, 
  Mail, 
  Activity, 
  Compass, 
  ShoppingBag, 
  BookOpen, 
  MessageSquare, 
  Globe,
  Plus, 
  Trash2, 
  Edit2, 
  Loader2, 
  Save, 
  ExternalLink 
} from 'lucide-react';
import { tokens } from '../../lib/tokens';
import { PillButton } from '../../components/ui/PillButton';

interface AppLink {
  id: string;
  name: string;
  url: string;
  icon: string;
  color: string;
}

const AVAILABLE_ICONS = [
  { id: 'link', label: 'Default Link', component: Link2 },
  { id: 'globe', label: 'Web/Globe', component: Globe },
  { id: 'calendar', label: 'Calendar', component: Calendar },
  { id: 'tasks', label: 'Tasks', component: CheckSquare },
  { id: 'mail', label: 'Mail', component: Mail },
  { id: 'activity', label: 'Activity/Analytics', component: Activity },
  { id: 'compass', label: 'Compass/Navigation', component: Compass },
  { id: 'shopping', label: 'Shop/E-commerce', component: ShoppingBag },
  { id: 'book', label: 'Docs/Knowledge', component: BookOpen },
  { id: 'message', label: 'Chat/Support', component: MessageSquare },
];

const AVAILABLE_COLORS = [
  { id: 'neutral', name: 'Dark Grey', bgClass: 'bg-neutral-800', textClass: 'text-neutral-800', hex: '#111111' },
  { id: 'blue', name: 'Blue', bgClass: 'bg-blue-500', textClass: 'text-blue-500', hex: '#3B82F6' },
  { id: 'emerald', name: 'Green', bgClass: 'bg-emerald-500', textClass: 'text-emerald-500', hex: '#10B981' },
  { id: 'purple', name: 'Purple', bgClass: 'bg-purple-500', textClass: 'text-purple-500', hex: '#8B5CF6' },
  { id: 'rose', name: 'Rose', bgClass: 'bg-rose-500', textClass: 'text-rose-500', hex: '#F43F5E' },
  { id: 'amber', name: 'Amber', bgClass: 'bg-amber-500', textClass: 'text-amber-500', hex: '#F59E0B' },
];

export function AppsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [links, setLinks] = useState<AppLink[]>([]);
  
  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<AppLink | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('link');
  const [selectedColor, setSelectedColor] = useState('neutral');

  useEffect(() => {
    const fetchApps = async () => {
      try {
        const docRef = doc(db, 'settings', 'apps');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setLinks(docSnap.data().links || []);
        }
      } catch (err) {
        console.error("Error fetching app links settings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchApps();
  }, []);

  const handleOpenCreate = () => {
    setEditingLink(null);
    setName('');
    setUrl('');
    setSelectedIcon('link');
    setSelectedColor('neutral');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (link: AppLink) => {
    setEditingLink(link);
    setName(link.name);
    setUrl(link.url);
    setSelectedIcon(link.icon || 'link');
    setSelectedColor(link.color || 'neutral');
    setIsModalOpen(true);
  };

  const handleSaveLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !url) return;

    // Standardize URL protocol
    let formattedUrl = url.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }

    setSaving(true);
    try {
      let updatedLinks: AppLink[];
      if (editingLink) {
        updatedLinks = links.map(l => l.id === editingLink.id 
          ? { ...l, name, url: formattedUrl, icon: selectedIcon, color: selectedColor } 
          : l
        );
      } else {
        const newLink: AppLink = {
          id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
          name,
          url: formattedUrl,
          icon: selectedIcon,
          color: selectedColor
        };
        updatedLinks = [...links, newLink];
      }

      await setDoc(doc(db, 'settings', 'apps'), { links: updatedLinks }, { merge: true });
      setLinks(updatedLinks);
      setIsModalOpen(false);
    } catch (err) {
      console.error("Error saving app link settings:", err);
      alert('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLink = async (id: string) => {
    if (!confirm('Are you sure you want to delete this app link?')) return;
    
    setSaving(true);
    try {
      const updatedLinks = links.filter(l => l.id !== id);
      await setDoc(doc(db, 'settings', 'apps'), { links: updatedLinks }, { merge: true });
      setLinks(updatedLinks);
    } catch (err) {
      console.error("Error deleting app link:", err);
      alert('Failed to delete app link.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-brand-secondary" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className={tokens.typography.h2 + " mb-1 flex items-center gap-2"}>
            <Globe className="text-brand-primary" size={20} />
            App Links & Integrations
          </h2>
          <p className={tokens.typography.bodyMuted}>
            Configure links to other internal apps or portals. They will appear in the sidebar navigation launcher.
          </p>
        </div>
        <PillButton variant="filled" onClick={handleOpenCreate} className="gap-2 shrink-0 self-start sm:self-center">
          <Plus size={16} />
          Add App Link
        </PillButton>
      </div>

      <div className="border border-brand-border rounded-xl overflow-hidden bg-white">
        {links.length === 0 ? (
          <div className="p-12 text-center text-brand-secondary">
            <Globe size={32} className="mx-auto mb-3 text-neutral-300" strokeWidth={1.5} />
            <p className="text-sm font-medium">No app links added yet</p>
            <p className="text-xs text-brand-secondary/70 mt-1">Configure external applications to display in your navigation menu.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-xs text-brand-secondary uppercase bg-brand-bg/50 border-b border-brand-border">
                <tr>
                  <th className="px-6 py-3.5 font-semibold">App Details</th>
                  <th className="px-6 py-3.5 font-semibold">URL/Destination</th>
                  <th className="px-6 py-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/40">
                {links.map((link) => {
                  const colorConfig = AVAILABLE_COLORS.find(c => c.id === link.color) || AVAILABLE_COLORS[0];
                  const iconConfig = AVAILABLE_ICONS.find(i => i.id === link.icon) || AVAILABLE_ICONS[0];
                  const IconComponent = iconConfig.component;

                  return (
                    <tr key={link.id} className="hover:bg-brand-bg/20 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg ${colorConfig.bgClass} bg-opacity-10 flex items-center justify-center`}>
                            <IconComponent size={16} className={colorConfig.textClass} />
                          </div>
                          <div>
                            <div className="font-semibold text-brand-primary">{link.name}</div>
                            <div className="text-xs text-brand-secondary capitalize">{colorConfig.name} • {iconConfig.label}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <a 
                          href={link.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-brand-secondary hover:text-brand-primary text-xs flex items-center gap-1.5 transition-colors max-w-md truncate"
                        >
                          <span className="truncate">{link.url}</span>
                          <ExternalLink size={12} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => handleOpenEdit(link)} 
                            className="p-1.5 text-brand-secondary hover:text-brand-primary rounded-md transition-colors hover:bg-neutral-100" 
                            title="Edit Link"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleDeleteLink(link.id)} 
                            className="p-1.5 text-brand-secondary hover:text-red-600 rounded-md transition-colors hover:bg-red-50" 
                            title="Delete Link"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-brand-border rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-6 overflow-hidden max-h-[90vh] flex flex-col">
            <div>
              <h3 className="text-xl font-serif text-brand-primary">
                {editingLink ? 'Edit App Link' : 'Add App Link'}
              </h3>
              <p className="text-xs text-brand-secondary mt-1">
                Define the destination and custom visual elements for the app link.
              </p>
            </div>
            
            <form onSubmit={handleSaveLink} className="space-y-5 overflow-y-auto pr-1 flex-1">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">App Name</label>
                <input 
                  type="text" 
                  required
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors" 
                  placeholder="e.g. Chronotrack Planner" 
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">App URL</label>
                <input 
                  type="text" 
                  required
                  value={url} 
                  onChange={e => setUrl(e.target.value)} 
                  className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors" 
                  placeholder="e.g. chronotrack-eca5d.firebaseapp.com" 
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">Select Visual Icon</label>
                <div className="grid grid-cols-5 gap-2.5">
                  {AVAILABLE_ICONS.map((icon) => {
                    const IconComp = icon.component;
                    const isSelected = selectedIcon === icon.id;
                    return (
                      <button
                        key={icon.id}
                        type="button"
                        onClick={() => setSelectedIcon(icon.id)}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs gap-1.5 transition-all ${
                          isSelected 
                            ? 'border-brand-primary bg-neutral-50 text-brand-primary font-semibold shadow-sm' 
                            : 'border-brand-border hover:border-neutral-400 text-brand-secondary hover:bg-neutral-50'
                        }`}
                        title={icon.label}
                      >
                        <IconComp size={18} strokeWidth={isSelected ? 2 : 1.5} />
                        <span className="text-[9px] truncate max-w-[64px] text-center">{icon.label.split('/')[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">Select Accent Color</label>
                <div className="flex flex-wrap gap-3">
                  {AVAILABLE_COLORS.map((color) => {
                    const isSelected = selectedColor === color.id;
                    return (
                      <button
                        key={color.id}
                        type="button"
                        onClick={() => setSelectedColor(color.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs transition-all ${
                          isSelected 
                            ? 'border-brand-primary bg-neutral-50 text-brand-primary font-semibold shadow-sm' 
                            : 'border-brand-border hover:border-neutral-400 text-brand-secondary hover:bg-neutral-50'
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded-full ${color.bgClass} border border-black/10`} />
                        <span>{color.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-brand-border mt-6 shrink-0">
                <PillButton 
                  variant="outline" 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </PillButton>
                <PillButton 
                  variant="filled" 
                  type="submit"
                  disabled={saving}
                  className="min-w-[120px] justify-center"
                >
                  {saving ? <Loader2 className="animate-spin" size={16} /> : <><Save size={16} className="mr-1.5" /> Save Link</>}
                </PillButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
