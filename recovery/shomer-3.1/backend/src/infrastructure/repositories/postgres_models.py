from sqlalchemy import Column, String, DateTime, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB
from .postgres_repository import Base


class UserModel(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    username = Column(String(150), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False)


class LogModel(Base):
    __tablename__ = "logs"

    id = Column(String, primary_key=True)
    timestamp = Column(DateTime, nullable=False, index=True)
    count = Column(Integer, nullable=False)
    details = Column(JSONB, nullable=False)
    created_at = Column(DateTime, nullable=False)
    user = Column(String, nullable=True, index=True)


