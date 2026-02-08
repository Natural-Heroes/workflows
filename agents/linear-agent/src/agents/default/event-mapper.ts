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

// Tools that only read — skip these to reduce noise in the Linear feed
const SILENT_TOOLS = new Set(["read", "glob", "grep", "ls"]);

// Regex to strip worktree prefix: /tmp/hero-{uuid}/
const WORKTREE_PREFIX_RE = /\/tmp\/hero-[a-f0-9-]+\//g;

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
        const toolName = event.toolName.toLowerCase();

        // Skip read-only tools — they create noise without useful signal
        if (SILENT_TOOLS.has(toolName)) break;

        // Flush text before reporting tool execution
        flushText();
        const summary = formatToolAction(event.toolName, event.args);
        send("action", summary, event.toolName);
        break;
      }

      case "tool_execution_end":
        // Tool errors are normal agent behavior (e.g. command not found, non-zero exit).
        // The agent handles retries internally. Report as thought, not error —
        // error activities break the Linear UI and trigger notifications.
        if (event.isError && !SILENT_TOOLS.has(event.toolName.toLowerCase())) {
          send("thought", `${event.toolName} returned an error — agent is handling it`);
        }
        break;

      case "agent_end":
        flushText();
        // Don't send response here — the worker sends the final response with PR info
        break;
    }
  };
}

/** Format a tool execution into a human-readable summary. */
function formatToolAction(toolName: string, args: unknown): string {
  const parsed = args as Record<string, unknown> | null;
  if (!parsed) return toolName;

  const name = toolName.toLowerCase();

  if (name === "bash") {
    const command = String(parsed.command ?? "");
    return `bash: ${stripWorktree(command)}`;
  }

  if (name === "edit") {
    const path = stripWorktree(String(parsed.file_path ?? parsed.path ?? ""));
    return `edit: ${path}`;
  }

  if (name === "write") {
    const path = stripWorktree(String(parsed.file_path ?? parsed.path ?? ""));
    return `write: ${path}`;
  }

  // Fallback for unknown tools
  const summary = JSON.stringify(args);
  const clean = stripWorktree(summary.length <= 200 ? summary : summary.slice(0, 197) + "...");
  return `${toolName}: ${clean}`;
}

/** Remove worktree path prefix to show repo-relative paths. */
function stripWorktree(text: string): string {
  return text.replace(WORKTREE_PREFIX_RE, "");
}
