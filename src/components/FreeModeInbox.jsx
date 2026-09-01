import React, { useState, useEffect, useCallback } from 'react';
import { 
  Layers, 
  Printer, 
  FolderPlus, 
  Trash2, 
  CheckSquare, 
  Square, 
  FolderInput
} from 'lucide-react';
import { api } from '../services/api';

export default function FreeModeInbox({
  folders,
  refreshKey,
  lastScannedReceipt,
  onOpenScanner,
  onOpenCreateFolderWithSelection,
  onSelectReceipt,
  onFoldersUpdated
}) {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [targetFolderId, setTargetFolderId] = useState('');

  const loadInboxReceipts = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const data = await api.getReceipts({ folder_id: 'unsorted' });
      setReceipts(data);
      setSelectedIds([]);
    } catch (err) {
      console.error('Error loading unsorted receipts:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInboxReceipts();
  }, [loadInboxReceipts, refreshKey]);

  // Instant reactive insertion if a receipt was scanned to unsorted/inbox
  useEffect(() => {
    if (lastScannedReceipt && !lastScannedReceipt.folder_id) {
      setReceipts(prev => {
        if (prev.some(r => r.id === lastScannedReceipt.id)) return prev;
        return [lastScannedReceipt, ...prev];
      });
    }
  }, [lastScannedReceipt]);

  const toggleSelectAll = () => {
    if (selectedIds.length === receipts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(receipts.map(r => r.id));
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Move selected to existing folder
  const handleBatchMove = async () => {
    if (!targetFolderId || selectedIds.length === 0) return;
    try {
      await api.batchMoveReceipts(selectedIds, targetFolderId);
      loadInboxReceipts(true);
      onFoldersUpdated();
    } catch (err) {
      console.error('Batch move error:', err);
    }
  };

  // Batch delete
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      await api.batchDeleteReceipts(selectedIds);
      setSelectedIds([]);
      loadInboxReceipts(true);
      onFoldersUpdated();
    } catch (err) {
      console.error('Batch delete error:', err);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Free Mode / Unsorted</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Scan first and assign to folders later. Select receipts below to move them into a folder.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
            {receipts.length} Unsorted Receipts
          </span>

          <button
            id="btn-scan-free-mode"
            onClick={() => onOpenScanner('unsorted')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>Scan into Inbox</span>
          </button>
        </div>
      </div>

      {/* Batch Triage Toolbar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900 text-white text-xs shadow-md animate-fade-in">
          <div className="font-semibold px-2">
            <span>{selectedIds.length} receipts selected</span>
          </div>

          <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto">
            {/* Move to Existing Folder */}
            <select
              value={targetFolderId}
              onChange={(e) => setTargetFolderId(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-medium focus:outline-none"
            >
              <option value="">Move to Existing Folder...</option>
              {folders.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>

            <button
              onClick={handleBatchMove}
              disabled={!targetFolderId}
              className="px-3.5 py-1.5 rounded-lg bg-white text-slate-900 font-semibold disabled:opacity-50 transition-all"
            >
              Move
            </button>

            {/* Create New Folder for Selected */}
            <button
              onClick={() => onOpenCreateFolderWithSelection(selectedIds)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition-all"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>+ New Folder</span>
            </button>

            {/* Batch Delete */}
            <button
              onClick={handleBatchDelete}
              className="p-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white"
              title="Delete Selected"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Inbox Grid */}
      {receipts.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 rounded-xl bg-white border border-slate-200 text-center space-y-3 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold text-slate-900">Inbox is Clear</h3>
            <p className="text-xs text-slate-500">
              All scanned receipts have been organized into folders.
            </p>
          </div>
          <button
            onClick={() => onOpenScanner('unsorted')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-all"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Scan to Free Mode</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              {selectedIds.length === receipts.length ? (
                <CheckSquare className="w-4 h-4 text-slate-900" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>{selectedIds.length > 0 ? `${selectedIds.length} of ${receipts.length} Selected` : 'Select All'}</span>
            </button>
            <span className="text-xs text-slate-500">{receipts.length} unfiled</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {receipts.map(receipt => {
              const isSelected = selectedIds.includes(receipt.id);

              return (
                <div
                  key={receipt.id}
                  onClick={() => onSelectReceipt(receipt)}
                  className={`group relative flex flex-col justify-between p-3.5 rounded-xl white-card-interactive cursor-pointer border transition-all ${
                    isSelected ? 'border-slate-900 ring-1 ring-slate-900 bg-slate-50' : 'border-slate-200'
                  }`}
                >
                  {/* Select Checkbox */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(receipt.id);
                    }}
                    className="absolute top-2.5 left-2.5 z-10 p-1 rounded bg-white/90 border border-slate-200 text-slate-500 hover:text-slate-900"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-slate-900" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>

                  {/* Thumbnail */}
                  <div className="relative w-full h-44 rounded-lg bg-slate-100 overflow-hidden mb-2.5 border border-slate-200 flex items-center justify-center">
                    <img
                      src={`/uploads/${receipt.file_name}`}
                      alt={receipt.title}
                      className="w-full h-full object-contain group-hover:scale-102 transition-transform duration-200"
                    />
                  </div>

                  {/* Name only */}
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-semibold text-slate-900 truncate">
                      {receipt.title || receipt.merchant || 'Receipt'}
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      {receipt.receipt_date}
                    </p>
                  </div>

                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
