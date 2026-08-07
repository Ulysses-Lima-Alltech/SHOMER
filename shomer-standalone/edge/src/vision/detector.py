import logging
from datetime import datetime, timezone
from typing import Any, Iterable

from src.vision.models import BoundingBox, TrackedPerson

logger = logging.getLogger(__name__)


class PersonTracker:
    """YOLO person detector with Ultralytics ByteTrack persistence."""

    def __init__(
        self,
        model_name: str,
        confidence: float,
        image_size: int,
        tracker: str,
    ) -> None:
        self.model_name = model_name
        self.confidence = confidence
        self.image_size = image_size
        self.tracker = tracker
        self.model: Any | None = None
        self.device = "cpu"
        self.use_half = False
        self.ready = False

    def load(self) -> None:
        try:
            from ultralytics import YOLO
        except ImportError as exc:
            raise RuntimeError("ultralytics is required for MODE=production detection") from exc

        self.device, self.use_half = self._select_device()
        try:
            self.model = YOLO(self.model_name)
            if self.device.startswith("cuda"):
                self.model.to(self.device)
            try:
                self.model.fuse()
            except Exception:
                logger.debug("YOLO fuse optimization unavailable", exc_info=True)
        except Exception as exc:
            raise RuntimeError(f"Failed to load YOLO model '{self.model_name}': {exc}") from exc

        self.ready = True
        logger.info("YOLO model loaded on %s", self.device)

    def reset_tracking(self) -> None:
        if self.model is None:
            return
        predictor = getattr(self.model, "predictor", None)
        trackers = getattr(predictor, "trackers", None)
        if trackers:
            for tracker in trackers:
                reset = getattr(tracker, "reset", None)
                if callable(reset):
                    reset()
            logger.info("YOLO tracker state reset")
            return
        if predictor is not None:
            self.model.predictor = None
            logger.info("YOLO predictor reset to clear tracker state")

    def track(self, frame: Any) -> list[TrackedPerson]:
        if self.model is None or not self.ready:
            raise RuntimeError("YOLO model is not loaded")

        results = self.model.track(
            frame,
            persist=True,
            tracker=self.tracker,
            classes=[0],
            conf=self.confidence,
            imgsz=self.image_size,
            device=self.device,
            half=self.use_half,
            verbose=False,
        )
        first_result = results[0] if results else None
        return self.parse_result(first_result)

    @staticmethod
    def parse_result(result: Any, timestamp: datetime | None = None) -> list[TrackedPerson]:
        if result is None or getattr(result, "boxes", None) is None:
            return []

        boxes = result.boxes
        xyxy_values = PersonTracker._to_list(getattr(boxes, "xyxy", []))
        confidence_values = PersonTracker._to_list(getattr(boxes, "conf", []))
        id_values = PersonTracker._to_list(getattr(boxes, "id", []))
        if not id_values:
            return []

        detected_at = timestamp or datetime.now(timezone.utc)
        persons: list[TrackedPerson] = []
        for raw_bbox, raw_confidence, raw_id in zip(
            xyxy_values, confidence_values, id_values
        ):
            bbox_values = list(raw_bbox)
            if len(bbox_values) < 4:
                continue
            persons.append(
                TrackedPerson(
                    track_id=int(raw_id),
                    bbox=BoundingBox(
                        x1=float(bbox_values[0]),
                        y1=float(bbox_values[1]),
                        x2=float(bbox_values[2]),
                        y2=float(bbox_values[3]),
                    ),
                    confidence=float(raw_confidence),
                    timestamp=detected_at,
                )
            )
        return persons

    @staticmethod
    def _to_list(value: Any) -> list[Any]:
        if value is None:
            return []
        if hasattr(value, "cpu"):
            value = value.cpu()
        if hasattr(value, "tolist"):
            value = value.tolist()
        if isinstance(value, list):
            return value
        if isinstance(value, tuple):
            return list(value)
        if isinstance(value, Iterable) and not isinstance(value, (str, bytes)):
            return list(value)
        return [value]

    @staticmethod
    def _select_device() -> tuple[str, bool]:
        try:
            import torch
        except Exception:
            return "cpu", False

        try:
            if torch.cuda.is_available():
                try:
                    torch.backends.cudnn.benchmark = True
                except Exception:
                    logger.debug("cuDNN benchmark configuration unavailable", exc_info=True)
                return "cuda:0", True
        except Exception:
            logger.debug("CUDA detection failed; falling back to CPU", exc_info=True)
        return "cpu", False
