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

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-brand-bg text-brand-secondary font-serif">Loading...</div>;
  }
  
  return user ? <>{children}</> : <Navigate to="/login" />;
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        
        {/* Temp Seed Route */}
        <Route path="/seed" element={<SeedData />} />

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
          <Route path="settings" element={<div className="p-6">Settings coming soon...</div>} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
