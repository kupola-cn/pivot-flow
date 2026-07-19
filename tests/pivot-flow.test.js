import test from 'node:test';
import assert from 'node:assert/strict';
import { ActionType, RiskLevel, createPivotRuntime } from '@kupola/pivot';
import {
  createFlow,
  createFlowFromTemplate,
  createHttpFlowStore,
  createLocalIntentMapper,
  createMemoryFlowStore,
  createFlowRunner,
  flowToPlan,
  listFlowTemplates,
  renderEditableNodeInspectorToHTML,
  renderFlowTemplateListToHTML,
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

test('HTTP store maps REST endpoints and normalizes flow responses', async () => {
  const calls = [];
  const store = createHttpFlowStore({
    baseUrl: '/flows',
    runsUrl: '/runs',
    headers: () => ({ 'X-CSRF-Token': 'token' }),
    fetcher: async (url, init = {}) => {
      calls.push({ url, init });

      if (url.startsWith('/flows?')) {
        return jsonResponse({ data: [createOrganizationFlow()] });
      }

      if (url === '/flows/org-create/publish') {
        return jsonResponse({ data: { ...createOrganizationFlow(), status: 'published' } });
      }

      if (url === '/flows/org-create' && init.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }

      if (url === '/runs?flowId=org-create') {
        return jsonResponse({ data: [{ flowId: 'org-create', ok: true }] });
      }

      return jsonResponse({ data: createOrganizationFlow() });
    }
  });

  const flows = await store.list({ status: 'published', keyword: '组织' });
  const published = await store.publish('org-create');
  const runs = await store.listRuns('org-create');
  await store.remove('org-create');

  assert.equal(flows[0].id, 'org-create');
  assert.equal(published.status, 'published');
  assert.equal(runs[0].ok, true);
  assert.equal(calls[0].init.credentials, 'same-origin');
  assert.equal(calls[0].init.headers['X-CSRF-Token'], 'token');
  assert.equal(decodeURIComponent(calls[0].url), '/flows?status=published&keyword=组织');
  assert.equal(calls.at(-1).init.method, 'DELETE');
});

test('creates draft flows from built-in templates', () => {
  const templates = listFlowTemplates({ group: 'organization' });
  const flow = createFlowFromTemplate('organization.create-under-parent', {
    name: 'Create branch from template'
  });
  const match = createLocalIntentMapper().match('在集团下增加分机构 C', [flow], { includeDraft: true });

  assert.equal(templates.length > 0, true);
  assert.equal(flow.name, 'Create branch from template');
  assert.equal(flow.status, 'draft');
  assert.equal(flow.metadata.templateId, 'organization.create-under-parent');
  assert.equal(validateFlow(flow).valid, true);
  assert.equal(match.best.slots.organizationName, 'C');
});

test('renders flow template list actions', () => {
  const html = renderFlowTemplateListToHTML(listFlowTemplates({ group: 'material' }));

  assert.match(html, /data-flow-action="create-from-template"/);
  assert.match(html, /material\.delete-with-confirm/);
});

test('renders editable node inspector controls', () => {
  const html = renderEditableNodeInspectorToHTML({
    id: 'create-user',
    type: 'capability.run',
    label: 'Create user',
    capability: 'user.create',
    risk: 'medium',
    requiresConfirmation: true,
    params: { realName: '{{intent.realName}}' }
  });

  assert.match(html, /data-flow-node-field="label"/);
  assert.match(html, /data-flow-node-field="capability"/);
  assert.match(html, /data-flow-node-field="params"/);
  assert.match(html, /data-flow-action="move-node-up"/);
  assert.match(html, /data-flow-action="remove-node"/);
  assert.match(html, /user\.create/);
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

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
}

test('runs a flow with FlowRunner', async () => {
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
    execute: ({ params }) => ({ id: 'org-002', ...params })
  });

  const flowStore = createMemoryFlowStore([createOrganizationFlow()]);
  const runner = createFlowRunner({ runtime, flowStore });
  const preview = await runner.preview('在集团下增加分机构 C');

  assert.equal(preview.ok, true);
  assert.equal(preview.plan.nodes[0].capability, 'org.create');

  const execution = await runner.execute('在集团下增加分机构 C');
  assert.equal(execution.ok, true);
  assert.equal(execution.result.data.nodes[0].result.data.name, 'C');

  const runs = await flowStore.listRuns('org-create');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].ok, true);
});

test('FlowRunner blocks preview when required slots are missing', async () => {
  const runtime = createPivotRuntime();
  const flow = createFlow({
    id: 'missing-slot-flow',
    name: 'Missing slot flow',
    status: 'published',
    intent: {
      examples: ['创建'],
      keywords: ['创建'],
      slots: [
        { name: 'name', type: 'string', required: true }
      ]
    },
    nodes: [
      {
        id: 'noop',
        type: 'message.show',
        params: { message: '{{intent.name}}' }
      }
    ]
  });
  registerFlowFrontendCapabilities(runtime);

  const runner = createFlowRunner({
    runtime,
    flowStore: createMemoryFlowStore([flow])
  });
  const preview = await runner.preview('创建');

  assert.equal(preview.ok, false);
  assert.equal(preview.stage, 'slots');
  assert.equal(preview.missingSlots[0].name, 'name');

  const filledPreview = await runner.preview('创建', {
    match: preview.match,
    slots: { name: '张三' }
  });

  assert.equal(filledPreview.ok, true);
  assert.equal(filledPreview.plan.nodes[0].params.message, '张三');
});
