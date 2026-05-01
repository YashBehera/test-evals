export type PromptStrategy = "zero_shot" | "few_shot" | "cot";

type ExamplePair = {
  user: string;
  assistant: string;
};

type StrategyDefinition = {
  name: PromptStrategy;
  systemPrompt: string;
  examples: ExamplePair[];
};

const sharedSystemPrompt =
  "You are a clinical extraction engine. " +
  "Return a single tool call that conforms exactly to the provided JSON Schema. " +
  "Use null for unknown or missing values. Do not add extra fields.";

const zeroShot: StrategyDefinition = {
  name: "zero_shot",
  systemPrompt:
    sharedSystemPrompt +
    " Extract directly from the transcript without adding anything not stated.",
  examples: [],
};

const fewShot: StrategyDefinition = {
  name: "few_shot",
  systemPrompt:
    sharedSystemPrompt +
    " Follow the style in the examples and keep fields concise.",
  examples: [
    {
      user:
        "Transcript:\n" +
        "Doctor: What's going on?\n" +
        "Patient: I have a sore throat and a fever since yesterday.\n" +
        "Doctor: Temp is 101.2, HR 98, BP 118/76, SpO2 98.\n" +
        "Doctor: We'll do a rapid strep test and start acetaminophen 500 mg twice daily by mouth.\n" +
        "Doctor: Follow up in 7 days if not better.",
      assistant:
        "Example tool input (abbreviated):\n" +
        "{\n" +
        "  \"chief_complaint\": \"sore throat and fever\",\n" +
        "  \"vitals\": { \"bp\": \"118/76\", \"hr\": 98, \"temp_f\": 101.2, \"spo2\": 98 },\n" +
        "  \"medications\": [\n" +
        "    { \"name\": \"acetaminophen\", \"dose\": \"500 mg\", \"frequency\": \"twice daily\", \"route\": \"PO\" }\n" +
        "  ],\n" +
        "  \"diagnoses\": [ { \"description\": \"sore throat\" } ],\n" +
        "  \"plan\": [ \"Rapid strep test\" ],\n" +
        "  \"follow_up\": { \"interval_days\": 7, \"reason\": \"if not improving\" }\n" +
        "}",
    },
  ],
};

const chainOfThought: StrategyDefinition = {
  name: "cot",
  systemPrompt:
    sharedSystemPrompt +
    " Think step-by-step silently to ensure completeness, but only return the tool call.",
  examples: [],
};

const STRATEGIES: Record<PromptStrategy, StrategyDefinition> = {
  zero_shot: zeroShot,
  few_shot: fewShot,
  cot: chainOfThought,
};

export function getStrategy(strategy: PromptStrategy) {
  return STRATEGIES[strategy];
}

export function getPromptHash(strategy: PromptStrategy): string {
  const definition = getStrategy(strategy);
  const content = JSON.stringify({
    systemPrompt: definition.systemPrompt,
    examples: definition.examples,
  });
  
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(content);
  return hasher.digest("hex").slice(0, 12); // Use first 12 chars for readability
}
