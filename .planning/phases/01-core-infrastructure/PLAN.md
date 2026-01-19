# Plan: Phase 1 - Core Infrastructure

## Overview

Set up the foundational MCP HTTP server with Express and StreamableHTTPServerTransport. This plan delivers a working server skeleton that can handle sessions, validate environment variables, and log correctly (stderr only).

## Requirements Addressed

- INFRA-01: MCP HTTP server with StreamableHTTPServerTransport
- INFRA-02: Express 4.x HTTP framework setup
- INFRA-03: Environment variable validation at startup
- INFRA-04: stderr-only logging (no stdout pollution)
- INFRA-05: Session-based architecture (no global state)

## Tasks

### Task 1: Project Setup

**Files to create:**
- `mcp/mrpeasy/package.json`
- `mcp/mrpeasy/tsconfig.json`
- `mcp/mrpeasy/.env.example`
- `mcp/mrpeasy/.gitignore`

**Actions:**
1. Create directory structure: `mcp/mrpeasy/src/`
2. Initialize package.json with dependencies:
   - `@modelcontextprotocol/sdk` (^1.25.2)
   - `express` (^4.21.0)
   - `zod` (^3.25.0)
   - Dev: `typescript`, `@types/express`, `@types/node`, `tsx`
3. Configure tsconfig.json for ES modules
4. Create .env.example with required variables:
   - `MRPEASY_API_KEY`
   - `MRPEASY_API_SECRET`
   - `PORT` (default: 3000)
5. Add .gitignore for node_modules, dist, .env

**Verification:**
- `npm install` succeeds
- `npx tsc --noEmit` passes

---

### Task 2: Logger Module (stderr only)

**Files to create:**
- `mcp/mrpeasy/src/lib/logger.ts`

**Actions:**
1. Create logger that writes ONLY to stderr (never stdout)
2. Implement log levels: debug, info, warn, error
3. Include timestamp and level in format
4. Support structured logging (JSON format option)

**Pattern:**
```typescript
// CRITICAL: Never use console.log - it corrupts MCP protocol
export const logger = {
  debug: (msg: string, data?: object) => console.error(`[DEBUG] ${msg}`, data),
  info: (msg: string, data?: object) => console.error(`[INFO] ${msg}`, data),
  warn: (msg: string, data?: object) => console.error(`[WARN] ${msg}`, data),
  error: (msg: string, data?: object) => console.error(`[ERROR] ${msg}`, data),
};
```

**Verification:**
- All log output goes to stderr
- No console.log calls exist in codebase

---

### Task 3: Environment Validation

**Files to create:**
- `mcp/mrpeasy/src/lib/env.ts`

**Actions:**
1. Use Zod to define environment schema
2. Validate at startup (fail fast)
3. Export typed config object
4. Provide clear error messages for missing/invalid vars

**Schema:**
```typescript
const envSchema = z.object({
  MRPEASY_API_KEY: z.string().min(1, 'MRPEASY_API_KEY is required'),
  MRPEASY_API_SECRET: z.string().min(1, 'MRPEASY_API_SECRET is required'),
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
});
```

**Verification:**
- Server refuses to start with missing env vars
- Clear error message indicates which vars are missing

---

### Task 4: MCP Server with Session Management

**Files to create:**
- `mcp/mrpeasy/src/server.ts` (main entry point)
- `mcp/mrpeasy/src/mcp/index.ts` (McpServer setup)

**Actions:**
1. Create Express app with JSON middleware
2. Set up StreamableHTTPServerTransport with session management
3. Implement session store (in-memory Map)
4. Handle POST /mcp (main MCP endpoint)
5. Handle GET /mcp (SSE for notifications)
6. Handle DELETE /mcp (session termination)
7. Add health check endpoint GET /health

**Session Pattern (from SDK docs):**
```typescript
const transports: Map<string, StreamableHTTPServerTransport> = new Map();

app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId && transports.has(sessionId)) {
    // Reuse existing session
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res, req.body);
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // New session
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => transports.set(id, transport),
      onsessionclosed: (id) => transports.delete(id),
    });

    const server = createMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } else {
    res.status(400).json({ error: 'Invalid session' });
  }
});
```

**Verification:**
- Server starts on configured port
- Health check returns 200
- Can initialize MCP session (test with curl)

---

### Task 5: Placeholder Tool Registration

**Files to create:**
- `mcp/mrpeasy/src/mcp/tools/index.ts`

**Actions:**
1. Create McpServer instance with name/version
2. Register a single placeholder tool `ping` for testing
3. Export function to create configured server

**Pattern:**
```typescript
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'mrpeasy-mcp',
    version: '0.1.0',
  });

  server.registerTool(
    'ping',
    {
      title: 'Ping',
      description: 'Test tool to verify MCP server is working',
      inputSchema: {},
    },
    async () => ({
      content: [{ type: 'text', text: 'pong' }],
    })
  );

  return server;
}
```

**Verification:**
- MCP Inspector can connect
- `ping` tool returns "pong"

---

### Task 6: NPM Scripts & Dev Setup

**Files to modify:**
- `mcp/mrpeasy/package.json`

**Actions:**
1. Add scripts:
   - `dev`: `tsx watch src/server.ts`
   - `build`: `tsc`
   - `start`: `node dist/server.js`
   - `typecheck`: `tsc --noEmit`
2. Ensure ES modules work (type: module)

**Verification:**
- `npm run dev` starts server with hot reload
- `npm run build` produces dist/
- `npm run typecheck` passes

---

## Execution Order

```
Task 1 (Project Setup)
    ↓
Task 2 (Logger) ← Task 3 (Env Validation)  [parallel]
    ↓                   ↓
    └───────┬───────────┘
            ↓
      Task 4 (MCP Server)
            ↓
      Task 5 (Placeholder Tool)
            ↓
      Task 6 (NPM Scripts)
```

Tasks 2 and 3 can run in parallel after Task 1.

## Verification Checklist

- [ ] `npm install` succeeds
- [ ] `npm run typecheck` passes
- [ ] Server starts with `npm run dev`
- [ ] Health check returns 200 at GET /health
- [ ] No stdout pollution (only stderr logs)
- [ ] Server fails to start with missing env vars
- [ ] MCP Inspector can connect and call `ping` tool

## Notes

- No MRPeasy API calls in this phase (placeholder only)
- No rate limiting yet (Phase 3)
- No error handling refinement yet (Phase 4)
- Session management is in-memory (sufficient for single-node Dokploy)

---
*Created: 2026-01-19*
*Requirements: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05*
