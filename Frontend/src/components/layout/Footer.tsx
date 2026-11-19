'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Scissors, Heart } from 'lucide-react';
import Link from 'next/link';

export const Footer: React.FC = () => {
  const pathname = usePathname();

  // Hide footer on dashboard pages to maximize workspace height
  if (pathname?.startsWith('/dashboard')) {
    return null;
  }

  return (
    <footer className="border-t border-white/[0.08] bg-[#09090b] py-14 text-zinc-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pb-12 border-b border-white/[0.06]">
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-blue-500 flex items-center justify-center text-white">
                <Scissors className="w-4 h-4" />
              </div>
              <span className="font-bold text-white text-base">ClipGenius AI</span>
            </div>
            <p className="text-sm text-zinc-400 max-w-sm leading-relaxed">
              Professional, open-source AI video clipping SaaS. Automatically turns long podcasts and videos into high-engagement shorts and reels without recurring API bills.
            </p>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">Faster-Whisper</span>
              <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">PySceneDetect</span>
              <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">OpenCV Face Tracker</span>
            </div>
          </div>

          <div>
            <h5 className="text-xs font-semibold text-white uppercase tracking-wider mb-4">Product</h5>
            <ul className="space-y-2.5 text-xs text-zinc-400">
              <li><Link href="/dashboard" className="hover:text-purple-400 transition-colors">Studio Dashboard</Link></li>
              <li><Link href="/dashboard/create" className="hover:text-purple-400 transition-colors">Clip Generator</Link></li>
              <li><Link href="/dashboard/projects" className="hover:text-purple-400 transition-colors">My Projects</Link></li>
              <li><a href="#features" className="hover:text-purple-400 transition-colors">Features</a></li>
              <li><a href="#pricing" className="hover:text-purple-400 transition-colors">Open-Source Pricing</a></li>
            </ul>
          </div>

          <div>
            <h5 className="text-xs font-semibold text-white uppercase tracking-wider mb-4">Developers</h5>
            <ul className="space-y-2.5 text-xs text-zinc-400">
              <li><a href="http://localhost:8001/docs" target="_blank" rel="noreferrer" className="hover:text-purple-400 transition-colors">FastAPI Swagger API</a></li>
              <li><a href="http://localhost:8001/api/v1/health" target="_blank" rel="noreferrer" className="hover:text-purple-400 transition-colors">System Health Ping</a></li>
              <li><a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-purple-400 transition-colors">GitHub Repository</a></li>
              <li><a href="#how-it-works" className="hover:text-purple-400 transition-colors">Architecture Overview</a></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <div>
            © 2026 ClipGenius AI. Released under MIT Open-Source License.
          </div>
          <div className="flex items-center gap-6">
            <span>YouTube Shorts</span>
            <span>Instagram Reels</span>
            <span>TikTok</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
