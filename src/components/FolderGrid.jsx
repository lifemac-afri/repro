import React, { useState } from 'react';
import { 
  Folder, 
  FolderPlus, 
  Printer, 
  Download, 
  ChevronRight, 
  FileText, 
  Trash2
} from 'lucide-react';
import { api } from '../services/api';

export default function FolderGrid({
  folders,
  onSelectFolder,
  onOpenCreateFolder,
  onQuickScanToFolder,
  onFolderDeleted
}) {
  const [deletingId, setDeletingId] = useState(null);

  const totalReceipts = folders.reduce((sum, f) => sum + (f.receipt_count || 0), 0);

  const handleDeleteFolder = async (e, folder) => {
    e.stopPropagation();
    try {
      setDeletingId(folder.id);
      await api.deleteFolder(folder.id, false);
      onFolderDeleted(folder.id);
    } catch (err) {
      console.error('Delete folder error:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownloadZip = (e, folderId) => {
    e.stopPropagation();
    api.downloadFile(api.getFolderExportUrl(folderId));
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Receipt Folders</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Organized folders by month and year. Click any folder to scan receipts directly into it.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
            {folders.length} Folders • {totalReceipts} Receipts
          </span>

          <button
            id="btn-create-folder"
            onClick={onOpenCreateFolder}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-all"
          >
            <FolderPlus className="w-4 h-4" />
            <span>New Folder</span>
          </button>
        </div>
      </div>

      {/* Grid */}
      {folders.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 rounded-xl bg-white border border-slate-200 text-center space-y-3 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
            <Folder className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold text-slate-900">No Folders Yet</h3>
            <p className="text-xs text-slate-500">
              Create a folder by month and year to start scanning.
            </p>
          </div>
          <button
            onClick={onOpenCreateFolder}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-all"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Create Folder</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {folders.map((folder) => (
            <div
              key={folder.id}
              onClick={() => onSelectFolder(folder.id)}
              className="group flex flex-col justify-between p-5 rounded-xl white-card-interactive cursor-pointer"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 text-slate-800 border border-slate-200">
                      <Folder className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 group-hover:text-slate-700 transition-colors truncate max-w-[180px]">
                        {folder.name}
                      </h3>
                      <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <FileText className="w-3 h-3 text-slate-400" />
                        <span>{folder.receipt_count} receipts</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Download ZIP */}
                    <button
                      type="button"
                      onClick={(e) => handleDownloadZip(e, folder.id)}
                      title="Download Folder ZIP"
                      className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                    >
                      <Download className="w-4 h-4" />
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={(e) => handleDeleteFolder(e, folder)}
                      title="Delete Folder"
                      className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 gap-2 mt-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickScanToFolder(folder.id);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium transition-all"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-600" />
                  <span>Scan</span>
                </button>

                <div className="flex items-center gap-0.5 text-xs font-medium text-slate-500 group-hover:text-slate-900 transition-colors">
                  <span>Open</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>

            </div>
          ))}
        </div>
      )}

    </div>
  );
}
