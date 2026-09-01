const archiverModule = require('archiver');
const fs = require('fs');
const path = require('path');
const { dbApi } = require('../db/database');

function createZipArchive(options = { zlib: { level: 9 } }) {
  if (typeof archiverModule === 'function') {
    return archiverModule('zip', options);
  }
  if (archiverModule && typeof archiverModule.create === 'function') {
    return archiverModule.create('zip', options);
  }
  if (archiverModule && archiverModule.ZipArchive) {
    try { return new archiverModule.ZipArchive(options); } catch (e) {}
  }
  if (archiverModule && archiverModule.default && typeof archiverModule.default === 'function') {
    return archiverModule.default('zip', options);
  }
  return archiverModule('zip', options);
}

/**
 * Format receipts array into CSV string
 */
function generateCSV(receipts) {
  const headers = [
    'Receipt ID',
    'Title',
    'Merchant',
    'Date',
    'Amount',
    'Currency',
    'Tax Amount',
    'Category',
    'Payment Method',
    'Folder',
    'Status',
    'Notes',
    'File Name'
  ];

  const escapeCSV = (str) => {
    if (str === null || str === undefined) return '""';
    const val = String(str).replace(/"/g, '""');
    return `"${val}"`;
  };

  const rows = receipts.map(r => [
    escapeCSV(r.id),
    escapeCSV(r.title),
    escapeCSV(r.merchant),
    escapeCSV(r.receipt_date),
    r.amount ? r.amount.toFixed(2) : '0.00',
    escapeCSV(r.currency || 'USD'),
    r.tax_amount ? r.tax_amount.toFixed(2) : '0.00',
    escapeCSV(r.category),
    escapeCSV(r.payment_method),
    escapeCSV(r.folder_name || 'Unsorted'),
    escapeCSV(r.status),
    escapeCSV(r.notes),
    escapeCSV(r.file_name)
  ].join(','));

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Export a single folder as a ZIP file stream
 */
function exportFolderZip(folderId, res) {
  const folder = folderId === 'unsorted' || !folderId
    ? { id: 'unsorted', name: 'Unsorted Receipts', month_year: 'Inbox' }
    : dbApi.getFolderById(folderId);

  if (!folder) {
    res.status(404).json({ error: 'Folder not found' });
    return;
  }

  const receipts = dbApi.getAllReceipts({ folder_id: folderId === 'unsorted' ? null : folderId });
  const safeName = (folder.name || 'Folder').replace(/[^a-zA-Z0-9_-]/g, '_');
  const zipFileName = `${safeName}_Receipts_${Date.now()}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

  const archive = createZipArchive({ zlib: { level: 9 } });

  archive.on('error', (err) => {
    console.error('Archiver error:', err);
    if (!res.headersSent) res.status(500).send({ error: err.message });
  });

  archive.pipe(res);

  // 1. Add CSV Manifest
  const csvData = generateCSV(receipts);
  archive.append(csvData, { name: 'manifest.csv' });

  // 2. Add JSON Summary
  const summary = {
    folder: folder.name,
    month_year: folder.month_year,
    exported_at: new Date().toISOString(),
    total_receipts: receipts.length,
    total_amount: receipts.reduce((sum, r) => sum + (r.amount || 0), 0),
    category_summary: receipts.reduce((acc, r) => {
      acc[r.category] = (acc[r.category] || 0) + (r.amount || 0);
      return acc;
    }, {}),
    receipts: receipts.map(r => ({
      id: r.id,
      merchant: r.merchant,
      amount: r.amount,
      date: r.receipt_date,
      category: r.category,
      file: r.file_name
    }))
  };
  archive.append(JSON.stringify(summary, null, 2), { name: 'summary.json' });

  // 3. Add receipt images
  receipts.forEach(r => {
    if (r.file_path && fs.existsSync(r.file_path)) {
      archive.file(r.file_path, { name: `images/${r.file_name}` });
    }
  });

  archive.finalize();
}

/**
 * Export all folders and unfiled receipts as a comprehensive Master ZIP
 */
function exportAllZip(res) {
  const folders = dbApi.getAllFolders();
  const allReceipts = dbApi.getAllReceipts({});
  const zipFileName = `RePro_Master_Export_${new Date().toISOString().slice(0, 10)}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

  const archive = createZipArchive({ zlib: { level: 9 } });

  archive.on('error', (err) => {
    console.error('Master Archiver error:', err);
    if (!res.headersSent) res.status(500).send({ error: err.message });
  });

  archive.pipe(res);

  // Master CSV and Summary at root
  const masterCsv = generateCSV(allReceipts);
  archive.append(masterCsv, { name: 'all_receipts_master.csv' });

  const analytics = dbApi.getAnalytics();
  const globalSummary = {
    exported_at: new Date().toISOString(),
    total_folders: folders.length,
    analytics,
    folders: folders.map(f => ({
      id: f.id,
      name: f.name,
      month_year: f.month_year,
      receipt_count: f.receipt_count,
      total_amount: f.total_amount
    }))
  };
  archive.append(JSON.stringify(globalSummary, null, 2), { name: 'global_summary.json' });

  // Add receipts organized by folder
  folders.forEach(f => {
    const folderReceipts = dbApi.getAllReceipts({ folder_id: f.id });
    const safeFolderName = (f.name || `Folder_${f.id.slice(0, 6)}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    
    // Add folder specific manifest
    const folderCsv = generateCSV(folderReceipts);
    archive.append(folderCsv, { name: `${safeFolderName}/manifest.csv` });

    // Add folder images
    folderReceipts.forEach(r => {
      if (r.file_path && fs.existsSync(r.file_path)) {
        archive.file(r.file_path, { name: `${safeFolderName}/images/${r.file_name}` });
      }
    });
  });

  // Add Unsorted receipts
  const unsortedReceipts = dbApi.getAllReceipts({ folder_id: null });
  if (unsortedReceipts.length > 0) {
    const unsortedCsv = generateCSV(unsortedReceipts);
    archive.append(unsortedCsv, { name: `Unsorted_Inbox/manifest.csv` });
    unsortedReceipts.forEach(r => {
      if (r.file_path && fs.existsSync(r.file_path)) {
        archive.file(r.file_path, { name: `Unsorted_Inbox/images/${r.file_name}` });
      }
    });
  }

  archive.finalize();
}

module.exports = {
  exportFolderZip,
  exportAllZip,
  generateCSV
};
