'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Search, 
  ExternalLink 
} from 'lucide-react';

interface DashboardHeaderProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  title,
  subtitle,
  action,
}) => {
  return (
    <header className="h-16 px-4 sm:px-6 lg:px-8 border-b border-blue-900/20 bg-[#070c18]/80 backdrop-blur-md flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-4">
        {title ? (
          <div>
            <h1 className="text-sm sm:text-base font-bold text-white tracking-tight">{title}</h1>
            {subtitle && <p className="text-[11px] sm:text-xs text-slate-400">{subtitle}</p>}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="font-semibold text-slate-200">ClipGenius Studio</span>
            <span>/</span>
            <span className="text-blue-400 font-medium">Workspace</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* Backend Connectivity Status Pill */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/40 border border-emerald-800/50 text-[11px] text-emerald-300 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Engine Connected</span>
        </div>

        {/* Global Search shortcut */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-400">
          <Search className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-slate-400">Search projects & clips...</span>
          <kbd className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300 border border-slate-700">⌘K</kbd>
        </div>

        {/* Swagger Docs Shortcut */}
        <a
          href="http://localhost:8001/docs"
          target="_blank"
          rel="noreferrer"
          className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-2.5 py-1.5 rounded-xl hover:bg-slate-800/60 border border-transparent hover:border-slate-700 transition-all"
        >
          <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
          <span>API Docs</span>
        </a>

        {/* Optional Action passed from Page */}
        {action}
      </div>
    </header>
  );
};
