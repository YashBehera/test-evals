import Anthropic from "@anthropic-ai/sdk";

import { getStrategy, getPromptHash, type PromptStrategy } from "./strategies";
export { getPromptHash, type PromptStrategy };

type CacheControl = { type: "ephemeral" | "persistent" };
type TextBlock = {
  type: "text";
  text: string;
  cache_control?: CacheControl;
};

type LocalMessageParam = {
  role: "user" | "assistant";
  content: TextBlock[];
};

type ToolUseBlock = {
  type: "tool_use";
  name: string;
  input: unknown;
};

type UsageStats = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_write_input_tokens?: number;
};

export type ExtractionAttempt = {
  responseId?: string;
  usage: UsageStats;
  toolInput: unknown | null;
  rawContent: unknown;
};

export type ExtractionRequest = {
  apiKey: string;
  model: string;
  strategy: PromptStrategy;
  transcript: string;
  schema: unknown;
  validationErrors?: string[];
  previousOutput?: unknown;
};

const TOOL_NAME = "submit_extraction";

function toCacheBlock(text: string, cacheControl: CacheControl): TextBlock {
  return {
    type: "text",
    text,
    cache_control: cacheControl,
  };
}

function buildSystemBlocks(strategy: PromptStrategy) {
  const definition = getStrategy(strategy);
  return [toCacheBlock(definition.systemPrompt, { type: "persistent" })];
}

function buildFewShotMessages(strategy: PromptStrategy): LocalMessageParam[] {
  const definition = getStrategy(strategy);

  return definition.examples.flatMap((example) => [
    {
      role: "user",
      content: [toCacheBlock(example.user, { type: "persistent" })],
    },
    {
      role: "assistant",
      content: [toCacheBlock(example.assistant, { type: "persistent" })],
    },
  ]);
}

function buildUserMessage(
  transcript: string,
  validationErrors?: string[],
  previousOutput?: unknown,
): LocalMessageParam {
  const sections: string[] = ["Transcript:", transcript.trim()];

  if (validationErrors && validationErrors.length > 0) {
    sections.push(
      "Validation errors from the previous attempt:",
      validationErrors.map((error) => `- ${error}`).join("\n"),
    );
  }

  if (previousOutput) {
    sections.push(
      "Previous output that failed validation:",
      JSON.stringify(previousOutput, null, 2),
    );
  }

  sections.push(
    "Return corrected output using the tool call. " +
      "Only include fields supported by the schema.",
  );

  return {
    role: "user",
    content: [toCacheBlock(sections.join("\n\n"), { type: "ephemeral" })],
  };
}

function getToolUse(content: unknown): ToolUseBlock | null {
  if (!Array.isArray(content)) {
    return null;
  }

  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      "type" in block &&
      (block as { type: string }).type === "tool_use" &&
      (block as { name?: string }).name === TOOL_NAME
    ) {
      return block as ToolUseBlock;
    }
  }

  return null;
}

export async function extractWithStrategy(
  request: ExtractionRequest,
): Promise<ExtractionAttempt> {
  const client = new Anthropic({ apiKey: request.apiKey });
  const tool = {
    name: TOOL_NAME,
    description:
      "Submit the clinical extraction JSON object that matches the schema.",
    input_schema: request.schema,
  };

  type MessageCreateParams = Parameters<Anthropic["messages"]["create"]>[0];

  const response = (await client.messages.create({
    model: request.model,
    max_tokens: 1200,
    temperature: 0.2,
    system: buildSystemBlocks(request.strategy),
    messages: [
      ...buildFewShotMessages(request.strategy),
      buildUserMessage(
        request.transcript,
        request.validationErrors,
        request.previousOutput,
      ),
    ],
    tools: [tool],
    tool_choice: { type: "tool", name: TOOL_NAME },
  } as unknown as MessageCreateParams)) as {
    id?: string;
    content?: unknown;
    usage?: UsageStats;
  };

  const toolUse = getToolUse(response.content);

  return {
    responseId: response.id,
    usage: response.usage ?? {},
    toolInput: toolUse?.input ?? null,
    rawContent: response.content ?? null,
  };
}
