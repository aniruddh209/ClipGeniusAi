'use client';

import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  Film, 
  Trash2, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  FileVideo, 
  Play, 
  Maximize2,
  Clock,
  HardDrive,
  Cpu,
  Layers,
  Sparkles,
  Info,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';
import { VideoItem } from '@/types';
import { formatDuration, formatFileSize } from '@/lib/utils';

interface VideoUploadZoneProps {
  onVideoUploaded?: (video: VideoItem) => void;
  onVideoRemoved?: () => void;
  initialVideo?: VideoItem | null;
  seekTime?: number | null;
}

const SUPPORTED_EXTENSIONS = ['.mp4', '.mov', '.webm'];
const MAX_SIZE_MB = 500;

function getYoutubeEmbedUrl(url?: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? `https://www.youtube-nocookie.com/embed/${match[2]}?autoplay=0&rel=0` : null;
}

export const VideoUploadZone: React.FC<VideoUploadZoneProps> = ({
  onVideoUploaded,
  onVideoRemoved,
  initialVideo = null,
  seekTime = null,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [uploadedVideo, setUploadedVideo] = useState<VideoItem | null>(initialVideo);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showThumbnailModal, setShowThumbnailModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);

  // Sync external initialVideo changes (e.g. from YouTube import)
  React.useEffect(() => {
    setUploadedVideo(initialVideo);
  }, [initialVideo]);

  // Sync seekTime to video player
  React.useEffect(() => {
    if (seekTime !== null && seekTime !== undefined && videoPlayerRef.current) {
      videoPlayerRef.current.currentTime = seekTime;
      videoPlayerRef.current.play().catch(() => {});
    }
  }, [seekTime]);

  // 1. Drag & Drop Handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  // 2. Client-side Validation & Upload
  const handleFileSelected = async (file: File) => {
    setErrorMessage(null);

    // Validate extension
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      setErrorMessage(
        `Unsupported file type "${ext}". ClipGenius AI supports: ${SUPPORTED_EXTENSIONS.join(', ')}.`
      );
      return;
    }

    // Validate size (max 500MB)
    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > MAX_SIZE_MB) {
      setErrorMessage(
        `File size (${sizeMb.toFixed(1)}MB) exceeds the maximum allowed limit of ${MAX_SIZE_MB}MB.`
      );
      return;
    }

    // Begin real upload
    setCurrentFile(file);
    setUploadProgress(0);

    try {
      const result = await api.uploadVideoWithProgress(file, (percent) => {
        setUploadProgress(percent);
      });

      setUploadedVideo(result);
      setUploadProgress(null);
      if (onVideoUploaded) {
        onVideoUploaded(result);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Upload failed. Ensure FastAPI backend is active.');
      setUploadProgress(null);
      setCurrentFile(null);
    }
  };

  // 3. Remove and Replace Video
  const handleRemoveVideo = async () => {
    if (!uploadedVideo) return;
    setIsDeleting(true);
    try {
      await api.deleteVideo(uploadedVideo.id);
    } catch (err) {
      console.warn('Backend delete warning:', err);
    } finally {
      setIsDeleting(false);
      setUploadedVideo(null);
      setCurrentFile(null);
      setErrorMessage(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      if (onVideoRemoved) {
        onVideoRemoved();
      }
    }
  };

  // Derived video streaming URL
  const videoStreamUrl = uploadedVideo?.video_url
    ? api.getServerUrl(uploadedVideo.video_url)
    : currentFile
    ? URL.createObjectURL(currentFile)
    : '';

  const ytEmbedUrl = getYoutubeEmbedUrl(uploadedVideo?.source_url || uploadedVideo?.video_url);
  const isDirectYt = Boolean(
    ytEmbedUrl && (
      uploadedVideo?.is_direct_stream ||
      uploadedVideo?.source_type === 'youtube_direct_stream' ||
      !videoStreamUrl ||
      videoStreamUrl.includes('youtube') ||
      videoStreamUrl.endsWith('.mp3') ||
      videoStreamUrl.endsWith('.m4a')
    )
  );

  const thumbnailStreamUrl = uploadedVideo?.thumbnail_url
    ? api.getServerUrl(uploadedVideo.thumbnail_url)
    : null;

  return (
    <div className="w-full space-y-4">
      {/* ERROR ALERT */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-start justify-between gap-3 shadow-lg">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-200">Upload Validation Error</p>
              <p className="text-zinc-300 mt-0.5">{errorMessage}</p>
            </div>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-[var(--text-muted)] hover:text-[var(--foreground)] p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* STATE 1: ACTIVE UPLOADING (REAL PROGRESS TRACKING) */}
      {uploadProgress !== null && currentFile && (
        <div className="p-8 rounded-3xl bg-[var(--card)] border border-[#A3E635]/40 text-center space-y-5 shadow-2xl">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#A3E635]/15 border border-[#A3E635]/30 text-[#4D7C0F] dark:text-[#A3E635] flex items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-[#4D7C0F] dark:text-[#A3E635]" />
          </div>

          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              Uploading &quot;{currentFile.name}&quot;
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
              Streaming video chunks securely to backend storage ({formatFileSize(currentFile.size / (1024 * 1024))})
            </p>
          </div>

          {/* Real Percentage Bar */}
          <div className="max-w-md mx-auto space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-zinc-600 dark:text-zinc-400">Byte Transfer Progress</span>
              <span className="text-[#4D7C0F] dark:text-[#A3E635] font-bold">{uploadProgress}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-[#A3E635] transition-all duration-150 rounded-full"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>

          <p className="text-[11px] text-zinc-500">
            FFprobe metadata analysis and thumbnail extraction will trigger immediately upon receipt.
          </p>
        </div>
      )}

      {/* STATE 2: UPLOAD SUCCESS & VIDEO PREVIEW PLAYER */}
      {uploadProgress === null && uploadedVideo && (
        <div className="rounded-3xl bg-[var(--card)] border border-[var(--card-border)] overflow-hidden shadow-2xl space-y-5 p-6">
          {/* Header Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--card-border)]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#A3E635]/15 border border-[#A3E635]/30 text-[#4D7C0F] dark:text-[#A3E635] flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--foreground)] line-clamp-1">
                  {uploadedVideo.title}
                </h3>
                <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
                  <span className="font-mono text-emerald-600 dark:text-[#A3E635] font-semibold">Video Verified</span>
                  <span>•</span>
                  <span>Ready for AI Clipping</span>
                </span>
              </div>
            </div>

            {/* Remove / Replace Video Button */}
            <Button
              onClick={handleRemoveVideo}
              isLoading={isDeleting}
              variant="outline"
              size="sm"
              className="rounded-xl text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 hover:bg-rose-500/10 border-rose-500/30"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Remove / Replace Video
            </Button>
          </div>

          {/* Video Player */}
          <div className="relative rounded-2xl overflow-hidden aspect-video bg-black border border-[var(--card-border)] group shadow-inner">
            {isDirectYt && ytEmbedUrl ? (
              <iframe
                src={ytEmbedUrl}
                title={uploadedVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
            ) : (
              <video
                ref={videoPlayerRef}
                src={videoStreamUrl}
                controls
                playsInline
                preload="metadata"
                poster={thumbnailStreamUrl || undefined}
                className="w-full h-full object-contain"
              />
            )}
          </div>

          {/* Metadata & Thumbnail Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-2">
            {/* Left: Metadata Details (8 cols) */}
            <div className="md:col-span-8 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-[#4D7C0F] dark:text-[#A3E635]" />
                Video Metadata
              </span>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--card-border)]">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase font-semibold block">Duration</span>
                  <span className="text-xs font-mono font-bold text-[var(--foreground)] mt-0.5 block">
                    {formatDuration(uploadedVideo.duration)}
                  </span>
                  <span className="text-[9px] text-[var(--text-muted)] font-mono">
                    ({uploadedVideo.duration}s)
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--card-border)]">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase font-semibold block">File Size</span>
                  <span className="text-xs font-mono font-bold text-[var(--foreground)] mt-0.5 block">
                    {formatFileSize(uploadedVideo.file_size_mb)}
                  </span>
                  <span className="text-[9px] text-[var(--text-muted)] font-mono">
                    {uploadedVideo.file_size_mb} MB
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--card-border)]">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase font-semibold block">Resolution</span>
                  <span className="text-xs font-mono font-bold text-[var(--foreground)] mt-0.5 block">
                    {uploadedVideo.metadata?.width || 1920}x{uploadedVideo.metadata?.height || 1080}
                  </span>
                  <span className="text-[9px] text-emerald-600 dark:text-[#4ADE80] font-semibold">
                    {uploadedVideo.metadata?.aspect_ratio || '16:9'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--card-border)]">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase font-semibold block">Frame Rate</span>
                  <span className="text-xs font-mono font-bold text-[var(--foreground)] mt-0.5 block">
                    {uploadedVideo.metadata?.fps || 30} FPS
                  </span>
                  <span className="text-[9px] text-[var(--text-muted)] font-mono">
                    {uploadedVideo.metadata?.video_codec?.toUpperCase() || 'H264'}
                  </span>
                </div>
              </div>

              {/* Extra technical details badge row */}
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-[var(--text-muted)]">
                <span className="text-[11px]">Storage:</span>
                <code className="px-2 py-0.5 rounded bg-[var(--surface)] text-[10px] text-[var(--foreground)] font-mono border border-[var(--card-border)]">
                  {uploadedVideo.stored_filename}
                </code>
                {uploadedVideo.metadata?.audio_codec && (
                  <Badge variant="default" className="text-[10px]">
                    Audio: {uploadedVideo.metadata.audio_codec.toUpperCase()}
                  </Badge>
                )}
                {uploadedVideo.metadata?.bitrate_kbps ? (
                  <Badge variant="default" className="text-[10px]">
                    Bitrate: {uploadedVideo.metadata.bitrate_kbps} kbps
                  </Badge>
                ) : null}
              </div>
            </div>

            {/* Right: FFmpeg Generated Thumbnail (4 cols) */}
            <div className="md:col-span-4 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center justify-between">
                <span>Thumbnail</span>
                <Badge variant="success" className="text-[9px] py-0">Verified</Badge>
              </span>

              {thumbnailStreamUrl ? (
                <div className="relative rounded-xl overflow-hidden aspect-video bg-[var(--surface)] border border-[var(--card-border)] shadow-md group">
                  <img
                    src={thumbnailStreamUrl}
                    alt="Video thumbnail"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-[10px] bg-black/75 px-2 py-1 rounded text-white font-mono">
                      Frame @ 1.0s
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl aspect-video bg-[var(--surface)] border border-[var(--card-border)] flex items-center justify-center text-[var(--text-muted)] text-xs">
                  No thumbnail
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STATE 3: DROPZONE / FILE BROWSE (DEFAULT IDLE STATE) */}
      {uploadProgress === null && !uploadedVideo && (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center transition-all cursor-pointer relative overflow-hidden group ${
            dragActive
              ? 'border-[#A3E635] bg-[#A3E635]/10 shadow-2xl scale-[1.01]'
              : 'border-[var(--card-border)] hover:border-[#A3E635]/60 bg-[var(--card)] hover:bg-[var(--surface)]'
          }`}
        >
          {/* Hidden HTML File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
            onChange={handleFileInputChange}
            className="hidden"
          />

          {/* Animated Glow on Hover */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#A3E635]/10 rounded-full blur-3xl pointer-events-none group-hover:bg-[#A3E635]/20 transition-all" />

          {/* Center Icon */}
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[#A3E635]/15 border border-[#A3E635]/30 text-[#4D7C0F] dark:text-[#A3E635] flex items-center justify-center group-hover:scale-110 group-hover:border-[#A3E635] transition-all shadow-md">
            <UploadCloud className="w-7 h-7" />
          </div>

          <h3 className="text-base font-bold text-[var(--foreground)] mb-1">
            Drag and drop your long-form video here
          </h3>
          <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto mb-5 leading-relaxed">
            Drop any MP4, MOV, or WebM to auto-detect viral moments and cut 9:16 shorts.
          </p>

          <div className="flex items-center justify-center gap-3">
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="rounded-xl px-5 pointer-events-none text-xs font-bold"
            >
              Browse Computer
            </Button>
          </div>

          {/* Supported Format Tags */}
          <div className="mt-6 pt-5 border-t border-[var(--card-border)] flex flex-wrap items-center justify-center gap-3 text-[11px] text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--foreground)]">Supported Formats:</span>
            <span className="px-2 py-0.5 rounded-md bg-[var(--surface)] border border-[var(--card-border)] font-mono text-[var(--foreground)]">MP4</span>
            <span className="px-2 py-0.5 rounded-md bg-[var(--surface)] border border-[var(--card-border)] font-mono text-[var(--foreground)]">MOV</span>
            <span className="px-2 py-0.5 rounded-md bg-[var(--surface)] border border-[var(--card-border)] font-mono text-[var(--foreground)]">WebM</span>
            <span>•</span>
            <span>Max Size: <strong className="text-[var(--foreground)]">500MB</strong></span>
          </div>
        </div>
      )}
    </div>
  );
};
