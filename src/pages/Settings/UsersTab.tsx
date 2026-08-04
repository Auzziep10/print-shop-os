import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, addDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { UserData, UserRole } from '../../contexts/AuthContext';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Trash2, Edit2, Shield, Loader2, Sparkles, ArrowUp, ArrowDown, ArrowUpDown, Search } from 'lucide-react';
import { PillButton } from '../../components/ui/PillButton';

interface CustomerOption {
  id: string;
  name: string;
}

export function UsersTab() {
  const { userData } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  
  // Sorting & Filtering State
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'user' | 'role' | 'clientProfile'>('user');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Form state
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('Staff');
  const [customerId, setCustomerId] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');

  const ROLES: UserRole[] = ['Staff', 'Printer', 'Manager', 'Leadership', 'Admin', 'Client', 'Pending'];

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [usersSnapshot, customersSnapshot] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'customers'))
      ]);

      const usersData = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserData));
      
      const liveCustomersData = customersSnapshot.docs.map(doc => {
        const d = doc.data();
        return { id: doc.id, name: d.company || d.companyName || d.name || 'Unnamed Customer' };
      });

      const allCustomersMap = new Map<string, CustomerOption>();
      liveCustomersData.forEach(c => allCustomersMap.set(c.id, c));

      const sortedCustomers = Array.from(allCustomersMap.values()).sort((a,b) => a.name.localeCompare(b.name));

      setUsers(usersData);
      setCustomers(sortedCustomers);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenCreate = () => {
    setEditingUser(null);
    setEmail('');
    setName('');
    setRole('Staff');
    setCustomerId('');
    setPhone('');
    setCompanyName('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: UserData) => {
    setEditingUser(user);
    setEmail(user.email);
    setName(user.name);
    setRole(user.role);
    setCustomerId(user.customerId || '');
    setPhone(user.phone || '');
    setCompanyName(user.companyName || '');
    setIsModalOpen(true);
  };

  const handleSubmitUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    try {
      const dbObj: any = {
        email: email.toLowerCase(),
        name,
        role,
        phone,
        companyName,
      };
      if (role === 'Client') dbObj.customerId = customerId;
      else dbObj.customerId = null;

      if (editingUser) {
        await updateDoc(doc(db, 'users', editingUser.id), dbObj);
        setUsers(users.map(u => u.id === editingUser.id ? { ...u, ...dbObj } : u));
      } else {
        const newUser = {
          ...dbObj,
          createdAt: new Date().toISOString(),
        };
        const docRef = await addDoc(collection(db, 'users'), newUser);
        setUsers([...users, { id: docRef.id, ...newUser } as UserData]);
      }
      
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving user:', error);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this user? This will severely break their access.')) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
      setUsers(users.filter(u => u.id !== userId));
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-brand-secondary">
        <Loader2 className="animate-spin w-6 h-6" />
      </div>
    );
  }

  // Pending users logic
  const pendingUsers = users.filter(u => u.role === 'Pending');
  const activeUsers = users.filter(u => u.role !== 'Pending');

  const handleSort = (field: 'user' | 'role' | 'clientProfile') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const filteredAndSortedUsers = useMemo(() => {
    return activeUsers
      .filter(u => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        const clientName = customers.find(c => c.id === u.customerId)?.name || u.companyName || '';
        return (
          (u.name || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.role || '').toLowerCase().includes(q) ||
          clientName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        let comp = 0;
        if (sortField === 'user') {
          const nameA = (a.name || a.email || '').toLowerCase();
          const nameB = (b.name || b.email || '').toLowerCase();
          comp = nameA.localeCompare(nameB);
        } else if (sortField === 'role') {
          const roleOrder: Record<string, number> = {
            Admin: 1,
            Leadership: 2,
            Manager: 3,
            Staff: 4,
            Printer: 5,
            Client: 6,
            Pending: 7,
          };
          const rankA = roleOrder[a.role] ?? 99;
          const rankB = roleOrder[b.role] ?? 99;
          comp = rankA - rankB;
          if (comp === 0) {
            comp = (a.name || a.email || '').localeCompare(b.name || b.email || '');
          }
        } else if (sortField === 'clientProfile') {
          const clientNameA = a.role === 'Client' 
            ? (customers.find(c => c.id === a.customerId)?.name || a.companyName || 'Not assigned').toLowerCase() 
            : 'z_none';
          const clientNameB = b.role === 'Client' 
            ? (customers.find(c => c.id === b.customerId)?.name || b.companyName || 'Not assigned').toLowerCase() 
            : 'z_none';
          comp = clientNameA.localeCompare(clientNameB);
          if (comp === 0) {
            comp = (a.name || a.email || '').localeCompare(b.name || b.email || '');
          }
        }
        return sortOrder === 'asc' ? comp : -comp;
      });
  }, [activeUsers, customers, searchQuery, sortField, sortOrder]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-lg font-semibold text-brand-primary">Users & Permissions</h2>
          <p className="text-sm text-brand-secondary mt-1">Manage team members and client access.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-secondary" size={15} />
            <input
              type="text"
              placeholder="Search users, roles, or clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-brand-border rounded-xl text-xs font-medium focus:outline-none focus:border-brand-primary/40 transition-colors"
            />
          </div>
          <PillButton variant="filled" className="gap-2 shrink-0" onClick={handleOpenCreate}>
            <Plus size={16} />
            Invite User
          </PillButton>
        </div>
      </div>

      {pendingUsers.length > 0 && (
        <div className="mb-8 border border-yellow-200 bg-yellow-50 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-yellow-100/50 border-b border-yellow-200 flex items-center gap-2">
            <Sparkles className="text-yellow-600" size={16} />
            <h3 className="text-sm font-bold text-yellow-800 tracking-wide uppercase">Requires Action ({pendingUsers.length})</h3>
          </div>
          <table className="w-full text-sm text-left whitespace-nowrap">
            <tbody>
              {pendingUsers.map(user => (
                <tr key={user.id} className="border-b border-yellow-200/50 hover:bg-yellow-100/30 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-brand-primary">{user.name || 'Unnamed User'}</div>
                    <div className="text-amber-700/70 text-xs">{user.email}</div>
                    {user.phone && user.phone !== '-' && (
                      <div className="text-amber-700/70 text-xs mt-0.5 font-medium">Phone: {user.phone}</div>
                    )}
                    {user.companyName && user.companyName !== '-' && (
                      <div className="text-amber-700/70 text-xs mt-0.5 font-medium">Company: {user.companyName}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 flex justify-end gap-2 text-right">
                    <PillButton variant="filled" className="bg-amber-500 border-amber-500 hover:bg-amber-600 px-3 py-1.5 h-auto text-xs" onClick={() => handleOpenEdit(user)}>
                      Assign Role
                    </PillButton>
                    <button onClick={() => handleDeleteUser(user.id)} className="p-1.5 text-amber-700 hover:text-red-600 rounded-md transition-colors" title="Delete User">
                        <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="text-xs text-brand-secondary uppercase bg-brand-bg/50 border-b border-brand-border">
            <tr>
              <th 
                onClick={() => handleSort('user')}
                className="px-4 py-3 font-semibold cursor-pointer select-none hover:text-brand-primary transition-colors"
                title="Click to sort by User Name / Email A-Z"
              >
                <div className="flex items-center gap-1.5">
                  <span>USER</span>
                  {sortField === 'user' ? (
                    sortOrder === 'asc' ? <ArrowUp size={13} className="text-brand-primary" /> : <ArrowDown size={13} className="text-brand-primary" />
                  ) : (
                    <ArrowUpDown size={12} className="opacity-40" />
                  )}
                </div>
              </th>
              <th 
                onClick={() => handleSort('role')}
                className="px-4 py-3 font-semibold cursor-pointer select-none hover:text-brand-primary transition-colors"
                title="Click to sort by Role"
              >
                <div className="flex items-center gap-1.5">
                  <span>ROLE</span>
                  {sortField === 'role' ? (
                    sortOrder === 'asc' ? <ArrowUp size={13} className="text-brand-primary" /> : <ArrowDown size={13} className="text-brand-primary" />
                  ) : (
                    <ArrowUpDown size={12} className="opacity-40" />
                  )}
                </div>
              </th>
              <th 
                onClick={() => handleSort('clientProfile')}
                className="px-4 py-3 font-semibold cursor-pointer select-none hover:text-brand-primary transition-colors"
                title="Click to sort by Client Profile / Company A-Z"
              >
                <div className="flex items-center gap-1.5">
                  <span>CLIENT PROFILE</span>
                  {sortField === 'clientProfile' ? (
                    sortOrder === 'asc' ? <ArrowUp size={13} className="text-brand-primary" /> : <ArrowDown size={13} className="text-brand-primary" />
                  ) : (
                    <ArrowUpDown size={12} className="opacity-40" />
                  )}
                </div>
              </th>
              <th className="px-4 py-3 font-semibold text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedUsers.map(user => (
              <tr key={user.id} className="border-b border-brand-border/50 hover:bg-brand-bg/30">
                <td className="px-4 py-3">
                  <div className="font-medium text-brand-primary">{user.name || 'Pending...'}</div>
                  <div className="text-brand-secondary text-xs">{user.email}</div>
                  {user.phone && user.phone !== '-' && (
                    <div className="text-brand-secondary text-xs mt-0.5">Phone: <span className="font-semibold text-brand-primary">{user.phone}</span></div>
                  )}
                  {user.companyName && user.companyName !== '-' && (
                    <div className="text-brand-secondary text-xs mt-0.5">Company: <span className="font-semibold text-brand-primary">{user.companyName}</span></div>
                  )}
                  {!user.uid && <span className="inline-block mt-1 px-2 py-0.5 bg-yellow-100 text-yellow-800 text-[10px] uppercase font-bold rounded">Never Logged In</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Shield size={14} className={user.role === 'Admin' ? 'text-brand-primary' : 'text-brand-secondary'} />
                    <span className="font-medium">{user.role}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-brand-secondary limit-w">
                  {user.role === 'Client' ? (
                     customers.find(c => c.id === user.customerId)?.name || user.companyName || user.customerId || 'Not assigned'
                  ) : '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleOpenEdit(user)} className="p-1.5 text-brand-secondary hover:text-brand-primary rounded-md transition-colors mr-1" title="Edit User">
                    <Edit2 size={16} />
                  </button>
                  {userData?.id !== user.id && (
                    <button onClick={() => handleDeleteUser(user.id)} className="p-1.5 text-brand-secondary hover:text-red-600 rounded-md transition-colors" title="Delete User">
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filteredAndSortedUsers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-brand-secondary">
                  {searchQuery ? `No users matching "${searchQuery}".` : 'No active users found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Invite / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-brand-primary mb-4">
              {editingUser ? 'Edit User' : 'Invite New User'}
            </h3>
            <form onSubmit={handleSubmitUser} className="space-y-4">
              <div>
                <label className="block text-xs uppercase font-bold text-brand-secondary mb-1">Email</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm focus:ring-1 focus:ring-brand-primary outline-none" placeholder="user@example.com" disabled={!!(editingUser && editingUser.uid)} />
                {editingUser && editingUser.uid && <p className="text-[10px] text-brand-secondary mt-1">Logged-in user emails cannot be changed.</p>}
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-brand-secondary mb-1">Name (Optional)</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm focus:ring-1 focus:ring-brand-primary outline-none" placeholder="John Doe" />
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-brand-secondary mb-1">Phone Number (Optional)</label>
                <input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm focus:ring-1 focus:ring-brand-primary outline-none" placeholder="(555) 555-5555" />
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-brand-secondary mb-1">Company Name (Optional)</label>
                <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm focus:ring-1 focus:ring-brand-primary outline-none" placeholder="Company Name" />
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-brand-secondary mb-1">Role</label>
                <select value={role} onChange={e => setRole(e.target.value as UserRole)} className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm focus:ring-1 focus:ring-brand-primary outline-none">
                  {ROLES.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              
              {role === 'Client' && (
                <div>
                  <label className="block text-xs uppercase font-bold text-brand-secondary mb-1">Link to Customer Profile</label>
                  <select value={customerId} onChange={e => setCustomerId(e.target.value)} required className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm focus:ring-1 focus:ring-brand-primary outline-none">
                    <option value="">Select a customer...</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}



              <div className="flex justify-end gap-3 mt-6">
                <PillButton variant="outline" type="button" onClick={() => setIsModalOpen(false)}>Cancel</PillButton>
                <PillButton variant="filled" type="submit">{editingUser ? 'Save Changes' : 'Invite'}</PillButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
