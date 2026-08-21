import os
import sys
import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

EDGE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if EDGE_DIR not in sys.path:
    sys.path.insert(0, EDGE_DIR)

from src.schedule.business_hours import BusinessHoursGate, WEEKDAY_KEYS


def hours_for(weekday_key: str, open_="08:00", close="22:00", closed=False, enabled=True):
    day = {"open": open_, "close": close, "closed": closed}
    hours = {
        "timezone": "America/Sao_Paulo",
        "enabled": enabled,
    }
    for key in WEEKDAY_KEYS:
        hours[key] = dict(day) if key == weekday_key else {"open": "00:00", "close": "23:59", "closed": True}
    return hours


class BusinessHoursGateTests(unittest.TestCase):
    def test_open_when_no_schedule_configured(self):
        gate = BusinessHoursGate()
        gate.update(None)
        self.assertTrue(gate.is_open_now())

    def test_open_when_disabled(self):
        gate = BusinessHoursGate()
        now = datetime.now(ZoneInfo("America/Sao_Paulo"))
        today_key = WEEKDAY_KEYS[now.weekday()]
        hours = hours_for(today_key, enabled=False)
        gate.update(hours)
        self.assertTrue(gate.is_open_now())

    def test_closed_when_today_marked_closed(self):
        gate = BusinessHoursGate()
        now = datetime.now(ZoneInfo("America/Sao_Paulo"))
        today_key = WEEKDAY_KEYS[now.weekday()]
        hours = hours_for(today_key, closed=True)
        gate.update(hours)
        self.assertFalse(gate.is_open_now())

    def test_open_within_current_hour_window(self):
        gate = BusinessHoursGate()
        now = datetime.now(ZoneInfo("America/Sao_Paulo"))
        today_key = WEEKDAY_KEYS[now.weekday()]
        # Janela que cobre "agora" com folga de 1h pra cada lado.
        open_hour = max(0, now.hour - 1)
        close_hour = min(23, now.hour + 1)
        hours = hours_for(today_key, open_=f"{open_hour:02d}:00", close=f"{close_hour:02d}:59")
        gate.update(hours)
        self.assertTrue(gate.is_open_now())

    def test_closed_outside_hour_window(self):
        gate = BusinessHoursGate()
        now = datetime.now(ZoneInfo("America/Sao_Paulo"))
        today_key = WEEKDAY_KEYS[now.weekday()]
        # Janela de 1 minuto que já passou hoje de manhã cedo (ou é
        # amanhã, se agora for antes da meia-noite e 1min) — de qualquer
        # forma, fora do horário "agora" na prática dos testes por não
        # cobrir a hora atual.
        hours = hours_for(today_key, open_="00:00", close="00:01")
        if now.hour == 0 and now.minute < 1:
            self.skipTest("horario de teste coincide com a janela minuscula")
        gate.update(hours)
        self.assertFalse(gate.is_open_now())

    def test_malformed_day_defaults_to_open(self):
        gate = BusinessHoursGate()
        now = datetime.now(ZoneInfo("America/Sao_Paulo"))
        today_key = WEEKDAY_KEYS[now.weekday()]
        hours = hours_for(today_key)
        hours[today_key] = {"open": "not-a-time", "close": "22:00", "closed": False}
        gate.update(hours)
        self.assertTrue(gate.is_open_now())


if __name__ == "__main__":
    unittest.main()
