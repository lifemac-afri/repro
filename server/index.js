const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { dbApi, uploadsDir } = require('./db/database');
const { 
  detectSystemScanners, 
  handleScanTrigger, 
  triggerMockScan, 
  processUploadedScan, 
  probeScannerEndpoint,
  setCustomScannerEndpoint,
  getCustomScannerConfig,
  SAMPLE_TEMPLATES 
} = require('./services/scanner');
const { processImageOcr, parseReceiptText } = require('./services/ocr');
const { exportFolderZip, exportAllZip } = require('./services/exporter');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static uploads serving
app.use('/uploads', express.static(uploadsDir));

// Multer storage for uploads and camera snaps
const storage = multer.diskTransStorage ? multer.diskTransStorage : multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `upload_${Date.now()}_${uuidv4().slice(0, 8)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

// ----------------------------------------------------
// Folder Endpoints
// ----------------------------------------------------
app.get('/api/folders', (req, res) => {
  try {
    const folders = dbApi.getAllFolders();
    res.json(folders);
  } catch (error) {
    console.error('Error getting folders:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/folders', (req, res) => {
  try {
    const { name, month_year, description, color } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const folderId = uuidv4();
    const newFolder = dbApi.createFolder({
      id: folderId,
      name,
      month_year: month_year || null,
      description: description || '',
      color: color || '#4f46e5'
    });

    res.status(201).json(newFolder);
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/folders/:id', (req, res) => {
  try {
    const folder = dbApi.getFolderById(req.params.id);
    if (!folder) return res.status(404).json({ error: 'Folder not found' });
    res.json(folder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/folders/:id', (req, res) => {
  try {
    const updated = dbApi.updateFolder(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Folder not found' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/folders/:id', (req, res) => {
  try {
    const deleteReceipts = req.query.delete_receipts === 'true';
    dbApi.deleteFolder(req.params.id, deleteReceipts);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// Receipt Endpoints
// ----------------------------------------------------
app.get('/api/receipts', (req, res) => {
  try {
    const filters = {
      folder_id: req.query.folder_id,
      search: req.query.search,
      category: req.query.category,
      status: req.query.status
    };
    const receipts = dbApi.getAllReceipts(filters);
    res.json(receipts);
  } catch (error) {
    console.error('Error getting receipts:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/receipts/:id', (req, res) => {
  try {
    const receipt = dbApi.getReceiptById(req.params.id);
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
    res.json(receipt);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/receipts', (req, res) => {
  try {
    const id = uuidv4();
    const created = dbApi.createReceipt({ ...req.body, id });
    res.status(201).json(created);
  } catch (error) {
    console.error('Error creating receipt:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/receipts/:id', (req, res) => {
  try {
    const updated = dbApi.updateReceipt(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Receipt not found' });
    res.json(updated);
  } catch (error) {
    console.error('Error updating receipt:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/receipts/:id', (req, res) => {
  try {
    dbApi.deleteReceipt(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/receipts/batch-move', (req, res) => {
  try {
    const { receipt_ids, target_folder_id } = req.body;
    if (!receipt_ids || !Array.isArray(receipt_ids)) {
      return res.status(400).json({ error: 'receipt_ids array required' });
    }
    const result = dbApi.batchMoveReceipts(receipt_ids, target_folder_id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/receipts/batch-delete', (req, res) => {
  try {
    const { receipt_ids } = req.body;
    if (!receipt_ids || !Array.isArray(receipt_ids)) {
      return res.status(400).json({ error: 'receipt_ids array required' });
    }
    const result = dbApi.batchDeleteReceipts(receipt_ids);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Auto-file all unsorted receipts into Month/Year folders based on detected receipt dates
app.post('/api/receipts/auto-file-by-date', (req, res) => {
  try {
    const unsorted = dbApi.getAllReceipts({ folder_id: null });
    const moved = [];
    
    // Month name dictionary
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const folderCache = {};
    const existingFolders = dbApi.getAllFolders();
    existingFolders.forEach(f => {
      if (f.month_year) folderCache[f.month_year] = f.id;
    });

    for (const receipt of unsorted) {
      let dateObj = new Date();
      if (receipt.receipt_date) {
        const parsed = new Date(receipt.receipt_date);
        if (!isNaN(parsed.getTime())) dateObj = parsed;
      }

      const year = dateObj.getFullYear();
      const monthNum = String(dateObj.getMonth() + 1).padStart(2, '0');
      const monthYearKey = `${year}-${monthNum}`;
      const monthName = monthNames[dateObj.getMonth()];

      let targetFolderId = folderCache[monthYearKey];
      if (!targetFolderId) {
        // Create new folder
        const newFolderId = uuidv4();
        dbApi.createFolder({
          id: newFolderId,
          name: `${monthName} ${year}`,
          month_year: monthYearKey,
          description: `Auto-generated folder for ${monthName} ${year}`,
          color: '#0284c7'
        });
        folderCache[monthYearKey] = newFolderId;
        targetFolderId = newFolderId;
      }

      dbApi.updateReceipt(receipt.id, { folder_id: targetFolderId });
      moved.push({ id: receipt.id, folder_id: targetFolderId, monthYear: monthYearKey });
    }

    res.json({ success: true, count: moved.length, moved });
  } catch (error) {
    console.error('Error auto filing:', error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// Scanner & Ingestion Endpoints
// ----------------------------------------------------
app.get('/api/scanners', async (req, res) => {
  try {
    const scanners = await detectSystemScanners();
    res.json(scanners);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Probe a specific scanner IP/host and port
app.post('/api/scanners/probe', async (req, res) => {
  try {
    const { host, port } = req.body;
    if (!host) return res.status(400).json({ error: 'Host IP/name is required' });
    const result = await probeScannerEndpoint(host.trim(), port ? parseInt(port) : 8080);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Configure target scanner IP
app.post('/api/scanners/set-target', async (req, res) => {
  try {
    const { host, port, name } = req.body;
    setCustomScannerEndpoint({ host, port, name });
    const probeResult = host ? await probeScannerEndpoint(host.trim(), port ? parseInt(port) : 8080) : { reachable: false };
    res.json({ success: true, config: getCustomScannerConfig(), probe: probeResult });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Trigger a scan (Real Printer / Hardware / Mock)
app.post('/api/scan/trigger', async (req, res) => {
  try {
    const { target_folder_id, source, template_index } = req.body;

    const scannedData = await handleScanTrigger({
      target_folder_id: target_folder_id || null,
      source: source || 'auto',
      template_index: template_index !== undefined ? template_index : null
    });

    const existing = (scannedData && scannedData.id) ? dbApi.getReceiptById(scannedData.id) : null;
    const savedReceipt = existing || dbApi.createReceipt(scannedData);
    res.status(201).json(savedReceipt);
  } catch (error) {
    console.error('Scan trigger error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Direct file upload or camera capture ingestion
app.post('/api/scan/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const targetFolderId = req.body.target_folder_id || null;
    const processed = await processUploadedScan(req.file, targetFolderId);
    const savedReceipt = dbApi.createReceipt(processed);

    res.status(201).json(savedReceipt);
  } catch (error) {
    console.error('Upload processing error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reprocess OCR for an existing receipt
app.post('/api/receipts/:id/reprocess-ocr', async (req, res) => {
  try {
    const receipt = dbApi.getReceiptById(req.params.id);
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });

    if (!receipt.file_path || !fs.existsSync(receipt.file_path)) {
      return res.status(400).json({ error: 'Receipt file not found on disk' });
    }

    const ocrData = await processImageOcr(receipt.file_path);
    const updated = dbApi.updateReceipt(receipt.id, {
      title: ocrData.title,
      merchant: ocrData.merchant,
      amount: ocrData.amount,
      currency: ocrData.currency,
      tax_amount: ocrData.tax_amount,
      receipt_date: ocrData.receipt_date,
      category: ocrData.category,
      payment_method: ocrData.payment_method,
      ocr_raw_text: ocrData.ocr_raw_text
    });

    res.json(updated);
  } catch (error) {
    console.error('OCR reprocess error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// Export Endpoints
// ----------------------------------------------------
app.get('/api/export/folder/:id', (req, res) => {
  try {
    exportFolderZip(req.params.id, res);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/export/all', (req, res) => {
  try {
    exportAllZip(res);
  } catch (error) {
    console.error('Master export error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// Analytics Endpoint
// ----------------------------------------------------
app.get('/api/analytics', (req, res) => {
  try {
    const analytics = dbApi.getAnalytics();
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Seed sample folders if DB is brand new
try {
  const existing = dbApi.getAllFolders();
  if (existing.length === 0) {
    const now = new Date();
    const currentMonthNum = String(now.getMonth() + 1).padStart(2, '0');
    const currentYear = now.getFullYear();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    // Seed current month folder
    const currentFolderId = uuidv4();
    dbApi.createFolder({
      id: currentFolderId,
      name: `${monthNames[now.getMonth()]} ${currentYear}`,
      month_year: `${currentYear}-${currentMonthNum}`,
      description: `Office receipts and operational expenses for ${monthNames[now.getMonth()]} ${currentYear}`,
      color: '#6366f1'
    });

    // Seed previous month folder
    const prevMonthIdx = (now.getMonth() - 1 + 12) % 12;
    const prevYear = prevMonthIdx === 11 ? currentYear - 1 : currentYear;
    const prevMonthNum = String(prevMonthIdx + 1).padStart(2, '0');
    
    dbApi.createFolder({
      id: uuidv4(),
      name: `${monthNames[prevMonthIdx]} ${prevYear}`,
      month_year: `${prevYear}-${prevMonthNum}`,
      description: `Office receipts and operational expenses for ${monthNames[prevMonthIdx]} ${prevYear}`,
      color: '#06b6d4'
    });
  }
} catch (e) {
  console.error('Seed folder error:', e);
}

// Healthcheck for Docker / Coolify
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Production Frontend Static File Serving
const distDir = path.join(__dirname, '../dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`⚡ RePro Receipt Management Server running at http://localhost:${PORT}`);
});
