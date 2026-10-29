import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { tokens } from '../../lib/tokens';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { KanbanBoard } from '../../components/shared/KanbanBoard';
import { TimelinePlanner } from '../Team/TimelinePlanner';
import { useAuth } from '../../contexts/AuthContext';
import { useOrders } from '../../hooks/useOrders';
import { db, chronoDb, chronoAuth } from '../../lib/firebase';
import { collection, query, getDocs, onSnapshot, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { normalizeUser } from '../../lib/utils';
import { Printer, CheckCircle2, AlertTriangle, Download, X, Building2, GripVertical, Package, ChevronRight, CornerDownRight, Star, Box } from 'lucide-react';
import { ImageLightboxModal } from '../../components/shared/ImageLightboxModal';


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
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string; item?: any; itemStyle?: string } | null>(null);
  
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
      const items = order.items || [];

      // 1. Master Combined Order Gang Sheet
      if (order.masterReadyToPrint || order.masterPrintReadyUrl || order.masterSheetUrl || order.masterPrinted || order.masterCutReadyUrl) {
        list.push({
          id: `master-combined-${order.id}`,
          realItemId: 'master-combined-item',
          isMaster: true,
          type: 'art',
          readyToPrint: !!(order.masterReadyToPrint || order.masterPrintReadyUrl),
          printed: !!order.masterPrinted,
          printedAt: order.masterPrintedAt || null,
          printedBy: order.masterPrintedBy || null,
          style: `Combined Order Master Sheet (${items.length} items)`,
          sheetWidth: order.masterSheetWidth || 22,
          sheetHeight: order.masterSheetHeight || 24,
          printReadyUrl: order.masterPrintReadyUrl || order.masterSheetUrl || order.masterCutReadyUrl || null,
          cutReadyUrl: order.masterCutReadyUrl || null,
          orderId: order.id,
          orderTitle: order.title || 'Custom Order',
          orderPortalId: order.portalId,
          orderCustomerId: order.customerId,
          orderPriority: order.priority,
          orderShipDate: order.shipDate,
          orderStatusIndex: order.statusIndex
        });
      }

      // 2. Master Tag Gang Sheet
      if (order.masterTagReadyToPrint || order.masterTagPrintReadyUrl || order.masterTagPrinted) {
        list.push({
          id: `master-tag-${order.id}`,
          realItemId: 'master-tag-item',
          isMaster: true,
          type: 'tag',
          readyToPrint: !!order.masterTagReadyToPrint,
          printed: !!order.masterTagPrinted,
          printedAt: order.masterTagPrintedAt || null,
          printedBy: order.masterTagPrintedBy || null,
          style: `Combined Size Tag Gang Sheet`,
          sheetWidth: 22,
          sheetHeight: 24,
          printReadyUrl: order.masterTagPrintReadyUrl || null,
          cutReadyUrl: order.masterTagCutReadyUrl || null,
          orderId: order.id,
          orderTitle: order.title || 'Custom Order',
          orderPortalId: order.portalId,
          orderCustomerId: order.customerId,
          orderPriority: order.priority,
          orderShipDate: order.shipDate,
          orderStatusIndex: order.statusIndex
        });
      }

      // 3. Individual line items (only include items with actual print files or gang_sheet type)
      items.forEach((item: any) => {
        const isGangSheet = item.itemType === 'gang_sheet';
        const hasPrintUrl = !!(item.printReadyUrl || item.originalSheetUrl || item.gangSheetUrl);
        const hasArtworks = Array.isArray(item.artworks) && item.artworks.length > 0;
        const isItemMarkedReady = !!item.readyToPrint;
        const isItemPrinted = !!item.printed;

        if (isGangSheet || hasPrintUrl || (hasArtworks && (isItemMarkedReady || isItemPrinted))) {
          list.push({
            ...item,
            id: `${item.id}-art`,
            realItemId: item.id,
            type: 'art',
            readyToPrint: isItemMarkedReady || hasPrintUrl,
            printed: isItemPrinted,
            printedAt: item.printedAt || null,
            printedBy: item.printedBy || null,
            style: item.itemType === 'gang_sheet' ? (item.sheetSizeName || 'DTF Gang Sheet') : (item.style ? `${item.style} - Main Art` : 'DTF Gang Sheet'),
            sheetWidth: item.sheetWidth || 22,
            sheetHeight: item.sheetHeight || 24,
            printReadyUrl: item.printReadyUrl || item.originalSheetUrl || item.gangSheetUrl || null,
            cutReadyUrl: item.cutReadyUrl || null,
            orderId: order.id,
            orderTitle: order.title || 'Custom Order',
            orderPortalId: order.portalId,
            orderCustomerId: order.customerId,
            orderPriority: order.priority,
            orderShipDate: order.shipDate,
            orderStatusIndex: order.statusIndex
          });
        }

        const hasTagReady = !!item.tagReadyToPrint;
        const hasTagPrinted = !!item.tagPrinted;
        if (item.logoUrlTag && (item.tagPrintReadyUrl || hasTagReady || hasTagPrinted)) {
          list.push({
            ...item,
            id: `${item.id}-tag`,
            realItemId: item.id,
            type: 'tag',
            readyToPrint: hasTagReady,
            printed: hasTagPrinted,
            printedAt: item.tagPrintedAt || null,
            printedBy: item.tagPrintedBy || null,
            style: `${item.style || 'Garment'} - Neck Tag`,
            sheetWidth: 22,
            sheetHeight: 24,
            printReadyUrl: item.tagPrintReadyUrl || null,
            cutReadyUrl: item.tagCutReadyUrl || null,
            orderId: order.id,
            orderTitle: order.title || 'Custom Order',
            orderPortalId: order.portalId,
            orderCustomerId: order.customerId,
            orderPriority: order.priority,
            orderShipDate: order.shipDate,
            orderStatusIndex: order.statusIndex
          });
        }
      });
    });

    const seen = new Set();
    return list.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
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

  const handleMarkPrinted = async (orderId: string, queueItemId: string) => {
    const orderObj = orders.find(o => o.id === orderId);
    if (!orderObj) return;

    const timestamp = new Date().toISOString();
    const printerName = userData?.name || userData?.email?.split('@')[0] || 'Printer';

    if (queueItemId.startsWith('master-combined-')) {
      const updatedItems = (orderObj.items || []).map((item: any) => ({
        ...item,
        printed: true,
        printedAt: timestamp,
        printedBy: printerName
      }));
      const newActivity = {
        id: `act-${Date.now()}`,
        type: 'system',
        message: `Marked Combined Order Master Sheet as printed from Printers Dashboard`,
        user: printerName,
        timestamp
      };
      await updateDoc(doc(db, 'orders', orderId), {
        masterPrinted: true,
        masterPrintedAt: timestamp,
        masterPrintedBy: printerName,
        items: updatedItems,
        activities: [newActivity, ...(orderObj.activities || [])]
      });
      return;
    }

    if (queueItemId.startsWith('master-tag-')) {
      const updatedItems = (orderObj.items || []).map((item: any) => ({
        ...item,
        tagPrinted: true,
        tagPrintedAt: timestamp,
        tagPrintedBy: printerName
      }));
      const newActivity = {
        id: `act-${Date.now()}`,
        type: 'system',
        message: `Marked Combined Size Tag Gang Sheet as printed from Printers Dashboard`,
        user: printerName,
        timestamp
      };
      await updateDoc(doc(db, 'orders', orderId), {
        masterTagPrinted: true,
        masterTagPrintedAt: timestamp,
        masterTagPrintedBy: printerName,
        items: updatedItems,
        activities: [newActivity, ...(orderObj.activities || [])]
      });
      return;
    }

    const isTag = queueItemId.endsWith('-tag');
    const realItemId = queueItemId.replace('-art', '').replace('-tag', '');

    const updatedItems = (orderObj.items || []).map((item: any) => {
      if (item.id === realItemId) {
        if (isTag) {
          return {
            ...item,
            tagPrinted: true,
            tagPrintedAt: timestamp,
            tagPrintedBy: printerName
          };
        } else {
          return {
            ...item,
            printed: true,
            printedAt: timestamp,
            printedBy: printerName
          };
        }
      }
      return item;
    });

    const targetItem = (orderObj.items || []).find((item: any) => item.id === realItemId);

    try {
      const label = isTag ? 'neck tag gang sheet' : 'gang sheet';
      const message = `Marked ${label} "${targetItem?.style || 'DTF Gang Sheet'}" as printed from Printers Dashboard`;
      const newActivity = {
        id: `act-${Date.now()}`,
        type: 'system',
        message,
        user: printerName,
        timestamp
      };

      await updateDoc(doc(db, 'orders', orderId), { 
        items: updatedItems,
        activities: [newActivity, ...(orderObj.activities || [])]
      });
    } catch (err) {
      console.error("Error marking printed:", err);
    }
  };

  const handleMarkUnprinted = async (orderId: string, queueItemId: string) => {
    const orderObj = orders.find(o => o.id === orderId);
    if (!orderObj) return;

    if (queueItemId.startsWith('master-combined-')) {
      const updatedItems = (orderObj.items || []).map((item: any) => ({
        ...item,
        printed: false,
        printedAt: null,
        printedBy: null
      }));
      await updateDoc(doc(db, 'orders', orderId), {
        masterPrinted: false,
        masterPrintedAt: null,
        masterPrintedBy: null,
        items: updatedItems
      });
      return;
    }

    if (queueItemId.startsWith('master-tag-')) {
      const updatedItems = (orderObj.items || []).map((item: any) => ({
        ...item,
        tagPrinted: false,
        tagPrintedAt: null,
        tagPrintedBy: null
      }));
      await updateDoc(doc(db, 'orders', orderId), {
        masterTagPrinted: false,
        masterTagPrintedAt: null,
        masterTagPrintedBy: null,
        items: updatedItems
      });
      return;
    }

    const isTag = queueItemId.endsWith('-tag');
    const realItemId = queueItemId.replace('-art', '').replace('-tag', '');

    const updatedItems = (orderObj.items || []).map((item: any) => {
      if (item.id === realItemId) {
        if (isTag) {
          return {
            ...item,
            tagPrinted: false,
            tagPrintedAt: null,
            tagPrintedBy: null
          };
        } else {
          return {
            ...item,
            printed: false,
            printedAt: null,
            printedBy: null
          };
        }
      }
      return item;
    });

    try {
      await updateDoc(doc(db, 'orders', orderId), { 
        items: updatedItems
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
    const unsubCustomers = onSnapshot(
      collection(db, 'customers'),
      (snap) => {
        const obj: Record<string, any> = {};
        snap.forEach(d => { obj[d.id] = d.data(); });
        setCustomers(obj);
      },
      (e) => console.error(e)
    );

    getDocs(collection(db, 'users')).then(snap => {
      setAllUsersList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }).catch(e => console.error(e));

    return () => unsubCustomers();
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

  const newQuoteRequests = orders.filter(o => (o.statusIndex === 0 || o.statusIndex === undefined) && !o.isProjectGroup && o.customerId !== 'Shopify Temporary');
  const pendingApprovalOrders = orders.filter(o => o.statusIndex === 1 && !o.isProjectGroup && o.customerId !== 'Shopify Temporary');
  const quotePreparedOrders = orders.filter(o => o.statusIndex === 2 && !o.isProjectGroup && o.customerId !== 'Shopify Temporary');
  const newApprovedOrders = orders.filter(o => o.statusIndex === 3 && !o.isProjectGroup && o.customerId !== 'Shopify Temporary');
  const sourcingOrders = orders.filter(o => o.statusIndex === 4 && !o.isProjectGroup && o.customerId !== 'Shopify Temporary');
  const blanksOrderedOrders = orders.filter(o => o.statusIndex === 5 && !o.isProjectGroup && o.customerId !== 'Shopify Temporary');
  const inProductionOnlyOrders = orders.filter(o => o.statusIndex === 6 && !o.isProjectGroup && o.customerId !== 'Shopify Temporary');
  const shippedOrders = orders.filter(o => o.statusIndex === 7 && !o.isProjectGroup && o.customerId !== 'Shopify Temporary');
  const receivedOrders = orders.filter(o => o.statusIndex === 8 && !o.isProjectGroup && o.customerId !== 'Shopify Temporary');
  
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
      case 'Quote Prepared': return quotePreparedOrders;
      case 'New Orders': return newApprovedOrders;
      case 'Sourcing': return sourcingOrders;
      case 'Garments Ordered': return blanksOrderedOrders;
      case 'In Production': return inProductionOnlyOrders;
      case 'Shipped / Inventory': return shippedOrders;
      case 'Received / Live': return receivedOrders;
      case 'Completed Today': return completedTodayOrders;
      default: return [];
    }
  };

  const [draggedPriorityKey, setDraggedPriorityKey] = useState<string | null>(null);
  const [dragOverPriorityKey, setDragOverPriorityKey] = useState<string | null>(null);
  const [localPriorityOrder, setLocalPriorityOrder] = useState<string[] | null>(null);

  const highPriorityOrders = useMemo(() => {
    return orders.filter(
      (o: any) =>
        (o.highPriority || o.priority === 'rush' || o.priority === 'high') &&
        !o.isProjectGroup &&
        o.customerId !== 'Shopify Temporary'
    );
  }, [orders]);

  const highPriorityCustomers = useMemo(() => {
    return Object.entries(customers)
      .filter(([, c]) => Boolean(c?.highPriority))
      .map(([id, c]) => ({ id, ...c }))
      .sort((a: any, b: any) => (a.company || a.name || '').localeCompare(b.company || b.name || ''));
  }, [customers]);

  const highPriorityItems = useMemo(() => {
    const highPriorityCustIds = new Set(highPriorityCustomers.map((c: any) => c.id));

    // Find any parent customers that aren't high priority themselves, but have a high-priority subcustomer
    const contextParentsMap = new Map<string, { parentData: any; minChildRank: number }>();
    highPriorityCustomers.forEach((c: any) => {
      const parentId = c.parentCustomerId;
      if (parentId && !highPriorityCustIds.has(parentId) && customers[parentId]) {
        const childRank = typeof c.highPriorityRank === 'number' ? c.highPriorityRank : 9999;
        const existing = contextParentsMap.get(parentId);
        if (!existing || childRank < existing.minChildRank) {
          contextParentsMap.set(parentId, {
            parentData: { id: parentId, ...customers[parentId] },
            minChildRank: childRank
          });
        }
      }
    });

    const items: Array<{
      key: string;
      itemType: 'customer' | 'order';
      id: string;
      rank: number;
      label: string;
      data: any;
      isContextParent?: boolean;
    }> = [
      ...highPriorityCustomers.map((c: any) => ({
        key: `cust-${c.id}`,
        itemType: 'customer' as const,
        id: c.id,
        rank: typeof c.highPriorityRank === 'number' ? c.highPriorityRank : 9999,
        label: (c.company && c.company !== '-' ? c.company : c.contactName || c.name || c.email || 'Customer').toLowerCase(),
        data: c,
        isContextParent: false
      })),
      ...Array.from(contextParentsMap.entries()).map(([parentId, { parentData, minChildRank }]) => ({
        key: `cust-${parentId}`,
        itemType: 'customer' as const,
        id: parentId,
        rank: typeof parentData.highPriorityRank === 'number' ? parentData.highPriorityRank : minChildRank,
        label: (parentData.company && parentData.company !== '-' ? parentData.company : parentData.contactName || parentData.name || parentData.email || 'Customer').toLowerCase(),
        data: parentData,
        isContextParent: true
      })),
      ...highPriorityOrders.map((o: any) => ({
        key: `order-${o.id}`,
        itemType: 'order' as const,
        id: o.id,
        rank: typeof o.highPriorityRank === 'number' ? o.highPriorityRank : 9999,
        label: (o.title || 'Untitled Order').toLowerCase(),
        data: o
      }))
    ];

    items.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.itemType !== b.itemType) return a.itemType === 'customer' ? -1 : 1;
      return a.label.localeCompare(b.label);
    });

    if (localPriorityOrder && localPriorityOrder.length > 0) {
      const orderIndexMap = new Map(localPriorityOrder.map((k, idx) => [k, idx]));
      items.sort((a, b) => {
        const idxA = orderIndexMap.has(a.key) ? orderIndexMap.get(a.key)! : 99999;
        const idxB = orderIndexMap.has(b.key) ? orderIndexMap.get(b.key)! : 99999;
        return idxA - idxB;
      });
    }

    // Group subcustomers directly underneath their parent customer when the parent is in the list
    const parentIdsInList = new Set(
      items.filter(i => i.itemType === 'customer').map(i => i.id)
    );
    const childrenByParent = new Map<string, typeof items>();
    const topLevelItems: typeof items = [];

    for (const item of items) {
      const parentId = item.itemType === 'customer' ? item.data?.parentCustomerId : null;
      if (parentId && parentIdsInList.has(parentId)) {
        const list = childrenByParent.get(parentId) || [];
        list.push(item);
        childrenByParent.set(parentId, list);
      } else {
        topLevelItems.push(item);
      }
    }

    const groupedItems: typeof items = [];
    for (const item of topLevelItems) {
      groupedItems.push(item);
      if (item.itemType === 'customer' && childrenByParent.has(item.id)) {
        groupedItems.push(...(childrenByParent.get(item.id) || []));
      }
    }

    return groupedItems;
  }, [highPriorityCustomers, highPriorityOrders, localPriorityOrder, customers]);

  const handleDropPriorityItem = async (targetKey: string) => {
    if (!draggedPriorityKey || draggedPriorityKey === targetKey) {
      setDraggedPriorityKey(null);
      setDragOverPriorityKey(null);
      return;
    }

    const currentKeys = highPriorityItems.map(i => i.key);
    const fromIdx = currentKeys.indexOf(draggedPriorityKey);
    const toIdx = currentKeys.indexOf(targetKey);

    if (fromIdx === -1 || toIdx === -1) {
      setDraggedPriorityKey(null);
      setDragOverPriorityKey(null);
      return;
    }

    const reorderedItems = [...highPriorityItems];
    const [moved] = reorderedItems.splice(fromIdx, 1);
    reorderedItems.splice(toIdx, 0, moved);

    setLocalPriorityOrder(reorderedItems.map(i => i.key));
    setDraggedPriorityKey(null);
    setDragOverPriorityKey(null);

    try {
      const batch = writeBatch(db);
      reorderedItems.forEach((item, index) => {
        const collectionName = item.itemType === 'customer' ? 'customers' : 'orders';
        batch.update(doc(db, collectionName, item.id), {
          highPriorityRank: index
        });
      });
      await batch.commit();
      setLocalPriorityOrder(null);
    } catch (err) {
      console.error('Failed to save high priority rank order:', err);
    }
  };

  const getOrderStatusLabel = (statusIndex?: number) => {
    switch (statusIndex) {
      case 0: return 'New Quote';
      case 1: return 'Pending Approval';
      case 2: return 'Quote Prepared';
      case 3: return 'New Order';
      case 4: return 'Sourcing';
      case 5: return 'Garments Ordered';
      case 6: return 'In Production';
      case 7: return 'Shipped / Inventory';
      case 8: return 'Received / Live';
      default: return 'New Quote';
    }
  };

  const handleRemoveHighPriority = async (e: React.MouseEvent, orderObj: any) => {
    e.stopPropagation();
    const adminName = userData?.name || userData?.email?.split('@')[0] || 'Team Member';
    const activity = {
      id: `act-${Date.now()}`,
      type: 'system',
      message: 'Removed High Priority from order',
      user: adminName,
      timestamp: new Date().toISOString()
    };
    try {
      await updateDoc(doc(db, 'orders', orderObj.id), {
        highPriority: false,
        priority: 'normal',
        activities: [activity, ...(orderObj.activities || [])]
      });
    } catch (err) {
      console.error('Failed to remove high priority:', err);
    }
  };

  const handleRemoveCustomerHighPriority = async (e: React.MouseEvent, custId: string) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, 'customers', custId), {
        highPriority: false
      });
    } catch (err) {
      console.error('Failed to remove customer high priority:', err);
    }
  };

  const statCards = [
    { label: 'New Quotes', value: newQuoteRequests.length.toString(), trend: newQuoteRequests.length > 0 ? 'Requires attention' : 'All clear' },
    { label: 'Pending Approval', value: pendingApprovalOrders.length.toString(), trend: pendingApprovalOrders.length > 0 ? 'Urgent' : 'All clear' },
    { label: 'Quote Prepared', value: quotePreparedOrders.length.toString(), trend: quotePreparedOrders.length > 0 ? 'Sent to client' : 'All clear' },
    { label: 'New Orders', value: newApprovedOrders.length.toString(), trend: newApprovedOrders.length > 0 ? 'Assign to floor' : 'All clear' },
    { label: 'Sourcing', value: sourcingOrders.length.toString(), trend: sourcingOrders.length > 0 ? 'Awaiting blanks' : 'All clear' },
    { label: 'Garments Ordered', value: blanksOrderedOrders.length.toString(), trend: blanksOrderedOrders.length > 0 ? 'In transit' : 'All clear' },
    { label: 'In Production', value: inProductionOnlyOrders.length.toString(), trend: inProductionOnlyOrders.length > 0 ? 'On schedule' : 'All clear' },
    { label: 'Shipped / Inventory', value: shippedOrders.length.toString(), trend: shippedOrders.length > 0 ? 'Dispatched' : 'All clear' },
    { label: 'Received / Live', value: receivedOrders.length.toString(), trend: receivedOrders.length > 0 ? 'Fulfilled' : 'All clear' },
    { label: 'Completed Today', value: completedTodayOrders.length.toString(), trend: completedTodayOrders.length > 0 ? 'Great work' : 'All clear' }
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

      {/* High Priority Orders & Customers Section (Above Quick Stats & Action Required) */}
      {highPriorityItems.length > 0 && (
        <div className="mt-6 bg-red-50/70 border border-red-200 rounded-card p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <AlertTriangle size={16} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-serif text-xl text-red-950 leading-none">High Priority</h3>
                  <span className="bg-red-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {highPriorityItems.length}
                  </span>
                </div>
                <p className="text-xs text-red-800/80 mt-0.5">
                  Drag rows to reorder priority across the shop.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-red-200 rounded-xl divide-y divide-red-100 overflow-x-auto shadow-xs">
            {/* Spreadsheet Column Header */}
            <div className="hidden md:grid md:grid-cols-[56px_minmax(210px,1.5fr)_135px_125px_135px_minmax(150px,1fr)_96px] items-center bg-red-50/60 text-[10px] font-extrabold uppercase tracking-wider text-red-900/70 border-b border-red-200/80 select-none">
              <div className="px-3 py-2 text-center">#</div>
              <div className="px-3 py-2 border-l border-red-100/80">Name</div>
              <div className="px-3 py-2 border-l border-red-100/80">Type</div>
              <div className="px-3 py-2 border-l border-red-100/80">Tier / Status</div>
              <div className="px-3 py-2 border-l border-red-100/80">Orders / Due</div>
              <div className="px-3 py-2 border-l border-red-100/80">Contact / Account</div>
              <div className="px-3 py-2 border-l border-red-100/80 text-right">Action</div>
            </div>

            {highPriorityItems.map((entry, idx) => {
              const isDragging = draggedPriorityKey === entry.key;
              const isDragOver = dragOverPriorityKey === entry.key && draggedPriorityKey !== entry.key;

              if (entry.itemType === 'customer') {
                const c = entry.data;
                const isSubCustomer = Boolean(c.parentCustomerId);
                const isNonPriorityParent = Boolean(entry.isContextParent || !c.highPriority);
                const companyName = c.company && c.company !== '-' ? c.company : (c.contactName || c.name || c.email || 'Customer');
                const activeCustOrders = orders.filter(
                  (o: any) => o.customerId === c.id && !o.isProjectGroup && (o.statusIndex ?? 0) < 7
                );
                const subtext = c.contactName || c.email || c.location || '';

                return (
                  <div
                    key={entry.key}
                    draggable
                    onDragStart={(e) => {
                      setDraggedPriorityKey(entry.key);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', entry.key);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverPriorityKey !== entry.key) {
                        setDragOverPriorityKey(entry.key);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverPriorityKey === entry.key) {
                        setDragOverPriorityKey(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDropPriorityItem(entry.key);
                    }}
                    onDragEnd={() => {
                      setDraggedPriorityKey(null);
                      setDragOverPriorityKey(null);
                    }}
                    onClick={() => navigate(`/customers/${c.id}`)}
                    className={`grid grid-cols-1 md:grid-cols-[56px_minmax(210px,1.5fr)_135px_125px_135px_minmax(150px,1fr)_96px] items-center border-l-4 ${
                      isNonPriorityParent ? 'border-l-neutral-300 bg-neutral-50/70' : isSubCustomer ? 'border-l-red-600 bg-red-50/15' : 'border-l-red-600 bg-white'
                    } transition-all cursor-pointer group select-none ${
                      isDragging
                        ? 'opacity-40 bg-red-50'
                        : isDragOver
                          ? 'bg-red-50/90 ring-2 ring-inset ring-red-400'
                          : isNonPriorityParent
                            ? 'hover:bg-neutral-100/80'
                            : 'hover:bg-red-50/40'
                    }`}
                  >
                    {/* Col 1: Rank & Grip */}
                    <div
                      className={`px-3 py-2.5 flex items-center justify-center gap-1 text-neutral-400 ${
                        isNonPriorityParent ? 'group-hover:text-neutral-700' : 'group-hover:text-red-600'
                      } cursor-grab active:cursor-grabbing shrink-0`}
                      title="Drag to reorder"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <GripVertical size={15} />
                      <span
                        className={`text-[11px] font-extrabold w-4 text-center tabular-nums ${
                          isNonPriorityParent ? 'text-neutral-500' : 'text-red-700/80'
                        }`}
                      >
                        {idx + 1}
                      </span>
                    </div>

                    {/* Col 2: Logo & Name */}
                    <div className="px-3 py-2.5 md:border-l md:border-red-100/60 flex items-center gap-2.5 min-w-0">
                      {c.croppedLogo || c.logo ? (
                        <div className="w-7 h-7 rounded-md border border-neutral-200 bg-white flex items-center justify-center shrink-0 p-0.5">
                          <img src={c.croppedLogo || c.logo} alt={companyName} className="w-full h-full object-contain mix-blend-multiply" />
                        </div>
                      ) : (
                        <div
                          className={`w-7 h-7 rounded-md border flex items-center justify-center shrink-0 ${
                            isNonPriorityParent
                              ? 'bg-neutral-100 border-neutral-200 text-neutral-500'
                              : 'bg-red-50 border-red-200 text-red-600'
                          }`}
                        >
                          <Building2 size={14} />
                        </div>
                      )}
                      {isSubCustomer && (
                        <span title="Sub-Brand" className="inline-flex shrink-0 -mr-1">
                          <CornerDownRight size={13} className="text-red-400" />
                        </span>
                      )}
                      <span
                        className={`font-bold text-sm transition-colors truncate flex items-center gap-1.5 ${
                          isNonPriorityParent
                            ? 'text-neutral-700 group-hover:text-black'
                            : 'text-brand-primary group-hover:text-red-700'
                        }`}
                        title={companyName}
                      >
                        <span className="truncate">{companyName}</span>
                        {Boolean(c.isMvp) && (
                          <span title="MVP Customer" className="inline-flex items-center shrink-0">
                            <Star size={14} className="fill-amber-400 text-amber-500" />
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Col 3: Type Badge */}
                    <div className="px-3 py-2 md:py-2.5 md:border-l md:border-red-100/60 flex items-center">
                      <span
                        className={`inline-flex items-center justify-center text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded w-[108px] text-center truncate ${
                          isNonPriorityParent
                            ? 'bg-neutral-200 text-neutral-700'
                            : 'bg-red-600 text-white'
                        }`}
                      >
                        {isSubCustomer ? 'Brand' : 'Customer'}
                      </span>
                    </div>

                    {/* Col 4: Tier / Status */}
                    <div className="px-3 py-2 md:py-2.5 md:border-l md:border-red-100/60 flex items-center">
                      <span className="inline-flex items-center justify-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded w-full max-w-[100px] text-center truncate">
                        {c.type || 'B2C'}
                      </span>
                    </div>

                    {/* Col 5: Active Orders Count */}
                    <div className="px-3 py-2 md:py-2.5 md:border-l md:border-red-100/60 flex items-center">
                      {activeCustOrders.length > 0 ? (
                        <span
                          className={`inline-flex items-center justify-center text-[10px] font-semibold px-2 py-0.5 rounded border w-full max-w-[110px] text-center truncate tabular-nums ${
                            isNonPriorityParent
                              ? 'text-neutral-700 bg-neutral-100 border-neutral-200'
                              : 'text-red-700 bg-red-50 border-red-200'
                          }`}
                        >
                          {activeCustOrders.length} active {activeCustOrders.length === 1 ? 'order' : 'orders'}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-300 font-medium pl-1">—</span>
                      )}
                    </div>

                    {/* Col 6: Contact / Subtext */}
                    <div className="px-3 py-2 md:py-2.5 md:border-l md:border-red-100/60 flex items-center min-w-0">
                      {subtext ? (
                        <span className="text-xs text-brand-secondary truncate" title={subtext}>
                          {subtext}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-300 font-medium">—</span>
                      )}
                    </div>

                    {/* Col 7: Action & Remove */}
                    <div className="px-3 py-2.5 md:border-l md:border-red-100/60 flex items-center justify-end gap-2 shrink-0">
                      <span
                        className={`inline-flex items-center gap-0.5 text-[11px] font-semibold text-brand-secondary transition-colors ${
                          isNonPriorityParent ? 'group-hover:text-black' : 'group-hover:text-red-700'
                        }`}
                      >
                        Profile <ChevronRight size={13} />
                      </span>
                      {!isNonPriorityParent ? (
                        <button
                          type="button"
                          onClick={(e) => handleRemoveCustomerHighPriority(e, c.id)}
                          title="Remove High Priority from Customer"
                          className="p-1 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-100/70 transition-colors shrink-0"
                        >
                          <X size={14} />
                        </button>
                      ) : (
                        <span className="w-6" />
                      )}
                    </div>
                  </div>
                );
              }

              const o = entry.data;
              const companyName =
                customers[o.customerId]?.company ||
                customers[o.customerId]?.name ||
                o.customerName ||
                o.companyName ||
                o.customerId ||
                'Customer';
              const displayId = o.portalId || o.id.substring(0, 8);
              const dueStr = o.targetCompletionDate || o.date;

              return (
                <div
                  key={entry.key}
                  draggable
                  onDragStart={(e) => {
                    setDraggedPriorityKey(entry.key);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', entry.key);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverPriorityKey !== entry.key) {
                      setDragOverPriorityKey(entry.key);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverPriorityKey === entry.key) {
                      setDragOverPriorityKey(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDropPriorityItem(entry.key);
                  }}
                  onDragEnd={() => {
                    setDraggedPriorityKey(null);
                    setDragOverPriorityKey(null);
                  }}
                  onClick={() => navigate(`/orders/${o.id}`)}
                  className={`grid grid-cols-1 md:grid-cols-[56px_minmax(210px,1.5fr)_135px_125px_135px_minmax(150px,1fr)_96px] items-center border-l-4 border-l-red-600 bg-white transition-all cursor-pointer group select-none ${
                    isDragging
                      ? 'opacity-40 bg-red-50'
                      : isDragOver
                        ? 'bg-red-50/90 ring-2 ring-inset ring-red-400'
                        : 'hover:bg-red-50/40'
                  }`}
                >
                  {/* Col 1: Rank & Grip */}
                  <div
                    className="px-3 py-2.5 flex items-center justify-center gap-1 text-neutral-400 group-hover:text-red-600 cursor-grab active:cursor-grabbing shrink-0"
                    title="Drag to reorder"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <GripVertical size={15} />
                    <span className="text-[11px] font-extrabold text-red-700/80 w-4 text-center tabular-nums">
                      {idx + 1}
                    </span>
                  </div>

                  {/* Col 2: Icon & Order Title */}
                  <div className="px-3 py-2.5 md:border-l md:border-red-100/60 flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-md bg-red-50 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
                      <Package size={14} />
                    </div>
                    <span
                      className="font-bold text-sm text-brand-primary group-hover:text-red-700 transition-colors truncate flex items-center gap-1.5"
                      title={o.title || 'Untitled Order'}
                    >
                      <span className="truncate">{o.title || 'Untitled Order'}</span>
                      {Boolean(o.isMvp || o.personalInfo?.isMvp) && (
                        <span title="MVP" className="inline-flex items-center shrink-0">
                          <Star size={14} className="fill-amber-400 text-amber-500" />
                        </span>
                      )}
                      {Boolean(o.getsBox || o.personalInfo?.getsBox) && (
                        <span title="Gets a Box" className="inline-flex items-center text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded shrink-0">
                          <Box size={11} strokeWidth={2.5} />
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Col 3: Order Badge */}
                  <div className="px-3 py-2 md:py-2.5 md:border-l md:border-red-100/60 flex items-center">
                    <span
                      className="inline-flex items-center justify-center text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded w-[108px] text-center truncate tabular-nums"
                      title={`Order #${displayId}`}
                    >
                      Order #{displayId}
                    </span>
                  </div>

                  {/* Col 4: Status */}
                  <div className="px-3 py-2 md:py-2.5 md:border-l md:border-red-100/60 flex items-center">
                    <span className="inline-flex items-center justify-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded w-full max-w-[100px] text-center truncate">
                      {getOrderStatusLabel(o.statusIndex)}
                    </span>
                  </div>

                  {/* Col 5: Due Date */}
                  <div className="px-3 py-2 md:py-2.5 md:border-l md:border-red-100/60 flex items-center">
                    {dueStr ? (
                      <span className="text-[11px] font-semibold text-neutral-600 truncate tabular-nums">
                        Due {dueStr}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-300 font-medium pl-1">—</span>
                    )}
                  </div>

                  {/* Col 6: Company Name */}
                  <div className="px-3 py-2 md:py-2.5 md:border-l md:border-red-100/60 flex items-center min-w-0">
                    <span className="text-xs text-brand-secondary truncate" title={companyName}>
                      {companyName}
                    </span>
                  </div>

                  {/* Col 7: Action & Remove */}
                  <div className="px-3 py-2.5 md:border-l md:border-red-100/60 flex items-center justify-end gap-2 shrink-0">
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-brand-secondary group-hover:text-red-700 transition-colors">
                      Order <ChevronRight size={13} />
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleRemoveHighPriority(e, o)}
                      title="Remove High Priority"
                      className="p-1 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-100/70 transition-colors shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {roleView === 'Manager / Admin' ? (
        <div className="mt-6 flex flex-col gap-10 pb-12">
          
          {/* Top Row: Quick Stats & Command Center */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left: Quick Stats */}
            <div className="lg:col-span-8 flex flex-col gap-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
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
                          onClick={() => setExpandedImage({ src: item.printReadyUrl, alt: `${item.style || 'Gang Sheet'}`, item, itemStyle: item.style || 'Gang Sheet' })}
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
        <ImageLightboxModal
          src={expandedImage.src}
          alt={expandedImage.alt}
          item={expandedImage.item}
          itemStyle={expandedImage.itemStyle || expandedImage.item?.style || expandedImage.alt}
          onClose={() => setExpandedImage(null)}
        />
      )}
    </div>
  );
}
