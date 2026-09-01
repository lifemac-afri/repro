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

let dbDriver = null; // 'better-sqlite3' or 'sql.js'
let rawDb = null;
let sqlJsInstance = null;

// Initialize Database Engine
function initDatabase() {
  // 1. Try better-sqlite3 first
  try {
    const BetterSqlite3 = require('better-sqlite3');
    rawDb = new BetterSqlite3(dbPath);
    rawDb.pragma('journal_mode = WAL');
    rawDb.pragma('foreign_keys = ON');
    dbDriver = 'better-sqlite3';
  } catch (err) {
    // 2. Fallback to WebAssembly SQLite (sql.js) - zero node-gyp / zero C++ compiler needed
    const initSqlJs = require('sql.js');
    // Note: initSqlJs returns a Promise or factory
    const sqlJsModule = initSqlJs();
    if (sqlJsModule && typeof sqlJsModule.then === 'function') {
      // Handled synchronously below or via deasync/sync buffer
      throw new Error('Async sql.js initialization required');
    }
  }
}

// Universal Synchronous SQL Wrapper using either better-sqlite3 or sql.js
let db = null;

try {
  const BetterSqlite3 = require('better-sqlite3');
  db = new BetterSqlite3(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  dbDriver = 'better-sqlite3';
  console.log('📦 Using native SQLite engine (better-sqlite3)');
} catch (e) {
  console.warn('⚠️ Native better-sqlite3 unavailable (no node-gyp/build tools). Initializing pure WebAssembly SQLite engine (sql.js)...');
  dbDriver = 'sql.js';
}

// Schema definition
const SCHEMA_SQL = `
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
`;

// In-Memory / File SQLite fallback engine for sql.js if better-sqlite3 is absent
let wasmDb = null;
let saveWasmDbTimeout = null;

function saveWasmDb() {
  if (!wasmDb) return;
  try {
    const data = wasmDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (err) {
    console.error('Error saving WebAssembly SQLite to disk:', err);
  }
}

if (dbDriver === 'sql.js') {
  const initSqlJs = require('sql.js');
  // Initialize synchronously if possible or load WebAssembly
  const SQL = require('sql.js/dist/sql-wasm.js');
  // For node environment with sql.js:
  initSqlJs().then(SQL => {
    sqlJsInstance = SQL;
    const filebuffer = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : null;
    wasmDb = new SQL.Database(filebuffer);
    wasmDb.run(SCHEMA_SQL);
    saveWasmDb();
    console.log('✓ Pure WebAssembly SQLite engine (sql.js) ready - zero compilation required!');
  }).catch(err => {
    console.error('Failed to init sql.js:', err);
  });
} else if (db) {
  db.exec(SCHEMA_SQL);
}

// Helper to normalize rows from sql.js exec
function formatSqlJsResults(res) {
  if (!res || res.length === 0) return [];
  const { columns, values } = res[0];
  return values.map(row => {
    const obj = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj;
  });
}

// Universal database API
const dbApi = {
  // Folders
  getAllFolders: () => {
    const query = `
      SELECT 
        f.*,
        COUNT(r.id) as receipt_count,
        COALESCE(SUM(r.amount), 0) as total_amount,
        MAX(r.created_at) as last_receipt_date
      FROM folders f
      LEFT JOIN receipts r ON f.id = r.folder_id
      GROUP BY f.id
      ORDER BY f.created_at DESC
    `;
    if (dbDriver === 'better-sqlite3' && db) {
      return db.prepare(query).all();
    } else if (wasmDb) {
      return formatSqlJsResults(wasmDb.exec(query));
    }
    return [];
  },

  getFolderById: (id) => {
    const query = `
      SELECT 
        f.*,
        COUNT(r.id) as receipt_count,
        COALESCE(SUM(r.amount), 0) as total_amount
      FROM folders f
      LEFT JOIN receipts r ON f.id = r.folder_id
      WHERE f.id = ?
      GROUP BY f.id
    `;
    if (dbDriver === 'better-sqlite3' && db) {
      return db.prepare(query).get(id);
    } else if (wasmDb) {
      const stmt = wasmDb.prepare(query);
      stmt.bind([id]);
      const res = stmt.step() ? stmt.getAsObject() : null;
      stmt.free();
      return res;
    }
    return null;
  },

  getFolderByMonthYear: (monthYear) => {
    const query = `SELECT * FROM folders WHERE month_year = ?`;
    if (dbDriver === 'better-sqlite3' && db) {
      return db.prepare(query).get(monthYear);
    } else if (wasmDb) {
      const stmt = wasmDb.prepare(query);
      stmt.bind([monthYear]);
      const res = stmt.step() ? stmt.getAsObject() : null;
      stmt.free();
      return res;
    }
    return null;
  },

  createFolder: (folder) => {
    const query = `
      INSERT INTO folders (id, name, month_year, description, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    const params = [
      folder.id,
      folder.name,
      folder.month_year || null,
      folder.description || '',
      folder.color || '#6366f1'
    ];

    if (dbDriver === 'better-sqlite3' && db) {
      db.prepare(query).run(...params);
    } else if (wasmDb) {
      wasmDb.run(query, params);
      saveWasmDb();
    }
    return dbApi.getFolderById(folder.id);
  },

  updateFolder: (id, data) => {
    const fields = [];
    const params = [];

    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.month_year !== undefined) { fields.push('month_year = ?'); params.push(data.month_year); }
    if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }
    if (data.color !== undefined) { fields.push('color = ?'); params.push(data.color); }

    if (fields.length === 0) return dbApi.getFolderById(id);

    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const query = `UPDATE folders SET ${fields.join(', ')} WHERE id = ?`;

    if (dbDriver === 'better-sqlite3' && db) {
      db.prepare(query).run(...params);
    } else if (wasmDb) {
      wasmDb.run(query, params);
      saveWasmDb();
    }
    return dbApi.getFolderById(id);
  },

  deleteFolder: (id, deleteReceipts = false) => {
    if (deleteReceipts) {
      if (dbDriver === 'better-sqlite3' && db) {
        const files = db.prepare('SELECT file_path FROM receipts WHERE folder_id = ?').all(id);
        files.forEach(f => {
          try { if (fs.existsSync(f.file_path)) fs.unlinkSync(f.file_path); } catch (e) {}
        });
        db.prepare('DELETE FROM receipts WHERE folder_id = ?').run(id);
      } else if (wasmDb) {
        const stmt = wasmDb.prepare('SELECT file_path FROM receipts WHERE folder_id = ?');
        stmt.bind([id]);
        while (stmt.step()) {
          const row = stmt.getAsObject();
          try { if (fs.existsSync(row.file_path)) fs.unlinkSync(row.file_path); } catch (e) {}
        }
        stmt.free();
        wasmDb.run('DELETE FROM receipts WHERE folder_id = ?', [id]);
        saveWasmDb();
      }
    } else {
      // Unlink receipts to unsorted / null folder
      if (dbDriver === 'better-sqlite3' && db) {
        db.prepare('UPDATE receipts SET folder_id = NULL WHERE folder_id = ?').run(id);
      } else if (wasmDb) {
        wasmDb.run('UPDATE receipts SET folder_id = NULL WHERE folder_id = ?', [id]);
      }
    }

    if (dbDriver === 'better-sqlite3' && db) {
      db.prepare(`DELETE FROM folders WHERE id = ?`).run(id);
    } else if (wasmDb) {
      wasmDb.run(`DELETE FROM folders WHERE id = ?`, [id]);
      saveWasmDb();
    }
    return { success: true };
  },

  // Receipts
  getAllReceipts: (filters = {}) => {
    let query = `
      SELECT r.*, f.name as folder_name, f.color as folder_color
      FROM receipts r
      LEFT JOIN folders f ON r.folder_id = f.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.folder_id !== undefined) {
      if (filters.folder_id === null || filters.folder_id === 'null' || filters.folder_id === 'unsorted') {
        query += ` AND r.folder_id IS NULL`;
      } else {
        query += ` AND r.folder_id = ?`;
        params.push(filters.folder_id);
      }
    }

    if (filters.search) {
      query += ` AND (r.title LIKE ? OR r.merchant LIKE ? OR r.ocr_raw_text LIKE ? OR r.category LIKE ?)`;
      const searchPattern = `%${filters.search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (filters.category) {
      query += ` AND r.category = ?`;
      params.push(filters.category);
    }

    if (filters.status) {
      query += ` AND r.status = ?`;
      params.push(filters.status);
    }

    query += ` ORDER BY r.created_at DESC`;

    if (dbDriver === 'better-sqlite3' && db) {
      return db.prepare(query).all(...params);
    } else if (wasmDb) {
      const stmt = wasmDb.prepare(query);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return rows;
    }
    return [];
  },

  getReceiptById: (id) => {
    const query = `
      SELECT r.*, f.name as folder_name, f.color as folder_color
      FROM receipts r
      LEFT JOIN folders f ON r.folder_id = f.id
      WHERE r.id = ?
    `;
    if (dbDriver === 'better-sqlite3' && db) {
      return db.prepare(query).get(id);
    } else if (wasmDb) {
      const stmt = wasmDb.prepare(query);
      stmt.bind([id]);
      const res = stmt.step() ? stmt.getAsObject() : null;
      stmt.free();
      return res;
    }
    return null;
  },

  createReceipt: (receipt) => {
    const query = `
      INSERT INTO receipts (
        id, folder_id, title, merchant, amount, currency, tax_amount,
        receipt_date, category, payment_method, notes, file_path,
        file_name, file_size, mime_type, ocr_raw_text, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    const params = [
      receipt.id,
      receipt.folder_id || null,
      receipt.title || 'Scanned Receipt',
      receipt.merchant || 'Unknown Merchant',
      Number(receipt.amount) || 0.0,
      receipt.currency || 'USD',
      Number(receipt.tax_amount) || 0.0,
      receipt.receipt_date || new Date().toISOString().slice(0, 10),
      receipt.category || 'General Expense',
      receipt.payment_method || 'Unknown',
      receipt.notes || '',
      receipt.file_path,
      receipt.file_name,
      receipt.file_size || 0,
      receipt.mime_type || 'image/jpeg',
      receipt.ocr_raw_text || '',
      receipt.status || 'processed'
    ];

    if (dbDriver === 'better-sqlite3' && db) {
      db.prepare(query).run(...params);
    } else if (wasmDb) {
      wasmDb.run(query, params);
      saveWasmDb();
    }
    return dbApi.getReceiptById(receipt.id);
  },

  updateReceipt: (id, data) => {
    const fields = [];
    const params = [];

    const directFields = [
      'folder_id', 'title', 'merchant', 'amount', 'currency', 'tax_amount',
      'receipt_date', 'category', 'payment_method', 'notes', 'status', 'ocr_raw_text'
    ];

    directFields.forEach(f => {
      if (data[f] !== undefined) {
        fields.push(`${f} = ?`);
        params.push(data[f]);
      }
    });

    if (fields.length === 0) return dbApi.getReceiptById(id);

    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const query = `UPDATE receipts SET ${fields.join(', ')} WHERE id = ?`;

    if (dbDriver === 'better-sqlite3' && db) {
      db.prepare(query).run(...params);
    } else if (wasmDb) {
      wasmDb.run(query, params);
      saveWasmDb();
    }
    return dbApi.getReceiptById(id);
  },

  batchMoveReceipts: (receiptIds, targetFolderId) => {
    const validFolderId = targetFolderId === 'null' || !targetFolderId || targetFolderId === 'unsorted' ? null : targetFolderId;
    const query = `UPDATE receipts SET folder_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

    if (dbDriver === 'better-sqlite3' && db) {
      const stmt = db.prepare(query);
      const moveTx = db.transaction((ids, fId) => {
        for (const id of ids) {
          stmt.run(fId, id);
        }
      });
      moveTx(receiptIds, validFolderId);
    } else if (wasmDb) {
      for (const id of receiptIds) {
        wasmDb.run(query, [validFolderId, id]);
      }
      saveWasmDb();
    }
    return { success: true, count: receiptIds.length };
  },

  batchDeleteReceipts: (receiptIds) => {
    if (dbDriver === 'better-sqlite3' && db) {
      const getFilesStmt = db.prepare(`SELECT file_path FROM receipts WHERE id = ?`);
      const deleteStmt = db.prepare(`DELETE FROM receipts WHERE id = ?`);

      const deleteTx = db.transaction((ids) => {
        for (const id of ids) {
          const item = getFilesStmt.get(id);
          if (item && item.file_path) {
            try { if (fs.existsSync(item.file_path)) fs.unlinkSync(item.file_path); } catch (e) {}
          }
          deleteStmt.run(id);
        }
      });
      deleteTx(receiptIds);
    } else if (wasmDb) {
      const stmt = wasmDb.prepare(`SELECT file_path FROM receipts WHERE id = ?`);
      for (const id of receiptIds) {
        stmt.bind([id]);
        if (stmt.step()) {
          const item = stmt.getAsObject();
          if (item && item.file_path) {
            try { if (fs.existsSync(item.file_path)) fs.unlinkSync(item.file_path); } catch (e) {}
          }
        }
        stmt.reset();
        wasmDb.run(`DELETE FROM receipts WHERE id = ?`, [id]);
      }
      stmt.free();
      saveWasmDb();
    }
    return { success: true, count: receiptIds.length };
  },

  deleteReceipt: (id) => {
    const item = dbApi.getReceiptById(id);
    if (item && item.file_path) {
      try { if (fs.existsSync(item.file_path)) fs.unlinkSync(item.file_path); } catch (e) {}
    }

    if (dbDriver === 'better-sqlite3' && db) {
      db.prepare(`DELETE FROM receipts WHERE id = ?`).run(id);
    } else if (wasmDb) {
      wasmDb.run(`DELETE FROM receipts WHERE id = ?`, [id]);
      saveWasmDb();
    }
    return { success: true };
  },

  // Analytics & Summary Metrics
  getAnalytics: () => {
    const overviewQuery = `
      SELECT 
        COUNT(r.id) as total_receipts,
        COALESCE(SUM(r.amount), 0) as total_spent,
        COALESCE(SUM(r.tax_amount), 0) as total_tax,
        COALESCE(AVG(r.amount), 0) as avg_receipt_amount,
        COUNT(DISTINCT r.merchant) as total_merchants,
        COUNT(DISTINCT r.category) as total_categories
      FROM receipts r
    `;

    const categoryQuery = `
      SELECT 
        category,
        COUNT(id) as count,
        COALESCE(SUM(amount), 0) as total
      FROM receipts
      GROUP BY category
      ORDER BY total DESC
    `;

    const monthlyQuery = `
      SELECT 
        COALESCE(f.name, 'Unsorted / Free Mode') as folder_name,
        COALESCE(f.month_year, 'Unfiled') as month_year,
        f.color as folder_color,
        COUNT(r.id) as count,
        COALESCE(SUM(r.amount), 0) as total
      FROM receipts r
      LEFT JOIN folders f ON r.folder_id = f.id
      GROUP BY r.folder_id
      ORDER BY total DESC
    `;

    let overview = {};
    let byCategory = [];
    let byMonth = [];

    if (dbDriver === 'better-sqlite3' && db) {
      overview = db.prepare(overviewQuery).get() || {};
      byCategory = db.prepare(categoryQuery).all() || [];
      byMonth = db.prepare(monthlyQuery).all() || [];
    } else if (wasmDb) {
      overview = formatSqlJsResults(wasmDb.exec(overviewQuery))[0] || {};
      byCategory = formatSqlJsResults(wasmDb.exec(categoryQuery)) || [];
      byMonth = formatSqlJsResults(wasmDb.exec(monthlyQuery)) || [];
    }

    return {
      overview,
      by_category: byCategory,
      by_month: byMonth
    };
  }
};

module.exports = {
  db,
  dbApi,
  dataDir,
  uploadsDir,
  dbPath
};
