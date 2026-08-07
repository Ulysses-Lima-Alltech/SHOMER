from pydantic import BaseModel, Field, EmailStr, validator
from datetime import datetime
from typing import List


class RegisterModel(BaseModel):
    username: str = Field(
        ..., min_length=3, description="Nome completo com sobrenome (ex: João Silva)"
    )
    email: EmailStr = Field(..., description="Email válido")
    password: str = Field(
        ..., min_length=6, description="Senha com mínimo 6 caracteres"
    )
    invitationToken: str = Field(..., description="Token de convite válido")
    
    @validator('username')
    def validate_full_name(cls, v):
        if not v or len(v.strip()) < 5:
            raise ValueError('Nome deve ter pelo menos 5 caracteres')
        
        # Verificar se tem pelo menos um espaço (nome + sobrenome)
        if ' ' not in v.strip():
            raise ValueError('Nome deve incluir sobrenome (ex: João Silva)')
        
        # Verificar se não tem espaços múltiplos ou no início/fim
        parts = v.strip().split()
        if len(parts) < 2:
            raise ValueError('Nome deve incluir sobrenome (ex: João Silva)')
        
        # Verificar se cada parte tem pelo menos 2 caracteres
        for part in parts:
            if len(part) < 2:
                raise ValueError('Cada parte do nome deve ter pelo menos 2 caracteres')
        
        return v.strip()


class LoginModel(BaseModel):
    username: str = Field(..., description="Nome de usuário ou email")
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class LogModel(BaseModel):
    timestamp: datetime
    count: int
    details: dict  # opcional: pode guardar info extra da detecção


class LogOutModel(BaseModel):
    timestamp: datetime
    count: int
    details: dict
    created_at: datetime
