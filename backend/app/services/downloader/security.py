import os
import socket
import ipaddress
import shutil
import re
from pathlib import Path
from urllib.parse import urlparse
from typing import Optional
import httpx

from app.core.logging import logger

BLOCKED_IP_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.0.0.0/24"),
    ipaddress.ip_network("192.0.2.0/24"),
    ipaddress.ip_network("192.88.99.0/24"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("198.18.0.0/15"),
    ipaddress.ip_network("198.51.100.0/24"),
    ipaddress.ip_network("203.0.113.0/24"),
    ipaddress.ip_network("224.0.0.0/4"),
    ipaddress.ip_network("240.0.0.0/4"),
    ipaddress.ip_network("255.255.255.255/32"),
    # IPv6
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("::/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]

def is_ip_blocked(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return True
        for net in BLOCKED_IP_NETWORKS:
            if ip in net:
                return True
        return False
    except ValueError:
        return True

def validate_download_url(url: str) -> str:
    """
    Validates URL scheme, resolves hostname, and blocks SSRF / private IP access
    """
    clean = url.strip()
    if not clean:
        raise ValueError("URL cannot be empty.")

    try:
        parsed = urlparse(clean)
    except Exception as e:
        raise ValueError(f"Invalid URL structure: {e}")

    scheme = (parsed.scheme or "").lower()
    if scheme not in ["http", "https"]:
        raise ValueError(f"Unsupported URL scheme '{scheme}'. Only HTTP and HTTPS are permitted.")

    hostname = (parsed.hostname or "").lower()
    if not hostname:
        raise ValueError("URL must contain a valid domain or host name.")

    # Check test bypass (e.g. during local test harness runs)
    allow_local_test = os.getenv("ALLOW_LOCAL_TEST_URLS", "false").lower() == "true"

    # Always block cloud metadata endpoints even in test mode
    if hostname in ["169.254.169.254", "metadata.google.internal", "instance-data"]:
        raise ValueError("Access to cloud instance metadata is strictly blocked (SSRF Protection).")

    if not allow_local_test:
        if hostname in ["localhost", "127.0.0.1", "0.0.0.0"]:
            raise ValueError("Access to localhost or internal infrastructure is prohibited (SSRF Protection).")

    # Resolve hostname to IPv4/IPv6 addresses
    try:
        addr_info = socket.getaddrinfo(hostname, None)
        resolved_ips = {item[4][0] for item in addr_info}
    except socket.gaierror as e:
        logger.debug(f"DNS lookup resolution warning for {hostname}: {e}")
        resolved_ips = set()

    for ip in resolved_ips:
        if ip == "169.254.169.254":
            raise ValueError("Access to link-local metadata is blocked (SSRF Protection).")
        if not allow_local_test and is_ip_blocked(ip):
            raise ValueError(f"Access to private/local address {ip} ({hostname}) is blocked for security (SSRF Protection).")

    return clean

def validate_disk_space(target_dir: Path, required_bytes: int = 0, safety_buffer_mb: int = 100) -> None:
    """
    Ensures target destination partition has adequate free disk space
    """
    try:
        target_dir.mkdir(parents=True, exist_ok=True)
        usage = shutil.disk_usage(target_dir)
        free_bytes = usage.free
        needed_bytes = required_bytes + (safety_buffer_mb * 1024 * 1024)

        if free_bytes < needed_bytes:
            free_mb = free_bytes / (1024 * 1024)
            needed_mb = needed_bytes / (1024 * 1024)
            raise ValueError(f"Insufficient disk space on destination. Free: {free_mb:.1f} MB, Required: {needed_mb:.1f} MB.")
    except Exception as e:
        if "Insufficient disk space" in str(e):
            raise
        logger.debug(f"Could not verify disk usage on {target_dir}: {e}")

def sanitize_safe_filename(name: str, fallback_ext: str = "mp4") -> str:
    """
    Sanitizes filenames to prevent path traversal and null-byte injection
    """
    # Remove path traversal tokens and null bytes
    cleaned = name.replace("\x00", "").replace("../", "").replace("..\\", "")
    # Remove illegal chars for Windows and macOS
    cleaned = re.sub(r'[\\/*?:"<>|]', "", cleaned).strip()
    if not cleaned:
        cleaned = "video"

    ext = Path(cleaned).suffix.lstrip(".").lower()
    if not ext:
        ext = fallback_ext.lstrip(".")
        cleaned = f"{cleaned}.{ext}"

    return cleaned
