export type VideoStatus = 
  | 'pending'
  | 'ready'
  | 'downloading'
  | 'transcribing'
  | 'analyzing'
  | 'clipping'
  | 'completed'
  | 'failed';

export type VideoSourceType = 'upload' | 'youtube_url';

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  aspect_ratio: string;
  video_codec?: string;
  audio_codec?: string;
  bitrate_kbps?: number;
  size_mb: number;
}

export interface VideoItem {
  id: string;
  title: string;
  original_filename?: string;
  stored_filename?: string;
  source_type: VideoSourceType;
  source_url?: string;
  file_path?: string;
  file_size_mb: number;
  duration: number;
  video_url?: string;
  thumbnail_url?: string | null;
  metadata?: VideoMetadata;
  status: VideoStatus;
  progress_percentage: number;
  current_step?: string;
  error_message?: string;
  transcript_available: boolean;
  clips_count: number;
  created_at: string;
  updated_at: string;
  thumbnail?: string;
}

export interface WordItem {
  word: string;
  start: number;
  end: number;
  probability: number;
}

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  speaker: string;
  words: WordItem[];
}

export interface TranscriptionResponse {
  video_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  current_step?: string;
  has_speech: boolean;
  language?: string;
  language_probability?: number;
  duration: number;
  model_used: string;
  full_text: string;
  segments: TranscriptSegment[];
  total_words: number;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface WhisperModelItem {
  id: string;
  name: string;
  parameters: string;
  vram: string;
  speed: string;
  recommended_for: string;
}

export type RankingBadgeType = 'Best Overall' | 'Best Hook' | 'Most Educational' | 'Most Entertaining' | 'Top Contender';

export interface ScoreCriterionDetail {
  criterion: string;
  score: number;
  max_score: number;
  evidence: string;
}

export interface DetailedScoringBreakdown {
  hook_strength: number;
  interesting_content: number;
  emotional_engagement: number;
  information_value: number;
  story_completeness: number;
  ending_quality: number;
  audio_visual_quality: number;
  overall_score: number;
  hook_score?: number;
  pacing_score?: number;
  coherence_score?: number;
  keyword_score?: number;
  boundary_score?: number;
  composite_score?: number;
}

export type ScoreBreakdown = DetailedScoringBreakdown;

export interface CandidateClip {
  id: string;
  video_id: string;
  title: string;
  short_description?: string;
  hook?: string;
  hook_sentence?: string;
  category: string;
  reason_for_selection?: string;
  start_time: number;
  end_time: number;
  duration: number;
  transcript?: string;
  transcript_snippet?: string;
  words_count?: number;
  speaking_rate_wps?: number;
  scores?: DetailedScoringBreakdown;
  overall_score?: number;
  virality_score: number;
  ranking_badge?: RankingBadgeType | string;
  score_reasons?: string[];
  improvement_suggestions?: string[];
  criteria_details?: ScoreCriterionDetail[];
  aspect_ratio?: string;
  has_subtitles?: boolean;
  thumbnail_url?: string | null;
  preview_url?: string | null;
  download_url?: string | null;
  video_url?: string | null;
  status?: string;
  disclaimer?: string;
  created_at?: string;
}

// Alias
export type ClipItem = CandidateClip;

export interface FailedClipItem {
  clip_id: string;
  title: string;
  error: string;
}

export interface BatchCutJobResponse {
  job_id: string;
  video_id: string;
  status: 'queued' | 'processing' | 'completed' | 'partially_failed' | 'failed';
  progress: number;
  current_step?: string;
  current_clip_id?: string;
  current_clip_title?: string;
  aspect_ratio: string;
  total_clips: number;
  completed_clips: CandidateClip[];
  failed_clips: FailedClipItem[];
  created_at: string;
  updated_at: string;
}

export interface ClipDetectionTaskResponse {
  task_id: string;
  video_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  current_step?: string;
  clips: CandidateClip[];
  total_clips: number;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface SystemHealth {
  status: string;
  version: string;
  database: string;
  ffmpeg_available: boolean;
  storage_writable: boolean;
  active_tasks: number;
  environment: string;
}

export * from './subtitle';
export * from './reframe';

export interface FullPipelineRequest {
  video_id: string;
  target_aspect_ratio?: string;
  duration_range?: string;
  max_clips?: number;
  virality_threshold?: number;
  reframing_mode?: string;
  content_type?: string;
  template_layout?: string;
  subtitle_preset?: string;
  burn_subtitles?: boolean;
  smart_reframing?: boolean;
  whisper_model?: string;
  export_quality?: string;
}

export interface FullPipelineJobResponse {
  job_id: string;
  video_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  current_step?: string;
  current_clip_title?: string;
  target_aspect_ratio: string;
  total_moments_detected: number;
  completed_clips: CandidateClip[];
  failed_clips: FailedClipItem[];
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface StorageSummaryResponse {
  status: string;
  total_storage_mb: number;
  uploads: { count: number; size_mb: number };
  generated_clips: { count: number; size_mb: number };
  thumbnails: { count: number; size_mb: number };
  database: { projects_count: number; clips_count: number };
}

export interface StorageCleanupResponse {
  success: boolean;
  files_removed: number;
  space_reclaimed_mb: number;
  message: string;
}

export interface ProbeUrlResponse {
  url: string;
  is_valid: boolean;
  is_accessible: boolean;
  title?: string;
  duration: number;
  duration_formatted: string;
  resolution: string;
  fps: number;
  has_audio: boolean;
  content_type: string;
  file_size_mb: number;
  direct_range_supported: boolean;
  supports_range_requests: boolean;
  error?: string;
}

export interface UserPreferences {
  name: string;
  email: string;
  avatarUrl: string;
  whisperModel: 'tiny' | 'base' | 'small' | 'medium';
  defaultAspectRatio: '9:16' | '1:1' | '4:5';
  defaultResolution: '1080p' | '4K' | '720p';
  subtitleStyle: 'karaoke-yellow' | 'minimal-white' | 'boxed-purple' | 'bold-clean';
  autoFaceTracking: boolean;
  notificationOnComplete: boolean;
}

export interface AuthorizedWorkflowInfo {
  is_owner_download_available: boolean;
  studio_url?: string | null;
  studio_name: string;
  official_guide_steps: string[];
  disclaimer: string;
  can_stream_download: boolean;
  copyright_license: string;
  requires_creator_auth: boolean;
  learn_more_url?: string;
}

export interface VideoFormatOption {
  format_id: string;
  label: string;
  resolution: string;
  height: number;
  fps: number;
  ext: string;
  filesize_bytes: number;
  filesize_formatted: string;
  type: 'video' | 'audio';
  recommended: boolean;
  badge: string;
  source_confirmed?: boolean;
}

export interface VideoAnalysisResult {
  provider?: string;
  url: string;
  video_id: string;
  title: string;
  uploader: string;
  channel_name?: string;
  channel_id?: string | null;
  channel_url?: string | null;
  duration: number;
  duration_formatted: string;
  published_date?: string | null;
  published_date_formatted?: string | null;
  view_count: number;
  view_count_formatted: string;
  thumbnail: string | null;
  thumbnails_all?: Record<string, string> | null;
  description: string;
  tags?: string[];
  category?: string | null;
  license?: string | null;
  is_creative_commons?: boolean;
  is_live?: boolean;
  workflow?: AuthorizedWorkflowInfo;
  confirmed_qualities?: VideoFormatOption[];
  formats: VideoFormatOption[];
  api_source?: string;
}

export interface DownloadTask {
  task_id: string;
  url: string;
  title: string;
  thumbnail: string | null;
  format_id: string;
  ext: string;
  resolution: string;
  save_destination: string;
  destination_dir: string;
  output_path: string | null;
  output_filename: string | null;
  download_url: string | null;
  status: 'queued' | 'connecting' | 'downloading' | 'paused' | 'interrupted' | 'verifying' | 'completed' | 'cancelled' | 'failed' | 'processing';
  supports_ranges?: boolean;
  integrity_verified?: boolean;
  etag?: string | null;
  checksum_expected?: string | null;
  checksum_calculated?: string | null;
  downloaded_bytes: number;
  total_bytes: number;
  progress_percentage: number;
  speed_bytes_sec: number;
  speed_formatted: string;
  eta_seconds: number;
  eta_formatted: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface StartDownloadPayload {
  url: string;
  format_id: string;
  ext: string;
  resolution: string;
  save_destination: string;
  custom_path?: string;
  title?: string;
  thumbnail?: string;
  estimated_size?: number;
  use_engine?: boolean;
  max_connections?: number;
  expected_checksum?: string;
  checksum_type?: string;
}

export interface ExportFormatOption {
  id: string;
  name: string;
  extension: string;
  vcodec: string;
  acodec: string;
  description: string;
  apple_compatible: boolean;
}

export interface AvailableQualityOption {
  id: string;
  label: string;
  available: boolean;
  resolution: string;
  reason: string;
}

export interface MacOSDirectoryOption {
  id: string;
  name: string;
  path: string;
  icon: string;
  exists: boolean;
  writable: boolean;
  free_space_gb: number;
}

export interface ExportVideoPayload {
  source_path?: string;
  task_id?: string;
  clip_id?: string;
  video_id?: string;
  target_format: string;
  target_quality: string;
  destination_dir?: string;
  custom_filename?: string;
}

export interface ExportVideoResponse {
  success: boolean;
  filename: string;
  filepath: string;
  directory: string;
  size_bytes: number;
  size_mb: number;
  format: string;
  format_name: string;
  extension: string;
  apple_compatible: boolean;
  quality: string;
  resolution: string;
  fps: number;
  video_codec: string;
  audio_codec: string;
  duration: number;
  created_at: string;
}

export interface FileSpecsInfo {
  filename: string;
  filepath: string;
  directory: string;
  size_bytes: number;
  size_mb: number;
  size_gb: number;
  extension: string;
  video_codec?: string;
  audio_codec?: string;
  resolution?: string;
  width?: number;
  height?: number;
  duration?: number;
  fps?: number;
  bitrate_kbps?: number;
  last_modified?: number;
}

