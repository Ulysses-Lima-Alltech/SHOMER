import logging
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum

from src.vision.models import TrackedPerson

logger = logging.getLogger(__name__)
MIN_LINE_LENGTH = 1e-6


class Side(str, Enum):
    SIDE_A = "SIDE_A"
    SIDE_B = "SIDE_B"
    ON_LINE = "ON_LINE"


class CrossingDirection(str, Enum):
    ENTER = "ENTER"
    EXIT = "EXIT"


class EnterDirection(str, Enum):
    A_TO_B = "A_TO_B"
    B_TO_A = "B_TO_A"


@dataclass(frozen=True)
class NormalizedPoint:
    x: float
    y: float


@dataclass(frozen=True)
class LineCrossingEvent:
    # track_id is ephemeral ByteTrack state, not a person identity.
    track_id: int
    direction: CrossingDirection
    timestamp: datetime
    line_id: str = "main"


@dataclass
class TrackCrossingState:
    last_stable_side: Side | None
    last_seen_at: datetime
    last_crossing_at: datetime | None = None


@dataclass(frozen=True)
class LineCrossingStats:
    enabled: bool
    entries: int
    exits: int
    last_crossing_at: datetime | None
    last_crossing_direction: CrossingDirection | None
    last_crossing_track_id: int | None


class LineCrossingAnalyzer:
    """Detects robust crossings of an A->B oriented virtual line.

    The line and person reference point are normalized to frame dimensions. A small
    dead zone around the line absorbs detector jitter, and per-track cooldown
    avoids duplicate events from quick oscillation. The analyzer is intended to
    run only inside the VisionWorker thread; shared reads are copied by the worker.
    """

    def __init__(
        self,
        enabled: bool,
        line_id: str,
        point_a: NormalizedPoint,
        point_b: NormalizedPoint,
        enter_direction: EnterDirection,
        tolerance: float,
        cooldown_seconds: float,
        track_ttl_seconds: float,
    ) -> None:
        self.enabled = enabled
        self.line_id = line_id
        self.point_a = point_a
        self.point_b = point_b
        self.enter_direction = enter_direction
        self.tolerance = tolerance
        self.cooldown_seconds = cooldown_seconds
        self.track_ttl_seconds = track_ttl_seconds
        self.entries = 0
        self.exits = 0
        self.last_crossing_at: datetime | None = None
        self.last_crossing_direction: CrossingDirection | None = None
        self.last_crossing_track_id: int | None = None
        self._tracks: dict[int, TrackCrossingState] = {}
        self._line_length = math.hypot(
            self.point_b.x - self.point_a.x,
            self.point_b.y - self.point_a.y,
        )
        if self._line_length < MIN_LINE_LENGTH:
            raise ValueError("line crossing points A and B must be meaningfully different")

    def process(
        self,
        persons: list[TrackedPerson],
        frame_width: int,
        frame_height: int,
        now: datetime | None = None,
    ) -> list[LineCrossingEvent]:
        if now is None:
            now = self._resolve_now(persons)
        self._prune_old_tracks(now)

        if not self.enabled:
            return []

        events: list[LineCrossingEvent] = []
        for person in persons:
            point = bottom_center(person, frame_width, frame_height)
            current_side = self.side_for_point(point)
            state = self._tracks.get(person.track_id)
            if state is None:
                self._tracks[person.track_id] = TrackCrossingState(
                    last_stable_side=(
                        current_side if current_side is not Side.ON_LINE else None
                    ),
                    last_seen_at=now,
                )
                continue

            state.last_seen_at = now
            if current_side is Side.ON_LINE:
                continue
            if state.last_stable_side is None:
                state.last_stable_side = current_side
                continue
            if current_side is state.last_stable_side:
                continue

            event = self._crossing_event(person.track_id, state, current_side, now)
            state.last_stable_side = current_side
            if event is not None:
                events.append(event)

        return events

    def side_for_point(self, point: NormalizedPoint) -> Side:
        cross = (
            (self.point_b.x - self.point_a.x) * (point.y - self.point_a.y)
            - (self.point_b.y - self.point_a.y) * (point.x - self.point_a.x)
        )
        signed_distance = cross / self._line_length
        if abs(signed_distance) <= self.tolerance:
            return Side.ON_LINE
        if signed_distance > 0:
            return Side.SIDE_A
        return Side.SIDE_B

    def reset_tracks(self) -> None:
        """Clear temporary per-track state without resetting cumulative counters."""
        self._tracks.clear()

    def stats(self) -> LineCrossingStats:
        return LineCrossingStats(
            enabled=self.enabled,
            entries=self.entries,
            exits=self.exits,
            last_crossing_at=self.last_crossing_at,
            last_crossing_direction=self.last_crossing_direction,
            last_crossing_track_id=self.last_crossing_track_id,
        )

    @property
    def tracked_state_count(self) -> int:
        return len(self._tracks)

    def _crossing_event(
        self,
        track_id: int,
        state: TrackCrossingState,
        current_side: Side,
        now: datetime,
    ) -> LineCrossingEvent | None:
        if state.last_crossing_at is not None:
            elapsed = (now - state.last_crossing_at).total_seconds()
            if elapsed < self.cooldown_seconds:
                return None

        direction = self._direction_for_transition(state.last_stable_side, current_side)
        event = LineCrossingEvent(
            track_id=track_id,
            direction=direction,
            timestamp=now,
            line_id=self.line_id,
        )
        state.last_crossing_at = now
        self._accept_event(event)
        return event

    def _direction_for_transition(
        self, previous_side: Side | None, current_side: Side
    ) -> CrossingDirection:
        a_to_b = previous_side is Side.SIDE_A and current_side is Side.SIDE_B
        if self.enter_direction is EnterDirection.A_TO_B:
            return CrossingDirection.ENTER if a_to_b else CrossingDirection.EXIT
        return CrossingDirection.EXIT if a_to_b else CrossingDirection.ENTER

    def _accept_event(self, event: LineCrossingEvent) -> None:
        if event.direction is CrossingDirection.ENTER:
            self.entries += 1
        else:
            self.exits += 1
        self.last_crossing_at = event.timestamp
        self.last_crossing_direction = event.direction
        self.last_crossing_track_id = event.track_id
        logger.info(
            "Line crossing detected line_id=%s track_id=%s direction=%s",
            event.line_id,
            event.track_id,
            event.direction.value,
        )

    def _prune_old_tracks(self, now: datetime) -> None:
        expired = [
            track_id
            for track_id, state in self._tracks.items()
            if (now - state.last_seen_at).total_seconds() > self.track_ttl_seconds
        ]
        for track_id in expired:
            del self._tracks[track_id]

    @staticmethod
    def _resolve_now(persons: list[TrackedPerson]) -> datetime:
        if persons:
            return max(person.timestamp for person in persons)
        return datetime.now(timezone.utc)


def bottom_center(
    person: TrackedPerson, frame_width: int, frame_height: int
) -> NormalizedPoint:
    """Return normalized bottom-center, approximating feet on the floor plane.

    The bbox is intentionally not clamped: partially out-of-frame detections stay
    mathematically valid and still preserve direction relative to the line.
    """
    if frame_width <= 0 or frame_height <= 0:
        raise ValueError("frame dimensions must be positive")
    return NormalizedPoint(
        x=((person.bbox.x1 + person.bbox.x2) / 2.0) / frame_width,
        y=person.bbox.y2 / frame_height,
    )
