import logging
from typing import Any

from src.vision.models import BoundingBox

logger = logging.getLogger(__name__)


class AppearanceEmbedder:
    """Lightweight person re-identification (OSNet, via boxmot) used to
    recognize the same physical person seen by different, overlapping
    cameras at nearly the same instant - see countDistinctPeople in the
    API's stats.service.ts. Not a full multi-camera-tracking system: it
    only feeds a per-detection appearance signature into person.detected;
    the cross-camera fusion logic lives on the API side.

    Loaded lazily (first call) and once per process, CPU-only - this
    machine's GPU can't run this model's compiled kernels (same
    Blackwell/RTX 50-series limitation as the cudnn.benchmark workaround
    in detector.py). ~15-20ms per person on CPU, so this is only ever
    called at publish time (DETECTION_EVENTS_MIN_INTERVAL_SECONDS
    throttle in worker.py), never once per frame.
    """

    def __init__(self) -> None:
        self._model: Any | None = None
        self._load_failed = False

    def _ensure_loaded(self) -> Any | None:
        if self._model is not None or self._load_failed:
            return self._model
        try:
            from boxmot.reid.core.reid import ReID

            self._model = ReID(device="cpu").model
            logger.info("Appearance re-id model (OSNet) loaded")
        except Exception:
            self._load_failed = True
            logger.warning(
                "Appearance re-id model failed to load; person.detected "
                "events will be published without cross-camera dedup support",
                exc_info=True,
            )
        return self._model

    def embed(self, frame: Any, bbox: BoundingBox) -> list[float] | None:
        if frame is None:
            return None
        height, width = frame.shape[:2]
        if bbox.x2 <= 0 or bbox.y2 <= 0 or bbox.x1 >= width or bbox.y1 >= height:
            return None  # bbox doesn't overlap the frame at all - skip loading the model for nothing

        model = self._ensure_loaded()
        if model is None:
            return None
        try:
            import numpy as np

            xyxys = np.array([[bbox.x1, bbox.y1, bbox.x2, bbox.y2]], dtype=np.float32)
            features = model.get_features(xyxys, frame)
            if features.size == 0:
                return None
            return [round(float(v), 5) for v in features[0]]
        except Exception:
            logger.debug("Appearance embedding computation failed", exc_info=True)
            return None
