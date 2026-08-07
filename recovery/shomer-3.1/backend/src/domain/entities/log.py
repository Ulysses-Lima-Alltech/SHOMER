from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class Log(BaseModel):
    """Entidade Log do domínio."""
    id: Optional[str] = None
    timestamp: datetime = Field(..., description="Timestamp da detecção")
    count: int = Field(..., description="Quantidade de pessoas detectadas")
    details: Dict[str, Any] = Field(default_factory=dict, description="Detalhes da detecção")
    user: Optional[str] = Field(None, description="Usuário que criou o log")
    created_at: datetime = Field(default_factory=datetime.now)
    
    class Config:
        orm_mode = True
        arbitrary_types_allowed = True
