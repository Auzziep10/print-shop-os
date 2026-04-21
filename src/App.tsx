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
import { PortalRequestQuote } from './pages/Portal/PortalRequestQuote';
import { SeedData } from './pages/Seed';
import { Settings } from './pages/Settings/Settings';
import { WaitingRoom } from './pages/Auth/WaitingRoom';
import { PackingSlipView } from './pages/Public/PackingSlipView';
import { OrderSummaryView } from './pages/Public/OrderSummaryView';
import { PrintLabel } from './pages/Print/PrintLabel';
import { PrintLabelsSheet } from './pages/Print/PrintLabelsSheet';
import { PrintCourierLabel } from './pages/Print/PrintCourierLabel';
import { PrintItemLabels } from './pages/Print/PrintItemLabels';
import { Production } from './pages/Production/Production';
import { PublicQuoteRequest } from './pages/Public/PublicQuoteRequest';

import { Inventory } from './pages/Inventory/Inventory';
import { InventoryScan } from './pages/Inventory/InventoryScan';
import { Signatures } from './pages/Signatures/Signatures';
import { MobileUpload } from './pages/MobileUpload/MobileUpload';

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
        <Route path="/start" element={<PublicQuoteRequest />} />
        
        {/* Temp Seed Route */}
        <Route path="/seed" element={<SeedData />} />

        {/* Mobile App Sync */}
        <Route path="/mobile-upload/:sessionId" element={<MobileUpload />} />

        {/* Public Packing Slip Views */}
        <Route path="/order-summary/:orderId" element={<OrderSummaryView />} />
        <Route path="/packing-slip/:orderId/:boxId" element={<PackingSlipView />} />
        <Route path="/packing-slip/:orderId/item/:itemId" element={<PackingSlipView />} />
        
        <Route path="/print/label/:orderId/:boxId" element={
          <PrivateRoute>
            <PrintLabel />
          </PrivateRoute>
        } />
        <Route path="/print/label/:orderId/item/:itemId" element={
          <PrivateRoute>
            <PrintLabel />
          </PrivateRoute>
        } />
        <Route path="/print/labels-sheet/:orderId" element={
          <PrivateRoute>
            <PrintLabelsSheet />
          </PrivateRoute>
        } />
        <Route path="/print/labels-sheet/:orderId/item/:itemId" element={
          <PrivateRoute>
            <PrintLabelsSheet />
          </PrivateRoute>
        } />
        <Route path="/print/item-labels/:orderId" element={
          <PrivateRoute>
            <PrintItemLabels />
          </PrivateRoute>
        } />
        <Route path="/print/courier/:orderId/item/:itemId" element={
          <PrivateRoute>
            <PrintCourierLabel />
          </PrivateRoute>
        } />

        {/* Mobile Inventory Box Scanning */}
        <Route path="/inventory/scan" element={
          <PrivateRoute>
            <InventoryScan />
          </PrivateRoute>
        } />

        {/* Public Client Portal Routes */}
        <Route path="/portal" element={<PortalLayout />}>
          <Route index element={<PortalOrders />} />
          <Route path="quote" element={<PortalRequestQuote />} />
          <Route path=":customerId" element={<PortalOrders />} />
          <Route path=":customerId/create" element={<PortalCreateOrder />} />
          <Route path=":customerId/quote" element={<PortalRequestQuote />} />
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
        <Route path="production" element={<Production />} />
        <Route path="artwork" element={<div className="p-6">Artwork coming soon...</div>} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="team" element={<Team />} />
        <Route path="signatures" element={<Signatures />} />
          <Route path="reports" element={<div className="p-6">Reports coming soon...</div>} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
