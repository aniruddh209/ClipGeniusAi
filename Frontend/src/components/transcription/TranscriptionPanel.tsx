'use client';

import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Sparkles, 
  Clock, 
  User, 
  Languages, 
  Search, 
  Copy, 
  Check, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  FileText, 
  ListFilter,
  Play,
  Volume2,
  ChevronDown,
  ChevronUp,
  Layers
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { TranscriptionResponse, TranscriptSegment, WordItem } from '@/types';
import { formatDuration } from '@/lib/utils';

interface TranscriptionPanelProps {
  videoId: string;
  videoTitle?: string;
  onTranscriptReady?: (transcript: TranscriptionResponse) => void;
  onSeekToTimestamp?: (seconds: number) => void;
}

export const TranscriptionPanel: React.FC<TranscriptionPanelProps> = ({
  videoId,
  videoTitle,
  onTranscriptReady,
  onSeekToTimestamp,
}) => {
  const [modelSize, setModelSize] = useState<'tiny' | 'base' | 'small' | 'medium'>('tiny');
  const [transcript, setTranscript] = useState<TranscriptionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'segments' | 'fulltext'>('segments');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [expandedSegmentId, setExpandedSegmentId] = useState<number | null>(null);

  // Check if existing transcript is in database upon component mount
  useEffect(() => {
    let isMounted = true;
    if (videoId) {
      api.getTranscription(videoId)
        .then((res) => {
          if (isMounted && res) {
            setTranscript(res);
            if (onTranscriptReady) onTranscriptReady(res);
          }
        })
        .catch(() => {
          // No existing transcript yet, ready to transcribe
        });
    }
    return () => {
      isMounted = false;
    };
  }, [videoId]);

  const handleStartTranscription = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setStatusMessage('1. Extracting 16kHz audio with FFmpeg...');
    setProgressPercent(15);

    try {
      // Simulate visual pipeline steps while backend processes asynchronously
      const stepTimer1 = setTimeout(() => {
        setStatusMessage(`2. Loading Faster-Whisper (${modelSize} int8 model)...`);
        setProgressPercent(40);
      }, 1200);

      const stepTimer2 = setTimeout(() => {
        setStatusMessage('3. Transcribing audio & computing word-level timestamps...');
        setProgressPercent(75);
      }, 2500);

      const res = await api.transcribeVideo(videoId, modelSize);

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);

      setProgressPercent(100);
      setStatusMessage('Completed!');
      setTranscript(res);

      if (onTranscriptReady) {
        onTranscriptReady(res);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'AI transcription pipeline failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyTranscript = () => {
    if (!transcript?.full_text) return;
    navigator.clipboard.writeText(transcript.full_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredSegments = (transcript?.segments || []).filter((seg) => {
    if (!searchQuery) return true;
    return seg.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
           seg.speaker.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <Card className="border-white/[0.08] bg-[#111116] p-6 space-y-6 shadow-2xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" />
              Faster-Whisper AI Speech Engine
            </span>
            <Badge variant="purple" className="text-[10px]">Open-Source</Badge>
          </div>
          <h3 className="text-base font-bold text-white">
            Transcription & Word Timestamps
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Extracts word-level timestamps, speaker turns, and spoken language without paid APIs.
          </p>
        </div>

        {/* Model Selector Pill */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400 hidden sm:inline">Model:</span>
          <div className="flex p-1 rounded-xl bg-zinc-950 border border-white/[0.06]">
            {[
              { id: 'tiny', label: 'Tiny (Fast)' },
              { id: 'base', label: 'Base' },
              { id: 'small', label: 'Small (Accurate)' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={isLoading}
                onClick={() => setModelSize(m.id as any)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  modelSize === m.id
                    ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40 shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ERROR ALERT */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* STATE 1: LOADING / PROCESSING PROGRESS BAR */}
      {isLoading && (
        <div className="p-6 rounded-2xl bg-purple-950/20 border border-purple-500/30 text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-purple-400">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-sm font-bold text-white">{statusMessage}</span>
          </div>

          <div className="max-w-md mx-auto space-y-1.5">
            <div className="flex justify-between text-xs font-mono text-zinc-400">
              <span>Pipeline Stage</span>
              <span className="text-purple-400 font-bold">{progressPercent}%</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-purple-500 via-indigo-500 to-pink-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          <p className="text-[11px] text-zinc-500">
            Running 8-bit quantized Faster-Whisper inference locally. Zero cloud latency.
          </p>
        </div>
      )}

      {/* STATE 2: NO TRANSCRIPT YET (TRIGGER ACTION) */}
      {!transcript && !isLoading && (
        <div className="p-8 rounded-2xl bg-zinc-950/50 border border-dashed border-white/[0.08] text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-purple-950/60 border border-purple-800/60 text-purple-400 flex items-center justify-center">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">No transcript generated yet</h4>
            <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
              Run Faster-Whisper to extract word-level timestamps. This enables AI viral clip detection and subtitle burning.
            </p>
          </div>
          <Button
            onClick={handleStartTranscription}
            variant="primary"
            size="md"
            className="rounded-xl px-6 text-xs shadow-lg shadow-purple-600/25"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Transcribe with Whisper ({modelSize.toUpperCase()})
          </Button>
        </div>
      )}

      {/* STATE 3: TRANSCRIPT COMPLETED */}
      {transcript && !isLoading && (
        <div className="space-y-5">
          {/* Summary Metric Badges */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-zinc-950/80 border border-white/[0.06]">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <Badge variant="purple" className="flex items-center gap-1.5 py-1">
                <Languages className="w-3.5 h-3.5 text-purple-400" />
                Language: {transcript.language?.toUpperCase()} ({Math.round((transcript.language_probability || 1) * 100)}%)
              </Badge>

              <Badge variant="success" className="py-1">
                Total Words: {transcript.total_words}
              </Badge>

              <Badge variant="default" className="py-1">
                Model: {transcript.model_used} int8
              </Badge>

              <span className="text-zinc-500 font-mono text-[11px]">
                {transcript.segments.length} dialogue segments
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={handleCopyTranscript}
                variant="outline"
                size="sm"
                className="rounded-xl text-xs py-1 px-3"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1" /> Copy Text
                  </>
                )}
              </Button>
              <Button
                onClick={handleStartTranscription}
                variant="secondary"
                size="sm"
                className="rounded-xl text-xs py-1 px-3"
                title="Re-run transcription"
              >
                <RefreshCw className="w-3 h-3 mr-1" /> Re-run
              </Button>
            </div>
          </div>

          {/* Handling for audio without speech */}
          {!transcript.has_speech && (
            <div className="p-5 rounded-2xl bg-amber-950/30 border border-amber-800/50 text-amber-300 text-xs flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 text-amber-400" />
              <div>
                <p className="font-bold text-amber-200">No Speech Dialogue Detected</p>
                <p className="text-zinc-400 mt-0.5">
                  Faster-Whisper analyzed the audio track and found no spoken words or dialogue.
                </p>
              </div>
            </div>
          )}

          {transcript.has_speech && (
            <>
              {/* Tab Selector & Search Filter */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex p-1 rounded-xl bg-zinc-950 border border-white/[0.06] w-fit">
                  <button
                    type="button"
                    onClick={() => setActiveTab('segments')}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      activeTab === 'segments'
                        ? 'bg-purple-600/25 text-purple-300 border border-purple-500/30'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Segments & Timestamps ({transcript.segments.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('fulltext')}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      activeTab === 'fulltext'
                        ? 'bg-purple-600/25 text-purple-300 border border-purple-500/30'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Full Text View
                  </button>
                </div>

                {activeTab === 'segments' && (
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search speech..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-zinc-950 border border-white/[0.08] rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                )}
              </div>

              {/* View 1: Interactive Segments with Word Timestamps */}
              {activeTab === 'segments' && (
                <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                  {filteredSegments.length === 0 ? (
                    <p className="text-xs text-zinc-500 text-center py-6">
                      No matching segments found for &quot;{searchQuery}&quot;.
                    </p>
                  ) : (
                    filteredSegments.map((seg) => {
                      const isExpanded = expandedSegmentId === seg.id;
                      return (
                        <div
                          key={seg.id}
                          className="p-3.5 rounded-xl bg-zinc-950/70 border border-white/[0.06] hover:border-purple-500/40 transition-all space-y-2 group"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              {/* Speaker Badge */}
                              <span className="px-2 py-0.5 rounded-md bg-purple-950/60 border border-purple-800/50 text-[10px] text-purple-300 font-semibold flex items-center gap-1">
                                <User className="w-3 h-3 text-purple-400" />
                                {seg.speaker}
                              </span>

                              {/* Clickable Timestamp */}
                              <button
                                type="button"
                                onClick={() => onSeekToTimestamp && onSeekToTimestamp(seg.start)}
                                className="font-mono text-[11px] text-zinc-400 hover:text-purple-300 flex items-center gap-1 bg-zinc-900 px-2 py-0.5 rounded cursor-pointer transition-colors"
                                title="Click to seek in video"
                              >
                                <Clock className="w-3 h-3 text-zinc-500" />
                                [{formatDuration(seg.start)} - {formatDuration(seg.end)}]
                              </button>
                            </div>

                            {/* Word-level toggle */}
                            {seg.words && seg.words.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setExpandedSegmentId(isExpanded ? null : seg.id)}
                                className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 cursor-pointer"
                              >
                                {isExpanded ? 'Hide Words' : `${seg.words.length} words`}
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            )}
                          </div>

                          {/* Segment Sentence */}
                          <p className="text-xs text-zinc-200 leading-relaxed font-sans">
                            {seg.text}
                          </p>

                          {/* Expanded Word Pills with exact millisecond timestamps */}
                          {isExpanded && seg.words && seg.words.length > 0 && (
                            <div className="pt-2 border-t border-white/[0.04] flex flex-wrap gap-1.5">
                              {seg.words.map((w, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => onSeekToTimestamp && onSeekToTimestamp(w.start)}
                                  className="px-2 py-0.5 rounded bg-zinc-900 border border-white/[0.06] text-[10px] text-zinc-300 hover:border-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1 font-mono cursor-pointer"
                                  title={`Seek to ${w.start}s (confidence: ${Math.round(w.probability * 100)}%)`}
                                >
                                  <span>{w.word}</span>
                                  <span className="text-[8px] text-zinc-500">{w.start}s</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* View 2: Clean Full Text Paragraphs */}
              {activeTab === 'fulltext' && (
                <div className="p-4 rounded-xl bg-zinc-950 border border-white/[0.06] max-h-[350px] overflow-y-auto">
                  <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans">
                    {transcript.full_text}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
};
