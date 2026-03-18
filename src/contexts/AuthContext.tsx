import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { collection, query, where, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export type UserRole = 'Staff' | 'Manager' | 'Leadership' | 'Admin' | 'Client';

export interface UserData {
  id: string; // Firestore document ID
  uid?: string; // Firebase Auth UID (set on first login)
  email: string;
  name: string;
  role: UserRole;
  customerId?: string; // Only applicable for 'Client' role
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        if (!currentUser.email) {
          setUser(null);
          setUserData(null);
          setLoading(false);
          return;
        }

        try {
          // Check if user exists by email
          const q = query(collection(db, 'users'), where('email', '==', currentUser.email.toLowerCase()));
          const querySnapshot = await getDocs(q);

          if (querySnapshot.empty) {
            // Auto-grant Admin to the very first user
            const allUsersSnapshot = await getDocs(collection(db, 'users'));
            if (allUsersSnapshot.empty) {
              const newUserDocRef = doc(collection(db, 'users'));
              const newUserData: UserData = {
                id: newUserDocRef.id,
                email: currentUser.email.toLowerCase(),
                name: currentUser.displayName || '',
                role: 'Admin',
                createdAt: new Date().toISOString(),
                uid: currentUser.uid
              };
              await setDoc(newUserDocRef, newUserData);

              setUser(currentUser);
              setUserData(newUserData);
            } else {
              // Deny access because they are not invited
              await firebaseSignOut(auth);
              setUser(null);
              setUserData(null);
              console.error('User not authorized. No role assigned.');
            }
          } else {
            // User exists, grab the data
            const userDoc = querySnapshot.docs[0];
            const data = userDoc.data() as UserData;

            // Update uid and name if empty
            if (!data.uid || !data.name) {
              await updateDoc(userDoc.ref, { 
                uid: currentUser.uid, 
                name: currentUser.displayName || data.name || '' 
              });
              data.uid = currentUser.uid;
              data.name = currentUser.displayName || data.name || '';
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

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Error signing in with Google', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const value = {
    user,
    userData,
    loading,
    signInWithGoogle,
    signOut,
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
