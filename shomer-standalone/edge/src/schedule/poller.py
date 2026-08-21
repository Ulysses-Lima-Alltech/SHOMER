import asyncio
import logging

import httpx

from src.schedule.business_hours import BusinessHoursGate

logger = logging.getLogger(__name__)


class BusinessHoursPoller:
    """Busca o horário de funcionamento na API periodicamente e atualiza o
    BusinessHoursGate. Endpoint público (sem autenticação de dispositivo) —
    ver api/src/tenants/public-hours.controller.ts."""

    def __init__(
        self,
        api_url: str,
        tenant_id: str,
        gate: BusinessHoursGate,
        interval_seconds: float,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.tenant_id = tenant_id
        self.gate = gate
        self.interval_seconds = interval_seconds
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        if self._task is not None:
            return
        await self._refresh()
        self._task = asyncio.create_task(self._run(), name="BusinessHoursPoller")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

    async def _run(self) -> None:
        while True:
            await asyncio.sleep(self.interval_seconds)
            await self._refresh()

    async def _refresh(self) -> None:
        url = f"{self.api_url}/public/tenants/{self.tenant_id}/hours"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                data = response.json()
            self.gate.update(data.get("operatingHours"))
        except Exception:
            logger.warning("Failed to fetch business hours from %s", url, exc_info=True)
