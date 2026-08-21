import asyncio
import os
import sys
import unittest
from asyncio import run
from datetime import datetime, timezone
from types import SimpleNamespace

from pydantic import ValidationError

EDGE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if EDGE_DIR not in sys.path:
    sys.path.insert(0, EDGE_DIR)

from src.config import Settings, resolve_camera_source
from src.events.factory import DetectionEventFactory, EdgeHealthEventFactory, EventDeviceContext
from src.events.health_reporter import HealthReporter
from src.schedule.business_hours import BusinessHoursGate
from src.vision.camera import CameraCapture, sanitize_error
from src.vision.detector import PersonTracker
from src.vision.intelbras import build_intelbras_rtsp_url
from src.vision.models import BoundingBox, TrackedPerson, VisionStats
from src.vision.status import status as vision_status
from src.vision.worker import VisionWorker


class FakeBoxes:
    xyxy = [[10, 20, 30, 40]]
    conf = [0.91]
    id = [7]


class FakeResult:
    boxes = FakeBoxes()


class FakeMultiBoxes:
    xyxy = [[10, 20, 30, 40], [50, 60, 70, 80]]
    conf = [0.91, 0.82]
    id = [7, 9]


class FakeMultiResult:
    boxes = FakeMultiBoxes()


class FakeSettings:
    MODE = "production"
    RESOLVED_CAMERA_SOURCE = 0
    CAMERA_RECONNECT_SECONDS = 0.1
    YOLO_MODEL = "fake.pt"
    YOLO_CONFIDENCE = 0.5
    YOLO_IMAGE_SIZE = 320
    YOLO_TRACKER = "bytetrack.yaml"
    VISION_FPS = 1.0
    LINE_CROSSING_ENABLED = True
    LINE_CROSSING_LINE_ID = "main"
    LINE_CROSSING_X1 = 0.0
    LINE_CROSSING_Y1 = 0.5
    LINE_CROSSING_X2 = 1.0
    LINE_CROSSING_Y2 = 0.5
    LINE_CROSSING_ENTER_DIRECTION = "A_TO_B"
    LINE_CROSSING_TOLERANCE = 0.02
    LINE_CROSSING_COOLDOWN_SECONDS = 1.0
    LINE_CROSSING_TRACK_TTL_SECONDS = 10.0


class VisionFoundationTests(unittest.TestCase):
    def test_resolve_camera_source_prefers_camera_source_and_parses_webcam(self):
        self.assertEqual(resolve_camera_source("1", "rtsp://example"), 1)

    def test_resolve_camera_source_falls_back_to_rtsp_url(self):
        self.assertEqual(resolve_camera_source("", "rtsp://camera/live"), "rtsp://camera/live")

    def test_resolve_camera_source_defaults_to_webcam_zero(self):
        self.assertEqual(resolve_camera_source("", ""), 0)

    def test_resolve_camera_source_keeps_http_url(self):
        self.assertEqual(resolve_camera_source("http://camera/live", ""), "http://camera/live")

    def test_config_validation_rejects_invalid_mode_and_zero_confidence(self):
        with self.assertRaises(ValidationError):
            Settings(MODE="invalid", _env_file=None)
        with self.assertRaises(ValidationError):
            Settings(YOLO_CONFIDENCE=0, _env_file=None)

    def test_models_serialize_without_pixels(self):
        timestamp = datetime(2026, 8, 7, tzinfo=timezone.utc)
        person = TrackedPerson(
            track_id=42,
            bbox=BoundingBox(1, 2, 3, 4),
            confidence=0.8,
            timestamp=timestamp,
        )

        self.assertEqual(
            person.to_dict(),
            {
                "track_id": 42,
                "bbox": {"x1": 1, "y1": 2, "x2": 3, "y2": 4},
                "confidence": 0.8,
                "timestamp": timestamp.isoformat(),
            },
        )

    def test_parse_yolo_result_uses_tracker_id(self):
        timestamp = datetime(2026, 8, 7, tzinfo=timezone.utc)
        persons = PersonTracker.parse_result(FakeResult(), timestamp)

        self.assertEqual(len(persons), 1)
        self.assertEqual(persons[0].track_id, 7)
        self.assertEqual(persons[0].bbox.x1, 10.0)
        self.assertEqual(persons[0].confidence, 0.91)

    def test_parse_yolo_result_handles_multiple_tracker_ids(self):
        persons = PersonTracker.parse_result(FakeMultiResult())

        self.assertEqual([person.track_id for person in persons], [7, 9])
        self.assertEqual(persons[1].bbox.x2, 70.0)

    def test_parse_yolo_result_without_tracker_id_returns_empty(self):
        class NoIdBoxes(FakeBoxes):
            id = None

        class NoIdResult:
            boxes = NoIdBoxes()

        self.assertEqual(PersonTracker.parse_result(NoIdResult()), [])

    def test_initial_worker_status(self):
        worker = VisionWorker(FakeSettings())
        status = worker.status().to_dict()

        self.assertEqual(status["mode"], "production")
        self.assertFalse(status["running"])
        self.assertFalse(status["camera_connected"])
        self.assertFalse(status["model_ready"])
        self.assertEqual(status["frames_processed"], 0)
        self.assertEqual(status["persons_current"], 0)
        self.assertEqual(status["entries"], 0)
        self.assertEqual(status["exits"], 0)

    def test_get_latest_frame_jpeg_returns_none_before_any_frame(self):
        worker = VisionWorker(FakeSettings())

        self.assertIsNone(worker.get_latest_frame_jpeg())

    def test_get_latest_frame_jpeg_encodes_last_frame(self):
        import numpy as np

        worker = VisionWorker(FakeSettings())
        worker._latest_frame = np.zeros((10, 10, 3), dtype=np.uint8)

        jpeg = worker.get_latest_frame_jpeg()

        self.assertIsNotNone(jpeg)
        self.assertTrue(jpeg.startswith(b"\xff\xd8"))  # JPEG magic bytes

    def test_worker_resets_tracker_after_camera_reconnect(self):
        class FakeDetector:
            def __init__(self):
                self.resets = 0

            def reset_tracking(self):
                self.resets += 1

        worker = VisionWorker(FakeSettings())
        fake_detector = FakeDetector()
        worker.detector = fake_detector

        worker._handle_camera_state(False)
        worker._handle_camera_state(True)

        self.assertEqual(fake_detector.resets, 1)

    def test_handle_closed_hours_releases_connected_camera(self):
        worker = VisionWorker(FakeSettings())
        worker.camera.connected = True
        closed = []
        worker.camera.close = lambda: closed.append(True)

        worker._handle_closed_hours()

        self.assertEqual(closed, [True])
        self.assertFalse(worker.camera_connected)

    def test_handle_closed_hours_noop_when_camera_already_disconnected(self):
        worker = VisionWorker(FakeSettings())
        worker.camera.connected = False
        closed = []
        worker.camera.close = lambda: closed.append(True)

        worker._handle_closed_hours()

        self.assertEqual(closed, [])

    def test_worker_skips_processing_when_gate_reports_closed(self):
        class AlwaysClosedGate(BusinessHoursGate):
            def is_open_now(self) -> bool:
                return False

        worker = VisionWorker(FakeSettings(), business_hours_gate=AlwaysClosedGate())
        worker.detector.load = lambda: None  # evita carregar um modelo YOLO de verdade
        read_calls = []
        worker.camera.read = lambda: read_calls.append(1) or None
        worker._sleep = lambda seconds: worker._stop_event.set()  # sai do loop na 1a iteracao

        worker._run()

        self.assertEqual(read_calls, [])

    def test_status_endpoint_returns_operational_fields_only(self):
        request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace()))
        payload = run(vision_status(request))

        self.assertIn("mode", payload)
        self.assertIn("persons_current", payload)
        self.assertIn("entries", payload)
        self.assertIn("exits", payload)
        self.assertNotIn("bbox", payload)
        self.assertNotIn("frame", payload)
        self.assertNotIn("DEVICE_KEY", payload)

    def test_sanitize_error_redacts_url_credentials(self):
        message = sanitize_error("failed rtsp://user:pass@example.local/live")

        self.assertEqual(message, "failed rtsp://<redacted>@example.local/live")

    def test_build_intelbras_rtsp_url_defaults(self):
        url = build_intelbras_rtsp_url("192.168.0.10", "admin", "secret")

        self.assertEqual(
            url,
            "rtsp://admin:secret@192.168.0.10:554/cam/realmonitor?channel=1&subtype=0",
        )

    def test_build_intelbras_rtsp_url_escapes_special_characters(self):
        url = build_intelbras_rtsp_url(
            "192.168.0.10", "admin", "p@ss:w/ord", channel=2, subtype=1
        )

        self.assertEqual(
            url,
            "rtsp://admin:p%40ss%3Aw%2Ford@192.168.0.10:554/cam/realmonitor"
            "?channel=2&subtype=1",
        )

    def test_resolve_camera_source_builds_intelbras_url_when_no_explicit_source(self):
        source = resolve_camera_source(
            "",
            "",
            intelbras_host="192.168.0.10",
            intelbras_user="admin",
            intelbras_password="secret",
        )

        self.assertEqual(
            source,
            "rtsp://admin:secret@192.168.0.10:554/cam/realmonitor?channel=1&subtype=0",
        )

    def test_resolve_camera_source_prefers_explicit_over_intelbras(self):
        source = resolve_camera_source(
            "rtsp://explicit/live",
            "",
            intelbras_host="192.168.0.10",
            intelbras_user="admin",
            intelbras_password="secret",
        )

        self.assertEqual(source, "rtsp://explicit/live")

    def test_detection_event_factory_includes_normalized_floor_point(self):
        timestamp = datetime(2026, 8, 7, tzinfo=timezone.utc)
        person = TrackedPerson(
            track_id=3,
            bbox=BoundingBox(100, 100, 200, 300),
            confidence=0.9,
            timestamp=timestamp,
        )
        factory = DetectionEventFactory(
            EventDeviceContext(
                tenant_id="tenant-1", store_id=None, camera_id="camera-1", edge_device_id="edge-1"
            )
        )

        payload = factory.create(person, frame_width=1000, frame_height=1000).to_dict()["payload"]

        self.assertEqual(payload["floorPoint"], {"x": 0.15, "y": 0.3})

    def test_detection_event_factory_omits_floor_point_without_frame_size(self):
        timestamp = datetime(2026, 8, 7, tzinfo=timezone.utc)
        person = TrackedPerson(
            track_id=3,
            bbox=BoundingBox(100, 100, 200, 300),
            confidence=0.9,
            timestamp=timestamp,
        )
        factory = DetectionEventFactory(
            EventDeviceContext(
                tenant_id="tenant-1", store_id=None, camera_id="camera-1", edge_device_id="edge-1"
            )
        )

        payload = factory.create(person, frame_width=0, frame_height=0).to_dict()["payload"]

        self.assertNotIn("floorPoint", payload)

    def test_edge_health_event_factory_reports_healthy(self):
        factory = EdgeHealthEventFactory(
            EventDeviceContext(
                tenant_id="tenant-1", store_id="store-1", camera_id="camera-1", edge_device_id="edge-1"
            )
        )
        status = VisionStats(
            mode="production",
            running=True,
            camera_connected=True,
            model_ready=True,
            frames_processed=120,
            persons_current=2,
        )

        payload = factory.create(status).to_dict()["payload"]

        self.assertEqual(payload["status"], "healthy")
        self.assertTrue(payload["cameraConnected"])
        self.assertTrue(payload["modelReady"])
        self.assertEqual(payload["framesProcessed"], 120)
        self.assertIsNone(payload["lastError"])

    def test_edge_health_event_factory_reports_degraded_on_error(self):
        factory = EdgeHealthEventFactory(
            EventDeviceContext(
                tenant_id="tenant-1", store_id=None, camera_id="camera-1", edge_device_id="edge-1"
            )
        )
        status = VisionStats(
            mode="production",
            running=True,
            camera_connected=False,
            model_ready=True,
            frames_processed=5,
            persons_current=0,
            last_error="Camera source unavailable",
        )

        payload = factory.create(status).to_dict()["payload"]

        self.assertEqual(payload["status"], "degraded")
        self.assertFalse(payload["cameraConnected"])
        self.assertEqual(payload["lastError"], "Camera source unavailable")

    def test_camera_reconnect_backoff_grows_and_caps(self):
        camera = CameraCapture(source="rtsp://unreachable/live", reconnect_seconds=1.0)
        camera._consecutive_failures = 0
        self.assertEqual(camera._current_backoff_seconds(), 1.0)
        camera._consecutive_failures = 3
        self.assertEqual(camera._current_backoff_seconds(), 8.0)
        camera._consecutive_failures = 10
        self.assertEqual(camera._current_backoff_seconds(), 60.0)

    def test_mock_mode_main_importable(self):
        import src.main as main

        self.assertEqual(main.settings.MODE, "mock")
        self.assertNotIn("cv2", sys.modules)
        self.assertNotIn("ultralytics", sys.modules)


class HealthReporterTests(unittest.IsolatedAsyncioTestCase):
    async def test_reports_periodically_until_stopped(self):
        published = []

        class FakeWorker:
            def status(self):
                return VisionStats(
                    mode="production",
                    running=True,
                    camera_connected=True,
                    model_ready=True,
                    frames_processed=1,
                    persons_current=0,
                )

        class FakePublisher:
            def enqueue_envelope_from_thread(self, envelope):
                published.append(envelope)

        factory = EdgeHealthEventFactory(
            EventDeviceContext(
                tenant_id="tenant-1", store_id=None, camera_id="camera-1", edge_device_id="edge-1"
            )
        )
        reporter = HealthReporter(
            worker=FakeWorker(),
            publisher=FakePublisher(),
            factory=factory,
            interval_seconds=0.01,
        )

        await reporter.start()
        await asyncio.sleep(0.05)
        await reporter.stop()

        self.assertGreaterEqual(len(published), 2)
        self.assertEqual(published[0].event_type, "edge.health.reported")


if __name__ == "__main__":
    unittest.main()
