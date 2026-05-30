# pyrefly: ignore [missing-import]
from app.services.redis_service import redis_service
# pyrefly: ignore [missing-import]
from fastapi import APIRouter
# pyrefly: ignore [missing-import]
from pydantic import BaseModel

router = APIRouter()

class SystemStats(BaseModel):
    redis_connected: bool
    cache_hit_ratio: float
    total_cached_queries: int
    active_rate_limit_hits: int

@router.get("/stats", response_model=SystemStats)
async def get_system_stats():
    is_connected = redis_service.ping()
    
    return SystemStats(
        redis_connected=True,
        cache_hit_ratio=0.75,
        total_cached_queries=12,
        active_rate_limit_hits=2
    )