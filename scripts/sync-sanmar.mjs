import fs from 'fs';
import path from 'path';
import { Client } from 'ssh2';
import csv from 'csv-parser';

// Load env variables from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const firstEq = trimmed.indexOf('=');
    if (firstEq === -1) return;
    const key = trimmed.slice(0, firstEq).trim();
    let val = trimmed.slice(firstEq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    process.env[key] = val;
  });
}

const host = 'ftp.sanmar.com';
const port = 2200;
const username = process.env.SANMAR_FTP_USER;
const password = process.env.SANMAR_FTP_PASS;

if (!username || !password) {
  console.error("Error: SANMAR_FTP_USER and SANMAR_FTP_PASS must be configured in .env.local");
  process.exit(1);
}

const conn = new Client();

const popularBrands = [
  'gildan', 'bella', 'canvas', 'port & company', 'port and company', 'district', 'sport-tek', 
  'sport tek', 'hanes', 'jerzees', 'anvil', 'fruit of the loom', 'champion', 'port authority',
  'new era', 'newera'
];

const popularCategories = ['t-shirt', 'shirt', 'hoodie', 'sweatshirt', 'polo', 'fleece', 'outerwear', 'hat', 'cap', 'headwear', 'tank'];

const localFile = path.resolve(process.cwd(), 'SanMar_EPDD.csv');

if (fs.existsSync(localFile)) {
  console.log(`Found local CSV file at ${localFile}. Skipping SFTP connection and parsing directly...`);
  parseCSV(localFile);
} else {
  console.log('Connecting to SanMar FTP...');
  conn.on('ready', () => {
    console.log('SFTP Connection Successful!');
    conn.sftp((err, sftp) => {
      if (err) {
        console.error('SFTP Error:', err);
        conn.end();
        return;
      }

      const remoteFile = 'SanmarPDD/SanMar_EPDD.csv';

      console.log(`Downloading ${remoteFile} to ${localFile}...`);
      sftp.fastGet(remoteFile, localFile, {}, (downloadErr) => {
        if (downloadErr) {
          console.error('Download failed:', downloadErr);
          conn.end();
          return;
        }

        console.log('Download complete. Processing CSV...');
        conn.end();

        parseCSV(localFile);
      });
    });
  }).on('error', (err) => {
    console.error('FTP Connection Error:', err.message || err);
    console.log('\n--- FTP FALLBACK INSTRUCTIONS ---');
    console.log('SanMar FTP restricts access by IP address. If you get an authentication/connection failure:');
    console.log('1. Use your FTP client (like FileZilla) from a whitelisted network to connect to ftp.sanmar.com (Port 2200, SFTP).');
    console.log('2. Download the file "SanmarPDD/SanMar_EPDD.csv".');
    console.log('3. Place "SanMar_EPDD.csv" directly into the root folder of this project:');
    console.log(`   ${localFile}`);
    console.log('4. Run this script again: "node scripts/sync-sanmar.mjs" and it will automatically detect and parse the local file.');
    console.log('---------------------------------\n');
  }).on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
    if (prompts.length > 0 && prompts[0].prompt.toLowerCase().includes('password')) {
      finish([password]);
    } else {
      finish([]);
    }
  }).connect({
    host,
    port,
    username,
    password,
    tryKeyboard: true
  });
}


function parseCSV(filePath) {
  const productsMap = {};

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (row) => {
      // Find Style
      const style = row['STYLE#'] || row['Style'] || row['style'] || row['StyleName'] || '';
      if (!style) return;

      // Filter by Brand
      const brand = row['BRAND'] || row['Brand'] || row['brand'] || '';
      const brandLower = brand.toLowerCase();
      const isPopularBrand = popularBrands.some(b => brandLower.includes(b));
      if (!isPopularBrand) return;

      // Filter by Category
      const category = row['CATEGORY'] || row['Category'] || row['category'] || '';
      const categoryLower = category.toLowerCase();
      const isPopularCategory = popularCategories.some(c => categoryLower.includes(c));
      if (!isPopularCategory) return;

      if (!productsMap[style]) {
        productsMap[style] = {
          style,
          title: row['PRODUCT_TITLE'] || row['Title'] || row['product_title'] || '',
          brand: brand,
          description: row['PRODUCT_DESCRIPTION'] || row['Description'] || row['product_description'] || '',
          category: category,
          price: parseFloat(row['PIECE_PRICE'] || row['PiecePrice'] || row['piece_price'] || '0') || 0,
          colors: [],
          images: {} // color_name -> image_url
        };
      }

      // Add Color
      const color = row['COLOR_NAME'] || row['Color'] || row['color_name'] || '';
      if (color) {
        if (!productsMap[style].colors.includes(color)) {
          productsMap[style].colors.push(color);
        }

        // Try to find image filename
        const imgFile = row['FRONT_FLAT_PHOTO'] || row['FRONT_MODEL_PHOTO'] || row['PRODUCT_IMAGE'] || row['ProductImage'] || '';
        if (imgFile && !productsMap[style].images[color]) {
          // Prepend SanMar CDN url
          productsMap[style].images[color] = `https://images.sanmar.com/media/styles/prodimg/${imgFile}`;
        }
      }
    })
    .on('end', () => {
      const products = Object.values(productsMap);
      console.log(`Parsed ${products.length} popular styles.`);

      const outDir = path.resolve(process.cwd(), 'src/data');
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      const outFile = path.resolve(outDir, 'sanmar-catalog.json');
      fs.writeFileSync(outFile, JSON.stringify(products, null, 2));
      console.log(`Successfully wrote catalog to ${outFile}`);

      // Optional: Delete temporary CSV file to keep workspace clean
      try {
        // fs.unlinkSync(filePath);
        console.log('Keeping temporary CSV file for inspection.');
      } catch (unlinkErr) {
        console.error('Failed to delete temporary CSV:', unlinkErr);
      }
    });
}
