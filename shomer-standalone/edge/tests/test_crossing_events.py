import asyncio
import os
import sys
import threading
import time
import unittest
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

from pydantic import ValidationError

EDGE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if EDGE_DIR not in sys.path:
    sys.path.insert(0, EDGE_DIR)

from src.analytics.line_crossing import CrossingDirection, LineCrossingEvent
from src.config import Settings
from src.events.factory import CrossingEventFactory, EventDeviceContext
from src.events.publisher import CrossingEventPublisher
from src.vision.status import status as vision_status
from src.vision.worker import VisionWorker


TIMESTAMP = datetime(2026, 8, 7, 17, 0, tzinfo=timezone.utc)


class FakeSender:
    def __init__(self, results=None, delay: float = 0.0):
        self.results = list(results or [True])
        self.delay = delay
        self.calls = []

    async def send_event(self, event: dict) -> bool:
        self.calls.append(event)
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.results:
            result = self.results.pop(0)
            if isinstance(result, Exception):
                raise result
            return result
        return True


class OrderedFakeSender:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.completed_track_ids = []
        self.calls = []

    async def send_event(self, event: dict) -> bool:
        self.calls.append(event)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        if outcome:
            self.completed_track_ids.append(event["payload"]["trackId"])
            return True
        if not any(value is True for value in self.outcomes):
            self.completed_track_ids.append(event["payload"]["trackId"])
        return False


def crossing(direction=CrossingDirection.ENTER, track_id=17, line_id="main"):
    return LineCrossingEvent(
        track_id=track_id,
        direction=direction,
        timestamp=TIMESTAMP,
        line_id=line_id,
    )


def factory():
    return CrossingEventFactory(
        EventDeviceContext(
            tenant_id="tenant-1",
            store_id="store-1",
            camera_id="camera-1",
            edge_device_id="edge-1",
        )
    )


def publisher(
    sender,
    *,
    enabled=True,
    queue_size=10,
    attempts=3,
    drain_timeout=1.0,
):
    return CrossingEventPublisher(
        enabled=enabled,
        sender=sender,
        factory=factory(),
        queue_max_size=queue_size,
        max_attempts=attempts,
        retry_base_seconds=0.0,
        retry_max_seconds=0.0,
        drain_timeout_seconds=drain_timeout,
    )


class CrossingEventTests(unittest.IsolatedAsyncioTestCase):
    def test_factory_creates_person_line_crossed_envelope(self):
        envelope = factory().create(crossing())
        payload = envelope.to_dict()

        uuid.UUID(payload["eventId"])
        self.assertEqual(payload["timestamp"], "2026-08-07T17:00:00Z")
        self.assertEqual(payload["tenantId"], "tenant-1")
        self.assertEqual(payload["storeId"], "store-1")
        self.assertEqual(payload["type"], "person.line_crossed")
        self.assertEqual(payload["eventVersion"], "v1")
        self.assertEqual(payload["payload"]["cameraId"], "camera-1")
        self.assertEqual(payload["payload"]["edgeDeviceId"], "edge-1")
        self.assertEqual(payload["payload"]["trackId"], "17")
        self.assertEqual(payload["payload"]["lineId"], "main")
        self.assertEqual(payload["payload"]["direction"], "ENTER")
        self.assertNotIn("DEVICE_KEY", str(payload))

    def test_factory_handles_exit_and_custom_line(self):
        payload = factory().create(
            crossing(CrossingDirection.EXIT, track_id=5, line_id="door")
        ).to_dict()

        self.assertEqual(payload["payload"]["direction"], "EXIT")
        self.assertEqual(payload["payload"]["trackId"], "5")
        self.assertEqual(payload["payload"]["lineId"], "door")

    async def test_retry_preserves_event_id_and_timestamp(self):
        sender = FakeSender([False, False, True])
        subject = publisher(sender, attempts=3)

        await subject.start()
        subject.enqueue_from_thread(crossing())
        await subject.stop()

        self.assertEqual(len(sender.calls), 3)
        self.assertEqual({call["eventId"] for call in sender.calls}, {sender.calls[0]["eventId"]})
        self.assertEqual(
            {call["timestamp"] for call in sender.calls},
            {"2026-08-07T17:00:00Z"},
        )
        self.assertEqual(subject.status().published, 1)
        self.assertEqual(subject.status().failed, 0)

    async def test_final_failure_increments_failed(self):
        sender = FakeSender([False, False])
        subject = publisher(sender, attempts=2)

        await subject.start()
        subject.enqueue_from_thread(crossing())
        await subject.stop()

        self.assertEqual(len(sender.calls), 2)
        self.assertEqual(subject.status().published, 0)
        self.assertEqual(subject.status().failed, 1)

    async def test_two_crossings_get_distinct_event_ids(self):
        sender = FakeSender([True, True])
        subject = publisher(sender)

        await subject.start()
        subject.enqueue_from_thread(crossing(track_id=1))
        subject.enqueue_from_thread(crossing(track_id=1))
        await subject.stop()

        self.assertEqual(len(sender.calls), 2)
        self.assertNotEqual(sender.calls[0]["eventId"], sender.calls[1]["eventId"])

    async def test_queue_full_drops_new_events_without_blocking(self):
        sender = FakeSender([True], delay=0.1)
        subject = publisher(sender, queue_size=1)

        await subject.start()
        subject.enqueue_from_thread(crossing(track_id=1))
        subject.enqueue_from_thread(crossing(track_id=2))
        subject.enqueue_from_thread(crossing(track_id=3))
        await asyncio.sleep(0)

        self.assertLessEqual(subject.status().queue_depth, 1)
        self.assertGreaterEqual(subject.status().dropped, 1)
        await subject.stop()

    async def test_enqueue_from_real_thread_reaches_consumer(self):
        sender = FakeSender([True])
        subject = publisher(sender)

        await subject.start()
        worker_thread = threading.Thread(
            target=lambda: subject.enqueue_from_thread(crossing())
        )
        started = time.monotonic()
        worker_thread.start()
        worker_thread.join(timeout=1)
        elapsed = time.monotonic() - started
        await subject.stop()

        self.assertLess(elapsed, 1)
        self.assertEqual(len(sender.calls), 1)

    async def test_start_stop_are_idempotent(self):
        subject = publisher(FakeSender([True]))

        await subject.start()
        await subject.start()
        await subject.stop()
        await subject.stop()

        self.assertEqual(subject.status().queue_depth, 0)

    async def test_stop_without_start_is_safe(self):
        subject = publisher(FakeSender([True]))

        await subject.stop()

        self.assertEqual(subject.status().queue_depth, 0)

    async def test_enqueue_before_start_is_safe(self):
        sender = FakeSender([True])
        subject = publisher(sender)

        subject.enqueue_from_thread(crossing())

        self.assertEqual(sender.calls, [])

    async def test_enqueue_after_stop_is_safe(self):
        sender = FakeSender([True])
        subject = publisher(sender)

        await subject.start()
        await subject.stop()
        subject.enqueue_from_thread(crossing())

        self.assertEqual(sender.calls, [])

    async def test_enqueue_with_closed_loop_is_safe(self):
        sender = FakeSender([True])
        subject = publisher(sender)
        loop = asyncio.new_event_loop()
        loop.close()
        subject._loop = loop
        subject._running = True

        subject.enqueue_from_thread(crossing())

        self.assertEqual(sender.calls, [])

    async def test_disabled_publisher_does_not_start_consumer(self):
        sender = FakeSender([True])
        subject = publisher(sender, enabled=False)

        await subject.start()
        subject.enqueue_from_thread(crossing())
        await subject.stop()

        self.assertEqual(sender.calls, [])
        self.assertFalse(subject.status().enabled)

    async def test_shutdown_drains_queue(self):
        sender = FakeSender([True, True])
        subject = publisher(sender, queue_size=2)

        await subject.start()
        subject.enqueue_from_thread(crossing(track_id=1))
        subject.enqueue_from_thread(crossing(track_id=2))
        await subject.stop()

        self.assertEqual(len(sender.calls), 2)

    async def test_drain_timeout_records_abandoned_events(self):
        sender = FakeSender([True], delay=1.0)
        subject = publisher(sender, queue_size=2, drain_timeout=0.01)

        await subject.start()
        subject.enqueue_from_thread(crossing(track_id=1))
        subject.enqueue_from_thread(crossing(track_id=2))
        await asyncio.sleep(0)
        await subject.stop()

        self.assertGreaterEqual(subject.status().dropped, 0)
        self.assertIsNotNone(subject.status().last_error)

    async def test_drain_waits_for_inflight_event(self):
        sender = FakeSender([True], delay=0.05)
        subject = publisher(sender, drain_timeout=1.0)

        await subject.start()
        subject.enqueue_from_thread(crossing())
        await asyncio.sleep(0)
        await subject.stop()

        self.assertEqual(len(sender.calls), 1)
        self.assertEqual(subject.status().published, 1)
        self.assertIsNone(subject.status().last_error)

    async def test_zero_drain_timeout_does_not_hang(self):
        sender = FakeSender([True], delay=1.0)
        subject = publisher(sender, drain_timeout=0.0)

        await subject.start()
        subject.enqueue_from_thread(crossing())
        await asyncio.sleep(0)
        await subject.stop()

        self.assertIsNotNone(subject.status().last_error)

    async def test_status_endpoint_includes_publisher_status(self):
        subject = publisher(FakeSender([True]), enabled=False)
        await subject.start()
        request = SimpleNamespace(
            app=SimpleNamespace(state=SimpleNamespace(event_publisher=subject))
        )

        payload = await vision_status(request)
        await subject.stop()

        self.assertIn("event_publishing_enabled", payload)
        self.assertIn("events_published", payload)
        self.assertNotIn("DEVICE_KEY", payload)
        self.assertNotIn("INGESTION_URL", payload)

    async def test_integration_crossing_to_fake_sender(self):
        sender = FakeSender([True])
        subject = publisher(sender)

        await subject.start()
        subject.enqueue_from_thread(crossing(CrossingDirection.EXIT, 22, "front"))
        await subject.stop()

        self.assertEqual(sender.calls[0]["type"], "person.line_crossed")
        self.assertEqual(sender.calls[0]["payload"]["trackId"], "22")
        self.assertEqual(sender.calls[0]["payload"]["direction"], "EXIT")
        self.assertEqual(sender.calls[0]["payload"]["lineId"], "front")

    async def test_exactly_max_attempts_are_used(self):
        sender = FakeSender([False, False, False, True])
        subject = publisher(sender, attempts=3)

        await subject.start()
        subject.enqueue_from_thread(crossing())
        await subject.stop()

        self.assertEqual(len(sender.calls), 3)
        self.assertEqual(subject.status().failed, 1)

    async def test_sender_exception_does_not_kill_consumer(self):
        sender = FakeSender([RuntimeError("offline"), False, True])
        subject = publisher(sender, attempts=2)

        await subject.start()
        subject.enqueue_from_thread(crossing(track_id=1))
        subject.enqueue_from_thread(crossing(track_id=2))
        await subject.stop()

        self.assertEqual(subject.status().failed, 1)
        self.assertEqual(subject.status().published, 1)
        self.assertEqual(sender.calls[-1]["payload"]["trackId"], "2")

    async def test_fifo_preserved_with_retry(self):
        sender = OrderedFakeSender([False, True, True, True])
        subject = publisher(sender, attempts=2)

        await subject.start()
        subject.enqueue_from_thread(crossing(track_id=1))
        subject.enqueue_from_thread(crossing(track_id=2))
        subject.enqueue_from_thread(crossing(track_id=3))
        await subject.stop()

        self.assertEqual(sender.completed_track_ids, ["1", "2", "3"])


class CrossingEventSyncTests(unittest.TestCase):
    def test_publishing_config_requires_production_values(self):
        with self.assertRaises(ValidationError):
            Settings(CROSSING_EVENTS_ENABLED=True, _env_file=None)

    def test_valid_publishing_config(self):
        settings = Settings(
            CROSSING_EVENTS_ENABLED=True,
            TENANT_ID="tenant",
            CAMERA_ID="camera",
            EDGE_DEVICE_ID="edge",
            DEVICE_KEY="secret",
            INGESTION_URL="http://ingestion",
            _env_file=None,
        )

        self.assertTrue(settings.CROSSING_EVENTS_ENABLED)

    def test_invalid_retry_config_rejected(self):
        with self.assertRaises(ValidationError):
            Settings(
                EVENT_PUBLISH_RETRY_BASE_SECONDS=2,
                EVENT_PUBLISH_RETRY_MAX_SECONDS=1,
                _env_file=None,
            )

    def test_vision_worker_sink_failure_is_swallowed(self):
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

        worker = VisionWorker(
            FakeSettings(),
            crossing_event_sink=lambda event: (_ for _ in ()).throw(RuntimeError("boom")),
        )

        worker._publish_crossing_events([crossing()])

    def test_vision_worker_continues_after_one_sink_event_fails(self):
        calls = []

        def sink(event):
            calls.append(event.track_id)
            if event.track_id == 1:
                raise RuntimeError("boom")

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

        worker = VisionWorker(FakeSettings(), crossing_event_sink=sink)

        worker._publish_crossing_events([crossing(track_id=1), crossing(track_id=2)])

        self.assertEqual(calls, [1, 2])

    def test_mock_mode_importable(self):
        import src.main as main

        self.assertEqual(main.settings.MODE, "mock")


if __name__ == "__main__":
    unittest.main()
