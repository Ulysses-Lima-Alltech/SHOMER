from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from ...domain.ports.user_repository import UserRepository
from ...domain.entities.user import User
from .postgres_repository import get_session
from .postgres_models import UserModel
from datetime import datetime
import uuid


class PostgresUserRepository(UserRepository):
    async def create(self, user: User) -> User:
        async for session in get_session():  # type: AsyncSession
            model = UserModel(
                id=str(uuid.uuid4()),
                username=user.username,
                email=user.email,
                password_hash=user.password_hash,
                created_at=user.created_at if user.created_at else datetime.now(),
            )
            session.add(model)
            await session.commit()
            user.id = model.id
            return user

    async def find_by_username(self, username: str) -> Optional[User]:
        async for session in get_session():  # type: AsyncSession
            stmt = select(UserModel).where(UserModel.username == username)
            res = await session.execute(stmt)
            row = res.scalar_one_or_none()
            if not row:
                return None
            return User(
                id=row.id,
                username=row.username,
                email=row.email,
                password_hash=row.password_hash,
                created_at=row.created_at,
            )

    async def find_by_email(self, email: str) -> Optional[User]:
        async for session in get_session():  # type: AsyncSession
            stmt = select(UserModel).where(UserModel.email == email)
            res = await session.execute(stmt)
            row = res.scalar_one_or_none()
            if not row:
                return None
            return User(
                id=row.id,
                username=row.username,
                email=row.email,
                password_hash=row.password_hash,
                created_at=row.created_at,
            )

    async def find_all(self) -> List[User]:
        async for session in get_session():  # type: AsyncSession
            stmt = select(UserModel)
            res = await session.execute(stmt)
            rows = res.scalars().all()
            return [
                User(
                    id=r.id,
                    username=r.username,
                    email=r.email,
                    password_hash=r.password_hash,
                    created_at=r.created_at,
                )
                for r in rows
            ]


