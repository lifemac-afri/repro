const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { uploadsDir } = require('../db/database');
const { processImageOcr, parseReceiptText } = require('./ocr');

// Sample templates for simulator fallback
const SAMPLE_TEMPLATES = [
  {
    merchant: 'Staples Office Supplies',
    category: 'Office Supplies',
    address: '1240 Broadway, New York, NY 10001',
    phone: '(212) 555-0199',
    items: [
      { name: 'HP LaserJet Toner Black 58A', price: 89.99 },
      { name: 'Hammermill Copy Paper 5-Ream', price: 34.50 },
      { name: 'Sharpie Permanent Markers 12pk', price: 12.29 }
    ],
    taxRate: 0.08875,
    paymentMethod: 'Visa'
  },
  {
    merchant: 'Best Buy #1042',
    category: 'Software & Tech',
    address: '529 5th Avenue, New York, NY 10017',
    phone: '(212) 555-0144',
    items: [
      { name: 'Logitech MX Master 3S Mouse', price: 99.99 },
      { name: 'USB-C to 4K HDMI Hub 7-in-1', price: 45.00 }
    ],
    taxRate: 0.08875,
    paymentMethod: 'Apple Pay'
  },
  {
    merchant: 'Blue Bottle Coffee',
    category: 'Meals & Entertainment',
    address: '450 W 15th St, New York, NY 10011',
    phone: '(510) 555-0130',
    items: [
      { name: 'Client Meeting - Hayes Valley Espresso', price: 11.50 },
      { name: 'Avocado Toast', price: 14.00 }
    ],
    taxRate: 0.08875,
    paymentMethod: 'Amex'
  },
  {
    merchant: 'Home Depot #4112',
    category: 'Maintenance & Facilities',
    address: '40 W 23rd St, New York, NY 10010',
    phone: '(212) 555-0182',
    items: [
      { name: 'Philips LED Office Bulbs 8pk', price: 29.97 },
      { name: 'HVAC Air Filter MERV 11', price: 42.50 }
    ],
    taxRate: 0.08875,
    paymentMethod: 'Visa'
  },
  {
    merchant: 'Delta Air Lines',
    category: 'Travel & Transport',
    address: 'JFK International Airport Terminal 4',
    phone: '1-800-221-1212',
    items: [
      { name: 'Flight DL482: NYC -> SFO Business Trip', price: 418.60 },
      { name: 'Checked Baggage Fee', price: 35.00 }
    ],
    taxRate: 0.075,
    paymentMethod: 'Corporate Card'
  },
  {
    merchant: 'Shell Oil Express Station',
    category: 'Travel & Transport',
    address: '890 10th Ave, New York, NY 10019',
    phone: '(212) 555-0129',
    items: [
      { name: 'Pump #04 Regular Unleaded 14.2 Gal', price: 54.67 }
    ],
    taxRate: 0.08,
    paymentMethod: 'Debit Card'
  }
];

let cachedScanner = {
  name: 'HP Laser MFP 135w',
  host: '127.0.0.1',
  port: 56200,
  lastChecked: Date.now()
};

/**
 * Discover AirScan / eSCL scanners on macOS via mDNS
 */
function discoverPhysicalScanners() {
  return new Promise((resolve) => {
    try {
      const child = exec('dns-sd -B _uscan._tcp local.');
      let resolved = false;

      const timer = setTimeout(() => {
        try { child.kill(); } catch (e) {}
        if (!resolved) resolve(cachedScanner);
      }, 2000);

      child.stdout.on('data', (data) => {
        const match = data.toString().match(/_uscan\._tcp\.\s+(.+)$/m);
        if (match && !resolved) {
          const rawName = match[1].trim();
          try { child.kill(); } catch (e) {}

          const resChild = exec(`dns-sd -L "${rawName}" _uscan._tcp local.`);
          resChild.stdout.on('data', (resData) => {
            const portMatch = resData.toString().match(/can be reached at ([^:]+):([0-9]+)/);
            if (portMatch && !resolved) {
              resolved = true;
              clearTimeout(timer);
              try { resChild.kill(); } catch (e) {}
              const host = portMatch[1].replace(/\.$/, '') === 'localhost' ? '127.0.0.1' : portMatch[1].replace(/\.$/, '');
              const port = parseInt(portMatch[2]);
              cachedScanner = { name: rawName, host, port, lastChecked: Date.now() };
              resolve(cachedScanner);
            }
          });

          setTimeout(() => {
            try { resChild.kill(); } catch (e) {}
            if (!resolved) resolve(cachedScanner);
          }, 1500);
        }
      });

      child.on('error', () => {
        clearTimeout(timer);
        resolve(cachedScanner);
      });
    } catch (e) {
      resolve(cachedScanner);
    }
  });
}

/**
 * Perform a physical scan from real eSCL / AirScan printer scanner
 */
async function performRealPhysicalScan(scannerInfo, targetFolderId = null) {
  const candidateHosts = Array.from(new Set([
    process.env.SCANNER_HOST,
    process.env.PRINTER_IP,
    'host.docker.internal',
    scannerInfo?.host,
    cachedScanner.host,
    '127.0.0.1'
  ].filter(Boolean)));

  const port = parseInt(process.env.SCANNER_PORT) || scannerInfo?.port || cachedScanner.port || 56200;

  const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:Version>2.63</pwg:Version>
  <pwg:ScanRegions>
    <pwg:ScanRegion>
      <pwg:XOffset>0</pwg:XOffset>
      <pwg:YOffset>0</pwg:YOffset>
      <pwg:Width>2550</pwg:Width>
      <pwg:Height>3507</pwg:Height>
    </pwg:ScanRegion>
  </pwg:ScanRegions>
  <scan:InputSource>Platen</scan:InputSource>
  <scan:ColorMode>RGB24</scan:ColorMode>
  <scan:XResolution>200</scan:XResolution>
  <scan:YResolution>200</scan:YResolution>
  <pwg:DocumentFormat>image/jpeg</pwg:DocumentFormat>
</scan:ScanSettings>`;

  // 1. Create Scan Job by probing candidate hosts (supports Docker, host bridge, & LAN)
  let activeHost = candidateHosts[0];
  let jobLocation = null;
  let lastError = null;

  for (const host of candidateHosts) {
    try {
      jobLocation = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: host,
          port: port,
          path: '/eSCL/ScanJobs',
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml',
            'Content-Length': Buffer.byteLength(xmlPayload)
          },
          timeout: 4000
        }, (res) => {
          if (res.statusCode === 201 && res.headers.location) {
            resolve(res.headers.location);
          } else {
            reject(new Error(`Printer on ${host}:${port} returned HTTP ${res.statusCode}`));
          }
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout connecting to ${host}:${port}`)); });
        req.write(xmlPayload);
        req.end();
      });

      if (jobLocation) {
        activeHost = host;
        console.log(`✓ Connected to scanner on active host: ${activeHost}:${port}`);
        break;
      }
    } catch (err) {
      lastError = err;
    }
  }

  if (!jobLocation) {
    throw new Error(`Could not connect to printer scanner on any host (${candidateHosts.join(', ')}:${port}). ${lastError ? lastError.message : ''}`);
  }

  const host = activeHost;

  // Extract relative job path
  let jobPath = jobLocation;
  if (jobLocation.startsWith('http://') || jobLocation.startsWith('https://')) {
    const url = new URL(jobLocation);
    jobPath = url.pathname;
  }
  const documentPath = `${jobPath.replace(/\/$/, '')}/NextDocument`;

  // 2. Fetch the scanned image with retry polling (handles 503 while motor is moving)
  const id = uuidv4();
  const fileName = `scan_${Date.now()}_${id.slice(0, 8)}.jpg`;
  const filePath = path.join(uploadsDir, fileName);

  const fetchDocument = async (maxRetries = 40) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const success = await new Promise((resolve, reject) => {
          const req = http.get({
            hostname: host,
            port: port,
            path: documentPath,
            timeout: 10000
          }, (res) => {
            if (res.statusCode === 200) {
              const fileStream = fs.createWriteStream(filePath);
              res.pipe(fileStream);
              fileStream.on('finish', () => {
                fileStream.close(() => resolve(true));
              });
              fileStream.on('error', reject);
            } else if (res.statusCode === 503) {
              // Scanner is busy scanning or warming up
              res.resume();
              resolve(false);
            } else {
              res.resume();
              reject(new Error(`Printer returned HTTP ${res.statusCode}`));
            }
          });

          req.on('error', (e) => resolve(false));
          req.on('timeout', () => { req.destroy(); resolve(false); });
        });

        if (success && fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
          return true;
        }
      } catch (err) {
        if (attempt === maxRetries) throw err;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error('Scanner hardware timed out while completing scan');
  };

  await fetchDocument();

  const stats = fs.statSync(filePath);
  const dateStr = new Date().toISOString().slice(0, 10);

  // 3. Run OCR on real physical scan
  const ocrData = await processImageOcr(filePath);

  return {
    id,
    folder_id: targetFolderId,
    title: ocrData.title || `Scanned Receipt - ${dateStr}`,
    merchant: ocrData.merchant || 'Unknown Vendor',
    amount: ocrData.amount || 0.0,
    currency: ocrData.currency || 'USD',
    tax_amount: ocrData.tax_amount || 0.0,
    receipt_date: ocrData.receipt_date || dateStr,
    category: ocrData.category || 'General Expense',
    payment_method: ocrData.payment_method || 'Unknown',
    notes: `Scanned from physical printer (${scannerInfo?.name || 'HP Laser MFP 135w'})`,
    file_path: filePath,
    file_name: fileName,
    file_size: stats.size,
    mime_type: 'image/jpeg',
    ocr_raw_text: ocrData.ocr_raw_text || '',
    status: 'processed'
  };
}

/**
 * Generate SVG receipt for simulator
 */
function generateReceiptSVG(template, dateStr, customId) {
  const subtotal = template.items.reduce((sum, item) => sum + item.price, 0);
  const tax = Number((subtotal * template.taxRate).toFixed(2));
  const total = Number((subtotal + tax).toFixed(2));
  const transId = customId || Math.floor(100000 + Math.random() * 900000);

  const itemRowsSVG = template.items.map((item, idx) => `
    <g transform="translate(0, ${idx * 28})">
      <text x="30" y="0" font-family="'Courier New', monospace" font-size="13" fill="#1e293b">${item.name.length > 28 ? item.name.slice(0, 26) + '..' : item.name}</text>
      <text x="370" y="0" font-family="'Courier New', monospace" font-size="13" text-anchor="end" fill="#1e293b">$${item.price.toFixed(2)}</text>
    </g>
  `).join('');

  const itemsHeight = template.items.length * 28;
  const startY = 220;
  const subtotalY = startY + itemsHeight + 15;
  const taxY = subtotalY + 24;
  const totalY = taxY + 30;
  const footerY = totalY + 45;
  const svgHeight = footerY + 100;

  return {
    svgContent: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 ${svgHeight}" width="400" height="${svgHeight}">
        <rect x="10" y="10" width="380" height="${svgHeight - 20}" rx="4" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
        <g text-anchor="middle">
          <text x="200" y="48" font-family="'Courier New', monospace" font-weight="bold" font-size="16" fill="#0f172a">${template.merchant.toUpperCase()}</text>
          <text x="200" y="70" font-family="'Courier New', monospace" font-size="11" fill="#64748b">${template.address}</text>
          <line x1="30" y1="90" x2="370" y2="90" stroke="#e2e8f0" stroke-dasharray="4 3" />
          <text x="30" y="115" text-anchor="start" font-family="'Courier New', monospace" font-size="12" fill="#475569">DATE: ${dateStr}</text>
          <text x="370" y="115" text-anchor="end" font-family="'Courier New', monospace" font-size="12" fill="#475569">#${transId}</text>
          <line x1="30" y1="135" x2="370" y2="135" stroke="#cbd5e1" />
        </g>
        <g transform="translate(0, 160)">
          ${itemRowsSVG}
        </g>
        <g>
          <line x1="30" y1="${subtotalY - 50}" x2="370" y2="${subtotalY - 50}" stroke="#e2e8f0" stroke-dasharray="4 3" />
          <text x="30" y="${subtotalY - 30}" font-family="'Courier New', monospace" font-size="13" fill="#475569">SUBTOTAL</text>
          <text x="370" y="${subtotalY - 30}" font-family="'Courier New', monospace" font-size="13" text-anchor="end" fill="#475569">$${subtotal.toFixed(2)}</text>
          <text x="30" y="${subtotalY - 10}" font-family="'Courier New', monospace" font-weight="bold" font-size="15" fill="#0f172a">TOTAL</text>
          <text x="370" y="${subtotalY - 10}" font-family="'Courier New', monospace" font-weight="bold" font-size="16" text-anchor="end" fill="#0f172a">$${total.toFixed(2)}</text>
        </g>
      </svg>
    `,
    metadata: {
      merchant: template.merchant,
      amount: total,
      tax_amount: tax,
      category: template.category,
      payment_method: template.paymentMethod,
      receipt_date: dateStr
    }
  };
}

/**
 * Trigger mock scan
 */
async function triggerMockScan(targetFolderId = null, templateIndex = null) {
  const tIndex = templateIndex !== null && templateIndex >= 0 && templateIndex < SAMPLE_TEMPLATES.length
    ? templateIndex
    : Math.floor(Math.random() * SAMPLE_TEMPLATES.length);
  
  const template = SAMPLE_TEMPLATES[tIndex];
  const dateStr = new Date().toISOString().slice(0, 10);
  const id = uuidv4();
  const fileName = `scan_${Date.now()}_${id.slice(0, 8)}.svg`;
  const filePath = path.join(uploadsDir, fileName);

  const { svgContent, metadata } = generateReceiptSVG(template, dateStr, id.slice(0, 6).toUpperCase());
  fs.writeFileSync(filePath, svgContent, 'utf8');
  const stats = fs.statSync(filePath);

  return {
    id,
    folder_id: targetFolderId,
    title: `${template.merchant} - ${dateStr}`,
    merchant: metadata.merchant,
    amount: metadata.amount,
    currency: 'USD',
    tax_amount: metadata.tax_amount,
    receipt_date: dateStr,
    category: metadata.category,
    payment_method: metadata.payment_method,
    notes: `Simulated Scan`,
    file_path: filePath,
    file_name: fileName,
    file_size: stats.size,
    mime_type: 'image/svg+xml',
    ocr_raw_text: `${template.merchant} ${dateStr} TOTAL $${metadata.amount}`,
    status: 'processed'
  };
}

/**
 * Check for connected physical scanners on macOS
 */
async function detectSystemScanners() {
  const discovered = await discoverPhysicalScanners();
  const devices = [];

  if (discovered) {
    devices.push({
      id: 'physical_printer',
      name: discovered.name || 'HP Laser MFP 135w',
      type: 'AirScan / eSCL',
      host: discovered.host,
      port: discovered.port,
      status: 'Ready (Connected)'
    });
  }

  devices.push({
    id: 'mock_scanner',
    name: 'Test Scanner Simulator',
    type: 'simulator',
    status: 'Ready'
  });

  return devices;
}

/**
 * Handle scan trigger (Routes to real printer or simulator)
 */
async function handleScanTrigger({ target_folder_id = null, source = 'auto', template_index = null }) {
  if (source === 'simulator' || source === 'mock_scanner') {
    return triggerMockScan(target_folder_id, template_index);
  }

  // Attempt real physical scan
  try {
    const scannerInfo = await discoverPhysicalScanners();
    if (scannerInfo) {
      console.log(`📡 Triggering real physical scan on ${scannerInfo.name} at http://${scannerInfo.host}:${scannerInfo.port}`);
      return await performRealPhysicalScan(scannerInfo, target_folder_id);
    }
  } catch (err) {
    console.error('Physical scan failed, falling back to simulator:', err.message);
    if (source === 'printer' || source === 'physical_printer') {
      throw new Error(`Printer scan error: ${err.message}. Please check if the printer is turned on and connected.`);
    }
  }

  return triggerMockScan(target_folder_id, template_index);
}

/**
 * Save an uploaded or camera captured file and run OCR extraction
 */
async function processUploadedScan(file, targetFolderId = null) {
  const id = uuidv4();
  const fileExt = path.extname(file.originalname || file.path) || '.jpg';
  const newFileName = `scan_${Date.now()}_${id.slice(0, 8)}${fileExt}`;
  const targetPath = path.join(uploadsDir, newFileName);

  if (file.path && file.path !== targetPath) {
    fs.copyFileSync(file.path, targetPath);
    try { fs.unlinkSync(file.path); } catch (e) {}
  }

  const stats = fs.statSync(targetPath);
  const ocrResult = await processImageOcr(targetPath);

  return {
    id,
    folder_id: targetFolderId,
    title: ocrResult.title,
    merchant: ocrResult.merchant,
    amount: ocrResult.amount,
    currency: ocrResult.currency,
    tax_amount: ocrResult.tax_amount,
    receipt_date: ocrResult.receipt_date,
    category: ocrResult.category,
    payment_method: ocrResult.payment_method,
    notes: 'Uploaded receipt',
    file_path: targetPath,
    file_name: newFileName,
    file_size: stats.size,
    mime_type: file.mimetype || 'image/jpeg',
    ocr_raw_text: ocrResult.ocr_raw_text,
    status: 'processed'
  };
}

module.exports = {
  detectSystemScanners,
  handleScanTrigger,
  triggerMockScan,
  performRealPhysicalScan,
  processUploadedScan,
  SAMPLE_TEMPLATES
};
