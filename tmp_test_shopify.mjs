


const { SHOPIFY_SHOP_DOMAIN, SHOPIFY_ACCESS_TOKEN } = process.env;

async function testShopify() {
  const url = `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/shop.json`;
  
  console.log(`Testing Shopify Connection for ${SHOPIFY_SHOP_DOMAIN}...`);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
      }
    });
    
    const body = await response.text();
    console.log(`Status: ${response.status} ${response.statusText}`);
    try {
      console.log(JSON.stringify(JSON.parse(body), null, 2).substring(0, 500));
    } catch {
      console.log(body);
    }
  } catch (err) {
    console.error('Fetch Error:', err);
  }
}

testShopify();
