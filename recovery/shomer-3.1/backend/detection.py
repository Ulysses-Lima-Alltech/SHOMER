# backend/detection.py - Ultra Alta Performance COM Feedback Visual Completo

import cv2
import threading
import time
import numpy as np
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Tuple
from collections import deque
import queue
from src.shared.config import brasilia_now

try:
    import torch  # type: ignore
except Exception:  # torch é opcional no runtime CPU
    torch = None

# Configurações ultra-otimizadas
YOLO_MODEL = "yolov8n.pt"
CONF_THRESHOLD = 0.5
TARGET_FPS = 60  # Aumentado para 60 FPS
DETECTION_FPS = 30  # IA roda a 30 FPS (aumentado)
BUFFER_SIZE = 1  # Buffer mínimo para máxima velocidade

# Cores para visualização (BGR format)
COLORS = {
    "person_box": (0, 255, 255),  # Amarelo para pessoas
    "person_label_bg": (0, 200, 200),  # Amarelo escuro para fundo do label
    "person_text": (0, 0, 0),  # Preto para texto pessoa
    "face_box": (255, 128, 0),  # Azul/laranja para rostos
    "face_label_bg": (200, 100, 0),  # Azul escuro para fundo face
    "face_text": (255, 255, 255),  # Branco para texto face
    "info_bg": (0, 0, 0),  # Preto para background info
    "info_text": (255, 255, 255),  # Branco para texto info
}


class VisualDetector:
    """
    Detector ultra-otimizado que mantém TODOS os feedbacks visuais:
    - Bounding boxes coloridas para pessoas (amarelo)
    - Bounding boxes coloridas para rostos (azul)
    - Labels numerados (P1, P2, F1, F2, etc.)
    - Informações de stats no frame
    - Performance ultra-otimizada com threading
    """

    def __init__(self, src=0):

        # Performance tracking
        self.fps_counter = 0
        self.fps_start_time = time.time()
        self.current_fps = 0

        # Contadores
        self.prev_count = 0
        self.total_passed = 0
        self.log: List[Dict[str, Any]] = []

        # Sistema de tracking avançado
        self.person_tracking = {
            "active_persons": {},  # {person_id: {"entry_time": timestamp, "last_seen": timestamp, "bbox": coords}}
            "person_counter": 0,  # Contador único para cada pessoa
            "session_start": brasilia_now(),
            "total_entries": 0,
            "total_exits": 0,
            "current_session_persons": 0,
        }

        # Tracking de detecção em tempo real
        self.detection_tracker = {
            "total_detections": 0,
            "detections_per_second": 0,
            "last_detection_time": time.time(),
            "detection_window": deque(maxlen=60),  # Últimos 60 segundos
        }

        # Threading e buffers ultra-otimizados
        self.frame_queue = queue.Queue(maxsize=BUFFER_SIZE)
        self.detection_results = {
            "people_boxes": [],
            "face_boxes": [],
            "people_count": 0,
            "faces_count": 0,
            "last_update": 0,
        }

        # Lock para resultados de detecção
        self.detection_lock = threading.Lock()

        # Otimizações gerais do OpenCV
        try:
            cv2.setUseOptimized(True)
        except Exception:
            pass

        # Configuração da câmera ultra-otimizada
        self._setup_camera(src)

        # Configuração dos modelos
        self._setup_models()

        # Estados de controle
        self.running = True
        self.last_detection_time = 0
        self.detection_interval = 1.0 / DETECTION_FPS

        # Iniciar threads
        self._start_threads()

    def _setup_camera(self, src):
        """Configuração ultra-otimizada da câmera.

        - Para índices numéricos (webcam), tenta DirectShow/MSMF (Windows).
        - Para URLs (HTTP/RTSP), tenta FFMPEG primeiro e cai no default se necessário.
        """

        self.cap = None

        # Se for string/URL (IP camera)
        is_numeric_source = isinstance(src, int) or (isinstance(src, str) and src.isdigit())

        if not is_numeric_source:
            # Fonte IP: priorizar backend FFMPEG
            try:
                cap = cv2.VideoCapture(src, cv2.CAP_FFMPEG)
                if cap.isOpened():
                    ret, frame = cap.read()
                    if ret and frame is not None:
                        self.cap = cap
                if not self.cap:
                    cap.release()
            except Exception:
                pass

            # Fallback para backend default
            if not self.cap:
                try:
                    cap = cv2.VideoCapture(src)
                    if cap.isOpened():
                        ret, frame = cap.read()
                        if ret and frame is not None:
                            self.cap = cap
                        else:
                            cap.release()
                except Exception:
                    pass
        else:
            # Webcam local (índice numérico)
            backends = [
                (cv2.CAP_DSHOW, "DirectShow"),
                (cv2.CAP_MSMF, "Media Foundation"),
            ]

            for backend, _ in backends:
                try:
                    cap = cv2.VideoCapture(src, backend)
                    if cap.isOpened():
                        ret, frame = cap.read()
                        if ret and frame is not None:
                            self.cap = cap
                            break
                        cap.release()
                except Exception:
                    pass

        if not self.cap:
            # Sem câmera válida, usar gerador de frames de teste
            self.use_fake_camera = True
            return

        self.use_fake_camera = False

        # Configurações comuns
        try:
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Buffer mínimo
        except Exception:
            pass

        # Ajustes só para webcam local (tendem a falhar em streams IP)
        if is_numeric_source:
            try:
                self.cap.set(cv2.CAP_PROP_FPS, TARGET_FPS)
                self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                self.cap.set(
                    cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc("M", "J", "P", "G")
                )
                self.cap.set(cv2.CAP_PROP_AUTOFOCUS, 0)
                self.cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 0.25)
                self.cap.set(cv2.CAP_PROP_BRIGHTNESS, 128)
                self.cap.set(cv2.CAP_PROP_CONTRAST, 128)
                self.cap.set(cv2.CAP_PROP_SATURATION, 128)
                self.cap.set(cv2.CAP_PROP_HUE, 0)
            except Exception:
                pass

    def _setup_models(self):
        """Configuração dos modelos com feedback."""
        self.models_ready = False
        self.device = "cpu"
        self.use_half = False

        try:

            # YOLOv8 para pessoas
            try:
                from ultralytics import YOLO

                self.person_model = YOLO(YOLO_MODEL)
                # Selecionar dispositivo
                if torch is not None and hasattr(torch, "cuda") and torch.cuda.is_available():
                    # Habilitar heurísticas do cuDNN para entradas estáveis
                    try:
                        torch.backends.cudnn.benchmark = True  # type: ignore
                    except Exception:
                        pass
                    self.device = "cuda:0"
                    # mover pesos para GPU
                    try:
                        self.person_model.to(self.device)
                        # half precision quando possível (RTX 30xx)
                        self.use_half = True
                    except Exception:
                        self.use_half = False
                # fundir camadas para inferência mais rápida
                try:
                    self.person_model.fuse()
                except Exception:
                    pass

                # Warmup com frame menor para velocidade
                dummy = np.zeros((320, 320, 3), dtype=np.uint8)
                _ = self.person_model(
                    dummy,
                    conf=CONF_THRESHOLD,
                    classes=[0],
                    verbose=False,
                    device=self.device,
                    half=self.use_half,
                )

                self.yolo_available = True

            except Exception as e:
                self.yolo_available = False

            # InsightFace para rostos
            try:
                from insightface.app import FaceAnalysis

                self.face_analyzer = FaceAnalysis(allowed_modules=["detection"])
                # Selecionar GPU se disponível (ctx_id>=0)
                ctx = 0 if self.device.startswith("cuda") else -1
                self.face_analyzer.prepare(
                    ctx_id=ctx, det_size=(320, 320)
                )

                # Warmup
                _ = self.face_analyzer.get(dummy)

                self.face_available = True

            except Exception as e:
                self.face_available = False

            self.models_ready = True

        except Exception as e:
            self.yolo_available = False
            self.face_available = False

    def _start_threads(self):
        """Inicia threads ultra-otimizadas."""

        # Thread 1: Captura rápida
        self.capture_thread = threading.Thread(
            target=self._capture_loop, daemon=True, name="VisualCapture"
        )
        self.capture_thread.start()

        # Thread 2: Detecção com cache de bounding boxes
        self.detection_thread = threading.Thread(
            target=self._detection_loop, daemon=True, name="VisualDetection"
        )
        self.detection_thread.start()

    def _capture_loop(self):
        """Loop de captura ultra-otimizado com tracking de FPS."""
        frame_count = 0
        last_fps_check = time.time()

        while self.running:
            try:
                if self.use_fake_camera:
                    frame = self._generate_test_frame()
                else:
                    ret, frame = self.cap.read()
                    if not ret or frame is None:
                        # evitar busy-wait quando frame falha
                        time.sleep(0.002)
                        continue

                # Buffer ultra-otimizado - sempre substituir frame mais recente
                try:
                    if self.frame_queue.full():
                        self.frame_queue.get_nowait()  # Remove frame antigo
                    self.frame_queue.put_nowait(frame)
                except (queue.Full, queue.Empty):
                    pass

                # Calcular FPS
                frame_count += 1
                if frame_count % 60 == 0:  # A cada segundo @ 60fps
                    current_time = time.time()
                    fps = 60 / (current_time - last_fps_check)
                    self.current_fps = fps
                    last_fps_check = current_time

            except Exception as e:
                time.sleep(0.001)  # Sleep mínimo

    def _detection_loop(self):
        """Loop de detecção ultra-otimizado que mantém bounding boxes atualizadas."""
        while self.running:
            try:
                current_time = time.time()

                # Controle de frequência mínimo
                if current_time - self.last_detection_time < self.detection_interval:
                    time.sleep(0.001)  # Sleep mínimo para não travar CPU
                    continue

                # Obter frame mais recente
                try:
                    frame = self.frame_queue.get(timeout=0.01)  # Timeout mínimo
                    # Limpar buffer - pegar sempre o mais recente
                    while not self.frame_queue.empty():
                        try:
                            frame = self.frame_queue.get_nowait()
                        except queue.Empty:
                            break
                except queue.Empty:
                    continue

                # Executar detecções
                people_boxes, people_count = self._detect_people_with_boxes(frame)
                face_boxes, faces_count = self._detect_faces_with_boxes(frame)

                # Sistema de tracking avançado
                tracked_count = self._track_persons(people_boxes)

                # Atualizar cache de resultados COM as coordenadas das boxes
                with self.detection_lock:
                    self.detection_results = {
                        "people_boxes": people_boxes,  # Lista de (x1,y1,x2,y2)
                        "face_boxes": face_boxes,  # Lista de (x1,y1,x2,y2)
                        "people_count": tracked_count,  # Usar contagem tracked
                        "faces_count": faces_count,
                        "last_update": current_time,
                    }

                # Atualizar contadores
                self._update_counters(tracked_count)

                # Atualizar o tracking de detecção em tempo real
                self._update_detection_tracker(tracked_count, faces_count)

                self.last_detection_time = current_time

            except Exception as e:
                time.sleep(0.001)  # Sleep mínimo

    def _detect_people_with_boxes(self, frame) -> Tuple[List[Tuple], int]:
        """Detecta pessoas e retorna bounding boxes ultra-otimizado."""
        if not self.yolo_available:
            return [], 0

        try:
            # Redimensionar para velocidade máxima
            h, w = frame.shape[:2]
            if w > 320:  # Tamanho menor para velocidade
                scale = 320 / w
                detection_frame = cv2.resize(frame, (320, int(h * scale)))
                scale_back = w / 320
            else:
                detection_frame = frame
                scale_back = 1.0

            # Inferência ultra-otimizada
            if torch is not None:
                with torch.inference_mode():  # type: ignore
                    results = self.person_model(
                        detection_frame,
                        conf=CONF_THRESHOLD,
                        classes=[0],  # Pessoas
                        verbose=False,
                        device=self.device,
                        half=self.use_half,
                    )[0]
            else:
                results = self.person_model(
                    detection_frame,
                    conf=CONF_THRESHOLD,
                    classes=[0],
                    verbose=False,
                )[0]

            boxes = []
            if results.boxes is not None:
                for box in results.boxes.xyxy:
                    x1, y1, x2, y2 = map(int, box * scale_back)  # Escalar de volta
                    boxes.append((x1, y1, x2, y2))

            return boxes, len(boxes)

        except Exception as e:
            return [], 0

    def _detect_faces_with_boxes(self, frame) -> Tuple[List[Tuple], int]:
        """Detecta rostos e retorna bounding boxes ultra-otimizado."""
        if not self.face_available:
            return [], 0

        try:
            # Redimensionar para velocidade
            h, w = frame.shape[:2]
            if w > 320:
                scale = 320 / w
                detection_frame = cv2.resize(frame, (320, int(h * scale)))
                scale_back = w / 320
            else:
                detection_frame = frame
                scale_back = 1.0

            # InsightFace otimizado
            faces = self.face_analyzer.get(detection_frame)

            boxes = []
            for face in faces:
                x1, y1, x2, y2 = map(int, face.bbox * scale_back)
                boxes.append((x1, y1, x2, y2))

            return boxes, len(faces)

        except Exception as e:
            return [], 0

    def _generate_test_frame(self):
        """Frame de teste com simulação de detecções."""
        frame = np.zeros((480, 640, 3), dtype=np.uint8)

        # Background colorido
        t = time.time()
        for y in range(0, 480, 4):
            for x in range(0, 640, 4):
                frame[y : y + 4, x : x + 4] = [
                    int(128 + 64 * np.sin(0.01 * x + t)),
                    int(128 + 64 * np.sin(0.01 * y + t + 2)),
                    int(128 + 64 * np.sin(0.01 * (x + y) + t + 4)),
                ]

        # Simular algumas detecções fixas para teste visual
        # Pessoa simulada
        cv2.rectangle(frame, (100, 100), (200, 300), COLORS["person_box"], 2)
        cv2.rectangle(
            frame, (100, 85), (140, 100), COLORS["person_label_bg"], cv2.FILLED
        )
        cv2.putText(
            frame,
            "P1",
            (105, 97),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            COLORS["person_text"],
            1,
        )

        # Rosto simulado
        cv2.rectangle(frame, (120, 120), (180, 180), COLORS["face_box"], 2)
        cv2.rectangle(
            frame, (120, 105), (150, 120), COLORS["face_label_bg"], cv2.FILLED
        )
        cv2.putText(
            frame,
            "F1",
            (125, 117),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.4,
            COLORS["face_text"],
            1,
        )

        # Texto informativo
        cv2.putText(
            frame,
            "CAMERA DE TESTE - ULTRA OTIMIZADO",
            (180, 50),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (255, 255, 255),
            2,
        )

        return frame

    def get_frame(self):
        """Retorna frame mais recente."""
        try:
            frame = self.frame_queue.get_nowait()
            # Pegar sempre o mais recente
            while not self.frame_queue.empty():
                try:
                    frame = self.frame_queue.get_nowait()
                except queue.Empty:
                    break
            return frame
        except queue.Empty:
            if self.use_fake_camera:
                return self._generate_test_frame()
            return None

    def detect_and_annotate(self, frame):
        """Anota frame com TODAS as detecções visuais ultra-otimizado."""
        if frame is None:
            return self._generate_test_frame()

        try:
            # Clonar frame para anotação
            annotated = frame.copy()

            # Obter resultados cached das detecções
            with self.detection_lock:
                results = self.detection_results.copy()

            # DESENHAR PESSOAS (bounding boxes amarelas)
            people_boxes = results.get("people_boxes", [])
            for i, (x1, y1, x2, y2) in enumerate(people_boxes):
                # Bounding box da pessoa
                cv2.rectangle(annotated, (x1, y1), (x2, y2), COLORS["person_box"], 2)

                # Label da pessoa
                label = f"P{i+1}"
                label_size = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)[0]

                # Background do label
                label_bg_x1 = x1
                label_bg_y1 = max(y1 - label_size[1] - 8, 0)
                label_bg_x2 = x1 + label_size[0] + 8
                label_bg_y2 = y1

                cv2.rectangle(
                    annotated,
                    (label_bg_x1, label_bg_y1),
                    (label_bg_x2, label_bg_y2),
                    COLORS["person_label_bg"],
                    cv2.FILLED,
                )

                # Texto do label
                cv2.putText(
                    annotated,
                    label,
                    (x1 + 4, y1 - 4),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    COLORS["person_text"],
                    2,
                )

            # DESENHAR ROSTOS (bounding boxes azuis)
            face_boxes = results.get("face_boxes", [])
            for i, (x1, y1, x2, y2) in enumerate(face_boxes):
                # Bounding box do rosto
                cv2.rectangle(annotated, (x1, y1), (x2, y2), COLORS["face_box"], 2)

                # Label do rosto (opcional)
                label = f"F{i+1}"
                label_size = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)[0]

                # Background pequeno do label
                label_bg_x1 = x1
                label_bg_y1 = max(y1 - label_size[1] - 6, 0)
                label_bg_x2 = x1 + label_size[0] + 6
                label_bg_y2 = y1

                cv2.rectangle(
                    annotated,
                    (label_bg_x1, label_bg_y1),
                    (label_bg_x2, label_bg_y2),
                    COLORS["face_label_bg"],
                    cv2.FILLED,
                )

                # Texto do label
                cv2.putText(
                    annotated,
                    label,
                    (x1 + 3, y1 - 3),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    COLORS["face_text"],
                    1,
                )

            # ADICIONAR INFORMAÇÕES NO FRAME
            self._add_visual_info(annotated, results)

            return annotated

        except Exception as e:
            return frame

    def _add_visual_info(self, frame, results):
        """Adiciona informações visuais no frame ultra-otimizado."""
        h, w = frame.shape[:2]

        # Background para informações (canto superior esquerdo)
        info_width = 300
        info_height = 140
        cv2.rectangle(
            frame, (10, 10), (info_width, info_height), COLORS["info_bg"], cv2.FILLED
        )
        cv2.rectangle(frame, (10, 10), (info_width, info_height), (100, 100, 100), 1)

        # Informações de texto
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.6
        thickness = 1
        line_height = 22

        info_lines = [
            f"Pessoas: {results.get('people_count', 0)}",
            f"Rostos: {results.get('faces_count', 0)}",
            f"Total Passaram: {self.total_passed}",
            f"FPS: {self.current_fps:.1f}",
            f"Tempo: {datetime.now().strftime('%H:%M:%S')}",
        ]

        for i, line in enumerate(info_lines):
            y_pos = 35 + i * line_height
            cv2.putText(
                frame,
                line,
                (20, y_pos),
                font,
                font_scale,
                COLORS["info_text"],
                thickness,
            )

    def _update_counters(self, current_count):
        """Atualiza contadores usando dados de tracking."""
        # Usar dados de tracking para total mais preciso
        self.prev_count = current_count
        self.total_passed = self.person_tracking["total_entries"]

        # Log simplificado
        if len(self.log) % 50 == 0:
            self.log.append(
                {
                    "timestamp": brasilia_now().isoformat(),
                    "current": current_count,
                    "total_passed": self.total_passed,
                    "total_entries": self.person_tracking["total_entries"],
                    "total_exits": self.person_tracking["total_exits"],
                }
            )

            if len(self.log) > 500:
                self.log = self.log[-500:]

    def _update_detection_tracker(self, people_count, faces_count):
        """Atualiza o tracking de detecção em tempo real."""
        current_time = time.time()
        total_detections = people_count + faces_count

        # Adicionar ao histórico de detecções
        self.detection_tracker["detection_window"].append(
            {"time": current_time, "detections": total_detections}
        )

        # Calcular detecções por segundo (média dos últimos 5 segundos)
        recent_detections = []
        for entry in list(self.detection_tracker["detection_window"])[-5:]:
            if current_time - entry["time"] <= 5:
                recent_detections.append(entry["detections"])

        if recent_detections:
            self.detection_tracker["detections_per_second"] = sum(
                recent_detections
            ) / len(recent_detections)

        # Atualizar total
        if total_detections > 0:
            self.detection_tracker["total_detections"] += total_detections
            self.detection_tracker["last_detection_time"] = current_time

    def get_performance_stats(self):
        """Stats de performance ultra-otimizada."""
        with self.detection_lock:
            results = self.detection_results.copy()

        return {
            "capture_fps": self.current_fps,
            "detection_fps": 1.0 / self.detection_interval,
            "frame_queue_size": self.frame_queue.qsize(),
            "models_ready": self.models_ready,
            "yolo_available": self.yolo_available,
            "face_available": self.face_available,
            "current_people": results.get("people_count", 0),
            "current_faces": results.get("faces_count", 0),
            "total_detections": len(self.log),
            "detection_rate": {
                "detections_per_second": self.detection_tracker[
                    "detections_per_second"
                ],
                "total_detections": self.detection_tracker["total_detections"],
                "detection_efficiency": self._calculate_detection_efficiency(),
            },
            "tracking_stats": {
                "total_entries": self.person_tracking["total_entries"],
                "total_exits": self.person_tracking["total_exits"],
                "current_persons": self.person_tracking["current_session_persons"],
                "session_start": self.person_tracking["session_start"].isoformat(),
                "session_duration": (
                    datetime.now() - self.person_tracking["session_start"]
                ).total_seconds(),
            },
        }

    def _calculate_detection_efficiency(self):
        """Calcula a eficiência de detecção baseada no FPS de captura vs detecção."""
        if self.current_fps > 0:
            detection_efficiency = (
                self.detection_tracker["detections_per_second"] / self.current_fps
            ) * 100
            return min(100, max(0, detection_efficiency))  # Limitar entre 0-100%
        return 0

    def stop(self):
        """Para o detector."""
        self.running = False

        if hasattr(self, "capture_thread"):
            self.capture_thread.join(timeout=1.0)
        if hasattr(self, "detection_thread"):
            self.detection_thread.join(timeout=1.0)

        if hasattr(self, "cap") and self.cap:
            self.cap.release()

    def _track_persons(self, people_boxes):
        """Sistema avançado de tracking de pessoas com entrada/saída."""
        current_time = datetime.now()
        current_persons = set()

        # Processar pessoas detectadas atualmente
        for i, bbox in enumerate(people_boxes):
            person_id = f"P{i+1}"
            current_persons.add(person_id)

            # Verificar se é uma nova pessoa
            if person_id not in self.person_tracking["active_persons"]:
                # Nova pessoa entrou na cena
                self.person_tracking["person_counter"] += 1
                self.person_tracking["total_entries"] += 1

                self.person_tracking["active_persons"][person_id] = {
                    "entry_time": current_time,
                    "last_seen": current_time,
                    "bbox": bbox,
                    "person_id": self.person_tracking["person_counter"],
                    "session_id": current_time.strftime("%Y%m%d_%H%M%S"),
                }

                # Log de entrada
                self.log.append(
                    {
                        "timestamp": current_time.isoformat(),
                        "event": "ENTRY",
                        "person_id": self.person_tracking["person_counter"],
                        "session_id": current_time.strftime("%Y%m%d_%H%M%S"),
                        "bbox": bbox,
                        "current_count": len(current_persons),
                        "total_entries": self.person_tracking["total_entries"],
                    }
                )
            else:
                # Pessoa já conhecida, atualizar última vez vista
                self.person_tracking["active_persons"][person_id][
                    "last_seen"
                ] = current_time
                self.person_tracking["active_persons"][person_id]["bbox"] = bbox

        # Verificar pessoas que saíram da cena (não detectadas por 3 segundos)
        persons_to_remove = []
        for person_id, person_data in self.person_tracking["active_persons"].items():
            if person_id not in current_persons:
                time_since_last_seen = (
                    current_time - person_data["last_seen"]
                ).total_seconds()

                if time_since_last_seen > 3.0:  # 3 segundos sem detectar = saiu
                    persons_to_remove.append(person_id)

                    # Calcular tempo de permanência
                    duration = (
                        person_data["last_seen"] - person_data["entry_time"]
                    ).total_seconds()

                    # Log de saída
                    self.log.append(
                        {
                            "timestamp": person_data["last_seen"].isoformat(),
                            "event": "EXIT",
                            "person_id": person_data["person_id"],
                            "session_id": person_data["session_id"],
                            "entry_time": person_data["entry_time"].isoformat(),
                            "exit_time": person_data["last_seen"].isoformat(),
                            "duration_seconds": round(duration, 2),
                            "duration_formatted": f"{int(duration//60)}m {int(duration%60)}s",
                            "bbox": person_data["bbox"],
                            "current_count": len(current_persons),
                            "total_exits": self.person_tracking["total_exits"] + 1,
                        }
                    )

                    self.person_tracking["total_exits"] += 1

        # Remover pessoas que saíram
        for person_id in persons_to_remove:
            del self.person_tracking["active_persons"][person_id]

        # Atualizar contador de pessoas atuais
        self.person_tracking["current_session_persons"] = len(current_persons)

        return len(current_persons)


# Alias para compatibilidade
Detector = VisualDetector
OptimizedDetector = VisualDetector
