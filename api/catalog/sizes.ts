import sanmarCatalogJson from '../../src/data/sanmar-catalog.json';

const catalog = sanmarCatalogJson as any[];

const STANDARD_SIZE_ORDER: Record<string, number> = {
  'y2xs': -7, 'yxxs': -6, 'yxs': -5, 'ys': -4, 'ym': -3, 'yl': -2, 'yxl': -1,
  'xxs': 1, '2xs': 1, 'xs': 2, 's': 3, 'm': 4, 'l': 5, 'xl': 6,
  '2xl': 7, 'xxl': 7, '3xl': 8, 'xxxl': 8, '4xl': 9, 'xxxxl': 9, '5xl': 10, '6xl': 11, '7xl': 12, '8xl': 13, '9xl': 14, '10xl': 15,
  'sm': 18, 'm/l': 19, 'l/xl': 20,
  'osfa': 30, 'os': 31, 'one size': 32
};

function sortSizes(a: string, b: string): number {
  const aNorm = a.split(' ')[0].toLowerCase().trim();
  const bNorm = b.split(' ')[0].toLowerCase().trim();
  const aVal = STANDARD_SIZE_ORDER[aNorm] ?? 50;
  const bVal = STANDARD_SIZE_ORDER[bNorm] ?? 50;
  if (aVal !== bVal) return aVal - bVal;
  return a.localeCompare(b);
}

export default async function handler(req: Request) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { searchParams } = new URL(req.url);
  const query = (searchParams.get('style') || searchParams.get('itemNum') || searchParams.get('q') || '').trim();

  if (!query) {
    return new Response(JSON.stringify({ error: 'Style or itemNum parameter is required' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const queryClean = query.toLowerCase().replace(/[\s-]/g, '');

  const match = catalog.find(item => {
    const itemStyleClean = (item.style || '').toLowerCase().replace(/[\s-]/g, '');
    if (itemStyleClean === queryClean) return true;
    if (itemStyleClean === `bc${queryClean}` || `bc${itemStyleClean}` === queryClean) return true;
    if (itemStyleClean === `dt${queryClean}` || `dt${itemStyleClean}` === queryClean) return true;
    if (itemStyleClean === `nl${queryClean}` || `nl${itemStyleClean}` === queryClean) return true;
    return false;
  });

  if (match) {
    const sizes = Array.isArray(match.sizes) ? [...match.sizes].sort(sortSizes) : ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
    return new Response(JSON.stringify({
      found: true,
      style: match.style,
      title: match.title,
      sizes
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400'
      }
    });
  }

  // Fallback defaults if style not recognized
  const isHeadwear = ['hat', 'cap', 'beanie'].some(w => queryClean.includes(w));
  const fallbackSizes = isHeadwear 
    ? ['OSFA'] 
    : ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];

  return new Response(JSON.stringify({
    found: false,
    style: query,
    sizes: fallbackSizes
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
