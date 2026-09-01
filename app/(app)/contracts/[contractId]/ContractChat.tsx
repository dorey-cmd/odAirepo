"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Send, X, Paperclip, FileText } from "lucide-react";
import type { ContractChatMessage } from "@/types/contract";
import StepProgress from "@/components/StepProgress";
import UploadProgressBar from "@/components/UploadProgressBar";
import { ACCEPT_ATTRIBUTE, validateFile } from "@/lib/storage/fileRules";
import { uploadViaTicket } from "@/lib/storage/clientUpload";

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

interface PendingAttachment {
  id: string;
  filename: string;
}

export default function ContractChat({
  contractId,
  initialMessages,
  initialStatus,
}: {
  contractId: string;
  initialMessages: ContractChatMessage[];
  initialStatus: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [status, setStatus] = useState(initialStatus);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, stepIndex]);

  useEffect(() => {
    setSpeechSupported(getSpeechRecognition() !== null);
  }, []);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [input]);

  // Large contracts draft one section per turn (see chatEngine.ts) - keep
  // continuing automatically, no lawyer input needed, until either a final
  // section lands or the AI stops for some other reason. Each section
  // message already renders as its own chat bubble, so this loop doubles as
  // live progress instead of a fake spinner. Shared by sendMessage's
  // automatic loop and the manual "המשך" retry after a failed/stuck turn.
  async function runContinuationLoop(lastMsg: ContractChatMessage | undefined) {
    const MAX_SECTIONS = 60; // safety cap against a runaway loop that never finalizes
    let sectionCount = 0;
    while ((lastMsg?.tool_call as { type?: string; is_final_section?: boolean } | null)?.type === "submit_draft_section" &&
      (lastMsg!.tool_call as { is_final_section: boolean }).is_final_section === false) {
      if (++sectionCount > MAX_SECTIONS) {
        setError("הטיוטה כוללת חלקים רבים מהצפוי ועצרנו כדי לא להסתחרר - אפשר ללחוץ על המשך, או לפנות לתמיכה.");
        return;
      }
      const contRes = await fetch(`/api/contracts/${contractId}/continue-draft`, { method: "POST" });
      if (!contRes.ok) {
        const b = await contRes.json().catch(() => ({}));
        setError(b.error ?? "שגיאה בהמשך הכנת הטיוטה");
        return;
      }
      const body = await contRes.json();
      setMessages((prev) => [...prev, ...body.messages]);
      lastMsg = body.messages[body.messages.length - 1];
    }
  }

  async function sendMessage() {
    if (!input.trim() || sending) return;
    setError(null);
    setSending(true);
    setStepIndex(0);

    const step1Timer = setTimeout(() => setStepIndex(1), 5000);
    const step2Timer = setTimeout(() => setStepIndex(2), 20000);

    const attachmentIds = pendingAttachments.map((a) => a.id);
    const optimistic: ContractChatMessage = {
      id: `optimistic-${Date.now()}`,
      chat_id: "",
      impersonated_by: null,
      role: "lawyer",
      content: input,
      tool_call: null,
      attachment_file_ids: attachmentIds,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    const text = input;
    setInput("");
    setPendingAttachments([]);

    // No AbortController here by design - once a drafting operation starts
    // (including the auto-continuation loop below) the lawyer has no UI
    // affordance to interrupt it; it runs through to completion.
    try {
      const res = await fetch(`/api/contracts/${contractId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, attachment_file_ids: attachmentIds }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "שגיאה בשליחת ההודעה");
        setStatus("error");
        return;
      }
      const body = await res.json();
      setMessages((prev) => [...prev, ...body.messages]);
      await runContinuationLoop(body.messages[body.messages.length - 1]);

      router.refresh(); // picks up new contract_files / status shown outside this component
    } catch (err) {
      setError((err as Error).message ?? "שגיאה בשליחת ההודעה");
      setStatus("error");
    } finally {
      clearTimeout(step1Timer);
      clearTimeout(step2Timer);
      setStepIndex(null);
      setSending(false);
    }
  }

  // Recovers a turn that genuinely never got a response - e.g. a platform
  // timeout mid-request (no chat-level cancel button exists, so this is the
  // only way back short of reloading and re-typing feedback that was already
  // sent). Calls continue-draft directly: chatEngine picks up exactly where
  // the lawyer's last message or the last unfinished section left off.
  async function retryTurn() {
    if (sending) return;
    setError(null);
    setSending(true);
    setStepIndex(0);
    const step1Timer = setTimeout(() => setStepIndex(1), 5000);
    const step2Timer = setTimeout(() => setStepIndex(2), 20000);
    try {
      const res = await fetch(`/api/contracts/${contractId}/continue-draft`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "השגיאה חוזרת - כדאי לפנות לתמיכה אם זה נמשך.");
        return;
      }
      const body = await res.json();
      setMessages((prev) => [...prev, ...body.messages]);
      setStatus("revising"); // hides the retry button; ContractStatusBadge's own polling reflects the real status moments later
      await runContinuationLoop(body.messages[body.messages.length - 1]);
      router.refresh();
    } catch (err) {
      setError((err as Error).message ?? "השגיאה חוזרת - כדאי לפנות לתמיכה אם זה נמשך.");
    } finally {
      clearTimeout(step1Timer);
      clearTimeout(step2Timer);
      setStepIndex(null);
      setSending(false);
    }
  }

  async function attachFile(file: File) {
    setUploadError(null);
    const clientError = validateFile(file.name, file.type, file.size);
    if (clientError) {
      setUploadError(clientError);
      return;
    }

    try {
      const initRes = await fetch(`/api/contracts/${contractId}/files/init-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      if (!initRes.ok) {
        const b = await initRes.json().catch(() => ({}));
        throw new Error(b.error ?? "שגיאה בהכנת ההעלאה");
      }
      const { ticket } = await initRes.json();

      setUploadProgress(0);
      const uploaded = await uploadViaTicket(ticket, file, setUploadProgress);
      setUploadProgress(null);

      const finalizeRes = await fetch(`/api/contracts/${contractId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: uploaded.path,
          drive_file_id: uploaded.driveFileId,
          original_filename: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        }),
      });
      if (!finalizeRes.ok) {
        const b = await finalizeRes.json().catch(() => ({}));
        throw new Error(b.error ?? "שגיאה בשמירת הקובץ");
      }
      const { file: savedFile } = await finalizeRes.json();
      setPendingAttachments((prev) => [...prev, { id: savedFile.id, filename: savedFile.original_filename }]);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploadProgress(null);
    }
  }

  function removePendingAttachment(id: string) {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
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
    <div className="card stack chat-window" style={{ height: 620 }}>
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
            {m.impersonated_by && (
              <div style={{ fontSize: "0.72rem", opacity: 0.75, marginTop: "0.3rem" }}>נשלח באמצעות View As</div>
            )}
            {m.attachment_file_ids.length > 0 && (
              <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                {m.attachment_file_ids.map((id) => (
                  <span
                    key={id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      fontSize: "0.78rem",
                      opacity: 0.85,
                      background: "rgba(255,255,255,0.12)",
                      padding: "0.15rem 0.5rem",
                      borderRadius: 999,
                    }}
                  >
                    <Paperclip size={11} /> קובץ מצורף
                  </span>
                ))}
              </div>
            )}
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
              flexWrap: "wrap",
            }}
          >
            {/* No cancel control by design - once drafting starts it runs to completion, uninterruptible from the UI. */}
            <StepProgress steps={DRAFT_STEPS} activeIndex={stepIndex} />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {(pendingAttachments.length > 0 || uploadProgress !== null) && (
        <div className="stack" style={{ gap: "0.4rem" }}>
          {uploadProgress !== null && <UploadProgressBar label="מצרף קובץ" percent={uploadProgress} />}
          {pendingAttachments.length > 0 && (
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
              {pendingAttachments.map((a) => (
                <span key={a.id} className="badge" style={{ gap: "0.4rem" }}>
                  <FileText size={12} />
                  {a.filename}
                  <button
                    type="button"
                    className="ghost"
                    style={{ padding: 0, background: "none" }}
                    onClick={() => removePendingAttachment(a.id)}
                    aria-label="הסר קובץ"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {uploadError && <span style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{uploadError}</span>}

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) attachFile(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || uploadProgress !== null}
          aria-label="צירוף קובץ"
          style={{ padding: "0.55rem" }}
        >
          <Paperclip size={18} />
        </button>
        <textarea
          ref={textareaRef}
          style={{ flex: 1, resize: "none", minHeight: 44, maxHeight: 240, lineHeight: 1.4 }}
          rows={1}
          value={input}
          disabled={sending}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder={listening ? "מקשיב..." : "כתוב/י תשובה... (Shift+Enter לשורה חדשה)"}
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
        <button onClick={sendMessage} disabled={sending} aria-label="שליחה" style={{ padding: "0.55rem 0.9rem" }}>
          {sending ? "שולח..." : <Send size={18} />}
        </button>
      </div>
      {(error || status === "error") && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {error && <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
          <button type="button" onClick={retryTurn} disabled={sending}>
            {sending ? "ממשיך..." : "המשך"}
          </button>
        </div>
      )}
    </div>
  );
}
