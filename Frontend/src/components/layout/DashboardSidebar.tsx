'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Scissors, 
  Film, 
  Settings, 
  Sparkles, 
  Cpu, 
  HardDrive, 
  Plus, 
  ExternalLink,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';

export const DashboardSidebar: React.FC = () => {
  const pathname = usePathname();
  const [projectCount, setProjectCount] = useState<number | null>(null);

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
  }, []);

  const navItems = [
    {
      label: 'Overview',
      href: '/dashboard',
      icon: LayoutDashboard,
      badge: undefined,
    },
    {
      label: 'Create Clips',
      href: '/dashboard/create',
      icon: Scissors,
      badge: 'AI',
    },
    {
      label: 'My Projects',
      href: '/dashboard/projects',
      icon: Film,
      badge: projectCount !== null ? projectCount.toString() : undefined,
    },
    {
      label: 'Settings',
      href: '/dashboard/settings',
      icon: Settings,
      badge: undefined,
    },
  ];

  return (
    <aside className="w-64 border-r border-white/[0.08] bg-[#0c0c11] flex flex-col shrink-0 min-h-screen">
      {/* Brand Header */}
      <div className="h-16 px-5 flex items-center justify-between border-b border-white/[0.06]">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-600/30 group-hover:scale-105 transition-all">
            <Scissors className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
              ClipGenius <span className="text-purple-400 font-semibold">AI</span>
            </span>
            <span className="text-[10px] text-zinc-500 block -mt-0.5 tracking-wider uppercase font-medium">
              Studio Suite
            </span>
          </div>
        </Link>
      </div>

      {/* Quick Action Button */}
      <div className="p-4">
        <Link href="/dashboard/create">
          <button className="w-full h-10 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium text-xs tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-purple-600/20 active:scale-[0.98] transition-all cursor-pointer">
            <Plus className="w-4 h-4" />
            <span>Create New Clips</span>
          </button>
        </Link>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 px-3 space-y-1">
        <div className="px-3 pb-2 pt-1 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
          Workspace
        </div>

        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all group',
                isActive
                  ? 'bg-purple-600/10 text-purple-300 border border-purple-500/25 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]'
              )}
            >
              <div className="flex items-center gap-2.5">
                <Icon
                  className={cn(
                    'w-4 h-4 transition-colors',
                    isActive ? 'text-purple-400' : 'text-zinc-500 group-hover:text-zinc-300'
                  )}
                />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={cn(
                    'px-1.5 py-0.5 text-[10px] rounded-md font-semibold',
                    isActive
                      ? 'bg-purple-500/20 text-purple-300'
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

      {/* Engine Status Card */}
      <div className="p-4 m-3 rounded-2xl bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/[0.06] space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-400 font-medium flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
            Local AI Engine
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Ready
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] text-zinc-500">
            <span>Whisper + PyScene</span>
            <span className="text-zinc-400">Offline / Free</span>
          </div>
          <div className="w-full bg-zinc-800/80 rounded-full h-1.5 overflow-hidden">
            <div className="bg-gradient-to-r from-purple-500 to-blue-500 h-full w-full rounded-full" />
          </div>
        </div>

        <div className="pt-1 flex items-center justify-between text-[10px] text-zinc-500 border-t border-white/[0.05]">
          <span>Plan: Community OSS</span>
          <span className="text-purple-400 font-medium">No API Quota</span>
        </div>
      </div>

      {/* User Mini Profile */}
      <div className="p-3 border-t border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 p-[1px]">
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
    </aside>
  );
};
