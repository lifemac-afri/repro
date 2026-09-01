import React, { useState, useEffect, useCallback } from 'react';
import { 
  ArrowLeft, 
  Printer, 
  Download, 
  Search, 
  Grid, 
  List, 
  CheckSquare, 
  Square, 
  Trash2, 
  FolderInput, 
  Folder
} from 'lucide-react';
import { api } from '../services/api';

export default function FolderDetail({
  folderId,
  allFolders,
  refreshKey,
  lastScannedReceipt,
  onBack,
  onOpenScannerForFolder,
  onSelectReceipt
}) {
  const [folder, setFolder] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'
  const [selectedIds, setSelectedIds] = useState([]);
  const [batchTargetFolderId, setBatchTargetFolderId] = useState('');
  const [showBatchMove, setShowBatchMove] = useState(false);

  const loadFolderData = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const [fData, rData] = await Promise.all([
        api.getFolder(folderId),
        api.getReceipts({ folder_id: folderId })
      ]);
      setFolder(fData);
      setReceipts(rData);
      setSelectedIds([]);
    } catch (err) {
      console.error('Error loading folder receipts:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    loadFolderData();
  }, [loadFolderData, refreshKey]);

  // Instant reactive insertion if a receipt was just scanned into this folder
  useEffect(() => {
    if (lastScannedReceipt && lastScannedReceipt.folder_id === folderId) {
      setReceipts(prev => {
        if (prev.some(r => r.id === lastScannedReceipt.id)) return prev;
        return [lastScannedReceipt, ...prev];
      });
    }
  }, [lastScannedReceipt, folderId]);

  const handleDownloadZip = () => {
    api.downloadFile(api.getFolderExportUrl(folderId));
  };

  const filteredReceipts = receipts.filter(r => {
    return !search || (r.title && r.title.toLowerCase().includes(search.toLowerCase()));
  });

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredReceipts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredReceipts.map(r => r.id));
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBatchMove = async () => {
    if (!batchTargetFolderId || selectedIds.length === 0) return;
    try {
      await api.batchMoveReceipts(
        selectedIds, 
        batchTargetFolderId === 'unsorted' ? null : batchTargetFolderId
      );
      setShowBatchMove(false);
      loadFolderData(true);
    } catch (err) {
      console.error('Batch move error:', err);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      await api.batchDeleteReceipts(selectedIds);
      setSelectedIds([]);
      loadFolderData(true);
    } catch (err) {
      console.error('Batch delete error:', err);
    }
  };

  if (loading && !folder) {
    return (
      <div className="flex items-center justify-center p-20 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
        <div className="space-y-1.5">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>All Folders</span>
          </button>

          <div className="flex items-center gap-2.5">
            <Folder className="w-5 h-5 text-slate-700" />
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {folder?.name}
            </h1>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
              {receipts.length} Receipts
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            id="btn-scan-folder-direct"
            onClick={() => onOpenScannerForFolder(folder.id)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-all active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Scan Receipt</span>
          </button>

          <button
            id="btn-download-folder-zip"
            onClick={handleDownloadZip}
            title="Download ZIP with all images and CSV"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition-all shadow-sm"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Download ZIP</span>
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl bg-white border border-slate-200 shadow-sm">
        
        {/* Search */}
        <div className="relative flex-1 sm:w-64 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-slate-400"
          />
        </div>

        {/* View Switcher & Selection */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          {filteredReceipts.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all"
            >
              {selectedIds.length === filteredReceipts.length ? (
                <CheckSquare className="w-4 h-4 text-slate-900" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>{selectedIds.length > 0 ? `${selectedIds.length} Selected` : 'Select All'}</span>
            </button>
          )}

          <div className="flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              title="Grid View"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md ${viewMode === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              title="Table View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>

      {/* Batch Action Bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 text-white text-xs shadow-md animate-fade-in">
          <div className="font-semibold px-2">
            <span>{selectedIds.length} receipts selected</span>
          </div>

          <div className="flex items-center gap-2">
            {showBatchMove ? (
              <div className="flex items-center gap-2">
                <select
                  value={batchTargetFolderId}
                  onChange={(e) => setBatchTargetFolderId(e.target.value)}
                  className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-white text-xs"
                >
                  <option value="">Choose Destination Folder</option>
                  <option value="unsorted">Move to Free Mode / Inbox</option>
                  {allFolders.filter(f => f.id !== folderId).map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleBatchMove}
                  disabled={!batchTargetFolderId}
                  className="px-3 py-1 rounded bg-white text-slate-900 font-semibold disabled:opacity-50"
                >
                  Move
                </button>
                <button
                  onClick={() => setShowBatchMove(false)}
                  className="px-2 py-1 text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowBatchMove(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium"
              >
                <FolderInput className="w-3.5 h-3.5" />
                <span>Move</span>
              </button>
            )}

            <button
              onClick={handleBatchDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>
        </div>
      )}

      {/* Receipts Content */}
      {filteredReceipts.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 rounded-xl bg-white border border-slate-200 text-center space-y-3 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
            <Printer className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold text-slate-900">No Receipts in this Folder</h3>
            <p className="text-xs text-slate-500">
              Click below to scan a receipt directly from your printer.
            </p>
          </div>
          <button
            onClick={() => onOpenScannerForFolder(folder.id)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-all"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Scan Receipt</span>
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredReceipts.map(receipt => {
            const isSelected = selectedIds.includes(receipt.id);

            return (
              <div
                key={receipt.id}
                onClick={() => onSelectReceipt(receipt)}
                className={`group relative flex flex-col justify-between p-3.5 rounded-xl white-card-interactive cursor-pointer border transition-all ${
                  isSelected ? 'border-slate-900 ring-1 ring-slate-900 bg-slate-50' : 'border-slate-200'
                }`}
              >
                {/* Select toggle */}
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

                {/* Details (Name only) */}
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
      ) : (
        /* Table View */
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600 font-semibold">
                <tr>
                  <th className="p-3 w-10"></th>
                  <th className="p-3">Receipt Name</th>
                  <th className="p-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredReceipts.map(receipt => {
                  const isSelected = selectedIds.includes(receipt.id);

                  return (
                    <tr
                      key={receipt.id}
                      onClick={() => onSelectReceipt(receipt)}
                      className={`hover:bg-slate-50 cursor-pointer transition-colors ${
                        isSelected ? 'bg-slate-50' : ''
                      }`}
                    >
                      <td className="p-3" onClick={(e) => { e.stopPropagation(); toggleSelect(receipt.id); }}>
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-slate-900" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400" />
                        )}
                      </td>
                      <td className="p-3 font-medium text-slate-900">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={`/uploads/${receipt.file_name}`}
                            alt=""
                            className="w-7 h-7 rounded object-contain border border-slate-200 bg-slate-50 shrink-0"
                          />
                          <span className="truncate max-w-sm">{receipt.title || receipt.merchant || 'Receipt'}</span>
                        </div>
                      </td>
                      <td className="p-3 text-slate-500 font-mono">{receipt.receipt_date}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
