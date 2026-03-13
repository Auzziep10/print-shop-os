import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { Team } from './pages/Team/Team';
import { OrdersList } from './pages/Orders/OrdersList';
import { OrderDetail } from './pages/Orders/OrderDetail';
import { CustomersList } from './pages/Customers/CustomersList';
import { CustomerDetail } from './pages/Customers/CustomerDetail';

function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
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
  );
}

export default App;
