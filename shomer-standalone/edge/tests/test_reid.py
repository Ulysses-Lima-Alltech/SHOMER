import os
import sys
import unittest

EDGE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if EDGE_DIR not in sys.path:
    sys.path.insert(0, EDGE_DIR)

from src.vision.models import BoundingBox
from src.vision.reid import AppearanceEmbedder


class FakeReidModel:
    def __init__(self, features):
        self.features = features
        self.calls = []

    def get_features(self, xyxys, frame):
        self.calls.append((xyxys.tolist(), frame))
        return self.features


class AppearanceEmbedderTests(unittest.TestCase):
    def test_embed_returns_none_without_frame(self):
        embedder = AppearanceEmbedder()
        self.assertIsNone(embedder.embed(None, BoundingBox(0, 0, 10, 10)))

    def test_embed_returns_none_for_out_of_frame_bbox_without_loading_model(self):
        import numpy as np

        embedder = AppearanceEmbedder()
        frame = np.zeros((100, 100, 3), dtype="uint8")
        bbox = BoundingBox(200, 200, 250, 250)

        result = embedder.embed(frame, bbox)

        self.assertIsNone(result)
        # Bounds check happens before loading the (slow, networked) model.
        self.assertIsNone(embedder._model)
        self.assertFalse(embedder._load_failed)

    def test_embed_uses_loaded_model_and_rounds_output(self):
        import numpy as np

        embedder = AppearanceEmbedder()
        embedder._model = FakeReidModel(np.array([[0.123456, 0.5, 0.999999]]))
        frame = np.zeros((100, 100, 3), dtype="uint8")
        bbox = BoundingBox(10, 10, 50, 50)

        result = embedder.embed(frame, bbox)

        self.assertEqual(result, [0.12346, 0.5, 1.0])

    def test_embed_passes_bbox_as_xyxy_to_model(self):
        import numpy as np

        embedder = AppearanceEmbedder()
        fake_model = FakeReidModel(np.array([[1.0]]))
        embedder._model = fake_model
        frame = np.zeros((100, 100, 3), dtype="uint8")
        bbox = BoundingBox(10, 20, 50, 80)

        embedder.embed(frame, bbox)

        self.assertEqual(fake_model.calls[0][0], [[10.0, 20.0, 50.0, 80.0]])

    def test_embed_returns_none_when_model_returns_empty_features(self):
        import numpy as np

        embedder = AppearanceEmbedder()
        embedder._model = FakeReidModel(np.array([]))
        frame = np.zeros((100, 100, 3), dtype="uint8")

        result = embedder.embed(frame, BoundingBox(10, 10, 50, 50))

        self.assertIsNone(result)

    def test_embed_returns_none_when_model_never_loaded(self):
        embedder = AppearanceEmbedder()
        embedder._load_failed = True
        import numpy as np

        frame = np.zeros((100, 100, 3), dtype="uint8")

        result = embedder.embed(frame, BoundingBox(10, 10, 50, 50))

        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
