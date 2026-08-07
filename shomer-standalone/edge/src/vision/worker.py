import asyncio
import logging
import threading
import time
from datetime import datetime, timezone
from typing import Callable

from src.config import Settings
from src.analytics.line_crossing import (
    EnterDirection,
    LineCrossingAnalyzer,
    LineCrossingEvent,
    NormalizedPoint,
)
from src.vision.camera import CameraCapture, sanitize_error
from src.vision.detector import PersonTracker
from src.vision.models import TrackedPerson, VisionStats

logger = logging.getLogger(__name__)


class VisionWorker:
    """Runs camera capture and person tracking outside the FastAPI event loop."""

    def __init__(
        self,
        settings: Settings,
        crossing_event_sink: Callable[[LineCrossingEvent], None] | None = None,
    ) -> None:
        self.settings = settings
        self.crossing_event_sink = crossing_event_sink
        self.camera = CameraCapture(
            source=settings.RESOLVED_CAMERA_SOURCE,
            reconnect_seconds=settings.CAMERA_RECONNECT_SECONDS,
        )
        self.detector = PersonTracker(
            model_name=settings.YOLO_MODEL,
            confidence=settings.YOLO_CONFIDENCE,
            image_size=settings.YOLO_IMAGE_SIZE,
            tracker=settings.YOLO_TRACKER,
        )
        self.line_crossing = LineCrossingAnalyzer(
            enabled=settings.LINE_CROSSING_ENABLED,
            line_id=settings.LINE_CROSSING_LINE_ID,
            point_a=NormalizedPoint(
                settings.LINE_CROSSING_X1,
                settings.LINE_CROSSING_Y1,
            ),
            point_b=NormalizedPoint(
                settings.LINE_CROSSING_X2,
                settings.LINE_CROSSING_Y2,
            ),
            enter_direction=EnterDirection(settings.LINE_CROSSING_ENTER_DIRECTION),
            tolerance=settings.LINE_CROSSING_TOLERANCE,
            cooldown_seconds=settings.LINE_CROSSING_COOLDOWN_SECONDS,
            track_ttl_seconds=settings.LINE_CROSSING_TRACK_TTL_SECONDS,
        )
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self.running = False
        self.camera_connected = False
        self.model_ready = False
        self.frames_processed = 0
        self.last_frame_at: datetime | None = None
        self.last_detection_at: datetime | None = None
        self.persons_current: list[TrackedPerson] = []
        self.last_error: str | None = None
        self._model_error: str | None = None
        self._had_camera_disconnect = False

    async def start(self) -> None:
        with self._lock:
            if self.running:
                return
            self.running = True
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run,
            name="VisionWorker",
            daemon=True,
        )
        self._thread.start()
        logger.info("Vision Worker started")

    async def stop(self) -> None:
        self._stop_event.set()
        thread = self._thread
        if thread and thread.is_alive():
            await asyncio.to_thread(thread.join, 5.0)
        await asyncio.to_thread(self.camera.close)
        with self._lock:
            self.running = False
            self.camera_connected = False
        logger.info("Vision Worker stopped")

    def status(self) -> VisionStats:
        with self._lock:
            track_ids = [person.track_id for person in self.persons_current]
            line_stats = self.line_crossing.stats()
            return VisionStats(
                mode=self.settings.MODE,
                running=self.running,
                camera_connected=self.camera_connected,
                model_ready=self.model_ready,
                frames_processed=self.frames_processed,
                persons_current=len(self.persons_current),
                line_crossing_enabled=line_stats.enabled,
                entries=line_stats.entries,
                exits=line_stats.exits,
                last_crossing_at=line_stats.last_crossing_at,
                last_crossing_direction=(
                    line_stats.last_crossing_direction.value
                    if line_stats.last_crossing_direction
                    else None
                ),
                last_crossing_track_id=line_stats.last_crossing_track_id,
                track_ids=track_ids,
                last_frame_at=self.last_frame_at,
                last_detection_at=self.last_detection_at,
                last_error=self.last_error,
            )

    def _run(self) -> None:
        try:
            self.detector.load()
            with self._lock:
                self.model_ready = True
                self._model_error = None
                self.last_error = None
        except Exception as exc:
            self._record_model_error(str(exc))
            logger.exception("Vision model initialization failed")

        frame_interval = 1.0 / self.settings.VISION_FPS
        try:
            while not self._stop_event.is_set():
                loop_started = time.monotonic()
                frame = self.camera.read()
                self._handle_camera_state(self.camera.connected)

                if frame is None:
                    self._record_error(self.camera.last_error)
                    self._sleep(frame_interval)
                    continue

                now = datetime.now(timezone.utc)
                with self._lock:
                    self.frames_processed += 1
                    self.last_frame_at = now
                    if self.camera.last_error is None and self._model_error is None:
                        self.last_error = None

                if self.detector.ready:
                    try:
                        persons = self.detector.track(frame)
                        height, width = frame.shape[:2]
                        detected_at = datetime.now(timezone.utc)
                        with self._lock:
                            crossing_events = self.line_crossing.process(
                                persons, width, height
                            )
                            self.persons_current = persons
                            self.last_detection_at = detected_at
                            self.last_error = None
                        self._publish_crossing_events(crossing_events)
                    except Exception as exc:
                        self._record_error(f"Detection failed: {exc}")
                        logger.warning("Detection failed", exc_info=True)

                elapsed = time.monotonic() - loop_started
                self._sleep(max(0.0, frame_interval - elapsed))
        except Exception as exc:
            self._record_error(f"Vision worker failed: {exc}")
            logger.exception("Vision worker loop failed")
        finally:
            self.camera.close()

    def _sleep(self, seconds: float) -> None:
        if seconds > 0:
            self._stop_event.wait(seconds)

    def _record_error(self, message: str | None) -> None:
        if not message and not self._model_error:
            return
        with self._lock:
            safe_message = sanitize_error(message)
            if safe_message and self._model_error:
                self.last_error = f"{self._model_error}; {safe_message}"
            else:
                self.last_error = safe_message or self._model_error

    def _handle_camera_state(self, connected: bool) -> None:
        reset_tracker = False
        with self._lock:
            if not connected:
                self._had_camera_disconnect = True
            elif self._had_camera_disconnect:
                reset_tracker = True
                self._had_camera_disconnect = False
            self.camera_connected = connected
        if reset_tracker:
            try:
                self.detector.reset_tracking()
            except Exception as exc:
                self._record_error(f"Tracker reset failed: {exc}")
                logger.warning("Tracker reset failed", exc_info=True)
            with self._lock:
                self.line_crossing.reset_tracks()

    def _record_model_error(self, message: str) -> None:
        with self._lock:
            self._model_error = sanitize_error(message)
            self.last_error = self._model_error

    def _publish_crossing_events(self, events: list[LineCrossingEvent]) -> None:
        if self.crossing_event_sink is None:
            return
        for event in events:
            try:
                self.crossing_event_sink(event)
            except Exception:
                logger.exception("Crossing event sink failed")
