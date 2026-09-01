import React, { useState, useEffect } from 'react';
import { 
  X, 
  RotateCw, 
  ZoomIn, 
  ZoomOut, 
  Download, 
  Trash2, 
  Save, 
  Folder, 
  Check 
} from 'lucide-react';
import { api } from '../services/api';

export default function ReceiptInspectorModal({
  receipt,
  folders,
  isOpen,
  onClose,
  onUpdateReceipt,
  onDeleteReceipt
}) {
  const [title, setTitle] = useState('');
  const [folderId, setFolderId] = useState('unsorted');
  const [isSaving, setIsSaving] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    if (receipt) {
      setTitle(receipt.title || receipt.merchant || 'Receipt');
      setFolderId(receipt.folder_id || 'unsorted');
      setRotation(0);
      setZoom(1);
    }
  }, [receipt]);

  if (!isOpen || !receipt) return null;

  const handleSave = async (e) => {
    e?.preventDefault();
    try {
      setIsSaving(true);
      const payload = {
        title: title.trim() || 'Receipt',
        folder_id: folderId === 'unsorted' ? null : folderId
      };
      const updated = await api.updateReceipt(receipt.id, payload);
      onUpdateReceipt(updated);
      setIsSaving(false);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    } catch (err) {
      console.error('Error saving receipt:', err);
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.deleteReceipt(receipt.id);
      onDeleteReceipt(receipt.id);
      onClose();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const imageSrc = `/uploads/${receipt.file_name}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-4xl h-[85vh] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900 truncate">
              {title || 'Receipt Details'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {savedToast && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium px-2 py-0.5 bg-emerald-50 rounded">
                <Check className="w-3.5 h-3.5" /> Saved
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Split Screen Content */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden bg-slate-50">
          
          {/* Left: Image Viewer */}
          <div className="md:col-span-7 bg-slate-100 flex flex-col border-r border-slate-200">
            {/* Viewer Controls */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-white text-slate-600 text-xs">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setZoom(z => Math.max(0.5, z - 0.2))}
                  className="p-1 rounded hover:bg-slate-100"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-[11px] font-mono px-1">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setZoom(z => Math.min(3, z + 0.2))}
                  className="p-1 rounded hover:bg-slate-100"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setRotation(r => (r + 90) % 360)}
                  className="p-1 rounded hover:bg-slate-100 ml-2"
                  title="Rotate"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </div>

              <a
                href={imageSrc}
                download={receipt.file_name}
                className="flex items-center gap-1 text-slate-700 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 text-xs font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </a>
            </div>

            {/* Viewport */}
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center relative">
              <div 
                className="transition-transform duration-150 ease-out origin-center"
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`
                }}
              >
                <img
                  src={imageSrc}
                  alt={receipt.title}
                  className="max-h-[60vh] max-w-full object-contain rounded border border-slate-200 shadow-sm bg-white"
                />
              </div>
            </div>
          </div>

          {/* Right: Clean form with ONLY Name field and folder */}
          <div className="md:col-span-5 flex flex-col bg-white overflow-y-auto">
            <form onSubmit={handleSave} className="p-6 space-y-5 flex-1 flex flex-col justify-between">
              
              <div className="space-y-4">
                {/* STRICTLY ONLY NAME FIELD */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Receipt Name
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter receipt name..."
                    className="w-full px-3.5 py-2 rounded-lg bg-white border border-slate-300 text-sm font-medium text-slate-900 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all"
                  />
                </div>

                {/* Folder Destination */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Folder className="w-3.5 h-3.5 text-slate-500" />
                    <span>Folder</span>
                  </label>
                  <select
                    value={folderId}
                    onChange={(e) => setFolderId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-900"
                  >
                    <option value="unsorted">Free Mode / Unsorted</option>
                    {folders.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.name} {f.month_year ? `(${f.month_year})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-rose-600 hover:bg-rose-50 border border-slate-200 text-xs font-medium transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-sm transition-all disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Saving...' : 'Save'}</span>
                </button>
              </div>

            </form>
          </div>

        </div>

      </div>
    </div>
  );
}
