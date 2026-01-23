/**
 * Perdoo API Schema Introspection Script
 *
 * Standalone script that runs a GraphQL introspection query against
 * the Perdoo API and outputs:
 * - Full schema JSON to stdout (for piping to file)
 * - Summary of queries, mutations, and objective-related types to stderr
 *
 * Usage:
 *   PERDOO_API_TOKEN=<token> npx tsx src/scripts/introspect.ts
 *   PERDOO_API_TOKEN=<token> npm run introspect
 */

import { PerdooClient } from '../services/perdoo/client.js';
import type { IntrospectionData, IntrospectionTypeRef } from '../services/perdoo/types.js';

/**
 * Resolves a nested introspection type reference to a readable string.
 */
function resolveTypeRef(typeRef: IntrospectionTypeRef): string {
  if (typeRef.kind === 'NON_NULL') {
    return `${resolveTypeRef(typeRef.ofType!)}!`;
  }
  if (typeRef.kind === 'LIST') {
    return `[${resolveTypeRef(typeRef.ofType!)}]`;
  }
  return typeRef.name ?? 'Unknown';
}

/**
 * Main introspection routine.
 */
async function main(): Promise<void> {
  // Check for API token
  const token = process.env.PERDOO_API_TOKEN;
  if (!token) {
    process.stderr.write('ERROR: PERDOO_API_TOKEN environment variable is not set.\n');
    process.stderr.write('Usage: PERDOO_API_TOKEN=<your-token> npx tsx src/scripts/introspect.ts\n');
    process.exit(1);
  }

  process.stderr.write('Connecting to Perdoo API...\n');

  // Create client with circuit breaker disabled for introspection
  const client = new PerdooClient({
    token,
    circuitBreakerEnabled: false,
    maxRetries: 1,
  });

  let data: IntrospectionData;

  try {
    data = await client.introspect();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`ERROR: Introspection failed: ${message}\n`);
    process.exit(1);
  }

  // Output full schema JSON to stdout
  process.stdout.write(JSON.stringify(data, null, 2));
  process.stdout.write('\n');

  // Parse and summarize to stderr
  const schema = data.__schema;
  const types = schema.types;

  process.stderr.write('\n=== SCHEMA SUMMARY ===\n\n');

  // Find query type fields
  const queryTypeName = schema.queryType?.name ?? 'Query';
  const queryType = types.find((t) => t.name === queryTypeName);
  if (queryType?.fields) {
    process.stderr.write(`--- QUERIES (${queryType.fields.length} total) ---\n`);
    for (const field of queryType.fields) {
      const args = field.args
        .map((a) => `${a.name}: ${resolveTypeRef(a.type)}`)
        .join(', ');
      const returnType = resolveTypeRef(field.type);
      process.stderr.write(`  ${field.name}(${args}) -> ${returnType}\n`);
    }
    process.stderr.write('\n');
  }

  // Find mutation type fields
  const mutationTypeName = schema.mutationType?.name ?? 'Mutation';
  const mutationType = types.find((t) => t.name === mutationTypeName);
  if (mutationType?.fields) {
    process.stderr.write(`--- MUTATIONS (${mutationType.fields.length} total) ---\n`);
    for (const field of mutationType.fields) {
      const args = field.args
        .map((a) => `${a.name}: ${resolveTypeRef(a.type)}`)
        .join(', ');
      const returnType = resolveTypeRef(field.type);
      process.stderr.write(`  ${field.name}(${args}) -> ${returnType}\n`);
    }
    process.stderr.write('\n');
  }

  // Find types containing "Objective"
  const objectiveTypes = types.filter(
    (t) => t.name?.includes('Objective') && !t.name.startsWith('__')
  );
  if (objectiveTypes.length > 0) {
    process.stderr.write(`--- OBJECTIVE-RELATED TYPES (${objectiveTypes.length}) ---\n`);
    for (const t of objectiveTypes) {
      process.stderr.write(`\n  [${t.kind}] ${t.name}\n`);
      if (t.description) {
        process.stderr.write(`    Description: ${t.description}\n`);
      }
      if (t.fields) {
        process.stderr.write('    Fields:\n');
        for (const f of t.fields) {
          const fType = resolveTypeRef(f.type);
          const deprecated = f.isDeprecated ? ' [DEPRECATED]' : '';
          process.stderr.write(`      ${f.name}: ${fType}${deprecated}\n`);
        }
      }
      if (t.inputFields) {
        process.stderr.write('    Input Fields:\n');
        for (const f of t.inputFields) {
          const fType = resolveTypeRef(f.type);
          process.stderr.write(`      ${f.name}: ${fType}\n`);
        }
      }
      if (t.enumValues) {
        process.stderr.write('    Enum Values:\n');
        for (const v of t.enumValues) {
          const deprecated = v.isDeprecated ? ' [DEPRECATED]' : '';
          process.stderr.write(`      ${v.name}${deprecated}\n`);
        }
      }
    }
    process.stderr.write('\n');
  }

  // Find enum types related to objectives
  const objectiveEnums = types.filter(
    (t) =>
      t.kind === 'ENUM' &&
      (t.name?.toLowerCase().includes('objective') ||
        t.name?.toLowerCase().includes('status') ||
        t.name?.toLowerCase().includes('progress')) &&
      !t.name.startsWith('__')
  );
  if (objectiveEnums.length > 0) {
    process.stderr.write(`--- RELATED ENUMS (${objectiveEnums.length}) ---\n`);
    for (const e of objectiveEnums) {
      process.stderr.write(`\n  [ENUM] ${e.name}\n`);
      if (e.enumValues) {
        for (const v of e.enumValues) {
          process.stderr.write(`    ${v.name}\n`);
        }
      }
    }
    process.stderr.write('\n');
  }

  process.stderr.write('=== INTROSPECTION COMPLETE ===\n');
}

main().catch((error) => {
  process.stderr.write(`Unhandled error: ${error}\n`);
  process.exit(1);
});
