import os
import time
from datetime import timedelta
from collections import defaultdict
from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi import HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from ...domain.ports.auth_service import AuthService
from ...domain.entities.user import User
from ...shared.config import brasilia_now

# Constantes para JWT
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRATION_MINUTES", "60"))

# OAuth2 scheme para autenticação
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")

# Configuração de autenticação
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Rate limiting simples
request_counts = defaultdict(list)
RATE_LIMIT_WINDOW = 60  # 60 segundos
RATE_LIMIT_MAX_REQUESTS = 100  # 100 requests por minuto
LOGIN_RATE_LIMIT_MAX = 5  # 5 tentativas de login por minuto


class JWTAuthService(AuthService):
    """Implementação do serviço de autenticação usando JWT."""
    
    def hash_password(self, password: str) -> str:
        return pwd_context.hash(password)
    
    def verify_password(self, plain: str, hashed: str) -> bool:
        return pwd_context.verify(plain, hashed)
    
    def create_token(self, user: User) -> str:
        """Cria um token JWT."""
        to_encode = {"sub": user.username}
        expire = brasilia_now() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt
    
    def verify_token(self, token: str) -> str:
        """Verifica um token JWT."""
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            username: str = payload.get("sub")
            if username is None:
                return None
            return username
        except JWTError:
            return None


async def get_current_user(token: str = Depends(oauth2_scheme)):
    """Dependency para obter usuário atual a partir do token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise HTTPException(401, "Token inválido")
    except JWTError as e:
        raise HTTPException(401, "Token inválido")

    # Aqui você precisaria injetar o repositório de usuários
    # Por enquanto, retornamos apenas o username
    return username


def check_rate_limit(client_ip: str, current_time: float):
    """Verifica rate limiting para um IP."""
    # Limpar requests antigos
    request_counts[client_ip] = [
        req_time
        for req_time in request_counts[client_ip]
        if current_time - req_time < RATE_LIMIT_WINDOW
    ]

    # Verificar limite
    if len(request_counts[client_ip]) >= RATE_LIMIT_MAX_REQUESTS:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    # Adicionar request atual
    request_counts[client_ip].append(current_time)


def check_login_rate_limit(client_ip: str, current_time: float):
    """Verifica rate limiting específico para login."""
    # Limpar tentativas antigas
    login_attempts = [
        attempt_time
        for attempt_time in request_counts.get(f"login_{client_ip}", [])
        if current_time - attempt_time < RATE_LIMIT_WINDOW
    ]

    # Verificar limite de tentativas de login
    if len(login_attempts) >= LOGIN_RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=429, detail="Too many login attempts. Try again later."
        )

    # Adicionar tentativa
    if f"login_{client_ip}" not in request_counts:
        request_counts[f"login_{client_ip}"] = []
    request_counts[f"login_{client_ip}"].append(current_time)
