from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    app_name: str = '医药翻译'
    api_prefix: str = '/api'

    database_url: str = 'sqlite+aiosqlite:///./medical_translate.db'
    jwt_secret_key: str = 'change-me'
    access_token_expire_seconds: int = 60 * 60
    refresh_token_expire_seconds: int = 60 * 60 * 24 * 7

    file_retention_days: int = 30
    file_chunk_size: int = 5 * 1024 * 1024
    file_max_size_mb: int = 100
    storage_root: str = './storage'

    feishu_sso_enabled: bool = False
    feishu_client_id: str = ''
    feishu_client_secret: str = ''

    dashscope_api_key: str = ''
    dashscope_base_url: str = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    dashscope_model: str = 'qwen-turbo-latest'

    seed_user_email: str = 'demo@example.com'
    seed_user_name: str = '演示用户'
    seed_user_password: str = 'Passw0rd1'

    @property
    def storage_path(self) -> Path:
        return Path(self.storage_root).resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
