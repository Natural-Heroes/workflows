# Phase 2: Authentication - Credential Store Research

**Researched:** 2026-01-24
**Domain:** OAuth 2.1 authentication with encrypted credential storage
**Confidence:** HIGH

## Summary

Research into encrypted credential storage for mapping OAuth tokens to Odoo API keys reveals two viable approaches: (1) encrypted SQLite database using better-sqlite3, or (2) encrypted JWT claims. After analysis, **the database approach is strongly recommended** for production use.

The standard pattern uses better-sqlite3 for synchronous, performant SQLite operations with AES-256-GCM encryption at the application layer for API key storage. The authorization flow validates Odoo API keys via Odoo's JSON-2 API, stores the encrypted mapping, and issues OAuth 2.1 compliant access tokens.

**Primary recommendation:** Use better-sqlite3 with application-layer AES-256-GCM encryption, stored on a Docker volume for persistence. Implement OAuth 2.1 Authorization Code Flow with PKCE for token issuance.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | 11.x | SQLite database | Fastest synchronous SQLite library for Node.js, production-ready |
| @types/better-sqlite3 | 12.4.1+ | TypeScript types | Official type definitions from DefinitelyTyped |
| Node.js crypto (built-in) | - | AES-256-GCM encryption | Standard library, no dependencies, FIPS-compliant |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dotenv | 16.4.0+ | Environment variables | Already in project, used for encryption key |
| better-sqlite3-multiple-ciphers | Latest | Database-level encryption | Alternative if full-disk encryption needed (overkill for this use case) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| better-sqlite3 | Prisma ORM | Prisma adds complexity, migrations, schema files - overkill for single table |
| Application-layer encryption | SQLCipher | SQLCipher encrypts entire DB but harder to set up, platform-specific builds |
| Database storage | JWT encrypted claims (JWE) | JWT cannot be revoked until expiry; larger token size; rotation complexity |

**Installation:**
```bash
npm install better-sqlite3
npm install --save-dev @types/better-sqlite3
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/
│   ├── credential-store.ts    # Main credential store class
│   └── schema.sql             # Table creation SQL
├── auth/
│   ├── oauth-flow.ts          # Authorization code flow
│   ├── token-issuer.ts        # JWT token generation
│   └── encryption.ts          # AES-256-GCM utilities
└── config/
    └── database.ts            # Database initialization
```

### Pattern 1: Application-Layer Encryption
**What:** Encrypt API keys before storing in SQLite using AES-256-GCM, store IV and auth tag with ciphertext
**When to use:** Default pattern for credential storage at rest
**Example:**
```typescript
// Source: Node.js crypto documentation + GitHub examples
import crypto from 'crypto';

interface EncryptedData {
  ciphertext: string;  // base64
  iv: string;          // base64, 12 bytes (96 bits)
  authTag: string;     // base64, 16 bytes
}

class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor(masterKey: string) {
    // Derive 256-bit key from environment variable using PBKDF2
    const salt = Buffer.from('odoo-mcp-salt-v1'); // Fixed salt OK for single-user derivation
    this.key = crypto.pbkdf2Sync(masterKey, salt, 100000, 32, 'sha256');
  }

  encrypt(plaintext: string): EncryptedData {
    // Generate random 96-bit IV (MUST be unique per encryption)
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    return {
      ciphertext,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64')
    };
  }

  decrypt(data: EncryptedData): string {
    const iv = Buffer.from(data.iv, 'base64');
    const authTag = Buffer.from(data.authTag, 'base64');

    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(data.ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  }
}
```

### Pattern 2: Credential Store with better-sqlite3
**What:** Synchronous SQLite operations with prepared statements for CRUD operations
**When to use:** Default pattern for credential persistence
**Example:**
```typescript
// Source: better-sqlite3 API documentation
import Database from 'better-sqlite3';

interface UserCredential {
  user_id: string;
  encrypted_api_key: string;
  iv: string;
  auth_tag: string;
  created_at: number;
  updated_at: number;
}

class CredentialStore {
  private db: Database.Database;
  private encryption: EncryptionService;

  constructor(dbPath: string, masterKey: string) {
    this.db = new Database(dbPath);
    this.encryption = new EncryptionService(masterKey);
    this.initializeSchema();
  }

  private initializeSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_credentials (
        user_id TEXT PRIMARY KEY,
        encrypted_api_key TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_updated_at ON user_credentials(updated_at);
    `);
  }

  addUser(userId: string, apiKey: string): void {
    const encrypted = this.encryption.encrypt(apiKey);
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO user_credentials (user_id, encrypted_api_key, iv, auth_tag, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        encrypted_api_key = excluded.encrypted_api_key,
        iv = excluded.iv,
        auth_tag = excluded.auth_tag,
        updated_at = excluded.updated_at
    `);

    stmt.run(userId, encrypted.ciphertext, encrypted.iv, encrypted.authTag, now, now);
  }

  getApiKey(userId: string): string | null {
    const stmt = this.db.prepare(`
      SELECT encrypted_api_key, iv, auth_tag
      FROM user_credentials
      WHERE user_id = ?
    `);

    const row = stmt.get(userId) as { encrypted_api_key: string; iv: string; auth_tag: string } | undefined;

    if (!row) return null;

    return this.encryption.decrypt({
      ciphertext: row.encrypted_api_key,
      iv: row.iv,
      authTag: row.auth_tag
    });
  }

  deleteUser(userId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM user_credentials WHERE user_id = ?');
    const result = stmt.run(userId);
    return result.changes > 0;
  }

  close() {
    this.db.close();
  }
}
```

### Pattern 3: OAuth 2.1 Authorization Code Flow with PKCE
**What:** Standard OAuth flow with Odoo API key validation
**When to use:** Default authentication flow
**Example:**
```typescript
// Source: OAuth 2.1 spec + Auth0 documentation
import { randomBytes } from 'crypto';
import { Request, Response } from 'express';

interface AuthorizationRequest {
  code_challenge: string;
  code_challenge_method: 'S256';
  state: string;
  redirect_uri: string;
}

class OAuthFlow {
  private pendingAuthorizations = new Map<string, AuthorizationRequest>();

  // Step 1: User initiates authorization
  initiateAuthorization(req: Request, res: Response) {
    const state = randomBytes(16).toString('base64url');
    const code_challenge = req.query.code_challenge as string;
    const redirect_uri = req.query.redirect_uri as string;

    if (!code_challenge || !redirect_uri) {
      return res.status(400).json({ error: 'invalid_request' });
    }

    this.pendingAuthorizations.set(state, {
      code_challenge,
      code_challenge_method: 'S256',
      state,
      redirect_uri
    });

    // Show form for user to enter Odoo credentials (email + API key)
    res.render('authorize', { state });
  }

  // Step 2: Validate Odoo API key and issue authorization code
  async validateAndAuthorize(req: Request, res: Response) {
    const { state, email, api_key } = req.body;
    const authReq = this.pendingAuthorizations.get(state);

    if (!authReq) {
      return res.status(400).json({ error: 'invalid_state' });
    }

    // Validate API key by calling Odoo
    const userId = await this.validateOdooApiKey(email, api_key);
    if (!userId) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    // Store encrypted API key
    credentialStore.addUser(userId, api_key);

    // Issue authorization code
    const authCode = randomBytes(32).toString('base64url');
    // Store authCode -> userId + code_challenge mapping (short-lived, 5 min)

    res.redirect(`${authReq.redirect_uri}?code=${authCode}&state=${state}`);
  }

  // Step 3: Exchange authorization code for access token
  exchangeCodeForToken(req: Request, res: Response) {
    const { code, code_verifier } = req.body;

    // Verify code_verifier matches code_challenge
    // Issue JWT access token with user_id as subject
    // Return { access_token, token_type: 'Bearer', expires_in: 3600 }
  }

  private async validateOdooApiKey(email: string, apiKey: string): Promise<string | null> {
    // Call Odoo JSON-2 API: POST /json/2/res.users/search_read
    // Headers: Authorization: Bearer {apiKey}
    // Body: { filter: [['login', '=', email]], fields: ['id', 'login'] }
    // If successful and email matches, return user.id
    // Otherwise return null
    return 'odoo_user_123'; // placeholder
  }
}
```

### Anti-Patterns to Avoid
- **Storing API keys in JWT claims (even encrypted):** Cannot revoke, large token size, rotation complexity
- **Using fixed IV:** IV MUST be unique per encryption operation; reuse breaks GCM security
- **Hardcoding encryption key:** Use environment variable, rotate periodically
- **Using database-level encryption (SQLCipher) for single-table use case:** Application-layer encryption is simpler and sufficient
- **Skipping PKCE:** OAuth 2.1 mandates PKCE for all clients

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQLite operations | Raw SQL string concatenation | better-sqlite3 prepared statements | SQL injection prevention, performance, type safety |
| Encryption | Custom crypto implementation | Node.js crypto module with AES-256-GCM | Battle-tested, FIPS-compliant, audited |
| OAuth token generation | Custom token format | Standard JWT libraries (jose, jsonwebtoken) | RFC compliance, ecosystem compatibility |
| Key derivation | Simple hashing | crypto.pbkdf2Sync with 100k+ iterations | Protection against brute-force attacks |
| Random IV generation | Math.random() or timestamps | crypto.randomBytes() | Cryptographically secure randomness |

**Key insight:** Modern Node.js crypto module provides production-ready encryption primitives. Don't implement custom crypto; use standard library correctly.

## Common Pitfalls

### Pitfall 1: IV Reuse with AES-GCM
**What goes wrong:** Using the same IV for multiple encryptions with the same key completely breaks GCM security, allowing plaintext recovery
**Why it happens:** Developers store a single IV in config or generate it predictably
**How to avoid:** Generate fresh random IV for EVERY encryption using `crypto.randomBytes(12)`, store IV alongside ciphertext
**Warning signs:** Fixed IV in code, IV generated from timestamp or counter

### Pitfall 2: Not Validating Auth Tag
**What goes wrong:** Skipping auth tag validation allows ciphertext tampering, violating authenticated encryption
**Why it happens:** Developers unfamiliar with GCM's authentication property
**How to avoid:** Always call `decipher.setAuthTag(authTag)` before decryption, store auth tag with ciphertext
**Warning signs:** Decryption succeeds with modified ciphertext

### Pitfall 3: SQLite File Permissions in Docker
**What goes wrong:** SQLite database file created with wrong permissions, inaccessible after container restart
**Why it happens:** Docker volume mounted with root ownership
**How to avoid:** Set explicit USER in Dockerfile, ensure volume directory is writable by app user
**Warning signs:** "SQLITE_CANTOPEN" errors after container restart

### Pitfall 4: JWT Cannot Be Revoked
**What goes wrong:** Compromised API key stored in JWT cannot be invalidated until token expires
**Why it happens:** Choosing JWT for convenience without understanding revocation limitations
**How to avoid:** Use database-backed credential store, issue short-lived access tokens (15-60 min)
**Warning signs:** No way to immediately revoke access when API key is rotated

### Pitfall 5: PBKDF2 Iteration Count Too Low
**What goes wrong:** Low iteration count makes brute-force attacks feasible if master key leaks
**Why it happens:** Using default or outdated iteration counts (10k or less)
**How to avoid:** Use minimum 100,000 iterations (OWASP recommendation), consider 600,000 for 2026
**Warning signs:** Key derivation completes in <10ms

### Pitfall 6: Missing Database Indexes
**What goes wrong:** Lookups by user_id become slow as credential store grows
**Why it happens:** Forgetting to create index on primary lookup column
**How to avoid:** Add `PRIMARY KEY` on user_id, index on updated_at for cleanup queries
**Warning signs:** Slow API key lookups, increasing response times

## Code Examples

### Complete Credential Store Implementation
```typescript
// Source: better-sqlite3 API + Node.js crypto best practices
import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';

export class SecureCredentialStore {
  private db: Database.Database;
  private key: Buffer;
  private readonly algorithm = 'aes-256-gcm';

  constructor(options: { dbPath: string; masterKey: string }) {
    // Derive encryption key from master key
    const salt = Buffer.from('odoo-mcp-credential-salt-v1', 'utf8');
    this.key = crypto.pbkdf2Sync(options.masterKey, salt, 100000, 32, 'sha256');

    // Initialize SQLite database
    this.db = new Database(options.dbPath, {
      verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
    });

    this.db.pragma('journal_mode = WAL'); // Enable Write-Ahead Logging for better concurrency
    this.db.pragma('foreign_keys = ON');

    this.createSchema();
  }

  private createSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_credentials (
        user_id TEXT PRIMARY KEY,
        encrypted_api_key TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_updated_at ON user_credentials(updated_at);
    `);
  }

  private encrypt(plaintext: string): { ciphertext: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    return {
      ciphertext,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64')
    };
  }

  private decrypt(encrypted: { ciphertext: string; iv: string; authTag: string }): string {
    const iv = Buffer.from(encrypted.iv, 'base64');
    const authTag = Buffer.from(encrypted.authTag, 'base64');

    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(encrypted.ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  }

  public addOrUpdateUser(userId: string, apiKey: string): void {
    const encrypted = this.encrypt(apiKey);
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO user_credentials (user_id, encrypted_api_key, iv, auth_tag, created_at, updated_at)
      VALUES (@userId, @ciphertext, @iv, @authTag, @now, @now)
      ON CONFLICT(user_id) DO UPDATE SET
        encrypted_api_key = excluded.encrypted_api_key,
        iv = excluded.iv,
        auth_tag = excluded.auth_tag,
        updated_at = excluded.updated_at
    `);

    stmt.run({
      userId,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      now
    });
  }

  public getApiKey(userId: string): string | null {
    const stmt = this.db.prepare(`
      SELECT encrypted_api_key, iv, auth_tag
      FROM user_credentials
      WHERE user_id = @userId
    `);

    const row = stmt.get({ userId }) as
      { encrypted_api_key: string; iv: string; auth_tag: string } | undefined;

    if (!row) return null;

    try {
      return this.decrypt({
        ciphertext: row.encrypted_api_key,
        iv: row.iv,
        authTag: row.auth_tag
      });
    } catch (err) {
      console.error('Decryption failed for user', userId, err);
      return null;
    }
  }

  public deleteUser(userId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM user_credentials WHERE user_id = @userId');
    const result = stmt.run({ userId });
    return result.changes > 0;
  }

  public userExists(userId: string): boolean {
    const stmt = this.db.prepare('SELECT 1 FROM user_credentials WHERE user_id = @userId');
    return stmt.get({ userId }) !== undefined;
  }

  public close(): void {
    this.db.close();
  }
}

// Usage example
const store = new SecureCredentialStore({
  dbPath: process.env.DB_PATH || './data/credentials.db',
  masterKey: process.env.ENCRYPTION_KEY!
});

store.addOrUpdateUser('odoo_user_123', 'api_key_secret_value');
const apiKey = store.getApiKey('odoo_user_123');
console.log('Retrieved API key:', apiKey);
```

### Docker Volume Configuration
```dockerfile
# Source: Docker best practices + better-sqlite3 documentation
FROM node:20-alpine

# Create app user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY --chown=nodejs:nodejs . .

# Create data directory for SQLite database
RUN mkdir -p /app/data && chown nodejs:nodejs /app/data

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Volume for persistent SQLite database
VOLUME ["/app/data"]

CMD ["node", "dist/server.js"]
```

### Docker Compose Configuration
```yaml
# Source: Docker documentation
version: '3.8'

services:
  odoo-mcp:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DB_PATH=/app/data/credentials.db
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - ODOO_URL=${ODOO_URL}
    volumes:
      # Named volume for SQLite persistence
      - credentials-data:/app/data
    restart: unless-stopped

volumes:
  credentials-data:
    driver: local
```

### Environment Variables (.env.example)
```bash
# Encryption key for credential store (generate with: openssl rand -base64 32)
ENCRYPTION_KEY=your-256-bit-key-here

# Database path
DB_PATH=/app/data/credentials.db

# Odoo instance URL
ODOO_URL=https://your-instance.odoo.com
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OAuth 2.0 implicit flow | OAuth 2.1 with mandatory PKCE | 2023-2026 | All clients must use authorization code + PKCE |
| SQLCipher for app-level encryption | Application-layer AES-256-GCM | 2024+ | Simpler setup, no platform-specific builds |
| 10k PBKDF2 iterations | 100k-600k iterations | 2020+ | Stronger protection against brute-force |
| CBC mode encryption | GCM mode (authenticated encryption) | 2015+ | Built-in integrity verification |
| Storing tokens in localStorage | HttpOnly cookies + database-backed sessions | 2020+ | XSS protection |

**Deprecated/outdated:**
- **OAuth 2.0 Password Grant:** Removed in OAuth 2.1, use authorization code flow
- **Refresh token reuse:** OAuth 2.1 requires rotation or sender-constraining
- **AES-CBC without HMAC:** Use GCM for authenticated encryption
- **Fixed salts for password hashing:** Not applicable here (using PBKDF2 for key derivation, not password hashing)

## Open Questions

1. **Token Refresh Strategy**
   - What we know: OAuth 2.1 requires refresh token rotation or sender-constraining
   - What's unclear: Best pattern for MCP server context (machine-to-machine vs. user-facing)
   - Recommendation: Start with short-lived access tokens (15 min), no refresh tokens. Add refresh tokens if needed based on UX feedback.

2. **Credential Rotation**
   - What we know: Odoo API keys should be rotated periodically (90-day recommendation)
   - What's unclear: How to prompt users to rotate without disrupting service
   - Recommendation: Store `created_at` timestamp, warn users after 60 days, provide rotation endpoint

3. **Multi-instance Support**
   - What we know: Current design assumes single Odoo instance
   - What's unclear: If users need multiple Odoo instances, how to structure credentials
   - Recommendation: Current schema supports it (user_id can encode instance), defer until needed

## Comparison: Database vs JWT Approach

### Database Approach (RECOMMENDED)
**Pros:**
- Immediate revocation when API key rotated
- Centralized audit log of credential access
- Can enforce rotation policies
- API key never leaves server
- Smaller token size

**Cons:**
- Requires database lookup on every request
- Single point of failure (mitigated by SQLite reliability)
- Docker volume needed for persistence

### JWT Encrypted Claims Approach (NOT RECOMMENDED)
**Pros:**
- No database needed
- Stateless token validation
- Slightly faster (no DB lookup)

**Cons:**
- **CRITICAL: Cannot revoke until token expires** (dealbreaker for credential management)
- Larger token size (encrypted API key in payload)
- Complex key rotation (need to re-encrypt all tokens)
- API key exposed if JWT signing key leaks
- No audit trail

**Verdict:** Database approach is strongly preferred. The revocation limitation of JWT makes it unsuitable for credential management.

## Sources

### Primary (HIGH confidence)
- [better-sqlite3 API Documentation](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md) - Official API reference
- [Node.js Crypto Documentation](https://nodejs.org/api/crypto.html) - Official Node.js crypto module reference
- [Odoo 19.0 External API Documentation](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html) - Official Odoo JSON-2 API documentation
- [OAuth 2.1 Specification](https://oauth.net/2.1/) - Official OAuth 2.1 spec

### Secondary (MEDIUM confidence)
- [AES-256-GCM Example (GitHub Gist)](https://gist.github.com/rjz/15baffeab434b8125ca4d783f4116d81) - Verified Node.js crypto implementation pattern
- [Docker Volumes Documentation](https://docs.docker.com/get-started/05_persisting_data/) - Official Docker persistence guide
- [Auth0 PKCE Documentation](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce) - Industry-standard OAuth implementation guide
- [JWT Best Practices (Curity)](https://curity.io/resources/learn/jwt-best-practices/) - Security best practices for JWT
- [OAuth 2.1 Features (Medium - 2026)](https://rgutierrez2004.medium.com/oauth-2-1-features-you-cant-ignore-in-2026-a15f852cb723) - Current state of OAuth 2.1

### Tertiary (LOW confidence - for context only)
- [better-sqlite3 npm package](https://www.npmjs.com/package/better-sqlite3) - Package metadata
- [WebDevTutor TypeScript Guide](https://www.webdevtutor.net/blog/typescript-better-sqlite3) - Community tutorial
- [Medium: JWT Risks (2026)](https://medium.com/@instatunnel/beyond-the-secret-the-silent-risks-of-jwt-and-machine-identity-49bea4aa4547) - Recent security analysis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - better-sqlite3 and Node.js crypto are industry-standard, well-documented
- Architecture: HIGH - Patterns verified against official documentation and established best practices
- Pitfalls: MEDIUM-HIGH - Based on common developer mistakes documented across multiple sources
- OAuth flow: HIGH - OAuth 2.1 specification and Odoo API documentation are authoritative

**Research date:** 2026-01-24
**Valid until:** 2026-04-24 (90 days - crypto and security practices evolve slowly)

**Key findings requiring validation during implementation:**
- Odoo JSON-2 API key validation endpoint behavior (test with real Odoo instance)
- Exact Odoo user ID format returned from API (affects user_id schema)
- Docker volume permissions on target deployment platform (test on actual infrastructure)
