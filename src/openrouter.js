const BASE_URL = "https://openrouter.ai/api/v1";

/** Header phụ OpenRouter dùng để xếp hạng app, không bắt buộc. */
const appHeaders = () => ({
  "HTTP-Referer": window.location.origin,
  "X-Title": "chat-ai-n8n key tester",
});

export const maskKey = (key) =>
  key.length <= 14 ? key : `${key.slice(0, 10)}...${key.slice(-4)}`;

/** Gom lỗi từ nhiều dạng response của OpenRouter về 1 câu tiếng Việt. */
const describeError = (status, body) => {
  const apiMessage =
    body?.error?.message || body?.message || body?.error?.metadata?.raw;

  const byStatus = {
    401: "Key không hợp lệ hoặc đã bị thu hồi (401)",
    402: "Key hết credit (402)",
    403: "Key bị chặn với model/nội dung này (403)",
    429: "Bị giới hạn tốc độ, thử lại sau (429)",
  };

  return apiMessage || byStatus[status] || `Lỗi HTTP ${status}`;
};

const parseJsonSafe = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

/**
 * Kiểm tra 1 API key: gọi GET /key để lấy hạn mức, usage, free-tier.
 * Không tốn credit.
 */
export async function checkKey(key, signal) {
  const startedAt = performance.now();

  try {
    const res = await fetch(`${BASE_URL}/key`, {
      headers: { Authorization: `Bearer ${key}`, ...appHeaders() },
      signal,
    });
    const body = await parseJsonSafe(res);
    const latency = Math.round(performance.now() - startedAt);

    if (!res.ok) {
      return { ok: false, latency, status: res.status, error: describeError(res.status, body) };
    }

    const info = body?.data ?? {};
    return {
      ok: true,
      latency,
      status: res.status,
      label: info.label || "(không đặt tên)",
      usage: info.usage ?? 0,
      limit: info.limit, // null = không giới hạn
      limitRemaining: info.limit_remaining,
      isFreeTier: Boolean(info.is_free_tier),
      rateLimit: info.rate_limit,
    };
  } catch (err) {
    return {
      ok: false,
      latency: Math.round(performance.now() - startedAt),
      status: 0,
      error: err.name === "AbortError" ? "Đã huỷ" : `Không kết nối được: ${err.message}`,
    };
  }
}

/** Danh sách model công khai, không cần key. */
export async function fetchModels(signal) {
  const res = await fetch(`${BASE_URL}/models`, { signal });
  const body = await parseJsonSafe(res);

  if (!res.ok) throw new Error(describeError(res.status, body));

  return (body?.data ?? [])
    .map((m) => ({
      id: m.id,
      name: m.name || m.id,
      contextLength: m.context_length,
      promptPrice: Number(m.pricing?.prompt ?? 0),
      completionPrice: Number(m.pricing?.completion ?? 0),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Gửi 1 lượt chat. Trả về nội dung + usage + latency để so sánh giữa các key. */
export async function chatCompletion({
  key,
  model,
  messages,
  temperature = 0.7,
  maxTokens,
  signal,
}) {
  const startedAt = performance.now();

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...appHeaders(),
    },
    signal,
    body: JSON.stringify({
      model,
      messages,
      temperature,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
    }),
  });

  const body = await parseJsonSafe(res);
  const latency = Math.round(performance.now() - startedAt);

  if (!res.ok) {
    const err = new Error(describeError(res.status, body));
    err.status = res.status;
    err.latency = latency;
    throw err;
  }

  // OpenRouter có thể trả 200 kèm error trong body khi provider từ chối.
  if (body?.error) {
    const err = new Error(body.error.message || "Provider trả về lỗi");
    err.status = res.status;
    err.latency = latency;
    throw err;
  }

  return {
    content: body?.choices?.[0]?.message?.content ?? "",
    finishReason: body?.choices?.[0]?.finish_reason,
    usage: body?.usage,
    modelUsed: body?.model,
    latency,
  };
}
