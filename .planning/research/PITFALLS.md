# Domain Pitfalls: Inventory Planner MCP Server

**Domain:** MCP Server for Inventory Analytics (Inventory Planner API Integration)
**Researched:** 2026-01-25
**Confidence:** MEDIUM (based on existing codebase analysis, MRPeasy patterns, and inventory domain knowledge)

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Undocumented Rate Limits

**What goes wrong:**
Inventory Planner API does not publicly document rate limits. The current implementation uses conservative defaults (30 capacity, 3 tokens/second) based on guesswork. If actual limits are lower, the circuit breaker trips frequently. If higher, the server is unnecessarily slow.

**Prevention:**
1. Add telemetry to track actual rate limit behavior (429 frequency, response times)
2. Make rate limit constants configurable via environment variables
3. Implement adaptive rate limiting that adjusts based on observed 429 responses
4. Document the conservative defaults and provide tuning guidance

**Phase to address:** Phase 1 (Core Infrastructure)

**Confidence:** MEDIUM (based on code analysis, not verified with Inventory Planner)

---

### Pitfall 2: Forecast Data Staleness Not Communicated

**What goes wrong:**
Inventory Planner forecasts (`forecast_daily`, `forecast_weekly`, `velocity_daily`, etc.) are calculated at specific points in time. LLMs may treat these as real-time values and make recommendations based on stale data.

**Prevention:**
1. Include `updated_at` timestamp in all forecast-related responses
2. Add warnings in tool descriptions about forecast freshness
3. Consider adding a "data_freshness" field to responses
4. Document which metrics are point-in-time vs. real-time

**Phase to address:** Phase 2 (Read Tools)

**Confidence:** MEDIUM

---

### Pitfall 3: Stockout History Data Gaps

**What goes wrong:**
The core use case is answering "how long was SKU X out of stock?" but Inventory Planner's variants endpoint returns current state, not historical time-series data. Attempting to answer historical questions with current-state data produces incorrect answers.

**Why it happens:**
- Variants endpoint returns `oos` (days until stockout) and `days_of_stock`, not "was out of stock"
- No explicit stockout history endpoint identified in the API
- The `oos` and `under_value` fields are **forward-looking predictions**, not historical data

**Prevention:**
1. Research Inventory Planner API thoroughly for stockout history endpoints
2. If no history endpoint exists, document this limitation explicitly
3. Design tools to clearly distinguish "current state" vs "historical analysis"
4. Consider alternative data sources for historical stockout tracking

**Phase to address:** Phase 1 (Research) and Phase 2 (Read Tools)

**Confidence:** LOW (needs API documentation verification)

---

### Pitfall 4: Purchase Order Creation Without Vendor Validation

**What goes wrong:**
The `create_purchase_order` tool accepts any `vendor_id` without verifying the vendor exists or is associated with the items being ordered.

**Prevention:**
1. Add vendor validation before creating PO (check vendor exists)
2. Validate items are associated with the specified vendor
3. Warn in preview mode if vendor/item association is unknown
4. Consider requiring vendor_id to match item's `vendor_id` field

**Phase to address:** Phase 3 (Write Tools)

**Confidence:** MEDIUM

---

### Pitfall 5: Large Dataset Token Overflow

**What goes wrong:**
Inventory Planner can return up to 1000 items per page. Tool responses that JSON-stringify all items can exceed LLM context limits, causing truncation or parsing failures.

**Prevention:**
1. Calculate approximate token count before returning (estimate: 1 token per 4 chars)
2. If response exceeds threshold (e.g., 10,000 tokens), return summary + pagination info
3. Reduce default limit (100 is already reasonable)
4. Add `max_response_items` config to cap regardless of user request
5. Use field selection (`fields` parameter) to reduce response size

**Phase to address:** Phase 2 (Read Tools)

**Confidence:** HIGH (verified from code: limit can be up to 1000)

---

## Moderate Pitfalls

Mistakes that cause delays or technical debt.

### Pitfall 6: Inconsistent Field Naming Between API and Tools

**What goes wrong:**
Inventory Planner API uses snake_case (`stock_on_hand`, `vendor_id`). Tool responses may use camelCase. This inconsistency confuses LLMs that need to cross-reference data.

**Prevention:**
1. Pick one convention and stick to it (recommend: match API, use snake_case)
2. Document the transformation if keeping camelCase
3. Use a centralized formatter utility for all transformations
4. Include both forms in tool descriptions if needed

**Phase to address:** Phase 2 (Read Tools)

**Confidence:** HIGH

---

### Pitfall 7: Pagination Metadata Not Actionable

**What goes wrong:**
Tool responses include pagination (`{ showing: 50, total: 1234, page: 1, limit: 50 }`) but don't tell the LLM how to get the next page.

**Prevention:**
1. Add explicit pagination guidance: `"hasMore": true, "nextAction": "call get_variants with page: 2"`
2. Include `hasMore` boolean for quick check
3. Tool description should explain pagination behavior
4. Consider auto-pagination for small result sets (< threshold)

**Phase to address:** Phase 2 (Read Tools)

**Confidence:** HIGH

---

### Pitfall 8: Missing Warehouse Context in Multi-Warehouse Accounts

**What goes wrong:**
Accounts with multiple warehouses return variants aggregated or per-warehouse depending on query. Tools that don't handle warehouse context return confusing data.

**Prevention:**
1. Default to warehouse-specific queries when warehouse_id is available
2. Include warehouse name in all responses
3. Add `aggregate_warehouses: boolean` option for cross-warehouse views
4. Document multi-warehouse behavior in tool descriptions

**Phase to address:** Phase 2 (Read Tools)

**Confidence:** MEDIUM (depends on Inventory Planner account configuration)

---

### Pitfall 9: Confirm Flag Bypass for Destructive Operations

**What goes wrong:**
Write tools use `confirm: boolean` to prevent accidental mutations. But an LLM can learn to always set `confirm: true` to "be helpful," bypassing the safety mechanism.

**Prevention:**
1. Add secondary confirmation for high-impact operations (e.g., PO > $10,000)
2. Rate limit confirmed mutations (max 1 per conversation turn)
3. Log all mutations with timestamps for audit
4. Return preview summary EVEN when confirm=true, so user sees what happened

**Phase to address:** Phase 3 (Write Tools)

**Confidence:** MEDIUM

---

### Pitfall 10: Circuit Breaker Trips on Maintenance Windows

**What goes wrong:**
Inventory Planner may have scheduled maintenance windows that return 503 errors. The circuit breaker treats these as failures and opens, blocking all requests.

**Prevention:**
1. Implement longer timeout window for 503 errors specifically
2. Add exponential backoff before circuit opens on 503
3. Consider maintenance mode awareness (if Inventory Planner has status API)
4. Increase HALF_OPEN success threshold to verify true recovery

**Phase to address:** Phase 1 (Core Infrastructure)

**Confidence:** MEDIUM

---

## Minor Pitfalls

### Pitfall 11: No SKU Search Fuzzy Matching

Searching for "ABC123" when SKU is "ABC-123" returns no results.

**Prevention:** Use case-insensitive search by default; consider fuzzy matching.

**Phase to address:** Phase 2 (Read Tools)

---

### Pitfall 12: Vendor Name Not Included in Replenishment Results

Replenishment results show `vendorId` but not `vendor_name`. LLM has to make additional call to get vendor name.

**Prevention:** Always include vendor_name when vendor_id is present.

**Phase to address:** Phase 2 (Read Tools)

---

### Pitfall 13: Date Format Inconsistency (RFC822 vs ISO 8601)

Inventory Planner uses RFC822 date format. LLMs and users typically expect ISO 8601.

**Prevention:** Accept ISO 8601 in tool parameters; convert to RFC822 before sending to API.

**Phase to address:** Phase 2 (Read Tools) and Phase 3 (Write Tools)

---

## Phase-Specific Warnings

| Phase | Likely Pitfall | Mitigation |
|-------|---------------|------------|
| Phase 1: Core Infrastructure | Undocumented rate limits, circuit breaker sensitivity | Configurable rate limits, telemetry, adjusted circuit breaker |
| Phase 2: Read Tools | Token overflow, pagination not actionable, forecast staleness | Response size limits, pagination guidance, timestamp inclusion |
| Phase 3: Write Tools | Vendor validation missing, confirm bypass | Pre-mutation validation, secondary confirmation |
| Phase 4: Historical Queries | Stockout history data gaps | Verify API capabilities, document limitations |

## "Looks Done But Isn't" Checklist

- [ ] **Rate Limits:** Configured but not from environment variables, not tunable
- [ ] **Pagination:** Returns metadata but no actionable guidance for LLM
- [ ] **Timestamps:** Forecast responses don't include data freshness
- [ ] **Vendor Validation:** Write tools don't validate vendor/item associations
- [ ] **Token Budget:** No limit on response size, can overflow context
- [ ] **Field Naming:** Inconsistent between API (snake_case) and response (camelCase)
- [ ] **Warehouse Context:** Multi-warehouse accounts may get confusing results
- [ ] **Date Formats:** RFC822 in API, but LLMs expect ISO 8601
- [ ] **Stockout History:** Core use case may not be achievable with current API
- [ ] **Circuit Breaker:** May be too aggressive during maintenance windows

---

*Pitfalls research for: Inventory Planner MCP Server*
*Researched: 2026-01-25*
