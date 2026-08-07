from abc import ABC, abstractmethod
from typing import Optional, List
from ..entities.user import User


class UserRepository(ABC):
    """Interface para repositório de usuários."""
    
    @abstractmethod
    async def create(self, user: User) -> User:
        """Cria um novo usuário."""
        pass
    
    @abstractmethod
    async def find_by_username(self, username: str) -> Optional[User]:
        """Busca usuário por username."""
        pass
    
    @abstractmethod
    async def find_by_email(self, email: str) -> Optional[User]:
        """Busca usuário por email."""
        pass
    
    @abstractmethod
    async def find_all(self) -> List[User]:
        """Busca todos os usuários."""
        pass
