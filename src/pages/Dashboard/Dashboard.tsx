import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { tokens } from '../../lib/tokens';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { KanbanBoard } from '../../components/shared/KanbanBoard';
import { TimelinePlanner } from '../Team/TimelinePlanner';
import { useAuth } from '../../contexts/AuthContext';
import { useOrders } from '../../hooks/useOrders';
import { db, chronoDb, chronoAuth } from '../../lib/firebase';
import { collection, query, getDocs, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { normalizeUser } from '../../lib/utils';
import { Printer, CheckCircle2, AlertTriangle, Download, X } from 'lucide-react';


export function Dashboard() {
  const navigate = useNavigate();
  const { userData } = useAuth();
  const { orders } = useOrders();
  const [liveMeetings, setLiveMeetings] = useState<any[]>([]);

  useEffect(() => {
    const unsubMeetings = onSnapshot(collection(db, 'meetings'), (snap) => {
      const live: any[] = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.status === 'live') {
          live.push({ id: d.id, ...data });
        }
      });
      setLiveMeetings(live);
    });
    return () => unsubMeetings();
  }, []);
  
  const [roleView, setRoleView] = useState('Production Staff');
  const [staffTimeframe, setStaffTimeframe] = useState('Day');
  const [activeStat, setActiveStat] = useState<string | null>(null);
  const [printerFilter, setPrinterFilter] = useState<'pending' | 'printed' | 'all'>('pending');
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null);
  
  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Record<string, any>>({});
  const [activeMetricsTab, setActiveMetricsTab] = useState<string>('All');
  const [activeKittingTab, setActiveKittingTab] = useState<string>('All');
  const [allUsersList, setAllUsersList] = useState<any[]>([]);
  const [metricsTimeFilter, setMetricsTimeFilter] = useState<string>('Today');

  // Aggregated list of all gang sheet items in all orders
  const printQueueItems = useMemo(() => {
    const list: any[] = [];
    orders.forEach((order: any) => {
      (order.items || []).forEach((item: any) => {
        const isGangSheet = item.itemType === 'gang_sheet';
        const isCustomGarment = item.itemType === 'garment' && item.printReadyUrl;
        
        if (isGangSheet || isCustomGarment) {
          list.push({
            ...item,
            orderId: order.id,
            orderTitle: order.title,
            orderPortalId: order.portalId,
            orderCustomerId: order.customerId,
            orderPriority: order.priority,
            orderShipDate: order.shipDate,
            orderStatusIndex: order.statusIndex
          });
        }
      });
    });
    return list;
  }, [orders]);

  const displayedPrinterItems = useMemo(() => {
    return printQueueItems.filter((item) => {
      if (printerFilter === 'pending') {
        return item.readyToPrint && !item.printed;
      }
      if (printerFilter === 'printed') {
        return item.printed;
      }
      // 'all' tab shows all gang sheets that are ready to print, printed, or belong to active production orders (status index 6)
      return item.readyToPrint || item.printed || item.orderStatusIndex === 6;
    });
  }, [printQueueItems, printerFilter]);

  const printedTodayCount = useMemo(() => {
    const todayStr = new Date().toDateString();
    return printQueueItems.filter(item => {
      if (!item.printed || !item.printedAt) return false;
      return new Date(item.printedAt).toDateString() === todayStr;
    }).length;
  }, [printQueueItems]);

  const rushPrintsCount = useMemo(() => {
    return printQueueItems.filter(item => item.readyToPrint && !item.printed && item.orderPriority === 'rush').length;
  }, [printQueueItems]);

  const handleMarkPrinted = async (orderId: string, itemId: string) => {
    const orderObj = orders.find(o => o.id === orderId);
    if (!orderObj) return;

    const updatedItems = (orderObj.items || []).map((item: any) => {
      if (item.id === itemId) {
        return {
          ...item,
          printed: true,
          printedAt: new Date().toISOString(),
          printedBy: userData?.name || userData?.email?.split('@')[0] || 'Printer'
        };
      }
      return item;
    });

    const targetItem = (orderObj.items || []).find((item: any) => item.id === itemId);

    try {
      const message = `Marked gang sheet "${targetItem?.style || 'DTF Gang Sheet'}" as printed from Printers Dashboard`;
      const newActivity = {
        id: `act-${Date.now()}`,
        type: 'system',
        message,
        user: userData?.name || userData?.email?.split('@')[0] || 'Printer',
        timestamp: new Date().toISOString()
      };

      await updateDoc(doc(db, 'orders', orderId), { 
        items: updatedItems,
        activities: [newActivity, ...(orderObj.activities || [])]
      });
    } catch (err) {
      console.error("Error marking printed:", err);
    }
  };

  const handleMarkUnprinted = async (orderId: string, itemId: string) => {
    const orderObj = orders.find(o => o.id === orderId);
    if (!orderObj) return;

    const updatedItems = (orderObj.items || []).map((item: any) => {
      if (item.id === itemId) {
        return {
          ...item,
          printed: false,
          printedAt: null,
          printedBy: null
        };
      }
      return item;
    });

    const targetItem = (orderObj.items || []).find((item: any) => item.id === itemId);

    try {
      const message = `Marked gang sheet "${targetItem?.style || 'DTF Gang Sheet'}" as unprinted from Printers Dashboard`;
      const newActivity = {
        id: `act-${Date.now()}`,
        type: 'system',
        message,
        user: userData?.name || userData?.email?.split('@')[0] || 'Printer',
        timestamp: new Date().toISOString()
      };

      await updateDoc(doc(db, 'orders', orderId), { 
        items: updatedItems,
        activities: [newActivity, ...(orderObj.activities || [])]
      });
    } catch (err) {
      console.error("Error marking unprinted:", err);
    }
  };

  useEffect(() => {
    if (userData && ['Admin', 'Leadership', 'Manager'].includes(userData.role)) {
      setRoleView('Manager / Admin');
    } else if (userData && userData.role === 'Printer') {
      setRoleView('Printers Dashboard');
    } else {
      setRoleView('Production Staff');
    }
  }, [userData]);

  useEffect(() => {
    getDocs(collection(db, 'customers')).then(snap => {
      const obj: Record<string,any> = {};
      snap.forEach(d => { obj[d.id] = d.data(); });
      setCustomers(obj);
    }).catch(e => console.error(e));

    getDocs(collection(db, 'users')).then(snap => {
      setAllUsersList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }).catch(e => console.error(e));
  }, []);

  useEffect(() => {
    if (!userData?.email) return;

    let unsubSchedules: (() => void) | undefined;
    
    const initChronoTasks = async () => {
      try {
        await signInAnonymously(chronoAuth);
        
        // Find matching chronotrack user ID
        const userEmail = userData.email.toLowerCase();
        
        // Query schedules onSnapshot
        const qSchedules = query(collection(chronoDb, 'shiftSchedules'));
        
        // Fetch users list from Chronotrack to find the ID corresponding to email
        const usersSnap = await getDocs(collection(chronoDb, 'users'));
        let matchedChronoUserId: string | null = null;
        usersSnap.forEach((doc) => {
          const uData = doc.data();
          if (uData.email && uData.email.toLowerCase() === userEmail) {
            matchedChronoUserId = doc.id;
          }
        });
        
        // Fallback: match by name if email didn't match (e.g. email not set in Chronotrack)
        if (!matchedChronoUserId) {
          usersSnap.forEach((doc) => {
            const uData = doc.data();
            if (uData.name && uData.name.toLowerCase() === userData.name.toLowerCase()) {
              matchedChronoUserId = doc.id;
            }
          });
        }

        if (!matchedChronoUserId) {
          console.warn("Could not find a matching Chronotrack user for email/name:", userEmail, userData.name);
          setMyTasks([]);
          return;
        }

        const chronoUserId = matchedChronoUserId;

        unsubSchedules = onSnapshot(qSchedules, (snap) => {
          const liveTasks: any[] = [];
          snap.forEach(doc => {
            const data = doc.data();
            if (data.title && data.title.startsWith('[SHIFT]')) return;
            if (data.isShiftBlock) return;
            
            const taskMemberId = data.assignedTo || data.memberId;
            if (taskMemberId !== chronoUserId) return;

            let startVal = 9;
            let durationVal = 1;
            let taskDate = data.date;
            
            if (data.startTime && data.endTime) {
                const startDate = new Date(data.startTime);
                const endDate = new Date(data.endTime);
                startVal = startDate.getHours() + (startDate.getMinutes() / 60);
                durationVal = (endDate.getHours() + (endDate.getMinutes() / 60)) - startVal;
                if (durationVal <= 0) durationVal = 1;
                taskDate = startDate.toISOString().split('T')[0];
            } else if (!taskDate && data.createdAt) {
                 taskDate = new Date(data.createdAt.toMillis ? data.createdAt.toMillis() : Date.now()).toISOString().split('T')[0];
            }

            let color = 'bg-blue-500';
            if (data.status === 'completed') color = 'bg-green-500';
            if (data.status === 'delayed') color = 'bg-red-500';
            if (data.status === 'pending') color = 'bg-amber-500';

            const weekString = (d: Date) => {
                const copy = new Date(d);
                copy.setHours(0,0,0,0);
                const dayNum = copy.getUTCDay() || 7;
                copy.setUTCDate(copy.getUTCDate() + 4 - dayNum);
                const yearStart = new Date(Date.UTC(copy.getUTCFullYear(),0,1));
                const weekNo = Math.ceil((((copy.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
                return `${copy.getUTCFullYear()}-W${weekNo}`;
            };

            const tDate = taskDate || new Date().toISOString().split('T')[0];
            const parsedDateObj = new Date(tDate + "T00:00:00");

            liveTasks.push({
              id: doc.id,
              memberId: taskMemberId,
              title: data.title || 'Untitled Task',
              start: startVal,
              duration: durationVal,
              color: data.color || color,
              orderId: data.orderId || '',
              date: tDate,
              week: data.week || weekString(parsedDateObj),
              month: data.month || tDate.substring(0, 7)
            });
          });
          
          setMyTasks(liveTasks.sort((a, b) => (a.start || 0) - (b.start || 0)));
        });
      } catch (err) {
        console.error("Failed to load Chronotrack tasks:", err);
      }
    };

    initChronoTasks();

    return () => {
      if (unsubSchedules) unsubSchedules();
    };
  }, [userData?.email, userData?.name]);

  const getWeekString = (d: Date) => {
      const copy = new Date(d);
      copy.setHours(0,0,0,0);
      const dayNum = copy.getUTCDay() || 7;
      copy.setUTCDate(copy.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(copy.getUTCFullYear(),0,1));
      const weekNo = Math.ceil((((copy.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
      return `${copy.getUTCFullYear()}-W${weekNo}`;
  };

  const currentDate = new Date();
  const activeDateStr = currentDate.toISOString().split('T')[0];
  const activeWeekStr = getWeekString(currentDate);
  const activeMonthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`;

  const displayedTasks = myTasks.filter(t => {
    if (t.range && t.range !== staffTimeframe) return false;
    if (!t.range && staffTimeframe !== 'Day') return false;
    if (staffTimeframe === 'Day') return t.date === activeDateStr;
    if (staffTimeframe === 'Week') return t.week === activeWeekStr;
    if (staffTimeframe === 'Month') return t.month === activeMonthStr;
    return true;
  });

  const productionOrders = orders.filter(o => (o.statusIndex === 6 || o.statusIndex === 7) && o.customerId !== 'Shopify Temporary');
  const assignedOrderIds = new Set(displayedTasks.filter(t => t.orderId).map(t => String(t.orderId)));
  const assignedOrders = productionOrders.filter(o => assignedOrderIds.has(String(o.id)));

  const formatTaskTime = (start: number, duration: number) => {
    const formatHour = (h: number) => {
       const displayH = Math.floor(h) > 12 ? Math.floor(h) - 12 : Math.floor(h);
       const mins = h % 1 !== 0 ? ':30' : ':00';
       const ampm = Math.floor(h) >= 12 && h < 24 ? 'PM' : 'AM';
       return `${displayH}${mins} ${ampm}`;
    };
    return `${formatHour(start)} - ${formatHour(start + duration)}`;
  };

  const statsByUser: Record<string, { totalTimeMins: number, garmentsCompleted: number }> = {};
  const kittingStatsByUser: Record<string, { garmentsKitted: number }> = {};
  const bestDisplayNames: Record<string, string> = {};

  orders.forEach(order => {
     if (order.customerId === 'Shopify Temporary') return;
     (order.activities || []).forEach((act: any) => {
         if (act.message?.startsWith('Added ') && act.message?.includes(' to ')) {
             let userName = act.user?.split('@')[0] || 'Unknown';
             let qtyMatch = act.message.match(/Added (\d+)x/);
             let qty = qtyMatch ? parseInt(qtyMatch[1]) : 0;
             
             if (metricsTimeFilter !== 'All') {
                 const ts = act?.timestamp;
                 if (ts) {
                     const statDateStr = ts.split('T')[0];
                     if (metricsTimeFilter === 'Today') {
                         const lDate = new Date();
                         const lYear = lDate.getFullYear();
                         const lMonth = String(lDate.getMonth() + 1).padStart(2, '0');
                         const lDay = String(lDate.getDate()).padStart(2, '0');
                         const todayStr = `${lYear}-${lMonth}-${lDay}`;
                         if (statDateStr !== todayStr) return;
                     } else {
                         if (statDateStr !== metricsTimeFilter) return;
                     }
                 } else {
                     return;
                 }
             }

             let rawName = normalizeUser(userName, allUsersList);
             const groupKey = rawName.toLowerCase().replace(/[^a-z]/g, '') || 'unknown';

             if (!bestDisplayNames[groupKey]) {
                bestDisplayNames[groupKey] = rawName;
             } else if (rawName.includes(' ') && !bestDisplayNames[groupKey].includes(' ')) {
                bestDisplayNames[groupKey] = rawName;
             }

             if (!kittingStatsByUser[groupKey]) {
                kittingStatsByUser[groupKey] = { garmentsKitted: 0 };
             }
             kittingStatsByUser[groupKey].garmentsKitted += qty;
         }
     });
     (order.items || []).forEach((item: any) => {
        const completed = item.completedSizes || [];
        completed.forEach((size: string) => {
           const qty = parseInt(item.sizes?.[size]) || 0;
           const stat = item.sizeStats?.[size];
           if (stat) {
               let userName = stat.user?.split('@')[0] || stat.user;
               const actMatch = (order.activities || []).find((a: any) =>
                   a.message?.startsWith('Completed') && a.message?.includes(`x ${size} for ${item.style}`)
               );
               if (!userName) {
                   userName = actMatch?.user?.split('@')[0] || actMatch?.user || 'Unknown';
               }

               if (metricsTimeFilter !== 'All') {
                   const ts = actMatch?.timestamp;
                   if (ts) {
                       const statDateStr = ts.split('T')[0];
                       if (metricsTimeFilter === 'Today') {
                           const lDate = new Date();
                           const lYear = lDate.getFullYear();
                           const lMonth = String(lDate.getMonth() + 1).padStart(2, '0');
                           const lDay = String(lDate.getDate()).padStart(2, '0');
                           const todayStr = `${lYear}-${lMonth}-${lDay}`;
                           if (statDateStr !== todayStr) return;
                       } else {
                           // custom calendar date matching YYYY-MM-DD
                           if (statDateStr !== metricsTimeFilter) return;
                       }
                   } else {
                       return; // Omit metric if no valid timestamp
                   }
               }

               let rawName = normalizeUser(userName, allUsersList);
               const groupKey = rawName.toLowerCase().replace(/[^a-z]/g, '') || 'unknown';

               if (!bestDisplayNames[groupKey]) {
                  bestDisplayNames[groupKey] = rawName;
               } else if (rawName.includes(' ') && !bestDisplayNames[groupKey].includes(' ')) {
                  bestDisplayNames[groupKey] = rawName;
               } else if (rawName.length > bestDisplayNames[groupKey].length && rawName !== rawName.toLowerCase()) {
                  bestDisplayNames[groupKey] = rawName;
               }

               const durationMs = stat.durationMs || 0;
               const timeMins = durationMs / 60000;

               if (!statsByUser[groupKey]) {
                  statsByUser[groupKey] = { totalTimeMins: 0, garmentsCompleted: 0 };
               }
               statsByUser[groupKey].totalTimeMins += timeMins;
               statsByUser[groupKey].garmentsCompleted += qty;
           }
        });
     });
  });

  const teamMetricUsers = Object.keys(statsByUser).sort((a,b) => statsByUser[b].garmentsCompleted - statsByUser[a].garmentsCompleted);
  const teamKittingMetricUsers = Object.keys(kittingStatsByUser).sort((a,b) => kittingStatsByUser[b].garmentsKitted - kittingStatsByUser[a].garmentsKitted);

  const newQuoteRequests = orders.filter(o => o.statusIndex === 0 && !o.isProjectGroup && o.customerId !== 'Shopify Temporary');
  const pendingApprovalOrders = orders.filter(o => o.statusIndex === 1 && !o.isProjectGroup && o.customerId !== 'Shopify Temporary');
  const newApprovedOrders = orders.filter(o => o.statusIndex === 3 && !o.isProjectGroup && o.customerId !== 'Shopify Temporary');
  const sourcingOrders = orders.filter(o => o.statusIndex === 4 && !o.isProjectGroup && o.customerId !== 'Shopify Temporary');
  
  const todayDateStr = new Date().toISOString().split('T')[0];
  const completedTodayOrders = orders.filter(o => {
    if (o.statusIndex < 6 || o.customerId === 'Shopify Temporary') return false;
    const lastAct = o.activities?.[0];
    return lastAct?.timestamp?.startsWith(todayDateStr) && lastAct?.message?.toLowerCase().includes('complete');
  });

  const getBreakdownOrders = () => {
    switch (activeStat) {
      case 'New Quotes': return newQuoteRequests;
      case 'Pending Approval': return pendingApprovalOrders;
      case 'New Orders': return newApprovedOrders;
      case 'Sourcing': return sourcingOrders;
      case 'In Production': return productionOrders;
      case 'Completed Today': return completedTodayOrders;
      default: return [];
    }
  };

  const statCards = [
    { label: 'New Quotes', value: newQuoteRequests.length.toString(), trend: newQuoteRequests.length > 0 ? 'Requires attention' : 'All clear' },
    { label: 'Pending Approval', value: pendingApprovalOrders.length.toString(), trend: pendingApprovalOrders.length > 0 ? 'Urgent' : 'All clear' },
    { label: 'New Orders', value: newApprovedOrders.length.toString(), trend: newApprovedOrders.length > 0 ? 'Assign to floor' : 'All clear' },
    { label: 'Sourcing', value: sourcingOrders.length.toString(), trend: sourcingOrders.length > 0 ? 'Awaiting blanks' : 'All clear' },
    { label: 'In Production', value: productionOrders.length.toString(), trend: 'On schedule' },
    { label: 'Completed Today', value: completedTodayOrders.length.toString(), trend: 'Great work' }
  ];

  return (
    <div className={tokens.layout.container}>
      {/* Header */}
      <div className={tokens.layout.pageHeader + " border-b border-brand-border pb-6"}>
        <div>
          <h1 className={tokens.typography.h1}>Dashboard</h1>
          <p className={tokens.typography.bodyMuted + " mt-2"}>
            Here is your daily production summary.
          </p>
        </div>
        
        {userData && ['Admin', 'Leadership', 'Manager', 'Printer'].includes(userData.role) && (
          <div>
             <SegmentedControl 
               options={
                 userData.role === 'Printer'
                   ? ['Printers Dashboard', 'Production Staff']
                   : ['Production Staff', 'Manager / Admin', 'Printers Dashboard']
               } 
               value={roleView} 
               onChange={setRoleView} 
             />
          </div>
        )}
      </div>
      
      {/* Live Meeting Alert Banner */}
      {liveMeetings.length > 0 && (
        <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 animate-pulse shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-red-600 animate-ping shrink-0" />
            <div>
              <p className="text-xs font-bold text-red-900">🔴 Live Meeting in Progress: {liveMeetings[0].title}</p>
              <p className="text-[10px] text-red-700 font-medium mt-0.5">Everyone in attendance is requested to check in and submit their Capacity Score.</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/team/meetings', { state: { selectMeetingId: liveMeetings[0].id } })}
            className="bg-red-600 hover:bg-red-700 text-white text-[10px] font-extrabold uppercase tracking-widest px-4 py-2 rounded-full shadow-sm transition-all shrink-0"
          >
            Join & Submit Score
          </button>
        </div>
      )}
      
      {roleView === 'Manager / Admin' ? (
        <div className="mt-6 flex flex-col gap-10 pb-12">
          
          {/* Top Row: Quick Stats & Command Center */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left: Quick Stats */}
            <div className="lg:col-span-8 flex flex-col gap-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {statCards.map((stat) => (
                <button 
                  key={stat.label} 
                  onClick={() => setActiveStat(stat.label === activeStat ? null : stat.label)}
                  className={`p-4 rounded-card border text-left flex flex-col justify-between transition-all group ${
                    activeStat === stat.label 
                      ? 'bg-brand-bg border-brand-primary shadow-sm' 
                      : 'bg-white border-brand-border hover:border-brand-primary/30 hover:shadow-sm'
                  }`}
                >
                  <span className={`${tokens.typography.label} mb-3 leading-tight text-[11px] min-h-[2.5rem]`}>{stat.label}</span>
                  <div className="flex flex-col items-start gap-1 w-full">
                    <span className="font-serif text-3xl tracking-tight text-brand-primary leading-none">{stat.value}</span>
                    <span className={`text-[9px] uppercase font-bold tracking-wider mt-1 ${stat.trend.includes('Urgent') || stat.trend.includes('Requires') ? 'text-red-500' : 'text-brand-secondary'}`}>
                      {stat.trend}
                    </span>
                  </div>
                </button>
              ))}
              </div>
              
              {/* Breakdown Section */}
              {activeStat && (
                <div className="bg-brand-bg/50 rounded-card border border-brand-primary/30 p-5 mt-2 transition-all animate-in fade-in slide-in-from-top-1">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-serif text-xl tracking-tight text-brand-primary">
                      {activeStat} Summary
                    </h3>
                    <button 
                      onClick={() => setActiveStat(null)}
                      className="text-brand-secondary hover:text-brand-primary text-xs uppercase tracking-wider font-semibold p-1"
                    >
                      Close ✕
                    </button>
                  </div>
                  <div className="bg-white rounded-lg border border-brand-border overflow-hidden shadow-sm">
                    <div className="flex border-b border-brand-border bg-brand-bg px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-brand-secondary">
                      <div className="w-24">Order</div>
                      <div className="flex-1">Details</div>
                      <div className="w-24 text-right">Action</div>
                    </div>
                    <div className="divide-y divide-brand-border max-h-40 overflow-y-auto custom-scrollbar">
                      {getBreakdownOrders().length > 0 ? getBreakdownOrders().map((o: any) => (
                        <div key={o.id} onClick={() => navigate(`/orders/${o.id}`)} className="flex px-4 py-3 text-sm hover:bg-brand-bg/50 transition-colors cursor-pointer items-center group">
                          <div className="w-24 font-medium text-brand-primary group-hover:underline truncate pr-2">
                            ORD-{o.portalId || o.id.substring(0, 8)}
                          </div>
                          <div className="flex-1 text-brand-secondary truncate pr-4">
                            {o.title || 'Untitled Order'}
                          </div>
                          <div className="w-24 text-right flex justify-end">
                            <span className="text-[10px] bg-white border border-brand-border px-2 py-0.5 rounded-md text-brand-primary group-hover:bg-brand-primary group-hover:text-white group-hover:border-brand-primary transition-colors font-semibold uppercase tracking-wide shadow-sm">
                              Open
                            </span>
                          </div>
                        </div>
                      )) : (
                        <div className="p-4 text-center text-sm text-brand-secondary italic">No orders in this category.</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Command Center Focus */}
            <div className="lg:col-span-4 bg-brand-primary rounded-card p-6 flex flex-col justify-between relative overflow-hidden shadow-lg border border-brand-primary">
               {/* Background subtle decoration */}
               <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full border border-white/10"></div>
               <div className="absolute right-8 -bottom-12 w-48 h-48 rounded-full border border-white/5"></div>
               
               <div className="relative z-10">
                 <h3 className="font-serif text-2xl mb-1 text-white">Action Required</h3>
                 <p className="text-white/60 text-sm mb-6">Tools requiring immediate attention.</p>
                 
                 <div className="space-y-3 mb-6">
                    <div onClick={() => setActiveStat('New Quotes')} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer group">
                      <span className="text-sm font-medium text-white/90 group-hover:text-white transition-colors">Review New Quotes</span>
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shadow-sm ${newQuoteRequests.length > 0 ? 'bg-amber-500 text-brand-primary' : 'bg-white/20 text-white/50'}`}>{newQuoteRequests.length}</span>
                    </div>
                    <div onClick={() => setActiveStat('Pending Approval')} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer group">
                      <span className="text-sm font-medium text-white/90 group-hover:text-white transition-colors">Review Client Proofs</span>
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shadow-sm ${pendingApprovalOrders.length > 0 ? 'bg-red-500 text-white' : 'bg-white/20 text-white/50'}`}>{pendingApprovalOrders.length}</span>
                    </div>
                    <div onClick={() => setActiveStat('New Orders')} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer group">
                      <span className="text-sm font-medium text-white/90 group-hover:text-white transition-colors">Assign New Orders</span>
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shadow-sm ${newApprovedOrders.length > 0 ? 'bg-blue-500 text-white' : 'bg-white/20 text-white/50'}`}>{newApprovedOrders.length}</span>
                    </div>
                 </div>
               </div>

               <button onClick={() => navigate('/orders')} className="relative z-10 w-full bg-white text-brand-primary font-semibold py-3 rounded-pill text-sm hover:bg-brand-bg transition-colors shadow-sm">
                 Open Command Center
               </button>
            </div>
          </div>

          {/* Team Performance Metrics */}
          {teamMetricUsers.length > 0 && (
            <div className="bg-white rounded-card border border-brand-border p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)]">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                     <div>
                        <h2 className={tokens.typography.h2}>Team Production Metrics</h2>
                        <p className="text-sm text-brand-secondary mt-1">Aggregated statistics across all recorded orders.</p>
                     </div>
                     <div className="flex items-center bg-brand-bg/50 p-1.5 rounded-xl border border-brand-border/60 shadow-sm shrink-0">
                        <button 
                           onClick={() => setMetricsTimeFilter('All')}
                           className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${metricsTimeFilter === 'All' ? 'bg-white shadow-sm text-brand-primary border border-brand-primary/10' : 'text-brand-secondary hover:text-brand-primary'}`}
                        >
                          All Time
                        </button>
                        <button 
                           onClick={() => setMetricsTimeFilter('Today')}
                           className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${metricsTimeFilter === 'Today' ? 'bg-white shadow-sm text-brand-primary border border-brand-primary/10' : 'text-brand-secondary hover:text-brand-primary'}`}
                        >
                          Today
                        </button>
                        <div className="relative">
                           <input 
                             type="date" 
                             className={`ml-1 pl-2 pr-2 py-1.5 text-xs font-bold uppercase tracking-widest outline-none rounded-lg cursor-pointer transition-colors ${metricsTimeFilter !== 'All' && metricsTimeFilter !== 'Today' ? 'bg-white text-brand-primary shadow-sm border border-brand-primary/10' : 'bg-transparent text-brand-secondary hover:text-brand-primary'}`}
                             onChange={(e) => {
                                 if (e.target.value) {
                                     setMetricsTimeFilter(e.target.value);
                                 }
                             }}
                             value={metricsTimeFilter !== 'All' && metricsTimeFilter !== 'Today' ? metricsTimeFilter : ''}
                           />
                        </div>
                     </div>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-2">
                     <button 
                        onClick={() => setActiveMetricsTab('All')}
                        className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-pill border transition-all whitespace-nowrap ${activeMetricsTab === 'All' ? 'bg-brand-primary text-white border-brand-primary shadow-sm' : 'bg-white text-brand-secondary border-brand-border hover:border-brand-primary/50'}`}
                     >
                        Full Team
                     </button>
                     {teamMetricUsers.map(uId => (
                        <button 
                           key={uId}
                           onClick={() => setActiveMetricsTab(uId)}
                           className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-pill border transition-all whitespace-nowrap ${activeMetricsTab === uId ? 'bg-brand-primary text-white border-brand-primary shadow-sm' : 'bg-white text-brand-secondary border-brand-border hover:border-brand-primary/50'}`}
                        >
                           {bestDisplayNames[uId] || uId}
                        </button>
                     ))}
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                     {(() => {
                        let totalMins = 0;
                        let totalGarments = 0;

                        if (activeMetricsTab === 'All') {
                           Object.values(statsByUser).forEach(stat => {
                              totalMins += stat.totalTimeMins;
                              totalGarments += stat.garmentsCompleted;
                           });
                        } else if (statsByUser[activeMetricsTab]) {
                           totalMins = statsByUser[activeMetricsTab].totalTimeMins;
                           totalGarments = statsByUser[activeMetricsTab].garmentsCompleted;
                        }

                        const avgTime = totalGarments > 0 ? (totalMins / totalGarments) : 0;
                        const rateHour = totalMins > 0 ? ((totalGarments / totalMins) * 60) : 0;

                        return (
                           <>
                             <div className="bg-brand-bg/50 border border-brand-border rounded-xl p-4 flex flex-col items-center justify-center">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1">Total Garments</span>
                                <span className="text-3xl font-black text-brand-primary">{totalGarments}</span>
                             </div>
                             <div className="bg-brand-bg/50 border border-brand-border rounded-xl p-4 flex flex-col items-center justify-center">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1">Avg Time / Garment</span>
                                <span className="text-3xl font-black text-blue-600">{avgTime >= 1 ? avgTime.toFixed(1) + 'm' : Math.round(avgTime * 60) + 's'}</span>
                             </div>
                             <div className="bg-brand-bg/50 border border-brand-border rounded-xl p-4 flex flex-col items-center justify-center">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1">Total Time</span>
                                <span className="text-3xl font-black text-brand-primary">{Math.round(totalMins)}m</span>
                             </div>
                             <div className="bg-brand-bg/50 border border-brand-border rounded-xl p-4 flex flex-col items-center justify-center">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1">Overall Rate</span>
                                <span className="text-3xl font-black text-green-600">{Math.round(rateHour)}/hr</span>
                             </div>
                           </>
                        );
                     })()}
                  </div>
                </div>
            </div>
          )}

          {/* Team Kitting Metrics */}
          {teamKittingMetricUsers.length > 0 && (
            <div className="bg-white rounded-card border border-brand-border p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)]">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                     <div>
                        <h2 className={tokens.typography.h2}>Team Kitting Metrics</h2>
                        <p className="text-sm text-brand-secondary mt-1">Aggregated statistics for shipments created and boxed items.</p>
                     </div>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-2">
                     <button 
                        onClick={() => setActiveKittingTab('All')}
                        className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-pill border transition-all whitespace-nowrap ${activeKittingTab === 'All' ? 'bg-brand-primary text-white border-brand-primary shadow-sm' : 'bg-white text-brand-secondary border-brand-border hover:border-brand-primary/50'}`}
                     >
                        Full Team
                     </button>
                     {teamKittingMetricUsers.map(uId => (
                        <button 
                           key={uId}
                           onClick={() => setActiveKittingTab(uId)}
                           className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-pill border transition-all whitespace-nowrap ${activeKittingTab === uId ? 'bg-brand-primary text-white border-brand-primary shadow-sm' : 'bg-white text-brand-secondary border-brand-border hover:border-brand-primary/50'}`}
                        >
                           {bestDisplayNames[uId] || uId}
                        </button>
                     ))}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                     {(() => {
                        let totalGarmentsKitted = 0;

                        if (activeKittingTab === 'All') {
                           Object.values(kittingStatsByUser).forEach(stat => {
                              totalGarmentsKitted += stat.garmentsKitted;
                           });
                        } else if (kittingStatsByUser[activeKittingTab]) {
                           totalGarmentsKitted = kittingStatsByUser[activeKittingTab].garmentsKitted;
                        }

                        return (
                           <div className="bg-brand-bg/50 border border-brand-border rounded-xl p-4 flex flex-col items-center justify-center">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-1">Total Garments Kitted</span>
                              <span className="text-3xl font-black text-brand-primary">{totalGarmentsKitted}</span>
                           </div>
                        );
                     })()}
                  </div>
                </div>
            </div>
          )}

          {/* Team Schedule Overview */}
          <div className="bg-white rounded-card border border-brand-border p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between mb-6">
               <div>
                  <h2 className={tokens.typography.h2}>Today's Floor Schedule</h2>
                  <p className="text-sm text-brand-secondary mt-1">Real-time team allocation and timeline blocks.</p>
               </div>
               <a href="/team" className="px-4 py-2 border border-brand-border rounded-pill text-xs font-semibold uppercase tracking-widest text-brand-secondary hover:text-brand-primary hover:bg-brand-bg transition-colors">Manage Team</a>
            </div>
            <div className="border border-brand-border/50 rounded-2xl overflow-hidden">
              <TimelinePlanner />
            </div>
          </div>

          {/* Active Orders Kanban Overview */}
          <div className="bg-white rounded-card border border-brand-border p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between mb-6">
               <div>
                 <h2 className={tokens.typography.h2}>Live Production Pipeline</h2>
                 <p className="text-sm text-brand-secondary mt-1">Bird's-eye view of all active shop orders.</p>
               </div>
               <div className="flex items-center gap-3">
                 <button className="px-4 py-2 border border-brand-border rounded-pill text-xs font-semibold uppercase tracking-widest text-brand-secondary hover:text-brand-primary hover:bg-brand-bg transition-colors">Filter</button>
                 <a href="/orders" className="px-4 py-2 bg-brand-primary text-white rounded-pill text-xs font-semibold uppercase tracking-widest hover:bg-black transition-colors">View All</a>
               </div>
            </div>
            
            {/* We constrain the height of the dashboard Kanban columns so it acts as an overview tool */}
            <div className="w-full">
              <KanbanBoard />
            </div>
          </div>
        </div>
      ) : roleView === 'Printers Dashboard' ? (
        <div className="mt-8 space-y-6">
          {/* Quick Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-card border border-brand-border flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-brand-secondary text-[11px]">To Print (Queue)</span>
                <h3 className="font-serif text-3xl text-brand-primary mt-1">
                  {printQueueItems.filter(item => item.readyToPrint && !item.printed).length}
                </h3>
              </div>
              <div className="w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center text-purple-600 border border-purple-100">
                <Printer size={18} />
              </div>
            </div>

            <div className="bg-white p-5 rounded-card border border-brand-border flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-brand-secondary text-[11px]">Rush Prints</span>
                <h3 className={`font-serif text-3xl mt-1 ${rushPrintsCount > 0 ? 'text-red-650' : 'text-brand-primary'}`}>
                  {rushPrintsCount}
                </h3>
              </div>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${rushPrintsCount > 0 ? 'bg-red-50 text-red-650 border-red-100' : 'bg-neutral-50 text-neutral-400 border-neutral-100'}`}>
                <AlertTriangle size={18} />
              </div>
            </div>

            <div className="bg-white p-5 rounded-card border border-brand-border flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-brand-secondary text-[11px]">Printed Today</span>
                <h3 className="font-serif text-3xl text-brand-primary mt-1">{printedTodayCount}</h3>
              </div>
              <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 border border-emerald-100">
                <CheckCircle2 size={18} />
              </div>
            </div>
          </div>

          {/* Filters & Count */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-brand-bg border border-brand-border p-4 rounded-card">
            <div className="flex items-center gap-1.5 bg-neutral-100 p-1 rounded-xl border border-neutral-200 shadow-inner">
              <button
                onClick={() => setPrinterFilter('pending')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold tracking-wider uppercase transition-all cursor-pointer ${
                  printerFilter === 'pending'
                    ? 'bg-white text-brand-primary shadow-sm border border-neutral-200'
                    : 'text-brand-secondary hover:text-brand-primary border border-transparent'
                }`}
              >
                Queue ({printQueueItems.filter(item => item.readyToPrint && !item.printed).length})
              </button>
              <button
                onClick={() => setPrinterFilter('printed')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold tracking-wider uppercase transition-all cursor-pointer ${
                  printerFilter === 'printed'
                    ? 'bg-white text-brand-primary shadow-sm border border-neutral-200'
                    : 'text-brand-secondary hover:text-brand-primary border border-transparent'
                }`}
              >
                Printed ({printQueueItems.filter(item => item.printed).length})
              </button>
              <button
                onClick={() => setPrinterFilter('all')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold tracking-wider uppercase transition-all cursor-pointer ${
                  printerFilter === 'all'
                    ? 'bg-white text-brand-primary shadow-sm border border-neutral-200'
                    : 'text-brand-secondary hover:text-brand-primary border border-transparent'
                }`}
              >
                All ({printQueueItems.length})
              </button>
            </div>
            <div className="text-xs text-brand-secondary font-bold uppercase tracking-wider">
              Showing {displayedPrinterItems.length} gang sheets
            </div>
          </div>

          {/* Grid list of gang sheets */}
          {displayedPrinterItems.length === 0 ? (
            <div className="bg-white border border-brand-border border-dashed rounded-xl p-16 text-center text-brand-secondary flex flex-col items-center gap-3">
              <Printer size={36} className="opacity-40" />
              <p className="font-semibold text-sm">No gang sheets in this queue.</p>
              <p className="text-xs">Mark gang sheets as "Ready to Print" on order detail pages to see them here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayedPrinterItems.map((item: any) => {
                const companyName = customers[item.orderCustomerId]?.company || customers[item.orderCustomerId]?.name || item.orderCustomerId || 'Unknown Client';
                
                return (
                  <div key={item.id} className={`bg-white border rounded-2xl p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition-all ${item.orderPriority === 'rush' ? 'border-l-4 border-l-red-500 border-brand-border' : 'border-brand-border'}`}>
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span 
                            onClick={() => navigate(`/orders/${item.orderId}`)}
                            className="text-[10px] uppercase font-bold text-brand-secondary tracking-widest px-1.5 py-0.5 border border-brand-border/65 hover:bg-neutral-50 hover:text-brand-primary transition-colors cursor-pointer rounded"
                          >
                            #{item.orderPortalId || item.orderId.substring(0, 8)}
                          </span>
                          <span className="text-brand-primary font-serif font-bold text-xs truncate max-w-[120px]">{companyName}</span>
                        </div>
                        <h4 className="font-semibold text-brand-primary text-sm line-clamp-1">{item.orderTitle}</h4>
                        <p className="text-[11px] font-semibold text-neutral-400 mt-1">
                          {item.style || 'DTF Gang Sheet'} • {item.sheetWidth || 22}" x {item.sheetHeight || 24}" • {item.quantity || item.qty || 1} { (item.quantity || item.qty || 1) === 1 ? 'Sheet' : 'Sheets' }
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1.5">
                        {item.orderPriority === 'rush' && (
                          <span className="text-[8px] font-bold uppercase tracking-wider text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded shadow-sm">
                            RUSH
                          </span>
                        )}
                        {item.printed ? (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-750 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded shadow-sm">
                            Printed
                          </span>
                        ) : item.readyToPrint ? (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded shadow-sm animate-pulse">
                            Ready
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-500 bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded shadow-sm">
                            Not Ready
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Preview Area */}
                    <div className="relative aspect-[3/4] w-full bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden flex items-center justify-center bg-checkerboard animate-in fade-in duration-300">
                      {item.printReadyUrl ? (
                        <img 
                          src={item.printReadyUrl} 
                          alt="Layout Preview" 
                          className="w-full h-full object-contain p-3 hover:scale-102 transition-transform duration-300 cursor-pointer"
                          onClick={() => setExpandedImage({ src: item.printReadyUrl, alt: `${item.style || 'Gang Sheet'}` })}
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-neutral-500 text-center p-6 bg-neutral-900 w-full h-full justify-center">
                          <AlertTriangle size={24} className="text-amber-500" />
                          <span className="text-xs font-semibold text-neutral-400">Production files not generated</span>
                          <p className="text-[10px] text-neutral-500 px-4 leading-normal">The production team needs to click "Generate Production Files" in order details first.</p>
                        </div>
                      )}
                    </div>

                    {/* Footer Actions */}
                    <div className="flex flex-col gap-2 mt-auto pt-2 border-t border-brand-border/40">
                      <div className="grid grid-cols-2 gap-2">
                        <a
                          href={item.printReadyUrl || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className={`flex items-center justify-center gap-1.5 text-xs font-bold text-center border py-2 rounded-xl transition-all cursor-pointer ${
                            item.printReadyUrl 
                              ? 'border-brand-border text-brand-primary bg-white hover:bg-neutral-50 shadow-sm' 
                              : 'border-brand-border/40 text-neutral-350 bg-neutral-50 pointer-events-none'
                          }`}
                        >
                          <Printer size={12} />
                          <span>Print PNG</span>
                        </a>
                        <a
                          href={item.cutReadyUrl || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className={`flex items-center justify-center gap-1.5 text-xs font-bold text-center border py-2 rounded-xl transition-all cursor-pointer ${
                            item.cutReadyUrl 
                              ? 'border-brand-border text-brand-primary bg-white hover:bg-neutral-50 shadow-sm' 
                              : 'border-brand-border/40 text-neutral-350 bg-neutral-50 pointer-events-none'
                          }`}
                        >
                          <Download size={12} />
                          <span>Cut SVG</span>
                        </a>
                      </div>

                      {item.printed ? (
                        <button
                          onClick={() => handleMarkUnprinted(item.orderId, item.id)}
                          className="w-full bg-neutral-105 hover:bg-neutral-200 text-neutral-700 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border border-neutral-200 cursor-pointer"
                        >
                          <X size={12} />
                          <span>Mark Unprinted (Reset)</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleMarkPrinted(item.orderId, item.id)}
                          disabled={!item.printReadyUrl}
                          className={`w-full py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 text-white cursor-pointer ${
                            item.printReadyUrl 
                              ? 'bg-emerald-600 hover:bg-emerald-700 shadow-sm' 
                              : 'bg-neutral-300 pointer-events-none'
                          }`}
                        >
                          <CheckCircle2 size={12} />
                          <span>Mark Printed</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-8">
           <div className="flex items-center justify-between mb-6">
             <h2 className={tokens.typography.h2}>Your Dashboard</h2>
             <SegmentedControl 
               options={['Day', 'Week', 'Month']} 
               value={staffTimeframe} 
               onChange={setStaffTimeframe} 
             />
           </div>
           
           <div className="space-y-6">
             {/* Personal Tasks */}
             <div>
               <h3 className={tokens.typography.h3 + " mb-4"}>Assigned Tasks</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {displayedTasks.length === 0 ? (
                    <div className="md:col-span-2 text-sm text-brand-secondary italic p-4 bg-brand-bg/50 rounded-xl border border-brand-border">No tasks immediately assigned to you right now.</div>
                  ) : (
                    displayedTasks.map((task) => (
                     <div 
                       key={task.id} 
                       onClick={() => {
                          if (task.orderId) navigate(`/orders/${task.orderId}`);
                       }}
                       className={`bg-white p-5 rounded-card border border-brand-border flex items-center justify-between shadow-sm hover:shadow-md transition-shadow ${task.orderId ? 'cursor-pointer group' : ''}`}
                     >
                       <div className="flex items-start gap-4">
                         <div className={`w-3 h-3 rounded-sm mt-1 shrink-0 ${task.color || 'bg-blue-500'}`}></div>
                         <div>
                           <h4 className={`font-semibold text-brand-primary mb-1 leading-tight ${task.orderId ? 'group-hover:underline' : ''}`}>{task.title}</h4>
                           <span className="text-xs text-brand-secondary font-bold tracking-wider uppercase">{formatTaskTime(task.start, task.duration)}</span>
                         </div>
                       </div>
                       
                       <select 
                         value={task.color || 'bg-blue-500'} 
                         onClick={(e) => e.stopPropagation()}
                         onChange={async (e) => {
                            e.stopPropagation();
                            try {
                              let status = 'in_progress';
                              if (e.target.value === 'bg-green-500') status = 'completed';
                              if (e.target.value === 'bg-red-500') status = 'delayed';
                              if (e.target.value === 'bg-amber-500') status = 'pending';
                              
                              await updateDoc(doc(chronoDb, 'shiftSchedules', task.id), { 
                                color: e.target.value,
                                status: status
                              });
                            } catch (err) {
                              console.error("Error updating status:", err);
                            }
                         }}
                         className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary bg-brand-bg border border-brand-border/60 rounded-md px-2 py-1.5 outline-none cursor-pointer hover:border-brand-primary/50 hover:text-brand-primary transition-colors max-w-[120px]"
                       >
                         <option value="bg-amber-500">Not Started</option>
                         <option value="bg-blue-500">Active</option>
                         <option value="bg-green-500">Complete</option>
                         <option value="bg-red-500">Delayed</option>
                       </select>
                     </div>
                    ))
                  )}
                </div>
             </div>

             {/* Order Assignments */}
             <div className="pt-4 border-t border-brand-border/50">
               <h3 className={tokens.typography.h3 + " mb-4"}>Production Orders</h3>
               <div className="bg-white rounded-card border border-brand-border overflow-hidden">
                 <div className="grid grid-cols-4 p-4 text-xs font-semibold uppercase tracking-wider text-brand-secondary border-b border-brand-border bg-brand-bg/50">
                   <div className="col-span-2">Order</div>
                   <div>Status</div>
                   <div>Due</div>
                 </div>
                 <div className="divide-y divide-brand-border max-h-[400px] overflow-y-auto">
                    {assignedOrders.length === 0 ? (
                      <div className="p-8 text-center text-brand-secondary italic text-sm">No orders currently assigned to you on the floor.</div>
                    ) : (
                      assignedOrders.map((order) => {
                        const companyName = customers[order.customerId]?.company || customers[order.customerId]?.name || order.customerId || 'Unknown Client';
                        const displayId = order.portalId || order.id.substring(0, 8);
                        
                        return (
                         <div key={order.id} onClick={() => navigate(`/orders/${order.id}`)} className="grid grid-cols-4 p-4 items-center hover:bg-brand-bg transition-colors cursor-pointer group">
                           <div className="col-span-2 pr-4">
                             <div className="flex items-center gap-2 mb-1">
                               <span className="text-[10px] uppercase font-bold text-brand-secondary tracking-widest px-1.5 py-0.5 border border-brand-border/50 rounded">#{displayId}</span>
                               <span className="text-brand-primary font-serif">— {companyName}</span>
                             </div>
                             <p className="font-semibold text-brand-primary text-sm group-hover:underline line-clamp-1">{order.title}</p>
                           </div>
                           <div>
                             <span className={`text-[10px] border px-2.5 py-1 rounded-md font-bold tracking-wide uppercase ${order.statusIndex > 6 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-brand-bg border-brand-border/60 text-brand-secondary'}`}>
                               {order.statusIndex > 6 ? 'Kitting' : 'In Production'}
                             </span>
                           </div>
                           <div className="text-xs font-bold uppercase tracking-wider text-brand-secondary">
                             {order.shipDate ? new Date(order.shipDate).toLocaleDateString([], { month: 'short', day: 'numeric'}) : 'TBD'}
                           </div>
                         </div>
                        );
                      })
                    )}
                  </div>
               </div>
             </div>
           </div>
        </div>
      )}

      {/* Image Overlay Lightbox */}
      {expandedImage && (
        <div 
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 animate-in fade-in duration-200" 
          onClick={() => setExpandedImage(null)}
        >
           <button 
             className="absolute top-6 right-6 text-neutral-800 hover:text-black hover:scale-105 transition-all p-2 bg-white rounded-full shadow-lg border border-neutral-100 z-50 cursor-pointer" 
             onClick={() => setExpandedImage(null)}
           >
             <X size={20} />
           </button>
           <div 
             className="relative max-w-4xl max-h-[85vh] w-full bg-checkerboard rounded-[2rem] p-6 md:p-10 shadow-2xl overflow-hidden flex items-center justify-center border border-neutral-200/50 cursor-crosshair animate-in zoom-in-95 duration-200"
             onClick={(e) => e.stopPropagation()}
             onMouseMove={(e) => {
               const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
               const x = (e.clientX - left) / width;
               const y = (e.clientY - top) / height;
               const img = e.currentTarget.querySelector('img');
               if (img) img.style.transformOrigin = `${x * 100}% ${y * 100}%`;
             }}
             title="Hover to zoom"
           >
             <img 
               src={expandedImage.src} 
               alt={expandedImage.alt} 
               style={{ width: 'auto', height: 'auto', maxWidth: '105%', maxHeight: '70vh' }}
               className="rounded-2xl select-none transition-transform duration-200 ease-out hover:scale-[2]" 
             />
           </div>
        </div>
      )}
    </div>
  );
}
