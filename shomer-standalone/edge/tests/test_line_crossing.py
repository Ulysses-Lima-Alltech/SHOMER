import os
import sys
import unittest
from asyncio import run
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from pydantic import ValidationError

EDGE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if EDGE_DIR not in sys.path:
    sys.path.insert(0, EDGE_DIR)

from src.analytics.line_crossing import (
    CrossingDirection,
    EnterDirection,
    LineCrossingAnalyzer,
    NormalizedPoint,
    Side,
    body_center,
    bottom_center,
)
from src.config import Settings
from src.vision.models import BoundingBox, TrackedPerson
from src.vision.status import status as vision_status


FRAME_WIDTH = 100
FRAME_HEIGHT = 100
BASE_TIME = datetime(2026, 8, 7, tzinfo=timezone.utc)


def person(track_id: int, x: float, y: float, seconds: float) -> TrackedPerson:
    return TrackedPerson(
        track_id=track_id,
        bbox=BoundingBox(x - 5, y - 20, x + 5, y),
        confidence=0.9,
        timestamp=BASE_TIME + timedelta(seconds=seconds),
    )


def analyzer(
    *,
    enabled: bool = True,
    a: tuple[float, float] = (0.0, 0.5),
    b: tuple[float, float] = (1.0, 0.5),
    enter_direction: EnterDirection = EnterDirection.A_TO_B,
    tolerance: float = 0.02,
    cooldown: float = 1.0,
    ttl: float = 10.0,
    confirm_seconds: float = 0.0,
) -> LineCrossingAnalyzer:
    return LineCrossingAnalyzer(
        enabled=enabled,
        line_id="main",
        point_a=NormalizedPoint(*a),
        point_b=NormalizedPoint(*b),
        enter_direction=enter_direction,
        tolerance=tolerance,
        cooldown_seconds=cooldown,
        track_ttl_seconds=ttl,
        crossing_confirm_seconds=confirm_seconds,
    )


def process_one(
    subject: LineCrossingAnalyzer,
    track_id: int,
    x: float,
    y: float,
    seconds: float,
):
    return subject.process([person(track_id, x, y, seconds)], FRAME_WIDTH, FRAME_HEIGHT)


def person_with_bbox(
    track_id: int,
    y1: float,
    y2: float,
    seconds: float,
    x1: float = 45,
    x2: float = 55,
) -> TrackedPerson:
    """Builds a person with independently-set top/bottom edges, so bottom_center
    (feet) and body_center (torso) can land on different sides of the line -
    unlike person()/process_one(), which move a fixed-size box as a rigid unit."""
    return TrackedPerson(
        track_id=track_id,
        bbox=BoundingBox(x1, y1, x2, y2),
        confidence=0.9,
        timestamp=BASE_TIME + timedelta(seconds=seconds),
    )


def process_one_bbox(
    subject: LineCrossingAnalyzer,
    track_id: int,
    y1: float,
    y2: float,
    seconds: float,
):
    return subject.process(
        [person_with_bbox(track_id, y1, y2, seconds)], FRAME_WIDTH, FRAME_HEIGHT
    )


class LineCrossingTests(unittest.TestCase):
    def test_first_appearance_side_a_does_not_count(self):
        subject = analyzer()

        events = process_one(subject, 10, 50, 80, 0)

        self.assertEqual(events, [])
        self.assertEqual(subject.stats().entries, 0)
        self.assertEqual(subject.stats().exits, 0)

    def test_first_appearance_side_b_does_not_count(self):
        subject = analyzer()

        events = process_one(subject, 10, 50, 20, 0)

        self.assertEqual(events, [])
        self.assertEqual(subject.stats().entries, 0)
        self.assertEqual(subject.stats().exits, 0)

    def test_first_appearance_on_line_then_side_a_does_not_count(self):
        subject = analyzer(tolerance=0.05)

        process_one(subject, 10, 50, 50, 0)
        events = process_one(subject, 10, 50, 80, 1)

        self.assertEqual(events, [])

    def test_first_appearance_on_line_then_side_b_does_not_count(self):
        subject = analyzer(tolerance=0.05)

        process_one(subject, 10, 50, 50, 0)
        events = process_one(subject, 10, 50, 20, 1)

        self.assertEqual(events, [])

    def test_horizontal_a_to_b_generates_enter(self):
        subject = analyzer()

        self.assertEqual(process_one(subject, 10, 50, 80, 0), [])
        events = process_one(subject, 10, 50, 20, 2)

        self.assertEqual(events[0].direction, CrossingDirection.ENTER)
        self.assertEqual(subject.stats().entries, 1)

    def test_horizontal_b_to_a_generates_exit(self):
        subject = analyzer()

        process_one(subject, 10, 50, 20, 0)
        events = process_one(subject, 10, 50, 80, 2)

        self.assertEqual(events[0].direction, CrossingDirection.EXIT)
        self.assertEqual(subject.stats().exits, 1)

    def test_inverted_enter_direction(self):
        subject = analyzer(enter_direction=EnterDirection.B_TO_A)

        process_one(subject, 10, 50, 80, 0)
        events = process_one(subject, 10, 50, 20, 2)

        self.assertEqual(events[0].direction, CrossingDirection.EXIT)

    def test_vertical_line_works(self):
        subject = analyzer(a=(0.5, 0.0), b=(0.5, 1.0))

        process_one(subject, 10, 20, 50, 0)
        events = process_one(subject, 10, 80, 50, 2)

        self.assertEqual(events[0].direction, CrossingDirection.ENTER)

    def test_diagonal_line_works(self):
        subject = analyzer(a=(0.0, 0.0), b=(1.0, 1.0))

        process_one(subject, 10, 30, 70, 0)
        events = process_one(subject, 10, 70, 30, 2)

        self.assertEqual(events[0].direction, CrossingDirection.ENTER)

    def test_same_side_does_not_count(self):
        subject = analyzer()

        process_one(subject, 10, 50, 80, 0)
        events = process_one(subject, 10, 60, 85, 2)

        self.assertEqual(events, [])
        self.assertEqual(subject.stats().entries, 0)

    def test_dead_zone_return_to_same_side_does_not_count(self):
        subject = analyzer(tolerance=0.05)

        process_one(subject, 10, 50, 80, 0)
        self.assertEqual(process_one(subject, 10, 50, 51, 1), [])
        self.assertEqual(process_one(subject, 10, 50, 82, 2), [])

    def test_side_b_dead_zone_return_to_side_b_does_not_count(self):
        subject = analyzer(tolerance=0.05)

        process_one(subject, 10, 50, 20, 0)
        self.assertEqual(process_one(subject, 10, 50, 49, 1), [])
        self.assertEqual(process_one(subject, 10, 50, 18, 2), [])

    def test_a_dead_zone_b_counts_once(self):
        subject = analyzer(tolerance=0.05)

        process_one(subject, 10, 50, 80, 0)
        process_one(subject, 10, 50, 51, 1)
        events = process_one(subject, 10, 50, 20, 2)
        more_events = process_one(subject, 10, 50, 18, 3)

        self.assertEqual(len(events), 1)
        self.assertEqual(more_events, [])
        self.assertEqual(subject.stats().entries, 1)

    def test_jitter_around_line_does_not_duplicate(self):
        subject = analyzer(tolerance=0.05)

        process_one(subject, 10, 50, 80, 0)
        process_one(subject, 10, 50, 49, 1)
        process_one(subject, 10, 50, 51, 2)
        events = process_one(subject, 10, 50, 20, 3)

        self.assertEqual(len(events), 1)
        self.assertEqual(subject.stats().entries, 1)

    def test_complex_jitter_near_dead_zone_counts_only_stable_crossing(self):
        subject = analyzer(tolerance=0.05)

        process_one(subject, 10, 50, 80, 0)
        process_one(subject, 10, 50, 50, 0.1)
        process_one(subject, 10, 50, 44, 0.2)
        process_one(subject, 10, 50, 51, 0.3)
        process_one(subject, 10, 50, 56, 0.4)
        process_one(subject, 10, 50, 49, 0.5)
        process_one(subject, 10, 50, 20, 0.6)

        self.assertEqual(subject.stats().entries, 1)
        self.assertEqual(subject.stats().exits, 0)

    def test_cooldown_blocks_quick_duplicate(self):
        subject = analyzer(cooldown=2.0)

        process_one(subject, 10, 50, 80, 0)
        process_one(subject, 10, 50, 20, 1)
        events = process_one(subject, 10, 50, 80, 1.5)

        self.assertEqual(events, [])
        self.assertEqual(subject.stats().entries, 1)
        self.assertEqual(subject.stats().exits, 0)

    def test_cooldown_does_not_emit_delayed_event(self):
        subject = analyzer(cooldown=2.0)

        process_one(subject, 10, 50, 80, 0)
        process_one(subject, 10, 50, 20, 1)
        process_one(subject, 10, 50, 80, 1.1)
        events = process_one(subject, 10, 50, 80, 3.5)

        self.assertEqual(events, [])
        self.assertEqual(subject.stats().entries, 1)
        self.assertEqual(subject.stats().exits, 0)

    def test_physical_state_updates_when_cooldown_blocks_event(self):
        subject = analyzer(cooldown=2.0)

        process_one(subject, 10, 50, 80, 0)
        process_one(subject, 10, 50, 20, 1)
        process_one(subject, 10, 50, 80, 1.1)

        self.assertEqual(subject._tracks[10].last_stable_side, Side.SIDE_A)

    def test_new_crossing_after_cooldown_requires_new_physical_transition(self):
        subject = analyzer(cooldown=2.0)

        process_one(subject, 10, 50, 80, 0)
        process_one(subject, 10, 50, 20, 1)
        process_one(subject, 10, 50, 80, 1.1)
        process_one(subject, 10, 50, 20, 2.0)
        events = process_one(subject, 10, 50, 80, 3.2)

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].direction, CrossingDirection.EXIT)
        self.assertEqual(subject.stats().entries, 1)
        self.assertEqual(subject.stats().exits, 1)

    def test_after_cooldown_new_crossing_is_valid(self):
        subject = analyzer(cooldown=1.0)

        process_one(subject, 10, 50, 80, 0)
        process_one(subject, 10, 50, 20, 1)
        events = process_one(subject, 10, 50, 80, 2.5)

        self.assertEqual(events[0].direction, CrossingDirection.EXIT)
        self.assertEqual(subject.stats().entries, 1)
        self.assertEqual(subject.stats().exits, 1)

    def test_two_track_ids_count_independently(self):
        subject = analyzer()

        process_one(subject, 10, 50, 80, 0)
        process_one(subject, 11, 60, 80, 0)
        process_one(subject, 10, 50, 20, 2)
        process_one(subject, 11, 60, 20, 2)

        self.assertEqual(subject.stats().entries, 2)

    def test_two_tracks_interleaved_opposite_directions_are_independent(self):
        subject = analyzer()

        process_one(subject, 1, 50, 80, 0)
        process_one(subject, 2, 50, 20, 0)
        event_1 = process_one(subject, 1, 50, 20, 2)
        event_2 = process_one(subject, 2, 50, 80, 2)

        self.assertEqual(event_1[0].direction, CrossingDirection.ENTER)
        self.assertEqual(event_2[0].direction, CrossingDirection.EXIT)
        self.assertEqual(subject.stats().entries, 1)
        self.assertEqual(subject.stats().exits, 1)

    def test_ttl_removes_old_track(self):
        subject = analyzer(ttl=1.0)

        process_one(subject, 10, 50, 80, 0)
        subject.process([], FRAME_WIDTH, FRAME_HEIGHT, now=BASE_TIME + timedelta(seconds=2))

        self.assertEqual(subject.tracked_state_count, 0)

    def test_ttl_preserves_active_track_and_counters(self):
        subject = analyzer(ttl=3.0)

        process_one(subject, 10, 50, 80, 0)
        process_one(subject, 10, 50, 20, 1)
        process_one(subject, 11, 50, 80, 2)
        subject.process(
            [], FRAME_WIDTH, FRAME_HEIGHT, now=BASE_TIME + timedelta(seconds=4.1)
        )

        self.assertNotIn(10, subject._tracks)
        self.assertIn(11, subject._tracks)
        self.assertEqual(subject.stats().entries, 1)
        self.assertEqual(subject.stats().exits, 0)

    def test_reused_track_id_after_ttl_is_treated_as_new_track(self):
        subject = analyzer(ttl=1.0)

        process_one(subject, 7, 50, 80, 0)
        subject.process([], FRAME_WIDTH, FRAME_HEIGHT, now=BASE_TIME + timedelta(seconds=2))
        events = process_one(subject, 7, 50, 20, 3)

        self.assertEqual(events, [])
        self.assertEqual(subject.stats().entries, 0)

    def test_reset_tracks_preserves_counters(self):
        subject = analyzer()

        process_one(subject, 10, 50, 80, 0)
        process_one(subject, 10, 50, 20, 2)
        subject.reset_tracks()

        self.assertEqual(subject.tracked_state_count, 0)
        self.assertEqual(subject.stats().entries, 1)
        self.assertEqual(subject.stats().last_crossing_track_id, 10)

    def test_disabled_line_crossing_does_not_count(self):
        subject = analyzer(enabled=False)

        process_one(subject, 10, 50, 80, 0)
        events = process_one(subject, 10, 50, 20, 2)

        self.assertEqual(events, [])
        self.assertEqual(subject.stats().entries, 0)
        self.assertEqual(subject.tracked_state_count, 0)

    def test_invalid_line_rejected_by_config(self):
        with self.assertRaises(ValidationError):
            Settings(
                LINE_CROSSING_X1=0.5,
                LINE_CROSSING_Y1=0.5,
                LINE_CROSSING_X2=0.5,
                LINE_CROSSING_Y2=0.5,
                _env_file=None,
            )

    def test_nearly_degenerate_line_rejected_by_config(self):
        with self.assertRaises(ValidationError):
            Settings(
                LINE_CROSSING_X1=0.5,
                LINE_CROSSING_Y1=0.5,
                LINE_CROSSING_X2=0.500000000001,
                LINE_CROSSING_Y2=0.5,
                _env_file=None,
            )

    def test_nearly_degenerate_line_rejected_by_analyzer(self):
        with self.assertRaises(ValueError):
            analyzer(a=(0.5, 0.5), b=(0.500000000001, 0.5))

    def test_out_of_range_coordinates_rejected_by_config(self):
        with self.assertRaises(ValidationError):
            Settings(LINE_CROSSING_X1=-0.1, _env_file=None)
        with self.assertRaises(ValidationError):
            Settings(LINE_CROSSING_Y2=1.1, _env_file=None)

    def test_bottom_center_is_normalized(self):
        point = bottom_center(person(10, 40, 80, 0), FRAME_WIDTH, FRAME_HEIGHT)

        self.assertEqual(point.x, 0.4)
        self.assertEqual(point.y, 0.8)

    def test_bottom_center_rejects_zero_width(self):
        with self.assertRaises(ValueError):
            bottom_center(person(10, 40, 80, 0), 0, FRAME_HEIGHT)

    def test_bottom_center_rejects_zero_height(self):
        with self.assertRaises(ValueError):
            bottom_center(person(10, 40, 80, 0), FRAME_WIDTH, 0)

    def test_bottom_center_allows_out_of_frame_bbox(self):
        subject = TrackedPerson(
            track_id=10,
            bbox=BoundingBox(-10, -20, 20, 120),
            confidence=0.9,
            timestamp=BASE_TIME,
        )

        point = bottom_center(subject, FRAME_WIDTH, FRAME_HEIGHT)

        self.assertEqual(point.x, 0.05)
        self.assertEqual(point.y, 1.2)

    def test_body_center_is_bbox_midpoint(self):
        subject = person_with_bbox(10, 30, 55, 0)
        point = body_center(subject, FRAME_WIDTH, FRAME_HEIGHT)

        self.assertAlmostEqual(point.x, 0.5)
        self.assertAlmostEqual(point.y, 0.425)

    def test_foot_poking_past_line_without_torso_never_counts(self):
        # Mimics someone sitting near the line with a leg stretched past it:
        # feet (bottom_center) cross, but the torso (body_center) never does,
        # even after a long stretch of frames - must never count as a crossing.
        subject = analyzer(confirm_seconds=0.5)

        process_one_bbox(subject, 10, 5, 15, 0)  # fully on SIDE_B at first
        for seconds in (1, 3, 6, 10, 20):
            events = process_one_bbox(subject, 10, 30, 55, seconds)
            self.assertEqual(events, [])

        self.assertEqual(subject.stats().entries, 0)
        self.assertEqual(subject.stats().exits, 0)

    def test_confirm_seconds_delays_crossing_until_side_is_sustained(self):
        subject = analyzer(confirm_seconds=0.5)

        process_one(subject, 10, 50, 80, 0)
        immediate = process_one(subject, 10, 50, 20, 1.0)
        self.assertEqual(immediate, [])

        confirmed = process_one(subject, 10, 50, 20, 1.6)
        self.assertEqual(len(confirmed), 1)
        self.assertEqual(confirmed[0].direction, CrossingDirection.ENTER)
        self.assertEqual(subject.stats().entries, 1)

    def test_confirm_seconds_cancels_if_side_returns_before_elapsed(self):
        subject = analyzer(confirm_seconds=0.5)

        process_one(subject, 10, 50, 80, 0)
        process_one(subject, 10, 50, 20, 1.0)  # candidate crossing starts
        process_one(subject, 10, 50, 80, 1.2)  # back before 0.5s - cancels it
        events = process_one(subject, 10, 50, 20, 1.3)  # new candidate, not yet confirmed

        self.assertEqual(events, [])
        self.assertEqual(subject.stats().entries, 0)

    def test_pending_crossing_confirms_when_track_vanishes_before_next_frame(self):
        # Someone walking out of frame right after crossing (e.g. through a
        # doorway at the edge of the camera's view) may never get another
        # detection to run the normal confirm check on. The crossing must
        # still be counted once the track ages out, using the torso position
        # from the last frame it was actually seen.
        subject = analyzer(confirm_seconds=0.5, ttl=2.0)

        process_one(subject, 10, 50, 80, 0)
        pending = process_one(subject, 10, 50, 20, 1.0)  # foot+body both cross
        self.assertEqual(pending, [])  # not yet confirmed - confirm delay hasn't elapsed

        # Track never seen again; once ttl elapses the pending crossing (with
        # its already-agreeing torso) must confirm instead of being dropped.
        expired = subject.process(
            [], FRAME_WIDTH, FRAME_HEIGHT, now=BASE_TIME + timedelta(seconds=4.0)
        )

        self.assertEqual(len(expired), 1)
        self.assertEqual(expired[0].direction, CrossingDirection.ENTER)
        self.assertEqual(subject.stats().entries, 1)
        self.assertEqual(subject.tracked_state_count, 0)

    def test_pending_crossing_does_not_confirm_on_expiry_without_body_agreement(self):
        # Mirrors test_foot_poking_past_line_without_torso_never_counts, but
        # via the track disappearing (ttl expiry) instead of staying visible:
        # a foot poked past the line with the torso never following must
        # still never count, even once the track ages out.
        subject = analyzer(confirm_seconds=0.5, ttl=2.0)

        process_one_bbox(subject, 10, 5, 15, 0)  # fully on original side
        pending = process_one_bbox(subject, 10, 30, 55, 1.0)  # foot crosses, torso doesn't
        self.assertEqual(pending, [])

        expired = subject.process(
            [], FRAME_WIDTH, FRAME_HEIGHT, now=BASE_TIME + timedelta(seconds=4.0)
        )

        self.assertEqual(expired, [])
        self.assertEqual(subject.stats().entries, 0)
        self.assertEqual(subject.stats().exits, 0)

    def test_bottom_edge_clipped_skips_body_agreement_check(self):
        # A person mostly out of frame through a doorway near the bottom edge
        # gets their bbox clipped to the image boundary by the detector - the
        # visible sliver's midpoint no longer approximates the real torso, so
        # requiring it to agree with the feet would reject a genuine crossing
        # forever. y2 at (or past) frame_height signals a clipped box.
        subject = analyzer(confirm_seconds=0.0)

        process_one_bbox(subject, 10, 10, 20, 0)  # fully on SIDE_B, not clipped
        events = process_one_bbox(subject, 10, -100, 100, 1)  # foot clipped at edge; body would disagree

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].direction, CrossingDirection.EXIT)
        self.assertEqual(subject.stats().exits, 1)

    def test_line_near_bottom_edge_skips_body_agreement_without_literal_clipping(self):
        # A steeply overhead camera with its line drawn near the bottom of
        # frame: the person's feet cross well before their bbox literally
        # touches the last pixel row, but the perspective still puts their
        # head/torso far enough above their feet that body_center never
        # agrees with bottom_center for a real crossing - not lag, a fixed
        # property of the angle. y2=97 on a 100px-tall frame is short of the
        # old exact-edge check but within the new relative margin.
        subject = analyzer(confirm_seconds=0.0)

        process_one_bbox(subject, 10, 10, 20, 0)  # fully on SIDE_B
        events = process_one_bbox(subject, 10, -100, 97, 1)  # feet crossed; body still disagrees

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].direction, CrossingDirection.EXIT)
        self.assertEqual(subject.stats().exits, 1)

    def test_non_clipped_box_still_requires_body_agreement(self):
        # Sanity check that the clip bypass is specific to a genuinely
        # clipped box, not a general loosening of the body check.
        subject = analyzer(confirm_seconds=0.0)

        process_one_bbox(subject, 10, 10, 20, 0)
        events = process_one_bbox(subject, 10, -100, 80, 1)  # y2 well clear of the frame edge - not clipped

        self.assertEqual(events, [])
        self.assertEqual(subject.stats().exits, 0)

    def test_bottom_edge_clipped_confirms_on_expiry_without_body_agreement(self):
        subject = analyzer(confirm_seconds=0.5, ttl=2.0)

        process_one_bbox(subject, 10, 10, 20, 0)
        pending = process_one_bbox(subject, 10, -100, 100, 1.0)  # clipped, body disagrees
        self.assertEqual(pending, [])

        expired = subject.process(
            [], FRAME_WIDTH, FRAME_HEIGHT, now=BASE_TIME + timedelta(seconds=4.0)
        )

        self.assertEqual(len(expired), 1)
        self.assertEqual(expired[0].direction, CrossingDirection.EXIT)
        self.assertEqual(subject.stats().exits, 1)

    def test_brief_track_gap_does_not_duplicate_count(self):
        # A short tracking gap (occlusion) within the track TTL must not
        # reset crossing state and cause the same physical crossing to be
        # counted twice once the track reappears.
        subject = analyzer(ttl=15.0, cooldown=1.0)

        process_one(subject, 30, 50, 80, 0)
        subject.process([], FRAME_WIDTH, FRAME_HEIGHT, now=BASE_TIME + timedelta(seconds=2))
        events = process_one(subject, 30, 50, 20, 4)

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].direction, CrossingDirection.ENTER)
        self.assertEqual(subject.stats().entries, 1)
        self.assertEqual(subject.stats().exits, 0)

    def test_status_includes_counters(self):
        request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace()))
        payload = run(vision_status(request))

        self.assertIn("entries", payload)
        self.assertIn("exits", payload)
        self.assertIn("last_crossing_direction", payload)

    def test_mock_importable(self):
        import src.main as main

        self.assertEqual(main.settings.MODE, "mock")


if __name__ == "__main__":
    unittest.main()
