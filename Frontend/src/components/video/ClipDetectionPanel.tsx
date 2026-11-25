'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Flame, 
  Sparkles, 
  Sliders, 
  Clock, 
  Scissors, 
  Play, 
  Check, 
  Copy, 
  Info, 
  ChevronDown, 
  ChevronUp, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Layers, 
  TrendingUp,
  Download,
  Share2,
  FileText,
  Trophy,
  GraduationCap,
  PartyPopper,
  Award,
  Lightbulb,
  ArrowDownUp,
  Filter,
  CheckCircle,
  HelpCircle,
  Star,
  Crop,
  Edit3,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { CircularScore } from '@/components/ui/CircularScore';
import { BatchClippingManager } from './BatchClippingManager';
import { SubtitleEditor } from './SubtitleEditor';
import { ReframingStudio } from './ReframingStudio';
import { api } from '@/lib/api';
import { CandidateClip, ClipDetectionTaskResponse } from '@/types';
import { formatDuration } from '@/lib/utils';

interface ClipDetectionPanelProps {
  videoId: string;
  videoTitle?: string;
  onClipsDetected?: (clips: CandidateClip[]) => void;
  onPreviewClip?: (clip: CandidateClip) => void;
}

export const ClipDetectionPanel: React.FC<ClipDetectionPanelProps> = ({
  videoId,
  videoTitle,
  onClipsDetected,
  onPreviewClip,
}) => {
  // Configurable duration range
  const [durationRange, setDurationRange] = useState<string>('30-60');
  const [maxClips, setMaxClips] = useState<number>(6);
  const [viralityThreshold, setViralityThreshold] = useState<number>(55);

  // Sorting & Filtering
  const [sortBy, setSortBy] = useState<'score_desc' | 'score_asc' | 'duration_asc' | 'duration_desc'>('score_desc');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Async detection task states
  const [taskId, setTaskId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [taskProgress, setTaskProgress] = useState<number>(0);
  const [taskStep, setTaskStep] = useState<string>('');
  const [clips, setClips] = useState<CandidateClip[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedClipId, setCopiedClipId] = useState<string | null>(null);
  const [expandedClipId, setExpandedClipId] = useState<string | null>(null);
  const [renderingClipId, setRenderingClipId] = useState<string | null>(null);
  const [subtitleModalClip, setSubtitleModalClip] = useState<CandidateClip | null>(null);
  const [reframeModalClip, setReframeModalClip] = useState<CandidateClip | null>(null);
  const [previewingClip, setPreviewingClip] = useState<CandidateClip | null>(null);

  // Edit Timestamps Modal state
  const [editingClip, setEditingClip] = useState<CandidateClip | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editStartTime, setEditStartTime] = useState(0);
  const [editEndTime, setEditEndTime] = useState(0);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const handleOpenEdit = (clip: CandidateClip) => {
    setEditingClip(clip);
    setEditTitle(clip.title);
    setEditStartTime(clip.start_time);
    setEditEndTime(clip.end_time);
  };

  const handleSaveClipEdit = async () => {
    if (!editingClip) return;
    if (editEndTime <= editStartTime) {
      alert('End time must be greater than start time');
      return;
    }
    setIsSavingEdit(true);
    try {
      const updated = await api.updateClip(editingClip.id, {
        title: editTitle,
        start_time: editStartTime,
        end_time: editEndTime
      });
      setClips((prev) => prev.map((c) => c.id === editingClip.id ? updated : c));
      if (onClipsDetected) {
        onClipsDetected(clips.map((c) => c.id === editingClip.id ? updated : c));
      }
      setEditingClip(null);
    } catch (err: any) {
      alert(`Failed to update clip: ${err.message}`);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Fetch already detected clips on initial load
  useEffect(() => {
    let isMounted = true;
    if (videoId) {
      api.getClips(videoId)
        .then((res) => {
          if (isMounted && res && res.clips && res.clips.length > 0) {
            setClips(res.clips);
            if (onClipsDetected) onClipsDetected(res.clips);
          }
        })
        .catch(() => {
          // No clips stored yet
        });
    }
    return () => {
      isMounted = false;
    };
  }, [videoId]);

  // Polling effect for asynchronous background task
  useEffect(() => {
    if (!taskId || !isProcessing) return;

    const interval = setInterval(async () => {
      try {
        const taskData: ClipDetectionTaskResponse = await api.pollClipDetectionTask(taskId);
        setTaskProgress(taskData.progress);
        if (taskData.current_step) setTaskStep(taskData.current_step);

        if (taskData.status === 'completed') {
          setIsProcessing(false);
          setClips(taskData.clips || []);
          if (onClipsDetected) onClipsDetected(taskData.clips || []);
          clearInterval(interval);
        } else if (taskData.status === 'failed') {
          setIsProcessing(false);
          setErrorMessage(taskData.error_message || 'Clip detection task failed.');
          clearInterval(interval);
        }
      } catch (err: any) {
        console.warn('Task polling error:', err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [taskId, isProcessing, onClipsDetected]);

  const handleStartDetection = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    setTaskProgress(5);
    setTaskStep('Queueing asynchronous clip detection pipeline...');

    try {
      const resp = await api.detectClips(
        videoId,
        durationRange,
        maxClips,
        viralityThreshold
      );
      setTaskId(resp.task_id);
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMessage(err.message || 'Failed to dispatch clip detection task.');
    }
  };

  const handleRenderClip = async (clip: CandidateClip) => {
    setRenderingClipId(clip.id);
    setErrorMessage(null);
    try {
      const updated = await api.renderClip(clip.id);
      setClips((prev) => prev.map((c) => (c.id === clip.id ? updated : c)));
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to render 9:16 vertical short.');
    } finally {
      setRenderingClipId(null);
    }
  };

  const handleCopyTranscript = (clip: CandidateClip) => {
    navigator.clipboard.writeText(clip.transcript || clip.hook || clip.title);
    setCopiedClipId(clip.id);
    setTimeout(() => setCopiedClipId(null), 2000);
  };

  // Filter and sort clips dynamically
  const sortedAndFilteredClips = useMemo(() => {
    return clips
      .filter((clip) => {
        if (categoryFilter === 'all') return true;
        if (categoryFilter === 'Best Overall') return clip.ranking_badge === 'Best Overall';
        if (categoryFilter === 'Best Hook') return clip.ranking_badge === 'Best Hook';
        if (categoryFilter === 'Most Educational') return clip.ranking_badge === 'Most Educational';
        if (categoryFilter === 'Most Entertaining') return clip.ranking_badge === 'Most Entertaining';
        return clip.category === categoryFilter;
      })
      .sort((a, b) => {
        const scoreA = a.overall_score ?? a.virality_score;
        const scoreB = b.overall_score ?? b.virality_score;
        if (sortBy === 'score_desc') return scoreB - scoreA;
        if (sortBy === 'score_asc') return scoreA - scoreB;
        if (sortBy === 'duration_desc') return b.duration - a.duration;
        if (sortBy === 'duration_asc') return a.duration - b.duration;
        return 0;
      });
  }, [clips, categoryFilter, sortBy]);

  // Ranking category pill renderer
  const renderRankingBadge = (badge?: string) => {
    if (!badge) return null;
    switch (badge) {
      case 'Best Overall':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-500/20 via-blue-500/20 to-pink-500/20 border border-amber-500/50 text-amber-300 shadow-md shadow-amber-950/40">
            <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            Best Overall
          </span>
        );
      case 'Best Hook':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-cyan-950/50 border border-cyan-500/40 text-cyan-300 shadow-md shadow-cyan-950/40">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            Best Hook
          </span>
        );
      case 'Most Educational':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 shadow-md shadow-emerald-950/40">
            <GraduationCap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            Most Educational
          </span>
        );
      case 'Most Entertaining':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-pink-950/50 border border-pink-500/40 text-pink-300 shadow-md shadow-pink-950/40">
            <PartyPopper className="w-3.5 h-3.5 text-pink-400 shrink-0" />
            Most Entertaining
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-blue-950/40 border border-blue-500/30 text-blue-300">
            <Award className="w-3 h-3 text-blue-400 shrink-0" />
            {badge}
          </span>
        );
    }
  };

  return (
    <Card className="border-white/[0.08] bg-[#0a0a0a] p-6 space-y-6 shadow-2xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 fill-amber-400" />
              Intelligent Clip Ranking & Scoring
            </span>
            <Badge variant="blue" className="text-[10px]">7-Point Quality Framework</Badge>
          </div>
          <h3 className="text-base font-bold text-white">
            AI Moments & Content Quality Assessment
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Evaluates hook strength (20), interesting content (20), emotional engagement (15), info value (15), story completeness (15), ending quality (10), and AV quality (5).
          </p>
        </div>

        {clips.length > 0 && !isProcessing && (
          <Button
            onClick={handleStartDetection}
            variant="outline"
            size="sm"
            className="rounded-xl text-xs py-1 px-3 self-start sm:self-auto"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Re-analyze Moments
          </Button>
        )}
      </div>

      {/* ERROR ALERT */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* DETECTION PARAMETERS BAR */}
      <div className="p-4 rounded-2xl bg-zinc-950/80 border border-white/[0.06] space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
          {/* 1. Target Duration Range */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
              <Clock className="w-3 h-3 text-blue-400" /> Duration Target
            </label>
            <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-zinc-900 border border-white/[0.06]">
              {[
                { id: '15-30', label: '15-30s' },
                { id: '30-45', label: '30-45s' },
                { id: '45-60', label: '45-60s' },
                { id: '60-90', label: '60-90s' },
                { id: 'auto', label: 'Auto' },
              ].map((d) => (
                <button
                  key={d.id}
                  type="button"
                  disabled={isProcessing}
                  onClick={() => setDurationRange(d.id)}
                  className={`py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                    durationRange === d.id
                      ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40 shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Maximum Candidates */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
              <Layers className="w-3 h-3 text-blue-400" /> Max Candidates
            </label>
            <select
              value={maxClips}
              disabled={isProcessing}
              onChange={(e) => setMaxClips(Number(e.target.value))}
              className="w-full bg-zinc-900 border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value={3}>Top 3 Clips</option>
              <option value={5}>Top 5 Clips (Recommended)</option>
              <option value={8}>Top 8 Clips</option>
              <option value={12}>Top 12 Clips</option>
            </select>
          </div>

          {/* 3. Virality Score Cutoff */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px]">
              <span className="font-semibold uppercase tracking-wider text-zinc-400">Score Threshold</span>
              <span className="font-mono text-blue-400 font-bold">{viralityThreshold}%+</span>
            </div>
            <input
              type="range"
              min="40"
              max="85"
              step="5"
              disabled={isProcessing}
              value={viralityThreshold}
              onChange={(e) => setViralityThreshold(Number(e.target.value))}
              className="w-full accent-blue-600 bg-zinc-800 h-1.5 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>

        {/* CTA Button when idle */}
        {!isProcessing && clips.length === 0 && (
          <div className="pt-2 flex justify-end">
            <Button
              onClick={handleStartDetection}
              variant="primary"
              size="md"
              className="rounded-xl px-6 text-xs shadow-lg shadow-blue-600/25"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Score & Rank Engaging Moments
            </Button>
          </div>
        )}
      </div>

      {/* STATE 1: ASYNCHRONOUS PROCESSING PROGRESS */}
      {isProcessing && (
        <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-950/30 via-indigo-950/20 to-zinc-900 border border-blue-500/30 text-center space-y-4">
          <div className="flex items-center justify-center gap-2.5 text-blue-300">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
            <span className="text-sm font-bold text-white">{taskStep || 'Evaluating dialogue structure & audio...'}</span>
          </div>

          <div className="max-w-md mx-auto space-y-1.5">
            <div className="flex justify-between text-xs font-mono text-zinc-400">
              <span>Analysis Pipeline</span>
              <span className="text-blue-400 font-bold">{taskProgress}%</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 via-indigo-500 to-amber-400 h-full rounded-full transition-all duration-300"
                style={{ width: `${taskProgress}%` }}
              />
            </div>
          </div>
          <p className="text-[11px] text-zinc-500">
            Calculating hook strength, information value, emotional resonance, pacing, and story completeness.
          </p>
        </div>
      )}

      {/* STATE 2: AUTOMATIC VIDEO CLIPPING ENGINE & RANKED CLIPS GALLERY */}
      {clips.length > 0 && !isProcessing && (
        <div className="space-y-6">
          {/* Complete Automatic Video Clipping Engine: Batch Cutting & Status Tracker */}
          <BatchClippingManager
            videoId={videoId}
            clips={clips}
            onClipsUpdated={(updated) => {
              setClips(updated);
              if (onClipsDetected) onClipsDetected(updated);
            }}
            onPreviewClip={onPreviewClip}
          />

          {/* Sorting and Category Filters Bar */}
          <div className="p-4 rounded-2xl bg-zinc-950/90 border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Category Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] uppercase font-bold text-zinc-500 mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3 text-blue-400" /> Filter:
              </span>
              {[
                { id: 'all', label: 'All Ranked' },
                { id: 'Best Overall', label: '🏆 Best Overall' },
                { id: 'Best Hook', label: '✨ Best Hook' },
                { id: 'Most Educational', label: '🎓 Educational' },
                { id: 'Most Entertaining', label: '🎉 Entertaining' },
              ].map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => setCategoryFilter(btn.id)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    categoryFilter === btn.id
                      ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40 shadow-sm'
                      : 'bg-zinc-900/60 text-zinc-400 hover:text-white border border-white/[0.04]'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Download All as ZIP & Sort by Dropdown */}
            <div className="flex flex-wrap items-center gap-2.5 self-end sm:self-auto">
              <a
                href={api.getClipsZipDownloadUrl(videoId)}
                download={`${(videoTitle || 'clips').replace(/[^a-zA-Z0-9_-]/g, '_')}_all_shorts.zip`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-semibold transition-all shadow-sm"
                title="Download all rendered shorts as a single ZIP archive"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download All (ZIP)</span>
              </a>

              <div className="flex items-center gap-1.5">
                <ArrowDownUp className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[11px] text-zinc-400 font-medium">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-zinc-900 border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="score_desc">Quality Score (High to Low)</option>
                  <option value="score_asc">Quality Score (Low to High)</option>
                  <option value="duration_desc">Duration (Longest First)</option>
                  <option value="duration_asc">Duration (Shortest First)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Clips Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {sortedAndFilteredClips.map((clip, index) => {
              const isExpanded = expandedClipId === clip.id;
              const thumbUrl = clip.thumbnail_url ? api.getServerUrl(clip.thumbnail_url) : null;
              const overallScore = clip.overall_score ?? clip.virality_score;

              // Individual 7 criteria scores
              const scores = clip.scores || {
                hook_strength: 16.0,
                interesting_content: 16.0,
                emotional_engagement: 12.0,
                information_value: 12.0,
                story_completeness: 12.0,
                ending_quality: 8.0,
                audio_visual_quality: 4.0,
                overall_score: overallScore,
              };

              return (
                <div
                  key={clip.id}
                  className="p-4 sm:p-5 rounded-2xl bg-zinc-950/85 border border-white/[0.08] hover:border-blue-500/40 transition-all flex flex-col justify-between space-y-4 shadow-xl group overflow-hidden"
                >
                  {/* Top Bar: Ranking Pill, Circular Score & Badges */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-zinc-900 border border-white/[0.06] text-xs font-mono font-bold text-zinc-300 flex items-center justify-center">
                          #{index + 1}
                        </span>
                        {renderRankingBadge(clip.ranking_badge)}
                        <Badge variant="outline" className="text-[10px] text-zinc-400">
                          {clip.category}
                        </Badge>
                      </div>
                      <h5 className="text-sm font-bold text-white line-clamp-1 group-hover:text-blue-300 transition-colors">
                        {clip.title}
                      </h5>
                    </div>

                    {/* Circular Score Indicator */}
                    <div className="shrink-0 flex items-center justify-center p-1 rounded-2xl bg-[#0a0a0a] border border-white/[0.06]">
                      <CircularScore score={overallScore} size="sm" showLabel={false} />
                    </div>
                  </div>

                  {/* Thumbnail & Timing */}
                  <div className="relative rounded-xl overflow-hidden aspect-video bg-zinc-900 border border-white/[0.06]">
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={clip.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600">
                        <Play className="w-6 h-6" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/20" />

                    {/* Bottom Time Badges */}
                    <div className="absolute bottom-2 left-2 flex items-center gap-2 z-10 text-[10px] font-mono text-zinc-300">
                      <span className="bg-black/75 px-2 py-0.5 rounded backdrop-blur">
                        {formatDuration(clip.start_time)} - {formatDuration(clip.end_time)}
                      </span>
                      <span className="bg-blue-950/80 text-blue-300 px-1.5 py-0.5 rounded border border-blue-800/40 font-bold">
                        {Math.round(clip.duration)}s
                      </span>
                    </div>

                    {clip.speaking_rate_wps ? (
                      <div className="absolute top-2 right-2 text-[10px] font-mono bg-black/75 text-zinc-300 px-2 py-0.5 rounded">
                        {clip.speaking_rate_wps} wps
                      </div>
                    ) : null}
                  </div>

                  {/* Short Description */}
                  {clip.short_description && (
                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                      {clip.short_description}
                    </p>
                  )}

                  {/* Opening Hook Quote Callout */}
                  {clip.hook && (
                    <div className="p-2.5 rounded-xl bg-blue-950/20 border border-blue-500/20 text-xs space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-blue-400 block tracking-wider flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-blue-400" /> Opening Hook (First 5s)
                      </span>
                      <p className="text-xs text-zinc-200 italic line-clamp-2">
                        &quot;{clip.hook}&quot;
                      </p>
                    </div>
                  )}

                  {/* 7-Point Scoring Breakdown (Expandable) */}
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setExpandedClipId(isExpanded ? null : clip.id)}
                      className="text-[11px] text-zinc-400 hover:text-blue-300 flex items-center justify-between w-full py-1.5 px-2 rounded-xl bg-zinc-900/60 border border-white/[0.04] cursor-pointer transition-colors"
                    >
                      <span className="font-semibold flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-blue-400" />
                        7-Criteria Quality Breakdown
                      </span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {isExpanded && (
                      <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-white/[0.06] space-y-2.5 text-xs">
                        {[
                          { name: 'Hook Strength', score: scores.hook_strength ?? 16, max: 20, color: 'bg-blue-500' },
                          { name: 'Interesting Content', score: scores.interesting_content ?? 16, max: 20, color: 'bg-indigo-500' },
                          { name: 'Emotional Engagement', score: scores.emotional_engagement ?? 12, max: 15, color: 'bg-pink-500' },
                          { name: 'Information Value', score: scores.information_value ?? 12, max: 15, color: 'bg-emerald-500' },
                          { name: 'Story Completeness', score: scores.story_completeness ?? 12, max: 15, color: 'bg-cyan-500' },
                          { name: 'Ending Quality', score: scores.ending_quality ?? 8, max: 10, color: 'bg-amber-500' },
                          { name: 'Visual & Audio Quality', score: scores.audio_visual_quality ?? 4, max: 5, color: 'bg-blue-500' },
                        ].map((item) => (
                          <div key={item.name} className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-zinc-400">{item.name}</span>
                              <span className="text-white font-mono font-bold">
                                {item.score} / {item.max} pts
                              </span>
                            </div>
                            <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`${item.color} h-full rounded-full transition-all duration-300`}
                                style={{ width: `${(item.score / item.max) * 100}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Evidence & Rationale Section */}
                  {clip.score_reasons && clip.score_reasons.length > 0 ? (
                    <div className="p-3 rounded-xl bg-zinc-900/50 border border-white/[0.04] space-y-1.5 text-[11px]">
                      <span className="font-semibold text-zinc-300 block flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-blue-400" /> Evidence-Based Score Reasons:
                      </span>
                      <ul className="space-y-1 text-zinc-400">
                        {clip.score_reasons.slice(0, 3).map((r, i) => (
                          <li key={i} className="line-clamp-1 leading-relaxed">
                            • {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="text-[11px] text-zinc-400 bg-zinc-900/50 p-2.5 rounded-xl border border-white/[0.04] space-y-1">
                      <span className="font-semibold text-zinc-300 block">AI Rationale:</span>
                      <p className="leading-relaxed text-zinc-400">{clip.reason_for_selection}</p>
                    </div>
                  )}

                  {/* Improvement Suggestions */}
                  {clip.improvement_suggestions && clip.improvement_suggestions.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-500/20 text-[11px] space-y-1">
                      <span className="font-bold text-amber-400 uppercase tracking-wider block flex items-center gap-1">
                        <Lightbulb className="w-3 h-3 text-amber-400" /> Optimization Suggestions:
                      </span>
                      <ul className="space-y-0.5 text-zinc-300">
                        {clip.improvement_suggestions.slice(0, 2).map((s, i) => (
                          <li key={i} className="line-clamp-1">
                            → {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Action Buttons - Clean 2-Row Structured Layout */}
                  <div className="pt-3 border-t border-white/[0.08] space-y-2">
                    {/* Primary Row: Playback & Download / Cut */}
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => {
                          if (clip.video_url) {
                            setPreviewingClip(clip);
                          } else if (onPreviewClip) {
                            onPreviewClip(clip);
                          }
                        }}
                        size="sm"
                        variant="secondary"
                        className="flex-1 rounded-xl text-xs py-2 bg-white/[0.06] hover:bg-white/[0.12] text-white font-semibold transition-all"
                      >
                        <Play className="w-3.5 h-3.5 mr-1.5 text-blue-400" /> Preview
                      </Button>

                      {clip.video_url ? (
                        <a
                          href={api.getClipDownloadUrl(clip.id)}
                          download={`${clip.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_9x16.mp4`}
                          className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/40 transition-all cursor-pointer whitespace-nowrap text-center"
                        >
                          <Download className="w-3.5 h-3.5 mr-1.5" /> Download
                        </a>
                      ) : (
                        <Button
                          onClick={() => handleRenderClip(clip)}
                          isLoading={renderingClipId === clip.id}
                          size="sm"
                          variant="primary"
                          className="flex-1 rounded-xl text-xs py-2"
                          title="Cut and crop to 9:16 vertical short using FFmpeg"
                        >
                          <Scissors className="w-3.5 h-3.5 mr-1.5" /> Cut 9:16
                        </Button>
                      )}
                    </div>

                    {/* Secondary Row: Studio Creative Tools */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <Button
                        onClick={() => setSubtitleModalClip(clip)}
                        size="sm"
                        variant="secondary"
                        className="rounded-xl text-[11px] py-1.5 px-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/25 truncate justify-center"
                        title="AI Subtitles & Animated Captions"
                      >
                        <Sparkles className="w-3 h-3 mr-1 text-blue-400 shrink-0" /> Captions
                      </Button>

                      <Button
                        onClick={() => setReframeModalClip(clip)}
                        size="sm"
                        variant="secondary"
                        className="rounded-xl text-[11px] py-1.5 px-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/25 truncate justify-center"
                        title="Smart Video Reframing (Face Tracking 9:16)"
                      >
                        <Crop className="w-3 h-3 mr-1 text-blue-400 shrink-0" /> Reframe
                      </Button>
                    </div>

                    {/* Utility Row: Quick Actions */}
                    <div className="flex items-center justify-between pt-1">
                      <Button
                        onClick={() => handleOpenEdit(clip)}
                        size="sm"
                        variant="ghost"
                        className="rounded-xl px-2 py-1 text-[11px] hover:bg-white/[0.08] text-zinc-400 hover:text-white"
                        title="Edit Clip Timestamps & Title"
                      >
                        <Edit3 className="w-3 h-3 mr-1 text-blue-400" /> Edit Times
                      </Button>

                      <Button
                        onClick={() => handleCopyTranscript(clip)}
                        size="sm"
                        variant="ghost"
                        className="rounded-xl px-2 py-1 text-[11px] hover:bg-white/[0.08] text-zinc-400 hover:text-white"
                        title="Copy Clip Transcript"
                      >
                        {copiedClipId === clip.id ? (
                          <>
                            <Check className="w-3 h-3 mr-1 text-emerald-400" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 mr-1 text-zinc-400" /> Copy Text
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mandatory Disclaimers */}
          <div className="p-3.5 rounded-2xl bg-zinc-950 border border-white/[0.06] flex items-start gap-2.5 text-[11px] text-zinc-500">
            <Info className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Transparent Scoring Disclaimer:</strong> Scores are estimated content-quality indicators based on speech analysis, hook detection, and narrative structure. They are not predictions or guarantees of actual social media performance on YouTube Shorts, Instagram Reels, or TikTok.
            </p>
          </div>
        </div>
      )}

      {/* Subtitle Customizer & Animated Caption Studio Modal */}
      {subtitleModalClip && (
        <SubtitleEditor
          clip={subtitleModalClip}
          videoUrl={subtitleModalClip.video_url || undefined}
          onClose={() => setSubtitleModalClip(null)}
          onSubtitlesRendered={(burnedUrl) => {
            setClips((prev) =>
              prev.map((c) =>
                c.id === subtitleModalClip.id
                  ? { ...c, video_url: burnedUrl, has_subtitles: true }
                  : c
              )
            );
          }}
        />
      )}

      {/* Intelligent Video Reframing Studio Modal */}
      {reframeModalClip && (
        <ReframingStudio
          clip={reframeModalClip}
          videoId={videoId}
          sourceVideoUrl={reframeModalClip.video_url || undefined}
          onClose={() => setReframeModalClip(null)}
          onReframingComplete={(outputUrl) => {
            setClips((prev) =>
              prev.map((c) =>
                c.id === reframeModalClip.id
                  ? { ...c, video_url: outputUrl }
                  : c
              )
            );
          }}
        />
      )}

      {/* 9:16 Vertical Short Preview Player Modal */}
      {previewingClip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm rounded-2xl bg-zinc-900 border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-3.5 flex items-center justify-between border-b border-white/10 bg-zinc-900/90">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                <h3 className="text-xs font-semibold text-white truncate">
                  {previewingClip.title}
                </h3>
              </div>
              <button
                onClick={() => setPreviewingClip(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors ml-2 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Video Player 9:16 Container */}
            <div className="relative aspect-[9/16] w-full bg-black flex items-center justify-center overflow-hidden">
              <video
                src={api.getServerUrl(previewingClip.video_url || '')}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-zinc-900/90 border-t border-white/10 flex items-center justify-between gap-2">
              <div className="text-[11px] text-white/50 truncate">
                Score: <span className="text-emerald-400 font-semibold">{previewingClip.virality_score}%</span>
                {' · '}
                <span>{previewingClip.duration}s</span>
              </div>
              {previewingClip.video_url && (
                <a
                  href={api.getClipDownloadUrl(previewingClip.id)}
                  download={`${previewingClip.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_9x16.mp4`}
                  className="inline-flex items-center justify-center px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/40 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 mr-1" /> Download Short
                </a>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Edit Clip Timestamps & Title Modal */}
      {editingClip && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0a0a0a] border border-white/[0.1] rounded-2xl max-w-md w-full overflow-hidden shadow-2xl p-6 space-y-5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold text-white">Edit Clip Timestamps</h3>
              </div>
              <button
                onClick={() => setEditingClip(null)}
                className="text-zinc-400 hover:text-white p-1 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-400 font-medium mb-1.5">Clip Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/[0.1] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-medium mb-1.5">Start Time (sec)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(parseFloat(e.target.value) || 0)}
                    className="w-full bg-zinc-950 border border-white/[0.1] rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[10px] text-zinc-500 mt-1 block font-mono">
                    {formatDuration(editStartTime)}
                  </span>
                </div>
                <div>
                  <label className="block text-zinc-400 font-medium mb-1.5">End Time (sec)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(parseFloat(e.target.value) || 0)}
                    className="w-full bg-zinc-950 border border-white/[0.1] rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[10px] text-zinc-500 mt-1 block font-mono">
                    {formatDuration(editEndTime)} ({Math.max(0, Math.round(editEndTime - editStartTime))}s duration)
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-white/[0.08]">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditingClip(null)}
                className="flex-1 rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveClipEdit}
                isLoading={isSavingEdit}
                className="flex-1 rounded-xl text-xs"
              >
                Save &amp; Re-render
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};
