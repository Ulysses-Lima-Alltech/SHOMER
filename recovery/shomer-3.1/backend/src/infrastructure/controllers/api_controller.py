import asyncio
import time
import os
from datetime import timedelta
from typing import List
from fastapi import APIRouter, HTTPException, Depends, Request, Response
from fastapi.responses import JSONResponse
from jose import jwt
import cv2

from ...application.dto.models import RegisterModel, LoginModel, Token, LogModel, LogOutModel
from ...application.use_cases import RegisterUserUseCase, LoginUserUseCase, CreateLogUseCase, GetLogsUseCase
from ...infrastructure.repositories import PostgresUserRepository, PostgresLogRepository
from ...infrastructure.services import JWTAuthService, get_current_user, check_login_rate_limit
from ...shared.config import brasilia_now, Config
from ...shared.utils import (
    export_log_csv, get_logs_list, get_detector_stats, 
    get_performance_stats, get_health_info
)
from detection import VisualDetector
from pydantic import BaseModel

# Router para organizar as rotas
router = APIRouter()

# Token de convite único
INVITATION_TOKEN = os.getenv("INVITATION_TOKEN")

# Variáveis globais que serão injetadas
detector = None
camera_config = None

# Instâncias dos serviços e repositórios
auth_service = JWTAuthService()
user_repository = PostgresUserRepository()
log_repository = PostgresLogRepository()

# Casos de uso
register_use_case = RegisterUserUseCase(user_repository, auth_service)
login_use_case = LoginUserUseCase(user_repository, auth_service)
create_log_use_case = CreateLogUseCase(log_repository)
get_logs_use_case = GetLogsUseCase(log_repository)


def set_globals(detector_instance, camera_config_instance):
    """Define as variáveis globais para as rotas."""
    global detector, camera_config
    detector = detector_instance
    camera_config = camera_config_instance


def _probe_source(source) -> (bool, str):
    """Tenta abrir a fonte de vídeo rapidamente para validar disponibilidade.
    Retorna (ok, erro). Timeout curto para não travar API.
    """
    try:
        # Selecionar backend conforme tipo de fonte
        cap = None
        if isinstance(source, int):
            cap = cv2.VideoCapture(source, cv2.CAP_DSHOW)
        else:
            # Pode ser string numérica representando webcam
            if isinstance(source, str) and source.isdigit():
                cap = cv2.VideoCapture(int(source), cv2.CAP_DSHOW)
            else:
                cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)

        # Buffer mínimo e timeout de leitura
        try:
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:
            pass

        start = time.time()
        ok = False
        while time.time() - start < 3.0:
            ret, _ = cap.read()
            if ret:
                ok = True
                break
            time.sleep(0.1)
        cap.release()
        if ok:
            return True, ""
        return False, "Falha ao abrir/ler da fonte de vídeo"
    except Exception as e:
        try:
            if cap:
                cap.release()
        except Exception:
            pass
        return False, str(e)


def _normalize_ip_url(raw: str) -> str:
    """Normaliza URL informada pelo usuário.
    - Adiciona http:// se ausente
    - Garante path (/video) se ausente (DroidCam)
    - Remove espaços
    """
    url = (raw or "").strip()
    if not url:
        return url
    if not url.startswith("http://") and not url.startswith("https://"):
        url = f"http://{url}"
    try:
        from urllib.parse import urlparse, urlunparse
        parsed = urlparse(url)
        path = parsed.path or "/video"
        if path == "/":
            path = "/video"
        parsed = parsed._replace(path=path)
        return urlunparse(parsed)
    except Exception:
        if url.endswith("/"):
            return url + "video"
        if "/" not in url.split("://", 1)[1]:
            return url + "/video"
        return url

@router.get("/")
async def root():
    """API info ultra-otimizada."""
    base_info = {
        "message": "Shomer API - Ultra High Performance Mode",
        "version": "3.0.0",
        "status": "active" if detector else "starting",
        "camera": {
            "current_source": (
                "webcam" if camera_config["current_source"] == 0 else "ip_camera"
            ),
            "stream_enabled": camera_config["stream_enabled"],
            "available_sources": list(camera_config["available_sources"].keys()),
        },
    }

    if detector:
        stats = detector.get_performance_stats()
        from ...infrastructure.services import get_cache_stats
        cache_stats = get_cache_stats()
        cache_ratio = cache_stats["cache_efficiency"]
        base_info["performance"] = {
            "fps": stats.get("capture_fps", 0),
            "models_ready": stats.get("models_ready", False),
            "cache_efficiency": cache_ratio,
        }

    return base_info
class UpdateIPPayload(BaseModel):
    ip_url: str


@router.post("/camera/ip")
async def update_ip_camera(payload: UpdateIPPayload):
    """Atualiza a URL da câmera IP e reinicia o detector se estiver usando IP."""
    global detector
    try:
        from ...shared.config import Config

        # Normalizar URL e atualizar config
        normalized_url = _normalize_ip_url(payload.ip_url)
        Config.update_ip_camera_url(normalized_url)
        camera_config["ip_url"] = normalized_url
        camera_config["available_sources"]["ip_camera"] = normalized_url

        # Se a fonte atual for IP, só reinicia se a nova URL estiver acessível
        if camera_config["current_source"] != 0:
            ok, err = _probe_source(normalized_url)
            if not ok:
                return {
                    "success": False,
                    "message": f"URL atualizada, mas a câmera IP não respondeu: {err}",
                    "ip_url": normalized_url,
                    "current_source": "ip_camera",
                }
            # Trocar de forma segura
            try:
                if detector:
                    detector.stop()
            except Exception:
                pass
            detector = VisualDetector(src=normalized_url)

        return {
            "success": True,
            "ip_url": normalized_url,
            "current_source": (
                "webcam" if camera_config["current_source"] == 0 else "ip_camera"
            ),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar IP: {str(e)}")


@router.get("/users")
async def list_users(limit: int = 100, current_user: str = Depends(get_current_user)):
    """Lista usuários cadastrados (campos públicos)."""
    try:
        users = await user_repository.find_all()
        public_users = [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "created_at": u.created_at,
            }
            for u in users[:limit]
        ]
        return public_users
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.get("/video_feed")
async def video_feed():
    """Stream MJPEG ultra-otimizado com headers otimizados."""
    from ...infrastructure.services import get_video_feed_response
    return get_video_feed_response(detector, camera_config)


@router.get("/demo-stream.jpg")
async def demo_stream():
    """Imagem única ultra-otimizada."""
    from ...infrastructure.services import get_demo_stream_response
    return get_demo_stream_response(detector, camera_config)


@router.get("/stats")
async def get_stats():
    """Stats ultra-rápidas com cache info e tracking."""
    return get_detector_stats(detector, camera_config)


@router.get("/performance")
async def get_performance():
    """Métricas de performance detalhadas com cache."""
    return get_performance_stats(detector, camera_config)


@router.post("/camera/switch")
async def switch_camera(source: str):
    """Troca entre webcam e IP camera."""
    if source not in camera_config["available_sources"]:
        raise HTTPException(
            status_code=400,
            detail=f"Fonte inválida. Use: {list(camera_config['available_sources'].keys())}",
        )

    try:
        if source == "ip_camera":
            new_source = camera_config.get("ip_url") or camera_config["available_sources"].get("ip_camera") or ""
            if not new_source:
                return {
                    "success": False,
                    "message": "Nenhuma URL de câmera IP configurada. Salve a URL em /camera/ip.",
                    "current_source": (
                        "webcam" if camera_config["current_source"] == 0 else "ip_camera"
                    ),
                    "stream_enabled": camera_config["stream_enabled"],
                }
        else:
            new_source = camera_config["available_sources"][source]

        # Se for IP camera, validar antes de parar a atual
        if source == "ip_camera":
            ok, err = _probe_source(new_source)
            if not ok:
                return {
                    "success": False,
                    "message": f"Não foi possível conectar na câmera IP: {err}",
                    "current_source": (
                        "webcam" if camera_config["current_source"] == 0 else "ip_camera"
                    ),
                    "stream_enabled": camera_config["stream_enabled"],
                }

        # Guardar antigo
        global detector
        old_detector = detector
        old_source = camera_config["current_source"]

        # Tentar trocar
        try:
            if old_detector:
                try:
                    old_detector.stop()
                except Exception:
                    pass
            detector = VisualDetector(src=new_source)
            camera_config["current_source"] = new_source
        except Exception as switch_err:
            # Fallback automático para webcam se a troca falhar
            fallback_source = camera_config["available_sources"].get("webcam", 0)
            try:
                detector = VisualDetector(src=fallback_source)
                camera_config["current_source"] = fallback_source
                return {
                    "success": False,
                    "message": f"Falha ao trocar para {source}. Retornado à webcam. Erro: {switch_err}",
                    "current_source": "webcam",
                    "stream_enabled": camera_config["stream_enabled"],
                }
            except Exception:
                # Se até a webcam falhar, manter sistema online sem detector
                detector = None
                camera_config["current_source"] = old_source
                return {
                    "success": False,
                    "message": f"Falha geral ao inicializar câmera. Verifique dispositivos e URL.",
                    "current_source": (
                        "webcam" if old_source == 0 else "ip_camera"
                    ),
                    "stream_enabled": camera_config["stream_enabled"],
                }

        # Aguardar inicialização breve e responder
        await asyncio.sleep(0.7)
        return {
            "success": True,
            "message": f"Câmera trocada para {source}",
            "current_source": source,
            "stream_enabled": camera_config["stream_enabled"],
        }

    except Exception as e:
        # Não quebrar toda a API
        return {
            "success": False,
            "message": f"Erro ao trocar câmera: {str(e)}",
            "current_source": (
                "webcam" if camera_config["current_source"] == 0 else "ip_camera"
            ),
            "stream_enabled": camera_config["stream_enabled"],
        }


@router.post("/stream/control")
async def control_stream(action: str, current_user: str = Depends(get_current_user)):
    """Controla o stream (start/stop)."""
    if action not in ["start", "stop"]:
        raise HTTPException(status_code=400, detail="Ação inválida. Use: start ou stop")

    try:
        if action == "start":
            camera_config["stream_enabled"] = True
            message = "Stream iniciado"
        else:
            camera_config["stream_enabled"] = False
            message = "Stream parado"

        return {
            "success": True,
            "message": message,
            "stream_enabled": camera_config["stream_enabled"],
            "current_source": (
                "webcam" if camera_config["current_source"] == 0 else "ip_camera"
            ),
            "user": current_user,
        }

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Erro ao controlar stream: {str(e)}"
        )


@router.get("/camera/status")
async def get_camera_status():
    """Retorna status atual da câmera."""
    return {
        "current_source": (
            "webcam" if camera_config["current_source"] == 0 else "ip_camera"
        ),
        "stream_enabled": camera_config["stream_enabled"],
        "available_sources": list(camera_config["available_sources"].keys()),
        "detector_ready": detector is not None,
        "ip_url": camera_config["ip_url"],
    }


@router.get("/config")
async def get_config():
    """Retorna configurações do sistema."""
    return {
        "camera": Config.get_camera_config(),
        "detection": Config.get_detection_config(),
        "server": Config.get_server_config(),
    }


@router.get("/export_log.csv")
async def export_log(current_user: str = Depends(get_current_user)):
    """Export simplificado com total de pessoas capturadas."""
    csv_data, filename = export_log_csv(detector, current_user)

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/health")
async def health():
    """Health check ultra-rápido."""
    return get_health_info(detector, camera_config)


# Endpoints de autenticação e logs
@router.post("/register")
async def register(data: RegisterModel):
    """Registra um novo usuário."""
    try:
        result = await register_use_case.execute(data, INVITATION_TOKEN)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/login", response_model=Token)
async def login(data: LoginModel, request: Request):
    """Autentica um usuário com username ou email."""
    # Rate limiting específico para login
    client_ip = request.client.host
    current_time = time.time()

    # Verificar limite de tentativas de login
    check_login_rate_limit(client_ip, current_time)

    try:
        result = await login_use_case.execute(data)
        return result
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/logs")
async def create_log(
    data: LogModel,
    current_user: str = Depends(get_current_user),
):
    """Cria um novo log de detecção."""
    try:
        result = await create_log_use_case.execute(data, current_user)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/me")
async def get_current_user_info(current_user: str = Depends(get_current_user)):
    """Retorna informações do usuário atual."""
    user = await user_repository.find_by_username(current_user)
    if user:
        return {"username": current_user, "created_at": user.created_at}
    raise HTTPException(status_code=404, detail="Usuário não encontrado")


@router.get("/logs", response_model=List[LogOutModel])
async def list_logs(limit: int = 100):
    """
    Retorna os últimos `limit` logs, em ordem decrescente de timestamp.
    """
    try:
        results = await get_logs_use_case.execute(limit)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
