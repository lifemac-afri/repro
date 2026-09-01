const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const uploadsDir = path.join(dataDir, 'receipts');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'repro.db');
const db = new Database(dbPath);

// Enable WAL mode for high concurrency and foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    month_year TEXT,
    description TEXT,
    color TEXT DEFAULT '#4f46e5',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY,
    folder_id TEXT,
    title TEXT NOT NULL,
    merchant TEXT,
    amount REAL DEFAULT 0.0,
    currency TEXT DEFAULT 'USD',
    tax_amount REAL DEFAULT 0.0,
    receipt_date TEXT,
    category TEXT DEFAULT 'General Expense',
    payment_method TEXT DEFAULT 'Unknown',
    notes TEXT,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    mime_type TEXT DEFAULT 'image/jpeg',
    ocr_raw_text TEXT,
    status TEXT DEFAULT 'processed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS receipt_tags (
    receipt_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (receipt_id, tag_id),
    FOREIGN KEY(receipt_id) REFERENCES receipts(id) ON DELETE CASCADE,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_receipts_folder ON receipts(folder_id);
  CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(receipt_date);
  CREATE INDEX IF NOT EXISTS idx_folders_month_year ON folders(month_year);
`);

// Helper DB API methods
const dbApi = {
  // Folders
  getAllFolders: () => {
    const stmt = db.prepare(`
      SELECT 
        f.*,
        COUNT(r.id) as receipt_count,
        COALESCE(SUM(r.amount), 0) as total_amount,
        MAX(r.created_at) as last_receipt_date
      FROM folders f
      LEFT JOIN receipts r ON f.id = r.folder_id
      GROUP BY f.id
      ORDER BY f.created_at DESC
    `);
    return stmt.all();
  },

  getFolderById: (id) => {
    const stmt = db.prepare(`
      SELECT 
        f.*,
        COUNT(r.id) as receipt_count,
        COALESCE(SUM(r.amount), 0) as total_amount
      FROM folders f
      LEFT JOIN receipts r ON f.id = r.folder_id
      WHERE f.id = ?
      GROUP BY f.id
    `);
    return stmt.get(id);
  },

  getFolderByMonthYear: (monthYear) => {
    const stmt = db.prepare(`SELECT * FROM folders WHERE month_year = ?`);
    return stmt.get(monthYear);
  },

  createFolder: (folder) => {
    const stmt = db.prepare(`
      INSERT INTO folders (id, name, month_year, description, color, created_at, updated_at)
      VALUES (@id, @name, @month_year, @description, @color, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    stmt.run(folder);
    return dbApi.getFolderById(folder.id);
  },

  updateFolder: (id, data) => {
    const fields = [];
    const params = { id };

    if (data.name !== undefined) { fields.push('name = @name'); params.name = data.name; }
    if (data.month_year !== undefined) { fields.push('month_year = @month_year'); params.month_year = data.month_year; }
    if (data.description !== undefined) { fields.push('description = @description'); params.description = data.description; }
    if (data.color !== undefined) { fields.push('color = @color'); params.color = data.color; }

    fields.push('updated_at = CURRENT_TIMESTAMP');

    const stmt = db.prepare(`UPDATE folders SET ${fields.join(', ')} WHERE id = @id`);
    stmt.run(params);
    return dbApi.getFolderById(id);
  },

  deleteFolder: (id, deleteReceipts = false) => {
    if (deleteReceipts) {
      const getReceipts = db.prepare('SELECT file_path FROM receipts WHERE folder_id = ?');
      const files = getReceipts.all(id);
      files.forEach(f => {
        try {
          if (fs.existsSync(f.file_path)) fs.unlinkSync(f.file_path);
        } catch (e) {
          console.error('Failed to unlink file:', e);
        }
      });
      db.prepare('DELETE FROM receipts WHERE folder_id = ?').run(id);
    }
    const stmt = db.prepare(`DELETE FROM folders WHERE id = ?`);
    return stmt.run(id);
  },

  // Receipts
  getAllReceipts: (filters = {}) => {
    let query = `
      SELECT r.*, f.name as folder_name, f.color as folder_color
      FROM receipts r
      LEFT JOIN folders f ON r.folder_id = f.id
      WHERE 1=1
    `;
    const params = {};

    if (filters.folder_id !== undefined) {
      if (filters.folder_id === null || filters.folder_id === 'null' || filters.folder_id === 'unsorted') {
        query += ` AND r.folder_id IS NULL`;
      } else {
        query += ` AND r.folder_id = @folder_id`;
        params.folder_id = filters.folder_id;
      }
    }

    if (filters.search) {
      query += ` AND (r.title LIKE @search OR r.merchant LIKE @search OR r.ocr_raw_text LIKE @search OR r.category LIKE @search)`;
      params.search = `%${filters.search}%`;
    }

    if (filters.category) {
      query += ` AND r.category = @category`;
      params.category = filters.category;
    }

    if (filters.status) {
      query += ` AND r.status = @status`;
      params.status = filters.status;
    }

    query += ` ORDER BY r.created_at DESC`;
    const stmt = db.prepare(query);
    return stmt.all(params);
  },

  getReceiptById: (id) => {
    const stmt = db.prepare(`
      SELECT r.*, f.name as folder_name, f.color as folder_color
      FROM receipts r
      LEFT JOIN folders f ON r.folder_id = f.id
      WHERE r.id = ?
    `);
    return stmt.get(id);
  },

  createReceipt: (receipt) => {
    const stmt = db.prepare(`
      INSERT INTO receipts (
        id, folder_id, title, merchant, amount, currency, tax_amount,
        receipt_date, category, payment_method, notes, file_path,
        file_name, file_size, mime_type, ocr_raw_text, status,
        created_at, updated_at
      ) VALUES (
        @id, @folder_id, @title, @merchant, @amount, @currency, @tax_amount,
        @receipt_date, @category, @payment_method, @notes, @file_path,
        @file_name, @file_size, @mime_type, @ocr_raw_text, @status,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);
    stmt.run({
      id: receipt.id,
      folder_id: receipt.folder_id || null,
      title: receipt.title || 'Scanned Receipt',
      merchant: receipt.merchant || 'Unknown Merchant',
      amount: Number(receipt.amount) || 0.0,
      currency: receipt.currency || 'USD',
      tax_amount: Number(receipt.tax_amount) || 0.0,
      receipt_date: receipt.receipt_date || new Date().toISOString().slice(0, 10),
      category: receipt.category || 'General Expense',
      payment_method: receipt.payment_method || 'Unknown',
      notes: receipt.notes || '',
      file_path: receipt.file_path,
      file_name: receipt.file_name,
      file_size: receipt.file_size || 0,
      mime_type: receipt.mime_type || 'image/jpeg',
      ocr_raw_text: receipt.ocr_raw_text || '',
      status: receipt.status || 'processed'
    });
    return dbApi.getReceiptById(receipt.id);
  },

  updateReceipt: (id, data) => {
    const fields = [];
    const params = { id };

    const directFields = [
      'folder_id', 'title', 'merchant', 'amount', 'currency', 'tax_amount',
      'receipt_date', 'category', 'payment_method', 'notes', 'status', 'ocr_raw_text'
    ];

    directFields.forEach(f => {
      if (data[f] !== undefined) {
        fields.push(`${f} = @${f}`);
        params[f] = data[f];
      }
    });

    if (fields.length === 0) return dbApi.getReceiptById(id);

    fields.push('updated_at = CURRENT_TIMESTAMP');
    const stmt = db.prepare(`UPDATE receipts SET ${fields.join(', ')} WHERE id = @id`);
    stmt.run(params);
    return dbApi.getReceiptById(id);
  },

  batchMoveReceipts: (receiptIds, targetFolderId) => {
    const validFolderId = targetFolderId === 'null' || !targetFolderId ? null : targetFolderId;
    const stmt = db.prepare(`
      UPDATE receipts 
      SET folder_id = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);

    const moveTransaction = db.transaction((ids, fId) => {
      for (const id of ids) {
        stmt.run(fId, id);
      }
    });

    moveTransaction(receiptIds, validFolderId);
    return { success: true, count: receiptIds.length };
  },

  batchDeleteReceipts: (receiptIds) => {
    const getFilesStmt = db.prepare(`SELECT file_path FROM receipts WHERE id = ?`);
    const deleteStmt = db.prepare(`DELETE FROM receipts WHERE id = ?`);

    const deleteTransaction = db.transaction((ids) => {
      for (const id of ids) {
        const item = getFilesStmt.get(id);
        if (item && item.file_path) {
          try {
            if (fs.existsSync(item.file_path)) fs.unlinkSync(item.file_path);
          } catch (e) {
            console.error('Error unlinking receipt file:', e);
          }
        }
        deleteStmt.run(id);
      }
    });

    deleteTransaction(receiptIds);
    return { success: true, count: receiptIds.length };
  },

  deleteReceipt: (id) => {
    const item = dbApi.getReceiptById(id);
    if (item && item.file_path) {
      try {
        if (fs.existsSync(item.file_path)) fs.unlinkSync(item.file_path);
      } catch (e) {
        console.error('Error removing file:', e);
      }
    }
    const stmt = db.prepare(`DELETE FROM receipts WHERE id = ?`);
    return stmt.run(id);
  },

  // Global Analytics Summary
  getAnalytics: () => {
    const totalReceipts = db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM receipts`).get();
    const unfiledCount = db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM receipts WHERE folder_id IS NULL`).get();
    
    const categoryBreakdown = db.prepare(`
      SELECT category, COUNT(*) as count, COALESCE(SUM(amount), 0) as total
      FROM receipts
      GROUP BY category
      ORDER BY total DESC
    `).all();

    const monthlyBreakdown = db.prepare(`
      SELECT 
        strftime('%Y-%m', receipt_date) as month,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total
      FROM receipts
      WHERE receipt_date IS NOT NULL AND receipt_date != ''
      GROUP BY month
      ORDER BY month DESC
      LIMIT 12
    `).all();

    const topMerchants = db.prepare(`
      SELECT merchant, COUNT(*) as count, COALESCE(SUM(amount), 0) as total
      FROM receipts
      WHERE merchant IS NOT NULL AND merchant != 'Unknown Merchant'
      GROUP BY merchant
      ORDER BY total DESC
      LIMIT 8
    `).all();

    return {
      totalReceipts: totalReceipts.count,
      totalSpent: totalReceipts.total,
      unfiledCount: unfiledCount.count,
      unfiledAmount: unfiledCount.total,
      categoryBreakdown,
      monthlyBreakdown,
      topMerchants
    };
  }
};

module.exports = { db, dbApi, uploadsDir, dataDir };
