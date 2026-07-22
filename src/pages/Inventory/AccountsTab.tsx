import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, onSnapshot, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Globe, 
  User, 
  Mail, 
  Phone, 
  Eye, 
  EyeOff, 
  Copy, 
  Check, 
  ExternalLink, 
  Key, 
  FileText, 
  Package, 
  Truck,
  Building,
  Lock,
  X
} from 'lucide-react';

interface Account {
  id: string;
  name: string;
  website: string;
  purchases: string; // e.g. "Garments, Blank T-Shirts, Hoodies"
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  loginUsername?: string;
  loginPassword?: string;
  notes?: string;
  lastUpdated?: number;
}

const SEED_ACCOUNTS: Account[] = [
  {
    id: 'acc_sanmar',
    name: 'SanMar',
    website: 'https://www.sanmar.com',
    purchases: 'Garments, Blank T-Shirts, Hoodies, Polos',
    contactName: 'Sarah Jenkins',
    contactEmail: 'sarah.jenkins@sanmar.com',
    contactPhone: '(800) 426-3708',
    loginUsername: '',
    loginPassword: '',
    notes: 'Primary distributor for Port & Company, District, and Sport-Tek. Free shipping on orders over $200.',
    lastUpdated: Date.now()
  },
  {
    id: 'acc_ssactivewear',
    name: 'S&S Activewear',
    website: 'https://www.ssactivewear.com',
    purchases: 'Garments, Jackets, Caps, Fleeces',
    contactName: 'Marcus Vance',
    contactEmail: 'mvance@ssactivewear.com',
    contactPhone: '(800) 523-2155',
    loginUsername: '',
    loginPassword: '',
    notes: 'Fast shipping from regional warehouses. Best inventory for Gildan and Bella+Canvas.',
    lastUpdated: Date.now()
  },
  {
    id: 'acc_wovn',
    name: 'Wovn Supply',
    website: 'https://wovnsupply.com',
    purchases: 'DTF Supplies, Inks, TPU Powder, Transfer Film',
    contactName: 'Customer Support',
    contactEmail: 'hello@wovnsupply.com',
    contactPhone: '(888) 555-0199',
    loginUsername: '',
    loginPassword: '',
    notes: 'Premium high-density inks and transfer film rolls. Quality is consistent.',
    lastUpdated: Date.now()
  },
  {
    id: 'acc_uline',
    name: 'Uline',
    website: 'https://www.uline.com',
    purchases: 'Shipping Boxes, Pallet Wrap, Packing Tape, Poly Bags',
    contactName: 'Corporate Accounts',
    contactEmail: 'corporate@uline.com',
    contactPhone: '(800) 295-5510',
    loginUsername: '',
    loginPassword: '',
    notes: 'Next-day delivery on packaging materials, tape, boxes, and warehouse safety equipment.',
    lastUpdated: Date.now()
  }
];

export function AccountsTab() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    website: '',
    purchases: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    loginUsername: '',
    loginPassword: '',
    notes: ''
  });

  // Credential Visibility Map
  const [showCredsMap, setShowCredsMap] = useState<Record<string, boolean>>({});
  // Copy Actions Feedback Map (accountId_field -> boolean)
  const [copiedMap, setCopiedMap] = useState<Record<string, boolean>>({});

  // Fetch from Firestore (collection name 'accounts')
  useEffect(() => {
    const q = query(collection(db, 'accounts'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (snapshot.empty) {
        // Seed standard accounts if database empty
        try {
          for (const acc of SEED_ACCOUNTS) {
            await setDoc(doc(db, 'accounts', acc.id), acc);
          }
        } catch (err) {
          console.error("Failed to seed accounts:", err);
        }
      } else {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Account));
        setAccounts(data);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleOpenCreateModal = () => {
    setEditingAccount(null);
    setFormData({
      name: '',
      website: '',
      purchases: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      loginUsername: '',
      loginPassword: '',
      notes: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (acc: Account) => {
    setEditingAccount(acc);
    setFormData({
      name: acc.name,
      website: acc.website,
      purchases: acc.purchases,
      contactName: acc.contactName,
      contactEmail: acc.contactEmail,
      contactPhone: acc.contactPhone,
      loginUsername: acc.loginUsername || '',
      loginPassword: acc.loginPassword || '',
      notes: acc.notes || ''
    });
    setIsModalOpen(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return alert('Account Name is required');

    const id = editingAccount ? editingAccount.id : `acc_${Date.now()}`;
    
    // Add https:// to website if not present
    let formattedWebsite = formData.website.trim();
    if (formattedWebsite && !/^https?:\/\//i.test(formattedWebsite)) {
      formattedWebsite = `https://${formattedWebsite}`;
    }

    const payload: Partial<Account> = {
      name: formData.name.trim(),
      website: formattedWebsite,
      purchases: formData.purchases.trim(),
      contactName: formData.contactName.trim(),
      contactEmail: formData.contactEmail.trim(),
      contactPhone: formData.contactPhone.trim(),
      loginUsername: formData.loginUsername.trim(),
      loginPassword: formData.loginPassword.trim(),
      notes: formData.notes.trim(),
      lastUpdated: Date.now()
    };

    try {
      await setDoc(doc(db, 'accounts', id), payload, { merge: true });
      setIsModalOpen(false);
    } catch (err) {
      console.error("Error saving account:", err);
      alert("Failed to save account.");
    }
  };

  const handleDeleteAccount = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete account "${name}"?`)) return;
    try {
      await deleteDoc(doc(db, 'accounts', id));
    } catch (err) {
      console.error("Error deleting account:", err);
      alert("Failed to delete account.");
    }
  };

  const toggleCredentials = (id: string) => {
    setShowCredsMap(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMap(prev => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setCopiedMap(prev => ({ ...prev, [key]: false }));
    }, 2000);
  };

  // Compile Dynamic Categories / Purchase keywords for filter pills
  const allPurchaseCategories = Array.from(
    new Set(
      accounts
        .map(s => s.purchases.split(','))
        .flat()
        .map(p => p.trim())
        .filter(p => p.length > 0)
    )
  );

  // Filtering Logic
  const filteredAccounts = accounts.filter(acc => {
    const term = searchQuery.toLowerCase();
    const matchesSearch = 
      acc.name.toLowerCase().includes(term) ||
      acc.contactName.toLowerCase().includes(term) ||
      acc.contactEmail.toLowerCase().includes(term) ||
      acc.website.toLowerCase().includes(term) ||
      acc.purchases.toLowerCase().includes(term) ||
      (acc.notes && acc.notes.toLowerCase().includes(term));

    const matchesCategory = 
      selectedCategory === 'All' || 
      acc.purchases.toLowerCase().includes(selectedCategory.toLowerCase());

    return matchesSearch && matchesCategory;
  });

  // Stats calculation
  const totalAccountsCount = accounts.length;
  const accountsWithLogins = accounts.filter(s => s.loginUsername || s.loginPassword).length;
  
  // Extract major groupings for cards
  const categoriesCount = allPurchaseCategories.length;

  return (
    <div className="space-y-6">
      {/* Metrics Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Metric 1 */}
        <div className="bg-white rounded-card border border-brand-border p-6 relative overflow-hidden shadow-sm flex items-center justify-between group hover:border-brand-primary/40 transition-colors">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary">Total Accounts</span>
            <h3 className="font-serif text-3xl text-brand-primary font-bold">{totalAccountsCount}</h3>
            <p className="text-xs text-brand-secondary">Active supplier & vendor accounts</p>
          </div>
          <div className="p-4 bg-brand-bg rounded-2xl text-brand-primary group-hover:scale-110 transition-transform">
            <Truck size={24} className="stroke-1.5" />
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-brand-primary/5 to-transparent rounded-full -mr-8 -mt-8" />
        </div>

        {/* Metric 2 */}
        <div className="bg-white rounded-card border border-brand-border p-6 relative overflow-hidden shadow-sm flex items-center justify-between group hover:border-amber-400/40 transition-colors">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary">Item Categories</span>
            <h3 className="font-serif text-3xl text-brand-primary font-bold">{categoriesCount}</h3>
            <p className="text-xs text-brand-secondary">Distinct types of goods purchased</p>
          </div>
          <div className="p-4 bg-brand-bg rounded-2xl text-brand-primary group-hover:scale-110 transition-transform">
            <Package size={24} className="stroke-1.5" />
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-amber-400/10 to-transparent rounded-full -mr-8 -mt-8" />
        </div>

        {/* Metric 3 */}
        <div className="bg-white rounded-card border border-brand-border p-6 relative overflow-hidden shadow-sm flex items-center justify-between group hover:border-emerald-500/40 transition-colors">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary">Portal Access</span>
            <h3 className="font-serif text-3xl text-brand-primary font-bold">{accountsWithLogins}</h3>
            <p className="text-xs text-brand-secondary">Accounts with credential records</p>
          </div>
          <div className="p-4 bg-brand-bg rounded-2xl text-brand-primary group-hover:scale-110 transition-transform">
            <Key size={24} className="stroke-1.5" />
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-full -mr-8 -mt-8" />
        </div>
      </div>

      {/* Toolbar Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-brand-border shadow-sm">
        <div className="relative flex-1 max-w-lg">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-secondary" />
          <input 
            type="text" 
            placeholder="Search accounts, contacts, web, items..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-brand-border bg-brand-bg text-sm font-medium focus:outline-none focus:ring-1 focus:ring-brand-primary/30 focus:border-brand-primary transition-all text-brand-primary placeholder:text-brand-secondary"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select 
            value={selectedCategory} 
            onChange={e => setSelectedCategory(e.target.value)}
            className="px-3.5 py-2 rounded-lg border border-brand-border bg-brand-bg text-xs font-bold uppercase tracking-wider text-brand-primary focus:outline-none cursor-pointer hover:bg-neutral-100/60 transition-colors"
          >
            <option value="All">Filter: All Categories</option>
            {allPurchaseCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <button 
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-primary text-white hover:bg-black rounded-lg text-xs font-bold uppercase tracking-widest shadow-sm transition-all duration-200"
          >
            <Plus size={14} /> Add Account
          </button>
        </div>
      </div>

      {/* Grid of Account Cards */}
      {filteredAccounts.length === 0 ? (
        <div className="bg-white rounded-card border border-brand-border/60 py-16 px-4 text-center">
          <Building size={48} className="mx-auto mb-4 text-brand-secondary opacity-40 stroke-1" />
          <h4 className="font-serif text-xl font-bold text-brand-primary">No Accounts Found</h4>
          <p className="text-sm text-brand-secondary mt-2 max-w-md mx-auto">
            Try adjusting your search query, selecting another category, or add a brand-new account to the system.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAccounts.map(acc => {
            const isVisible = showCredsMap[acc.id] || false;
            
            // Split tags
            const purchaseTags = acc.purchases
              ? acc.purchases.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
              : [];

            return (
              <div 
                key={acc.id} 
                className="bg-white rounded-card border border-brand-border/80 shadow-sm flex flex-col justify-between overflow-hidden group hover:shadow-md hover:border-brand-primary/25 transition-all duration-300 relative"
              >
                <div>
                  {/* Card Header */}
                  <div className="p-5 border-b border-brand-border/40 bg-brand-bg/10 flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-primary/5 border border-brand-primary/10 flex items-center justify-center text-brand-primary font-serif font-bold text-lg shadow-inner">
                        {acc.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-serif text-lg font-bold text-brand-primary leading-tight group-hover:text-brand-primary/95 transition-colors">
                          {acc.name}
                        </h4>
                        {acc.website && (
                          <a 
                            href={acc.website} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-brand-secondary font-semibold hover:text-brand-primary underline tracking-wide mt-0.5"
                          >
                            <Globe size={10} /> Visit Website <ExternalLink size={8} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Purchases Tags */}
                  <div className="px-5 pt-4">
                    <div className="flex flex-wrap gap-1.5">
                      {purchaseTags.map((tag, idx) => (
                        <span 
                          key={idx} 
                          className="text-[9px] font-bold uppercase tracking-widest bg-brand-bg/70 border border-brand-border/50 text-brand-secondary px-2.5 py-1 rounded-md"
                        >
                          {tag}
                        </span>
                      ))}
                      {purchaseTags.length === 0 && (
                        <span className="text-[10px] italic text-brand-secondary opacity-60">No items specified</span>
                      )}
                    </div>
                  </div>

                  {/* Contact Info Section */}
                  <div className="p-5 space-y-2.5 border-b border-brand-border/30">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-brand-secondary block mb-1">Contact Account</span>
                    
                    <div className="flex items-center gap-2.5 text-xs text-brand-primary">
                      <User size={13} className="text-brand-secondary shrink-0" />
                      <span className="font-semibold">{acc.contactName || 'N/A'}</span>
                    </div>

                    {acc.contactEmail && (
                      <a 
                        href={`mailto:${acc.contactEmail}`}
                        className="flex items-center gap-2.5 text-xs text-brand-primary hover:text-brand-primary/80 hover:underline"
                      >
                        <Mail size={13} className="text-brand-secondary shrink-0" />
                        <span className="font-medium truncate">{acc.contactEmail}</span>
                      </a>
                    )}

                    {acc.contactPhone && (
                      <a 
                        href={`tel:${acc.contactPhone}`}
                        className="flex items-center gap-2.5 text-xs text-brand-primary hover:text-brand-primary/80 hover:underline"
                      >
                        <Phone size={13} className="text-brand-secondary shrink-0" />
                        <span className="font-medium">{acc.contactPhone}</span>
                      </a>
                    )}
                  </div>

                  {/* Login Credentials Box */}
                  <div className="p-5 bg-brand-bg/15 border-b border-brand-border/30 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-brand-secondary flex items-center gap-1">
                        <Lock size={10} /> Portal Credentials
                      </span>
                      
                      {(acc.loginUsername || acc.loginPassword) && (
                        <button 
                          onClick={() => toggleCredentials(acc.id)}
                          className="text-[9px] font-bold uppercase tracking-widest text-brand-secondary hover:text-brand-primary flex items-center gap-1 transition-colors"
                        >
                          {isVisible ? <><EyeOff size={11} /> Hide</> : <><Eye size={11} /> Show</>}
                        </button>
                      )}
                    </div>

                    {!acc.loginUsername && !acc.loginPassword ? (
                      <span className="text-xs italic text-brand-secondary opacity-65 block">No login recorded</span>
                    ) : (
                      <div className="space-y-2 bg-white/70 p-2.5 rounded-lg border border-brand-border/50 text-xs">
                        {/* Username row */}
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-brand-secondary font-medium">User:</span>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-mono text-brand-primary truncate max-w-[130px]">
                              {isVisible ? acc.loginUsername : '••••••••'}
                            </span>
                            {acc.loginUsername && (
                              <button 
                                onClick={() => copyToClipboard(acc.loginUsername || '', `${acc.id}_usr`)}
                                className="text-brand-secondary hover:text-brand-primary transition-colors p-1"
                                title="Copy username"
                              >
                                {copiedMap[`${acc.id}_usr`] ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Password row */}
                        <div className="flex justify-between items-center gap-2 border-t border-brand-border/20 pt-1.5">
                          <span className="text-brand-secondary font-medium">Pass:</span>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-mono text-brand-primary truncate max-w-[130px]">
                              {isVisible ? acc.loginPassword : '••••••••'}
                            </span>
                            {acc.loginPassword && (
                              <button 
                                onClick={() => copyToClipboard(acc.loginPassword || '', `${acc.id}_pwd`)}
                                className="text-brand-secondary hover:text-brand-primary transition-colors p-1"
                                title="Copy password"
                              >
                                {copiedMap[`${acc.id}_pwd`] ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Notes Section */}
                  {acc.notes && (
                    <div className="p-5 border-b border-brand-border/20 flex gap-2">
                      <FileText size={14} className="text-brand-secondary shrink-0 mt-0.5" />
                      <p className="text-xs text-brand-secondary leading-normal italic font-medium">
                        "{acc.notes}"
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer Edit/Delete Bar */}
                <div className="p-3 bg-brand-bg/5 flex justify-end gap-1 shrink-0 border-t border-brand-border/30">
                  <button 
                    onClick={() => handleOpenEditModal(acc)}
                    className="p-2 text-brand-secondary hover:text-brand-primary hover:bg-white rounded-lg transition-all"
                    title="Edit account"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button 
                    onClick={() => handleDeleteAccount(acc.id, acc.name)}
                    className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all"
                    title="Delete account"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal Drawer */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-[100] flex justify-center items-center backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-brand-border overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-brand-border/60 bg-brand-bg flex justify-between items-center">
              <h3 className="font-serif text-lg font-bold text-brand-primary flex items-center gap-2">
                <Truck size={18} /> {editingAccount ? 'Modify Account Profile' : 'Register New Account'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="p-1 rounded-lg text-brand-secondary hover:bg-neutral-100 hover:text-brand-primary transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveAccount} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
              {/* Account Basic info */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-primary/80 border-b border-brand-border/30 pb-1">Company Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-brand-secondary tracking-widest block mb-1">Company Name *</label>
                    <input 
                      type="text" 
                      required
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. SanMar"
                      className="w-full p-2.5 rounded-lg border border-brand-border bg-brand-bg text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-brand-secondary tracking-widest block mb-1">Website URL</label>
                    <input 
                      type="text" 
                      value={formData.website}
                      onChange={e => setFormData({ ...formData, website: e.target.value })}
                      placeholder="e.g. www.sanmar.com"
                      className="w-full p-2.5 rounded-lg border border-brand-border bg-brand-bg text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-brand-secondary tracking-widest block mb-1">Items Purchased (comma separated)</label>
                  <input 
                    type="text" 
                    value={formData.purchases}
                    onChange={e => setFormData({ ...formData, purchases: e.target.value })}
                    placeholder="e.g. Garments, Blank Tees, Custom labels"
                    className="w-full p-2.5 rounded-lg border border-brand-border bg-brand-bg text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary"
                  />
                  <span className="text-[9px] text-brand-secondary mt-1 block">Helpful tags used for inventory filtering.</span>
                </div>
              </div>

              {/* Account Representative info */}
              <div className="space-y-3 pt-2">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-primary/80 border-b border-brand-border/30 pb-1">Primary Representative</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="text-[10px] uppercase font-bold text-brand-secondary tracking-widest block mb-1">Contact Person Name</label>
                    <input 
                      type="text" 
                      value={formData.contactName}
                      onChange={e => setFormData({ ...formData, contactName: e.target.value })}
                      placeholder="John Smith"
                      className="w-full p-2.5 rounded-lg border border-brand-border bg-brand-bg text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-brand-secondary tracking-widest block mb-1">Contact Email</label>
                    <input 
                      type="email" 
                      value={formData.contactEmail}
                      onChange={e => setFormData({ ...formData, contactEmail: e.target.value })}
                      placeholder="rep@supplier.com"
                      className="w-full p-2.5 rounded-lg border border-brand-border bg-brand-bg text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-brand-secondary tracking-widest block mb-1">Contact Phone</label>
                    <input 
                      type="text" 
                      value={formData.contactPhone}
                      onChange={e => setFormData({ ...formData, contactPhone: e.target.value })}
                      placeholder="(800) 555-0199"
                      className="w-full p-2.5 rounded-lg border border-brand-border bg-brand-bg text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Portal login info */}
              <div className="space-y-3 pt-2">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-primary/80 border-b border-brand-border/30 pb-1">Dealer Portal Credentials</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-brand-secondary tracking-widest block mb-1">Dealer Username</label>
                    <input 
                      type="text" 
                      value={formData.loginUsername}
                      onChange={e => setFormData({ ...formData, loginUsername: e.target.value })}
                      placeholder="dealer_admin"
                      className="w-full p-2.5 rounded-lg border border-brand-border bg-brand-bg text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-brand-secondary tracking-widest block mb-1">Dealer Password</label>
                    <input 
                      type="text" 
                      value={formData.loginPassword}
                      onChange={e => setFormData({ ...formData, loginPassword: e.target.value })}
                      placeholder="••••••••••••"
                      className="w-full p-2.5 rounded-lg border border-brand-border bg-brand-bg text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Notes / Special Terms */}
              <div className="space-y-3 pt-2">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-primary/80 border-b border-brand-border/30 pb-1">Internal Notes</h4>
                <div>
                  <textarea 
                    value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Enter any accounts terms, shipping guidelines, discount structures, etc."
                    rows={3}
                    className="w-full p-2.5 rounded-lg border border-brand-border bg-brand-bg text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary resize-none"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex gap-3 border-t border-brand-border/60">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-brand-bg border border-brand-border text-brand-secondary py-3 rounded-lg font-bold uppercase tracking-widest text-xs hover:bg-neutral-100 hover:text-brand-primary transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-brand-primary text-white py-3 rounded-lg font-bold uppercase tracking-widest text-xs hover:bg-black transition-all shadow-sm"
                >
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
