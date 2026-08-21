import asyncio
import logging
from typing import Protocol

from src.events.factory import EdgeHealthEventFactory
from src.events.models import EdgeEventEnvelope
from src.vision.models import VisionStats

logger = logging.getLogger(__name__)


class HealthPublisherProtocol(Protocol):
    def enqueue_envelope_from_thread(self, envelope: EdgeEventEnvelope) -> None:
        ...


class WorkerStatusProtocol(Protocol):
    def status(self) -> VisionStats:
        ...


class HealthReporter:
    """Periodically publishes edge.health.reported.

    Runs independently of CROSSING_EVENTS_ENABLED/DETECTION_EVENTS_ENABLED so
    the dashboard's Monitoramento screen has a heartbeat even when those are
    off - it only needs to know the edge/camera pipeline is alive.
    """

    def __init__(
        self,
        worker: WorkerStatusProtocol,
        publisher: HealthPublisherProtocol,
        factory: EdgeHealthEventFactory,
        interval_seconds: float,
    ) -> None:
        self.worker = worker
        self.publisher = publisher
        self.factory = factory
        self.interval_seconds = interval_seconds
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._run(), name="HealthReporter")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

    async def _run(self) -> None:
        while True:
            try:
                envelope = self.factory.create(self.worker.status())
                self.publisher.enqueue_envelope_from_thread(envelope)
            except Exception:
                logger.exception("Health report failed")
            await asyncio.sleep(self.interval_seconds)
