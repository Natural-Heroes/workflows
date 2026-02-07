import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";

export interface ActivitySender {
  sendActivity(params: {
    sessionId: string;
    type: "thought" | "action" | "response" | "error";
    content: string;
    action?: string;
  }): Promise<void>;
}

const BATCH_INTERVAL_MS = 5_000;

/** Create an event handler that maps Pi session events to Linear activities. */
export function createEventMapper(
  sessionId: string,
  sender: ActivitySender,
): (event: AgentSessionEvent) => void {
  let textBuffer = "";
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  function send(
    type: "thought" | "action" | "response" | "error",
    content: string,
    action?: string,
  ): void {
    sender.sendActivity({ sessionId, type, content, action }).catch((err: unknown) => {
      console.error("[event-mapper] Failed to send activity:", err);
    });
  }

  function flushText(): void {
    if (textBuffer) {
      send("thought", textBuffer);
      textBuffer = "";
    }
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  }

  function scheduleFlush(): void {
    if (!flushTimer) {
      flushTimer = setTimeout(flushText, BATCH_INTERVAL_MS);
    }
  }

  return (event: AgentSessionEvent) => {
    switch (event.type) {
      case "turn_start":
        // Flush any accumulated text from a previous turn
        flushText();
        break;

      case "message_update": {
        const assistantEvent = event.assistantMessageEvent;
        if (assistantEvent.type === "text_delta") {
          textBuffer += assistantEvent.delta;
          scheduleFlush();
        }
        break;
      }

      case "tool_execution_start": {
        // Flush text before reporting tool execution
        flushText();
        const argsSummary = summarizeArgs(event.args);
        send("action", argsSummary || event.toolName, event.toolName);
        break;
      }

      case "tool_execution_end":
        if (event.isError) {
          send("error", `Tool ${event.toolName} failed`);
        }
        break;

      case "agent_end":
        flushText();
        // Don't send response here — the worker sends the final response with PR info
        break;
    }
  };
}

function summarizeArgs(args: unknown): string {
  if (args == null) return "";
  try {
    const json = JSON.stringify(args);
    if (json.length <= 200) return `: ${json}`;
    return `: ${json.slice(0, 197)}...`;
  } catch {
    return "";
  }
}
