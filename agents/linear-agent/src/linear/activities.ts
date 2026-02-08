import { readFile, stat } from "node:fs/promises";
import type Bottleneck from "bottleneck";
import type { TokenManager } from "../oauth/token-manager.js";

type ActivityType = "thought" | "action" | "response" | "error" | "elicitation";

const ACTIVITY_MUTATION = `
  mutation AgentActivityCreate($input: AgentActivityCreateInput!) {
    agentActivityCreate(input: $input) {
      success
    }
  }
`;

const SESSION_QUERY = `
  query AgentSession($id: String!) {
    agentSession(id: $id) {
      id
      status
      stoppedAt
      endedAt
    }
  }
`;

const FILE_UPLOAD_MUTATION = `
  mutation FileUpload($contentType: String!, $filename: String!, $size: Int!) {
    fileUpload(contentType: $contentType, filename: $filename, size: $size) {
      uploadFile {
        uploadUrl
        assetUrl
        headers {
          key
          value
        }
      }
    }
  }
`;

const COMMENT_CREATE_MUTATION = `
  mutation CommentCreate($input: CommentCreateInput!) {
    commentCreate(input: $input) {
      success
    }
  }
`;

const SESSION_CREATE_ON_ISSUE = `
  mutation AgentSessionCreateOnIssue($input: AgentSessionCreateOnIssue!) {
    agentSessionCreateOnIssue(input: $input) {
      success
      agentSession { id }
    }
  }
`;

/** Wraps Linear Agent Activities GraphQL API with rate limiting and error handling. */
export class AgentActivities {
  private readonly tokenManager: TokenManager;
  private readonly rateLimiter: Bottleneck;

  constructor(tokenManager: TokenManager, rateLimiter: Bottleneck) {
    this.tokenManager = tokenManager;
    this.rateLimiter = rateLimiter;
  }

  /** Sends an agent activity event to Linear. Errors are logged but not thrown. */
  async sendActivity(params: {
    sessionId: string;
    type: ActivityType | string;
    content: string;
    /** For action activities: the tool/action name */
    action?: string;
    ephemeral?: boolean;
  }): Promise<void> {
    const { sessionId, type, content, ephemeral, action } = params;

    let activityContent: Record<string, unknown>;
    if (type === "action") {
      activityContent = { type, action: action ?? content, parameter: content };
    } else {
      activityContent = { type, body: content };
    }

    const input: Record<string, unknown> = {
      agentSessionId: sessionId,
      content: activityContent,
    };
    if (ephemeral != null) input.ephemeral = ephemeral;

    try {
      await this.rateLimiter.schedule(async () => {
        const token = await this.tokenManager.getAccessToken();

        const res = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            query: ACTIVITY_MUTATION,
            variables: { input },
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          console.error(`Agent activity request failed (${res.status}): ${body}`);
          return;
        }

        const json = (await res.json()) as { errors?: Array<{ message: string }> };
        if (json.errors?.length) {
          console.error("Agent activity GraphQL errors:", json.errors);
        }
      });
    } catch (err) {
      console.error("Failed to send agent activity:", err);
    }
  }

  /** Checks if a session has been stopped by the user. */
  async isSessionStopped(sessionId: string): Promise<boolean> {
    try {
      return await this.rateLimiter.schedule(async () => {
        const token = await this.tokenManager.getAccessToken();
        const res = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            query: SESSION_QUERY,
            variables: { id: sessionId },
          }),
        });

        if (!res.ok) return false;

        const json = (await res.json()) as {
          data?: { agentSession?: { status?: string; stoppedAt?: string; endedAt?: string } };
        };

        const session = json.data?.agentSession;
        if (!session) return false;

        // Check various stop indicators
        return !!session.stoppedAt || session.status === "stopped" || session.status === "canceled";
      });
    } catch {
      return false;
    }
  }

  /** Uploads a file to Linear and returns the asset URL, or null on failure. */
  async uploadFile(filePath: string): Promise<string | null> {
    try {
      const fileStat = await stat(filePath).catch(() => null);
      if (!fileStat) {
        console.log(`[activities] File not found at ${filePath} — skipping upload`);
        return null;
      }

      const fileBuffer = await readFile(filePath);
      const fileSize = fileStat.size;

      return await this.rateLimiter.schedule(async () => {
        const token = await this.tokenManager.getAccessToken();

        const uploadRes = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            query: FILE_UPLOAD_MUTATION,
            variables: { contentType: "image/png", filename: "preview-screenshot.png", size: fileSize },
          }),
        });

        if (!uploadRes.ok) {
          console.error(`[activities] fileUpload request failed (${uploadRes.status})`);
          return null;
        }

        const uploadJson = (await uploadRes.json()) as {
          data?: {
            fileUpload?: {
              uploadFile?: {
                uploadUrl: string;
                assetUrl: string;
                headers: Array<{ key: string; value: string }>;
              };
            };
          };
          errors?: Array<{ message: string }>;
        };

        if (uploadJson.errors?.length) {
          console.error("[activities] fileUpload errors:", uploadJson.errors);
          return null;
        }

        const uploadFile = uploadJson.data?.fileUpload?.uploadFile;
        if (!uploadFile) {
          console.error("[activities] fileUpload returned no uploadFile");
          return null;
        }

        const putHeaders = new Headers();
        putHeaders.set("Content-Type", "image/png");
        for (const { key, value } of uploadFile.headers) {
          putHeaders.set(key, value);
        }

        const putRes = await fetch(uploadFile.uploadUrl, {
          method: "PUT",
          headers: putHeaders,
          body: fileBuffer,
        });

        if (!putRes.ok) {
          console.error(`[activities] PUT upload failed (${putRes.status})`);
          return null;
        }

        console.log(`[activities] File uploaded: ${uploadFile.assetUrl}`);
        return uploadFile.assetUrl;
      });
    } catch (err) {
      console.error("[activities] uploadFile failed:", err);
      return null;
    }
  }

  /** Posts a comment on an issue. */
  async postComment(issueId: string, body: string): Promise<void> {
    try {
      await this.rateLimiter.schedule(async () => {
        const token = await this.tokenManager.getAccessToken();

        const res = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            query: COMMENT_CREATE_MUTATION,
            variables: { input: { issueId, body } },
          }),
        });

        if (!res.ok) {
          console.error(`[activities] commentCreate failed (${res.status})`);
          return;
        }

        const json = (await res.json()) as { errors?: Array<{ message: string }> };
        if (json.errors?.length) {
          console.error("[activities] commentCreate errors:", json.errors);
          return;
        }

        console.log(`[activities] Comment posted on issue ${issueId}`);
      });
    } catch (err) {
      console.error("[activities] postComment failed:", err);
    }
  }

  /** Creates a new agent session on an issue. Used for re-delegation. */
  async createSessionOnIssue(issueId: string): Promise<string | null> {
    try {
      return await this.rateLimiter.schedule(async () => {
        const token = await this.tokenManager.getAccessToken();
        const res = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            query: SESSION_CREATE_ON_ISSUE,
            variables: { input: { issueId } },
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          console.error(`[activities] createSessionOnIssue failed (${res.status}): ${body}`);
          return null;
        }

        const json = (await res.json()) as {
          data?: { agentSessionCreateOnIssue?: { success: boolean; agentSession?: { id: string } } };
          errors?: Array<{ message: string }>;
        };

        if (json.errors?.length) {
          console.error("[activities] createSessionOnIssue errors:", json.errors);
          return null;
        }

        return json.data?.agentSessionCreateOnIssue?.agentSession?.id ?? null;
      });
    } catch (err) {
      console.error("[activities] createSessionOnIssue exception:", err);
      return null;
    }
  }
}
