import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  DollarSign, 
  ShoppingBag, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  Search, 
  FileDown, 
  CreditCard,
  Calendar,
  Filter,
  ArrowUpDown,
  Tag,
  Loader2,
  Building2
} from 'lucide-react';
import { tokens } from '../../lib/tokens';

export interface UnifiedOrderReport {
  id: string;
  displayId: string;
  source: 'custom' | 'shop';
  customerName: string;
  customerEmail: string;
  title: string;
  placedDate: Date | null;
  placedDateFormatted: string;
  paymentStatus: 'paid' | 'processing' | 'unpaid' | 'pending';
  paymentDate: Date | null;
  paymentDateFormatted: string;
  itemCount: number;
  payoutAmount: number;
  payoutFormatted: string;
  rawOrder: any;
}

export function OrderReportsPanel({ liveCustomers = {} }: { liveCustomers?: Record<string, any> }) {
  const [customOrders, setCustomOrders] = useState<any[]>([]);
  const [shopOrders, setShopOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'processing' | 'unpaid'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'payout_high' | 'payout_low'>('newest');

  // Fetch custom orders from 'orders' collection
  useEffect(() => {
    const unsubCustom = onSnapshot(collection(db, 'orders'), (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCustomOrders(list);
    });

    const unsubShop = onSnapshot(collection(db, 'shop_orders'), (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setShopOrders(list);
    });

    return () => {
      unsubCustom();
      unsubShop();
    };
  }, []);

  // When both datasets have responded, turn off loading
  useEffect(() => {
    setLoading(false);
  }, [customOrders, shopOrders]);

  // Combine and format into unified report model
  const unifiedReports: UnifiedOrderReport[] = useMemo(() => {
    const reports: UnifiedOrderReport[] = [];

    // Process Custom Portal / Invoice Orders
    customOrders.forEach((o: any) => {
      if (o.customerId === 'Shopify Temporary') return;

      const liveCust = o.customerId ? liveCustomers[o.customerId] : null;
      const custName = liveCust?.company || liveCust?.name || o.customerName || o.customerId || 'Direct Customer';
      const custEmail = o.customerEmail || o.email || liveCust?.email || '';

      // Parse placed date
      let placedDate: Date | null = null;
      if (o.createdAt) {
        if (typeof o.createdAt === 'object' && o.createdAt.seconds) {
          placedDate = new Date(o.createdAt.seconds * 1000);
        } else if (typeof o.createdAt === 'number') {
          placedDate = new Date(o.createdAt);
        } else {
          const d = new Date(o.createdAt);
          if (!isNaN(d.getTime())) placedDate = d;
        }
      }
      if (!placedDate && o.date) {
        const d = new Date(o.date);
        if (!isNaN(d.getTime())) placedDate = d;
      }

      // Parse payment date
      let paymentDate: Date | null = null;
      if (o.paymentDate) {
        const d = new Date(o.paymentDate);
        if (!isNaN(d.getTime())) paymentDate = d;
      } else if (o.paidAt) {
        const d = new Date(o.paidAt);
        if (!isNaN(d.getTime())) paymentDate = d;
      }

      // Determine payout status
      let paymentStatus: 'paid' | 'processing' | 'unpaid' | 'pending' = 'unpaid';
      if (o.paymentStatus === 'paid' || o.statusIndex >= 4) {
        paymentStatus = 'paid';
      } else if (o.paymentStatus === 'processing') {
        paymentStatus = 'processing';
      } else if (o.paymentStatus === 'pending') {
        paymentStatus = 'pending';
      }

      if (!paymentDate && paymentStatus === 'paid') {
        paymentDate = placedDate;
      }

      // Calculate total item count
      const itemCount = o.items?.reduce((acc: number, i: any) => {
        const sizeSum = i.sizes ? Object.values(i.sizes).reduce((sum: number, val: any) => sum + (parseInt(val) || 0), 0) : 0;
        return acc + (sizeSum > 0 ? sizeSum : (parseInt(i.qty) || parseInt(i.quantity) || 1));
      }, 0) || 0;

      // Calculate payout amount
      let payoutAmount = 0;
      if (typeof o.calculatedTotal === 'number' && o.calculatedTotal > 0) {
        payoutAmount = o.calculatedTotal;
      } else if (typeof o.total === 'number' && o.total > 0) {
        payoutAmount = o.total;
      } else if (o.totalFormatted) {
        const parsed = parseFloat(String(o.totalFormatted).replace(/[^0-9.]/g, ''));
        if (!isNaN(parsed)) payoutAmount = parsed;
      }

      if (payoutAmount === 0 && o.items) {
        payoutAmount = o.items.reduce((acc: number, i: any) => {
          const sizeSum = i.sizes ? Object.values(i.sizes).reduce((sum: number, val: any) => sum + (parseInt(val) || 0), 0) : 0;
          const safeQty = sizeSum > 0 ? sizeSum : (i.qty ? parseInt(i.qty.toString().replace(/[^0-9]/g, '')) || 0 : 1);
          let safePrice = 0;
          if (i.price !== undefined && i.price !== null) {
            const p = parseFloat(i.price.toString().replace(/[^0-9.]/g, ''));
            if (!isNaN(p)) safePrice = p;
          }
          if (safePrice > 0) return acc + (safeQty * safePrice);
          const tot = parseFloat((i.total || '$0').toString().replace(/[^0-9.]/g, ''));
          return acc + (isNaN(tot) ? 0 : tot);
        }, 0);
      }

      const placedDateFormatted = placedDate 
        ? placedDate.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
        : 'Date unknown';

      const paymentDateFormatted = paymentDate 
        ? paymentDate.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
        : '—';

      const payoutFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(payoutAmount);

      reports.push({
        id: o.id,
        displayId: o.portalId || o.id.slice(0, 8).toUpperCase(),
        source: 'custom',
        customerName: custName,
        customerEmail: custEmail,
        title: o.title || 'Custom Order',
        placedDate,
        placedDateFormatted,
        paymentStatus,
        paymentDate,
        paymentDateFormatted,
        itemCount,
        payoutAmount,
        payoutFormatted,
        rawOrder: o
      });
    });

    // Process E-Commerce Storefront Orders
    shopOrders.forEach((o: any) => {
      let placedDate: Date | null = null;
      if (o.createdAt) {
        placedDate = new Date(o.createdAt);
      }

      let paymentDate: Date | null = null;
      if (o.paidAt) {
        paymentDate = new Date(o.paidAt);
      } else if (o.status === 'paid' || o.status === 'fulfilled') {
        paymentDate = placedDate;
      }

      let paymentStatus: 'paid' | 'processing' | 'unpaid' | 'pending' = 'unpaid';
      if (o.status === 'paid' || o.status === 'fulfilled') {
        paymentStatus = 'paid';
      } else if (o.status === 'pending') {
        paymentStatus = 'pending';
      }

      const itemCount = o.items?.reduce((acc: number, i: any) => acc + (parseInt(i.qty) || 1), 0) || 0;
      const payoutAmount = o.amountTotal ?? o.subtotal ?? 0;
      
      const placedDateFormatted = placedDate 
        ? placedDate.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
        : 'Date unknown';

      const paymentDateFormatted = paymentDate 
        ? paymentDate.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
        : '—';

      const payoutFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(payoutAmount);

      reports.push({
        id: o.id,
        displayId: `#SHOP-${o.id.slice(0, 6).toUpperCase()}`,
        source: 'shop',
        customerName: o.customerName || 'Store Visitor',
        customerEmail: o.email || '',
        title: o.items?.map((i: any) => i.name).join(', ') || 'Storefront Order',
        placedDate,
        placedDateFormatted,
        paymentStatus,
        paymentDate,
        paymentDateFormatted,
        itemCount,
        payoutAmount,
        payoutFormatted,
        rawOrder: o
      });
    });

    return reports;
  }, [customOrders, shopOrders, liveCustomers]);

  // Compute KPI Stats
  const kpis = useMemo(() => {
    const paidList = unifiedReports.filter(r => r.paymentStatus === 'paid');
    const totalGrossPayouts = paidList.reduce((sum, r) => sum + r.payoutAmount, 0);
    const avgPayout = paidList.length > 0 ? totalGrossPayouts / paidList.length : 0;
    const processingList = unifiedReports.filter(r => r.paymentStatus === 'processing');
    const unpaidList = unifiedReports.filter(r => r.paymentStatus === 'unpaid' || r.paymentStatus === 'pending');
    const pendingPayouts = unpaidList.reduce((sum, r) => sum + r.payoutAmount, 0);

    return {
      totalOrders: unifiedReports.length,
      paidCount: paidList.length,
      processingCount: processingList.length,
      totalGrossPayouts,
      avgPayout,
      pendingPayouts
    };
  }, [unifiedReports]);

  // Filter and Sort Orders
  const filteredReports = useMemo(() => {
    let result = [...unifiedReports];

    // Status Filter
    if (statusFilter !== 'all') {
      result = result.filter(r => r.paymentStatus === statusFilter);
    }

    // Search Query Filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r => 
        r.displayId.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        r.customerEmail.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q)
      );
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'newest') {
        const timeA = a.placedDate ? a.placedDate.getTime() : 0;
        const timeB = b.placedDate ? b.placedDate.getTime() : 0;
        return timeB - timeA;
      }
      if (sortBy === 'oldest') {
        const timeA = a.placedDate ? a.placedDate.getTime() : 0;
        const timeB = b.placedDate ? b.placedDate.getTime() : 0;
        return timeA - timeB;
      }
      if (sortBy === 'payout_high') {
        return b.payoutAmount - a.payoutAmount;
      }
      if (sortBy === 'payout_low') {
        return a.payoutAmount - b.payoutAmount;
      }
      return 0;
    });

    return result;
  }, [unifiedReports, statusFilter, search, sortBy]);

  // CSV Export Handler
  const exportCSV = () => {
    const headers = ['Order ID', 'Source', 'Customer Name', 'Email', 'Order Title', 'Date & Time Placed', 'Payment Status', 'Date & Time Paid', 'Items Qty', 'Total Payout ($)'];
    const rows = filteredReports.map(r => [
      `"${r.displayId}"`,
      `"${r.source === 'shop' ? 'Brand Store' : 'Custom Portal'}"`,
      `"${r.customerName.replace(/"/g, '""')}"`,
      `"${r.customerEmail.replace(/"/g, '""')}"`,
      `"${r.title.replace(/"/g, '""')}"`,
      `"${r.placedDateFormatted}"`,
      `"${r.paymentStatus.toUpperCase()}"`,
      `"${r.paymentDateFormatted}"`,
      r.itemCount,
      r.payoutAmount.toFixed(2)
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `order_payouts_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-brand-secondary gap-3 py-12">
        <Loader2 className="animate-spin text-brand-primary" size={28} />
        <p className="font-semibold uppercase tracking-widest text-xs">Loading Order Financial Payouts...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      
      {/* KPI Cards Header */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Gross Payouts */}
        <div className="bg-white p-5 rounded-2xl border border-brand-border shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-secondary">Total Paid Payouts</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-serif text-brand-primary">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(kpis.totalGrossPayouts)}
            </div>
            <div className="text-xs text-emerald-700 font-medium mt-1 flex items-center gap-1">
              <TrendingUp size={13} />
              <span>{kpis.paidCount} paid orders completed</span>
            </div>
          </div>
        </div>

        {/* Card 2: Total Orders Placed */}
        <div className="bg-white p-5 rounded-2xl border border-brand-border shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-secondary">Total Orders Placed</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <ShoppingBag size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-serif text-brand-primary">
              {kpis.totalOrders}
            </div>
            <div className="text-xs text-brand-secondary font-medium mt-1 flex items-center gap-1">
              <Calendar size={13} />
              <span>Across Portal & Storefront</span>
            </div>
          </div>
        </div>

        {/* Card 3: Avg Order Payout */}
        <div className="bg-white p-5 rounded-2xl border border-brand-border shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-secondary">Average Order Payout</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
              <CreditCard size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-serif text-brand-primary">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(kpis.avgPayout)}
            </div>
            <div className="text-xs text-brand-secondary font-medium mt-1">
              Per completed paid order
            </div>
          </div>
        </div>

        {/* Card 4: Unpaid / Pending Balance */}
        <div className="bg-white p-5 rounded-2xl border border-brand-border shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-secondary">Pending / Unpaid Quotes</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
              <Clock size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-serif text-brand-primary">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(kpis.pendingPayouts)}
            </div>
            <div className="text-xs text-amber-700 font-medium mt-1">
              {kpis.totalOrders - kpis.paidCount} orders awaiting payment
            </div>
          </div>
        </div>

      </div>

      {/* Controls & Search Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-brand-border shadow-xs">
        
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-secondary" size={16} />
          <input 
            type="text"
            placeholder="Search by Order ID, Customer, Email, or Title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-brand-bg/50 border border-brand-border rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-brand-primary focus:bg-white transition-all"
          />
        </div>

        {/* Status Filter Tabs & Controls */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Status Pills */}
          <div className="flex bg-brand-bg p-1 rounded-xl border border-brand-border">
            {(['all', 'paid', 'processing', 'unpaid'] as const).map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                  statusFilter === status 
                    ? 'bg-white text-brand-primary shadow-2xs font-extrabold'
                    : 'text-brand-secondary hover:text-brand-primary'
                }`}
              >
                {status === 'all' ? 'All Orders' : status}
              </button>
            ))}
          </div>

          {/* Sort Dropdown */}
          <div className="relative flex items-center">
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="bg-white border border-brand-border rounded-xl px-3 py-2 text-xs font-bold text-brand-primary focus:outline-none cursor-pointer appearance-none pr-8"
            >
              <option value="newest">Sort: Placed (Newest)</option>
              <option value="oldest">Sort: Placed (Oldest)</option>
              <option value="payout_high">Sort: Payout (Highest)</option>
              <option value="payout_low">Sort: Payout (Lowest)</option>
            </select>
            <ArrowUpDown size={13} className="absolute right-2.5 pointer-events-none text-brand-secondary" />
          </div>

          {/* Export CSV Button */}
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 bg-brand-primary hover:bg-black text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ml-auto"
          >
            <FileDown size={15} />
            <span>Export CSV</span>
          </button>

        </div>
      </div>

      {/* Main Financial Payouts Table */}
      <div className="bg-white rounded-2xl border border-brand-border shadow-xs overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-brand-border bg-brand-bg/60 text-[10px] font-extrabold uppercase tracking-wider text-brand-secondary">
                <th className="py-3.5 px-4">Order ID & Source</th>
                <th className="py-3.5 px-4">Customer</th>
                <th className="py-3.5 px-4">Date & Time Placed</th>
                <th className="py-3.5 px-4">Payment Status & Date Paid</th>
                <th className="py-3.5 px-4 text-center">Items</th>
                <th className="py-3.5 px-4 text-right">Payout Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/60 text-xs">
              {filteredReports.map((report) => (
                <tr 
                  key={report.id}
                  className="hover:bg-brand-bg/40 transition-colors"
                >
                  {/* Order ID & Source */}
                  <td className="py-4 px-4">
                    <div className="flex flex-col gap-1">
                      <span className="font-mono font-bold text-brand-primary text-sm">
                        {report.displayId}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[9px] font-extrabold tracking-wider uppercase">
                        {report.source === 'shop' ? (
                          <span className="bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-md">
                            Storefront
                          </span>
                        ) : (
                          <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-md">
                            Custom Order
                          </span>
                        )}
                      </span>
                    </div>
                  </td>

                  {/* Customer Info */}
                  <td className="py-4 px-4">
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-brand-primary text-sm truncate">
                        {report.customerName}
                      </span>
                      <span className="text-brand-secondary text-xs truncate">
                        {report.title}
                      </span>
                      {report.customerEmail && (
                        <span className="text-neutral-400 text-[11px] truncate">
                          {report.customerEmail}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Date Placed */}
                  <td className="py-4 px-4 text-brand-primary font-medium">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={13} className="text-brand-secondary shrink-0" />
                      <span>{report.placedDateFormatted}</span>
                    </div>
                  </td>

                  {/* Payment Status & Date Paid */}
                  <td className="py-4 px-4">
                    <div className="flex flex-col gap-1 items-start">
                      {report.paymentStatus === 'paid' ? (
                        <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                          <CheckCircle2 size={12} className="text-emerald-600" />
                          <span>PAID</span>
                        </span>
                      ) : report.paymentStatus === 'processing' ? (
                        <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                          <Clock size={12} className="text-blue-600 animate-pulse" />
                          <span>ACH PROCESSING</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 bg-neutral-100 text-neutral-600 border border-neutral-200 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                          <Clock size={12} className="text-neutral-400" />
                          <span>UNPAID</span>
                        </span>
                      )}
                      {report.paymentDateFormatted !== '—' && (
                        <span className="text-[10px] text-brand-secondary font-medium pl-1">
                          Paid: {report.paymentDateFormatted}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Items */}
                  <td className="py-4 px-4 text-center font-bold text-brand-primary">
                    {report.itemCount} <span className="text-[10px] text-brand-secondary font-normal">units</span>
                  </td>

                  {/* Payout Amount */}
                  <td className="py-4 px-4 text-right">
                    <div className="text-base font-bold font-serif text-brand-primary">
                      {report.payoutFormatted}
                    </div>
                  </td>
                </tr>
              ))}

              {filteredReports.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-brand-secondary">
                    <p className="text-sm font-medium">No order payout records found matching your filters.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
