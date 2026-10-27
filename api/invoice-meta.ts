export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get('orderId') || '';

  // 1. Fetch base index.html from deployment origin
  let html = '';
  try {
    const host = req.headers.get('host') || 'inktheory.studio';
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const res = await fetch(`${proto}://${host}/index.html`);
    if (res.ok) {
      html = await res.text();
    }
  } catch (err) {
    console.error('Failed to fetch base index.html:', err);
  }

  // 2. Fetch order data from Firestore REST API if orderId is provided
  let isEstimate = false;
  let isXCollab = false;
  let customerName = '';
  let orderTitle = '';
  let portalId = '';

  if (orderId) {
    try {
      const apiKey = 'AIzaSyAGiJrWnwbdY4PrI-YHMf7DWOS9wFlsY3c';
      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/print-shop-os-f8092/databases/(default)/documents/orders/${encodeURIComponent(orderId)}?key=${apiKey}`;
      const firestoreRes = await fetch(firestoreUrl);
      if (firestoreRes.ok) {
        const data = await firestoreRes.json();
        const fields = data.fields || {};

        const invSettings = fields.invoiceSettings?.mapValue?.fields || {};
        const rawDocType = invSettings.documentType?.stringValue || fields.documentType?.stringValue || '';
        isEstimate = rawDocType.toLowerCase() === 'estimate';

        const rawBrand = invSettings.brandLogo?.stringValue || '';
        isXCollab = rawBrand.toLowerCase() === 'xcollab';

        const shippingAddr = fields.shippingAddress?.mapValue?.fields || {};
        customerName = shippingAddr.company?.stringValue || fields.company?.stringValue || fields.customerName?.stringValue || shippingAddr.name?.stringValue || '';
        orderTitle = fields.title?.stringValue || '';
        portalId = fields.portalId?.stringValue || (orderId ? orderId.slice(0, 8) : '');
      }
    } catch (err) {
      console.error('Failed to fetch order for invoice meta:', err);
    }
  }

  const brand = isXCollab ? 'xCollab' : 'INKTHEORY';
  const docType = isEstimate ? 'Estimate' : 'Invoice';
  const clientSubject = customerName || orderTitle;

  // When sharing an invoice/estimate on iMessage/SMS, og:title defines the bold headline:
  // e.g. "Estimate · Santos Bravo" or "Invoice · Acme Corp" or "Estimate · xCollab"
  const ogTitle = clientSubject ? `${docType} · ${clientSubject}` : `${brand} · ${docType}`;
  const pageTitle = `${brand} | ${ogTitle}${portalId ? ` #${portalId}` : ''}`;
  const ogDescription = `View and review your ${docType.toLowerCase()} from ${brand}.`;
  const ogImage = isXCollab
    ? 'https://inktheory.studio/xcollab-logo-black.png'
    : 'https://inktheory.studio/og-image.png';

  if (!html) {
    html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${pageTitle}</title>
    <meta name="title" content="${pageTitle}" />
    <meta name="description" content="${ogDescription}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${ogTitle}" />
    <meta property="og:description" content="${ogDescription}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:site_name" content="${brand}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${ogTitle}" />
    <meta name="twitter:description" content="${ogDescription}" />
    <meta name="twitter:image" content="${ogImage}" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
  } else {
    // Replace meta tags in base html
    html = html.replace(/<title>.*?<\/title>/i, `<title>${pageTitle}</title>`);
    html = html.replace(/<meta\s+name=["']title["'][^>]*>/i, `<meta name="title" content="${pageTitle}" />`);
    html = html.replace(/<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${ogDescription}" />`);
    html = html.replace(/<meta\s+property=["']og:title["'][^>]*>/i, `<meta property="og:title" content="${ogTitle}" />`);
    html = html.replace(/<meta\s+property=["']og:description["'][^>]*>/i, `<meta property="og:description" content="${ogDescription}" />`);
    html = html.replace(/<meta\s+property=["']og:image["'][^>]*>/i, `<meta property="og:image" content="${ogImage}" />`);
    html = html.replace(/<meta\s+property=["']og:image:secure_url["'][^>]*>/i, `<meta property="og:image:secure_url" content="${ogImage}" />`);
    html = html.replace(/<meta\s+property=["']og:site_name["'][^>]*>/i, `<meta property="og:site_name" content="${brand}" />`);
    html = html.replace(/<meta\s+name=["']twitter:title["'][^>]*>/i, `<meta name="twitter:title" content="${ogTitle}" />`);
    html = html.replace(/<meta\s+name=["']twitter:description["'][^>]*>/i, `<meta name="twitter:description" content="${ogDescription}" />`);
    html = html.replace(/<meta\s+name=["']twitter:image["'][^>]*>/i, `<meta name="twitter:image" content="${ogImage}" />`);
  }

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
