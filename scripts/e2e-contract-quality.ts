import { readFileSync } from "node:fs";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match) process.env[match[1]] = match[2];
}

/**
 * End-to-end drafting quality/cost gate. Drives a real contract through the
 * real pipeline (Claude + document-renderer, same as production) and checks
 * it against four criteria: cost, mechanical document quality, substantive
 * legal quality, and that the run didn't error out. This calls the real
 * Claude API and spends real money - run on demand, not on every push.
 *
 * Usage: npx tsx scripts/e2e-contract-quality.ts <environmentId> [--source=<contractId>]
 *   --source clones a real contract's extracted_fields as intake, so a run
 *   can be repeated against comparable, realistic complexity.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { runChatTurn, buildDraftFilename } from "@/lib/ai/chatEngine";
import { DRAFTING_MODEL, createClaudeClient } from "@/lib/ai/claudeClient";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { logAiUsage } from "@/lib/ai/usageLog";
import { getContractStorageProvider } from "@/lib/storage/factory";
import { extractText } from "@/lib/parsing/extractText";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

const COST_BUDGET_USD = 0.5;
// Mirrors services/document-renderer/app/renderer.py's _LEADING_NUMBER_RE -
// a node with a literal leading number in `text` must never ALSO carry
// numId/ilvl, or the rendered document shows the number twice.
const LEADING_NUMBER_RE = /^\s*(\(?[0-9]+([.\-][0-9]+)*\)?[.)]?|\(?[א-ת]\)?[.)])\s/;

interface Finding {
  criterion: string;
  pass: boolean;
  detail: string;
}

const findings: Finding[] = [];
function record(criterion: string, pass: boolean, detail: string) {
  findings.push({ criterion, pass, detail });
  console.log(`${pass ? "✓ PASS" : "✗ FAIL"} — ${criterion}: ${detail}`);
}

async function main() {
  const environmentId = process.argv[2];
  const sourceArg = process.argv.find((a) => a.startsWith("--source="));
  const sourceContractId = sourceArg?.split("=")[1];
  if (!environmentId) {
    console.error("Usage: tsx scripts/e2e-contract-quality.ts <environmentId> [--source=<contractId>]");
    process.exit(1);
  }

  const admin = createAdminClient();

  const { data: environment } = await admin.from("contract_environments").select("*").eq("id", environmentId).single();
  if (!environment) throw new Error(`Environment ${environmentId} not found`);

  let extractedFields: Record<string, unknown> = {};
  if (sourceContractId) {
    const { data: source } = await admin.from("contracts").select("extracted_fields").eq("id", sourceContractId).single();
    extractedFields = (source?.extracted_fields as Record<string, unknown>) ?? {};
  }

  console.log(`\n=== Driving a fresh contract through environment "${environment.name}" ===\n`);

  const { data: contract, error: contractError } = await admin
    .from("contracts")
    .insert({
      environment_id: environmentId,
      org_id: environment.org_id,
      title: `E2E quality run - ${new Date().toISOString()}`,
      status: "drafting",
      intake_source: "manual_form",
      extracted_fields: extractedFields,
      missing_fields: [],
    })
    .select("*")
    .single();
  if (contractError || !contract) throw new Error(contractError?.message ?? "contract insert failed");

  const { data: chat, error: chatError } = await admin
    .from("contract_chats")
    .insert({ contract_id: contract.id, org_id: environment.org_id })
    .select("*")
    .single();
  if (chatError || !chat) throw new Error(chatError?.message ?? "chat insert failed");

  await admin.from("contract_chat_messages").insert({
    chat_id: chat.id,
    org_id: environment.org_id,
    role: "assistant",
    content: "קיבלתי את כל הפרטים הנדרשים ליצירת החוזה. מתחיל להכין טיוטה...",
  });

  // This is a fully unattended gate - a real lawyer would answer clarifying
  // questions, but nothing here can. Pre-seed a standing instruction so an
  // ambiguous/complex template (judgment calls, blank fields) doesn't stall
  // the run waiting for a reply that will never come; the AI is still free
  // to use `flag` to surface anything it's unsure about, same as it would
  // for a real lawyer who hasn't answered yet.
  await admin.from("contract_chat_messages").insert({
    chat_id: chat.id,
    org_id: environment.org_id,
    role: "lawyer",
    content:
      "תשתמש בברירות המחדל של התבנית המקורית לכל פרט שלא הוגדר במפורש (כולל שדות ריקים שיישארו כפלייסהולדרים). " +
      "אל תשאל שאלות הבהרה - סמן ב-flag כל מקום שאתה לא בטוח לגביו, והמשך לנסח.",
  });

  const MAX_TURNS = 60;
  let turnCount = 0;
  for (let i = 1; i <= MAX_TURNS; i++) {
    const start = Date.now();
    const messages = await runChatTurn(admin, contract.id);
    turnCount = i;
    const elapsed = Math.round((Date.now() - start) / 1000);
    for (const m of messages) {
      const tc = m.tool_call as { type?: string; section_title?: string; is_final_section?: boolean } | null;
      console.log(`[turn ${i}, ${elapsed}s] ${tc?.type ?? "text"}${tc?.section_title ? ` - ${tc.section_title}` : ""}${tc?.is_final_section ? " (FINAL)" : ""}`);
    }
    const last = messages[messages.length - 1];
    const lastTc = last?.tool_call as { type?: string; is_final_section?: boolean } | null;
    if (lastTc?.type !== "submit_draft_section" || lastTc.is_final_section !== false) break;
  }

  // --- Criterion: run completed without error, produced a file ---
  const { data: finalFile } = await admin
    .from("contract_files")
    .select("*")
    .eq("contract_id", contract.id)
    .eq("file_role", "draft_version")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  record("draft produced", Boolean(finalFile), finalFile ? `${finalFile.original_filename} after ${turnCount} turn(s)` : "no contract_files row was created - drafting pass failed");
  if (!finalFile) {
    printReportAndExit();
    return;
  }

  // --- Criterion: cost ---
  const { data: usageRows } = await admin
    .from("ai_usage_log")
    .select("model, input_tokens, output_tokens, cache_read_input_tokens, cache_creation_5m_tokens, cache_creation_1h_tokens")
    .eq("contract_id", contract.id)
    .eq("purpose", "chat_turn");
  const totalCost = (usageRows ?? []).reduce(
    (sum, u) =>
      sum +
      estimateCostUsd(u.model, u.input_tokens, u.output_tokens, {
        creation5mTokens: u.cache_creation_5m_tokens,
        creation1hTokens: u.cache_creation_1h_tokens,
        readTokens: u.cache_read_input_tokens,
      }),
    0,
  );
  const totalIn = (usageRows ?? []).reduce((s, u) => s + u.input_tokens, 0);
  const totalOut = (usageRows ?? []).reduce((s, u) => s + u.output_tokens, 0);
  const totalCacheRead = (usageRows ?? []).reduce((s, u) => s + (u.cache_read_input_tokens ?? 0), 0);
  const totalCacheCreate = (usageRows ?? []).reduce((s, u) => s + (u.cache_creation_5m_tokens ?? 0) + (u.cache_creation_1h_tokens ?? 0), 0);
  record(
    "cost",
    totalCost <= COST_BUDGET_USD,
    `$${totalCost.toFixed(3)} (budget $${COST_BUDGET_USD}) across ${turnCount} turns - input=${totalIn} output=${totalOut} cache_read=${totalCacheRead} cache_creation=${totalCacheCreate}`,
  );

  // --- Criterion: mechanical - no node double-numbers a clause ---
  const { data: sectionRows } = await admin
    .from("contract_chat_messages")
    .select("tool_call")
    .eq("chat_id", chat.id)
    .eq("role", "assistant");
  const allNodes = (sectionRows ?? [])
    .map((r) => r.tool_call as { type?: string; nodes?: { text?: string; numId?: number }[] } | null)
    .filter((tc): tc is { type: string; nodes: { text?: string; numId?: number }[] } => tc?.type === "submit_draft_section")
    .flatMap((tc) => tc.nodes ?? []);
  const doubleNumbered = allNodes.filter((n) => n.numId != null && LEADING_NUMBER_RE.test((n.text ?? "").trim()));
  record(
    "no double-numbered clauses (node-level)",
    doubleNumbered.length === 0,
    doubleNumbered.length === 0 ? `checked ${allNodes.length} nodes` : `${doubleNumbered.length} of ${allNodes.length} nodes set BOTH a literal number and numId`,
  );

  // --- Download the rendered file for the remaining checks ---
  const storage = getContractStorageProvider({ org_id: environment.org_id, storage_provider: environment.storage_provider }, admin);
  const fileBuffer = await storage.download({
    provider: finalFile.storage_provider,
    path: finalFile.storage_path,
    driveFileId: finalFile.google_drive_file_id ?? undefined,
  });
  const tmpDir = mkdtempSync(join(tmpdir(), "odai-e2e-"));
  const docxPath = join(tmpDir, "draft.docx");
  writeFileSync(docxPath, fileBuffer);

  // --- Criterion: filename convention ---
  const expectedPattern = /^.+_.+_\d{1,2}\.\d{1,2}\.\d{4}_V\d+\.docx$/;
  record(
    "filename convention",
    expectedPattern.test(finalFile.original_filename),
    `"${finalFile.original_filename}" ${expectedPattern.test(finalFile.original_filename) ? "matches" : "does NOT match"} {party}_{title}_{date}_V{n}.docx`,
  );

  // --- Criterion: mechanical - paragraph spacing (python-docx) ---
  try {
    const pythonExe = join("services", "document-renderer", ".venv", "Scripts", "python.exe");
    const checkScript = `
import sys
from docx import Document
d = Document(sys.argv[1])
under = sum(1 for p in d.paragraphs if (p.paragraph_format.space_after is None or p.paragraph_format.space_after.pt < 8) and (p.style.paragraph_format.space_after is None or p.style.paragraph_format.space_after.pt < 8))
print(f"{len(d.paragraphs)} {under}")
`;
    const scriptPath = join(tmpDir, "check_spacing.py");
    writeFileSync(scriptPath, checkScript);
    const { stdout } = await execFileAsync(pythonExe, [scriptPath, docxPath]);
    const [total, under] = stdout.trim().split(" ").map(Number);
    record("paragraph spacing (min 8pt)", under === 0, `${under} of ${total} paragraphs under 8pt spacing`);
  } catch (err) {
    record("paragraph spacing (min 8pt)", false, `check failed to run: ${(err as Error).message}`);
  }

  // --- Criterion: mechanical - no double numbering in the RENDERED file ---
  // The node-level check above only catches a node that sets numId itself -
  // it can't see a style (e.g. a heading style) that carries its OWN baked-in
  // numPr in the template's styles.xml, which Word applies regardless of
  // anything set on the paragraph. That inherited numbering only shows up in
  // the actual rendered output, not in the pre-render node data, so it has
  // to be checked here against the real file.
  try {
    const pythonExe = join("services", "document-renderer", ".venv", "Scripts", "python.exe");
    const checkScript = `
import sys, re
from docx import Document
NS = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
LEADING_NUMBER_RE = re.compile(r"^\\s*(\\(?[0-9]+([.\\-][0-9]+)*\\)?[.)]?|\\(?[א-ת]\\)?[.)])\\s")

def effective_num_id(paragraph):
    p_pr = paragraph._p.find(NS + 'pPr')
    num_pr = p_pr.find(NS + 'numPr') if p_pr is not None else None
    if num_pr is not None:
        num_id_el = num_pr.find(NS + 'numId')
        return num_id_el.get(NS + 'val') if num_id_el is not None else None
    style = paragraph.style
    seen = set()
    while style is not None and id(style) not in seen:
        seen.add(id(style))
        s_pPr = style.element.find(NS + 'pPr')
        s_num_pr = s_pPr.find(NS + 'numPr') if s_pPr is not None else None
        if s_num_pr is not None:
            num_id_el = s_num_pr.find(NS + 'numId')
            return num_id_el.get(NS + 'val') if num_id_el is not None else None
        style = getattr(style, 'base_style', None)
    return None

d = Document(sys.argv[1])
bad = []
for p in d.paragraphs:
    text = (p.text or '').strip()
    if not text or not LEADING_NUMBER_RE.match(text):
        continue
    num_id = effective_num_id(p)
    if num_id is not None and num_id != '0':
        bad.append(text[:60])
print(len(bad))
for t in bad[:10]:
    print(t)
`;
    const scriptPath = join(tmpDir, "check_rendered_numbering.py");
    writeFileSync(scriptPath, checkScript);
    const { stdout } = await execFileAsync(pythonExe, [scriptPath, docxPath]);
    const lines = stdout.trim().split("\n");
    const badCount = Number(lines[0]);
    record(
      "no double-numbered clauses (rendered file)",
      badCount === 0,
      badCount === 0
        ? "verified against the actual rendered document"
        : `${badCount} paragraph(s) will show Word's own auto-number on top of a literal number, e.g.: ${lines.slice(1).join(" | ")}`,
    );
  } catch (err) {
    record("no double-numbered clauses (rendered file)", false, `check failed to run: ${(err as Error).message}`);
  }

  // --- Criterion: substantive legal quality (LLM-as-judge) ---
  const docText = await extractText(fileBuffer, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "draft.docx");
  const claude = createClaudeClient();
  const judgeStream = claude.messages.stream({
    model: DRAFTING_MODEL,
    // Extended thinking on this model consumed its entire max_tokens budget
    // on internal reasoning in testing - once at 8000, once again at 20000 -
    // leaving zero room for the actual verdict. Disabled here so the budget
    // goes deterministically to the structured JSON response this call needs.
    thinking: { type: "disabled" },
    max_tokens: 8000,
    system:
      "You are a senior contracts lawyer reviewing a colleague's AI-assisted draft before it goes to a client. " +
      "Judge strictly against real practice standards: internal consistency (defined terms used consistently, no " +
      "contradicted clauses, cross-references that still make sense), completeness for the contract type, and " +
      "professional Hebrew legal register. For EVERY issue you report, quote the exact problematic text verbatim " +
      "from the document (not a paraphrase) so the finding can be verified against the source - do not report an " +
      "issue you cannot ground in an exact quote. Reply with a JSON object only: " +
      '{"pass": boolean, "score_1_to_10": number, "issues": [{"quote": string, "problem": string}], "summary": ' +
      'string} - problem/summary in Hebrew.',
    messages: [{ role: "user", content: docText.slice(0, 100000) }],
  });
  const judgeResponse = await judgeStream.finalMessage();
  await logAiUsage(admin, {
    orgId: environment.org_id,
    contractId: contract.id,
    purpose: "e2e_quality_judge",
    model: DRAFTING_MODEL,
    usage: { input_tokens: judgeResponse.usage.input_tokens, output_tokens: judgeResponse.usage.output_tokens },
  });
  const judgeText = judgeResponse.content.find((b) => b.type === "text");
  interface JudgeVerdict {
    pass: boolean;
    score_1_to_10: number;
    issues: { quote: string; problem: string }[];
    summary: string;
  }
  let judgeVerdict: JudgeVerdict | null = null;
  const rawJudgeText = judgeText && "text" in judgeText ? judgeText.text : "";
  try {
    const jsonMatch = rawJudgeText.match(/\{[\s\S]*\}/);
    if (jsonMatch) judgeVerdict = JSON.parse(jsonMatch[0]);
  } catch {
    // fall through to failure below
  }
  // The judge can hallucinate a plausible-sounding but nonexistent quote (observed
  // in practice) - only count an issue as grounded if its quote actually appears
  // in the rendered document, so the report can't be misled by a false positive.
  const groundedIssues = (judgeVerdict?.issues ?? []).filter((i) => docText.includes(i.quote));
  const ungroundedCount = (judgeVerdict?.issues.length ?? 0) - groundedIssues.length;
  record(
    "substantive legal quality (LLM judge)",
    Boolean(judgeVerdict?.pass),
    judgeVerdict
      ? `score ${judgeVerdict.score_1_to_10}/10 - ${judgeVerdict.summary}` +
        `${groundedIssues.length ? `\n    grounded issues (quote verified in document):\n` + groundedIssues.map((i) => `      - "${i.quote}" — ${i.problem}`).join("\n") : ""}` +
        `${ungroundedCount ? `\n    (${ungroundedCount} additional issue(s) discarded - quote not found verbatim in the document, likely a judge hallucination)` : ""}`
      : `judge did not return a parseable verdict (stop_reason=${judgeResponse.stop_reason}); raw: ${rawJudgeText.slice(0, 500)}`,
  );

  console.log(`\nExpected filename: ${buildDraftFilename(environment, extractedFields, 1)} (for reference only - actual uses real filled_fields)`);
  console.log(`Rendered file saved locally at: ${docxPath}`);

  printReportAndExit();
}

function printReportAndExit() {
  console.log("\n=== E2E REPORT ===");
  for (const f of findings) console.log(`${f.pass ? "PASS" : "FAIL"}  ${f.criterion} — ${f.detail}`);
  const allPass = findings.every((f) => f.pass);
  console.log(allPass ? "\nAll criteria passed." : "\nSome criteria failed - see above.");
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error("e2e-contract-quality failed:", err);
  process.exit(1);
});
