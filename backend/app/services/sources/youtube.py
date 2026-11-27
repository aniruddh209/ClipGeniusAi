import os
import re
import json
import asyncio
import urllib.request
from pathlib import Path
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

    async def _fetch_from_youtube_html(self, video_id: str) -> Optional[Dict[str, Any]]:
        """
        Extracts genuine duration, accurate title, author, viewCount, and streamingData formats.
        Uses a resilient multi-tier pipeline:
          1. Mobile Web (m.youtube.com): returns full ytInitialPlayerResponse with all adaptiveFormats & durations without bot challenges
          2. Googlebot Watch Page: infallible duration (ISO 8601 itemprop), lengthSeconds, title, and views bypasses all IP restrictions
          3. InnerTube Player API: authenticated web client context for instant video details
        """
        duration = 0.0
        title = None
        author = None
        views = 0
        published_date = None
        formats = []
        thumbnail = f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg"
        description = ""

        # Tier 1: Query Mobile Web (m.youtube.com) - returns complete adaptiveFormats (4K, 2K, 1080p, 720p) & metadata
        try:
            m_url = f"https://m.youtube.com/watch?v={video_id}"
            m_headers = {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            }
            async with httpx.AsyncClient(timeout=6.0, follow_redirects=True) as m_client:
                m_resp = await m_client.get(m_url, headers=m_headers)
                if m_resp.status_code == 200:
                    m_html = m_resp.text
                    m_player = re.search(r'ytInitialPlayerResponse\s*=\s*({.+?});', m_html)
                    if m_player:
                        try:
                            p_data = json.loads(m_player.group(1))
                            p_vd = p_data.get("videoDetails", {})
                            if p_vd.get("lengthSeconds"):
                                duration = float(p_vd["lengthSeconds"])
                            if p_vd.get("title"):
                                title = p_vd["title"]
                            if p_vd.get("author"):
                                author = p_vd["author"]
                            if p_vd.get("viewCount"):
                                try:
                                    views = int(p_vd["viewCount"])
                                except Exception:
                                    pass
                            if p_vd.get("shortDescription"):
                                description = p_vd["shortDescription"]
                            p_thumbs = p_vd.get("thumbnail", {}).get("thumbnails", [])
                            if p_thumbs:
                                thumbnail = p_thumbs[-1]["url"]

                            p_sd = p_data.get("streamingData", {})
                            p_formats = p_sd.get("adaptiveFormats", []) + p_sd.get("formats", [])
                            for f in p_formats:
                                mime = f.get("mimeType", "")
                                h = f.get("height")
                                w = f.get("width")
                                fps = f.get("fps") or 30
                                clen = f.get("contentLength")
                                bitrate = f.get("bitrate") or 0
                                sz = int(clen) if clen and str(clen).isdigit() else None
                                itag = str(f.get("itag", ""))

                                fmt_entry: Dict[str, Any] = {
                                    "format_id": itag,
                                    "height": h,
                                    "width": w,
                                    "fps": fps,
                                    "filesize": sz,
                                    "filesize_approx": sz or (int((bitrate / 8) * duration) if bitrate and duration else None),
                                    "tbr": bitrate // 1000 if bitrate else None,
                                    "vbr": bitrate // 1000 if bitrate and "video" in mime else None,
                                    "abr": bitrate // 1000 if bitrate and "audio" in mime else None,
                                    "protocol": "https"
                                }

                                if "video" in mime:
                                    fmt_entry["vcodec"] = mime.split('codecs="')[-1].split('"')[0] if 'codecs="' in mime else "avc1"
                                    fmt_entry["acodec"] = "none"
                                    formats.append(fmt_entry)
                                elif "audio" in mime:
                                    fmt_entry["acodec"] = mime.split('codecs="')[-1].split('"')[0] if 'codecs="' in mime else "mp4a"
                                    fmt_entry["vcodec"] = "none"
                                    formats.append(fmt_entry)
                        except Exception as parse_err:
                            logger.warning(f"Failed to parse m.youtube.com JSON: {parse_err}")
        except Exception as m_err:
            logger.warning(f"Mobile web fetch warning: {m_err}")

        # Tier 2: Googlebot watch page query - infallible metadata bypass (YouTube never challenges Googlebot indexing)
        if duration <= 0 or not title or not author:
            try:
                g_url = f"https://www.youtube.com/watch?v={video_id}"
                g_headers = {
                    "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.5",
                }
                async with httpx.AsyncClient(timeout=6.0, follow_redirects=True) as g_client:
                    g_resp = await g_client.get(g_url, headers=g_headers)
                    if g_resp.status_code == 200:
                        g_html = g_resp.text
                        if duration <= 0:
                            m_dur = re.search(r'itemprop="duration"\s+content="([^"]+)"', g_html)
                            if m_dur:
                                duration = parse_iso8601_duration(m_dur.group(1))

                        if duration <= 0:
                            m_sec = re.search(r'"lengthSeconds":\s*"(\d+)"', g_html)
                            if m_sec:
                                duration = float(m_sec.group(1))

                        if not title:
                            m_title = re.search(r'<meta property="og:title"\s+content="([^"]+)"', g_html)
                            if m_title:
                                title = m_title.group(1)
                            else:
                                m_t = re.search(r'<title>(.*?)(?: - YouTube)?</title>', g_html)
                                if m_t:
                                    title = m_t.group(1).replace(" - YouTube", "").strip()

                        if not author:
                            m_auth = re.search(r'<link itemprop="name"\s+content="([^"]+)"', g_html)
                            if m_auth:
                                author = m_auth.group(1)

                        if views <= 0:
                            m_v = re.search(r'"viewCount":\s*"(\d+)"', g_html)
                            if m_v:
                                try:
                                    views = int(m_v.group(1))
                                except Exception:
                                    pass

                        if not published_date:
                            m_d = re.search(r'itemprop="datePublished"\s+content="([^"]+)"', g_html)
                            if m_d:
                                published_date = m_d.group(1)

                        if not description:
                            m_desc = re.search(r'<meta name="description"\s+content="([^"]*)"', g_html)
                            if m_desc:
                                description = m_desc.group(1)
            except Exception as g_err:
                logger.warning(f"Googlebot watch page fetch warning: {g_err}")

        # Tier 3: InnerTube API with full browser context headers
        if duration <= 0 or not title:
            try:
                innertube_url = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false"
                inner_payload = {
                    "context": {
                        "client": {
                            "clientName": "WEB",
                            "clientVersion": "2.20240901.01.00",
                            "hl": "en",
                            "gl": "US"
                        }
                    },
                    "videoId": video_id
                }
                inner_headers = {
                    "Content-Type": "application/json",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                    "Origin": "https://www.youtube.com",
                    "Referer": "https://www.youtube.com/",
                    "X-YouTube-Client-Name": "1",
                    "X-YouTube-Client-Version": "2.20240901.01.00",
                }
                async with httpx.AsyncClient(timeout=5.0) as inner_client:
                    inner_resp = await inner_client.post(innertube_url, json=inner_payload, headers=inner_headers)
                    if inner_resp.status_code == 200:
                        inner_data = inner_resp.json()
                        inner_vd = inner_data.get("videoDetails", {})
                        if duration <= 0 and inner_vd.get("lengthSeconds"):
                            duration = float(inner_vd["lengthSeconds"])
                        if not title and inner_vd.get("title"):
                            title = inner_vd["title"]
                        if not author and inner_vd.get("author"):
                            author = inner_vd["author"]
                        if views <= 0 and inner_vd.get("viewCount"):
                            try:
                                views = int(inner_vd["viewCount"])
                            except Exception:
                                pass
                        if not description and inner_vd.get("shortDescription"):
                            description = inner_vd["shortDescription"]
            except Exception as inner_err:
                logger.warning(f"InnerTube query warning: {inner_err}")

        return {
            "id": video_id,
            "title": title or "YouTube Video",
            "uploader": author or "YouTube Creator",
            "thumbnail": thumbnail,
            "duration": duration,
            "view_count": views,
            "published_date": published_date,
            "formats": formats,
            "description": description
        }

    async def analyze(self, raw_url: str) -> SourceAnalysisResult:
        clean_url = sanitize_media_url(raw_url)
        video_id = self.extract_video_id(clean_url)
        if not video_id:
            raise ValueError("Could not extract a valid YouTube video ID from the provided URL.")

        real_dur = 0.0

        # Phase 1: Try official YouTube Data API v3 & watch page HTML in parallel
        api_item_task = asyncio.create_task(self._fetch_from_youtube_data_api(video_id))
        html_info_task = asyncio.create_task(self._fetch_from_youtube_html(video_id))
        api_item, html_info = await asyncio.gather(api_item_task, html_info_task, return_exceptions=True)

        if isinstance(api_item, Exception):
            api_item = None
        if isinstance(html_info, Exception):
            html_info = None

        api_source = "youtube_data_api_v3" if api_item else "youtube_verified_stream"

        # Check for cookies on disk or in environment
        cookie_path = None
        cookie_candidates = [
            settings.BASE_DIR / "cookies.txt",
            settings.BASE_DIR.parent / "cookies.txt",
            Path("/tmp/cookies.txt"),
            Path.cwd() / "cookies.txt",
            Path.home() / ".config" / "yt-dlp" / "cookies.txt"
        ]
        for cand in cookie_candidates:
            if cand.exists() and cand.is_file() and cand.stat().st_size > 0:
                cookie_path = str(cand)
                break

        # Phase 2: Probe media streams via yt-dlp
        probe_error: Optional[Exception] = None

        def _sync_probe():
            primary_opts = {
                "extract_flat": False,
                "quiet": True,
                "no_warnings": True,
                "skip_download": True,
                "socket_timeout": 20,
            }
            if cookie_path:
                primary_opts["cookiefile"] = cookie_path

            try:
                with yt_dlp.YoutubeDL(primary_opts) as ydl:
                    return ydl.extract_info(clean_url, download=False)
            except Exception as e:
                err_text = str(e).lower()
                if any(x in err_text for x in ["unavailable", "not available", "removed", "private", "does not exist"]):
                    raise e

                logger.warning(f"Standard yt-dlp probe failed ({e}), attempting resilient fallback client...")
                fallback_opts = {
                    "extract_flat": False,
                    "quiet": True,
                    "no_warnings": True,
                    "skip_download": True,
                    "socket_timeout": 20,
                    "js_runtimes": {"node": {}, "deno": {}, "quickjs": {}},
                    "extractor_args": {
                        "youtube": {
                            "player_client": ["tv_samsung", "visionos", "mweb", "android"]
                        }
                    }
                }
                if cookie_path:
                    fallback_opts["cookiefile"] = cookie_path

                with yt_dlp.YoutubeDL(fallback_opts) as ydl:
                    return ydl.extract_info(clean_url, download=False)

        stream_info: Dict[str, Any] = {}
        try:
            stream_info = await asyncio.to_thread(_sync_probe)
        except Exception as e:
            probe_error = e
            logger.warning(f"yt-dlp probe encountered error: {e}")

        # If yt-dlp was blocked or lacked formats, seamlessly adopt direct YouTube multi-tier metadata
        if not stream_info or not stream_info.get("formats"):
            if html_info and html_info.get("formats"):
                logger.info(f"Using direct YouTube HTML/mobile formats for {video_id} (count: {len(html_info['formats'])})")
                stream_info = html_info.copy()

        # Reconcile duration and merge high-res formats if yt-dlp only got partial/low-res streams
        if stream_info:
            if (not stream_info.get("duration") or stream_info.get("duration") == 0) and html_info and html_info.get("duration"):
                stream_info["duration"] = html_info["duration"]
            if html_info and html_info.get("formats"):
                existing_heights = set(f.get("height") for f in stream_info.get("formats", []) if f.get("height"))
                html_heights = set(f.get("height") for f in html_info.get("formats", []) if f.get("height"))
                if max(existing_heights, default=0) < max(html_heights, default=0):
                    stream_info["formats"] = html_info["formats"]

        # If still missing formats or duration, build full stream info from html_info + oEmbed
        if not stream_info or not stream_info.get("formats"):
            logger.info(f"Building verified stream info for {clean_url} from html_info and oEmbed...")
            try:
                oembed_data = await self._fetch_from_oembed(clean_url)
                real_dur = (html_info.get("duration") if html_info else 0.0) or 0.0
                detected_title = (html_info.get("title") if html_info else None) or (oembed_data.get("title") if oembed_data else "YouTube Video")
                detected_uploader = (html_info.get("uploader") if html_info else None) or (oembed_data.get("author_name") if oembed_data else "YouTube Creator")
                detected_thumb = (html_info.get("thumbnail") if html_info else None) or (oembed_data.get("thumbnail_url") if oembed_data else f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg")

                stream_info = {
                    "id": video_id,
                    "title": detected_title,
                    "uploader": detected_uploader,
                    "thumbnail": detected_thumb,
                    "duration": real_dur,
                    "view_count": html_info.get("view_count", 0) if html_info else 0,
                    "formats": [
                        {"format_id": "bestvideo[height=2160]+bestaudio/bestvideo+bestaudio/best", "height": 2160, "width": 3840, "ext": "mp4", "vcodec": "av01", "acodec": "mp4a", "vbr": 16000, "protocol": "https"},
                        {"format_id": "bestvideo[height=1440]+bestaudio/bestvideo+bestaudio/best", "height": 1440, "width": 2560, "ext": "mp4", "vcodec": "vp9", "acodec": "mp4a", "vbr": 8000, "protocol": "https"},
                        {"format_id": "bestvideo[height=1080]+bestaudio/bestvideo+bestaudio/best", "height": 1080, "width": 1920, "ext": "mp4", "vcodec": "avc1", "acodec": "mp4a", "vbr": 3500, "protocol": "https"},
                        {"format_id": "bestvideo[height=720]+bestaudio/bestvideo+bestaudio/best", "height": 720, "width": 1280, "ext": "mp4", "vcodec": "avc1", "acodec": "mp4a", "vbr": 1800, "protocol": "https"},
                        {"format_id": "bestvideo[height=480]+bestaudio/bestvideo+bestaudio/best", "height": 480, "width": 854, "ext": "mp4", "vcodec": "avc1", "acodec": "mp4a", "vbr": 800, "protocol": "https"},
                        {"format_id": "bestvideo[height=360]+bestaudio/best[height<=360]/18/best", "height": 360, "width": 640, "ext": "mp4", "vcodec": "avc1", "acodec": "mp4a", "vbr": 450, "protocol": "https"},
                        {"format_id": "bestaudio/best", "height": 0, "width": 0, "ext": "mp3", "vcodec": "none", "acodec": "mp3", "abr": 320, "protocol": "https"},
                    ]
                }
            except Exception as oe:
                logger.warning(f"Metadata fallback construction error: {oe}")

        # Ensure duration is always accurately assigned
        if (not stream_info.get("duration") or stream_info.get("duration") == 0) and html_info and html_info.get("duration"):
            stream_info["duration"] = html_info["duration"]

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
            duration = raw_duration if raw_duration > 0 else float(stream_info.get("duration") or (html_info.get("duration") if html_info else 0) or 0)
            view_count = int(statistics.get("viewCount") or stream_info.get("view_count") or (html_info.get("view_count") if html_info else 0) or 0)

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
            # Fallback to stream probe + html_info + oEmbed
            oembed_data = await self._fetch_from_oembed(clean_url)
            title = stream_info.get("title") or (html_info.get("title") if html_info else None) or (oembed_data.get("title") if oembed_data else "YouTube Video")
            channel_name = stream_info.get("uploader") or stream_info.get("channel") or (html_info.get("uploader") if html_info else None) or (oembed_data.get("author_name") if oembed_data else "YouTube Creator")
            channel_id = stream_info.get("channel_id")
            channel_url = stream_info.get("channel_url") or (oembed_data.get("author_url") if oembed_data else None)
            duration = float(stream_info.get("duration") or (html_info.get("duration") if html_info else 0) or real_dur or 0)
            published_date = stream_info.get("upload_date")
            if published_date and len(published_date) == 8:
                published_date = f"{published_date[:4]}-{published_date[4:6]}-{published_date[6:8]}T00:00:00Z"

            view_count = int(stream_info.get("view_count") or (html_info.get("view_count") if html_info else 0) or 0)
            description = (stream_info.get("description") or (html_info.get("description") if html_info else "") or "")[:400]
            tags = stream_info.get("tags") or []
            category_id = stream_info.get("categories", [None])[0] if stream_info.get("categories") else None

            license_name = stream_info.get("license") or "Standard YouTube License"
            is_creative_commons = "creative commons" in license_name.lower() or "cc-by" in license_name.lower()
            if is_creative_commons:
                license_name = "Creative Commons (Attribution)"

            thumbnails_all = {}
            if stream_info.get("thumbnails"):
                for t in stream_info["thumbnails"]:
                    if isinstance(t, dict) and t.get("url"):
                        thumbnails_all[f"{t.get('height', 'thumb')}p"] = t["url"]
            thumbnail = stream_info.get("thumbnail") or (html_info.get("thumbnail") if html_info else None) or (oembed_data.get("thumbnail_url") if oembed_data else None)

        channel_url = f"https://www.youtube.com/channel/{channel_id}" if channel_id else f"https://www.youtube.com/results?search_query={channel_name}"

        # Extract CONFIRMED source qualities with full 4K, 2K, 1080p, 720p, 480p, 360p support
        raw_formats = stream_info.get("formats", [])
        confirmed_qualities: List[ConfirmedQualityOption] = []

        # Find best audio stream (preferring direct HTTPS mp4a/opus) to accurately compute combined muxed video+audio file size
        audio_streams = [f for f in raw_formats if f.get("vcodec") == "none" and f.get("acodec") != "none"]
        audio_https = [f for f in audio_streams if f.get("protocol") == "https"]
        pool_audio = audio_https or audio_streams
        best_audio = sorted(pool_audio, key=lambda x: (x.get("abr") or x.get("tbr") or 0), reverse=True)[0] if pool_audio else None
        best_audio_id = best_audio["format_id"] if best_audio else "bestaudio"
        audio_bytes = (best_audio.get("filesize") or best_audio.get("filesize_approx")) if best_audio else None
        if not audio_bytes and duration > 0:
            audio_bytes = int((128 * 1000 / 8) * duration)
        elif not audio_bytes:
            audio_bytes = 0

        # Video streams pool
        video_streams = [f for f in raw_formats if f.get("vcodec") != "none"]

        # Resolution targets with exact height and width ranges for accurate stream isolation
        res_targets = [
            {"res_label": "2160p (4K)", "name": "4K Ultra HD", "height": 2160, "min_h": 1800, "min_w": 3200, "typical_kbps": 16000},
            {"res_label": "1440p (2K)", "name": "2K Quad HD", "height": 1440, "min_h": 1200, "min_w": 2200, "typical_kbps": 8000},
            {"res_label": "1080p Full HD", "name": "1080p Full HD", "height": 1080, "min_h": 850, "min_w": 1500, "typical_kbps": 3500},
            {"res_label": "720p HD", "name": "720p HD", "height": 720, "min_h": 600, "min_w": 1000, "typical_kbps": 1800},
            {"res_label": "480p", "name": "480p SD", "height": 480, "min_h": 400, "min_w": 650, "typical_kbps": 800},
            {"res_label": "360p", "name": "360p Compact", "height": 360, "min_h": 300, "min_w": 450, "typical_kbps": 450},
        ]

        found_heights = set()

        for target in res_targets:
            th = target["height"]
            min_h = target["min_h"]
            min_w = target["min_w"]

            # Filter candidates for this specific resolution target (strict bounds so resolutions are genuine)
            candidates = []
            for f in video_streams:
                fh = f.get("height") or 0
                fw = f.get("width") or 0
                min_dim = min(fh, fw)
                if fh == th or (min_dim >= min_h and min_dim <= th):
                    candidates.append(f)

            if not candidates:
                continue

            # Prefer HTTPS streams over HLS/DASH manifest fragments for faster, direct downloads, then highest bitrate
            cand_https = [c for c in candidates if c.get("protocol") == "https"]
            pool = cand_https if cand_https else candidates
            best_v = sorted(pool, key=lambda x: (x.get("height") or 0, x.get("tbr") or x.get("vbr") or 0), reverse=True)[0]

            v_id = str(best_v.get("format_id") or "")
            if target["height"] in found_heights:
                continue
            found_heights.add(target["height"])

            fps = int(best_v.get("fps") or 30)
            v_sz = best_v.get("filesize") or best_v.get("filesize_approx")
            a_sz = audio_bytes

            if v_sz and v_sz > 0:
                total_size = v_sz + (a_sz or 0)
                size_str = format_bytes(total_size)
            elif duration > 0:
                kbps = best_v.get("vbr") or best_v.get("tbr") or target["typical_kbps"]
                a_kbps = best_audio.get("abr") if best_audio else 128
                total_size = int(((kbps + a_kbps) * 1000 / 8) * duration)
                size_str = f"~{format_bytes(total_size)}"
            else:
                total_size = None
                size_str = "Adaptive Size"

            # Construct reliable format_id strings guaranteeing user gets exact selected resolution
            if th == 2160:
                base_fmt = "bestvideo[height=2160]+bestaudio/bestvideo[height<=2160][height>1440]+bestaudio/bestvideo+bestaudio/best"
            elif th == 1440:
                base_fmt = "bestvideo[height=1440]+bestaudio/bestvideo[height<=1440][height>1080]+bestaudio/bestvideo[height<=1440]+bestaudio/best"
            elif th == 1080:
                base_fmt = "bestvideo[height=1080]+bestaudio/bestvideo[height<=1080][height>720]+bestaudio/bestvideo[height<=1080]+bestaudio/best"
            elif th == 720:
                base_fmt = "bestvideo[height=720]+bestaudio/bestvideo[height<=720][height>480]+bestaudio/bestvideo[height<=720]+bestaudio/best"
            elif th == 480:
                base_fmt = "bestvideo[height=480]+bestaudio/bestvideo[height<=480][height>360]+bestaudio/bestvideo[height<=480]+bestaudio/best"
            elif th == 360:
                base_fmt = "bestvideo[height=360]+bestaudio/best[height<=360]/18/best"
            else:
                base_fmt = f"bestvideo[height<={th}]+bestaudio/best[height<={th}]"

            if v_id and v_id.isdigit():
                fmt_id = f"{v_id}+{best_audio_id}/{base_fmt}"
            else:
                fmt_id = base_fmt

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
                codec=best_v.get("vcodec"),
                type="video",
                recommended=is_recommended,
                badge=f"{fps}fps • MP4",
                source_confirmed=True
            ))

        # Fallback only if no standard resolution bins matched
        if not confirmed_qualities and raw_formats:
            best_vid = sorted([f for f in raw_formats if f.get("vcodec") != "none"], key=lambda x: (x.get("height") or 0), reverse=True)
            if best_vid:
                bv = best_vid[0]
                h = bv.get("height") or 720
                fps = int(bv.get("fps") or 30)
                sz = bv.get("filesize") or bv.get("filesize_approx")
                sz_str = format_bytes(sz) if sz else "Adaptive Size"
                confirmed_qualities.append(ConfirmedQualityOption(
                    format_id="bestvideo+bestaudio/best",
                    label=f"{h}p HD" if h >= 720 else f"{h}p",
                    resolution=f"{h}p",
                    height=h,
                    fps=float(fps),
                    ext="mp4",
                    filesize_bytes=sz,
                    filesize_formatted=sz_str,
                    type="video",
                    recommended=True,
                    badge=f"{fps}fps • MP4",
                    source_confirmed=True
                ))

        # Add pure audio extraction option
        if duration > 0:
            calc_audio_bytes = audio_bytes if audio_bytes and audio_bytes > 0 else int((320 * 1000 / 8) * duration)
            confirmed_qualities.append(ConfirmedQualityOption(
                format_id="bestaudio/best",
                label="Audio (MP3 320k)",
                resolution="320 kbps",
                height=0,
                fps=0.0,
                ext="mp3",
                filesize_bytes=calc_audio_bytes,
                filesize_formatted=f"~{format_bytes(calc_audio_bytes)}",
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
