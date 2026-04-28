"""
Health check endpoints
"""
from fastapi import APIRouter
from datetime import datetime
import os

router = APIRouter()


@router.get("/")
async def check():
    """Health check básico"""
    return {
        "status": "ok",
        "service": "shomer-edge",
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.get("/ready")
async def ready():
    """Readiness check"""
    return {
        "status": "ready",
        "service": "shomer-edge",
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.get("/live")
async def live():
    """Liveness check"""
    return {
        "status": "alive",
        "service": "shomer-edge",
        "timestamp": datetime.utcnow().isoformat(),
    }




