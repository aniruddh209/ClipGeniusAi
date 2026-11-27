'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { 
  LayoutDashboard, 
  Scissors, 
  Film, 
  Settings, 
  Plus, 
  DownloadCloud, 
  Clock, 
  Menu, 
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

function DashboardSidebarContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams ? searchParams.get('tab') : null;
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const fetchProjectCount = async () => {
    try {
      const vids = await api.getVideos();
      setProjectCount(Array.isArray(vids) ? vids.length : 0);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchProjectCount();
    const handleUpdate = () => fetchProjectCount();
    window.addEventListener('projects-updated', handleUpdate);
    return () => window.removeEventListener('projects-updated', handleUpdate);
  }, [pathname]);

  // Close mobile drawer when route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, currentTab]);

  const navItems = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      badge: undefined,
    },
    {
      label: 'AI Clipper',
      href: '/dashboard/create',
      icon: Scissors,
      badge: 'AI',
    },
    {
      label: 'Video Downloader',
      href: '/dashboard/downloader',
      icon: DownloadCloud,
      badge: 'PRO',
    },
    {
      label: 'My Projects',
      href: '/dashboard/projects',
      icon: Film,
      badge: projectCount !== null ? projectCount.toString() : undefined,
    },
    {
      label: 'Download History',
      href: '/dashboard/downloader?tab=history',
      icon: Clock,
      badge: undefined,
    },
    {
      label: 'Settings',
      href: '/dashboard/settings',
      icon: Settings,
      badge: undefined,
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full justify-between">
      <div>
        {/* Brand Header */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-[var(--card-border)]">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-[#595a45] dark:bg-[#7d8863] text-white dark:text-[#070807] flex items-center justify-center shadow-md shadow-[#595a45]/25 group-hover:scale-105 transition-all">
              <Scissors className="w-4 h-4 text-white dark:text-[#070807]" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-[var(--foreground)] flex items-center gap-1.5">
                ClipGenius <span className="text-[#595a45] dark:text-[#9ca87d] font-bold">AI</span>
              </span>
              <span className="text-[10px] text-[var(--text-muted)] block -mt-0.5 tracking-wider uppercase font-medium">
                Studio Suite
              </span>
            </div>
          </Link>
          {/* Close button on mobile */}
          <button 
            type="button"
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-border)]/40"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Action Button */}
        <div className="p-4">
          <Link href="/dashboard/create">
            <button className="w-full h-10 rounded-xl bg-[#595a45] hover:bg-[#484b39] text-[#f7f8f4] dark:bg-[#7d8863] dark:hover:bg-[#8f9b72] dark:text-[#070807] font-bold text-xs tracking-wide flex items-center justify-center gap-2 shadow-md shadow-[#595a45]/20 active:scale-[0.98] transition-all cursor-pointer">
              <Plus className="w-4 h-4" />
              <span>Create New Clips</span>
            </button>
          </Link>
        </div>

        {/* Main Navigation */}
        <div className="px-3 space-y-1">
          <div className="px-3 pb-2 pt-1 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            Workspace
          </div>

          {navItems.map((item) => {
            const isHistoryItem = item.href.includes('tab=history');
            const isDownloaderItem = item.href === '/dashboard/downloader';
            
            let isActive = false;
            if (isHistoryItem) {
              isActive = pathname === '/dashboard/downloader' && currentTab === 'history';
            } else if (isDownloaderItem) {
              isActive = pathname === '/dashboard/downloader' && currentTab !== 'history';
            } else {
              isActive = pathname === item.href;
            }

            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all group',
                  isActive
                    ? 'bg-[#595a45]/15 text-[#3a3c2d] dark:text-[#9ca87d] border border-[#595a45]/30 shadow-xs font-bold'
                    : 'text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-border)]/30'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={cn(
                      'w-4 h-4 transition-colors',
                      isActive ? 'text-[#595a45] dark:text-[#9ca87d]' : 'text-[var(--text-muted)] group-hover:text-[var(--foreground)]'
                    )}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={cn(
                      'px-1.5 py-0.5 text-[10px] rounded-md font-semibold border',
                      isActive
                        ? 'bg-[#595a45]/20 text-[#3a3c2d] dark:text-[#9ca87d] border-[#595a45]/30'
                        : 'bg-[var(--surface)] text-[var(--foreground)] border-[var(--card-border)]'
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Clean, Minimalist Studio Footer */}
      <div className="p-4 border-t border-[var(--card-border)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>v1.0 Studio</span>
        </span>
        <span className="text-[10px] font-mono opacity-60">Open Source</span>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Sticky Top Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-[var(--surface)]/95 backdrop-blur-md border-b border-[var(--card-border)] px-4 flex items-center justify-between z-40">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#595a45] dark:bg-[#7d8863] text-white dark:text-[#070807] flex items-center justify-center shadow-md shadow-[#595a45]/25">
            <Scissors className="w-3.5 h-3.5 text-white dark:text-[#070807]" />
          </div>
          <span className="font-bold text-sm tracking-tight text-[var(--foreground)]">
            ClipGenius <span className="text-[#595a45] dark:text-[#9ca87d] font-bold">AI</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-xl text-[var(--foreground)] hover:bg-[var(--card-border)]/40 border border-[var(--card-border)]"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile Slide-Over Drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity" 
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer Menu */}
          <div className="relative w-72 max-w-[85vw] bg-[var(--surface)] border-r border-[var(--card-border)] h-full z-10 flex flex-col shadow-2xl">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop Permanent Studio Sidebar */}
      <aside className="hidden md:flex md:w-64 border-r border-[var(--card-border)] bg-[var(--surface)] flex-col shrink-0 min-h-screen transition-colors">
        {sidebarContent}
      </aside>
    </>
  );
}

export const DashboardSidebar: React.FC = () => {
  return (
    <Suspense fallback={<aside className="hidden md:flex md:w-64 border-r border-[var(--card-border)] bg-[var(--surface)] flex-col shrink-0 min-h-screen" />}>
      <DashboardSidebarContent />
    </Suspense>
  );
};
