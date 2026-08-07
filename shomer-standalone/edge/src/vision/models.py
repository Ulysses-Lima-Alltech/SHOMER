from dataclasses import asdict, dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class BoundingBox:
    x1: float
    y1: float
    x2: float
    y2: float

    def to_dict(self) -> dict[str, float]:
        return asdict(self)


@dataclass(frozen=True)
class TrackedPerson:
    # Ephemeral tracker ID from ByteTrack. This is not a person identity.
    track_id: int
    bbox: BoundingBox
    confidence: float
    timestamp: datetime

    def to_dict(self) -> dict[str, object]:
        return {
            "track_id": self.track_id,
            "bbox": self.bbox.to_dict(),
            "confidence": self.confidence,
            "timestamp": self.timestamp.isoformat(),
        }


@dataclass(frozen=True)
class VisionStats:
    mode: str
    running: bool
    camera_connected: bool
    model_ready: bool
    frames_processed: int
    persons_current: int
    line_crossing_enabled: bool = False
    entries: int = 0
    exits: int = 0
    last_crossing_at: datetime | None = None
    last_crossing_direction: str | None = None
    last_crossing_track_id: int | None = None
    track_ids: list[int] = field(default_factory=list)
    last_frame_at: datetime | None = None
    last_detection_at: datetime | None = None
    last_error: str | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "mode": self.mode,
            "running": self.running,
            "camera_connected": self.camera_connected,
            "model_ready": self.model_ready,
            "frames_processed": self.frames_processed,
            "persons_current": self.persons_current,
            "line_crossing_enabled": self.line_crossing_enabled,
            "entries": self.entries,
            "exits": self.exits,
            "last_crossing_at": (
                self.last_crossing_at.isoformat() if self.last_crossing_at else None
            ),
            "last_crossing_direction": self.last_crossing_direction,
            "last_crossing_track_id": self.last_crossing_track_id,
            "track_ids": self.track_ids,
            "last_frame_at": self.last_frame_at.isoformat() if self.last_frame_at else None,
            "last_detection_at": (
                self.last_detection_at.isoformat() if self.last_detection_at else None
            ),
            "last_error": self.last_error,
        }
