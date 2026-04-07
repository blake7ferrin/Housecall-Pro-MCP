import OpenAI from "openai";

import { executeToolCall, openAiTools, type ToolExecutorContext, type ToolExecutorResult } from "./toolExecutor.js";

const MAX_TOOL_ROUNDS = 8;

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}") as unknown;
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export type ChatLoopResult = {
  replyText: string;
  pdfs: { filename: string; buffer: Buffer }[];
};

export async function runAgentTurn(
  openai: OpenAI,
  model: string,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  toolCtx: ToolExecutorContext,
): Promise<ChatLoopResult> {
  const pdfs: { filename: string; buffer: Buffer }[] = [];
  let round = 0;
  const working = [...messages];

  while (round < MAX_TOOL_ROUNDS) {
    round += 1;
    const completion = await openai.chat.completions.create({
      model,
      messages: working,
      tools: openAiTools,
      tool_choice: "auto",
    });

    const choice = completion.choices[0];
    const msg = choice?.message;
    if (!msg) {
      return { replyText: "No response from the model.", pdfs };
    }

    const toolCalls = msg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const text = msg.content?.trim() || "(empty)";
      return { replyText: text, pdfs };
    }

    working.push({
      role: "assistant",
      content: msg.content,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      if (call.type !== "function") continue;
      const name = call.function.name;
      const args = parseArgs(call.function.arguments);
      const result: ToolExecutorResult = await executeToolCall(name, args, toolCtx);
      if (result.pdf) {
        pdfs.push(result.pdf);
      }
      working.push({
        role: "tool",
        tool_call_id: call.id,
        content: result.text,
      });
    }
  }

  return {
    replyText: "Stopped after too many tool rounds. Please narrow the request or try again.",
    pdfs,
  };
}
