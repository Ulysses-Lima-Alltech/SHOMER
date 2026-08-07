from fastapi import APIRouter, Request

from src.config import settings

router = APIRouter()


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
        }
    return worker.status().to_dict()
