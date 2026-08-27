import logging
import math
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.analytics.line_crossing import MIN_LINE_LENGTH
from src.config import Settings, settings
from src.events.factory import (
    CrossingEventFactory,
    DetectionEventFactory,
    EdgeHealthEventFactory,
    EventDeviceContext,
)
from src.events.health_reporter import HealthReporter
from src.events.publisher import CrossingEventPublisher
from src.events.sender import EventSender
from src.health import router as health_router
from src.mock.worker import MockWorker
from src.schedule.business_hours import BusinessHoursGate
from src.schedule.poller import BusinessHoursPoller
from src.schedule.remote_line_crossing import fetch_line_crossing_override
from src.vision.status import router as vision_router
from src.vision.worker import VisionWorker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

async def _apply_remote_line_crossing(settings: Settings) -> None:
    """Overrides the .env LINE_CROSSING_* defaults with the line the client
    drew for this camera in the dashboard, if any (see
    remote_line_crossing.fetch_line_crossing_override). Mutating `settings`
    in place is safe here: it only happens once, before VisionWorker (and
    the LineCrossingAnalyzer it builds) reads these fields."""
    line = await fetch_line_crossing_override(
        settings.API_URL, settings.TENANT_ID, settings.CAMERA_ID
    )
    if line is None:
        return
    try:
        point_a = line["pointA"]
        point_b = line["pointB"]
        x1, y1, x2, y2 = float(point_a["x"]), float(point_a["y"]), float(point_b["x"]), float(point_b["y"])
        enter_direction = line["enterDirection"]
        if enter_direction not in {"A_TO_B", "B_TO_A"}:
            raise ValueError(f"invalid enterDirection: {enter_direction!r}")
        if math.hypot(x2 - x1, y2 - y1) < MIN_LINE_LENGTH:
            raise ValueError("line points A and B are too close together")
    except (KeyError, TypeError, ValueError):
        logger.warning("Ignoring malformed line-crossing config from API: %r", line, exc_info=True)
        return

    settings.LINE_CROSSING_ENABLED = True
    settings.LINE_CROSSING_X1 = x1
    settings.LINE_CROSSING_Y1 = y1
    settings.LINE_CROSSING_X2 = x2
    settings.LINE_CROSSING_Y2 = y2
    settings.LINE_CROSSING_ENTER_DIRECTION = enter_direction
    logger.info(
        "Using line-crossing config from dashboard for camera_id=%s", settings.CAMERA_ID
    )


mock_worker: MockWorker | None = None
vision_worker: VisionWorker | None = None
event_publisher: CrossingEventPublisher | None = None
event_sender: EventSender | None = None
health_reporter: HealthReporter | None = None
business_hours_poller: BusinessHoursPoller | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage the application lifecycle."""
    global mock_worker, vision_worker, event_publisher, event_sender, health_reporter, business_hours_poller

    if settings.MODE == "mock":
        logger.info("Iniciando modo MOCK...")
        tenant_id = settings.TENANT_ID or "demo-tenant-id"
        store_id = settings.STORE_ID or None
        camera_id = settings.CAMERA_ID or None
        edge_device_id = settings.EDGE_DEVICE_ID or "test-device-id"
        device_key = settings.DEVICE_KEY or "test-device-key"

        mock_worker = MockWorker(
            tenant_id=tenant_id,
            store_id=store_id,
            camera_id=camera_id,
            edge_device_id=edge_device_id,
            device_key=device_key,
            ingestion_url=settings.INGESTION_URL,
        )
        app.state.mock_worker = mock_worker
        await mock_worker.start()
        logger.info("Modo MOCK iniciado")
    elif settings.MODE == "production":
        logger.info("Iniciando modo PRODUCTION...")
        try:
            crossing_event_sink = None
            detection_event_sink = None
            if (
                settings.CROSSING_EVENTS_ENABLED
                or settings.DETECTION_EVENTS_ENABLED
                or settings.EDGE_HEALTH_REPORT_ENABLED
            ):
                device_context = EventDeviceContext(
                    tenant_id=settings.TENANT_ID or "",
                    store_id=settings.STORE_ID,
                    camera_id=settings.CAMERA_ID or "",
                    edge_device_id=settings.EDGE_DEVICE_ID,
                )
                event_sender = EventSender(
                    settings.INGESTION_URL,
                    settings.EDGE_DEVICE_ID,
                    settings.DEVICE_KEY,
                )
                event_publisher = CrossingEventPublisher(
                    enabled=True,
                    sender=event_sender,
                    factory=CrossingEventFactory(device_context),
                    queue_max_size=settings.EVENT_QUEUE_MAX_SIZE,
                    max_attempts=settings.EVENT_PUBLISH_MAX_ATTEMPTS,
                    retry_base_seconds=settings.EVENT_PUBLISH_RETRY_BASE_SECONDS,
                    retry_max_seconds=settings.EVENT_PUBLISH_RETRY_MAX_SECONDS,
                    drain_timeout_seconds=settings.EVENT_PUBLISH_DRAIN_TIMEOUT_SECONDS,
                )
                await event_publisher.start()
                app.state.event_publisher = event_publisher

                if settings.CROSSING_EVENTS_ENABLED:
                    crossing_event_sink = event_publisher.enqueue_from_thread

                if settings.DETECTION_EVENTS_ENABLED:
                    detection_factory = DetectionEventFactory(device_context)

                    def detection_event_sink(
                        person,
                        frame_width,
                        frame_height,
                        is_static,
                        appearance,
                        _publisher=event_publisher,
                        _factory=detection_factory,
                    ):
                        _publisher.enqueue_envelope_from_thread(
                            _factory.create(
                                person, frame_width, frame_height, is_static, appearance
                            )
                        )

            business_hours_gate = None
            if settings.BUSINESS_HOURS_CHECK_ENABLED:
                business_hours_gate = BusinessHoursGate()

            if settings.TENANT_ID and settings.CAMERA_ID:
                await _apply_remote_line_crossing(settings)

            vision_worker = VisionWorker(
                settings,
                crossing_event_sink=crossing_event_sink,
                detection_event_sink=detection_event_sink,
                business_hours_gate=business_hours_gate,
            )
            app.state.vision_worker = vision_worker
            await vision_worker.start()

            if business_hours_gate is not None and settings.TENANT_ID:
                business_hours_poller = BusinessHoursPoller(
                    api_url=settings.API_URL,
                    tenant_id=settings.TENANT_ID,
                    gate=business_hours_gate,
                    interval_seconds=settings.BUSINESS_HOURS_POLL_INTERVAL_SECONDS,
                )
                await business_hours_poller.start()

            if settings.EDGE_HEALTH_REPORT_ENABLED and event_publisher is not None:
                health_reporter = HealthReporter(
                    worker=vision_worker,
                    publisher=event_publisher,
                    factory=EdgeHealthEventFactory(device_context),
                    interval_seconds=settings.EDGE_HEALTH_REPORT_INTERVAL_SECONDS,
                )
                await health_reporter.start()

            logger.info("Modo PRODUCTION iniciado")
        except Exception:
            if business_hours_poller:
                await business_hours_poller.stop()
            if health_reporter:
                await health_reporter.stop()
            if vision_worker:
                await vision_worker.stop()
            if event_publisher:
                await event_publisher.stop()
            if event_sender:
                await event_sender.close()
            raise
    else:
        raise RuntimeError(
            f"MODE invalido: {settings.MODE!r}. Use 'mock' ou 'production'."
        )

    try:
        yield
    finally:
        if mock_worker:
            await mock_worker.stop()
            logger.info("Modo MOCK parado")
        if business_hours_poller:
            await business_hours_poller.stop()
        if health_reporter:
            await health_reporter.stop()
        if vision_worker:
            await vision_worker.stop()
            logger.info("Modo PRODUCTION parado")
        if event_publisher:
            await event_publisher.stop()
            logger.info("Crossing event publisher parado")
        if event_sender:
            await event_sender.close()


app = FastAPI(
    title="SHOMER Edge Service",
    description="Servico de captura e processamento de video na borda",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/health", tags=["health"])
app.include_router(vision_router, prefix="/vision", tags=["vision"])


@app.get("/")
async def root():
    return {
        "service": "shomer-edge",
        "status": "running",
        "mode": settings.MODE,
        "tenant_id": settings.TENANT_ID if hasattr(settings, "TENANT_ID") else None,
        "store_id": settings.STORE_ID if hasattr(settings, "STORE_ID") else None,
    }


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
