import "dotenv/config";

import { App } from "@slack/bolt";
import OpenAI from "openai";

import { createToolExecutorContext } from "./toolExecutor.js";
import { runAgentTurn } from "./openaiLoop.js";

const SYSTEM_PROMPT = `You are an HVAC field operations assistant similar to "Viktor": professional, concise, and action-oriented.

You have tools to:
- Query and update Housecall Pro (customers, jobs, estimates, invoices, price book services).
- Run the company's in-repo estimator (run_estimator) for inspection / duct cleaning / tune-up style quotes.
- Generate PDFs: estimate summaries, inspection reports, and duct cleaning reports. When you generate a PDF, tell the user it is attached.

Workflow tips:
- When the user wants a formal proposal in Housecall Pro, use run_estimator to structure line items, optionally align with housecall_list_price_book_services, then housecall_create_estimate with a proper API body (snake_case keys).
- Never invent Housecall Pro IDs; use list/search tools first.
- If Housecall Pro credentials are missing, explain that reads/writes to HCP are unavailable but estimator and PDF tools still work.

Keep Slack replies short; use bullet lists for multiple items.`;

function threadKey(channel: string, threadTs: string | undefined, messageTs: string | undefined): string {
  return `${channel}:${threadTs ?? messageTs ?? "main"}`;
}

function trimMessages(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  max: number,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  if (messages.length <= max) return messages;
  const system = messages[0]?.role === "system" ? [messages[0]] : [];
  const rest = messages[0]?.role === "system" ? messages.slice(1) : messages;
  return [...system, ...rest.slice(-max)];
}

export async function startSlackAgent(): Promise<void> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const appToken = process.env.SLACK_APP_TOKEN;
  const openaiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  if (!botToken || !appToken) {
    throw new Error("Set SLACK_BOT_TOKEN and SLACK_APP_TOKEN (Socket Mode) to run the Slack agent.");
  }

  const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;
  const toolCtx = createToolExecutorContext(process.env);

  const history = new Map<string, OpenAI.Chat.ChatCompletionMessageParam[]>();
  const maxHistory = Number(process.env.SLACK_AGENT_HISTORY_MESSAGES ?? "24") || 24;

  const app = new App({
    token: botToken,
    socketMode: true,
    appToken,
  });

  async function handleUserText(text: string, channel: string, threadTs: string, userId: string, client: App["client"]) {
    const key = threadKey(channel, threadTs, undefined);
    const prior = history.get(key) ?? [
      { role: "system", content: SYSTEM_PROMPT } satisfies OpenAI.Chat.ChatCompletionMessageParam,
    ];

    const userLine = text.replace(/<@[^>]+>/g, "").trim();
    prior.push({ role: "user", content: `<@${userId}>: ${userLine || "(no text)"}` });

    if (!openai) {
      await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text:
          "OPENAI_API_KEY is not set, so I cannot run the Viktor-style tool loop. Configure OpenAI to enable Housecall Pro + estimator + PDF actions from chat.",
      });
      return;
    }

    const messages = trimMessages(prior, maxHistory);
    const { replyText, pdfs } = await runAgentTurn(openai, model, messages, toolCtx);

    const nextHistory = [...prior, { role: "assistant", content: replyText } satisfies OpenAI.Chat.ChatCompletionMessageParam];
    history.set(key, trimMessages(nextHistory, maxHistory + 2));

    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: replyText.slice(0, 35000),
    });

    for (const pdf of pdfs) {
      await client.files.uploadV2({
        channel_id: channel,
        thread_ts: threadTs,
        filename: pdf.filename,
        file: pdf.buffer,
        title: pdf.filename.replace(/\.pdf$/i, ""),
        initial_comment: `Generated PDF: ${pdf.filename}`,
      });
    }
  }

  app.event("app_mention", async ({ event, client }) => {
    if (!event.user) return;
    const channel = event.channel;
    const threadTs = event.thread_ts ?? event.ts;
    const text = "text" in event ? event.text : "";
    await handleUserText(text, channel, threadTs, event.user, client);
  });

  app.event("message", async ({ event, client }) => {
    if ("subtype" in event && event.subtype !== undefined) {
      return;
    }
    if (!("channel" in event) || !("text" in event) || typeof event.text !== "string") {
      return;
    }
    if (!("user" in event) || typeof event.user !== "string") {
      return;
    }
    if ("bot_id" in event && event.bot_id) {
      return;
    }
    const channelType = "channel_type" in event ? event.channel_type : undefined;
    if (channelType !== "im") {
      return;
    }
    const channel = event.channel;
    const threadTs = event.thread_ts ?? event.ts;
    await handleUserText(event.text, channel, threadTs, event.user, client);
  });

  const port = Number(process.env.PORT ?? "3000");
  await app.start(port);
  process.stdout.write(
    `Slack agent (Socket Mode) listening on port ${port}. OpenAI: ${openai ? "on" : "off"}. Housecall Pro: ${toolCtx.housecallClient ? "on" : "off"}.\n`,
  );
}

startSlackAgent().catch((error) => {
  console.error(error);
  process.exit(1);
});
