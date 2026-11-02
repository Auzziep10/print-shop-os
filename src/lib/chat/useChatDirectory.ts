// Team Chat — everything the composer can tag: teammates, orders, designs.
// Loaded once per session and cached, so opening chat doesn't re-read every order.
import { useEffect, useState } from 'react';
import { collection, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { CHAT_ROLES, type ChatUser } from './types';

export interface DirectoryOrder {
  id: string;
  title: string;
  customerId?: string;
  customerName?: string;
}

export interface DirectoryDesign {
  id: string;
  name: string;
  customerId: string;
  customerName: string;
}

interface Directory {
  users: ChatUser[];
  orders: DirectoryOrder[];
  designs: DirectoryDesign[];
  loaded: boolean;
}

let cache: { orders: DirectoryOrder[]; designs: DirectoryDesign[]; at: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

async function loadOrdersAndDesigns() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  const [ordersSnap, customersSnap] = await Promise.all([
    getDocs(collection(db, 'orders')),
    getDocs(collection(db, 'customers')),
  ]);
  const customerNames = new Map<string, string>();
  const designs: DirectoryDesign[] = [];
  customersSnap.docs.forEach((d) => {
    const data = d.data() as any;
    const name = data.company || data.name || d.id;
    customerNames.set(d.id, name);
    (data.savedDesigns || []).forEach((s: any) => {
      if (s?.id) designs.push({ id: s.id, name: s.designName || 'Untitled design', customerId: d.id, customerName: name });
    });
  });
  const orders: DirectoryOrder[] = ordersSnap.docs
    .map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        title: data.title || '',
        customerId: data.customerId,
        customerName: customerNames.get(data.customerId) || data.personalInfo?.company || data.personalInfo?.name || '',
      };
    })
    // newest order numbers first
    .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
  cache = { orders, designs, at: Date.now() };
  return cache;
}

export function useChatDirectory(): Directory {
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [orders, setOrders] = useState<DirectoryOrder[]>(cache?.orders || []);
  const [designs, setDesigns] = useState<DirectoryDesign[]>(cache?.designs || []);
  const [loaded, setLoaded] = useState(Boolean(cache));

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const byUid = new Map<string, ChatUser>();
      snap.docs.forEach((d) => {
        const data = d.data() as any;
        if (!CHAT_ROLES.includes(data.role)) return;
        const uid = data.uid || d.id;
        byUid.set(uid, { uid, name: data.name || data.email || 'Teammate', role: data.role, email: data.email });
      });
      setUsers(Array.from(byUid.values()).sort((a, b) => a.name.localeCompare(b.name)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let alive = true;
    loadOrdersAndDesigns()
      .then((c) => {
        if (!alive) return;
        setOrders(c.orders);
        setDesigns(c.designs);
        setLoaded(true);
      })
      .catch((err) => {
        console.warn('[chat] could not load orders/designs for tagging', err);
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { users, orders, designs, loaded };
}
