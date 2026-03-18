import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { UserData, UserRole } from '../../contexts/AuthContext';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Trash2, Edit2, Shield, Loader2, Sparkles } from 'lucide-react';
import { PillButton } from '../../components/ui/PillButton';
import { MOCK_CUSTOMERS_DB } from '../../lib/mockData';

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
  
  // Form state
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('Staff');
  const [customerId, setCustomerId] = useState('');

  const ROLES: UserRole[] = ['Staff', 'Manager', 'Leadership', 'Admin', 'Client', 'Pending'];

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

      const mockCustomersData = Object.entries(MOCK_CUSTOMERS_DB).map(([custId, mockObj]) => ({
        id: custId,
        name: mockObj.company || 'Unnamed Mock Customer'
      }));

      const allCustomersMap = new Map<string, CustomerOption>();
      mockCustomersData.forEach(c => allCustomersMap.set(c.id, c));
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
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: UserData) => {
    setEditingUser(user);
    setEmail(user.email);
    setName(user.name);
    setRole(user.role);
    setCustomerId(user.customerId || '');
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
      };
      if (role === 'Client') dbObj.customerId = customerId;
      else dbObj.customerId = null; // Wait, Firestore doesn't like undefined. Let's send null but cast appropriately or remove it.

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

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-semibold text-brand-primary">Users & Permissions</h2>
          <p className="text-sm text-brand-secondary mt-1">Manage team members and client access.</p>
        </div>
        <PillButton variant="filled" className="gap-2" onClick={handleOpenCreate}>
          <Plus size={16} />
          Invite User
        </PillButton>
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
                  </td>
                  <td className="px-4 py-3 flex justify-end gap-2">
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
              <th className="px-4 py-3 font-semibold">User</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Client Profile</th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {activeUsers.map(user => (
              <tr key={user.id} className="border-b border-brand-border/50 hover:bg-brand-bg/30">
                <td className="px-4 py-3">
                  <div className="font-medium text-brand-primary">{user.name || 'Pending...'}</div>
                  <div className="text-brand-secondary text-xs">{user.email}</div>
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
                     customers.find(c => c.id === user.customerId)?.name || user.customerId || 'Not assigned'
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
            {activeUsers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-brand-secondary">No active users found.</td>
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
