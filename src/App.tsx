import { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { PortalLayout } from './components/layout/PortalLayout';
import { AuthProvider, useAuth, type PermissionKey } from './contexts/AuthContext';

// Helper to automatically reload the page if a dynamically imported bundle fails to fetch (e.g. after a redeployment)
const safeLazy = (importFunc: () => Promise<any>) => {
  return lazy(async () => {
    try {
      return await importFunc();
    } catch (error) {
      console.error("Failed to load chunk, forcing reload:", error);
      const lastReload = localStorage.getItem('last_chunk_reload');
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload, 10) > 15000) {
        localStorage.setItem('last_chunk_reload', String(now));
        window.location.reload();
      }
      throw error;
    }
  });
};

// Lazy-loaded page components wrapped with safeLazy
const Dashboard = safeLazy(() => import('./pages/Dashboard/Dashboard').then(m => ({ default: m.Dashboard })));
const Team = safeLazy(() => import('./pages/Team/Team').then(m => ({ default: m.Team })));
const TeamMeetingsPage = safeLazy(() => import('./pages/Team/TeamMeetingsPage').then(m => ({ default: m.TeamMeetingsPage })));
const VisitorFunnelPage = safeLazy(() => import('./pages/Team/VisitorFunnelPage').then(m => ({ default: m.VisitorFunnelPage })));
const OrdersList = safeLazy(() => import('./pages/Orders/OrdersList').then(m => ({ default: m.OrdersList })));
const OrderDetail = safeLazy(() => import('./pages/Orders/OrderDetail').then(m => ({ default: m.OrderDetail })));
const CustomersList = safeLazy(() => import('./pages/Customers/CustomersList').then(m => ({ default: m.CustomersList })));
const CustomerDetail = safeLazy(() => import('./pages/Customers/CustomerDetail').then(m => ({ default: m.CustomerDetail })));
const Login = safeLazy(() => import('./pages/Auth/Login').then(m => ({ default: m.Login })));
const PortalOrders = safeLazy(() => import('./pages/Portal/PortalOrders').then(m => ({ default: m.PortalOrders })));
const PortalCreateOrder = safeLazy(() => import('./pages/Portal/PortalCreateOrder').then(m => ({ default: m.PortalCreateOrder })));
const PortalRequestQuote = safeLazy(() => import('./pages/Portal/PortalRequestQuote').then(m => ({ default: m.PortalRequestQuote })));
const PortalAssetVault = safeLazy(() => import('./pages/Portal/PortalAssetVault').then(m => ({ default: m.PortalAssetVault })));
const PortalRoster = safeLazy(() => import('./pages/Portal/PortalRoster').then(m => ({ default: m.PortalRoster })));
const PortalSavedCarts = safeLazy(() => import('./pages/Portal/PortalSavedCarts').then(m => ({ default: m.PortalSavedCarts })));
const SeedData = safeLazy(() => import('./pages/Seed').then(m => ({ default: m.SeedData })));
const Settings = safeLazy(() => import('./pages/Settings/Settings').then(m => ({ default: m.Settings })));
const WaitingRoom = safeLazy(() => import('./pages/Auth/WaitingRoom').then(m => ({ default: m.WaitingRoom })));
const PackingSlipView = safeLazy(() => import('./pages/Public/PackingSlipView').then(m => ({ default: m.PackingSlipView })));
const OrderSummaryView = safeLazy(() => import('./pages/Public/OrderSummaryView').then(m => ({ default: m.OrderSummaryView })));
const PrintLabel = safeLazy(() => import('./pages/Print/PrintLabel').then(m => ({ default: m.PrintLabel })));
const PrintLabelsSheet = safeLazy(() => import('./pages/Print/PrintLabelsSheet').then(m => ({ default: m.PrintLabelsSheet })));
const PrintCourierLabel = safeLazy(() => import('./pages/Print/PrintCourierLabel').then(m => ({ default: m.PrintCourierLabel })));
const PrintItemLabels = safeLazy(() => import('./pages/Print/PrintItemLabels').then(m => ({ default: m.PrintItemLabels })));
const PrintThankYouCard = safeLazy(() => import('./pages/Print/PrintThankYouCard').then(m => ({ default: m.PrintThankYouCard })));
const PublicQuoteRequest = safeLazy(() => import('./pages/Public/PublicQuoteRequest').then(m => ({ default: m.PublicQuoteRequest })));
const InvoiceView = safeLazy(() => import('./pages/Public/InvoiceView').then(m => ({ default: m.InvoiceView })));
const SmsConsent = safeLazy(() => import('./pages/Public/SmsConsent').then(m => ({ default: m.SmsConsent })));
const Inventory = safeLazy(() => import('./pages/Inventory/Inventory').then(m => ({ default: m.Inventory })));
const InventoryScan = safeLazy(() => import('./pages/Inventory/InventoryScan').then(m => ({ default: m.InventoryScan })));
const MobileUpload = safeLazy(() => import('./pages/MobileUpload/MobileUpload').then(m => ({ default: m.MobileUpload })));
const ImmersiveLandingPage = safeLazy(() => import('./pages/Public/Landing/ImmersiveLandingPage').then(m => ({ default: m.ImmersiveLandingPage })));
const GalleryPage = safeLazy(() => import('./pages/Gallery/GalleryPage').then(m => ({ default: m.GalleryPage })));
const ShopPage = safeLazy(() => import('./pages/Shop/ShopPage').then(m => ({ default: m.ShopPage })));
const ShopProductPage = safeLazy(() => import('./pages/Shop/ShopProductPage').then(m => ({ default: m.ShopProductPage })));
const ShopSuccess = safeLazy(() => import('./pages/Shop/ShopSuccess').then(m => ({ default: m.ShopSuccess })));

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

function PermissionGuard({ permission, children }: { permission: PermissionKey; children: React.ReactNode }) {
  const { hasPermission, loading } = useAuth();
  
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-brand-bg text-brand-secondary font-serif">Loading...</div>;
  }
  
  if (!hasPermission(permission)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-brand-bg p-6 text-center animate-in fade-in duration-300">
        <div className="bg-white border border-brand-border rounded-xl p-8 max-w-md shadow-sm">
          <h2 className="text-2xl font-serif text-brand-primary mb-2">Access Denied</h2>
          <p className="text-sm text-brand-secondary mb-6 leading-relaxed">
            You do not have permission to view this section of the workspace. Please contact your system administrator to adjust your role settings.
          </p>
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center px-6 py-2.5 bg-brand-primary text-white rounded-full text-sm font-medium hover:bg-black transition-colors"
          >
            Return to Dashboard
          </a>
        </div>
      </div>
    );
  }
  
  return <>{children}</>;
}


function App() {
  useEffect(() => {
    document.title = 'INKTHEORY';
  }, []);
  return (
    <AuthProvider>
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-brand-bg text-brand-secondary font-serif">
          Loading...
        </div>
      }>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<ImmersiveLandingPage />} />
          <Route path="/start2" element={<Navigate to="/" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/waiting" element={<WaitingRoom />} />
          <Route path="/start" element={<PublicQuoteRequest />} />
          <Route path="/sms-opt-in" element={<SmsConsent />} />
          {/* Brand Shop — public merch storefront */}
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/shop/product/:id" element={<ShopProductPage />} />
          <Route path="/shop/success" element={<ShopSuccess />} />
          
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
          <Route path="/print/thank-you-card/:orderId" element={
            <PrivateRoute>
              <PrintThankYouCard />
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
            <Route path="vault" element={<PortalAssetVault />} />
            <Route path="roster" element={<PortalRoster />} />
            <Route path="saved-carts" element={<PortalSavedCarts />} />
            <Route path=":customerId" element={<PortalOrders />} />
            <Route path=":customerId/create" element={<PortalCreateOrder />} />
            <Route path=":customerId/saved-carts" element={<PortalSavedCarts />} />
            <Route path=":customerId/quote" element={<PortalRequestQuote />} />
            <Route path=":customerId/vault" element={<PortalAssetVault />} />
            <Route path=":customerId/roster" element={<PortalRoster />} />
          </Route>

          {/* Protected Application Routes */}
          <Route element={
            <PrivateRoute>
              <AppLayout />
            </PrivateRoute>
          }>
            {/* Main Dashboard Index */}
            <Route path="dashboard" element={
              <PermissionGuard permission="viewDashboard">
                <Dashboard />
              </PermissionGuard>
            } />


          
          <Route path="orders">
            <Route index element={
              <PermissionGuard permission="manageOrders">
                <OrdersList />
              </PermissionGuard>
            } />
            <Route path=":id" element={
              <PermissionGuard permission="manageOrders">
                <OrderDetail />
              </PermissionGuard>
            } />
          </Route>
          <Route path="customers">
            <Route index element={
              <PermissionGuard permission="manageCustomers">
                <CustomersList />
              </PermissionGuard>
            } />
            <Route path=":id" element={
              <PermissionGuard permission="manageCustomers">
                <CustomerDetail />
              </PermissionGuard>
            } />
          </Route>
          <Route path="production" element={<Navigate to="/orders?tab=production" replace />} />
          <Route path="artwork" element={<Navigate to="/orders?tab=production&sub=artwork" replace />} />
          <Route path="inventory" element={
            <PermissionGuard permission="manageInventory">
              <Inventory />
            </PermissionGuard>
          } />
          <Route path="crm" element={
            <PermissionGuard permission="manageTeam">
              <VisitorFunnelPage />
            </PermissionGuard>
          } />
          <Route path="team" element={
            <PermissionGuard permission="manageTeam">
              <Team />
            </PermissionGuard>
          } />
          <Route path="team/meetings" element={
            <PermissionGuard permission="manageTeam">
              <TeamMeetingsPage />
            </PermissionGuard>
          } />
          <Route path="team/analytics" element={<Navigate to="/crm?tab=visitors" replace />} />
          <Route path="signatures" element={<Navigate to="/settings?tab=signatures" replace />} />
            <Route path="reports" element={<Navigate to="/orders?tab=reports" replace />} />
            <Route path="settings" element={
              <PermissionGuard permission="manageSettings">
                <Settings />
              </PermissionGuard>
            } />
          </Route>
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}

export default App;
