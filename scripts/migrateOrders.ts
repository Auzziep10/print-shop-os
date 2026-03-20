import { db } from '../src/lib/firebase';
import { collection, getDocs, updateDoc, doc, writeBatch } from 'firebase/firestore';

async function migrate() {
    console.log('Starting migration...');
    const ordersRef = collection(db, 'orders');
    const snapshot = await getDocs(ordersRef);
    
    // Group orders by their creation date
    const ordersByDate: Record<string, any[]> = {};
    
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        data.id = docSnap.id;
        
        let dateObj = new Date();
        // Try to parse createdAt, if not present or fallback, use fallback
        if (data.createdAt) {
            dateObj = new Date(data.createdAt);
        } else if (data.date) {
             // mm/dd/yy usually
             dateObj = new Date(data.date);
        }

        // Ensure valid date
        if (isNaN(dateObj.getTime())) {
             dateObj = new Date();
        }

        const dateKey = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD
        data._parsedDate = dateObj;
        
        if (!ordersByDate[dateKey]) {
            ordersByDate[dateKey] = [];
        }
        ordersByDate[dateKey].push(data);
    });

    console.log(`Found ${snapshot.size} total orders spread across ${Object.keys(ordersByDate).length} days.`);

    let totalUpdated = 0;
    const batch = writeBatch(db);
    let batchCount = 0;

    for (const [dateKey, dailyOrders] of Object.entries(ordersByDate)) {
        // Sort chronologically from oldest to newest within that day
        dailyOrders.sort((a, b) => a._parsedDate.getTime() - b._parsedDate.getTime());

        // Extract YY, MM, DD safely
        const yy = String(dailyOrders[0]._parsedDate.getFullYear()).slice(-2);
        const mm = String(dailyOrders[0]._parsedDate.getMonth() + 1).padStart(2, '0');
        const dd = String(dailyOrders[0]._parsedDate.getDate()).padStart(2, '0');
        const prefix = `${yy}${mm}${dd}`;

        dailyOrders.forEach((o, index) => {
            const count = index + 1;
            const newPortalId = `${prefix}-${count}`;
            console.log(`Updating Order ${o.id}: ${o.portalId || 'none'} -> ${newPortalId}`);
            
            const docRef = doc(db, 'orders', o.id);
            batch.update(docRef, { portalId: newPortalId });
            totalUpdated++;
            batchCount++;

            // Max out batch size if we had 500+ records but probably not
        });
    }

    if (batchCount > 0) {
       console.log(`Committing batch payload of ${batchCount} document updates...`);
       await batch.commit();
       console.log('Migration complete successfully!');
    } else {
       console.log('No orders found to update.');
    }
    
    // Explicitly exit Node process
    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
