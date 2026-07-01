import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase';

function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  // Strip all non-digit characters except leading plus
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  // Assume US number if it has 10 digits (add +1)
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }
  // Assume US number if it has 11 digits starting with 1 (add +)
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }
  return cleaned; // Fallback
}

export async function sendOrderStatusSMS(orderId: string, newStatusIndex: number) {
  try {
    // 1. Fetch QUO Integration settings from Firestore
    const quoSnap = await getDoc(doc(db, 'settings', 'quo'));
    if (!quoSnap.exists()) {
      console.log('[SMS Service] QUO integration is not configured in settings.');
      return;
    }

    const quoData = quoSnap.data();
    const statusKey = newStatusIndex.toString();
    const templateConfig = quoData.templates?.[statusKey];

    // If template not defined or not enabled, skip sending
    if (!templateConfig || !templateConfig.enabled || !templateConfig.template) {
      console.log(`[SMS Service] SMS notifications are disabled or not configured for status index ${newStatusIndex}.`);
      return;
    }

    // 2. Fetch Order Details
    const orderSnap = await getDoc(doc(db, 'orders', orderId));
    if (!orderSnap.exists()) {
      console.error(`[SMS Service] Order ${orderId} not found.`);
      return;
    }
    const order = orderSnap.data();

    // 3. Fetch Customer Details (to get phone and name)
    let recipientPhone = '';
    let customerName = 'Customer';
    let companyName = 'Unknown Customer';

    if (order.customerId && order.customerId !== 'Shopify Temporary') {
      const customerSnap = await getDoc(doc(db, 'customers', order.customerId));
      if (customerSnap.exists()) {
        const customer = customerSnap.data();
        recipientPhone = customer.phone || '';
        customerName = customer.name || customer.company || 'Customer';
        companyName = customer.company || 'Unknown Customer';
      }
    }

    // Fallbacks if customer phone not found, check order shipping address fields if they exist
    if (!recipientPhone && order.shippingAddress?.phone) {
      recipientPhone = order.shippingAddress.phone;
    }

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(recipientPhone);
    if (!normalizedPhone) {
      console.warn(`[SMS Service] Skip SMS: No valid phone number found for order ${orderId}.`);
      return;
    }

    // 4. Render template
    let content = templateConfig.template;
    content = content.replace(/{customerName}/g, customerName);
    content = content.replace(/{companyName}/g, companyName);
    content = content.replace(/{orderId}/g, orderId);
    content = content.replace(/{orderTitle}/g, order.title || 'Untitled Order');
    content = content.replace(/{trackingCarrier}/g, order.trackingCarrier || 'Pending');
    content = content.replace(/{trackingNumber}/g, order.trackingNumber || 'Pending');

    // 5. Retrieve current user's ID token to call Vercel edge API securely
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.error('[SMS Service] User must be authenticated to trigger SMS notifications.');
      return;
    }
    const idToken = await currentUser.getIdToken();

    // 6. Dispatch SMS through serverless backend function
    console.log(`[SMS Service] Dispatching status index ${newStatusIndex} SMS to ${normalizedPhone}...`);
    const response = await fetch('/api/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        to: normalizedPhone,
        content
      })
    });

    const result = await response.json();
    if (!response.ok) {
      console.error('[SMS Service] Failed to send SMS:', result.error || result.details);
    } else {
      console.log('[SMS Service] SMS sent successfully:', result);
    }
  } catch (error) {
    console.error('[SMS Service] Error in sendOrderStatusSMS:', error);
  }
}
