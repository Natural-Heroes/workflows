# Codebase Concerns

**Analysis Date:** 2025-01-25

## Tech Debt

**Type Safety Issues with `as any` Casts:**
- Issue: Extensive use of `as any` type casts throughout tools to work around API response shape mismatches
- Files: `mcp/mrpeasy/src/mcp/tools/boms.ts` (2 instances), `orders.ts` (8 instances), `purchase-orders.ts` (4 instances), `routings.ts` (2 instances), `shipments.ts` (4 instances)
- Impact: Bypasses TypeScript type checking, makes refactoring error-prone, hides API response schema mismatches. Any changes to response handling won't catch issues at compile time.
- Fix approach: Define explicit interfaces for API response variations in `types.ts`, use discriminated unions to handle API shape inconsistencies. Remove all `as any` casts and properly type the "raw" response objects.

**Session Memory Leak Potential:**
- Issue: In-memory session store in `mcp/mrpeasy/src/server.ts` at line 31 uses a Map that grows unbounded if client connections don't properly trigger `onclose` callbacks
- Files: `mcp/mrpeasy/src/server.ts` (lines 30-79)
- Impact: Long-running server instances could accumulate abandoned sessions, consuming heap memory over time. No session TTL or garbage collection mechanism.
- Fix approach: Implement session timeout tracking, add periodic cleanup job to remove stale sessions (e.g., sessions not accessed within 30 minutes). Track session creation time and last activity timestamp.

**Hardcoded Rate Limit Constants:**
- Issue: Rate limiter configured with conservative defaults (75 capacity, 7.5 tokens/second) based on empirical observation, not documented API spec
- Files: `mcp/mrpeasy/src/services/mrpeasy/rate-limiter.ts` (lines 85-94)
- Impact: May be overly conservative (slower than necessary) or inadequate if API specs change. Comment at line 85-87 indicates uncertainty about actual limits.
- Fix approach: Move rate limit constants to environment variables with documented defaults. Add configuration to `.env.example` and project docs explaining how to tune based on observed behavior.

**Magic Status Code Mappings:**
- Issue: Customer order and manufacturing order status code mappings are hardcoded in formatter functions
- Files: `mcp/mrpeasy/src/mcp/tools/orders.ts` (lines 130-163, 185-205)
- Impact: If MRPeasy API changes status codes, must update multiple tool files. No validation that all codes are handled. New status codes silently return string representation of number.
- Fix approach: Extract status mappings to a centralized `statusMaps.ts` config file with exhaustive enum definitions. Use `satisfies` TypeScript operator to ensure all codes are mapped.

## Known Bugs

**Pagination Parameter Ignored for Some Endpoints:**
- Symptoms: `get_inventory` and other tools accept `page`/`per_page` parameters, but MRPeasy API ignores these and requires Range headers instead
- Files: `mcp/mrpeasy/src/mcp/tools/inventory.ts` (lines 40-52), `mcp/mrpeasy/src/services/mrpeasy/client.ts` (lines 228-243)
- Trigger: Calling `getStockItems()` with `page=2` parameter does not return second page of results
- Workaround: Use internal `getStockItemsWithRange()` method with offset/limit, but LLM-facing tools don't expose this. The tool parameters are misleading.
- Fix approach: Either remove `page`/`per_page` parameters from inventory tools (breaking change), or internally convert them to Range headers. Document this MRPeasy API quirk clearly.

**Circuit Breaker Trips on 4xx Errors (Fixed but Fragile):**
- Symptoms: Circuit breaker was tripping on validation errors (400, 401, 403), blocking requests unnecessarily
- Files: `mcp/mrpeasy/src/services/mrpeasy/client.ts` (lines 175-182), `mcp/mrpeasy/src/services/mrpeasy/circuit-breaker.ts`
- Status: Recently fixed in commit `01af98d` by adding `shouldTrip` predicate, but the fix requires careful caller-side logic
- Risk: Easy to regress. Any future code adding new error handling paths could accidentally trip the breaker on client errors.
- Fix approach: Add unit tests explicitly verifying circuit breaker doesn't trip on 4xx errors. Document the behavior in circuit breaker class JSDoc.

**Null/Undefined Data Transformation Fragility:**
- Issue: Tools use `??` and fallback patterns throughout to handle missing API fields, but no centralized validation
- Files: `mcp/mrpeasy/src/mcp/tools/orders.ts` (137 occurrences of null/undefined handling), `inventory.ts`, `boms.ts`, `routings.ts`, `shipments.ts`
- Impact: If API response structure changes (fields move, rename, disappear), tools may silently show "Unknown" or 0 values instead of failing loudly. User gets incorrect data without warning.
- Example: `raw.item_title ?? 'Unknown'` masks cases where item_title should exist but doesn't (lines 230, 322)
- Fix approach: Add response validation layer using Zod schemas that parse API responses before transformation. Fail with clear error message if required fields are missing.

## Security Considerations

**Basic Auth Credentials in Memory:**
- Risk: API credentials stored as plaintext in `MrpEasyClient.authHeader` Base64-encoded string
- Files: `mcp/mrpeasy/src/services/mrpeasy/client.ts` (lines 134-136)
- Current mitigation: Credentials only in memory (not logged), environment variable loading via `env.ts`
- Recommendations: Document that `MRPEASY_API_KEY` and `MRPEASY_API_SECRET` must never be logged. Consider adding credential masking to logger. Use Node.js native crypto for secure string handling if available.

**No Input Validation on Write Operations:**
- Risk: Write tools (`create_customer_order`, `update_item`, etc.) accept user input and send directly to MRPeasy API
- Files: `mcp/mrpeasy/src/mcp/tools/mutations.ts` (create/update functions)
- Current mitigation: Zod schemas validate type (positive numbers, non-empty strings), but no business logic validation
- Recommendations: Add validation for cross-field constraints (e.g., delivery_date > order_date, quantity > 0). Validate IDs exist before creating related records.

**Error Messages Leak API Details:**
- Risk: Tool error responses pass through raw API error messages, which may leak system details
- Files: `mcp/mrpeasy/src/mcp/tools/error-handler.ts` (line 37), `mcp/mrpeasy/src/lib/errors.ts` (lines 135-142)
- Current mitigation: Generic error messages for most codes (429, 503, 404)
- Recommendations: For API validation errors (400), sanitize error messages before returning to user. Avoid exposing internal field names or API schema details.

**No Rate of Change Limits on Mutations:**
- Risk: Nothing prevents rapid-fire creation of orders, items, etc.
- Files: `mcp/mrpeasy/src/mcp/tools/mutations.ts`
- Impact: Could be abused to spam-create data if client is compromised
- Recommendations: Add optional rate limiting on write operations. Require explicit `confirm=true` flag (already done) and consider secondary confirmation on high-impact operations.

## Performance Bottlenecks

**Single Sequential Request Processing:**
- Problem: Request queue enforces 1 concurrent request at all times
- Files: `mcp/mrpeasy/src/services/mrpeasy/request-queue.ts` (enforces serial execution), `mcp/mrpeasy/src/server.ts` (shared client per session)
- Impact: If client makes 10 requests, they process sequentially. With 2s rate limit window, 10 requests take ~13-15 seconds. Multiplied by network latency, user experience is slow.
- Current Design: This matches MRPeasy API limits, but is the only documented constraint.
- Improvement path: Verify MRPeasy actually requires serial requests. If parallelism is allowed, implement request coalescing (merge duplicate in-flight requests for same resource). Or implement connection pooling with multiple concurrent streams.

**Rate Limiter with Conservative Defaults:**
- Problem: 75 tokens / 7.5 per second = 10 requests per second max (well below advertised 100/10s)
- Files: `mcp/mrpeasy/src/services/mrpeasy/rate-limiter.ts` (lines 92-94)
- Impact: Unnecessarily throttles API calls, adds latency. Comment indicates uncertainty about real limits.
- Improvement path: Run load tests against MRPeasy API to determine actual burst capacity. Adjust defaults based on results. Add telemetry to track token bucket health.

**Pagination Parsing Uses Regex on Every Response:**
- Problem: `parseContentRange()` runs regex match on every paginated response
- Files: `mcp/mrpeasy/src/mcp/tools/orders.ts` (lines 245-254), `inventory.ts` (lines 76-88)
- Impact: Negligible for typical responses, but adds microseconds per call. Not a true bottleneck.
- Improvement path: Cache compiled regex pattern, or parse Content-Range header once in API client layer before tools process it.

## Fragile Areas

**Tool Response Formatting is Scattered:**
- Files: Each tool file (orders.ts, inventory.ts, boms.ts, etc.) implements its own JSON response formatting logic
- Why fragile: Copy-paste pattern formatting logic across multiple files. Inconsistent null handling, date formatting, pagination parsing.
- Safe modification: Extract all response formatting into shared utility module. Create helpers like `formatPagination()`, `buildOrderResponse()`, etc. that all tools reuse.
- Test coverage: No unit tests for response formatting logic. Response structure changes could break LLM parsing without warning.

**Circuit Breaker State Management:**
- Files: `mcp/mrpeasy/src/services/mrpeasy/circuit-breaker.ts`
- Why fragile: State transitions depend on error classification from caller's `shouldTrip` predicate. If predicate logic is wrong, breaker doesn't protect correctly.
- Safe modification: Add unit tests covering all state transitions (CLOSED→OPEN, OPEN→HALF_OPEN, HALF_OPEN→CLOSED, and single-failure-to-reopen). Test with various error types.
- Test coverage: No explicit tests verifying circuit breaker behavior with different error scenarios.

**Status Code String Mappings Missing Codes:**
- Files: `mcp/mrpeasy/src/mcp/tools/orders.ts` (lines 130-163 for CO status, 185-205 for MO status)
- Why fragile: Hardcoded switch statements don't cover all possible MRPeasy status codes. New codes silently fall through to `String(status)` with no warning.
- Safe modification: Use exhaustive Zod enum for all known status codes. Fail loudly if unknown code received. Document all possible codes in comments.
- Test coverage: No validation that all status codes from API are handled.

**Session Cleanup Depends on Transport `onclose`:**
- Files: `mcp/mrpeasy/src/server.ts` (lines 71-80)
- Why fragile: Session deletion only triggered if client properly closes. Abandoned connections leak memory.
- Safe modification: Add session TTL mechanism with timestamp tracking. Implement periodic cleanup job. Make session cleanup explicit via DELETE endpoint (already exists but rarely used).
- Test coverage: No tests for session lifecycle under network interruption or client crash scenarios.

## Scaling Limits

**In-Memory Session Storage:**
- Current capacity: Unbounded Map, limited only by available Node.js heap memory
- Limit: With typical session size (~few KB), 1GB heap = ~100k sessions before OOM. Real limit is lower due to other heap usage.
- Scaling path: For multi-session deployment, implement session store abstraction. Add Redis/Memcached backend for distributed sessions. Add session eviction policy (LRU).

**Single Request Queue Per Client:**
- Current capacity: All requests for all sessions share one global queue
- Limit: If 100 concurrent sessions, they all block each other in the queue. Scales poorly with concurrent clients.
- Scaling path: Move request queue per-session instead of global. Verify MRPeasy allows this. Consider implementing request prioritization for critical operations.

**Rate Limiter is Global:**
- Current capacity: 75 tokens total, shared across all sessions
- Limit: Multi-session deployments will exhaust tokens quickly. One heavy user starves others.
- Scaling path: Implement per-session rate limiting with separate token buckets. Add configurable rate limit per session. Monitor token bucket telemetry.

## Dependencies at Risk

**Zod Version Constraint:**
- Package: `zod@^3.25.0`
- Risk: Using caret constraint allows minor/patch updates. No pin to specific version.
- Impact: Major versions (4.x) may have breaking changes. Minor version bugs could silently update.
- Migration plan: Pin to `3.25.0` or test against `4.x` if released. Add pre-commit hook to validate Zod schema parsing.

**Express Version:**
- Package: `express@^4.21.0`
- Risk: Caret constraint, express 5.x may have breaking changes
- Impact: Automatic minor updates could introduce incompatibilities
- Migration plan: Monitor express changelog. Pin to `4.21.0` until 5.x is tested. Express is stable, but major version upgrades require verification.

**SDK Version Lock:**
- Package: `@modelcontextprotocol/sdk@^1.15.0`
- Risk: SDK is external, may introduce breaking changes
- Impact: Tool signatures may change with new SDK versions
- Migration plan: Document which SDK versions are tested. Pin to minimum working version. Test new SDK versions in staging before upgrading.

## Missing Critical Features

**No Retry-After Handling for Non-429 Errors:**
- Problem: Retry logic respects Retry-After header only for 429 errors, ignores it for 503
- Files: `mcp/mrpeasy/src/services/mrpeasy/retry.ts` (lines 97-120)
- Blocks: Cannot gracefully backoff during MRPeasy maintenance windows when 503 includes Retry-After
- Fix approach: Check Retry-After header for any 5xx error, use it if present. Fall back to exponential backoff if missing.

**No Request Logging/Auditing for Mutations:**
- Problem: Write operations (create/update) succeed silently, no audit trail of who changed what
- Files: `mcp/mrpeasy/src/mcp/tools/mutations.ts`
- Blocks: Compliance, debugging, data reconciliation after errors
- Fix approach: Log all mutation requests and responses with user context. Include confirm flag, original payload, API response. Store in separate audit log file.

**No Health Check for API Connectivity:**
- Problem: MCP server reports "healthy" via `/health` endpoint, but doesn't verify MRPeasy API is reachable
- Files: `mcp/mrpeasy/src/server.ts` (lines 36-42)
- Blocks: Can't detect API credential issues until first request fails
- Fix approach: Add optional health check endpoint that calls MRPeasy API (e.g., GET /items with limit=1). Return 503 if API unreachable.

**No Caching Layer:**
- Problem: Every request hits MRPeasy API, no response caching
- Files: Entire client module
- Blocks: Can't handle read-heavy workloads efficiently. Inventory queries could be cached for 1 minute.
- Fix approach: Add optional in-memory cache with TTL. Cache GET operations only. Make cache configurable per tool.

## Test Coverage Gaps

**No Tests for Error Scenarios:**
- What's not tested: Circuit breaker behavior, retry logic, rate limiting under load
- Files: `mcp/mrpeasy/src/services/mrpeasy/` (client, retry, circuit-breaker, rate-limiter)
- Risk: Core resilience features could fail silently. Regression on error handling undetected.
- Priority: High - these components are critical for reliability

**No Tests for Response Formatting:**
- What's not tested: How tools format JSON responses, pagination parsing, null value handling
- Files: `mcp/mrpeasy/src/mcp/tools/orders.ts`, `inventory.ts`, `boms.ts`, etc.
- Risk: Response structure could break for edge cases (empty results, missing fields, malformed dates)
- Priority: High - LLM parsing depends on consistent response structure

**No Integration Tests:**
- What's not tested: End-to-end flow from HTTP request to MCP response with mocked MRPeasy API
- Files: No test files found in repo
- Risk: Can't verify session lifecycle, request queuing, or tool behavior with real API shapes
- Priority: Medium - would catch issues earlier in development

**No Load/Stress Tests:**
- What's not tested: Behavior under concurrent sessions, rate limiter accuracy, memory usage
- Files: No test files for server or resilience components
- Risk: Scaling issues (session leaks, queue deadlock) unknown until production
- Priority: Medium - important before deploying at scale

**No Session Lifecycle Tests:**
- What's not tested: Session creation, reuse, cleanup on client disconnect, timeout handling
- Files: `mcp/mrpeasy/src/server.ts`
- Risk: Memory leaks or session conflicts undetected
- Priority: Medium - session management is complex and error-prone

---

*Concerns audit: 2025-01-25*
