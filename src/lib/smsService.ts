import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase';

function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }
  return cleaned;
}

export async function sendOrderStatusSMS(orderId: string, newStatusIndex: number) {
  try {
    const quoSnap = await getDoc(doc(db, 'settings', 'quo'));
    if (!quoSnap.exists()) {
      console.log('[SMS Service] QUO integration is not configured in settings.');
      return;
    }

    const quoData = quoSnap.data();
    const statusKey = newStatusIndex.toString();
    const templateConfig = quoData.templates?.[statusKey];

    if (!templateConfig || !templateConfig.enabled || !templateConfig.template) {
      console.log(`[SMS Service] SMS notifications are disabled or not configured for status index ${newStatusIndex}.`);
      return;
    }

    const orderSnap = await getDoc(doc(db, 'orders', orderId));
    if (!orderSnap.exists()) {
      console.error(`[SMS Service] Order ${orderId} not found.`);
      return;
    }
    const order = orderSnap.data();

    let recipientPhone = '';
    let customerName = 'Customer';
    let companyName = 'Unknown Customer';

    if (order.customerId && order.customerId !== 'Shopify Temporary') {
      const customerSnap = await getDoc(doc(db, 'customers', order.customerId));
      if (customerSnap.exists()) {
        const customer = customerSnap.data();
        recipientPhone = customer.phone || '';
        customerName = customer.contactName || customer.name || customer.company || 'Customer';
        companyName = customer.company || 'Unknown Customer';
      }
    }

    if (!recipientPhone && order.shippingAddress?.phone) {
      recipientPhone = order.shippingAddress.phone;
    }

    const normalizedPhone = normalizePhoneNumber(recipientPhone);
    if (!normalizedPhone) {
      console.warn(`[SMS Service] Skip SMS: No valid phone number found for order ${orderId}.`);
      return;
    }

    const userFacingOrderId = order.portalId || orderId;
    let content = templateConfig.template;
    
    // Replace standard variables
    content = content.replace(/{customerName}/g, customerName);
    content = content.replace(/{companyName}/g, companyName);
    content = content.replace(/{orderId}/g, userFacingOrderId);
    content = content.replace(/{orderTitle}/g, order.title || 'Untitled Order');
    content = content.replace(/{trackingCarrier}/g, order.trackingCarrier || 'Pending');
    content = content.replace(/{trackingNumber}/g, order.trackingNumber || 'Pending');

    // Replace dynamic links
    const baseUrl = window.location.origin;
    content = content.replace(/{portalUrl}/g, `${baseUrl}/portal`);
    content = content.replace(/{invoiceUrl}/g, `${baseUrl}/invoice/${orderId}`);
    content = content.replace(/{orderUrl}/g, `${baseUrl}/order-summary/${orderId}`);

    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.error('[SMS Service] User must be authenticated to trigger SMS notifications.');
      return;
    }
    const idToken = await currentUser.getIdToken();

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

export async function sendCustomerWelcomeSMS(customerId: string) {
  try {
    const quoSnap = await getDoc(doc(db, 'settings', 'quo'));
    if (!quoSnap.exists()) {
      console.log('[SMS Service] QUO integration is not configured in settings for Welcome SMS.');
      return;
    }

    const quoData = quoSnap.data();
    const welcomeConfig = quoData.welcome || {
      enabled: true,
      template: 'Hi {customerName}, welcome to {companyName}! Your portal account has been created. Log in here: {portalUrl}'
    };

    if (!welcomeConfig.enabled || !welcomeConfig.template) {
      console.log('[SMS Service] Welcome SMS is disabled or template is empty.');
      return;
    }

    const customerSnap = await getDoc(doc(db, 'customers', customerId));
    if (!customerSnap.exists()) {
      console.error(`[SMS Service] Customer ${customerId} not found for welcome SMS.`);
      return;
    }
    const customer = customerSnap.data();

    const recipientPhone = customer.phone || '';
    const normalizedPhone = normalizePhoneNumber(recipientPhone);
    if (!normalizedPhone) {
      console.warn(`[SMS Service] Skip Welcome SMS: No valid phone number found for customer ${customerId}.`);
      return;
    }

    let content = welcomeConfig.template;
    const customerName = customer.contactName || customer.name || customer.company || 'Customer';
    const companyName = customer.company || 'Our Print Shop';
    const baseUrl = window.location.origin;

    content = content.replace(/{customerName}/g, customerName);
    content = content.replace(/{companyName}/g, companyName);
    content = content.replace(/{portalUrl}/g, `${baseUrl}/portal`);

    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.error('[SMS Service] User must be authenticated to trigger Welcome SMS notifications.');
      return;
    }
    const idToken = await currentUser.getIdToken();

    console.log(`[SMS Service] Dispatching Welcome SMS to ${normalizedPhone}...`);
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
      console.error('[SMS Service] Failed to send Welcome SMS:', result.error || result.details);
    } else {
      console.log('[SMS Service] Welcome SMS sent successfully:', result);
    }
  } catch (error) {
    console.error('[SMS Service] Error in sendCustomerWelcomeSMS:', error);
  }
}
