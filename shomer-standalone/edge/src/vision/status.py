import asyncio

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from src.config import settings
from src.events.publisher import EventPublisherStats

router = APIRouter()

MJPEG_BOUNDARY = b"shomerframe"
# ~8fps, acompanhando o VISION_FPS padrao (nao ha por que empurrar o stream
# mais devagar que a propria taxa de deteccao - so estaria descartando
# frames ja disponiveis).
MJPEG_INTERVAL_SECONDS = 0.125


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


@router.get("/snapshot")
async def snapshot(request: Request) -> Response:
    """Latest camera frame as JPEG — a single still image (not a live
    stream), used as the background for the heatmap overlay in the
    dashboard."""
    worker = getattr(request.app.state, "vision_worker", None)
    if worker is None:
        raise HTTPException(status_code=404, detail="Vision worker not running (MODE=mock?)")
    jpeg = worker.get_latest_frame_jpeg()
    if jpeg is None:
        raise HTTPException(status_code=503, detail="No frame captured yet")
    return Response(content=jpeg, media_type="image/jpeg")


@router.get("/debug_snapshot")
async def debug_snapshot(request: Request) -> Response:
    """Latest frame with detection boxes drawn (green = counted, red =
    filtered as static object) - support/debugging tool, not used by the
    dashboard."""
    worker = getattr(request.app.state, "vision_worker", None)
    if worker is None:
        raise HTTPException(status_code=404, detail="Vision worker not running (MODE=mock?)")
    jpeg = worker.get_debug_frame_jpeg()
    if jpeg is None:
        raise HTTPException(status_code=503, detail="No frame captured yet")
    return Response(content=jpeg, media_type="image/jpeg")


@router.get("/debug_stream")
async def debug_stream(request: Request) -> StreamingResponse:
    """MJPEG stream (multipart/x-mixed-replace) of debug_snapshot frames -
    the "Validacao ao vivo" tab uses this instead of polling debug_snapshot
    on an interval, so it reads as continuous video instead of refreshing
    stills. Same annotated frame (green = counted, red = filtered as
    static object), just pushed continuously."""
    worker = getattr(request.app.state, "vision_worker", None)
    if worker is None:
        raise HTTPException(status_code=404, detail="Vision worker not running (MODE=mock?)")

    async def generate():
        try:
            while True:
                jpeg = worker.get_debug_frame_jpeg()
                if jpeg is not None:
                    yield (
                        b"--" + MJPEG_BOUNDARY + b"\r\n"
                        b"Content-Type: image/jpeg\r\n"
                        b"Content-Length: " + str(len(jpeg)).encode() + b"\r\n\r\n"
                        + jpeg + b"\r\n"
                    )
                await asyncio.sleep(MJPEG_INTERVAL_SECONDS)
        except asyncio.CancelledError:
            pass  # client disconnected - stop pushing frames

    return StreamingResponse(
        generate(),
        media_type=f"multipart/x-mixed-replace; boundary={MJPEG_BOUNDARY.decode()}",
    )
