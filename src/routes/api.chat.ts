import { createFileRoute } from "@tanstack/react-router";
import { toServerSentEventsResponse } from "@tanstack/ai";

import { getAuthOrDevAuth } from "../lib/devAuth";
import { gatewayTimeoutSeconds } from "../services/aiGateway";
import { streamAssistantReply, type ChatTurn } from "../server/assistant.agent";

/**
 * Assistant chat endpoint.
 *
 * Stateless by design: the browser owns the transcript and posts it back on
 * every turn. This handler rebuilds a fresh pi agent session from those turns,
 * runs one prompt, and streams AG-UI chunks the client's `useChat` already
 * understands.
 *
 * The agent itself lives in `server/assistant.agent.ts`.
 */

type IncomingMessage = {
  role?: string;
  content?: unknown;
  parts?: Array<Record<string, unknown>>;
};

type ChatBody = {
  messages?: IncomingMessage[];
  forwardedProps?: { message?: string };
  data?: { message?: string };
};

function textOf(message: IncomingMessage) {
  if (typeof message.content === "string") return message.content.trim();
  if (Array.isArray(message.parts)) {
    return message.parts
      .map((part) =>
        part && part.type === "text" && typeof part.content === "string"
          ? part.content
          : "",
      )
      .join("")
      .trim();
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) =>
        part && typeof part === "object" && "text" in part
          ? String((part as { text?: unknown }).text ?? "")
          : "",
      )
      .join("")
      .trim();
  }
  return "";
}

/** Split the posted transcript into prior turns plus the new question. */
function readTranscript(body: ChatBody) {
  const turns: ChatTurn[] = [];

  for (const message of Array.isArray(body.messages) ? body.messages : []) {
    const role =
      message.role === "assistant" ? "assistant" : message.role === "user" ? "user" : null;
    if (!role) continue;
    const text = textOf(message);
    if (text) turns.push({ role, text });
  }

  // The last user turn is the question; everything before it is context.
  let question = "";
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (turns[index].role === "user") {
      question = turns[index].text;
      turns.splice(index, 1);
      break;
    }
  }

  if (!question) {
    const fallback = body.forwardedProps?.message ?? body.data?.message ?? "";
    question = fallback.trim();
  }

  return { history: turns, question };
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { userId } = await getAuthOrDevAuth();
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const ownerId = userId;

        let body: ChatBody;
        try {
          body = (await request.json()) as ChatBody;
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const { history, question } = readTranscript(body);
        if (!question) return Response.json({ error: "No user message" }, { status: 400 });

        const abortController = new AbortController();
        const timeout = setTimeout(
          () => abortController.abort(),
          gatewayTimeoutSeconds() * 1000,
        );
        // A browser "stop" or navigating away should abort the agent run too.
        request.signal.addEventListener("abort", () => abortController.abort(), {
          once: true,
        });

        async function* withTimeoutCleanup() {
          try {
            yield* streamAssistantReply({
              userId: ownerId,
              history,
              question,
              signal: abortController.signal,
            });
          } finally {
            clearTimeout(timeout);
          }
        }

        return toServerSentEventsResponse(withTimeoutCleanup(), { abortController });
      },
    },
  },
});
