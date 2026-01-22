---
plan: 04-01
status: completed
started: 2026-01-19
completed: 2026-01-19
duration: ~3 min
---

# Summary: Error Utilities and API Client Enhancement

## Completed

Created centralized error handling utilities and enhanced the API client for LLM-friendly error responses.

1. **Error Utilities Module Created**
   - `McpToolError` class with properties: `userMessage`, `internalDetails`, `isRetryable`, `suggestedAction`, `errorCode`
   - Factory functions for common errors:
     - `createRateLimitError(retryAfterSeconds?)` - with retry guidance
     - `createServiceUnavailableError()` - for 503 responses
     - `createAuthenticationError()` - for 401/403 responses
     - `createNotFoundError(resource)` - for 404 responses
     - `createValidationError(field, issue)` - for input validation
     - `createUnexpectedError(error)` - wraps unknown errors
   - `formatErrorForMcp()` - formats errors for MCP response
   - `isRetryableHttpStatus()` - helper for retry decisions

2. **MrpEasyApiError Enhanced**
   - Added `isRetryable` property (computed from status code)
   - Added `retryAfterSeconds` property (extracted from header)
   - Status codes 429, 503, 408, 502, 504 marked as retryable

3. **API Client Updated**
   - Extracts `Retry-After` header for 429 responses
   - Returns specific error messages for 429, 503, 401/403, 404
   - Passes retry guidance to callers

4. **Module Exports Updated**
   - Created `lib/index.ts` re-exporting all utilities
   - All error utilities available via `import { ... } from '../../lib/errors.js'`

## Files Created

- `mcp/mrpeasy/src/lib/errors.ts`
- `mcp/mrpeasy/src/lib/index.ts`

## Files Modified

- `mcp/mrpeasy/src/services/mrpeasy/client.ts`

## Verification

- [x] `npm run typecheck` passes
- [x] McpToolError class has userMessage, internalDetails, isRetryable, suggestedAction
- [x] Factory functions for rate limit, service unavailable, auth, not found, validation, unexpected errors
- [x] MrpEasyApiError has isRetryable and retryAfterSeconds properties
- [x] Client extracts Retry-After header from 429 responses
- [x] All exports available from module indexes

## Error Messages

All error messages are:
- Complete sentences
- Actionable (tell LLM what to do)
- No technical jargon (no stack traces)
- Include suggestions for recovery
