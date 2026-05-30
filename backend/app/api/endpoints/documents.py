# pyrefly: ignore [missing-import]
from fastapi import APIRouter, UploadFile, File, Form, HTTPException 
from typing import List
# pyrefly: ignore [missing-import]
from pydantic import BaseModel

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
    
    return DocumentMetaData(
        filename=file.filename,
        content_type=file.content_type,
        chunk_count=10,
        size_bytes=1024
    )


@router.get("/", response_model=List[str])
async def list_documents():
    return ["sameple_redis_docs.pdf", "fastapi_guide.md"]