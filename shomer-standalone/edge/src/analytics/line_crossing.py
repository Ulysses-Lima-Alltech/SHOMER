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
    last_crossing_at: datetime | None = None
    # Candidate side change awaiting confirmation (see crossing_confirm_seconds) -
    # a foot/limb that pokes past the line for a single frame and pulls back
    # (someone sitting or leaning near the line) must not count as a crossing.
    pending_side: Side | None = None
    pending_since: datetime | None = None
    # Torso position as of the last processed frame, kept fresh every frame
    # (not just while a crossing is pending) so a pending crossing can still
    # be judged fairly if the track disappears before confirming - see
    # _confirm_pending_on_expiry.
    last_body_point: "NormalizedPoint | None" = None
    # Whether the last frame's bbox touched the bottom edge of the image (see
    # is_bottom_edge_clipped) - a person mostly out of frame through a
    # doorway has their box cut off by the image boundary, not by their
    # actual extent, so the visible portion's midpoint no longer approximates
    # their real torso. Used to skip the body-agreement requirement in that
    # case rather than reject a real crossing based on a meaningless point.
    last_bottom_clipped: bool = False


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
        expiry_events = self._prune_old_tracks(now)

        if not self.enabled:
            return []

        events: list[LineCrossingEvent] = list(expiry_events)
        for person in persons:
            point = bottom_center(person, frame_width, frame_height)
            body_point = body_center(person, frame_width, frame_height)
            bottom_clipped = is_bottom_edge_clipped(person, frame_height)
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
                    last_body_point=body_point,
                    last_bottom_clipped=bottom_clipped,
                )
                continue

            state.last_seen_at = now
            state.last_point = point
            state.last_body_point = body_point
            state.last_bottom_clipped = bottom_clipped

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
            #
            # Exception: right at a doorway near the bottom of the frame, a
            # person mostly out of frame gets their bbox clipped to the image
            # boundary by the detector - the visible sliver's midpoint drifts
            # toward the still-visible top half of the box, no longer near
            # the real torso, so it can permanently disagree with the feet
            # even for a real, complete crossing. Foot side alone is trusted
            # in that case.
            if not bottom_clipped:
                body_side = self.side_for_point(body_point)
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

    def _prune_old_tracks(self, now: datetime) -> list[LineCrossingEvent]:
        expired = [
            track_id
            for track_id, state in self._tracks.items()
            if (now - state.last_seen_at).total_seconds() > self.track_ttl_seconds
        ]
        events: list[LineCrossingEvent] = []
        for track_id in expired:
            state = self._tracks[track_id]
            if self.enabled:
                event = self._confirm_pending_on_expiry(track_id, state, now)
                if event is not None:
                    events.append(event)
            del self._tracks[track_id]
        return events

    def _confirm_pending_on_expiry(
        self, track_id: int, state: TrackCrossingState, now: datetime
    ) -> LineCrossingEvent | None:
        """Confirm a still-pending crossing when its track disappears instead of
        losing it (see process()). Someone walking out of frame right after
        crossing (e.g. through a doorway at the edge of the camera's view) may
        never get another detection to run the normal confirm check on -
        without this, that crossing is silently dropped, undercounting exits
        relative to entries (which keep walking further into frame and get
        plenty of follow-up detections). Uses the torso position as of the
        last frame the track was actually seen, so the same body-agreement
        requirement still rejects a track that vanished without its torso
        ever reaching the new side (e.g. occlusion right after a foot poke).
        """
        if state.pending_side is None or state.pending_since is None:
            return None
        elapsed = (now - state.pending_since).total_seconds()
        if elapsed < self.crossing_confirm_seconds:
            return None
        if not state.last_bottom_clipped:
            if state.last_body_point is None:
                return None
            if self.side_for_point(state.last_body_point) is not state.pending_side:
                return None
        return self._crossing_event(track_id, state, state.pending_side, now)

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


def is_bottom_edge_clipped(person: TrackedPerson, frame_height: int) -> bool:
    """Whether the bbox's bottom edge sits at (or effectively at) the image
    boundary.

    Detectors clip boxes to the image bounds, so a person who is mostly out
    of frame - e.g. already through a doorway near the bottom of the camera's
    view - gets a box cut off at the frame edge rather than at their actual
    feet. body_center's midpoint then reflects only the visible sliver, not
    the real torso, and can permanently disagree with the feet even for a
    genuine crossing (see the body-agreement check in process()).

    A camera mounted steeply overhead with its line drawn near the bottom of
    the frame has the same problem even when the box never touches the
    literal last pixel row: at that angle, a person's head/torso can project
    well above their feet in the image, so body_center sits far enough from
    bottom_center that a real crossing never satisfies body-agreement -  not
    because the torso is lagging behind the feet (which the confirm delay
    already tolerates), but because that vertical offset is a fixed property
    of the geometry, not motion. Tolerance is therefore relative to frame
    height (3%), not a fixed pixel count, so it also covers "close enough to
    the edge" boxes on lines drawn near the bottom, not just literally
    clipped ones.
    """
    tolerance = max(0.5, frame_height * 0.03)
    return person.bbox.y2 >= frame_height - tolerance
