from typing import Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


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

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
