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
    default: 'bg-[var(--surface)] text-[var(--text-muted)] border-[var(--card-border)]',
    success: 'bg-[#A3E635]/15 text-[#3F6212] dark:text-[#A3E635] border-[#A3E635]/30 font-bold',
    warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
    error: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30',
    outline: 'bg-transparent text-[var(--text-muted)] border-[var(--card-border)]',
    blue: 'bg-[#A3E635]/15 text-[#3F6212] dark:text-[#A3E635] border-[#A3E635]/30 font-bold',
    purple: 'bg-[#4ADE80]/15 text-[#15803d] dark:text-[#4ADE80] border-[#4ADE80]/30 font-bold',
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
