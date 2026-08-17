export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  try {
    const urlObj = new URL(req.url);
    const targetUrl = urlObj.searchParams.get('url');

    if (!targetUrl) {
      return new Response('Missing image url parameter', { status: 400 });
    }

    const imageRes = await fetch(targetUrl);
    if (!imageRes.ok) {
      return new Response(`Failed to fetch image: ${imageRes.statusText}`, { status: imageRes.status });
    }

    const contentType = imageRes.headers.get('content-type') || 'image/gif';
    const imageBuffer = await imageRes.arrayBuffer();

    return new Response(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err: any) {
    return new Response(`Error proxying image: ${err.message}`, { status: 500 });
  }
}
