import React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'outline' | 'blue' | 'purple';
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'default',
  children,
  ...props
}) => {
  const variants = {
    default: 'bg-slate-900 text-slate-300 border-slate-800',
    success: 'bg-emerald-950/70 text-emerald-400 border-emerald-800/60',
    warning: 'bg-amber-950/70 text-amber-400 border-amber-800/60',
    error: 'bg-rose-950/70 text-rose-400 border-rose-800/60',
    outline: 'bg-transparent text-slate-400 border-slate-800',
    blue: 'bg-blue-950/80 text-blue-400 border-blue-800/70 shadow-sm shadow-blue-950/50',
    purple: 'bg-blue-950/80 text-blue-400 border-blue-800/70 shadow-sm shadow-blue-950/50', // Alias purple to sleek blue
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
};
