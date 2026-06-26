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
    query SearchOrders($query: String!, $cursor: String) {
      orders(first: 250, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: true) {
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
                  sku
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
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  try {
    let hasNextPage = true;
    let cursor: string | null = null;
    const allOrders: any[] = [];

    while (hasNextPage) {
      const shopifyResponse = await fetch(`https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify({
          query,
          variables: {
            query: tag.split(',').map(t => `tag:"${t.trim()}"`).join(' OR '),
            cursor
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

      const ordersConnection = data.data?.orders;
      if (!ordersConnection) {
          break;
      }

      const edges = ordersConnection.edges || [];
      const pageOrders = edges.map((edge: any) => edge.node).map((order: any) => ({
        ...order,
        lineItems: order.lineItems.edges.map((itemEdge: any) => itemEdge.node)
      }));
      allOrders.push(...pageOrders);

      hasNextPage = ordersConnection.pageInfo?.hasNextPage || false;
      cursor = ordersConnection.pageInfo?.endCursor || null;
    }

    return new Response(JSON.stringify({ orders: allOrders }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('Shopify API Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: err.message }), { status: 500 });
  }
}
