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
    first_seen_at: datetime
    first_point: "NormalizedPoint"
    last_point: "NormalizedPoint"
    max_displacement: float = 0.0
    last_crossing_at: datetime | None = None
    # Candidate side change awaiting confirmation (see crossing_confirm_seconds) -
    # a foot/limb that pokes past the line for a single frame and pulls back
    # (someone sitting or leaning near the line) must not count as a crossing.
    pending_side: Side | None = None
    pending_since: datetime | None = None


@dataclass
class _PositionDwell:
    """Cumulative time something has been detected near a fixed spot,
    independent of ByteTrack track_id continuity (see _update_position_dwell)."""

    point: "NormalizedPoint"
    last_seen_at: datetime
    accumulated_seconds: float = 0.0


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
        crossing_confirm_seconds: float = 0.6,
        static_filter_enabled: bool = True,
        static_min_observation_seconds: float = 8.0,
        static_max_displacement: float = 0.03,
        static_dwell_max_gap_seconds: float = 30.0,
    ) -> None:
        self.enabled = enabled
        self.line_id = line_id
        self.point_a = point_a
        self.point_b = point_b
        self.enter_direction = enter_direction
        self.tolerance = tolerance
        self.cooldown_seconds = cooldown_seconds
        self.track_ttl_seconds = track_ttl_seconds
        self.crossing_confirm_seconds = crossing_confirm_seconds
        self.static_filter_enabled = static_filter_enabled
        self.static_min_observation_seconds = static_min_observation_seconds
        self.static_max_displacement = static_max_displacement
        self.static_dwell_max_gap_seconds = static_dwell_max_gap_seconds
        self.entries = 0
        self.exits = 0
        self.last_crossing_at: datetime | None = None
        self.last_crossing_direction: CrossingDirection | None = None
        self.last_crossing_track_id: int | None = None
        self._tracks: dict[int, TrackCrossingState] = {}
        # Positions already proven static (see _is_static_track), remembered
        # independently of track_id, so once proven an object never needs to
        # requalify after an ID swap or process restart.
        self._known_static_points: list[NormalizedPoint] = []
        # Cumulative dwell time per position (see _update_position_dwell),
        # also independent of track_id. A ByteTrack ID for a motionless
        # object (mannequin, prop, bag on a chair) churns constantly on
        # borderline-confidence detections - lighting flicker, a passerby
        # occluding it - so no single track ever survives long enough to
        # reach static_min_observation_seconds on its own, and the object
        # never qualifies via _known_static_points. This tracks total time
        # anything has been seen near a spot across track_id swaps instead,
        # as long as gaps stay under static_dwell_max_gap_seconds.
        self._position_dwell: list[_PositionDwell] = []
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
            if self.static_filter_enabled:
                self._update_position_dwell(point, now)
            current_side = self.side_for_point(point)
            state = self._tracks.get(person.track_id)
            if state is None:
                self._tracks[person.track_id] = TrackCrossingState(
                    last_stable_side=(
                        current_side if current_side is not Side.ON_LINE else None
                    ),
                    last_seen_at=now,
                    first_seen_at=now,
                    first_point=point,
                    last_point=point,
                )
                continue

            state.last_seen_at = now
            state.last_point = point
            displacement = math.hypot(
                point.x - state.first_point.x, point.y - state.first_point.y
            )
            if displacement > state.max_displacement:
                state.max_displacement = displacement

            if self.static_filter_enabled and self._is_static_track(state, now):
                # Mannequins/props sit near-motionless for many minutes; a track
                # this stationary is not a person and must not count crossings.
                # Keep last_stable_side current (without crossing checks) so
                # behavior is sane if the object is later actually moved.
                if current_side is not Side.ON_LINE:
                    state.last_stable_side = current_side
                continue

            if current_side is Side.ON_LINE:
                continue
            if state.last_stable_side is None:
                state.last_stable_side = current_side
                continue
            if current_side is state.last_stable_side:
                # Back on the stable side - cancels any pending crossing, so a
                # limb that dips past the line and pulls back never confirms.
                state.pending_side = None
                state.pending_since = None
                continue

            if self.crossing_confirm_seconds > 0:
                if state.pending_side is not current_side:
                    state.pending_side = current_side
                    state.pending_since = now
                    continue
                if (now - state.pending_since).total_seconds() < self.crossing_confirm_seconds:
                    continue

            # Feet alone are not enough: someone sitting or leaning near the
            # line can hold a leg past it indefinitely without ever actually
            # leaving. Require the torso (bbox center) to also be on the new
            # side before confirming - a person genuinely walking through has
            # feet and torso cross together (torso may lag the feet by a
            # frame or two while tracking catches up, which is why this is
            # only checked once the confirm delay above has already elapsed,
            # not on every frame from the first one); a seated person's torso
            # never moves, so this keeps rejecting the crossing indefinitely.
            body_side = self.side_for_point(body_center(person, frame_width, frame_height))
            if body_side is not current_side:
                logger.debug(
                    "Line crossing candidate held: track_id=%s foot_side=%s body_side=%s",
                    person.track_id,
                    current_side.value,
                    body_side.value,
                )
                continue

            event = self._crossing_event(person.track_id, state, current_side, now)
            state.last_stable_side = current_side
            state.pending_side = None
            state.pending_since = None
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

    def is_static(self, track_id: int) -> bool:
        """Whether track_id currently looks like a stationary object (see process()).

        Safe to call for any track_id, including ones not yet/no longer tracked
        (returns False) - callers use this to tag detection events, not just
        to gate line-crossing.
        """
        if not self.static_filter_enabled:
            return False
        state = self._tracks.get(track_id)
        if state is None:
            return False
        return self._is_static_track(state, state.last_seen_at)

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

    def _is_static_track(self, state: TrackCrossingState, now: datetime) -> bool:
        if self._is_known_static_point(state.last_point):
            return True
        elapsed = (now - state.first_seen_at).total_seconds()
        if elapsed < self.static_min_observation_seconds:
            return False
        is_static = state.max_displacement < self.static_max_displacement
        if is_static:
            self._remember_static_point(state.last_point)
        return is_static

    def _update_position_dwell(self, point: NormalizedPoint, now: datetime) -> None:
        bucket = self._find_dwell_bucket(point)
        if bucket is None:
            self._position_dwell.append(_PositionDwell(point=point, last_seen_at=now))
            return
        gap = (now - bucket.last_seen_at).total_seconds()
        if 0 < gap <= self.static_dwell_max_gap_seconds:
            bucket.accumulated_seconds += gap
        bucket.last_seen_at = now
        bucket.point = point
        if bucket.accumulated_seconds >= self.static_min_observation_seconds:
            self._remember_static_point(bucket.point)

    def _find_dwell_bucket(self, point: NormalizedPoint) -> "_PositionDwell | None":
        for bucket in self._position_dwell:
            if math.hypot(point.x - bucket.point.x, point.y - bucket.point.y) <= self.static_max_displacement:
                return bucket
        return None

    def _is_known_static_point(self, point: NormalizedPoint) -> bool:
        return any(
            math.hypot(point.x - known.x, point.y - known.y) <= self.static_max_displacement
            for known in self._known_static_points
        )

    def _remember_static_point(self, point: NormalizedPoint) -> None:
        if not self._is_known_static_point(point):
            self._known_static_points.append(point)

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


def body_center(
    person: TrackedPerson, frame_width: int, frame_height: int
) -> NormalizedPoint:
    """Return the normalized bbox center, approximating the torso.

    Used alongside bottom_center (feet) to require the whole body to cross
    the line, not just a foot/leg: someone sitting or leaning near the line
    can stretch a leg past it for a long time without ever actually leaving,
    and their torso position is what tells them apart from someone walking
    through - a walking person's feet and torso cross together.
    """
    if frame_width <= 0 or frame_height <= 0:
        raise ValueError("frame dimensions must be positive")
    return NormalizedPoint(
        x=((person.bbox.x1 + person.bbox.x2) / 2.0) / frame_width,
        y=((person.bbox.y1 + person.bbox.y2) / 2.0) / frame_height,
    )
