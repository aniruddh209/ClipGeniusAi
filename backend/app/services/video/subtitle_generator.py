import re
from typing import List, Dict, Any, Optional
from app.models.subtitle import (
    CaptionPreset,
    SubtitlePosition,
    SubtitleWordItem,
    SubtitleLineChunk,
    SubtitleStyleConfig
)
from app.models.transcript import WordItem
from app.core.logging import logger

# High-impact keywords for dynamic color accents
KEYWORD_PATTERNS = [
    r"^\$?\d+[\d,\.]*[%kKmMbBxX]?$",   # Numbers, percentages, money ($100, 50%, 10x, 1M)
    r"^(secret|secrets|never|always|insane|crazy|money|million|billion|viral|hack|hacks)$",
    r"^(genius|mistake|mistakes|stop|shocking|critical|power|results|truth|future)$",
    r"^(incredible|amazing|unbelievable|transform|boost|exploded|ultimate|proven)$",
    r"^(how|why|what|where|who)\b",
]

PRESET_CONFIGS: Dict[CaptionPreset, SubtitleStyleConfig] = {
    CaptionPreset.MODERN_WHITE: SubtitleStyleConfig(
        preset=CaptionPreset.MODERN_WHITE,
        preset_name="Modern White",
        font_family="Arial Bold",
        font_size=44,
        primary_color="#FFFFFF",
        highlight_color="#38BDF8",  # Sky Blue
        keyword_color="#FACC15",    # Bright Yellow
        outline_color="#000000",
        outline_width=2,
        shadow_color="#000000",
        shadow_offset=3,
        background_box=True,
        background_color="rgba(15, 23, 42, 0.78)",
        background_padding_x=26,
        background_padding_y=14,
        background_radius=16,
        position=SubtitlePosition.BOTTOM,
        safe_margin_y=280,
        max_words_per_line=4,
        uppercase=False,
        karaoke_animation=True,
        scale_active_word=True,
    ),
    CaptionPreset.BOLD_YELLOW: SubtitleStyleConfig(
        preset=CaptionPreset.BOLD_YELLOW,
        preset_name="Bold Yellow",
        font_family="Impact",
        font_size=48,
        primary_color="#FFFFFF",
        highlight_color="#FFDD00",  # Punchy Yellow
        keyword_color="#FF3366",    # Neon Coral Pink
        outline_color="#000000",
        outline_width=5,
        shadow_color="#000000",
        shadow_offset=5,
        background_box=False,
        position=SubtitlePosition.CENTER,
        safe_margin_y=240,
        max_words_per_line=4,
        uppercase=True,
        karaoke_animation=True,
        scale_active_word=True,
    ),
    CaptionPreset.MINIMAL_CLEAN: SubtitleStyleConfig(
        preset=CaptionPreset.MINIMAL_CLEAN,
        preset_name="Minimal Clean",
        font_family="Helvetica",
        font_size=38,
        primary_color="#E2E8F0",
        highlight_color="#FFFFFF",
        keyword_color="#38BDF8",
        outline_color="#0F172A",
        outline_width=2,
        shadow_color="#000000",
        shadow_offset=2,
        background_box=False,
        position=SubtitlePosition.BOTTOM,
        safe_margin_y=280,
        max_words_per_line=5,
        uppercase=False,
        karaoke_animation=False,
        scale_active_word=False,
    ),
    CaptionPreset.KARAOKE_HIGHLIGHT: SubtitleStyleConfig(
        preset=CaptionPreset.KARAOKE_HIGHLIGHT,
        preset_name="Karaoke Highlight",
        font_family="Arial Black",
        font_size=44,
        primary_color="#94A3B8",
        highlight_color="#22C55E",  # Vibrant Neon Green
        keyword_color="#F59E0B",    # Warm Amber
        outline_color="#000000",
        outline_width=3,
        shadow_color="#000000",
        shadow_offset=2,
        background_box=True,
        background_color="rgba(0, 0, 0, 0.85)",
        background_padding_x=28,
        background_padding_y=16,
        background_radius=20,
        position=SubtitlePosition.BOTTOM,
        safe_margin_y=260,
        max_words_per_line=4,
        uppercase=True,
        karaoke_animation=True,
        scale_active_word=True,
    ),
    CaptionPreset.CREATOR_STYLE: SubtitleStyleConfig(
        preset=CaptionPreset.CREATOR_STYLE,
        preset_name="Creator Style",
        font_family="Impact",
        font_size=52,
        primary_color="#FFFFFF",
        highlight_color="#F59E0B",  # Electric Orange
        keyword_color="#06B6D4",    # Electric Cyan
        outline_color="#000000",
        outline_width=6,
        shadow_color="#000000",
        shadow_offset=6,
        background_box=False,
        position=SubtitlePosition.BOTTOM,
        safe_margin_y=300,
        max_words_per_line=3,
        uppercase=True,
        karaoke_animation=True,
        scale_active_word=True,
    ),
    CaptionPreset.PROFESSIONAL_PODCAST: SubtitleStyleConfig(
        preset=CaptionPreset.PROFESSIONAL_PODCAST,
        preset_name="Professional Podcast",
        font_family="Arial Bold",
        font_size=42,
        primary_color="#F8FAFC",
        highlight_color="#C084FC",  # Neon Violet
        keyword_color="#38BDF8",    # Sky Blue
        outline_color="#000000",
        outline_width=2,
        shadow_color="#000000",
        shadow_offset=3,
        background_box=True,
        background_color="rgba(24, 24, 27, 0.85)",
        background_padding_x=26,
        background_padding_y=14,
        background_radius=16,
        position=SubtitlePosition.BOTTOM,
        safe_margin_y=280,
        max_words_per_line=4,
        uppercase=False,
        karaoke_animation=True,
        scale_active_word=True,
    ),
}

def is_keyword_word(raw_word: str) -> bool:
    """Checks whether a word should receive keyword highlight accent."""
    cleaned = re.sub(r"[^\w\$%]", "", raw_word.strip().lower())
    if not cleaned:
        return False
    for pat in KEYWORD_PATTERNS:
        if re.search(pat, cleaned, re.IGNORECASE):
            return True
    return False

def slice_and_chunk_words(
    words: List[WordItem],
    clip_start: float,
    clip_end: float,
    max_words_per_line: int = 4
) -> List[SubtitleLineChunk]:
    """
    Extracts words falling within [clip_start, clip_end], offsets their timestamps to clip start (0.0s),
    and aggregates them into readable short-form 3-5 word subtitle chunks.
    """
    # 1. Filter words within clip boundaries
    clip_words: List[SubtitleWordItem] = []
    for w in words:
        # Check overlap with clip interval
        if w.end > clip_start and w.start < clip_end:
            local_start = max(0.0, round(w.start - clip_start, 3))
            local_end = max(local_start + 0.05, round(w.end - clip_start, 3))
            word_str = w.word.strip()
            if word_str:
                is_kw = is_keyword_word(word_str)
                clip_words.append(
                    SubtitleWordItem(
                        word=word_str,
                        start=local_start,
                        end=local_end,
                        is_keyword=is_kw
                    )
                )

    if not clip_words:
        return []

    # 2. Chunk words into short lines for vertical reading
    chunks: List[SubtitleLineChunk] = []
    current_chunk_words: List[SubtitleWordItem] = []
    chunk_index = 1

    for i, w in enumerate(clip_words):
        current_chunk_words.append(w)

        # Natural breaks: punctuation (., !, ?) or hit max words
        has_period_or_question = bool(re.search(r"[\.\?!]", w.word))
        is_last = (i == len(clip_words) - 1)
        hit_max = (len(current_chunk_words) >= max_words_per_line)
        long_pause_next = False
        if not is_last:
            pause = clip_words[i + 1].start - w.end
            if pause >= 0.45:
                long_pause_next = True

        if is_last or hit_max or (has_period_or_question and len(current_chunk_words) >= 2) or long_pause_next:
            chunk_start = current_chunk_words[0].start
            chunk_end = max(chunk_start + 0.3, current_chunk_words[-1].end)
            chunk_text = " ".join([item.word for item in current_chunk_words])

            chunks.append(
                SubtitleLineChunk(
                    index=chunk_index,
                    start=round(chunk_start, 3),
                    end=round(chunk_end, 3),
                    text=chunk_text,
                    words=list(current_chunk_words)
                )
            )
            chunk_index += 1
            current_chunk_words = []

    return chunks

def format_timestamp_srt(seconds: float) -> str:
    """Formats seconds into SRT format: HH:MM:SS,mmm"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int(round((seconds - int(seconds)) * 1000))
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

def format_timestamp_ass(seconds: float) -> str:
    """Formats seconds into ASS format: H:MM:SS.cc (centiseconds)"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    centis = int(round((seconds - int(seconds)) * 100))
    return f"{hours:01d}:{minutes:02d}:{secs:02d}.{centis:02d}"

def hex_to_ass_color(hex_color: str, alpha: int = 0) -> str:
    """Converts hex '#RRGGBB' to ASS color '&HAABBGGRR'"""
    hex_clean = hex_color.lstrip("#")
    if len(hex_clean) == 6:
        r, g, b = hex_clean[0:2], hex_clean[2:4], hex_clean[4:6]
    else:
        r, g, b = "FF", "FF", "FF"
    a = f"{alpha:02X}"
    return f"&H{a}{b}{g}{r}&"

def generate_srt_content(chunks: List[SubtitleLineChunk]) -> str:
    """Generates standard .srt format string."""
    lines = []
    for chunk in chunks:
        start_str = format_timestamp_srt(chunk.start)
        end_str = format_timestamp_srt(chunk.end)
        lines.append(f"{chunk.index}\n{start_str} --> {end_str}\n{chunk.text}\n")
    return "\n".join(lines)

def generate_ass_content(
    chunks: List[SubtitleLineChunk],
    config: SubtitleStyleConfig,
    play_res_x: int = 1080,
    play_res_y: int = 1920
) -> str:
    """
    Generates rich ASS (Advanced SubStation Alpha) subtitle file with word-by-word karaoke highlight tags.
    """
    primary_ass = hex_to_ass_color(config.primary_color)
    highlight_ass = hex_to_ass_color(config.highlight_color)
    outline_ass = hex_to_ass_color(config.outline_color)
    shadow_ass = hex_to_ass_color(config.shadow_color, alpha=64)

    # Calculate alignment & vertical margin
    # In ASS numpad alignment:
    # 2 = Bottom-Center, 5 = Middle-Center, 8 = Top-Center
    if config.position == SubtitlePosition.TOP:
        alignment = 8
        margin_v = config.safe_margin_y
    elif config.position == SubtitlePosition.CENTER:
        alignment = 5
        margin_v = 0
    else:
        alignment = 2
        margin_v = config.safe_margin_y

    font_name = "Impact" if "impact" in config.font_family.lower() else "Arial"

    ass_lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {play_res_x}",
        f"PlayResY: {play_res_y}",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Default,{font_name},{config.font_size},{primary_ass},{highlight_ass},{outline_ass},{shadow_ass},-1,0,0,0,100,100,1,0,1,{config.outline_width},{config.shadow_offset},{alignment},40,40,{margin_v},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ]

    for chunk in chunks:
        start_time_str = format_timestamp_ass(chunk.start)
        end_time_str = format_timestamp_ass(chunk.end)

        # Build karaoke words using ASS {\k<duration_in_centiseconds>} tags
        dialogue_parts = []
        for w in chunk.words:
            dur_centis = max(1, int(round((w.end - w.start) * 100)))
            display_word = w.word.upper() if config.uppercase else w.word
            if w.is_keyword:
                kw_ass = hex_to_ass_color(config.keyword_color)
                dialogue_parts.append(f"{{\\c{kw_ass}\\k{dur_centis}}}{display_word}")
            else:
                dialogue_parts.append(f"{{\\k{dur_centis}}}{display_word}")

        event_text = " ".join(dialogue_parts)
        ass_lines.append(f"Dialogue: 0,{start_time_str},{end_time_str},Default,,0,0,0,,{event_text}")

    return "\n".join(ass_lines)
