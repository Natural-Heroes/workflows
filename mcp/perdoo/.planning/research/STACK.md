# Technology Stack

**Project:** Perdoo MCP Server (GraphQL API Client)
**Researched:** 2026-01-23

## Recommended Stack

### Decision: Raw Fetch over graphql-request

**Recommendation: Use raw `fetch` with a thin typed wrapper. Do NOT use `graphql-request`.**

**Confidence: HIGH**

**Rationale:**

1. **Consistency with MRPeasy server** - The existing MRPeasy client uses raw `fetch` (Node 18+ native) with a hand-rolled resilience stack (retry, rate limiter, circuit breaker, request queue). Using the same approach for GraphQL means the team has one pattern to maintain, not two.

2. **Avoids heavy peer dependency** - `graphql-request@7.x` requires the `graphql` npm package (~474 KB) as a peer dependency. This is the full GraphQL runtime (parser, validator, executor) when all we need is to POST a query string. The published size of graphql-request itself is 420 KB with the graphql dep. For a server that just sends query strings to an endpoint, this is unnecessary bloat.

3. **GraphQL over HTTP is trivially simple** - A GraphQL request is just a POST with `{"query": "...", "variables": {...}}`. The MRPeasy client already demonstrates this pattern for REST. Adapting it for GraphQL requires changing the request body format, not adding a library.

4. **No client-side caching needed** - MCP tools are stateless request-response. There is no need for Apollo's normalized cache, Relay's store, or even graphql-request's document caching. Each tool invocation is independent.

5. **Full control over error handling** - GraphQL APIs return 200 OK with `errors` in the response body. A thin wrapper lets us handle this in a way that integrates cleanly with the existing resilience stack (circuit breaker needs to know about GraphQL-level errors, not just HTTP errors).

6. **ESM/TypeScript compatibility is already solved** - The MRPeasy tsconfig uses `module: "NodeNext"` and `moduleResolution: "NodeNext"` which is what graphql-request requires anyway. But since we are using raw fetch, there is zero configuration concern.

### What graphql-request Would Give Us (and why we do not need it)

| Feature | graphql-request | Our Approach |
|---------|----------------|--------------|
| `gql` template tag | Syntax highlighting in editors | Use plain strings (no runtime cost, same functionality) |
| TypedDocumentNode | Type-safe queries | Hand-type responses per-query (better control) |
| Error extraction | Auto-extracts `errors` array | 5 lines of code in our wrapper |
| File uploads | Multipart form-data | Not needed for Perdoo (no file upload mutations) |
| Batching | Request batching | Not needed (sequential MCP tool calls) |

### Core Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Node.js | >=18.0.0 | Runtime | Native fetch, ESM support, matches MRPeasy | HIGH |
| TypeScript | ^5.7 | Type safety | Matches MRPeasy, strict mode | HIGH |
| Express | ^4.21 | HTTP server | MCP-over-HTTP transport, matches MRPeasy | HIGH |
| @modelcontextprotocol/sdk | ^1.15.0 | MCP protocol | StreamableHTTPServerTransport, matches MRPeasy | HIGH |
| Zod | ^3.25.0 | Schema validation | MCP tool param validation, matches MRPeasy | HIGH |

**Version note on MCP SDK:** The latest is 1.25.3 (released Jan 20, 2026). Using `^1.15.0` (same as MRPeasy) ensures compatibility. The SDK has evolved significantly since 1.15 (Zod v4 compat, spec compliance fixes) but semver range covers it. Consider bumping both servers to `^1.25.0` if starting fresh, but matching MRPeasy is safer for consistency.

### GraphQL Client Layer (Custom)

| Component | Purpose | Pattern Source |
|-----------|---------|----------------|
| `PerdooClient` class | Typed GraphQL client with resilience | Mirrors `MrpEasyClient` |
| Query templates | String constants for each operation | New pattern (GraphQL-specific) |
| Response types | TypeScript interfaces for each query | Mirrors MRPeasy `types.ts` |
| GraphQL error handling | Parse `errors` array from 200 responses | New pattern (GraphQL-specific) |

### Dev Dependencies

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| tsx | ^4.19 | Dev server with hot reload | HIGH |
| @types/express | ^5.0 | Express type definitions | HIGH |
| @types/node | ^22.10 | Node.js type definitions | HIGH |

### Optional: GraphQL Codegen (for Type Generation)

**Recommendation: Do NOT use graphql-codegen initially. Add it later ONLY if the schema is large and changes frequently.**

**Confidence: MEDIUM** (depends on Perdoo schema size/stability)

**Rationale for deferring:**

1. **Schema access uncertainty** - Perdoo's full schema docs are at api-docs.perdoo.com (Apollo GraphOS Studio) but require authentication. Introspection may be disabled in production. We need to verify introspection access before committing to codegen.

2. **Adds 5+ dev dependencies** - `@graphql-codegen/cli@6.1.1`, `@graphql-codegen/typescript@5.0.7`, `@graphql-codegen/typescript-operations@5.0.0`, `graphql@16.x`, plus any loaders. This is a lot of tooling for what is likely 10-15 query/mutation types.

3. **Perdoo's entity model is small and stable** - We are wrapping 5 entity types (Objectives, Key Results, KPIs, Initiatives, Strategic Pillars) with CRUD-minus-D operations. Hand-typing 10-15 interfaces is manageable and gives full control.

4. **Codegen requires a build step** - Adding `graphql-codegen` means another script to run, another CI step, and more failure modes. For a small API surface, the maintenance cost exceeds the typing benefit.

5. **Bearer token auth for introspection** - Codegen can introspect with Bearer auth (via headers config), but this means the codegen config needs access to a valid Perdoo token. This complicates CI/CD.

**When to reconsider:**
- If Perdoo's schema has >30 types we need to interact with
- If Perdoo releases schema-breaking changes frequently
- If the team wants a "source of truth" schema file checked into the repo

**If added later, the config would be:**

```typescript
// codegen.ts
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: [{
    'https://eu.perdoo.com/graphql/': {
      headers: {
        Authorization: `Bearer ${process.env.PERDOO_API_TOKEN}`,
      },
    },
  }],
  generates: {
    'src/services/perdoo/generated-types.ts': {
      plugins: ['typescript'],
      config: {
        enumsAsTypes: true,
        scalars: { DateTime: 'string', ID: 'string' },
      },
    },
  },
};
export default config;
```

## What NOT to Use

| Technology | Why Not |
|------------|---------|
| Apollo Client | Massive bundle (~50KB min), designed for frontend caching, complete overkill for server-to-server |
| urql | Frontend-focused, exchange-based architecture adds complexity for no benefit server-side |
| Relay | Facebook's framework, requires specific compiler toolchain, extremely heavyweight |
| graphql-request / Graffle | Adds `graphql` peer dep (~474KB), library is transitioning to Graffle (pre-release), overkill for POST+JSON |
| graphql (npm package) | Full runtime (parser, validator, printer), we only need to send strings, not parse them |
| @graphql-codegen/* (initially) | Adds 5+ deps, requires introspection access, API surface is small enough to hand-type |
| graphql-tag | Template literal parser, only useful with libraries that expect DocumentNode, we use strings |

## Architecture: The GraphQL Client Wrapper

The client follows the exact same resilience pattern as MRPeasy:

```
queue -> circuit breaker -> retry -> rate limiter -> fetch (POST to /graphql/)
```

The key difference from MRPeasy's REST client:

| Aspect | MRPeasy (REST) | Perdoo (GraphQL) |
|--------|---------------|-----------------|
| HTTP Method | GET with query params | POST with JSON body |
| Endpoint | Multiple paths (`/items`, `/orders`) | Single path (`/graphql/`) |
| Error location | HTTP status codes | `response.body.errors[]` + HTTP status |
| Auth | Basic Auth header | Bearer token header |
| Pagination | Range headers | GraphQL cursor/offset in query variables |
| Request body | None (GET) | `{ query, variables, operationName }` |

### GraphQL-Specific Error Handling

GraphQL APIs can return errors in two ways:
1. **HTTP-level errors** (401, 403, 500) - handled same as MRPeasy
2. **GraphQL-level errors** (200 OK with `errors` array) - NEW pattern needed

```typescript
interface GraphQLResponse<T> {
  data: T | null;
  errors?: GraphQLError[];
}

interface GraphQLError {
  message: string;
  locations?: { line: number; column: number }[];
  path?: (string | number)[];
  extensions?: Record<string, unknown>;
}
```

The circuit breaker should treat GraphQL-level errors as failures (to detect sustained API issues), but retry logic should distinguish between retryable errors (rate limits, timeouts) and non-retryable errors (validation errors, auth errors).

## Installation

```bash
# Core dependencies (matches MRPeasy exactly)
npm install @modelcontextprotocol/sdk@^1.15.0 express@^4.21.0 zod@^3.25.0

# Dev dependencies (matches MRPeasy exactly)
npm install -D @types/express@^5.0.0 @types/node@^22.10.7 tsx@^4.19.2 typescript@^5.7.3
```

**Zero additional dependencies beyond what MRPeasy uses.** The GraphQL client is built on native `fetch`.

## Perdoo API Specifics

| Detail | Value | Confidence |
|--------|-------|------------|
| Endpoint | `https://eu.perdoo.com/graphql/` | HIGH (from PROJECT.md) |
| Auth | Bearer token via `Authorization` header | HIGH (from Perdoo docs) |
| Protocol | GraphQL (queries + mutations) | HIGH |
| Rate limits | Unknown (not documented publicly) | LOW |
| Introspection | Likely available (Apollo GraphOS Studio suggests it) | MEDIUM |
| Schema docs | api-docs.perdoo.com (Apollo GraphOS Studio, requires auth) | MEDIUM |

**Rate limit uncertainty:** Since Perdoo does not publicly document rate limits, the resilience stack should start conservative (same as MRPeasy: 100 req/10s bucket, with circuit breaker). Adjust after observing real API behavior. Watch for `429` responses or `Retry-After` headers.

## TypeScript Configuration

Use the exact same `tsconfig.json` as MRPeasy:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

This is fully compatible with ESM, native fetch, and any future addition of graphql-request if needed.

## Sources

- [graphql-request npm](https://www.npmjs.com/package/graphql-request) - v7.4.0 with graphql peer dep, 5.2M weekly downloads
- [Graffle (graphql-request successor)](https://github.com/graffle-js/graffle) - Pre-release, confirms library is in transition
- [@graphql-codegen/cli npm](https://www.npmjs.com/package/@graphql-codegen/cli) - v6.1.1, published Jan 2026
- [@graphql-codegen/typescript npm](https://www.npmjs.com/package/@graphql-codegen/typescript) - v5.0.7
- [GraphQL Codegen schema field config](https://the-guild.dev/graphql/codegen/docs/config-reference/schema-field) - Bearer token auth for introspection
- [GraphQL Codegen introspection auth discussion](https://github.com/dotansimha/graphql-code-generator/discussions/6272)
- [@modelcontextprotocol/sdk npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) - v1.25.3 (Jan 20, 2026)
- [MCP TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk)
- [Perdoo API Support Article](https://support.perdoo.com/en/articles/3629954-api) - High-level overview, GraphQL-based
- [Perdoo GraphOS Studio](https://api-docs.perdoo.com/) - Redirects to studio.apollographql.com/public/Perdoo-GQL
- MRPeasy MCP server source code (local: `mcp/mrpeasy/`) - Reference implementation for all patterns
