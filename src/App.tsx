import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { Team } from './pages/Team/Team';
import { OrdersList } from './pages/Orders/OrdersList';
import { OrderDetail } from './pages/Orders/OrderDetail';
import { CustomersList } from './pages/Customers/CustomersList';
import { CustomerDetail } from './pages/Customers/CustomerDetail';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Login } from './pages/Auth/Login';
import { Navigate } from 'react-router-dom';
import { PortalLayout } from './components/layout/PortalLayout';
import { PortalOrders } from './pages/Portal/PortalOrders';
import { PortalCreateOrder } from './pages/Portal/PortalCreateOrder';
import { SeedData } from './pages/Seed';
import { Settings } from './pages/Settings/Settings';
import { WaitingRoom } from './pages/Auth/WaitingRoom';
import { PackingSlipView } from './pages/Public/PackingSlipView';
import { PrintLabel } from './pages/Print/PrintLabel';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, userData, loading } = useAuth();
  
  if (loading || (user && !userData)) {
    return <div className="min-h-screen flex items-center justify-center bg-brand-bg text-brand-secondary font-serif">Loading...</div>;
  }
  
  if (user && userData?.role === 'Pending') {
    return <Navigate to="/waiting" />;
  }

  if (user && userData?.role === 'Client') {
    return <Navigate to={`/portal/${userData.customerId || ''}`} />;
  }
  
  return user ? <>{children}</> : <Navigate to="/login" />;
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/waiting" element={<WaitingRoom />} />
        
        {/* Temp Seed Route */}
        <Route path="/seed" element={<SeedData />} />

        {/* Public Packing Slip Views */}
        <Route path="/packing-slip/:orderId/:boxId" element={<PackingSlipView />} />
        
        <Route path="/print/label/:orderId/:boxId" element={
          <PrivateRoute>
            <PrintLabel />
          </PrivateRoute>
        } />

        {/* Public Client Portal Routes */}
        <Route path="/portal" element={<PortalLayout />}>
          <Route index element={<PortalOrders />} />
          <Route path=":customerId" element={<PortalOrders />} />
          <Route path=":customerId/create" element={<PortalCreateOrder />} />
        </Route>

        {/* Protected Application Routes */}
        <Route path="/" element={
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        }>
          {/* Main Dashboard Index */}
          <Route index element={<Dashboard />} />
        
        <Route path="orders">
          <Route index element={<OrdersList />} />
          <Route path=":id" element={<OrderDetail />} />
        </Route>
        <Route path="customers">
          <Route index element={<CustomersList />} />
          <Route path=":id" element={<CustomerDetail />} />
        </Route>
        <Route path="production" element={<div className="p-6">Production coming soon...</div>} />
        <Route path="artwork" element={<div className="p-6">Artwork coming soon...</div>} />
        <Route path="team" element={<Team />} />
          <Route path="reports" element={<div className="p-6">Reports coming soon...</div>} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
