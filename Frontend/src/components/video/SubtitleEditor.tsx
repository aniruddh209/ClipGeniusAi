'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  CaptionPreset,
  SubtitlePosition,
  SubtitleStyleConfig,
  SubtitleLineChunk,
  CandidateClip,
} from '@/types';
import { api } from '@/lib/api';
import { LiveSubtitlePreview } from './LiveSubtitlePreview';
import {
  Sparkles,
  Play,
  Pause,
  Download,
  Flame,
  Check,
  RotateCcw,
  Sliders,
  Type,
  Palette,
  Layout,
  Shield,
  Film,
  FileText,
  Volume2,
  VolumeX,
  X,
  Loader2,
} from 'lucide-react';

interface SubtitleEditorProps {
  clip: CandidateClip;
  videoUrl?: string;
  onClose?: () => void;
  onSubtitlesRendered?: (burnedVideoUrl: string) => void;
}

const DEFAULT_PRESET_CONFIGS: Record<CaptionPreset, SubtitleStyleConfig> = {
  modern_white: {
    preset: 'modern_white',
    preset_name: 'Modern White',
    font_family: 'Arial Bold',
    font_size: 44,
    primary_color: '#FFFFFF',
    highlight_color: '#38BDF8',
    keyword_color: '#FACC15',
    outline_color: '#000000',
    outline_width: 2,
    shadow_color: '#000000',
    shadow_offset: 3,
    background_box: true,
    background_color: 'rgba(15, 23, 42, 0.85)',
    background_padding_x: 26,
    background_padding_y: 14,
    background_radius: 16,
    position: 'bottom',
    safe_margin_y: 280,
    max_words_per_line: 4,
    uppercase: false,
    karaoke_animation: true,
    scale_active_word: true,
  },
  bold_yellow: {
    preset: 'bold_yellow',
    preset_name: 'Bold Yellow',
    font_family: 'Impact',
    font_size: 48,
    primary_color: '#FFFFFF',
    highlight_color: '#FFDD00',
    keyword_color: '#FF3366',
    outline_color: '#000000',
    outline_width: 5,
    shadow_color: '#000000',
    shadow_offset: 5,
    background_box: false,
    background_color: 'rgba(0, 0, 0, 0.70)',
    background_padding_x: 24,
    background_padding_y: 14,
    background_radius: 16,
    position: 'center',
    safe_margin_y: 240,
    max_words_per_line: 4,
    uppercase: true,
    karaoke_animation: true,
    scale_active_word: true,
  },
  minimal_clean: {
    preset: 'minimal_clean',
    preset_name: 'Minimal Clean',
    font_family: 'Helvetica',
    font_size: 38,
    primary_color: '#E2E8F0',
    highlight_color: '#FFFFFF',
    keyword_color: '#38BDF8',
    outline_color: '#0F172A',
    outline_width: 2,
    shadow_color: '#000000',
    shadow_offset: 2,
    background_box: false,
    background_color: 'rgba(0, 0, 0, 0.5)',
    background_padding_x: 20,
    background_padding_y: 10,
    background_radius: 12,
    position: 'bottom',
    safe_margin_y: 280,
    max_words_per_line: 5,
    uppercase: false,
    karaoke_animation: false,
    scale_active_word: false,
  },
  karaoke_highlight: {
    preset: 'karaoke_highlight',
    preset_name: 'Karaoke Highlight',
    font_family: 'Arial Black',
    font_size: 44,
    primary_color: '#94A3B8',
    highlight_color: '#22C55E',
    keyword_color: '#F59E0B',
    outline_color: '#000000',
    outline_width: 3,
    shadow_color: '#000000',
    shadow_offset: 2,
    background_box: true,
    background_color: 'rgba(0, 0, 0, 0.85)',
    background_padding_x: 28,
    background_padding_y: 16,
    background_radius: 20,
    position: 'bottom',
    safe_margin_y: 260,
    max_words_per_line: 4,
    uppercase: true,
    karaoke_animation: true,
    scale_active_word: true,
  },
  creator_style: {
    preset: 'creator_style',
    preset_name: 'Creator Style',
    font_family: 'Impact',
    font_size: 52,
    primary_color: '#FFFFFF',
    highlight_color: '#F59E0B',
    keyword_color: '#06B6D4',
    outline_color: '#000000',
    outline_width: 6,
    shadow_color: '#000000',
    shadow_offset: 6,
    background_box: false,
    background_color: 'rgba(0, 0, 0, 0.70)',
    background_padding_x: 24,
    background_padding_y: 14,
    background_radius: 16,
    position: 'bottom',
    safe_margin_y: 300,
    max_words_per_line: 3,
    uppercase: true,
    karaoke_animation: true,
    scale_active_word: true,
  },
  professional_podcast: {
    preset: 'professional_podcast',
    preset_name: 'Professional Podcast',
    font_family: 'Arial Bold',
    font_size: 42,
    primary_color: '#F8FAFC',
    highlight_color: '#C084FC',
    keyword_color: '#38BDF8',
    outline_color: '#000000',
    outline_width: 2,
    shadow_color: '#000000',
    shadow_offset: 3,
    background_box: true,
    background_color: 'rgba(24, 24, 27, 0.88)',
    background_padding_x: 26,
    background_padding_y: 14,
    background_radius: 16,
    position: 'bottom',
    safe_margin_y: 280,
    max_words_per_line: 4,
    uppercase: false,
    karaoke_animation: true,
    scale_active_word: true,
  },
};

const FONT_OPTIONS = [
  { id: 'Impact', label: 'Impact (Viral Heavy)' },
  { id: 'Arial Black', label: 'Arial Black (Punchy)' },
  { id: 'Arial Bold', label: 'Arial Bold (Classic)' },
  { id: 'Helvetica', label: 'Helvetica (Clean)' },
  { id: 'Montserrat', label: 'Montserrat (Modern)' },
];

const COLOR_SWATCHES = [
  '#FFFFFF',
  '#FFDD00',
  '#38BDF8',
  '#22C55E',
  '#FF3366',
  '#F59E0B',
  '#C084FC',
  '#06B6D4',
];

export const SubtitleEditor: React.FC<SubtitleEditorProps> = ({
  clip,
  videoUrl,
  onClose,
  onSubtitlesRendered,
}) => {
  // Style Configuration State
  const [style, setStyle] = useState<SubtitleStyleConfig>(
    DEFAULT_PRESET_CONFIGS.bold_yellow
  );

  // Subtitle Chunks and Preview State
  const [chunks, setChunks] = useState<SubtitleLineChunk[]>([]);
  const [isLoadingChunks, setIsLoadingChunks] = useState(false);
  const [isBurning, setIsBurning] = useState(false);
  const [burnedVideoUrl, setBurnedVideoUrl] = useState<string | null>(null);
  const [burnError, setBurnError] = useState<string | null>(null);

  // Playback State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showSafeGuides, setShowSafeGuides] = useState(false);
  const [activeTab, setActiveTab] = useState<'presets' | 'style' | 'layout'>('presets');

  // Resolved video URL
  const activeVideoUrl = api.getServerUrl(
    burnedVideoUrl || clip.video_url || clip.preview_url || videoUrl || null
  );

  // Load Subtitle Chunks on mount or when words per line changes
  useEffect(() => {
    let isMounted = true;
    async function loadChunks() {
      setIsLoadingChunks(true);
      try {
        const res = await api.generateSubtitles({
          video_id: clip.video_id,
          clip_id: clip.id,
          start_time: clip.start_time,
          end_time: clip.end_time,
          style: style,
        });
        if (isMounted) {
          setChunks(res.chunks);
        }
      } catch (err) {
        console.error('Failed to load subtitle chunks:', err);
      } finally {
        if (isMounted) setIsLoadingChunks(false);
      }
    }
    loadChunks();
    return () => {
      isMounted = false;
    };
  }, [clip.id, clip.video_id, clip.start_time, clip.end_time, style.max_words_per_line]);

  // Handle Preset Selection
  const handleSelectPreset = (presetKey: CaptionPreset) => {
    const presetConfig = DEFAULT_PRESET_CONFIGS[presetKey];
    if (presetConfig) {
      setStyle({ ...presetConfig });
    }
  };

  // Play / Pause Toggle
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

  // Handle Video Time Update
  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time);
  };

  // Scrub Time
  const handleScrub = (time: number) => {
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  // Burn Subtitles to Video
  const handleBurnSubtitles = async () => {
    setIsBurning(true);
    setBurnError(null);
    try {
      const res = await api.burnSubtitles({
        video_id: clip.video_id,
        clip_id: clip.id,
        style: style,
      });

      if (res.status === 'completed' && res.subtitled_video_url) {
        setBurnedVideoUrl(res.subtitled_video_url);
        if (onSubtitlesRendered) {
          onSubtitlesRendered(res.subtitled_video_url);
        }
      }
    } catch (err: any) {
      console.error('Failed to burn subtitles:', err);
      setBurnError(err.message || 'Failed to render subtitles on video');
    } finally {
      setIsBurning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-neutral-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-neutral-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                AI Subtitle & Animated Caption Studio
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-medium">
                  Word Sync
                </span>
              </h2>
              <p className="text-xs text-white/50">
                Clip: &ldquo;{clip.title}&rdquo; ({clip.duration.toFixed(1)}s)
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-y-auto">
          {/* Left Column: Live Interactive Preview */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <div className="w-full max-w-[280px] sm:max-w-[320px]">
              <LiveSubtitlePreview
                videoUrl={activeVideoUrl}
                chunks={chunks}
                style={style}
                currentTime={currentTime}
                showSafeGuides={showSafeGuides}
                aspectRatio="9:16"
                videoRef={videoRef}
                onTimeUpdate={handleTimeUpdate}
              />

              {/* Scrubber & Playback Controls */}
              <div className="mt-4 p-3 rounded-xl bg-neutral-900/80 border border-white/10 flex flex-col gap-2">
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
                    max={clip.duration || 30}
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
                  <span>{clip.duration.toFixed(1)}s</span>
                </div>
              </div>

              {/* Mobile Safe Guides Toggle */}
              <button
                onClick={() => setShowSafeGuides(!showSafeGuides)}
                className={`w-full mt-3 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-medium border transition-colors ${
                  showSafeGuides
                    ? 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                    : 'bg-neutral-900/60 border-white/5 text-white/60 hover:text-white'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                {showSafeGuides ? 'Hide Mobile Safe Overlays' : 'Show TikTok/Reels Safe Margin Guides'}
              </button>
            </div>
          </div>

          {/* Right Column: Customization Controls */}
          <div className="lg:col-span-7 flex flex-col">
            {/* Tabs */}
            <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-4">
              <button
                onClick={() => setActiveTab('presets')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'presets'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                    : 'bg-neutral-900 text-white/60 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                6 Viral Presets
              </button>

              <button
                onClick={() => setActiveTab('style')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'style'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                    : 'bg-neutral-900 text-white/60 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <Palette className="w-3.5 h-3.5" />
                Typography & Colors
              </button>

              <button
                onClick={() => setActiveTab('layout')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'layout'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                    : 'bg-neutral-900 text-white/60 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <Layout className="w-3.5 h-3.5" />
                Position & Box
              </button>
            </div>

            {/* TAB 1: Presets */}
            {activeTab === 'presets' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(DEFAULT_PRESET_CONFIGS).map(([key, config]) => {
                  const isSelected = style.preset === key;
                  return (
                    <button
                      key={key}
                      onClick={() => handleSelectPreset(key as CaptionPreset)}
                      className={`relative flex flex-col text-left p-3.5 rounded-xl border transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/10'
                          : 'border-white/10 bg-neutral-900/60 hover:border-white/20 hover:bg-neutral-900'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-white">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                      )}
                      <span className="text-xs font-bold text-white mb-2">{config.preset_name}</span>

                      {/* Visual Mini Preview Badge */}
                      <div
                        className="w-full py-2 px-2 rounded-lg flex items-center justify-center text-center text-xs font-black truncate shadow-sm"
                        style={{
                          backgroundColor: config.background_box ? config.background_color : '#000000',
                          fontFamily: config.font_family,
                          color: config.highlight_color,
                          WebkitTextStroke:
                            config.outline_width > 0
                              ? `${Math.max(1, config.outline_width * 0.3)}px ${config.outline_color}`
                              : undefined,
                        }}
                      >
                        {config.uppercase ? 'VIRAL HOOK' : 'Viral Hook'}
                      </div>

                      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-white/50">
                        <span className="truncate">{config.font_family}</span>
                        <span>•</span>
                        <span>{config.position}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* TAB 2: Typography & Colors */}
            {activeTab === 'style' && (
              <div className="space-y-4">
                {/* Font Selector */}
                <div>
                  <label className="text-xs font-medium text-white/70 block mb-1.5">
                    Font Family
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {FONT_OPTIONS.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setStyle({ ...style, font_family: f.id })}
                        className={`px-3 py-2 rounded-xl text-xs font-medium border text-left transition-colors ${
                          style.font_family === f.id
                            ? 'border-blue-500 bg-blue-500/15 text-white'
                            : 'border-white/10 bg-neutral-900/60 text-white/60 hover:text-white'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Size Slider */}
                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-white/70">Font Size</span>
                    <span className="text-blue-400 font-mono">{style.font_size}px</span>
                  </div>
                  <input
                    type="range"
                    min={28}
                    max={64}
                    value={style.font_size}
                    onChange={(e) => setStyle({ ...style, font_size: parseInt(e.target.value) })}
                    className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {/* Colors Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  {/* Primary Color */}
                  <div>
                    <label className="text-xs font-medium text-white/70 block mb-1">Base Text</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={style.primary_color}
                        onChange={(e) => setStyle({ ...style, primary_color: e.target.value })}
                        className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                      />
                      <span className="text-xs font-mono text-white/60 uppercase">
                        {style.primary_color}
                      </span>
                    </div>
                  </div>

                  {/* Active Karaoke Color */}
                  <div>
                    <label className="text-xs font-medium text-white/70 block mb-1">Active Word</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={style.highlight_color}
                        onChange={(e) => setStyle({ ...style, highlight_color: e.target.value })}
                        className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                      />
                      <span className="text-xs font-mono text-yellow-400 uppercase">
                        {style.highlight_color}
                      </span>
                    </div>
                  </div>

                  {/* Keyword Color */}
                  <div>
                    <label className="text-xs font-medium text-white/70 block mb-1">Keywords</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={style.keyword_color}
                        onChange={(e) => setStyle({ ...style, keyword_color: e.target.value })}
                        className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                      />
                      <span className="text-xs font-mono text-cyan-400 uppercase">
                        {style.keyword_color}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Outline & Shadow */}
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="text-white/70">Outline Stroke</span>
                      <span className="text-white/50">{style.outline_width}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={8}
                      value={style.outline_width}
                      onChange={(e) =>
                        setStyle({ ...style, outline_width: parseInt(e.target.value) })
                      }
                      className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="text-white/70">Shadow Depth</span>
                      <span className="text-white/50">{style.shadow_offset}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={8}
                      value={style.shadow_offset}
                      onChange={(e) =>
                        setStyle({ ...style, shadow_offset: parseInt(e.target.value) })
                      }
                      className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                </div>

                {/* Toggles */}
                <div className="flex flex-wrap gap-4 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-white/80">
                    <input
                      type="checkbox"
                      checked={style.uppercase}
                      onChange={(e) => setStyle({ ...style, uppercase: e.target.checked })}
                      className="rounded bg-neutral-800 border-white/20 text-blue-600 focus:ring-0"
                    />
                    ALL CAPS
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-white/80">
                    <input
                      type="checkbox"
                      checked={style.karaoke_animation}
                      onChange={(e) =>
                        setStyle({ ...style, karaoke_animation: e.target.checked })
                      }
                      className="rounded bg-neutral-800 border-white/20 text-blue-600 focus:ring-0"
                    />
                    Karaoke Highlighting
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-white/80">
                    <input
                      type="checkbox"
                      checked={style.scale_active_word}
                      onChange={(e) =>
                        setStyle({ ...style, scale_active_word: e.target.checked })
                      }
                      className="rounded bg-neutral-800 border-white/20 text-blue-600 focus:ring-0"
                    />
                    Active Word Kinetic Pop
                  </label>
                </div>
              </div>
            )}

            {/* TAB 3: Position & Box */}
            {activeTab === 'layout' && (
              <div className="space-y-4">
                {/* Vertical Position */}
                <div>
                  <label className="text-xs font-medium text-white/70 block mb-1.5">
                    Vertical Position
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['bottom', 'center', 'top'] as SubtitlePosition[]).map((pos) => (
                      <button
                        key={pos}
                        onClick={() => setStyle({ ...style, position: pos })}
                        className={`py-2 px-3 rounded-xl text-xs font-semibold capitalize border transition-colors ${
                          style.position === pos
                            ? 'border-blue-500 bg-blue-500/15 text-white'
                            : 'border-white/10 bg-neutral-900/60 text-white/60 hover:text-white'
                        }`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Safe Margin Slider */}
                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-white/70">Mobile Safe Margin (Y)</span>
                    <span className="text-blue-400 font-mono">{style.safe_margin_y}px</span>
                  </div>
                  <input
                    type="range"
                    min={180}
                    max={360}
                    step={10}
                    value={style.safe_margin_y}
                    onChange={(e) =>
                      setStyle({ ...style, safe_margin_y: parseInt(e.target.value) })
                    }
                    className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <p className="text-[11px] text-white/40 mt-1">
                    Ensures captions sit above TikTok & Reels comment / description overlays.
                  </p>
                </div>

                {/* Max Words per Line */}
                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-white/70">Words Per Line</span>
                    <span className="text-blue-400 font-mono">{style.max_words_per_line} words</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[3, 4, 5, 6].map((count) => (
                      <button
                        key={count}
                        onClick={() => setStyle({ ...style, max_words_per_line: count })}
                        className={`py-2 rounded-xl text-xs font-semibold border transition-colors ${
                          style.max_words_per_line === count
                            ? 'border-blue-500 bg-blue-500/15 text-white'
                            : 'border-white/10 bg-neutral-900/60 text-white/60 hover:text-white'
                        }`}
                      >
                        {count} words
                      </button>
                    ))}
                  </div>
                </div>

                {/* Background Box Settings */}
                <div className="p-4 rounded-xl bg-neutral-900/50 border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">Background Pill / Box</span>
                      <span className="text-[11px] text-white/40">
                        Adds a rounded contrast card behind captions
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={style.background_box}
                      onChange={(e) => setStyle({ ...style, background_box: e.target.checked })}
                      className="w-4 h-4 rounded bg-neutral-800 border-white/20 text-blue-600 focus:ring-0"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Error Banner */}
            {burnError && (
              <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {burnError}
              </div>
            )}

            {/* Action Bar */}
            <div className="mt-auto pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Secondary Download Actions (SRT / ASS) */}
              <div className="flex items-center gap-2">
                <a
                  href={api.getSubtitleDownloadUrl(clip.id, 'srt')}
                  download
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-xs font-medium text-white/70 hover:text-white transition-colors"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                  Download .SRT
                </a>

                <a
                  href={api.getSubtitleDownloadUrl(clip.id, 'ass')}
                  download
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-xs font-medium text-white/70 hover:text-white transition-colors"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                  Download .ASS
                </a>
              </div>

              {/* Primary Burn Button */}
              <div className="flex items-center gap-3 w-full sm:w-auto">
                {burnedVideoUrl ? (
                  <a
                    href={api.getServerUrl(burnedVideoUrl)}
                    download
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 transition-all"
                  >
                    <Download className="w-4 h-4" />
                    Download Subtitled MP4
                  </a>
                ) : (
                  <button
                    onClick={handleBurnSubtitles}
                    disabled={isBurning}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50"
                  >
                    {isBurning ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Rendering Captions with FFmpeg...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Burn & Render Subtitles
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
