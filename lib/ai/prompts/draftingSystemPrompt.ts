interface DraftingPromptInput {
  environmentName: string;
  guidelinesText: string | null;
  styleCatalog: unknown | null;
  learnedRules: { topic: string | null; rule_text: string }[];
  extractedFields: Record<string, unknown>;
  missingFields: { field_key: string; reason: string }[];
  /** Sections already submitted in the CURRENT, not-yet-finalized drafting pass - see chatEngine.ts. */
  draftInProgress?: { sections: { section_title: string | null; nodes: unknown[] }[]; filled_fields: Record<string, unknown> };
}

/**
 * Split three ways so the caller (chatEngine.ts) can place prompt-cache
 * breakpoints correctly:
 *
 * - `static` is identical across every turn of a contract's whole drafting
 *   pass (same guidelines, style catalog, intake fields) - always cached.
 * - `draftSectionBlocks` is one IMMUTABLE block per already-submitted
 *   section, in submission order. Each block's content never changes once
 *   written - only new blocks get appended as more sections are submitted.
 *   This is what makes caching actually work across a multi-turn drafting
 *   pass: the cache breakpoint moves to the new last block each turn, and
 *   everything before it is a byte-for-byte match to what was cached the
 *   turn before, so the API serves the growing prefix as a cheap cache read
 *   instead of rewriting all of it from scratch every turn. (Earlier this
 *   was one big `JSON.stringify(allNodesSoFar)` blob rebuilt every turn -
 *   since it changed every time, no turn after the first ever got a cache
 *   hit on it, and every turn paid the ~1.25x cache-WRITE premium on the
 *   entire growing draft instead of the ~0.1x cache-READ price.)
 * - `trailing` is small and always rebuilt fresh (fields used so far) -
 *   kept OUT of the cached prefix so it never invalidates the section
 *   blocks just by changing.
 *
 * This is a pure cost/packaging optimization: the model sees exactly the
 * same content either way, just split so the stable part can be billed
 * once instead of on every turn.
 */
export function buildDraftingSystemPrompt(input: DraftingPromptInput): {
  static: string;
  draftSectionBlocks: string[];
  trailing: string | null;
} {
  const staticSections: string[] = [];

  staticSections.push(
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
      `SECTIONING: Each call to submit_draft_section is real, billable overhead on top of whatever it ` +
      `contains - re-sending the full prompt, tool definitions, and everything drafted so far. Prefer ` +
      `FEWER, LARGER calls: aim for a substantial chunk each time - several headings/clauses, or a full ` +
      `appendix - rather than one small heading at a time; small, cautious sections directly cost the ` +
      `lawyer money for no benefit. That said, there's no need to push all the way to your absolute output ` +
      `limit on every call either - a natural, well-sized chunk you're confident you can produce cleanly is ` +
      `better than stretching for the maximum possible length. Splitting into multiple sections exists ` +
      `purely so no single call risks failing outright on a very large document - it is not a target to aim ` +
      `for. ` +
      `You are still the single author of one coherent document: before every call, check the DRAFT SO FAR ` +
      `below (when present) so terminology, defined terms, numbering, and cross-references stay consistent ` +
      `with what you already wrote, and the finished contract reads as one continuous work, not disconnected ` +
      `fragments. Never repeat a section you already submitted this pass.\n\n` +
      `LANGUAGE: Always reply in Hebrew - chat text, submit_draft_section's open_issues, and ` +
      `propose_guideline_update's topic/rationale all included - matching the lawyer's own language, ` +
      `regardless of what language the intake data or guidelines happen to be in. The contract body itself ` +
      `should be in whatever language the template/guidelines indicate it should be drafted in.`,
  );

  if (input.styleCatalog) {
    staticSections.push(
      `TEMPLATE STYLE CATALOG (submit_draft_section must only reference style_name/numId/ilvl values found ` +
        `here - never invent new ones):\n${JSON.stringify(input.styleCatalog, null, 2)}`,
    );
  }

  if (input.guidelinesText) {
    staticSections.push(`GUIDELINES (how this lawyer wants this type of contract drafted):\n${input.guidelinesText}`);
  }

  if (input.learnedRules.length > 0) {
    staticSections.push(
      `LEARNED RULES (accepted from previous contracts in this environment - treat as part of the ` +
        `guidelines):\n${input.learnedRules.map((r) => `- [${r.topic ?? "general"}] ${r.rule_text}`).join("\n")}`,
    );
  }

  staticSections.push(`EXTRACTED INTAKE FIELDS:\n${JSON.stringify(input.extractedFields, null, 2)}`);

  if (input.missingFields.length > 0) {
    staticSections.push(
      `FIELDS STILL MISSING OR AMBIGUOUS:\n${input.missingFields
        .map((f) => `- ${f.field_key}: ${f.reason}`)
        .join("\n")}`,
    );
  }

  const draftSectionBlocks = (input.draftInProgress?.sections ?? []).map(
    (section, i) =>
      `DRAFT SECTION ${i + 1}${section.section_title ? ` - ${section.section_title}` : ""} (already submitted ` +
      `THIS drafting pass, in order - this is the actual content, not a summary. Review it for consistency - ` +
      `matching terminology, defined terms, numbering, no duplicated or contradicted content - before adding ` +
      `the next section. The final document will be exactly these sections plus whatever you submit now, in ` +
      `the order submitted. Never resubmit anything already here:\n${JSON.stringify(section.nodes, null, 2)}`,
  );

  const trailing =
    input.draftInProgress && Object.keys(input.draftInProgress.filled_fields).length > 0
      ? `FIELDS ALREADY USED THIS DRAFTING PASS:\n${JSON.stringify(input.draftInProgress.filled_fields, null, 2)}`
      : null;

  return { static: staticSections.join("\n\n"), draftSectionBlocks, trailing };
}
