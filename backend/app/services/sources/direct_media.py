import asyncio
from pathlib import Path
from typing import Dict, Any, List, Optional
from urllib.parse import urlparse

from app.core.logging import logger
from app.services.sources.base import (
    BaseSourceProvider,
    SourceAnalysisResult,
    ConfirmedQualityOption,
    AuthorizedWorkflowInfo
)
from app.services.video.remote_stream_processor import remote_stream_processor

def format_duration(seconds: float) -> str:
    if not seconds or seconds <= 0:
        return "00:00"
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"

class DirectMediaSourceProvider(BaseSourceProvider):
    """
    Modular provider for direct cloud MP4/WebM HTTP(S) video URLs and CDN endpoints
    """

    def can_handle(self, url: str) -> bool:
        if not url:
            return False
        clean = url.lower().strip()
        parsed = urlparse(clean)
        path = parsed.path.lower()
        return any(path.endswith(ext) for ext in [".mp4", ".webm", ".mov", ".m4v", ".mkv"])

    async def analyze(self, raw_url: str) -> SourceAnalysisResult:
        clean = raw_url.strip()
        parsed = urlparse(clean)
        filename = Path(parsed.path).name or "Direct Video Stream"

        # Probe remote media headers & range support
        probe_res = await asyncio.to_thread(remote_stream_processor.probe_url, clean)
        duration = probe_res.get("duration", 60.0)
        file_size_mb = probe_res.get("file_size_mb", 0.0)
        size_bytes = int(file_size_mb * 1024 * 1024) if file_size_mb else None
        res_str = probe_res.get("resolution", "1080p Full HD")

        confirmed_qualities: List[ConfirmedQualityOption] = [
            ConfirmedQualityOption(
                format_id="best",
                label="Original Quality",
                resolution="Original quality",
                height=1080 if "1080" in res_str else 720,
                fps=probe_res.get("fps", 30.0),
                ext="mp4",
                filesize_bytes=size_bytes,
                filesize_formatted=f"{file_size_mb:.1f} MB" if file_size_mb else "Direct Stream",
                type="video",
                recommended=True,
                badge="Direct Master",
                source_confirmed=True
            )
        ]

        workflow = AuthorizedWorkflowInfo(
            is_owner_download_available=False,
            studio_url=None,
            studio_name="Cloud Media Server",
            official_guide_steps=[
                "This direct video link is hosted on a remote cloud storage or media CDN.",
                "Range-based HTTP chunk streaming is supported for direct processing without local pre-download.",
                "You can start AI clipping or save a local master directly using the Start Download button."
            ],
            disclaimer="Direct media file hosted on remote server with standard HTTP range access.",
            can_stream_download=True,
            copyright_license="Direct Web Media",
            requires_creator_auth=False
        )

        return SourceAnalysisResult(
            provider="direct_media",
            url=clean,
            video_id=f"direct_{abs(hash(clean)) % 10000000}",
            title=probe_res.get("title") or filename,
            thumbnail=None,
            thumbnails_all=None,
            channel_name=parsed.hostname or "Direct Host",
            channel_id=None,
            channel_url=f"{parsed.scheme}://{parsed.hostname}",
            duration=duration,
            duration_formatted=format_duration_sec(duration),
            published_date=None,
            published_date_formatted="Recent",
            view_count=0,
            view_count_formatted="Direct CDN",
            description=f"Direct HTTP media link from {parsed.hostname}",
            tags=["direct-stream", "mp4"],
            category="Video",
            license="Direct Media",
            is_creative_commons=False,
            is_live=False,
            workflow=workflow,
            confirmed_qualities=confirmed_qualities,
            api_source="direct_probe"
        )

direct_media_source_provider = DirectMediaSourceProvider()
