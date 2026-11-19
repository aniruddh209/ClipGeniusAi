'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Film, 
  Search, 
  Filter, 
  Plus, 
  Play, 
  Download, 
  Flame, 
  Clock, 
  CheckCircle2, 
  Loader2, 
  SlidersHorizontal,
  ChevronDown,
  Sparkles,
  ExternalLink,
  Scissors,
  Trash2,
  RefreshCw,
  Trophy,
  GraduationCap,
  PartyPopper,
  Lightbulb,
  HardDrive
} from 'lucide-react';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { CircularScore } from '@/components/ui/CircularScore';
import { formatDuration, formatFileSize } from '@/lib/utils';
import { VideoItem, ClipItem, StorageSummaryResponse } from '@/types';
import { api } from '@/lib/api';
import { PipelineProgressModal } from '@/components/video/PipelineProgressModal';

export default function MyProjectsPage() {
  const [filterTab, setFilterTab] = useState<'all' | 'completed' | 'processing'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [projects, setProjects] = useState<VideoItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<VideoItem | null>(null);
  const [previewClip, setPreviewClip] = useState<any | null>(null);
  const [projectClips, setProjectClips] = useState<any[]>([]);
  const [isLoadingClips, setIsLoadingClips] = useState(false);
  const [renderingClipId, setRenderingClipId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingClipId, setDeletingClipId] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageSummaryResponse | null>(null);
  const [isCleaningStorage, setIsCleaningStorage] = useState(false);
  const [activePipelineJobId, setActivePipelineJobId] = useState<string | null>(null);
  const [isTriggeringPipeline, setIsTriggeringPipeline] = useState(false);

  const handleInstantGenerateShorts = async () => {
    if (!selectedProject) return;
    setIsTriggeringPipeline(true);
    try {
      const res = await api.triggerPipeline({
        video_id: selectedProject.id,
        target_aspect_ratio: '9:16',
        duration_range: '30-60',
        max_clips: 5,
        virality_threshold: 70,
        reframing_mode: 'full_screen',
        template_layout: 'full_screen',
        content_type: 'gaming',
        subtitle_preset: 'bold_yellow',
        burn_subtitles: true,
        smart_reframing: true,
        whisper_model: 'tiny',
      });
      setActivePipelineJobId(res.job_id);
    } catch (err: any) {
      console.error('Failed to trigger pipeline from projects page:', err);
      alert(err.message || 'Failed to start AI clipping process.');
    } finally {
      setIsTriggeringPipeline(false);
    }
  };

  const fetchLiveVideos = async () => {
    setIsLoading(true);
    try {
      const [liveVideos, storage] = await Promise.all([
        api.getVideos().catch(() => []),
        api.getStorageSummary().catch(() => null)
      ]);
      if (liveVideos && liveVideos.length > 0) {
        setProjects(liveVideos);
        setSelectedProject((prev) => prev ? (liveVideos.find(v => v.id === prev.id) || liveVideos[0]) : liveVideos[0]);
      } else {
        setProjects([]);
        setSelectedProject(null);
      }
      if (storage) {
        setStorageInfo(storage);
      }
    } catch (err) {
      console.warn('Could not fetch live videos:', err);
      setProjects([]);
      setSelectedProject(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCleanStorage = async () => {
    setIsCleaningStorage(true);
    try {
      const res = await api.cleanupStorage();
      const updated = await api.getStorageSummary();
      setStorageInfo(updated);
      await fetchLiveVideos();
      if (res && res.message) {
        alert(res.message);
      }
    } catch (err: any) {
      console.error('Storage cleanup error:', err);
      alert(`Cleanup failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsCleaningStorage(false);
    }
  };

  useEffect(() => {
    fetchLiveVideos();
  }, []);

  // Fetch candidate clips for selected project
  useEffect(() => {
    if (!selectedProject) {
      setProjectClips([]);
      return;
    }
    let isMounted = true;
    setIsLoadingClips(true);
    api.getClips(selectedProject.id)
      .then((res) => {
        if (isMounted) {
          if (res && res.clips) {
            setProjectClips(res.clips);
          } else {
            setProjectClips([]);
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setProjectClips([]);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingClips(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedProject?.id]);

  const handleRenderClip = async (clipId: string) => {
    setRenderingClipId(clipId);
    try {
      const updated = await api.renderClip(clipId);
      setProjectClips((prev) => prev.map((c) => (c.id === clipId ? updated : c)));
      if (previewClip?.id === clipId) {
        setPreviewClip(updated);
      }
    } catch (err: any) {
      alert(`Render error: ${err.message}`);
    } finally {
      setRenderingClipId(null);
    }
  };

  const handleDeleteClip = async (clipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to permanently delete this clip from the server?')) {
      return;
    }
    setDeletingClipId(clipId);
    try {
      await api.deleteClip(clipId);
      setProjectClips((prev) => prev.filter((c) => c.id !== clipId));
      if (previewClip?.id === clipId) {
        setPreviewClip(null);
      }
      if (selectedProject) {
        const newCount = Math.max(0, (selectedProject.clips_count || 1) - 1);
        setSelectedProject({ ...selectedProject, clips_count: newCount });
        setProjects((prev) =>
          prev.map((p) => (p.id === selectedProject.id ? { ...p, clips_count: newCount } : p))
        );
      }
      const storage = await api.getStorageSummary().catch(() => null);
      if (storage) setStorageInfo(storage);
    } catch (err: any) {
      alert(`Clip deletion error: ${err.message}`);
    } finally {
      setDeletingClipId(null);
    }
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to remove this video and its generated assets from the server?')) {
      return;
    }
    setDeletingId(id);
    try {
      await api.deleteVideo(id);
      const updated = projects.filter((p) => p.id !== id);
      setProjects(updated);
      if (selectedProject?.id === id) {
        if (updated.length > 0) {
          setSelectedProject(updated[0]);
        } else {
          setSelectedProject(null);
          setProjectClips([]);
          setPreviewClip(null);
        }
      }
      const storage = await api.getStorageSummary().catch(() => null);
      if (storage) setStorageInfo(storage);
    } catch (err: any) {
      alert(`Deletion error: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  // Filter projects
  const filteredProjects = projects.filter((p) => {
    const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase());
    if (filterTab === 'completed') return matchesSearch && (p.status === 'completed' || p.status === 'ready');
    if (filterTab === 'processing') return matchesSearch && p.status !== 'completed' && p.status !== 'ready';
    return matchesSearch;
  });

  return (
    <div className="flex-1 pb-20">
      <DashboardHeader
        title="My Projects & Clips"
        subtitle="Manage uploaded long-form assets and browse generated shorts by project."
        action={
          <div className="flex items-center gap-2">
            {storageInfo && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900 border border-white/10 text-xs">
                <HardDrive className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-white/70">
                  Storage: <strong className="text-white font-mono">{storageInfo.total_storage_mb} MB</strong>
                </span>
                <button
                  onClick={handleCleanStorage}
                  disabled={isCleaningStorage}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-purple-300 font-semibold transition-colors disabled:opacity-50"
                  title="Clean temporary audio & cache files"
                >
                  {isCleaningStorage ? 'Cleaning...' : 'Clean Cache'}
                </button>
              </div>
            )}
            <Button
              onClick={fetchLiveVideos}
              variant="outline"
              size="sm"
              className="rounded-xl px-2.5 py-1 text-xs"
              title="Refresh list from backend"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Link href="/dashboard/create">
              <Button size="sm" variant="primary" className="rounded-xl text-xs">
                <Plus className="w-3.5 h-3.5 mr-1" /> New Project
              </Button>
            </Link>
          </div>
        }
      />

      <div className="px-6 sm:px-8 pt-8 max-w-7xl mx-auto space-y-6">
        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Tabs */}
          <div className="flex p-1 rounded-xl bg-[#111116] border border-white/[0.06] w-fit">
            {[
              { id: 'all', label: 'All Projects', count: projects.length },
              { id: 'completed', label: 'Completed / Ready', count: projects.filter(v => v.status === 'completed' || v.status === 'ready').length },
              { id: 'processing', label: 'In Pipeline', count: projects.filter(v => v.status !== 'completed' && v.status !== 'ready').length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id as any)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  filterTab === tab.id
                    ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <span>{tab.label}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-400">
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#111116] border border-white/[0.08] rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {/* Master-Detail Projects View or Clean Empty State */}
        {projects.length === 0 ? (
          <div className="py-20 px-6 text-center rounded-3xl bg-[#111116] border border-white/[0.08] space-y-4 max-w-2xl mx-auto shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600/20 to-pink-600/20 border border-purple-500/30 flex items-center justify-center mx-auto text-purple-400">
              <Film className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white">No Projects in Workspace</h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                All source videos and clips have been cleaned. Import a YouTube link or upload an MP4/WebM to extract high-virality 9:16 shorts.
              </p>
            </div>
            <div className="pt-2">
              <Link href="/dashboard/create">
                <Button size="lg" variant="primary" className="rounded-2xl text-xs font-bold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 shadow-xl shadow-purple-900/30">
                  <Sparkles className="w-4 h-4 mr-2 text-amber-300" />
                  + Create New Viral Clips
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Projects List (5 cols) */}
            <div className="lg:col-span-5 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 block px-1">
                Source Projects ({filteredProjects.length})
              </span>

              {filteredProjects.length === 0 ? (
                <div className="p-8 rounded-2xl bg-[#111116] border border-white/[0.06] text-center text-xs text-zinc-400">
                  No projects match your search query.
                </div>
              ) : (
                filteredProjects.map((proj) => {
                  const isSelected = selectedProject?.id === proj.id;
                  const thumbUrl = proj.thumbnail_url 
                    ? api.getServerUrl(proj.thumbnail_url) 
                    : proj.thumbnail || '';

                  return (
                    <div
                      key={proj.id}
                      onClick={() => setSelectedProject(proj)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-purple-500/60 bg-purple-950/20 shadow-lg shadow-purple-950/20'
                          : 'border-white/[0.06] bg-[#111116] hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex gap-3 items-start">
                        <div className="w-14 h-10 rounded-lg overflow-hidden bg-zinc-800 shrink-0 relative">
                          {thumbUrl ? (
                            <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-600">
                              <Film className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-white line-clamp-1">{proj.title}</h4>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-400">
                            <span className="font-mono">{formatDuration(proj.duration)}</span>
                            <span>•</span>
                            <span className="text-purple-400 font-semibold">{proj.clips_count} clips</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge
                            variant={
                              proj.status === 'completed' || proj.status === 'ready'
                                ? 'success'
                                : proj.status === 'transcribing'
                                ? 'purple'
                                : 'warning'
                            }
                            className="text-[10px]"
                          >
                            {proj.status}
                          </Badge>

                          <button
                            onClick={(e) => handleDeleteProject(proj.id, e)}
                            disabled={deletingId === proj.id}
                            className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                            title="Delete project"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {proj.status === 'transcribing' && (
                        <div className="mt-3 pt-2 border-t border-white/[0.06] space-y-1">
                          <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
                            <span>Faster-Whisper Processing</span>
                            <span>{proj.progress_percentage}%</span>
                          </div>
                          <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
                            <div
                              className="bg-purple-500 h-full rounded-full animate-pulse"
                              style={{ width: `${proj.progress_percentage}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

          {/* Project Details & Generated Clips Gallery (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            {/* Selected Project Card */}
            {selectedProject && (
              <Card className="border-white/[0.08] bg-[#111116] p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="purple" className="text-[10px] uppercase">
                        {selectedProject.source_type}
                      </Badge>
                      <span className="text-xs text-zinc-500 font-mono">
                        {formatFileSize(selectedProject.file_size_mb)}
                      </span>
                      {selectedProject.metadata?.aspect_ratio && (
                        <Badge variant="default" className="text-[10px]">
                          {selectedProject.metadata.aspect_ratio}
                        </Badge>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-white">{selectedProject.title}</h3>
                    <p className="text-xs text-zinc-400 mt-1">{selectedProject.current_step}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      onClick={handleInstantGenerateShorts}
                      disabled={isTriggeringPipeline}
                      isLoading={isTriggeringPipeline}
                      size="sm"
                      variant="primary"
                      className="rounded-xl text-xs bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 font-bold shadow-lg shadow-purple-900/30"
                    >
                      <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-300" />
                      ⚡ Generate 9:16 Shorts
                    </Button>

                    <Link href={`/dashboard/create?video_id=${selectedProject?.id || ''}`}>
                      <Button size="sm" variant="outline" className="rounded-xl text-xs border-white/20 text-zinc-300 hover:text-white">
                        <Scissors className="w-3.5 h-3.5 mr-1" /> Configure & Clip
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* HTML Video Player if real video URL exists */}
                {selectedProject.video_url && (
                  <div className="relative rounded-2xl overflow-hidden aspect-video bg-black border border-white/[0.08] shadow-inner mt-2">
                    <video
                      src={api.getServerUrl(selectedProject.video_url)}
                      controls
                      playsInline
                      poster={selectedProject.thumbnail_url ? api.getServerUrl(selectedProject.thumbnail_url) : undefined}
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
              </Card>
            )}

            {/* Generated Shorts for Selected Project */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-amber-400" />
                  Generated 9:16 Shorts Gallery ({projectClips.length})
                </span>
                <span className="text-xs text-purple-400">Ready for YouTube & TikTok</span>
              </div>

              {isLoadingClips ? (
                <div className="p-12 rounded-2xl bg-[#111116] border border-white/[0.06] text-center text-xs text-zinc-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-400 mb-2" />
                  Loading candidate clips...
                </div>
              ) : projectClips.length === 0 ? (
                <div className="p-12 rounded-2xl bg-[#111116] border border-white/[0.06] text-center space-y-3">
                  <Scissors className="w-8 h-8 text-zinc-600 mx-auto" />
                  <p className="text-sm font-semibold text-white">No clips generated for this video yet</p>
                  <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                    Run the AI Moment Detection engine to identify high-engagement segments and cut them into vertical shorts.
                  </p>
                  <div className="flex justify-center items-center gap-3 pt-2">
                    <Button
                      onClick={handleInstantGenerateShorts}
                      disabled={isTriggeringPipeline}
                      isLoading={isTriggeringPipeline}
                      size="sm"
                      variant="primary"
                      className="rounded-xl text-xs bg-gradient-to-r from-purple-600 to-pink-600 font-bold"
                    >
                      <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-300" />
                      ⚡ Generate Shorts Now
                    </Button>
                    <Link href={`/dashboard/create?video_id=${selectedProject?.id || ''}`}>
                      <Button size="sm" variant="outline" className="rounded-xl text-xs border-white/20 text-zinc-300 hover:text-white">
                        <Scissors className="w-3.5 h-3.5 mr-1" /> Open in Studio
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {projectClips.map((clip) => {
                    const thumb = clip.thumbnail_url
                      ? clip.thumbnail_url.startsWith('http')
                        ? clip.thumbnail_url
                        : api.getServerUrl(clip.thumbnail_url)
                      : null;
                    const hookText = clip.hook || clip.hook_sentence || '';

                    return (
                      <div
                        key={clip.id}
                        className="p-4 rounded-2xl bg-[#111116] border border-white/[0.06] hover:border-purple-500/40 transition-all flex flex-col justify-between group shadow-lg"
                      >
                        <div className="relative rounded-xl overflow-hidden aspect-[9/16] max-h-56 w-full bg-zinc-950 mb-3">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt=""
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-600">
                              <Film className="w-8 h-8" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/60" />

                          <div className="absolute top-2 left-2 right-2 flex justify-between items-center z-10">
                            <span className="text-[9px] bg-black/70 px-1.5 py-0.5 rounded font-mono text-zinc-300">
                              9:16 Vertical
                            </span>
                            <span className="text-[10px] bg-purple-600 px-2 py-0.5 rounded font-extrabold text-white flex items-center gap-0.5 shadow">
                              <Flame className="w-2.5 h-2.5 fill-current text-amber-300" />
                              {Math.round(clip.virality_score)}%
                            </span>
                          </div>

                          <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 z-10 text-center">
                            <span className="inline-block bg-black/85 px-2 py-1 rounded text-[10px] font-black uppercase text-[#FFDD00] shadow-xl border border-white/10">
                              {clip.title.slice(0, 24)}...
                            </span>
                          </div>

                          <div className="absolute bottom-2 left-2 z-10 text-[9px] font-mono text-zinc-300 bg-black/60 px-1.5 py-0.5 rounded">
                            {Math.round(clip.duration)}s
                          </div>
                        </div>

                        <div className="space-y-2 flex-1 flex flex-col justify-between">
                          <div>
                            <h4 className="text-xs font-bold text-white line-clamp-1">{clip.title}</h4>
                            {hookText && (
                              <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2 italic">
                                &quot;{hookText}&quot;
                              </p>
                            )}
                          </div>

                          <div className="pt-2 border-t border-white/[0.06] flex items-center gap-2">
                            <Button
                              onClick={() => setPreviewClip(clip)}
                              size="sm"
                              variant="secondary"
                              className="flex-1 rounded-xl text-xs py-1.5"
                            >
                              <Play className="w-3 h-3 mr-1" /> Preview
                            </Button>

                            {clip.video_url ? (
                              <a
                                href={api.getServerUrl(clip.video_url)}
                                download={`${clip.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_9x16.mp4`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all"
                                title="Download 9:16 Video"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            ) : (
                              <Button
                                onClick={() => handleRenderClip(clip.id)}
                                isLoading={renderingClipId === clip.id}
                                size="sm"
                                variant="outline"
                                className="rounded-xl px-2.5 py-1.5 text-xs text-purple-300 border-purple-500/30 hover:bg-purple-950/40"
                                title="Cut 9:16 with FFmpeg"
                              >
                                <Scissors className="w-3.5 h-3.5" />
                              </Button>
                            )}

                            <button
                              onClick={(e) => handleDeleteClip(clip.id, e)}
                              disabled={deletingClipId === clip.id}
                              className="p-2 rounded-xl border border-white/10 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                              title="Delete clip"
                            >
                              {deletingClipId === clip.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Clip Preview Modal */}
      {previewClip && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-[#111116] border border-white/[0.1] p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="space-y-1 pr-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white line-clamp-1">{previewClip.title}</span>
                  {previewClip.ranking_badge && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-950 text-purple-300 border border-purple-800/40">
                      {previewClip.ranking_badge}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-zinc-400 font-mono block">
                  {Math.round(previewClip.duration)}s • 9:16 Vertical Short
                </span>
              </div>

              <div className="flex items-center gap-3">
                <CircularScore score={previewClip.overall_score ?? previewClip.virality_score} size="sm" showLabel={false} />
                <button
                  onClick={() => setPreviewClip(null)}
                  className="text-zinc-400 hover:text-white text-sm p-1"
                >
                  ✕
                </button>
              </div>
            </div>

            {previewClip.video_url ? (
              <div className="relative rounded-2xl overflow-hidden aspect-[9/16] max-h-80 mx-auto bg-black border border-white/[0.08]">
                <video
                  src={api.getServerUrl(previewClip.video_url)}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="relative rounded-2xl overflow-hidden aspect-[9/16] max-h-72 mx-auto bg-zinc-950 border border-white/[0.08]">
                {previewClip.thumbnail_url ? (
                  <img
                    src={
                      previewClip.thumbnail_url.startsWith('http')
                        ? previewClip.thumbnail_url
                        : api.getServerUrl(previewClip.thumbnail_url)
                    }
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600">
                    <Film className="w-12 h-12" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40 flex flex-col justify-between p-4 text-center">
                  <span className="text-[10px] bg-purple-600 text-white font-bold px-2 py-0.5 rounded self-end">
                    {Math.round(previewClip.overall_score ?? previewClip.virality_score)} Quality Score
                  </span>
                  <span className="inline-block bg-black/90 px-3 py-1.5 rounded-lg text-xs font-black uppercase text-[#FFDD00] shadow-xl border border-white/10 mx-auto">
                    &quot;{previewClip.hook || previewClip.hook_sentence || previewClip.title}&quot;
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    {Math.round(previewClip.duration)}s • 9:16 Vertical
                  </span>
                </div>
              </div>
            )}

            {/* Score Reasons & Evidence in Modal */}
            {previewClip.score_reasons && previewClip.score_reasons.length > 0 && (
              <div className="p-3 rounded-xl bg-zinc-950/80 border border-white/[0.06] text-xs space-y-1">
                <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
                  Quality Scoring Evidence:
                </span>
                <ul className="text-[11px] text-zinc-400 space-y-0.5">
                  {previewClip.score_reasons.slice(0, 3).map((r: string, idx: number) => (
                    <li key={idx} className="line-clamp-1">• {r}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-between items-center pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => handleDeleteClip(previewClip.id, e)}
                disabled={deletingClipId === previewClip.id}
                className="rounded-xl text-xs text-rose-400 border-rose-900/40 hover:bg-rose-950/40"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete Clip
              </Button>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setPreviewClip(null)} className="rounded-xl">
                  Close
                </Button>
              {previewClip.video_url ? (
                <a
                  href={api.getServerUrl(previewClip.video_url)}
                  download={`${previewClip.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_9x16.mp4`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all"
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" /> Download MP4
                </a>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  className="rounded-xl"
                  isLoading={renderingClipId === previewClip.id}
                  onClick={() => handleRenderClip(previewClip.id)}
                >
                  <Scissors className="w-3.5 h-3.5 mr-1" /> Cut 9:16 Short
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Real-time Pipeline Progress Modal from Projects Page */}
      {activePipelineJobId && (
        <PipelineProgressModal
          jobId={activePipelineJobId}
          onClose={() => {
            setActivePipelineJobId(null);
            if (selectedProject) {
              api.getClips(selectedProject.id).then((r) => setProjectClips(r.clips || [])).catch(() => {});
              fetchLiveVideos();
            }
          }}
          onComplete={(newClips) => {
            if (newClips && newClips.length > 0) {
              setProjectClips(newClips);
            }
            fetchLiveVideos();
          }}
        />
      )}
    </div>
  );
}
