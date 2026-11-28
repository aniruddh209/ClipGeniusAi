import {
  SystemHealth,
  VideoItem,
  ClipItem,
  TranscriptionResponse,
  WhisperModelItem,
  SubtitleStyleConfig,
  SubtitleGenerateRequest,
  SubtitleGenerateResponse,
  SubtitleBurnRequest,
  SubtitleBurnResponse,
  ReframePreviewRequest,
  ReframePreviewResponse,
  ReframeRenderRequest,
  ReframeRenderResponse,
  FullPipelineRequest,
  FullPipelineJobResponse,
  StorageSummaryResponse,
  StorageCleanupResponse,
  ProbeUrlResponse,
  CandidateClip,
  VideoAnalysisResult,
  DownloadTask,
  StartDownloadPayload,
  ExportFormatOption,
  AvailableQualityOption,
  MacOSDirectoryOption,
  ExportVideoPayload,
  ExportVideoResponse,
  FileSpecsInfo
} from '@/types';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';
export const BACKEND_URL = API_BASE_URL.replace(/\/api\/v1\/?$/, '');

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  getServerUrl(path?: string | null): string {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${BACKEND_URL}${cleanPath}`;
  }

  async checkHealth(): Promise<SystemHealth> {
    const res = await fetch(`${this.baseUrl}/health`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Health check failed: ${res.statusText}`);
    }
    return res.json();
  }

  async getVideos(): Promise<VideoItem[]> {
    const res = await fetch(`${this.baseUrl}/videos`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch videos: ${res.statusText}`);
    }
    return res.json();
  }

  async getVideo(id: string): Promise<VideoItem> {
    const res = await fetch(`${this.baseUrl}/videos/${id}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch video: ${res.statusText}`);
    }
    return res.json();
  }

  uploadVideoWithProgress(
    file: File,
    onProgress: (percentage: number) => void
  ): Promise<VideoItem> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);

      xhr.open('POST', `${this.baseUrl}/videos/upload`);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data: VideoItem = JSON.parse(xhr.responseText);
            resolve(data);
          } catch (e) {
            reject(new Error('Invalid response from server.'));
          }
        } else {
          try {
            const errData = JSON.parse(xhr.responseText);
            reject(new Error(errData.detail || `Upload failed (${xhr.status})`));
          } catch {
            reject(new Error(`Server error: ${xhr.statusText || xhr.status}`));
          }
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network connection error while uploading video.'));
      };

      xhr.send(formData);
    });
  }

  async deleteVideo(videoId: string): Promise<{ id: string; success: boolean; message: string }> {
    const res = await fetch(`${this.baseUrl}/videos/${videoId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to delete video');
    }
    return res.json();
  }

  async submitYoutubeUrl(url: string): Promise<VideoItem> {
    const res = await fetch(`${this.baseUrl}/videos/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to submit URL');
    }
    return res.json();
  }

  async submitDirectYoutubeClip(url: string): Promise<VideoItem> {
    const res = await fetch(`${this.baseUrl}/videos/direct-youtube-clip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to analyze YouTube video for direct clipping');
    }
    return res.json();
  }

  // AI Transcription Methods
  async getWhisperModels(): Promise<WhisperModelItem[]> {
    const res = await fetch(`${this.baseUrl}/transcription/models`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error('Failed to load available Whisper models');
    }
    return res.json();
  }

  async transcribeVideo(
    videoId: string,
    modelSize?: string,
    language?: string
  ): Promise<TranscriptionResponse> {
    const res = await fetch(`${this.baseUrl}/transcription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_id: videoId,
        model_size: modelSize || undefined,
        language: language || undefined,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Transcription failed');
    }
    return res.json();
  }

  async getTranscription(videoId: string): Promise<TranscriptionResponse> {
    const res = await fetch(`${this.baseUrl}/transcription/${videoId}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'No transcript found');
    }
    return res.json();
  }

  async getClips(videoId: string): Promise<{ clips: ClipItem[]; total_clips: number }> {
    const res = await fetch(`${this.baseUrl}/clips/video/${videoId}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch clips: ${res.statusText}`);
    }
    return res.json();
  }

  async getAllClips(): Promise<ClipItem[]> {
    const res = await fetch(`${this.baseUrl}/clips`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      return [];
    }
    return res.json();
  }

  // AI Clip Detection Engine Methods
  async detectClips(
    videoId: string,
    durationRange: string = '30-60',
    maxClips: number = 6,
    viralityThreshold: number = 55.0
  ): Promise<{ task_id: string; status: string; progress: number; current_step?: string }> {
    const res = await fetch(`${this.baseUrl}/clips/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_id: videoId,
        duration_range: durationRange,
        max_clips: maxClips,
        virality_threshold: viralityThreshold,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Clip detection request failed');
    }
    return res.json();
  }

  async pollClipDetectionTask(taskId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/clips/tasks/${taskId}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to poll task status');
    }
    return res.json();
  }

  async renderClip(clipId: string, aspectRatio: string = '9:16'): Promise<any> {
    const res = await fetch(`${this.baseUrl}/clips/${clipId}/render?aspect_ratio=${encodeURIComponent(aspectRatio)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Clip rendering failed');
    }
    return res.json();
  }

  async deleteClip(clipId: string): Promise<{ success: boolean; clip_id: string; message: string }> {
    const res = await fetch(`${this.baseUrl}/clips/${clipId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to delete clip');
    }
    return res.json();
  }

  // Automatic Video Clipping Engine: Batch Cutting Methods
  async startBatchCut(
    videoId: string,
    clipIds?: string[],
    aspectRatio: string = '9:16'
  ): Promise<any> {
    const res = await fetch(`${this.baseUrl}/clips/batch-cut`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_id: videoId,
        clip_ids: clipIds && clipIds.length > 0 ? clipIds : undefined,
        aspect_ratio: aspectRatio,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to start batch clipping process');
    }
    return res.json();
  }

  async pollBatchCutJob(jobId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/clips/jobs/${jobId}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to poll video cutting job status');
    }
    return res.json();
  }

  async retryFailedClips(jobId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/clips/jobs/${jobId}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to retry clipping job');
    }
    return res.json();
  }

  async triggerClipGeneration(videoId: string): Promise<{ task_id: string; message: string }> {
    const res = await fetch(`${this.baseUrl}/clips/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_id: videoId }),
    });
    if (!res.ok) {
      throw new Error(`Failed to trigger clip generation: ${res.statusText}`);
    }
    return res.json();
  }

  // --- Subtitles & Animated Captions API ---
  async getSubtitlePresets(): Promise<Record<string, SubtitleStyleConfig>> {
    const res = await fetch(`${this.baseUrl}/subtitles/presets`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch subtitle presets: ${res.statusText}`);
    }
    return res.json();
  }

  async generateSubtitles(req: SubtitleGenerateRequest): Promise<SubtitleGenerateResponse> {
    const res = await fetch(`${this.baseUrl}/subtitles/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to generate subtitles');
    }
    return res.json();
  }

  async burnSubtitles(req: SubtitleBurnRequest): Promise<SubtitleBurnResponse> {
    const res = await fetch(`${this.baseUrl}/subtitles/burn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to render subtitles on video');
    }
    return res.json();
  }

  getSubtitleDownloadUrl(clipId: string, format: 'srt' | 'ass'): string {
    return `${this.baseUrl}/subtitles/download/${clipId}/${format}`;
  }

  // --- Intelligent Video Reframing API ---
  async previewReframing(req: ReframePreviewRequest): Promise<ReframePreviewResponse> {
    const res = await fetch(`${this.baseUrl}/reframing/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to analyze video reframing');
    }
    return res.json();
  }

  async renderReframing(req: ReframeRenderRequest): Promise<ReframeRenderResponse> {
    const res = await fetch(`${this.baseUrl}/reframing/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to render reframed video');
    }
    return res.json();
  }

  // --- Unified 10-Step End-to-End Pipeline API ---
  async triggerPipeline(req: FullPipelineRequest): Promise<FullPipelineJobResponse> {
    const res = await fetch(`${this.baseUrl}/clips/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to trigger full AI pipeline');
    }
    return res.json();
  }

  async pollPipeline(jobId: string): Promise<FullPipelineJobResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/clips/pipeline/${jobId}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || 'Failed to poll AI pipeline status');
      }
      return await res.json();
    } catch (err: any) {
      // Gracefully log network drops without throwing to Turbopack
      console.warn('Temporary pipeline poll delay:', err.message);
      throw err;
    }
  }

  async retryPipeline(jobId: string): Promise<FullPipelineJobResponse> {
    const res = await fetch(`${this.baseUrl}/clips/pipeline/${jobId}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to retry pipeline job');
    }
    return res.json();
  }

  // --- Direct Cloud URL & Range-Based Remote Media API ---
  async probeUrl(url: string): Promise<ProbeUrlResponse> {
    const res = await fetch(`${this.baseUrl}/videos/probe-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to probe remote media URL');
    }
    return res.json();
  }

  async registerDirectCloudVideo(url: string): Promise<VideoItem> {
    const res = await fetch(`${this.baseUrl}/videos/direct-cloud-register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to register cloud video');
    }
    return res.json();
  }

  getClipsZipDownloadUrl(videoId: string): string {
    return `${this.baseUrl}/clips/video/${videoId}/download-zip`;
  }

  getClipDownloadUrl(clipId: string): string {
    return `${this.baseUrl}/clips/${clipId}/download`;
  }

  async updateClip(
    clipId: string,
    data: { title?: string; start_time?: number; end_time?: number }
  ): Promise<CandidateClip> {
    const res = await fetch(`${this.baseUrl}/clips/${clipId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to update clip');
    }
    return res.json();
  }

  // --- Storage Management API ---
  async getStorageSummary(): Promise<StorageSummaryResponse> {
    const res = await fetch(`${this.baseUrl}/videos/storage/summary`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch storage summary: ${res.statusText}`);
    }
    return res.json();
  }

  async cleanupStorage(): Promise<StorageCleanupResponse> {
    const res = await fetch(`${this.baseUrl}/videos/storage/cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to clean up storage');
    }
    return res.json();
  }

  // --- Video Downloader Module API ---
  async analyzeDownloaderUrl(url: string): Promise<VideoAnalysisResult> {
    const res = await fetch(`${this.baseUrl}/downloader/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to analyze video stream');
    }
    return res.json();
  }

  async startDownloaderTask(payload: StartDownloadPayload): Promise<DownloadTask> {
    const res = await fetch(`${this.baseUrl}/downloader/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to start download task');
    }
    return res.json();
  }

  async getDownloaderTasks(): Promise<DownloadTask[]> {
    const res = await fetch(`${this.baseUrl}/downloader/tasks`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch download tasks: ${res.statusText}`);
    }
    return res.json();
  }

  async getDownloaderTask(taskId: string): Promise<DownloadTask> {
    const res = await fetch(`${this.baseUrl}/downloader/tasks/${taskId}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch task ${taskId}: ${res.statusText}`);
    }
    return res.json();
  }

  async pauseDownloaderTask(taskId: string): Promise<DownloadTask> {
    const res = await fetch(`${this.baseUrl}/downloader/tasks/${taskId}/pause`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to pause task');
    }
    return res.json();
  }

  async resumeDownloaderTask(taskId: string): Promise<DownloadTask> {
    const res = await fetch(`${this.baseUrl}/downloader/tasks/${taskId}/resume`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to resume task');
    }
    return res.json();
  }

  async retryDownloaderTask(taskId: string): Promise<DownloadTask> {
    const res = await fetch(`${this.baseUrl}/downloader/tasks/${taskId}/retry`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to retry task');
    }
    return res.json();
  }

  async probeDirectMediaUrl(url: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/downloader/engine/probe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to probe media server');
    }
    return res.json();
  }

  async cancelDownloaderTask(taskId: string): Promise<DownloadTask> {
    const res = await fetch(`${this.baseUrl}/downloader/tasks/${taskId}/cancel`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to cancel task');
    }
    return res.json();
  }

  async deleteDownloaderTask(taskId: string): Promise<{ success: boolean; task_id: string }> {
    const res = await fetch(`${this.baseUrl}/downloader/tasks/${taskId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to delete task');
    }
    return res.json();
  }

  // --- YouTube Cookie Authentication API ---
  async getYouTubeCookieStatus(): Promise<{ configured: boolean; path: string | null; size_bytes: number; message: string }> {
    const res = await fetch(`${this.baseUrl}/downloader/cookies/status`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      return { configured: false, path: null, size_bytes: 0, message: 'Could not fetch cookie status' };
    }
    return res.json();
  }

  async saveYouTubeCookies(cookiesText: string): Promise<{ success: boolean; message: string; path?: string }> {
    const res = await fetch(`${this.baseUrl}/downloader/cookies/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookies_text: cookiesText }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to save cookies');
    }
    return res.json();
  }

  async clearYouTubeCookies(): Promise<{ success: boolean }> {
    const res = await fetch(`${this.baseUrl}/downloader/cookies/clear`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to clear cookies');
    }
    return res.json();
  }

  async batchDownloaderAction(
    action: 'pause_all' | 'resume_all' | 'download_all' | 'retry_failed' | 'cancel_all' | 'clear_completed'
  ): Promise<DownloadTask[]> {
    const res = await fetch(`${this.baseUrl}/downloader/batch/${action}`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Failed to execute batch action '${action}'`);
    }
    return res.json();
  }

  async batchDeleteDownloaderTasks(taskIds: string[]): Promise<{ success: boolean; deleted_count: number; deleted_ids: string[] }> {
    const res = await fetch(`${this.baseUrl}/downloader/batch-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_ids: taskIds }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to delete selected download tasks');
    }
    return res.json();
  }

  async getDownloaderHistory(): Promise<DownloadTask[]> {
    const res = await fetch(`${this.baseUrl}/downloader/history`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch history: ${res.statusText}`);
    }
    return res.json();
  }

  async clipDownloadedVideo(taskId: string): Promise<{ success: boolean; video_id: string; message: string; video: VideoItem }> {
    const res = await fetch(`${this.baseUrl}/downloader/tasks/${taskId}/clip`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to import video into AI Clipper');
    }
    return res.json();
  }

  getDownloadFileUrl(taskId: string): string {
    return `${this.baseUrl}/downloader/file/${taskId}`;
  }

  /* macOS Video Export & Native File Operations */

  async getExportFormats(): Promise<ExportFormatOption[]> {
    const res = await fetch(`${this.baseUrl}/files/formats`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch export formats');
    return res.json();
  }

  async getMacOSDirectories(): Promise<MacOSDirectoryOption[]> {
    const res = await fetch(`${this.baseUrl}/files/directories`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch macOS directories');
    return res.json();
  }

  async getAvailableQualities(params: { source_path?: string; task_id?: string; clip_id?: string; video_id?: string }): Promise<{ source_path: string; filename: string; qualities: AvailableQualityOption[] }> {
    const res = await fetch(`${this.baseUrl}/files/qualities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to determine available qualities');
    }
    return res.json();
  }

  async exportVideo(payload: ExportVideoPayload): Promise<ExportVideoResponse> {
    const res = await fetch(`${this.baseUrl}/files/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to export video');
    }
    return res.json();
  }

  async openInMacOSPlayer(params: { file_path?: string; task_id?: string; clip_id?: string; video_id?: string }): Promise<{ success: boolean; message: string; path: string }> {
    const res = await fetch(`${this.baseUrl}/files/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Could not open file in macOS player');
    }
    return res.json();
  }

  async revealInFinder(params: { file_path?: string; task_id?: string; clip_id?: string; video_id?: string }): Promise<{ success: boolean; message: string; path: string }> {
    const res = await fetch(`${this.baseUrl}/files/reveal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Could not reveal file in macOS Finder');
    }
    return res.json();
  }

  async getFileInfo(params: { path?: string; task_id?: string; clip_id?: string; video_id?: string }): Promise<FileSpecsInfo> {
    const sp = new URLSearchParams();
    if (params.path) sp.set('path', params.path);
    if (params.task_id) sp.set('task_id', params.task_id);
    if (params.clip_id) sp.set('clip_id', params.clip_id);
    if (params.video_id) sp.set('video_id', params.video_id);
    const res = await fetch(`${this.baseUrl}/files/info?${sp.toString()}`, { cache: 'no-store' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to inspect file specifications');
    }
    return res.json();
  }

  async deleteFile(params: { file_path?: string; task_id?: string; clip_id?: string; video_id?: string }): Promise<{ success: boolean; filename: string; path: string; message: string }> {
    const res = await fetch(`${this.baseUrl}/files/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to delete file');
    }
    return res.json();
  }

  async batchDeleteFiles(params: { file_paths?: string[]; task_ids?: string[]; clip_ids?: string[] }): Promise<{ success: boolean; deleted_count: number; deleted_files: string[]; errors: string[] }> {
    const res = await fetch(`${this.baseUrl}/files/batch-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to batch delete files');
    }
    return res.json();
  }
}

export const api = new ApiClient(API_BASE_URL);
