'use client';

import React, { useState, useRef } from 'react';
import { UploadCloud, Link as LinkIcon, Film, AlertCircle, CheckCircle2, ArrowRight, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { VideoItem } from '@/types';
import { useRouter } from 'next/navigation';
import { formatDuration, formatFileSize } from '@/lib/utils';

interface UploadDropzoneProps {
  onSuccess?: (video: VideoItem) => void;
}

const SUPPORTED_EXTENSIONS = ['.mp4', '.mov', '.webm'];
const MAX_SIZE_MB = 500;

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({ onSuccess }) => {
  const router = useRouter();
  const [tab, setTab] = useState<'upload' | 'url'>('upload');
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successVideo, setSuccessVideo] = useState<VideoItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (f: File) => {
    setError(null);
    const ext = '.' + f.name.split('.').pop()?.toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      setError(`Unsupported format "${ext}". Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`);
      return;
    }
    const sizeMb = f.size / (1024 * 1024);
    if (sizeMb > MAX_SIZE_MB) {
      setError(`File size (${sizeMb.toFixed(1)}MB) exceeds limit of ${MAX_SIZE_MB}MB.`);
      return;
    }
    setFile(f);
  };

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      let createdVideo: VideoItem;
      if (tab === 'upload') {
        if (!file) {
          setError('Please select a video file first.');
          setLoading(false);
          return;
        }
        setUploadPercent(0);
        createdVideo = await api.uploadVideoWithProgress(file, (percent) => {
          setUploadPercent(percent);
        });
      } else {
        if (!url || !url.trim().startsWith('http')) {
          setError('Please provide a valid video URL (e.g. YouTube).');
          setLoading(false);
          return;
        }
        createdVideo = await api.submitYoutubeUrl(url);
      }

      setSuccessVideo(createdVideo);
      setUploadPercent(null);
      if (onSuccess) {
        onSuccess(createdVideo);
      }
    } catch (err: any) {
      setError(err.message || 'Processing failed. Check backend connection.');
      setUploadPercent(null);
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setFile(null);
    setUrl('');
    setSuccessVideo(null);
    setError(null);
    setUploadPercent(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto rounded-3xl border border-white/[0.08] bg-[#111116] p-6 md:p-8 backdrop-blur-xl shadow-2xl shadow-purple-950/20">
      {/* Mode Switcher */}
      <div className="flex bg-zinc-950/80 p-1.5 rounded-2xl mb-6 border border-white/[0.06]">
        <button
          type="button"
          onClick={() => {
            setTab('upload');
            setError(null);
          }}
          className={`flex-1 py-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
            tab === 'upload'
              ? 'bg-zinc-800 text-white shadow-md'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <UploadCloud className="w-3.5 h-3.5 text-purple-400" />
          Direct File Upload
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('url');
            setError(null);
          }}
          className={`flex-1 py-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
            tab === 'url'
              ? 'bg-zinc-800 text-white shadow-md'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <LinkIcon className="w-3.5 h-3.5 text-blue-400" />
          YouTube / Web URL
        </button>
      </div>

      {successVideo ? (
        <div className="py-6 text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-950/60 border border-emerald-800 text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Video Successfully Stored!</h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
              &quot;{successVideo.title}&quot; ({formatDuration(successVideo.duration)}, {formatFileSize(successVideo.file_size_mb)}) is ready for AI clipping.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-center gap-3">
            <Button
              onClick={() => router.push('/dashboard/create')}
              variant="primary"
              size="md"
              className="rounded-xl px-5 text-xs"
            >
              Configure AI Clips <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
            <Button
              onClick={resetAll}
              variant="outline"
              size="md"
              className="rounded-xl px-4 text-xs"
            >
              Upload Another
            </Button>
          </div>
        </div>
      ) : uploadPercent !== null ? (
        /* Real Upload Progress Bar */
        <div className="py-8 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-purple-950/60 border border-purple-800 text-purple-400 flex items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Uploading &quot;{file?.name}&quot;</h4>
            <p className="text-xs text-zinc-400 mt-0.5">Streaming bytes to backend storage...</p>
          </div>
          <div className="max-w-xs mx-auto space-y-1.5">
            <div className="flex justify-between text-xs font-mono text-zinc-400">
              <span>Transfer</span>
              <span className="text-purple-400 font-bold">{uploadPercent}%</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full rounded-full transition-all duration-150"
                style={{ width: `${uploadPercent}%` }}
              />
            </div>
          </div>
        </div>
      ) : tab === 'upload' ? (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-7 text-center transition-all cursor-pointer ${
            dragActive
              ? 'border-purple-500 bg-purple-950/20'
              : 'border-white/[0.1] hover:border-purple-500/60 bg-zinc-950/40'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-zinc-800/80 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
            <Film className="w-7 h-7" />
          </div>

          <h4 className="text-sm font-semibold text-white mb-1">
            {file ? file.name : 'Choose a long-form video or drag it here'}
          </h4>
          <p className="text-xs text-zinc-500 mb-4">
            Supports MP4, MOV, WebM up to 500MB
          </p>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="rounded-xl px-4 pointer-events-none text-xs"
          >
            {file ? 'Change Video' : 'Browse Computer'}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Paste Video URL
          </label>
          <div className="relative">
            <input
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-zinc-950/80 border border-white/[0.08] rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
            />
          </div>
          <p className="text-[11px] text-zinc-500">
            Powered by yt-dlp. Works with YouTube, podcasts, interviews, and direct video links.
          </p>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-center justify-between p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-zinc-400 hover:text-white">✕</button>
        </div>
      )}

      {!successVideo && uploadPercent === null && (
        <div className="mt-5 flex justify-end">
          <Button
            onClick={handleSubmit}
            isLoading={loading}
            disabled={loading || (tab === 'upload' && !file) || (tab === 'url' && !url)}
            size="md"
            className="w-full sm:w-auto rounded-xl text-xs px-6"
          >
            {loading ? 'Processing Video...' : 'Upload & Inspect Footage'}
          </Button>
        </div>
      )}
    </div>
  );
};
