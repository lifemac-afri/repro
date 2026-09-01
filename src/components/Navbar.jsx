import React from 'react';
import { 
  FolderKanban, 
  Layers, 
  BarChart3, 
  Printer, 
  Download, 
  Search, 
  FileText
} from 'lucide-react';

export default function Navbar({
  activeTab,
  setActiveTab,
  unfiledCount,
  onOpenScanner,
  searchQuery,
  setSearchQuery,
  onExportAll
}) {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Logo */}
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setActiveTab('folders')}>
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-900 text-white font-semibold">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-slate-900">RePro</span>
              <span className="text-xs text-slate-500 block -mt-1 font-normal">Receipt Scanner</span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              id="nav-tab-folders"
              onClick={() => setActiveTab('folders')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'folders'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5" />
              <span>Folders</span>
            </button>

            <button
              id="nav-tab-inbox"
              onClick={() => setActiveTab('inbox')}
              className={`relative flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'inbox'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Free Mode</span>
              {unfiledCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-slate-900 text-white font-bold text-[10px]">
                  {unfiledCount}
                </span>
              )}
            </button>

            <button
              id="nav-tab-analytics"
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'analytics'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Overview</span>
            </button>
          </nav>

          {/* Search & Actions */}
          <div className="flex items-center gap-2.5">
            <div className="relative hidden lg:block w-52 xl:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search receipts..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-slate-400 transition-all"
              />
            </div>

            {/* Scan Button */}
            <button
              id="btn-global-scan"
              onClick={onOpenScanner}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-all active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>Scan Receipt</span>
            </button>

            {/* Export All */}
            <button
              id="btn-global-export"
              onClick={onExportAll}
              title="Download all folders and receipts as ZIP"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition-all shadow-sm"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span className="hidden sm:inline">Export All</span>
            </button>
          </div>

        </div>

        {/* Mobile Navigation */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-slate-200 gap-1">
          <button
            onClick={() => setActiveTab('folders')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${
              activeTab === 'folders' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            <FolderKanban className="w-3.5 h-3.5" />
            <span>Folders</span>
          </button>
          <button
            onClick={() => setActiveTab('inbox')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${
              activeTab === 'inbox' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Free Mode</span>
            {unfiledCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-slate-900 text-white font-bold text-[9px]">
                {unfiledCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${
              activeTab === 'analytics' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>
        </div>
      </div>
    </header>
  );
}
