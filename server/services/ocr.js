const { createWorker } = require('tesseract.js');
const fs = require('fs');

// Common merchant names for quick matching
const KNOWN_MERCHANTS = [
  { name: 'Staples', category: 'Office Supplies' },
  { name: 'Office Depot', category: 'Office Supplies' },
  { name: 'OfficeMax', category: 'Office Supplies' },
  { name: 'Best Buy', category: 'Software & Tech' },
  { name: 'Apple Store', category: 'Software & Tech' },
  { name: 'Amazon', category: 'Office Supplies' },
  { name: 'Home Depot', category: 'Maintenance & Facilities' },
  { name: "Lowe's", category: 'Maintenance & Facilities' },
  { name: 'Starbucks', category: 'Meals & Entertainment' },
  { name: 'Costco Wholesale', category: 'Office Supplies' },
  { name: 'Walmart', category: 'General Expense' },
  { name: 'Target', category: 'General Expense' },
  { name: 'Shell Oil', category: 'Travel & Transport' },
  { name: 'Chevron', category: 'Travel & Transport' },
  { name: 'Uber Technologies', category: 'Travel & Transport' },
  { name: 'Lyft', category: 'Travel & Transport' },
  { name: 'Adobe Inc', category: 'Software & Tech' },
  { name: 'Google Cloud', category: 'Software & Tech' },
  { name: 'Microsoft 365', category: 'Software & Tech' },
  { name: 'GitHub', category: 'Software & Tech' },
  { name: 'AWS Cloud', category: 'Software & Tech' },
  { name: 'FedEx Office', category: 'Office Supplies' },
  { name: 'UPS Store', category: 'Office Supplies' },
  { name: 'Whole Foods Market', category: 'Meals & Entertainment' },
  { name: "Trader Joe's", category: 'Meals & Entertainment' },
  { name: 'Delta Air Lines', category: 'Travel & Transport' },
  { name: 'United Airlines', category: 'Travel & Transport' },
  { name: 'Marriott Hotels', category: 'Travel & Transport' },
  { name: 'Hilton Hotels', category: 'Travel & Transport' },
  { name: 'AT&T Business', category: 'Utilities & Telecom' },
  { name: 'Verizon Wireless', category: 'Utilities & Telecom' }
];

const CATEGORY_KEYWORDS = {
  'Office Supplies': ['paper', 'stationery', 'toner', 'printer', 'stapler', 'folder', 'pen', 'desk', 'ink', 'envelope', 'post-it', 'office'],
  'Meals & Entertainment': ['restaurant', 'cafe', 'coffee', 'espresso', 'lunch', 'dinner', 'breakfast', 'bistro', 'grill', 'bar', 'pizza', 'burger', 'beverage', 'food', 'bakery', 'table'],
  'Travel & Transport': ['gasoline', 'unleaded', 'fuel', 'pump', 'diesel', 'parking', 'toll', 'flight', 'airline', 'taxi', 'ride', 'hotel', 'motel', 'transit', 'car rental'],
  'Software & Tech': ['domain', 'hosting', 'subscription', 'api', 'saas', 'license', 'software', 'cloud', 'server', 'monitor', 'keyboard', 'laptop', 'storage', 'backup'],
  'Utilities & Telecom': ['electric', 'water', 'telecom', 'broadband', 'internet', 'mobile', 'cellular', 'fiber', 'utility', 'energy', 'power'],
  'Maintenance & Facilities': ['repair', 'plumbing', 'locksmith', 'hardware', 'cleaning', 'janitorial', 'drill', 'tools', 'paint', 'filter', 'lumber'],
  'Professional Services': ['consulting', 'legal', 'retainer', 'accounting', 'advisory', 'audit', 'tax prep', 'translation']
};

/**
 * Intelligent receipt metadata extraction from raw text
 */
function parseReceiptText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return {
      title: 'Scanned Receipt',
      merchant: 'Unknown Merchant',
      amount: 0.0,
      tax_amount: 0.0,
      currency: 'USD',
      receipt_date: new Date().toISOString().slice(0, 10),
      category: 'General Expense',
      payment_method: 'Unknown'
    };
  }

  const lines = rawText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  let merchant = 'Unknown Merchant';
  let category = 'General Expense';
  let amount = 0.0;
  let tax_amount = 0.0;
  let currency = 'USD';
  let receipt_date = new Date().toISOString().slice(0, 10);
  let payment_method = 'Card';

  const fullLower = rawText.toLowerCase();

  // 1. Detect Merchant from Known List
  for (const km of KNOWN_MERCHANTS) {
    if (fullLower.includes(km.name.toLowerCase())) {
      merchant = km.name;
      category = km.category;
      break;
    }
  }

  // If not in known list, pick first sensible non-numeric uppercase/title line
  if (merchant === 'Unknown Merchant' && lines.length > 0) {
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      const line = lines[i];
      if (
        line.length >= 3 &&
        !/^[\d\W]+$/.test(line) &&
        !/receipt|invoice|welcome|order|tel:|phone:|fax:|date:|store\s*#/i.test(line)
      ) {
        merchant = line.replace(/[*#]/g, '').trim();
        break;
      }
    }
  }

  // 2. Detect Currency
  if (rawText.includes('€') || /EUR|Euro/i.test(rawText)) {
    currency = 'EUR';
  } else if (rawText.includes('£') || /GBP|Pound/i.test(rawText)) {
    currency = 'GBP';
  } else if (rawText.includes('¥') || /JPY|Yen/i.test(rawText)) {
    currency = 'JPY';
  } else if (rawText.includes('CAD') || /C\$/i.test(rawText)) {
    currency = 'CAD';
  }

  // 3. Detect Total Amount
  // Look for lines containing "Total", "Balance Due", "Grand Total", "Amount Paid", "Total USD"
  let totalCandidates = [];
  const moneyRegex = /([$€£¥])?\s*([0-9]{1,4}[,\.][0-9]{2})\b/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/(?:grand\s+total|total\s+due|balance\s+due|amount\s+paid|total\s+amount|\btotal\b|\bnet\b)/i.test(line)) {
      const matches = [...line.matchAll(moneyRegex)];
      if (matches.length > 0) {
        for (const m of matches) {
          const val = parseFloat(m[2].replace(',', '.'));
          if (!isNaN(val) && val > 0) {
            totalCandidates.push({ val, priority: 10 });
          }
        }
      } else if (i + 1 < lines.length) {
        // sometimes amount is on next line
        const nextMatches = [...lines[i + 1].matchAll(moneyRegex)];
        for (const m of nextMatches) {
          const val = parseFloat(m[2].replace(',', '.'));
          if (!isNaN(val) && val > 0) {
            totalCandidates.push({ val, priority: 8 });
          }
        }
      }
    }
  }

  // Also collect all monetary values found across the text as fallback
  const allMoney = [...rawText.matchAll(moneyRegex)];
  for (const m of allMoney) {
    const val = parseFloat(m[2].replace(',', '.'));
    if (!isNaN(val) && val > 0) {
      totalCandidates.push({ val, priority: 1 });
    }
  }

  if (totalCandidates.length > 0) {
    // Sort by priority first, then by value
    totalCandidates.sort((a, b) => (b.priority - a.priority) || (b.val - a.val));
    amount = totalCandidates[0].val;
  }

  // 4. Detect Tax Amount
  for (const line of lines) {
    if (/\b(?:tax|vat|gst|sales\s*tax)\b/i.test(line) && !/tax\s*id|exempt/i.test(line)) {
      const matches = [...line.matchAll(moneyRegex)];
      if (matches.length > 0) {
        const val = parseFloat(matches[0][2].replace(',', '.'));
        if (!isNaN(val) && val < amount) {
          tax_amount = val;
          break;
        }
      }
    }
  }

  // 5. Detect Date
  // Regex for YYYY-MM-DD, MM/DD/YYYY, DD.MM.YYYY, Month DD, YYYY
  const datePatterns = [
    /\b(20[2-3][0-9])[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12][0-9]|3[01])\b/, // 2026-09-01
    /\b(0[1-9]|1[0-2])[-/.](0[1-9]|[12][0-9]|3[01])[-/.](20[2-3][0-9]|[2-3][0-9])\b/, // 09/01/2026
    /\b(0[1-9]|[12][0-9]|3[01])[-/.](0[1-9]|1[0-2])[-/.](20[2-3][0-9])\b/, // 01.09.2026
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+([0-9]{1,2}),?\s+(20[2-3][0-9])\b/i // Sep 1, 2026
  ];

  for (const pat of datePatterns) {
    const match = rawText.match(pat);
    if (match) {
      try {
        const parsed = new Date(match[0]);
        if (!isNaN(parsed.getTime())) {
          receipt_date = parsed.toISOString().slice(0, 10);
          break;
        }
      } catch (e) {
        // continue
      }
    }
  }

  // 6. Refine Category if still General Expense
  if (category === 'General Expense') {
    for (const [catName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      for (const kw of keywords) {
        if (fullLower.includes(kw)) {
          category = catName;
          break;
        }
      }
      if (category !== 'General Expense') break;
    }
  }

  // 7. Detect Payment Method
  if (/visa/i.test(rawText)) payment_method = 'Visa';
  else if (/mastercard|mc\b/i.test(rawText)) payment_method = 'MasterCard';
  else if (/amex|american\s*express/i.test(rawText)) payment_method = 'Amex';
  else if (/apple\s*pay/i.test(rawText)) payment_method = 'Apple Pay';
  else if (/google\s*pay/i.test(rawText)) payment_method = 'Google Pay';
  else if (/paypal/i.test(rawText)) payment_method = 'PayPal';
  else if (/cash/i.test(rawText)) payment_method = 'Cash';
  else if (/debit/i.test(rawText)) payment_method = 'Debit Card';

  const title = merchant !== 'Unknown Merchant' 
    ? `${merchant} - ${receipt_date}` 
    : `Receipt ${receipt_date}`;

  return {
    title,
    merchant,
    amount: Number(amount.toFixed(2)),
    tax_amount: Number(tax_amount.toFixed(2)),
    currency,
    receipt_date,
    category,
    payment_method,
    ocr_raw_text: rawText
  };
}

let ocrWorker = null;

async function getWorker() {
  if (!ocrWorker) {
    try {
      ocrWorker = await createWorker('eng');
    } catch (e) {
      console.error('Failed to initialize Tesseract worker:', e);
      return null;
    }
  }
  return ocrWorker;
}

/**
 * Perform OCR on image file and extract receipt fields
 */
async function processImageOcr(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const worker = await getWorker();
    if (!worker) {
      console.warn('OCR worker unavailable, using fallback parsing.');
      return parseReceiptText('');
    }

    const { data: { text } } = await worker.recognize(filePath);
    return parseReceiptText(text);
  } catch (error) {
    console.error('OCR Processing error:', error);
    return parseReceiptText('');
  }
}

module.exports = {
  parseReceiptText,
  processImageOcr,
  KNOWN_MERCHANTS,
  CATEGORY_KEYWORDS
};
