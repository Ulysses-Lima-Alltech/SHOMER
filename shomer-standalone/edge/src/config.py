from typing import Optional
import math

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings

from src.analytics.line_crossing import MIN_LINE_LENGTH
from src.vision.intelbras import build_intelbras_rtsp_url


def resolve_camera_source(
    camera_source: Optional[str],
    rtsp_url: Optional[str],
    intelbras_host: Optional[str] = None,
    intelbras_user: Optional[str] = None,
    intelbras_password: Optional[str] = None,
    intelbras_port: int = 554,
    intelbras_channel: int = 1,
    intelbras_subtype: int = 0,
) -> str | int:
    """Resolve the camera source.

    Precedence: CAMERA_SOURCE, then RTSP_URL (kept for older deployments),
    then CAMERA_INTELBRAS_HOST/USER/PASSWORD (builds the RTSP URL so an
    installer only needs the camera's IP and credentials on site), then
    webcam index 0 as a last resort.
    """
    source = (camera_source or "").strip()
    if not source:
        source = (rtsp_url or "").strip()
    if not source and intelbras_host and intelbras_user is not None and intelbras_password is not None:
        source = build_intelbras_rtsp_url(
            host=intelbras_host,
            username=intelbras_user,
            password=intelbras_password,
            port=intelbras_port,
            channel=intelbras_channel,
            subtype=intelbras_subtype,
        )
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
    # Alternativa a CAMERA_SOURCE/RTSP_URL: informe apenas IP + credenciais
    # de uma camera/DVR/NVR Intelbras e a URL RTSP e montada automaticamente
    # (formato "cam/realmonitor", padrao OEM Dahua usado pelas Intelbras).
    CAMERA_INTELBRAS_HOST: str = ""
    CAMERA_INTELBRAS_USER: str = ""
    CAMERA_INTELBRAS_PASSWORD: str = ""
    CAMERA_INTELBRAS_PORT: int = Field(default=554, gt=0)
    CAMERA_INTELBRAS_CHANNEL: int = Field(default=1, gt=0)
    # 0 = mainstream (resolucao cheia), 1 = substream (mais leve para deteccao continua)
    CAMERA_INTELBRAS_SUBTYPE: int = Field(default=0, ge=0)
    FFMPEG_PATH: str = "ffmpeg"
    YOLO_MODEL: str = "yolov8n.pt"
    YOLO_CONFIDENCE: float = Field(default=0.5, gt=0.0, le=1.0)
    YOLO_IMAGE_SIZE: int = Field(default=640, gt=0)
    YOLO_TRACKER: str = "bytetrack.yaml"
    VISION_FPS: float = Field(default=5.0, gt=0.0)
    CAMERA_RECONNECT_SECONDS: float = Field(default=5.0, gt=0.0)
    CAMERA_RECONNECT_MAX_SECONDS: float = Field(default=60.0, gt=0.0)

    # Pausa o processamento fora do horario de funcionamento da loja
    # (configurado no dashboard, em Configuracoes). Busca o horario no
    # endpoint publico da API periodicamente. Desativado por padrao —
    # precisa de TENANT_ID e API_URL configurados corretamente.
    BUSINESS_HOURS_CHECK_ENABLED: bool = False
    BUSINESS_HOURS_POLL_INTERVAL_SECONDS: float = Field(default=300.0, gt=0.0)

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
    # ByteTrack (bytetrack.yaml) keeps a lost track alive for track_buffer=30
    # frames before dropping it and assigning a new track_id on reappearance
    # (~6s of real time at the default VISION_FPS=5). Keep this comfortably
    # above that so our own per-track state does not expire first and mask a
    # reappearance as a brand-new track under normal occlusions. Set to 15s
    # so customers who dart in and out of the store quickly (e.g. dropping
    # something at the car, checking a window display) keep their crossing
    # state instead of being double-counted as two separate visits.
    LINE_CROSSING_TRACK_TTL_SECONDS: float = Field(default=15.0, gt=0.0)

    # Filters out tracks that barely move (mannequins, chairs, other static
    # objects YOLO occasionally misclassifies as "person") from line-crossing
    # and visitor counting. A track is treated as static once it has been
    # observed for STATIC_OBJECT_MIN_OBSERVATION_SECONDS without moving more
    # than STATIC_OBJECT_MAX_DISPLACEMENT (normalized coordinates) from where
    # it first appeared. Raw detections are unaffected.
    #
    # 8s (the original value) was too short: a customer or staff member
    # standing at a counter for longer than that - completely normal in a
    # jewelry store - got misclassified as a static object and vanished
    # from "Agora"/persons_current. A real person shifts stance, gestures,
    # or moves on well within a few minutes; a mannequin never moves.
    # 5 minutes gives real people a wide margin while still catching
    # mannequins, which are static for the entire business day.
    STATIC_OBJECT_FILTER_ENABLED: bool = True
    STATIC_OBJECT_MIN_OBSERVATION_SECONDS: float = Field(default=300.0, gt=0.0)
    STATIC_OBJECT_MAX_DISPLACEMENT: float = Field(default=0.03, ge=0.0)

    CROSSING_EVENTS_ENABLED: bool = False
    # Publica um evento person.detected por pessoa rastreada, no maximo a
    # cada DETECTION_EVENTS_MIN_INTERVAL_SECONDS por track_id. Usa a mesma
    # fila/publisher dos eventos de line crossing.
    DETECTION_EVENTS_ENABLED: bool = False
    DETECTION_EVENTS_MIN_INTERVAL_SECONDS: float = Field(default=3.0, ge=0.0)
    # Publica edge.health.reported periodicamente (independente de
    # CROSSING/DETECTION_EVENTS_ENABLED) para alimentar a tela Monitoramento
    # do dashboard sem depender de acesso direto a rede do cliente.
    EDGE_HEALTH_REPORT_ENABLED: bool = False
    EDGE_HEALTH_REPORT_INTERVAL_SECONDS: float = Field(default=30.0, gt=0.0)
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
        return resolve_camera_source(
            self.CAMERA_SOURCE,
            self.RTSP_URL,
            intelbras_host=self.CAMERA_INTELBRAS_HOST or None,
            intelbras_user=self.CAMERA_INTELBRAS_USER or None,
            intelbras_password=self.CAMERA_INTELBRAS_PASSWORD or None,
            intelbras_port=self.CAMERA_INTELBRAS_PORT,
            intelbras_channel=self.CAMERA_INTELBRAS_CHANNEL,
            intelbras_subtype=self.CAMERA_INTELBRAS_SUBTYPE,
        )

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
        if (
            self.CROSSING_EVENTS_ENABLED
            or self.DETECTION_EVENTS_ENABLED
            or self.EDGE_HEALTH_REPORT_ENABLED
        ):
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
                    "CROSSING_EVENTS_ENABLED/DETECTION_EVENTS_ENABLED/"
                    "EDGE_HEALTH_REPORT_ENABLED requires production values for: "
                    + ", ".join(dict.fromkeys(missing))
                )
        return self

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
