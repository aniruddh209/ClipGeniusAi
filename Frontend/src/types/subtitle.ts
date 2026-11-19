export type CaptionPreset = 
  | 'modern_white'
  | 'bold_yellow'
  | 'minimal_clean'
  | 'karaoke_highlight'
  | 'creator_style'
  | 'professional_podcast';

export type SubtitlePosition = 'bottom' | 'center' | 'top';

export interface SubtitleWordItem {
  word: string;
  start: number; // in seconds relative to clip start
  end: number;   // in seconds relative to clip start
  is_keyword: boolean;
}

export interface SubtitleLineChunk {
  index: number;
  start: number;
  end: number;
  text: string;
  words: SubtitleWordItem[];
}

export interface SubtitleStyleConfig {
  preset: CaptionPreset;
  preset_name: string;
  font_family: string;
  font_size: number;
  primary_color: string;
  highlight_color: string;
  keyword_color: string;
  outline_color: string;
  outline_width: number;
  shadow_color: string;
  shadow_offset: number;
  background_box: boolean;
  background_color: string;
  background_padding_x: number;
  background_padding_y: number;
  background_radius: number;
  position: SubtitlePosition;
  safe_margin_y: number;
  max_words_per_line: number;
  uppercase: boolean;
  karaoke_animation: boolean;
  scale_active_word: boolean;
}

export interface SubtitleGenerateRequest {
  video_id: string;
  clip_id?: string;
  start_time: number;
  end_time: number;
  style?: SubtitleStyleConfig;
}

export interface SubtitleGenerateResponse {
  video_id: string;
  clip_id?: string;
  chunks: SubtitleLineChunk[];
  total_words: number;
  duration: number;
  style: SubtitleStyleConfig;
  srt_content: string;
  ass_content: string;
}

export interface SubtitleBurnRequest {
  video_id: string;
  clip_id: string;
  style?: SubtitleStyleConfig;
}

export interface SubtitleBurnResponse {
  clip_id: string;
  video_id: string;
  status: 'completed' | 'failed';
  subtitled_video_url: string;
  srt_url: string;
  ass_url: string;
  duration: number;
  style_used: SubtitleStyleConfig;
  error?: string | null;
  created_at: string;
}
