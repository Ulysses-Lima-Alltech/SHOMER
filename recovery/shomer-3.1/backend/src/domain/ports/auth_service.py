from abc import ABC, abstractmethod
from typing import Optional
from ..entities.user import User


class AuthService(ABC):
    """Interface para serviço de autenticação."""
    
    @abstractmethod
    def hash_password(self, password: str) -> str:
        """Gera hash da senha."""
        pass
    
    @abstractmethod
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verifica se a senha está correta."""
        pass
    
    @abstractmethod
    def create_token(self, user: User) -> str:
        """Cria token JWT para o usuário."""
        pass
    
    @abstractmethod
    def verify_token(self, token: str) -> Optional[str]:
        """Verifica e retorna o username do token."""
        pass
