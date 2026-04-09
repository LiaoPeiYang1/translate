from datetime import datetime, timezone

from app.config import settings
from app.core.security import create_access_token, create_refresh_token
from app.models.user import User
from app.schemas.auth import AuthResponse, TokenBundle, UserInfo


class AuthCommonService:
    def is_feishu_enabled(self) -> bool:
        return bool(
            settings.feishu_sso_enabled
            and settings.feishu_client_id
            and settings.feishu_client_secret
        )

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
