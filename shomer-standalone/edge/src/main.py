"""
SHOMER Edge Service
Serviço de captura e processamento de vídeo na borda
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import asyncio
import logging
from contextlib import asynccontextmanager
from src.health import router as health_router
from src.config import settings
from src.mock.worker import MockWorker

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Variável global para o worker
mock_worker: MockWorker = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gerencia o ciclo de vida da aplicação"""
    global mock_worker

    # Startup
    if settings.MODE == "mock":
        logger.info("Iniciando modo MOCK...")
        tenant_id = settings.TENANT_ID or "demo-tenant-id"
        store_id = settings.STORE_ID or None
        camera_id = settings.CAMERA_ID or None
        edge_device_id = settings.EDGE_DEVICE_ID or "test-device-id"
        device_key = settings.DEVICE_KEY or "test-device-key"

        mock_worker = MockWorker(
            tenant_id=tenant_id,
            store_id=store_id,
            camera_id=camera_id,
            edge_device_id=edge_device_id,
            device_key=device_key,
            ingestion_url=settings.INGESTION_URL,
        )
        await mock_worker.start()
        logger.info("Modo MOCK iniciado")

    yield

    # Shutdown
    if mock_worker:
        await mock_worker.stop()
        logger.info("Modo MOCK parado")


app = FastAPI(
    title="SHOMER Edge Service",
    description="Serviço de captura e processamento de vídeo na borda",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health_router, prefix="/health", tags=["health"])


@app.get("/")
async def root():
    return {
        "service": "shomer-edge",
        "status": "running",
        "mode": settings.MODE,
        "tenant_id": settings.TENANT_ID if hasattr(settings, "TENANT_ID") else None,
        "store_id": settings.STORE_ID if hasattr(settings, "STORE_ID") else None,
    }


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )

