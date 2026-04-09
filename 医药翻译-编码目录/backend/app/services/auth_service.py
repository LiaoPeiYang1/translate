from .auth_feishu_service import FeishuAuthService
from .auth_password_service import PasswordAuthService


class AuthService(PasswordAuthService, FeishuAuthService):
    pass


auth_service = AuthService()
