from abc import ABC, abstractmethod
from typing import List
from ..entities.log import Log


class LogRepository(ABC):
    """Interface para repositório de logs."""
    
    @abstractmethod
    async def create(self, log: Log) -> Log:
        """Cria um novo log."""
        pass
    
    @abstractmethod
    async def find_recent(self, limit: int = 100) -> List[Log]:
        """Busca logs recentes."""
        pass
    
    @abstractmethod
    async def find_all(self) -> List[Log]:
        """Busca todos os logs."""
        pass
