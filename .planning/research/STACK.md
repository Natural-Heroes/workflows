# Stack Research

**Domain:** MCP (Model Context Protocol) TypeScript Server for External API Integration
**Researched:** 2026-01-19
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) | 1.25.2 (latest) | Official MCP TypeScript SDK | Official SDK from Anthropic, provides server/client libraries, transport implementations (Streamable HTTP, stdio, SSE), and built-in type safety. High source reputation (85.3 benchmark score on Context7). Used by 21,227+ projects. |
| [Zod](https://zod.dev/) | 3.25+ | Schema validation and type inference | Required peer dependency for MCP SDK. Provides runtime validation and compile-time type safety for tool inputs/outputs. SDK internally imports from zod/v4 while maintaining backwards compatibility with v3.25+. |
| [TypeScript](https://www.typescriptlang.org/) | 5.x | Type system and compilation | Essential for type-safe MCP server development. Provides end-to-end type safety when combined with Zod schemas. |
| [Express](https://expressjs.com/) | 4.x | HTTP framework | Battle-tested (since 2010), extensive ecosystem, simple and flexible. Best choice for traditional HTTP-based MCP servers with StreamableHTTPServerTransport. |
| [Node.js](https://nodejs.org/) | 18.x+ | Runtime environment | Standard runtime for MCP servers. LTS versions recommended for production stability. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| [@modelcontextprotocol/sdk/validation/ajv](https://ajv.js.org/) | Built-in | JSON schema validation (Node.js) | Default validator for Node.js environments. Fast and standards-compliant. Note: Not compatible with Cloudflare Workers due to dynamic code generation. |
| [@modelcontextprotocol/sdk/validation/cfworker](https://developers.cloudflare.com/agents/model-context-protocol/) | Built-in | JSON schema validation (Edge) | Use for edge runtimes (Cloudflare Workers, etc.) where AJV's code generation is restricted. |
| [axios](https://axios-http.com/) | 1.x | HTTP client | For external REST API calls from MCP server. Well-supported, promise-based, handles interceptors and error handling. |
| [@types/node](https://www.npmjs.com/package/@types/node) | Latest | TypeScript definitions | Required for Node.js type definitions in TypeScript projects. |
| [@types/express](https://www.npmjs.com/package/@types/express) | Latest | TypeScript definitions | Required for Express type definitions. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| [@modelcontextprotocol/inspector](https://github.com/modelcontextprotocol/inspector) | Testing and debugging MCP servers | Browser-based tool (like Postman for MCP). Run with `npx @modelcontextprotocol/inspector node build/index.js`. Essential for testing tools/resources before Claude integration. |
| [tsdown](https://github.com/sxzz/tsdown) | TypeScript bundler | Recommended for production builds. Bundles TypeScript into executable ESM-friendly files, correctly rewrites imports, avoids Node.js .js suffix issues. |
| [tsx](https://github.com/privatenumber/tsx) | TypeScript execution | For development. Run TypeScript directly without build step. |

## Installation

```bash
# Core dependencies
npm install @modelcontextprotocol/sdk zod express axios

# TypeScript and type definitions
npm install -D typescript @types/node @types/express

# Development tools
npm install -D tsx tsdown

# Optional: Inspector for testing (use via npx)
# npx @modelcontextprotocol/inspector node build/index.js
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Express | [Fastify](https://www.fastify.io/) | When performance is critical (30,000+ req/s vs Express 15,000). Modern TypeScript-first design, built-in async/await support, powerful plugin architecture. Best for greenfield projects prioritizing speed. |
| Express | [Hono](https://hono.dev/) | For edge computing deployments (Cloudflare Workers, Deno, Bun). Cross-platform support, smallest bundle size, Web Standards-based. Can deploy same code to multiple runtimes without changes. |
| stdio transport | Streamable HTTP transport | Streamable HTTP is the **recommended** transport for new implementations. stdio is for local-only development and cannot be deployed to production. HTTP+SSE (protocol 2024-11-05) is legacy. |
| AJV validator | cfworker validator | Required for Cloudflare Workers/edge environments. AJV uses dynamic code generation which is blocked in restricted edge runtimes. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| HTTP+SSE transport | Legacy transport (protocol version 2024-11-05) supported only for backwards compatibility | StreamableHTTPServerTransport for production deployments |
| stdio transport in production | Cannot be deployed to production - only for local development/testing | StreamableHTTPServerTransport for HTTP-based deployments |
| console.log() in stdio servers | Writes to stdout, corrupts JSON-RPC messages, breaks server communication | console.error() for stderr logging |
| AJV in Cloudflare Workers | Dynamic code generation blocked in edge runtimes (EvalError) | CfWorkerJsonSchemaValidator or upgrade to AJV v8 with interpreted mode |
| Zod < 3.25 | Incompatible with MCP SDK which uses zod/v4 internally | Zod 3.25+ for compatibility |

## Stack Patterns by Variant

**If deploying to traditional cloud (AWS, Azure, GCP):**
- Use Express + StreamableHTTPServerTransport
- Use AjvJsonSchemaValidator
- Deploy with Docker/Container Apps
- Because: Battle-tested, extensive ecosystem, straightforward deployment

**If deploying to edge (Cloudflare Workers, Vercel Edge):**
- Use Hono + StreamableHTTPServerTransport
- Use CfWorkerJsonSchemaValidator
- Because: Cross-platform compatibility, no dynamic code generation, optimized for edge runtimes

**If maximum performance is critical:**
- Use Fastify + StreamableHTTPServerTransport
- Use AjvJsonSchemaValidator
- Because: 2x performance over Express (30k+ req/s), modern async/await, powerful plugin system

**If local development/testing only:**
- Can use stdio transport with any framework
- Use for rapid prototyping before HTTP deployment
- Because: Simpler setup, direct stdin/stdout communication, works with MCP Inspector

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| @modelcontextprotocol/sdk@1.25.2 | Zod 3.25+ | SDK uses zod/v4 internally but maintains backwards compatibility |
| @modelcontextprotocol/sdk@1.x | Node.js 18+ | v1.x recommended for production; v2 stable release expected Q1 2026 |
| @modelcontextprotocol/sdk@1.11.4 | **AVOID** | Runtime error: "SyntaxError: The requested module 'ajv' does not provide an export named 'Ajv'" - use 1.11.3 or 1.25.2+ |
| Express@4.x | Node.js 18+ | Stable, production-ready |
| Fastify@4.x | Node.js 18+ | Modern async/await support |
| Hono@3.x+ | Node.js, Deno, Bun, Cloudflare Workers | Cross-platform |

## Transport Pattern Recommendations

### StreamableHTTPServerTransport (Recommended)

```typescript
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';

const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
    onsessioninitialized: (id) => console.error('Session init:', id),
    onsessionclosed: (id) => console.error('Session closed:', id)
});
```

**Use for:**
- Production deployments
- HTTP-based servers
- Session management requirements
- Multi-client support

### stdio Transport (Development Only)

```typescript
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const transport = new StdioServerTransport();
```

**Use for:**
- Local development
- Testing with MCP Inspector
- Claude Desktop integration during development

**Never use for:**
- Production deployments
- Remote access scenarios

## Tool Registration Pattern

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';

const server = new McpServer({
    name: 'my-mcp-server',
    version: '1.0.0'
});

server.registerTool(
    'tool-name',
    {
        title: 'Tool Display Name',
        description: 'What this tool does',
        inputSchema: {
            param1: z.string().describe('First parameter'),
            param2: z.number().optional().describe('Optional second parameter')
        },
        outputSchema: {
            result: z.string(),
            metadata: z.object({}).optional()
        }
    },
    async ({ param1, param2 }, extra) => {
        // Tool implementation
        return {
            content: [{ type: 'text', text: 'Result' }],
            structuredContent: { result: 'data' }
        };
    }
);
```

## Session Management Best Practices

For production deployments:
- Store sessions in Redis or database (not in-memory)
- Implement session timeout/cleanup
- Use proper session ID generation (`randomUUID()`)
- Handle session lifecycle events (initialized, closed)

Example session store pattern:

```typescript
const sessions = new Map<string, StreamableHTTPServerTransport>();

const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
        sessions.set(id, transport);
    },
    onsessionclosed: (id) => {
        sessions.delete(id);
    }
});
```

## Critical Development Rules

1. **Logging in stdio servers**: Always use `console.error()` for logging. Never use `console.log()` as it writes to stdout and corrupts JSON-RPC messages.

2. **Transport selection**: Prefer Streamable HTTP for all new implementations. stdio is development-only.

3. **Zod schemas**: Define explicit schemas for both input and output. Provides TypeScript type safety and IDE autocompletion.

4. **Testing workflow**: Use MCP Inspector before integrating with Claude Desktop. Isolate server behavior from client/network issues.

5. **Error handling**: Implement comprehensive error handling for API failures, validation errors, and transport issues.

## Sources

**HIGH CONFIDENCE:**
- [/modelcontextprotocol/typescript-sdk](https://context7.com/modelcontextprotocol/typescript-sdk) — Core SDK documentation, tool registration patterns, transport examples
- [@modelcontextprotocol/sdk - npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — Official package, version 1.25.2 verification
- [GitHub: modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk) — Official repository, documentation, examples
- [MCP Official Docs: Build a Server](https://modelcontextprotocol.io/docs/develop/build-server) — Authoritative build patterns
- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25) — Protocol specification
- [GitHub: modelcontextprotocol/inspector](https://github.com/modelcontextprotocol/inspector) — Testing tool documentation

**MEDIUM CONFIDENCE:**
- [Nearform: MCP Tips & Tricks](https://nearform.com/digital-community/implementing-model-context-protocol-mcp-tips-tricks-and-pitfalls/) — Implementation patterns, stdio logging warnings
- [FreeCodeCamp: Build Custom MCP Server](https://www.freecodecamp.org/news/how-to-build-a-custom-mcp-server-with-typescript-a-handbook-for-developers/) — Tutorial examples
- [Microsoft Learn: Azure MCP Server](https://learn.microsoft.com/en-us/azure/developer/ai/build-mcp-server-ts) — Azure deployment patterns
- [Medium: Building MCP Servers (Production)](https://maurocanuto.medium.com/building-mcp-servers-the-right-way-a-production-ready-guide-in-typescript-8ceb9eae9c7f) — Production best practices
- [Level Up Coding: Hono vs Express vs Fastify](https://levelup.gitconnected.com/hono-vs-express-vs-fastify-the-2025-architecture-guide-for-next-js-5a13f6e12766) — Framework comparison benchmarks
- [Cloudflare Agents: MCP](https://developers.cloudflare.com/agents/model-context-protocol/) — Edge deployment patterns

**KNOWN ISSUES:**
- [Issue #689: AJV Cloudflare Workers](https://github.com/modelcontextprotocol/typescript-sdk/issues/689) — AJV code generation error in edge runtimes
- [Issue #512: AJV Export Error](https://github.com/modelcontextprotocol/typescript-sdk/issues/512) — Version 1.11.4 import issue

---
*Stack research for: MCP TypeScript Server for External API Integration*
*Researched: 2026-01-19*
*Next review: Q1 2026 (monitor v2 SDK stable release)*
