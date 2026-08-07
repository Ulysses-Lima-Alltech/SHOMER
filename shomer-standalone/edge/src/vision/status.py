from fastapi import APIRouter, Request

from src.config import settings
from src.events.publisher import EventPublisherStats

router = APIRouter()


def _publisher_status(request: Request) -> dict[str, object]:
    publisher = getattr(request.app.state, "event_publisher", None)
    if publisher is None:
        return EventPublisherStats(
            enabled=False,
            queue_depth=0,
            published=0,
            failed=0,
            dropped=0,
            last_published_at=None,
            last_error=None,
        ).to_dict()
    return publisher.status().to_dict()


@router.get("/status")
async def status(request: Request) -> dict[str, object]:
    worker = getattr(request.app.state, "vision_worker", None)
    if worker is None:
        mock_worker = getattr(request.app.state, "mock_worker", None)
        return {
            "mode": settings.MODE,
            "running": bool(mock_worker and mock_worker.running),
            "camera_connected": False,
            "model_ready": False,
            "frames_processed": 0,
            "persons_current": 0,
            "line_crossing_enabled": False,
            "entries": 0,
            "exits": 0,
            "last_crossing_at": None,
            "last_crossing_direction": None,
            "last_crossing_track_id": None,
            "track_ids": [],
            "last_frame_at": None,
            "last_detection_at": None,
            "last_error": None,
            **_publisher_status(request),
        }
    return {
        **worker.status().to_dict(),
        **_publisher_status(request),
    }
