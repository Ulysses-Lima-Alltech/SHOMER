"""
Enviador de eventos para o serviço de ingestion
"""
import httpx
import asyncio
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)


class EventSender:
    """Envia eventos para o serviço de ingestion"""

    def __init__(self, ingestion_url: str, edge_device_id: str, device_key: str):
        self.ingestion_url = ingestion_url.rstrip("/")
        self.edge_device_id = edge_device_id
        self.device_key = device_key
        self.client = httpx.AsyncClient(timeout=10.0)

    async def send_event(self, event: Dict[str, Any]) -> bool:
        """Envia um evento para o ingestion service"""
        try:
            response = await self.client.post(
                f"{self.ingestion_url}/events",
                json=event,
                headers={
                    "x-edge-device-id": self.edge_device_id,
                    "x-device-key": self.device_key,
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()
            logger.info(f"Evento enviado: {event['type']} ({event['eventId']})")
            return True
        except httpx.HTTPError as e:
            logger.error(f"Erro ao enviar evento: {e}")
            return False
        except Exception as e:
            logger.error(f"Erro inesperado ao enviar evento: {e}")
            return False

    async def close(self):
        """Fecha o cliente HTTP"""
        await self.client.aclose()




