/**
 * End-to-end test script for all Perdoo MCP client operations.
 *
 * Usage: PERDOO_API_TOKEN=<token> npx tsx src/scripts/test-e2e.ts
 */

import { PerdooClient } from '../services/perdoo/client.js';

const token = process.env.PERDOO_API_TOKEN;
if (!token) {
  console.error('ERROR: PERDOO_API_TOKEN not set');
  process.exit(1);
}

const client = new PerdooClient({
  token,
  circuitBreakerEnabled: false,
  maxRetries: 1,
});

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  process.stdout.write(`[TEST] ${name}... `);
  try {
    await fn();
    console.log('OK');
    passed++;
  } catch (e) {
    console.log('FAIL:', (e as Error).message);
    failed++;
  }
}

async function main() {
  console.log('=== Perdoo MCP E2E Tests ===\n');

  // --- List Operations ---

  let objectiveId = '';
  let keyResultId = '';
  let initiativeId = '';
  let kpiId = '';
  let pillarId = '';

  await test('list_objectives', async () => {
    const data = await client.listObjectives({ first: 3 });
    const count = data.objectives.edges.length;
    if (count === 0) throw new Error('No objectives returned');
    objectiveId = data.objectives.edges[0].node.id;
    console.log(`(${count} results, first: "${data.objectives.edges[0].node.name}")`);
  });

  await test('list_key_results', async () => {
    const data = await client.listKeyResults({ first: 3 });
    const count = data.keyResults.edges.length;
    if (count === 0) throw new Error('No key results returned');
    keyResultId = data.keyResults.edges[0].node.id;
    console.log(`(${count} results, first: "${data.keyResults.edges[0].node.name}", type: ${data.keyResults.edges[0].node.type})`);
  });

  await test('list_initiatives', async () => {
    const data = await client.listInitiatives({ first: 3 });
    const count = data.initiatives.edges.length;
    if (count > 0) {
      initiativeId = data.initiatives.edges[0].node.id;
      const init = data.initiatives.edges[0].node;
      console.log(`(${count} results, first: "${init.name}", type: ${init.type}, objective: "${init.objective?.name || 'null'}")`);
    } else {
      console.log(`(0 results - no initiatives in account, query succeeded)`);
    }
  });

  await test('list_kpis', async () => {
    const data = await client.listKpis({ first: 3 });
    const count = data.allKpis.edges.length;
    if (count === 0) throw new Error('No KPIs returned');
    kpiId = data.allKpis.edges[0].node.id;
    console.log(`(${count} results, first: "${data.allKpis.edges[0].node.name}")`);
  });

  await test('list_strategic_pillars', async () => {
    const data = await client.listStrategicPillars({ first: 3 });
    const count = data.goals.edges.length;
    if (count === 0) throw new Error('No strategic pillars returned');
    pillarId = data.goals.edges[0].node.id;
    console.log(`(${count} results, first: "${data.goals.edges[0].node.name}")`);
  });

  // --- Get Operations ---

  await test('get_objective', async () => {
    if (!objectiveId) throw new Error('No objective ID from list');
    const data = await client.getObjective(objectiveId);
    if (!data.objective?.name) throw new Error('No objective returned');
    console.log(`("${data.objective.name}", stage: ${data.objective.stage})`);
  });

  await test('get_key_result', async () => {
    if (!keyResultId) throw new Error('No key result ID from list');
    const data = await client.getKeyResult(keyResultId);
    if (!data.result?.name) throw new Error('No key result returned');
    console.log(`("${data.result.name}", type: ${data.result.type})`);
  });

  await test('get_initiative', async () => {
    if (!initiativeId) {
      console.log(`(skipped - no initiatives in account)`);
      return;
    }
    const data = await client.getInitiative(initiativeId);
    if (!data.result?.name) throw new Error('No initiative returned');
    console.log(`("${data.result.name}", type: ${data.result.type})`);
  });

  await test('get_kpi', async () => {
    if (!kpiId) throw new Error('No KPI ID from list');
    const data = await client.getKpi(kpiId);
    if (!data.kpi?.name) throw new Error('No KPI returned');
    console.log(`("${data.kpi.name}", unit: ${data.kpi.metricUnit})`);
  });

  await test('get_strategic_pillar', async () => {
    if (!pillarId) throw new Error('No pillar ID from list');
    const data = await client.getStrategicPillar(pillarId);
    if (!data.goal?.name) throw new Error('No strategic pillar returned');
    console.log(`("${data.goal.name}", status: ${data.goal.status})`);
  });

  // --- Filter Operations ---

  await test('list_initiatives with objective filter', async () => {
    if (!objectiveId) throw new Error('No objective ID');
    const data = await client.listInitiatives({ first: 5, objective: objectiveId });
    console.log(`(${data.initiatives.edges.length} initiatives under objective)`);
  });

  await test('list_key_results type=KEY_RESULT filter', async () => {
    const data = await client.listKeyResults({ first: 3, type: 'KEY_RESULT' });
    console.log(`(${data.keyResults.edges.length} key results with type=KEY_RESULT)`);
    for (const edge of data.keyResults.edges) {
      if (edge.node.type !== 'KEY_RESULT') {
        throw new Error(`Expected KEY_RESULT but got ${edge.node.type}`);
      }
    }
  });

  await test('list_initiatives verifies all type=INITIATIVE', async () => {
    const data = await client.listInitiatives({ first: 5 });
    for (const edge of data.initiatives.edges) {
      if (edge.node.type !== 'INITIATIVE') {
        throw new Error(`Expected INITIATIVE but got ${edge.node.type}`);
      }
    }
    console.log(`(all ${data.initiatives.edges.length} have type=INITIATIVE)`);
  });

  // --- Mutation Operations ---

  let createdPillarId = '';

  await test('create_strategic_pillar', async () => {
    const data = await client.createStrategicPillar({ name: 'E2E Test Pillar' });
    if (data.upsertGoal.errors && data.upsertGoal.errors.length > 0) {
      throw new Error(`Validation errors: ${JSON.stringify(data.upsertGoal.errors)}`);
    }
    if (!data.upsertGoal.goal) throw new Error('No goal returned from create');
    createdPillarId = data.upsertGoal.goal.id;
    console.log(`(created: "${data.upsertGoal.goal.name}", id: ${createdPillarId})`);
  });

  await test('update_strategic_pillar', async () => {
    if (!createdPillarId) throw new Error('No pillar ID from create');
    const data = await client.updateStrategicPillar(createdPillarId, {
      name: 'E2E Test Pillar (Updated)',
      description: 'Created by E2E test script',
    });
    if (data.upsertGoal.errors && data.upsertGoal.errors.length > 0) {
      throw new Error(`Validation errors: ${JSON.stringify(data.upsertGoal.errors)}`);
    }
    if (!data.upsertGoal.goal) throw new Error('No goal returned from update');
    console.log(`(updated: "${data.upsertGoal.goal.name}")`);
  });

  await test('archive_strategic_pillar (cleanup)', async () => {
    if (!createdPillarId) throw new Error('No pillar ID from create');
    const data = await client.updateStrategicPillar(createdPillarId, { archived: true });
    if (data.upsertGoal.errors && data.upsertGoal.errors.length > 0) {
      throw new Error(`Validation errors: ${JSON.stringify(data.upsertGoal.errors)}`);
    }
    console.log(`(archived pillar ${createdPillarId})`);
  });

  // --- Summary ---
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
