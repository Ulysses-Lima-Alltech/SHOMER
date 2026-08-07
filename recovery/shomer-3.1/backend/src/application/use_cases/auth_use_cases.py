from typing import Optional
from ...domain.ports.user_repository import UserRepository
from ...domain.ports.auth_service import AuthService
from ...domain.entities.user import User
from ..dto.models import RegisterModel, LoginModel, Token


class RegisterUserUseCase:
    """Caso de uso para registro de usuário."""
    
    def __init__(self, user_repository: UserRepository, auth_service: AuthService):
        self.user_repository = user_repository
        self.auth_service = auth_service
    
    async def execute(self, data: RegisterModel, invitation_token: str) -> dict:
        """Executa o registro de usuário."""
        # Validar token de convite
        if data.invitationToken != invitation_token:
            raise ValueError("Token de convite inválido")
        
        # Verificar se usuário já existe
        existing_user = await self.user_repository.find_by_username(data.username)
        if existing_user:
            raise ValueError("Usuário já existe")
        
        # Criar hash da senha
        password_hash = self.auth_service.hash_password(data.password)
        
        # Criar entidade User
        user = User(
            username=data.username,
            email=data.email,
            password_hash=password_hash
        )
        
        # Salvar no repositório
        created_user = await self.user_repository.create(user)
        
        return {"msg": "Registrado com sucesso"}


class LoginUserUseCase:
    """Caso de uso para login de usuário."""
    
    def __init__(self, user_repository: UserRepository, auth_service: AuthService):
        self.user_repository = user_repository
        self.auth_service = auth_service
    
    async def execute(self, data: LoginModel) -> Token:
        """Executa o login do usuário."""
        # Verificar se é email ou username
        is_email = "@" in data.username
        
        if is_email:
            user = await self.user_repository.find_by_email(data.username)
        else:
            user = await self.user_repository.find_by_username(data.username)
        
        if not user or not self.auth_service.verify_password(data.password, user.password_hash):
            raise ValueError("Credenciais inválidas")
        
        # Criar token
        access_token = self.auth_service.create_token(user)
        
        return Token(
            access_token=access_token,
            token_type="bearer",
            user={
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "createdAt": user.created_at.isoformat(),
            }
        )
