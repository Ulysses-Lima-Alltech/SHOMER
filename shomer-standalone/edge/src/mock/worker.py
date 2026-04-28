"""
Worker MOCK que gera e envia eventos periodicamente
"""
import asyncio
import logging
from typing import Optional
from src.mock.generator import MockEventGenerator
from src.events.sender import EventSender

logger = logging.getLogger(__name__)


class MockWorker:
    """Worker que gera eventos MOCK e os envia"""

    def __init__(
        self,
        tenant_id: str,
        store_id: Optional[str],
        camera_id: Optional[str],
        edge_device_id: str,
        device_key: str,
        ingestion_url: str,
    ):
        self.generator = MockEventGenerator(tenant_id, store_id, camera_id)
        self.sender = EventSender(ingestion_url, edge_device_id, device_key)
        self.running = False
        self.task: Optional[asyncio.Task] = None

    async def start(self):
        """Inicia o worker"""
        if self.running:
            return

        self.running = True
        self.task = asyncio.create_task(self._run_loop())
        logger.info("Mock Worker iniciado")

    async def stop(self):
        """Para o worker"""
        self.running = False
        if self.task:
            await self.task
        await self.sender.close()
        logger.info("Mock Worker parado")

    async def _run_loop(self):
        """Loop principal que gera e envia eventos"""
        event_count = 0

        while self.running:
            try:
                # Gerar evento doorline_crossed (person.detected)
                doorline_event = self.generator.generate_doorline_crossed()
                await self.sender.send_event(doorline_event)
                event_count += 1

                # Aguardar antes do próximo evento
                await asyncio.sleep(5)  # 5 segundos entre eventos

                # A cada 3 eventos doorline, gerar demographics
                if event_count % 3 == 0:
                    demographics_event = self.generator.generate_demographics_estimated(
                        doorline_event["payload"]["trackId"]
                    )
                    await self.sender.send_event(demographics_event)

                # A cada 10 eventos, gerar health report
                if event_count % 10 == 0:
                    health_event = self.generator.generate_edge_health_reported()
                    await self.sender.send_event(health_event)

            except Exception as e:
                logger.error(f"Erro no loop do worker: {e}")
                await asyncio.sleep(5)




