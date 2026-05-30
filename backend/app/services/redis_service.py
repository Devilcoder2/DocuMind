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
    
    def get_cache(self, key: str) -> str: 
        return self.client.get(key)

    def set_cache(self, key: str, value: str, ttl: int = 300): 
        self.client.set(key, value, ex=ttl)

    def invalidate_response_cache(self): 
        r = self.client
        keys = r.keys("cache:response:*")
        if keys: 
            r.delete(*keys)

redis_service = RedisService()