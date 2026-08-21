"""
Gerador de eventos MOCK para desenvolvimento
"""
import uuid
from datetime import datetime, timedelta
import random
from typing import Dict, Any



# Zonas "quentes" fictícias (entrada, corredor central, caixa) para o mock
# gerar um heatmap plausível em dev/demo, sem depender de câmera real.
_MOCK_HOTSPOTS = [
    (0.15, 0.85),  # entrada
    (0.5, 0.5),    # corredor central
    (0.85, 0.25),  # caixa
]


class MockEventGenerator:
    """Gera eventos sintéticos para modo MOCK"""

    def __init__(self, tenant_id: str, store_id: str = None, camera_id: str = None):
        self.tenant_id = tenant_id
        self.store_id = store_id
        self.camera_id = camera_id or str(uuid.uuid4())
        self.track_id = str(uuid.uuid4())  # Track ID efêmero por sessão

    def generate_doorline_crossed(self) -> Dict[str, Any]:
        """Gera evento doorline_crossed (person.detected)"""
        hotspot_x, hotspot_y = random.choice(_MOCK_HOTSPOTS)
        floor_x = min(1.0, max(0.0, random.gauss(hotspot_x, 0.08)))
        floor_y = min(1.0, max(0.0, random.gauss(hotspot_y, 0.08)))
        return {
            "eventId": str(uuid.uuid4()),
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "tenantId": self.tenant_id,
            "storeId": self.store_id,
            "type": "person.detected",
            "eventVersion": "v1",
            "payload": {
                "imageId": str(uuid.uuid4()),
                "trackId": self.track_id,
                "boundingBox": {
                    "x": random.randint(0, 500),
                    "y": random.randint(0, 500),
                    "width": random.randint(100, 300),
                    "height": random.randint(150, 400),
                },
                "confidence": round(random.uniform(0.7, 0.95), 2),
                "isStaff": False,  # Visitante, não staff
                "floorPoint": {"x": round(floor_x, 4), "y": round(floor_y, 4)},
            },
        }

    def generate_demographics_estimated(self, person_id: str = None) -> Dict[str, Any]:
        """Gera evento demographics.estimated"""
        age = random.randint(18, 65)
        genders = ["M", "F", "UNK"]
        gender = random.choice(genders)
        
        # Quality gate: se confiança baixa, retorna UNK
        confidence = round(random.uniform(0.5, 0.95), 2)
        if confidence < 0.6:
            gender = "UNK"
            age = None

        return {
            "eventId": str(uuid.uuid4()),
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "tenantId": self.tenant_id,
            "storeId": self.store_id,
            "type": "demographics.estimated",
            "eventVersion": "v1",
            "payload": {
                "personId": person_id or str(uuid.uuid4()),
                "trackId": self.track_id,
                "estimatedAge": age,
                "estimatedGender": gender,
                "confidence": confidence,
            },
        }

    def generate_edge_health_reported(self) -> Dict[str, Any]:
        """Gera evento edge.health.reported"""
        return {
            "eventId": str(uuid.uuid4()),
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "tenantId": self.tenant_id,
            "storeId": self.store_id,
            "type": "edge.health.reported",
            "eventVersion": "v1",
            "payload": {
                "edgeDeviceId": self.camera_id,
                "status": "healthy",
                "uptime": random.randint(3600, 86400),
                "cpuUsage": round(random.uniform(10, 80), 2),
                "memoryUsage": round(random.uniform(20, 70), 2),
                "diskUsage": round(random.uniform(30, 60), 2),
            },
        }




