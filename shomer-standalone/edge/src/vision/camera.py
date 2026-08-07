import logging
import re
import time
from collections.abc import Iterator
from typing import Any

logger = logging.getLogger(__name__)
_URL_CREDENTIALS_RE = re.compile(r"(?P<scheme>[a-zA-Z][a-zA-Z0-9+.-]*://)[^/@\s]+@")


def sanitize_error(message: str | None) -> str | None:
    if message is None:
        return None
    return _URL_CREDENTIALS_RE.sub(r"\g<scheme><redacted>@", message)


class CameraCapture:
    """Owns video source lifecycle: open, read, reconnect and release."""

    def __init__(self, source: str | int, reconnect_seconds: float) -> None:
        self.source = source
        self.reconnect_seconds = reconnect_seconds
        self.cap: Any | None = None
        self.connected = False
        self.last_error: str | None = None
        self._last_reconnect_attempt = 0.0

    def open(self) -> bool:
        self.close()
        for capture in self._open_candidates():
            try:
                if capture.isOpened():
                    self.cap = capture
                    self.connected = True
                    self.last_error = None
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
        self.last_error = "Camera source unavailable"
        logger.error(self.last_error)
        return False

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
        if now - self._last_reconnect_attempt < self.reconnect_seconds:
            return False
        self._last_reconnect_attempt = now
        logger.info("Attempting camera reconnect")
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
