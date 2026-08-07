from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, EmailStr


class User(BaseModel):
    """Entidade User do domínio."""
    id: Optional[str] = None
    username: str = Field(..., min_length=3, description="Nome de usuário")
    email: EmailStr = Field(..., description="Email válido")
    password_hash: str = Field(..., description="Hash da senha")
    created_at: datetime = Field(default_factory=datetime.now)
    
    class Config:
        orm_mode = True
        arbitrary_types_allowed = True
