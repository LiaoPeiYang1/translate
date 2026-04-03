from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import AuthResponse, TokenBundle, UserInfo


class AuthService:
    async def ensure_seed_user(self, session: AsyncSession) -> None:
        existing_user = await session.scalar(select(User).where(User.email == settings.seed_user_email))
        if existing_user:
            return
        session.add(
            User(
                email=settings.seed_user_email,
                name=settings.seed_user_name,
                auth_type='password',
                password_hash=hash_password(settings.seed_user_password),
                is_active=True,
            )
        )
        await session.commit()

    async def login(self, session: AsyncSession, email: str, password: str) -> AuthResponse:
        user = await session.scalar(select(User).where(User.email == email, User.is_active.is_(True)))
        if not user or not verify_password(password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='邮箱或密码错误')
        return self._build_auth_response(user)

    async def refresh(self, session: AsyncSession, refresh_token: str) -> TokenBundle:
        payload = decode_token(refresh_token, expected_type='refresh')
        user = await session.scalar(select(User).where(User.id == payload['sub'], User.is_active.is_(True)))
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='用户不存在或已停用')
        return self._build_auth_response(user).tokens

    async def handle_feishu_callback(self, session: AsyncSession, code: str) -> AuthResponse:
        if not settings.feishu_sso_enabled:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='飞书 SSO 未启用')
        email = f'{code[:8]}@feishu.local'
        user = await session.scalar(select(User).where(User.email == email))
        if not user:
            user = User(email=email, name='飞书用户', auth_type='feishu', feishu_union_id=code)
            session.add(user)
            await session.commit()
            await session.refresh(user)
        return self._build_auth_response(user)

    def _build_auth_response(self, user: User) -> AuthResponse:
        expires_at = int(datetime.now(timezone.utc).timestamp()) + settings.access_token_expire_seconds
        return AuthResponse(
            user=UserInfo(id=user.id, name=user.name, email=user.email, avatar=user.avatar_url),
            tokens=TokenBundle(
                access_token=create_access_token(user.id),
                refresh_token=create_refresh_token(user.id),
                expires_at=expires_at,
            ),
        )


auth_service = AuthService()
