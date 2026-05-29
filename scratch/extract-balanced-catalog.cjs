const fs = require('fs');
const readline = require('readline');

const csvPath = 'e:\\Apps\\Team Dashboard\\scratch\\SanMar_SDL_N.csv';

const targetBrands = [
  "BELLA+CANVAS", "Comfort Colors", "District", "Sport-Tek",
  "Port & Company", "Port Authority", "Gildan", "Carhartt",
  "Richardson", "Hanes", "Jerzees", "Alternative", "Champion", "Eddie Bauer",
  "Next Level Apparel"
];

function cleanName(val) {
  return val.trim().replace(/^"|"$/g, '');
}

const rl = readline.createInterface({
  input: fs.createReadStream(csvPath),
  crlfDelay: Infinity
});

const products = {};

rl.on('line', (line) => {
  const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
  if (cols.length < 37) return;

  const style = cols[3]?.trim();
  if (!style) return;

  let matchedBrand = null;
  for (const tb of targetBrands) {
    const found = cols.some(col => col.toLowerCase().includes(tb.toLowerCase()));
    if (found) {
      matchedBrand = tb;
      break;
    }
  }

  if (!matchedBrand) return;

  const title = cols[1]?.trim().replace(/^"|"$/g, '');
  const description = cols[2]?.trim().replace(/^"|"$/g, '');
  
  // Find raw category
  let categoryRaw = cols[12]?.trim() || cols[11]?.trim() || 'T-Shirts';
  
  // Price
  let price = 6.99;
  const candidatePrices = [cols[13], cols[11], cols[20], cols[21], cols[22]].map(c => parseFloat(c)).filter(num => !isNaN(num) && num > 1.0 && num < 200.0);
  if (candidatePrices.length > 0) {
    price = candidatePrices[0];
  }

  const color = cleanName(cols[14] || '');
  const swatchFile = cols[15]?.trim().replace(/^"|"$/g, '');
  const flatFront = cols[35]?.trim().replace(/^"|"$/g, '');
  const flatBack = cols[36]?.trim().replace(/^"|"$/g, '');

  if (!flatFront || !flatFront.startsWith('https://')) return;
  if (!flatBack || !flatBack.startsWith('https://')) return;
  if (!swatchFile) return;

  if (!products[style]) {
    products[style] = {
      style,
      title,
      brand: matchedBrand,
      description,
      categoryRaw,
      price,
      colors: [],
      images: {}
    };
  }

  if (color && !products[style].images[color]) {
    products[style].colors.push(color);
    products[style].images[color] = {
      front: flatFront,
      back: flatBack,
      swatch: `https://cdnm.sanmar.com/swatches/${swatchFile}`
    };
  }
});

rl.on('close', () => {
  const allStyles = Object.values(products);
  console.log(`Found ${allStyles.length} total styles with valid images.`);

  // Map categoryRaw to clean category
  const categoryMapping = {
    't-shirt': 'T-Shirts',
    't-shirts': 'T-Shirts',
    'activewear': 'T-Shirts',
    'knits': 'T-Shirts',
    'fleece': 'Sweatshirts & Hoodies',
    'sweatshirt': 'Sweatshirts & Hoodies',
    'sweatshirts': 'Sweatshirts & Hoodies',
    'polos': 'Polos',
    'polo': 'Polos',
    'caps': 'Hats & Caps',
    'hats': 'Hats & Caps',
    'headwear': 'Hats & Caps',
    'outerwear': 'Jackets & Vests',
    'jackets': 'Jackets & Vests',
    'vests': 'Jackets & Vests',
    'bags': 'Bags & Accessories',
    'accessories': 'Bags & Accessories'
  };

  const categorizedStyles = allStyles.map(p => {
    let cleanCategory = 'T-Shirts';
    const rawLower = p.categoryRaw.toLowerCase();
    
    // We check matches in cols or rawCategory
    for (const [raw, clean] of Object.entries(categoryMapping)) {
      if (rawLower.includes(raw)) {
        cleanCategory = clean;
        break;
      }
    }
    
    // Safety check: if title has "polo" or "sport-shirt", it's a polo!
    const titleLower = p.title.toLowerCase();
    if (titleLower.includes('polo') || titleLower.includes('sport shirt')) {
      cleanCategory = 'Polos';
    } else if (titleLower.includes('hood') || titleLower.includes('sweatshirt') || titleLower.includes('fleece') || titleLower.includes('pullover')) {
      cleanCategory = 'Sweatshirts & Hoodies';
    } else if (titleLower.includes('jacket') || titleLower.includes('vest') || titleLower.includes('windbreaker')) {
      cleanCategory = 'Jackets & Vests';
    } else if (titleLower.includes('bag') || titleLower.includes('backpack') || titleLower.includes('tote')) {
      cleanCategory = 'Bags & Accessories';
    } else if (titleLower.includes('cap') || titleLower.includes('hat') || titleLower.includes('visor') || titleLower.includes('beanie')) {
      cleanCategory = 'Hats & Caps';
    }
    
    return {
      style: p.style,
      title: p.title,
      brand: p.brand,
      description: p.description,
      category: cleanCategory,
      price: p.price,
      colors: p.colors,
      images: p.images
    };
  });

  // Group by category
  const groups = {};
  categorizedStyles.forEach(p => {
    if (!groups[p.category]) groups[p.category] = [];
    groups[p.category].push(p);
  });

  console.log("\nSource Category counts before balancing:");
  Object.entries(groups).forEach(([cat, list]) => {
    console.log(`  - ${cat}: ${list.length} styles`);
  });

  // Take top N from each category based on color count (popularity indicator)
  const categoryLimits = {
    'T-Shirts': 50,
    'Sweatshirts & Hoodies': 40,
    'Polos': 30,
    'Hats & Caps': 25,
    'Jackets & Vests': 25,
    'Bags & Accessories': 15
  };

  const finalCatalog = [];
  Object.entries(groups).forEach(([cat, list]) => {
    // Sort by color count desc
    list.sort((a, b) => b.colors.length - a.colors.length);
    const limit = categoryLimits[cat] || 20;
    const selected = list.slice(0, limit);
    finalCatalog.push(...selected);
  });

  // Print final balanced counts
  const finalCounts = {};
  finalCatalog.forEach(p => {
    finalCounts[p.category] = (finalCounts[p.category] || 0) + 1;
  });

  console.log("\nFinal Balanced Category Counts:");
  Object.entries(finalCounts).forEach(([cat, count]) => {
    console.log(`  - ${cat}: ${count} styles`);
  });

  // Write to src/data/sanmar-catalog.json
  const catalogPath = 'e:\\Apps\\Team Dashboard\\src\\data\\sanmar-catalog.json';
  fs.writeFileSync(catalogPath, JSON.stringify(finalCatalog, null, 2), 'utf8');
  console.log(`\nSuccessfully updated ${catalogPath} with ${finalCatalog.length} balanced styles!`);
});
