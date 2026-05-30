# pyrefly: ignore [missing-import]
from app.services.redis_service import redis_service
from app.services.rag_service import rag_service
import time
from app.core.memory import RedisChatMemory
from app.api.dependencies import rate_limit
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends
# pyrefly: ignore [missing-import]
from pydantic import BaseModel, Field
from typing import List, Optional
import hashlib
import json

router = APIRouter()

class Citation(BaseModel):
    filename: str
    text_chunk: str
    similarity_score: Optional[float] = None

class ChatRequest(BaseModel): 
    question: str
    session_id: str
    rag_mode: str = Field("semantic", description="semantic | vectorless | hybrid")
    top_k : int = Field(3, ge=1, le=10)
    chunk_size: int = 500
    chunk_overlap: int = 50

class ChatResponse(BaseModel): 
    answer: str
    citations: List[Citation]
    latency_ms: float
    cached: bool 

@router.post("/", response_model=ChatResponse, dependencies=[Depends(rate_limit)])
async def chat_interaction(request: ChatRequest): 
    memory = RedisChatMemory(session_id=request.session_id)

    #Generate unique has for this query
    request_params = {
        "question": request.question,
        "rag_mode": request.rag_mode,
        "top_k": request.top_k,
        "chunk_size": request.chunk_size,
        "chunk_overlap": request.chunk_overlap
    }

    serialized_params = json.dumps(request_params, sort_keys=True)
    param_hash = hashlib.sha256(serialized_params.encode()).hexdigest()
    cache_key = f"cache:response:{param_hash}"

    cached_response = redis_service.get_cache(cache_key)
    if cached_response: 
        cached_data = json.loads(cached_response)

        memory.add_message("user", request.question)
        memory.add_message("assistant", cached_data["answer"])

        return ChatResponse(
            answer = cached_data["answer"],
            citations = [Citation(**c) for c in cached_data["citations"]],
            latency_ms = 0.5,
            cached = True
        )



    #Fetch recent chat history 
    chat_history = memory.get_messages()
    start_time = time.time()

    #Query RAG Engine 
    answer, citations = rag_service.query(
        question=request.question,
        rag_mode=request.rag_mode,
        top_k=request.top_k,
        chat_history=chat_history
    )

    latency_ms = (time.time() - start_time) * 1000

    #Save history to redis 
    memory.add_message("user", request.question)
    memory.add_message("assistant", answer)

    new_cache_data = {
        "answer": answer,
        "citations": citations
    }
    redis_service.set_cache(cache_key, json.dumps(new_cache_data), ttl=300)

    return ChatResponse(
        answer=answer,
        citations=[Citation(**c) for c in citations],
        latency_ms=round(latency_ms, 2),
        cached=False
    )