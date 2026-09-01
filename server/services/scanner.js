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

let customScannerConfig = {
  host: process.env.SCANNER_HOST || null,
  port: process.env.SCANNER_PORT ? parseInt(process.env.SCANNER_PORT) : null,
  name: process.env.SCANNER_NAME || null
};

let cachedScanner = null;

/**
 * Actively probe an eSCL endpoint to test if a real scanner responds
 */
function probeScannerEndpoint(host, port = 8080) {
  return new Promise((resolve) => {
    const req = http.get({
      hostname: host,
      port: port,
      path: '/eSCL/ScannerCapabilities',
      timeout: 1800
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode === 200 && (body.includes('ScannerCapabilities') || body.includes('http://schemas.hp.com') || body.includes('http://www.pwg.org'))) {
          const makeModelMatch = body.match(/<pwg:MakeAndModel[^>]*>([^<]+)<\/pwg:MakeAndModel>/i);
          const name = makeModelMatch ? makeModelMatch[1].trim() : `eSCL Scanner (${host}:${port})`;
          resolve({ reachable: true, name, host, port, type: 'escl' });
        } else {
          resolve({ reachable: false, host, port, error: `HTTP ${res.statusCode}` });
        }
      });
    });

    req.on('error', (e) => resolve({ reachable: false, host, port, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ reachable: false, host, port, error: 'Connection timed out' }); });
  });
}

function setCustomScannerEndpoint({ host, port, name }) {
  customScannerConfig.host = host || null;
  customScannerConfig.port = port ? parseInt(port) : 8080;
  if (name) customScannerConfig.name = name;
  cachedScanner = null;
}

function getCustomScannerConfig() {
  return customScannerConfig;
}

/**
 * Discover Physical Scanners (Live dynamic probe across candidate hosts and ports)
 */
async function discoverPhysicalScanners() {
  // 1. If user configured a custom scanner IP / host, probe it first
  if (customScannerConfig.host) {
    const customPort = customScannerConfig.port || 8080;
    const probeRes = await probeScannerEndpoint(customScannerConfig.host, customPort);
    if (probeRes.reachable) {
      cachedScanner = { ...probeRes, isOnline: true, status: 'Ready (Connected)' };
      return cachedScanner;
    }
  }

  // 2. If on Windows (win32), check native WIA DeviceManager
  if (process.platform === 'win32') {
    const wiaName = await new Promise((resolve) => {
      const psCheck = `
        $dm = New-Object -ComObject WIA.DeviceManager;
        foreach ($d in $dm.DeviceInfos) {
          if ($d.Type -eq 1) {
            Write-Output $d.Properties.Item('Name').Value;
            break;
          }
        }
      `;
      exec(`powershell -NoProfile -Command "${psCheck.replace(/\n/g, ' ')}"`, { timeout: 3000 }, (err, stdout) => {
        resolve(stdout ? stdout.trim() : null);
      });
    });

    if (wiaName) {
      cachedScanner = {
        name: wiaName,
        type: 'wia',
        host: 'localhost',
        port: 0,
        isOnline: true,
        status: 'Ready (Windows WIA)'
      };
      return cachedScanner;
    }
  }

  // 3. Dynamic candidate probes (eSCL across common ports)
  const candidateTargets = [
    { host: 'host.docker.internal', port: 56200 },
    { host: 'host.docker.internal', port: 8080 },
    { host: 'host.docker.internal', port: 80 },
    { host: '127.0.0.1', port: 56200 },
    { host: '127.0.0.1', port: 8080 },
    { host: '127.0.0.1', port: 80 },
    { host: 'localhost', port: 56200 },
    { host: 'localhost', port: 8080 }
  ];

  // Try macOS dns-sd discovery if available
  if (process.platform === 'darwin') {
    const mdnsResult = await new Promise((resolve) => {
      try {
        const child = exec('dns-sd -B _uscan._tcp local.');
        let resolved = false;

        const timer = setTimeout(() => {
          try { child.kill(); } catch (e) {}
          if (!resolved) resolve(null);
        }, 1500);

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
                resolve({ name: rawName, type: 'escl', host, port });
              }
            });

            setTimeout(() => {
              try { resChild.kill(); } catch (e) {}
              if (!resolved) resolve(null);
            }, 1000);
          }
        });

        child.on('error', () => {
          clearTimeout(timer);
          resolve(null);
        });
      } catch (e) {
        resolve(null);
      }
    });

    if (mdnsResult) {
      candidateTargets.unshift(mdnsResult);
    }
  }

  // Probe all candidates in parallel with quick timeout
  const probePromises = candidateTargets.map(t => probeScannerEndpoint(t.host, t.port));
  const probeResults = await Promise.all(probePromises);

  const activeResult = probeResults.find(r => r.reachable);
  if (activeResult) {
    cachedScanner = {
      name: activeResult.name,
      type: 'escl',
      host: activeResult.host,
      port: activeResult.port,
      isOnline: true,
      status: 'Ready (Connected)'
    };
    return cachedScanner;
  }

  // No physical scanner reachable
  cachedScanner = {
    name: 'Physical Printer (HP Laser MFP 135w)',
    type: 'escl',
    host: customScannerConfig.host || 'host.docker.internal',
    port: customScannerConfig.port || 8080,
    isOnline: false,
    status: 'Offline / Disconnected',
    note: 'Printer is not reachable on host/network. Check power, Wi-Fi IP, or USB connection.'
  };

  return null;
}

/**
 * Perform a physical scan on Windows via native Windows Image Acquisition (WIA)
 */
function performWindowsWiaScan(outputPath) {
  return new Promise((resolve, reject) => {
    const psScript = `
$ErrorActionPreference = 'Stop'
try {
  $dm = New-Object -ComObject WIA.DeviceManager
  $scanner = $null
  foreach ($d in $dm.DeviceInfos) {
    if ($d.Type -eq 1) {
      $scanner = $d
      break
    }
  }
  if (-not $scanner) {
    Write-Error "No WIA scanner device found"
    exit 1
  }
  $device = $scanner.Connect()
  $item = $device.Items.Item(1)
  $dialog = New-Object -ComObject WIA.CommonDialog
  $image = $dialog.ShowTransfer($item, "{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}", $false)
  if ($image) {
    $out = "${outputPath.replace(/\\/g, '\\\\')}"
    if (Test-Path $out) { Remove-Item $out -Force }
    $image.SaveFile($out)
    Write-Output "SUCCESS"
  } else {
    Write-Error "Scan transfer was cancelled or produced no image"
    exit 1
  }
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
`;
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/\n/g, ' ')}"`, { timeout: 45000 }, (err, stdout, stderr) => {
      if (err || !fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        reject(new Error(stderr || err?.message || 'Windows WIA scan failed'));
      } else {
        resolve(outputPath);
      }
    });
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
 * Check for connected physical scanners with live active status
 */
async function detectSystemScanners() {
  const discovered = await discoverPhysicalScanners();
  const devices = [];

  if (discovered && discovered.isOnline) {
    devices.push({
      id: 'physical_printer',
      name: discovered.name,
      type: discovered.type === 'wia' ? 'Windows WIA' : 'AirScan / eSCL',
      host: discovered.host,
      port: discovered.port,
      is_online: true,
      status: 'Ready (Connected)'
    });
  } else {
    devices.push({
      id: 'physical_printer',
      name: customScannerConfig.name || 'Physical Printer / Scanner',
      type: 'AirScan / eSCL',
      host: customScannerConfig.host || 'host.docker.internal',
      port: customScannerConfig.port || 8080,
      is_online: false,
      status: 'Offline / Not Connected',
      note: 'No printer answered the active network probe.'
    });
  }

  devices.push({
    id: 'mock_scanner',
    name: 'Test Scanner Simulator',
    type: 'simulator',
    is_online: true,
    status: 'Ready'
  });

  return devices;
}

module.exports = {
  detectSystemScanners,
  discoverPhysicalScanners,
  probeScannerEndpoint,
  setCustomScannerEndpoint,
  getCustomScannerConfig,
  handleScanTrigger,
  triggerMockScan,
  performRealPhysicalScan,
  processUploadedScan,
  SAMPLE_TEMPLATES
};

/**
 * Handle scan trigger (Routes to real printer on Windows/macOS or simulator)
 */
async function handleScanTrigger({ target_folder_id = null, source = 'auto', template_index = null }) {
  if (source === 'simulator' || source === 'mock_scanner') {
    return triggerMockScan(target_folder_id, template_index);
  }

  // 1. If on Windows, try native Windows Image Acquisition (WIA) first
  if (process.platform === 'win32') {
    try {
      const id = uuidv4();
      const fileName = `scan_${Date.now()}_${id.slice(0, 8)}.jpg`;
      const filePath = path.join(uploadsDir, fileName);

      console.log('📡 Triggering Windows WIA hardware scan...');
      await performWindowsWiaScan(filePath);

      const stats = fs.statSync(filePath);
      const ocrResult = await processImageOcr(filePath);
      const metadata = parseReceiptText(ocrResult.text || '');

      const receipt = {
        id,
        folder_id: target_folder_id || null,
        title: metadata.merchant && metadata.merchant !== 'Unknown Merchant' ? `${metadata.merchant} - ${metadata.date}` : 'Scanned Receipt',
        merchant: metadata.merchant || 'Scanned Document',
        amount: metadata.amount || 0.0,
        currency: 'USD',
        tax_amount: metadata.tax_amount || 0.0,
        receipt_date: metadata.date || new Date().toISOString().slice(0, 10),
        category: metadata.category || 'General Expense',
        payment_method: metadata.payment_method || 'Unknown',
        notes: `Scanned from Windows WIA Printer Scanner`,
        file_path: filePath,
        file_name: fileName,
        file_size: stats.size,
        mime_type: 'image/jpeg',
        ocr_raw_text: ocrResult.text || '',
        status: 'processed'
      };

      return receipt;
    } catch (wiaErr) {
      console.warn('Windows WIA scan attempted, falling back to eSCL / AirScan candidate:', wiaErr.message);
    }
  }

  // 2. Attempt real physical scan via eSCL / AirScan protocol
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
