from typing import List
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from ...domain.ports.log_repository import LogRepository
from ...domain.entities.log import Log
from .postgres_repository import get_session
from .postgres_models import LogModel
import uuid


class PostgresLogRepository(LogRepository):
    async def create(self, log: Log) -> Log:
        async for session in get_session():  # type: AsyncSession
            model = LogModel(
                id=str(uuid.uuid4()),
                timestamp=log.timestamp,
                count=log.count,
                details=dict(log.details or {}),
                user=log.user,
                created_at=log.created_at,
            )
            session.add(model)
            await session.commit()
            log.id = model.id
            return log

    async def find_recent(self, limit: int = 100) -> List[Log]:
        async for session in get_session():  # type: AsyncSession
            stmt = select(LogModel).order_by(desc(LogModel.timestamp)).limit(limit)
            res = await session.execute(stmt)
            rows = res.scalars().all()
            return [
                Log(
                    id=r.id,
                    timestamp=r.timestamp,
                    count=r.count,
                    details=r.details,
                    user=r.user,
                    created_at=r.created_at,
                )
                for r in rows
            ]

    async def find_all(self) -> List[Log]:
        async for session in get_session():  # type: AsyncSession
            stmt = select(LogModel)
            res = await session.execute(stmt)
            rows = res.scalars().all()
            return [
                Log(
                    id=r.id,
                    timestamp=r.timestamp,
                    count=r.count,
                    details=r.details,
                    user=r.user,
                    created_at=r.created_at,
                )
                for r in rows
            ]


