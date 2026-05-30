# pyrefly: ignore [missing-import]
from fastapi import Request, HTTPException, status
from app.services.redis_service import redis_service

async def rate_limit(request: Request): 
    client_ip = request.client.host
    redis_key = f"rate_limit:{client_ip}"

    r = redis_service.client

    current_requests = r.incr(redis_key)
    
    if current_requests == 1: 
        r.expire(redis_key, 60)

    if current_requests > 10: 
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, 
        detail="Rate limit exceeded. Maximum 10 queries per minture allowed."
        )