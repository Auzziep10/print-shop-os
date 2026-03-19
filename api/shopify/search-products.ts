export const config = {
  runtime: 'edge', 
};

export default async function handler(req: Request) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');

  if (!q) {
    return new Response(JSON.stringify({ error: 'Search query is required' }), { status: 400 });
  }

  const { SHOPIFY_SHOP_DOMAIN, SHOPIFY_ACCESS_TOKEN } = process.env;

  if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
    return new Response(JSON.stringify({ error: 'Shopify credentials not configured' }), { status: 500 });
  }

  const query = `
    query SearchProducts($query: String!) {
      products(first: 20, query: $query) {
        edges {
          node {
            id
            title
            featuredImage { url }
            options {
              name
              values
            }
            variants(first: 50) {
              edges {
                node {
                  title
                  price
                  sku
                  inventoryQuantity
                  image { url }
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const shopifyResponse = await fetch(`https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({
        query,
        variables: {
          query: `title:*${q}*`
        }
      })
    });

    if (!shopifyResponse.ok) {
        throw new Error(`Shopify API responded with status: ${shopifyResponse.status}`);
    }

    const data = await shopifyResponse.json();
    
    if (data.errors) {
        return new Response(JSON.stringify({ error: 'Shopify GraphQL Error', details: data.errors }), { status: 400 });
    }

    const products = data.data.products.edges.map((edge: any) => edge.node).map((prod: any) => ({
      ...prod,
      variants: prod.variants.edges.map((v: any) => v.node)
    }));

    return new Response(JSON.stringify({ products }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('Shopify API Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: err.message }), { status: 500 });
  }
}
