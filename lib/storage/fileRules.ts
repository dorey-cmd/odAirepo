/**
 * What environment files can be uploaded, and how big they may be. Enforced
 * both client-side (fast feedback) and server-side (source of truth) - see
 * app/api/environments/[id]/files/init-upload/route.ts.
 *
 * Uploads go straight from the browser to Supabase Storage via a signed
 * upload URL rather than through a Next.js API route, because Vercel
 * serverless functions cap request bodies at ~4.5MB - far too small for
 * scanned PDFs or video exhibits.
 */

export interface FileTypeRule {
  category: "word" | "pdf" | "image" | "video" | "font" | "text";
  label: string;
  mimeTypes: string[];
  extensions: string[];
  maxBytes: number;
}

const MB = 1024 * 1024;

export const FILE_TYPE_RULES: FileTypeRule[] = [
  {
    category: "word",
    label: "Word",
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ],
    extensions: [".docx", ".doc"],
    maxBytes: 25 * MB,
  },
  {
    category: "pdf",
    label: "PDF",
    mimeTypes: ["application/pdf"],
    extensions: [".pdf"],
    maxBytes: 25 * MB,
  },
  {
    category: "image",
    label: "תמונה",
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    extensions: [".jpg", ".jpeg", ".png", ".webp", ".gif"],
    maxBytes: 15 * MB,
  },
  {
    category: "video",
    label: "וידאו",
    mimeTypes: ["video/mp4", "video/quicktime", "video/webm"],
    extensions: [".mp4", ".mov", ".webm"],
    maxBytes: 200 * MB,
  },
  {
    category: "font",
    label: "פונט",
    mimeTypes: ["font/ttf", "font/otf", "font/woff", "font/woff2", "application/x-font-ttf"],
    extensions: [".ttf", ".otf", ".woff", ".woff2"],
    maxBytes: 10 * MB,
  },
  {
    category: "text",
    label: "טקסט",
    mimeTypes: ["text/plain"],
    extensions: [".txt"],
    maxBytes: 5 * MB,
  },
];

export const ACCEPT_ATTRIBUTE = FILE_TYPE_RULES.flatMap((r) => r.extensions).join(",");

/** Primary types worth advertising in the UI hint - font/text are supported but not the headline offering. */
const HEADLINE_CATEGORIES: FileTypeRule["category"][] = ["word", "pdf", "image", "video"];

export function describeFileRules(): string {
  return FILE_TYPE_RULES.filter((r) => HEADLINE_CATEGORIES.includes(r.category))
    .map((r) => `${r.label} (עד ${Math.round(r.maxBytes / MB)}MB)`)
    .join(" · ");
}

export function findRuleFor(filename: string, mimeType: string): FileTypeRule | null {
  const lower = filename.toLowerCase();
  return (
    FILE_TYPE_RULES.find(
      (r) => r.mimeTypes.includes(mimeType) || r.extensions.some((ext) => lower.endsWith(ext)),
    ) ?? null
  );
}

export function validateFile(filename: string, mimeType: string, sizeBytes: number): string | null {
  const rule = findRuleFor(filename, mimeType);
  if (!rule) return `סוג קובץ לא נתמך. ניתן להעלות: ${describeFileRules()}`;
  if (sizeBytes > rule.maxBytes) {
    return `הקובץ גדול מדי (עד ${Math.round(rule.maxBytes / MB)}MB עבור ${rule.label})`;
  }
  return null;
}

const INTAKE_CATEGORIES: FileTypeRule["category"][] = ["word", "pdf"];
export const INTAKE_ACCEPT_ATTRIBUTE = FILE_TYPE_RULES.filter((r) => INTAKE_CATEGORIES.includes(r.category))
  .flatMap((r) => r.extensions)
  .join(",");

export function describeIntakeFileRules(): string {
  return FILE_TYPE_RULES.filter((r) => INTAKE_CATEGORIES.includes(r.category))
    .map((r) => `${r.label} (עד ${Math.round(r.maxBytes / MB)}MB)`)
    .join(" · ");
}

/** Starting a new contract from a document: only Word/PDF make sense as intake data. */
export function validateIntakeFile(filename: string, mimeType: string, sizeBytes: number): string | null {
  const rule = findRuleFor(filename, mimeType);
  if (!rule || !INTAKE_CATEGORIES.includes(rule.category)) {
    return `סוג קובץ לא נתמך לקליטת חוזה. ניתן להעלות: ${describeIntakeFileRules()}`;
  }
  if (sizeBytes > rule.maxBytes) {
    return `הקובץ גדול מדי (עד ${Math.round(rule.maxBytes / MB)}MB עבור ${rule.label})`;
  }
  return null;
}
