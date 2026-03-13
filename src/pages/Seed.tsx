import { useState } from 'react';
import { db } from '../lib/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import { PillButton } from '../components/ui/PillButton';
import { Database, CheckCircle, AlertCircle } from 'lucide-react';

const SEED_ORDERS = [
  {
    _id: 'ORD-2212',
    customerId: 'CUS-001',
    portalId: '#2212',
    title: 'Polos, Jackets, Acess...',
    date: '3/29/26',
    statusIndex: 2, // Ordered
    logo: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200&h=200&fit=crop',
    items: [
      {
        id: 1,
        gender: 'Mens',
        style: 'Pique Polo',
        image: 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=150&h=150&fit=crop',
        itemNum: 'PB26-1015',
        color: 'White/Navy',
        logos: ['Left Chest', 'Nape', 'Right Collar'],
        sizes: { OSFA: 0, XS: 0, S: 20, M: 50, L: 75, XL: 45, '2XL': 25, '3XL': 15 },
        qty: 230,
        price: '$74.99',
        total: '$17,247.70'
      },
      {
        id: 2,
        gender: 'Womens',
        style: 'Long Sleeve 1/4 Zip Polo',
        image: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=150&h=150&fit=crop',
        itemNum: 'PB26-1015',
        color: 'Baby Blue',
        logos: ['Left Chest', 'Left Sleeve'],
        sizes: { OSFA: 0, XS: 20, S: 40, M: 75, L: 50, XL: 35, '2XL': 15, '3XL': 0 },
        qty: 235,
        price: '$80.00',
        total: '$18,800.00'
      },
      {
        id: 3,
        gender: 'Accessories',
        style: 'Leather Bag',
        image: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=150&h=150&fit=crop',
        itemNum: 'PB26-1027',
        color: 'Navy Leather',
        logos: ['Left Chest'],
        sizes: { OSFA: 500, XS: 0, S: 0, M: 0, L: 0, XL: 0, '2XL': 0, '3XL': 0 },
        qty: 500,
        price: '$120.00',
        total: '$60,000.00'
      }
    ]
  },
  {
    _id: 'ORD-2213',
    customerId: 'CUS-001',
    portalId: '#2213',
    title: 'Hats, Leggings',
    date: '3/30/26',
    statusIndex: 4, // Shipped
    logo: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200&h=200&fit=crop',
    items: []
  },
  {
    _id: 'ORD-2214',
    customerId: 'CUS-001',
    portalId: '#2214',
    title: 'Graphic T-Shirts',
    date: '4/01/26',
    statusIndex: 1, // Shopping
    logo: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200&h=200&fit=crop',
    items: []
  },
  {
    _id: 'ORD-2215',
    customerId: 'CUS-001',
    portalId: '#2215',
    title: 'Winter Gear',
    date: '4/02/26',
    statusIndex: 4, // Shipped
    logo: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200&h=200&fit=crop',
    items: []
  }
];

export function SeedData() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSeed = async () => {
    try {
      setLoading(true);
      setStatus('idle');
      
      const ordersRef = collection(db, 'orders');

      for (const order of SEED_ORDERS) {
        // We use setDoc to force the document ID to match our mock _id
        await setDoc(doc(ordersRef, order._id), {
          ...order,
          createdAt: new Date().toISOString()
        });
      }

      setStatus('success');
    } catch (error) {
           console.error("Error seeding:", error);
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6">
      <div className="bg-white p-10 rounded-2xl border border-brand-border max-w-lg w-full text-center">
        <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-6">
           <Database size={32} />
        </div>
        <h1 className="font-serif text-3xl text-brand-primary mb-2">Seed Firestore Database</h1>
        <p className="text-brand-secondary text-sm mb-8">
          This will grab the 4 hardcoded Wayne Enterprises mock orders and write them directly into your live Firebase Database. 
        </p>

        <PillButton 
          variant="filled" 
          onClick={handleSeed} 
          className="w-full justify-center py-4 text-base"
          disabled={loading}
        >
          {loading ? 'Writing to Database...' : 'Blast Orders to Firebase'}
        </PillButton>

        {status === 'success' && (
          <div className="mt-6 p-4 bg-green-50 text-green-700 border border-green-200 rounded-xl flex items-center justify-center gap-2 text-sm font-bold">
            <CheckCircle size={18} />
            Successfully Seeded 4 Orders!
          </div>
        )}
        
        {status === 'error' && (
          <div className="mt-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl flex items-center justify-center gap-2 text-sm font-bold">
            <AlertCircle size={18} />
            Error writing! Check the console.
          </div>
        )}
      </div>
    </div>
  );
}
