'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { 
  Scissors, 
  Sparkles, 
  Sliders, 
  Subtitles, 
  Smartphone, 
  CheckCircle2, 
  AlertCircle, 
  Info,
  ArrowRight,
  ArrowLeft,
  Link as LinkIcon,
  Play,
  Film,
  Crop,
  Flame,
  Cpu,
  Loader2,
  Gamepad2,
  Mic,
  Video,
  BookOpen,
  Layers,
  Tv,
  Eye,
  VolumeX,
  Maximize2,
  Minimize2,
  Check,
  User,
  Globe
} from 'lucide-react';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { VideoUploadZone } from '@/components/video/VideoUploadZone';
import { TranscriptionPanel } from '@/components/transcription/TranscriptionPanel';
import { ClipDetectionPanel } from '@/components/video/ClipDetectionPanel';
import { ReframingStudio } from '@/components/video/ReframingStudio';
import { SubtitleEditor } from '@/components/video/SubtitleEditor';
import { PipelineProgressModal } from '@/components/video/PipelineProgressModal';
import { api } from '@/lib/api';
import { VideoItem, TranscriptionResponse, CandidateClip, ProbeUrlResponse } from '@/types';
import { useRouter, useSearchParams } from 'next/navigation';

function CreateClipsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const videoIdParam = searchParams.get('video_id');

  // Ingest mode tab: 'upload' | 'direct_cloud' | 'url'
  const [ingestMode, setIngestMode] = useState<'upload' | 'direct_cloud' | 'url'>('upload');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isDownloadingUrl, setIsDownloadingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  // Direct Cloud URL (Zero-Download Range-Seeking)
  const [cloudUrl, setCloudUrl] = useState('');
  const [isProbingCloudUrl, setIsProbingCloudUrl] = useState(false);
  const [cloudProbeResult, setCloudProbeResult] = useState<ProbeUrlResponse | null>(null);
  const [cloudProbeError, setCloudProbeError] = useState<string | null>(null);
  const [isRegisteringCloud, setIsRegisteringCloud] = useState(false);

  // Active uploaded video state
  const [activeVideo, setActiveVideo] = useState<VideoItem | null>(null);
  const [isLoadingParamVideo, setIsLoadingParamVideo] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState<TranscriptionResponse | null>(null);
  const [detectedClips, setDetectedClips] = useState<CandidateClip[]>([]);
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [studioTab, setStudioTab] = useState<'clips' | 'transcript' | 'reframing' | 'subtitles'>('clips');

  // Automatically load project video when navigating from /dashboard/projects?video_id=...
  useEffect(() => {
    if (!videoIdParam) return;
    let isMounted = true;
    setIsLoadingParamVideo(true);
    api.getVideo(videoIdParam)
      .then((vid) => {
        if (!isMounted || !vid) return;
        setActiveVideo(vid);
        setIngestMode('upload');
        // Fetch any existing clips or transcript for instant preview
        api.getClips(vid.id).then((res) => {
          if (isMounted && res && res.clips && res.clips.length > 0) {
            setDetectedClips(res.clips);
          }
        }).catch(() => {});
        api.getTranscription(vid.id).then((trans) => {
          if (isMounted && trans) {
            setCurrentTranscript(trans);
          }
        }).catch(() => {});
      })
      .catch((err) => {
        console.warn('Could not load project video from query param:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingParamVideo(false);
      });

    return () => { isMounted = false; };
  }, [videoIdParam]);

  // Clip Generation Settings (Wayin.ai Style Categorization & Templates)
  const [contentType, setContentType] = useState<'gaming' | 'podcast' | 'education' | 'general'>('gaming');
  const [templateLayout, setTemplateLayout] = useState<'full_screen' | 'streamer_split' | 'streamer_bottom' | 'blur_fit' | 'streamer_pip' | 'smart_auto' | 'center_crop'>('full_screen');
  const [captionPreset, setCaptionPreset] = useState<'none' | 'bold_yellow' | 'minimal_clean' | 'professional_podcast' | 'creator_style'>('bold_yellow');
  const [exportQuality, setExportQuality] = useState<'1080p_high' | '1080p_standard'>('1080p_high');
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '1:1' | '4:5'>('9:16');
  const [durationRange, setDurationRange] = useState<'auto' | '15-30' | '30-60'>('30-60');
  const [maxClips, setMaxClips] = useState<number>(5);
  const [faceTracking, setFaceTracking] = useState(true);
  const [showFullVideoReframer, setShowFullVideoReframer] = useState(false);
  const [pipelineJobId, setPipelineJobId] = useState<string | null>(null);
  const [viralitySensitivity, setViralitySensitivity] = useState(70);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationSuccess, setGenerationSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGalleryExpanded, setIsGalleryExpanded] = useState(false);
  const [rangeStartTime, setRangeStartTime] = useState<number>(0);
  const [rangeEndTime, setRangeEndTime] = useState<number>(0);
  const [selectedMoments, setSelectedMoments] = useState<string[]>(['Clutch wins', 'High-energy scenes']);

  useEffect(() => {
    if (activeVideo?.duration && rangeEndTime === 0) {
      setRangeEndTime(Math.round(activeVideo.duration));
    }
  }, [activeVideo?.duration, rangeEndTime]);

  const formatTimeStr = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds || 0));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleContentTypeChange = (type: 'gaming' | 'podcast' | 'education' | 'general') => {
    setContentType(type);
    if (type === 'gaming') {
      setTemplateLayout('full_screen');
    } else if (type === 'podcast') {
      setTemplateLayout('smart_auto');
      setCaptionPreset('professional_podcast');
    } else if (type === 'education') {
      setTemplateLayout('full_screen');
      setCaptionPreset('minimal_clean');
    } else {
      setTemplateLayout('full_screen');
      setCaptionPreset('bold_yellow');
    }
  };

  const cleanYoutubeUrl = (raw: string): string => {
    try {
      const u = raw.trim();
      if (u.includes('youtube.com') || u.includes('youtu.be')) {
        const urlObj = new URL(u.startsWith('http') ? u : `https://${u}`);
        if (urlObj.hostname.includes('youtu.be')) {
          const id = urlObj.pathname.replace(/^\//, '').split('/')[0]?.split('?')[0];
          if (id) return `https://www.youtube.com/watch?v=${id}`;
        }
        if (urlObj.pathname.includes('/shorts/')) {
          const id = urlObj.pathname.split('/shorts/')[1]?.split('/')[0]?.split('?')[0];
          if (id) return `https://www.youtube.com/watch?v=${id}`;
        }
        if (urlObj.pathname.includes('/live/')) {
          const id = urlObj.pathname.split('/live/')[1]?.split('/')[0]?.split('?')[0];
          if (id) return `https://www.youtube.com/watch?v=${id}`;
        }
        const v = urlObj.searchParams.get('v');
        if (v) return `https://www.youtube.com/watch?v=${v}`;
      }
    } catch {
      // ignore
    }
    return raw.trim();
  };

  const handleYoutubeSubmit = async () => {
    setUrlError(null);
    const targetUrl = cleanYoutubeUrl(youtubeUrl);
    setYoutubeUrl(targetUrl);
    if (!targetUrl || !targetUrl.startsWith('http')) {
      setUrlError('Please enter a valid YouTube or video URL (starting with http:// or https://)');
      return;
    }

    setIsDownloadingUrl(true);
    try {
      const vid = await api.submitYoutubeUrl(targetUrl);
      setActiveVideo(vid);
      setIngestMode('upload'); // Switch to view uploaded video
      window.dispatchEvent(new Event('projects-updated'));
    } catch (err: any) {
      setUrlError(err.message || 'Failed to download from URL.');
    } finally {
      setIsDownloadingUrl(false);
    }
  };

  const handleAnalyzeCloudUrl = async () => {
    setCloudProbeError(null);
    setCloudProbeResult(null);
    if (!cloudUrl || !cloudUrl.trim().startsWith('http')) {
      setCloudProbeError('Please enter a valid HTTP or HTTPS video URL');
      return;
    }

    // Check if user entered a YouTube or social platform link into Direct Cloud
    const lower = cloudUrl.toLowerCase();
    if (lower.includes('youtube.com') || lower.includes('youtu.be') || lower.includes('vimeo.com') || lower.includes('tiktok.com')) {
      setCloudProbeError(
        'YouTube and social video platforms serve dynamic HTML players rather than direct raw MP4/WebM streams. Please click below to switch to the "YouTube / Link" tab.'
      );
      return;
    }

    setIsProbingCloudUrl(true);
    try {
      const probe = await api.probeUrl(cloudUrl.trim());
      if (!probe.is_valid || !probe.is_accessible || probe.error || probe.duration <= 0) {
        setCloudProbeError(probe.error || 'This URL is not a direct media stream. Direct Cloud Clipping requires a direct MP4/WebM file URL.');
        setCloudProbeResult(null);
      } else {
        setCloudProbeResult(probe);
      }
    } catch (err: any) {
      setCloudProbeError(err.message || 'Remote stream probing failed. Check URL accessibility or protocol.');
      setCloudProbeResult(null);
    } finally {
      setIsProbingCloudUrl(false);
    }
  };

  const handleRegisterDirectCloud = async () => {
    if (!cloudUrl) return;
    setIsRegisteringCloud(true);
    setCloudProbeError(null);
    try {
      const vid = await api.registerDirectCloudVideo(cloudUrl.trim());
      setActiveVideo(vid);
      window.dispatchEvent(new Event('projects-updated'));
    } catch (err: any) {
      setCloudProbeError(err.message || 'Failed to register cloud video project');
    } finally {
      setIsRegisteringCloud(false);
    }
  };

  const handleStartGeneration = async () => {
    if (!activeVideo) {
      setErrorMessage('Please upload a video before generating clips.');
      return;
    }

    setErrorMessage(null);
    setIsGenerating(true);
    try {
      // Trigger 10-step full AI clipping & reframing pipeline with Wayin.ai templates & subtitle settings
      const hasCustomRange = rangeStartTime > 0 || (rangeEndTime > 0 && rangeEndTime < (activeVideo.duration || 999999));
      const res = await api.triggerPipeline({
        video_id: activeVideo.id,
        target_aspect_ratio: aspectRatio,
        duration_range: durationRange,
        max_clips: maxClips,
        virality_threshold: viralitySensitivity,
        reframing_mode: templateLayout,
        template_layout: templateLayout,
        content_type: contentType,
        subtitle_preset: captionPreset,
        burn_subtitles: captionPreset !== 'none',
        smart_reframing: faceTracking,
        whisper_model: 'tiny',
        export_quality: exportQuality,
        scan_full_video: !hasCustomRange,
        start_time: rangeStartTime > 0 ? rangeStartTime : undefined,
        end_time: (rangeEndTime > 0 && rangeEndTime < (activeVideo.duration || 999999)) ? rangeEndTime : undefined,
      });

      setPipelineJobId(res.job_id);
      setGenerationSuccess(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to start AI clipping process.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex-1 pb-20">
      <DashboardHeader
        title="Create Viral Shorts"
        subtitle="Upload source video, configure AI speech clipping, and export 9:16 vertical cuts."
        action={
          <Link
            href="/dashboard/projects"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-semibold border border-white/10 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Projects
          </Link>
        }
      />

      <div className="px-6 sm:px-8 pt-8 max-w-7xl mx-auto space-y-8">
        {/* Success Alert Banner when generation triggered */}
        {generationSuccess && (
          <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xl">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-bold text-white">AI Clip Generation Queued!</p>
                <p className="text-xs text-zinc-300">
                  Faster-Whisper is analyzing speech hooks and FFmpeg is preparing 9:16 vertical cuts for &quot;{activeVideo?.title}&quot;.
                </p>
              </div>
            </div>
            <Link href="/dashboard/projects">
              <Button variant="primary" size="sm" className="rounded-xl text-xs whitespace-nowrap">
                Go to My Projects <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </Link>
          </div>
        )}

        {errorMessage && (
          <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-zinc-400 hover:text-white">✕</button>
          </div>
        )}

        <div className={`grid grid-cols-1 ${isGalleryExpanded ? 'lg:grid-cols-1' : 'lg:grid-cols-12'} gap-8 items-start`}>
          {/* Left Column: Upload System & Video Preview */}
          <div className={`${isGalleryExpanded ? 'w-full' : 'lg:col-span-7'} space-y-6`}>
            {/* Mode Switcher */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Film className="w-4 h-4 text-blue-400" />
                Source Video Ingestion
              </span>

              <div className="flex items-center gap-2">
                {detectedClips.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsGalleryExpanded(!isGalleryExpanded)}
                    className="px-2.5 py-1 text-xs font-medium rounded-lg bg-zinc-900 border border-white/10 text-zinc-400 hover:text-white flex items-center gap-1.5 transition-all"
                    title={isGalleryExpanded ? "Exit full width" : "Expand gallery to full width"}
                  >
                    {isGalleryExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5 text-blue-400" />}
                    <span>{isGalleryExpanded ? 'Compact View' : 'Full Width Gallery'}</span>
                  </button>
                )}

                <div className="flex p-1 rounded-xl bg-[#090e1a] border border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setIngestMode('upload')}
                    className={`px-3 py-1 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                      ingestMode === 'upload'
                        ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Direct Upload
                  </button>
                  <button
                    type="button"
                    onClick={() => setIngestMode('direct_cloud')}
                    className={`px-3 py-1 text-xs font-medium rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                      ingestMode === 'direct_cloud'
                        ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Globe className="w-3 h-3" />
                    <span>Direct Cloud URL</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIngestMode('url')}
                    className={`px-3 py-1 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                      ingestMode === 'url'
                        ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    YouTube / Link
                  </button>
                </div>
              </div>
            </div>

            {/* Ingest Mode 1: Drag-and-Drop & Video Preview System */}
            {ingestMode === 'upload' && (
              <VideoUploadZone
                initialVideo={activeVideo}
                seekTime={seekTime}
                onVideoUploaded={(vid) => {
                  setActiveVideo(vid);
                  setGenerationSuccess(false);
                }}
                onVideoRemoved={() => {
                  setActiveVideo(null);
                  setCurrentTranscript(null);
                  setDetectedClips([]);
                  setGenerationSuccess(false);
                }}
              />
            )}

            {/* Ingest Mode 2: Direct Cloud URL (Range-Seeking Stream Processing) */}
            {ingestMode === 'direct_cloud' && (
              <Card className="p-6 bg-[#090e1a] border-white/[0.08] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-950/50 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        Direct Cloud Video Stream
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Zero Full Download
                        </span>
                      </h4>
                      <p className="text-[11px] text-zinc-400">
                        Process remote MP4/WebM videos directly via HTTP Range requests without downloading the full video.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="https://example.com/video.mp4 (e.g. https://www.w3schools.com/html/mov_bbb.mp4)"
                      value={cloudUrl}
                      disabled={isProbingCloudUrl || isRegisteringCloud}
                      onChange={(e) => setCloudUrl(e.target.value)}
                      className="flex-1 bg-zinc-950 border border-white/[0.08] rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 disabled:opacity-50 font-mono"
                    />
                    <Button
                      onClick={handleAnalyzeCloudUrl}
                      isLoading={isProbingCloudUrl}
                      variant="primary"
                      size="sm"
                      className="rounded-xl px-5 text-xs whitespace-nowrap bg-blue-600 hover:bg-blue-500"
                    >
                      {isProbingCloudUrl ? 'Analyzing...' : 'Analyze Video'}
                    </Button>
                  </div>

                  {/* Security Guard Notice */}
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>SSRF Guard active · Private IP blocking · HTTP Range streaming · No local download</span>
                  </div>

                  {/* Smart YouTube / Social Link Banner */}
                  {(cloudUrl.toLowerCase().includes('youtube.com') || cloudUrl.toLowerCase().includes('youtu.be') || cloudUrl.toLowerCase().includes('vimeo.com')) && (
                    <div className="p-3.5 rounded-xl bg-blue-950/40 border border-blue-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-blue-200 animate-in fade-in">
                      <div className="flex items-center gap-2.5">
                        <Video className="w-4 h-4 text-blue-400 shrink-0" />
                        <span>Detected video platform link! YouTube videos should be processed via the YouTube Engine.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setYoutubeUrl(cleanYoutubeUrl(cloudUrl));
                          setIngestMode('url');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shrink-0 cursor-pointer shadow-md transition-all whitespace-nowrap"
                      >
                        Switch to YouTube Tab →
                      </button>
                    </div>
                  )}

                  {cloudProbeError && (
                    <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/50 flex flex-col gap-2.5 text-xs text-rose-300">
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                        <div>
                          <span className="font-semibold text-rose-200">Access Blocked / Notice: </span>
                          <span>{cloudProbeError}</span>
                          <p className="text-[11px] text-rose-400/80 mt-1">
                            If this host restricts range requests or is DRM-protected, you can use the Direct Upload tab instead.
                          </p>
                        </div>
                      </div>
                      {(cloudUrl.toLowerCase().includes('youtube.com') || cloudUrl.toLowerCase().includes('youtu.be') || cloudProbeError.toLowerCase().includes('youtube')) && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setYoutubeUrl(cleanYoutubeUrl(cloudUrl));
                              setIngestMode('url');
                              setCloudProbeError(null);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors cursor-pointer shadow-md"
                          >
                            <LinkIcon className="w-3.5 h-3.5" />
                            <span>Switch to YouTube Import Tab →</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Probed Remote Media Card */}
                  {cloudProbeResult && (
                    <div className="p-4 rounded-xl bg-zinc-900/90 border border-white/[0.1] space-y-4 animate-in fade-in duration-200">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider block">
                            Remote Media Validated
                          </span>
                          <h5 className="text-sm font-bold text-white mt-0.5 line-clamp-1">
                            {cloudProbeResult.title || 'Cloud Remote Video'}
                          </h5>
                          <span className="text-[11px] text-zinc-400 font-mono break-all line-clamp-1 mt-0.5">
                            {cloudProbeResult.url}
                          </span>
                        </div>
                        <Badge variant="success" className="text-[10px] shrink-0">
                          {cloudProbeResult.direct_range_supported ? 'Range Seeking Ready' : 'Stream Ready'}
                        </Badge>
                      </div>

                      {/* Video Stream Specs */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                        <div className="p-2.5 rounded-lg bg-zinc-950 border border-white/[0.04]">
                          <span className="text-[10px] text-zinc-500 block">Duration</span>
                          <span className="font-semibold text-white font-mono">{cloudProbeResult.duration_formatted} ({cloudProbeResult.duration}s)</span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-zinc-950 border border-white/[0.04]">
                          <span className="text-[10px] text-zinc-500 block">Resolution &amp; FPS</span>
                          <span className="font-semibold text-white font-mono">{cloudProbeResult.resolution} @ {cloudProbeResult.fps}fps</span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-zinc-950 border border-white/[0.04]">
                          <span className="text-[10px] text-zinc-500 block">File Size</span>
                          <span className="font-semibold text-white font-mono">{cloudProbeResult.file_size_mb} MB</span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-zinc-950 border border-white/[0.04]">
                          <span className="text-[10px] text-zinc-500 block">Audio Track</span>
                          <span className="font-semibold text-emerald-400 font-mono">{cloudProbeResult.has_audio ? '16kHz Audio Stream' : 'None'}</span>
                        </div>
                      </div>

                      {/* Live Online HTML5 Video Player */}
                      <div className="relative rounded-xl overflow-hidden aspect-video max-h-52 w-full bg-black border border-white/[0.06]">
                        <video
                          src={cloudProbeResult.url}
                          controls
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-contain"
                        />
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-zinc-400">
                          Stream verified. Click to register and configure your AI clips.
                        </span>
                        <Button
                          onClick={handleRegisterDirectCloud}
                          isLoading={isRegisteringCloud}
                          variant="primary"
                          size="sm"
                          className="rounded-xl px-5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-950/60"
                        >
                          <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Start Direct Cloud Clipping
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Ingest Mode 3: YouTube / Web URL Download */}
            {ingestMode === 'url' && (
              <Card className="p-6 bg-[#090e1a] border-white/[0.08] space-y-4">
                <div className="flex items-center gap-2">
                  <LinkIcon className="w-4 h-4 text-blue-400" />
                  <h4 className="text-sm font-bold text-white">Import Video from YouTube or Web URL</h4>
                </div>
                <p className="text-xs text-zinc-400">
                  Enter the URL of an online video, podcast, or interview. yt-dlp will download the media directly into your backend storage.
                </p>

                <div className="space-y-3">
                    <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                      value={youtubeUrl}
                      disabled={isDownloadingUrl}
                      onChange={(e) => setYoutubeUrl(cleanYoutubeUrl(e.target.value))}
                      className="flex-1 bg-zinc-950 border border-white/[0.08] rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                    />
                    <Button
                      onClick={handleYoutubeSubmit}
                      isLoading={isDownloadingUrl}
                      variant="primary"
                      size="sm"
                      className="rounded-xl px-5 text-xs whitespace-nowrap"
                    >
                      {isDownloadingUrl ? 'Downloading...' : 'Fetch & Save'}
                    </Button>
                  </div>

                  {isDownloadingUrl && (
                    <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-800/40 flex items-center gap-3 text-xs text-blue-200">
                      <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                      <div>
                        <p className="font-semibold text-white">Fetching & downloading video streams...</p>
                        <p className="text-[11px] text-zinc-400">yt-dlp is downloading the video and generating thumbnail preview. This may take a moment depending on video length.</p>
                      </div>
                    </div>
                  )}

                  {urlError && (
                    <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 flex items-start gap-2 text-xs text-rose-300">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                      <div>
                        <span className="font-medium text-rose-200">Fetch Failed: </span>
                        <span>{urlError}</span>
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-zinc-500">
                    Works with YouTube, Twitch VODs, Vimeo, and direct MP4/WebM HTTP links.
                  </p>
                </div>
              </Card>
            )}

            {/* AI Studio Tabs: Speech, Moments, Reframing & Subtitles */}
            {activeVideo && (
              <div className="space-y-4">
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#090e1a] border border-white/[0.08] overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setStudioTab('clips')}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                      studioTab === 'clips'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Flame className="w-3.5 h-3.5" />
                    AI Moments & Scoring
                  </button>

                  <button
                    type="button"
                    onClick={() => setStudioTab('transcript')}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                      studioTab === 'transcript'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    Faster-Whisper Transcript
                  </button>

                  <button
                    type="button"
                    onClick={() => setStudioTab('reframing')}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                      studioTab === 'reframing'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Face Tracking Reframer
                  </button>

                  <button
                    type="button"
                    onClick={() => setStudioTab('subtitles')}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                      studioTab === 'subtitles'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    Subtitle Studio
                  </button>
                </div>

                {studioTab === 'clips' && (
                  <ClipDetectionPanel
                    videoId={activeVideo.id}
                    videoTitle={activeVideo.title}
                    onClipsDetected={(clips) => setDetectedClips(clips)}
                    onPreviewClip={(clip) => setSeekTime(clip.start_time)}
                  />
                )}

                {studioTab === 'transcript' && (
                  <TranscriptionPanel
                    videoId={activeVideo.id}
                    videoTitle={activeVideo.title}
                    onTranscriptReady={(t) => setCurrentTranscript(t)}
                    onSeekToTimestamp={(sec) => setSeekTime(sec)}
                  />
                )}

                {studioTab === 'reframing' && (
                  <ReframingStudio
                    videoId={activeVideo.id}
                    sourceVideoUrl={activeVideo.video_url ? api.getServerUrl(activeVideo.video_url) : undefined}
                    clip={detectedClips.length > 0 ? detectedClips[0] : null}
                    onClose={() => setStudioTab('clips')}
                  />
                )}

                {studioTab === 'subtitles' && (
                  detectedClips.length > 0 ? (
                    <SubtitleEditor
                      clip={detectedClips[0]}
                      videoUrl={activeVideo.video_url ? api.getServerUrl(activeVideo.video_url) : undefined}
                    />
                  ) : (
                    <Card className="p-8 bg-[#090e1a] border-white/[0.08] text-center space-y-3">
                      <Subtitles className="w-8 h-8 text-blue-400 mx-auto" />
                      <h4 className="text-sm font-bold text-white">No Clip Selected for Subtitle Editing</h4>
                      <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                        Please detect or select a clip in the &quot;AI Moments &amp; Scoring&quot; tab first to customize its subtitle animation styles.
                      </p>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setStudioTab('clips')}
                        className="rounded-xl text-xs mt-2"
                      >
                        Go to AI Moments
                      </Button>
                    </Card>
                  )
                )}
              </div>
            )}
          </div>

          {/* Right Column: Generation Settings & Action */}
          <div className={`${isGalleryExpanded ? 'w-full' : 'lg:col-span-5'} space-y-6`}>
            <Card className="border-white/[0.08] bg-[#090e1a] p-6 space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-blue-400" />
                    Viral Studio Parameters
                  </h3>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Inspired by Wayin.ai intelligent clipping & streamer layouts</p>
                </div>
                {activeVideo ? (
                  <Badge variant="success" className="text-[10px]">Video Loaded</Badge>
                ) : (
                  <Badge variant="warning" className="text-[10px]">Awaiting Video</Badge>
                )}
              </div>

              {/* 1. Content Category Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block">
                  1. Video Content Type
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'gaming', label: 'Gaming & Stream', icon: Gamepad2, desc: 'Reactions & gameplay' },
                    { id: 'podcast', label: 'Podcast & Talk', icon: Mic, desc: 'Speaking turns' },
                    { id: 'education', label: 'Education', icon: BookOpen, desc: 'Explanations & key points' },
                    { id: 'general', label: 'Social & Vlog', icon: Video, desc: 'Action & viral moments' },
                  ].map((cat) => {
                    const IconComp = cat.icon;
                    const isSelected = contentType === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleContentTypeChange(cat.id as any)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-blue-500 bg-blue-950/40 text-white shadow-md shadow-blue-950/30'
                            : 'border-white/[0.06] bg-zinc-950/60 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <IconComp className={`w-3.5 h-3.5 ${isSelected ? 'text-blue-400' : 'text-zinc-500'}`} />
                          <span className="text-xs font-bold truncate">{cat.label}</span>
                        </div>
                        <span className="text-[9px] text-zinc-500 mt-1 line-clamp-1">{cat.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 1.5 Moments to Find & Video Range Slicer (WayinVideo Style) */}
              <div className="space-y-4 pt-1 pb-2 border-y border-white/[0.06]">
                {/* Moments Filter */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-zinc-300">
                      What moments do you want to find? <span className="text-zinc-500 font-normal">(Optional)</span>
                    </label>
                    <span className="text-[10px] text-zinc-500">Click to filter</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Funny reactions',
                      'Clutch wins',
                      'Epic fails',
                      'Emotional moments',
                      'High-energy scenes',
                    ].map((m) => {
                      const isSel = selectedMoments.includes(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            if (isSel) {
                              setSelectedMoments(selectedMoments.filter((x) => x !== m));
                            } else {
                              setSelectedMoments([...selectedMoments, m]);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                            isSel
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
                              : 'bg-zinc-900 border border-white/[0.08] text-zinc-400 hover:border-white/20 hover:text-white'
                          }`}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Choose where to find clips (Range selector) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-semibold text-zinc-300 block">
                        Choose where to find clips
                      </label>
                      <p className="text-[10px] text-zinc-500">
                        {rangeStartTime === 0 && (!rangeEndTime || rangeEndTime >= (activeVideo?.duration || 0))
                          ? 'Scanning full video length'
                          : `Scanning from ${formatTimeStr(rangeStartTime)} to ${formatTimeStr(rangeEndTime || activeVideo?.duration || 0)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-xs">
                      <span className="px-2 py-0.5 rounded bg-zinc-900 border border-white/10 text-emerald-400 font-bold">
                        {formatTimeStr(rangeStartTime)}
                      </span>
                      <span className="text-zinc-600">—</span>
                      <span className="px-2 py-0.5 rounded bg-zinc-900 border border-white/10 text-emerald-400 font-bold">
                        {formatTimeStr(rangeEndTime || activeVideo?.duration || 180)}
                      </span>
                    </div>
                  </div>

                  {/* Range Sliders */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-zinc-500 w-10">Start:</span>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(10, Math.floor((activeVideo?.duration || 300) - 10))}
                        value={rangeStartTime}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setRangeStartTime(Math.min(val, (rangeEndTime || 300) - 5));
                        }}
                        className="flex-1 accent-emerald-500 cursor-pointer"
                      />
                      <span className="text-[10px] font-mono text-zinc-400 w-14 text-right">
                        {formatTimeStr(rangeStartTime)}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-zinc-500 w-10">End:</span>
                      <input
                        type="range"
                        min={10}
                        max={Math.max(15, Math.floor(activeVideo?.duration || 300))}
                        value={rangeEndTime || Math.floor(activeVideo?.duration || 300)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setRangeEndTime(Math.max(val, rangeStartTime + 5));
                        }}
                        className="flex-1 accent-emerald-500 cursor-pointer"
                      />
                      <span className="text-[10px] font-mono text-zinc-400 w-14 text-right">
                        {formatTimeStr(rangeEndTime || activeVideo?.duration || 300)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Visual Layout Template Presets (Wayin.ai inspired) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-blue-400" />
                      2. Layout Template Presets
                    </label>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold uppercase">
                      Wayin Style
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] px-2 py-0.5 rounded-lg bg-zinc-900 border border-white/10 text-white font-mono font-bold">
                      9:16 Vertical
                    </span>
                  </div>
                </div>

                {templateLayout === 'full_screen' && (
                  <div className="px-3 py-2 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-300">
                    <Gamepad2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>Pure Gameplay Active:</strong> Creator facecam / webcam on top is removed. The video will focus 100% on continuous full gameplay action.
                    </span>
                  </div>
                )}

                {/* Wayin.ai Template Cards Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'full_screen',
                      title: 'GTA 6 Full',
                      subtitle: 'Pure Gameplay (No Creator Screen)',
                      badge: 'Direct Action • Cam Removed',
                      previewType: 'full',
                    },
                    {
                      id: 'streamer_split',
                      title: 'GTA 6 Top',
                      subtitle: 'Cam Top 40% + Game 60%',
                      badge: 'Streamer Split',
                      previewType: 'top_split',
                    },
                    {
                      id: 'streamer_bottom',
                      title: 'GTA 6 Cam',
                      subtitle: 'Game 60% + Cam 40%',
                      badge: 'Reaction Bottom',
                      previewType: 'bottom_split',
                    },
                    {
                      id: 'blur_fit',
                      title: 'GTA 6 Fit',
                      subtitle: '16:9 Ambient Blur',
                      badge: 'Blurred Ambient',
                      previewType: 'blur_fit',
                    },
                    {
                      id: 'streamer_pip',
                      title: 'Adventure PiP',
                      subtitle: 'Floating Cam Overlay',
                      badge: 'Webcam Overlay',
                      previewType: 'pip',
                    },
                    {
                      id: 'smart_auto',
                      title: 'Smart Face Follow',
                      subtitle: 'OpenCV Speaker Track',
                      badge: 'Auto Speaker',
                      previewType: 'face_track',
                    },
                  ].map((tmpl) => {
                    const isSelected = templateLayout === tmpl.id;
                    return (
                      <div
                        key={tmpl.id}
                        onClick={() => setTemplateLayout(tmpl.id as any)}
                        className={`group relative rounded-2xl p-2.5 transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'ring-2 ring-emerald-500 bg-emerald-950/20 shadow-xl shadow-emerald-950/40 border border-emerald-500/50'
                            : 'border border-white/[0.08] bg-[#090e1a] hover:border-white/20 hover:bg-zinc-900/60'
                        }`}
                      >
                        {/* 9:16 Miniature Screen Frame */}
                        <div className="relative w-full aspect-[9/16] rounded-xl overflow-hidden bg-black border border-white/10 mb-2 shadow-inner flex flex-col">
                          {/* Selection indicator matching WayinVideo */}
                          <div className="absolute top-2 left-2 z-20">
                            {isSelected ? (
                              <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/50">
                                <Check className="w-3 h-3 text-black stroke-[3]" />
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-black/40 border border-white/20 group-hover:border-white/40" />
                            )}
                          </div>

                          {/* Layout Preview Graphic */}
                          {tmpl.previewType === 'full' && (
                            /* GTA 6 Full: Full-screen pure gameplay action (creator cam removed) */
                            <div className="w-full h-full relative bg-gradient-to-b from-blue-900/40 via-emerald-950/30 to-black flex flex-col justify-center items-center p-2 text-center">
                              <Gamepad2 className="w-6 h-6 text-emerald-400 mb-1" />
                              <div className="px-2 py-0.5 rounded-md bg-black/90 border border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.4)]">
                                <span className="text-[7.5px] font-black uppercase text-emerald-300 tracking-wider">
                                  PURE GAMEPLAY
                                </span>
                              </div>
                              <span className="text-[6.5px] text-zinc-400 mt-1">Creator Cam Cut</span>
                            </div>
                          )}

                          {tmpl.previewType === 'top_split' && (
                            /* GTA 6 Top: Cam Top 40% + Game 60% */
                            <div className="w-full h-full flex flex-col">
                              <div className="h-[40%] bg-gradient-to-b from-blue-900/60 to-zinc-900 border-b border-white/20 flex flex-col items-center justify-center relative p-1">
                                <User className="w-4 h-4 text-blue-300" />
                                <span className="text-[7px] font-black bg-black/80 text-white px-1.5 py-0.2 rounded border border-white/20 mt-0.5">
                                  BOYS
                                </span>
                              </div>
                              <div className="h-[60%] bg-gradient-to-b from-zinc-900 to-black flex items-center justify-center">
                                <Gamepad2 className="w-5 h-5 text-zinc-600" />
                              </div>
                            </div>
                          )}

                          {tmpl.previewType === 'bottom_split' && (
                            /* GTA 6 Cam: Game Top 60% + Cam 40% */
                            <div className="w-full h-full flex flex-col">
                              <div className="h-[60%] bg-gradient-to-b from-blue-950/60 to-zinc-900 border-b border-white/20 flex flex-col items-center justify-center p-1">
                                <Gamepad2 className="w-5 h-5 text-blue-300/50 mb-0.5" />
                                <span className="text-[6px] font-black bg-black/80 text-amber-300 px-1 rounded">
                                  FIVE-STAR WANTED
                                </span>
                              </div>
                              <div className="h-[40%] bg-gradient-to-b from-blue-900/60 to-black flex items-center justify-center">
                                <User className="w-4 h-4 text-blue-300" />
                              </div>
                            </div>
                          )}

                          {tmpl.previewType === 'blur_fit' && (
                            /* GTA 6 Fit: Blurred ambient background with centered 16:9 */
                            <div className="w-full h-full relative bg-gradient-to-b from-blue-950 via-zinc-900 to-indigo-950 flex items-center justify-center p-1 overflow-hidden">
                              <div className="w-full h-12 bg-zinc-900 border border-white/30 rounded shadow-2xl flex flex-col items-center justify-center z-10 p-1">
                                <span className="text-[7px] font-black uppercase text-amber-300 bg-black/80 px-1 rounded">
                                  16:9 FIT
                                </span>
                              </div>
                              <div className="absolute inset-0 bg-blue-600/10 backdrop-blur-sm pointer-events-none" />
                            </div>
                          )}

                          {tmpl.previewType === 'pip' && (
                            /* Adventure PiP: Full game + floating webcam */
                            <div className="w-full h-full relative bg-gradient-to-b from-zinc-900 to-black flex items-center justify-center p-1">
                              <Gamepad2 className="w-6 h-6 text-zinc-600" />
                              <div className="absolute top-2 right-2 w-7 h-5 bg-blue-900/80 border border-blue-400 rounded flex items-center justify-center shadow-lg">
                                <User className="w-2.5 h-2.5 text-blue-200" />
                              </div>
                            </div>
                          )}

                          {tmpl.previewType === 'face_track' && (
                            /* Smart Face Tracking: Focused on speaker */
                            <div className="w-full h-full relative bg-gradient-to-b from-neutral-900 to-neutral-950 flex flex-col items-center justify-center p-1">
                              <div className="border border-blue-400/60 rounded-lg p-2 flex flex-col items-center">
                                <User className="w-5 h-5 text-blue-400" />
                                <span className="text-[6px] text-blue-300 font-mono mt-0.5">TRACKED</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Title & Description Below Preview */}
                        <div className="text-left space-y-0.5">
                          <h4 className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">
                            {tmpl.title}
                          </h4>
                          <p className="text-[10px] text-zinc-400 line-clamp-1">
                            {tmpl.subtitle}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. Subtitle / Caption Styling (with No Caption Option) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block">
                    3. Dynamic Subtitles
                  </label>
                  <span className="text-[10px] text-zinc-500">Karaoke word sync</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    {
                      id: 'none',
                      name: 'No Captions',
                      sub: 'Clean Video',
                      color: 'text-zinc-400',
                      icon: VolumeX,
                    },
                    {
                      id: 'bold_yellow',
                      name: 'Karaoke Pop',
                      sub: 'Yellow Glow',
                      color: 'text-[#FFDD00]',
                    },
                    {
                      id: 'minimal_clean',
                      name: 'Minimal Clean',
                      sub: 'Modern White',
                      color: 'text-white',
                    },
                    {
                      id: 'professional_podcast',
                      name: 'Boxed Podcast',
                      sub: 'Purple Badge',
                      color: 'text-blue-300',
                    },
                    {
                      id: 'creator_style',
                      name: 'Creator Bold',
                      sub: 'Impact Uppercase',
                      color: 'text-amber-400',
                    },
                  ].map((style) => {
                    const isSelected = captionPreset === style.id;
                    const IconComp = (style as any).icon;
                    return (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => setCaptionPreset(style.id as any)}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'border-blue-500 bg-blue-950/40 text-white shadow-sm'
                            : 'border-white/[0.06] bg-zinc-950/60 hover:border-zinc-700 text-zinc-400'
                        }`}
                      >
                        <div className="flex items-center justify-center gap-1">
                          {IconComp && <IconComp className="w-3 h-3 text-zinc-400" />}
                          <span className={`text-[11px] font-black uppercase block ${style.color}`}>
                            {style.name}
                          </span>
                        </div>
                        <span className="text-[9px] text-zinc-500 block mt-0.5">{style.sub}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. Export Quality & Aspect Ratio */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Export Quality */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block">
                    Export Quality
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: '1080p_high', label: '1080p 60fps', sub: 'Viral HD' },
                      { id: '1080p_standard', label: '1080p Std', sub: 'Balanced' },
                    ].map((q) => (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setExportQuality(q.id as any)}
                        className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                          exportQuality === q.id
                            ? 'border-blue-500 bg-blue-950/30 text-white font-semibold'
                            : 'border-white/[0.06] bg-zinc-950/60 text-zinc-400 text-xs'
                        }`}
                      >
                        <span className="text-xs block font-bold">{q.label}</span>
                        <span className="text-[9px] text-zinc-500 block">{q.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Clips Count Target */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block">
                    Clips Count Target
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[3, 5, 8, 12].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setMaxClips(cnt)}
                        className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                          maxClips === cnt
                            ? 'border-blue-500 bg-blue-950/30 text-white font-semibold'
                            : 'border-white/[0.06] bg-zinc-950/60 text-zinc-400 text-xs'
                        }`}
                      >
                        <span className="text-xs block font-bold">{cnt}</span>
                        <span className="text-[9px] text-zinc-500 block">clips</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Duration Window */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block">
                    Duration Target
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: '15-30', label: '15 - 30s', sub: 'Fast Paced' },
                      { id: '30-60', label: '30 - 60s', sub: 'Deep Story' },
                    ].map((dur) => (
                      <button
                        key={dur.id}
                        type="button"
                        onClick={() => setDurationRange(dur.id as any)}
                        className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                          durationRange === dur.id
                            ? 'border-blue-500 bg-blue-950/30 text-white font-semibold'
                            : 'border-white/[0.06] bg-zinc-950/60 text-zinc-400 text-xs'
                        }`}
                      >
                        <span className="text-xs block font-bold">{dur.label}</span>
                        <span className="text-[9px] text-zinc-500 block">{dur.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 5. Virality Score Cutoff Slider */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-zinc-300">Virality Threshold Cutoff</span>
                  <span className="font-mono text-blue-400 font-bold">{viralitySensitivity}%+</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="95"
                  value={viralitySensitivity}
                  onChange={(e) => setViralitySensitivity(Number(e.target.value))}
                  className="w-full accent-blue-600 bg-zinc-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>More Clips (50%)</span>
                  <span>Strict Viral Only (95%)</span>
                </div>
              </div>

              {/* Submit CTA Button (WayinVideo Style) */}
              <div className="pt-2 space-y-2">
                <Button
                  onClick={handleStartGeneration}
                  disabled={!activeVideo || isGenerating}
                  isLoading={isGenerating}
                  size="lg"
                  className="w-full rounded-2xl py-3.5 text-sm font-black shadow-xl shadow-emerald-500/25 bg-emerald-500 hover:bg-emerald-400 text-black border-none transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4 text-black stroke-[2.5]" />
                  {isGenerating
                    ? 'AI Clipping & Rendering in Progress...'
                    : 'Generate Clips'}
                </Button>
                <p className="text-[10px] text-zinc-500 text-center">
                  By continuing, AI processes clips from the full footage with {templateLayout === 'full_screen' ? 'pure gameplay (creator screen cut)' : 'selected template layout'} &amp; 1-click direct MP4 downloads.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Full Video Reframing Studio Modal */}
      {showFullVideoReframer && activeVideo && (
        <ReframingStudio
          videoId={activeVideo.id}
          sourceVideoUrl={activeVideo.video_url || undefined}
          onClose={() => setShowFullVideoReframer(false)}
          onReframingComplete={(outputUrl) => {
            setActiveVideo({
              ...activeVideo,
              video_url: outputUrl,
            });
          }}
        />
      )}

      {/* Real-Time End-to-End AI Pipeline Progress Monitor Modal */}
      {pipelineJobId && (
        <PipelineProgressModal
          jobId={pipelineJobId}
          onClose={() => setPipelineJobId(null)}
          onComplete={(completedClips) => {
            setDetectedClips(completedClips);
          }}
        />
      )}
    </div>
  );
}

export default function CreateClipsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
            <p className="text-sm font-medium text-zinc-400">Loading Clip Studio...</p>
          </div>
        </div>
      }
    >
      <CreateClipsContent />
    </Suspense>
  );
}
