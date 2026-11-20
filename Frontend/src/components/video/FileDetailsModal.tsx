'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  FileVideo,
  Folder,
  Play,
  Trash2,
  Apple,
  Info,
  Calendar,
  Layers,
  Volume2,
  HardDrive,
  Loader2,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';
import { FileSpecsInfo } from '@/types';

interface FileDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  filePath?: string;
  taskId?: string;
  clipId?: string;
  videoId?: string;
  onDeleted?: (deletedPath: string) => void;
  onOpenExport?: () => void;
}

export const FileDetailsModal: React.FC<FileDetailsModalProps> = ({
  isOpen,
  onClose,
  filePath,
  taskId,
  clipId,
  videoId,
  onDeleted,
  onOpenExport
}) => {
  const [info, setInfo] = useState<FileSpecsInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setInfo(null);
      setShowConfirmDelete(false);
      setActionMessage(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setActionMessage(null);

    api.getFileInfo({
      path: filePath,
      task_id: taskId,
      clip_id: clipId,
      video_id: videoId
    })
      .then((data) => {
        if (isMounted) setInfo(data);
      })
      .catch((e) => {
        console.error('Failed to get file info:', e);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, filePath, taskId, clipId, videoId]);

  const handleOpenPlayer = async () => {
    if (!info) return;
    try {
      const res = await api.openInMacOSPlayer({ file_path: info.filepath });
      setActionMessage(res.message);
      setTimeout(() => setActionMessage(null), 3000);
    } catch (e: any) {
      alert(`Could not open file in macOS player: ${e.message}`);
    }
  };

  const handleRevealFinder = async () => {
    if (!info) return;
    try {
      const res = await api.revealInFinder({ file_path: info.filepath });
      setActionMessage(res.message);
      setTimeout(() => setActionMessage(null), 3000);
    } catch (e: any) {
      alert(`Could not reveal in Finder: ${e.message}`);
    }
  };

  const handleDeletePermanent = async () => {
    if (!info) return;
    setIsDeleting(true);
    try {
      await api.deleteFile({
        file_path: info.filepath,
        task_id: taskId,
        clip_id: clipId,
        video_id: videoId
      });
      if (onDeleted) onDeleted(info.filepath);
      onClose();
    } catch (e: any) {
      alert(`Delete failed: ${e.message}`);
    } finally {
      setIsDeleting(false);
      setShowConfirmDelete(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#111116] border border-white/[0.12] rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl space-y-5 p-6 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-950/60 border border-purple-500/30 text-purple-400 flex items-center justify-center">
              <FileVideo className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">
                macOS File Information & Operations
              </h3>
              <p className="text-[11px] text-zinc-400 font-mono truncate max-w-xs">
                {info?.filename || 'Loading specifications...'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.08]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="py-12 text-center space-y-2">
            <Loader2 className="w-6 h-6 text-purple-400 animate-spin mx-auto" />
            <p className="text-xs text-zinc-400">Inspecting file headers on disk...</p>
          </div>
        ) : info ? (
          <div className="space-y-4">
            {actionMessage && (
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2 font-mono">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{actionMessage}</span>
              </div>
            )}

            {/* Specs Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-zinc-950/70 border border-white/[0.04] space-y-0.5">
                <span className="text-[10px] text-zinc-500 uppercase font-semibold">File Size</span>
                <p className="font-bold text-emerald-400 font-mono">{info.size_mb} MB</p>
                <span className="text-[9px] text-zinc-600 block font-mono">{info.size_bytes.toLocaleString()} B</span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-950/70 border border-white/[0.04] space-y-0.5">
                <span className="text-[10px] text-zinc-500 uppercase font-semibold">Resolution</span>
                <p className="font-bold text-white font-mono">{info.resolution || 'N/A'}</p>
                <span className="text-[9px] text-zinc-400 block">{info.fps ? `${info.fps} fps` : ''}</span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-950/70 border border-white/[0.04] space-y-0.5">
                <span className="text-[10px] text-zinc-500 uppercase font-semibold">Video Codec</span>
                <p className="font-bold text-purple-400 font-mono uppercase">{info.video_codec || 'N/A'}</p>
                <span className="text-[9px] text-zinc-500 block">Audio: {info.audio_codec || 'aac'}</span>
              </div>
            </div>

            {/* Exact Location */}
            <div className="p-3 rounded-xl bg-zinc-950/90 border border-white/[0.06] text-xs space-y-1">
              <span className="text-[10px] uppercase font-bold text-zinc-500 block">Exact macOS Path</span>
              <p className="font-mono text-zinc-300 text-[11px] break-all select-all bg-black/40 p-2 rounded-lg">
                {info.filepath}
              </p>
            </div>

            {/* Confirmation delete alert */}
            {showConfirmDelete ? (
              <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-500/30 text-xs space-y-3">
                <div className="flex items-center gap-2 text-rose-300 font-bold">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Confirm Permanent Deletion</span>
                </div>
                <p className="text-zinc-300 text-[11px] leading-relaxed">
                  Are you sure you want to delete <strong className="text-white">{info.filename}</strong>? This action permanently removes the {info.size_mb} MB file from your MacBook.
                </p>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowConfirmDelete(false)}
                    className="rounded-xl text-xs text-zinc-400"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleDeletePermanent}
                    isLoading={isDeleting}
                    className="rounded-xl text-xs bg-rose-600 hover:bg-rose-500 text-white"
                  >
                    Delete Permanently
                  </Button>
                </div>
              </div>
            ) : (
              /* Action Buttons */
              <div className="space-y-2 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRevealFinder}
                    className="rounded-xl text-xs py-2 bg-white/[0.06] hover:bg-white/[0.12] text-white"
                  >
                    <Folder className="w-3.5 h-3.5 mr-1.5 text-purple-400" /> Reveal in Finder
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleOpenPlayer}
                    className="rounded-xl text-xs py-2 bg-white/[0.06] hover:bg-white/[0.12] text-white"
                  >
                    <Play className="w-3.5 h-3.5 mr-1.5 text-cyan-400" /> Open in Mac Player
                  </Button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                  {onOpenExport && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        onClose();
                        onOpenExport();
                      }}
                      className="rounded-xl text-xs"
                    >
                      <Apple className="w-3.5 h-3.5 mr-1.5" /> Export / Convert
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowConfirmDelete(true)}
                    className="rounded-xl text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 ml-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete File
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-zinc-500">
            File details could not be retrieved.
          </div>
        )}
      </div>
    </div>
  );
};
