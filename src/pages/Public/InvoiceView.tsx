import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { StripePaymentModal } from '../../components/Orders/StripePaymentModal';

export function InvoiceView() {
  const { orderId } = useParams();
  const [order, setOrder] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [globalSettings, setGlobalSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!orderId) return;
      try {
        const busSnap = await getDoc(doc(db, 'settings', 'business'));
        if (busSnap.exists()) {
          setGlobalSettings(busSnap.data());
        }

        const orderDoc = await getDoc(doc(db, 'orders', orderId));
        if (orderDoc.exists()) {
          const orderData = orderDoc.data();
          setOrder({ id: orderDoc.id, ...orderData });
          
          if (orderData.customerId) {
             const custDoc = await getDoc(doc(db, 'customers', orderData.customerId));
             if (custDoc.exists()) {
               setCustomer(custDoc.data());
             }
          }
        }
      } catch (err) {
        console.error("Error fetching order:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [orderId]);

  if (loading) {
     return (
       <div className="min-h-screen bg-[#FDFCF9] flex flex-col items-center justify-center gap-4 text-neutral-400">
         <Loader2 className="animate-spin" size={32} />
         <p className="font-semibold uppercase tracking-widest text-xs">Retrieving Invoice...</p>
       </div>
     );
  }

  if (!order) {
     return (
       <div className="min-h-screen bg-[#FDFCF9] flex flex-col items-center justify-center gap-4 text-neutral-500">
         <h2 className="text-2xl font-serif">Invoice Not Found</h2>
       </div>
     );
  }

  const cust = customer || { company: 'Unknown Customer', name: 'Unknown' };

  // Calculate items subtotal
  let itemsSubtotal = 0;
  order.items?.forEach((item: any) => {
    const priceStr = String(item.price || '0').replace(/[^0-9.]/g, '');
    const price = parseFloat(priceStr) || 0;
    
    let qty = 0;
    if (item.itemType === 'service' || !item.sizes || Object.keys(item.sizes).length === 0) {
      qty = parseInt(item.qty || 1);
    } else {
      qty = Object.values(item.sizes || {}).reduce((a: any, b: any) => a + (parseInt(b) || 0), 0) as number;
    }
    
    itemsSubtotal += price * qty;
  });

  // Calculate shipping & tax
  const shippingFee = parseFloat(order.shippingFee || order.freight || order.shippingCost || 0);
  const taxAmount = parseFloat(order.taxAmount || order.tax || 0);
  const grandTotal = itemsSubtotal + shippingFee + taxAmount;

  const formattedItemsSubtotal = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(itemsSubtotal);
  const formattedShippingFee = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(shippingFee);
  const formattedTaxAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(taxAmount);
  const formattedGrandTotal = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(grandTotal);

  const issueDate = order.date ? new Date(order.date).toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\//g, '.') : new Date().toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\//g, '.');
  const dueDateStr = order.dueDate ? new Date(order.dueDate).toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\//g, '.') : issueDate;

  // Client billing vs shipping address details
  const clientName = cust.contactName || cust.name || order.shippingAddress?.name || 'CLIENT';
  const companyName = cust.company || order.shippingAddress?.company || 'COMPANY';
  const clientEmail = cust.email || order.shippingAddress?.email;
  const clientPhone = cust.phone || order.shippingAddress?.phone;

  // Standard complimentary service deliverables
  const defaultServices = [
    { name: 'Collection Design', price: 0 },
    { name: 'Artwork Preparation', price: 0 },
    { name: 'Pantone Color Matching', price: 0 },
    { name: 'Production Management', price: 0 },
    { name: 'Quality Control', price: 0 }
  ];

  const customServices = order.customServices || (order.includeStandardDeliverables !== false ? defaultServices : []);

  const defaultInvoiceSettings = {
    subtitle: "For your Consideration",
    categoryTag: "VCG • ADHOC ORDERS",
    statementOfWork: "This invoice represents the agreed upon deliverables and services as outlined in the project scope.",
    feeSchedule: "Payment is due upon receipt unless otherwise specified in your terms.",
    confidentiality: "Pricing and terms contained within are confidential and intended only for the recipient.",
    footerTagline: "YOUR TRUST IS OUR HIGHEST PRIORITY",
    wireBankName: globalSettings?.wireBankName || "Pinnacle Bank",
    wireBankAddress: globalSettings?.wireBankAddress || "2300 West End Avenue\nNashville, TN 37203",
    wireRoutingNumber: globalSettings?.wireRoutingNumber || "XXXXXXXX",
    wireSwiftCode: globalSettings?.wireSwiftCode || "XXXXXXXX",
    wireAccountName: globalSettings?.wireAccountName || "Catalyst",
    wireAccountNumber: globalSettings?.wireAccountNumber || "XXXXXXXX",
    showPayButton: true,
    payButtonText: "CLICK TO PAY BY CREDIT CARD +3.5%",
    payButtonUrl: order.stripePaymentUrl || globalSettings?.stripePaymentUrl || "https://stripe.com"
  };

  const invSettings = {
    ...defaultInvoiceSettings,
    ...(customer?.invoiceSettings || {}),
    ...(order?.invoiceSettings || {})
  };

  const hasSeparateShipping = order.shippingAddress && (
    order.shippingAddress.street1 !== cust.shippingStreet ||
    order.shippingAddress.city !== cust.shippingCity
  );

  return (
    <div className="min-h-screen bg-[#f1efe9] flex justify-center py-10 font-sans text-neutral-900 w-full overflow-x-auto">
      <div className="w-full max-w-[1000px] flex shadow-2xl rounded-sm overflow-hidden bg-white min-h-[1000px] mx-4 relative min-w-[800px]">
        {/* Left Sidebar */}
        <div className="w-[120px] bg-[#f5f3ef] border-r border-neutral-200 flex flex-col justify-between py-10 items-center shrink-0">
          <div className="flex items-center" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
            <span className="text-[10px] font-bold tracking-[0.2em] text-neutral-500 mb-8 whitespace-nowrap">ISSUED {issueDate}</span>
            <span className="text-[10px] font-bold tracking-[0.2em] text-neutral-800 whitespace-nowrap">{invSettings.categoryTag}</span>
          </div>
          
          <div className="flex flex-col items-center justify-end pb-2">
            <img src="/wovn-production-logo.png" alt="WOVN Logo" className="w-20 object-contain opacity-90" />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-12 md:p-16 flex flex-col relative">
           {/* Top Header */}
           <div className="flex justify-between items-start mb-6">
              <span className="text-neutral-400 italic text-lg font-serif mt-1">{invSettings.subtitle}</span>
              <div className="flex flex-col items-end">
                <span className="text-5xl tracking-tight text-neutral-900" style={{ fontFamily: 'Times New Roman, Times, serif' }}>INVOICE</span>
                <span className="text-xs font-bold tracking-[0.2em] text-neutral-500 uppercase mt-1"># {order.portalId || order.id.slice(0, 8)}</span>
              </div>
           </div>

           {/* Banner & Terms Bar */}
           <div className="w-full bg-[#f5f3ef] py-3 px-6 mb-4 flex justify-between items-center border border-neutral-200">
             <span className="text-[10px] font-bold tracking-[0.2em] text-neutral-800 uppercase">{companyName} • {order.title}</span>
           </div>

           {/* Header Meta Info Bar */}
           <div className="w-full bg-neutral-50 py-2.5 px-6 mb-8 flex justify-between items-center border border-neutral-200/60 text-[10px] font-bold tracking-widest text-neutral-600 uppercase">
             <div>
               <span className="text-neutral-400">TERMS / DUE: </span> 
               <span>{invSettings.feeSchedule || 'DUE UPON RECEIPT'} ({dueDateStr})</span>
             </div>
             <div>
               <span className="text-neutral-400">P.O. #: </span> 
               <span>{order.poNumber || 'N/A'}</span>
             </div>
             <div>
               <span className="text-neutral-400">ORDER #: </span> 
               <span>{order.portalId || order.id.slice(0, 8)}</span>
             </div>
           </div>

           <div className="flex gap-12 flex-1">
             {/* Left Column Data */}
             <div className="w-1/3 flex flex-col gap-6">
                {/* Billing Contact */}
                <div className="flex flex-col gap-1 text-[11px] font-bold tracking-widest text-neutral-800 uppercase leading-relaxed">
                   <p className="text-neutral-500">TO (CLIENT):</p>
                   <p className="text-xs text-black">{companyName}</p>
                   <p className="text-neutral-600 font-medium">{clientName}</p>
                   {clientEmail && (
                     <p className="lowercase normal-case text-neutral-500 font-medium tracking-normal">{clientEmail}</p>
                   )}
                   {clientPhone && (
                     <p className="normal-case text-neutral-500 font-medium tracking-normal">{clientPhone}</p>
                   )}
                   {cust.shippingStreet ? (
                     <div className="mt-1 text-neutral-500 font-medium tracking-normal normal-case">
                       <p className="font-bold tracking-widest uppercase text-[9px] text-neutral-400">BILLING ADDRESS:</p>
                       <p>{cust.shippingStreet}</p>
                       <p>{cust.shippingCity}, {cust.shippingState} {cust.shippingZip}</p>
                     </div>
                   ) : cust.location ? (
                     <p className="normal-case text-neutral-500 font-medium tracking-normal">{cust.location}</p>
                   ) : null}
                </div>

                {/* Separate Shipping Address if different */}
                {hasSeparateShipping && (
                  <div className="flex flex-col gap-1 text-[11px] font-bold tracking-widest text-neutral-800 uppercase leading-relaxed pt-3 border-t border-neutral-100">
                    <p className="text-neutral-500 text-[9px]">SHIPPING ADDRESS:</p>
                    <p className="normal-case font-medium text-neutral-600 tracking-normal">{order.shippingAddress.name}</p>
                    <p className="normal-case font-medium text-neutral-600 tracking-normal">{order.shippingAddress.street1}</p>
                    {order.shippingAddress.street2 && <p className="normal-case font-medium text-neutral-600 tracking-normal">{order.shippingAddress.street2}</p>}
                    <p className="normal-case font-medium text-neutral-600 tracking-normal">{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zip}</p>
                  </div>
                )}

                <div className="flex flex-col gap-3 text-[11px] font-bold tracking-widest text-neutral-800 uppercase pt-2">
                   <div>
                     <p className="text-neutral-500 text-[9px]">ORDER TITLE:</p>
                     <p>{order.title}</p>
                   </div>
                   <div>
                     <p className="text-neutral-500 text-[9px]">COMPANY:</p>
                     <p>{companyName}</p>
                   </div>
                   <div>
                     <p className="text-neutral-500 text-[9px]">INVOICE #</p>
                     <p>{order.portalId || order.id.slice(0, 8)}</p>
                   </div>
                </div>

                <div className="mt-4 flex flex-col gap-5 text-[10px] text-neutral-500 leading-relaxed max-w-[220px]">
                   {invSettings.statementOfWork && (
                     <div>
                       <p className="font-bold text-neutral-800 tracking-widest uppercase mb-1">STATEMENT OF WORK</p>
                       <p className="whitespace-pre-line">{invSettings.statementOfWork}</p>
                     </div>
                   )}
                   {invSettings.feeSchedule && (
                     <div>
                       <p className="font-bold text-neutral-800 tracking-widest uppercase mb-1">FEE SCHEDULE</p>
                       <p className="whitespace-pre-line">{invSettings.feeSchedule}</p>
                     </div>
                   )}
                   {invSettings.confidentiality && (
                     <div>
                       <p className="font-bold text-neutral-800 tracking-widest uppercase mb-1">CONFIDENTIALITY</p>
                       <p className="whitespace-pre-line">{invSettings.confidentiality}</p>
                     </div>
                   )}
                </div>

                <div className="mt-auto pt-6">
                  <p className="text-[9px] font-bold tracking-widest uppercase text-neutral-400">{invSettings.footerTagline}</p>
                </div>
             </div>

             {/* Right Column Data */}
             <div className="w-2/3 flex flex-col">
                <h3 className="text-[10px] font-bold tracking-[0.2em] text-neutral-800 uppercase mb-6 pb-2 border-b border-neutral-200">DELIVERABLES</h3>

                <div className="w-full mb-6">
                  {/* Table Header */}
                  <div className="flex w-full text-[9px] font-bold tracking-widest text-neutral-500 uppercase pb-3 border-b border-neutral-100">
                    <div className="w-1/2">ITEM</div>
                    <div className="w-1/6 text-center">QTY</div>
                    <div className="w-1/3 text-right">PRICE</div>
                  </div>

                  {/* Table Rows: Order Items */}
                  <div className="flex flex-col gap-4 py-4 border-b border-neutral-100">
                    {order.items?.map((item: any, idx: number) => {
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

                       return (
                         <div key={idx} className="flex w-full text-[11px] text-neutral-800 leading-snug">
                           <div className="w-1/2 pr-4 flex flex-col">
                              <span className="font-bold uppercase tracking-wide">{item.style || 'Custom Item'}</span>
                              {item.color && <span className="text-neutral-500 mt-0.5">{item.color}</span>}
                           </div>
                           <div className="w-1/6 text-center font-medium">
                              {qty}
                           </div>
                           <div className="w-1/3 text-right flex flex-col">
                              <span className="font-bold">{formattedItemTotal}</span>
                              <span className="text-neutral-400 text-[10px] mt-0.5">{formattedPrice} ea</span>
                           </div>
                         </div>
                       );
                    })}
                  </div>

                  {/* Table Rows: Standard Complimentary Services */}
                  {customServices && customServices.length > 0 && (
                    <div className="flex flex-col gap-2.5 py-4 border-b border-neutral-100">
                      <p className="text-[9px] font-bold tracking-widest text-neutral-400 uppercase mb-1">SERVICES & QUALITY CONTROL</p>
                      {customServices.map((srv: any, sIdx: number) => {
                        const priceVal = parseFloat(srv.price || 0);
                        const priceFormatted = priceVal === 0 ? '$0.00' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(priceVal);

                        return (
                          <div key={sIdx} className="flex w-full text-[11px] text-neutral-700 leading-snug">
                            <div className="w-1/2 pr-4 font-medium uppercase tracking-wide">
                              {srv.name}
                            </div>
                            <div className="w-1/6 text-center text-neutral-400 text-[10px]">
                              1
                            </div>
                            <div className="w-1/3 text-right font-bold text-neutral-600 text-[10px]">
                              {priceFormatted}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Kitting, Packaging & Logistics line item if specified */}
                  {order.logisticsFee && (
                    <div className="flex w-full text-[11px] text-neutral-800 leading-snug py-3 border-b border-neutral-100">
                      <div className="w-1/2 pr-4 font-bold uppercase tracking-wide">
                        Logistics (Kitting & Packaging)
                      </div>
                      <div className="w-1/6 text-center font-medium">1</div>
                      <div className="w-1/3 text-right font-bold">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(order.logisticsFee || 0))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Subtotal & Totals Breakdown */}
                <div className="mt-auto border-t border-neutral-200 pt-4 flex flex-col gap-2 mb-8 text-[11px]">
                   <div className="flex justify-between items-center text-neutral-500">
                     <span>Deliverables Subtotal</span>
                     <span className="font-medium text-neutral-800">{formattedItemsSubtotal}</span>
                   </div>

                   {shippingFee > 0 && (
                     <div className="flex justify-between items-center text-neutral-500">
                       <span>Freight / Shipping & Handling</span>
                       <span className="font-medium text-neutral-800">{formattedShippingFee}</span>
                     </div>
                   )}

                   {taxAmount > 0 && (
                     <div className="flex justify-between items-center text-neutral-500">
                       <span>Estimated Sales Tax</span>
                       <span className="font-medium text-neutral-800">{formattedTaxAmount}</span>
                     </div>
                   )}

                   <div className="flex justify-between items-end pt-3 border-t border-neutral-200 mt-1">
                      <span className="text-sm font-serif italic text-neutral-400">Total Amount Due</span>
                      <span className="text-4xl font-serif text-neutral-900 tracking-tight">{formattedGrandTotal}</span>
                   </div>
                </div>

                {/* Wire Info & Payment */}
                <div className="bg-[#f5f3ef] rounded-xl p-6 flex flex-col gap-6">
                   <div>
                     <p className="text-[10px] font-bold tracking-widest text-neutral-800 uppercase mb-2">WIRE INFO</p>
                     <div className="text-[11px] text-neutral-600 leading-relaxed grid grid-cols-2 gap-x-4 gap-y-2">
                       <div>
                         <span className="font-bold text-neutral-800">Bank:</span> {invSettings.wireBankName}<br/>
                         <span className="whitespace-pre-line">{invSettings.wireBankAddress}</span>
                       </div>
                       <div>
                         <span className="font-bold text-neutral-800">Wire Routing #:</span> {invSettings.wireRoutingNumber}<br/>
                         <span className="font-bold text-neutral-800">SWIFT Code:</span> {invSettings.wireSwiftCode}<br/>
                         <span className="font-bold text-neutral-800">Account Name:</span> {invSettings.wireAccountName}<br/>
                         <span className="font-bold text-neutral-800">Account Number:</span> {invSettings.wireAccountNumber}
                       </div>
                     </div>
                   </div>

                   {invSettings.showPayButton !== false && (
                     order.paymentStatus === 'paid' ? (
                       <div className="w-full py-4 bg-emerald-600 text-white text-center text-[11px] font-bold tracking-widest uppercase rounded-lg shadow-sm">
                         ✓ INVOICE PAID IN FULL
                       </div>
                     ) : invSettings.payButtonUrl && invSettings.payButtonUrl !== 'https://stripe.com' && !invSettings.payButtonUrl.includes('stripe.com/checkout') ? (
                       <a 
                         href={invSettings.payButtonUrl}
                         target="_blank"
                         rel="noreferrer"
                         className="w-full py-4 bg-black text-white text-center text-[11px] font-bold tracking-widest uppercase rounded-lg hover:bg-neutral-800 transition-colors shadow-lg block"
                       >
                         {invSettings.payButtonText}
                       </a>
                     ) : (
                       <button 
                         type="button"
                         onClick={() => setIsPayModalOpen(true)}
                         className="w-full py-4 bg-black text-white text-center text-[11px] font-bold tracking-widest uppercase rounded-lg hover:bg-neutral-800 transition-colors shadow-lg cursor-pointer"
                       >
                         {invSettings.payButtonText}
                       </button>
                     )
                   )}
                </div>

                {/* Small Legal Protections Disclaimer Footer */}
                <div className="mt-6 pt-4 border-t border-neutral-100 text-[9px] text-neutral-400 leading-normal italic text-center">
                  Quantities, freight, and applicable taxes are subject to final reconciliation. Custom merchandise is produced specifically for the client and is non-returnable after production is approved and production begins upon required approval and payment.
                </div>
             </div>
           </div>
        </div>
      </div>

      {/* Native Stripe Credit Card Checkout Modal */}
      {isPayModalOpen && (
        <StripePaymentModal
          order={{
            ...order,
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
