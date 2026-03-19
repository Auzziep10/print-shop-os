export const config = {
  runtime: 'edge', // Edge functions are faster for proxying
};

export default async function handler(req: Request) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const { searchParams } = new URL(req.url);
  const tag = searchParams.get('tag');

  if (!tag) {
    return new Response(JSON.stringify({ error: 'Search tag is required' }), { status: 400 });
  }

  const { SHOPIFY_SHOP_DOMAIN, SHOPIFY_ACCESS_TOKEN } = process.env;

  if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
    return new Response(JSON.stringify({ error: 'Shopify credentials not configured on server' }), { status: 500 });
  }

  const query = `
    query SearchOrders($query: String!) {
      orders(first: 25, query: $query, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            legacyResourceId
            name
            createdAt
            email
            tags
            displayFinancialStatus
            displayFulfillmentStatus
            lineItems(first: 50) {
              edges {
                node {
                  id
                  title
                  variantTitle
                  quantity
                  image {
                    url
                  }
                  originalUnitPriceSet {
                    presentmentMoney {
                      amount
                    }
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
          query: `tag:"${tag}"`
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

    // Transform edges into a flat array for the frontend
    const orders = data.data.orders.edges.map((edge: any) => edge.node).map((order: any) => ({
      ...order,
      lineItems: order.lineItems.edges.map((itemEdge: any) => itemEdge.node)
    }));

    return new Response(JSON.stringify({ orders }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('Shopify API Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: err.message }), { status: 500 });
  }
}
