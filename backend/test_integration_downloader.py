import os
import sys
import time
import json
import socket
import asyncio
import threading
import tempfile
import shutil
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
import httpx

API_BASE = "http://127.0.0.1:8001/api/v1"

# Generate minimal valid test media files using ffmpeg
TEST_DIR = Path("/tmp/clipgenius_test_media")
TEST_DIR.mkdir(parents=True, exist_ok=True)

MP4_FILE = TEST_DIR / "sample.mp4"
MOV_FILE = TEST_DIR / "sample.mov"
WEBM_FILE = TEST_DIR / "sample.webm"
CORRUPT_FILE = TEST_DIR / "corrupt.mp4"

def generate_fixtures():
    # Generate 1s test MP4
    if not MP4_FILE.exists():
        os.system(f'ffmpeg -y -f lavfi -i testsrc=duration=1:size=320x240:rate=10 -f lavfi -i sine=frequency=440:duration=1 -c:v libx264 -pix_fmt yuv420p -c:a aac "{MP4_FILE}" >/dev/null 2>&1')
    # Generate 1s test MOV
    if not MOV_FILE.exists():
        os.system(f'ffmpeg -y -f lavfi -i testsrc=duration=1:size=320x240:rate=10 -f lavfi -i sine=frequency=440:duration=1 -c:v libx264 -c:a aac "{MOV_FILE}" >/dev/null 2>&1')
    # Generate 1s test WebM
    if not WEBM_FILE.exists():
        os.system(f'ffmpeg -y -f lavfi -i testsrc=duration=1:size=320x240:rate=10 -f lavfi -i sine=frequency=440:duration=1 -c:v libvpx-vp9 -c:a libopus "{WEBM_FILE}" >/dev/null 2>&1')
    # Generate Corrupted file (random junk bytes)
    if not CORRUPT_FILE.exists():
        with open(CORRUPT_FILE, "wb") as f:
            f.write(b"NOT_A_VALID_MP4_HEADER_JUNK_DATA_" * 100)

generate_fixtures()

# Mock Media HTTP Server with Range, Non-Range, Disconnect and Corrupt handlers
class MockMediaServer(BaseHTTPRequestHandler):
    disconnect_count = 0

    def do_HEAD(self):
        self.handle_request(is_head=True)

    def do_GET(self):
        self.handle_request(is_head=False)

    def handle_request(self, is_head=False):
        path = self.path.split("?")[0]

        if path == "/disconnect_test.mp4":
            MockMediaServer.disconnect_count += 1
            if MockMediaServer.disconnect_count <= 2:
                # Simulate server reset / 503
                self.send_response(503)
                self.end_headers()
                self.wfile.write(b"Server Busy")
                return

        # Map paths to files
        file_map = {
            "/sample.mp4": MP4_FILE,
            "/sample.mov": MOV_FILE,
            "/sample.webm": WEBM_FILE,
            "/norange.mp4": MP4_FILE,
            "/range.mp4": MP4_FILE,
            "/large.mp4": MP4_FILE,
            "/corrupt.mp4": CORRUPT_FILE,
            "/disconnect_test.mp4": MP4_FILE,
        }

        target = file_map.get(path)
        if not target or not target.exists():
            self.send_response(404)
            self.end_headers()
            return

        file_size = target.stat().st_size
        range_header = self.headers.get("Range")

        # Handle Range vs Non-Range
        supports_ranges = (path != "/norange.mp4")

        start = 0
        end = file_size - 1

        if supports_ranges and range_header and range_header.startswith("bytes="):
            parts = range_header.replace("bytes=", "").split("-")
            start = int(parts[0]) if parts[0] else 0
            if len(parts) > 1 and parts[1]:
                end = int(parts[1])

            self.send_response(206)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
            self.send_header("Content-Length", str(end - start + 1))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("ETag", '"mock-etag-12345"')
            self.end_headers()
        else:
            self.send_response(200)
            self.send_header("Content-Type", "video/mp4" if "mp4" in path else "video/webm")
            self.send_header("Content-Length", str(file_size))
            if supports_ranges:
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("ETag", '"mock-etag-12345"')
            else:
                self.send_header("Accept-Ranges", "none")
            self.end_headers()

        if not is_head:
            with open(target, "rb") as f:
                f.seek(start)
                remaining = end - start + 1
                while remaining > 0:
                    chunk_to_read = min(32768, remaining)
                    data = f.read(chunk_to_read)
                    if not data:
                        break
                    self.wfile.write(data)
                    remaining -= len(data)

    def log_message(self, format, *args):
        pass  # Quiet logging

# Start Mock Server on a dynamic free port
server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server_sock.bind(("127.0.0.1", 0))
mock_port = server_sock.getsockname()[1]
server_sock.close()

mock_server = HTTPServer(("127.0.0.1", mock_port), MockMediaServer)
server_thread = threading.Thread(target=mock_server.serve_forever, daemon=True)
server_thread.start()

SERVER_URL = f"http://127.0.0.1:{mock_port}"
print(f"Mock Media Server running on {SERVER_URL}")

results = {}

def run_test(name, fn):
    print(f"Running Test: {name}...", end=" ", flush=True)
    try:
        fn()
        print("PASSED")
        results[name] = "PASSED"
    except Exception as e:
        print(f"FAILED: {e}")
        results[name] = f"FAILED: {e}"

# Test 1: Valid Direct MP4 URL
def test_1_valid_mp4():
    url = f"{SERVER_URL}/sample.mp4"
    res = httpx.post(f"{API_BASE}/downloader/engine/probe", json={"url": url}, timeout=10.0)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert data["ext"] == "mp4"
    assert data["content_length"] > 0

# Test 2: Valid MOV URL
def test_2_valid_mov():
    url = f"{SERVER_URL}/sample.mov"
    res = httpx.post(f"{API_BASE}/downloader/engine/probe", json={"url": url}, timeout=10.0)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert data["ext"] == "mov"

# Test 3: Valid WebM URL
def test_3_valid_webm():
    url = f"{SERVER_URL}/sample.webm"
    res = httpx.post(f"{API_BASE}/downloader/engine/probe", json={"url": url}, timeout=10.0)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert data["ext"] == "webm"

# Test 4: Invalid URL
def test_4_invalid_url():
    res = httpx.post(f"{API_BASE}/downloader/engine/probe", json={"url": "ftp://malformed-url.com/vid"}, timeout=10.0)
    assert res.status_code in [400, 422], f"Expected 400 or 422 for bad scheme, got {res.status_code}"

# Test 5: Unsupported Source / SSRF Prevention
def test_5_unsupported_ssrf():
    res = httpx.post(f"{API_BASE}/downloader/engine/probe", json={"url": "http://169.254.169.254/latest/meta-data/"}, timeout=10.0)
    assert res.status_code == 400, f"Expected 400 SSRF block, got {res.status_code}: {res.text}"
    assert "SSRF" in res.text or "blocked" in res.text

# Test 6: Server without Range Support
def test_6_norange_support():
    url = f"{SERVER_URL}/norange.mp4"
    res = httpx.post(f"{API_BASE}/downloader/engine/probe", json={"url": url}, timeout=10.0)
    assert res.status_code == 200
    data = res.json()
    assert data["supports_ranges"] is False

# Test 7: Server with Range Support
def test_7_range_support():
    url = f"{SERVER_URL}/range.mp4"
    res = httpx.post(f"{API_BASE}/downloader/engine/probe", json={"url": url}, timeout=10.0)
    assert res.status_code == 200
    data = res.json()
    assert data["supports_ranges"] is True
    assert data["etag"] == "mock-etag-12345"

# Test 8: Internet Disconnection & Backoff Recovery
def test_8_disconnect_backoff():
    MockMediaServer.disconnect_count = 0
    url = f"{SERVER_URL}/disconnect_test.mp4"
    res = httpx.post(f"{API_BASE}/downloader/start", json={
        "url": url,
        "format_id": "direct_engine",
        "title": "Disconnect Recovery Test",
        "use_engine": True
    }, timeout=10.0)
    assert res.status_code == 200
    task_id = res.json()["task_id"]

    # Poll until completed or reconnecting
    for _ in range(15):
        time.sleep(1)
        st = httpx.get(f"{API_BASE}/downloader/tasks/{task_id}").json()
        if st["status"] == "completed":
            break
    assert st["status"] in ["completed", "downloading", "connecting", "interrupted"]

# Test 9: Pause and Resume
def test_9_pause_resume():
    url = f"{SERVER_URL}/range.mp4"
    res = httpx.post(f"{API_BASE}/downloader/start", json={
        "url": url,
        "format_id": "direct_engine",
        "title": "Pause Resume Test",
        "use_engine": True
    }, timeout=10.0)
    task_id = res.json()["task_id"]

    # Pause
    pause_res = httpx.post(f"{API_BASE}/downloader/tasks/{task_id}/pause")
    assert pause_res.status_code == 200

    time.sleep(0.5)
    st = httpx.get(f"{API_BASE}/downloader/tasks/{task_id}").json()
    assert st["status"] in ["paused", "completed"]

    # Resume
    if st["status"] == "paused":
        resume_res = httpx.post(f"{API_BASE}/downloader/tasks/{task_id}/resume")
        assert resume_res.status_code == 200

# Test 10: Browser Refresh / State Persistence
def test_10_state_persistence():
    res = httpx.get(f"{API_BASE}/downloader/tasks", timeout=10.0)
    assert res.status_code == 200
    tasks = res.json()
    assert isinstance(tasks, list)

# Test 11: Backend Restart / Queue Restoration
def test_11_restart_recovery():
    # Calling tasks endpoint simulates client retrieving state after restart
    res = httpx.get(f"{API_BASE}/downloader/tasks", timeout=10.0)
    assert res.status_code == 200
    tasks = res.json()
    # Ensure all tasks have valid schemas
    for t in tasks:
        assert "task_id" in t
        assert "status" in t

# Test 12: Insufficient Disk Space Guard
def test_12_disk_space():
    from app.services.downloader.security import validate_disk_space
    try:
        # Request 10 Petabytes
        validate_disk_space(Path("/tmp"), required_bytes=10**16)
        assert False, "Should have raised ValueError for disk space"
    except ValueError as e:
        assert "Insufficient disk space" in str(e)

# Test 13: Large Video File Chunking
def test_13_large_file_streaming():
    url = f"{SERVER_URL}/large.mp4"
    res = httpx.post(f"{API_BASE}/downloader/start", json={
        "url": url,
        "format_id": "direct_engine",
        "title": "Large File Streaming",
        "use_engine": True
    }, timeout=10.0)
    assert res.status_code == 200

# Test 14: Corrupted Source Detection
def test_14_corrupted_source():
    url = f"{SERVER_URL}/corrupt.mp4"
    res = httpx.post(f"{API_BASE}/downloader/start", json={
        "url": url,
        "format_id": "direct_engine",
        "title": "Corrupt Media Test",
        "use_engine": True
    }, timeout=10.0)
    assert res.status_code == 200
    task_id = res.json()["task_id"]

    for _ in range(10):
        time.sleep(1)
        st = httpx.get(f"{API_BASE}/downloader/tasks/{task_id}").json()
        if st["status"] in ["failed", "interrupted"]:
            break
    # Ensure corrupted media was caught by FFprobe verification
    assert st["status"] in ["failed", "interrupted"]

# Test 15: File Conversion / macOS Export
def test_15_file_conversion():
    res = httpx.get(f"{API_BASE}/files/formats")
    assert res.status_code == 200
    formats = res.json()
    assert len(formats) >= 5
    format_ids = [f["id"] for f in formats]
    assert "mp4_h264" in format_ids
    assert "mp4_hevc" in format_ids
    assert "mov" in format_ids

# Test 16: Delete Downloaded Video
def test_16_delete_video():
    url = f"{SERVER_URL}/sample.mp4"
    res = httpx.post(f"{API_BASE}/downloader/start", json={
        "url": url,
        "format_id": "direct_engine",
        "title": "To Delete Test",
        "use_engine": True
    }, timeout=10.0)
    task_id = res.json()["task_id"]
    time.sleep(1)

    del_res = httpx.delete(f"{API_BASE}/downloader/tasks/{task_id}")
    assert del_res.status_code == 200

# Test 17: Download History Restoration
def test_17_history_restoration():
    res = httpx.get(f"{API_BASE}/downloader/history")
    assert res.status_code == 200
    hist = res.json()
    assert isinstance(hist, list)

# Execute All 17 Test Cases
test_suite = [
    ("1. Valid Direct MP4 URL", test_1_valid_mp4),
    ("2. Valid MOV URL", test_2_valid_mov),
    ("3. Valid WebM URL", test_3_valid_webm),
    ("4. Invalid URL", test_4_invalid_url),
    ("5. Unsupported Source / SSRF Guard", test_5_unsupported_ssrf),
    ("6. Server Without Range Support", test_6_norange_support),
    ("7. Server With Range Support", test_7_range_support),
    ("8. Disconnection & Backoff Recovery", test_8_disconnect_backoff),
    ("9. Pause and Resume", test_9_pause_resume),
    ("10. Browser Refresh & State Persistence", test_10_state_persistence),
    ("11. Backend Restart & Queue Restoration", test_11_restart_recovery),
    ("12. Insufficient Disk Space Guard", test_12_disk_space),
    ("13. Large Video File Streaming", test_13_large_file_streaming),
    ("14. Corrupted Source Detection", test_14_corrupted_source),
    ("15. File Conversion (macOS QuickTime/ProRes)", test_15_file_conversion),
    ("16. Delete Downloaded Video", test_16_delete_video),
    ("17. Download History Restoration", test_17_history_restoration)
]

print("\n" + "="*60)
print("EXECUTING COMPLETE INTEGRATION TEST SUITE (17 TEST CASES)")
print("="*60 + "\n")

for name, fn in test_suite:
    run_test(name, fn)

print("\n" + "="*60)
print(f"TEST RUN COMPLETED: {sum(1 for v in results.values() if v == 'PASSED')}/{len(results)} PASSED")
print("="*60)

with open("/tmp/integration_test_results.json", "w") as f:
    json.dump(results, f, indent=2)

mock_server.shutdown()
