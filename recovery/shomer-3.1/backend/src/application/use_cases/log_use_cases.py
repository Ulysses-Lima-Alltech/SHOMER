from typing import List
from ...domain.ports.log_repository import LogRepository
from ...domain.entities.log import Log
from ..dto.models import LogModel, LogOutModel


class CreateLogUseCase:
    """Caso de uso para criação de log."""
    
    def __init__(self, log_repository: LogRepository):
        self.log_repository = log_repository
    
    async def execute(self, data: LogModel, user: str) -> dict:
        """Executa a criação de log."""
        # Criar entidade Log
        log = Log(
            timestamp=data.timestamp,
            count=data.count,
            details=data.details,
            user=user
        )
        
        # Salvar no repositório
        created_log = await self.log_repository.create(log)
        
        return {"msg": "Log registrado"}


class GetLogsUseCase:
    """Caso de uso para buscar logs."""
    
    def __init__(self, log_repository: LogRepository):
        self.log_repository = log_repository
    
    async def execute(self, limit: int = 100) -> List[LogOutModel]:
        """Executa a busca de logs."""
        logs = await self.log_repository.find_recent(limit)
        
        return [LogOutModel(**log.dict()) for log in logs]
