import React, { useState } from 'react';
import { X, FolderPlus } from 'lucide-react';
import { api } from '../services/api';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function CreateFolderModal({
  isOpen,
  onClose,
  onFolderCreated
}) {
  const currentYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth();

  const [folderName, setFolderName] = useState(`${MONTH_NAMES[currentMonthIdx]} ${currentYear}`);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!folderName.trim()) {
      setError('Please provide a folder name');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const created = await api.createFolder({
        name: folderName.trim(),
        month_year: null,
        description: '',
        color: '#0f172a'
      });

      setIsSubmitting(false);
      onFolderCreated(created);
      onClose();
    } catch (err) {
      console.error('Create folder error:', err);
      setError(err.message || 'Failed to create folder');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-900">
              <FolderPlus className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-semibold text-slate-900">New Folder</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {error}
            </div>
          )}

          {/* STRICTLY ONLY NAME FIELD */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Folder Name
            </label>
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="e.g. September 2026"
              autoFocus
              className="w-full px-3.5 py-2.5 rounded-lg bg-white border border-slate-300 text-sm font-medium text-slate-900 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all"
            />
          </div>

          {/* Quick presets */}
          <div className="flex items-center gap-1.5 pt-1">
            <span className="text-[11px] text-slate-500 font-medium mr-1">Suggestions:</span>
            {[-1, 0, 1].map(offset => {
              const d = new Date();
              d.setMonth(d.getMonth() + offset);
              const name = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
              return (
                <button
                  key={offset}
                  type="button"
                  onClick={() => setFolderName(name)}
                  className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition-all"
                >
                  {name}
                </button>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-sm transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Folder'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
