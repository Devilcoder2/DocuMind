# pyrefly: ignore [missing-import]
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    APP_NAME: str = "DocuMind API"
    DEBUG: bool = True
    REDIS_URL: str = "redis://localhost:6379/0"
    GEMINI_API_KEY: str = ""

    # Look for a .env file relative to this script, ignore extra values
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
