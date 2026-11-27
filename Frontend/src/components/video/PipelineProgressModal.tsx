'use client';

import React, { useState, useEffect } from 'react';
import { FullPipelineJobResponse, CandidateClip } from '@/types';
import { api } from '@/lib/api';
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Scissors,
  Download,
  Play,
  X,
  RotateCcw,
  Film,
  Zap,
  ArrowRight,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CircularScore } from '@/components/ui/CircularScore';

interface PipelineProgressModalProps {
  jobId: string;
  onClose?: () => void;
  onComplete?: (clips: CandidateClip[]) => void;
}

const PIPELINE_STEPS = [
  { index: 1, name: 'Extract Audio', desc: 'Mono 16kHz PCM stream via FFmpeg' },
  { index: 2, name: 'Speech Recognition', desc: 'Faster-Whisper word-level timestamps' },
  { index: 3, name: 'Visual Scene Detection', desc: 'PySceneDetect content cut boundaries' },
  { index: 4, name: '7-Criteria Moment Scoring', desc: 'Hook strength, story arcs & virality ranking' },
  { index: 5, name: 'Intelligent Reframing', desc: 'OpenCV YuNet face tracking & smooth 9:16 crop' },
  { index: 6, name: 'Animated Subtitles', desc: 'Speech-synced karaoke & keyword burn-in' },
];

export const PipelineProgressModal: React.FC<PipelineProgressModalProps> = ({
  jobId,
  onClose,
  onComplete,
}) => {
  const [job, setJob] = useState<FullPipelineJobResponse | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [previewClip, setPreviewClip] = useState<CandidateClip | null>(null);

  // Poll job status every 1.5 seconds
  useEffect(() => {
    let intervalId: any;
    let isMounted = true;

    const poll = async () => {
      try {
        const data = await api.pollPipeline(jobId);
        if (!isMounted) return;
        setJob(data);

        if (data.status === 'completed') {
          clearInterval(intervalId);
          if (onComplete) onComplete(data.completed_clips);
        } else if (data.status === 'failed') {
          clearInterval(intervalId);
        }
      } catch (err) {
        // Transient network or server reload dropout - retry on next tick
      }
    };

    poll();
    intervalId = setInterval(poll, 1500);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [jobId, onComplete]);

  // Handle Retry
  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const retried = await api.retryPipeline(jobId);
      setJob(retried);
    } catch (err) {
      console.error('Failed to retry pipeline:', err);
    } finally {
      setIsRetrying(false);
    }
  };

  const progress = job?.progress || 0;
  const isCompleted = job?.status === 'completed';
  const isFailed = job?.status === 'failed';

  // Compute active step index based on progress percentage
  const activeStepIndex = Math.min(
    6,
    Math.max(1, Math.ceil((progress / 100) * 6))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)] bg-[var(--surface)]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#595a45]/15 border border-[#595a45]/30 text-[#595a45] dark:text-[#9ca87d]">
              <Zap className="w-5 h-5 text-[#595a45] dark:text-[#9ca87d]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
                ClipGenius AI Pipeline Engine
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                    isCompleted
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : isFailed
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-[#595a45]/20 text-[#3a3d2e] dark:text-[#9ca87d] border border-[#595a45]/40'
                  }`}
                >
                  {isCompleted ? 'Completed' : isFailed ? 'Failed' : 'Processing'}
                </span>
              </h2>
              <p className="text-xs text-[var(--muted)]">Job ID: {jobId}</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Progress Bar & Status Message */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-[var(--foreground)] flex items-center gap-2">
                {!isCompleted && !isFailed && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#595a45] dark:text-[#9ca87d]" />}
                {job?.current_step || 'Initializing AI clipping pipeline...'}
              </span>
              <span className="font-mono font-bold text-[#595a45] dark:text-[#9ca87d] text-sm">{progress}%</span>
            </div>

            <div className="w-full bg-[var(--surface)] rounded-full h-2.5 overflow-hidden border border-[var(--card-border)]">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  isFailed
                    ? 'bg-red-500'
                    : isCompleted
                    ? 'bg-emerald-500'
                    : 'bg-gradient-to-r from-[#595a45] to-[#7d8863]'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>

            {job?.current_clip_title && (
              <p className="text-[11px] text-[var(--muted)] truncate">
                Active Clip: &ldquo;{job.current_clip_title}&rdquo;
              </p>
            )}
          </div>

          {/* 6-Stage Visual Workflow Tracker */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
            {PIPELINE_STEPS.map((step) => {
              const isPast = isCompleted || activeStepIndex > step.index;
              const isCurrent = !isCompleted && !isFailed && activeStepIndex === step.index;

              return (
                <div
                  key={step.index}
                  className={`p-3 rounded-xl border flex items-center gap-3 transition-all ${
                    isPast
                      ? 'border-emerald-500/20 bg-emerald-500/5 text-[var(--foreground)]'
                      : isCurrent
                      ? 'border-[#595a45] bg-[#595a45]/15 text-[var(--foreground)] shadow-md shadow-[#595a45]/10'
                      : 'border-[var(--card-border)] bg-[var(--surface)] text-[var(--muted)]'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                      isPast
                        ? 'bg-emerald-500 text-black'
                        : isCurrent
                        ? 'bg-[#595a45] text-white dark:bg-[#7d8863] dark:text-[#070807] animate-pulse'
                        : 'bg-[var(--card-border)] text-[var(--muted)]'
                    }`}
                  >
                    {isPast ? <CheckCircle2 className="w-3.5 h-3.5" /> : step.index}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold block truncate">{step.name}</span>
                    <span className="text-[10px] text-[var(--muted)] block truncate">{step.desc}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Failure Alert Banner */}
          {isFailed && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 space-y-2">
              <div className="flex items-center gap-2 text-red-500 font-bold text-xs">
                <AlertCircle className="w-4 h-4" />
                Processing Pipeline Encountered an Error
              </div>
              <p className="text-xs text-red-400 leading-relaxed">
                {job?.error_message || 'An unexpected error occurred during clipping or reframing.'}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRetry}
                disabled={isRetrying}
                className="mt-2 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                <RotateCcw className="w-3 h-3 mr-1.5" />
                Retry Processing
              </Button>
            </div>
          )}

          {/* Completed Clips Gallery (Live Stream as they finish) */}
          {job?.completed_clips && job.completed_clips.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider flex items-center gap-2">
                  <Film className="w-3.5 h-3.5 text-[#595a45] dark:text-[#9ca87d]" />
                  Generated Viral Shorts ({job.completed_clips.length})
                </h3>
                <span className="text-[11px] text-emerald-500 font-semibold">Ready for Download</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {job.completed_clips.map((clip) => (
                  <div
                    key={clip.id}
                    className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--card-border)] flex flex-col justify-between space-y-2 hover:border-[#595a45]/50 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-[var(--foreground)] block truncate">{clip.title}</span>
                        <span className="text-[10px] text-[var(--muted)]">{clip.duration.toFixed(1)}s • 9:16 Vertical</span>
                      </div>
                      <Badge variant="blue" className="text-[10px] shrink-0 font-mono font-bold">
                        {clip.virality_score} pts
                      </Badge>
                    </div>

                    <p className="text-[11px] text-[var(--muted)] line-clamp-2 italic">
                      &ldquo;{clip.hook || clip.transcript}&rdquo;
                    </p>

                    <div className="flex items-center gap-2 pt-1 border-t border-[var(--card-border)]">
                      <button
                        onClick={() => setPreviewClip(clip)}
                        className="flex-1 py-1 px-2 rounded-lg bg-[var(--card)] hover:bg-[var(--card-border)] text-[var(--foreground)] text-xs font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      >
                        <Play className="w-3 h-3" />
                        Preview
                      </button>

                      {clip.video_url && (
                        <a
                          href={api.getClipDownloadUrl(clip.id)}
                          download={`${clip.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_9x16.mp4`}
                          className="py-1 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          Download
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* End of Clips Showcase */}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--card-border)] bg-[var(--surface)] flex items-center justify-between">
          <p className="text-[11px] text-[var(--muted)]">
            Automated Speech-to-Shorts Pipeline • 100% Free &amp; Open-Source
          </p>
          {onClose && (
            <Button size="sm" variant="secondary" onClick={onClose} className="text-xs rounded-xl">
              {isCompleted ? 'Close & View Clips' : 'Minimize Window'}
            </Button>
          )}
        </div>
      </div>

      {/* Full-Screen Dedicated Vertical Short Preview Modal */}
      {previewClip && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="px-5 py-4 border-b border-[var(--card-border)] flex items-center justify-between bg-[var(--surface)]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#595a45]/20 border border-[#595a45]/30 flex items-center justify-center text-[#595a45] dark:text-[#9ca87d] shrink-0">
                  <Play className="w-4 h-4 fill-current" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[var(--foreground)] truncate">{previewClip.title}</h3>
                  <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                    <span className="font-mono text-emerald-500 font-semibold">
                      {Math.round(previewClip.virality_score || previewClip.scores?.overall_score || 85)}% Score
                    </span>
                    <span>•</span>
                    <span>{Math.round(previewClip.duration)}s</span>
                    <span>•</span>
                    <span className="text-[#595a45] dark:text-[#9ca87d] font-mono">9:16 Vertical Short</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewClip(null)}
                className="p-2 rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
                title="Close Preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video Player Box */}
            <div className="p-4 flex-1 overflow-hidden flex items-center justify-center bg-black/90">
              <div className="relative aspect-[9/16] h-[55vh] max-h-[520px] rounded-2xl overflow-hidden bg-black shadow-2xl border border-[var(--card-border)]">
                <video
                  src={api.getServerUrl(previewClip.video_url || `/generated-clips/${previewClip.id}_subtitled.mp4`)}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* Hook text */}
            {previewClip.hook && (
              <div className="px-5 py-2.5 bg-[var(--surface)] border-t border-[var(--card-border)] text-center">
                <p className="text-xs text-[var(--foreground)] italic line-clamp-2">
                  &ldquo;{previewClip.hook}&rdquo;
                </p>
              </div>
            )}

            {/* Actions Bar */}
            <div className="p-4 border-t border-[var(--card-border)] bg-[var(--surface)] flex items-center gap-3">
              <a
                href={api.getClipDownloadUrl(previewClip.id)}
                download={`${previewClip.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_9x16.mp4`}
                className="flex-1"
              >
                <button
                  type="button"
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download High-Quality 9:16 Short</span>
                </button>
              </a>
              <button
                type="button"
                onClick={() => setPreviewClip(null)}
                className="py-2.5 px-4 rounded-xl border border-[var(--card-border)] hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)] text-xs font-semibold transition-colors cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
