import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  Upload,
  Settings,
  RefreshCw,
  Cpu,
  Database,
  Award,
  MessageSquare,
  FileText,
  CheckCircle,
  HelpCircle,
  HardDrive,
  Play,
  Sparkles,
  Zap,
  Clock,
  ShieldAlert,
  Terminal,
  Globe,
} from "lucide-react";


const BACKEND_URL = import.meta.env.PROD
  ? "https://documind-backend-qm5b.onrender.com"
  : "http://127.0.0.1:8000";

function App() {
  const [view, setView] = useState("home");
  const [sessionId] = useState(
    () => `session_${Math.random().toString(36).substring(2, 9)}`,
  );

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hi! I am DocuMind, your intelligent RAG assistant. Upload a text, markdown, or PDF file, adjust your RAG parameters, and ask me anything!",
      citations: [],
      latency_ms: null,
      cached: false,
    },
  ]);
  const [query, setQuery] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  const [ragMode, setRagMode] = useState("semantic");
  const [topK, setTopK] = useState(3);
  const [chunkSize, setChunkSize] = useState(500);
  const [chunkOverlap, setChunkOverlap] = useState(50);

  const [stats, setStats] = useState({
    redis_connected: false,
    cache_hit_ratio: 0.0,
    total_cached_queries: 0,
    active_rate_limit_hits: 0,
  });

  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/system/stats`);
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (err) {
        console.error("Failed to fetch system stats", err);
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/documents/`);
      if (response.ok) {
        const data = await response.json();
        setUploadedDocs(data);
      }
    } catch (err) {
      console.error("Failed to fetch document list", err);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("chunk_size", chunkSize);
    formData.append("chunk_overlap", chunkOverlap);

    try {
      const response = await fetch(`${BACKEND_URL}/api/documents/upload`, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        alert(
          `Successfully ingested file! Generated ${data.chunk_count} chunks.`,
        );
        fetchDocuments();
      } else {
        const errData = await response.json();
        alert(`Upload failed: ${errData.detail || "Unsupported format"}`);
      }
    } catch (err) {
      alert("Error uploading file: Server is down or unreachable.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!query.trim() || isSending) return;

    const userMessage = { role: "user", content: query };
    setMessages((prev) => [...prev, userMessage]);
    setQuery("");
    setIsSending(true);

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: query,
          session_id: sessionId,
          rag_mode: ragMode,
          top_k: topK,
          chunk_size: chunkSize,
          chunk_overlap: chunkOverlap,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            citations: data.citations,
            latency_ms: data.latency_ms,
            cached: data.cached,
          },
        ]);
      } else if (response.status === 429) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "⚠️ Rate limit exceeded. (FastAPI + Redis limit: Max 10 queries per minute allowed to prevent spam). Please wait 60 seconds.",
            citations: [],
            latency_ms: 0,
            cached: false,
          },
        ]);
      } else {
        throw new Error("Chat failed");
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "⚠️ Server connection lost. Please ensure your FastAPI backend is running.",
          citations: [],
          latency_ms: 0,
          cached: false,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  if (view === "home") {
    return (
      <div className="home-container">
        <header className="home-header">
          <div className="brand" style={{ borderBottom: "none", paddingBottom: 0 }}>
            <Cpu className="icon-glow" size={32} />
            <span style={{ fontSize: "1.75rem" }}>DocuMind</span>
          </div>
          <div className="social-links">
            <a
              href="https://github.com/Devilcoder2/DocuMind"
              target="_blank"
              rel="noopener noreferrer"
              className="social-btn"
            >
              <svg
                stroke="currentColor"
                fill="currentColor"
                strokeWidth="0"
                viewBox="0 0 24 24"
                height="16"
                width="16"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"></path>
              </svg>
              <span>GitHub</span>
            </a>
            <a
              href="https://www.linkedin.com/in/ramandeep-singh-3b6560249/"
              target="_blank"
              rel="noopener noreferrer"
              className="social-btn"
            >
              <svg
                stroke="currentColor"
                fill="currentColor"
                strokeWidth="0"
                viewBox="0 0 24 24"
                height="16"
                width="16"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"></path>
              </svg>
              <span>LinkedIn</span>
            </a>
          </div>
        </header>

        <section className="hero-section">
          <div className="hero-glow"></div>
          <h1 className="hero-title">DocuMind</h1>
          <p className="hero-subtitle">
            A production-grade Document Search & Hybrid RAG Engine powered by Google Gemini,
            FastAPI, and Serverless Redis. Upload files, customize retrieval rules, and explore citations with sub-millisecond semantic caching.
          </p>
          <button className="launch-btn" onClick={() => setView("app")}>
            <span>Launch RAG Console</span>
            <Play size={18} fill="currentColor" />
          </button>
        </section>

        <h2 className="grid-title">Architectural Features</h2>
        <div className="feature-grid">
          <div className="card-item">
            <div className="card-header-icon color-cyan">
              <Sparkles size={24} />
            </div>
            <h4>Hybrid Search (RRF)</h4>
            <p>
              Fuses dense vector representations (ChromaDB + Gemini Embeddings) with sparse keyword indices (Rank-BM25) via a custom weighted Ensemble re-ranking strategy.
            </p>
          </div>

          <div className="card-item">
            <div className="card-header-icon">
              <Zap size={24} />
            </div>
            <h4>Semantic Vector Cache</h4>
            <p>
              Custom vector-based caching that maps query intent under a mathematical similarity distance threshold. Reduces redundant LLM search latencies to under 1 millisecond.
            </p>
          </div>

          <div className="card-item">
            <div className="card-header-icon color-purple">
              <MessageSquare size={24} />
            </div>
            <h4>Stateful Redis Memory</h4>
            <p>
              Maintains isolated chat sessions mapped as Redis Lists directly on Upstash Serverless Redis. Features automatic 2-hour rolling session cache expiration.
            </p>
          </div>

          <div className="card-item">
            <div className="card-header-icon color-emerald">
              <ShieldAlert size={24} />
            </div>
            <h4>Distributed Rate Limiting</h4>
            <p>
              Secures backend API routes and LLM contexts using client-IP rate counters inside Upstash Redis. Capped at 10 requests per minute with active 429 notifications.
            </p>
          </div>

          <div className="card-item">
            <div className="card-header-icon">
              <RefreshCw size={24} />
            </div>
            <h4>Active Invalidation</h4>
            <p>
              Automates background response cache cleanups whenever a new document is ingested. Keeps LLM context strictly current and prevents silent document hallucinations.
            </p>
          </div>

          <div className="card-item">
            <div className="card-header-icon color-cyan">
              <Settings size={24} />
            </div>
            <h4>Granular Console Controls</h4>
            <p>
              Enables real-time modification of document ingestion chunk sizes, overlaps, top-K chunk retrieval, and retrieval algorithms directly from the workspace dashboard.
            </p>
          </div>
        </div>

        <h2 className="grid-title">The Tech Stack</h2>
        <div className="tech-grid">
          <div className="card-item">
            <div className="card-header-icon color-cyan">
              <Globe size={24} />
            </div>
            <h4>React & Vite Frontend</h4>
            <p>
              Ultra-responsive SPA structured with gorgeous dark glassmorphism styling, polling status controllers, and visual citations explorer.
            </p>
            <div className="tech-tag-container">
              <span className="tech-tag">Vite</span>
              <span className="tech-tag">React 19</span>
              <span className="tech-tag">Glassmorphic CSS</span>
              <span className="tech-tag">Lucide Icons</span>
            </div>
          </div>

          <div className="card-item">
            <div className="card-header-icon">
              <Terminal size={24} />
            </div>
            <h4>FastAPI Gateway</h4>
            <p>
              Asynchronous ASGI Python gateway handling upload routing, Pydantic schemas validation, dynamic cache invalidations, and system statistics logs.
            </p>
            <div className="tech-tag-container">
              <span className="tech-tag">Python 3.12</span>
              <span className="tech-tag">FastAPI</span>
              <span className="tech-tag">Pydantic v2</span>
              <span className="tech-tag">Uvicorn</span>
            </div>
          </div>

          <div className="card-item">
            <div className="card-header-icon color-purple">
              <Cpu size={24} />
            </div>
            <h4>Google Gemini AI</h4>
            <p>
              Advanced generative model integrations utilizing Google AI Studio credentials for conceptual document answers and high-fidelity embed mappings.
            </p>
            <div className="tech-tag-container">
              <span className="tech-tag">gemini-2.5-flash</span>
              <span className="tech-tag">gemini-embedding-001</span>
              <span className="tech-tag">LangChain</span>
            </div>
          </div>

          <div className="card-item">
            <div className="card-header-icon color-emerald">
              <Database size={24} />
            </div>
            <h4>ChromaDB & BM25</h4>
            <p>
              Enables dual retrieval tracks. Stores vectorized document embeddings in isolated persistent collections alongside statistical lexical search indexes.
            </p>
            <div className="tech-tag-container">
              <span className="tech-tag">ChromaDB</span>
              <span className="tech-tag">Rank-BM25</span>
              <span className="tech-tag">EnsembleRetriever</span>
            </div>
          </div>

          <div className="card-item">
            <div className="card-header-icon">
              <HardDrive size={24} />
            </div>
            <h4>Upstash Redis</h4>
            <p>
              Serverless, secure TLS-bound database managing fast deterministic caching, sliding window client-IP limits, and thread chat list memories.
            </p>
            <div className="tech-tag-container">
              <span className="tech-tag">Upstash Serverless</span>
              <span className="tech-tag">Redis Lists</span>
              <span className="tech-tag">Rate Limiting</span>
              <span className="tech-tag">Response Cache</span>
            </div>
          </div>
        </div>

        <footer className="home-footer">
          <p>
            DocuMind RAG Project | Designed and Developed by{" "}
            <a
              href="https://www.linkedin.com/in/ramandeep-singh-3b6560249/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Ramandeep Singh
            </a>
          </p>
          <p style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
            Source code licensed under MIT. View on{" "}
            <a
              href="https://github.com/Devilcoder2/DocuMind"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            .
          </p>
        </footer>
      </div>
    );
  }

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="brand">
          <Cpu className="icon-glow" size={28} />
          <span>DocuMind</span>
        </div>

        <div className="panel-section">
          <h3>Ingestion Settings</h3>
          <div className="slider-group">
            <div className="slider-label">
              <span>Chunk Size</span>
              <span>{chunkSize} tokens</span>
            </div>
            <input
              type="range"
              min="100"
              max="1500"
              step="50"
              value={chunkSize}
              onChange={(e) => setChunkSize(parseInt(e.target.value))}
            />

            <div className="slider-label" style={{ marginTop: "0.5rem" }}>
              <span>Chunk Overlap</span>
              <span>{chunkOverlap} tokens</span>
            </div>
            <input
              type="range"
              min="10"
              max="300"
              step="10"
              value={chunkOverlap}
              onChange={(e) => setChunkOverlap(parseInt(e.target.value))}
            />
          </div>
        </div>

        <div className="panel-section">
          <h3>Knowledge Base</h3>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={handleFileUpload}
            accept=".pdf,.txt,.md"
          />
          <div
            className="upload-card"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={24} style={{ color: "var(--accent-indigo)" }} />
            <p>
              {isUploading ? "Ingesting document..." : "Upload PDF, TXT, or MD"}
            </p>
          </div>

          <div
            style={{
              marginTop: "0.5rem",
              maxHeight: "100px",
              overflowY: "auto",
            }}
          >
            {uploadedDocs.map((doc, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  gap: "8px",
                  fontSize: "0.8rem",
                  color: "var(--text-secondary)",
                  padding: "4px 0",
                }}
              >
                <FileText size={14} style={{ color: "var(--accent-cyan)" }} />
                <span>{doc}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-section">
          <h3>Retrieval Parameters</h3>
          <div className="slider-group" style={{ marginBottom: "0.75rem" }}>
            <div className="slider-label">
              <span>Top-K Chunks</span>
              <span>{topK} Chunks</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={topK}
              onChange={(e) => setTopK(parseInt(e.target.value))}
            />
          </div>

          <div className="toggle-group">
            <button
              className={`toggle-btn ${ragMode === "semantic" ? "active" : ""}`}
              onClick={() => setRagMode("semantic")}
            >
              Semantic
            </button>
            <button
              className={`toggle-btn ${ragMode === "vectorless" ? "active" : ""}`}
              onClick={() => setRagMode("vectorless")}
            >
              Keyword
            </button>
            <button
              className={`toggle-btn ${ragMode === "hybrid" ? "active" : ""}`}
              onClick={() => setRagMode("hybrid")}
            >
              Hybrid
            </button>
          </div>
        </div>

        <div className="panel-section" style={{ marginTop: "auto" }}>
          <h3>Redis Dashboard</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-title">Status</span>
              <span
                className="stat-value"
                style={{
                  color: stats.redis_connected
                    ? "var(--accent-emerald)"
                    : "#ef4444",
                }}
              >
                {stats.redis_connected ? "CONNECTED" : "DISCONNECTED"}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-title">Cache Hit Ratio</span>
              <span
                className="stat-value"
                style={{ color: "var(--accent-cyan)" }}
              >
                {Math.round(stats.cache_hit_ratio * 100)}%
              </span>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-chat">
        <div className="chat-messages">
          {messages.map((msg, index) => (
            <div key={index} className={`message-wrapper ${msg.role}`}>
              <div className="message-bubble">
                {msg.content}

                {msg.citations && msg.citations.length > 0 && (
                  <div className="citations-container">
                    {msg.citations.map((cite, cIdx) => (
                      <div
                        key={cIdx}
                        className="citation-tag"
                        onClick={() =>
                          alert(
                            `[CITATIONS EXCERPT]\nFile: ${cite.filename}\n\n"${cite.text_chunk}"`,
                          )
                        }
                      >
                        <FileText size={12} />
                        <span>
                          Source {cIdx + 1}: {cite.filename}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {typeof msg.latency_ms === "number" && (
                <div className="latency-badge">
                  <span>Speed: {msg.latency_ms.toFixed(1)} ms</span>
                  {msg.cached && (
                    <span className="cached">
                      ⚡ SERVED FROM REDIS RESPONSE CACHE
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="chat-input-bar">
          <input
            type="text"
            className="input-field"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type your document query here..."
            disabled={isSending}
          />
          <button type="submit" className="send-btn" disabled={isSending}>
            <span>Send</span>
            <Send size={16} />
          </button>
        </form>
      </main>
    </div>
  );
}

export default App;
