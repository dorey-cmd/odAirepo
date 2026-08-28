"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
import { translateAuthError } from "@/lib/auth/errorMessages";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [firmName, setFirmName] = useState("");
  const [officeSize, setOfficeSize] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                first_name: firstName || undefined,
                last_name: lastName || undefined,
                phone: phone || undefined,
                org_name: firmName || undefined,
                office_size: officeSize || undefined,
              },
            },
          });

    setLoading(false);
    if (error) {
      setError(translateAuthError(error.message));
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.75rem",
        padding: "2rem 1rem",
        background:
          "radial-gradient(ellipse 900px 600px at 50% -10%, rgba(11,31,61,0.08), transparent 60%), " +
          "radial-gradient(ellipse 700px 500px at 100% 100%, rgba(201,162,39,0.07), transparent 60%), " +
          "var(--bg)",
      }}
    >
      <Logo height={199} context="hero" />
      <form onSubmit={handleSubmit} className="card stack" style={{ width: "100%", maxWidth: 420 }}>
        {mode === "sign-up" && (
          <>
            <label className="stack">
              <span>שם</span>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </label>
            <label className="stack">
              <span>שם משפחה</span>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </label>
            <label className="stack">
              <span>טלפון</span>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </>
        )}
        <label className="stack">
          <span>אימייל</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {mode === "sign-up" && (
          <>
            <label className="stack">
              <span>שם הפירמה</span>
              <input value={firmName} onChange={(e) => setFirmName(e.target.value)} />
            </label>
            <label className="stack">
              <span>מספר אנשים במשרד</span>
              <input type="number" min={1} value={officeSize} onChange={(e) => setOfficeSize(e.target.value)} />
            </label>
          </>
        )}
        <label className="stack">
          <span>סיסמה</span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
        <button type="submit" disabled={loading}>
          {mode === "sign-in" ? "התחברות" : "יצירת חשבון"}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
        >
          {mode === "sign-in" ? "אין לך חשבון? הרשמה" : "יש לך חשבון? התחברות"}
        </button>
      </form>
    </main>
  );
}
