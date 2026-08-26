import { createClaudeClient, EXTRACTION_MODEL } from "@/lib/ai/claudeClient";
import { buildFieldExtractionSystemPrompt } from "@/lib/ai/prompts/fieldExtractionPrompt";
import { EXTRACT_FIELDS_TOOL } from "@/lib/ai/tools";

export interface FieldDefinitionForExtraction {
  field_key: string;
  label: string;
  data_type: string;
  is_required: boolean;
  description: string | null;
  extraction_hints: string | null;
}

export interface ExtractedField {
  field_key: string;
  value: string;
  confidence: number;
}

export interface MissingField {
  field_key: string;
  reason: string;
}

export interface FieldExtractionResult {
  extracted: ExtractedField[];
  missing: MissingField[];
  usage: { input_tokens: number; output_tokens: number };
}

export async function extractFields(input: {
  fieldDefinitions: FieldDefinitionForExtraction[];
  rawPayload: unknown;
  fileTexts: { filename: string; text: string }[];
}): Promise<FieldExtractionResult> {
  const claude = createClaudeClient();

  const userContent = [
    `REQUIRED FIELDS:\n${JSON.stringify(input.fieldDefinitions, null, 2)}`,
    `RAW WEBHOOK PAYLOAD:\n${JSON.stringify(input.rawPayload ?? {}, null, 2)}`,
    ...input.fileTexts.map((f) => `TEXT EXTRACTED FROM "${f.filename}":\n${f.text.slice(0, 20000)}`),
  ].join("\n\n");

  const response = await claude.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 4096,
    system: buildFieldExtractionSystemPrompt(),
    tools: [EXTRACT_FIELDS_TOOL],
    tool_choice: { type: "tool", name: "extract_fields" },
    messages: [{ role: "user", content: userContent }],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return an extract_fields tool call");
  }

  return {
    ...(toolUse.input as Omit<FieldExtractionResult, "usage">),
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
}
