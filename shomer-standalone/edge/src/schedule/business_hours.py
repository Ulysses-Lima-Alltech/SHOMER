import logging
import threading
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

logger = logging.getLogger(__name__)

WEEKDAY_KEYS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]


class BusinessHoursGate:
    """Cache thread-safe do horário de funcionamento da loja.

    Consultado pela thread síncrona do VisionWorker (is_open_now) e
    atualizado pelo BusinessHoursPoller, que roda no loop asyncio e busca
    o horário configurado na API periodicamente.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._hours: dict[str, Any] | None = None

    def update(self, hours: dict[str, Any] | None) -> None:
        with self._lock:
            self._hours = hours

    def is_open_now(self) -> bool:
        with self._lock:
            hours = self._hours

        # Sem horário configurado (null) ou checagem desativada: processa
        # o tempo todo, como sempre foi.
        if not hours or not hours.get("enabled"):
            return True

        try:
            tz = ZoneInfo(hours.get("timezone") or "UTC")
        except ZoneInfoNotFoundError:
            tz = ZoneInfo("UTC")

        now = datetime.now(tz)
        day = hours.get(WEEKDAY_KEYS[now.weekday()])
        if not day or day.get("closed"):
            return False

        try:
            open_time = datetime.strptime(day["open"], "%H:%M").time()
            close_time = datetime.strptime(day["close"], "%H:%M").time()
        except (KeyError, ValueError, TypeError):
            # Horário mal formado - não bloqueia o processamento por
            # segurança, só ignora a checagem pra esse dia.
            return True

        return open_time <= now.time() < close_time
