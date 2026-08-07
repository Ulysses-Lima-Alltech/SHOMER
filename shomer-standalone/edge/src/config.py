from typing import Optional
import math

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings

from src.analytics.line_crossing import MIN_LINE_LENGTH


def resolve_camera_source(camera_source: Optional[str], rtsp_url: Optional[str]) -> str | int:
    """Resolve CAMERA_SOURCE with RTSP_URL fallback for older deployments."""
    source = (camera_source or "").strip()
    if not source:
        source = (rtsp_url or "").strip()
    if not source:
        source = "0"
    if source.isdigit():
        return int(source)
    return source


class Settings(BaseSettings):
    MODE: str = "mock"  # mock ou production
    API_URL: str = "http://localhost:3000"
    INGESTION_URL: str = "http://localhost:3001"

    # Camera/vision (para modo production)
    CAMERA_SOURCE: str = ""
    RTSP_URL: str = ""
    FFMPEG_PATH: str = "ffmpeg"
    YOLO_MODEL: str = "yolov8n.pt"
    YOLO_CONFIDENCE: float = Field(default=0.5, gt=0.0, le=1.0)
    YOLO_IMAGE_SIZE: int = Field(default=640, gt=0)
    YOLO_TRACKER: str = "bytetrack.yaml"
    VISION_FPS: float = Field(default=5.0, gt=0.0)
    CAMERA_RECONNECT_SECONDS: float = Field(default=5.0, gt=0.0)

    # Local line-crossing analytics. Coordinates are normalized to frame size.
    LINE_CROSSING_ENABLED: bool = True
    LINE_CROSSING_LINE_ID: str = "main"
    LINE_CROSSING_X1: float = Field(default=0.0, ge=0.0, le=1.0)
    LINE_CROSSING_Y1: float = Field(default=0.5, ge=0.0, le=1.0)
    LINE_CROSSING_X2: float = Field(default=1.0, ge=0.0, le=1.0)
    LINE_CROSSING_Y2: float = Field(default=0.5, ge=0.0, le=1.0)
    LINE_CROSSING_ENTER_DIRECTION: str = "A_TO_B"
    LINE_CROSSING_TOLERANCE: float = Field(default=0.02, ge=0.0, le=0.25)
    LINE_CROSSING_COOLDOWN_SECONDS: float = Field(default=1.0, ge=0.0)
    LINE_CROSSING_TRACK_TTL_SECONDS: float = Field(default=10.0, gt=0.0)

    CROSSING_EVENTS_ENABLED: bool = False
    EVENT_QUEUE_MAX_SIZE: int = Field(default=1000, gt=0)
    EVENT_PUBLISH_MAX_ATTEMPTS: int = Field(default=3, ge=1)
    EVENT_PUBLISH_RETRY_BASE_SECONDS: float = Field(default=0.5, ge=0.0)
    EVENT_PUBLISH_RETRY_MAX_SECONDS: float = Field(default=5.0, ge=0.0)
    EVENT_PUBLISH_DRAIN_TIMEOUT_SECONDS: float = Field(default=5.0, ge=0.0)

    # Configuracao para modo MOCK (dev end-to-end)
    TENANT_ID: Optional[str] = None
    STORE_ID: Optional[str] = None
    CAMERA_ID: Optional[str] = None
    EDGE_DEVICE_ID: str = "test-device-id"
    DEVICE_KEY: str = "test-device-key"

    @property
    def RESOLVED_CAMERA_SOURCE(self) -> str | int:
        return resolve_camera_source(self.CAMERA_SOURCE, self.RTSP_URL)

    @field_validator("MODE")
    @classmethod
    def validate_mode(cls, value: str) -> str:
        if value not in {"mock", "production"}:
            raise ValueError("MODE must be 'mock' or 'production'")
        return value

    @field_validator("LINE_CROSSING_ENTER_DIRECTION")
    @classmethod
    def validate_line_crossing_direction(cls, value: str) -> str:
        if value not in {"A_TO_B", "B_TO_A"}:
            raise ValueError(
                "LINE_CROSSING_ENTER_DIRECTION must be 'A_TO_B' or 'B_TO_A'"
            )
        return value

    @model_validator(mode="after")
    def validate_line_crossing_line(self) -> "Settings":
        line_length = math.hypot(
            self.LINE_CROSSING_X2 - self.LINE_CROSSING_X1,
            self.LINE_CROSSING_Y2 - self.LINE_CROSSING_Y1,
        )
        if line_length < MIN_LINE_LENGTH:
            raise ValueError("line crossing points A and B must be meaningfully different")
        if self.EVENT_PUBLISH_RETRY_MAX_SECONDS < self.EVENT_PUBLISH_RETRY_BASE_SECONDS:
            raise ValueError(
                "EVENT_PUBLISH_RETRY_MAX_SECONDS must be greater than or equal to "
                "EVENT_PUBLISH_RETRY_BASE_SECONDS"
            )
        if self.CROSSING_EVENTS_ENABLED:
            required_values = {
                "TENANT_ID": self.TENANT_ID,
                "CAMERA_ID": self.CAMERA_ID,
                "EDGE_DEVICE_ID": self.EDGE_DEVICE_ID,
                "DEVICE_KEY": self.DEVICE_KEY,
                "INGESTION_URL": self.INGESTION_URL,
            }
            missing = [
                name for name, value in required_values.items() if not str(value or "").strip()
            ]
            if self.EDGE_DEVICE_ID == "test-device-id":
                missing.append("EDGE_DEVICE_ID")
            if self.DEVICE_KEY == "test-device-key":
                missing.append("DEVICE_KEY")
            if missing:
                raise ValueError(
                    "CROSSING_EVENTS_ENABLED requires production values for: "
                    + ", ".join(dict.fromkeys(missing))
                )
        return self

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
