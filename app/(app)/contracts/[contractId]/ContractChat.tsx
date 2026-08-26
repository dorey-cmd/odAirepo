"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ContractChatMessage } from "@/types/contract";

export default function ContractChat({
  contractId,
  initialMessages,
}: {
  contractId: string;
  initialMessages: ContractChatMessage[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, statusText]);

  async function sendMessage() {
    if (!input.trim() || sending) return;
    setError(null);
    setSending(true);
    setStatusText("Claude חושב...");

    const thinkingTimer = setTimeout(() => setStatusText("מנסח תשובה..."), 5000);
    const draftingTimer = setTimeout(() => setStatusText("מכין טיוטה, זה עשוי לקחת עד דקה..."), 20000);

    const optimistic: ContractChatMessage = {
      id: `optimistic-${Date.now()}`,
      chat_id: "",
      role: "lawyer",
      content: input,
      tool_call: null,
      attachment_file_ids: [],
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    const text = input;
    setInput("");

    try {
      const res = await fetch(`/api/contracts/${contractId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "שגיאה בשליחת ההודעה");
        return;
      }
      const body = await res.json();
      setMessages((prev) => [...prev, ...body.messages]);
      router.refresh(); // picks up new contract_files / status shown outside this component
    } finally {
      clearTimeout(thinkingTimer);
      clearTimeout(draftingTimer);
      setStatusText(null);
      setSending(false);
    }
  }

  async function resolveRule(ruleId: string, status: "accepted" | "rejected") {
    await fetch(`/api/learned-rules/${ruleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setMessages((prev) =>
      prev.map((m) =>
        m.tool_call?.type === "propose_guideline_update" && m.tool_call.ruleId === ruleId
          ? { ...m, tool_call: { ...m.tool_call, resolvedStatus: status } }
          : m,
      ),
    );
  }

  return (
    <div className="card stack" style={{ height: 520 }}>
      <div className="stack" style={{ flex: 1, overflowY: "auto", paddingLeft: 4 }}>
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.role === "lawyer" ? "flex-end" : "flex-start",
              maxWidth: "80%",
              background: m.role === "lawyer" ? "var(--accent)" : "var(--surface)",
              border: m.role === "lawyer" ? "none" : "1px solid var(--border)",
              borderRadius: 10,
              padding: "0.6rem 0.9rem",
              whiteSpace: "pre-wrap",
            }}
          >
            {m.content}
            {m.tool_call?.type === "propose_guideline_update" && !m.tool_call.resolvedStatus && (
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button onClick={() => resolveRule(m.tool_call!.ruleId as string, "accepted")}>
                  אשר עדכון הנחיות
                </button>
                <button className="secondary" onClick={() => resolveRule(m.tool_call!.ruleId as string, "rejected")}>
                  דחה
                </button>
              </div>
            )}
            {m.tool_call?.type === "propose_guideline_update" && Boolean(m.tool_call.resolvedStatus) && (
              <p style={{ color: "var(--text-muted)", margin: "0.4rem 0 0" }}>
                {m.tool_call.resolvedStatus === "accepted" ? "אושר ✓" : "נדחה"}
              </p>
            )}
          </div>
        ))}
        {statusText && (
          <div
            style={{
              alignSelf: "flex-start",
              maxWidth: "80%",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "0.6rem 0.9rem",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span className="typing-dots" aria-hidden>
              <span />
              <span />
              <span />
            </span>
            {statusText}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          style={{ flex: 1 }}
          value={input}
          disabled={sending}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="הקלד/י תשובה..."
        />
        <button onClick={sendMessage} disabled={sending}>
          {sending ? "שולח..." : "שליחה"}
        </button>
      </div>
      {error && <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
    </div>
  );
}
