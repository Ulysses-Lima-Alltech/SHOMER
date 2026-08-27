import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


async def fetch_line_crossing_override(
    api_url: str, tenant_id: str, camera_id: str
) -> dict[str, Any] | None:
    """One-shot fetch of the entrance/exit line drawn for this camera in the
    dashboard (Configuracoes -> Linha de entrada/saida). Public endpoint, same
    rationale as BusinessHoursPoller - the edge has no user login, and a line's
    coordinates aren't sensitive (just geometry, no image or identity).

    Fetched once at startup only, not polled: a line saved in the dashboard
    takes effect on the next restart of this camera's edge process, not live.
    Returns None on any failure (network, missing config, disabled) so the
    caller falls back to whatever LINE_CROSSING_* is set in .env.
    """
    url = f"{api_url.rstrip('/')}/public/tenants/{tenant_id}/line-crossing/{camera_id}"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()
        line_crossing = data.get("lineCrossing")
        if not line_crossing or not line_crossing.get("enabled"):
            return None
        return line_crossing
    except Exception:
        logger.warning("Failed to fetch line-crossing config from %s", url, exc_info=True)
        return None
