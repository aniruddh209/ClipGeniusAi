'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { SystemHealth } from '@/types';
import { Activity, Database, Video, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

export const SystemStatusIndicator: React.FC = () => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.checkHealth();
      setHealth(data);
    } catch (err: any) {
      setError(err.message || 'Cannot reach FastAPI backend');
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div
              className={`w-3 h-3 rounded-full ${
                health?.status === 'healthy' ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            />
            {health?.status === 'healthy' && (
              <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-500 animate-ping opacity-75" />
            )}
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              System Pipeline Status
            </h4>
            <p className="text-sm font-medium text-white">
              {loading && !health
                ? 'Connecting to ClipGenius Backend...'
                : health?.status === 'healthy'
                ? 'Backend & Processing Engine Active'
                : 'Backend Disconnected (Check API connection)'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {health && (
            <>
              <Badge variant="blue" className="flex items-center gap-1.5 py-1">
                <Database className="w-3.5 h-3.5" />
                MongoDB: {health.database}
              </Badge>

              <Badge
                variant={health.ffmpeg_available ? 'success' : 'warning'}
                className="flex items-center gap-1.5 py-1"
              >
                <Video className="w-3.5 h-3.5" />
                FFmpeg: {health.ffmpeg_available ? 'Installed' : 'Missing'}
              </Badge>

              <Badge variant="default" className="py-1">
                v{health.version}
              </Badge>
            </>
          )}

          <button
            onClick={fetchHealth}
            disabled={loading}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
            title="Refresh status"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-950/40 border border-rose-800/50 p-2.5 text-xs text-rose-300">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>Backend connection warning: {error}. Check API server URL and status.</span>
        </div>
      )}
    </div>
  );
};
