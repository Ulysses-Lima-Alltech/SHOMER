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
from src.vision.camera import sanitize_error
from src.vision.detector import PersonTracker
from src.vision.models import BoundingBox, TrackedPerson
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

    def test_status_endpoint_returns_operational_fields_only(self):
        request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace()))
        payload = run(vision_status(request))

        self.assertIn("mode", payload)
        self.assertIn("persons_current", payload)
        self.assertNotIn("bbox", payload)
        self.assertNotIn("frame", payload)
        self.assertNotIn("DEVICE_KEY", payload)

    def test_sanitize_error_redacts_url_credentials(self):
        message = sanitize_error("failed rtsp://user:pass@example.local/live")

        self.assertEqual(message, "failed rtsp://<redacted>@example.local/live")

    def test_mock_mode_main_importable(self):
        import src.main as main

        self.assertEqual(main.settings.MODE, "mock")
        self.assertNotIn("cv2", sys.modules)
        self.assertNotIn("ultralytics", sys.modules)


if __name__ == "__main__":
    unittest.main()
