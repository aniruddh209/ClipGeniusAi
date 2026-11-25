'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Scissors, 
  Film, 
  Settings, 
  Cpu, 
  Plus, 
  ChevronRight,
  DownloadCloud,
  Clock,
  Menu,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

export const DashboardSidebar: React.FC = () => {
  const pathname = usePathname();
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [currentTab, setCurrentTab] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      setCurrentTab(sp.get('tab'));
    }
  }, [pathname]);

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
        <div className="h-16 px-5 flex items-center justify-between border-b border-white/[0.08]">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-400 flex items-center justify-center shadow-lg shadow-blue-500/25 group-hover:scale-105 transition-all">
              <Scissors className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                ClipGenius <span className="text-blue-500 font-semibold">AI</span>
              </span>
              <span className="text-[10px] text-zinc-500 block -mt-0.5 tracking-wider uppercase font-medium">
                Studio Suite
              </span>
            </div>
          </Link>
          {/* Close button on mobile */}
          <button 
            type="button"
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Action Button */}
        <div className="p-4">
          <Link href="/dashboard/create">
            <button className="w-full h-10 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-xs tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 active:scale-[0.98] transition-all cursor-pointer">
              <Plus className="w-4 h-4" />
              <span>Create New Clips</span>
            </button>
          </Link>
        </div>

        {/* Main Navigation */}
        <div className="px-3 space-y-1">
          <div className="px-3 pb-2 pt-1 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
            Workspace
          </div>

          {navItems.map((item) => {
            const isHistoryItem = item.href.includes('tab=history');
            const isDownloaderItem = item.href === '/dashboard/downloader';
            
            let isActive = pathname === item.href;
            if (isHistoryItem) {
              isActive = pathname === '/dashboard/downloader' && currentTab === 'history';
            } else if (isDownloaderItem) {
              isActive = pathname === '/dashboard/downloader' && currentTab !== 'history';
            }

            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all group',
                  isActive
                    ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={cn(
                      'w-4 h-4 transition-colors',
                      isActive ? 'text-blue-400' : 'text-zinc-500 group-hover:text-zinc-300'
                    )}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={cn(
                      'px-1.5 py-0.5 text-[10px] rounded-md font-semibold',
                      isActive
                        ? 'bg-blue-500/20 text-blue-300'
                        : 'bg-zinc-800 text-zinc-400'
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

      <div>
        {/* Engine Status Card */}
        <div className="p-4 m-3 rounded-2xl bg-[#0c0c0c] border border-white/[0.08] space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-300 font-medium flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              Local AI Engine
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Ready
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] text-zinc-400">
              <span>Whisper + PyScene</span>
              <span className="text-zinc-300">Offline / Free</span>
            </div>
            <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full w-full rounded-full" />
            </div>
          </div>

          <div className="pt-1 flex items-center justify-between text-[10px] text-zinc-500 border-t border-white/[0.06]">
            <span>Plan: Community OSS</span>
            <span className="text-blue-400 font-medium">No API Quota</span>
          </div>
        </div>

        {/* User Mini Profile */}
        <div className="p-3 border-t border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 p-[1px]">
              <img
                src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80"
                alt="User"
                className="w-full h-full rounded-full object-cover"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-zinc-200">Creator Studio</span>
              <span className="text-[10px] text-zinc-500">Free Tier User</span>
            </div>
          </div>
          <Link href="/dashboard/settings" className="text-zinc-500 hover:text-zinc-300 p-1 rounded-lg">
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Sticky Top Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-[#000000]/95 backdrop-blur-md border-b border-white/[0.08] px-4 flex items-center justify-between z-40">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-sky-400 flex items-center justify-center shadow-md shadow-blue-500/25">
            <Scissors className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-sm tracking-tight text-white">
            ClipGenius <span className="text-blue-500">AI</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-xl text-zinc-300 hover:text-white bg-zinc-900 border border-white/[0.08]"
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
            className="fixed inset-0 bg-black/85 backdrop-blur-sm transition-opacity" 
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer Menu */}
          <div className="relative w-72 max-w-[85vw] bg-[#050505] border-r border-white/[0.08] h-full z-10 flex flex-col shadow-2xl">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop Permanent Studio Sidebar */}
      <aside className="hidden md:flex md:w-64 border-r border-white/[0.08] bg-[#050505] flex-col shrink-0 min-h-screen">
        {sidebarContent}
      </aside>
    </>
  );
};
