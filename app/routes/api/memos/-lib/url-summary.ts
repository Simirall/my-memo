import { decodeLinkPreviewHtml } from "@/features/link-preview/server/decode-html";
import { fetchPublicHtml } from "@/features/link-preview/server/fetch-public-html";

export type UrlSummaryFailure = {
  code: string;
  message: string;
};

export type UrlSummaryResult =
  | { ok: true }
  | { ok: false; failure: UrlSummaryFailure };

export type SummaryStreamPayload = {
  message?: string;
  text?: string;
};

export type SummaryStreamEventWriter = (
  event: "chunk" | "status",
  payload: SummaryStreamPayload,
) => Promise<void>;

type WorkersAiStreamPayload = {
  type?: unknown;
  delta?: unknown;
  response?: unknown;
  choices?: Array<{
    delta?: { content?: unknown };
    message?: { content?: unknown };
  }>;
};

const getWorkersAiText = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return "";

  const typedPayload = payload as WorkersAiStreamPayload;
  if (
    typedPayload.type === "response.output_text.delta" &&
    typeof typedPayload.delta === "string"
  ) {
    return typedPayload.delta;
  }

  if (typeof typedPayload.response === "string") {
    return typedPayload.response;
  }

  const firstChoice = typedPayload.choices?.[0];
  const deltaContent = firstChoice?.delta?.content;
  if (typeof deltaContent === "string") return deltaContent;

  const messageContent = firstChoice?.message?.content;
  return typeof messageContent === "string" ? messageContent : "";
};

const readWorkersAiTextStream = async (
  aiStream: ReadableStream,
  onText: (text: string) => Promise<void>,
) => {
  const reader = aiStream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let summary = "";

  const emitData = async (data: string) => {
    const trimmed = data.trim();
    if (!trimmed || trimmed === "[DONE]") return;

    let payload: unknown;
    try {
      payload = JSON.parse(trimmed);
    } catch {
      return;
    }

    const text = getWorkersAiText(payload);
    if (!text) return;

    summary += text;
    await onText(text);
  };

  const emitEvent = async (event: string) => {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart())
      .join("\n");
    await emitData(data);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value instanceof Uint8Array) {
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? "";
        for (const event of events) {
          await emitEvent(event);
        }
        continue;
      }

      const text = getWorkersAiText(value);
      if (text) {
        summary += text;
        await onText(text);
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) await emitEvent(buffer);
  } finally {
    reader.releaseLock();
  }

  return summary;
};

export type GeneratedUrlSummary =
  | {
      ok: true;
      summary: string;
      title: string | undefined;
      htmlText: string;
      finalUrl: string;
    }
  | { ok: false; message: string };

export const generateUrlSummary = async (
  env: CloudflareBindings,
  url: string,
  onText: (text: string) => Promise<void>,
): Promise<GeneratedUrlSummary> => {
  const fetchedHtml = await fetchPublicHtml(url);
  const htmlText = decodeLinkPreviewHtml(
    fetchedHtml.bytes,
    fetchedHtml.headers,
  );
  const [markdown] = await env.AI.toMarkdown([
    {
      name: url,
      blob: new Blob([htmlText], { type: "text/html; charset=utf-8" }),
    },
  ]);
  if (markdown.format === "error") {
    return { ok: false, message: "ページを要約できませんでした。" };
  }

  const title = markdown.data.match(/\s*title:\s*(?<title>.+?)\s*\n[\s\S]*?/m)
    ?.groups?.title;
  const summary = await readWorkersAiTextStream(
    await env.AI.run("@cf/google/gemma-4-26b-a4b-it", {
      messages: [
        {
          role: "user",
          content:
            "以下の内容を、日本語で100文字以下の概要と2~5個の箇条書きで、markdown形式にまとめてください。出力のボリュームは内容に応じて変えてください。出力形式は概要と箇条書きのみとすること。「概要」「要約」などのセクション項目名自体は含めないこと。\n\n" +
            markdown.data,
        },
      ],
      chat_template_kwargs: { enable_thinking: false },
      max_completion_tokens: 1024,
      stream: true,
    }),
    onText,
  );
  return summary
    ? { ok: true, summary, title, htmlText, finalUrl: fetchedHtml.finalUrl }
    : { ok: false, message: "AI要約を作成できませんでした。" };
};
