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

/** Produces the drafted contract as a style-catalog-referencing content tree (see services/document-renderer). */
export const SUBMIT_DRAFT_TOOL: Anthropic.Tool = {
  name: "submit_draft",
  description:
    "Submit a complete contract draft, ready to render. Only reference style_name/numId/ilvl values that appear in the template's style catalog you were given - never invent new ones.",
  input_schema: {
    type: "object",
    properties: {
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
            rows: { type: "array", items: { type: "array", items: { type: "string" } } },
          },
          required: ["type"],
        },
      },
      filled_fields: { type: "object", description: "field_key -> value actually used in the draft" },
      open_issues: {
        type: "array",
        items: { type: "string" },
        description: "Anything the lawyer should double-check before sending this out",
      },
    },
    required: ["nodes"],
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

export const CHAT_TOOLS: Anthropic.Tool[] = [SUBMIT_DRAFT_TOOL, PROPOSE_GUIDELINE_UPDATE_TOOL];
