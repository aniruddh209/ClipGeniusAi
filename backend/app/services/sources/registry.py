from typing import List, Optional
from app.services.sources.base import BaseSourceProvider, SourceAnalysisResult
from app.services.sources.youtube import youtube_source_provider
from app.services.sources.direct_media import direct_media_source_provider

class SourceRegistry:
    """
    Registry for modular video source integrations (YouTube, Direct Media, Vimeo, etc.)
    """

    def __init__(self):
        self._providers: List[BaseSourceProvider] = [
            youtube_source_provider,
            direct_media_source_provider
        ]

    def register(self, provider: BaseSourceProvider):
        self._providers.append(provider)

    def get_provider(self, url: str) -> Optional[BaseSourceProvider]:
        for p in self._providers:
            if p.can_handle(url):
                return p
        # Default to YouTube provider if unrecognized, which handles general extraction
        return youtube_source_provider

    async def analyze(self, url: str) -> SourceAnalysisResult:
        provider = self.get_provider(url)
        if not provider:
            raise ValueError(f"No registered source provider can handle URL: {url}")
        return await provider.analyze(url)

source_registry = SourceRegistry()
