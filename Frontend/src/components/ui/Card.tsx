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
        'rounded-2xl border border-slate-800/70 bg-[#0d1527]/70 backdrop-blur-xl p-6 shadow-2xl shadow-black/50',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
