# Project Research Summary

**Project:** MRPeasy MCP Server
**Domain:** MCP (Model Context Protocol) server for external API integration
**Researched:** 2026-01-19
**Confidence:** HIGH

## Executive Summary

Building an MCP server for MRPeasy requires following the modern TypeScript stack with strict attention to rate limiting, security, and error handling. The MCP ecosystem has matured significantly, with clear best practices emerging from production deployments and security incidents.

**Core recommendation:** Use TypeScript with @modelcontextprotocol/sdk 1.25.2, Express 4.x, and StreamableHTTPServerTransport. Start with read-only tools to validate the integration before adding write operations. MRPeasy's strict rate limits (1 concurrent request, 100/10s) demand request queueing and retry logic with exponential backoff - these are not optional features.

**Key risks:** July 2025 research found 2,000 MCP servers exposed with zero authentication, and a Replit incident where an AI agent deleted 1,200+ production records despite safeguards. Security, rate limiting, and confirmation flows for destructive operations are critical from day one.

## Key Findings

### Recommended Stack

Modern MCP servers use TypeScript with official SDK and Zod for schema validation. The transport layer has evolved significantly - Streamable HTTP is now the standard, replacing the legacy HTTP+SSE dual-endpoint pattern.

**Core technologies:**
- **@modelcontextprotocol/sdk 1.25.2**: Official SDK from Anthropic with built-in type safety, transport implementations, and Zod integration
- **Zod 3.25+**: Required peer dependency for schema validation and type inference
- **Express 4.x**: Battle-tested HTTP framework (15,000+ req/s), extensive ecosystem
- **Node.js 18+**: LTS runtime environment

**Key architectural decision:** StreamableHTTPServerTransport over stdio for production. stdio is development-only and cannot scale to multiple sessions. HTTP+SSE (pre-March 2025) required two separate endpoints and is now deprecated.

**Critical development rule:** Never use `console.log()` in MCP servers - it writes to stdout and corrupts the JSON-RPC protocol stream. Always use `console.error()` for stderr logging.

### Expected Features

Production MCP servers have evolved clear patterns for table stakes vs. differentiating features based on real-world deployments.

**Must have (table stakes):**
- 5 Read Tools with JSON Schema validation — Core MCP capability
- Cursor-based pagination — Standard for list operations (page size 10-50)
- Rate limit handling — Essential for API quotas (MRPeasy: 1 concurrent, 100/10s)
- Basic error handling — Application-level (`isError: true`) + protocol-level (JSON-RPC)
- stdio transport — Required for Claude Desktop integration
- Clear tool descriptions — LLM must understand when to call each tool

**Should have (competitive):**
- Response caching — 90% token reduction for repetitive queries (add when >50% duplicate requests)
- Circuit breaker pattern — Prevents cascade failures (add when >10% error rate)
- Retry with exponential backoff — Handles transient failures (add when >5% retryable failures)
- OpenTelemetry integration — Production observability (add at production deployment)

**Defer (anti-features for MVP):**
- Write/mutating tools — Security complexity, transaction management, rollback requirements
- Real-time subscriptions — Complex protocol, most MCP use cases are request/response
- Embedding all data in responses — Blows context window, increases latency and costs

### Architecture Approach

MCP servers follow a layered architecture with clear separation of concerns: Protocol/Transport → McpServer/Tools → Services/API Client → External APIs.

**Major components:**
1. **Protocol Handler** — JSON-RPC 2.0 routing, request/response correlation
2. **Transport Layer** — StreamableHTTPServerTransport with session management
3. **McpServer** — High-level API for tool registration with Zod schemas
4. **Tool Registry** — Maps tool names to handlers with input/output validation
5. **API Client** — External API interface with rate limiting and circuit breakers
6. **Middleware** — Rate limiter, circuit breaker, retry logic as reusable decorators

**Project structure pattern:**
```
src/
├── server.ts              # Express app, transport setup
├── mcp/
│   ├── index.ts          # McpServer initialization
│   └── tools/            # Tool implementations by domain
├── services/
│   └── mrpeasy/          # API client, auth, types
├── middleware/           # Rate limiter, circuit breaker, retry
└── types/                # Type definitions
```

**Critical architectural patterns:**
- Tool handlers with Zod schema validation (compile-time + runtime)
- Session-based HTTP transport with UUID generation
- Rate limiting with token bucket algorithm
- Circuit breaker state machine (closed → open → half-open)
- Retry with exponential backoff and jitter
- Custom error classes with user/internal message separation

### Critical Pitfalls

Research reveals 12 critical pitfalls from production post-mortems and security incidents, many with catastrophic consequences if not addressed.

**Top 5 most dangerous:**

1. **Writing non-JSON to stdout** — Corrupts protocol, server becomes unusable. Use `console.error()` only.

2. **No authentication on HTTP/SSE endpoints** — July 2025: 2,000 servers found exposed with zero auth. Anyone could access tools and data.

3. **No request queuing for single-concurrent APIs** — MRPeasy allows only 1 concurrent request. Without a queue, concurrent sessions fail immediately with 429 errors.

4. **The Replit incident** — AI agent deleted 1,200+ production records despite explicit instructions. Destructive operations MUST require confirmation.

5. **Missing environment variables** — MCP servers receive minimal environment by default. Explicit declaration and startup validation are mandatory.

**Other critical issues:**
- Silent error responses (LLM can't learn from errors)
- No retry logic with exponential backoff
- Over-broad "kitchen sink" tools
- No pagination for large datasets
- Global variables in multi-session servers
- CVE-2025-6514 command injection vulnerability
- Over-permissioned tools with admin-level credentials

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Core Infrastructure & Security
**Rationale:** Foundation must be solid before building tools. Security incidents show authentication and proper architecture are critical from day one.

**Delivers:** Working MCP server with StreamableHTTPServerTransport, proper logging (stderr only), environment variable validation, basic authentication.

**Addresses:**
- Pitfall #1 (stdout pollution) — Configure stderr logging infrastructure
- Pitfall #2 (missing env vars) — Startup validation, `.env.example` documentation
- Pitfall #3 (no authentication) — API key validation for HTTP/SSE endpoints
- Pitfall #9 (global state) — Session-based architecture design
- Pitfall #10 (command injection) — Input validation framework

**Uses:**
- @modelcontextprotocol/sdk 1.25.2 with StreamableHTTPServerTransport
- Express 4.x for HTTP server
- Zod 3.25+ for schema validation foundation

**Avoids:**
- stdio-only development (plan for multi-session from start)
- Global state that breaks with concurrent connections
- Missing security controls (authentication, input validation)

### Phase 2: Tool Design & Schema Definition
**Rationale:** Tool design determines LLM effectiveness. Research shows 80/20 rule applies - 20% of tools handle 80% of requests. Must design for LLM consumption, not API structure mirroring.

**Delivers:** 5 read-only tools (inventory, customer orders, manufacturing orders, products, search) with Zod schemas, pagination support, clear descriptions.

**Addresses:**
- Pitfall #4 (silent errors) — Structured error responses with `isError: true`
- Pitfall #6 (over-broad tools) — Single responsibility per tool
- Pitfall #8 (no pagination) — Cursor-based pagination for all list operations
- Pitfall #11 (Replit incident) — Separate read-only from write tools

**Uses:**
- Zod schemas for all tool inputs/outputs
- Cursor-based pagination pattern (page size 10-50)
- Token-aware response design (avoid context window overflow)

**Avoids:**
- Generic "get all data" tools
- Tools without clear, unique descriptions
- Missing examples for complex parameters
- Returning full API responses without transformation

### Phase 3: Rate Limiting & Resilience
**Rationale:** MRPeasy's strict limits (1 concurrent, 100/10s) make this critical. Research shows lack of retry logic and queueing are common failure points.

**Delivers:** Request queue with max_concurrent=1, exponential backoff retry logic, circuit breaker for sustained failures.

**Addresses:**
- Pitfall #5 (no retry logic) — Exponential backoff: 2^attempt + jitter
- Pitfall #7 (no request queuing) — Fair scheduling across sessions
- Rate limit handling with clear retry-after messages

**Uses:**
- Token bucket rate limiter (in-memory for MVP, Redis for production)
- Request queue with FIFO or round-robin fairness
- Circuit breaker state machine (5 failures → open, 30s recovery)

**Avoids:**
- Immediate failures on rate limit hits
- Thundering herd (no jitter in retries)
- Unfair scheduling favoring single session

### Phase 4: Error Handling & Validation
**Rationale:** Production incidents show silent errors and poor validation cause agent failures. Errors must be actionable for LLMs.

**Delivers:** Comprehensive error handling with LLM-readable messages, input validation with allowlists, structured error responses.

**Addresses:**
- Pitfall #4 (silent errors) — Detailed, actionable error messages
- Input validation — Allowlist validation for all tool parameters
- Security — Prevent injection attacks, over-permissioning

**Uses:**
- Custom error classes (user message vs internal message)
- Zod validation errors transformed to LLM-readable format
- Structured error responses with error codes and retry guidance

**Avoids:**
- Generic "something went wrong" messages
- Exposing internal details (stack traces, API keys)
- Errors without actionable guidance

### Phase 5: Testing & Deployment
**Rationale:** MCP Inspector testing and production deployment with monitoring.

**Delivers:** Comprehensive test suite, MCP Inspector validation, Dokploy deployment, basic monitoring.

**Addresses:**
- End-to-end testing with MCP Inspector
- Multi-session concurrency testing
- Production deployment to Dokploy (task 304 pattern)

**Uses:**
- @modelcontextprotocol/inspector for testing
- Docker containerization
- Environment-based configuration

**Avoids:**
- Deploying without multi-session testing
- Missing health checks and readiness probes
- No monitoring or alerting

### Phase Ordering Rationale

- **Phase 1 first:** Security and architecture must be correct from the start. Refactoring global state or adding authentication later is costly.

- **Phase 2 before 3:** Tools must exist before we can rate limit or retry them. Schema design informs error handling needs.

- **Phase 3 before 4:** Rate limiting is critical for MRPeasy. Error handling builds on retry logic.

- **Phase 4 before 5:** Must have comprehensive error handling before production deployment.

- **No Phase 6 (write operations):** Deliberately deferred to v2+ after validating read-only integration and security model.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3:** Request queue implementation with fair scheduling — sparse documentation for multi-session MCP scenarios
- **Phase 5:** Dokploy deployment specifics — may need to reference task 304 implementation details

Phases with standard patterns (skip research-phase):
- **Phase 1:** StreamableHTTPServerTransport setup — well-documented, official SDK examples
- **Phase 2:** Zod schema validation — extensively documented, many production examples
- **Phase 4:** Error handling patterns — well-established, multiple best practice guides

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official SDK documentation, verified with Context7, production deployments (Microsoft, AWS) |
| Features | HIGH | Based on official MCP spec, production examples (Sentry, Cloudflare, Xata), security best practices |
| Architecture | HIGH | Official specification, TypeScript SDK repository, production implementations (Yahoo Finance MCP) |
| Pitfalls | HIGH | Production post-mortems (Replit incident), security research (2000 exposed servers), CVE documentation |

**Overall confidence:** HIGH

### Gaps to Address

While research is comprehensive, a few areas need validation during implementation:

- **Request queue for 1-concurrent limit:** MCP documentation focuses on higher concurrency. Fair scheduling across sessions with single-concurrent APIs is less documented.

- **Pagination token format:** MCP spec defines cursor-based pagination but doesn't mandate specific cursor format. Need to test what works best with Claude.

- **Streamable HTTP session management:** Post-March 2025 transport is newer. Some edge cases (session timeout, reconnection) may need experimentation.

- **MRPeasy API specifics:** Research covered general API integration patterns. Actual MRPeasy API quirks (error codes, pagination format, rate limit headers) need discovery during implementation.

## Sources

### Primary (HIGH confidence)
- Official MCP Specification (2025-11-25) — Protocol requirements, transport layers
- @modelcontextprotocol/sdk TypeScript repository — Official implementation patterns
- Context7: /modelcontextprotocol/typescript-sdk — Tool registration, transport examples
- Microsoft MCP Best Practices Guide — Enterprise patterns from production
- Security post-mortems (AuthZed, Strobes, RedHat) — Real security incidents

### Secondary (MEDIUM confidence)
- Production MCP servers (Yahoo Finance, Xata, Sentry) — Real-world architecture examples
- MCP security best practices (OWASP, official guide) — Security checklist and patterns
- Community tutorials (FreeCodeCamp, Nearform) — Implementation guidance
- Performance guides (SigNoz, API7) — Observability and rate limiting patterns

### Tertiary (LOW confidence)
- Community blog posts — Anecdotal experiences, not verified
- GitHub issues and discussions — Feature proposals, not official spec

---
*Research completed: 2026-01-19*
*Ready for roadmap: yes*
