import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Printer, 
  UploadCloud, 
  Camera, 
  Folder, 
  AlertCircle, 
  Loader2, 
  Zap
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
      } else if (list.length > 0) {
        setSelectedScannerId(list[0].id);
      }
    } catch (e) {
      console.warn('Scanner listing error:', e);
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

  // Perform Scan via Simulator or Hardware Printer
  const handleTriggerScan = async () => {
    try {
      setIsScanning(true);
      setError(null);
      setScanStep(sourceMode === 'printer' ? 'Connecting to printer scanner & initiating scan...' : 'Generating simulated scan...');
      
      const newReceipt = await api.triggerScan({
        target_folder_id: targetFolderId === 'unsorted' ? null : targetFolderId,
        source: sourceMode === 'printer' ? 'printer' : 'simulator',
        template_index: selectedTemplateIndex
      });

      if (receiptName.trim()) {
        await api.updateReceipt(newReceipt.id, { title: receiptName.trim() });
        newReceipt.title = receiptName.trim();
      }

      setScanStep('Receipt saved successfully.');
      await new Promise(r => setTimeout(r, 400));
      setIsScanning(false);
      onScanSuccess(newReceipt);
      onClose();
    } catch (err) {
      console.error('Scan error:', err);
      setError(err.message || 'Failed to complete scan');
      setIsScanning(false);
    }
  };

  // Handle Camera Capture
  const handleCaptureCamera = async () => {
    if (!videoRef.current) return;
    try {
      setIsScanning(true);
      setScanStep('Capturing document frame...');

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

          {/* Mode 1: Simulator */}
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

          {/* Mode 2: Hardware Printer */}
          {sourceMode === 'printer' && (
            <div className="space-y-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-xs font-semibold text-slate-700">Select Scanner Device:</span>
              <div className="space-y-1.5">
                {scanners.map(s => (
                  <label
                    key={s.id}
                    className={`flex items-center justify-between p-2.5 rounded-md border cursor-pointer transition-all ${
                      selectedScannerId === s.id
                        ? 'bg-white border-slate-900 text-slate-900 font-medium'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        name="scanner-device"
                        checked={selectedScannerId === s.id}
                        onChange={() => setSelectedScannerId(s.id)}
                        className="text-slate-900 focus:ring-0"
                      />
                      <span className="text-xs">{s.name}</span>
                    </div>
                  </label>
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
              <p className="text-xs font-semibold text-slate-700">
                Click or drag receipt files here
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">JPG, PNG, PDF</p>
            </div>
          )}

          {/* Mode 4: Live Camera */}
          {sourceMode === 'camera' && (
            <div className="space-y-2">
              <div className="relative aspect-video rounded-lg bg-black overflow-hidden border border-slate-200">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              </div>
              <button
                type="button"
                onClick={handleCaptureCamera}
                disabled={isScanning || !cameraActive}
                className="w-full py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <Camera className="w-4 h-4" />
                <span>Snap Receipt</span>
              </button>
            </div>
          )}

          {/* Scanning Progress */}
          {isScanning && (
            <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-slate-700 animate-spin shrink-0" />
              <span className="text-xs font-medium text-slate-700">{scanStep}</span>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200 bg-white">
          <button
            type="button"
            onClick={onClose}
            disabled={isScanning}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-all disabled:opacity-50"
          >
            Cancel
          </button>

          {(sourceMode === 'simulator' || sourceMode === 'printer') && (
            <button
              id="btn-confirm-scan"
              type="button"
              onClick={handleTriggerScan}
              disabled={isScanning}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-sm transition-all disabled:opacity-50"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Scanning...</span>
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4" />
                  <span>Start Scan</span>
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
