import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, addDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, auth, firebaseConfig } from '../../lib/firebase';
import type { UserData, UserRole } from '../../contexts/AuthContext';
import { useAuth } from '../../contexts/AuthContext';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { Plus, Trash2, Edit2, Shield, Loader2, Sparkles, ArrowUp, ArrowDown, ArrowUpDown, Search, Eye, EyeOff, Mail } from 'lucide-react';
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
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [formError, setFormError] = useState('');

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
    setPassword('');
    setShowPassword(false);
    setFormError('');
    setResetSent(false);
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
    setPassword('');
    setShowPassword(false);
    setFormError('');
    setResetSent(false);
    setIsModalOpen(true);
  };

  const handleSendResetEmail = async (targetEmail: string) => {
    try {
      await sendPasswordResetEmail(auth, targetEmail);
      setResetSent(true);
      setTimeout(() => setResetSent(false), 5000);
    } catch (err: any) {
      console.error('Password reset error:', err);
      alert(`Failed to send password reset email: ${err.message}`);
    }
  };

  const handleSubmitUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    if (password.trim() && password.trim().length < 6) {
      setFormError('Password must be at least 6 characters long.');
      return;
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      let createdUid = editingUser?.uid || '';

      // Create Firebase Auth credentials if a password is provided
      if (password.trim()) {
        const tempApp = initializeApp(firebaseConfig, `temp-auth-team-${Date.now()}`);
        const tempAuth = getAuth(tempApp);
        try {
          const userCredential = await createUserWithEmailAndPassword(
            tempAuth,
            email.trim().toLowerCase(),
            password.trim()
          );
          createdUid = userCredential.user.uid;
        } catch (authErr: any) {
          console.error("Auth creation error:", authErr);
          if (authErr.code === 'auth/email-already-in-use') {
            setFormError('An account with this email already exists in Firebase Auth. You can send a Password Reset email below.');
            setIsSubmitting(false);
            return;
          } else {
            setFormError(`Failed to set password: ${authErr.message}`);
            setIsSubmitting(false);
            return;
          }
        } finally {
          await deleteApp(tempApp);
        }
      }

      const dbObj: any = {
        email: email.toLowerCase().trim(),
        name: name.trim(),
        role,
        phone: phone.trim(),
        companyName: companyName.trim(),
      };
      if (createdUid) {
        dbObj.uid = createdUid;
      }
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
    } catch (error: any) {
      console.error('Error saving user:', error);
      setFormError(`Error saving user: ${error.message}`);
    } finally {
      setIsSubmitting(false);
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

  // Pending & active users filtering and sorting (Hooks called at top-level)
  const pendingUsers = useMemo(() => users.filter(u => u.role === 'Pending'), [users]);
  const activeUsers = useMemo(() => users.filter(u => u.role !== 'Pending'), [users]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-brand-primary" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-brand-primary">Team Members &amp; Users</h2>
          <p className="text-brand-secondary text-xs mt-0.5">Manage staff, managers, printers, clients, and role permissions.</p>
        </div>
        <PillButton variant="filled" className="gap-2 self-start sm:self-auto" onClick={handleOpenCreate}>
          <Plus size={16} />
          Invite New User
        </PillButton>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-secondary pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by name, email, role, or client profile..."
          className="w-full pl-9 pr-4 py-2 border border-brand-border rounded-xl text-xs bg-brand-bg/50 focus:ring-1 focus:ring-brand-primary outline-none"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-secondary hover:text-brand-primary text-xs font-semibold"
          >
            Clear
          </button>
        )}
      </div>

      {/* Pending Users Alert Banner */}
      {pendingUsers.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
            <Sparkles size={16} />
            <span>Pending Self-Registrations ({pendingUsers.length})</span>
          </div>
          <p className="text-amber-700/80 text-xs">
            The following users signed up on the login screen and are waiting for an admin to assign their role.
          </p>
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-amber-500/20 text-amber-900/60 uppercase font-semibold">
                <th className="py-2">User</th>
                <th className="py-2">Email</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-500/10">
              {pendingUsers.map(user => (
                <tr key={user.id}>
                  <td className="py-2.5 font-medium text-amber-950">{user.name || 'Pending...'}</td>
                  <td className="py-2.5 text-amber-900/80">
                    {user.email}
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
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-brand-primary mb-2">
              {editingUser ? 'Edit User' : 'Invite New User'}
            </h3>

            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-medium">
                {formError}
              </div>
            )}

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

              {/* Password Input for non-customer staff/admin/users */}
              <div>
                <label className="block text-xs uppercase font-bold text-brand-secondary mb-1">
                  {editingUser && editingUser.uid ? 'Set New Password (Optional)' : 'Password (Optional)'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-10 border border-brand-border rounded-lg text-sm focus:ring-1 focus:ring-brand-primary outline-none"
                    placeholder={editingUser && editingUser.uid ? 'Enter new password to overwrite' : 'Create an initial login password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-secondary hover:text-brand-primary"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-[11px] text-brand-secondary mt-1">
                  {editingUser && editingUser.uid
                    ? 'Setting a new password allows this user to log in directly.'
                    : 'If set, this creates an active login account for this team member immediately.'}
                </p>
              </div>

              {/* Password Reset option for existing users */}
              {editingUser && (
                <div className="pt-2 border-t border-brand-border/60 flex items-center justify-between">
                  <div className="text-xs text-brand-secondary">
                    Send password reset link?
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSendResetEmail(editingUser.email)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-bg hover:bg-brand-border/40 text-brand-primary text-xs font-semibold rounded-lg transition-colors border border-brand-border"
                  >
                    <Mail size={13} />
                    Send Reset Email
                  </button>
                </div>
              )}

              {resetSent && (
                <div className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg font-medium">
                  ✓ Password reset email sent successfully!
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <PillButton variant="outline" type="button" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
                  Cancel
                </PillButton>
                <PillButton variant="filled" type="submit" disabled={isSubmitting} className="gap-2">
                  {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                  {editingUser ? 'Save Changes' : 'Invite User'}
                </PillButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
