interface DraftingPromptInput {
  environmentName: string;
  guidelinesText: string | null;
  styleCatalog: unknown | null;
  learnedRules: { topic: string | null; rule_text: string }[];
  extractedFields: Record<string, unknown>;
  missingFields: { field_key: string; reason: string }[];
  currentDraftNodes?: unknown;
  /** Sections already submitted in the CURRENT, not-yet-finalized drafting pass - see chatEngine.ts. */
  draftInProgress?: { nodes: unknown[]; filled_fields: Record<string, unknown>; open_issues: string[] };
}

export function buildDraftingSystemPrompt(input: DraftingPromptInput): string {
  const sections: string[] = [];

  sections.push(
    `You are drafting a contract for a lawyer inside the Contract Environment "${input.environmentName}". ` +
      `You are talking to the LAWYER, not the end client - they are your only audience in this chat. ` +
      `Your job: (1) ask about anything required that's missing or ambiguous, one focused question at a ` +
      `time is better than a wall of questions; (2) once you have enough, draft the contract by calling ` +
      `submit_draft_section - for anything beyond a very short document, split it into logical sections ` +
      `(e.g. one heading and its clauses, or one appendix) and call the tool once per section, across ` +
      `multiple turns, rather than producing the whole document in a single call; set is_final_section to ` +
      `true only on the last section, after which everything you submitted this pass is combined in order ` +
      `into the final document; (3) if the lawyer's answer reveals a house rule not covered by the ` +
      `guidelines below, you may also call propose_guideline_update in the same turn.\n\n` +
      `SECTIONING: Each turn you should submit exactly the sections you can comfortably produce in that ` +
      `response, then stop - you'll be called again automatically to continue with the next section, with ` +
      `no need to wait for the lawyer. Never repeat a section you already submitted this pass, and never ` +
      `try to cram an entire multi-page contract's nodes into one call - that has previously caused the ` +
      `whole draft to silently fail. Splitting into sections is purely so each individual call stays small ` +
      `and reliable - you are still the single author of one coherent document: before every section, check ` +
      `the DRAFT SO FAR below (when present) so terminology, defined terms, numbering, and cross-references ` +
      `stay consistent with what you already wrote, and the finished contract reads as one continuous work, ` +
      `not disconnected fragments.\n\n` +
      `LANGUAGE: Always reply in Hebrew - chat text, submit_draft_section's open_issues, and ` +
      `propose_guideline_update's topic/rationale all included - matching the lawyer's own language, ` +
      `regardless of what language the intake data or guidelines happen to be in. The contract body itself ` +
      `should be in whatever language the template/guidelines indicate it should be drafted in.`,
  );

  if (input.styleCatalog) {
    sections.push(
      `TEMPLATE STYLE CATALOG (submit_draft_section must only reference style_name/numId/ilvl values found ` +
        `here - never invent new ones):\n${JSON.stringify(input.styleCatalog, null, 2)}`,
    );
  }

  if (input.guidelinesText) {
    sections.push(`GUIDELINES (how this lawyer wants this type of contract drafted):\n${input.guidelinesText}`);
  }

  if (input.learnedRules.length > 0) {
    sections.push(
      `LEARNED RULES (accepted from previous contracts in this environment - treat as part of the ` +
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

  if (input.draftInProgress) {
    sections.push(
      `DRAFT SO FAR (sections you have already submitted THIS drafting pass, in order - this is the actual content, ` +
        `not a summary. Review it for consistency - matching terminology, defined terms, numbering, no duplicated or ` +
        `contradicted content - before adding the next section. The final document will be exactly this plus whatever ` +
        `you submit now, in the order submitted. Never resubmit anything already here:\n` +
        `${JSON.stringify(input.draftInProgress.nodes, null, 2)}\n\n` +
        `FIELDS ALREADY USED THIS PASS:\n${JSON.stringify(input.draftInProgress.filled_fields, null, 2)}`,
    );
  }

  if (input.currentDraftNodes) {
    sections.push(
      `CURRENT DRAFT (from a previous submit_draft call - the lawyer may be asking for revisions to this):\n` +
        JSON.stringify(input.currentDraftNodes, null, 2),
    );
  }

  return sections.join("\n\n");
}
