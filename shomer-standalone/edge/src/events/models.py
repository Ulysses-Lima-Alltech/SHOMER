from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


@dataclass(frozen=True)
class EdgeEventEnvelope:
    event_id: str
    timestamp: datetime
    tenant_id: str
    store_id: str | None
    event_type: str
    event_version: str
    payload: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "eventId": self.event_id,
            "timestamp": _format_timestamp(self.timestamp),
            "tenantId": self.tenant_id,
            "storeId": self.store_id,
            "type": self.event_type,
            "eventVersion": self.event_version,
            "payload": self.payload,
        }


def _format_timestamp(value: datetime) -> str:
    if value.tzinfo is None:
        raise ValueError("event timestamp must be timezone-aware")
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
