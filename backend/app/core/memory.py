import json
from typing import List, Dict
from app.services.redis_service import redis_service

class RedisChatMemory: 
    def __init__(self, session_id: str, ttl_seconds: int = 7200): 
        self.session_id = session_id
        self.redis_key = f"chat_history:{session_id}"
        self.ttl = ttl_seconds
        self.r = redis_service.client
    
    def add_message(self, role: str, content: str): 
        message_data = {"role": role, "content": content}

        serialized_msg = json.dumps(message_data)

        self.r.rpush(self.redis_key, serialized_msg)
        self.r.expire(self.redis_key, self.ttl)

    def get_messages(self) -> List[Dict[str, str]]: 
        searlized_messages = self.r.lrange(self.redis_key, 0, -1)

        messages = []
        for msg in searlized_messages: 
            messages.append(json.loads(msg))
        
        return messages
    
    def clear(self): 
        self.r.delete(self.redis_key)