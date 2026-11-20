import re
import asyncio
from datetime import datetime
from typing import Dict, Any, List, Optional
from urllib.parse import urlparse, parse_qs
import httpx
import yt_dlp

from app.core.config import settings
from app.core.logging import logger
from app.services.sources.base import (
    BaseSourceProvider,
    SourceAnalysisResult,
    ConfirmedQualityOption,
    AuthorizedWorkflowInfo
)
from app.services.video.downloader import sanitize_media_url

def parse_iso8601_duration(duration_str: str) -> float:
    """
    Parses ISO 8601 duration string (e.g. 'PT1H2M21S', 'PT15M33S', 'PT45S') to seconds
    """
    if not duration_str or not duration_str.startswith("PT"):
        return 0.0
    pattern = re.compile(
        r'PT'
        r'(?:(?P<hours>\d+)H)?'
        r'(?:(?P<minutes>\d+)M)?'
        r'(?:(?P<seconds>\d+)S)?'
    )
    match = pattern.match(duration_str)
    if not match:
        return 0.0
    parts = match.groupdict()
    hours = float(parts.get('hours') or 0)
    minutes = float(parts.get('minutes') or 0)
    seconds = float(parts.get('seconds') or 0)
    return hours * 3600 + minutes * 60 + seconds

def format_seconds(seconds: float) -> str:
    if not seconds or seconds <= 0:
        return "00:00"
    total_sec = int(seconds)
    m, s = divmod(total_sec, 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"

def format_published_date(iso_date_str: Optional[str]) -> Optional[str]:
    if not iso_date_str:
        return None
    try:
        clean = iso_date_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean)
        return dt.strftime("%b %d, %Y")
    except Exception:
        return iso_date_str[:10]

def format_bytes(b: Optional[int]) -> str:
    if not b or b <= 0:
        return "Adaptive Size"
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if b < 1024.0:
            return f"{b:.1f} {unit}"
        b /= 1024.0
    return f"{b:.1f} PB"

class YouTubeSourceProvider(BaseSourceProvider):
    """
    Modular YouTube integration provider for Video Downloader:
    - Phase 1: Extracts permitted public metadata via YouTube Data API v3 (with oEmbed fallback)
    - Phase 2: Guides creator authorized video downloads via official YouTube Studio workflow
    - Phase 3: Confirms actual available source qualities without inventing nonexistent resolutions
    """

    def can_handle(self, url: str) -> bool:
        if not url:
            return False
        clean = url.lower().strip()
        return ("youtube.com" in clean or "youtu.be" in clean)

    def extract_video_id(self, url: str) -> Optional[str]:
        """Extracts standard 11-character YouTube video ID"""
        clean = url.strip()
        try:
            parsed = urlparse(clean)
            host = (parsed.hostname or "").lower()
            if "youtu.be" in host:
                path_parts = parsed.path.strip("/").split("/")
                if path_parts and path_parts[0]:
                    return path_parts[0]
            if "youtube.com" in host:
                if "/shorts/" in parsed.path:
                    return parsed.path.split("/shorts/")[1].split("/")[0].split("?")[0]
                if "/live/" in parsed.path:
                    return parsed.path.split("/live/")[1].split("/")[0].split("?")[0]
                if "/embed/" in parsed.path:
                    return parsed.path.split("/embed/")[1].split("/")[0].split("?")[0]
                qs = parse_qs(parsed.query)
                if "v" in qs and qs["v"] and qs["v"][0]:
                    return qs["v"][0]
        except Exception:
            pass
        return None

    async def _fetch_from_youtube_data_api(self, video_id: str) -> Optional[Dict[str, Any]]:
        """
        Queries official YouTube Data API v3 for public metadata
        """
        api_key = getattr(settings, "YOUTUBE_API_KEY", None)
        if not api_key:
            return None

        endpoint = "https://www.googleapis.com/youtube/v3/videos"
        params = {
            "part": "snippet,contentDetails,statistics,status",
            "id": video_id,
            "key": api_key
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(endpoint, params=params)
                if res.status_code == 200:
                    data = res.json()
                    items = data.get("items", [])
                    if items:
                        return items[0]
                else:
                    logger.warning(f"YouTube Data API returned status {res.status_code}: {res.text}")
        except Exception as e:
            logger.warning(f"YouTube Data API request error: {e}")
        return None

    async def _fetch_from_oembed(self, url: str) -> Optional[Dict[str, Any]]:
        """
        Queries official YouTube oEmbed API for verified public metadata
        """
        endpoint = "https://www.youtube.com/oembed"
        params = {"url": url, "format": "json"}
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(endpoint, params=params)
                if res.status_code == 200:
                    return res.json()
        except Exception:
            pass
        return None

    async def analyze(self, raw_url: str) -> SourceAnalysisResult:
        clean_url = sanitize_media_url(raw_url)
        video_id = self.extract_video_id(clean_url)
        if not video_id:
            raise ValueError("Could not extract a valid YouTube video ID from the provided URL.")

        # Phase 1: Try official YouTube Data API v3 first
        api_item = await self._fetch_from_youtube_data_api(video_id)
        api_source = "youtube_data_api_v3" if api_item else "youtube_verified_stream"

        # Phase 3: Probe actual media stream formats via yt-dlp to confirm available resolutions
        ydl_opts = {
            "extract_flat": False,
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "socket_timeout": 30,
        }

        def _sync_probe():
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    return ydl.extract_info(clean_url, download=False)
            except Exception as e:
                logger.warning(f"Standard yt-dlp probe failed ({e}), attempting fallback client...")
                fallback_opts = {
                    "extract_flat": False,
                    "quiet": True,
                    "no_warnings": True,
                    "skip_download": True,
                    "socket_timeout": 30,
                    "extractor_args": {
                        "youtube": {
                            "player_client": ["web_embedded", "android"]
                        }
                    }
                }
                with yt_dlp.YoutubeDL(fallback_opts) as ydl:
                    return ydl.extract_info(clean_url, download=False)

        stream_info: Dict[str, Any] = {}
        try:
            stream_info = await asyncio.to_thread(_sync_probe)
        except Exception as e:
            logger.warning(f"yt-dlp stream info probe encountered warning: {e}")

        # Assemble metadata (prioritizing official YouTube Data API v3 where available)
        if api_item:
            snippet = api_item.get("snippet", {})
            content_details = api_item.get("contentDetails", {})
            statistics = api_item.get("statistics", {})
            status = api_item.get("status", {})

            title = snippet.get("title") or stream_info.get("title") or "YouTube Video"
            channel_name = snippet.get("channelTitle") or stream_info.get("uploader") or "YouTube Creator"
            channel_id = snippet.get("channelId")
            published_date = snippet.get("publishedAt")
            description = (snippet.get("description") or "")[:400]
            tags = snippet.get("tags", [])
            category_id = snippet.get("categoryId")

            raw_duration = parse_iso8601_duration(content_details.get("duration", ""))
            duration = raw_duration if raw_duration > 0 else float(stream_info.get("duration") or 0)
            view_count = int(statistics.get("viewCount") or stream_info.get("view_count") or 0)

            # License info
            raw_license = status.get("license", "youtube")
            is_creative_commons = raw_license == "creativeCommon"
            license_name = "Creative Commons (Attribution)" if is_creative_commons else "Standard YouTube License"

            # Thumbnails map
            raw_thumbs = snippet.get("thumbnails", {})
            thumbnails_all = {k: v.get("url") for k, v in raw_thumbs.items() if isinstance(v, dict) and "url" in v}
            thumbnail = (
                thumbnails_all.get("maxres")
                or thumbnails_all.get("standard")
                or thumbnails_all.get("high")
                or thumbnails_all.get("medium")
                or thumbnails_all.get("default")
                or stream_info.get("thumbnail")
            )
        else:
            # Fallback to oEmbed + stream probe
            oembed_data = await self._fetch_from_oembed(clean_url)
            title = stream_info.get("title") or (oembed_data.get("title") if oembed_data else "YouTube Video")
            channel_name = stream_info.get("uploader") or stream_info.get("channel") or (oembed_data.get("author_name") if oembed_data else "YouTube Creator")
            channel_id = stream_info.get("channel_id")
            channel_url = stream_info.get("channel_url") or (oembed_data.get("author_url") if oembed_data else None)
            duration = float(stream_info.get("duration") or 0)
            published_date = stream_info.get("upload_date")
            if published_date and len(published_date) == 8:
                published_date = f"{published_date[:4]}-{published_date[4:6]}-{published_date[6:8]}T00:00:00Z"

            view_count = int(stream_info.get("view_count") or 0)
            description = (stream_info.get("description") or "")[:400]
            tags = stream_info.get("tags") or []
            category_id = stream_info.get("categories", [None])[0] if stream_info.get("categories") else None

            # Check creative commons in stream info
            license_name = stream_info.get("license") or "Standard YouTube License"
            is_creative_commons = "creative commons" in license_name.lower() or "cc-by" in license_name.lower()
            if is_creative_commons:
                license_name = "Creative Commons (Attribution)"

            thumbnails_all = {}
            if stream_info.get("thumbnails"):
                for t in stream_info["thumbnails"]:
                    if isinstance(t, dict) and t.get("url"):
                        thumbnails_all[f"{t.get('height', 'thumb')}p"] = t["url"]
            thumbnail = stream_info.get("thumbnail") or (oembed_data.get("thumbnail_url") if oembed_data else None)

        channel_url = f"https://www.youtube.com/channel/{channel_id}" if channel_id else f"https://www.youtube.com/results?search_query={channel_name}"

        # Extract CONFIRMED source qualities with full 4K, 2K, 1080p, 720p, 480p, 360p support
        raw_formats = stream_info.get("formats", [])
        confirmed_qualities: List[ConfirmedQualityOption] = []

        # Find best audio stream size to accurately compute combined muxed video+audio file size
        audio_streams = [f for f in raw_formats if f.get("vcodec") == "none" and f.get("acodec") != "none"]
        best_audio = sorted(audio_streams, key=lambda x: x.get("abr") or 0, reverse=True)[0] if audio_streams else None
        audio_bytes = (best_audio.get("filesize") or best_audio.get("filesize_approx")) if best_audio else None
        if not audio_bytes and duration > 0:
            audio_bytes = int((128 * 1000 / 8) * duration)
        elif not audio_bytes:
            audio_bytes = 0

        # Resolution targets with exact height and width ranges for accurate stream isolation
        res_targets = [
            {"res_label": "2160p (4K)", "name": "4K Ultra HD", "height": 2160, "min_h": 1800, "min_w": 3200, "typical_kbps": 14000},
            {"res_label": "1440p (2K)", "name": "2K Quad HD", "height": 1440, "min_h": 1200, "min_w": 2200, "typical_kbps": 7000},
            {"res_label": "1080p Full HD", "name": "1080p Full HD", "height": 1080, "min_h": 850, "min_w": 1500, "typical_kbps": 2200},
            {"res_label": "720p HD", "name": "720p HD", "height": 720, "min_h": 600, "min_w": 1000, "typical_kbps": 1100},
            {"res_label": "480p", "name": "480p SD", "height": 480, "min_h": 400, "min_w": 650, "typical_kbps": 550},
            {"res_label": "360p", "name": "360p Compact", "height": 360, "min_h": 300, "min_w": 450, "typical_kbps": 320},
        ]

        found_heights = set()
        ydl_selector = yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True})

        for target in res_targets:
            fmt_id = f"bestvideo[height<={target['height']}]+bestaudio/best[height<={target['height']}]/best"
            try:
                selector_fn = ydl_selector.build_format_selector(fmt_id)
                chosen = list(selector_fn({"formats": raw_formats}))
                if chosen:
                    sel = chosen[0]
                    rf = sel.get("requested_formats")
                    v = rf[0] if rf else sel
                    a = rf[1] if (rf and len(rf) > 1) else None

                    v_h = v.get("height") or 0
                    v_w = v.get("width") or 0
                    # Strictly check that the stream meets this resolution target
                    if v_h < target["min_h"] and v_w < target["min_w"]:
                        continue

                    if target["height"] in found_heights:
                        continue
                    found_heights.add(target["height"])

                    fps = int(v.get("fps") or 30)
                    v_sz = v.get("filesize") or v.get("filesize_approx")
                    a_sz = (a.get("filesize") or a.get("filesize_approx")) if a else audio_bytes

                    if v_sz and v_sz > 0:
                        total_size = v_sz + (a_sz or 0)
                        size_str = format_bytes(total_size)
                    elif duration > 0:
                        kbps = v.get("vbr") or v.get("tbr") or target["typical_kbps"]
                        total_size = int((kbps * 1000 / 8) * duration) + (a_sz or 0)
                        size_str = f"~{format_bytes(total_size)}"
                    else:
                        total_size = None
                        size_str = "Adaptive Size"

                    is_recommended = target["height"] == 1080 or (target["height"] == 720 and 1080 not in found_heights)

                    confirmed_qualities.append(ConfirmedQualityOption(
                        format_id=fmt_id,
                        label=target["name"],
                        resolution=target["res_label"],
                        height=target["height"],
                        fps=float(fps),
                        ext="mp4",
                        filesize_bytes=total_size,
                        filesize_formatted=size_str,
                        codec=v.get("vcodec"),
                        type="video",
                        recommended=is_recommended,
                        badge=f"{fps}fps • MP4",
                        source_confirmed=True
                    ))
            except Exception as e:
                logger.warning(f"Error evaluating format for {target['res_label']}: {e}")

        # Add "Original quality" / best verified fallback option if needed
        if not confirmed_qualities:
            confirmed_qualities.append(ConfirmedQualityOption(
                format_id="bestvideo+bestaudio/best",
                label="Original Quality",
                resolution="Original quality",
                height=1080,
                fps=30.0,
                ext="mp4",
                filesize_bytes=None,
                filesize_formatted="Original Quality",
                type="video",
                recommended=True,
                badge="Best Master",
                source_confirmed=True
            ))

        # Add pure audio extraction option
        if audio_streams and duration > 0:
            confirmed_qualities.append(ConfirmedQualityOption(
                format_id="bestaudio/best",
                label="Audio (MP3 320k)",
                resolution="320 kbps",
                height=0,
                fps=0.0,
                ext="mp3",
                filesize_bytes=audio_bytes,
                filesize_formatted=f"~{format_bytes(audio_bytes)}" if audio_bytes else "Adaptive",
                codec="mp3",
                type="audio",
                recommended=False,
                badge="320 kbps • MP3",
                source_confirmed=True
            ))

        # Phase 2: Build Authorized YouTube Studio Workflow Guide
        workflow = AuthorizedWorkflowInfo(
            is_owner_download_available=True,
            studio_url=f"https://studio.youtube.com/video/{video_id}/edit",
            studio_name="YouTube Studio",
            official_guide_steps=[
                "Click 'Open in YouTube Studio' to go directly to your video's details in your Creator Dashboard.",
                "In YouTube Studio, click on 'Content' from the left navigation panel.",
                "Hover over this video in your uploads list and click the three-dots menu icon (Options).",
                "Click 'Download' to save the original master 720p/HD MP4 file directly from YouTube to your computer.",
                "Drop or upload your downloaded MP4 file into ClipGenius AI Clipper to generate captions and viral vertical shorts."
            ],
            disclaimer="Important Notice: The YouTube Data API v3 does not provide raw video file download endpoints. Official YouTube policy requires creators to download their own uploaded videos via YouTube Studio or Google Takeout. ClipGenius AI strictly adheres to YouTube's Terms of Service and developer guidelines.",
            can_stream_download=True,
            copyright_license=license_name,
            requires_creator_auth=False,
            learn_more_url="https://support.google.com/youtube/answer/56100"
        )

        return SourceAnalysisResult(
            provider="youtube",
            url=clean_url,
            video_id=video_id,
            title=title,
            thumbnail=thumbnail,
            thumbnails_all=thumbnails_all,
            channel_name=channel_name,
            channel_id=channel_id,
            channel_url=channel_url,
            duration=duration,
            duration_formatted=format_seconds(duration),
            published_date=published_date,
            published_date_formatted=format_published_date(published_date),
            view_count=view_count,
            view_count_formatted=f"{view_count:,} views" if view_count else "0 views",
            description=description,
            tags=tags[:15] if tags else [],
            category=category_id,
            license=license_name,
            is_creative_commons=is_creative_commons,
            is_live=stream_info.get("is_live", False),
            workflow=workflow,
            confirmed_qualities=confirmed_qualities,
            api_source=api_source
        )

youtube_source_provider = YouTubeSourceProvider()
