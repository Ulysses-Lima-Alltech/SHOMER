import cv2
import numpy as np
import asyncio
from datetime import datetime
from fastapi import Response
from fastapi.responses import StreamingResponse
from detection import VisualDetector
from ...shared.config import Config


# Cache de frames ultra-otimizado
frame_cache = {
    "last_frame": None,
    "last_encoding": None,
    "last_time": 0,
    "cache_hits": 0,
    "cache_misses": 0,
}


def encode_frame_ultra_fast(frame):
    """Codificação ultra-rápida com cache inteligente e qualidade otimizada."""
    global frame_cache

    if frame is None:
        return None

    try:
        current_time = datetime.now().timestamp()

        # Cache inteligente - se frame muito similar ao anterior, reusar encoding
        if (
            frame_cache["last_frame"] is not None
            and current_time - frame_cache["last_time"] < 0.02
        ):  # 20ms cache

            # Verificação rápida de similaridade (sample menor para velocidade)
            if np.array_equal(frame[::16, ::16], frame_cache["last_frame"][::16, ::16]):
                frame_cache["cache_hits"] += 1
                return frame_cache["last_encoding"]

        frame_cache["cache_misses"] += 1

        # Parâmetros de encoding ultra-otimizados para velocidade máxima
        encode_params = [
            cv2.IMWRITE_JPEG_QUALITY,
            50,  # Qualidade reduzida para velocidade máxima
            cv2.IMWRITE_JPEG_OPTIMIZE,
            0,  # Sem otimização = mais rápido
            cv2.IMWRITE_JPEG_PROGRESSIVE,
            0,  # Sem progressive = mais rápido
        ]

        ret, buffer = cv2.imencode(".jpg", frame, encode_params)

        if ret and buffer is not None:
            encoded = buffer.tobytes()

            # Atualizar cache com sample menor
            frame_cache.update(
                {
                    "last_frame": frame[
                        ::16, ::16
                    ].copy(),  # Sample menor para comparação
                    "last_encoding": encoded,
                    "last_time": current_time,
                }
            )

            return encoded

    except Exception as e:
        pass

    return None


async def generate_ultra_fast_stream(detector, camera_config):
    """Gerador de stream ultra-otimizado com FPS máximo."""
    if not detector:
        # Stream de erro se detector não disponível
        error_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(
            error_frame,
            "DETECTOR NAO INICIADO",
            (150, 240),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (0, 0, 255),
            2,
        )

        chunk = encode_frame_ultra_fast(error_frame)
        if chunk:
            while True:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    b"Content-Length: "
                    + str(len(chunk)).encode()
                    + b"\r\n\r\n"
                    + chunk
                    + b"\r\n"
                )
                await asyncio.sleep(0.016)  # ~60 FPS para erro
        return

    frame_count = 0

    while True:
        try:
            # Verificar se stream está habilitado
            if not camera_config["stream_enabled"]:
                # Frame de "aguardando liberação"
                waiting_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(
                    waiting_frame,
                    "AGUARDANDO LIBERACAO",
                    (120, 200),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.8,
                    (0, 255, 255),
                    2,
                )
                cv2.putText(
                    waiting_frame,
                    "Clique em 'Iniciar Stream'",
                    (140, 240),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (255, 255, 255),
                    1,
                )

                chunk = encode_frame_ultra_fast(waiting_frame)
                if chunk:
                    yield (
                        b"--frame\r\n"
                        b"Content-Type: image/jpeg\r\n"
                        b"Content-Length: "
                        + str(len(chunk)).encode()
                        + b"\r\n\r\n"
                        + chunk
                        + b"\r\n"
                    )
                await asyncio.sleep(0.1)  # 10 FPS para frame de espera
                continue

            # Obter frame mais recente
            frame = detector.get_frame()

            if frame is not None:
                # Anotar frame (usa cache de detecções)
                annotated_frame = detector.detect_and_annotate(frame)

                # Encoding ultra-rápido
                chunk = encode_frame_ultra_fast(annotated_frame)

                if chunk:
                    frame_count += 1

                    # Yield do frame SEM LIMITE DE FPS
                    yield (
                        b"--frame\r\n"
                        b"Content-Type: image/jpeg\r\n"
                        b"Content-Length: "
                        + str(len(chunk)).encode()
                        + b"\r\n\r\n"
                        + chunk
                        + b"\r\n"
                    )

            # Yield mínimo para não travar (sem limite de FPS)
            await asyncio.sleep(0.001)

        except Exception as e:
            await asyncio.sleep(0.01)


def get_video_feed_response(detector, camera_config):
    """Retorna resposta de streaming MJPEG ultra-otimizada."""
    return StreamingResponse(
        generate_ultra_fast_stream(detector, camera_config),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "X-Accel-Buffering": "no",  # Nginx optimization
            "Connection": "close",
            "Transfer-Encoding": "chunked",
            "X-Content-Type-Options": "nosniff",
        },
    )


def get_demo_stream_response(detector, camera_config):
    """Retorna imagem única ultra-otimizada."""
    if not detector:
        return Response(content=b"", status_code=503, headers={"Retry-After": "3"})

    try:
        # Verificar se stream está habilitado
        if not camera_config["stream_enabled"]:
            # Frame de "aguardando liberação"
            waiting_frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(
                waiting_frame,
                "AGUARDANDO LIBERACAO",
                (120, 200),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 255, 255),
                2,
            )
            cv2.putText(
                waiting_frame,
                "Clique em 'Iniciar Stream'",
                (140, 240),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (255, 255, 255),
                1,
            )

            chunk = encode_frame_ultra_fast(waiting_frame)
            if chunk:
                return Response(
                    content=chunk,
                    media_type="image/jpeg",
                    headers={
                        "Cache-Control": "no-cache, max-age=0",
                        "Pragma": "no-cache",
                        "X-Content-Type-Options": "nosniff",
                    },
                )

        frame = detector.get_frame()
        if frame is not None:
            frame = detector.detect_and_annotate(frame)
            chunk = encode_frame_ultra_fast(frame)

            if chunk:
                return Response(
                    content=chunk,
                    media_type="image/jpeg",
                    headers={
                        "Cache-Control": "no-cache, max-age=0",
                        "Pragma": "no-cache",
                        "X-Content-Type-Options": "nosniff",
                    },
                )

        return Response(status_code=204)  # No content

    except Exception as e:
        return Response(status_code=500)


def get_cache_stats():
    """Retorna estatísticas do cache de frames."""
    cache_ratio = frame_cache["cache_hits"] / max(frame_cache["cache_misses"], 1) * 100
    return {
        "cache_hits": frame_cache["cache_hits"],
        "cache_misses": frame_cache["cache_misses"],
        "cache_efficiency": f"{cache_ratio:.1f}%",
    }
