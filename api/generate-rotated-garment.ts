export const config = {
  runtime: 'edge',
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  try {
    const { baseImage, viewAngle } = await req.json();

    if (!baseImage) {
      return new Response(JSON.stringify({ error: 'baseImage is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Extract base64 and mimeType
    let baseImageData = '';
    let mimeType = 'image/jpeg';

    if (baseImage.startsWith('data:')) {
      const match = baseImage.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        baseImageData = match[2];
      }
    } else if (baseImage.startsWith('http')) {
      const imgRes = await fetch(baseImage);
      if (!imgRes.ok) {
        throw new Error(`Failed to fetch baseImage from URL: ${imgRes.status}`);
      }
      const arrayBuf = await imgRes.arrayBuffer();
      mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
      const bytes = new Uint8Array(arrayBuf);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      baseImageData = btoa(binary);
    } else {
      baseImageData = baseImage;
    }

    const requestedAngle = viewAngle || 'Left Side View';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${GEMINI_API_KEY}`;

    const promptText = `TASK: Rotate Garment
CRITICAL CONSTRAINTS:
1. COMPLETELY ROTATE THE GARMENT IN 3D SPACE TO DISPLAY THE: ${requestedAngle}.
2. DO NOT KEEP IT FACING THE SAME DIRECTION as the original image. We want what this garment would realistically look like photographed from the requested ${requestedAngle} perspective (e.g. side profile for sleeve).
3. ISOLATE ON PURE WHITE (ULTRA-CRITICAL): The garment MUST be completely isolated on a flat, solid, mathematically pure white background (HEX #FFFFFF). Absolutely NO shadows on the floor or wall. NO cream, off-white, light grey, or transparent backgrounds. NO gradients. Every non-garment pixel MUST be exactly #FFFFFF.
4. Keep the same exact fabric, collar style, sleeve style, proportions, and details.
5. Do NOT add any logos or graphics. Just the blank garment.`;

    const payload = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: mimeType,
                data: baseImageData
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ["IMAGE"]
      }
    };

    const aiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Gemini API error:", aiRes.status, errText);
      return new Response(JSON.stringify({ error: `Gemini API failed: ${errText}` }), {
        status: aiRes.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const aiData = await aiRes.json();
    const candidate = aiData.candidates?.[0];
    for (const part of candidate?.content?.parts || []) {
      if (part.inlineData) {
        const outDataUrl = `data:${part.inlineData.mimeType || 'image/jpeg'};base64,${part.inlineData.data}`;
        return new Response(JSON.stringify({ imageUrl: outDataUrl }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (part.text && part.text.startsWith('iVBORw0KGgo')) {
        return new Response(JSON.stringify({ imageUrl: `data:image/png;base64,${part.text}` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ error: 'No image returned in Gemini response' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error("Handler error:", err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
