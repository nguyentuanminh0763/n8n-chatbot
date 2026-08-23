import { useEffect, useMemo, useRef, useState } from "react";
import { chatCompletion, checkKey, fetchModels, maskKey } from "./openrouter";

const STORAGE_KEYS = "or_keys";
const STORAGE_REMEMBER = "or_remember";
const STORAGE_MODEL = "or_model";

const DEFAULT_MODEL = "openai/gpt-4o-mini";

const QUICK_MODELS = [
  "openai/gpt-4o-mini",
  "anthropic/claude-3.5-haiku",
  "google/gemini-2.0-flash-001",
  "meta-llama/llama-3.3-70b-instruct",
  "deepseek/deepseek-chat",
];

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random());

const money = (n) =>
  typeof n === "number" ? `$${n.toFixed(4)}` : "—";

/** Giá OpenRouter tính theo token, quy về $/1M token cho dễ đọc. */
const pricePerMillion = (perToken) => {
  const value = perToken * 1_000_000;
  if (!value) return "free";
  return value < 1 ? `$${value.toFixed(3)}/1M` : `$${value.toFixed(2)}/1M`;
};

const MAX_VISIBLE_MODELS = 80;

function OpenRouterChat() {
  const [remember, setRemember] = useState(
    () => localStorage.getItem(STORAGE_REMEMBER) === "1"
  );
  const [keys, setKeys] = useState(() => {
    if (localStorage.getItem(STORAGE_REMEMBER) !== "1") return [];
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS) || "[]");
      return saved.map((value) => ({ id: newId(), value, status: "idle" }));
    } catch {
      return [];
    }
  });
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState("");

  const [model, setModel] = useState(
    () => localStorage.getItem(STORAGE_MODEL) || DEFAULT_MODEL
  );
  const [models, setModels] = useState([]);
  const [modelsError, setModelsError] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [modelQuery, setModelQuery] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);

  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const bodyRef = useRef(null);
  const abortRef = useRef(null);

  const activeKey = useMemo(
    () => keys.find((k) => k.id === activeId) ?? null,
    [keys, activeId]
  );

  const modelPool = useMemo(
    () =>
      models.length
        ? models
        : QUICK_MODELS.map((id) => ({
            id,
            name: id,
            promptPrice: 0,
            completionPrice: 0,
          })),
    [models]
  );

  // Lọc theo từng từ khoá rời, để gõ "claude haiku" vẫn ra kết quả.
  const filteredModels = useMemo(() => {
    const terms = modelQuery.toLowerCase().split(/\s+/).filter(Boolean);
    return modelPool.filter((m) => {
      if (freeOnly && m.promptPrice > 0) return false;
      const haystack = `${m.id} ${m.name}`.toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
  }, [modelPool, modelQuery, freeOnly]);

  // Danh sách model công khai để gợi ý trong ô nhập.
  useEffect(() => {
    const controller = new AbortController();
    fetchModels(controller.signal)
      .then(setModels)
      .catch((err) => {
        if (err.name !== "AbortError") setModelsError(err.message);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_MODEL, model);
  }, [model]);

  // Chỉ ghi key xuống localStorage khi người dùng bật "ghi nhớ".
  useEffect(() => {
    localStorage.setItem(STORAGE_REMEMBER, remember ? "1" : "0");
    if (remember) {
      localStorage.setItem(
        STORAGE_KEYS,
        JSON.stringify(keys.map((k) => k.value))
      );
    } else {
      localStorage.removeItem(STORAGE_KEYS);
    }
  }, [remember, keys]);

  useEffect(() => {
    bodyRef.current?.scrollTo({
      top: bodyRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending]);

  const patchKey = (id, patch) =>
    setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, ...patch } : k)));

  const addKeys = () => {
    const parsed = draft
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parsed.length) return;

    setKeys((prev) => {
      const existing = new Set(prev.map((k) => k.value));
      const added = parsed
        .filter((value) => !existing.has(value))
        .map((value) => ({ id: newId(), value, status: "idle" }));
      const next = [...prev, ...added];
      if (!activeId && next.length) setActiveId(next[0].id);
      return next;
    });
    setDraft("");
  };

  const removeKey = (id) => {
    setKeys((prev) => prev.filter((k) => k.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const testKey = async (item) => {
    patchKey(item.id, { status: "testing", info: null });
    const info = await checkKey(item.value);
    patchKey(item.id, { status: info.ok ? "ok" : "error", info });
    return info;
  };

  const testAll = async () => {
    for (const item of keys) {
      // Tuần tự để tránh dính rate limit chung khi có nhiều key.
      await testKey(item);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;

    if (!activeKey) {
      setMessages((prev) => [
        ...prev,
        {
          role: "system-note",
          content: "Chưa chọn API key. Thêm key rồi tick chọn key muốn dùng.",
        },
      ]);
      return;
    }

    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);

    const payload = [
      ...(systemPrompt.trim()
        ? [{ role: "system", content: systemPrompt.trim() }]
        : []),
      ...nextMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content })),
    ];

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await chatCompletion({
        key: activeKey.value,
        model,
        messages: payload,
        temperature: Number(temperature),
        signal: controller.signal,
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.content || "(model trả về nội dung rỗng)",
          meta: {
            latency: result.latency,
            modelUsed: result.modelUsed,
            usage: result.usage,
            finishReason: result.finishReason,
          },
        },
      ]);
      patchKey(activeKey.id, { status: "ok" });
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "error",
          content:
            err.name === "AbortError"
              ? "Đã huỷ yêu cầu."
              : `${err.message}${err.status ? ` (HTTP ${err.status})` : ""}`,
        },
      ]);
      if (err.name !== "AbortError") {
        patchKey(activeKey.id, {
          status: "error",
          info: { ok: false, error: err.message, status: err.status },
        });
      }
    } finally {
      abortRef.current = null;
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const statusLabel = {
    idle: "Chưa test",
    testing: "Đang test...",
    ok: "Hợp lệ",
    error: "Lỗi",
  };

  return (
    <div className="or-shell">
      <aside className="or-panel">
        <div className="or-panel-head">
          <div>
            <div className="chat-title">API key OpenRouter</div>
            <div className="chat-subtitle">
              Dán nhiều key (mỗi dòng một key) rồi test
            </div>
          </div>
        </div>

        <textarea
          className="or-textarea"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={"sk-or-v1-...\nsk-or-v1-..."}
          spellCheck={false}
        />

        <div className="or-row">
          <button className="or-btn" onClick={addKeys} disabled={!draft.trim()}>
            Thêm key
          </button>
          <button
            className="or-btn or-btn--primary"
            onClick={testAll}
            disabled={!keys.length || keys.some((k) => k.status === "testing")}
          >
            Test tất cả
          </button>
        </div>

        <label className="or-check">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span>
            Ghi nhớ key trong localStorage của trình duyệt này
          </span>
        </label>

        <div className="or-key-list">
          {!keys.length && (
            <div className="or-empty">Chưa có key nào.</div>
          )}

          {keys.map((item) => (
            <div
              key={item.id}
              className={`or-key ${
                item.id === activeId ? "or-key--active" : ""
              }`}
            >
              <label className="or-key-main">
                <input
                  type="radio"
                  name="active-key"
                  checked={item.id === activeId}
                  onChange={() => setActiveId(item.id)}
                />
                <code className="or-key-text">{maskKey(item.value)}</code>
              </label>

              <div className="or-key-meta">
                <span className={`or-badge or-badge--${item.status}`}>
                  {statusLabel[item.status]}
                </span>
                {item.info?.ok && (
                  <>
                    <span className="or-tag">{item.info.label}</span>
                    <span className="or-tag">
                      đã dùng {money(item.info.usage)}
                    </span>
                    <span className="or-tag">
                      còn{" "}
                      {item.info.limit === null || item.info.limit === undefined
                        ? "không giới hạn"
                        : money(item.info.limitRemaining)}
                    </span>
                    {item.info.isFreeTier && (
                      <span className="or-tag">free tier</span>
                    )}
                    <span className="or-tag">{item.info.latency} ms</span>
                  </>
                )}
                {item.info && !item.info.ok && (
                  <span className="or-tag or-tag--error">
                    {item.info.error}
                  </span>
                )}
              </div>

              <div className="or-key-actions">
                <button
                  className="or-btn or-btn--sm"
                  onClick={() => testKey(item)}
                  disabled={item.status === "testing"}
                >
                  Test
                </button>
                <button
                  className="or-btn or-btn--sm or-btn--danger"
                  onClick={() => removeKey(item.id)}
                >
                  Xoá
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="or-field">
          <label className="or-label">Model</label>
          <div className="or-row">
            <input
              className="or-input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="vd: openai/gpt-4o-mini"
              spellCheck={false}
            />
            <button
              className="or-btn"
              onClick={() => setPickerOpen((v) => !v)}
              aria-expanded={pickerOpen}
            >
              {pickerOpen ? "Đóng" : "Chọn"}
            </button>
          </div>

          {pickerOpen && (
            <div className="or-picker">
              <input
                className="or-input"
                value={modelQuery}
                onChange={(e) => setModelQuery(e.target.value)}
                placeholder="Tìm model: claude, free, gpt-4o..."
                spellCheck={false}
                autoFocus
              />
              <label className="or-check">
                <input
                  type="checkbox"
                  checked={freeOnly}
                  onChange={(e) => setFreeOnly(e.target.checked)}
                />
                <span>Chỉ model miễn phí</span>
              </label>

              <div className="or-picker-list">
                {!filteredModels.length && (
                  <div className="or-empty">Không có model nào khớp.</div>
                )}
                {filteredModels.slice(0, MAX_VISIBLE_MODELS).map((m) => (
                  <button
                    key={m.id}
                    className={`or-model ${
                      m.id === model ? "or-model--active" : ""
                    }`}
                    onClick={() => {
                      setModel(m.id);
                      setPickerOpen(false);
                    }}
                  >
                    <span className="or-model-id">{m.id}</span>
                    <span className="or-model-price">
                      {pricePerMillion(m.promptPrice)}
                    </span>
                  </button>
                ))}
                {filteredModels.length > MAX_VISIBLE_MODELS && (
                  <div className="or-hint">
                    Còn {filteredModels.length - MAX_VISIBLE_MODELS} model nữa,
                    gõ thêm để thu hẹp.
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="or-hint">
            {modelsError
              ? `Không tải được danh sách model: ${modelsError}`
              : pickerOpen
              ? `${filteredModels.length}/${modelPool.length} model khớp bộ lọc`
              : `${modelPool.length} model khả dụng`}
          </div>
        </div>

        <div className="or-field">
          <label className="or-label">System prompt (tuỳ chọn)</label>
          <textarea
            className="or-textarea"
            rows={2}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Bạn là trợ lý..."
          />
        </div>

        <div className="or-field">
          <label className="or-label">Temperature: {temperature}</label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
          />
        </div>
      </aside>

      <section className="chat-shell or-chat">
        <header className="chat-header">
          <div className="chat-header-main">
            <div className="chat-logo or-logo">OR</div>
            <div>
              <div className="chat-title">OpenRouter Playground</div>
              <div className="chat-subtitle">
                {activeKey
                  ? `${maskKey(activeKey.value)} · ${model}`
                  : "Chưa chọn key"}
              </div>
            </div>
          </div>

          <button
            className="or-btn or-btn--sm"
            onClick={() => setMessages([])}
            disabled={!messages.length}
          >
            Xoá hội thoại
          </button>
        </header>

        <main className="chat-body" ref={bodyRef}>
          {!messages.length && (
            <div className="or-empty or-empty--center">
              Chọn một key rồi gửi tin nhắn để kiểm tra key đó gọi model được
              hay không.
            </div>
          )}

          {messages.map((m, idx) => {
            if (m.role === "error" || m.role === "system-note") {
              return (
                <div key={idx} className="or-notice">
                  {m.content}
                </div>
              );
            }

            return (
              <div
                key={idx}
                className={`message-row ${
                  m.role === "user"
                    ? "message-row--user"
                    : "message-row--assistant"
                }`}
              >
                {m.role === "assistant" && (
                  <div className="avatar avatar--assistant">AI</div>
                )}
                <div className="or-bubble-wrap">
                  <div
                    className={`message-bubble ${
                      m.role === "user"
                        ? "message-bubble--user"
                        : "message-bubble--assistant"
                    }`}
                  >
                    {m.content}
                  </div>
                  {m.meta && (
                    <div className="or-meta">
                      {m.meta.modelUsed} · {m.meta.latency} ms
                      {m.meta.usage
                        ? ` · ${m.meta.usage.prompt_tokens}+${m.meta.usage.completion_tokens} tokens`
                        : ""}
                      {m.meta.finishReason
                        ? ` · finish: ${m.meta.finishReason}`
                        : ""}
                    </div>
                  )}
                </div>
                {m.role === "user" && <div className="avatar avatar--user">Bạn</div>}
              </div>
            );
          })}

          {sending && (
            <div className="typing-indicator">
              <span />
              <span />
              <span />
              <span className="typing-text">Đang gọi model...</span>
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
              placeholder="Nhập tin nhắn test..."
              className="chat-input"
            />
          </div>
          {sending ? (
            <button
              className="chat-send-btn or-btn--danger"
              onClick={() => abortRef.current?.abort()}
            >
              Huỷ
            </button>
          ) : (
            <button className="chat-send-btn" onClick={sendMessage}>
              Gửi
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

export default OpenRouterChat;
