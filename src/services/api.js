const API_BASE = '/api';

async function handleResponse(res, defaultMsg = 'Request failed') {
  if (!res.ok) {
    let errMsg = defaultMsg;
    try {
      const data = await res.json();
      if (data && data.error) errMsg = data.error;
      else if (data && data.message) errMsg = data.message;
    } catch (e) {
      try {
        const text = await res.text();
        if (text) errMsg = text;
      } catch (err) {}
    }
    throw new Error(errMsg);
  }
  return res.json();
}

export const api = {
  // Folders
  getFolders: async () => {
    const res = await fetch(`${API_BASE}/folders`);
    return handleResponse(res, 'Failed to fetch folders');
  },

  getFolder: async (id) => {
    const res = await fetch(`${API_BASE}/folders/${id}`);
    return handleResponse(res, 'Failed to fetch folder details');
  },

  createFolder: async (folderData) => {
    const res = await fetch(`${API_BASE}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(folderData)
    });
    return handleResponse(res, 'Failed to create folder');
  },

  updateFolder: async (id, folderData) => {
    const res = await fetch(`${API_BASE}/folders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(folderData)
    });
    return handleResponse(res, 'Failed to update folder');
  },

  deleteFolder: async (id, deleteReceipts = false) => {
    const res = await fetch(`${API_BASE}/folders/${id}?delete_receipts=${deleteReceipts}`, {
      method: 'DELETE'
    });
    return handleResponse(res, 'Failed to delete folder');
  },

  // Receipts
  getReceipts: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.folder_id !== undefined) params.append('folder_id', filters.folder_id);
    if (filters.search) params.append('search', filters.search);
    if (filters.category) params.append('category', filters.category);
    if (filters.status) params.append('status', filters.status);

    const res = await fetch(`${API_BASE}/receipts?${params.toString()}`);
    return handleResponse(res, 'Failed to fetch receipts');
  },

  getReceipt: async (id) => {
    const res = await fetch(`${API_BASE}/receipts/${id}`);
    return handleResponse(res, 'Failed to fetch receipt');
  },

  createReceipt: async (receiptData) => {
    const res = await fetch(`${API_BASE}/receipts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(receiptData)
    });
    return handleResponse(res, 'Failed to create receipt');
  },

  updateReceipt: async (id, receiptData) => {
    const res = await fetch(`${API_BASE}/receipts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(receiptData)
    });
    return handleResponse(res, 'Failed to update receipt');
  },

  deleteReceipt: async (id) => {
    const res = await fetch(`${API_BASE}/receipts/${id}`, {
      method: 'DELETE'
    });
    return handleResponse(res, 'Failed to delete receipt');
  },

  batchMoveReceipts: async (receiptIds, targetFolderId) => {
    const res = await fetch(`${API_BASE}/receipts/batch-move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receipt_ids: receiptIds, target_folder_id: targetFolderId })
    });
    return handleResponse(res, 'Failed to move receipts');
  },

  batchDeleteReceipts: async (receiptIds) => {
    const res = await fetch(`${API_BASE}/receipts/batch-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receipt_ids: receiptIds })
    });
    return handleResponse(res, 'Failed to batch delete receipts');
  },

  autoFileByDate: async () => {
    const res = await fetch(`${API_BASE}/receipts/auto-file-by-date`, {
      method: 'POST'
    });
    return handleResponse(res, 'Failed to auto-file receipts');
  },

  // Scanners & Ingestion
  getScanners: async () => {
    const res = await fetch(`${API_BASE}/scanners`);
    return handleResponse(res, 'Failed to detect scanners');
  },

  triggerScan: async ({ target_folder_id = null, source = 'auto', template_index = null } = {}) => {
    const res = await fetch(`${API_BASE}/scan/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_folder_id, source, template_index })
    });
    return handleResponse(res, 'Failed to trigger scan');
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
    return handleResponse(res, 'Failed to upload scan file');
  },

  reprocessOcr: async (id) => {
    const res = await fetch(`${API_BASE}/receipts/${id}/reprocess-ocr`, {
      method: 'POST'
    });
    return handleResponse(res, 'Failed to reprocess OCR');
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
    return handleResponse(res, 'Failed to fetch analytics');
  }
};
