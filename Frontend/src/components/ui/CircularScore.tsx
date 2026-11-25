'use client';

import React from 'react';

interface CircularScoreProps {
  score: number;
  maxScore?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  label?: string;
  className?: string;
}

export const CircularScore: React.FC<CircularScoreProps> = ({
  score,
  maxScore = 100,
  size = 'md',
  showLabel = true,
  label = 'Quality Score',
  className = '',
}) => {
  const normalizedScore = Math.max(0, Math.min(maxScore, score));
  const percentage = Math.round((normalizedScore / maxScore) * 100);

  // Dimension settings
  const config = {
    sm: { size: 54, strokeWidth: 4.5, textSize: 'text-sm', subSize: 'text-[9px]', labelSize: 'text-[10px]' },
    md: { size: 76, strokeWidth: 6, textSize: 'text-lg', subSize: 'text-[10px]', labelSize: 'text-[11px]' },
    lg: { size: 104, strokeWidth: 8, textSize: 'text-2xl', subSize: 'text-xs', labelSize: 'text-xs' },
  }[size];

  const radius = (config.size - config.strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Dynamic gradient definition and color accents
  const getGradientColors = (pct: number) => {
    if (pct >= 85) return { start: '#10b981', end: '#06b6d4', glow: 'rgba(16, 185, 129, 0.3)', textColor: 'text-emerald-400' };
    if (pct >= 70) return { start: '#3b82f6', end: '#2563eb', glow: 'rgba(59, 130, 246, 0.3)', textColor: 'text-blue-400' };
    if (pct >= 55) return { start: '#f59e0b', end: '#f97316', glow: 'rgba(245, 158, 11, 0.3)', textColor: 'text-amber-400' };
    return { start: '#f43f5e', end: '#ec4899', glow: 'rgba(244, 63, 94, 0.3)', textColor: 'text-rose-400' };
  };

  const colors = getGradientColors(percentage);
  const gradientId = `score-grad-${Math.round(score)}-${size}-${Math.random().toString(36).substr(2, 4)}`;

  return (
    <div className={`inline-flex flex-col items-center justify-center ${className}`}>
      <div
        className="relative flex items-center justify-center"
        style={{ width: config.size, height: config.size }}
      >
        <svg
          width={config.size}
          height={config.size}
          viewBox={`0 0 ${config.size} ${config.size}`}
          className="transform -rotate-90"
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={colors.start} />
              <stop offset="100%" stopColor={colors.end} />
            </linearGradient>
            <filter id={`glow-${gradientId}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Background circle track */}
          <circle
            cx={config.size / 2}
            cy={config.size / 2}
            r={radius}
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth={config.strokeWidth}
            fill="transparent"
          />

          {/* Active progress circle */}
          <circle
            cx={config.size / 2}
            cy={config.size / 2}
            r={radius}
            stroke={`url(#${gradientId})`}
            strokeWidth={config.strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            style={{
              transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
              filter: `drop-shadow(0 0 6px ${colors.glow})`,
            }}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className={`font-mono font-black tracking-tight leading-none text-white ${config.textSize}`}>
            {Math.round(score)}
          </span>
          {size !== 'sm' && (
            <span className={`font-mono text-zinc-500 uppercase font-semibold leading-tight mt-0.5 ${config.subSize}`}>
              /100
            </span>
          )}
        </div>
      </div>

      {showLabel && (
        <span className={`font-medium text-zinc-400 mt-1.5 uppercase tracking-wider text-center ${config.labelSize}`}>
          {label}
        </span>
      )}
    </div>
  );
};
