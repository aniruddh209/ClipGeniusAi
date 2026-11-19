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
        'rounded-2xl border border-zinc-800/80 bg-zinc-900/60 backdrop-blur-xl p-6 shadow-xl shadow-black/40',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
