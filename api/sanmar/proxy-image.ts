export const config = {
  runtime: 'edge', // Edge functions are faster for proxying
};

export default async function handler(req: Request) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const { searchParams } = new URL(req.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return new Response(JSON.stringify({ error: 'URL parameter is required' }), { status: 400 });
  }

  // Validate allowed domains to prevent open SSRF vulnerability
  const isAllowedDomain = 
    imageUrl.startsWith('https://images.sanmar.com/') || 
    imageUrl.startsWith('https://cdnm.sanmar.com/') ||
    imageUrl.startsWith('https://image.pollinations.ai/');
  if (!isAllowedDomain) {
    return new Response(JSON.stringify({ error: 'Domain not allowed in proxy' }), { status: 400 });
  }

  try {
    const response = await fetch(imageUrl);

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch image from SanMar' }), { status: response.status });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const body = response.body;

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (err) {
    console.error('Image Proxy Error:', err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: errorMessage }), { status: 500 });
  }
}
