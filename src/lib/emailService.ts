import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase';

export async function sendOrderStatusEmail(orderId: string, newStatusIndex: number) {
  try {
    const orderSnap = await getDoc(doc(db, 'orders', orderId));
    if (!orderSnap.exists()) {
      console.error(`[Email Service] Order ${orderId} not found.`);
      return;
    }
    const order = orderSnap.data();

    let recipientEmail = '';
    let customerName = 'Customer';
    let companyName = 'Unknown Customer';
    let isKitting = false;

    if (order.customerId && order.customerId !== 'Shopify Temporary') {
      const customerSnap = await getDoc(doc(db, 'customers', order.customerId));
      if (customerSnap.exists()) {
        const customer = customerSnap.data();
        recipientEmail = customer.email || '';
        customerName = customer.contactName || customer.name || customer.company || 'Customer';
        companyName = customer.company || 'Unknown Customer';
        isKitting = order.fulfillmentType === 'Kitting' || (!order.fulfillmentType && customer.fulfillmentType === 'Kitting');
      }
    }

    if (!recipientEmail) {
      recipientEmail = order.shippingAddress?.email || order.email || '';
    }

    if (!recipientEmail) {
      console.warn(`[Email Service] Skip Email: No valid email address found for order ${orderId}.`);
      return;
    }

    const ahasendSnap = await getDoc(doc(db, 'settings', 'ahasend'));
    if (!ahasendSnap.exists()) {
      console.log('[Email Service] AhaSend integration is not configured in settings.');
      return;
    }

    const ahasendData = ahasendSnap.data();
    const statusKey = newStatusIndex.toString();
    
    // Choose kittingTemplates or standard templates
    const templatesToUse = isKitting ? (ahasendData.kittingTemplates || {}) : (ahasendData.templates || {});
    let templateConfig = templatesToUse[statusKey];
    
    // Fallback to standard template if kitting template is not set/enabled
    if (isKitting && (!templateConfig || !templateConfig.enabled || !templateConfig.template)) {
      templateConfig = ahasendData.templates?.[statusKey];
    }

    if (!templateConfig || !templateConfig.enabled || !templateConfig.template) {
      console.log(`[Email Service] Email notifications are disabled or not configured for status index ${newStatusIndex} (isKitting: ${isKitting}).`);
      return;
    }

    const userFacingOrderId = order.portalId || orderId;
    const baseUrl = window.location.origin;
    
    // Render Subject
    let subject = templateConfig.subject || `Order #${userFacingOrderId} Status Update`;
    subject = subject.replace(/{customerName}/g, customerName);
    subject = subject.replace(/{companyName}/g, companyName);
    subject = subject.replace(/{orderId}/g, userFacingOrderId);
    subject = subject.replace(/{orderTitle}/g, order.title || 'Untitled Order');
    subject = subject.replace(/{trackingCarrier}/g, order.trackingCarrier || 'Pending');
    subject = subject.replace(/{trackingNumber}/g, order.trackingNumber || 'Pending');
    subject = subject.replace(/{portalUrl}/g, `${baseUrl}/portal`);
    subject = subject.replace(/{invoiceUrl}/g, `${baseUrl}/invoice/${orderId}`);
    subject = subject.replace(/{orderUrl}/g, `${baseUrl}/order-summary/${orderId}`);

    // Render Body Text
    let bodyText = templateConfig.template;
    bodyText = bodyText.replace(/{customerName}/g, customerName);
    bodyText = bodyText.replace(/{companyName}/g, companyName);
    bodyText = bodyText.replace(/{orderId}/g, userFacingOrderId);
    bodyText = bodyText.replace(/{orderTitle}/g, order.title || 'Untitled Order');
    bodyText = bodyText.replace(/{trackingCarrier}/g, order.trackingCarrier || 'Pending');
    bodyText = bodyText.replace(/{trackingNumber}/g, order.trackingNumber || 'Pending');
    bodyText = bodyText.replace(/{portalUrl}/g, `${baseUrl}/portal`);
    bodyText = bodyText.replace(/{invoiceUrl}/g, `${baseUrl}/invoice/${orderId}`);
    bodyText = bodyText.replace(/{orderUrl}/g, `${baseUrl}/order-summary/${orderId}`);

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #333; line-height: 1.6; background-color: #f7f7f5;">
        <div style="background-color: #ffffff; border: 1px solid #e5e5e0; border-radius: 16px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.025);">
          <h2 style="font-size: 20px; color: #111; margin-top: 0; margin-bottom: 20px; border-bottom: 1px solid #f0f0ed; padding-bottom: 12px; font-weight: 700;">Status Update</h2>
          <div style="font-size: 15px; color: #444; white-space: pre-wrap;">${bodyText}</div>
          <hr style="border: 0; border-top: 1px solid #f0f0ed; margin: 32px 0 20px 0;" />
          <p style="font-size: 11px; color: #999; text-align: center; margin: 0;">This is an automated notification from your WOVN Client Portal.</p>
        </div>
      </div>
    `;

    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.error('[Email Service] User must be authenticated to trigger email status notifications.');
      return;
    }
    const idToken = await currentUser.getIdToken();

    console.log(`[Email Service] Dispatching status index ${newStatusIndex} Email to ${recipientEmail}...`);
    const response = await fetch('/api/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        to: recipientEmail,
        subject,
        text: bodyText,
        html: htmlBody
      })
    });

    const result = await response.json();
    if (!response.ok) {
      console.error('[Email Service] Failed to send email:', result.error || result.details);
    } else {
      console.log('[Email Service] Email sent successfully:', result);
    }
  } catch (error) {
    console.error('[Email Service] Error in sendOrderStatusEmail:', error);
  }
}

export async function sendCustomerWelcomeEmail(customerId: string) {
  try {
    const ahasendSnap = await getDoc(doc(db, 'settings', 'ahasend'));
    if (!ahasendSnap.exists()) {
      console.log('[Email Service] AhaSend integration is not configured in settings for Welcome Email.');
      return;
    }

    const ahasendData = ahasendSnap.data();
    const welcomeConfig = ahasendData.welcome || {
      enabled: true,
      subject: 'Welcome to your Client Portal',
      template: 'Hi {customerName},\n\nWelcome! A customer account has been created for you.\n\nYou can access your client portal and view all your orders, invoices, and designs by logging in with your email ({customerEmail}) here:\n{portalUrl}\n\nBest regards,\nWOVN Team'
    };

    if (!welcomeConfig.enabled || !welcomeConfig.template) {
      console.log('[Email Service] Welcome email is disabled or template is empty.');
      return;
    }

    const customerSnap = await getDoc(doc(db, 'customers', customerId));
    if (!customerSnap.exists()) {
      console.error(`[Email Service] Customer ${customerId} not found for welcome email.`);
      return;
    }
    const customer = customerSnap.data();

    const recipientEmail = customer.email || '';
    if (!recipientEmail) {
      console.warn(`[Email Service] Skip Welcome Email: No valid email address found for customer ${customerId}.`);
      return;
    }

    const customerName = customer.contactName || customer.name || customer.company || 'Customer';
    const companyName = customer.company || 'Our Print Shop';
    const baseUrl = window.location.origin;

    // Render Subject
    let subject = welcomeConfig.subject || 'Welcome to your Client Portal';
    subject = subject.replace(/{customerName}/g, customerName);
    subject = subject.replace(/{companyName}/g, companyName);
    subject = subject.replace(/{portalUrl}/g, `${baseUrl}/portal`);
    subject = subject.replace(/{customerEmail}/g, recipientEmail);

    // Render Body Text
    let bodyText = welcomeConfig.template;
    bodyText = bodyText.replace(/{customerName}/g, customerName);
    bodyText = bodyText.replace(/{companyName}/g, companyName);
    bodyText = bodyText.replace(/{portalUrl}/g, `${baseUrl}/portal`);
    bodyText = bodyText.replace(/{customerEmail}/g, recipientEmail);

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #333; line-height: 1.6; background-color: #f7f7f5;">
        <div style="background-color: #ffffff; border: 1px solid #e5e5e0; border-radius: 16px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.025);">
          <h2 style="font-size: 20px; color: #111; margin-top: 0; margin-bottom: 20px; border-bottom: 1px solid #f0f0ed; padding-bottom: 12px; font-weight: 700;">Welcome to WOVN</h2>
          <div style="font-size: 15px; color: #444; white-space: pre-wrap;">${bodyText}</div>
          <hr style="border: 0; border-top: 1px solid #f0f0ed; margin: 32px 0 20px 0;" />
          <p style="font-size: 11px; color: #999; text-align: center; margin: 0;">This is an automated notification from your WOVN Client Portal.</p>
        </div>
      </div>
    `;

    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.error('[Email Service] User must be authenticated to trigger Welcome Email notifications.');
      return;
    }
    const idToken = await currentUser.getIdToken();

    console.log(`[Email Service] Dispatching Welcome Email to ${recipientEmail}...`);
    const response = await fetch('/api/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        to: recipientEmail,
        subject,
        text: bodyText,
        html: htmlBody
      })
    });

    const result = await response.json();
    if (!response.ok) {
      console.error('[Email Service] Failed to send Welcome Email:', result.error || result.details);
    } else {
      console.log('[Email Service] Welcome Email sent successfully:', result);
    }
  } catch (error) {
    console.error('[Email Service] Error in sendCustomerWelcomeEmail:', error);
  }
}
