import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Printer, 
  UploadCloud, 
  Camera, 
  Folder, 
  AlertCircle, 
  Loader2, 
  Zap,
  Settings,
  RefreshCw,
  CheckCircle2,
  Wifi,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { api } from '../services/api';

export default function ScannerModal({
  isOpen,
  onClose,
  folders,
  initialTargetFolderId = null,
  onScanSuccess
}) {
  const [sourceMode, setSourceMode] = useState('printer'); // 'printer' | 'simulator' | 'upload' | 'camera'
  const [targetFolderId, setTargetFolderId] = useState(initialTargetFolderId);
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState(0);
  const [receiptName, setReceiptName] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState('');
  const [error, setError] = useState(null);
  const [scanners, setScanners] = useState([]);
  const [selectedScannerId, setSelectedScannerId] = useState('physical_printer');
  
  // Custom IP Configuration state
  const [showConfig, setShowConfig] = useState(false);
  const [customHost, setCustomHost] = useState('');
  const [customPort, setCustomPort] = useState('8080');
  const [isProbing, setIsProbing] = useState(false);
  const [probeResult, setProbeResult] = useState(null);
  
  // Camera state
  const videoRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [stream, setStream] = useState(null);

  // File Upload state
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTargetFolderId(initialTargetFolderId);
      setReceiptName('');
      setError(null);
      setIsScanning(false);
      setProbeResult(null);
      loadScanners();
    } else {
      stopCamera();
    }
  }, [isOpen, initialTargetFolderId]);

  useEffect(() => {
    if (sourceMode === 'camera' && isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [sourceMode, isOpen]);

  const loadScanners = async () => {
    try {
      const list = await api.getScanners();
      setScanners(list);
      const physical = list.find(s => s.id === 'physical_printer');
      if (physical) {
        setSelectedScannerId('physical_printer');
        if (physical.host && !customHost) {
          setCustomHost(physical.host);
        }
        if (physical.port && (!customPort || customPort === '8080')) {
          setCustomPort(String(physical.port));
        }
      } else if (list.length > 0) {
        setSelectedScannerId(list[0].id);
      }
    } catch (e) {
      console.warn('Scanner listing error:', e);
    }
  };

  const handleTestProbe = async () => {
    if (!customHost.trim()) {
      setProbeResult({ success: false, message: 'Please enter a valid IP or hostname' });
      return;
    }
    try {
      setIsProbing(true);
      setProbeResult(null);
      const res = await api.probeScanner(customHost.trim(), parseInt(customPort) || 8080);
      if (res.reachable) {
        setProbeResult({ success: true, message: `✓ Connected! Found: ${res.name}` });
      } else {
        setProbeResult({ success: false, message: `✗ Not reachable: ${res.error || 'Connection failed'}` });
      }
    } catch (err) {
      setProbeResult({ success: false, message: `✗ Probe failed: ${err.message}` });
    } finally {
      setIsProbing(false);
    }
  };

  const handleSaveScannerConfig = async () => {
    if (!customHost.trim()) return;
    try {
      setIsProbing(true);
      const res = await api.setTargetScanner({
        host: customHost.trim(),
        port: parseInt(customPort) || 8080
      });
      await loadScanners();
      if (res.probe && res.probe.reachable) {
        setProbeResult({ success: true, message: `✓ Saved & Connected to ${res.probe.name}` });
      } else {
        setProbeResult({ success: false, message: `Saved target, but scanner is currently not responding` });
      }
    } catch (err) {
      setProbeResult({ success: false, message: `Save error: ${err.message}` });
    } finally {
      setIsProbing(false);
    }
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setCameraActive(true);
    } catch (err) {
      console.error('Camera access error:', err);
      setError('Could not access camera. Please check permissions.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setCameraActive(false);
  };

  // Handle Scan Execution
  const handleStartScan = async () => {
    try {
      setIsScanning(true);
      setError(null);
      setScanStep('Connecting to scanner...');

      if (sourceMode === 'printer') {
        const physical = scanners.find(s => s.id === 'physical_printer');
        if (physical && physical.is_online === false && !showConfig) {
          setShowConfig(true);
        }
        setScanStep('Scanning physical document from flatbed...');
        const newReceipt = await api.triggerScan({
          target_folder_id: targetFolderId === 'unsorted' ? null : targetFolderId,
          source: 'printer'
        });

        if (receiptName.trim()) {
          await api.updateReceipt(newReceipt.id, { title: receiptName.trim() });
          newReceipt.title = receiptName.trim();
        }

        setIsScanning(false);
        onScanSuccess(newReceipt);
        onClose();

      } else if (sourceMode === 'simulator') {
        setScanStep('Generating high-res scan...');
        const newReceipt = await api.triggerScan({
          target_folder_id: targetFolderId === 'unsorted' ? null : targetFolderId,
          source: 'simulator',
          template_index: selectedTemplateIndex
        });

        if (receiptName.trim()) {
          await api.updateReceipt(newReceipt.id, { title: receiptName.trim() });
          newReceipt.title = receiptName.trim();
        }

        setIsScanning(false);
        onScanSuccess(newReceipt);
        onClose();

      } else if (sourceMode === 'camera') {
        await captureCameraPhoto();
      }
    } catch (err) {
      console.error('Scan error:', err);
      setError(err.message || 'Failed to trigger scan');
      setIsScanning(false);
    }
  };

  // Handle Camera Capture
  const captureCameraPhoto = async () => {
    if (!videoRef.current) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 1280;
      canvas.height = videoRef.current.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (!blob) throw new Error('Failed to capture frame');
        const file = new File([blob], `cam_scan_${Date.now()}.jpg`, { type: 'image/jpeg' });
        
        setScanStep('Processing scan...');
        const newReceipt = await api.uploadScan(
          file, 
          targetFolderId === 'unsorted' ? null : targetFolderId
        );

        if (receiptName.trim()) {
          await api.updateReceipt(newReceipt.id, { title: receiptName.trim() });
          newReceipt.title = receiptName.trim();
        }

        setIsScanning(false);
        onScanSuccess(newReceipt);
        onClose();
      }, 'image/jpeg', 0.95);
    } catch (err) {
      console.error('Camera capture error:', err);
      setError(err.message || 'Failed to capture camera receipt');
      setIsScanning(false);
    }
  };

  // Handle File Upload
  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;
    try {
      setIsScanning(true);
      setError(null);
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setScanStep(`Uploading (${i + 1}/${files.length}): ${file.name}...`);
        const newReceipt = await api.uploadScan(
          file, 
          targetFolderId === 'unsorted' ? null : targetFolderId
        );
        onScanSuccess(newReceipt);
      }

      setIsScanning(false);
      onClose();
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to upload receipt');
      setIsScanning(false);
    }
  };

  if (!isOpen) return null;

  const physicalDevice = scanners.find(s => s.id === 'physical_printer');
  const isPhysicalOnline = physicalDevice?.is_online;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-900">
              <Printer className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-semibold text-slate-900">Scan Receipt</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isScanning}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Destination Folder Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Save To Folder
            </label>
            <div className="relative">
              <select
                id="select-target-folder"
                value={targetFolderId || 'unsorted'}
                onChange={(e) => setTargetFolderId(e.target.value === 'unsorted' ? null : e.target.value)}
                disabled={isScanning}
                className="w-full pl-9 pr-8 py-2 rounded-lg bg-white border border-slate-300 text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-900 transition-all"
              >
                <option value="unsorted">Free Mode / Inbox (Unsorted)</option>
                {folders.map(f => (
                  <option key={f.id} value={f.id}>
                    📁 {f.name} {f.month_year ? `(${f.month_year})` : ''}
                  </option>
                ))}
              </select>
              <Folder className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Optional Receipt Name (Single Field) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Receipt Name (Optional)
            </label>
            <input
              type="text"
              value={receiptName}
              onChange={(e) => setReceiptName(e.target.value)}
              placeholder="Leave blank for automatic name"
              className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-900"
            />
          </div>

          {/* Scanner Mode Tabs */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Input Method
            </label>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setSourceMode('printer')}
                className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-center transition-all ${
                  sourceMode === 'printer'
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Printer className="w-4 h-4" />
                <span className="text-xs font-semibold">Printer</span>
              </button>

              <button
                type="button"
                onClick={() => setSourceMode('simulator')}
                className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-center transition-all ${
                  sourceMode === 'simulator'
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Zap className="w-4 h-4" />
                <span className="text-xs font-semibold">Simulator</span>
              </button>

              <button
                type="button"
                onClick={() => setSourceMode('upload')}
                className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-center transition-all ${
                  sourceMode === 'upload'
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <UploadCloud className="w-4 h-4" />
                <span className="text-xs font-semibold">Upload</span>
              </button>

              <button
                type="button"
                onClick={() => setSourceMode('camera')}
                className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-center transition-all ${
                  sourceMode === 'camera'
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span className="text-xs font-semibold">Camera</span>
              </button>
            </div>
          </div>

          {/* Mode 1: Hardware Printer */}
          {sourceMode === 'printer' && (
            <div className="space-y-3 p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">Physical Scanner Status</span>
                <button
                  type="button"
                  onClick={loadScanners}
                  className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 font-medium"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Re-scan</span>
                </button>
              </div>

              {/* Status Badge */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${isPhysicalOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-400'}`} />
                  <div>
                    <div className="text-xs font-semibold text-slate-900">
                      {physicalDevice?.name || 'HP Laser MFP 135w'}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {isPhysicalOnline ? `Online (${physicalDevice.host}:${physicalDevice.port})` : 'Offline / Not responding on default ports'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowConfig(!showConfig)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition-colors"
                >
                  <Settings className="w-3 h-3" />
                  <span>{showConfig ? 'Hide IP' : 'Set IP'}</span>
                  {showConfig ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>

              {/* Expandable IP Configuration Card */}
              {showConfig && (
                <div className="p-3 space-y-2.5 rounded-lg bg-white border border-slate-200 text-xs animate-fade-in">
                  <div className="text-[11px] font-semibold text-slate-700">
                    Connect via Wi-Fi IP Address (e.g. from printer display or router)
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Printer IP / Host</label>
                      <input
                        type="text"
                        value={customHost}
                        onChange={(e) => setCustomHost(e.target.value)}
                        placeholder="e.g. 192.168.1.150 or host.docker.internal"
                        className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-0.5">eSCL Port</label>
                      <input
                        type="text"
                        value={customPort}
                        onChange={(e) => setCustomPort(e.target.value)}
                        placeholder="8080"
                        className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs font-mono"
                      />
                    </div>
                  </div>

                  {probeResult && (
                    <div className={`p-2 rounded text-[11px] font-medium ${probeResult.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
                      {probeResult.message}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleTestProbe}
                      disabled={isProbing || !customHost}
                      className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium text-[11px] disabled:opacity-50"
                    >
                      {isProbing ? 'Testing...' : 'Test Connection'}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveScannerConfig}
                      disabled={isProbing || !customHost}
                      className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium text-[11px] disabled:opacity-50"
                    >
                      Save Target IP
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mode 2: Simulator */}
          {sourceMode === 'simulator' && (
            <div className="space-y-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-xs font-semibold text-slate-700">Select Test Receipt:</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {[
                  'Staples Office',
                  'Best Buy Tech',
                  'Blue Bottle Coffee',
                  'Home Depot',
                  'Delta Airlines',
                  'Shell Gas'
                ].map((name, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedTemplateIndex(idx)}
                    className={`p-2 rounded-md border text-left text-xs transition-all ${
                      selectedTemplateIndex === idx
                        ? 'bg-white border-slate-900 text-slate-900 font-semibold shadow-sm'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Mode 3: File Upload */}
          {sourceMode === 'upload' && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files) handleFileUpload(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center p-6 rounded-lg border-2 border-dashed cursor-pointer transition-all ${
                dragOver
                  ? 'border-slate-900 bg-slate-50'
                  : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
              />
              <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
              <p className="text-xs font-semibold text-slate-800">
                Click or drag receipts here to upload
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Supports JPEG, PNG, WebP, and PDF files
              </p>
            </div>
          )}

          {/* Mode 4: Camera Capture */}
          {sourceMode === 'camera' && (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden bg-black aspect-4/3 flex items-center justify-center border border-slate-200">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {!cameraActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 text-white gap-2 p-4 text-center">
                    <Camera className="w-6 h-6 text-slate-400" />
                    <span className="text-xs">Requesting camera permissions...</span>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            disabled={isScanning}
            className="px-4 py-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold transition-all disabled:opacity-50"
          >
            Cancel
          </button>

          {sourceMode !== 'upload' && (
            <button
              id="btn-start-scan"
              type="button"
              onClick={handleStartScan}
              disabled={isScanning}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{scanStep || 'Processing...'}</span>
                </>
              ) : (
                <>
                  {sourceMode === 'camera' ? (
                    <>
                      <Camera className="w-4 h-4" />
                      <span>Snap & File Receipt</span>
                    </>
                  ) : (
                    <>
                      <Printer className="w-4 h-4" />
                      <span>Start Scan</span>
                    </>
                  )}
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
