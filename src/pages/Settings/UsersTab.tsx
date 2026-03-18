import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { UserData, UserRole } from '../../contexts/AuthContext';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Trash2, Shield, Loader2 } from 'lucide-react';
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
  
  // Form state
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('Staff');
  const [customerId, setCustomerId] = useState('');

  const ROLES: UserRole[] = ['Staff', 'Manager', 'Leadership', 'Admin', 'Client'];

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [usersSnapshot, customersSnapshot] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'customers'))
      ]);

      const usersData = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserData));
      const customersData = customersSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().companyName || doc.data().name } as CustomerOption));

      setUsers(usersData);
      setCustomers(customersData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    try {
      const newUser = {
        email: email.toLowerCase(),
        name,
        role,
        customerId: role === 'Client' ? customerId : null,
        createdAt: new Date().toISOString(),
      };
      
      const docRef = await addDoc(collection(db, 'users'), newUser);
      setUsers([...users, { id: docRef.id, ...newUser } as UserData]);
      
      // Reset form
      setIsModalOpen(false);
      setEmail('');
      setName('');
      setRole('Staff');
      setCustomerId('');
    } catch (error) {
      console.error('Error creating user:', error);
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

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-semibold text-brand-primary">Users & Permissions</h2>
          <p className="text-sm text-brand-secondary mt-1">Manage team members and client access.</p>
        </div>
        <PillButton variant="filled" className="gap-2" onClick={() => setIsModalOpen(true)}>
          <Plus size={16} />
          Invite User
        </PillButton>
      </div>

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
            {users.map(user => (
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
                  {userData?.id !== user.id && (
                    <button onClick={() => handleDeleteUser(user.id)} className="p-1.5 text-brand-secondary hover:text-red-600 rounded-md transition-colors" title="Delete User">
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-brand-secondary">No users found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Invite Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-brand-primary mb-4">Invite New User</h3>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs uppercase font-bold text-brand-secondary mb-1">Email</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm focus:ring-1 focus:ring-brand-primary outline-none" placeholder="user@example.com" />
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
                <PillButton variant="filled" type="submit">Invite</PillButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
