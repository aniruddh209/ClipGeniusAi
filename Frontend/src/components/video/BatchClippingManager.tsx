'use client';

import React, { useState, useEffect } from 'react';
import { 
  Scissors, 
  Play, 
  Download, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Film, 
  Smartphone, 
  Square, 
  Monitor, 
  Clock, 
  Check, 
  XCircle,
  ExternalLink,
  RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { CandidateClip, BatchCutJobResponse, FailedClipItem } from '@/types';
import { formatDuration } from '@/lib/utils';

interface BatchClippingManagerProps {
  videoId: string;
  clips: CandidateClip[];
  onClipsUpdated?: (updatedClips: CandidateClip[]) => void;
  onPreviewClip?: (clip: CandidateClip) => void;
}

export const BatchClippingManager: React.FC<BatchClippingManagerProps> = ({
  videoId,
  clips,
  onClipsUpdated,
  onPreviewClip,
}) => {
  // Export format selection (Default: 9:16 Vertical 1080x1920)
  const [exportFormat, setExportFormat] = useState<'9:16' | '1:1' | '16:9'>('9:16');
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  
  // Batch processing job states
  const [currentJob, setCurrentJob] = useState<BatchCutJobResponse | null>(null);
  const [isStartingJob, setIsStartingJob] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewingVideoUrl, setPreviewingVideoUrl] = useState<string | null>(null);

  // Initialize selected clip IDs to all clips when clips load
  useEffect(() => {
    if (clips && clips.length > 0 && selectedClipIds.length === 0) {
      setSelectedClipIds(clips.map((c) => c.id));
    }
  }, [clips]);

  // Polling effect for batch cut job
  useEffect(() => {
    if (!currentJob || currentJob.status === 'completed' || (currentJob.status === 'failed' && currentJob.total_clips === 0)) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const jobData: BatchCutJobResponse = await api.pollBatchCutJob(currentJob.job_id);
        setCurrentJob(jobData);

        if (jobData.completed_clips && jobData.completed_clips.length > 0 && onClipsUpdated) {
          // Merge completed clips into parent state
          const updated = clips.map((orig) => {
            const match = jobData.completed_clips.find((c) => c.id === orig.id);
            return match || orig;
          });
          onClipsUpdated(updated);
        }

        if (jobData.status === 'completed' || jobData.status === 'partially_failed' || jobData.status === 'failed') {
          clearInterval(interval);
        }
      } catch (err: any) {
        console.warn('Batch cut job polling warning:', err);
      }
    }, 1200);

    return () => clearInterval(interval);
  }, [currentJob, clips, onClipsUpdated]);

  const handleToggleSelectAll = () => {
    if (selectedClipIds.length === clips.length) {
      setSelectedClipIds([]);
    } else {
      setSelectedClipIds(clips.map((c) => c.id));
    }
  };

  const handleToggleClip = (id: string) => {
    if (selectedClipIds.includes(id)) {
      setSelectedClipIds(selectedClipIds.filter((cid) => cid !== id));
    } else {
      setSelectedClipIds([...selectedClipIds, id]);
    }
  };

  const handleStartBatchCut = async () => {
    if (selectedClipIds.length === 0) {
      setErrorMessage('Please select at least one clip candidate to cut.');
      return;
    }

    setErrorMessage(null);
    setIsStartingJob(true);

    try {
      const resp: BatchCutJobResponse = await api.startBatchCut(
        videoId,
        selectedClipIds,
        exportFormat
      );
      setCurrentJob(resp);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to dispatch batch video cutting job.');
    } finally {
      setIsStartingJob(false);
    }
  };

  const handleRetryFailedClips = async () => {
    if (!currentJob) return;
    setIsRetrying(true);
    setErrorMessage(null);

    try {
      const resp: BatchCutJobResponse = await api.retryFailedClips(currentJob.job_id);
      setCurrentJob(resp);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to retry clipping job.');
    } finally {
      setIsRetrying(false);
    }
  };

  const isJobProcessing = Boolean(currentJob && (currentJob.status === 'queued' || currentJob.status === 'processing'));

  return (
    <div className="space-y-6">
      {/* 1. Format Selection & Batch Cut Action Bar */}
      <Card className="p-5 rounded-2xl bg-gradient-to-r from-blue-950/20 via-slate-950 to-slate-950 border-white/[0.08] shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-white/[0.06]">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
              <Scissors className="w-4 h-4 text-blue-400" />
              Automatic Video Clipping Engine
            </span>
            <p className="text-xs text-zinc-400 mt-0.5">
              Cuts original footage using frame-accurate timestamps, zero audio drift, and export formatting.
            </p>
          </div>

          {/* Export Format Selector */}
          <div className="flex p-1 rounded-xl bg-zinc-900 border border-white/[0.08] self-start sm:self-auto">
            {[
              { id: '9:16', label: '9:16 Vertical', desc: '1080×1920', icon: Smartphone },
              { id: '1:1', label: '1:1 Square', desc: '1080×1080', icon: Square },
              { id: '16:9', label: '16:9 Landscape', desc: '1920×1080', icon: Monitor },
            ].map((fmt) => {
              const Icon = fmt.icon;
              const isSelected = exportFormat === fmt.id;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  disabled={isJobProcessing}
                  onClick={() => setExportFormat(fmt.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40 shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{fmt.label}</span>
                  <span className="text-[10px] text-zinc-500 hidden md:inline">({fmt.desc})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selection & Batch CTA Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isJobProcessing}
              onClick={handleToggleSelectAll}
              className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 py-1 px-2 rounded-lg bg-zinc-900/60 border border-white/[0.06] cursor-pointer"
            >
              <div
                className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                  selectedClipIds.length === clips.length && clips.length > 0
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'border-zinc-600'
                }`}
              >
                {selectedClipIds.length === clips.length && clips.length > 0 && (
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                )}
              </div>
              <span>
                {selectedClipIds.length === clips.length ? 'Deselect All' : 'Select All'} ({selectedClipIds.length}/{clips.length})
              </span>
            </button>
            <span className="text-[11px] text-zinc-500 font-mono">
              Target: {exportFormat === '9:16' ? '1080×1920 (Default)' : exportFormat === '1:1' ? '1080×1080' : '1920×1080'}
            </span>
          </div>

          <Button
            onClick={handleStartBatchCut}
            disabled={isJobProcessing || selectedClipIds.length === 0}
            isLoading={isStartingJob || isJobProcessing}
            variant="primary"
            size="md"
            className="rounded-xl px-5 text-xs shadow-lg shadow-blue-600/30"
          >
            <Scissors className="w-3.5 h-3.5 mr-1.5" />
            {isJobProcessing
              ? 'Cutting Clips in Background...'
              : `Cut ${selectedClipIds.length} Clip${selectedClipIds.length !== 1 ? 's' : ''} with FFmpeg`}
          </Button>
        </div>
      </Card>

      {/* ERROR ALERT */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-zinc-400 hover:text-white">✕</button>
        </div>
      )}

      {/* 2. REAL-TIME JOB PROCESSING STATUS PANEL */}
      {currentJob && (
        <Card className="p-6 rounded-3xl bg-[#0a0a0a] border border-blue-500/30 shadow-2xl space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              {isJobProcessing ? (
                <div className="w-8 h-8 rounded-xl bg-blue-950/70 border border-blue-800/60 text-blue-400 flex items-center justify-center">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                </div>
              ) : currentJob.status === 'completed' ? (
                <div className="w-8 h-8 rounded-xl bg-emerald-950/70 border border-emerald-800/60 text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-xl bg-amber-950/70 border border-amber-800/60 text-amber-400 flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                </div>
              )}

              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-white">
                    {isJobProcessing
                      ? 'Background Video Cutting Engine Active'
                      : currentJob.status === 'completed'
                      ? 'Video Cutting Batch Complete'
                      : 'Clipping Batch Finished with Warnings'}
                  </h4>
                  <Badge
                    variant={
                      currentJob.status === 'completed'
                        ? 'success'
                        : isJobProcessing
                        ? 'blue'
                        : 'warning'
                    }
                    className="text-[10px]"
                  >
                    {currentJob.status}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {currentJob.current_step || 'Processing video jobs...'}
                </p>
              </div>
            </div>

            {/* Current Clip Indicator */}
            {currentJob.current_clip_title && (
              <div className="px-3 py-1.5 rounded-xl bg-blue-950/30 border border-blue-500/30 text-xs text-blue-300 flex items-center gap-2">
                <Film className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="font-semibold line-clamp-1">
                  Active: &quot;{currentJob.current_clip_title}&quot;
                </span>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-zinc-400">
                Processed {currentJob.completed_clips.length} of {currentJob.total_clips} clips ({currentJob.aspect_ratio})
              </span>
              <span className="text-blue-400 font-bold">{currentJob.progress}%</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-400 h-full rounded-full transition-all duration-300"
                style={{ width: `${currentJob.progress}%` }}
              />
            </div>
          </div>

          {/* 3. FAILED CLIPS LIST & RETRY OPTION */}
          {currentJob.failed_clips && currentJob.failed_clips.length > 0 && (
            <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-800/50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-rose-300 text-xs font-bold">
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Failed Clips ({currentJob.failed_clips.length})</span>
                </div>
                <Button
                  onClick={handleRetryFailedClips}
                  isLoading={isRetrying}
                  size="sm"
                  variant="outline"
                  className="rounded-xl text-xs text-rose-300 border-rose-700/60 hover:bg-rose-950/60"
                >
                  <RotateCcw className="w-3 h-3 mr-1.5" /> Retry Failed Clips
                </Button>
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {currentJob.failed_clips.map((fail, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-zinc-950/80 border border-rose-900/40 text-xs flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="font-semibold text-white line-clamp-1">{fail.title}</p>
                      <p className="text-[11px] text-rose-400 mt-0.5 line-clamp-1">Error: {fail.error}</p>
                    </div>
                    <Badge variant="warning" className="text-[10px] shrink-0">Failed</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. COMPLETED CLIPS GALLERY (Independent playable files) */}
          {currentJob.completed_clips && currentJob.completed_clips.length > 0 && (
            <div className="space-y-3 pt-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Completed Independent Video Files ({currentJob.completed_clips.length})
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {currentJob.completed_clips.map((clip) => {
                  const videoStreamUrl = clip.video_url ? api.getServerUrl(clip.video_url) : '';
                  const thumbStreamUrl = clip.thumbnail_url ? api.getServerUrl(clip.thumbnail_url) : '';

                  return (
                    <div
                      key={clip.id}
                      className="p-3 rounded-2xl bg-zinc-950 border border-white/[0.08] hover:border-emerald-500/40 transition-all flex flex-col justify-between space-y-2.5 shadow-lg"
                    >
                      {/* Video Player or Thumbnail */}
                      <div className="relative rounded-xl overflow-hidden aspect-video bg-black border border-white/[0.06] group">
                        {previewingVideoUrl === videoStreamUrl ? (
                          <video
                            src={videoStreamUrl}
                            controls
                            autoPlay
                            playsInline
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <>
                            {thumbStreamUrl ? (
                              <img
                                src={thumbStreamUrl}
                                alt={clip.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-zinc-600">
                                <Film className="w-6 h-6" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => setPreviewingVideoUrl(videoStreamUrl)}
                                className="p-2 rounded-full bg-blue-600 text-white hover:scale-110 transition-transform cursor-pointer shadow-lg"
                                title="Play Video in Player"
                              >
                                <Play className="w-4 h-4 fill-white ml-0.5" />
                              </button>
                            </div>
                          </>
                        )}

                        <div className="absolute bottom-1.5 left-1.5 z-10 text-[9px] font-mono text-zinc-300 bg-black/75 px-1.5 py-0.5 rounded">
                          {Math.round(clip.duration)}s • {clip.aspect_ratio || exportFormat}
                        </div>
                      </div>

                      {/* Title & Actions */}
                      <div className="space-y-1">
                        <h6 className="text-xs font-bold text-white line-clamp-1">{clip.title}</h6>
                        <span className="text-[10px] text-zinc-500 font-mono block">
                          Format: {clip.aspect_ratio === '9:16' ? '1080×1920' : clip.aspect_ratio === '1:1' ? '1080×1080' : '1920×1080'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t border-white/[0.06]">
                        {videoStreamUrl && (
                          <a
                            href={videoStreamUrl}
                            download={`${clip.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${(clip.aspect_ratio || exportFormat).replace(':', 'x')}.mp4`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 inline-flex items-center justify-center py-1.5 px-3 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/40 transition-all cursor-pointer whitespace-nowrap"
                          >
                            <Download className="w-3 h-3 mr-1" /> Download MP4
                          </a>
                        )}
                        <Button
                          onClick={() => onPreviewClip && onPreviewClip(clip)}
                          size="sm"
                          variant="secondary"
                          className="rounded-xl px-2.5 py-1.5 text-xs"
                          title="Seek source video player"
                        >
                          <Clock className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};
