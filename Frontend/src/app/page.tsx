'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Sparkles, 
  Scissors, 
  Zap, 
  Cpu, 
  Eye, 
  Flame, 
  ArrowRight, 
  Play, 
  Subtitles,
  Smartphone,
  CheckCircle2,
  Check,
  ShieldCheck,
  Layers,
  Video,
  Clock,
  Download,
  Share2,
  Sliders,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function HomePage() {
  return (
    <div className="relative overflow-hidden bg-[#000000]">
      {/* Background Glow Mesh */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[680px] overflow-hidden -z-10 pointer-events-none opacity-40">
        <div className="absolute -top-32 left-1/4 w-[550px] h-[550px] bg-blue-600/30 rounded-full blur-[150px]" />
        <div className="absolute -top-32 right-1/4 w-[500px] h-[500px] bg-blue-600/25 rounded-full blur-[150px]" />
        <div className="absolute top-48 left-1/3 w-[650px] h-[320px] bg-indigo-600/20 rounded-full blur-[180px]" />
      </div>

      {/* 1. HERO SECTION */}
      <section className="pt-20 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-blue-500/30 bg-blue-950/40 backdrop-blur-md mb-8">
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs font-semibold text-blue-300">
            Open-Source AI Video Studio • Zero Paid API Keys
          </span>
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-5xl mx-auto leading-[1.08]">
          Turn Long Videos Into <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-sky-400 bg-clip-text text-transparent">
            Viral Shorts With AI.
          </span>
        </h1>

        <p className="mt-6 text-base sm:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          ClipGenius AI autonomously extracts high-engagement hooks, tracks speaker faces for 9:16 vertical crop, 
          generates dynamic karaoke subtitles, and scores virality using open-source models.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/dashboard/create">
            <Button size="lg" variant="primary" className="rounded-xl px-8 text-sm shadow-xl shadow-blue-600/30">
              Get Started Free <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button size="lg" variant="secondary" className="rounded-xl px-7 text-sm">
              <Play className="w-4 h-4 mr-2 text-blue-400" /> Live Demo Studio
            </Button>
          </Link>
        </div>

        {/* Hero Visual Mockup */}
        <div className="mt-16 max-w-5xl mx-auto rounded-3xl p-1 bg-gradient-to-b from-white/[0.12] via-white/[0.04] to-transparent shadow-2xl shadow-blue-950/40">
          <div className="rounded-[22px] bg-[#0a0a0a] border border-white/[0.06] p-4 sm:p-6 overflow-hidden">
            {/* Mockup Topbar */}
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] text-xs text-zinc-500">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                <span className="ml-3 font-mono text-zinc-400">clipgenius-ai/studio/huberman-podcast.mp4</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="blue" className="text-[10px] py-0.5">Faster-Whisper int8</Badge>
                <Badge variant="success" className="text-[10px] py-0.5">PySceneDetect Active</Badge>
              </div>
            </div>

            {/* Mockup Interactive Body */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-6 text-left">
              {/* Left: Input Long Video */}
              <div className="md:col-span-5 space-y-4">
                <div className="relative rounded-2xl overflow-hidden aspect-video bg-zinc-900 border border-white/[0.08]">
                  <img
                    src="https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=800&auto=format&fit=crop&q=80"
                    alt="Source podcast"
                    className="w-full h-full object-cover opacity-80"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-4">
                    <span className="text-xs font-semibold text-white">Source: 1h 14m Landscape Video (16:9)</span>
                    <span className="text-[11px] text-zinc-400">Detected 8 high-energy hook moments</span>
                  </div>
                  {/* Speaker Face Bounding Box simulation */}
                  <div className="absolute top-1/4 left-1/3 w-24 h-24 border-2 border-blue-400/80 rounded-lg pointer-events-none flex items-start justify-end p-1">
                    <span className="text-[9px] bg-blue-500 text-white font-mono px-1 rounded">face 98%</span>
                  </div>
                </div>

                {/* Simulated Audio Waveform & Speech Hooks */}
                <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400 font-medium">Hook Detection Timeline</span>
                    <span className="text-blue-400 font-mono text-[11px]">00:14:22</span>
                  </div>
                  {/* Waveform Bars */}
                  <div className="flex items-end gap-1 h-8 px-1">
                    {[40, 25, 60, 85, 95, 70, 45, 80, 100, 65, 30, 75, 90, 85, 50, 70, 95, 40, 60, 80, 55, 90, 100, 75, 40, 30, 85, 90, 60, 40].map((h, i) => (
                      <div
                        key={i}
                        style={{ height: `${h}%` }}
                        className={`flex-1 rounded-full ${
                          i >= 12 && i <= 22 ? 'bg-gradient-to-t from-blue-500 to-sky-400' : 'bg-zinc-800'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="text-[10px] text-zinc-500 flex justify-between">
                    <span>Opening</span>
                    <span className="text-pink-400 font-semibold">★ Viral Hook Moment (Virality: 97.4%)</span>
                    <span>1:14:00</span>
                  </div>
                </div>
              </div>

              {/* Right: 3 Generated 9:16 Vertical Shorts */}
              <div className="md:col-span-7 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Generated 9:16 Shorts (Ready for YouTube & TikTok)
                  </span>
                  <span className="text-xs text-blue-400 font-medium">3 of 8 shown</span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    {
                      title: "Why 95% of Startups Fail",
                      score: 97,
                      hook: "If you don't do this in 30 days...",
                      img: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=400&auto=format&fit=crop&q=80",
                    },
                    {
                      title: "The 3-Second Hook Rule",
                      score: 95,
                      hook: "Stop greeting your audience!",
                      img: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80",
                    },
                    {
                      title: "AI Swarm Automation",
                      score: 91,
                      hook: "5 agents replaced 1 team...",
                      img: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=400&auto=format&fit=crop&q=80",
                    },
                  ].map((clip, idx) => (
                    <div
                      key={idx}
                      className="group relative rounded-2xl overflow-hidden aspect-[9/16] bg-zinc-900 border border-white/[0.08] flex flex-col justify-between p-2.5 shadow-lg"
                    >
                      <img
                        src={clip.img}
                        alt={clip.title}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-70"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/60" />

                      {/* Top Badges */}
                      <div className="relative z-10 flex items-center justify-between">
                        <span className="px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[9px] font-mono text-zinc-300">
                          9:16
                        </span>
                        <span className="px-1.5 py-0.5 rounded-md bg-blue-500/90 text-white text-[9px] font-bold flex items-center gap-0.5 shadow">
                          <Flame className="w-2.5 h-2.5 fill-current" />
                          {clip.score}%
                        </span>
                      </div>

                      {/* Centered Dynamic Captions Mockup */}
                      <div className="relative z-10 text-center px-1">
                        <span className="inline-block bg-black/80 px-2 py-1 rounded text-[10px] font-extrabold uppercase tracking-tight text-white shadow-lg border border-white/10">
                          <span className="text-[#FFDD00]">STOP</span> GREETING AUDIENCE
                        </span>
                      </div>

                      {/* Bottom Info */}
                      <div className="relative z-10 space-y-1">
                        <p className="text-[10px] font-bold text-white line-clamp-1">{clip.title}</p>
                        <div className="flex items-center justify-between text-[8px] text-zinc-400">
                          <span>38s</span>
                          <span className="text-emerald-400">1080p MP4</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. HOW IT WORKS SECTION */}
      <section id="how-it-works" className="py-24 border-t border-white/[0.08] bg-[#050505]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge variant="blue" className="mb-3">
              Automated 4-Step Pipeline
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              How ClipGenius AI Works
            </h2>
            <p className="text-zinc-400 mt-3 text-sm sm:text-base">
              From raw footage to published shorts in minutes, completely automated and open-source.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              {
                step: "01",
                title: "Upload or Paste URL",
                desc: "Drop your video file (MP4, MOV, MKV) or paste a YouTube / podcast link. Ingested via yt-dlp.",
                icon: Video,
              },
              {
                step: "02",
                title: "AI Speech & Hook Analysis",
                desc: "Faster-Whisper extracts word timestamps. NLP models score hooks, sentence energy, and speech pacing.",
                icon: Cpu,
              },
              {
                step: "03",
                title: "Smart 9:16 Face Re-Framing",
                desc: "OpenCV tracks the speaker's face to center them, while PySceneDetect keeps cuts aligned with natural scene shifts.",
                icon: Eye,
              },
              {
                step: "04",
                title: "Captions & Export",
                desc: "FFmpeg burns dynamic animated karaoke subtitles and exports high-definition 1080x1920 vertical MP4 clips.",
                icon: Download,
              },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <div
                  key={idx}
                  className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-blue-500/30 transition-all group"
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-2xl font-black text-zinc-700 group-hover:text-blue-400 transition-colors">
                      {item.step}
                    </span>
                    <div className="w-10 h-10 rounded-xl bg-blue-950/40 border border-blue-800/40 text-blue-400 flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-base font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. FEATURES SECTION */}
      <section id="features" className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <Badge variant="blue" className="mb-3">
            Engine Capabilities
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
            Built for Serious Content Creators
          </h2>
          <p className="text-zinc-400 mt-3 text-sm sm:text-base">
            Every feature is designed to maximize retention on YouTube Shorts, Instagram Reels, and TikTok.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="hover:border-blue-500/40 transition-all">
            <div className="w-11 h-11 rounded-xl bg-blue-950/60 border border-blue-800/50 text-blue-400 flex items-center justify-center mb-4">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Faster-Whisper int8 Engine</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Provides millisecond-precise word timestamps locally on CPU or GPU without calling third-party APIs.
            </p>
          </Card>

          <Card className="hover:border-blue-500/40 transition-all">
            <div className="w-11 h-11 rounded-xl bg-blue-950/60 border border-blue-800/50 text-blue-400 flex items-center justify-center mb-4">
              <Eye className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Automated Speaker Centering</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              OpenCV scans video frames for the active speaker and calculates the horizontal crop window so faces are never cut off.
            </p>
          </Card>

          <Card className="hover:border-pink-500/40 transition-all">
            <div className="w-11 h-11 rounded-xl bg-pink-950/60 border border-pink-800/50 text-pink-400 flex items-center justify-center mb-4">
              <Flame className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Algorithmic Virality Score</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Ranks each potential clip candidate (0-100%) based on curiosity hooks, pacing (words per second), and emotional keywords.
            </p>
          </Card>

          <Card className="hover:border-amber-500/40 transition-all">
            <div className="w-11 h-11 rounded-xl bg-amber-950/60 border border-amber-800/50 text-amber-400 flex items-center justify-center mb-4">
              <Subtitles className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Dynamic Styled Captions</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Burn animated karaoke subtitles with highlighted active words directly into the MP4 stream with custom fonts & colors.
            </p>
          </Card>

          <Card className="hover:border-emerald-500/40 transition-all">
            <div className="w-11 h-11 rounded-xl bg-emerald-950/60 border border-emerald-800/50 text-emerald-400 flex items-center justify-center mb-4">
              <Scissors className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Scene-Aware Cutting</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              PySceneDetect ensures clip starts and ends snap to visual cut points, avoiding awkward mid-sentence visual transitions.
            </p>
          </Card>

          <Card className="hover:border-cyan-500/40 transition-all">
            <div className="w-11 h-11 rounded-xl bg-cyan-950/60 border border-cyan-800/50 text-cyan-400 flex items-center justify-center mb-4">
              <Sliders className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Flexible Aspect Ratios</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Export in 9:16 vertical (Shorts/Reels/TikTok), 1:1 square (LinkedIn/Instagram feed), or 4:5 portrait with clean borders.
            </p>
          </Card>
        </div>
      </section>

      {/* 4. PRICING SECTION */}
      <section id="pricing" className="py-24 border-t border-white/[0.08] bg-[#050505]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge variant="blue" className="mb-3">
              Simple & Transparent
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              Self-Host Free or Scale With Cloud
            </h2>
            <p className="text-zinc-400 mt-3 text-sm sm:text-base">
              ClipGenius AI gives you a 100% free open-source plan with no artificial limits or required API keys.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto items-stretch">
            {/* Plan 1: Free Community Plan */}
            <div className="rounded-3xl p-8 bg-zinc-900/60 border border-blue-500/40 flex flex-col justify-between relative shadow-2xl shadow-blue-950/20">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="px-3 py-1 rounded-full bg-blue-600 text-[10px] font-bold text-white tracking-wider uppercase shadow">
                  Most Popular • 100% Free
                </span>
              </div>

              <div>
                <h3 className="text-lg font-bold text-white">Community OSS</h3>
                <p className="text-xs text-zinc-400 mt-1">For creators & developers self-hosting locally</p>

                <div className="mt-6 mb-6">
                  <span className="text-4xl font-extrabold text-white">$0</span>
                  <span className="text-xs text-zinc-500 ml-2">/ forever free</span>
                </div>

                <ul className="space-y-3 text-xs text-zinc-300">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>Unlimited video clipping & exports</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>Local Faster-Whisper transcription</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>PySceneDetect + OpenCV face centering</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>1080p 9:16 vertical MP4 output</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>Zero paid third-party API keys required</span>
                  </li>
                </ul>
              </div>

              <div className="pt-8">
                <Link href="/dashboard/create">
                  <Button variant="primary" className="w-full rounded-xl py-3 text-xs">
                    Get Started Free
                  </Button>
                </Link>
              </div>
            </div>

            {/* Plan 2: Creator Pro (SaaS showcase) */}
            <div className="rounded-3xl p-8 bg-white/[0.02] border border-white/[0.08] flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Creator Cloud</h3>
                <p className="text-xs text-zinc-400 mt-1">Managed GPU cloud processing for fast turnaround</p>

                <div className="mt-6 mb-6">
                  <span className="text-4xl font-extrabold text-white">$29</span>
                  <span className="text-xs text-zinc-500 ml-2">/ month</span>
                </div>

                <ul className="space-y-3 text-xs text-zinc-300">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>Everything in Community OSS</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>NVIDIA A10G Cloud GPU acceleration (10x faster)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>Multi-language auto-translation (90+ languages)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>Direct publishing to YouTube & TikTok</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>Cloud backup & 100GB storage</span>
                  </li>
                </ul>
              </div>

              <div className="pt-8">
                <Button variant="secondary" className="w-full rounded-xl py-3 text-xs">
                  Start 14-Day Trial
                </Button>
              </div>
            </div>

            {/* Plan 3: Studio / Agency */}
            <div className="rounded-3xl p-8 bg-white/[0.02] border border-white/[0.08] flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Agency & Team</h3>
                <p className="text-xs text-zinc-400 mt-1">For podcast networks & high-volume media agencies</p>

                <div className="mt-6 mb-6">
                  <span className="text-4xl font-extrabold text-white">$79</span>
                  <span className="text-xs text-zinc-500 ml-2">/ month</span>
                </div>

                <ul className="space-y-3 text-xs text-zinc-300">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>Everything in Creator Cloud</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>Unlimited team seats & shared workspaces</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>Custom brand caption typography & intro templates</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>Dedicated priority worker nodes</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>Custom Webhook & Zapier integrations</span>
                  </li>
                </ul>
              </div>

              <div className="pt-8">
                <Button variant="outline" className="w-full rounded-xl py-3 text-xs">
                  Contact Sales
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. CTA SECTION */}
      <section className="py-20 max-w-5xl mx-auto px-4 text-center">
        <div className="rounded-3xl p-10 bg-gradient-to-r from-blue-950/60 via-indigo-950/40 to-slate-950/60 border border-blue-500/30 shadow-2xl space-y-6">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
            Ready to Multiply Your Video Reach?
          </h2>
          <p className="text-zinc-400 text-sm max-w-xl mx-auto">
            Stop manually scrubbing hours of timeline footage in Premiere or DaVinci. Let open-source AI find your best moments.
          </p>
          <div className="pt-2">
            <Link href="/dashboard/create">
              <Button size="lg" variant="primary" className="rounded-xl px-8 shadow-xl shadow-blue-600/30">
                Launch ClipGenius Studio <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
