'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Cookie,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  UploadCloud,
  FileText,
  Trash2,
  ExternalLink,
  Loader2,
  Key,
  Info
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';

interface YouTubeAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const YouTubeAuthModal: React.FC<YouTubeAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [cookieStatus, setCookieStatus] = useState<{
    configured: boolean;
    size_bytes: number;
    message: string;
  } | null>(null);

  const [cookiesText, setCookiesText] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      loadStatus();
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  const loadStatus = async () => {
    try {
      const st = await api.getYouTubeCookieStatus();
      setCookieStatus(st);
    } catch {
      // ignore
    }
  };

  if (!isOpen) return null;

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        setCookiesText(content);
        setErrorMsg(null);
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleSaveCookies = async () => {
    if (!cookiesText.trim()) {
      setErrorMsg('Please paste cookies or upload a cookies.txt file.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await api.saveYouTubeCookies(cookiesText);
      setSuccessMsg(res.message || 'YouTube cookies successfully saved!');
      setCookiesText('');
      await loadStatus();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save cookies. Ensure it is a valid Netscape cookie file.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearCookies = async () => {
    if (!confirm('Are you sure you want to remove saved YouTube cookies?')) return;
    setIsClearing(true);
    setErrorMsg(null);
    try {
      await api.clearYouTubeCookies();
      setCookieStatus({ configured: false, size_bytes: 0, message: 'Cookies cleared' });
      setSuccessMsg('Cookies removed successfully.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to clear cookies');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl bg-[#0F1410] border border-[#232F24] shadow-2xl p-6 text-zinc-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#232F24]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#A3E635]/15 border border-[#A3E635]/30 flex items-center justify-center text-[#A3E635]">
              <Cookie className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                YouTube Cloud Authentication
                {cookieStatus?.configured ? (
                  <Badge variant="success" className="text-[10px] bg-[#A3E635]/20 text-[#A3E635] border-[#A3E635]/30">
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-zinc-400 border-zinc-700">
                    Not Configured
                  </Badge>
                )}
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Authorize high-speed 4K/1080p cloud downloads & bypass bot verification
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Why this is needed notice */}
        <div className="mt-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 flex gap-3">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 leading-relaxed">
            <span className="font-semibold text-amber-300">Why are cookies needed for cloud deployment?</span>
            <p className="text-[11px] text-amber-200/80">
              YouTube blocks cloud datacenter IP addresses (AWS, Render, GCP) from downloading video streams anonymously. Providing your browser cookies lets the cloud server download directly using your normal access at 30–50+ MB/s without bot gates.
            </p>
          </div>
        </div>

        {/* 3-Step Guide */}
        <div className="mt-4 p-3.5 rounded-xl bg-[#141B15] border border-[#232F24] space-y-2">
          <span className="text-xs font-bold text-[#A3E635] uppercase tracking-wider flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5" /> Quick 3-Step Setup (Takes 30 seconds)
          </span>
          <ol className="text-xs space-y-2 text-zinc-300 list-decimal list-inside leading-relaxed">
            <li>
              Install the free extension{' '}
              <a 
                href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc" 
                target="_blank" 
                rel="noreferrer"
                className="text-[#A3E635] underline hover:text-[#bef264] inline-flex items-center gap-1 font-semibold"
              >
                Get cookies.txt LOCALLY <ExternalLink className="w-3 h-3" />
              </a>{' '}
              in Chrome or Firefox.
            </li>
            <li>
              Open <span className="text-white font-semibold">youtube.com</span> (logged into any personal or burner account).
            </li>
            <li>
              Click the extension icon, click <span className="text-[#A3E635] font-semibold">Copy All</span> or export <span className="font-mono text-zinc-200">cookies.txt</span>, and paste/upload below!
            </li>
          </ol>
        </div>

        {/* Drag & Drop Upload Zone */}
        <div className="mt-4 space-y-3">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors cursor-pointer ${
              dragActive 
                ? 'border-[#A3E635] bg-[#A3E635]/10' 
                : 'border-[#232F24] hover:border-[#A3E635]/40 bg-[#141B15]/50'
            }`}
            onClick={() => document.getElementById('cookie-file-input')?.click()}
          >
            <input
              id="cookie-file-input"
              type="file"
              accept=".txt"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
            />
            <UploadCloud className="w-6 h-6 mx-auto text-[#A3E635] mb-1.5" />
            <p className="text-xs font-semibold text-zinc-200">
              Drop your exported <span className="font-mono text-[#A3E635]">cookies.txt</span> here or click to browse
            </p>
            <p className="text-[10px] text-zinc-500 mt-0.5">Accepts standard Netscape HTTP cookie files</p>
          </div>

          {/* Paste Textarea */}
          <div>
            <label className="text-xs font-semibold text-zinc-300 mb-1 flex items-center justify-between">
              <span>Or paste cookies text directly:</span>
              {cookiesText.length > 0 && (
                <span className="text-[10px] text-zinc-500 font-mono">
                  {cookiesText.length.toLocaleString()} characters loaded
                </span>
              )}
            </label>
            <textarea
              rows={4}
              value={cookiesText}
              onChange={(e) => {
                setCookiesText(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="# Netscape HTTP Cookie File&#10;.youtube.com  TRUE  /  TRUE  1795847  LOGIN_INFO  ...&#10;.youtube.com  TRUE  /  TRUE  1795847  SID  ..."
              className="w-full px-3 py-2 rounded-xl bg-[#141B15] border border-[#232F24] text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#A3E635] resize-y"
            />
          </div>
        </div>

        {/* Messages */}
        {errorMsg && (
          <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-xs text-green-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Active Cookie Info */}
        {cookieStatus?.configured && (
          <div className="mt-3 p-3 rounded-xl bg-[#A3E635]/10 border border-[#A3E635]/20 text-xs text-zinc-300 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#A3E635] font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>Cookies Active ({Math.round((cookieStatus.size_bytes || 0) / 1024)} KB)</span>
            </div>
            <button
              onClick={handleClearCookies}
              disabled={isClearing}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors cursor-pointer"
            >
              {isClearing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              <span>Clear Cookies</span>
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex items-center justify-end gap-3 pt-4 border-t border-[#232F24]">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-xs h-9 px-4"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveCookies}
            disabled={isSaving || !cookiesText.trim()}
            className="bg-[#A3E635] hover:bg-[#bef264] text-[#080A08] font-black text-xs h-9 px-5 shadow-lg shadow-[#A3E635]/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving & Verifying...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Save & Authorize Downloads</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
