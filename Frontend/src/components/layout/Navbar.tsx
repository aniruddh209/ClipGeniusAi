'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Scissors, Sparkles, Video, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export const Navbar: React.FC = () => {
  const pathname = usePathname();

  // Do not render marketing navbar on studio dashboard pages
  if (pathname?.startsWith('/dashboard')) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.08] bg-[#09090b]/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-500/20 group-hover:scale-105 transition-transform">
            <Scissors className="w-4 h-4 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              ClipGenius <span className="text-purple-400 font-semibold">AI</span>
            </span>
            <span className="text-[10px] text-zinc-500 font-medium tracking-widest uppercase -mt-0.5">
              Open-Source Video Studio
            </span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-xs font-medium text-zinc-400">
          <a href="#how-it-works" className="hover:text-white transition-colors">
            How It Works
          </a>
          <a href="#features" className="hover:text-white transition-colors">
            Features
          </a>
          <a href="#pricing" className="hover:text-white transition-colors">
            Pricing
          </a>
          <Link href="/dashboard" className="hover:text-white transition-colors flex items-center gap-1.5">
            <Video className="w-3.5 h-3.5 text-purple-400" />
            Dashboard
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button size="sm" variant="primary" className="rounded-xl px-4 text-xs">
              Open Studio <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
};
