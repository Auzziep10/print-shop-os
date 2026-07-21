const fs = require('fs');
const readline = require('readline');

const csvPath = 'e:\\Apps\\Team Dashboard\\scratch\\SanMar_SDL_N.csv';

// Major brands we want to include
const targetBrands = [
  "BELLA+CANVAS", "Comfort Colors", "District", "Sport-Tek",
  "Port & Company", "Port & Co", "Port Authority", "Gildan", "Carhartt",
  "Richardson", "Hanes", "Jerzees", "Alternative", "Champion", "Eddie Bauer",
  "Next Level Apparel", "Next Level"
];

// Normalize color helper
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

  // Find brand by searching all columns for any of our target brand names
  let matchedBrand = null;
  for (const tb of targetBrands) {
    // Check all columns to see if any contain the brand name
    const found = cols.some(col => col.toLowerCase().includes(tb.toLowerCase()));
    if (found) {
      matchedBrand = tb;
      break;
    }
  }

  if (!matchedBrand) return;
  if (matchedBrand === "Port & Co") {
    matchedBrand = "Port & Company";
  }

  const title = cols[1]?.trim().replace(/^"|"$/g, '');
  const description = cols[2]?.trim().replace(/^"|"$/g, '');
  
  // Find category - search cols for category keywords
  let categoryRaw = 'T-Shirts';
  const categoryKeywords = ['T-Shirts', 'T-Shirt', 'Fleece', 'Sweatshirts', 'Activewear', 'Polos', 'Caps', 'Headwear', 'Outerwear', 'Bags', 'Accessories'];
  for (const col of cols) {
    const trimmed = col.trim().toLowerCase();
    const matchedKeyword = categoryKeywords.find(kw => trimmed.includes(kw.toLowerCase()));
    if (matchedKeyword) {
      categoryRaw = matchedKeyword;
      break;
    }
  }

  // Price - parse float value
  let price = 6.99;
  const candidatePrices = [cols[13], cols[11], cols[20], cols[21], cols[22]].map(c => parseFloat(c)).filter(num => !isNaN(num) && num > 1.0 && num < 200.0);
  if (candidatePrices.length > 0) {
    price = candidatePrices[0];
  }

  const color = cleanName(cols[14] || '');
  const swatchFile = cols[15]?.trim().replace(/^"|"$/g, '');
  const flatFront = cols[35]?.trim().replace(/^"|"$/g, '');
  const flatBack = cols[36]?.trim().replace(/^"|"$/g, '');

  // Require flat front and flat back to make it designable
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

  // Add color and image URL map if not already present
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
  console.log(`Found ${allStyles.length} total styles with valid flat front/back and swatch images.`);

  // Map categoryRaw to custom clean category names
  const categoryMapping = {
    'T-Shirts': 'T-Shirts',
    'T-Shirt': 'T-Shirts',
    'Fleece': 'Sweatshirts & Hoodies',
    'Sweatshirts': 'Sweatshirts & Hoodies',
    'Sweatshirt': 'Sweatshirts & Hoodies',
    'Activewear': 'T-Shirts',
    'Polos': 'Polos',
    'Polo': 'Polos',
    'Knits': 'Polos',
    'Caps': 'Hats & Caps',
    'Hats': 'Hats & Caps',
    'Headwear': 'Hats & Caps',
    'Outerwear': 'Jackets & Vests',
    'Jackets': 'Jackets & Vests',
    'Vests': 'Jackets & Vests',
    'Bags': 'Bags & Accessories',
    'Accessories': 'Bags & Accessories'
  };

  const categorizedStyles = allStyles.map(p => {
    let cleanCategory = 'T-Shirts';
    for (const [raw, clean] of Object.entries(categoryMapping)) {
      if (p.categoryRaw.toLowerCase().includes(raw.toLowerCase())) {
        cleanCategory = clean;
        break;
      }
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

  // Sort by color count descending so we get the most complete/popular garments first!
  categorizedStyles.sort((a, b) => b.colors.length - a.colors.length);

  // Take ALL styles to make it an incredibly rich store catalog!
  const finalCatalog = categorizedStyles;

  // Group styles count by category
  const catCounts = {};
  finalCatalog.forEach(p => {
    catCounts[p.category] = (catCounts[p.category] || 0) + 1;
  });

  console.log("\nFinal Catalog Category Counts:");
  Object.entries(catCounts).forEach(([cat, count]) => {
    console.log(`  - ${cat}: ${count} styles`);
  });

  // Write to src/data/sanmar-catalog.json
  const catalogPath = 'e:\\Apps\\Team Dashboard\\src\\data\\sanmar-catalog.json';
  fs.writeFileSync(catalogPath, JSON.stringify(finalCatalog, null, 2), 'utf8');
  console.log(`\nSuccessfully updated ${catalogPath} with ${finalCatalog.length} rich styles and swatch images!`);
});
