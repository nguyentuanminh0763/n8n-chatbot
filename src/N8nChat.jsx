import { useState } from "react";

function N8nChat() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Xin chào, mình là trợ lý FitLink. Bạn cần hỗ trợ gì?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    const url = import.meta.env.VITE_N8N_CHAT_URL;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
        }),
      });

      const data = await res.json();

      const reply =
        data.output || "Xin lỗi, hiện mình không nhận được phản hồi từ AI.";

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply },
      ]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Có lỗi kết nối tới server, thử lại sau nhé.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat-shell">
      <header className="chat-header">
        <div className="chat-header-main">
          <div className="chat-logo">F</div>
          <div>
            <div className="chat-title">FitLink Assistant</div>
            <div className="chat-subtitle">
              Luôn sẵn sàng hỗ trợ về sức khỏe &amp; gym
            </div>
          </div>
        </div>

        <div className="chat-status">
          <span className="chat-status-dot" />
          <span>Online</span>
        </div>
      </header>

      <main className="chat-body">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`message-row ${
              m.role === "user"
                ? "message-row--user"
                : "message-row--assistant"
            }`}
          >
            {m.role === "assistant" && (
              <div className="avatar avatar--assistant">F</div>
            )}
            <div
              className={`message-bubble ${
                m.role === "user"
                  ? "message-bubble--user"
                  : "message-bubble--assistant"
              }`}
            >
              {m.content}
            </div>
            {m.role === "user" && (
              <div className="avatar avatar--user">Bạn</div>
            )}
          </div>
        ))}

        {loading && (
          <div className="typing-indicator">
            <span />
            <span />
            <span />
            <span className="typing-text">Đang trả lời...</span>
          </div>
        )}
      </main>

      <footer className="chat-footer">
        <div className="input-wrapper">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nhập câu hỏi về FitLink, sức khỏe, gym..."
            className="chat-input"
          />
        </div>
        <button
          onClick={sendMessage}
          disabled={loading}
          className="chat-send-btn"
        >
          {loading ? "..." : "Gửi"}
        </button>
      </footer>
    </div>
  );
}

export default N8nChat;
