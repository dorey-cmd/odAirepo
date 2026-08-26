"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

declare global {
  interface Window {
    gapi: unknown;
    google: {
      picker: {
        PickerBuilder: new () => GooglePickerBuilder;
        DocsView: new (viewId: unknown) => GoogleDocsView;
        ViewId: { FOLDERS: unknown };
        Action: { PICKED: string };
        Feature: { NAV_HIDDEN: unknown };
      };
    };
  }
  interface GooglePickerBuilder {
    addView(view: GoogleDocsView): GooglePickerBuilder;
    setOAuthToken(token: string): GooglePickerBuilder;
    setDeveloperKey(key: string): GooglePickerBuilder;
    setCallback(cb: (data: PickerResponse) => void): GooglePickerBuilder;
    enableFeature(feature: unknown): GooglePickerBuilder;
    build(): { setVisible(visible: boolean): void };
  }
  interface GoogleDocsView {
    setSelectFolderEnabled(enabled: boolean): GoogleDocsView;
    setIncludeFolders(include: boolean): GoogleDocsView;
  }
  interface PickerResponse {
    action: string;
    docs: { id: string; name: string }[];
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

export default function DrivePicker({ apiKey }: { apiKey: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPicker() {
    setError(null);
    setLoading(true);
    try {
      await loadScript("https://apis.google.com/js/api.js");
      await new Promise<void>((resolve) => window.gapi && (window.gapi as { load: (n: string, cb: () => void) => void }).load("picker", resolve));

      const tokenRes = await fetch("/api/integrations/google-drive/access-token");
      if (!tokenRes.ok) {
        const body = await tokenRes.json().catch(() => ({}));
        throw new Error(body.error ?? "לא ניתן היה לקבל הרשאה מגוגל");
      }
      const { accessToken } = await tokenRes.json();

      const view = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS)
        .setSelectFolderEnabled(true)
        .setIncludeFolders(true);

      const picker = new window.google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setDeveloperKey(apiKey)
        .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
        .setCallback(async (data: PickerResponse) => {
          if (data.action !== window.google.picker.Action.PICKED) return;
          const folder = data.docs[0];
          if (!folder) return;
          setLoading(true);
          const saveRes = await fetch("/api/integrations/google-drive/root-folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folderId: folder.id, folderName: folder.name }),
          });
          setLoading(false);
          if (!saveRes.ok) {
            const body = await saveRes.json().catch(() => ({}));
            setError(body.error ?? "שגיאה בשמירת התיקייה");
            return;
          }
          router.refresh();
        })
        .build();
      picker.setVisible(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack">
      <button onClick={openPicker} disabled={loading}>
        {loading ? "טוען..." : "בחר/י תיקייה ראשית ב-Drive"}
      </button>
      {error && <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
    </div>
  );
}
