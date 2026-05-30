# pyrefly: ignore [missing-import]
from app.services.rag_service import rag_service
import time
from app.core.memory import RedisChatMemory
from app.api.dependencies import rate_limit
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends
# pyrefly: ignore [missing-import]
from pydantic import BaseModel, Field
from typing import List, Optional

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

    return ChatResponse(
        answer=answer,
        citations=[Citation(**c) for c in citations],
        latency_ms=round(latency_ms, 2),
        cached=False
    )