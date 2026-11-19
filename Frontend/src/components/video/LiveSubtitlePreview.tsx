'use client';

import React, { useMemo } from 'react';
import { SubtitleLineChunk, SubtitleStyleConfig } from '@/types';
import { Heart, MessageSquare, Share2, Music, Bookmark } from 'lucide-react';

interface LiveSubtitlePreviewProps {
  videoUrl?: string;
  chunks: SubtitleLineChunk[];
  style: SubtitleStyleConfig;
  currentTime: number;
  showSafeGuides?: boolean;
  aspectRatio?: string;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  onTimeUpdate?: (time: number) => void;
  className?: string;
}

export const LiveSubtitlePreview: React.FC<LiveSubtitlePreviewProps> = ({
  videoUrl,
  chunks,
  style,
  currentTime,
  showSafeGuides = false,
  aspectRatio = '9:16',
  videoRef,
  onTimeUpdate,
  className = '',
}) => {
  // Find currently active chunk
  const activeChunk = useMemo(() => {
    return chunks.find((c) => currentTime >= c.start && currentTime <= c.end) || null;
  }, [chunks, currentTime]);

  // Determine aspect ratio class
  const aspectClass =
    aspectRatio === '9:16'
      ? 'aspect-[9/16] max-h-[560px]'
      : aspectRatio === '1:1'
      ? 'aspect-square max-h-[500px]'
      : 'aspect-[16/9] max-h-[420px]';

  // Compute vertical position styles
  const positionStyle: React.CSSProperties = useMemo(() => {
    const scale = 0.35; // scale factor for preview container
    const marginPx = Math.max(16, style.safe_margin_y * scale);

    if (style.position === 'top') {
      return { top: `${marginPx}px` };
    } else if (style.position === 'center') {
      return { top: '50%', transform: 'translateY(-50%)' };
    } else {
      return { bottom: `${marginPx}px` };
    }
  }, [style.position, style.safe_margin_y]);

  return (
    <div
      className={`relative w-full ${aspectClass} mx-auto overflow-hidden rounded-2xl bg-black border border-white/10 shadow-2xl flex items-center justify-center select-none ${className}`}
    >
      {/* Video Element or Gradient Placeholder */}
      {videoUrl ? (
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full object-cover"
          playsInline
          onTimeUpdate={(e) => onTimeUpdate && onTimeUpdate(e.currentTarget.currentTime)}
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-neutral-900 via-purple-950/20 to-neutral-900 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-3">
            <span className="text-2xl">🎬</span>
          </div>
          <p className="text-white/60 text-sm font-medium">Video Preview Canvas</p>
          <p className="text-white/30 text-xs mt-1">Captions will render here in real-time</p>
        </div>
      )}

      {/* Social Media Safe Area Overlay Guide */}
      {showSafeGuides && aspectRatio === '9:16' && (
        <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between p-3">
          {/* Top TikTok/Reels Bar Guide */}
          <div className="w-full h-14 bg-red-500/10 border border-dashed border-red-500/30 rounded-lg flex items-center justify-center">
            <span className="text-[10px] text-red-400 font-mono tracking-wider font-semibold uppercase">
              Top Header Safe Boundary
            </span>
          </div>

          {/* Right Action Icons (Like, Comment, Share) */}
          <div className="absolute right-3 bottom-24 flex flex-col gap-3 items-center">
            <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white/70">
              <Heart className="w-4 h-4 fill-white/20" />
            </div>
            <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white/70">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white/70">
              <Bookmark className="w-4 h-4" />
            </div>
            <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white/70">
              <Share2 className="w-4 h-4" />
            </div>
          </div>

          {/* Bottom TikTok/Reels Overlay Guide */}
          <div className="w-full h-20 bg-red-500/10 border border-dashed border-red-500/30 rounded-lg flex flex-col justify-center px-3">
            <span className="text-[10px] text-red-400 font-mono tracking-wider font-semibold uppercase">
              Bottom Social Overlay Zone
            </span>
            <span className="text-[9px] text-white/40 mt-0.5">Captions kept above this margin are 100% visible</span>
          </div>
        </div>
      )}

      {/* Subtitles Overlay */}
      {activeChunk && (
        <div
          className="absolute left-0 right-0 z-30 px-4 flex justify-center pointer-events-none transition-all duration-150"
          style={positionStyle}
        >
          <div
            className={`inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 transition-all duration-100 ${
              style.background_box ? 'px-4 py-2 rounded-xl backdrop-blur-sm' : ''
            }`}
            style={{
              backgroundColor: style.background_box ? style.background_color : 'transparent',
              maxWidth: '92%',
            }}
          >
            {activeChunk.words.map((item, i) => {
              const isActive = style.karaoke_animation && currentTime >= item.start && currentTime <= item.end;
              const displayText = style.uppercase ? item.word.toUpperCase() : item.word;

              let color = style.primary_color;
              if (isActive) {
                color = style.highlight_color;
              } else if (item.is_keyword) {
                color = style.keyword_color;
              }

              return (
                <span
                  key={`${item.word}-${i}-${item.start}`}
                  className="inline-block transition-transform duration-100"
                  style={{
                    fontFamily: style.font_family,
                    fontSize: `${Math.round(style.font_size * 0.42)}px`,
                    fontWeight: 800,
                    color: color,
                    transform: isActive && style.scale_active_word ? 'scale(1.15)' : 'scale(1)',
                    WebkitTextStroke:
                      style.outline_width > 0
                        ? `${Math.max(1, Math.round(style.outline_width * 0.4))}px ${style.outline_color}`
                        : undefined,
                    textShadow:
                      style.shadow_offset > 0
                        ? `${Math.round(style.shadow_offset * 0.4)}px ${Math.round(
                            style.shadow_offset * 0.4
                          )}px 4px ${style.shadow_color}`
                        : undefined,
                  }}
                >
                  {displayText}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* When no chunk is currently active, show subtle preview cue if scrubbed */}
      {!activeChunk && chunks.length > 0 && (
        <div
          className="absolute left-0 right-0 z-30 px-4 flex justify-center pointer-events-none opacity-40"
          style={positionStyle}
        >
          <div
            className={`inline-flex items-center justify-center px-3 py-1 rounded-lg text-xs font-semibold ${
              style.background_box ? 'bg-black/60' : ''
            }`}
            style={{
              color: style.primary_color,
              fontFamily: style.font_family,
            }}
          >
            {style.uppercase ? '[ SPEECH TIMING ACTIVE ]' : '[ Speech timing active ]'}
          </div>
        </div>
      )}
    </div>
  );
};
