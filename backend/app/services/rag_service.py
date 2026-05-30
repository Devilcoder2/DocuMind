from typing import Optional
import os 
import time
from typing import List, Dict, Any, Tuple
# pyrefly: ignore [missing-import]
from fastapi import UploadFile
import json

# pyrefly: ignore [missing-import]
from langchain_community.document_loaders import PyPDFLoader, TextLoader 
# pyrefly: ignore [missing-import]
from langchain_text_splitters import RecursiveCharacterTextSplitter
# pyrefly: ignore [missing-import]
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
# pyrefly: ignore [missing-import]
from langchain_community.vectorstores import Chroma
# pyrefly: ignore [missing-import]
from langchain_community.retrievers import BM25Retriever
# pyrefly: ignore [missing-import]
from langchain.retrievers import EnsembleRetriever
# pyrefly: ignore [missing-import]
from langchain_core.prompts import ChatPromptTemplate
# pyrefly: ignore [missing-import]
from langchain_core.documents import Document
from app.config import settings 

class RAGService: 
    def __init__(self): 
        self.persist_directory = "chroma_db"
        self.cache_directory = "chroma_cache"
        self.upload_dir = "uploads"

        os.makedirs(self.upload_dir, exist_ok=True)

        self.embeddings = GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-001",
            google_api_key=settings.GEMINI_API_KEY
        )

        self.llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            temperature=0.2,
            google_api_key=settings.GEMINI_API_KEY
        )
    
    def save_upload(self, upload_file: UploadFile) -> str: 
        """Saves incoming UploadFile to local upload_dir and returns path."""

        file_path = os.path.join(self.upload_dir, upload_file.filename)

        with open(file_path, "wb") as f: 
            f.write(upload_file.file.read())
        
        return file_path
    
    def ingest_document(self, file_path: str, chunk_size: int, chunk_overlap: int) -> int: 
        """
        Loads document, splits into chunks, and saves to persistent vector db.
        Returns: Number of chunks added.
        """

        #Step-01: Load the file
        if file_path.endswith(".pdf"): 
            loader = PyPDFLoader(file_path)
            raw_docs = loader.load()
        else: 
            loader = TextLoader(file_path)
            raw_docs = loader.load()

        #Step-02: Split text into chunks 
        splitter = RecursiveCharacterTextSplitter(
            chunk_size = chunk_size,
            chunk_overlap = chunk_overlap
        )

        chunks = splitter.split_documents(raw_docs)

        #Step-03: Embed & Store the chunks 
        vectorstore = Chroma.from_documents(
            documents = chunks, 
            embedding = self.embeddings, 
            persist_directory = self.persist_directory
        )
            
        return len(chunks)
    
    def get_retriever(self, rag_mode: str, top_k: int) -> Any: 
        """
        Returns a LangChain retriever based on the requested mode:
        - 'semantic': Traditional Vector DB similarity search.
        - 'vectorless': Lexical BM25 keyword-based search.
        - 'hybrid': An ensemble that combines both vector and lexical search!
        """

        vectorstore = Chroma(
            persist_directory = self.persist_directory,
            embedding_function = self.embeddings
        )

        semantic_retriever = vectorstore.as_retriever(search_kwargs={"k": top_k})

        if rag_mode == "semantic": 
            return semantic_retriever

        all_docs = vectorstore.get()
        documents = [
            Document(page_content=text, metadata=meta)
            for text, meta in zip(all_docs["documents"], all_docs["metadatas"])
        ]

        if not documents: 
            return semantic_retriever
        
        bm25_retriever = BM25Retriever.from_documents(documents)
        bm25_retriever.k = top_k

        if rag_mode == "vectorless":
            return bm25_retriever

        if rag_mode == "hybrid":
            hybrid_retriever = EnsembleRetriever(
                retrievers = [semantic_retriever, bm25_retriever],
                weights = [0.5,0.5]
            )

            return hybrid_retriever
        
        return semantic_retriever
    
    def query(self, question: str, rag_mode: str, top_k: int, chat_history: List[Dict[str,str]]) -> Tuple[str, List[Dict[str,Any]]]: 
        """
        Retrieves context, constructs prompt with history, calls LLM, and builds citations.
        Returns: Tuple of (Answer Text, List of Citations)
        """

        # Step 1: Retrieve context chunks
        retriever = self.get_retriever(rag_mode, top_k)
        retrieved_docs = retriever.invoke(question)

        # Step 2: Format the context snippets and build citations list
        context_parts = []
        citations = []
        for doc in retrieved_docs: 
            context_parts.append(doc.page_content)

            filename = doc.metadata.get("source", "Unkown Document")
            short_filename = os.path.basename(filename)

            citations.append({
                "filename": short_filename,
                "text_chunk": doc.page_content,
                "similarity_score": doc.metadata.get("score", None)
            })

        context_text = "\n\n---\n\n".join(context_parts)

        # Step 3: Format the Chat History for the LLM
        formatted_history = ""
        for msg in chat_history[-5:]: 
            role_name = "User" if msg["role"] == "user" else "Assistant"
            formatted_history += f"{role_name}: {msg['content']}\n"
        
        # Step 4: Construct the System Prompt and invoke LLM
        system_prompt = f"""You are DocuMind, a smart AI Document Assistant.
                        Answer the user's question strictly based **only** on the retrieved document context provided below.
                        If the answer cannot be found in the context, say "I cannot find the answer in the uploaded documents." Do not make anything up.
                        ---
                        RETRIEVED CONTEXT FROM DOCUMENTS:
                        {context_text}
                        ---
                        RECENT CHAT HISTORY:
                        {formatted_history}
                    """
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "{question}")
        ])

        chain = prompt | self.llm
        response = chain.invoke({"question": question})

        return response.content, citations
    
    def check_semantic_cache(self, question: str, threshold: float = 0.18) -> Tuple[bool, Optional[str], List[Dict[str, Any]]]:
        """
        Searches the semantic cache vector database for a highly similar question.
        Returns: Tuple of (is_cache_hit, cached_answer_text, cached_citations_list)
        """
    
        if not os.path.exists(self.cache_directory): 
            return False, None, []

        try: 
            cache_db = Chroma(
                persist_directory=self.cache_directory,
                embedding_function=self.embeddings
            )

            results = cache_db.similarity_search_with_score(question, k=1)

            if results: 
                doc, score = results[0]
                print(f"DEBUG: Semantic cache nearest match distance: {score:.4f} for question: '{doc.page_content}'")

                if score <= threshold: 
                    cached_json = doc.metadata.get("cached_data")
                    if cached_json: 
                        cached_data = json.loads(cached_json)
                        return True, cached_data["answer"], cached_data["citations"]
        
        except Exception as e: 
            print(f"Error checking semantic cache: {e}")

        return False, None, []

    def set_semantic_cache(self, question: str, answer: str, citations: List[Dict[str, Any]]): 
        """Stores a question, its answer, and citations in the semantic cache database."""
        try: 
            cached_data = {
                "answer": answer,
                "citations": citations
            }
            serialized_data = json.dumps(cached_data)

            doc = Document(
                page_content=question,
                metadata={"cached_data": serialized_data}
            )

            # Check if the cache database has already been initialized on disk
            # We check for the 'chroma.sqlite3' file which indicates a healthy Chroma database
            sqlite_path = os.path.join(self.cache_directory, "chroma.sqlite3")
            
            if os.path.exists(sqlite_path):
                # Append to the existing cache database (safe and non-blocking)
                cache_db = Chroma(
                    persist_directory=self.cache_directory,
                    embedding_function=self.embeddings
                )
                cache_db.add_documents([doc])
                print(f"DEBUG: Appended question to semantic cache: '{question}'")
            else:
                # First time initialization
                Chroma.from_documents(
                    documents=[doc],
                    embedding=self.embeddings,
                    persist_directory=self.cache_directory
                )
                print(f"DEBUG: Initialized semantic cache database with question: '{question}'")
        
        except Exception as e: 
            print(f"Error writing to semantic cache: {e}")


    def invalidate_semantic_cache(self): 
        """Wipes the semantic cache directory to clear all stale queries."""
        import shutil
        if os.path.exists(self.cache_directory): 
            try: 
                shutil.rmtree(self.cache_directory)
                print("DEBUG: Semantic Cache successfully invalidated (wiped).")
            except Exception as e: 
                print(f"Error invalidating semantic cache folder: {e}")


rag_service = RAGService()

