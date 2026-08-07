# backend/main.py - Versão Refatorada com Arquitetura DDD

from dotenv import load_dotenv
import asyncio
import logging

# Carrega variáveis de ambiente
load_dotenv(".env")

from fastapi import FastAPI
import uvicorn

# Importações da nova estrutura DDD
from src.infrastructure.controllers import api_router
from src.infrastructure.middleware import setup_cors, security_middleware
from src.shared.config import Config
from detection import VisualDetector
from src.infrastructure.repositories.postgres_repository import engine
from src.infrastructure.repositories.postgres_models import Base

# Configuração de logging otimizada
logging.basicConfig(level=logging.WARNING)  # Menos logs = mais performance
logger = logging.getLogger(__name__)

# Inicialização da aplicação
app = FastAPI(
    title="Shomer API - Ultra High Performance",
    description="Sistema de detecção ultra-otimizado para máxima velocidade",
    version="3.0.0",
)

# Configuração de CORS
setup_cors(app)

# Middleware de segurança
app.middleware("http")(security_middleware)

# Incluir rotas da API
app.include_router(api_router)

# Detector global
detector = None

# Configurações de câmera usando o arquivo de configuração
camera_config = Config.get_camera_config()


@app.on_event("startup")
async def startup_event():
    """Inicialização ultra-otimizada."""
    global detector
    try:
        # Garantir que as rotas tenham acesso ao camera_config desde o início
        from src.infrastructure.controllers.api_controller import set_globals
        set_globals(detector, camera_config)

        # Criar schema no Postgres (equivalente simples a migrations iniciais)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        detector = VisualDetector(src=camera_config["current_source"])
        
        # Aguardar inicialização completa
        await asyncio.sleep(1.5)  # Reduzido para inicialização mais rápida
        
        # Atualizar variáveis globais no controller com detector pronto
        set_globals(detector, camera_config)
        
    except Exception as e:
        logger.error(f"Erro na inicialização: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    """Shutdown ultra-otimizado."""
    global detector
    if detector:
        detector.stop()


if __name__ == "__main__":
    import time

    # Configuração ultra-otimizada do servidor
    server_config = Config.get_server_config()

    uvicorn.run(
        "main:app",
        host=server_config["host"],
        port=server_config["port"],
        reload=False,  # Reload desabilitado para performance
        access_log=False,  # Logs de acesso desabilitados para velocidade
        log_level="warning",  # Menos logs = mais performance
        loop="asyncio",  # Loop assíncrono otimizado
        workers=1,  # Single worker para evitar conflitos de câmera
        limit_concurrency=200,  # Aumentado para mais conexões
        limit_max_requests=20000,  # Aumentado para evitar memory leaks
        timeout_keep_alive=3,  # Keep-alive otimizado
        timeout_graceful_shutdown=5,  # Shutdown mais rápido
    )
