import logging
import os
import re
import time
from collections.abc import Iterator
from typing import Any

logger = logging.getLogger(__name__)
_URL_CREDENTIALS_RE = re.compile(r"(?P<scheme>[a-zA-Z][a-zA-Z0-9+.-]*://)[^/@\s]+@")

# OpenCV's FFmpeg backend can accumulate real latency over time even with
# CAP_PROP_BUFFERSIZE=1 - that property isn't honored by every FFmpeg build,
# and if the camera's native frame rate exceeds VISION_FPS (our consumption
# rate) even briefly, FFmpeg's own internal demux/decode buffers a backlog
# that never fully drains, so every "latest" frame we read keeps drifting
# further behind real time ("Validacao ao vivo" feeling delayed, not live).
# These flags (read by OpenCV's FFmpeg backend at capture-open time) disable
# that buffering and let FFmpeg drop frames instead of queuing them when we
# can't keep up - must be set before any cv2.VideoCapture(..., CAP_FFMPEG)
# call, so this runs at module import time. setdefault() so an operator can
# still override via their own environment if needed.
os.environ.setdefault(
    "OPENCV_FFMPEG_CAPTURE_OPTIONS",
    "fflags;nobuffer|flags;low_delay|framedrop;1|max_delay;100000",
)


def sanitize_error(message: str | None) -> str | None:
    if message is None:
        return None
    return _URL_CREDENTIALS_RE.sub(r"\g<scheme><redacted>@", message)


class CameraCapture:
    """Owns video source lifecycle: open, read, reconnect and release."""

    def __init__(
        self,
        source: str | int,
        reconnect_seconds: float,
        reconnect_max_seconds: float | None = None,
    ) -> None:
        self.source = source
        self.reconnect_seconds = reconnect_seconds
        self.reconnect_max_seconds = reconnect_max_seconds or max(reconnect_seconds, 60.0)
        self.cap: Any | None = None
        self.connected = False
        self.last_error: str | None = None
        self._last_reconnect_attempt = 0.0
        self._consecutive_failures = 0

    def open(self) -> bool:
        self.close()
        for capture in self._open_candidates():
            try:
                if capture.isOpened():
                    self.cap = capture
                    self.connected = True
                    self.last_error = None
                    self._consecutive_failures = 0
                    self._configure_capture()
                    logger.info("Camera source opened")
                    return True
                capture.release()
            except Exception as exc:
                self.last_error = sanitize_error(f"Failed to open camera source: {exc}")
                logger.warning(self.last_error)
                try:
                    capture.release()
                except Exception:
                    logger.debug("Failed to release unopened camera capture", exc_info=True)

        self.connected = False
        self._consecutive_failures += 1
        self.last_error = "Camera source unavailable"
        logger.error(self.last_error)
        return False

    def _current_backoff_seconds(self) -> float:
        # Exponential backoff so a flaky network/DVR doesn't get hammered
        # with reconnect attempts: reconnect_seconds, x2, x4, ... capped at
        # reconnect_max_seconds.
        backoff = self.reconnect_seconds * (2**self._consecutive_failures)
        return min(backoff, self.reconnect_max_seconds)

    def read(self) -> Any | None:
        if not self.connected or self.cap is None:
            self.reconnect_if_due()
            return None

        try:
            ok, frame = self.cap.read()
        except Exception as exc:
            self.last_error = sanitize_error(f"Camera read failed: {exc}")
            logger.warning(self.last_error)
            self.connected = False
            self.close()
            return None

        if not ok or frame is None:
            self.last_error = "Camera returned no frame"
            logger.warning(self.last_error)
            self.connected = False
            self.close()
            return None

        return frame

    def reconnect_if_due(self) -> bool:
        now = time.monotonic()
        if now - self._last_reconnect_attempt < self._current_backoff_seconds():
            return False
        self._last_reconnect_attempt = now
        logger.info(
            "Attempting camera reconnect (attempt %d)", self._consecutive_failures + 1
        )
        return self.open()

    def close(self) -> None:
        if self.cap is not None:
            try:
                self.cap.release()
            except Exception:
                logger.warning("Failed to release camera capture", exc_info=True)
        self.cap = None
        self.connected = False

    def _open_candidates(self) -> Iterator[Any]:
        cv2 = self._cv2()
        if isinstance(self.source, int):
            yield cv2.VideoCapture(self.source, cv2.CAP_DSHOW)
            yield cv2.VideoCapture(self.source)
            return

        source = str(self.source)
        if source.startswith(("rtsp://", "http://", "https://")):
            yield cv2.VideoCapture(source, cv2.CAP_FFMPEG)
            yield cv2.VideoCapture(source)
            return
        yield cv2.VideoCapture(source)

    def _configure_capture(self) -> None:
        if self.cap is None:
            return
        try:
            cv2 = self._cv2()
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            if isinstance(self.source, str) and self.source.startswith(
                ("rtsp://", "http://", "https://")
            ):
                self.cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
                self.cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000)
        except Exception:
            logger.debug("Camera buffer size configuration unavailable", exc_info=True)

    @staticmethod
    def _cv2() -> Any:
        try:
            import cv2
        except ImportError as exc:
            raise RuntimeError(
                "opencv-python is required for MODE=production camera capture"
            ) from exc
        return cv2
