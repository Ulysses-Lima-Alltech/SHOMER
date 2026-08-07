import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.health import router as health_router
from src.mock.worker import MockWorker
from src.vision.status import router as vision_router
from src.vision.worker import VisionWorker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

mock_worker: MockWorker | None = None
vision_worker: VisionWorker | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage the application lifecycle."""
    global mock_worker, vision_worker

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
        app.state.mock_worker = mock_worker
        await mock_worker.start()
        logger.info("Modo MOCK iniciado")
    elif settings.MODE == "production":
        logger.info("Iniciando modo PRODUCTION...")
        vision_worker = VisionWorker(settings)
        app.state.vision_worker = vision_worker
        await vision_worker.start()
        logger.info("Modo PRODUCTION iniciado")
    else:
        raise RuntimeError(
            f"MODE invalido: {settings.MODE!r}. Use 'mock' ou 'production'."
        )

    yield

    if mock_worker:
        await mock_worker.stop()
        logger.info("Modo MOCK parado")
    if vision_worker:
        await vision_worker.stop()
        logger.info("Modo PRODUCTION parado")


app = FastAPI(
    title="SHOMER Edge Service",
    description="Servico de captura e processamento de video na borda",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/health", tags=["health"])
app.include_router(vision_router, prefix="/vision", tags=["vision"])


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
