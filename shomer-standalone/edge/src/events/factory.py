import uuid
from dataclasses import dataclass

from src.analytics.line_crossing import LineCrossingEvent
from src.events.models import EdgeEventEnvelope


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
