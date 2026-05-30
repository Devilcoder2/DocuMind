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
} from "lucide-react";

const BACKEND_URL = import.meta.env.PROD
  ? "https://documind-backend-qm5b.onrender.com"
  : "http://127.0.0.1:8000";

function App() {
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
