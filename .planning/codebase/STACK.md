# Technology Stack

**Analysis Date:** 2026-01-25

## Languages

**Primary:**
- TypeScript 5.7.3 - All source code for MCP servers (mrpeasy, inventory-planner)

**Secondary:**
- JavaScript (Node.js built artifacts)
- Shell (Docker multi-stage builds)

## Runtime

**Environment:**
- Node.js 20 (Alpine base image)
- Node 18+ minimum requirement (as specified in package.json engines)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` (created during `npm ci`)

## Frameworks

**Core:**
- `@modelcontextprotocol/sdk` ^1.15.0 - MCP (Model Context Protocol) server implementation
  - Provides `StreamableHTTPServerTransport` for HTTP-based MCP communication
  - Used in `src/server.ts` for handling sessions and MCP JSON-RPC protocol
  - Location: `src/mcp/` modules across all servers

**Web:**
- `express` ^4.21.0 - HTTP server for MCP transport layer
  - Used for `/health` and `/mcp` POST endpoints
  - Session management via Express middleware
  - Located in `src/server.ts`

**Validation:**
- `zod` ^3.25.0 - Schema validation for environment variables and API types
  - Used in `src/lib/env.ts` for startup configuration validation
  - Used for type-safe API response parsing in service layers
  - Fail-fast validation at server startup

**Testing:** None detected in current codebase

**Build/Dev:**
- `tsx` ^4.19.2 - TypeScript execution and hot-reloading for development
  - `npm run dev` uses `tsx watch src/server.ts`
- `typescript` ^5.7.3 - TypeScript compiler
  - Configured in `tsconfig.json` with ES2022 target

## Key Dependencies

**Critical:**
- `@modelcontextprotocol/sdk` ^1.15.0
  - Why: Provides entire MCP protocol implementation and session management
  - Without: Cannot run as MCP server

**Type Definitions:**
- `@types/express` ^5.0.0 - Express type definitions
- `@types/node` ^22.10.7 - Node.js type definitions (includes native fetch, crypto)

## Configuration

**Environment:**
- Environment variables validated at startup using Zod schemas in `src/lib/env.ts`
- Required variables (fail if missing):
  - `MRPEASY_API_KEY` and `MRPEASY_API_SECRET` (mrpeasy server)
  - `INVENTORY_PLANNER_API_KEY` and `INVENTORY_PLANNER_ACCOUNT_ID` (inventory-planner server)
- Optional variables with defaults:
  - `PORT=3000` (configurable, validated as valid port number)
  - `NODE_ENV=development` (allowed: development, production, test)

**Build:**
- `tsconfig.json` - TypeScript compiler configuration
  - Target: ES2022
  - Module: NodeNext (ESM format)
  - Strict mode: enabled
  - Output: `./dist` directory

## Platform Requirements

**Development:**
- Node 18+ (specified in `package.json` engines field)
- npm for dependency management
- Environment variables file (.env or .env.example)

**Production:**
- Docker container execution
- Node 20-alpine base image (two-stage build)
- Build stage: installs dependencies, runs TypeScript compilation (`npm run build`)
- Runtime stage: installs only production dependencies (`npm ci --omit=dev`)
- Exposes port 3000
- ENV NODE_ENV=production set in runtime stage
- Entry point: `node dist/server.js`

## Module System

**Format:** ES Modules (ESM)
- `"type": "module"` in package.json
- All imports use `.js` extension (required for ESM in Node.js)
- Import syntax: `import { x } from './module.js'`
- Example: `import { logger } from './lib/logger.js'`

## Native APIs

**Fetch API:** Node 18+ native `fetch()` used for HTTP requests
- Located in `src/services/mrpeasy/client.ts` and `src/services/inventory-planner/client.ts`
- Basic Auth (MRPeasy) and Authorization header (Inventory Planner)
- Handles Range headers for pagination
- Native response parsing (no axios/node-fetch dependency)

**Crypto:** Node.js native `crypto.randomUUID()`
- Used in `src/server.ts` for generating MCP session IDs
- Used in MRPeasy client for base64 encoding (Basic Auth): `Buffer.from().toString('base64')`

---

*Stack analysis: 2026-01-25*
