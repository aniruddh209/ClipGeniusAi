import React from 'react';
import { cn } from '@/lib/utils';

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        'rounded-2xl border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] p-6 shadow-sm transition-all',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
