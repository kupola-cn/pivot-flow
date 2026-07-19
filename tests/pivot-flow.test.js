import test from 'node:test';
import assert from 'node:assert/strict';
import { ActionType, RiskLevel, createPivotRuntime } from '@kupola/pivot';
import {
  createFlow,
  createAIFlowBuilderContext,
  createAIFlowProvider,
  createAIFlowProviderMessages,
  createAIFlowProviderRequest,
  createAIFlowDraft,
  createCapabilityManifestSummary,
  createFlowFromTemplate,
  createHttpFlowStore,
  createLocalIntentMapper,
  createMemoryFlowStore,
  createFlowRunner,
  createFlowCanvasLayout,
  filterFlows,
  applyFlowTransform,
  evaluateFlowCondition,
  flowToPlan,
  listFlowTemplates,
  diffAIFlowDraft,
  getFlowCapabilityRows,
  getFlowExecutionTrace,
  getMissingFlowCapabilities,
  getFlowNodeAdjacency,
  getFlowNodeMatches,
  getFlowRisk,
  groupFlowTemplates,
  groupFlows,
  generateAIFlowDraft,
  parseAIFlowProviderOutput,
  renderEditableNodeInspectorToHTML,
  renderFlowCapabilityMatrixToHTML,
  renderFlowCanvasToHTML,
  renderFlowDesignerToHTML,
  renderFlowEdgeEditorToHTML,
  renderFlowSettingsToHTML,
  renderFlowTestPanelToHTML,
  renderFlowTemplateListToHTML,
  recommendFlowCapabilities,
  renderAIFlowDraftPreviewToHTML,
  renderAIFlowDraftReviewToHTML,
  parseFlowTestSlots,
  registerFlowFrontendCapabilities,
  validateAIFlowDraft,
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

test('normalizes sensitive manual slots for secure input rendering', () => {
  const flow = createFlow({
    id: 'user-create',
    name: 'Create user',
    intent: {
      slots: [
        { name: 'password', label: 'Initial password', required: true, source: 'manual', sensitive: true, inputType: 'password' }
      ]
    }
  });

  assert.equal(flow.intent.slots[0].sensitive, true);
  assert.equal(flow.intent.slots[0].inputType, 'password');
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

test('validates edge ids and conditions', () => {
  const flow = createFlow({
    id: 'invalid-edge-flow',
    name: 'Invalid edge flow',
    status: 'draft',
    nodes: [
      { id: 'a', type: 'message.show' },
      { id: 'b', type: 'message.show' }
    ],
    edges: [
      { id: 'edge-1', from: 'a', to: 'b', condition: 'success' },
      { id: 'edge-1', from: 'a', to: 'a', condition: 'maybe' }
    ]
  });
  const validation = validateFlow(flow);

  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /Duplicate flow edge id: edge-1/);
  assert.match(validation.errors.join('\n'), /Flow edge cannot reference the same node: a/);
  assert.match(validation.errors.join('\n'), /Unknown flow edge condition: maybe/);
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
  const templates = listFlowTemplates();
  const groups = groupFlowTemplates(templates);
  const html = renderFlowTemplateListToHTML(templates, { groupBy: 'group' });

  assert.match(html, /data-flow-action="create-from-template"/);
  assert.match(html, /material\.delete-with-confirm/);
  assert.equal(groups.some((group) => group.key === 'material'), true);
  assert.match(html, /flow-template-groups/);
});

test('filters flows by status and keyword', () => {
  const flows = [
    createOrganizationFlow(),
    createFlow({
      id: 'role-create',
      name: 'Create role',
      status: 'draft',
      risk: 'high',
      intent: {
        keywords: ['role', 'permission']
      }
    }),
    createFlow({
      id: 'disabled-material',
      name: 'Material update',
      status: 'disabled',
      description: 'Update catalog material',
      nodes: [
        { id: 'update', type: 'capability.run', risk: 'medium' }
      ]
    })
  ];

  assert.equal(filterFlows(flows, { status: 'published' }).length, 1);
  assert.equal(filterFlows(flows, { keyword: 'permission' })[0].id, 'role-create');
  assert.equal(filterFlows(flows, { keyword: 'catalog', status: 'disabled' })[0].id, 'disabled-material');
  assert.equal(filterFlows(flows, { risk: 'high' })[0].id, 'role-create');
  assert.equal(getFlowRisk(flows[2]), 'medium');
  assert.equal(groupFlows(flows, { groupBy: 'status' })[0].key, 'published');
  assert.equal(groupFlows(flows, { groupBy: 'risk' })[0].key, 'high');
});

test('renders flow capability dependency matrix', () => {
  const flow = createOrganizationFlow();
  const runtime = createPivotRuntime();
  runtime.registerCapability({
    name: 'org.create',
    resource: 'organization',
    action: ActionType.CREATE,
    risk: RiskLevel.MEDIUM,
    permissions: ['system:org:create'],
    requiresConfirmation: true,
    execute: () => ({ ok: true })
  });

  const rows = getFlowCapabilityRows(flow, runtime);
  const html = renderFlowCapabilityMatrixToHTML(flow, runtime);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].capability, 'org.create');
  assert.equal(rows[0].permissions[0], 'system:org:create');
  assert.match(html, /flow-capability-matrix/);
  assert.match(html, /system:org:create/);
});

test('lays out flow canvas by edge dependencies', () => {
  const flow = createFlow({
    id: 'create-user-with-role',
    name: 'Create user with role',
    status: 'published',
    nodes: [
      { id: 'resolve-org', type: 'capability.run', capability: 'org.query', label: 'Resolve org' },
      { id: 'resolve-role', type: 'capability.run', capability: 'role.resolve', label: 'Resolve role' },
      { id: 'create-user', type: 'capability.run', capability: 'user.create', label: 'Create user' },
      { id: 'assign-role', type: 'capability.run', capability: 'user.assignRoles', label: 'Assign role' }
    ],
    edges: [
      { from: 'resolve-org', to: 'create-user', condition: 'success' },
      { from: 'resolve-role', to: 'assign-role', condition: 'success' },
      { from: 'create-user', to: 'assign-role', condition: 'success' }
    ]
  });

  const layout = createFlowCanvasLayout(flow.nodes, flow.edges);
  const html = renderFlowCanvasToHTML(flow);

  assert.equal(layout.layerById.get('resolve-org'), 0);
  assert.equal(layout.layerById.get('resolve-role'), 0);
  assert.equal(layout.layerById.get('create-user'), 1);
  assert.equal(layout.layerById.get('assign-role'), 2);
  assert.match(html, /flow-canvas__board/);
  assert.match(html, /Layer 3/);
  assert.match(html, /flow-canvas__edge-rail/);
});

test('derives flow canvas execution trace from runtime node results', () => {
  const flow = createFlow({
    id: 'failed-path-flow',
    name: 'Failed path flow',
    status: 'published',
    nodes: [
      { id: 'first', type: 'capability.run', capability: 'first.run', label: 'First' },
      { id: 'second', type: 'capability.run', capability: 'second.run', label: 'Second' },
      { id: 'fallback', type: 'message.show', label: 'Fallback' }
    ],
    edges: [
      { id: 'edge-success', from: 'first', to: 'second', condition: 'success' },
      { id: 'edge-failure', from: 'second', to: 'fallback', condition: 'failure' }
    ]
  });
  const result = {
    ok: false,
    data: {
      nodes: [
        { node: { id: 'first' }, result: { ok: true, data: {} } },
        { node: { id: 'second' }, result: { ok: false, data: {} } },
        { node: { id: 'fallback' }, result: { ok: true, data: {} } }
      ]
    }
  };

  const trace = getFlowExecutionTrace(result, flow.nodes, flow.edges);
  const html = renderFlowCanvasToHTML(flow, { result });

  assert.equal(trace.firstFailedNodeId, 'second');
  assert.deepEqual(trace.executedNodeIds, ['first', 'fallback']);
  assert.deepEqual(trace.failedNodeIds, ['second']);
  assert.equal(trace.edgeStates.get('edge-success').active, true);
  assert.equal(trace.edgeStates.get('edge-failure').failed, true);
  assert.match(html, /flow-node--failed/);
  assert.match(html, /failed path/);
});

test('matches and highlights flow canvas nodes', () => {
  const flow = createFlow({
    id: 'canvas-search-flow',
    name: 'Canvas search flow',
    nodes: [
      { id: 'resolve-user', type: 'capability.run', capability: 'user.resolve', label: 'Resolve user' },
      { id: 'assign-role', type: 'capability.run', capability: 'user.assignRoles', label: 'Assign role' },
      { id: 'message', type: 'message.show', label: 'Show message' }
    ],
    edges: [
      { id: 'edge-1', from: 'resolve-user', to: 'assign-role', condition: 'success' },
      { id: 'edge-2', from: 'assign-role', to: 'message', condition: 'success' }
    ]
  });

  const matches = getFlowNodeMatches(flow.nodes, 'assign');
  const adjacency = getFlowNodeAdjacency('assign-role', flow.edges);
  const html = renderFlowCanvasToHTML(flow, {
    nodeKeyword: 'assign',
    selectedNodeId: 'assign-role'
  });

  assert.equal(matches.count, 1);
  assert.equal(matches.matchedIds.has('assign-role'), true);
  assert.equal(adjacency.relatedEdgeIds.size, 2);
  assert.equal(adjacency.relatedNodeIds.has('message'), true);
  assert.match(html, /is-matched/);
  assert.match(html, /is-related/);
});

test('renders canvas node locate and failed-node jump controls', () => {
  const flow = createFlow({
    id: 'canvas-locate-flow',
    name: 'Canvas locate flow',
    nodes: [
      { id: 'start', type: 'message.show', label: 'Start' },
      { id: 'failed-step', type: 'capability.run', capability: 'demo.fail', label: 'Failed step' }
    ],
    edges: [
      { id: 'edge-1', from: 'start', to: 'failed-step', condition: 'success' }
    ]
  });
  const result = {
    ok: false,
    data: {
      nodes: [
        { node: { id: 'start' }, result: { ok: true, data: {} } },
        { node: { id: 'failed-step' }, result: { ok: false, data: {} } }
      ]
    }
  };
  const html = renderFlowDesignerToHTML(flow, {
    selectedNodeId: 'start',
    result
  });

  assert.match(html, /data-flow-canvas-field="selectedNodeId"/);
  assert.match(html, /data-flow-action="focus-failed-node"/);
  assert.match(html, /Failed node/);
  assert.match(html, /Selected: Start/);
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

test('renders condition and transform node configuration controls', () => {
  const conditionHtml = renderEditableNodeInspectorToHTML({
    id: 'check-stock',
    type: 'condition',
    label: 'Check stock',
    condition: {
      left: '{{intent.quantity}}',
      operator: 'gt',
      right: 0
    }
  });
  const transformHtml = renderEditableNodeInspectorToHTML({
    id: 'map-user',
    type: 'transform',
    label: 'Map user payload',
    params: {
      username: '{{intent.username}}'
    },
    inputSchema: { username: { type: 'string' } },
    outputSchema: { payload: { type: 'object' } }
  });

  assert.match(conditionHtml, /data-flow-node-field="condition"/);
  assert.match(conditionHtml, /Check stock/);
  assert.match(transformHtml, /data-flow-node-field="inputSchema"/);
  assert.match(transformHtml, /data-flow-node-field="outputSchema"/);
});

test('validates condition and transform node configuration', () => {
  const flow = createFlow({
    id: 'invalid-control-flow',
    name: 'Invalid control flow',
    status: 'draft',
    nodes: [
      { id: 'condition', type: 'condition', condition: null },
      { id: 'transform', type: 'transform', params: [] }
    ]
  });
  const validation = validateFlow(flow);

  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /Condition node requires a condition object: condition/);
  assert.match(validation.errors.join('\n'), /Transform node params must be an object: transform/);
});

test('evaluates controlled flow condition DSL', () => {
  const input = {
    slots: {
      quantity: 3,
      status: 'enabled'
    }
  };
  const condition = {
    all: [
      { left: '{{intent.quantity}}', operator: 'gt', right: 0 },
      {
        any: [
          { left: '{{intent.status}}', operator: 'eq', right: 'enabled' },
          { left: '{{intent.status}}', operator: 'eq', right: 'pending' }
        ]
      },
      {
        not: { left: '{{intent.quantity}}', operator: 'lt', right: 1 }
      }
    ]
  };

  assert.equal(evaluateFlowCondition(condition, input), true);
});

test('applies flow transform mappings without arbitrary code execution', () => {
  const payload = applyFlowTransform({
    name: '{{intent.name}}',
    actorId: '{{context.actor.id}}',
    staticValue: 'ok'
  }, {
    slots: { name: '张三' }
  }, {
    actor: { id: 'admin' }
  });

  assert.deepEqual(payload, {
    name: '张三',
    actorId: 'admin',
    staticValue: 'ok'
  });
});

test('renders editable flow settings with slot configuration', () => {
  const html = renderFlowSettingsToHTML(createOrganizationFlow());

  assert.match(html, /data-flow-field="intent\.slots"/);
  assert.match(html, /organizationName/);
});

test('renders edge editor controls', () => {
  const flow = createFlow({
    id: 'edge-flow',
    name: 'Edge flow',
    status: 'draft',
    nodes: [
      { id: 'first', type: 'message.show', label: 'First' },
      { id: 'second', type: 'message.show', label: 'Second' }
    ],
    edges: [
      { id: 'edge-1', from: 'first', to: 'second', condition: 'success' }
    ]
  });
  const html = renderFlowEdgeEditorToHTML(flow, { selectedEdgeId: 'edge-1' });

  assert.match(html, /data-flow-action="add-edge"/);
  assert.match(html, /data-flow-action="select-edge"/);
  assert.match(html, /data-flow-edge-field="from"/);
  assert.match(html, /data-flow-edge-field="to"/);
  assert.match(html, /data-flow-edge-field="condition"/);
});

test('renders flow test panel controls', () => {
  const html = renderFlowTestPanelToHTML({
    testPrompt: '创建',
    testSlotsText: '{"name":"张三"}'
  });

  assert.match(html, /data-flow-action="test-match"/);
  assert.match(html, /data-flow-action="test-preview"/);
  assert.match(html, /data-flow-action="test-execute"/);
  assert.match(html, /data-flow-test-field="prompt"/);
  assert.match(html, /data-flow-test-field="slots"/);
  assert.match(html, /张三/);
});

test('parses flow test slots as object', () => {
  assert.deepEqual(parseFlowTestSlots('{"name":"张三"}'), { name: '张三' });
  assert.deepEqual(parseFlowTestSlots(''), {});
  assert.throws(() => parseFlowTestSlots('[]'), /Slots must be a JSON object/);
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

test('summarizes runtime capabilities for AI flow builder without execute functions', () => {
  const runtime = createPivotRuntime();
  runtime.registerCapability({
    name: 'material.delete',
    resource: 'material',
    action: ActionType.DELETE,
    risk: RiskLevel.HIGH,
    permissions: ['material:catalog:delete'],
    requiresConfirmation: true,
    paramsSchema: {
      id: { type: 'number', required: true }
    },
    execute: () => ({ deleted: true })
  });

  const summary = createCapabilityManifestSummary(runtime);

  assert.equal(summary.count, 1);
  assert.equal(summary.capabilities[0].name, 'material.delete');
  assert.equal(summary.capabilities[0].execute, undefined);
  assert.equal(summary.risks.high, 1);
  assert.deepEqual(summary.permissions, ['material:catalog:delete']);
});

test('validates AI-generated flow drafts against registered capabilities and risk confirmation', () => {
  const runtime = createPivotRuntime();
  runtime.registerCapability({
    name: 'material.delete',
    resource: 'material',
    action: ActionType.DELETE,
    risk: RiskLevel.HIGH,
    permissions: ['material:catalog:delete'],
    execute: () => ({ deleted: true })
  });
  const flow = createFlow({
    id: 'ai-delete-material',
    name: 'AI delete material',
    status: 'published',
    nodes: [
      {
        id: 'delete-material',
        type: 'capability.run',
        capability: 'material.delete',
        risk: 'high',
        params: { id: '{{intent.id}}' }
      }
    ]
  });

  const validation = validateAIFlowDraft(flow, { runtime });

  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /must remain draft/);
  assert.match(validation.errors.join('\n'), /must require confirmation/);
});

test('creates safe AI flow builder context and draft from structured output', () => {
  const runtime = createPivotRuntime();
  runtime.registerCapability({
    name: 'material.delete',
    resource: 'material',
    action: ActionType.DELETE,
    risk: RiskLevel.HIGH,
    permissions: ['material:catalog:delete'],
    paramsSchema: {
      id: { type: 'number', required: true }
    },
    execute: () => ({ deleted: true })
  });
  const context = createAIFlowBuilderContext(runtime);
  const draft = createAIFlowDraft({
    prompt: '删除耗材 TEST-001',
    flow: {
      id: 'ai-material-delete',
      name: 'AI material delete',
      status: 'published',
      intent: {
        examples: ['删除耗材 TEST-001'],
        keywords: ['删除耗材']
      },
      nodes: [
        {
          id: 'delete-material',
          type: 'capability.run',
          capability: 'material.delete',
          params: { id: '{{intent.id}}' }
        }
      ]
    }
  }, { runtime });

  assert.equal(context.capabilitySummary.count, 1);
  assert.match(context.safetyRules.join('\n'), /status must be draft/);
  assert.equal(draft.ok, true);
  assert.equal(draft.flow.status, 'draft');
  assert.equal(draft.flow.metadata.aiGenerated, true);
  assert.equal(draft.flow.nodes[0].risk, 'high');
  assert.equal(draft.flow.nodes[0].requiresConfirmation, true);
});

test('generates AI flow drafts through a provider without executing or publishing', async () => {
  const runtime = createPivotRuntime();
  runtime.registerCapability({
    name: 'material.delete',
    resource: 'material',
    action: ActionType.DELETE,
    risk: RiskLevel.HIGH,
    description: '删除耗材',
    execute: () => {
      throw new Error('execute should not be called');
    }
  });
  const calls = [];
  const provider = createAIFlowProvider(async (request) => {
    calls.push({
      prompt: request.prompt,
      capabilityCount: request.capabilitySummary.count,
      rules: request.safetyRules.length
    });
    return {
      prompt: request.prompt,
      flow: {
        id: 'ai-provider-delete',
        name: 'Provider delete draft',
        status: 'published',
        nodes: [
          {
            id: 'delete',
            type: 'capability.run',
            capability: 'material.delete'
          }
        ]
      }
    };
  }, { name: 'unit-test-provider' });

  const draft = await generateAIFlowDraft('删除耗材 TEST-001', {
    runtime,
    provider
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].prompt, '删除耗材 TEST-001');
  assert.equal(calls[0].capabilityCount, 1);
  assert.equal(draft.provider, 'unit-test-provider');
  assert.equal(draft.ok, true);
  assert.equal(draft.flow.status, 'draft');
  assert.equal(draft.flow.nodes[0].requiresConfirmation, true);
  assert.equal(draft.providerOutput, undefined);
  assert.equal(draft.diff.some((item) => item.path === 'status' && item.after === 'draft'), true);
});

test('creates AI provider request messages without executable capability functions', () => {
  const runtime = createPivotRuntime();
  runtime.registerCapability({
    name: 'material.query',
    resource: 'material',
    action: ActionType.QUERY,
    risk: RiskLevel.LOW,
    description: '查询耗材',
    execute: () => ({ list: [] })
  });
  const request = createAIFlowProviderRequest('查询耗材', runtime, {
    metadata: { tenant: 'his-demo' }
  });
  const payload = createAIFlowProviderMessages('查询耗材', request.builderContext);
  const userContent = JSON.parse(payload.messages[1].content);

  assert.equal(request.prompt, '查询耗材');
  assert.equal(request.responseContract.draftOnly, true);
  assert.equal(request.capabilitySummary.capabilities[0].name, 'material.query');
  assert.equal(request.capabilitySummary.capabilities[0].execute, undefined);
  assert.equal(request.metadata.tenant, 'his-demo');
  assert.equal(payload.responseFormat.type, 'json_object');
  assert.match(payload.messages[0].content, /Return JSON only/);
  assert.equal(userContent.capabilitySummary.capabilities[0].execute, undefined);
  assert.equal(userContent.responseContract.draftOnly, true);
});

test('parses common AI provider JSON response shapes for flow drafts', () => {
  const fenced = parseAIFlowProviderOutput('```json\n{"flow":{"id":"fenced","name":"Fenced"}}\n```', '创建流程');
  const openAIStyle = parseAIFlowProviderOutput({
    choices: [
      {
        message: {
          content: '{"prompt":"删除耗材","flow":{"id":"choice","name":"Choice"}}'
        }
      }
    ]
  });
  const outputText = parseAIFlowProviderOutput({
    output_text: 'Result:\n{"flow":{"id":"output-text","name":"Output text"}}'
  });

  assert.equal(fenced.prompt, '创建流程');
  assert.equal(fenced.flow.id, 'fenced');
  assert.equal(openAIStyle.prompt, '删除耗材');
  assert.equal(openAIStyle.flow.id, 'choice');
  assert.equal(outputText.flow.id, 'output-text');
  assert.throws(() => parseAIFlowProviderOutput('not json'), /not valid JSON/);
});

test('recommends capabilities and renders AI flow draft preview safely', () => {
  const runtime = createPivotRuntime();
  runtime.registerCapability({
    name: 'material.delete',
    resource: 'material',
    action: ActionType.DELETE,
    risk: RiskLevel.HIGH,
    description: '删除耗材',
    permissions: ['material:catalog:delete'],
    execute: () => ({ deleted: true })
  });
  runtime.registerCapability({
    name: 'user.query',
    resource: 'user',
    action: ActionType.QUERY,
    risk: RiskLevel.LOW,
    description: '查询用户',
    execute: () => ({})
  });
  const draft = createAIFlowDraft({
    flow: {
      id: 'ai-safe-preview',
      name: '<script>alert(1)</script>',
      nodes: [
        {
          id: 'delete-material',
          type: 'capability.run',
          capability: 'material.delete'
        }
      ]
    }
  }, { runtime });
  const recommendations = recommendFlowCapabilities('删除耗材', runtime);
  const html = renderAIFlowDraftPreviewToHTML(draft, { showJSON: true });

  assert.equal(recommendations[0].capability.name, 'material.delete');
  assert.match(recommendations[0].reasons.join('\n'), /keyword|full prompt/);
  assert.match(html, /flow-ai-draft-preview/);
  assert.match(html, /material\.delete/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('reports missing AI draft capabilities and normalization diff', () => {
  const runtime = createPivotRuntime();
  runtime.registerCapability({
    name: 'material.delete',
    resource: 'material',
    action: ActionType.DELETE,
    risk: RiskLevel.HIGH,
    description: '删除耗材',
    execute: () => ({ deleted: true })
  });
  const draft = createAIFlowDraft({
    flow: {
      id: 'ai-missing-capability',
      name: 'Missing capability flow',
      status: 'published',
      nodes: [
        {
          id: 'delete',
          type: 'capability.run',
          capability: 'material.remove',
          label: 'Delete material'
        }
      ]
    }
  }, { runtime });
  const missing = getMissingFlowCapabilities(draft.flow, runtime);
  const diff = diffAIFlowDraft({ status: 'published' }, draft.flow);
  const html = renderAIFlowDraftPreviewToHTML(draft, { runtime, showDiff: true });

  assert.equal(draft.ok, false);
  assert.equal(missing[0].capability, 'material.remove');
  assert.equal(draft.missingCapabilities[0].capability, 'material.remove');
  assert.equal(diff.some((item) => item.path === 'status' && item.after === 'draft'), true);
  assert.equal(draft.diff.some((item) => item.path === 'status' && item.after === 'draft'), true);
  assert.match(html, /Missing capabilities/);
  assert.match(html, /Draft changes/);
});

test('renders AI flow draft review actions only for valid drafts', () => {
  const runtime = createPivotRuntime();
  runtime.registerCapability({
    name: 'material.delete',
    resource: 'material',
    action: ActionType.DELETE,
    risk: RiskLevel.HIGH,
    description: '删除耗材',
    execute: () => ({ deleted: true })
  });
  const validDraft = createAIFlowDraft({
    flow: {
      id: 'ai-review-valid',
      name: 'Review valid draft',
      nodes: [
        {
          id: 'delete',
          type: 'capability.run',
          capability: 'material.delete'
        }
      ]
    }
  }, { runtime });
  const blockedDraft = createAIFlowDraft({
    flow: {
      id: 'ai-review-blocked',
      name: 'Review blocked draft',
      nodes: [
        {
          id: 'missing',
          type: 'capability.run',
          capability: 'missing.delete'
        }
      ]
    }
  }, { runtime });
  const validHTML = renderAIFlowDraftReviewToHTML(validDraft);
  const blockedHTML = renderAIFlowDraftReviewToHTML(blockedDraft);

  assert.match(validHTML, /data-flow-ai-action="save-draft"/);
  assert.doesNotMatch(validHTML, /save-draft" disabled/);
  assert.match(validHTML, /Draft changes/);
  assert.match(blockedHTML, /data-flow-ai-action="save-draft" disabled/);
  assert.match(blockedHTML, /Missing capabilities/);
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
