import { useState } from "react";
import "./App.css";
import N8nChat from "./N8nChat";
import OpenRouterChat from "./OpenRouterChat";

const TABS = [
  { id: "n8n", label: "Chat n8n" },
  { id: "openrouter", label: "Test OpenRouter key" },
];

function App() {
  const [tab, setTab] = useState("n8n");

  return (
    <div className="app-root">
      <div className="app-stack">
        <nav className="app-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`app-tab ${tab === t.id ? "app-tab--active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "n8n" ? <N8nChat /> : <OpenRouterChat />}
      </div>
    </div>
  );
}

export default App;
