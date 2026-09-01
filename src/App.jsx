import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar';
import FolderGrid from './components/FolderGrid';
import FolderDetail from './components/FolderDetail';
import FreeModeInbox from './components/FreeModeInbox';
import AnalyticsView from './components/AnalyticsView';
import ScannerModal from './components/ScannerModal';
import ReceiptInspectorModal from './components/ReceiptInspectorModal';
import CreateFolderModal from './components/CreateFolderModal';
import { api } from './services/api';

// Helper to parse hash
function parseHash() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/');
  if (parts[0] === 'inbox') {
    return { tab: 'inbox', folderId: null };
  } else if (parts[0] === 'analytics' || parts[0] === 'overview') {
    return { tab: 'analytics', folderId: null };
  } else if (parts[0] === 'folders' && parts[1]) {
    return { tab: 'folders', folderId: parts[1] };
  }
  return { tab: 'folders', folderId: null };
}

export default function App() {
  const initialRoute = parseHash();
  const [activeTab, setActiveTab] = useState(initialRoute.tab); // 'folders' | 'inbox' | 'analytics'
  const [selectedFolderId, setSelectedFolderId] = useState(initialRoute.folderId);
  const [folders, setFolders] = useState([]);
  const [unfiledCount, setUnfiledCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastScannedReceipt, setLastScannedReceipt] = useState(null);
  
  // Modals state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerTargetFolderId, setScannerTargetFolderId] = useState(null);
  
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [pendingSelectionToMove, setPendingSelectionToMove] = useState([]);
  
  const [inspectingReceipt, setInspectingReceipt] = useState(null);

  // Sync state to URL hash
  useEffect(() => {
    let newHash = '';
    if (activeTab === 'inbox') {
      newHash = '#/inbox';
    } else if (activeTab === 'analytics') {
      newHash = '#/analytics';
    } else if (activeTab === 'folders') {
      newHash = selectedFolderId ? `#/folders/${selectedFolderId}` : '#/folders';
    }
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, '', newHash);
    }
  }, [activeTab, selectedFolderId]);

  // Listen to browser back/forward or manual hash change
  useEffect(() => {
    const handleHashChange = () => {
      const route = parseHash();
      setActiveTab(route.tab);
      setSelectedFolderId(route.folderId);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const loadFolders = useCallback(async () => {
    try {
      const data = await api.getFolders();
      setFolders(data);
    } catch (err) {
      console.error('Error fetching folders:', err);
    }
  }, []);

  const loadUnfiledCount = useCallback(async () => {
    try {
      const unfiled = await api.getReceipts({ folder_id: 'unsorted' });
      setUnfiledCount(unfiled.length);
    } catch (err) {
      console.error('Error fetching unfiled count:', err);
    }
  }, []);

  useEffect(() => {
    loadFolders();
    loadUnfiledCount();
  }, [loadFolders, loadUnfiledCount, refreshKey]);

  const handleOpenScanner = (targetFolderId = null) => {
    setScannerTargetFolderId(targetFolderId);
    setIsScannerOpen(true);
  };

  const handleScanSuccess = (newReceipt) => {
    setLastScannedReceipt(newReceipt);
    setRefreshKey(prev => prev + 1);
    loadFolders();
    loadUnfiledCount();
  };

  const handleOpenCreateFolderWithSelection = (selectionIds = []) => {
    setPendingSelectionToMove(selectionIds);
    setIsCreateFolderOpen(true);
  };

  const handleFolderCreated = async (newFolder) => {
    if (pendingSelectionToMove.length > 0) {
      await api.batchMoveReceipts(pendingSelectionToMove, newFolder.id);
      setPendingSelectionToMove([]);
    }
    setRefreshKey(prev => prev + 1);
    await loadFolders();
    loadUnfiledCount();
  };

  const handleExportMaster = () => {
    api.downloadFile(api.getMasterExportUrl());
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-slate-900 selection:text-white">
      
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          setSelectedFolderId(null);
        }}
        unfiledCount={unfiledCount}
        onOpenScanner={() => handleOpenScanner(selectedFolderId || null)}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onExportAll={handleExportMaster}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'folders' && (
          selectedFolderId ? (
            <FolderDetail
              folderId={selectedFolderId}
              allFolders={folders}
              refreshKey={refreshKey}
              lastScannedReceipt={lastScannedReceipt}
              onBack={() => {
                setSelectedFolderId(null);
                loadFolders();
              }}
              onOpenScannerForFolder={(fId) => handleOpenScanner(fId)}
              onSelectReceipt={(receipt) => setInspectingReceipt(receipt)}
            />
          ) : (
            <FolderGrid
              folders={folders}
              refreshKey={refreshKey}
              onSelectFolder={(fId) => setSelectedFolderId(fId)}
              onOpenCreateFolder={() => setIsCreateFolderOpen(true)}
              onQuickScanToFolder={(fId) => handleOpenScanner(fId)}
              onFolderDeleted={() => {
                setRefreshKey(prev => prev + 1);
                loadFolders();
                loadUnfiledCount();
              }}
            />
          )
        )}

        {activeTab === 'inbox' && (
          <FreeModeInbox
            folders={folders}
            refreshKey={refreshKey}
            lastScannedReceipt={lastScannedReceipt}
            onOpenScanner={(target) => handleOpenScanner(target)}
            onOpenCreateFolderWithSelection={handleOpenCreateFolderWithSelection}
            onSelectReceipt={(receipt) => setInspectingReceipt(receipt)}
            onFoldersUpdated={() => {
              setRefreshKey(prev => prev + 1);
              loadFolders();
              loadUnfiledCount();
            }}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView 
            refreshKey={refreshKey}
            onExportMaster={handleExportMaster} 
          />
        )}
      </main>

      {/* Scanner Trigger Dialog */}
      <ScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        folders={folders}
        initialTargetFolderId={scannerTargetFolderId}
        onScanSuccess={handleScanSuccess}
      />

      {/* Create Folder Dialog */}
      <CreateFolderModal
        isOpen={isCreateFolderOpen}
        onClose={() => {
          setIsCreateFolderOpen(false);
          setPendingSelectionToMove([]);
        }}
        onFolderCreated={handleFolderCreated}
      />

      {/* Split-Screen Receipt Inspector Dialog */}
      <ReceiptInspectorModal
        receipt={inspectingReceipt}
        folders={folders}
        isOpen={!!inspectingReceipt}
        onClose={() => setInspectingReceipt(null)}
        onUpdateReceipt={(updated) => {
          setInspectingReceipt(updated);
          setRefreshKey(prev => prev + 1);
          loadFolders();
          loadUnfiledCount();
        }}
        onDeleteReceipt={() => {
          setRefreshKey(prev => prev + 1);
          loadFolders();
          loadUnfiledCount();
        }}
      />

    </div>
  );
}
