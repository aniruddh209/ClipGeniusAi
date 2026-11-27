'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  CropMode,
  ReframingAspectRatio,
  ReframePreviewResponse,
  CropKeyframe,
  CandidateClip,
} from '@/types';
import { api } from '@/lib/api';
import {
  Crop,
  Maximize2,
  Sliders,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Sparkles,
  User,
  Users,
  Eye,
  Download,
  AlertTriangle,
  CheckCircle2,
  X,
  ArrowLeft,
  Loader2,
  ArrowRightLeft,
  Smartphone,
  Square,
  Monitor,
} from 'lucide-react';

interface ReframingStudioProps {
  clip?: CandidateClip | null;
  videoId: string;
  sourceVideoUrl?: string;
  onClose?: () => void;
  onReframingComplete?: (outputVideoUrl: string) => void;
}

export const ReframingStudio: React.FC<ReframingStudioProps> = ({
  clip,
  videoId,
  sourceVideoUrl,
  onClose,
  onReframingComplete,
}) => {
  // Modes & Settings
  const [cropMode, setCropMode] = useState<CropMode>('smart_auto');
  const [aspectRatio, setAspectRatio] = useState<ReframingAspectRatio>('9:16');
  const [manualOffset, setManualOffset] = useState<number>(0.5); // 0.0 to 1.0

  // Preview Mode: 'canvas' (source with crop box) vs 'cropped' (simulated 9:16 output)
  const [viewMode, setViewMode] = useState<'canvas' | 'cropped'>('canvas');

  // Analysis State
  const [previewData, setPreviewData] = useState<ReframePreviewResponse | null>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Playback State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(clip?.duration || 10);
  const [isMuted, setIsMuted] = useState(false);

  // Render & Export State
  const [isRendering, setIsRendering] = useState(false);
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Video source URL
  const activeVideoUrl = api.getServerUrl(
    renderedVideoUrl || clip?.video_url || sourceVideoUrl || previewData?.video_url || null
  );

  // Fetch Reframing Analysis when mode, aspect ratio, or manual offset changes
  useEffect(() => {
    let isMounted = true;
    async function loadAnalysis() {
      setIsLoadingAnalysis(true);
      setAnalysisError(null);
      try {
        const res = await api.previewReframing({
          video_id: videoId,
          clip_id: clip?.id,
          start_time: clip?.start_time || 0.0,
          end_time: clip?.end_time || 0.0,
          target_aspect_ratio: aspectRatio,
          mode: cropMode,
          manual_crop_offset: manualOffset,
        });

        if (isMounted) {
          setPreviewData(res);
        }
      } catch (err: any) {
        if (isMounted) {
          setAnalysisError(err.message || 'Failed to analyze video reframing.');
        }
      } finally {
        if (isMounted) setIsLoadingAnalysis(false);
      }
    }

    loadAnalysis();
    return () => {
      isMounted = false;
    };
  }, [videoId, clip?.id, clip?.start_time, clip?.end_time, aspectRatio, cropMode, manualOffset]);

  // Current Interpolated Keyframe for Playback
  const currentKeyframe: CropKeyframe | null = useMemo(() => {
    if (!previewData || !previewData.keyframes || previewData.keyframes.length === 0) {
      return null;
    }

    const kfs = previewData.keyframes;
    // Find keyframe closest to currentTime
    let best = kfs[0];
    for (let i = 0; i < kfs.length; i++) {
      if (kfs[i].timestamp <= currentTime) {
        best = kfs[i];
      } else {
        break;
      }
    }
    return best;
  }, [previewData, currentTime]);

  // Toggle Play / Pause
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  // Handle Scrub
  const handleScrub = (time: number) => {
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  // Render Reframed Video
  const handleRenderReframedVideo = async () => {
    setIsRendering(true);
    setRenderError(null);
    try {
      const res = await api.renderReframing({
        video_id: videoId,
        clip_id: clip?.id,
        start_time: clip?.start_time || 0.0,
        end_time: clip?.end_time || 0.0,
        target_aspect_ratio: aspectRatio,
        mode: cropMode,
        manual_crop_offset: manualOffset,
        smooth_transitions: true,
      });

      if (res.status === 'completed' && res.output_video_url) {
        setRenderedVideoUrl(res.output_video_url);
        if (onReframingComplete) {
          onReframingComplete(res.output_video_url);
        }
      }
    } catch (err: any) {
      setRenderError(err.message || 'Reframing rendering failed.');
    } finally {
      setIsRendering(false);
    }
  };

  // Crop box dimensions in percentage for CSS overlay
  const cropBoxStyles = useMemo(() => {
    if (!previewData || !currentKeyframe) {
      return { left: '25%', top: '0%', width: '50%', height: '100%' };
    }

    const { source_width, source_height } = previewData;
    const { crop_x, crop_y, crop_w, crop_h } = currentKeyframe;

    const leftPct = (crop_x / source_width) * 100;
    const topPct = (crop_y / source_height) * 100;
    const widthPct = (crop_w / source_width) * 100;
    const heightPct = (crop_h / source_height) * 100;

    return {
      left: `${leftPct}%`,
      top: `${topPct}%`,
      width: `${widthPct}%`,
      height: `${heightPct}%`,
    };
  }, [previewData, currentKeyframe]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-neutral-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-neutral-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Crop className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Intelligent Video Reframing Studio
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-medium">
                  OpenCV YuNet
                </span>
              </h2>
              <p className="text-xs text-white/50">
                Automatic speaker tracking &amp; smooth vertical framing for Shorts &amp; Reels
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (onClose) onClose();
                else window.history.back();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              onClick={() => {
                if (onClose) onClose();
                else window.history.back();
              }}
              className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-y-auto">
          {/* Left Column: Visual Framing Canvas */}
          <div className="lg:col-span-7 flex flex-col items-center">
            {/* View Mode Switcher */}
            <div className="w-full flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode('canvas')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    viewMode === 'canvas'
                      ? 'bg-blue-600 text-white'
                      : 'bg-neutral-900 text-white/60 hover:text-white'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Source + Crop Window
                </button>

                <button
                  onClick={() => setViewMode('cropped')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    viewMode === 'cropped'
                      ? 'bg-blue-600 text-white'
                      : 'bg-neutral-900 text-white/60 hover:text-white'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  Cropped Preview
                </button>
              </div>

              {/* Telemetry Badge */}
              {previewData && (
                <div className="flex items-center gap-1.5">
                  {previewData.detection_status === 'active_tracking' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" />
                      Face Tracking Active ({previewData.total_faces_found} faces)
                    </span>
                  ) : previewData.detection_status === 'fallback_center' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-300">
                      <AlertTriangle className="w-3 h-3" />
                      Center Safe Fallback
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-500/15 border border-blue-500/30 text-blue-300">
                      <Sliders className="w-3 h-3" />
                      Manual Offset ({Math.round(manualOffset * 100)}%)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Video Canvas Container */}
            <div className="relative w-full aspect-video rounded-2xl bg-black border border-white/10 shadow-2xl overflow-hidden flex items-center justify-center select-none">
              {viewMode === 'canvas' ? (
                /* Source Video with Interactive Dynamic Crop Bounding Box */
                <div className="relative w-full h-full">
                  <video
                    ref={videoRef}
                    src={activeVideoUrl}
                    className="w-full h-full object-contain"
                    playsInline
                    onTimeUpdate={(e) => {
                      setCurrentTime(e.currentTarget.currentTime);
                      setDuration(e.currentTarget.duration || clip?.duration || 10);
                    }}
                  />

                  {/* Dynamic Crop Overlay Rectangle */}
                  <div
                    className="absolute border-2 border-blue-400 bg-blue-500/10 shadow-[0_0_20px_rgba(89,90,69,0.35)] transition-all duration-150 pointer-events-none rounded-lg flex flex-col justify-between p-2"
                    style={cropBoxStyles}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono font-bold text-blue-300 bg-neutral-900/80 px-2 py-0.5 rounded backdrop-blur-sm self-start">
                      <span>{aspectRatio} CROP</span>
                    </div>

                    {/* Active Speaker Target Indicator */}
                    {currentKeyframe?.speaker_x != null && previewData && (
                      <div className="self-center flex items-center gap-1 text-[10px] font-bold text-yellow-300 bg-neutral-900/80 px-2 py-0.5 rounded-full border border-yellow-400/30 backdrop-blur-sm">
                        <Sparkles className="w-3 h-3 text-yellow-400" />
                        Speaker In-Frame
                      </div>
                    )}
                  </div>

                  {/* Face Detection Bounding Boxes */}
                  {currentKeyframe?.faces &&
                    currentKeyframe.faces.map((f, i) => {
                      if (!previewData) return null;
                      const fLeft = (f.x / previewData.source_width) * 100;
                      const fTop = (f.y / previewData.source_height) * 100;
                      const fW = (f.w / previewData.source_width) * 100;
                      const fH = (f.h / previewData.source_height) * 100;

                      return (
                        <div
                          key={`face-${i}`}
                          className={`absolute border rounded transition-all duration-150 pointer-events-none ${
                            f.is_speaker
                              ? 'border-yellow-400 bg-yellow-400/15 shadow-[0_0_12px_rgba(250,204,21,0.5)]'
                              : 'border-cyan-400/80 bg-cyan-400/10'
                          }`}
                          style={{
                            left: `${fLeft}%`,
                            top: `${fTop}%`,
                            width: `${fW}%`,
                            height: `${fH}%`,
                          }}
                        >
                          <span
                            className={`absolute -top-5 left-0 text-[9px] font-mono font-bold px-1 rounded ${
                              f.is_speaker ? 'bg-yellow-400 text-black' : 'bg-cyan-500 text-black'
                            }`}
                          >
                            {f.is_speaker ? 'SPEAKER' : 'FACE'}
                          </span>
                        </div>
                      );
                    })}
                </div>
              ) : (
                /* Cropped Vertical Preview View */
                <div
                  className={`relative overflow-hidden rounded-xl bg-black ${
                    aspectRatio === '9:16'
                      ? 'aspect-[9/16] h-full max-h-[380px]'
                      : aspectRatio === '1:1'
                      ? 'aspect-square h-full max-h-[380px]'
                      : 'aspect-video w-full'
                  }`}
                >
                  <video
                    ref={videoRef}
                    src={activeVideoUrl}
                    className="w-full h-full object-cover"
                    playsInline
                    onTimeUpdate={(e) => {
                      setCurrentTime(e.currentTarget.currentTime);
                      setDuration(e.currentTarget.duration || clip?.duration || 10);
                    }}
                  />
                  <div className="absolute top-2 left-2 text-[10px] font-mono font-bold text-white/70 bg-black/60 px-2 py-0.5 rounded backdrop-blur-sm">
                    {aspectRatio} PREVIEW
                  </div>
                </div>
              )}
            </div>

            {/* Playback Controls & Scrubber */}
            <div className="w-full mt-3 p-3 rounded-xl bg-neutral-900/80 border border-white/10 flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={togglePlay}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>

                {/* Scrubber slider */}
                <input
                  type="range"
                  min={0}
                  max={duration || 10}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => handleScrub(parseFloat(e.target.value))}
                  className="flex-1 h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />

                <button
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.muted = !isMuted;
                      setIsMuted(!isMuted);
                    }
                  }}
                  className="p-2 rounded-lg text-white/60 hover:text-white transition-colors"
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] text-white/50 px-1">
                <span>{currentTime.toFixed(1)}s</span>
                <span>{duration.toFixed(1)}s</span>
              </div>
            </div>

            {/* Fallback Notice Banner */}
            {previewData?.fallback_reason && cropMode === 'smart_auto' && (
              <div className="w-full mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <div>
                  <span className="font-semibold block">Graceful Fallback Active:</span>
                  <p className="text-[11px] text-amber-200/80 mt-0.5">
                    {previewData.fallback_reason}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Reframing Controls */}
          <div className="lg:col-span-5 flex flex-col justify-between">
            <div className="space-y-5">
              {/* 1. Cropping Modes */}
              <div>
                <label className="text-xs font-bold text-white block mb-2">
                  Cropping Mode
                </label>
                <div className="grid grid-cols-1 gap-2.5">
                  {[
                    {
                      id: 'smart_auto',
                      title: 'Smart Auto Crop',
                      desc: 'Tracks main speaker with smooth camera panning',
                      icon: Sparkles,
                      badge: 'AI Powered',
                    },
                    {
                      id: 'center_crop',
                      title: 'Center Crop',
                      desc: 'Fixed static crop centered on source video',
                      icon: Maximize2,
                      badge: 'Fallback',
                    },
                    {
                      id: 'manual_crop',
                      title: 'Manual Crop',
                      desc: 'Custom framing slider (Left, Center, Right)',
                      icon: Sliders,
                      badge: 'Custom',
                    },
                  ].map((modeItem) => {
                    const isSelected = cropMode === modeItem.id;
                    const Icon = modeItem.icon;
                    return (
                      <button
                        key={modeItem.id}
                        onClick={() => setCropMode(modeItem.id as CropMode)}
                        className={`flex items-start text-left p-3 rounded-xl border transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-500/15 shadow-lg shadow-blue-500/10'
                            : 'border-white/10 bg-neutral-900/60 hover:border-white/20 hover:bg-neutral-900'
                        }`}
                      >
                        <div
                          className={`p-2 rounded-lg mr-3 ${
                            isSelected ? 'bg-blue-600 text-white' : 'bg-white/5 text-white/50'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">
                              {modeItem.title}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/70 font-mono">
                              {modeItem.badge}
                            </span>
                          </div>
                          <p className="text-[11px] text-white/50 mt-1">{modeItem.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Manual Crop Offset Slider (Visible only in Manual Crop Mode) */}
              {cropMode === 'manual_crop' && (
                <div className="p-4 rounded-xl bg-neutral-900/70 border border-white/10 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-white/80">Crop Horizontal Offset</span>
                    <span className="text-blue-400 font-mono font-bold">
                      {Math.round(manualOffset * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.0}
                    max={1.0}
                    step={0.02}
                    value={manualOffset}
                    onChange={(e) => setManualOffset(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <div className="flex justify-between text-[10px] text-white/40">
                    <span>Left Edge (0%)</span>
                    <span>Center (50%)</span>
                    <span>Right Edge (100%)</span>
                  </div>
                </div>
              )}

              {/* 3. Target Aspect Ratio Selector */}
              <div>
                <label className="text-xs font-bold text-white block mb-2">
                  Target Aspect Ratio
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: '9:16', label: '9:16 Vertical', sub: 'Shorts/Reels', icon: Smartphone },
                    { id: '1:1', label: '1:1 Square', sub: 'IG/LinkedIn', icon: Square },
                    { id: '16:9', label: '16:9 Wide', sub: 'YouTube', icon: Monitor },
                  ].map((ratioItem) => {
                    const isSelected = aspectRatio === ratioItem.id;
                    const Icon = ratioItem.icon;
                    return (
                      <button
                        key={ratioItem.id}
                        onClick={() => setAspectRatio(ratioItem.id as ReframingAspectRatio)}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-500/15 text-white'
                            : 'border-white/10 bg-neutral-900/60 text-white/60 hover:text-white hover:bg-neutral-900'
                        }`}
                      >
                        <Icon className="w-4 h-4 mb-1 text-blue-400" />
                        <span className="text-xs font-bold">{ratioItem.label}</span>
                        <span className="text-[10px] text-white/40 mt-0.5">{ratioItem.sub}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. Speaker Tracking Stats */}
              {previewData && (
                <div className="p-3.5 rounded-xl bg-neutral-900/50 border border-white/5 space-y-2 text-xs">
                  <span className="text-white/60 font-semibold block text-[11px] uppercase tracking-wider">
                    AI Tracking Telemetry
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded-lg bg-neutral-950 border border-white/5">
                      <span className="text-white/40 block">Speaker Switches</span>
                      <span className="text-white font-mono font-bold text-sm">
                        {previewData.speaker_switches}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-neutral-950 border border-white/5">
                      <span className="text-white/40 block">Camera Smoothing</span>
                      <span className="text-emerald-400 font-bold text-xs flex items-center gap-1 mt-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Anti-Jitter Active
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div className="mt-6 pt-4 border-t border-white/10 flex flex-col gap-2">
              {renderError && (
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                  {renderError}
                </div>
              )}

              {renderedVideoUrl ? (
                <a
                  href={api.getServerUrl(renderedVideoUrl)}
                  download
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 transition-all"
                >
                  <Download className="w-4 h-4" />
                  Download Reframed {aspectRatio} Video
                </a>
              ) : (
                <button
                  onClick={handleRenderReframedVideo}
                  disabled={isRendering || isLoadingAnalysis}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50"
                >
                  {isRendering ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Reframing with FFmpeg &amp; OpenCV...
                    </>
                  ) : (
                    <>
                      <Crop className="w-4 h-4" />
                      Render Reframed Video ({aspectRatio})
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
