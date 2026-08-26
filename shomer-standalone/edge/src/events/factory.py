import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from src.analytics.line_crossing import LineCrossingEvent
from src.events.models import EdgeEventEnvelope
from src.vision.models import TrackedPerson, VisionStats


@dataclass(frozen=True)
class EventDeviceContext:
    tenant_id: str
    store_id: str | None
    camera_id: str
    edge_device_id: str


class CrossingEventFactory:
    def __init__(self, context: EventDeviceContext) -> None:
        self.context = context

    def create(self, event: LineCrossingEvent) -> EdgeEventEnvelope:
        return EdgeEventEnvelope(
            event_id=str(uuid.uuid4()),
            timestamp=event.timestamp,
            tenant_id=self.context.tenant_id,
            store_id=self.context.store_id,
            event_type="person.line_crossed",
            event_version="v1",
            payload={
                "cameraId": self.context.camera_id,
                "edgeDeviceId": self.context.edge_device_id,
                "trackId": str(event.track_id),
                "lineId": event.line_id,
                "direction": event.direction.value,
            },
        )


class DetectionEventFactory:
    """Builds person.detected envelopes from real YOLO+ByteTrack detections.

    Mirrors the payload shape MockEventGenerator.generate_doorline_crossed
    uses, so the api/stats queries (which read payload.trackId) work the
    same way regardless of whether the source is MODE=mock or MODE=production.
    """

    def __init__(self, context: EventDeviceContext) -> None:
        self.context = context

    def create(
        self,
        person: TrackedPerson,
        frame_width: int,
        frame_height: int,
        is_static: bool = False,
        appearance: list[float] | None = None,
    ) -> EdgeEventEnvelope:
        bbox = person.bbox
        payload: dict = {
            "cameraId": self.context.camera_id,
            "edgeDeviceId": self.context.edge_device_id,
            "trackId": str(person.track_id),
            "boundingBox": {
                "x": bbox.x1,
                "y": bbox.y1,
                "width": bbox.x2 - bbox.x1,
                "height": bbox.y2 - bbox.y1,
            },
            "confidence": person.confidence,
            "isStaff": False,
            # Manequim/objeto parado classificado como "person" pelo YOLO
            # (ver LineCrossingAnalyzer.is_static) - consumidores que contam
            # "pessoas" (ocupacao atual, mapa de calor) devem excluir.
            "isStatic": is_static,
        }
        if appearance is not None:
            # Embedding de re-identificacao (OSNet, ver src/vision/reid.py) -
            # usado pela API pra reconhecer a mesma pessoa fisica vista por
            # duas cameras com campo de visao sobreposto no mesmo instante,
            # evitando contar 2x em stats.getOverview.
            payload["appearance"] = appearance
        if frame_width > 0 and frame_height > 0:
            # Ponto dos pes (centro-base do bbox), normalizado 0..1 pela
            # resolucao do frame. E o dado de entrada do mapa de calor: como
            # e relativo ao enquadramento da camera (nao a pixels absolutos),
            # continua valido mesmo se a resolucao da camera mudar.
            payload["floorPoint"] = {
                "x": round(((bbox.x1 + bbox.x2) / 2) / frame_width, 4),
                "y": round(bbox.y2 / frame_height, 4),
            }
        return EdgeEventEnvelope(
            event_id=str(uuid.uuid4()),
            timestamp=person.timestamp,
            tenant_id=self.context.tenant_id,
            store_id=self.context.store_id,
            event_type="person.detected",
            event_version="v1",
            payload=payload,
        )


class EdgeHealthEventFactory:
    """Builds edge.health.reported envelopes from VisionWorker.status().

    Lets the dashboard's Monitoramento screen show camera/model health
    without reaching into the client's LAN directly - it just reads the
    same event stream stats/reports already use.
    """

    def __init__(self, context: EventDeviceContext) -> None:
        self.context = context

    def create(self, status: VisionStats) -> EdgeEventEnvelope:
        healthy = status.camera_connected and status.model_ready and not status.last_error
        return EdgeEventEnvelope(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            tenant_id=self.context.tenant_id,
            store_id=self.context.store_id,
            event_type="edge.health.reported",
            event_version="v1",
            payload={
                "edgeDeviceId": self.context.edge_device_id,
                "cameraId": self.context.camera_id,
                "status": "healthy" if healthy else "degraded",
                "cameraConnected": status.camera_connected,
                "modelReady": status.model_ready,
                "framesProcessed": status.frames_processed,
                "personsCurrent": status.persons_current,
                "lastFrameAt": status.last_frame_at.isoformat() if status.last_frame_at else None,
                "lastError": status.last_error,
            },
        )
