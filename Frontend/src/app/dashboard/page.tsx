'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Video, 
  Scissors, 
  Flame, 
  Clock, 
  Sparkles, 
  Plus, 
  ArrowUpRight, 
  Play, 
  Download, 
  CheckCircle2, 
  Loader2, 
  TrendingUp, 
  Layers, 
  HardDrive,
  Eye,
  Filter,
  Share2,
  Trash2,
  AlertCircle,
  Film
} from 'lucide-react';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatDuration, formatFileSize } from '@/lib/utils';
import { VideoItem, ClipItem } from '@/types';
import { api } from '@/lib/api';

export default function DashboardPage() {
  const [activeClipModal, setActiveClipModal] = useState<any | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
  const [deletingClipId, setDeletingClipId] = useState<string | null>(null);

  const loadRealData = async () => {
    setIsLoading(true);
    try {
      const [liveVideos, liveClips] = await Promise.all([
        api.getVideos().catch(() => []),
        api.getAllClips().catch(() => [])
      ]);
      const validVideos = liveVideos || [];
      const validVideoIds = new Set(validVideos.map((v) => v.id));
      // Strictly filter out any orphan clips whose parent video does not exist
      const validClips = (liveClips || []).filter((c) => validVideoIds.has(c.video_id));
      setVideos(validVideos);
      setClips(validClips);
    } catch (e) {
      console.error('Error loading dashboard data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRealData();
    const handleUpdate = () => loadRealData();
    window.addEventListener('projects-updated', handleUpdate);
    return () => window.removeEventListener('projects-updated', handleUpdate);
  }, []);

  const handleDeleteVideo = async (videoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to permanently delete this project and all its clips?')) return;
    setDeletingVideoId(videoId);
    try {
      await api.deleteVideo(videoId);
      const updatedVideos = videos.filter(v => v.id !== videoId);
      setVideos(updatedVideos);
      const updatedClips = updatedVideos.length === 0 ? [] : clips.filter(c => c.video_id !== videoId);
      setClips(updatedClips);
      window.dispatchEvent(new Event('projects-updated'));
    } catch (err: any) {
      alert(`Deletion error: ${err.message}`);
    } finally {
      setDeletingVideoId(null);
    }
  };

  const handleDeleteClip = async (clipId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('Are you sure you want to permanently delete this clip?')) return;
    setDeletingClipId(clipId);
    try {
      await api.deleteClip(clipId);
      setClips(prev => prev.filter(c => c.id !== clipId));
      if (activeClipModal?.id === clipId) {
        setActiveClipModal(null);
      }
      window.dispatchEvent(new Event('projects-updated'));
    } catch (err: any) {
      alert(`Clip deletion error: ${err.message}`);
    } finally {
      setDeletingClipId(null);
    }
  };

  // Compute live statistics from real database records (0 if no videos)
  const totalVideos = videos.length;
  const displayedClips = totalVideos === 0 ? [] : clips;
  const totalClips = displayedClips.length;
  const avgVirality = displayedClips.length > 0
    ? (displayedClips.reduce((acc, c) => acc + (c.virality_score || c.overall_score || 0), 0) / displayedClips.length).toFixed(1)
    : '0.0';
  const totalSeconds = videos.reduce((acc, v) => acc + (v.duration || 0), 0);
  const hoursFootage = (totalSeconds / 3600).toFixed(1);
  const hoursSaved = (totalSeconds / 1800).toFixed(1);

  return (
    <div className="flex-1 pb-16">
      {/* Top Header */}
      <DashboardHeader
        title="Studio Overview"
        subtitle="Real-time dashboard for video ingestion, AI transcription, and generated viral shorts."
        action={
          <Link href="/dashboard/create">
            <Button size="sm" variant="primary" className="rounded-xl text-xs">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Import Video
            </Button>
          </Link>
        }
      />

      <div className="px-6 sm:px-8 pt-8 space-y-8 max-w-7xl mx-auto">
        {/* 1. OVERVIEW STATISTICS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-5 border-white/[0.06] bg-[#111116] hover:border-purple-500/30 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Total Videos Processed</span>
              <div className="w-8 h-8 rounded-lg bg-purple-950/50 border border-purple-800/40 text-purple-400 flex items-center justify-center">
                <Video className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-white">{totalVideos}</span>
              <span className="text-xs text-emerald-400 font-medium flex items-center gap-0.5">
                <TrendingUp className="w-3 h-3" /> Live
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">{hoursFootage} hrs total source footage</p>
          </Card>

          <Card className="p-5 border-white/[0.06] bg-[#111116] hover:border-pink-500/30 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Viral Shorts Generated</span>
              <div className="w-8 h-8 rounded-lg bg-pink-950/50 border border-pink-800/40 text-pink-400 flex items-center justify-center">
                <Scissors className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-white">{totalClips}</span>
              <span className="text-xs text-purple-400 font-medium">9:16 Vertical</span>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Ready for Reels, Shorts, TikTok</p>
          </Card>

          <Card className="p-5 border-white/[0.06] bg-[#111116] hover:border-amber-500/30 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Avg. Virality Score</span>
              <div className="w-8 h-8 rounded-lg bg-amber-950/50 border border-amber-800/40 text-amber-400 flex items-center justify-center">
                <Flame className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-white">{avgVirality}%</span>
              <span className="text-xs text-emerald-400 font-medium font-mono">
                {parseFloat(avgVirality) > 70 ? 'High Impact' : 'Optimal'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Faster-Whisper & PySceneDetect scored</p>
          </Card>

          <Card className="p-5 border-white/[0.06] bg-[#111116] hover:border-blue-500/30 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Editing Hours Saved</span>
              <div className="w-8 h-8 rounded-lg bg-blue-950/50 border border-blue-800/40 text-blue-400 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-white">{hoursSaved} hrs</span>
              <span className="text-xs text-blue-400 font-medium">Auto-Cut</span>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Saved vs. manual video editing</p>
          </Card>
        </div>

        {/* 2. GENERATED CLIPS SHOWCASE SECTION */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400" />
                AI-Selected Viral Shorts ({displayedClips.length})
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Real clips scored for retention, reframed with OpenCV face-tracking, and captioned.
              </p>
            </div>

            <Link href="/dashboard/projects" className="text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1">
              View All Projects <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {isLoading ? (
            <div className="p-12 rounded-2xl bg-[#111116] border border-white/[0.06] text-center text-xs text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-400 mb-2" />
              Loading real clips from database...
            </div>
          ) : displayedClips.length === 0 ? (
            <div className="p-10 rounded-2xl bg-[#111116] border border-white/[0.06] text-center space-y-3">
              <Scissors className="w-8 h-8 text-zinc-600 mx-auto" />
              <p className="text-sm font-semibold text-white">No generated clips yet</p>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                Upload or import a YouTube or direct cloud video in Create Clips to automatically generate high-retention 9:16 vertical shorts.
              </p>
              <Link href="/dashboard/create">
                <Button size="sm" variant="primary" className="rounded-xl text-xs mt-2">
                  <Sparkles className="w-3.5 h-3.5 mr-1" /> Create Your First Short
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {displayedClips.slice(0, 6).map((clip) => {
                const thumb = clip.thumbnail_url
                  ? clip.thumbnail_url.startsWith('http')
                    ? clip.thumbnail_url
                    : api.getServerUrl(clip.thumbnail_url)
                  : null;
                const score = Math.round(clip.virality_score || clip.overall_score || 0);

                return (
                  <div
                    key={clip.id}
                    className="group rounded-2xl bg-[#111116] border border-white/[0.06] hover:border-purple-500/40 p-4 transition-all flex flex-col justify-between shadow-xl"
                  >
                    {/* Clip Video Thumbnail & Overlay */}
                    <div className="relative rounded-xl overflow-hidden aspect-[9/16] max-h-72 w-full bg-zinc-900 border border-white/[0.06] mb-4">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={clip.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600">
                          <Film className="w-8 h-8" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/60" />

                      {/* Top Tags */}
                      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-10">
                        <span className="px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-[10px] font-mono text-zinc-300">
                          9:16 Vertical
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-purple-600 text-white text-[11px] font-extrabold flex items-center gap-1 shadow-lg shadow-purple-950/60">
                          <Flame className="w-3 h-3 fill-current text-amber-300" />
                          {score}%
                        </span>
                      </div>

                      {/* Play Button Overlay */}
                      <button 
                        onClick={() => setActiveClipModal(clip)}
                        className="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 cursor-pointer"
                      >
                        <div className="w-12 h-12 rounded-full bg-purple-600/90 text-white flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                          <Play className="w-5 h-5 fill-current ml-0.5" />
                        </div>
                      </button>

                      {/* Bottom Duration Tag */}
                      <div className="absolute bottom-2.5 left-2.5 z-10 text-[10px] text-zinc-300 font-mono bg-black/60 px-2 py-0.5 rounded">
                        {Math.round(clip.duration)}s
                      </div>
                    </div>

                    {/* Clip Meta */}
                    <div className="space-y-2 flex-1 flex flex-col justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-white line-clamp-1 group-hover:text-purple-300 transition-colors">
                          {clip.title}
                        </h3>
                        <p className="text-xs text-zinc-400 mt-1 line-clamp-2 italic">
                          &quot;{clip.hook || clip.hook_sentence || clip.short_description || 'Viral moment extracted by AI'}&quot;
                        </p>
                      </div>

                      <div className="pt-3 border-t border-white/[0.06] flex items-center gap-2">
                        <Button
                          onClick={() => setActiveClipModal(clip)}
                          size="sm"
                          variant="secondary"
                          className="flex-1 rounded-xl text-xs"
                        >
                          <Play className="w-3 h-3 mr-1" /> Preview
                        </Button>
                        {clip.download_url && (
                          <a
                            href={api.getServerUrl(clip.download_url)}
                            download
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                            title="Download MP4"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          onClick={(e) => handleDeleteClip(clip.id, e)}
                          disabled={deletingClipId === clip.id}
                          className="p-2 rounded-xl bg-zinc-800 hover:bg-rose-950/60 text-zinc-400 hover:text-rose-400 border border-transparent hover:border-rose-900/40 transition-colors"
                          title="Delete Clip"
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

        {/* 3. RECENT PROJECTS SECTION */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Video className="w-4 h-4 text-purple-400" />
              Source Video Projects ({videos.length})
            </h2>

            <Link href="/dashboard/projects" className="text-xs font-semibold text-zinc-400 hover:text-white">
              View All Projects →
            </Link>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-[#111116] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/[0.02] border-b border-white/[0.06] text-zinc-400 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-5 py-3.5">Video Title</th>
                    <th className="px-5 py-3.5">Duration</th>
                    <th className="px-5 py-3.5">Size</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {videos.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-zinc-500">
                        No videos uploaded yet. Click &quot;Import Video&quot; above to get started.
                      </td>
                    </tr>
                  ) : (
                    videos.slice(0, 5).map((vid) => {
                      const thumb = vid.thumbnail_url
                        ? api.getServerUrl(vid.thumbnail_url)
                        : null;

                      return (
                        <tr key={vid.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-7 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                                {thumb ? (
                                  <img src={thumb} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-zinc-600">
                                    <Video className="w-3.5 h-3.5" />
                                  </div>
                                )}
                              </div>
                              <div>
                                <p className="font-semibold text-white line-clamp-1">{vid.title}</p>
                                <p className="text-[11px] text-zinc-500 font-mono mt-0.5">{vid.id}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 font-mono text-zinc-300">
                            {formatDuration(vid.duration || 0)}
                          </td>
                          <td className="px-5 py-4 font-mono text-zinc-300">
                            {formatFileSize(vid.file_size_mb || 0)}
                          </td>
                          <td className="px-5 py-4">
                            <Badge
                              variant={vid.status === 'ready' || vid.status === 'completed' ? 'success' : 'purple'}
                              className="capitalize text-[10px]"
                            >
                              {vid.status}
                            </Badge>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Link href="/dashboard/create">
                                <Button size="sm" variant="ghost" className="text-xs hover:text-purple-300">
                                  Clip Video →
                                </Button>
                              </Link>
                              <button
                                onClick={(e) => handleDeleteVideo(vid.id, e)}
                                disabled={deletingVideoId === vid.id}
                                className="p-1.5 rounded-lg border border-white/10 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                                title="Delete project and all its clips"
                              >
                                {deletingVideoId === vid.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Video Clip Modal Preview */}
      {activeClipModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#111116] border border-white/[0.1] rounded-2xl max-w-md w-full overflow-hidden shadow-2xl space-y-4 p-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div>
                <h3 className="text-sm font-bold text-white line-clamp-1">{activeClipModal.title}</h3>
                <span className="text-[11px] text-purple-400 font-mono">
                  Virality: {Math.round(activeClipModal.virality_score || activeClipModal.overall_score || 0)}%
                </span>
              </div>
              <button
                onClick={() => setActiveClipModal(null)}
                className="text-zinc-400 hover:text-white p-1 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="relative rounded-xl overflow-hidden aspect-[9/16] max-h-96 w-full bg-black mx-auto">
              {activeClipModal.download_url ? (
                <video
                  src={api.getServerUrl(activeClipModal.download_url)}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              ) : activeClipModal.thumbnail_url ? (
                <img
                  src={api.getServerUrl(activeClipModal.thumbnail_url)}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-500">
                  Video Preview
                </div>
              )}
            </div>

            {activeClipModal.hook && (
              <p className="text-xs text-zinc-300 italic">
                &quot;{activeClipModal.hook}&quot;
              </p>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDeleteClip(activeClipModal.id)}
                disabled={deletingClipId === activeClipModal.id}
                className="rounded-xl text-xs text-rose-400 border-rose-900/40 hover:bg-rose-950/40"
              >
                {deletingClipId === activeClipModal.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                )}
                Delete
              </Button>
              {activeClipModal.download_url && (
                <a
                  href={api.getServerUrl(activeClipModal.download_url)}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1"
                >
                  <Button variant="primary" size="sm" className="w-full rounded-xl text-xs">
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Download Video
                  </Button>
                </a>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setActiveClipModal(null)}
                className="rounded-xl text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
