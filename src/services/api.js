const API_BASE = '/api';

export const api = {
  // Folders
  getFolders: async () => {
    const res = await fetch(`${API_BASE}/folders`);
    if (!res.ok) throw new Error('Failed to fetch folders');
    return res.json();
  },

  getFolder: async (id) => {
    const res = await fetch(`${API_BASE}/folders/${id}`);
    if (!res.ok) throw new Error('Failed to fetch folder details');
    return res.json();
  },

  createFolder: async (folderData) => {
    const res = await fetch(`${API_BASE}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(folderData)
    });
    if (!res.ok) throw new Error('Failed to create folder');
    return res.json();
  },

  updateFolder: async (id, folderData) => {
    const res = await fetch(`${API_BASE}/folders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(folderData)
    });
    if (!res.ok) throw new Error('Failed to update folder');
    return res.json();
  },

  deleteFolder: async (id, deleteReceipts = false) => {
    const res = await fetch(`${API_BASE}/folders/${id}?delete_receipts=${deleteReceipts}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete folder');
    return res.json();
  },

  // Receipts
  getReceipts: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.folder_id !== undefined) params.append('folder_id', filters.folder_id);
    if (filters.search) params.append('search', filters.search);
    if (filters.category) params.append('category', filters.category);
    if (filters.status) params.append('status', filters.status);

    const res = await fetch(`${API_BASE}/receipts?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch receipts');
    return res.json();
  },

  getReceipt: async (id) => {
    const res = await fetch(`${API_BASE}/receipts/${id}`);
    if (!res.ok) throw new Error('Failed to fetch receipt');
    return res.json();
  },

  createReceipt: async (receiptData) => {
    const res = await fetch(`${API_BASE}/receipts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(receiptData)
    });
    if (!res.ok) throw new Error('Failed to create receipt');
    return res.json();
  },

  updateReceipt: async (id, receiptData) => {
    const res = await fetch(`${API_BASE}/receipts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(receiptData)
    });
    if (!res.ok) throw new Error('Failed to update receipt');
    return res.json();
  },

  deleteReceipt: async (id) => {
    const res = await fetch(`${API_BASE}/receipts/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete receipt');
    return res.json();
  },

  batchMoveReceipts: async (receiptIds, targetFolderId) => {
    const res = await fetch(`${API_BASE}/receipts/batch-move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receipt_ids: receiptIds, target_folder_id: targetFolderId })
    });
    if (!res.ok) throw new Error('Failed to move receipts');
    return res.json();
  },

  batchDeleteReceipts: async (receiptIds) => {
    const res = await fetch(`${API_BASE}/receipts/batch-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receipt_ids: receiptIds })
    });
    if (!res.ok) throw new Error('Failed to batch delete receipts');
    return res.json();
  },

  autoFileByDate: async () => {
    const res = await fetch(`${API_BASE}/receipts/auto-file-by-date`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to auto-file receipts');
    return res.json();
  },

  // Scanners & Ingestion
  getScanners: async () => {
    const res = await fetch(`${API_BASE}/scanners`);
    if (!res.ok) throw new Error('Failed to detect scanners');
    return res.json();
  },

  triggerScan: async ({ target_folder_id = null, source = 'auto', template_index = null } = {}) => {
    const res = await fetch(`${API_BASE}/scan/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_folder_id, source, template_index })
    });
    if (!res.ok) throw new Error('Failed to trigger scan');
    return res.json();
  },

  uploadScan: async (file, target_folder_id = null) => {
    const formData = new FormData();
    formData.append('file', file);
    if (target_folder_id) {
      formData.append('target_folder_id', target_folder_id);
    }

    const res = await fetch(`${API_BASE}/scan/upload`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error('Failed to upload scan file');
    return res.json();
  },

  reprocessOcr: async (id) => {
    const res = await fetch(`${API_BASE}/receipts/${id}/reprocess-ocr`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to reprocess OCR');
    return res.json();
  },

  // Exports
  getFolderExportUrl: (folderId) => `${API_BASE}/export/folder/${folderId || 'unsorted'}`,
  getMasterExportUrl: () => `${API_BASE}/export/all`,

  downloadFile: (url) => {
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', '');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  // Analytics
  getAnalytics: async () => {
    const res = await fetch(`${API_BASE}/analytics`);
    if (!res.ok) throw new Error('Failed to fetch analytics');
    return res.json();
  }
};
