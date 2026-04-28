"""
Configurações do Edge Service
"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    MODE: str = "mock"  # mock ou production
    API_URL: str = "http://localhost:3000"
    INGESTION_URL: str = "http://localhost:3001"
    
    # RTSP/FFmpeg (para modo production)
    RTSP_URL: str = ""
    FFMPEG_PATH: str = "ffmpeg"
    
    # Configuração para modo MOCK (dev end-to-end)
    TENANT_ID: Optional[str] = None
    STORE_ID: Optional[str] = None
    CAMERA_ID: Optional[str] = None
    EDGE_DEVICE_ID: str = "test-device-id"
    DEVICE_KEY: str = "test-device-key"
    
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()

