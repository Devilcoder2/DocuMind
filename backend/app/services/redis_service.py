# pyrefly: ignore [missing-import]
import redis 
from app.config import settings

class RedisService: 
    def __init__(self): 
        self.pool = redis.ConnectionPool.from_url(
            settings.REDIS_URL,
            decode_responses = True
        )
    
    @property
    def client(self) -> redis.Redis: 
        return redis.Redis(connection_pool = self.pool)

    def ping(self) -> bool: 
        try: 
            return self.client.ping()
        except redis.ConnectionError: 
            return False

redis_service = RedisService()