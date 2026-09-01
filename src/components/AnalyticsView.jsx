import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Receipt, 
  Download, 
  Folder
} from 'lucide-react';
import { api } from '../services/api';

export default function AnalyticsView({ onExportMaster }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const res = await api.getAnalytics();
      setData(res);
    } catch (err) {
      console.error('Error loading overview:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center p-20 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">System Overview</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Summary of scanned office receipts and digital archives.
          </p>
        </div>

        <button
          id="btn-analytics-export"
          onClick={onExportMaster}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-all"
        >
          <Download className="w-4 h-4" />
          <span>Export All Folders (ZIP)</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        
        <div className="p-5 rounded-xl white-card space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Total Scanned Receipts</span>
            <Receipt className="w-4 h-4 text-slate-700" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {data.totalReceipts}
          </div>
          <span className="text-[11px] text-slate-400">Across all folders</span>
        </div>

        <div className="p-5 rounded-xl white-card space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Unsorted Receipts</span>
            <Folder className="w-4 h-4 text-slate-700" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {data.unfiledCount}
          </div>
          <span className="text-[11px] text-slate-400">In Free Mode Inbox</span>
        </div>

      </div>

    </div>
  );
}
