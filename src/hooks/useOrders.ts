import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useOrders(customerId?: string) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [subCustomerIds, setSubCustomerIds] = useState<string[]>([]);
  const [subCustomersLoaded, setSubCustomersLoaded] = useState(!customerId);

  useEffect(() => {
    if (!customerId) {
      setSubCustomerIds([]);
      setSubCustomersLoaded(true);
      return;
    }
    setSubCustomersLoaded(false);
    const subQuery = query(collection(db, 'customers'), where('parentCustomerId', '==', customerId));
    const unsubSubs = onSnapshot(
      subQuery,
      (snap) => {
        const ids = snap.docs.map((d) => d.id);
        ids.sort();
        setSubCustomerIds((prev) => {
          if (prev.length === ids.length && prev.every((v, i) => v === ids[i])) return prev;
          return ids;
        });
        setSubCustomersLoaded(true);
      },
      () => {
        setSubCustomerIds([]);
        setSubCustomersLoaded(true);
      }
    );
    return () => unsubSubs();
  }, [customerId]);

  useEffect(() => {
    if (customerId && !subCustomersLoaded) {
      return;
    }

    if (!customerId) {
      const q = query(collection(db, 'orders'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const ordersData = snapshot.docs.map((doc) => ({
          ...doc.data(),
          id: doc.id,
        }));
        ordersData.sort((a, b) => a.id.localeCompare(b.id));
        setOrders(ordersData);
        setLoading(false);
      });
      return () => unsubscribe();
    }

    const allCustomerIds = Array.from(new Set([customerId, ...subCustomerIds]));
    const chunks: string[][] = [];
    for (let i = 0; i < allCustomerIds.length; i += 30) {
      chunks.push(allCustomerIds.slice(i, i + 30));
    }

    const chunkResults = new Map<number, any[]>();
    const unsubscribes = chunks.map((chunk, chunkIdx) => {
      const q =
        chunk.length === 1
          ? query(collection(db, 'orders'), where('customerId', '==', chunk[0]))
          : query(collection(db, 'orders'), where('customerId', 'in', chunk));
      return onSnapshot(q, (snapshot) => {
        const chunkOrders = snapshot.docs.map((doc) => ({
          ...doc.data(),
          id: doc.id,
        }));
        chunkResults.set(chunkIdx, chunkOrders);
        const mergedMap = new Map<string, any>();
        chunkResults.forEach((list) => {
          list.forEach((ord) => mergedMap.set(ord.id, ord));
        });
        const ordersData = Array.from(mergedMap.values());
        ordersData.sort((a, b) => a.id.localeCompare(b.id));
        setOrders(ordersData);
        setLoading(false);
      });
    });

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [customerId, subCustomerIds, subCustomersLoaded]);

  return { orders, loading };
}
