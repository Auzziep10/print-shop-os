import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { PortalLayout } from './components/layout/PortalLayout';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Lazy-loaded page components
const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard').then(m => ({ default: m.Dashboard })));
const Team = lazy(() => import('./pages/Team/Team').then(m => ({ default: m.Team })));
const TeamMeetingsPage = lazy(() => import('./pages/Team/TeamMeetingsPage').then(m => ({ default: m.TeamMeetingsPage })));
const OrdersList = lazy(() => import('./pages/Orders/OrdersList').then(m => ({ default: m.OrdersList })));
const OrderDetail = lazy(() => import('./pages/Orders/OrderDetail').then(m => ({ default: m.OrderDetail })));
const CustomersList = lazy(() => import('./pages/Customers/CustomersList').then(m => ({ default: m.CustomersList })));
const CustomerDetail = lazy(() => import('./pages/Customers/CustomerDetail').then(m => ({ default: m.CustomerDetail })));
const Login = lazy(() => import('./pages/Auth/Login').then(m => ({ default: m.Login })));
const PortalOrders = lazy(() => import('./pages/Portal/PortalOrders').then(m => ({ default: m.PortalOrders })));
const PortalCreateOrder = lazy(() => import('./pages/Portal/PortalCreateOrder').then(m => ({ default: m.PortalCreateOrder })));
const PortalRequestQuote = lazy(() => import('./pages/Portal/PortalRequestQuote').then(m => ({ default: m.PortalRequestQuote })));
const SeedData = lazy(() => import('./pages/Seed').then(m => ({ default: m.SeedData })));
const Settings = lazy(() => import('./pages/Settings/Settings').then(m => ({ default: m.Settings })));
const WaitingRoom = lazy(() => import('./pages/Auth/WaitingRoom').then(m => ({ default: m.WaitingRoom })));
const PackingSlipView = lazy(() => import('./pages/Public/PackingSlipView').then(m => ({ default: m.PackingSlipView })));
const OrderSummaryView = lazy(() => import('./pages/Public/OrderSummaryView').then(m => ({ default: m.OrderSummaryView })));
const PrintLabel = lazy(() => import('./pages/Print/PrintLabel').then(m => ({ default: m.PrintLabel })));
const PrintLabelsSheet = lazy(() => import('./pages/Print/PrintLabelsSheet').then(m => ({ default: m.PrintLabelsSheet })));
const PrintCourierLabel = lazy(() => import('./pages/Print/PrintCourierLabel').then(m => ({ default: m.PrintCourierLabel })));
const PrintItemLabels = lazy(() => import('./pages/Print/PrintItemLabels').then(m => ({ default: m.PrintItemLabels })));
const PublicQuoteRequest = lazy(() => import('./pages/Public/PublicQuoteRequest').then(m => ({ default: m.PublicQuoteRequest })));
const InvoiceView = lazy(() => import('./pages/Public/InvoiceView').then(m => ({ default: m.InvoiceView })));
const SmsConsent = lazy(() => import('./pages/Public/SmsConsent').then(m => ({ default: m.SmsConsent })));
const Inventory = lazy(() => import('./pages/Inventory/Inventory').then(m => ({ default: m.Inventory })));
const InventoryScan = lazy(() => import('./pages/Inventory/InventoryScan').then(m => ({ default: m.InventoryScan })));
const MobileUpload = lazy(() => import('./pages/MobileUpload/MobileUpload').then(m => ({ default: m.MobileUpload })));

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, userData, loading } = useAuth();
  const location = useLocation();
  
  if (loading || (user && !userData)) {
    return <div className="min-h-screen flex items-center justify-center bg-brand-bg text-brand-secondary font-serif">Loading...</div>;
  }
  
  if (user && userData?.role === 'Pending') {
    return <Navigate to="/waiting" />;
  }

  if (user && userData?.role === 'Client') {
    return <Navigate to={`/portal/${userData.customerId || ''}`} />;
  }
  
  return user ? <>{children}</> : <Navigate to="/login" state={{ from: location }} replace />;
}

function App() {
  return (
    <AuthProvider>
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-brand-bg text-brand-secondary font-serif">
          Loading...
        </div>
      }>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/waiting" element={<WaitingRoom />} />
          <Route path="/start" element={<PublicQuoteRequest />} />
          <Route path="/sms-opt-in" element={<SmsConsent />} />
          
          {/* Temp Seed Route */}
          <Route path="/seed" element={<SeedData />} />

          {/* Mobile App Sync */}
          <Route path="/mobile-upload/:sessionId" element={<MobileUpload />} />

          {/* Public Packing Slip Views */}
          <Route path="/order-summary/:orderId" element={<OrderSummaryView />} />
          <Route path="/invoice/:orderId" element={<InvoiceView />} />
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
          <Route path="production" element={<Navigate to="/orders?tab=production" replace />} />
          <Route path="artwork" element={<Navigate to="/orders?tab=production&sub=artwork" replace />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="team" element={<Team />} />
          <Route path="team/meetings" element={<TeamMeetingsPage />} />
          <Route path="signatures" element={<Navigate to="/settings?tab=signatures" replace />} />
            <Route path="reports" element={<Navigate to="/orders?tab=reports" replace />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}

export default App;
