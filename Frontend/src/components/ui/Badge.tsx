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
    success: 'bg-[#595a45]/20 text-[#3a3c2d] dark:text-[#9ca87d] border-[#595a45]/30',
    warning: 'bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-800/40',
    error: 'bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-800/40',
    outline: 'bg-transparent text-[var(--text-muted)] border-[var(--card-border)]',
    blue: 'bg-[#595a45]/15 text-[#404332] dark:text-[#9ca87d] border-[#595a45]/30 font-bold',
    purple: 'bg-[#595a45]/15 text-[#404332] dark:text-[#9ca87d] border-[#595a45]/30 font-bold',
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
