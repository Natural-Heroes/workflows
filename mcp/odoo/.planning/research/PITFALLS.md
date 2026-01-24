# Domain Pitfalls

**Domain:** Multi-user MCP server with OAuth 2.1, Streamable HTTP, Odoo XML-RPC
**Researched:** 2026-01-23
**Confidence:** HIGH (verified via SDK GitHub issues, official docs, Odoo forums)

---

## Critical Pitfalls

Mistakes that cause rewrites, security breaches, or major production failures.

---

### Pitfall 1: Session Memory Leak from Abandoned Sessions

**What goes wrong:** The in-memory `transports` Map grows unbounded as clients disconnect without sending DELETE. Claude iOS/web clients frequently abandon sessions (app backgrounded, tab closed, network switch). Each orphaned `StreamableHTTPServerTransport` instance holds references to its MCP server, event emitters, and buffered messages.

**Why it happens:** The current mrpeasy pattern (`const transports: Map<string, StreamableHTTPServerTransport> = new Map()`) has no TTL or cleanup. The SDK's `onclose` handler only fires on explicit protocol-level close, not on TCP disconnection or client disappearance.

**Consequences:** Container OOM after days/weeks of operation. Dokploy restarts the container, losing all active sessions. Known issue in the MCP ecosystem -- the Python SDK has a confirmed memory leak where the task list grows with each request and never shrinks (GitHub issue #756, #1076).

**Warning signs:**
- Health endpoint showing ever-increasing session count
- Container memory usage climbing linearly over time
- Periodic OOM kills in Docker logs (exit code 137)

**Prevention:**
1. Implement session TTL with periodic sweep (every 60s, evict sessions idle > 30min)
2. Track last-activity timestamp per session on every request
3. Set Docker memory limits with alerts at 80% threshold
4. Log session creation/destruction with counts for monitoring
5. Consider the SDK's built-in `sessionIdGenerator` + custom eviction logic

**Detection:** Monitor `transports.size` via health endpoint. Alert if > 50 concurrent sessions (unexpected for a team of ~10-15 users).

**Phase:** Must be addressed in Phase 1 (core transport). The mrpeasy pattern is insufficient for multi-user.

**Sources:**
- [Stateless Mode memory leak - Python SDK #756](https://github.com/modelcontextprotocol/python-sdk/issues/756)
- [Memory Leak OOM - Python SDK #1076](https://github.com/modelcontextprotocol/python-sdk/issues/1076)
- [Excessive session creation - docs-mcp-server #190](https://github.com/arabold/docs-mcp-server/issues/190)
- [Idle Session Timeout - TypeScript SDK #812](https://github.com/modelcontextprotocol/typescript-sdk/issues/812)

---

### Pitfall 2: User Session Isolation Failure (Data Leakage)

**What goes wrong:** User A's Odoo credentials are used to fulfill User B's request. This happens when the session-to-credential mapping is done incorrectly, or when a shared Odoo XML-RPC client instance is reused across users.

**Why it happens:** In mrpeasy/Perdoo, credentials are global (single API key in env vars). The Odoo server needs per-user credentials. If the XML-RPC client is instantiated once and shared, or if credential lookup uses the wrong session ID due to a race condition, privilege escalation occurs.

**Consequences:** Security breach -- user sees data their Odoo record rules should hide (payslips, salary info, financial data). Potential GDPR/compliance violation.

**Warning signs:**
- Users reporting seeing unexpected data
- Audit logs showing User A's API key used for User B's requests
- Tests passing individually but failing under concurrent load

**Prevention:**
1. Create a fresh XML-RPC client per request (not per session) -- use the session to look up credentials, but never cache the authenticated client
2. Pass user credentials through the full call chain explicitly (no globals, no closures over shared state)
3. Validate that the session ID in the request header matches the authenticated user before every Odoo call
4. Write integration tests with two concurrent users making requests -- verify isolation
5. Never store Odoo API keys in the session object directly; store a reference to the user, look up the key at call time

**Detection:** Log `[sessionId, odooUserId, method, model]` for every XML-RPC call. Audit for mismatches.

**Phase:** Must be addressed in Phase 1 (auth layer). This is the fundamental security guarantee.

**Sources:**
- [MCP example-remote-server: Session Ownership with Redis](https://github.com/modelcontextprotocol/example-remote-server)
- [TypeScript SDK docs on stateless mode isolation](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)

---

### Pitfall 3: OAuth 2.1 Token Storage and PKCE Implementation Errors

**What goes wrong:** Multiple failure modes:
1. Tokens stored in plaintext (database, logs, or env vars)
2. PKCE using "plain" method instead of S256
3. Refresh tokens not rotated on use (replay attack vector)
4. Token leakage via error logs or debug output
5. Missing `state` parameter validation (CSRF vulnerability)

**Why it happens:** OAuth 2.1 is more strict than 2.0, but many tutorials and examples still show 2.0 patterns. The MCP spec requires OAuth 2.1 compliance, including mandatory PKCE with S256.

**Consequences:** Token theft enables impersonation. An attacker with a stolen token can access the victim's Odoo data until the token expires or is revoked.

**Warning signs:**
- Tokens appearing in application logs
- PKCE code_challenge_method set to "plain" in authorization requests
- Same refresh token working multiple times
- No token rotation on refresh

**Prevention:**
1. Encrypt tokens at rest (use a proper secret store or encrypted database column)
2. Enforce S256 PKCE -- reject "plain" method entirely
3. Implement one-time-use refresh tokens (rotate on every refresh)
4. Scrub tokens from all log output (redact Authorization headers)
5. Validate `state` parameter on redirect callback
6. Set short access token lifetime (15 minutes) with refresh capability
7. Bind tokens to the MCP session -- if session is destroyed, revoke tokens

**Detection:** Security audit of token storage. Automated test that verifies tokens never appear in log output.

**Phase:** Phase 1 (auth layer). OAuth is the entry point for the entire system.

**Sources:**
- [MCP Authorization Specification](https://modelcontextprotocol.io/specification/draft/basic/authorization)
- [MCP OAuth 2.1 PKCE Analysis](https://aembit.io/blog/mcp-oauth-2-1-pkce-and-the-future-of-ai-authorization/)
- [The MCP Authorization Spec critique](https://blog.christianposta.com/the-updated-mcp-oauth-spec-is-a-mess/)
- [OAuth 2.1 RFC Deep Dive for MCP](https://kane.mx/posts/2025/mcp-authorization-oauth-rfc-deep-dive/)

---

### Pitfall 4: Odoo API Key 3-Month Expiration Causing Silent Failures

**What goes wrong:** Odoo enforces a maximum 3-month lifetime on API keys. After expiration, all XML-RPC calls for that user return authentication errors. The MCP server returns generic errors, and neither the user nor the LLM understands why tools stopped working.

**Why it happens:** Odoo has no programmatic API to auto-rotate keys. Keys must be manually regenerated in the Odoo UI. There is no notification system for impending expiration.

**Consequences:** Users suddenly lose access with no warning. If all users' keys were created at the same time, the entire team loses access simultaneously. Support tickets flood in.

**Warning signs:**
- Increasing authentication errors in logs starting around the 3-month mark
- Users reporting "tools stopped working" without code changes
- Pattern of failures correlating with key creation dates

**Prevention:**
1. Store key creation date alongside each user's API key mapping
2. Implement a "key health check" that proactively tests each user's key daily (simple `execute_kw` on `res.users` with `read` for the user's own record)
3. Alert admins 2 weeks before any key's 3-month expiration
4. Document the key rotation procedure clearly for the team
5. Consider a scheduled Odoo action (cron) that auto-generates new keys and updates the MCP server's mapping (requires custom Odoo module)
6. Return a specific, actionable error message when auth fails: "Your Odoo API key may have expired. Please generate a new one in Odoo Settings > Security > API Keys and update your configuration."

**Detection:** Track last successful auth per user. Alert if any user hasn't authenticated successfully in > 24 hours (they may have expired).

**Phase:** Phase 1 (auth layer) for detection, Phase 2+ for automated rotation.

**Sources:**
- [Odoo 19 External API Documentation](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html)
- [Odoo API Key Expiration Fix PR](https://github.com/odoo/odoo/pull/193168)

---

### Pitfall 5: DNS Rebinding Attack (CVE-2025-66414)

**What goes wrong:** When running the MCP server on a host accessible from the internet (Dokploy), a malicious website can exploit DNS rebinding to bypass same-origin policy and invoke tools on behalf of the user.

**Why it happens:** The `StreamableHTTPServerTransport` does not enable DNS rebinding protection by default in versions prior to 1.24.0. Since this server is internet-facing (not localhost), the attack surface is different but Origin validation is still critical.

**Consequences:** Unauthorized tool invocation. An attacker could read Odoo data or trigger write operations through a victim's browser session.

**Warning signs:**
- Requests arriving with unexpected Origin headers
- Tool invocations from sessions that weren't properly initialized via OAuth

**Prevention:**
1. Upgrade `@modelcontextprotocol/sdk` to >= 1.24.0
2. Enable `enableDnsRebindingProtection` explicitly regardless of version
3. Validate Origin header on all incoming connections
4. Since this is a remote server (not localhost), implement proper CORS with a strict allowlist
5. OAuth 2.1 token validation on every request provides defense-in-depth

**Detection:** Log and monitor Origin headers. Alert on requests from unexpected origins.

**Phase:** Phase 1 (transport setup). Must be configured from the start.

**Sources:**
- [CVE-2025-66414 Advisory](https://github.com/advisories/GHSA-w48q-cv73-mx4w)
- [TypeScript SDK Security Advisory](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-w48q-cv73-mx4w)

---

### Pitfall 6: XML-RPC Deprecation in Odoo 20 (Fall 2026)

**What goes wrong:** The entire XML-RPC integration layer becomes obsolete when Odoo.sh upgrades to Odoo 20. The timeline is aggressive: deprecated in 19, removed from Odoo Online (SaaS) in 19.1, removed from Odoo.sh/on-prem in Odoo 20 (fall 2026).

**Why it happens:** Odoo is migrating to the JSON-2 API (`POST /json/2/<model>/<method>`) which uses Bearer token auth and proper HTTP status codes.

**Consequences:** Complete rewrite of the service layer within ~10 months of initial deployment. If the XML-RPC code is tightly coupled, this becomes a major refactoring effort.

**Warning signs:**
- Odoo 19.1 release notes mentioning SaaS removal
- Deprecation warnings in Odoo server logs
- Odoo.sh upgrade notifications

**Prevention:**
1. Abstract the Odoo communication behind a service interface (`IOdooClient` with methods like `search`, `read`, `create`, `write`)
2. Implement the interface with XML-RPC now, but design for a drop-in JSON-2 replacement
3. Keep all XML-RPC specifics (endpoint URLs, auth format, error parsing) in a single module
4. The JSON-2 API is simpler (plain HTTP POST with JSON body, Bearer auth, proper status codes) -- migration should be straightforward if abstracted properly
5. Consider starting with JSON-2 directly if Odoo.sh already supports it on the current instance (it is available in Odoo 19)

**Detection:** Check Odoo.sh documentation for deprecation timeline updates.

**Phase:** Architecture decision in Phase 1. Build the abstraction layer; consider JSON-2 from the start.

**Sources:**
- [Odoo 19 External RPC API (deprecation notice)](https://www.odoo.com/documentation/19.0/developer/reference/external_rpc_api.html)
- [Odoo 19 JSON-2 API](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html)
- [XMLRPC is dead. All Hail JSON-2](https://oduist.com/blog/odoo-experience-2025-ai-summaries-2/286-xmlrpc-is-dead-all-hail-json-2-288)

---

## Moderate Pitfalls

Mistakes that cause delays, degraded performance, or technical debt.

---

### Pitfall 7: Odoo XML-RPC Rate Limiting (429 Errors) Without Backoff

**What goes wrong:** Bulk operations or rapid successive tool calls trigger Odoo.sh's undocumented rate limits, returning HTTP 429 errors. The MCP server propagates these as generic errors, and the LLM retries immediately, making the situation worse.

**Why it happens:** Odoo.sh rate limits are not publicly documented. Multiple concurrent users each triggering multi-step workflows (e.g., "read all my expenses" doing paginated reads) can collectively exceed limits. Staging/dev builds on Odoo.sh are restricted to a single worker.

**Consequences:** Cascading failures as the LLM retries aggressively. Temporary lockout from Odoo API. Degraded experience for all users simultaneously.

**Prevention:**
1. Implement exponential backoff with jitter in the XML-RPC client (already patterned in mrpeasy's `retry.ts`)
2. Add a per-user rate limiter (e.g., max 5 concurrent Odoo calls per user)
3. Add a global rate limiter (e.g., max 20 concurrent Odoo calls total)
4. Return `isRetryable: true` with a wait time in the error message so the LLM knows to wait
5. Implement request queuing per user to serialize calls when approaching limits
6. Cache frequently-read data (employee lists, project structures) with short TTL (5 minutes)

**Phase:** Phase 1 (service layer). Use the Perdoo circuit breaker + rate limiter patterns.

**Sources:**
- [429 Too Many Requests on XMLRPC](https://www.odoo.com/forum/help-1/429-too-many-requests-on-xmlrpc-on-python-xmlrpcclient-220693)
- [Odoo External API limitations](https://www.odoo.com/forum/help-1/odoo-external-api-limitations-219797)

---

### Pitfall 8: File Upload Size Limits and Base64 Bloat

**What goes wrong:** MCP's text-based protocol requires base64 encoding for binary content, which adds ~33% overhead. A 10MB invoice PDF becomes ~13.3MB of base64 text. Combined with LLM token limits (~128K tokens context), large files either fail silently, timeout, or exhaust the context window.

**Why it happens:** The MCP protocol was not designed for efficient binary transfer. Additionally, Odoo.sh may have undocumented limits on XML-RPC payload size (reports of failures above 600KB in some configurations). The `ir.attachment` API expects base64 in the `datas` field, adding another encoding layer.

**Consequences:** Invoice/receipt uploads fail for larger files. Users don't understand why some files work and others don't. OCR processing timeout on Odoo side for large attachments.

**Warning signs:**
- Uploads succeeding for small files but failing for larger ones
- Timeouts during attachment creation
- "Content length is more than 128,000 tokens" errors from Claude

**Prevention:**
1. Enforce a file size limit in the tool schema (recommend max 5MB original = ~6.7MB base64)
2. Document the limit clearly in tool descriptions so the LLM can inform users
3. Chunk large files if needed (though Odoo attachments don't support chunked upload)
4. Set generous timeouts for attachment creation (Odoo OCR can take 30-60 seconds)
5. Validate file type before upload (only accept PDF, PNG, JPEG for invoices/receipts)
6. Return clear error messages: "File too large (X MB). Maximum supported size is 5 MB."
7. Consider URL-based upload as alternative: user uploads to temporary storage, MCP passes URL to Odoo

**Phase:** Phase 2 (when implementing invoice/expense upload tools).

**Sources:**
- [Odoo.sh file size limits via XML-RPC](https://www.odoo.com/forum/help-1/is-there-a-file-size-limit-when-uploading-a-document-using-xmlrpc-in-odoosh-214182)
- [SEP-1306: Binary Mode Elicitation proposal](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1306)
- [MCP file upload discussions](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/1197)

---

### Pitfall 9: Too Many Tools Confusing the LLM

**What goes wrong:** With ~25-30 tools across 7 domains, the LLM struggles to choose the right tool or uses tools incorrectly. Tool descriptions crowd the context window, leaving less room for the actual conversation and data. Cursor has a hard limit of 40 tools; other clients may have different limits.

**Why it happens:** Each tool's schema (name, description, parameters with descriptions) consumes tokens. 30 tools with rich descriptions can easily consume 5,000-10,000 tokens of context. The LLM then makes suboptimal choices because it's comparing too many options simultaneously.

**Consequences:** Wrong tool called (e.g., `read_invoices` when user meant `read_expenses`). Hallucinated parameters. Wasted tokens on tool selection. Degraded response quality.

**Prevention:**
1. Use namespace prefixes consistently: `accounting/read_invoices`, `hr/read_employees`, `projects/create_task`
2. Write tool descriptions that are unambiguous -- focus on "when to use this" not "what it does"
3. Keep parameter schemas simple -- avoid optional parameters unless truly useful
4. Consider dynamic tool registration (expose domain-specific tools based on user role/permissions)
5. Test with real Claude conversations -- if the LLM frequently picks the wrong tool, the descriptions need work
6. The 25-30 tool range is within safe limits, but descriptions must be concise and distinctive
7. Add an `instructions` resource that teaches the LLM how to navigate the tool landscape

**Phase:** All phases (tool design). Each domain should be reviewed for clarity.

**Sources:**
- [MCP and the "too many tools" problem](https://demiliani.com/2025/09/04/model-context-protocol-and-the-too-many-tools-problem/)
- [Tool calling is broken without MCP Server Composition](https://hackteam.io/blog/tool-calling-is-broken-without-mcp-server-composition/)
- [Avoid the MCP Server Overload](https://www.tibco.com/blog/2025/10/16/tibco-ai-avoid-the-mcp-server-overload/)
- [MCP Server Design Principles](https://www.matt-adams.co.uk/2025/08/30/mcp-design-principles.html)

---

### Pitfall 10: SSE Connection and Graceful Shutdown Failure

**What goes wrong:** When deploying updates (Dokploy redeploy), the container receives SIGTERM but cannot shut down gracefully because SSE connections (GET /mcp) are long-lived and never "complete." Docker kills the process after 10 seconds (SIGKILL), destroying all active sessions without notification to clients.

**Why it happens:** Express does not handle graceful shutdown natively (GitHub issue #3781). SSE connections are persistent -- `server.close()` waits for them to complete, which they never will. The mrpeasy pattern has no shutdown handler at all.

**Consequences:** Users mid-conversation lose their session. No reconnection mechanism in most MCP clients. Claude shows "connection lost" with no recovery path.

**Warning signs:**
- Exit code 137 in Docker logs (SIGKILL)
- Users reporting dropped sessions after deployments
- Health check failing during deploys

**Prevention:**
1. Register SIGTERM/SIGINT handlers that:
   a. Stop accepting new connections
   b. Close all active SSE connections with proper cleanup
   c. Wait for in-flight POST requests to complete (max 5 seconds)
   d. Then call `process.exit(0)`
2. Track all active SSE response objects in a Set for cleanup
3. Set Docker stop_grace_period to 30 seconds in docker-compose
4. Use `node` directly as entrypoint (not npm/yarn which don't forward signals)
5. Implement connection draining: send a "session ending" event before closing SSE

**Phase:** Phase 1 (deployment). Must be correct from first Docker deployment.

**Sources:**
- [Express graceful shutdown issue #3781](https://github.com/expressjs/express/issues/3781)
- [Node.js Graceful Shutdown - Lagoon Documentation](https://docs.lagoon.sh/using-lagoon-advanced/nodejs/)
- [SSE graceful shutdown in Go/Hyper](https://github.com/hyperium/hyper/issues/2787)

---

### Pitfall 11: Odoo Record Rule Confusion in API Context

**What goes wrong:** Developers assume that because the API uses a specific user's credentials, all security is handled. But record rules can produce unexpected results: empty result sets (not errors) when the user lacks access to specific records. This is confusing for the LLM -- it reports "no invoices found" when the user actually has invoices they can't see with their current rules.

**Why it happens:** Odoo record rules are default-allow. If no rule applies, access is granted. But when rules exist, they silently filter results rather than raising errors. Global rules intersect (both must pass), group rules union (either can pass). This logic is non-obvious from the API consumer's perspective.

**Consequences:** Users think data is missing when it's actually access-restricted. The LLM provides incorrect conclusions based on filtered data. Admin users see different results than regular users, making testing unreliable.

**Warning signs:**
- Users reporting missing records that they know exist
- Different result counts between admin and regular users
- LLM making incorrect conclusions about data absence

**Prevention:**
1. Document which Odoo models have record rules and what they filter (especially `hr.payslip`, `hr.employee` for salary data, `account.move`)
2. Include the user's role/groups in tool response metadata so the LLM can caveat its answers: "Based on your access level, I can see X invoices..."
3. Test each tool with both admin and restricted user accounts
4. For sensitive queries, add a disclaimer in the tool response: "Results are filtered by your Odoo permissions"
5. Never use `sudo()` context -- the XML-RPC API correctly enforces user permissions, but be aware that some Odoo methods internally use `sudo()` which could expose unexpected data

**Phase:** Phase 2+ (when building domain tools). Must be tested per-domain.

**Sources:**
- [Odoo 19 Security Documentation](https://www.odoo.com/documentation/19.0/developer/reference/backend/security.html)
- [Odoo External API Security Model](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html)

---

### Pitfall 12: 60-Second Client Timeout for Long Operations

**What goes wrong:** The MCP TypeScript SDK client has a hardcoded 60-second timeout for tool calls. Odoo operations like OCR processing (invoice upload), large report generation, or bulk reads can exceed this limit. The client reports a timeout error even though the server-side operation completed successfully.

**Why it happens:** The SDK's default timeout is 60 seconds and, in some versions, ignores progress notifications that should reset the timer. This is a known bug (TypeScript SDK issue #245, partially fixed in PR #849).

**Consequences:** Successful operations reported as failures. Duplicate records created when users retry. Wasted OCR credits on Odoo side.

**Warning signs:**
- Tool calls timing out for specific operations (file uploads, reports)
- Odoo logs showing successful operations that the user reports as failed
- Pattern of timeouts around 60 seconds exactly

**Prevention:**
1. Design tools to be fast -- do the minimum synchronous work, return quickly
2. For invoice upload: create the attachment and return immediately, note that OCR will process asynchronously
3. Paginate all read operations (max 50 records per call)
4. Set appropriate timeouts in the SDK if configurable in the version used
5. For long operations, consider a poll pattern: start operation, return handle, provide a "check status" tool
6. Keep Odoo XML-RPC timeout (`limit_time_real`) aligned with expected max operation time

**Phase:** Phase 2 (when implementing upload tools and report tools).

**Sources:**
- [MCP client times out after 60 seconds - TypeScript SDK #245](https://github.com/modelcontextprotocol/typescript-sdk/issues/245)
- [callTool timeout -32001 - TypeScript SDK #404](https://github.com/modelcontextprotocol/typescript-sdk/issues/404)
- [Odoo XML-RPC timeout configuration](https://www.odoo.com/forum/help-1/odoo-xmlrpc-timeout-how-do-i-configure-it-154913)

---

### Pitfall 13: Error Messages That Don't Help the LLM Recover

**What goes wrong:** Tool errors return generic messages like "An error occurred" or raw Odoo tracebacks that the LLM cannot interpret. The LLM either retries blindly or gives up, telling the user "something went wrong."

**Why it happens:** Developers handle errors for debugging (stack traces, error codes) rather than for LLM consumption. Odoo XML-RPC errors are particularly opaque -- they often return Python tracebacks as strings.

**Consequences:** Poor user experience. The LLM cannot self-correct or suggest alternatives. Users lose trust in the tool.

**Prevention:**
1. Use the mrpeasy `McpToolError` pattern -- separate `userMessage` (for LLM) from `internalDetails` (for logs)
2. Every error should answer: What failed? Why? What can the user/LLM do next?
3. Map common Odoo errors to actionable messages:
   - `AccessError` -> "You don't have permission to access [model]. Contact your admin."
   - `ValidationError` -> "The data was invalid: [specific field issue]."
   - `MissingError` -> "Record [id] not found. It may have been deleted."
   - `UserError` -> Pass through the Odoo message (usually user-friendly)
4. Set `isError: true` in the MCP response (not protocol-level error)
5. Include `isRetryable` and `suggestedAction` in error responses
6. Never expose internal paths, credentials, or stack traces

**Phase:** Phase 1 (error handling layer). Establish patterns before building tools.

**Sources:**
- [MCP Error Handling Best Practices](https://mcpcat.io/guides/error-handling-custom-mcp-servers/)
- [Better MCP tool call error responses](https://alpic.ai/blog/better-mcp-tool-call-error-responses-ai-recover-gracefully)
- [MCP Tools Specification - Error Handling](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)

---

## Minor Pitfalls

Mistakes that cause annoyance, minor bugs, or are easily fixable.

---

### Pitfall 14: Missing Pagination Leading to Truncated or Oversized Responses

**What goes wrong:** A user asks "show me all invoices" and the tool returns all 500+ invoices as a single response, exceeding the ~25,000 token response limit. The response is either truncated (losing the last items) or causes Claude to struggle with the volume.

**Prevention:**
1. Default all list operations to 20 items with optional pagination parameters
2. Return total count with each page: "Showing 1-20 of 347 invoices"
3. Include a `next_offset` in responses so the LLM can request more if needed
4. Use Odoo's built-in `offset` and `limit` parameters in `search_read` calls
5. Batch Odoo requests at max 500 records per XML-RPC call for performance

**Phase:** Phase 2+ (tool implementation). Enforce as a pattern for all list tools.

---

### Pitfall 15: Odoo Field Access Errors on Uninstalled Modules

**What goes wrong:** A tool tries to read a field that exists in a module not installed on the target Odoo instance (e.g., reading `employee.salary` when `hr_payroll` isn't installed). Odoo returns a Python `KeyError` or ignores the field silently.

**Prevention:**
1. On server startup, probe which Odoo modules are installed (`ir.module.module` with `state='installed'`)
2. Conditionally enable/disable tools based on available modules
3. Use try/catch around field reads and handle missing fields gracefully
4. Document required Odoo modules per tool domain in the server configuration

**Phase:** Phase 1 (initialization). Probe capabilities at startup.

---

### Pitfall 16: Context Parameter Not Passed via execute_kw

**What goes wrong:** Odoo operations return data in the wrong language, wrong timezone, or wrong company context because the `context` parameter wasn't included in the `execute_kw` call.

**Prevention:**
1. Always pass `context: { lang: 'en_US', tz: user_timezone }` in keyword arguments
2. For multi-company setups, include `allowed_company_ids` in context
3. Remember: `context` is only available via `execute_kw`, not plain `execute`

**Phase:** Phase 1 (XML-RPC client). Set as default in the client abstraction.

---

### Pitfall 17: OAuth Redirect URI Mismatch in Production

**What goes wrong:** The OAuth redirect URI works in development (localhost) but fails in production because the URI doesn't match exactly (trailing slash, http vs https, port number differences). Claude's OAuth flow silently fails.

**Prevention:**
1. Store allowed redirect URIs as environment variables, not hardcoded
2. Always use HTTPS in production (Dokploy handles TLS termination)
3. Test the full OAuth flow in a staging environment with the production domain
4. Validate redirect URI strictly -- exact match, no wildcards
5. Register the correct URI with Claude's MCP integration settings

**Phase:** Phase 1 (OAuth setup). Must work correctly before any user can authenticate.

---

### Pitfall 18: Docker Entrypoint Using npm/yarn Instead of node

**What goes wrong:** Container doesn't shut down gracefully because npm/yarn don't properly forward signals (SIGTERM/SIGINT) to the Node.js process.

**Prevention:**
1. Use `CMD ["node", "dist/server.js"]` in Dockerfile, not `CMD ["npm", "start"]`
2. Alternatively use `tini` as init process to handle signal forwarding
3. Test shutdown behavior: `docker stop` should exit with code 0, not 137

**Phase:** Phase 1 (Dockerfile setup).

---

### Pitfall 19: Odoo XML-RPC Base64 Encoding Mismatch

**What goes wrong:** When sending binary data (file attachments) to Odoo, the encoding format doesn't match what Odoo expects. Node.js Buffer base64 encoding might use URL-safe characters (`-`, `_`) while Odoo expects standard base64 (`+`, `/`). This causes silent data corruption or "Invalid base64" errors.

**Prevention:**
1. Always use standard base64 encoding (not URL-safe) for Odoo's `datas` field
2. Use `Buffer.from(data).toString('base64')` -- this produces standard base64 in Node.js
3. Verify round-trip: upload a file, download it, compare checksums
4. Be aware that the xmlrpc npm package may handle Binary types differently -- test explicitly

**Phase:** Phase 2 (file upload tools).

**Sources:**
- [Binary data issues with odoorpc](https://github.com/osiell/odoorpc/issues/23)
- [MCP SDK base64 encode/decode mismatch](https://github.com/modelcontextprotocol/python-sdk/issues/342)

---

### Pitfall 20: SDK Version Compatibility Between v1.x and v2.x

**What goes wrong:** The project starts with `@modelcontextprotocol/sdk` v1.15.0 (matching mrpeasy), but v2 is expected in Q1 2026. Breaking changes in the transport API, session management, or OAuth helpers could require significant refactoring.

**Prevention:**
1. Pin to the specific version (1.15.0) initially for stability
2. Monitor the SDK changelog and migration guides
3. Isolate SDK-specific code behind interfaces so upgrades are localized
4. Consider upgrading to latest v1.x (1.24.0+) for security fixes (CVE-2025-66414)
5. Plan a v2 migration phase after the SDK stabilizes (Q2 2026)

**Phase:** Phase 1 decision (which version to start with). The CVE fix in 1.24.0 is important.

**Sources:**
- [TypeScript SDK npm page](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- [TypeScript SDK releases](https://github.com/modelcontextprotocol/typescript-sdk/releases)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation | Severity |
|-------------|---------------|------------|----------|
| Transport setup | Session memory leak (#1) | TTL + sweep from day one | CRITICAL |
| Transport setup | Graceful shutdown (#10) | SIGTERM handler + SSE tracking | MODERATE |
| Transport setup | DNS rebinding (#5) | Upgrade SDK, enable protection | CRITICAL |
| OAuth implementation | Token storage (#3) | Encrypted storage, S256 PKCE | CRITICAL |
| OAuth implementation | Redirect URI mismatch (#17) | Env vars, test in staging | MINOR |
| OAuth implementation | API key expiration (#4) | Health checks, expiry alerts | CRITICAL |
| XML-RPC service layer | Rate limiting (#7) | Backoff, circuit breaker, queue | MODERATE |
| XML-RPC service layer | 60s timeout (#12) | Async patterns, pagination | MODERATE |
| XML-RPC service layer | API deprecation (#6) | Interface abstraction | MODERATE |
| XML-RPC service layer | Context missing (#16) | Default context in client | MINOR |
| Tool: file uploads | Base64 size limits (#8) | 5MB cap, clear errors | MODERATE |
| Tool: file uploads | Encoding mismatch (#19) | Standard base64, test roundtrip | MINOR |
| Tool: list operations | Missing pagination (#14) | Default limit=20, include totals | MINOR |
| Tool design (all) | LLM confusion (#9) | Namespaces, clear descriptions | MODERATE |
| Tool design (all) | Bad error messages (#13) | McpToolError pattern | MODERATE |
| Domain tools | Record rule confusion (#11) | Test with restricted users | MODERATE |
| Domain tools | Missing module fields (#15) | Probe modules at startup | MINOR |
| Deployment | Docker signals (#18) | `node` entrypoint, not npm | MINOR |
| Deployment | SDK version (#20) | Pin version, plan upgrade path | MINOR |
| Multi-user | Session isolation (#2) | Per-request client, audit logs | CRITICAL |

---

## Security Pitfall Summary

For quick reference, security-critical items that must be addressed before any production deployment:

| # | Pitfall | Risk | Phase |
|---|---------|------|-------|
| 2 | Session isolation failure | Data leakage between users | Phase 1 |
| 3 | OAuth token mishandling | Token theft, impersonation | Phase 1 |
| 4 | API key expiration | Silent auth failure | Phase 1 |
| 5 | DNS rebinding (CVE) | Unauthorized tool invocation | Phase 1 |
| 11 | Record rule confusion | Over-disclosure of data | Phase 2 |

---

## Sources

### Official Documentation
- [MCP Specification - Transports](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [MCP Specification - Authorization](https://modelcontextprotocol.io/specification/draft/basic/authorization)
- [MCP Specification - Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [Odoo 19 External JSON-2 API](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html)
- [Odoo 19 External RPC API (deprecated)](https://www.odoo.com/documentation/19.0/developer/reference/external_rpc_api.html)
- [Odoo 19 Security](https://www.odoo.com/documentation/19.0/developer/reference/backend/security.html)

### SDK Issues (Verified)
- [TypeScript SDK #812: Idle Session Timeout](https://github.com/modelcontextprotocol/typescript-sdk/issues/812)
- [TypeScript SDK #245: 60-second timeout](https://github.com/modelcontextprotocol/typescript-sdk/issues/245)
- [TypeScript SDK #510: SSE reconnection](https://github.com/modelcontextprotocol/typescript-sdk/issues/510)
- [TypeScript SDK #852: Session reuse in browser](https://github.com/modelcontextprotocol/typescript-sdk/issues/852)
- [Python SDK #756: Stateless mode memory leak](https://github.com/modelcontextprotocol/python-sdk/issues/756)
- [Python SDK #1076: Memory leak until OOM](https://github.com/modelcontextprotocol/python-sdk/issues/1076)
- [CVE-2025-66414: DNS rebinding](https://github.com/advisories/GHSA-w48q-cv73-mx4w)

### Community Analysis
- [MCP OAuth 2.1 and PKCE](https://aembit.io/blog/mcp-oauth-2-1-pkce-and-the-future-of-ai-authorization/)
- [MCP Authorization Spec critique](https://blog.christianposta.com/the-updated-mcp-oauth-spec-is-a-mess/)
- [MCP "too many tools" problem](https://demiliani.com/2025/09/04/model-context-protocol-and-the-too-many-tools-problem/)
- [MCP Error Handling Best Practices](https://mcpcat.io/guides/error-handling-custom-mcp-servers/)
- [Better MCP error responses](https://alpic.ai/blog/better-mcp-tool-call-error-responses-ai-recover-gracefully)

### Odoo Community
- [Odoo XML-RPC timeout configuration](https://www.odoo.com/forum/help-1/odoo-xmlrpc-timeout-how-do-i-configure-it-154913)
- [Odoo 429 rate limiting](https://www.odoo.com/forum/help-1/429-too-many-requests-on-xmlrpc-on-python-xmlrpcclient-220693)
- [Odoo.sh file upload limits](https://www.odoo.com/forum/help-1/is-there-a-file-size-limit-when-uploading-a-document-using-xmlrpc-in-odoosh-214182)
- [Odoo API key expiration PR](https://github.com/odoo/odoo/pull/193168)
