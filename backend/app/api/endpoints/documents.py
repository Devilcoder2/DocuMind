# pyrefly: ignore [missing-import]
from fastapi import APIRouter, UploadFile, File, Form, HTTPException 
from app.services.rag_service import rag_service
from app.services.redis_service import redis_service
from typing import List
# pyrefly: ignore [missing-import]
from pydantic import BaseModel
import os

router = APIRouter()

class DocumentMetaData(BaseModel):
    filename: str
    content_type: str
    chunk_count: int
    size_bytes: int

@router.post("/upload", response_model=DocumentMetaData)
async def upload_document(
    file: UploadFile = File(...),
    chunk_size: int = Form(500),
    chunk_overlap: int = Form(50)
): 
    if not file.filename.endswith(('.pdf', '.txt', '.md')): 
        raise HTTPException(status_code=400, detail="Unsupported file format.")
    
    #Save upload to disk
    file_path = rag_service.save_upload(file)

    #Ingest Document (loads, splits, embeds & save)
    chunk_count = rag_service.ingest_document(file_path, chunk_size, chunk_overlap)

    #Read size for response metadata
    size_bytes = os.path.getsize(file_path)

    #Clear the cache since the document knowledge base has updated 
    rag_service.invalidate_semantic_cache()

    
    return DocumentMetaData(
        filename=file.filename,
        content_type=file.content_type,
        chunk_count=chunk_count,
        size_bytes=size_bytes
    )


@router.get("/", response_model=List[str])
async def list_documents():
    if not os.path.exists("uploads"):
        return []
    return os.listdir("uploads")