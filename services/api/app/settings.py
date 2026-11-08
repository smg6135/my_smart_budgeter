import os
from pathlib import Path
from dataclasses import dataclass


def secret(name: str) -> str:
    path = os.getenv(name + "_FILE")
    return Path(path).read_text().strip() if path else os.getenv(name, "")


@dataclass
class Settings:
    environment: str
    project: str
    redis_url: str
    litellm_url: str
    litellm_key: str
    region: str
    daily_units: int
    enabled_tasks: frozenset[str]

    @classmethod
    def load(cls):
        s = cls(
            os.getenv("APP_ENV", "production"),
            os.getenv("GOOGLE_CLOUD_PROJECT", ""),
            os.getenv("REDIS_URL", "redis://redis:6379/0"),
            os.getenv("LITELLM_URL", "http://litellm:4000"),
            secret("LITELLM_MASTER_KEY"),
            os.getenv("SERVICE_REGION", "local"),
            int(os.getenv("AI_DAILY_UNITS", "300")),
            frozenset(
                os.getenv(
                    "AI_ENABLED_TASKS", "ocr-bulk,ocr-single,planning,conversation"
                ).split(",")
            ),
        )
        if s.environment not in ("development", "test", "production"):
            raise RuntimeError("Invalid APP_ENV")
        if s.environment == "production":
            if not s.project or not s.litellm_key:
                raise RuntimeError("Project and server AI credentials are required")
            if os.getenv("FIREBASE_AUTH_EMULATOR_HOST") or os.getenv(
                "FIRESTORE_EMULATOR_HOST"
            ):
                raise RuntimeError("Auth emulator is forbidden in production")
            if not s.litellm_url.startswith(
                ("http://litellm:", "http://litellm.", "https://")
            ):
                raise RuntimeError("Invalid private AI gateway")
        return s
