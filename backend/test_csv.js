import fs from 'fs';
import { parseCSV } from './src/services/importService.js';

// Read the actual CSV file instead of using hardcoded rows
const csvPath = '../expenses_export.csv';
let csvContent;
try {
  csvContent = fs.readFileSync(csvPath, 'utf8');
} catch (err) {
  console.error(`Failed to read ${csvPath}:`, err.message);
  process.exit(1);
}

console.log('--- READ CSV CONTENT (FIRST 200 CHARS) ---');
console.log(csvContent.substring(0, 200) + '...');
console.log('\n--- PARSING CSV ---');

const parsed = parseCSV(csvContent);

console.log('\n--- PARSED EXPENSES ---');
console.log(`Found ${parsed.length} expenses.`);
console.dir(parsed.slice(0, 3), { depth: null }); // Show first 3 expenses
if (parsed.length > 3) console.log(`... and ${parsed.length - 3} more expenses.`);
