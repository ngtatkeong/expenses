// Shared LLM client for every AI-assisted feature in this app. Single
// source of truth for "is AI on" (DEEPSEEK_API_KEY) and the model id, so
// every feature turns on/off together and points at the same model.
// Same DeepSeek-via-OpenAI-SDK setup used in the Secretary app.

import OpenAI from "openai";

let client: OpenAI | null = null;
function getClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: "https://api.deepseek.com",
    });
  }
  return client;
}

export function isLlmConfigured() {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

function getModel() {
  return process.env.LLM_MODEL || "deepseek-chat";
}

interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

// Every AI feature uses forced structured output (a single tool,
// tool_choice forced to it) so the response is always well-formed JSON
// matching the given schema, never prose to parse or trust blindly.
export async function callStructured<T = unknown>({
  system,
  userText,
  tool,
  maxTokens = 1536,
}: {
  system: string;
  userText: string;
  tool: ToolSpec;
  maxTokens?: number;
}): Promise<T> {
  const completion = await getClient().chat.completions.create({
    model: getModel(),
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userText },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
        },
      },
    ],
    tool_choice: { type: "function", function: { name: tool.name } },
  });

  const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function") {
    throw new Error("Model did not return structured output");
  }
  return JSON.parse(toolCall.function.arguments);
}
