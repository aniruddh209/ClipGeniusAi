'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  DownloadCloud, 
  Search, 
  Play, 
  Pause, 
  X, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Scissors, 
  ExternalLink, 
  FolderDown, 
  Sparkles, 
  Zap, 
  FileVideo, 
  Music, 
  Check, 
  Clock, 
  ClipboardPaste, 
  ShieldCheck, 
  RefreshCw, 
  Calendar, 
  Eye, 
  Tag, 
  Info, 
  UserCheck, 
  Layers, 
  ShieldAlert, 
  CheckCheck,
  Video,
  RotateCcw,
  Apple,
  Folder,
  CheckSquare,
  Square
} from 'lucide-react';
import { api } from '@/lib/api';
import { VideoAnalysisResult, VideoFormatOption, DownloadTask } from '@/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { MacOSExportModal } from '@/components/video/MacOSExportModal';
import { FileDetailsModal } from '@/components/video/FileDetailsModal';

function VideoDownloaderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'history' ? 'history' : 'downloader';

  const [activeTab, setActiveTab] = useState<'downloader' | 'history'>(initialTab);
  const [urlInput, setUrlInput] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<VideoAnalysisResult | null>(null);

  // Ownership state (Phase 2)
  const [isCreatorOwned, setIsCreatorOwned] = useState<boolean>(false);
  const [showFullDescription, setShowFullDescription] = useState<boolean>(false);

  // Form selection (Phase 3)
  const [selectedFormat, setSelectedFormat] = useState<VideoFormatOption | null>(null);
  const [selectedExt, setSelectedExt] = useState<string>('mp4');
  const [saveDestination, setSaveDestination] = useState<'downloads' | 'projects' | 'custom'>('projects');
  const [customPath, setCustomPath] = useState<string>('');
  const [isStartingDownload, setIsStartingDownload] = useState<boolean>(false);

  // Download tasks & polling
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [historyTasks, setHistoryTasks] = useState<DownloadTask[]>([]);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // macOS File Management & Multi-Select State
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [exportModalTask, setExportModalTask] = useState<DownloadTask | null>(null);
  const [detailsModalTask, setDetailsModalTask] = useState<DownloadTask | null>(null);
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    isOpen: boolean;
    taskIds: string[];
    title: string;
    totalSizeMb: number;
  } | null>(null);

  const managerRef = useRef<HTMLDivElement>(null);

  const handleToggleSelectTask = (taskId: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const handleSelectAllVisible = (taskList: DownloadTask[]) => {
    if (selectedTaskIds.size === taskList.length && taskList.length > 0) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(taskList.map((t) => t.task_id)));
    }
  };

  const handleOpenPlayer = async (task: DownloadTask) => {
    try {
      const res = await api.openInMacOSPlayer({ task_id: task.task_id });
      showNotification(res.message, 'success');
    } catch (e: any) {
      showNotification(e.message || 'Could not open file in macOS player', 'error');
    }
  };

  const handleRevealFinder = async (task: DownloadTask) => {
    try {
      const res = await api.revealInFinder({ task_id: task.task_id });
      showNotification(res.message, 'success');
    } catch (e: any) {
      showNotification(e.message || 'Could not reveal file in Finder', 'error');
    }
  };

  const promptDeleteSingle = (task: DownloadTask) => {
    const sizeMb = Number((task.total_bytes / (1024 * 1024)).toFixed(1)) || 0;
    setDeleteConfirmState({
      isOpen: true,
      taskIds: [task.task_id],
      title: task.title,
      totalSizeMb: sizeMb,
    });
  };

  const promptDeleteBatch = () => {
    if (selectedTaskIds.size === 0) return;
    const selectedList = tasks.filter((t) => selectedTaskIds.has(t.task_id));
    const totalBytes = selectedList.reduce((acc, t) => acc + (t.total_bytes || 0), 0);
    const totalMb = Number((totalBytes / (1024 * 1024)).toFixed(1));
    setDeleteConfirmState({
      isOpen: true,
      taskIds: Array.from(selectedTaskIds),
      title: `${selectedTaskIds.size} selected downloads`,
      totalSizeMb: totalMb,
    });
  };

  const executeConfirmedDeletion = async () => {
    if (!deleteConfirmState) return;
    const { taskIds } = deleteConfirmState;
    try {
      if (taskIds.length === 1) {
        try {
          await api.deleteDownloaderTask(taskIds[0]);
        } catch {
          await api.deleteFile({ task_id: taskIds[0] });
        }
      } else {
        try {
          await api.batchDeleteDownloaderTasks(taskIds);
        } catch {
          await api.batchDeleteFiles({ task_ids: taskIds });
        }
      }
      setSelectedTaskIds((prev) => {
        const next = new Set(prev);
        taskIds.forEach((id) => next.delete(id));
        return next;
      });
      setTasks((prev) => prev.filter((t) => !taskIds.includes(t.task_id)));
      setHistoryTasks((prev) => prev.filter((t) => !taskIds.includes(t.task_id)));
      showNotification(`Successfully deleted ${taskIds.length} download(s).`, 'success');
      await fetchTasks();
    } catch (e: any) {
      showNotification(`Deletion failed: ${e.message}`, 'error');
    } finally {
      setDeleteConfirmState(null);
    }
  };

  // Sync tab with URL if param changes
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'history') {
      setActiveTab('history');
    } else {
      setActiveTab('downloader');
    }
  }, [searchParams]);

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // Fetch tasks
  const fetchTasks = async () => {
    try {
      const data = await api.getDownloaderTasks();
      setTasks(data);
      const hist = data.filter((t) => t.status === 'completed');
      setHistoryTasks(hist);
    } catch {
      // ignore
    }
  };

  // Live polling every 1.5 seconds when there are active downloads
  useEffect(() => {
    fetchTasks();
    const interval = setInterval(() => {
      fetchTasks();
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  // Handle URL Analysis (Phase 1)
  const handleAnalyze = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = urlInput.trim();
    if (!clean) {
      setAnalysisError('Please enter a valid video link.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);
    setSelectedFormat(null);
    setIsCreatorOwned(false);

    try {
      const result = await api.analyzeDownloaderUrl(clean);
      setAnalysisResult(result);

      // Select default recommended format from confirmed qualities
      const qualities = result.confirmed_qualities || result.formats || [];
      const recommended = qualities.find((f) => f.recommended) || qualities[0];
      if (recommended) {
        setSelectedFormat(recommended);
        setSelectedExt(recommended.ext);
      }
      showNotification(`Analyzed: "${result.title.slice(0, 40)}..."`, 'success');
    } catch (err: any) {
      setAnalysisError(err.message || 'Failed to analyze video URL. Please check the link and try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Paste from clipboard helper
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrlInput(text);
        setAnalysisError(null);
      }
    } catch {
      showNotification('Unable to access clipboard. Please paste manually.', 'error');
    }
  };

  // Start Download
  const handleStartDownload = async () => {
    if (!analysisResult || !selectedFormat) return;

    setIsStartingDownload(true);
    try {
      await api.startDownloaderTask({
        url: analysisResult.url,
        format_id: selectedFormat.format_id,
        ext: selectedExt,
        resolution: selectedFormat.resolution,
        save_destination: saveDestination,
        custom_path: saveDestination === 'custom' ? customPath : undefined,
        title: analysisResult.title,
        thumbnail: analysisResult.thumbnail || undefined,
        estimated_size: selectedFormat.filesize_bytes || undefined,
      });

      showNotification(`Started download: ${analysisResult.title.slice(0, 35)}...`, 'success');
      fetchTasks();

      // Smooth scroll to Download Manager section
      if (managerRef.current) {
        managerRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (err: any) {
      showNotification(err.message || 'Failed to start download', 'error');
    } finally {
      setIsStartingDownload(false);
    }
  };

  // Task Control actions
  const handlePause = async (taskId: string) => {
    try {
      await api.pauseDownloaderTask(taskId);
      showNotification('Download paused', 'info');
      fetchTasks();
    } catch (err: any) {
      showNotification(err.message || 'Could not pause', 'error');
    }
  };

  const handleResume = async (taskId: string) => {
    try {
      await api.resumeDownloaderTask(taskId);
      showNotification('Download resumed', 'success');
      fetchTasks();
    } catch (err: any) {
      showNotification(err.message || 'Could not resume', 'error');
    }
  };

  const handleRetry = async (taskId: string) => {
    try {
      await api.retryDownloaderTask(taskId);
      showNotification('Retrying download job...', 'info');
      fetchTasks();
    } catch (err: any) {
      showNotification(err.message || 'Could not retry download', 'error');
    }
  };

  const handleCancel = async (taskId: string) => {
    try {
      await api.cancelDownloaderTask(taskId);
      showNotification('Download cancelled', 'info');
      fetchTasks();
    } catch (err: any) {
      showNotification(err.message || 'Could not cancel', 'error');
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      await api.deleteDownloaderTask(taskId);
      showNotification('Download removed', 'info');
      fetchTasks();
    } catch (err: any) {
      showNotification(err.message || 'Could not delete', 'error');
    }
  };

  // Batch actions
  const handleBatch = async (
    action: 'pause_all' | 'resume_all' | 'download_all' | 'clear_completed' | 'retry_failed' | 'cancel_all'
  ) => {
    try {
      await api.batchDownloaderAction(action);
      const actionMap = {
        pause_all: 'All active downloads paused',
        resume_all: 'Resuming all downloads',
        download_all: 'Starting all downloads',
        retry_failed: 'Retrying all failed & interrupted downloads',
        cancel_all: 'All active downloads cancelled',
        clear_completed: 'Cleared completed records',
      };
      showNotification(actionMap[action], 'info');
      fetchTasks();
    } catch (err: any) {
      showNotification(err.message || 'Batch action failed', 'error');
    }
  };

  // Clip directly in AI Clipper
  const handleClipInStudio = async (taskId: string) => {
    try {
      showNotification('Importing media into ClipGenius AI Studio...', 'info');
      const res = await api.clipDownloadedVideo(taskId);
      showNotification('Ready! Redirecting to AI Clipper...', 'success');
      window.dispatchEvent(new CustomEvent('projects-updated'));
      setTimeout(() => {
        router.push(`/dashboard/create?video_id=${res.video_id}`);
      }, 700);
    } catch (err: any) {
      showNotification(err.message || 'Failed to clip video', 'error');
    }
  };

  // Filtered lists
  const activeDownloads = tasks.filter(
    (t) => t.status === 'downloading' || t.status === 'queued' || t.status === 'paused' || t.status === 'processing'
  );

  const completedDownloads = tasks.filter((t) => t.status === 'completed');

  const filteredTasks = tasks.filter((t) => {
    if (!searchFilter.trim()) return true;
    return (t.title || '').toLowerCase().includes(searchFilter.toLowerCase());
  });

  const filteredHistory = historyTasks.filter((t) => {
    if (!searchFilter.trim()) return true;
    return (t.title || '').toLowerCase().includes(searchFilter.toLowerCase());
  });

  // Confirmed available qualities from source
  const availableQualities = analysisResult?.confirmed_qualities || analysisResult?.formats || [];

  return (
    <div className="flex-1 min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div
            className={cn(
              'px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md flex items-center gap-3 text-xs font-medium max-w-md',
              notification.type === 'success' && 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200 shadow-emerald-950/40',
              notification.type === 'error' && 'bg-rose-950/80 border-rose-500/40 text-rose-200 shadow-rose-950/40',
              notification.type === 'info' && 'bg-blue-950/80 border-blue-500/40 text-blue-200 shadow-blue-950/40'
            )}
          >
            {notification.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {notification.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            {notification.type === 'info' && <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />}
            <span>{notification.message}</span>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="border-b border-[var(--card-border)] bg-[var(--surface)]/90 backdrop-blur-md sticky top-0 z-30 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-400 flex items-center justify-center shadow-lg shadow-blue-600/30">
              <DownloadCloud className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-tight">Video Downloader</h1>
                <Badge variant="blue" className="text-[10px] uppercase font-semibold tracking-wider">
                  4K / HD
                </Badge>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Download high-speed video streams directly to your Mac or import to AI Clipper for viral short creation.
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 bg-white/[0.04] p-1 rounded-xl border border-[var(--card-border)]">
            <button
              onClick={() => {
                setActiveTab('downloader');
                router.push('/dashboard/downloader');
              }}
              className={cn(
                'px-4 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 cursor-pointer',
                activeTab === 'downloader'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold'
                  : 'text-[var(--text-muted)] hover:text-zinc-200 hover:bg-white/[0.04]'
              )}
            >
              <DownloadCloud className="w-3.5 h-3.5" />
              <span>Downloader</span>
              {activeDownloads.length > 0 && (
                <span className="w-5 h-5 rounded-full bg-cyan-400 text-black text-[10px] font-bold flex items-center justify-center animate-pulse">
                  {activeDownloads.length}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setActiveTab('history');
                router.push('/dashboard/downloader?tab=history');
              }}
              className={cn(
                'px-4 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 cursor-pointer',
                activeTab === 'history'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold'
                  : 'text-[var(--text-muted)] hover:text-zinc-200 hover:bg-white/[0.04]'
              )}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Download History</span>
              {completedDownloads.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-zinc-300 text-[10px] font-semibold">
                  {completedDownloads.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 px-6 py-8 max-w-7xl mx-auto w-full space-y-8">
        {activeTab === 'downloader' ? (
          <>
            {/* FIRST PHASE: YOUTUBE VIDEO ANALYSIS INPUT */}
            <div className="rounded-2xl border border-[var(--card-border)] bg-gradient-to-b from-white/[0.04] to-transparent p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

              <div className="max-w-3xl space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 tracking-wider uppercase">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Fast Video Downloader</span>
                </div>

                <h2 className="text-xl font-bold text-white tracking-tight">
                  Enter Video or Media Link
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Paste any YouTube video link, podcast, interview, or direct media URL (MP4, WebM, MOV).
                </p>

                <form onSubmit={handleAnalyze} className="pt-2">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Video className="w-4 h-4 text-[var(--text-muted)]" />
                      </div>
                      <input
                        type="url"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=... or direct MP4 link"
                        className="w-full h-11 pl-10 pr-24 rounded-xl bg-[var(--card)] border border-[var(--card-border)] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/80 focus:ring-2 focus:ring-blue-500/20 transition-all font-mono"
                      />
                      <button
                        type="button"
                        onClick={handlePaste}
                        className="absolute inset-y-1.5 right-1.5 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 hover:text-white text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Paste from clipboard"
                      >
                        <ClipboardPaste className="w-3.5 h-3.5" />
                        <span>Paste</span>
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={isAnalyzing || !urlInput.trim()}
                      className="h-11 px-6 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-500 hover:from-blue-500 hover:to-sky-500 text-white font-medium text-xs tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                      {isAnalyzing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Analyzing Video...</span>
                        </>
                      ) : (
                        <>
                          <Search className="w-4 h-4" />
                          <span>Analyze Video</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>

                {/* Error Banner */}
                {analysisError && (
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                    <div className="flex-1 space-y-1.5">
                      <p className="font-bold text-rose-200">Analysis Error</p>
                      <p className="text-rose-300/90 text-xs leading-relaxed">{analysisError}</p>
                      {(analysisError.toLowerCase().includes('sign-in') || analysisError.toLowerCase().includes('bot') || analysisError.toLowerCase().includes('unavailable')) && (
                        <div className="mt-2 pt-2 border-t border-rose-500/20 text-[11px] text-zinc-300 space-y-1">
                          <p className="font-semibold text-rose-300">Tips to resolve this:</p>
                          <ul className="list-disc list-inside space-y-0.5 text-[var(--text-muted)]">
                            <li>Check that the YouTube link is valid and publicly accessible (not private or removed).</li>
                            <li>If YouTube has an age restriction or bot challenge on this video, place a Netscape <code className="text-emerald-400 bg-black/40 px-1 py-0.2 rounded font-mono">cookies.txt</code> in the project folder to authorize downloads.</li>
                            <li>You can also paste any direct video URL (MP4, WebM, MOV) or use the <strong>AI Clipper</strong> direct uploader.</li>
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Platform Support Pills */}
                <div className="pt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                  <span className="font-medium text-[var(--text-muted)]">Supported:</span>
                  <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-[var(--card-border)] text-zinc-300 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    <span>YouTube (4K • 1080p • Shorts)</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-[var(--card-border)] text-[var(--text-muted)]">
                    Direct Cloud MP4 / MOV / WebM
                  </span>
                </div>
              </div>
            </div>

            {/* FIRST & SECOND PHASE: YOUTUBE METADATA & AUTHORIZED STUDIO WORKFLOW */}
            {analysisResult && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
                {/* Permitted Public Metadata Card */}
                <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--card-border)] pb-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="blue" className="text-[10px] uppercase font-semibold">
                        {analysisResult.provider === 'youtube' ? 'YouTube Stream' : 'Direct Media'}
                      </Badge>
                      <span className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Source Verified ({analysisResult.api_source || 'YouTube Data API'})</span>
                      </span>
                    </div>

                    {/* Ownership Toggle - Phase 2 */}
                    <div className="flex items-center gap-2 bg-white/[0.04] p-1 rounded-xl border border-[var(--card-border)]">
                      <button
                        type="button"
                        onClick={() => setIsCreatorOwned(false)}
                        className={cn(
                          'px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5',
                          !isCreatorOwned
                            ? 'bg-blue-600 text-white font-semibold shadow-sm'
                            : 'text-[var(--text-muted)] hover:text-zinc-200'
                        )}
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Public Video</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsCreatorOwned(true)}
                        className={cn(
                          'px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5',
                          isCreatorOwned
                            ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white font-semibold shadow-md shadow-red-600/30'
                            : 'text-[var(--text-muted)] hover:text-zinc-200'
                        )}
                      >
                        <UserCheck className="w-3.5 h-3.5 text-red-300" />
                        <span>My Channel Video</span>
                      </button>
                    </div>
                  </div>

                  {/* Metadata Presentation Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left: Thumbnail & Duration */}
                    <div className="lg:col-span-5 space-y-3">
                      <div className="relative aspect-video rounded-xl overflow-hidden border border-[var(--card-border)] bg-black group shadow-lg">
                        {analysisResult.thumbnail ? (
                          <Image
                            src={analysisResult.thumbnail}
                            alt={analysisResult.title}
                            fill
                            unoptimized
                            className="object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-[var(--surface)] text-zinc-600">
                            <FileVideo className="w-12 h-12" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

                        {/* Duration Pill */}
                        <div className="absolute bottom-3 right-3 px-2 py-1 rounded-md bg-black/85 backdrop-blur-md text-white text-[11px] font-mono font-medium border border-[var(--card-border)] flex items-center gap-1">
                          <Clock className="w-3 h-3 text-blue-400" />
                          <span>{analysisResult.duration_formatted}</span>
                        </div>

                        {/* Views Pill */}
                        <div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-black/75 backdrop-blur-md text-zinc-300 text-[10px] font-medium border border-[var(--card-border)] flex items-center gap-1">
                          <Eye className="w-3 h-3 text-cyan-400" />
                          <span>{analysisResult.view_count_formatted}</span>
                        </div>
                      </div>

                      {/* Video ID & Direct Link */}
                      <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] px-1">
                        <span>Video ID: <code className="text-[var(--text-muted)] font-mono">{analysisResult.video_id}</code></span>
                        <a
                          href={analysisResult.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium transition-colors"
                        >
                          <span>Open on YouTube</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>

                    {/* Right: Title, Channel, Published Date, License */}
                    <div className="lg:col-span-7 space-y-4">
                      <div>
                        <h3 className="font-bold text-base text-white leading-snug">
                          {analysisResult.title}
                        </h3>

                        <div className="flex flex-wrap items-center gap-y-1.5 gap-x-3 text-xs text-[var(--text-muted)] mt-2">
                          {/* Channel Name */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[var(--text-muted)]">Channel:</span>
                            {analysisResult.channel_url ? (
                              <a
                                href={analysisResult.channel_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-blue-300 hover:text-blue-200 hover:underline flex items-center gap-1"
                              >
                                <span>{analysisResult.channel_name || analysisResult.uploader}</span>
                                <ExternalLink className="w-3 h-3 text-blue-400/80" />
                              </a>
                            ) : (
                              <span className="font-semibold text-blue-300">
                                {analysisResult.channel_name || analysisResult.uploader}
                              </span>
                            )}
                          </div>

                          <span>•</span>

                          {/* Published Date */}
                          <div className="flex items-center gap-1 text-[var(--text-muted)]">
                            <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                            <span>{analysisResult.published_date_formatted || 'Published recently'}</span>
                          </div>

                          <span>•</span>

                          {/* License Info */}
                          <div className="flex items-center gap-1">
                            <Badge
                              variant={analysisResult.is_creative_commons ? 'success' : 'default'}
                              className="text-[10px]"
                            >
                              {analysisResult.license || 'Standard YouTube License'}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {/* Description snippet */}
                      {analysisResult.description && (
                        <div className="space-y-1 bg-white/[0.02] p-3 rounded-xl border border-[var(--card-border)]">
                          <p className={cn('text-xs text-[var(--text-muted)] leading-relaxed', !showFullDescription && 'line-clamp-2')}>
                            {analysisResult.description}
                          </p>
                          {analysisResult.description.length > 140 && (
                            <button
                              type="button"
                              onClick={() => setShowFullDescription(!showFullDescription)}
                              className="text-[11px] text-blue-400 hover:text-blue-300 font-medium cursor-pointer"
                            >
                              {showFullDescription ? 'Show less' : 'Read more description'}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Public Tags */}
                      {analysisResult.tags && analysisResult.tags.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <Tag className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                          {analysisResult.tags.slice(0, 6).map((tag, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-[var(--card-border)] text-[10px] text-[var(--text-muted)] font-mono"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* SECOND PHASE: AUTHORIZED VIDEO DOWNLOAD WORKFLOW (YouTube Studio) */}
                {isCreatorOwned && analysisResult.workflow && (
                  <div className="rounded-2xl border border-red-500/30 bg-gradient-to-b from-[#180a0e] to-[#0c0608] p-6 shadow-2xl space-y-5 animate-in fade-in duration-300">
                    <div className="flex items-center justify-between border-b border-red-500/20 pb-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400">
                          <UserCheck className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-white">
                            Creator Authorized Video Download Workflow
                          </h3>
                          <p className="text-[11px] text-[var(--text-muted)]">
                            Download your original master MP4 file directly via official YouTube Studio.
                          </p>
                        </div>
                      </div>

                      {analysisResult.workflow.studio_url && (
                        <a
                          href={analysisResult.workflow.studio_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-red-600/30 transition-all cursor-pointer"
                        >
                          <span>Open in YouTube Studio</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>

                    {/* Step-by-Step Official Instructions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-3 bg-black/40 p-4 rounded-xl border border-[var(--card-border)]">
                        <h4 className="text-xs font-semibold text-red-300 uppercase tracking-wider flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5" />
                          <span>Official Download Steps:</span>
                        </h4>

                        <ol className="space-y-2 text-xs text-zinc-300">
                          {analysisResult.workflow.official_guide_steps.map((step, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="w-4 h-4 rounded-full bg-red-500/20 text-red-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                                {idx + 1}
                              </span>
                              <span className="leading-relaxed">{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>

                      {/* Official API Disclaimer & Safety Guidelines */}
                      <div className="space-y-3 bg-black/40 p-4 rounded-xl border border-[var(--card-border)] flex flex-col justify-between">
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                            <span>Official YouTube Data API Policy</span>
                          </h4>
                          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                            {analysisResult.workflow.disclaimer}
                          </p>
                        </div>

                        <div className="pt-2 border-t border-[var(--card-border)] flex items-center justify-between gap-2">
                          <a
                            href={analysisResult.workflow.learn_more_url || 'https://support.google.com/youtube/answer/56100'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-[var(--text-muted)] hover:text-[var(--foreground)] flex items-center gap-1 transition-colors"
                          >
                            <span>Google Support Guide</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>

                          <Link href="/dashboard/create">
                            <button
                              type="button"
                              className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-blue-300 hover:text-blue-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <Scissors className="w-3.5 h-3.5" />
                              <span>Go to AI Clipper</span>
                            </button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* VIDEO QUALITY & FORMAT SELECTOR */}
                <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-b from-[#0a0a0a] to-[#000000] p-6 shadow-2xl space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--card-border)] pb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                        <FileVideo className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-white">
                          Select Download Quality
                        </h3>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          Choose your desired resolution and audio profile.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant="blue" className="text-[10px]">
                        {availableQualities.length} Streams Available
                      </Badge>
                    </div>
                  </div>

                  {/* Confirmed Quality Selection Grid */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs">
                      <label className="font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Available Video & Audio Streams</span>
                      </label>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        Direct high-fidelity streams
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {availableQualities.map((fmt, idx) => {
                        const isSelected = selectedFormat?.format_id === fmt.format_id && selectedFormat?.type === fmt.type;
                        return (
                          <button
                            key={`${fmt.format_id}-${idx}`}
                            type="button"
                            onClick={() => {
                              setSelectedFormat(fmt);
                              setSelectedExt(fmt.ext);
                            }}
                            className={cn(
                              'p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between cursor-pointer group',
                              isSelected
                                ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-600/25 ring-1 ring-blue-500/60'
                                : 'bg-white/[0.03] border-[var(--card-border)] hover:bg-white/[0.06] hover:border-white/[0.15]'
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  {fmt.type === 'audio' ? (
                                    <Music className="w-3.5 h-3.5 text-indigo-400" />
                                  ) : (
                                    <FileVideo className="w-3.5 h-3.5 text-blue-400" />
                                  )}
                                  <span className="font-bold text-xs text-white">
                                    {fmt.resolution}
                                  </span>
                                  {fmt.recommended && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/30 text-blue-300 border border-blue-500/40">
                                      RECOMMENDED
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-[var(--text-muted)] truncate">
                                  {fmt.label}
                                </p>
                              </div>

                              <div className={cn(
                                'w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                                isSelected ? 'border-blue-400 bg-blue-500 text-white' : 'border-zinc-600 bg-black/40'
                              )}>
                                {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                              </div>
                            </div>

                            <div className="mt-3 pt-2 border-t border-[var(--card-border)] flex items-center justify-between text-[10px]">
                              <span className="text-[var(--text-muted)] font-medium flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                                <span>{fmt.badge}</span>
                              </span>
                              <span className="font-mono text-blue-300 font-semibold">{fmt.filesize_formatted}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Output Container & Save Destination */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      {/* Format Selector */}
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider block mb-1.5">
                          Output Container Format
                        </label>
                        <div className="flex items-center gap-2">
                          {selectedFormat?.type === 'audio' ? (
                            <>
                              {['mp3', 'm4a'].map((ext) => (
                                <button
                                  key={ext}
                                  type="button"
                                  onClick={() => setSelectedExt(ext)}
                                  className={cn(
                                    'flex-1 py-2 rounded-lg border text-xs font-semibold uppercase transition-all cursor-pointer',
                                    selectedExt === ext
                                      ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                                      : 'bg-white/[0.03] border-[var(--card-border)] text-[var(--text-muted)] hover:text-zinc-200'
                                  )}
                                >
                                  {ext}
                                </button>
                              ))}
                            </>
                          ) : (
                            <>
                              {['mp4', 'webm'].map((ext) => (
                                <button
                                  key={ext}
                                  type="button"
                                  onClick={() => setSelectedExt(ext)}
                                  className={cn(
                                    'flex-1 py-2 rounded-lg border text-xs font-semibold uppercase transition-all cursor-pointer',
                                    selectedExt === ext
                                      ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                                      : 'bg-white/[0.03] border-[var(--card-border)] text-[var(--text-muted)] hover:text-zinc-200'
                                  )}
                                >
                                  {ext}
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Destination Selector */}
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider block mb-1.5">
                          Save Destination
                        </label>
                        <select
                          value={saveDestination}
                          onChange={(e: any) => setSaveDestination(e.target.value)}
                          className="w-full h-9 px-3 rounded-lg bg-[var(--card)] border border-[var(--card-border)] text-xs text-zinc-200 focus:outline-none focus:border-blue-500/80 cursor-pointer"
                        >
                          <option value="downloads">💻 Save to My Mac (Downloads)</option>
                          <option value="projects">✂️ Save to AI Studio (Auto-Clip Ready)</option>
                          <option value="custom">📁 Custom Folder Path</option>
                        </select>
                      </div>
                    </div>

                    {/* Custom Folder Input if selected */}
                    {saveDestination === 'custom' && (
                      <div className="space-y-1 animate-in fade-in duration-200">
                        <label className="text-[11px] text-[var(--text-muted)]">Custom Destination Folder Path</label>
                        <input
                          type="text"
                          value={customPath}
                          onChange={(e) => setCustomPath(e.target.value)}
                          placeholder="/Users/username/Downloads/MyVideos"
                          className="w-full h-9 px-3 rounded-lg bg-[var(--card)] border border-[var(--card-border)] text-xs text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    )}

                    {/* Start Download Button */}
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={handleStartDownload}
                        disabled={isStartingDownload || !selectedFormat}
                        className="w-full h-11 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-semibold text-xs tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isStartingDownload ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Registering Download Task...</span>
                          </>
                        ) : (
                          <>
                            <DownloadCloud className="w-4 h-4" />
                            <span>
                              Start Download ({selectedFormat?.resolution} • {selectedExt.toUpperCase()})
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* DOWNLOAD MANAGER (ACTIVE TASKS & REAL-TIME CONTROLS) */}
            <div ref={managerRef} className="space-y-4 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--card-border)] pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                      <span>Download Manager</span>
                      <Badge variant="blue" className="text-[11px]">
                        {activeDownloads.length} Active / {tasks.length} Total
                      </Badge>
                    </h2>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
                    <Info className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                    <span>Actual transfer speed is determined by your connection bandwidth and source server limits.</span>
                  </p>
                </div>

                {/* Batch Actions Toolbar */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute inset-y-0 left-2.5 my-auto" />
                    <input
                      type="text"
                      placeholder="Filter downloads..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="w-40 sm:w-48 h-8 pl-8 pr-2.5 rounded-lg bg-white/[0.04] border border-[var(--card-border)] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50"
                    />
                  </div>

                  <button
                    onClick={() => handleSelectAllVisible(filteredTasks)}
                    className="h-8 px-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white border border-[var(--card-border)] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Select or deselect all items"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                    <span>{selectedTaskIds.size === filteredTasks.length && filteredTasks.length > 0 ? 'Deselect' : 'Select All'}</span>
                  </button>

                  <button
                    onClick={() => handleBatch('resume_all')}
                    className="h-8 px-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white border border-[var(--card-border)] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Resume all paused and interrupted downloads"
                  >
                    <Play className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="hidden sm:inline">Resume All</span>
                  </button>

                  <button
                    onClick={() => handleBatch('pause_all')}
                    className="h-8 px-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white border border-[var(--card-border)] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Pause all active downloads"
                  >
                    <Pause className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Pause All</span>
                  </button>

                  <button
                    onClick={() => handleBatch('retry_failed')}
                    className="h-8 px-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-blue-300 hover:text-white border border-[var(--card-border)] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Retry all failed and interrupted downloads"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
                    <span className="hidden sm:inline">Retry Failed</span>
                  </button>

                  <button
                    onClick={() => handleBatch('cancel_all')}
                    className="h-8 px-2.5 rounded-lg bg-white/[0.04] hover:bg-rose-500/20 text-[var(--text-muted)] hover:text-rose-400 border border-[var(--card-border)] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Cancel all active downloads"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Cancel All</span>
                  </button>

                  <button
                    onClick={() => handleBatch('clear_completed')}
                    className="h-8 px-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[var(--text-muted)] hover:text-zinc-200 border border-[var(--card-border)] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Clear completed tasks from view"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                    <span className="hidden sm:inline">Clear Done</span>
                  </button>
                </div>
              </div>

              {/* Download Engine Status Strip */}
              <div className="p-3 px-4 rounded-xl bg-blue-950/20 border border-blue-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-semibold text-white">Resumable Download Engine</span>
                  <span className="text-[var(--text-muted)] hidden sm:inline">•</span>
                  <span className="text-[var(--text-muted)] text-[11px] hidden sm:inline">Auto-reconnects on network drops without file corruption.</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono shrink-0">
                    Range Resumption
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[10px] font-mono shrink-0">
                    macOS Native
                  </span>
                </div>
              </div>

              {/* Multi-Selection Batch Actions Banner */}
              {selectedTaskIds.size > 0 && (
                <div className="p-3.5 rounded-2xl bg-blue-950/40 border border-blue-500/30 flex items-center justify-between text-xs animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-blue-400" />
                    <span className="font-bold text-white">
                      {selectedTaskIds.size} item(s) selected
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={promptDeleteBatch}
                      className="rounded-xl text-xs py-1.5 px-3 bg-rose-600 hover:bg-rose-500 text-white"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete Selected ({selectedTaskIds.size})
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedTaskIds(new Set())}
                      className="rounded-xl text-xs py-1.5 text-[var(--text-muted)] hover:text-[var(--foreground)]"
                    >
                      Deselect
                    </Button>
                  </div>
                </div>
              )}

              {/* Downloads Task List */}
              {filteredTasks.length === 0 ? (
                <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-12 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-[var(--card-border)] flex items-center justify-center mx-auto text-[var(--text-muted)]">
                    <DownloadCloud className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold text-sm text-zinc-300">No Active Downloads</h3>
                  <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
                    Paste a YouTube link above and click Analyze to begin downloading high-definition videos with verified source qualities.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTasks.map((task) => {
                    const isConnecting = task.status === 'connecting';
                    const isDownloading = task.status === 'downloading';
                    const isPaused = task.status === 'paused';
                    const isInterrupted = task.status === 'interrupted';
                    const isVerifying = task.status === 'verifying';
                    const isCompleted = task.status === 'completed';
                    const isFailed = task.status === 'failed' || task.status === 'cancelled';
                    const isQueued = task.status === 'queued';

                    return (
                      <div
                        key={task.task_id}
                        className={cn(
                          'p-4 rounded-xl border transition-all space-y-3',
                          isDownloading && 'bg-blue-950/20 border-blue-500/40 shadow-lg shadow-blue-950/20',
                          isConnecting && 'bg-blue-950/15 border-blue-500/30',
                          isVerifying && 'bg-indigo-950/20 border-indigo-500/40',
                          isPaused && 'bg-amber-950/15 border-amber-500/30',
                          isInterrupted && 'bg-orange-950/15 border-orange-500/30',
                          isCompleted && 'bg-emerald-950/15 border-emerald-500/30',
                          isFailed && 'bg-rose-950/15 border-rose-500/30',
                          !isDownloading && !isConnecting && !isVerifying && !isPaused && !isInterrupted && !isCompleted && !isFailed && 'bg-white/[0.02] border-[var(--card-border)]'
                        )}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          {/* Thumbnail, Checkbox & Title */}
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <button
                              type="button"
                              onClick={() => handleToggleSelectTask(task.task_id)}
                              className="shrink-0 p-1 text-[var(--text-muted)] hover:text-blue-400 cursor-pointer"
                              title={selectedTaskIds.has(task.task_id) ? "Deselect" : "Select"}
                            >
                              {selectedTaskIds.has(task.task_id) ? (
                                <CheckSquare className="w-4 h-4 text-blue-400" />
                              ) : (
                                <Square className="w-4 h-4 text-zinc-600" />
                              )}
                            </button>

                            <div className="w-16 h-10 rounded-lg overflow-hidden bg-black shrink-0 relative border border-[var(--card-border)]">
                              {task.thumbnail ? (
                                <Image
                                  src={task.thumbnail}
                                  alt={task.title}
                                  fill
                                  unoptimized
                                  className="object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-zinc-600">
                                  <FileVideo className="w-4 h-4" />
                                </div>
                              )}
                              <span className="absolute bottom-0.5 right-0.5 px-1 py-0.2 rounded bg-black/90 text-[8px] font-mono text-zinc-300">
                                {task.resolution}
                              </span>
                            </div>

                            <div className="min-w-0 flex-1">
                              <h4 className="text-xs font-semibold text-white truncate leading-tight">
                                {task.title}
                              </h4>
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)] mt-0.5">
                                <span className="uppercase font-mono font-medium text-blue-400">
                                  {task.ext}
                                </span>
                                <span>•</span>
                                <span>{task.resolution}</span>
                                <span>•</span>
                                <span className="font-mono text-[var(--text-muted)]">
                                  {task.total_bytes > 0
                                    ? `${(task.downloaded_bytes / (1024 * 1024)).toFixed(1)} / ${(task.total_bytes / (1024 * 1024)).toFixed(1)} MB`
                                    : 'Calculating size...'}
                                </span>
                                {task.supports_ranges && (
                                  <>
                                    <span>•</span>
                                    <span className="text-[10px] text-emerald-400/90 font-mono">Range Resumable</span>
                                  </>
                                )}
                                {task.integrity_verified && (
                                  <>
                                    <span>•</span>
                                    <span className="text-[10px] text-cyan-400/90 font-mono flex items-center gap-0.5">
                                      <ShieldCheck className="w-2.5 h-2.5" /> FFprobe Verified
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Status Badge & Speed Indicators */}
                          <div className="flex items-center gap-3 self-end sm:self-center">
                            <div className="text-right text-[11px] space-y-0.5">
                              {isDownloading && (
                                <>
                                  <div className="font-mono font-semibold text-cyan-400 flex items-center gap-1 justify-end">
                                    <Zap className="w-3 h-3 text-cyan-400 animate-pulse" />
                                    <span>{task.speed_formatted}</span>
                                  </div>
                                  <div className="text-[var(--text-muted)] font-mono text-[10px]">
                                    ETA: {task.eta_formatted}
                                  </div>
                                </>
                              )}

                              {isConnecting && (
                                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-semibold flex items-center gap-1">
                                  <RefreshCw className="w-3 h-3 animate-spin" /> Connecting
                                </span>
                              )}

                              {isVerifying && (
                                <span className="px-2 py-0.5 rounded bg-blue-500/25 text-blue-200 border border-blue-500/40 text-[10px] font-semibold flex items-center gap-1">
                                  <ShieldCheck className="w-3 h-3 text-blue-400 animate-pulse" /> Verifying Media
                                </span>
                              )}

                              {isPaused && (
                                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-semibold">
                                  Paused
                                </span>
                              )}

                              {isInterrupted && (
                                <span className="px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[10px] font-semibold flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3 text-orange-400" /> Interrupted
                                </span>
                              )}

                              {isCompleted && (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Done
                                </span>
                              )}

                              {isFailed && (
                                <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-semibold">
                                  Failed
                                </span>
                              )}

                              {isQueued && (
                                <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 text-[10px] font-semibold">
                                  Queued
                                </span>
                              )}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-1.5">
                              {isDownloading && (
                                <button
                                  onClick={() => handlePause(task.task_id)}
                                  className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-amber-400 flex items-center justify-center transition-colors cursor-pointer"
                                  title="Pause download"
                                >
                                  <Pause className="w-4 h-4" />
                                </button>
                              )}

                              {isPaused && (
                                <button
                                  onClick={() => handleResume(task.task_id)}
                                  className="w-8 h-8 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 flex items-center justify-center transition-colors cursor-pointer"
                                  title="Resume download"
                                >
                                  <Play className="w-4 h-4" />
                                </button>
                              )}

                              {isInterrupted && (
                                <button
                                  onClick={() => handleResume(task.task_id)}
                                  className="h-8 px-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer"
                                  title="Resume interrupted download from last verified byte"
                                >
                                  <Play className="w-3.5 h-3.5" />
                                  <span>Resume</span>
                                </button>
                              )}

                              {isFailed && (
                                <button
                                  onClick={() => handleRetry(task.task_id)}
                                  className="w-8 h-8 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 flex items-center justify-center transition-colors cursor-pointer"
                                  title="Retry download job"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                              )}

                              {(isDownloading || isPaused || isConnecting || isInterrupted) && (
                                <button
                                  onClick={() => handleCancel(task.task_id)}
                                  className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-rose-500/20 text-[var(--text-muted)] hover:text-rose-400 flex items-center justify-center transition-colors cursor-pointer"
                                  title="Cancel download"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}

                              {isCompleted && (
                                <>
                                  <button
                                    onClick={() => handleOpenPlayer(task)}
                                    className="w-8 h-8 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center transition-colors cursor-pointer"
                                    title="Open directly in macOS QuickTime / Media Player"
                                  >
                                    <Play className="w-4 h-4 fill-emerald-400/20" />
                                  </button>

                                  <button
                                    onClick={() => handleRevealFinder(task)}
                                    className="w-8 h-8 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center transition-colors cursor-pointer"
                                    title="Reveal file in macOS Finder"
                                  >
                                    <Folder className="w-4 h-4" />
                                  </button>

                                  <button
                                    onClick={() => setExportModalTask(task)}
                                    className="w-8 h-8 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center justify-center transition-colors cursor-pointer"
                                    title="Export & Convert (Apple ProRes/HEVC/H.264/MOV)"
                                  >
                                    <Apple className="w-4 h-4" />
                                  </button>

                                  <button
                                    onClick={() => setDetailsModalTask(task)}
                                    className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 flex items-center justify-center transition-colors cursor-pointer"
                                    title="Inspect media specs & exact file path"
                                  >
                                    <Info className="w-4 h-4" />
                                  </button>

                                  <button
                                    onClick={() => handleClipInStudio(task.task_id)}
                                    className="px-2.5 h-8 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-[11px] font-semibold flex items-center gap-1.5 shadow-md shadow-blue-600/20 transition-all cursor-pointer"
                                    title="Open directly in AI Clipper to generate viral shorts"
                                  >
                                    <Scissors className="w-3.5 h-3.5" />
                                    <span className="hidden md:inline">Clip AI</span>
                                  </button>

                                  <a
                                    href={api.getDownloadFileUrl(task.task_id)}
                                    download={task.output_filename || 'download'}
                                    className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 flex items-center justify-center transition-colors cursor-pointer"
                                    title="Save to Mac / Downloads"
                                  >
                                    <FolderDown className="w-4 h-4" />
                                  </a>
                                </>
                              )}

                              <button
                                onClick={() => promptDeleteSingle(task)}
                                className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-rose-500/20 text-[var(--text-muted)] hover:text-rose-400 flex items-center justify-center transition-colors cursor-pointer"
                                title="Delete task and media file"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Animated Progress Bar */}
                        <div className="space-y-1">
                          <div className="w-full h-2 rounded-full bg-white/[0.08] overflow-hidden relative">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all duration-300 ease-out',
                                isDownloading && 'bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400',
                                isConnecting && 'bg-blue-400 animate-pulse',
                                isVerifying && 'bg-gradient-to-r from-indigo-500 to-blue-400 animate-pulse',
                                isPaused && 'bg-amber-400',
                                isInterrupted && 'bg-orange-500',
                                isCompleted && 'bg-emerald-500',
                                isFailed && 'bg-rose-500'
                              )}
                              style={{ width: `${Math.max(1, Math.min(100, task.progress_percentage))}%` }}
                            />
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] font-mono">
                            <span>
                              {isConnecting
                                ? 'Connecting to remote host...'
                                : isVerifying
                                ? 'Verifying stream integrity & decodability...'
                                : isDownloading
                                ? 'Stream Ingestion'
                                : isCompleted
                                ? 'Completed'
                                : task.status}
                            </span>
                            <span>{task.progress_percentage.toFixed(1)}%</span>
                          </div>
                        </div>

                        {/* Message for Interrupted or Failed tasks */}
                        {isInterrupted && task.error_message && (
                          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                              <span>{task.error_message}</span>
                            </div>
                            <button
                              onClick={() => handleResume(task.task_id)}
                              className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold cursor-pointer shrink-0"
                            >
                              Resume
                            </button>
                          </div>
                        )}

                        {isFailed && task.error_message && (
                          <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300 flex items-center gap-2">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                            <span>{task.error_message}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          /* DOWNLOAD HISTORY TAB */
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--card-border)] pb-4">
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <Clock className="w-5 h-5 text-blue-400" />
                  <span>Download History</span>
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Archived library of media downloaded via ClipGenius Downloader.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute inset-y-0 left-2.5 my-auto" />
                  <input
                    type="text"
                    placeholder="Search history..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="w-48 h-8 pl-8 pr-2.5 rounded-lg bg-white/[0.04] border border-[var(--card-border)] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50"
                  />
                </div>

                <button
                  onClick={() => handleBatch('clear_completed')}
                  className="h-8 px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[var(--text-muted)] hover:text-zinc-200 border border-[var(--card-border)] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear History</span>
                </button>
              </div>
            </div>

            {filteredHistory.length === 0 ? (
              <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-16 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-[var(--card-border)] flex items-center justify-center mx-auto text-[var(--text-muted)]">
                  <Clock className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-sm text-zinc-300">No Download History Yet</h3>
                <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
                  Completed downloads will appear here with instant offline access and one-click AI clipping.
                </p>
                <div className="pt-2">
                  <button
                    onClick={() => setActiveTab('downloader')}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer shadow-lg shadow-blue-600/30"
                  >
                    Go to Video Downloader
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredHistory.map((item) => (
                  <div
                    key={item.task_id}
                    className="rounded-xl border border-[var(--card-border)] bg-white/[0.02] hover:bg-white/[0.04] transition-all p-4 space-y-3 flex flex-col justify-between group"
                  >
                    <div className="space-y-3">
                      <div className="relative aspect-video rounded-lg overflow-hidden bg-black border border-[var(--card-border)]">
                        {/* Multi-Select Checkbox */}
                        <button
                          type="button"
                          onClick={() => handleToggleSelectTask(item.task_id)}
                          className="absolute top-2 left-2 z-20 p-1.5 rounded-md bg-black/75 hover:bg-black/90 backdrop-blur border border-white/20 text-white cursor-pointer"
                          title={selectedTaskIds.has(item.task_id) ? "Deselect" : "Select"}
                        >
                          {selectedTaskIds.has(item.task_id) ? (
                            <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                          )}
                        </button>

                        {item.thumbnail ? (
                          <Image
                            src={item.thumbnail}
                            alt={item.title}
                            fill
                            unoptimized
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600">
                            <FileVideo className="w-8 h-8" />
                          </div>
                        )}
                        <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-mono text-zinc-300">
                          {item.resolution}
                        </span>
                      </div>

                      <div>
                        <h4 className="font-semibold text-xs text-white line-clamp-2 leading-snug">
                          {item.title}
                        </h4>
                        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] mt-1">
                          <span className="uppercase font-mono text-blue-400">{item.ext}</span>
                          <span>•</span>
                          <span>{(item.total_bytes / (1024 * 1024)).toFixed(1)} MB</span>
                          <span>•</span>
                          <span>{item.completed_at ? new Date(item.completed_at).toLocaleDateString() : 'Recent'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-[var(--card-border)]">
                      {/* macOS Native Actions Row */}
                      <div className="grid grid-cols-4 gap-1.5">
                        <button
                          onClick={() => handleOpenPlayer(item as any)}
                          className="h-7 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center transition-colors cursor-pointer"
                          title="Open in QuickTime / Mac Player"
                        >
                          <Play className="w-3.5 h-3.5 fill-emerald-400/20" />
                        </button>

                        <button
                          onClick={() => handleRevealFinder(item as any)}
                          className="h-7 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center transition-colors cursor-pointer"
                          title="Reveal in Finder"
                        >
                          <Folder className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => setExportModalTask(item as any)}
                          className="h-7 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center justify-center transition-colors cursor-pointer"
                          title="macOS Export & Convert"
                        >
                          <Apple className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => setDetailsModalTask(item as any)}
                          className="h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 border border-[var(--card-border)] flex items-center justify-center transition-colors cursor-pointer"
                          title="File Specs & Location"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* AI Clipping & Download & Delete */}
                      <div className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => handleClipInStudio(item.task_id)}
                          className="flex-1 h-8 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Scissors className="w-3.5 h-3.5" />
                          <span>Clip with AI</span>
                        </button>

                        <a
                          href={api.getDownloadFileUrl(item.task_id)}
                          download={item.output_filename || 'download'}
                          className="h-8 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Download file via browser"
                        >
                          <FolderDown className="w-3.5 h-3.5" />
                          <span>Save</span>
                        </a>

                        <button
                          onClick={() => promptDeleteSingle(item as any)}
                          className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-rose-500/20 text-[var(--text-muted)] hover:text-rose-400 flex items-center justify-center transition-colors cursor-pointer"
                          title="Delete from history and disk"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* macOS Video Export Modal */}
      {exportModalTask && (
        <MacOSExportModal
          isOpen={true}
          taskId={exportModalTask.task_id}
          sourcePath={exportModalTask.output_path || undefined}
          title={exportModalTask.title}
          defaultFilename={exportModalTask.output_filename || undefined}
          onClose={() => setExportModalTask(null)}
          onExportComplete={() => {
            fetchTasks();
          }}
        />
      )}

      {/* File Details & Specs Modal */}
      {detailsModalTask && (
        <FileDetailsModal
          isOpen={true}
          taskId={detailsModalTask.task_id}
          filePath={detailsModalTask.output_path || undefined}
          onClose={() => setDetailsModalTask(null)}
          onOpenExport={() => {
            const t = detailsModalTask;
            setDetailsModalTask(null);
            setExportModalTask(t);
          }}
          onDeleted={() => {
            setDetailsModalTask(null);
            fetchTasks();
          }}
        />
      )}

      {/* Permanent Deletion Confirmation Modal */}
      {deleteConfirmState && deleteConfirmState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-[var(--card)] border border-rose-500/30 p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">Confirm Permanent Deletion</h3>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  {deleteConfirmState.taskIds.length === 1
                    ? `Are you sure you want to permanently delete "${deleteConfirmState.title}" and its media file from your disk?`
                    : `Are you sure you want to permanently delete ${deleteConfirmState.taskIds.length} selected video files from your disk?`}
                </p>
                <p className="text-[11px] text-rose-400/90 font-medium">
                  This action cannot be undone. Files will be removed from your Mac storage.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteConfirmState(null)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--foreground)]"
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={executeConfirmedDeletion}
                className="bg-rose-600 hover:bg-rose-500 text-white text-xs px-4 py-2 rounded-xl"
              >
                Yes, Delete Permanently
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VideoDownloaderPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 min-h-[60vh] bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="w-7 h-7 text-blue-500 animate-spin" />
            <p className="text-xs font-medium text-[var(--text-muted)]">Loading Video Downloader...</p>
          </div>
        </div>
      }
    >
      <VideoDownloaderContent />
    </Suspense>
  );
}
