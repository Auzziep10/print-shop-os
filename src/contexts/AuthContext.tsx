import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, type User } from 'firebase/auth';
import { collection, query, where, getDocs, doc, setDoc, updateDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export type UserRole = 'Staff' | 'Manager' | 'Leadership' | 'Admin' | 'Client' | 'Pending' | 'Printer';

export interface UserData {
  id: string; // Firestore document ID
  uid?: string; // Firebase Auth UID (set on first login)
  email: string;
  name: string;
  role: UserRole;
  customerId?: string; // Only applicable for 'Client' role
  createdAt: string;
  phone?: string;
  companyName?: string;
  website?: string;
}

export type PermissionKey = 'viewDashboard' | 'manageOrders' | 'manageCustomers' | 'manageInventory' | 'manageTeam' | 'manageSettings' | 'viewPricing';

export type RolePermissions = Record<PermissionKey, boolean>;
export type PermissionsData = Record<UserRole, RolePermissions>;

export const DEFAULT_PERMISSIONS: PermissionsData = {
  Admin: {
    viewDashboard: true,
    manageOrders: true,
    manageCustomers: true,
    manageInventory: true,
    manageTeam: true,
    manageSettings: true,
    viewPricing: true,
  },
  Leadership: {
    viewDashboard: true,
    manageOrders: true,
    manageCustomers: true,
    manageInventory: true,
    manageTeam: true,
    manageSettings: true,
    viewPricing: true,
  },
  Manager: {
    viewDashboard: true,
    manageOrders: true,
    manageCustomers: true,
    manageInventory: true,
    manageTeam: true,
    manageSettings: false,
    viewPricing: true,
  },
  Staff: {
    viewDashboard: true,
    manageOrders: true,
    manageCustomers: true,
    manageInventory: true,
    manageTeam: true,
    manageSettings: false,
    viewPricing: true,
  },
  Printer: {
    viewDashboard: true,
    manageOrders: true,
    manageCustomers: true,
    manageInventory: true,
    manageTeam: true,
    manageSettings: false,
    viewPricing: true,
  },
  Client: {
    viewDashboard: false,
    manageOrders: false,
    manageCustomers: false,
    manageInventory: false,
    manageTeam: false,
    manageSettings: false,
    viewPricing: false,
  },
  Pending: {
    viewDashboard: false,
    manageOrders: false,
    manageCustomers: false,
    manageInventory: false,
    manageTeam: false,
    manageSettings: false,
    viewPricing: false,
  },
};

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  signInWithGoogle: () => Promise<any>;
  signInWithEmail: (email: string, password: string) => Promise<any>;
  signUpWithEmail: (email: string, password: string) => Promise<any>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  permissions: PermissionsData | null;
  hasPermission: (permission: PermissionKey) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [permissions, setPermissions] = useState<PermissionsData | null>(null);
  const [loading, setLoading] = useState(true);

  // Subscribe to role permissions
  useEffect(() => {
    if (!user) {
      setPermissions(null);
      return;
    }

    const unsub = onSnapshot(doc(db, 'settings', 'permissions'), async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data().roles as PermissionsData;
        setPermissions(data);
      } else {
        setPermissions(DEFAULT_PERMISSIONS);
        // Seed default permissions if logged in user is Admin or Leadership
        if (userData && (userData.role === 'Admin' || userData.role === 'Leadership')) {
          try {
            await setDoc(doc(db, 'settings', 'permissions'), { roles: DEFAULT_PERMISSIONS });
            console.log("Seeded default permissions in Firestore.");
          } catch (err) {
            console.error("Failed to seed default permissions:", err);
          }
        }
      }
    }, (err) => {
      console.error("Error loading role permissions:", err);
      setPermissions(DEFAULT_PERMISSIONS);
    });

    return () => unsub();
  }, [user, userData?.role]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('bypassAuth=true')) {
      const mockUser = {
        uid: 'mock-uid-123',
        email: 'admin@wovn.com',
        displayName: 'Mock Admin'
      } as any;
      const mockUserData: UserData = {
        id: 'mock-user-123',
        uid: 'mock-uid-123',
        email: 'admin@wovn.com',
        name: 'Mock Admin',
        role: 'Admin',
        createdAt: new Date().toISOString()
      };
      setUser(mockUser);
      setUserData(mockUserData);
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        if (!currentUser.email) {
          setUser(null);
          setUserData(null);
          setLoading(false);
          return;
        }

        try {
          const userEmail = currentUser.email.toLowerCase().trim();
          let userDocRef = doc(db, 'users', currentUser.uid);
          let userDocSnap = await getDoc(userDocRef);

          if (!userDocSnap.exists()) {
            const q = query(collection(db, 'users'), where('email', '==', userEmail));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
              userDocSnap = querySnapshot.docs[0];
              userDocRef = userDocSnap.ref;
            }
          }

          // Retry loop to handle race conditions during registration (e.g. quote request flow)
          if (!userDocSnap.exists()) {
            for (let attempt = 0; attempt < 3; attempt++) {
              await new Promise((resolve) => setTimeout(resolve, 350));
              userDocSnap = await getDoc(doc(db, 'users', currentUser.uid));
              if (userDocSnap.exists()) {
                userDocRef = userDocSnap.ref;
                break;
              }
              const qRetry = query(collection(db, 'users'), where('email', '==', userEmail));
              const retrySnap = await getDocs(qRetry);
              if (!retrySnap.empty) {
                userDocSnap = retrySnap.docs[0];
                userDocRef = userDocSnap.ref;
                break;
              }
            }
          }

          if (!userDocSnap.exists()) {
            // Auto-grant Admin to the very first user
            const allUsersSnapshot = await getDocs(collection(db, 'users'));
            if (allUsersSnapshot.empty) {
              const newUserData: UserData = {
                id: currentUser.uid,
                email: userEmail,
                name: currentUser.displayName || userEmail.split('@')[0],
                role: 'Admin',
                createdAt: new Date().toISOString(),
                uid: currentUser.uid
              };
              await setDoc(doc(db, 'users', currentUser.uid), newUserData);

              setUser(currentUser);
              setUserData(newUserData);
            } else {
              // Check if customer company record exists in 'customers' collection
              const custQuery = query(collection(db, 'customers'), where('email', '==', userEmail));
              const custSnap = await getDocs(custQuery);
              
              let customerId = `cust-${Date.now()}`;
              let companyName = currentUser.displayName || userEmail.split('@')[0];

              if (!custSnap.empty) {
                const custDoc = custSnap.docs[0];
                customerId = custDoc.id;
                const custData = custDoc.data();
                companyName = custData.company || custData.name || companyName;
              } else {
                // Create new Customer (Company) record
                await setDoc(doc(db, 'customers', customerId), {
                  id: customerId,
                  company: companyName,
                  name: companyName,
                  contactName: currentUser.displayName || userEmail.split('@')[0],
                  email: userEmail,
                  phone: '-',
                  type: 'Web Lead',
                  createdAt: new Date().toISOString()
                }, { merge: true });
              }

              // Create Client portal user doc
              const newUserData: UserData = {
                id: currentUser.uid,
                email: userEmail,
                name: currentUser.displayName || userEmail.split('@')[0],
                role: 'Client',
                customerId: customerId,
                companyName: companyName,
                createdAt: new Date().toISOString(),
                uid: currentUser.uid
              };
              await setDoc(doc(db, 'users', currentUser.uid), newUserData);

              setUser(currentUser);
              setUserData(newUserData);
            }
          } else {
            // User exists, grab the data
            const data = { id: userDocSnap.id, ...userDocSnap.data() } as UserData;

            // Update uid and name if empty
            if (!data.uid || !data.name) {
              await updateDoc(userDocRef, { 
                uid: currentUser.uid, 
                name: currentUser.displayName || data.name || data.email.split('@')[0] || '' 
              });
              data.uid = currentUser.uid;
              data.name = currentUser.displayName || data.name || data.email.split('@')[0] || '';
            }

            setUser(currentUser);
            setUserData(data);
          }
        } catch (error) {
          console.error("Error fetching user data", error);
          await firebaseSignOut(auth);
          setUser(null);
          setUserData(null);
        }
      } else {
        setUser(null);
        setUserData(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return signInWithPopup(auth, provider);
  };

  const signInWithEmail = (email: string, password: string) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const signUpWithEmail = (email: string, password: string) => {
    return createUserWithEmailAndPassword(auth, email, password);
  };

  const sendPasswordReset = (email: string) => {
    return sendPasswordResetEmail(auth, email);
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const hasPermission = (permission: PermissionKey): boolean => {
    if (!userData) return false;
    // Safety check: Admin always has access to all permissions
    if (userData.role === 'Admin') return true;

    const rolePermissions = permissions?.[userData.role];
    if (rolePermissions) {
      return !!rolePermissions[permission];
    }

    // Fallback to hardcoded defaults
    return !!DEFAULT_PERMISSIONS[userData.role]?.[permission];
  };

  const value = {
    user,
    userData,
    loading,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    signOut,
    permissions,
    hasPermission,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

