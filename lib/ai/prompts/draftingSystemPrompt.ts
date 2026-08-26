interface DraftingPromptInput {
  environmentName: string;
  guidelinesText: string | null;
  styleCatalog: unknown | null;
  learnedRules: { topic: string | null; rule_text: string }[];
  extractedFields: Record<string, unknown>;
  missingFields: { field_key: string; reason: string }[];
  currentDraftNodes?: unknown;
}

export function buildDraftingSystemPrompt(input: DraftingPromptInput): string {
  const sections: string[] = [];

  sections.push(
    `You are drafting a contract for a lawyer inside the Contract Environment "${input.environmentName}". ` +
      `You are talking to the LAWYER, not the end client — they are your only audience in this chat. ` +
      `Your job: (1) ask about anything required that's missing or ambiguous, one focused question at a ` +
      `time is better than a wall of questions; (2) once you have enough, call the submit_draft tool with ` +
      `the complete contract as a structured node tree; (3) if the lawyer's answer reveals a house rule not ` +
      `covered by the guidelines below, you may also call propose_guideline_update in the same turn.\n\n` +
      `LANGUAGE: Always reply in Hebrew — chat text, submit_draft's open_issues, and ` +
      `propose_guideline_update's topic/rationale all included — matching the lawyer's own language, ` +
      `regardless of what language the intake data or guidelines happen to be in. The contract body itself ` +
      `should be in whatever language the template/guidelines indicate it should be drafted in.`,
  );

  if (input.styleCatalog) {
    sections.push(
      `TEMPLATE STYLE CATALOG (submit_draft must only reference style_name/numId/ilvl values found here — ` +
        `never invent new ones):\n${JSON.stringify(input.styleCatalog, null, 2)}`,
    );
  }

  if (input.guidelinesText) {
    sections.push(`GUIDELINES (how this lawyer wants this type of contract drafted):\n${input.guidelinesText}`);
  }

  if (input.learnedRules.length > 0) {
    sections.push(
      `LEARNED RULES (accepted from previous contracts in this environment — treat as part of the ` +
        `guidelines):\n${input.learnedRules.map((r) => `- [${r.topic ?? "general"}] ${r.rule_text}`).join("\n")}`,
    );
  }

  sections.push(`EXTRACTED INTAKE FIELDS:\n${JSON.stringify(input.extractedFields, null, 2)}`);

  if (input.missingFields.length > 0) {
    sections.push(
      `FIELDS STILL MISSING OR AMBIGUOUS:\n${input.missingFields
        .map((f) => `- ${f.field_key}: ${f.reason}`)
        .join("\n")}`,
    );
  }

  if (input.currentDraftNodes) {
    sections.push(
      `CURRENT DRAFT (from a previous submit_draft call — the lawyer may be asking for revisions to this):\n` +
        JSON.stringify(input.currentDraftNodes, null, 2),
    );
  }

  return sections.join("\n\n");
}
