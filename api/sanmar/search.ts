export const config = {
  runtime: 'edge',
};

interface SanMarCoveoTarget {
  orgId: string;
  token: string;
  trackingId: string;
  baseUrl: string;
}

const SANMAR_TARGETS: SanMarCoveoTarget[] = [
  {
    orgId: 'sanmarproduction18f2pptvx',
    token: 'xxdba8beb2-7048-4c5a-bfb8-5c96360c336f',
    trackingId: 'sanmar',
    baseUrl: 'https://www.sanmar.com'
  },
  {
    orgId: 'sanmarnonproduction2r6ewyl49',
    token: 'xx254f7763-bf8e-4614-ad29-d6c8f1068f61',
    trackingId: 'sanmar_euat',
    baseUrl: 'https://euat.sanmar.com'
  }
];

function stripHtml(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/&#174;/g, '')
    .replace(/&#153;/g, '')
    .replace(/&#8221;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUrl(u: string | undefined | null): string {
  if (!u) return '';
  if (u.startsWith('//')) return `https:${u}`;
  return u;
}

async function searchCoveoTarget(target: SanMarCoveoTarget, query: string) {
  const endpoint = `https://${target.orgId}.org.coveo.com/rest/organizations/${target.orgId}/commerce/v2/search`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${target.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      trackingId: target.trackingId,
      language: 'en',
      country: 'US',
      currency: 'USD',
      clientId: '11111111-1111-1111-1111-111111111111',
      context: {
        view: { url: `${target.baseUrl}/search` },
        dictionaryFieldContext: { ec_pricing: '100', ec_pricing_sale: '100' }
      },
      query
    })
  });

  if (!res.ok) return [];
  const data = await res.json();
  const rawProducts: any[] = Array.isArray(data?.products) ? data.products : [];
  if (rawProducts.length === 0) return [];

  const mappedResults: any[] = [];

  for (const prod of rawProducts.slice(0, 6)) {
    const style = String(
      prod.additionalFields?.ec_style_number || prod.ec_item_group_id || ''
    ).trim();
    if (!style) continue;

    const allVariants = [prod, ...(Array.isArray(prod.children) ? prod.children : [])];
    const colors: string[] = [];
    const images: Record<string, { front: string; back: string; swatch: string }> = {};

    // First try QuickView to get the full color list and swatches
    const firstCode = prod.ec_product_id || prod.permanentid;
    if (firstCode) {
      try {
        const qvRes = await fetch(
          `${target.baseUrl}/modal/quickview/${encodeURIComponent(firstCode)}/getQuickViewProductInfo`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        if (qvRes.ok) {
          const qvData = await qvRes.json();
          const colorOpts: any[] = qvData?.product?.baseOptions?.[0]?.options || [];
          for (const opt of colorOpts) {
            const q = opt.variantOptionQualifiers?.[0];
            const colorName = String(q?.value || '').trim();
            if (!colorName) continue;
            const swatchUrl = normalizeUrl(q?.image?.url);

            // Match variant in Coveo children if present
            const matchedChild = allVariants.find(
              (v) =>
                String(v.ec_product_id || v.permanentid || '').toLowerCase() ===
                String(opt.code || '').toLowerCase()
            );
            const frontImg =
              normalizeUrl(matchedChild?.ec_images?.[0]) ||
              normalizeUrl(matchedChild?.ec_thumbnails?.[0]) ||
              normalizeUrl(prod.ec_images?.[0]) ||
              normalizeUrl(prod.ec_thumbnails?.[0]);

            if (frontImg && !images[colorName]) {
              colors.push(colorName);
              images[colorName] = {
                front: frontImg,
                back: frontImg,
                swatch: swatchUrl || frontImg
              };
            }
          }
        }
      } catch {
        // Ignore quickview fallback error and use Coveo variants below
      }
    }

    // Fallback to Coveo child variants if QuickView didn't populate colors
    if (colors.length === 0) {
      for (const v of allVariants) {
        const codeStr = String(v.ec_product_id || v.permanentid || '');
        const colorPart = codeStr.includes('_') ? codeStr.split('_').slice(1).join(' ') : 'Default';
        const frontImg = normalizeUrl(v.ec_images?.[0] || v.ec_thumbnails?.[0]);
        if (frontImg && !images[colorPart]) {
          colors.push(colorPart);
          images[colorPart] = {
            front: frontImg,
            back: frontImg,
            swatch: frontImg
          };
        }
      }
    }

    if (colors.length === 0) continue;

    const cleanName = stripHtml(prod.ec_name) || style;
    const cleanDesc = stripHtml(prod.ec_description);
    const price = Number(
      prod.additionalFields?.ec_pricing || prod.additionalFields?.ec_pricing_sale || 12.0
    );

    mappedResults.push({
      style,
      title: `${cleanName}. ${style}`,
      brand: stripHtml(prod.ec_brand) || 'SanMar',
      description: cleanDesc,
      category: (Array.isArray(prod.ec_category) && prod.ec_category[0]) || 'Apparel',
      price: Number.isFinite(price) && price > 0 ? price : 12.0,
      colors,
      images
    });
  }

  return mappedResults;
}

export default async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();

  if (!q || q.length < 2) {
    return new Response(JSON.stringify({ products: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const byStyle = new Map<string, any>();

    for (const target of SANMAR_TARGETS) {
      const found = await searchCoveoTarget(target, q);
      for (const item of found) {
        const key = item.style.toUpperCase();
        if (!byStyle.has(key)) {
          byStyle.set(key, item);
        }
      }
      // If we found an exact style match on production, we can stop early
      if (byStyle.has(q.toUpperCase())) break;
    }

    return new Response(
      JSON.stringify({
        products: Array.from(byStyle.values())
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600, s-maxage=3600'
        }
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || 'SanMar search error', products: [] }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
