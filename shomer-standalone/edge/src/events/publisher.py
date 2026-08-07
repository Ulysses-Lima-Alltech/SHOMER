import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol

from src.analytics.line_crossing import LineCrossingEvent
from src.events.factory import CrossingEventFactory
from src.events.models import EdgeEventEnvelope
from src.vision.camera import sanitize_error

logger = logging.getLogger(__name__)


class EventSenderProtocol(Protocol):
    async def send_event(self, event: dict) -> bool:
        ...


@dataclass(frozen=True)
class EventPublisherStats:
    enabled: bool
    queue_depth: int
    published: int
    failed: int
    dropped: int
    last_published_at: datetime | None
    last_error: str | None

    def to_dict(self) -> dict[str, object]:
        return {
            "event_publishing_enabled": self.enabled,
            "event_queue_depth": self.queue_depth,
            "events_published": self.published,
            "events_failed": self.failed,
            "events_dropped": self.dropped,
            "last_event_published_at": (
                self.last_published_at.isoformat() if self.last_published_at else None
            ),
            "last_publish_error": self.last_error,
        }


class CrossingEventPublisher:
    """Async FIFO publisher with bounded in-memory queue.

    Queue overflow drops the newest event to keep vision processing non-blocking.
    There is no durable spool in this MVP, so crashes, overflow, shutdown timeout,
    or final retry failure can lose events.
    """

    def __init__(
        self,
        *,
        enabled: bool,
        sender: EventSenderProtocol,
        factory: CrossingEventFactory,
        queue_max_size: int,
        max_attempts: int,
        retry_base_seconds: float,
        retry_max_seconds: float,
        drain_timeout_seconds: float,
    ) -> None:
        self.enabled = enabled
        self.sender = sender
        self.factory = factory
        self.queue_max_size = queue_max_size
        self.max_attempts = max_attempts
        self.retry_base_seconds = retry_base_seconds
        self.retry_max_seconds = retry_max_seconds
        self.drain_timeout_seconds = drain_timeout_seconds
        self._queue: asyncio.Queue[EdgeEventEnvelope] | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._task: asyncio.Task | None = None
        self._running = False
        self._inflight_events = 0
        self.published_events = 0
        self.failed_events = 0
        self.dropped_events = 0
        self.last_published_at: datetime | None = None
        self.last_error: str | None = None

    async def start(self) -> None:
        if self._running:
            return
        self._loop = asyncio.get_running_loop()
        self._queue = asyncio.Queue(maxsize=self.queue_max_size)
        self._running = True
        if self.enabled:
            self._task = asyncio.create_task(self._run(), name="CrossingEventPublisher")

    async def stop(self) -> None:
        if not self._running:
            return
        # Let already scheduled call_soon_threadsafe callbacks enqueue before drain.
        await asyncio.sleep(0)
        self._running = False
        if self._queue is not None and self._task is not None:
            try:
                if self.drain_timeout_seconds == 0:
                    if self._queue.qsize() > 0 or self._inflight_events > 0:
                        raise asyncio.TimeoutError
                else:
                    await asyncio.wait_for(
                        self._queue.join(),
                        timeout=self.drain_timeout_seconds,
                    )
            except asyncio.TimeoutError:
                abandoned = self._queue.qsize() + self._inflight_events
                self.dropped_events += abandoned
                self.last_error = (
                    f"Publisher drain timed out with {abandoned} events abandoned"
                )
                logger.warning(self.last_error)
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None

    def enqueue_from_thread(self, event: LineCrossingEvent) -> None:
        if (
            not self.enabled
            or not self._running
            or self._loop is None
            or self._loop.is_closed()
        ):
            return
        try:
            self._loop.call_soon_threadsafe(self._enqueue_event_nowait, event)
        except RuntimeError as exc:
            logger.warning("Crossing event enqueue rejected: %s", sanitize_error(str(exc)))

    def status(self) -> EventPublisherStats:
        queue_depth = self._queue.qsize() if self._queue is not None else 0
        return EventPublisherStats(
            enabled=self.enabled,
            queue_depth=queue_depth,
            published=self.published_events,
            failed=self.failed_events,
            dropped=self.dropped_events,
            last_published_at=self.last_published_at,
            last_error=self.last_error,
        )

    async def _run(self) -> None:
        assert self._queue is not None
        while True:
            envelope = await self._queue.get()
            self._inflight_events += 1
            try:
                await self._publish_with_retry(envelope)
            finally:
                self._inflight_events -= 1
                self._queue.task_done()

    def _enqueue_event_nowait(self, event: LineCrossingEvent) -> None:
        if not self._running:
            self.dropped_events += 1
            return
        try:
            envelope = self.factory.create(event)
        except Exception as exc:
            self.failed_events += 1
            self.last_error = sanitize_error(f"Failed to create crossing event: {exc}")
            logger.warning("Failed to create crossing event", exc_info=True)
            return
        self._enqueue_nowait(envelope)

    def _enqueue_nowait(self, envelope: EdgeEventEnvelope) -> None:
        if self._queue is None:
            self.dropped_events += 1
            return
        try:
            self._queue.put_nowait(envelope)
        except asyncio.QueueFull:
            self.dropped_events += 1
            if self.dropped_events == 1 or self.dropped_events % 100 == 0:
                logger.warning(
                    "Crossing event queue full; dropped_events=%s",
                    self.dropped_events,
                )

    async def _publish_with_retry(self, envelope: EdgeEventEnvelope) -> None:
        event_dict = envelope.to_dict()
        for attempt in range(1, self.max_attempts + 1):
            try:
                if await self.sender.send_event(event_dict):
                    self.published_events += 1
                    self.last_published_at = datetime.now(timezone.utc)
                    self.last_error = None
                    return
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self.last_error = sanitize_error(f"Event publish failed: {exc}")
                logger.warning("Event publish failed", exc_info=True)
            if attempt < self.max_attempts:
                await asyncio.sleep(self._retry_delay(attempt))

        self.failed_events += 1
        self.last_error = "Event publish failed after max attempts"

    def _retry_delay(self, attempt: int) -> float:
        if self.retry_base_seconds == 0:
            return 0.0
        delay = self.retry_base_seconds * (2 ** (attempt - 1))
        return min(delay, self.retry_max_seconds)
