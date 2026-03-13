import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useOrders(customerId?: string) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let q = query(collection(db, 'orders'));
    
    // If we're on the portal and have a customerId, only fetch their specific orders
    if (customerId) {
      q = query(collection(db, 'orders'), where('customerId', '==', customerId));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
      
      // Sort statically here for UI consistency, assuming 'date' or '_id'
      ordersData.sort((a, b) => a.id.localeCompare(b.id));

      setOrders(ordersData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [customerId]);

  return { orders, loading };
}
