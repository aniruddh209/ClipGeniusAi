export type CropMode = 'smart_auto' | 'center_crop' | 'manual_crop';
export type ReframingAspectRatio = '9:16' | '1:1' | '16:9';

export interface FaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
  is_speaker: boolean;
}

export interface CropKeyframe {
  timestamp: number;
  crop_x: number;
  crop_y: number;
  crop_w: number;
  crop_h: number;
  speaker_x?: number | null;
  faces_count: number;
  faces: FaceBox[];
}

export interface ReframePreviewRequest {
  video_id: string;
  clip_id?: string;
  start_time?: number;
  end_time?: number;
  target_aspect_ratio: ReframingAspectRatio;
  mode: CropMode;
  manual_crop_offset?: number;
}

export interface ReframePreviewResponse {
  video_id: string;
  clip_id?: string;
  source_width: number;
  source_height: number;
  target_width: number;
  target_height: number;
  target_aspect_ratio: string;
  mode: CropMode;
  detection_status: 'active_tracking' | 'fallback_center' | 'manual';
  faces_detected: boolean;
  speaker_detected: boolean;
  total_faces_found: number;
  speaker_switches: number;
  fallback_reason?: string | null;
  keyframes: CropKeyframe[];
  static_crop?: { x: number; y: number; w: number; h: number } | null;
  video_url?: string | null;
}

export interface ReframeRenderRequest {
  video_id: string;
  clip_id?: string;
  start_time?: number;
  end_time?: number;
  target_aspect_ratio: ReframingAspectRatio;
  mode: CropMode;
  manual_crop_offset?: number;
  smooth_transitions?: boolean;
}

export interface ReframeRenderResponse {
  job_id: string;
  video_id: string;
  clip_id?: string;
  status: 'completed' | 'failed';
  output_video_url: string;
  thumbnail_url: string;
  target_aspect_ratio: string;
  mode_used: CropMode;
  detection_status: string;
  duration: number;
  error?: string | null;
  created_at: string;
}
