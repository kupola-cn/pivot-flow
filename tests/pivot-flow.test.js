import test from 'node:test';
import assert from 'node:assert/strict';
import { ActionType, RiskLevel, createPivotRuntime } from '@kupola/pivot';
import {
  createFlow,
  createLocalIntentMapper,
  createMemoryFlowStore,
  flowToPlan,
  registerFlowFrontendCapabilities,
  validateFlow
} from '../src/index.js';

function createOrganizationFlow() {
  return createFlow({
    id: 'org-create',
    name: 'Create branch organization',
    description: 'Create a branch under the group organization.',
    status: 'published',
    intent: {
      examples: ['在集团下增加分机构 C'],
      keywords: ['集团', '增加', '分机构'],
      slots: [
        { name: 'organizationName', type: 'string', required: true, pattern: '分机构\\s*(?<organizationName>\\S+)' },
        { name: 'parentId', type: 'string', fallback: 'group-root' }
      ]
    },
    nodes: [
      {
        id: 'create-org',
        type: 'capability.run',
        label: 'Create organization',
        capability: 'org.create',
        risk: 'medium',
        params: {
          name: '{{intent.organizationName}}',
          parentId: '{{intent.parentId}}'
        }
      }
    ]
  });
}

test('validates a published flow', () => {
  const flow = createOrganizationFlow();
  const validation = validateFlow(flow);

  assert.equal(validation.valid, true);
});

test('matches natural language intent to a published flow', () => {
  const flow = createOrganizationFlow();
  const mapper = createLocalIntentMapper();
  const match = mapper.match('在集团下增加分机构 C', [flow]);

  assert.equal(match.ok, true);
  assert.equal(match.best.flow.id, 'org-create');
  assert.equal(match.best.slots.organizationName, 'C');
  assert.equal(match.best.slots.parentId, 'group-root');
});

test('converts flow to PIVOT plan and executes it', async () => {
  const flow = createOrganizationFlow();
  const mapper = createLocalIntentMapper();
  const match = mapper.match('在集团下增加分机构 C', [flow]).best;
  const plan = flowToPlan(flow, {
    prompt: match.prompt,
    slots: match.slots
  });

  assert.equal(plan.nodes.length, 1);
  assert.equal(plan.nodes[0].capability, 'org.create');
  assert.deepEqual(plan.nodes[0].params, {
    name: 'C',
    parentId: 'group-root'
  });

  const runtime = createPivotRuntime();
  runtime.registerCapability({
    name: 'org.create',
    resource: 'organization',
    action: ActionType.CREATE,
    risk: RiskLevel.MEDIUM,
    paramsSchema: {
      name: { type: 'string', required: true },
      parentId: { type: 'string', required: true }
    },
    permissions: [],
    execute: ({ params }) => ({
      id: 'org-001',
      ...params
    })
  });

  const preview = await runtime.previewPlan(plan);
  assert.equal(preview.ok, true);

  const result = await runtime.executePlan(plan);
  assert.equal(result.ok, true);
  assert.equal(result.data.nodes[0].result.data.name, 'C');
});

test('memory store publishes and filters flows', async () => {
  const flow = createFlow({
    ...createOrganizationFlow(),
    status: 'draft'
  });
  const store = createMemoryFlowStore([flow]);

  await store.publish(flow.id);
  const published = await store.list({ status: 'published' });

  assert.equal(published.length, 1);
  assert.equal(published[0].id, flow.id);
});

test('registers built-in frontend capabilities', async () => {
  const runtime = createPivotRuntime();
  const calls = [];
  registerFlowFrontendCapabilities(runtime, {
    showMessage: (params) => calls.push(['message', params.message]),
    refreshTable: (params) => calls.push(['table', params.target])
  });

  const flow = createFlow({
    id: 'frontend-flow',
    name: 'Frontend feedback flow',
    status: 'published',
    nodes: [
      {
        id: 'refresh',
        type: 'table.refresh',
        label: 'Refresh table',
        params: { target: 'organizations' }
      },
      {
        id: 'message',
        type: 'message.show',
        label: 'Show message',
        params: { message: 'done' }
      }
    ],
    edges: [
      { from: 'refresh', to: 'message', condition: 'success' }
    ]
  });

  const plan = flowToPlan(flow);
  assert.equal(plan.nodes[0].capability, 'table.refresh');
  assert.equal(plan.nodes[1].capability, 'message.show');

  const preview = await runtime.previewPlan(plan);
  assert.equal(preview.ok, true);

  const result = await runtime.executePlan(plan);
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    ['table', 'organizations'],
    ['message', 'done']
  ]);
});
