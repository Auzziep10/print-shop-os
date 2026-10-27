import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { StripePaymentModal } from '../../components/Orders/StripePaymentModal';
import { isDiscountItem } from '../../lib/garmentUtils';

export function InvoiceView() {
  const { orderId } = useParams();
  const [order, setOrder] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [globalSettings, setGlobalSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [autoShippingFee, setAutoShippingFee] = useState<number | null>(null);

  useEffect(() => {
    if (!orderId) return;
    
    // Fetch business settings
    getDoc(doc(db, 'settings', 'business')).then(busSnap => {
      if (busSnap.exists()) setGlobalSettings(busSnap.data());
    }).catch(console.error);

    // Live subscription to order document
    const unsub = onSnapshot(doc(db, 'orders', orderId), async (orderDoc) => {
      if (orderDoc.exists()) {
        const orderData = orderDoc.data();
        setOrder({ id: orderDoc.id, ...orderData });
        
        if (orderData.customerId) {
          try {
            const custDoc = await getDoc(doc(db, 'customers', orderData.customerId));
            if (custDoc.exists()) {
              setCustomer(custDoc.data());
            }
          } catch (err) {
            console.error("Error fetching customer:", err);
          }
        }
      } else {
        setOrder(null);
      }
      setLoading(false);
    }, (err) => {
      console.error("Error subscribing to order:", err);
      setLoading(false);
    });

    return () => unsub();
  }, [orderId]);

  useEffect(() => {
    if (!order) return;
    const explicitShipping = parseFloat(String(order.shippingFee || order.freight || order.shippingCost || 0));
    if (explicitShipping > 0 || order.deliveryOption === 'Local Delivery') {
      setAutoShippingFee(null);
      return;
    }

    if (order.shippingOptions && order.shippingOptions.length > 0) {
      const cheapest = parseFloat(String(order.shippingOptions[0]?.rate || 0)) || 0;
      setAutoShippingFee(cheapest);
      return;
    }

    const effectiveAddress = (order.shippingAddress && (order.shippingAddress.street1 || order.shippingAddress.city))
      ? order.shippingAddress
      : (customer?.shippingStreet || customer?.shippingCity ? {
          name: customer.contactName || customer.name || '',
          company: customer.company || customer.name || '',
          street1: customer.shippingStreet || '',
          street2: '',
          city: customer.shippingCity || '',
          state: customer.shippingState || '',
          zip: customer.shippingZip || '',
          country: 'US'
        } : null);

    const hasZip = effectiveAddress?.zip || effectiveAddress?.postalCode;
    const hasCity = effectiveAddress?.city;
    if (!hasZip || !hasCity) return;

    const fetchInvoiceShipping = async () => {
      try {
        let totalItems = 0;
        order.items?.forEach((item: any) => {
          const styleLower = (item.style || '').toLowerCase();
          const isShipping = styleLower.includes('shipping') || styleLower.includes('delivery') || (item.id && item.id.toString().startsWith('ship-')) || item.itemType === 'shipping';
          const isTax = styleLower.includes('tax');
          if (!isShipping && !isTax) {
            let qty = 0;
            if (item.itemType === 'service' || !item.sizes || Object.keys(item.sizes).length === 0) {
              qty = parseInt(item.qty || 1);
            } else {
              qty = Object.values(item.sizes || {}).reduce((a: any, b: any) => a + (parseInt(b) || 0), 0) as number;
            }
            totalItems += qty;
          }
        });

        let shipFrom: any = null;
        try {
          const bizSnap = await getDoc(doc(db, 'settings', 'business'));
          if (bizSnap.exists()) shipFrom = bizSnap.data();
        } catch { /* fallback */ }

        const res = await fetch('/api/easypost/rates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to_address: effectiveAddress,
            items: order.items || [],
            totalQty: totalItems || 1,
            customBoxCount: order.estimatedBoxCount || order.boxCountOverride || order.invoiceSettings?.estimatedBoxCount,
            ...(shipFrom?.street1 ? { from_address: shipFrom } : {}),
            isTest: false
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.rates && data.rates.length > 0) {
            const cheapestRate = parseFloat(String(data.rates[0].rate || 0)) || 0;
            setAutoShippingFee(cheapestRate);
          }
        }
      } catch (err) {
        console.error("Auto invoice shipping calculation error:", err);
      }
    };

    fetchInvoiceShipping();
  }, [order, customer]);

  if (loading) {
     return (
       <div className="min-h-screen bg-[#E9E9E9] flex flex-col items-center justify-center gap-4 text-neutral-400">
         <Loader2 className="animate-spin" size={32} />
         <p className="font-semibold uppercase tracking-widest text-xs">Retrieving Invoice...</p>
       </div>
     );
  }

  if (!order) {
     return (
       <div className="min-h-screen bg-[#E9E9E9] flex flex-col items-center justify-center gap-4 text-neutral-500">
         <h2 className="text-2xl font-serif">Invoice Not Found</h2>
       </div>
     );
  }

  const cust = customer || { company: 'Unknown Customer', name: 'Unknown' };

  const defaultDisclaimerText = "**ESTIMATE TERMS & CONDITIONS** THIS ESTIMATE IS VALID FOR 15 DAYS AND SUBJECT TO PRODUCT AVAILABILITY, FINAL SPECIFICATIONS, AND PRICING CONFIRMATION. PRODUCTION BEGINS ONLY UPON WRITTEN APPROVAL AND SATISFACTION OF APPLICABLE DEPOSIT REQUIREMENTS. CHANGES TO APPROVED ARTWORK, QUANTITIES, SPECIFICATIONS, OR DELIVERY REQUIREMENTS MAY INCUR ADDITIONAL CHARGES WITH CUSTOMER AUTHORIZATION. REASONABLE PRODUCTION VARIATIONS MAY OCCUR WITHIN AGREED TOLERANCES. DELIVERY DATES ARE ESTIMATES UNLESS GUARANTEED IN WRITING. CANCELLATIONS AFTER APPROVAL MAY INCUR DOCUMENTED COSTS. APPROVAL CONSTITUTES ACCEPTANCE OF THESE TERMS.";

  const defaultVisibilityToggles = {
    showSubtitle: true,
    showCategoryTag: true,
    showAccountManager: true,
    showAdditionalEmails: false,
    showPoNumber: false,
    showDueDate: false,
    showFreight: false,
    showTax: false,
    showDiscount: false,
    showFooterTagline: false,
    showStatementOfWork: false,
    showFeeSchedule: false,
    showConfidentiality: false,
    showDisclaimer: true,
    showClientInfo: false,
    showShippingAddress: false,
    showIssueDate: false,
    showOrderMeta: true,
    showThumbnails: true,
    showComplimentaryServices: false,
    showTotals: true,
    showWireInfo: false,
    showPayButton: false,
  };

  const defaultInvoiceSettings = {
    brandLogo: 'inktheory' as 'inktheory' | 'xcollab',
    subtitle: "For your Consideration",
    categoryTag: "VCG • ADHOC ORDERS",
    statementOfWork: "This invoice represents the agreed upon deliverables and services as outlined in the project scope.",
    feeSchedule: "Payment is due upon receipt unless otherwise specified in your terms.",
    confidentiality: "Pricing and terms contained within are confidential and intended only for the recipient.",
    disclaimerText: defaultDisclaimerText,
    footerTagline: "YOUR TRUST IS OUR HIGHEST PRIORITY",
    wireBankName: globalSettings?.wireBankName || "Pinnacle Bank",
    wireBankAddress: globalSettings?.wireBankAddress || "2300 West End Avenue\nNashville, TN 37203",
    wireRoutingNumber: globalSettings?.wireRoutingNumber || "XXXXXXXX",
    wireSwiftCode: globalSettings?.wireSwiftCode || "XXXXXXXX",
    wireAccountName: globalSettings?.wireAccountName || "Catalyst",
    wireAccountNumber: globalSettings?.wireAccountNumber || "XXXXXXXX",
    ...defaultVisibilityToggles,
    payButtonText: "CLICK TO PAY BY CREDIT CARD +3.5%",
    payButtonUrl: order.stripePaymentUrl || globalSettings?.stripePaymentUrl || "https://stripe.com"
  };

  const invSettings: any = {
    ...defaultInvoiceSettings,
    ...(customer?.invoiceSettings || {}),
    ...defaultVisibilityToggles,
    ...(order?.invoiceSettings || {})
  };

  // Standard complimentary service deliverables
  const defaultServices = [
    { name: 'Collection Design', qty: 1, price: 0 },
    { name: 'Artwork Preparation', qty: 1, price: 0 },
    { name: 'Pantone Color Matching', qty: 1, price: 0 },
    { name: 'Production Management', qty: 1, price: 0 },
    { name: 'Quality Control', qty: 1, price: 0 }
  ];

  const customServices = invSettings.customServices || order.customServices || (order.includeStandardDeliverables !== false ? defaultServices : []);

  const isShippingLineItem = (item: any) => {
    const styleLower = String(item?.style || '').toLowerCase();
    return styleLower.includes('shipping') || styleLower.includes('delivery') || (item?.id && String(item.id).startsWith('ship-')) || item?.itemType === 'shipping';
  };

  const isTaxLineItem = (item: any) => {
    const styleLower = String(item?.style || '').toLowerCase();
    return styleLower.includes('tax') || item?.itemType === 'tax';
  };

  // Calculate items subtotal
  let itemsSubtotal = 0;
  let lineItemsDiscountTotal = 0;
  let shippingLineItemsTotal = 0;
  let taxLineItemsTotal = 0;
  order.items?.forEach((item: any) => {
    const priceStr = String(item.price || '0').replace(/[^0-9.]/g, '');
    const price = parseFloat(priceStr) || 0;
    
    let qty = 0;
    if (item.itemType === 'service' || !item.sizes || Object.keys(item.sizes).length === 0) {
      qty = parseInt(item.qty || 1);
    } else {
      qty = Object.values(item.sizes || {}).reduce((a: any, b: any) => a + (parseInt(b) || 0), 0) as number;
    }
    
    if (isDiscountItem(item)) {
      lineItemsDiscountTotal += Math.abs(price * qty);
      return;
    }
    if (isShippingLineItem(item)) {
      shippingLineItemsTotal += price * qty;
      return;
    }
    if (isTaxLineItem(item)) {
      taxLineItemsTotal += price * qty;
      return;
    }
    itemsSubtotal += price * qty;
  });

  if (invSettings.showComplimentaryServices !== false && Array.isArray(customServices)) {
    customServices.forEach((srv: any) => {
      const sPrice = parseFloat(srv.price || 0) || 0;
      const sQty = parseInt(srv.qty || 1) || 1;
      itemsSubtotal += sPrice * sQty;
    });
  }

  // Calculate shipping, tax & discounts (respecting visibility toggles)
  const explicitShipping = parseFloat(String(invSettings.shippingFee ?? order.shippingFee ?? order.freight ?? order.shippingCost ?? 0)) || shippingLineItemsTotal;
  const rawShippingFee = explicitShipping > 0 ? explicitShipping : (autoShippingFee || 0);
  const shippingFee = invSettings.showFreight === false ? 0 : rawShippingFee;
  const rawTaxAmount = parseFloat(String(invSettings.taxAmount ?? order.taxAmount ?? order.tax ?? 0)) || taxLineItemsTotal;
  const taxAmount = invSettings.showTax === false ? 0 : rawTaxAmount;
  const explicitDiscount = Math.abs(parseFloat(String(order.discountAmount || 0)) || 0);
  const rawDiscountAmount = Math.max(explicitDiscount, lineItemsDiscountTotal);
  const discountAmount = invSettings.showDiscount === false ? 0 : rawDiscountAmount;
  const grandTotal = Math.max(0, itemsSubtotal - discountAmount) + shippingFee + taxAmount;

  const formattedItemsSubtotal = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(itemsSubtotal);
  const formattedShippingFee = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(shippingFee);
  const formattedTaxAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(taxAmount);
  const formattedDiscountAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(discountAmount);
  const formattedGrandTotal = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(grandTotal);

  const issueDate = order.date ? new Date(order.date).toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\//g, '.') : new Date().toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\//g, '.');
  const dueDateStr = order.dueDate ? new Date(order.dueDate).toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\//g, '.') : issueDate;

  // Client billing vs shipping address details
  const clientName = cust.contactName || cust.name || order.shippingAddress?.name || 'CLIENT';
  const companyName = cust.company || order.shippingAddress?.company || 'COMPANY';
  const clientPhone = cust.phone || order.shippingAddress?.phone;

  const isEstimate = String(invSettings.documentType || order.documentType || '').toLowerCase() === 'estimate';
  const statementOfWorkText = isEstimate && invSettings.statementOfWork === defaultInvoiceSettings.statementOfWork
    ? invSettings.statementOfWork.replace(/^This invoice/i, 'This estimate')
    : invSettings.statementOfWork;

  const accountManagerName = invSettings.accountManager || order.accountManager || cust.accountManager || order.assignedTo;
  const accountManagerEmail = invSettings.accountManagerEmail || order.accountManagerEmail || cust.accountManagerEmail;
  const accountManagerPhone = invSettings.accountManagerPhone || order.accountManagerPhone || cust.accountManagerPhone;

  // Resolve all client billing emails
  const allClientEmails: string[] = [];
  if (cust.email) allClientEmails.push(cust.email);
  if (order.shippingAddress?.email && !allClientEmails.includes(order.shippingAddress.email)) {
    allClientEmails.push(order.shippingAddress.email);
  }
  const rawAdditional = invSettings.additionalEmails || order.additionalEmails || cust.additionalEmails;
  if (rawAdditional) {
    const extraList = String(rawAdditional).split(/[,;\n]+/).map((e: string) => e.trim()).filter(Boolean);
    extraList.forEach((e: string) => {
      if (!allClientEmails.includes(e)) allClientEmails.push(e);
    });
  }

  const hasSeparateShipping = order.shippingAddress && (
    order.shippingAddress.street1 !== cust.shippingStreet ||
    order.shippingAddress.city !== cust.shippingCity
  );

  const renderDisclaimerParts = () => {
    const rawText = invSettings.disclaimerText || defaultDisclaimerText;
    const resolvedText = !isEstimate && rawText === defaultDisclaimerText
      ? rawText.replace(/\*\*ESTIMATE TERMS & CONDITIONS\*\*/g, '**INVOICE TERMS & CONDITIONS**').replace(/THIS ESTIMATE/g, 'THIS INVOICE')
      : rawText;
    const parts = String(resolvedText).split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, pIdx) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <span key={pIdx} className="font-semibold text-neutral-700">{part}</span>
      ) : (
        <span key={pIdx}>{part}</span>
      )
    );
  };

  return (
    <div className="min-h-screen bg-[#E9E9E9] flex justify-center py-0 md:py-12 px-0 md:px-4 font-sans text-neutral-900 w-full overflow-x-hidden">
      <div className="w-full max-w-[940px] bg-[#E9E9E9] min-h-screen md:min-h-[1180px] px-5 sm:px-8 md:px-14 pt-7 sm:pt-10 md:pt-12 pb-8 md:pb-10 flex flex-col justify-between relative">
        <div className="flex-1 flex flex-col">
          {/* Top Header: Massive Wordmark + Vertical ESTIMATE / INVOICE & ID */}
          <div className="flex justify-between items-start gap-3 mb-8 md:mb-10">
            <img
              src={invSettings.brandLogo === 'xcollab' ? '/xcollab-logo-black.png' : '/inktheory-logo-black.png'}
              alt={invSettings.brandLogo === 'xcollab' ? 'xCOLLAB' : 'INKTHEORY'}
              className="w-[80%] sm:w-[70%] max-w-[580px] block object-contain object-left select-none"
            />

            {invSettings.showOrderMeta !== false && (
              <div className="flex items-start gap-1 sm:gap-1.5 text-neutral-500 select-none shrink-0">
                <span
                  className="text-[6px] sm:text-[9px] md:text-[11.5px] font-normal tracking-[0.06em] sm:tracking-[0.1em] md:tracking-[0.12em] uppercase leading-none"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                >
                  {isEstimate ? 'ESTIMATE' : 'INVOICE'}
                </span>
                <span
                  className="text-[6px] sm:text-[8.5px] md:text-[10.5px] font-normal tracking-[0.05em] sm:tracking-[0.09em] md:tracking-[0.11em] uppercase leading-none"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                >
                  {order.portalId || order.id.slice(0, 8)}
                </span>
              </div>
            )}
          </div>

          {/* Project Header & Account Manager Block (Top-Left under Logo) */}
          <div className="mb-8 md:mb-12">
            <p className="text-[11px] font-bold tracking-[0.04em] text-neutral-900 uppercase leading-snug">
              {companyName} {order.title ? `· ${order.title}` : ''}
            </p>

            {invSettings.showAccountManager !== false && (
              <div className="mt-3 md:mt-4 flex flex-col gap-0.5 text-[10.5px] font-normal tracking-[0.03em] text-neutral-500 uppercase leading-[1.45] break-words">
                {(accountManagerName || (clientName && clientName !== 'CLIENT')) && (
                  <p>{accountManagerName || clientName}</p>
                )}
                {(accountManagerEmail || cust.email) && (
                  <p className="break-all">{accountManagerEmail || cust.email}</p>
                )}
                {invSettings.showAdditionalEmails !== false && allClientEmails
                  .filter((e: string) => e.toLowerCase() !== String(accountManagerEmail || cust.email || '').toLowerCase())
                  .map((emailStr: string, eIdx: number) => (
                    <p key={eIdx} className="break-all">{emailStr}</p>
                  ))}
                {(accountManagerPhone || clientPhone) && (
                  <p>{accountManagerPhone || clientPhone}</p>
                )}
              </div>
            )}

            {invSettings.showClientInfo !== false && (cust.shippingStreet || cust.location) && (
              <div className="mt-2 flex flex-col gap-0.5 text-[10px] font-normal tracking-[0.03em] text-neutral-500 uppercase leading-[1.45]">
                {cust.shippingStreet ? (
                  <p>
                    {cust.shippingStreet}, {cust.shippingCity}, {cust.shippingState} {cust.shippingZip}
                  </p>
                ) : cust.location ? (
                  <p>{cust.location}</p>
                ) : null}
              </div>
            )}
          </div>

          {/* Main Body: Left Meta/Terms Column + Offset Right Deliverables Column */}
          <div className="flex-1 flex flex-col md:flex-row gap-8 md:gap-0 md:justify-between items-start md:items-stretch">
            {/* Left Column (23% on Desktop, Full Width on Mobile) */}
            <div className="w-full md:w-[23%] flex flex-col gap-5 md:gap-6 text-[10px] tracking-[0.04em] text-neutral-500 uppercase leading-[1.55]">
              {/* Issue Date / Due Date / PO */}
              {(invSettings.showIssueDate !== false || invSettings.showDueDate !== false || (invSettings.showPoNumber !== false && order.poNumber)) && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-col gap-x-4 gap-y-2 pb-4 md:pb-0 border-b md:border-b-0 border-black/10">
                  {invSettings.showIssueDate !== false && (
                    <div>
                      <span className="text-neutral-400">ISSUED: </span>
                      <span className="text-neutral-800 font-semibold">{issueDate}</span>
                    </div>
                  )}
                  {invSettings.showDueDate !== false && (
                    <div>
                      <span className="text-neutral-400">DUE DATE: </span>
                      <span className="text-neutral-800 font-semibold">{dueDateStr}</span>
                    </div>
                  )}
                  {invSettings.showPoNumber !== false && order.poNumber && (
                    <div>
                      <span className="text-neutral-400">P.O. #: </span>
                      <span className="text-neutral-800 font-semibold">{order.poNumber}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Separate Shipping Address */}
              {invSettings.showShippingAddress !== false && hasSeparateShipping && (
                <div className="flex flex-col gap-0.5">
                  <p className="text-neutral-900 font-bold text-[10px] mb-0.5">SHIPPING ADDRESS</p>
                  {order.shippingAddress.name && <p className="text-neutral-700 font-semibold">{order.shippingAddress.name}</p>}
                  <p>{order.shippingAddress.street1}</p>
                  {order.shippingAddress.street2 && <p>{order.shippingAddress.street2}</p>}
                  <p>{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zip}</p>
                </div>
              )}

              {/* Statements & Terms */}
              {invSettings.showStatementOfWork !== false && statementOfWorkText && (
                <div>
                  <p className="text-neutral-900 font-bold text-[10px] mb-1">STATEMENT OF WORK</p>
                  <p className="whitespace-pre-line normal-case tracking-normal text-[10.5px] leading-relaxed text-neutral-600">{statementOfWorkText}</p>
                </div>
              )}

              {invSettings.showFeeSchedule !== false && invSettings.feeSchedule && (
                <div>
                  <p className="text-neutral-900 font-bold text-[10px] mb-1">FEE SCHEDULE</p>
                  <p className="whitespace-pre-line normal-case tracking-normal text-[10.5px] leading-relaxed text-neutral-600">{invSettings.feeSchedule}</p>
                </div>
              )}

              {invSettings.showConfidentiality !== false && invSettings.confidentiality && (
                <div>
                  <p className="text-neutral-900 font-bold text-[10px] mb-1">CONFIDENTIALITY</p>
                  <p className="whitespace-pre-line normal-case tracking-normal text-[10.5px] leading-relaxed text-neutral-600">{invSettings.confidentiality}</p>
                </div>
              )}

              {/* Vertical Terms & Conditions Disclaimer on Left Margin (Desktop) */}
              {invSettings.showDisclaimer !== false && (
                <div
                  className="hidden md:block flex-1 min-h-[540px] text-[7.5px] leading-[1.65] tracking-[0.04em] text-neutral-500 uppercase select-none self-start text-justify"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', textAlign: 'justify' }}
                >
                  {renderDisclaimerParts()}
                </div>
              )}
            </div>

            {/* Right Column: Deliverables & Totals (66% on Desktop, Full Width on Mobile) */}
            <div className="w-full md:w-[66%] flex flex-col">
              <h3 className="text-[10.5px] font-bold tracking-[0.05em] text-neutral-900 uppercase mb-4 md:mb-5">
                DELIVERABLES
              </h3>

              {/* Deliverables Rows */}
              <div className="flex flex-col gap-6 md:gap-8">
                {(() => {
                  const deliverableItems = (order.items || []).filter((item: any) => !isDiscountItem(item) && !isShippingLineItem(item) && !isTaxLineItem(item));
                  const hasAnyInHandsDate = deliverableItems.some((it: any) => Boolean(it?.inHandsDate));

                  const formatInHandsDate = (raw: string | undefined | null) => {
                    if (!raw) return '';
                    const trimmed = String(raw).trim();
                    if (!trimmed) return '';
                    const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
                    if (isoMatch) {
                      const yy = isoMatch[1].slice(-2);
                      const mm = String(parseInt(isoMatch[2], 10)).padStart(2, '0');
                      const dd = String(parseInt(isoMatch[3], 10)).padStart(2, '0');
                      return `${mm}/${dd}/${yy}`;
                    }
                    const parsed = new Date(trimmed);
                    if (!isNaN(parsed.getTime())) {
                      const mm = String(parsed.getMonth() + 1).padStart(2, '0');
                      const dd = String(parsed.getDate()).padStart(2, '0');
                      const yy = String(parsed.getFullYear()).slice(-2);
                      return `${mm}/${dd}/${yy}`;
                    }
                    return trimmed;
                  };

                  return deliverableItems.map((item: any, idx: number) => {
                    const priceStr = String(item.price || '0').replace(/[^0-9.]/g, '');
                    const price = parseFloat(priceStr) || 0;
                    let qty = 0;
                    if (item.itemType === 'service' || !item.sizes || Object.keys(item.sizes).length === 0) {
                      qty = parseInt(item.qty || 1);
                    } else {
                      qty = Object.values(item.sizes || {}).reduce((a: any, b: any) => a + (parseInt(b) || 0), 0) as number;
                    }
                    const total = price * qty;
                    const formattedItemTotal = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total);
                    const formattedPrice = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price);
                    const msrpVal = item.msrp !== undefined && item.msrp !== null
                      ? (parseFloat(String(item.msrp).replace(/[^0-9.]/g, '')) || 0)
                      : 0;
                    const formattedMsrp = msrpVal > 0
                      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(msrpVal)
                      : '';

                    const SIZE_ORDER = ['YXS', 'YS', 'YM', 'YL', 'YXL', 'XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', 'OSFA', 'ONE SIZE'];
                    const getBaseSize = (s: string) => {
                      const base = String(s).trim().split(' ')[0].toUpperCase();
                      if (base === 'XXL') return '2XL';
                      if (base === 'XXXL') return '3XL';
                      if (base === 'XXXXL') return '4XL';
                      return base;
                    };
                    const activeSizes = item.itemType !== 'service' && item.sizes
                      ? Object.entries(item.sizes)
                          .map(([sz, q]) => [sz, parseInt(String(q), 10) || 0] as [string, number])
                          .filter(([, q]) => q > 0)
                          .sort(([a], [b]) => {
                            const iA = SIZE_ORDER.indexOf(getBaseSize(a));
                            const iB = SIZE_ORDER.indexOf(getBaseSize(b));
                            if (iA === -1 && iB === -1) return a.localeCompare(b);
                            if (iA === -1) return 1;
                            if (iB === -1) return -1;
                            return iA - iB;
                          })
                      : [];

                    const getActiveSidesCount = (it: any) => {
                      if (!it.customized) return 1;
                      let count = 0;
                      if (it.logoUrl) count++;
                      if (it.logoUrlBack) count++;
                      if (it.logoUrlLeftSleeve) count++;
                      if (it.logoUrlRightSleeve) count++;
                      if (it.logoUrlTag) count++;
                      return count || 1;
                    };

                    const thumbUrl = item.customizedFrontImage
                      || item.image
                      || (item.color && item.images?.[item.color])
                      || item.originalFrontImage
                      || '';
                    const sidesCount = !item.customizedFrontImage && item.customized && item.image
                      ? getActiveSidesCount(item)
                      : 1;
                    const formattedInHands = formatInHandsDate(item.inHandsDate);

                    return (
                      <div key={idx} className="relative flex w-full items-start text-[11px] leading-snug min-h-[44px]">
                        {invSettings.showThumbnails !== false && thumbUrl && (
                          <div className={`w-11 h-11 sm:w-12 sm:h-12 md:w-[52px] md:h-[52px] mr-3 md:mr-0 md:absolute md:-left-[72px] md:top-[-4px] shrink-0 overflow-hidden flex items-center ${sidesCount > 1 ? 'justify-start' : 'justify-center'} select-none`}>
                            {sidesCount > 1 ? (
                              <img
                                src={thumbUrl}
                                alt={item.style || 'Garment'}
                                style={{ width: `${sidesCount * 100}%`, height: '100%', maxWidth: 'none' }}
                                className="object-cover mix-blend-multiply"
                              />
                            ) : (
                              <img
                                src={thumbUrl}
                                alt={item.style || 'Garment'}
                                className="w-full h-full object-contain mix-blend-multiply"
                              />
                            )}
                          </div>
                        )}
                        <div className={`${hasAnyInHandsDate ? 'w-[26%] sm:w-[27%]' : 'w-[30%] sm:w-[32%]'} pr-2 sm:pr-4 flex flex-col`}>
                          <span className="font-semibold text-neutral-900 uppercase tracking-[0.03em] break-words">
                            {item.style || 'Custom Item'}
                          </span>
                          {item.color && (
                            <span className="text-[10px] text-neutral-500 uppercase tracking-[0.03em] mt-0.5 break-words">
                              {item.color}
                            </span>
                          )}
                        </div>
                        <div className={`${hasAnyInHandsDate ? 'w-[26%] sm:w-[26%]' : 'w-[30%] sm:w-[30%]'} pr-2 flex flex-wrap items-start justify-start gap-x-2.5 sm:gap-x-3 gap-y-1.5`}>
                          {activeSizes.map(([sizeLabel, sizeQty]) => (
                            <div key={sizeLabel} className="flex flex-col items-center text-center min-w-[14px]">
                              <span className="font-medium text-neutral-900 uppercase tracking-[0.02em]">
                                {sizeLabel}
                              </span>
                              <span className="font-medium text-neutral-800 mt-0.5">
                                {sizeQty}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className={`${hasAnyInHandsDate ? 'w-[10%] sm:w-[11%]' : 'w-[12%] sm:w-[14%]'} text-center font-medium text-neutral-800 shrink-0`}>
                          {qty}
                        </div>
                        <div className={`${hasAnyInHandsDate ? 'w-[21%] sm:w-[20%]' : 'w-[28%] sm:w-[24%]'} text-right flex flex-col items-end shrink-0`}>
                          <span className="font-medium text-neutral-900">{formattedItemTotal}</span>
                          <span className="text-[9.5px] text-neutral-500 uppercase tracking-[0.02em] mt-0.5">
                            {formattedPrice}EA
                          </span>
                          {formattedMsrp && (
                            <span className="text-[9.5px] text-neutral-500 uppercase tracking-[0.02em] mt-0.5">
                              {formattedMsrp} MSRP
                            </span>
                          )}
                        </div>
                        {hasAnyInHandsDate && (
                          <div className="w-[17%] sm:w-[16%] pl-2 sm:pl-3 text-right flex flex-col items-end shrink-0">
                            {formattedInHands ? (
                              <>
                                <span className="font-normal text-neutral-500 tracking-[0.02em]">
                                  {formattedInHands}
                                </span>
                                <span className="text-[9.5px] text-neutral-500 uppercase tracking-[0.03em] mt-0.5">
                                  IN HANDS
                                </span>
                              </>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Services & Quality Control List */}
              {invSettings.showComplimentaryServices !== false && customServices && customServices.length > 0 && (
                <div className="mt-8 md:mt-10 pt-6 border-t border-black/10 flex flex-col gap-3">
                  <p className="text-[10px] font-bold tracking-[0.05em] text-neutral-900 uppercase mb-1">
                    {invSettings.servicesHeading || 'SERVICES & QUALITY CONTROL'}
                  </p>
                  {customServices.map((srv: any, sIdx: number) => {
                    const qtyVal = parseInt(srv.qty || 1) || 1;
                    const priceVal = (parseFloat(srv.price || 0) || 0) * qtyVal;
                    const priceFormatted = priceVal === 0 ? '$0.00' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(priceVal);

                    return (
                      <div key={sIdx} className="flex w-full items-center text-[10.5px] text-neutral-700 leading-snug">
                        <div className="w-[60%] sm:w-[62%] pr-2 sm:pr-4 font-medium uppercase tracking-[0.03em] break-words">
                          {srv.name}
                        </div>
                        <div className="w-[12%] sm:w-[14%] text-center text-neutral-500 shrink-0">
                          {qtyVal}
                        </div>
                        <div className="w-[28%] sm:w-[24%] text-right font-medium text-neutral-700 shrink-0">
                          {priceFormatted}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Logistics Fee if present */}
              {order.logisticsFee && (
                <div className="flex w-full items-center text-[11px] text-neutral-900 leading-snug mt-6 pt-4 border-t border-black/10">
                  <div className="w-[60%] sm:w-[62%] pr-2 sm:pr-4 font-semibold uppercase tracking-[0.03em]">
                    Logistics (Kitting & Packaging)
                  </div>
                  <div className="w-[12%] sm:w-[14%] text-center font-medium shrink-0">1</div>
                  <div className="w-[28%] sm:w-[24%] text-right font-medium shrink-0">
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(order.logisticsFee || 0))}
                  </div>
                </div>
              )}

              {/* Subtotal & Totals Breakdown */}
              {invSettings.showTotals !== false && (
                <div className="mt-8 md:mt-10 pt-6 border-t border-black/15 flex flex-col gap-2 text-[10.5px] uppercase tracking-[0.03em]">
                  <div className="flex justify-between items-center text-neutral-500">
                    <span>Deliverables Subtotal</span>
                    <span className="font-medium text-neutral-900">{formattedItemsSubtotal}</span>
                  </div>

                  {invSettings.showDiscount !== false && discountAmount > 0 && (
                    <div className="flex justify-between items-center text-emerald-700 font-semibold">
                      <span>Discount {order.discountCode ? `(${order.discountCode})` : ''}</span>
                      <span>−{formattedDiscountAmount}</span>
                    </div>
                  )}

                  {invSettings.showFreight !== false && (
                    <div className="flex justify-between items-center text-neutral-500">
                      <span>Freight / Shipping & Handling</span>
                      <span className="font-medium text-neutral-900">{formattedShippingFee}</span>
                    </div>
                  )}

                  {invSettings.showTax !== false && (
                    <div className="flex justify-between items-center text-neutral-500">
                      <span>Estimated Sales Tax</span>
                      <span className="font-medium text-neutral-900">{formattedTaxAmount}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-baseline pt-4 border-t border-black/15 mt-2">
                    <span className="text-[10.5px] font-bold tracking-[0.06em] text-neutral-900 uppercase">
                      {isEstimate ? 'Estimated Total' : 'Total Amount Due'}
                    </span>
                    <span className="text-xl sm:text-2xl font-semibold text-neutral-900 tracking-tight">
                      {formattedGrandTotal}
                    </span>
                  </div>
                </div>
              )}

              {/* Wire Info & Payment Button */}
              {(invSettings.showWireInfo !== false || invSettings.showPayButton !== false) && (
                <div className="mt-8 pt-6 border-t border-black/10 flex flex-col gap-5">
                  {invSettings.showWireInfo !== false && (
                    <div>
                      <p className="text-[10px] font-bold tracking-[0.05em] text-neutral-900 uppercase mb-2">
                        WIRE / ACH TRANSFER
                      </p>
                      <div className="text-[10px] text-neutral-600 uppercase tracking-[0.03em] leading-relaxed grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                        <div>
                          <span className="font-semibold text-neutral-900">BANK:</span> {invSettings.wireBankName}<br />
                          <span className="whitespace-pre-line">{invSettings.wireBankAddress}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-900">ROUTING #:</span> {invSettings.wireRoutingNumber}<br />
                          <span className="font-semibold text-neutral-900">SWIFT:</span> {invSettings.wireSwiftCode}<br />
                          <span className="font-semibold text-neutral-900">ACCOUNT NAME:</span> {invSettings.wireAccountName}<br />
                          <span className="font-semibold text-neutral-900">ACCOUNT #:</span> {invSettings.wireAccountNumber}
                        </div>
                      </div>
                    </div>
                  )}

                  {invSettings.showPayButton !== false && (
                    order.paymentStatus === 'paid' ? (
                      <div className="w-full py-3.5 bg-emerald-700 text-white text-center text-[10.5px] font-bold tracking-[0.12em] uppercase">
                        ✓ PAID IN FULL
                      </div>
                    ) : invSettings.payButtonUrl && invSettings.payButtonUrl !== 'https://stripe.com' && !invSettings.payButtonUrl.includes('stripe.com/checkout') ? (
                      <a
                        href={invSettings.payButtonUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-3.5 px-4 bg-neutral-900 text-white text-center text-[10px] sm:text-[10.5px] font-bold tracking-[0.12em] uppercase hover:bg-black transition-colors block"
                      >
                        {invSettings.payButtonText}
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsPayModalOpen(true)}
                        className="w-full py-3.5 px-4 bg-neutral-900 text-white text-center text-[10px] sm:text-[10.5px] font-bold tracking-[0.12em] uppercase hover:bg-black transition-colors cursor-pointer"
                      >
                        {invSettings.payButtonText}
                      </button>
                    )
                  )}
                </div>
              )}

              {/* Mobile Terms & Conditions Disclaimer (Horizontal for readability on small screens) */}
              {invSettings.showDisclaimer !== false && (
                <div className="md:hidden mt-8 pt-5 border-t border-black/10 text-[8px] leading-[1.6] tracking-[0.04em] text-neutral-500 uppercase">
                  {renderDisclaimerParts()}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Center Footer */}
        <div className="mt-12 md:mt-16 pt-6 md:pt-8 text-center flex flex-col items-center gap-1.5">
          {invSettings.showFooterTagline !== false && invSettings.footerTagline && (
            <p className="text-[8.5px] sm:text-[9px] font-semibold tracking-[0.12em] text-neutral-500 uppercase">
              {invSettings.footerTagline}
            </p>
          )}
          <p className="text-[8.5px] sm:text-[9px] tracking-[0.08em] text-neutral-500 uppercase">
            INKTHEORY &nbsp;2817 WEST END AVE &nbsp;NASHVILLE &nbsp;TN &nbsp;37203
          </p>
        </div>
      </div>

      {/* Native Stripe Credit Card Checkout Modal */}
      {isPayModalOpen && (
        <StripePaymentModal
          customer={customer}
          order={{
            ...order,
            shippingAddress: (order.shippingAddress && (order.shippingAddress.street1 || order.shippingAddress.city))
              ? order.shippingAddress
              : (customer?.shippingStreet || customer?.shippingCity ? {
                  name: customer.contactName || customer.name || '',
                  company: customer.company || customer.name || '',
                  street1: customer.shippingStreet || '',
                  street2: '',
                  city: customer.shippingCity || '',
                  state: customer.shippingState || '',
                  zip: customer.shippingZip || '',
                  country: 'US'
                } : order.shippingAddress),
            totalFormatted: formattedGrandTotal,
            calculatedTotal: grandTotal,
            calculatedTax: taxAmount
          }}
          onClose={() => setIsPayModalOpen(false)}
          onSuccess={() => {
            setIsPayModalOpen(false);
            setOrder((prev: any) => ({ ...prev, paymentStatus: 'paid' }));
            alert("Payment processed successfully! Thank you.");
          }}
        />
      )}
    </div>
  );
}
