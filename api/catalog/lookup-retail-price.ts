export const config = {
  runtime: 'edge',
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function extractJsonObject(text: string): any {
  const cleaned = text.trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try extracting fenced ```json ... ``` or first {...} block
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1].trim());
      } catch {
        // continue
      }
    }
    const braceStart = cleaned.indexOf('{');
    const braceEnd = cleaned.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd > braceStart) {
      try {
        return JSON.parse(cleaned.slice(braceStart, braceEnd + 1));
      } catch {
        // continue
      }
    }
  }
  return null;
}

function isSafeHttpUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    if (!GEMINI_API_KEY) {
      return json(
        { error: 'GEMINI_API_KEY is not configured on the server.' },
        500
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || !body.title) {
      return json({ error: 'Product title is required.' }, 400);
    }

    const title = String(body.title || '').trim();
    const sku = String(body.sku || '').trim();
    const style = String(body.style || '').trim();
    const garmentType = String(body.garmentType || '').trim();
    const gender = String(body.gender || '').trim();
    const colors = Array.isArray(body.colors)
      ? body.colors.join(', ')
      : String(body.colors || '').trim();

    const productSummary = [
      `Product Title: ${title}`,
      sku && sku !== 'No SKU' ? `SKU: ${sku}` : null,
      style ? `Style: ${style}` : null,
      garmentType ? `Category: ${garmentType}` : null,
      gender ? `Gender/Fit: ${gender}` : null,
      colors ? `Color: ${colors}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const prompt = `You are a retail apparel pricing researcher. Use Google Search to find the STANDARD FULL RETAIL STORE PRICE (MSRP / regular non-sale price) in USD for the exact apparel product below.

${productSummary}

IMPORTANT RULES:
1. Return the REGULAR / FULL standard store retail price (MSRP) directly from the official brand store or a major authorized retailer (e.g., Alo Yoga, Athleta, Lululemon, Vuori, Nordstrom, REI, etc.).
2. EXCLUDE any temporary sales, clearance markdowns, promo codes, deals, or secondhand resale prices (do NOT use Poshmark, eBay, Mercari, Depop, or Grailed unless no official/retailer listing exists, and if a listing shows a crossed-out original price vs a sale price, use the ORIGINAL non-sale retail price).
3. Include the exact product page URL where the standard retail price can be verified.
4. Respond ONLY with a valid JSON object (no markdown, no extra commentary) in this exact format:
{
  "retailPrice": 128,
  "sourceName": "Official Brand or Retailer Name",
  "sourceUrl": "https://...",
  "confidence": "high" | "medium" | "low",
  "notes": "Short 1-sentence explanation of the regular retail price found (noting if a sale price was ignored)."
}`;

    const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
    let lastError = '';
    let aiData: any = null;

    for (const model of models) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const aiRes = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            temperature: 0.1,
          },
        }),
      });

      if (aiRes.ok) {
        aiData = await aiRes.json();
        break;
      }
      lastError = await aiRes.text().catch(() => aiRes.statusText);
      console.warn(`[lookup-retail-price] Model ${model} failed (${aiRes.status}):`, lastError);
    }

    if (!aiData) {
      return json({ error: `AI price lookup failed: ${lastError || 'Unknown error'}` }, 502);
    }

    const candidate = aiData.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const rawText = parts
      .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
      .join('\n')
      .trim();

    const parsed = extractJsonObject(rawText);

    // Collect grounded Google Search source links returned by Gemini
    const groundingChunks = candidate?.groundingMetadata?.groundingChunks || [];
    const groundedSources: Array<{ title: string; url: string }> = [];
    const seenUrls = new Set<string>();
    for (const chunk of groundingChunks) {
      const uri = chunk?.web?.uri;
      const chunkTitle = chunk?.web?.title;
      if (isSafeHttpUrl(uri) && !seenUrls.has(uri)) {
        seenUrls.add(uri);
        groundedSources.push({
          title: typeof chunkTitle === 'string' && chunkTitle.trim() ? chunkTitle.trim() : uri,
          url: uri.trim(),
        });
      }
    }

    let retailPrice: number | null = null;
    if (parsed && parsed.retailPrice !== undefined && parsed.retailPrice !== null) {
      const num =
        typeof parsed.retailPrice === 'number'
          ? parsed.retailPrice
          : parseFloat(String(parsed.retailPrice).replace(/[^0-9.]/g, ''));
      if (!isNaN(num) && num > 0) {
        retailPrice = Math.round(num * 100) / 100;
      }
    }

    // Fallback: regex price from raw text if JSON failed
    if (retailPrice === null && rawText) {
      const priceMatch = rawText.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
      if (priceMatch) {
        const num = parseFloat(priceMatch[1]);
        if (!isNaN(num) && num > 0) {
          retailPrice = Math.round(num * 100) / 100;
        }
      }
    }

    if (retailPrice === null) {
      return json(
        {
          error: 'AI could not determine a standard retail price for this item.',
          sources: groundedSources.slice(0, 3),
        },
        404
      );
    }

    const fallbackSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${title} retail price`)}`;
    const primarySourceUrl =
      (parsed?.sourceUrl && isSafeHttpUrl(parsed.sourceUrl) ? parsed.sourceUrl.trim() : null) ||
      groundedSources[0]?.url ||
      fallbackSearchUrl;

    const primarySourceName =
      (typeof parsed?.sourceName === 'string' && parsed.sourceName.trim()) ||
      groundedSources[0]?.title ||
      'Store Listing';

    return json({
      retailPrice,
      sourceName: primarySourceName,
      sourceUrl: primarySourceUrl,
      sources: groundedSources.slice(0, 3),
      confidence: parsed?.confidence || 'medium',
      notes: typeof parsed?.notes === 'string' ? parsed.notes.trim() : '',
    });
  } catch (err: any) {
    console.error('[lookup-retail-price] Error:', err);
    return json({ error: 'Internal server error', details: err?.message }, 500);
  }
}
