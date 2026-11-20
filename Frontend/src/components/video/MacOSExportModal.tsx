'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Apple,
  Film,
  Download,
  Folder,
  CheckCircle2,
  AlertCircle,
  Play,
  ExternalLink,
  Loader2,
  HardDrive,
  Sparkles,
  Settings,
  Monitor,
  Check,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';
import {
  ExportFormatOption,
  AvailableQualityOption,
  MacOSDirectoryOption,
  ExportVideoResponse
} from '@/types';

interface MacOSExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourcePath?: string;
  taskId?: string;
  clipId?: string;
  videoId?: string;
  title?: string;
  defaultFilename?: string;
  onExportComplete?: (result: ExportVideoResponse) => void;
}

export const MacOSExportModal: React.FC<MacOSExportModalProps> = ({
  isOpen,
  onClose,
  sourcePath,
  taskId,
  clipId,
  videoId,
  title = 'Export Video',
  defaultFilename,
  onExportComplete,
}) => {
  const [formats, setFormats] = useState<ExportFormatOption[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>('mp4_h264');
  const [qualities, setQualities] = useState<AvailableQualityOption[]>([]);
  const [selectedQuality, setSelectedQuality] = useState<string>('original');
  const [directories, setDirectories] = useState<MacOSDirectoryOption[]>([]);
  const [selectedDirectory, setSelectedDirectory] = useState<string>('downloads');
  const [customDir, setCustomDir] = useState<string>('');
  const [customFilename, setCustomFilename] = useState<string>(defaultFilename || '');
  
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgressText, setExportProgressText] = useState<string>('Preparing FFmpeg conversion...');
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<ExportVideoResponse | null>(null);

  const [browserDirHandle, setBrowserDirHandle] = useState<any | null>(null);
  const [browserDirName, setBrowserDirName] = useState<string | null>(null);
  const [isFileSystemAccessSupported, setIsFileSystemAccessSupported] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
      setIsFileSystemAccessSupported(true);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setExportResult(null);
      setExportError(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setExportError(null);
    setExportResult(null);

    Promise.all([
      api.getExportFormats().catch(() => []),
      api.getMacOSDirectories().catch(() => []),
      api.getAvailableQualities({
        source_path: sourcePath,
        task_id: taskId,
        clip_id: clipId,
        video_id: videoId
      }).catch((e) => {
        logger_fallback(e);
        return null;
      })
    ]).then(([fmtList, dirList, qRes]) => {
      if (!isMounted) return;
      if (fmtList && fmtList.length > 0) setFormats(fmtList);
      if (dirList && dirList.length > 0) setDirectories(dirList);
      if (qRes && qRes.qualities) {
        setQualities(qRes.qualities);
        // Default to original or highest available genuine quality
        setSelectedQuality('original');
        if (!customFilename && qRes.filename) {
          setCustomFilename(qRes.filename.replace(/\.[^/.]+$/, ''));
        }
      }
    }).finally(() => {
      if (isMounted) setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, sourcePath, taskId, clipId, videoId]);

  function logger_fallback(err: any) {
    console.warn('Could not inspect qualities:', err);
  }

  // Handle browser folder selection via modern File System Access API
  const handlePickBrowserFolder = async () => {
    try {
      if ('showDirectoryPicker' in window) {
        const handle = await (window as any).showDirectoryPicker({
          mode: 'readwrite',
        });
        if (handle) {
          setBrowserDirHandle(handle);
          setBrowserDirName(handle.name);
          setSelectedDirectory('browser_picked');
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('Directory picker error:', e);
      }
    }
  };

  const handleStartExport = async () => {
    setIsExporting(true);
    setExportError(null);
    setExportProgressText('Initializing FFmpeg encoder for macOS...');

    try {
      let destDir: string | undefined = undefined;
      if (selectedDirectory === 'custom' && customDir.trim()) {
        destDir = customDir.trim();
      } else if (selectedDirectory !== 'browser_picked') {
        const found = directories.find((d) => d.id === selectedDirectory);
        if (found) destDir = found.path;
      }

      setExportProgressText('Encoding video frames & preserving audio synchronization...');

      const res = await api.exportVideo({
        source_path: sourcePath,
        task_id: taskId,
        clip_id: clipId,
        video_id: videoId,
        target_format: selectedFormat,
        target_quality: selectedQuality,
        destination_dir: destDir,
        custom_filename: customFilename.trim() || undefined
      });

      // If user selected a local browser folder handle, write the file stream into their local folder!
      if (browserDirHandle) {
        try {
          setExportProgressText('Saving file into your selected Mac folder...');
          const fileRes = await fetch(api.getServerUrl(res.filepath));
          if (fileRes.ok) {
            const blob = await fileRes.blob();
            const fileHandle = await browserDirHandle.getFileHandle(res.filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
          }
        } catch (saveErr) {
          console.warn('Could not stream directly to browser-picked directory handle:', saveErr);
        }
      }

      setExportResult(res);
      if (onExportComplete) onExportComplete(res);
    } catch (err: any) {
      setExportError(err.message || 'Export conversion failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenInPlayer = async () => {
    if (!exportResult) return;
    try {
      await api.openInMacOSPlayer({ file_path: exportResult.filepath });
    } catch (e: any) {
      alert(`Could not open file: ${e.message}`);
    }
  };

  const handleRevealInFinder = async () => {
    if (!exportResult) return;
    try {
      await api.revealInFinder({ file_path: exportResult.filepath });
    } catch (e: any) {
      alert(`Could not reveal in Finder: ${e.message}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#111116] border border-white/[0.12] rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl space-y-6 p-6 sm:p-7 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-600/30">
              <Apple className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>macOS Video Export & File Manager</span>
                <Badge variant="purple" className="text-[10px] uppercase font-bold tracking-wider">
                  MacBook Optimized
                </Badge>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">
                {title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="py-16 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto" />
            <p className="text-xs text-zinc-400 font-mono">
              Inspecting video bitstream & macOS compatibility...
            </p>
          </div>
        ) : exportResult ? (
          /* SUCCESS STATE */
          <div className="space-y-6 py-2">
            <div className="p-5 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-white tracking-tight">
                Export Completed Successfully!
              </h4>
              <p className="text-xs text-emerald-300 font-mono">
                {exportResult.filename}
              </p>
            </div>

            {/* File Specifications Summary */}
            <div className="p-4 rounded-2xl bg-zinc-950/80 border border-white/[0.06] space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] text-[11px] text-zinc-400">
                <span>Format: <strong className="text-white">{exportResult.format_name}</strong></span>
                <span>Resolution: <strong className="text-white">{exportResult.resolution}</strong></span>
                <span>Size: <strong className="text-emerald-400 font-bold">{exportResult.size_mb} MB</strong></span>
              </div>
              <div className="text-[11px] font-mono text-zinc-400 break-all space-y-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500 block">Saved Path:</span>
                <span className="text-zinc-300 bg-black/40 p-1.5 rounded block">{exportResult.filepath}</span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <Button
                variant="primary"
                onClick={handleRevealInFinder}
                className="rounded-xl text-xs py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 shadow-md shadow-purple-900/40"
              >
                <Folder className="w-4 h-4 mr-2" /> Reveal in Finder
              </Button>
              <Button
                variant="secondary"
                onClick={handleOpenInPlayer}
                className="rounded-xl text-xs py-2.5 bg-white/[0.08] hover:bg-white/[0.14] text-white"
              >
                <Play className="w-4 h-4 mr-2 text-purple-400" /> Open in macOS Player
              </Button>
            </div>

            <div className="flex items-center justify-between pt-2">
              <a
                href={api.getServerUrl(exportResult.filepath)}
                download={exportResult.filename}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1.5 font-medium underline"
              >
                <Download className="w-3.5 h-3.5" /> Download copy via browser
              </a>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="rounded-xl text-xs text-zinc-400 hover:text-white"
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          /* CONFIGURATION FORM */
          <div className="space-y-5">
            {/* 1. Format Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                <span>1. Select macOS File Format</span>
                <span className="text-[10px] text-zinc-500 font-normal">FFmpeg Actual Transcoding</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {formats.map((fmt) => (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => setSelectedFormat(fmt.id)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-1 ${
                      selectedFormat === fmt.id
                        ? 'border-purple-500 bg-purple-950/30 text-white shadow-md shadow-purple-950/50'
                        : 'border-white/[0.06] bg-zinc-950/60 hover:bg-white/[0.04] text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold">{fmt.name}</span>
                      {fmt.apple_compatible && (
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 font-mono">
                          QuickTime Native
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 line-clamp-1 leading-relaxed">
                      {fmt.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Genuine Quality Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                <span>2. Export Resolution Quality</span>
                <span className="text-[10px] text-purple-400 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> No Fake 4K Upscaling
                </span>
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {qualities.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    disabled={!q.available}
                    onClick={() => setSelectedQuality(q.id)}
                    className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center ${
                      selectedQuality === q.id
                        ? 'border-purple-500 bg-purple-950/40 text-white font-bold ring-1 ring-purple-500'
                        : q.available
                        ? 'border-white/[0.06] bg-zinc-950/60 hover:bg-white/[0.04] text-zinc-300 cursor-pointer'
                        : 'border-white/[0.02] bg-zinc-950/20 text-zinc-600 opacity-50 cursor-not-allowed'
                    }`}
                    title={q.reason}
                  >
                    <span className="text-xs font-bold block">{q.id.toUpperCase()}</span>
                    <span className="text-[9px] text-zinc-500 block truncate max-w-full">
                      {q.available ? q.resolution : 'Unavailable'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Save Destination Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                <span>3. Save Location</span>
                <span className="text-[10px] text-zinc-500 font-normal">MacBook Folders</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {directories.map((dir) => (
                  <button
                    key={dir.id}
                    type="button"
                    onClick={() => {
                      setSelectedDirectory(dir.id);
                      setBrowserDirHandle(null);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedDirectory === dir.id
                        ? 'border-purple-500 bg-purple-950/40 text-white font-semibold'
                        : 'border-white/[0.06] bg-zinc-950/60 hover:bg-white/[0.04] text-zinc-400'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <Folder className="w-3.5 h-3.5 text-purple-400" />
                      <span>{dir.name}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 block mt-1">
                      {dir.free_space_gb > 0 ? `${dir.free_space_gb} GB free` : 'Mac folder'}
                    </span>
                  </button>
                ))}
              </div>

              {/* User-selected Folder via Browser API */}
              {isFileSystemAccessSupported && (
                <div className="pt-1 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={handlePickBrowserFolder}
                    className={`px-3 py-1.5 rounded-xl border text-xs flex items-center gap-2 transition-all cursor-pointer ${
                      selectedDirectory === 'browser_picked'
                        ? 'border-purple-500 bg-purple-950/40 text-purple-300 font-semibold'
                        : 'border-white/[0.08] bg-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5 text-cyan-400" />
                    <span>
                      {browserDirName ? `Selected: ${browserDirName}` : 'Choose Custom Mac Folder...'}
                    </span>
                  </button>
                  <span className="text-[11px] text-zinc-500 font-mono">
                    Native FileSystem API
                  </span>
                </div>
              )}
            </div>

            {/* 4. Filename Preview */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-400 block">
                Export Filename
              </label>
              <div className="flex items-center gap-2 bg-zinc-950 border border-white/[0.08] rounded-xl px-3 py-2 text-xs">
                <input
                  type="text"
                  value={customFilename}
                  onChange={(e) => setCustomFilename(e.target.value)}
                  placeholder="video_export_title"
                  className="bg-transparent text-white focus:outline-none flex-1 font-mono text-xs"
                />
                <span className="text-purple-400 font-mono font-bold">
                  {formats.find((f) => f.id === selectedFormat)?.extension || '.mp4'}
                </span>
              </div>
            </div>

            {/* Error banner */}
            {exportError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{exportError}</span>
              </div>
            )}

            {/* Progress status */}
            {isExporting && (
              <div className="p-3.5 rounded-2xl bg-purple-950/30 border border-purple-500/20 text-xs text-purple-300 flex items-center gap-3">
                <Loader2 className="w-4 h-4 text-purple-400 animate-spin shrink-0" />
                <span className="font-mono">{exportProgressText}</span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.08]">
              <Button
                variant="secondary"
                size="sm"
                onClick={onClose}
                disabled={isExporting}
                className="rounded-xl text-xs px-4"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleStartExport}
                isLoading={isExporting}
                className="rounded-xl text-xs px-5 bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 shadow-lg shadow-purple-900/30"
              >
                <Apple className="w-3.5 h-3.5 mr-1.5" />
                Start Export & Convert
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
