import type Anthropic from "@anthropic-ai/sdk";

/** Given raw intake JSON + any parsed file text, decide value/confidence per required field. */
export const EXTRACT_FIELDS_TOOL: Anthropic.Tool = {
  name: "extract_fields",
  description:
    "Report which of the environment's required fields were found in the intake data (webhook JSON and/or uploaded file text), and which are missing or ambiguous.",
  input_schema: {
    type: "object",
    properties: {
      extracted: {
        type: "array",
        items: {
          type: "object",
          properties: {
            field_key: { type: "string" },
            value: { type: "string", description: "Stringified value, even for numbers/dates/booleans" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["field_key", "value", "confidence"],
        },
      },
      missing: {
        type: "array",
        items: {
          type: "object",
          properties: {
            field_key: { type: "string" },
            reason: { type: "string" },
          },
          required: ["field_key", "reason"],
        },
      },
    },
    required: ["extracted", "missing"],
  },
};

/**
 * Produces ONE section of the drafted contract as a style-catalog-referencing
 * content tree (see services/document-renderer). Real contracts can be many
 * pages - asking the model for the entire node tree in a single call risked
 * silently truncating mid-generation (hit the token ceiling with no warning)
 * or running past reasonable request durations. Splitting into sections lets
 * each call stay small and fast, and lets progress survive if any one call
 * fails - see lib/ai/chatEngine.ts's section accumulation.
 */
export const SUBMIT_DRAFT_SECTION_TOOL: Anthropic.Tool = {
  name: "submit_draft_section",
  description:
    "Submit ONE section of the contract draft (e.g. a heading and its clauses, or one appendix) as a node array, ready to render. " +
    "Long contracts MUST be split into multiple sections across multiple calls to this tool - never try to fit an entire multi-page " +
    "contract into a single call. Keep each section to a natural chunk you can comfortably produce in one response. " +
    "Set is_final_section to true only on the very last section - all sections submitted so far in this drafting pass are then " +
    "combined in the order you submitted them into one document. Only reference style_name/numId/ilvl values that appear in the " +
    "template's style catalog you were given - never invent new ones. " +
    "NUMBERING: never set both a literal number in `text` (e.g. \"6.3.1 ...\") and numId/ilvl on the same node - that renders the " +
    "number twice. For legal clause numbering, prefer a literal number in `text` and leave numId/ilvl unset - this is the only way " +
    "to preserve an exact numbering scheme with intentional gaps (e.g. clauses removed for a single-tenant version), which Word's " +
    "own auto-numbering cannot do. Reserve numId/ilvl for genuine auto-lists where sequential renumbering is actually desired. " +
    "ALIGNMENT: set `alignment` directly on a node (e.g. \"center\" for a title, a date line, or a signature block) rather than " +
    "assuming a style_name implies a particular alignment - most templates apply alignment directly on the paragraph, not via a style.",
  input_schema: {
    type: "object",
    properties: {
      section_title: {
        type: "string",
        description: "Short label for this section, shown to the lawyer as live progress (e.g. 'מבוא והגדרות').",
      },
      nodes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["paragraph", "heading", "numbered_clause", "table"] },
            style_name: { type: "string" },
            text: { type: "string" },
            numId: { type: "integer" },
            ilvl: { type: "integer" },
            alignment: { type: "string", enum: ["left", "center", "right", "justify"] },
            rows: { type: "array", items: { type: "array", items: { type: "string" } } },
          },
          required: ["type"],
        },
      },
      is_final_section: { type: "boolean", description: "True only for the last section of the whole document." },
      filled_fields: { type: "object", description: "field_key -> value actually used in this section - merged across all sections" },
      open_issues: {
        type: "array",
        items: { type: "string" },
        description: "Anything the lawyer should double-check before sending this out - can be added on any section, merged across all",
      },
    },
    required: ["nodes", "is_final_section"],
  },
};

/** Raised when the lawyer's answer reveals a house-rule the guidelines don't cover yet. */
export const PROPOSE_GUIDELINE_UPDATE_TOOL: Anthropic.Tool = {
  name: "propose_guideline_update",
  description:
    "Propose folding the lawyer's answer into this Contract Environment's guidelines, so future contracts already reflect it. The lawyer will accept or reject this in the chat UI.",
  input_schema: {
    type: "object",
    properties: {
      topic: { type: "string" },
      proposed_addition: { type: "string" },
      rationale: { type: "string" },
    },
    required: ["topic", "proposed_addition", "rationale"],
  },
};

export const CHAT_TOOLS: Anthropic.Tool[] = [SUBMIT_DRAFT_SECTION_TOOL, PROPOSE_GUIDELINE_UPDATE_TOOL];
