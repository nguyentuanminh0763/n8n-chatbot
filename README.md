🧠 n8n-chatbot

A minimal chatbot UI built with
React + Vite → n8n Webhook → OpenAI (GPT-4 mini).

Kết hợp front-end nhẹ nhàng & automation workflow trong n8n để tạo chatbot chạy local qua Docker.

⚙️ Tech Stack
Công nghệ	Mô tả
⚛️ React	Xây dựng giao diện chat
⚡ Vite	Dev server siêu nhanh
🧩 n8n	Xử lý message + gọi OpenAI
🤖 OpenAI GPT-4 mini	Trả lời tin nhắn
🐳 Docker Desktop	Chạy n8n local
🚀 Setup
1. Clone repo
git clone https://github.com/USERNAME/n8n-chatbot.git
cd n8n-chatbot

2. Tạo file .env
VITE_N8N_CHAT_URL=http://localhost:5678/webhook/<your-webhook-id>

▶️ Run local
npm install
npm run dev


App chạy tại:
👉 http://localhost:5173

🛠 Cấu hình n8n

Workflow cần:

🔗 Webhook Trigger

🤖 OpenAI Chat Model (GPT-4 mini)

🧠 (Optional) Simple Memory

↩️ Trả về JSON:

{ "reply": "your bot message" }

🔑 Tab "Test OpenRouter key"

App có 2 tab ở đầu trang: Chat n8n (như trên) và Test OpenRouter key.

Tab thứ hai dùng để kiểm tra nhiều API key OpenRouter cùng lúc:

📋 Dán nhiều key (mỗi dòng một key), bấm Test tất cả

✅ Gọi GET /api/v1/key — không tốn credit — xem key còn sống, đã dùng bao nhiêu,
còn bao nhiêu, free tier hay không, độ trễ

🔎 Chọn model từ danh sách đầy đủ của OpenRouter (tìm theo từ khoá, lọc model free,
hiện giá $/1M token)

💬 Chat thử bằng key đã chọn để xác nhận key gọi được POST /api/v1/chat/completions;
mỗi câu trả lời hiện model thật sự phục vụ, latency và số token

⚠️ Key chỉ nằm trong trình duyệt và gửi thẳng tới openrouter.ai. Mặc định key không
được lưu; tick "Ghi nhớ key" mới ghi vào localStorage. Đây là app client-side nên
key sẽ lộ trong tab Network — chỉ dùng để test trên máy cá nhân.
