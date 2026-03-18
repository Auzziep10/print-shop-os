import { useAuth } from '../../contexts/AuthContext';
import { LogOut } from 'lucide-react';
import { PillButton } from '../../components/ui/PillButton';
import { Navigate } from 'react-router-dom';

export function WaitingRoom() {
  const { user, userData, signOut } = useAuth();
  
  if (!user) {
    return <Navigate to="/login" />;
  }

  // If somehow they have a legitimate role, send them to the app
  if (userData && userData.role !== 'Pending') {
    return <Navigate to="/" />;
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col justify-center items-center p-6 relative overflow-hidden">
      
      {/* Decorative Background Elements */}
      <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-brand-primary/5 blur-3xl mix-blend-multiply" />
      <div className="absolute -bottom-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-brand-primary/5 blur-3xl mix-blend-multiply" />

      <div className="w-full max-w-md bg-white p-10 rounded-2xl border border-brand-border shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative z-10 text-center">
        
        {/* Branding */}
        <div className="flex flex-col items-center mb-6">
          <img src="/logo.png" alt="WOVN" className="h-8 mb-4" />
          <h1 className="font-serif text-3xl text-brand-primary tracking-tight">Account Pending</h1>
        </div>

        <p className="text-sm text-brand-secondary mb-8 leading-relaxed">
          Your account has been created successfully, but is currently awaiting role assignment. Please hold tight while an administrator reviews your account.
        </p>

        <PillButton variant="outline" onClick={() => signOut()} className="w-full py-3.5 flex justify-center mt-2 group gap-2">
          <LogOut size={16} />
          Sign Out
        </PillButton>
        
      </div>
      
      <p className="text-xs text-brand-secondary mt-10 z-10 font-medium">
        &copy; {new Date().getFullYear()} Print Shop OS. All rights reserved.
      </p>
    </div>
  );
}
