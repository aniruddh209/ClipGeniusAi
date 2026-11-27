'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Search, 
  ExternalLink 
} from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

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
    <header className="h-16 px-4 sm:px-6 lg:px-8 border-b border-[var(--card-border)] bg-[var(--surface)]/90 backdrop-blur-md flex items-center justify-between sticky top-0 z-30 transition-colors">
      <div className="flex items-center gap-4">
        {title ? (
          <div>
            <h1 className="text-sm sm:text-base font-bold text-[var(--foreground)] tracking-tight">{title}</h1>
            {subtitle && <p className="text-[11px] sm:text-xs text-[var(--text-muted)]">{subtitle}</p>}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--foreground)]">ClipGenius Studio</span>
            <span>/</span>
            <span className="text-[#595a45] dark:text-[#9ca87d] font-medium">Workspace</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Global Search shortcut */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--card)] border border-[var(--card-border)] text-xs text-[var(--text-muted)]">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <span className="text-[var(--text-muted)]">Search projects & clips...</span>
          <kbd className="text-[10px] bg-[var(--surface)] px-1.5 py-0.5 rounded text-[var(--text-muted)] border border-[var(--card-border)]">⌘K</kbd>
        </div>

        {/* Swagger Docs Shortcut */}
        <a
          href="http://localhost:8001/docs"
          target="_blank"
          rel="noreferrer"
          className="hidden sm:flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] px-2.5 py-1.5 rounded-xl hover:bg-[var(--card)] border border-transparent hover:border-[var(--card-border)] transition-all"
        >
          <ExternalLink className="w-3.5 h-3.5 text-[#595a45] dark:text-[#9ca87d]" />
          <span>API Docs</span>
        </a>

        {/* Theme Toggle (Dark / Light Mode) */}
        <ThemeToggle />

        {/* Optional Action passed from Page */}
        {action}
      </div>
    </header>
  );
};
