# pyrefly: ignore [missing-import]
from fastapi import FastAPI
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api.endpoints import chat, documents, system

app = FastAPI(
    title=settings.APP_NAME,
    description="DocuMind - Advanced RAG & Redis learning codebase",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For local development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register endpoint routers
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])
app.include_router(documents.router, prefix="/api/documents", tags=["Documents"])
app.include_router(system.router, prefix="/api/system", tags=["System"])

@app.get("/")
async def root():
    return {"message": f"Welcome to {settings.APP_NAME}", "debug_mode": settings.DEBUG}