'use client';

import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  User, 
  Sliders, 
  Download, 
  Cpu, 
  Bell, 
  ShieldCheck, 
  Check, 
  Save, 
  HardDrive,
  Sparkles,
  Subtitles,
  Smartphone,
  Trash2
} from 'lucide-react';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DEFAULT_USER_PREFERENCES } from '@/lib/mockData';
import { api } from '@/lib/api';
import { StorageSummaryResponse } from '@/types';

export default function SettingsPage() {
  const [tab, setTab] = useState<'profile' | 'preferences' | 'export'>('profile');
  const [savedAlert, setSavedAlert] = useState(false);
  const [storage, setStorage] = useState<StorageSummaryResponse | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);

  useEffect(() => {
    api.getStorageSummary().then(setStorage).catch(() => null);
  }, []);

  const handleCleanStorage = async () => {
    setIsCleaning(true);
    try {
      await api.cleanupStorage();
      const updated = await api.getStorageSummary();
      setStorage(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setIsCleaning(false);
    }
  };

  // Form states
  const [name, setName] = useState(DEFAULT_USER_PREFERENCES.name);
  const [email, setEmail] = useState(DEFAULT_USER_PREFERENCES.email);
  const [whisperModel, setWhisperModel] = useState(DEFAULT_USER_PREFERENCES.whisperModel);
  const [autoFaceTracking, setAutoFaceTracking] = useState(DEFAULT_USER_PREFERENCES.autoFaceTracking);
  const [defaultResolution, setDefaultResolution] = useState(DEFAULT_USER_PREFERENCES.defaultResolution);
  const [defaultAspectRatio, setDefaultAspectRatio] = useState(DEFAULT_USER_PREFERENCES.defaultAspectRatio);
  const [subtitleColor, setSubtitleColor] = useState('#FFDD00');
  const [fps, setFps] = useState('30');
  const [fileNamePattern, setFileNamePattern] = useState('{title}_clip_{index}_{virality}');

  const handleSave = () => {
    setSavedAlert(true);
    setTimeout(() => setSavedAlert(false), 2500);
  };

  return (
    <div className="flex-1 pb-20">
      <DashboardHeader
        title="Settings & Preferences"
        subtitle="Manage your profile, default AI transcription models, and export configurations."
      />

      <div className="px-6 sm:px-8 pt-8 max-w-5xl mx-auto space-y-6">
        {/* Saved Feedback Alert */}
        {savedAlert && (
          <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>Settings and preferences saved successfully!</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex p-1 rounded-xl bg-[#090e1a] border border-white/[0.06] w-fit">
          {[
            { id: 'profile', label: 'User Profile', icon: User },
            { id: 'preferences', label: 'AI Engine & Pipeline', icon: Cpu },
            { id: 'export', label: 'Export Defaults', icon: Download },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id as any)}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                  tab === item.id
                    ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* 1. USER PROFILE TAB */}
        {tab === 'profile' && (
          <Card className="border-white/[0.08] bg-[#090e1a] p-6 space-y-6">
            <div className="flex items-center gap-4 pb-6 border-b border-white/[0.06]">
              <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gradient-to-tr from-blue-500 to-blue-500 p-[2px]">
                <img
                  src={DEFAULT_USER_PREFERENCES.avatarUrl}
                  alt="Avatar"
                  className="w-full h-full object-cover rounded-2xl"
                />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">{name}</h3>
                <p className="text-xs text-zinc-400">{email}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="blue">Community OSS Free</Badge>
                  <span className="text-[11px] text-zinc-500">Self-Hosted Engine</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Display Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/[0.08] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/[0.08] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Current Storage Meter */}
            <div className="p-4 rounded-2xl bg-zinc-950/60 border border-white/[0.06] space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <span className="text-zinc-400 font-medium flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-blue-400" />
                  Local Scratch Storage
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-300 font-mono font-bold">
                    {storage ? `${storage.total_storage_mb} MB / 50 GB Used` : 'Calculating...'}
                  </span>
                  <button
                    type="button"
                    onClick={handleCleanStorage}
                    disabled={isCleaning}
                    className="text-[10px] px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                  >
                    {isCleaning ? 'Cleaning...' : 'Clean Cache'}
                  </button>
                </div>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-blue-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(1, ((storage?.total_storage_mb || 10) / (50 * 1024)) * 100))}%` }}
                />
              </div>
              <p className="text-[10px] text-zinc-500">
                Videos and generated clips are stored locally inside `backend/uploads/` and `backend/generated-clips/`.
              </p>
            </div>
          </Card>
        )}

        {/* 2. PREFERENCES (AI ENGINE & PIPELINE) TAB */}
        {tab === 'preferences' && (
          <Card className="border-white/[0.08] bg-[#090e1a] p-6 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-400" />
                AI Transcription Engine (Faster-Whisper)
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Select the local Faster-Whisper model size. Higher models offer greater accuracy but require slightly more RAM.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { id: 'tiny', name: 'Tiny', vram: '~500MB RAM', speed: 'Ultra Fast' },
                { id: 'base', name: 'Base (Default)', vram: '~1GB RAM', speed: 'Recommended' },
                { id: 'small', name: 'Small', vram: '~2GB RAM', speed: 'High Accuracy' },
                { id: 'medium', name: 'Medium', vram: '~5GB RAM', speed: 'Maximum Accuracy' },
              ].map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => setWhisperModel(model.id as any)}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                    whisperModel === model.id
                      ? 'border-blue-500 bg-blue-950/30'
                      : 'border-white/[0.06] bg-zinc-950/60 hover:border-zinc-700'
                  }`}
                >
                  <span className="text-xs font-bold text-white block">{model.name}</span>
                  <span className="text-[10px] text-blue-400 block mt-1 font-semibold">{model.speed}</span>
                  <span className="text-[10px] text-zinc-500 block">{model.vram}</span>
                </button>
              ))}
            </div>

            {/* OpenCV Face Centering Toggle */}
            <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white block">Auto Speaker Face Tracking</span>
                <span className="text-xs text-zinc-400">
                  Dynamically centers the active speaker during 9:16 vertical crop with OpenCV
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAutoFaceTracking(!autoFaceTracking)}
                className={`w-11 h-6 rounded-full transition-colors p-1 cursor-pointer ${
                  autoFaceTracking ? 'bg-blue-600' : 'bg-zinc-800'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    autoFaceTracking ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </Card>
        )}

        {/* 3. EXPORT SETTINGS TAB */}
        {tab === 'export' && (
          <Card className="border-white/[0.08] bg-[#090e1a] p-6 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Download className="w-4 h-4 text-blue-400" />
                Default Video & Subtitle Export Settings
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                These defaults will automatically apply to newly generated clips.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Default Aspect Ratio
                </label>
                <select
                  value={defaultAspectRatio}
                  onChange={(e) => setDefaultAspectRatio(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-white/[0.08] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="9:16">9:16 Vertical (Shorts/Reels/TikTok)</option>
                  <option value="1:1">1:1 Square (Feed)</option>
                  <option value="4:5">4:5 Portrait</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Default Resolution
                </label>
                <select
                  value={defaultResolution}
                  onChange={(e) => setDefaultResolution(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-white/[0.08] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="1080p">1080x1920 (Full HD)</option>
                  <option value="4K">2160x3840 (4K Ultra HD)</option>
                  <option value="720p">720x1280 (Fast Draft)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Frame Rate (FPS)
                </label>
                <select
                  value={fps}
                  onChange={(e) => setFps(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/[0.08] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="30">30 FPS (Standard)</option>
                  <option value="60">60 FPS (High Smoothness)</option>
                </select>
              </div>
            </div>

            {/* Subtitle Accent Color */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block">
                Active Word Highlight Color
              </label>
              <div className="flex items-center gap-3">
                {[
                  { name: 'Vibrant Yellow', hex: '#FFDD00' },
                  { name: 'Electric Green', hex: '#22c55e' },
                  { name: 'Neon Cyan', hex: '#06b6d4' },
                  { name: 'Hot Pink', hex: '#ec4899' },
                  { name: 'Clean White', hex: '#ffffff' },
                ].map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setSubtitleColor(c.hex)}
                    style={{ backgroundColor: c.hex }}
                    className={`w-7 h-7 rounded-full border-2 transition-all cursor-pointer ${
                      subtitleColor === c.hex
                        ? 'border-white scale-110 shadow-lg'
                        : 'border-transparent opacity-80 hover:opacity-100'
                    }`}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            {/* Naming Pattern */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Export File Naming Template
              </label>
              <input
                type="text"
                value={fileNamePattern}
                onChange={(e) => setFileNamePattern(e.target.value)}
                className="w-full bg-zinc-950 border border-white/[0.08] rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
              />
              <p className="text-[10px] text-zinc-500">
                Variables: &#123;title&#125;, &#123;index&#125;, &#123;virality&#125;, &#123;date&#125;
              </p>
            </div>
          </Card>
        )}

        {/* Save Bar */}
        <div className="flex justify-end gap-3 pt-4 border-t border-white/[0.06]">
          <Button
            onClick={handleSave}
            variant="primary"
            size="md"
            className="rounded-xl px-6 text-xs shadow-lg shadow-blue-600/20"
          >
            <Save className="w-3.5 h-3.5 mr-1.5" /> Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
