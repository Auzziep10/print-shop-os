import { useAuth } from '../../contexts/AuthContext';
import { auth } from '../firebase';

/** The signed-in teammate as chat sees them (real account, not role preview). */
export function useChatMe() {
  const { user, actualUserData } = useAuth();
  const uid = user?.uid || auth.currentUser?.uid || '';
  const name = actualUserData?.name || user?.displayName || user?.email?.split('@')[0] || 'Teammate';
  return { uid, name, role: actualUserData?.role || '' };
}
