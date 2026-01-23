/**
 * Perdoo Goal Schema Introspection Script
 *
 * Targeted introspection for the Goal type to discover:
 * - Goal type fields (used for strategic pillars)
 * - PerdooApiGoalTypeChoices enum (type filter value for strategic pillars)
 * - PerdooApiGoalStatusChoices enum (status filter values)
 * - GoalType enum (if exists)
 * - goals root query arguments
 * - Goal mutations (if any exist)
 *
 * Usage:
 *   PERDOO_API_TOKEN=<token> npx tsx src/scripts/introspect-goals.ts
 */

import { PerdooClient } from '../services/perdoo/client.js';

/**
 * Main introspection routine for Goal schema.
 */
async function main(): Promise<void> {
  const token = process.env.PERDOO_API_TOKEN;
  if (!token) {
    process.stderr.write('ERROR: PERDOO_API_TOKEN environment variable is not set.\n');
    process.stderr.write('Usage: PERDOO_API_TOKEN=<token> npx tsx src/scripts/introspect-goals.ts\n');
    process.exit(1);
  }

  process.stderr.write('Connecting to Perdoo API for Goal schema introspection...\n\n');

  const client = new PerdooClient({
    token,
    circuitBreakerEnabled: false,
    maxRetries: 1,
  });

  // 1. Goal type fields
  process.stderr.write('=== 1. Goal Type Fields ===\n');
  try {
    const goalType = await client.execute<{ __type: unknown }>(`{ __type(name: "Goal") { name kind fields { name type { name kind ofType { name kind ofType { name kind } } } } } }`);
    process.stderr.write(JSON.stringify(goalType, null, 2) + '\n\n');
  } catch (error) {
    process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n\n`);
  }

  // 2. PerdooApiGoalTypeChoices enum
  process.stderr.write('=== 2. PerdooApiGoalTypeChoices Enum ===\n');
  try {
    const goalTypeChoices = await client.execute<{ __type: unknown }>(`{ __type(name: "PerdooApiGoalTypeChoices") { name kind enumValues { name } } }`);
    process.stderr.write(JSON.stringify(goalTypeChoices, null, 2) + '\n\n');
  } catch (error) {
    process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n\n`);
  }

  // 3. PerdooApiGoalStatusChoices enum
  process.stderr.write('=== 3. PerdooApiGoalStatusChoices Enum ===\n');
  try {
    const goalStatusChoices = await client.execute<{ __type: unknown }>(`{ __type(name: "PerdooApiGoalStatusChoices") { name kind enumValues { name } } }`);
    process.stderr.write(JSON.stringify(goalStatusChoices, null, 2) + '\n\n');
  } catch (error) {
    process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n\n`);
  }

  // 4. GoalType enum
  process.stderr.write('=== 4. GoalType Enum ===\n');
  try {
    const goalTypeEnum = await client.execute<{ __type: unknown }>(`{ __type(name: "GoalType") { name kind enumValues { name } } }`);
    process.stderr.write(JSON.stringify(goalTypeEnum, null, 2) + '\n\n');
  } catch (error) {
    process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n\n`);
  }

  // 5. goals root query args (filtered to goal-related fields)
  process.stderr.write('=== 5. Goal-related Query Fields ===\n');
  try {
    const queryType = await client.execute<{ __type: { fields: Array<{ name: string; args: unknown[] }> } }>(`{ __type(name: "Query") { fields(includeDeprecated: true) { name args { name type { name kind ofType { name kind ofType { name kind } } } } } } }`);
    const goalFields = queryType.__type.fields.filter(
      (f: { name: string }) => f.name.toLowerCase().includes('goal') || f.name.toLowerCase().includes('pillar')
    );
    process.stderr.write(JSON.stringify(goalFields, null, 2) + '\n\n');
  } catch (error) {
    process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n\n`);
  }

  // 6. Check for goal mutations
  process.stderr.write('=== 6. Goal-related Mutations ===\n');
  try {
    const mutationType = await client.execute<{ __type: { fields: Array<{ name: string; args: Array<{ name: string; type: unknown }> }> } }>(`{ __type(name: "Mutation") { fields { name args { name type { name kind ofType { name kind } } } } } }`);
    const goalMutations = mutationType.__type.fields.filter(
      (f: { name: string }) => f.name.toLowerCase().includes('goal') || f.name.toLowerCase().includes('pillar')
    );
    process.stderr.write(JSON.stringify(goalMutations, null, 2) + '\n\n');

    // If we found a goal mutation, try to introspect its input type
    if (goalMutations.length > 0) {
      process.stderr.write('=== 7. Goal Mutation Input Types ===\n');
      const inputTypeNames = [
        'UpsertGoalMutationInput',
        'CreateGoalMutationInput',
        'UpdateGoalMutationInput',
        'UpsertStrategicPillarMutationInput',
      ];
      for (const typeName of inputTypeNames) {
        try {
          const inputType = await client.execute<{ __type: unknown }>(`{ __type(name: "${typeName}") { name kind inputFields { name type { name kind ofType { name kind ofType { name kind } } } } } }`);
          if (inputType.__type) {
            process.stderr.write(`Found: ${typeName}\n`);
            process.stderr.write(JSON.stringify(inputType, null, 2) + '\n\n');
          }
        } catch {
          // Type not found, continue
        }
      }
    } else {
      process.stderr.write('No goal mutations found. Strategic pillars are read-only.\n\n');
    }
  } catch (error) {
    process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n\n`);
  }

  process.stderr.write('=== GOAL INTROSPECTION COMPLETE ===\n');
}

main().catch((error) => {
  process.stderr.write(`Unhandled error: ${error}\n`);
  process.exit(1);
});
