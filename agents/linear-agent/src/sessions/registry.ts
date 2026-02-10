/**
 * In-memory registry of active agent sessions.
 * Shared between the server (to handle stop requests) and worker (to register/unregister sessions).
 */
export interface ActiveSession {
  sessionId: string;
  issueId: string;
  abortController: AbortController;
  startedAt: number;
}

export class SessionRegistry {
  private readonly sessions = new Map<string, ActiveSession>();

  /** Register an active session. Returns the AbortController's signal. */
  register(sessionId: string, issueId: string): AbortSignal {
    const abortController = new AbortController();
    this.sessions.set(sessionId, {
      sessionId,
      issueId,
      abortController,
      startedAt: Date.now(),
    });
    console.log(`[sessions] Registered session ${sessionId} (active: ${this.sessions.size})`);
    return abortController.signal;
  }

  /** Unregister a session (called when job completes or fails). */
  unregister(sessionId: string): void {
    this.sessions.delete(sessionId);
    console.log(`[sessions] Unregistered session ${sessionId} (active: ${this.sessions.size})`);
  }

  /** Abort a session by sessionId. Returns true if found and aborted. */
  abort(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.abortController.abort();
    console.log(`[sessions] Aborted session ${sessionId}`);
    return true;
  }

  /** Get session age in ms, or null if not found. */
  getAge(sessionId: string): number | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return Date.now() - session.startedAt;
  }

  /** Abort all active sessions (for graceful shutdown). */
  abortAll(): void {
    for (const [id, session] of this.sessions) {
      session.abortController.abort();
      console.log(`[sessions] Aborted session ${id} (shutdown)`);
    }
  }

  /** Get all active session IDs. */
  get activeCount(): number {
    return this.sessions.size;
  }
}
