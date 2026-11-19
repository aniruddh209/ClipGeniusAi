import os
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Optional, Callable
from app.core.config import settings
from app.core.logging import logger
from app.services.video.ffmpeg_editor import ffmpeg_editor

class WhisperTranscriber:
    def __init__(self):
        # Cache for loaded models by model_name (tiny, base, small, etc.)
        self._models: Dict[str, Any] = {}
        self.default_model = settings.WHISPER_MODEL
        self.device = settings.WHISPER_DEVICE

    def get_or_load_model(self, model_size: Optional[str] = None):
        """
        Loads the Faster-Whisper model into memory.
        Uses 8-bit quantization ('int8') and multi-threaded CPU execution for 5x faster inference.
        """
        target_model = model_size or self.default_model
        if target_model not in self._models:
            from faster_whisper import WhisperModel
            threads = min(8, os.cpu_count() or 4)
            logger.info(f"Loading Faster-Whisper model '{target_model}' (device='{self.device}', compute_type='int8', cpu_threads={threads})...")
            self._models[target_model] = WhisperModel(
                target_model,
                device=self.device,
                compute_type="int8",
                cpu_threads=threads
            )
            logger.info(f"Faster-Whisper '{target_model}' model ready.")
        return self._models[target_model]

    async def transcribe_video(
        self,
        video_path: str,
        audio_path: Optional[str] = None,
        model_size: Optional[str] = None,
        language: Optional[str] = None,
        max_duration: Optional[float] = None,
        progress_callback: Optional[Callable[[str, int], None]] = None
    ) -> Dict[str, Any]:
        """
        Full 5-step transcription pipeline:
        1. Extract 16kHz mono WAV from video via FFmpeg (optionally capped to max_duration for instant processing)
        2. Load Faster-Whisper model
        3. Run VAD-filtered speech recognition with real-time streaming progress
        4. Detect language automatically
        5. Structure segments, words, and speaker turns
        """
        model_name = model_size or self.default_model

        # Step 1: Resolve or extract 16kHz mono WAV audio
        target_audio = audio_path
        if not target_audio or not os.path.exists(target_audio):
            is_url = str(video_path).startswith("http://") or str(video_path).startswith("https://")
            if is_url:
                from app.services.video.remote_stream_processor import remote_stream_processor
                from app.core.config import settings
                target_audio = str(settings.UPLOAD_DIR / f"temp_{uuid.uuid4().hex[:8]}.wav")
                await remote_stream_processor.extract_remote_audio_stream(str(video_path), target_audio, max_duration=max_duration)
            else:
                video_p = Path(video_path)
                if not video_p.exists():
                    raise FileNotFoundError(f"Video file not found at {video_path}")

                if progress_callback:
                    progress_callback("Extracting 16kHz audio with FFmpeg...", 15)

                target_audio = str(video_p.with_suffix(".wav"))
                try:
                    await ffmpeg_editor.extract_audio(str(video_p), target_audio, max_duration=max_duration)
                except Exception as e:
                    logger.error(f"Audio extraction failed for {video_path}: {e}")
                    raise RuntimeError(f"FFmpeg failed to extract audio track: {e}")
        else:
            if progress_callback:
                progress_callback("Using extracted audio stream...", 20)

        # Step 2: Load Faster-Whisper model
        if progress_callback:
            progress_callback(f"Loading Faster-Whisper ({model_name} model)...", 35)

        loop = asyncio.get_event_loop()

        def _run_whisper():
            model = self.get_or_load_model(model_name)
            
            if progress_callback:
                progress_callback("Transcribing audio and computing word-level timestamps...", 60)

            # Transcribe with greedy decoding (beam_size=1) for 4x-5x speedup & VAD speech filtering
            transcribe_kwargs = {
                "beam_size": 1,
                "best_of": 1,
                "temperature": 0.0,
                "word_timestamps": True,
                "vad_filter": True,
                "vad_parameters": dict(min_silence_duration_ms=450)
            }
            if language:
                transcribe_kwargs["language"] = language

            segments_gen, info = model.transcribe(
                str(target_audio),
                **transcribe_kwargs
            )

            segments_list = []
            full_text_parts = []
            total_words_count = 0
            
            # Speaker turn attribution (heuristic based on pause gap > 1.4s)
            current_speaker_num = 1
            last_end_time = 0.0
            audio_total_sec = info.duration or 1.0

            for seg in segments_gen:
                seg_text = seg.text.strip()
                if not seg_text:
                    continue

                # Detect speaker change on significant pause (> 1.4 seconds)
                if last_end_time > 0 and (seg.start - last_end_time) > 1.4:
                    current_speaker_num = 2 if current_speaker_num == 1 else 1

                words = []
                if seg.words:
                    for w in seg.words:
                        clean_word = w.word.strip()
                        if clean_word:
                            words.append({
                                "word": clean_word,
                                "start": round(float(w.start), 2),
                                "end": round(float(w.end), 2),
                                "probability": round(float(w.probability), 2),
                            })
                            total_words_count += 1

                segment_item = {
                    "id": seg.id,
                    "start": round(float(seg.start), 2),
                    "end": round(float(seg.end), 2),
                    "text": seg_text,
                    "speaker": f"Speaker {current_speaker_num}",
                    "words": words
                }

                segments_list.append(segment_item)
                full_text_parts.append(seg_text)
                last_end_time = seg.end

                # Stream live progress updates to the caller
                if progress_callback:
                    cur_pct = min(98, max(5, int((seg.end / audio_total_sec) * 100)))
                    progress_callback(
                        f"Transcribing speech ({int(seg.end)}s / {int(audio_total_sec)}s) • {total_words_count} words",
                        cur_pct
                    )

            has_speech = len(segments_list) > 0
            full_transcript = " ".join(full_text_parts) if has_speech else "No speech detected in this audio."

            return {
                "has_speech": has_speech,
                "language": info.language if has_speech else "unknown",
                "language_probability": round(float(info.language_probability), 2) if has_speech else 0.0,
                "duration": round(float(info.duration), 2),
                "model_used": model_name,
                "full_text": full_transcript,
                "segments": segments_list,
                "total_words": total_words_count,
            }

        try:
            result = await loop.run_in_executor(None, _run_whisper)
            if progress_callback:
                progress_callback("Transcription completed successfully.", 100)
            return result
        except Exception as e:
            logger.error(f"Whisper inference error: {e}")
            raise e
        finally:
            # Clean up temporary auto-generated WAV file if caller did not supply audio_path
            if not audio_path and target_audio and os.path.exists(target_audio):
                try:
                    os.remove(target_audio)
                except Exception:
                    pass

whisper_transcriber = WhisperTranscriber()
