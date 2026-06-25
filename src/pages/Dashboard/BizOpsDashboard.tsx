import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useOrders } from '../../hooks/useOrders';
import { tokens } from '../../lib/tokens';
import { db } from '../../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { 
  Activity, 
  TrendingUp, 
  DollarSign, 
  CheckSquare, 
  AlertTriangle, 
  Clock, 
  Plus, 
  Trash2, 
  ArrowRight,
  Layers,
  HelpCircle
} from 'lucide-react';

interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
}

const DEFAULT_TASKS: ChecklistItem[] = [
  { id: '1', text: 'Approve custom client artwork and design setups', completed: false, createdAt: new Date().toISOString() },
  { id: '2', text: 'Reconcile daily Shopify payouts with bank deposits', completed: false, createdAt: new Date().toISOString() },
  { id: '3', text: 'Audit blank garments supply chain status for rush orders', completed: true, createdAt: new Date().toISOString() },
  { id: '4', text: 'Check floor capacity scores and resolve schedule conflicts', completed: false, createdAt: new Date().toISOString() },
  { id: '5', text: 'Review weekly printer logs and film usage reports', completed: false, createdAt: new Date().toISOString() }
];

export function BizOpsDashboard() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { orders, loading: ordersLoading } = useOrders();
  const [customers, setCustomers] = useState<Record<string, any>>({});
  
  // Checklist State
  const [checklist, setChecklist] = useState<ChecklistItem[]>(() => {
    const saved = localStorage.getItem('biz_ops_checklist_tasks');
    return saved ? JSON.parse(saved) : DEFAULT_TASKS;
  });
  const [newTaskText, setNewTaskText] = useState('');

  // Save checklist to local storage
  useEffect(() => {
    localStorage.setItem('biz_ops_checklist_tasks', JSON.stringify(checklist));
  }, [checklist]);

  // Load Customers
  useEffect(() => {
    getDocs(collection(db, 'customers')).then(snap => {
      const obj: Record<string, any> = {};
      snap.forEach(d => {
        obj[d.id] = d.data();
      });
      setCustomers(obj);
    }).catch(e => console.error("Error loading customers:", e));
  }, []);

  const hasPricingVisibility = hasPermission('viewPricing');

  // Calculations
  const calculatedMetrics = useMemo(() => {
    let totalPipelineRevenue = 0;
    let quoteVolume = 0;
    const activeOrdersCount = orders.filter(o => o.statusIndex < 7).length;
    const pendingQuotesCount = orders.filter(o => o.statusIndex <= 2).length;
    const stuckOrders: any[] = [];
    const statusFinancials: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };
    const statusCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };

    orders.forEach(order => {
      const priceRaw = (order.items || []).reduce((acc: number, item: any) => {
        const itemTotal = (item.total || '$0').toString().replace(/[^0-9.]/g, '');
        return acc + (parseFloat(itemTotal) || 0);
      }, 0);

      // Track by status
      const sIndex = typeof order.statusIndex === 'number' ? order.statusIndex : 0;
      statusFinancials[sIndex] = (statusFinancials[sIndex] || 0) + priceRaw;
      statusCounts[sIndex] = (statusCounts[sIndex] || 0) + 1;

      // Pipeline revenue is for orders not yet shipped/received (statusIndex < 7)
      if (order.statusIndex < 7) {
        totalPipelineRevenue += priceRaw;
      }

      // Quote volume is for statusIndex <= 2 (Quotes)
      if (order.statusIndex <= 2) {
        quoteVolume += priceRaw;
      }

      // Bottleneck logic: Active (status < 7) AND (is Rush OR older than 7 days)
      const orderDate = new Date(order.createdAt || order.date || Date.now());
      const ageInDays = Math.ceil((Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
      
      const isStuck = order.statusIndex < 7 && (order.priority === 'rush' || ageInDays > 7);
      if (isStuck) {
        stuckOrders.push({
          ...order,
          price: priceRaw,
          age: ageInDays,
          customerName: customers[order.customerId]?.company || customers[order.customerId]?.name || 'Internal'
        });
      }
    });

    // Sort stuck orders by age (oldest first) or priority
    stuckOrders.sort((a, b) => {
      if (a.priority === 'rush' && b.priority !== 'rush') return -1;
      if (a.priority !== 'rush' && b.priority === 'rush') return 1;
      return b.age - a.age;
    });

    return {
      totalPipelineRevenue,
      quoteVolume,
      activeOrdersCount,
      pendingQuotesCount,
      stuckOrders,
      statusFinancials,
      statusCounts
    };
  }, [orders, customers]);

  // Handle Checklist Actions
  const handleToggleTask = (id: string) => {
    setChecklist(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;
    const newTask: ChecklistItem = {
      id: `task-${Date.now()}`,
      text: newTaskText.trim(),
      completed: false,
      createdAt: new Date().toISOString()
    };
    setChecklist(prev => [newTask, ...prev]);
    setNewTaskText('');
  };

  const handleDeleteTask = (id: string) => {
    setChecklist(prev => prev.filter(t => t.id !== id));
  };

  // Checklist stats
  const completedTasks = checklist.filter(t => t.completed).length;
  const totalTasks = checklist.length;
  const checklistPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Format Status Index Name
  const getStatusName = (index: number) => {
    switch(index) {
      case 0: return 'New Quote';
      case 1: return 'Client Notified';
      case 2: return 'Quote Sent';
      case 3: return 'Awaiting Pay';
      case 4: return 'Shopping Blanks';
      case 5: return 'Blanks Ordered';
      case 6: return 'In Production';
      case 7: return 'Shipped';
      case 8: return 'Received';
      default: return 'Unknown';
    }
  };

  return (
    <div className={tokens.layout.container + " space-y-10"}>
      {/* Header */}
      <div className={tokens.layout.pageHeader + " border-b border-brand-border pb-6"}>
        <div>
          <div className="flex items-center gap-3">
            <Activity className="text-purple-600 animate-pulse" size={28} />
            <h1 className={tokens.typography.h1 + " !text-purple-950 font-serif"}>Biz Ops Dashboard</h1>
          </div>
          <p className={tokens.typography.bodyMuted + " mt-2"}>
            Higher-level summary of business financials, bottleneck detection, and operational actions.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* KPI 1: Pipeline Value */}
        <div className="bg-gradient-to-br from-purple-900 to-indigo-950 text-white rounded-card p-6 shadow-lg border border-purple-800/30 flex flex-col justify-between min-h-[160px]">
          <div>
            <div className="flex justify-between items-center opacity-85">
              <span className="text-xs uppercase font-extrabold tracking-widest text-purple-200">Pipeline Value</span>
              <DollarSign size={18} className="text-purple-300" />
            </div>
            <div className="mt-4">
              {hasPricingVisibility ? (
                <h2 className="text-4xl font-serif font-bold tracking-tight text-white">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(calculatedMetrics.totalPipelineRevenue)}
                </h2>
              ) : (
                <div className="flex items-center gap-1.5 text-purple-300">
                  <HelpCircle size={16} />
                  <span className="text-sm font-semibold uppercase tracking-wider">Restricted Access</span>
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 text-[10px] uppercase font-bold tracking-wide text-purple-300">
            Across {calculatedMetrics.activeOrdersCount} active production orders
          </div>
        </div>

        {/* KPI 2: Quote Volume */}
        <div className="bg-white border border-brand-border rounded-card p-6 shadow-sm flex flex-col justify-between min-h-[160px] hover:shadow-md transition-shadow">
          <div>
            <div className="flex justify-between items-center">
              <span className="text-xs uppercase font-extrabold tracking-widest text-brand-secondary">Quote Pipeline</span>
              <TrendingUp size={18} className="text-emerald-500" />
            </div>
            <div className="mt-4">
              {hasPricingVisibility ? (
                <h2 className="text-4xl font-serif font-bold tracking-tight text-brand-primary">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(calculatedMetrics.quoteVolume)}
                </h2>
              ) : (
                <span className="text-sm font-semibold uppercase tracking-wider text-brand-secondary">Restricted</span>
              )}
            </div>
          </div>
          <div className="mt-4 text-[10px] uppercase font-bold tracking-wide text-brand-secondary">
            {calculatedMetrics.pendingQuotesCount} quotes pending approvals
          </div>
        </div>

        {/* KPI 3: Stuck Orders */}
        <div className="bg-white border border-brand-border rounded-card p-6 shadow-sm flex flex-col justify-between min-h-[160px] hover:shadow-md transition-shadow">
          <div>
            <div className="flex justify-between items-center">
              <span className="text-xs uppercase font-extrabold tracking-widest text-brand-secondary">Stuck & Bottlenecks</span>
              <AlertTriangle size={18} className={calculatedMetrics.stuckOrders.length > 0 ? "text-amber-500 animate-bounce" : "text-neutral-300"} />
            </div>
            <div className="mt-4">
              <h2 className="text-4xl font-serif font-bold tracking-tight text-brand-primary">
                {calculatedMetrics.stuckOrders.length}
              </h2>
            </div>
          </div>
          <div className={`mt-4 text-[10px] uppercase font-bold tracking-wide ${calculatedMetrics.stuckOrders.length > 0 ? 'text-amber-600 font-extrabold' : 'text-neutral-500'}`}>
            {calculatedMetrics.stuckOrders.length > 0 ? 'Requires Operations Check' : 'All clear on the floor'}
          </div>
        </div>

        {/* KPI 4: Operations Tasks */}
        <div className="bg-white border border-brand-border rounded-card p-6 shadow-sm flex flex-col justify-between min-h-[160px] hover:shadow-md transition-shadow">
          <div>
            <div className="flex justify-between items-center">
              <span className="text-xs uppercase font-extrabold tracking-widest text-brand-secondary">Ops Tasks Checklist</span>
              <CheckSquare size={18} className="text-purple-600" />
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <h2 className="text-4xl font-serif font-bold tracking-tight text-brand-primary">
                {completedTasks}/{totalTasks}
              </h2>
              <span className="text-xs font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                {checklistPercent}%
              </span>
            </div>
          </div>
          {/* Progress Bar */}
          <div className="mt-4 w-full bg-neutral-100 rounded-full h-1.5 overflow-hidden">
            <div className="bg-purple-600 h-full transition-all duration-500" style={{ width: `${checklistPercent}%` }}></div>
          </div>
        </div>
      </div>

      {/* Main Content Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Hand: Interactive Checklist & Alerts (8 cols) */}
        <div className="lg:col-span-7 space-y-8">
          
          {/* Checklist Panel */}
          <div className="bg-white border border-brand-border rounded-card p-6 shadow-sm">
            <h2 className="font-serif text-xl text-brand-primary mb-1 flex items-center gap-2">
              <CheckSquare className="text-purple-600" size={18} />
              Biz Ops Daily Checklist
            </h2>
            <p className="text-xs text-brand-secondary mb-6">
              Track tasks vital to business operations. Check items off or add new ones.
            </p>

            <form onSubmit={handleAddTask} className="flex gap-2 mb-6">
              <input
                type="text"
                value={newTaskText}
                onChange={e => setNewTaskText(e.target.value)}
                placeholder="Add a new business operation task..."
                className="flex-1 text-sm border border-brand-border rounded-lg px-3 py-2 outline-none focus:border-purple-600"
              />
              <button
                type="submit"
                className="bg-purple-900 hover:bg-black text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg flex items-center gap-1 transition-colors"
              >
                <Plus size={14} /> Add
              </button>
            </form>

            <div className="divide-y divide-brand-border/60 max-h-[350px] overflow-y-auto pr-1">
              {checklist.length > 0 ? (
                checklist.map(task => (
                  <div key={task.id} className="py-3 flex items-start justify-between gap-3 group animate-in fade-in duration-200">
                    <label className="flex items-start gap-3 cursor-pointer select-none min-w-0">
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => handleToggleTask(task.id)}
                        className="rounded border-neutral-300 text-purple-600 focus:ring-purple-600 mt-1 cursor-pointer"
                      />
                      <span className={`text-sm text-brand-primary leading-tight ${task.completed ? 'line-through text-brand-secondary opacity-60' : ''}`}>
                        {task.text}
                      </span>
                    </label>
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="text-neutral-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                      title="Delete task"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-brand-secondary text-sm">
                  No tasks remaining in checklist!
                </div>
              )}
            </div>
          </div>

          {/* Interactive CSS Bar Chart representing Revenue by Status */}
          <div className="bg-white border border-brand-border rounded-card p-6 shadow-sm">
            <div className="flex justify-between items-center mb-1">
              <h2 className="font-serif text-xl text-brand-primary flex items-center gap-2">
                <Layers className="text-purple-600" size={18} />
                Financial Pipeline Flow
              </h2>
              <span className="text-[10px] font-bold text-purple-600 uppercase tracking-widest bg-purple-50 px-2 py-0.5 rounded">
                Active Stages
              </span>
            </div>
            <p className="text-xs text-brand-secondary mb-8">
              Distribution of order values across production and quote lifecycle stages.
            </p>

            <div className="flex flex-col gap-5">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(idx => {
                const totalValue = calculatedMetrics.statusFinancials[idx] || 0;
                const totalCount = calculatedMetrics.statusCounts[idx] || 0;
                const maxVal = Math.max(...Object.values(calculatedMetrics.statusFinancials), 1000);
                const percent = Math.min(100, Math.round((totalValue / maxVal) * 100));
                
                return (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-24 text-[10px] font-bold text-brand-secondary uppercase tracking-wide truncate">
                      {getStatusName(idx)}
                    </div>
                    <div className="flex-1 bg-neutral-100 h-4 rounded overflow-hidden relative">
                      <div 
                        className={`h-full transition-all duration-700 ${
                          idx <= 2 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' :
                          idx <= 5 ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
                          idx === 6 ? 'bg-gradient-to-r from-purple-500 to-purple-600 animate-pulse' :
                          'bg-gradient-to-r from-blue-400 to-blue-500'
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                      {totalCount > 0 && (
                        <span className="absolute inset-y-0 left-2 flex items-center text-[9px] font-extrabold text-neutral-800">
                          {totalCount} {totalCount === 1 ? 'Order' : 'Orders'}
                        </span>
                      )}
                    </div>
                    <div className="w-24 text-right text-xs font-semibold text-brand-primary">
                      {hasPricingVisibility ? (
                        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(totalValue)
                      ) : (
                        <span className="text-[10px] text-neutral-400 uppercase">Restricted</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Hand: Bottleneck & Rush orders (5 cols) */}
        <div className="lg:col-span-5 space-y-8">
          
          <div className="bg-white border border-brand-border rounded-card p-6 shadow-sm flex flex-col h-full justify-between">
            <div>
              <div className="flex justify-between items-center mb-1">
                <h2 className="font-serif text-xl text-brand-primary flex items-center gap-2">
                  <Clock className="text-amber-500" size={18} />
                  Ops Bottleneck Alert Feed
                </h2>
                {calculatedMetrics.stuckOrders.length > 0 && (
                  <span className="text-[9px] font-bold bg-red-100 text-red-800 uppercase tracking-widest px-2 py-0.5 rounded animate-pulse">
                    Action Required
                  </span>
                )}
              </div>
              <p className="text-xs text-brand-secondary mb-6">
                Active orders flagged as rush or that have been in the pipeline for over 7 days.
              </p>

              <div className="space-y-4 max-h-[550px] overflow-y-auto pr-1">
                {ordersLoading ? (
                  <div className="text-center py-6 text-xs text-brand-secondary">
                    Loading orders database...
                  </div>
                ) : calculatedMetrics.stuckOrders.length > 0 ? (
                  calculatedMetrics.stuckOrders.map(order => {
                    const isRush = order.priority === 'rush';
                    return (
                      <div 
                        key={order.id}
                        onClick={() => navigate(`/orders/${order.id}`)}
                        className="p-4 rounded-xl border border-brand-border bg-brand-bg hover:border-purple-500 transition-colors cursor-pointer group flex flex-col justify-between gap-3"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">
                              {order.portalId || order.id}
                            </span>
                            <h3 className="font-serif text-sm font-semibold text-brand-primary group-hover:text-purple-900 transition-colors mt-0.5">
                              {order.title || 'Untitled Order'}
                            </h3>
                            <p className="text-[10px] text-brand-secondary mt-0.5">
                              Client: {order.customerName}
                            </p>
                          </div>
                          
                          <div className="flex flex-col items-end gap-1.5">
                            {isRush ? (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-100 text-red-800 uppercase tracking-wider">
                                Rush Priority
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200/50 uppercase tracking-wider">
                                {order.age} Days Old
                              </span>
                            )}
                            <span className="text-[9px] uppercase font-bold text-neutral-500 tracking-wide bg-neutral-100 px-2 py-0.5 rounded">
                              {getStatusName(order.statusIndex)}
                            </span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center pt-2 border-t border-brand-border/40 text-[10px]">
                          <span className="font-medium text-brand-secondary">
                            {hasPricingVisibility ? (
                              `Value: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(order.price)}`
                            ) : (
                              'Pricing Restricted'
                            )}
                          </span>
                          <span className="flex items-center gap-0.5 text-purple-700 font-bold group-hover:translate-x-0.5 transition-transform">
                            Inspect Order <ArrowRight size={10} />
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-12 border border-dashed border-brand-border rounded-xl flex flex-col items-center justify-center text-center p-6 text-brand-secondary">
                    <Activity size={24} className="text-neutral-300 mb-2" />
                    <p className="text-xs font-semibold">No operations bottlenecks detected!</p>
                    <p className="text-[10px] mt-1">All orders are moving smoothly within standard lead times.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
