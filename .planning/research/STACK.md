# Technology Stack

**Project:** Inventory Planner MCP Server
**Researched:** 2026-01-25
**Context:** Subsequent milestone - adding to existing codebase with established MCP patterns

## Stack Status

This is a **subsequent milestone** adding Inventory Planner API integration to an existing MCP server repository. The core stack is already established and should NOT be changed.

### Already Established (Do Not Change)

| Technology | Version | Purpose | Status |
|------------|---------|---------|--------|
| TypeScript | ^5.7.3 | Type-safe JavaScript | **ESTABLISHED** |
| Node.js | >=18.0.0 | Runtime with native fetch | **ESTABLISHED** |
| Express | ^4.21.0 | HTTP server for MCP transport | **ESTABLISHED** |
| @modelcontextprotocol/sdk | ^1.15.0 | MCP protocol implementation | **ESTABLISHED** |
| Zod | ^3.25.0 | Runtime schema validation | **ESTABLISHED** |
| tsx | ^4.19.2 | Dev server with hot reload | **ESTABLISHED** |

**Confidence: HIGH** - Verified from existing `/mcp/inventory-planner/package.json`

### Already Implemented for Inventory Planner

| Component | File | Status |
|-----------|------|--------|
| API Client | `src/services/inventory-planner/client.ts` | **IMPLEMENTED** |
| Types | `src/services/inventory-planner/types.ts` | **IMPLEMENTED** |
| Rate Limiter | `src/services/inventory-planner/rate-limiter.ts` | **IMPLEMENTED** |
| Circuit Breaker | `src/services/inventory-planner/circuit-breaker.ts` | **IMPLEMENTED** |
| Request Queue | `src/services/inventory-planner/request-queue.ts` | **IMPLEMENTED** |
| Retry Logic | `src/services/inventory-planner/retry.ts` | **IMPLEMENTED** |
| HTTP Server | `src/server.ts` | **IMPLEMENTED** |
| Env Validation | `src/lib/env.ts` | **IMPLEMENTED** |
| MCP Tools | `src/mcp/tools/` | **PARTIAL** |

## Inventory Planner API Specifics

### Authentication Pattern

| Header | Value | Source |
|--------|-------|--------|
| `Authorization` | API Key (raw string, not Base64) | INVENTORY_PLANNER_API_KEY env var |
| `Account` | Account ID | INVENTORY_PLANNER_ACCOUNT_ID env var |

**Confidence: HIGH** - Verified from existing implementation

### Rate Limiting

| Setting | Value | Rationale |
|---------|-------|-----------|
| Bucket Capacity | 30 tokens | Conservative - IP lacks documented limits |
| Refill Rate | 3 tokens/second | ~180 requests/minute sustained |

**Confidence: MEDIUM** - May need adjustment based on production behavior

### Pagination Format

| Parameter | Description | Example |
|-----------|-------------|---------|
| `page` | Page number (1-indexed) | `?page=2` |
| `limit` | Items per page (max 1000) | `?limit=100` |

**Confidence: HIGH** - Verified from existing implementation

### Base URL

| Environment | URL |
|-------------|-----|
| Production | `https://app.inventory-planner.com` |

## Stack Recommendations

### No Additional Dependencies Needed

The existing stack is sufficient. **Do NOT add:**
- `axios` - Native fetch is sufficient and already in use
- `got` - Native fetch is sufficient
- `p-queue` - Custom request queue already implemented
- `bottleneck` - Custom rate limiter already implemented

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `INVENTORY_PLANNER_API_KEY` | Yes | API key from Inventory Planner |
| `INVENTORY_PLANNER_ACCOUNT_ID` | Yes | Account ID |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | Environment (default: development) |

## Sources

- `/mcp/inventory-planner/package.json` - Package dependencies (verified)
- `/mcp/inventory-planner/src/services/inventory-planner/client.ts` - API client (verified)
- `/mcp/inventory-planner/src/services/inventory-planner/types.ts` - Type definitions (verified)
- `/mcp/inventory-planner/src/services/inventory-planner/rate-limiter.ts` - Rate limiting (verified)
- `/mcp/mrpeasy/src/services/mrpeasy/client.ts` - Reference implementation (verified)

## Summary

**The stack is already complete.** No additional dependencies needed. Focus implementation on completing MCP tools for stock analytics.
