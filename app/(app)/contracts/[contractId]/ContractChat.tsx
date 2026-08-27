"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Send, X } from "lucide-react";
import type { ContractChatMessage } from "@/types/contract";
import StepProgress from "@/components/StepProgress";

const DRAFT_STEPS = ["קורא בקשה", "מנסח", "מכין מסמך"];

// The Web Speech API has no official TS lib entry; this is the minimal surface we use.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultLike[];
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

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
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, stepIndex]);

  useEffect(() => {
    setSpeechSupported(getSpeechRecognition() !== null);
  }, []);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  async function sendMessage() {
    if (!input.trim() || sending) return;
    setError(null);
    setSending(true);
    setStepIndex(0);

    const step1Timer = setTimeout(() => setStepIndex(1), 5000);
    const step2Timer = setTimeout(() => setStepIndex(2), 20000);

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

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/contracts/${contractId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "שגיאה בשליחת ההודעה");
        return;
      }
      const body = await res.json();
      setMessages((prev) => [...prev, ...body.messages]);
      router.refresh(); // picks up new contract_files / status shown outside this component
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message ?? "שגיאה בשליחת ההודעה");
      }
      // AbortError = the lawyer cancelled - nothing to show, just stop waiting.
    } finally {
      clearTimeout(step1Timer);
      clearTimeout(step2Timer);
      abortRef.current = null;
      setStepIndex(null);
      setSending(false);
    }
  }

  function cancelSend() {
    abortRef.current?.abort();
  }

  function toggleVoiceInput() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "he-IL";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (e) => {
      const result = e.results[e.resultIndex];
      if (result?.isFinal) {
        setInput((prev) => (prev.trim() ? `${prev.trim()} ${result[0].transcript}` : result[0].transcript));
      }
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
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
              background: m.role === "lawyer" ? "var(--navy)" : "var(--surface-sunken)",
              color: m.role === "lawyer" ? "white" : "var(--text)",
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
        {stepIndex !== null && (
          <div
            style={{
              alignSelf: "flex-start",
              maxWidth: "90%",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "0.6rem 0.9rem",
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
            }}
          >
            <StepProgress steps={DRAFT_STEPS} activeIndex={stepIndex} />
            <button
              className="ghost"
              style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem", marginInlineStart: "auto" }}
              onClick={cancelSend}
            >
              <X size={14} /> בטל
            </button>
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
          placeholder={listening ? "מקשיב..." : "הקלד/י תשובה..."}
        />
        {speechSupported && (
          <button
            type="button"
            className={listening ? undefined : "secondary"}
            onClick={toggleVoiceInput}
            disabled={sending}
            aria-label="הקלטה קולית"
            style={{
              padding: "0.55rem",
              background: listening ? "var(--danger)" : undefined,
              animation: listening ? "pulse-mic 1.4s infinite" : undefined,
            }}
          >
            <Mic size={18} />
          </button>
        )}
        <button onClick={sendMessage} disabled={sending} aria-label="שליחה">
          {sending ? "שולח..." : <Send size={18} />}
        </button>
      </div>
      {error && <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
    </div>
  );
}
