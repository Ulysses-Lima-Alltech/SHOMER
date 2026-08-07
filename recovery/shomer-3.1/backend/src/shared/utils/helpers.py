import csv
import io
from datetime import datetime
from typing import List
from ..config import brasilia_now
from sqlalchemy import select, desc
from ...infrastructure.repositories.postgres_repository import get_session
from ...infrastructure.repositories.postgres_models import LogModel


def export_log_csv(detector, current_user: str):
    """Export simplificado com total de pessoas capturadas."""
    # CSV simplificado
    buffer = io.StringIO()
    writer = csv.writer(buffer)

    # Header simplificado
    writer.writerow(
        [
            "timestamp",
            "total_pessoas_capturadas",
            "pessoas_atuais",
            "fps_sistema",
            "usuario_exportacao",
        ]
    )

    if detector:
        # Dados atuais do sistema
        current_time = datetime.now()
        total_captured = detector.person_tracking["total_entries"]
        current_persons = detector.person_tracking["current_session_persons"]
        current_fps = detector.current_fps

        writer.writerow(
            [
                current_time.isoformat(),
                total_captured,
                current_persons,
                round(current_fps, 1),
                current_user,
            ]
        )

    csv_data = buffer.getvalue()
    buffer.close()

    # Nome do arquivo com timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"shomer_total_pessoas_{timestamp}.csv"

    return csv_data, filename


async def get_logs_list(limit: int = 100) -> List[dict]:
    """Retorna os últimos `limit` logs (PostgreSQL)."""
    async for session in get_session():
        stmt = select(LogModel).order_by(desc(LogModel.timestamp)).limit(limit)
        res = await session.execute(stmt)
        rows = res.scalars().all()
        return [
            {
                "id": r.id,
                "timestamp": r.timestamp,
                "count": r.count,
                "details": r.details,
                "created_at": r.created_at,
                "user": r.user,
            }
            for r in rows
        ]


def get_detector_stats(detector, camera_config):
    """Retorna estatísticas do detector."""
    if not detector:
        return {"current": 0, "total_passed": 0, "status": "starting"}

    from ...infrastructure.services.video_service import get_cache_stats
    cache_stats = get_cache_stats()

    stats_data = {
        "current": detector.prev_count,
        "total_passed": detector.total_passed,
        "status": "active",
        "fps": detector.current_fps,
        "cache_efficiency": cache_stats["cache_efficiency"],
        "camera": {
            "current_source": (
                "webcam" if camera_config["current_source"] == 0 else "ip_camera"
            ),
            "stream_enabled": camera_config["stream_enabled"],
        },
        "tracking": {
            "total_entries": detector.person_tracking["total_entries"],
            "total_exits": detector.person_tracking["total_exits"],
            "current_persons": detector.person_tracking["current_session_persons"],
            "session_duration": (
                brasilia_now() - detector.person_tracking["session_start"]
            ).total_seconds(),
        },
    }

    return stats_data


def get_performance_stats(detector, camera_config):
    """Métricas de performance detalhadas com cache."""
    try:
        if not detector:
            return {
                "capture_fps": 0,
                "detection_fps": 0,
                "buffer_size": 0,
                "models_status": {
                    "yolo": False,
                    "face": False,
                },
                "memory_usage": {
                    "total_detections": 0,
                    "current_people": 0,
                },
                "detection_rate": {
                    "detections_per_second": 0,
                    "total_detections": 0,
                    "detection_efficiency": 0,
                },
                "camera": {
                    "current_source": "webcam",
                    "stream_enabled": False,
                },
            }

        stats = detector.get_performance_stats()
        from ...infrastructure.services.video_service import get_cache_stats
        cache_stats = get_cache_stats()

        return {
            "capture_fps": stats.get("capture_fps", 0),
            "detection_fps": stats.get("detection_fps", 0),
            "buffer_size": stats.get("frame_queue_size", 0),
            "models_status": {
                "yolo": stats.get("yolo_available", False),
                "face": stats.get("face_available", False),
            },
            "memory_usage": {
                "total_detections": stats.get("total_detections", 0),
                "current_people": stats.get("current_people", 0),
            },
            "detection_rate": stats.get(
                "detection_rate",
                {
                    "detections_per_second": 0,
                    "total_detections": 0,
                    "detection_efficiency": 0,
                },
            ),
            "camera": {
                "current_source": (
                    "webcam" if camera_config["current_source"] == 0 else "ip_camera"
                ),
                "stream_enabled": camera_config["stream_enabled"],
            },
        }
    except Exception as e:
        # Retornar resposta de erro estruturada em vez de 500
        return {
            "capture_fps": 0,
            "detection_fps": 0,
            "buffer_size": 0,
            "models_status": {
                "yolo": False,
                "face": False,
            },
            "memory_usage": {
                "total_detections": 0,
                "current_people": 0,
            },
            "detection_rate": {
                "detections_per_second": 0,
                "total_detections": 0,
                "detection_efficiency": 0,
            },
            "camera": {
                "current_source": "webcam",
                "stream_enabled": False,
            },
            "error": str(e),
        }


def get_health_info(detector, camera_config):
    """Health check ultra-rápido."""
    detector_info = {}
    if detector:
        detector_info = {
            "running": detector.running,
            "prev_count": detector.prev_count,
            "total_passed": detector.total_passed,
            "current_fps": detector.current_fps,
            "person_tracking": detector.person_tracking,
        }

    return {
        "status": "healthy",
        "detector": "ready" if detector else "loading",
        "detector_info": detector_info,
        "camera": {
            "current_source": (
                "webcam" if camera_config["current_source"] == 0 else "ip_camera"
            ),
            "stream_enabled": camera_config["stream_enabled"],
        },
        "timestamp": brasilia_now().isoformat(),
    }
