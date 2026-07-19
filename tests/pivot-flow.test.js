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
  canConnectFlowNodes,
  createLocalIntentMapper,
  createMemoryFlowStore,
  createFlowRunner,
  createFlowRunHistorySummary,
  createFlowRunRecord,
  createFlowAccessReport,
  createFlowExportPayload,
  createFlowImportReport,
  createFlowChangeReport,
  createFlowEditSession,
  createFlowSnapshot,
  applyAIFlowDraftRepairPlan,
  createFlowBatchSafetyReport,
  createFlowSafetyReport,
  createFlowCanvasLayout,
  createFlowVariableSources,
  createIntentClarificationPlan,
  analyzeIntentConfig,
  analyzeFlowDataDependencies,
  explainIntentMatches,
  extractFlowDataReferences,
  duplicateFlow,
  filterFlows,
  applyFlowTransform,
  evaluateFlowCondition,
  flowToPlan,
  diffFlows,
  listFlowTemplates,
  diffAIFlowDraft,
  createAIFlowDraftRepairPlan,
  getFlowCapabilityRows,
  getFlowCanvasDiagnostics,
  getFlowExecutionTrace,
  getMissingFlowCapabilities,
  getFlowNodeAdjacency,
  getFlowNodeNeighborhood,
  getFlowNodeMatches,
  getFlowRisk,
  getFlowRunSummary,
  groupFlowTemplates,
  groupFlowCanvasNodes,
  groupFlows,
  generateAIFlowDraft,
  filterFlowRuns,
  hasPermission,
  normalizeFlowCanvasViewport,
  exportFlowToJSON,
  exportFlowsToJSON,
  importFlowsToStore,
  parseAIFlowProviderOutput,
  parseFlowImportJSON,
  prepareImportedFlow,
  renderEditableNodeInspectorToHTML,
  renderFlowCapabilityMatrixToHTML,
  renderFlowCanvasToHTML,
  renderFlowDesignerToHTML,
  renderFlowEdgeEditorToHTML,
  renderFlowRunPanelToHTML,
  renderFlowRunHistoryToHTML,
  renderFlowRunSummaryToHTML,
  renderFlowAccessReportToHTML,
  renderFlowChangeReportToHTML,
  renderFlowImportReportToHTML,
  renderFlowNodeNeighborhoodToHTML,
  renderFlowSafetyReportToHTML,
  renderFlowDataDependenciesToHTML,
  renderIntentClarificationPlanToHTML,
  renderIntentMatchExplanationToHTML,
  renderIntentPatternEditorToHTML,
  renderFlowBatchSafetyReportToHTML,
  renderFlowSettingsToHTML,
  renderFlowTestPanelToHTML,
  renderFlowTemplateListToHTML,
  renderVariableMapperToHTML,
  restoreFlowSnapshot,
  recommendFlowCapabilities,
  renderAIFlowDraftPreviewToHTML,
  renderAIFlowBuilderPanelToHTML,
  renderAIFlowDraftReviewToHTML,
  parseFlowTestSlots,
  registerFlowFrontendCapabilities,
  sanitizeFlowRunValue,
  summarizeFlowRunResult,
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

test('duplicates flows as draft copies', () => {
  const source = createFlow({
    id: 'published-flow',
    name: 'Published flow',
    status: 'published',
    publishedAt: '2026-07-19T08:00:00.000Z',
    nodes: [
      { id: 'node-1', type: 'capability.run', capability: 'org.create' }
    ],
    metadata: {
      owner: 'admin'
    }
  });

  const copy = duplicateFlow(source);

  assert.notEqual(copy.id, source.id);
  assert.equal(copy.name, 'Published flow copy');
  assert.equal(copy.status, 'draft');
  assert.equal(copy.publishedAt, null);
  assert.equal(copy.metadata.owner, 'admin');
  assert.equal(copy.metadata.duplicatedFrom, 'published-flow');
  assert.deepEqual(copy.nodes, source.nodes);
});

test('exports and imports flows as draft definitions', () => {
  const source = createOrganizationFlow();
  const payload = createFlowExportPayload([source], {
    exportedAt: '2026-07-19T08:00:00.000Z',
    metadata: { owner: 'flow-admin' }
  });
  const json = exportFlowToJSON(source, { exportedAt: '2026-07-19T08:00:00.000Z' });
  const parsed = parseFlowImportJSON(json);
  const report = createFlowImportReport(json, {
    importedAt: '2026-07-19T09:00:00.000Z',
    importedFrom: 'backup.json'
  });

  assert.equal(payload.schema, 'kupola.pivot-flow.export.v1');
  assert.equal(payload.flows.length, 1);
  assert.equal(parsed.flows.length, 1);
  assert.equal(report.ok, true);
  assert.equal(report.status, 'review');
  assert.equal(report.total, 1);
  assert.equal(report.flows[0].id, 'org-create');
  assert.equal(report.flows[0].status, 'draft');
  assert.equal(report.flows[0].publishedAt, null);
  assert.equal(report.flows[0].metadata.importedFrom, 'backup.json');
  assert.equal(report.warnings.some((item) => item.includes('reset from published to draft')), true);
});

test('regenerates imported flow ids when they already exist', () => {
  const source = createOrganizationFlow();
  const report = createFlowImportReport(exportFlowsToJSON([source]), {
    existingFlows: [source],
    importedAt: '2026-07-19T09:00:00.000Z'
  });

  assert.equal(report.status, 'review');
  assert.equal(report.items[0].action, 'create-with-new-id');
  assert.notEqual(report.flows[0].id, source.id);
  assert.equal(report.flows[0].metadata.originalId, source.id);
});

test('blocks invalid flow import packages', () => {
  const invalidJson = createFlowImportReport('{broken json');
  const missingCapability = createFlowImportReport(exportFlowToJSON(createOrganizationFlow()), {
    capabilities: ['user.create']
  });
  const html = renderFlowImportReportToHTML(invalidJson);

  assert.equal(invalidJson.ok, false);
  assert.equal(invalidJson.status, 'blocked');
  assert.equal(invalidJson.blockingIssues[0].includes('invalid'), true);
  assert.equal(missingCapability.status, 'blocked');
  assert.equal(missingCapability.blockingIssues.some((item) => item.includes('org.create')), true);
  assert.equal(html.includes('flow-import-report--blocked'), true);
});

test('imports prepared flows into a flow store without publishing them', async () => {
  const flowStore = createMemoryFlowStore();
  const report = createFlowImportReport(exportFlowToJSON(createOrganizationFlow()), {
    importedAt: '2026-07-19T09:00:00.000Z'
  });
  const result = await importFlowsToStore(report, flowStore);
  const saved = await flowStore.get('org-create');
  const prepared = prepareImportedFlow(createOrganizationFlow(), {
    importedAt: '2026-07-19T10:00:00.000Z',
    preserveIds: false
  });

  assert.equal(result.ok, true);
  assert.equal(result.createdCount, 1);
  assert.equal(saved.status, 'draft');
  assert.equal(saved.publishedAt, null);
  assert.notEqual(prepared.id, 'org-create');
});

test('direct store imports detect existing ids before saving', async () => {
  const source = createOrganizationFlow();
  const flowStore = createMemoryFlowStore([source]);
  const result = await importFlowsToStore(exportFlowToJSON(source), flowStore);
  const flows = await flowStore.list();

  assert.equal(result.ok, true);
  assert.equal(result.createdCount, 1);
  assert.equal(flows.length, 2);
  assert.equal(flows.some((flow) => flow.id !== source.id && flow.metadata.originalId === source.id), true);
});

test('creates flow snapshots and restores them as drafts', () => {
  const source = createOrganizationFlow();
  const snapshot = createFlowSnapshot(source, {
    id: 'snapshot-1',
    label: 'Before update',
    reason: 'publish review',
    createdAt: '2026-07-19T10:00:00.000Z',
    createdBy: 'admin'
  });
  const restored = restoreFlowSnapshot(snapshot, {
    restoredAt: '2026-07-19T11:00:00.000Z'
  });

  assert.equal(snapshot.flowId, 'org-create');
  assert.equal(snapshot.label, 'Before update');
  assert.equal(snapshot.flow.status, 'published');
  assert.equal(restored.status, 'draft');
  assert.equal(restored.publishedAt, null);
  assert.equal(restored.metadata.restoredFromSnapshot, 'snapshot-1');
});

test('reports high-impact flow changes before publish', () => {
  const before = createOrganizationFlow();
  const after = createFlow({
    ...before,
    permissions: ['flow:publish'],
    nodes: [
      {
        ...before.nodes[0],
        capability: 'org.delete',
        risk: 'high',
        requiresConfirmation: true
      }
    ]
  });
  const changes = diffFlows(before, after);
  const report = createFlowChangeReport(before, after);
  const html = renderFlowChangeReportToHTML(report);

  assert.equal(changes.some((item) => item.path.includes('capability') && item.risk === 'high'), true);
  assert.equal(report.ok, true);
  assert.equal(report.status, 'review');
  assert.equal(report.highImpactCount >= 2, true);
  assert.equal(report.categories.nodes > 0, true);
  assert.equal(html.includes('flow-change-report--review'), true);
});

test('blocks flow change reports when the target flow is invalid', () => {
  const before = createOrganizationFlow();
  const after = createFlow({
    ...before,
    nodes: [
      {
        ...before.nodes[0],
        capability: ''
      }
    ]
  });
  const report = createFlowChangeReport(before, after);

  assert.equal(report.ok, false);
  assert.equal(report.status, 'blocked');
  assert.equal(report.blockingIssues.some((item) => item.includes('capability is required')), true);
});

test('tracks flow edit sessions with reset commit and snapshots', () => {
  const source = createOrganizationFlow();
  const session = createFlowEditSession(source);

  assert.equal(session.dirty, false);

  session.mutate((draft) => {
    draft.intent.keywords.push('分院');
    draft.nodes[0].requiresConfirmation = true;
  });

  assert.equal(session.dirty, true);
  assert.equal(session.changes.some((item) => item.path.includes('keywords')), true);
  assert.equal(session.report.status, 'review');
  assert.equal(session.baseline.intent.keywords.includes('分院'), false);
  assert.equal(session.draft.intent.keywords.includes('分院'), true);

  const snapshot = session.snapshot({
    id: 'edit-snapshot-1',
    label: 'Edited draft'
  });
  session.reset();

  assert.equal(session.dirty, false);
  assert.equal(session.draft.intent.keywords.includes('分院'), false);

  session.restore(snapshot, {
    restoredAt: '2026-07-19T12:00:00.000Z'
  });

  assert.equal(session.dirty, true);
  assert.equal(session.draft.status, 'draft');
  assert.equal(session.draft.metadata.restoredFromSnapshot, 'edit-snapshot-1');

  session.commit();

  assert.equal(session.dirty, false);
  assert.equal(session.baseline.metadata.restoredFromSnapshot, 'edit-snapshot-1');
  assert.throws(() => session.mutate(null), /mutator function/);
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

test('explains local intent matching evidence and eligibility', () => {
  const flow = createOrganizationFlow();
  const draft = createFlow({
    id: 'draft-user-create',
    name: 'Draft create user',
    status: 'draft',
    intent: {
      keywords: ['增加', '用户']
    }
  });

  const explanation = explainIntentMatches('在集团下增加分机构 C', [flow, draft], {
    includeIneligible: true
  });
  const html = renderIntentMatchExplanationToHTML(explanation);

  assert.equal(explanation.ok, true);
  assert.equal(explanation.best.flow.id, 'org-create');
  assert.equal(explanation.candidates.length, 2);
  assert.equal(explanation.candidates.find((item) => item.flow.id === 'draft-user-create').eligible, false);
  assert.equal(explanation.best.details.keywords.filter((item) => item.status === 'matched').length, 3);
  assert.equal(explanation.best.details.slots[0].name, 'organizationName');
  assert.match(explanation.best.reasons.join('\n'), /matched keyword/);
  assert.match(html, /Intent match explanation/);
  assert.match(html, /organizationName: C/);
});

test('creates clarification plans for missing slots and ambiguous matches', () => {
  const flow = createOrganizationFlow();
  const missingSlotExplanation = explainIntentMatches('在集团下增加分机构', [flow]);
  const missingSlotPlan = createIntentClarificationPlan(missingSlotExplanation);
  const missingSlotHTML = renderIntentClarificationPlanToHTML(missingSlotPlan);

  assert.equal(missingSlotPlan.needed, true);
  assert.equal(missingSlotPlan.reason, 'missing-slots');
  assert.equal(missingSlotPlan.missingSlots[0].name, 'organizationName');
  assert.match(missingSlotHTML, /Provide Organization name|Provide organizationName/);

  const roleFlow = createFlow({
    id: 'role-create',
    name: 'Create role',
    status: 'published',
    intent: { keywords: ['增加'] }
  });
  const userFlow = createFlow({
    id: 'user-create',
    name: 'Create user',
    status: 'published',
    intent: { keywords: ['增加'] }
  });
  const ambiguousExplanation = explainIntentMatches('增加', [roleFlow, userFlow], { minConfidence: 0.1 });
  const ambiguousPlan = createIntentClarificationPlan(ambiguousExplanation);

  assert.equal(ambiguousPlan.needed, true);
  assert.equal(ambiguousPlan.reason, 'ambiguous');
  assert.equal(ambiguousPlan.suggestions.length, 2);
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

test('checks canvas connection safety before adding edges', () => {
  const flow = createFlow({
    id: 'connection-flow',
    name: 'Connection flow',
    nodes: [
      { id: 'a', type: 'message.show' },
      { id: 'b', type: 'message.show' },
      { id: 'c', type: 'message.show' }
    ],
    edges: [
      { id: 'edge-a-b', from: 'a', to: 'b' },
      { id: 'edge-b-c', from: 'b', to: 'c' }
    ]
  });

  assert.equal(canConnectFlowNodes(flow, 'a', 'c').ok, true);
  assert.equal(canConnectFlowNodes(flow, 'a', 'b').ok, false);
  assert.match(canConnectFlowNodes(flow, 'a', 'a').message, /same node/);
  assert.match(canConnectFlowNodes(flow, 'c', 'a').message, /cycle/);
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

test('analyzes flow data dependencies between nodes', () => {
  const refs = extractFlowDataReferences({
    parentId: '{{query-parent.data.id}}',
    actorId: '{{context.actor.id}}',
    roleId: { $from: 'resolve-role', path: 'data.id' }
  }, 'create.params');

  assert.equal(refs.length, 3);
  assert.equal(refs.find((ref) => ref.fromNodeId === 'query-parent').refPath, 'data.id');
  assert.equal(refs.find((ref) => ref.source === 'context').refPath, 'actor.id');

  const flow = createFlow({
    id: 'dependency-flow',
    name: 'Dependency flow',
    nodes: [
      { id: 'query-parent', type: 'capability.run', capability: 'org.query' },
      {
        id: 'create-child',
        type: 'capability.run',
        capability: 'org.create',
        params: {
          parentId: '{{query-parent.data.id}}',
          roleId: { $from: 'resolve-role', path: 'data.id' }
        }
      },
      {
        id: 'notify',
        type: 'message.show',
        params: {
          message: '{{create-child.data.name}}'
        }
      },
      {
        id: 'downstream-reader',
        type: 'message.show',
        params: {
          message: '{{notify.data.message}}'
        }
      },
      { id: 'resolve-role', type: 'capability.run', capability: 'role.resolve' }
    ],
    edges: [
      { id: 'edge-1', from: 'query-parent', to: 'create-child', condition: 'success' },
      { id: 'edge-2', from: 'create-child', to: 'notify', condition: 'success' },
      { id: 'edge-3', from: 'downstream-reader', to: 'notify', condition: 'success' }
    ]
  });

  const report = analyzeFlowDataDependencies(flow);
  const html = renderFlowDataDependenciesToHTML(report);
  const safety = createFlowSafetyReport(flow);

  assert.equal(report.ok, false);
  assert.equal(report.status, 'blocked');
  assert.equal(report.dependencies.some((item) => item.status === 'upstream' && item.fromNodeId === 'query-parent'), true);
  assert.equal(report.dependencies.some((item) => item.status === 'unconnected' && item.fromNodeId === 'resolve-role'), true);
  assert.equal(report.dependencies.some((item) => item.status === 'downstream' && item.fromNodeId === 'notify'), true);
  assert.equal(safety.status, 'blocked');
  assert.match(safety.blockingIssues.join('\n'), /Invalid data dependency/);
  assert.match(safety.warnings.join('\n'), /Review data dependency/);
  assert.match(html, /Data dependencies/);
  assert.match(html, /downstream/);
});

test('creates and renders flow publish safety reports', () => {
  const runtime = createPivotRuntime();
  runtime.registerCapability({
    name: 'material.delete',
    resource: 'material',
    action: ActionType.DELETE,
    risk: RiskLevel.HIGH,
    permissions: ['material:catalog:delete'],
    requiresConfirmation: true,
    execute: () => ({})
  });
  const flow = createFlow({
    id: 'material-delete-safety',
    name: 'Material delete safety',
    status: 'draft',
    intent: {
      slots: [
        {
          name: 'operatorPassword',
          label: 'Password',
          type: 'string',
          required: true,
          source: 'manual',
          inputType: 'password'
        }
      ]
    },
    nodes: [
      {
        id: 'delete',
        type: 'capability.run',
        capability: 'material.delete',
        label: 'Delete material',
        requiresConfirmation: true
      }
    ]
  });
  const report = createFlowSafetyReport(flow, runtime);
  const html = renderFlowSafetyReportToHTML(report);

  assert.equal(report.ok, true);
  assert.equal(report.status, 'review');
  assert.equal(report.capabilities[0].registrationStatus, 'registered');
  assert.equal(report.capabilities[0].confirmationStatus, 'required');
  assert.equal(report.sensitiveSlots[0].safe, true);
  assert.match(report.backendRequirements.join('\n'), /Backend|Authorize|401|403/i);
  assert.match(html, /flow-safety-report/);
  assert.match(html, /Publish safety/);
  assert.match(html, /material:catalog:delete/);
});

test('creates frontend flow access reports from actor permissions', () => {
  const runtime = createPivotRuntime();
  runtime.registerCapability({
    name: 'org.create',
    resource: 'organization',
    action: ActionType.CREATE,
    risk: RiskLevel.MEDIUM,
    permissions: ['system:org:create'],
    execute: () => ({})
  });
  const flow = createFlow({
    id: 'org-access',
    name: 'Create org access',
    permissions: ['flow:publish'],
    nodes: [
      { id: 'create-org', type: 'capability.run', capability: 'org.create', label: 'Create org' }
    ]
  });

  const blocked = createFlowAccessReport(flow, runtime, {
    context: {
      actor: {
        id: 'operator',
        permissions: ['system:org:query']
      }
    }
  });
  const allowed = createFlowAccessReport(flow, runtime, {
    context: {
      actor: {
        id: 'admin',
        permissions: ['flow:publish', 'system:org:*']
      }
    }
  });
  const html = renderFlowAccessReportToHTML(blocked);

  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 'blocked');
  assert.deepEqual(blocked.missingPermissions, ['flow:publish', 'system:org:create']);
  assert.equal(allowed.ok, true);
  assert.equal(allowed.status, 'review');
  assert.equal(hasPermission(['system:*'], 'system:org:create'), true);
  assert.match(html, /Access hints/);
  assert.match(html, /Missing permissions/);
  assert.match(html, /system:org:create/);
});

test('blocks publish safety report for missing capabilities and confirmations', () => {
  const runtime = createPivotRuntime();
  runtime.registerCapability({
    name: 'material.delete',
    resource: 'material',
    action: ActionType.DELETE,
    risk: RiskLevel.HIGH,
    permissions: ['material:catalog:delete'],
    execute: () => ({})
  });
  const flow = createFlow({
    id: 'unsafe-flow',
    name: 'Unsafe flow',
    status: 'draft',
    intent: {
      slots: [
        {
          name: 'phone',
          label: '手机号',
          type: 'string',
          source: 'intent'
        }
      ]
    },
    nodes: [
      {
        id: 'delete',
        type: 'capability.run',
        capability: 'material.delete',
        label: 'Delete material'
      },
      {
        id: 'missing',
        type: 'capability.run',
        capability: 'role.remove',
        label: 'Remove role'
      }
    ]
  });
  const report = createFlowSafetyReport(flow, runtime);
  const html = renderFlowSafetyReportToHTML(report);

  assert.equal(report.ok, false);
  assert.equal(report.status, 'blocked');
  assert.match(report.blockingIssues.join('\n'), /High-risk node must require confirmation/);
  assert.match(report.blockingIssues.join('\n'), /Capability is not registered: role\.remove/);
  assert.match(report.warnings.join('\n'), /Sensitive slot should use manual source: phone/);
  assert.match(html, /Blocking issues/);
  assert.match(html, /Sensitive slots/);
});

test('creates batch publish safety reports for filtered flows', () => {
  const runtime = createPivotRuntime();
  runtime.registerCapability({
    name: 'material.delete',
    resource: 'material',
    action: ActionType.DELETE,
    risk: RiskLevel.HIGH,
    permissions: ['material:catalog:delete'],
    requiresConfirmation: true,
    execute: () => ({})
  });
  runtime.registerCapability({
    name: 'material.query',
    resource: 'material',
    action: ActionType.QUERY,
    risk: RiskLevel.LOW,
    permissions: ['material:catalog:query'],
    execute: () => ({})
  });
  const queryFlow = createFlow({
    id: 'query-flow',
    name: 'Query flow',
    status: 'draft',
    nodes: [
      { id: 'query', type: 'capability.run', capability: 'material.query', label: 'Query material' }
    ]
  });
  const deleteFlow = createFlow({
    id: 'delete-flow',
    name: 'Delete flow',
    status: 'draft',
    nodes: [
      { id: 'delete', type: 'capability.run', capability: 'material.delete', label: 'Delete material', risk: 'high', requiresConfirmation: true }
    ]
  });
  const unsafeFlow = createFlow({
    id: 'unsafe-flow',
    name: 'Unsafe flow',
    status: 'draft',
    nodes: [
      { id: 'missing', type: 'capability.run', capability: 'role.remove', label: 'Remove role' }
    ]
  });

  const report = createFlowBatchSafetyReport([queryFlow, deleteFlow, unsafeFlow], runtime);
  const html = renderFlowBatchSafetyReportToHTML(report);

  assert.equal(report.ok, false);
  assert.equal(report.total, 3);
  assert.equal(report.blockedCount, 1);
  assert.equal(report.reviewCount, 2);
  assert.equal(report.highestRisk, 'high');
  assert.equal(report.blockedFlows[0].flowName, 'Unsafe flow');
  assert.equal(report.reviewFlows.length, 2);
  assert.equal(report.riskCounts.low, 2);
  assert.equal(report.riskCounts.high, 1);
  assert.equal(report.checkSummaries.some((item) => item.id === 'capability-registration' && item.failCount === 1), true);
  assert.match(report.blockingIssues.join('\n'), /Unsafe flow: Capability is not registered: role\.remove/);
  assert.match(html, /Batch publish safety/);
  assert.match(html, /Risk breakdown/);
  assert.match(html, /Check summary/);
  assert.match(html, /Blocked flows/);
  assert.match(html, /Unsafe flow/);
  assert.match(html, /Blocking issues/);
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

test('analyzes selected flow node neighborhood', () => {
  const flow = createFlow({
    id: 'node-neighborhood-flow',
    name: 'Node neighborhood flow',
    nodes: [
      { id: 'resolve-org', type: 'capability.run', capability: 'org.query', label: 'Resolve org' },
      { id: 'resolve-role', type: 'capability.run', capability: 'role.resolve', label: 'Resolve role' },
      { id: 'create-user', type: 'capability.run', capability: 'user.create', label: 'Create user', risk: 'medium' },
      { id: 'assign-role', type: 'capability.run', capability: 'user.assignRoles', label: 'Assign role' },
      { id: 'notify', type: 'message.show', label: 'Notify' }
    ],
    edges: [
      { id: 'edge-org', from: 'resolve-org', to: 'create-user', condition: 'success' },
      { id: 'edge-role', from: 'resolve-role', to: 'assign-role', condition: 'success' },
      { id: 'edge-create', from: 'create-user', to: 'assign-role', condition: 'success' },
      { id: 'edge-notify', from: 'assign-role', to: 'notify', condition: 'success' }
    ]
  });

  const report = getFlowNodeNeighborhood(flow, 'assign-role', { depth: 2 });
  const html = renderFlowNodeNeighborhoodToHTML(report);

  assert.equal(report.ok, true);
  assert.deepEqual(report.upstream.nodeIds, ['resolve-role', 'create-user', 'resolve-org']);
  assert.deepEqual(report.downstream.nodeIds, ['notify']);
  assert.equal(report.relatedEdgeIds.length, 4);
  assert.match(html, /Node neighborhood|Upstream|Downstream/);
  assert.match(html, /Create user/);
  assert.match(renderFlowNodeNeighborhoodToHTML(flow, ''), /Select a node/);
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
        { node: { id: 'first' }, result: { ok: true, data: { durationMs: 12 } } },
        { node: { id: 'second' }, result: { ok: false, message: 'Permission denied', durationMs: 45 } },
        { node: { id: 'fallback' }, result: { ok: true, data: { elapsedMs: 8 } } }
      ]
    }
  };

  const trace = getFlowExecutionTrace(result, flow.nodes, flow.edges);
  const html = renderFlowCanvasToHTML(flow, { result });

  assert.equal(trace.firstFailedNodeId, 'second');
  assert.deepEqual(trace.executedNodeIds, ['first', 'fallback']);
  assert.deepEqual(trace.failedNodeIds, ['second']);
  assert.equal(trace.totalDurationMs, 65);
  assert.equal(trace.nodeStates.get('second').durationMs, 45);
  assert.equal(trace.nodeStates.get('second').message, 'Permission denied');
  assert.equal(trace.edgeStates.get('edge-success').active, true);
  assert.equal(trace.edgeStates.get('edge-failure').failed, true);
  assert.match(html, /flow-node--failed/);
  assert.match(html, /failed path/);
  assert.match(html, /Permission denied/);
  assert.match(html, /65ms total/);
  assert.match(html, /Slowest node/);
});

test('creates flow canvas diagnostics for failed nodes and cross-group edges', () => {
  const flow = createFlow({
    id: 'canvas-diagnostics-flow',
    name: 'Canvas diagnostics flow',
    nodes: [
      { id: 'resolve-user', type: 'capability.run', capability: 'user.resolve', label: 'Resolve user' },
      { id: 'delete-role', type: 'capability.run', capability: 'role.delete', label: 'Delete role' },
      { id: 'notify', type: 'message.show', label: 'Notify' }
    ],
    edges: [
      { id: 'edge-cross', from: 'resolve-user', to: 'delete-role', condition: 'success' },
      { id: 'edge-failure', from: 'delete-role', to: 'notify', condition: 'failure' }
    ]
  });
  const result = {
    ok: false,
    data: {
      nodes: [
        { node: { id: 'resolve-user' }, result: { ok: true, data: { durationMs: 10 } } },
        { node: { id: 'delete-role' }, result: { ok: false, message: 'Role is protected', durationMs: 30 } },
        { node: { id: 'notify' }, result: { ok: false, data: { error: 'Notification failed', durationMs: 20 } } }
      ]
    }
  };

  const diagnostics = getFlowCanvasDiagnostics(result, flow.nodes, flow.edges, { groupBy: 'resource' });
  const html = renderFlowCanvasToHTML(flow, { result, canvasGroupBy: 'resource' });

  assert.equal(diagnostics.failedNodes.length, 2);
  assert.equal(diagnostics.firstFailedNode.id, 'delete-role');
  assert.equal(diagnostics.slowestNode.id, 'delete-role');
  assert.equal(diagnostics.crossGroupEdges.length, 2);
  assert.equal(diagnostics.failedCrossGroupEdges.some((edge) => edge.id === 'edge-failure'), true);
  assert.match(html, /Failed nodes/);
  assert.match(html, /Role is protected/);
  assert.match(html, /Cross-group edges/);
});

test('summarizes flow run results for reusable diagnostics', () => {
  const flow = createFlow({
    id: 'run-summary-flow',
    name: 'Run summary flow',
    nodes: [
      { id: 'resolve-role', type: 'capability.run', capability: 'role.resolve', label: 'Resolve role' },
      { id: 'delete-role', type: 'capability.run', capability: 'role.delete', label: 'Delete role', risk: 'high' }
    ],
    edges: [
      { id: 'resolve-to-delete', from: 'resolve-role', to: 'delete-role', condition: 'success' }
    ]
  });
  const result = {
    ok: false,
    code: 403,
    message: 'Forbidden',
    data: {
      nodes: [
        { node: { id: 'resolve-role' }, result: { ok: true, data: { durationMs: 15 } } },
        { node: { id: 'delete-role' }, result: { ok: false, message: 'No role delete permission', durationMs: 1200, code: 403 } }
      ]
    }
  };

  const summary = getFlowRunSummary(result, flow);
  const html = renderFlowRunSummaryToHTML(summary);
  const panel = renderFlowRunPanelToHTML(result, { flow });

  assert.equal(summary.status, 'failed');
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.executedCount, 1);
  assert.equal(summary.durationMs, 1215);
  assert.equal(summary.firstFailedNode.id, 'delete-role');
  assert.equal(summary.slowestNode.id, 'delete-role');
  assert.equal(summary.recommendations.some((item) => item.includes('server-side permissions')), true);
  assert.match(html, /Flow run summary/);
  assert.match(html, /No role delete permission/);
  assert.match(panel, /Recommended checks/);
});

test('filters and renders flow run history', () => {
  const runs = [
    {
      id: 'run-1',
      flowId: 'org-create',
      prompt: '在集团下增加分机构 C',
      ok: true,
      timestamp: '2026-07-19T08:00:00.000Z',
      message: 'Created',
      result: {
        ok: true,
        message: 'Created',
        data: {
          nodes: [
            { node: { id: 'create-org' }, result: { ok: true, data: { durationMs: 30 } } }
          ]
        }
      }
    },
    {
      id: 'run-2',
      flowId: 'org-create',
      prompt: '删除角色 admin',
      ok: false,
      timestamp: '2026-07-19T09:00:00.000Z',
      message: 'Forbidden',
      result: {
        ok: false,
        message: 'Forbidden',
        data: {
          nodes: [
            { node: { id: 'delete-role' }, result: { ok: false, message: 'No permission', durationMs: 40 } }
          ]
        }
      }
    },
    {
      id: 'run-3',
      flowId: 'material-query',
      prompt: '查询耗材',
      ok: true,
      timestamp: '2026-07-18T09:00:00.000Z',
      result: { ok: true, data: {} }
    }
  ];

  const filtered = filterFlowRuns(runs, { flowId: 'org-create', status: 'failed', keyword: '角色' });
  const recent = filterFlowRuns(runs, {
    dateRange: '24h',
    now: '2026-07-19T10:00:00.000Z'
  });
  const summary = createFlowRunHistorySummary(runs, { flowId: 'org-create' });
  const html = renderFlowRunHistoryToHTML(runs, { flowId: 'org-create', status: 'failed', keyword: '角色', dateRange: '24h' });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'run-2');
  assert.equal(recent.length, 2);
  assert.equal(summary.total, 2);
  assert.equal(summary.successCount, 1);
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.latestStatus, 'failed');
  assert.match(html, /Run history/);
  assert.match(html, /data-flow-run-filter="keyword"/);
  assert.match(html, /data-flow-run-filter="dateRange"/);
  assert.match(html, /删除角色 admin/);
  assert.match(html, /Forbidden/);
});

test('summarizes flow run records before persistence', () => {
  const result = {
    ok: true,
    message: 'Created user',
    data: {
      nodes: [
        {
          node: { id: 'create-user', type: 'capability.run', label: 'Create user', capability: 'user.create' },
          result: {
            ok: true,
            message: 'Created',
            data: {
              id: 'user-1',
              username: 'alice',
              password: 'secret',
              token: 'abc',
              list: Array.from({ length: 30 }, (_, index) => ({ id: index + 1, phone: '13800000000' }))
            }
          }
        }
      ],
      token: 'top-secret'
    }
  };

  const summary = summarizeFlowRunResult(result);
  const record = createFlowRunRecord({
    flow: { id: 'user-create', name: 'Create user' },
    prompt: '创建用户 alice',
    result
  });
  const sanitized = sanitizeFlowRunValue({ password: 'secret', nested: { phone: '13800000000' } });

  assert.equal(summary.data.nodeCount, 1);
  assert.equal(summary.data.nodes[0].result.data.id, 'user-1');
  assert.equal(summary.data.nodes[0].result.data.password, '[redacted]');
  assert.equal(summary.data.nodes[0].result.data.token, '[redacted]');
  assert.equal(summary.data.nodes[0].result.data.listCount, 30);
  assert.equal(summary.data.summary.token, '[redacted]');
  assert.equal(record.flowId, 'user-create');
  assert.equal(record.result.data.nodes[0].result.data.listCount, 30);
  assert.equal(sanitized.password, '[redacted]');
  assert.equal(sanitized.nested.phone, '[redacted]');
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

test('groups and collapses flow canvas nodes', () => {
  const flow = createFlow({
    id: 'canvas-group-flow',
    name: 'Canvas group flow',
    nodes: [
      { id: 'resolve-user', type: 'capability.run', capability: 'user.resolve', label: 'Resolve user' },
      { id: 'assign-role', type: 'capability.run', capability: 'user.assignRoles', label: 'Assign role' },
      { id: 'show-message', type: 'message.show', label: 'Show message' }
    ],
    edges: [
      { id: 'edge-1', from: 'resolve-user', to: 'assign-role', condition: 'success' },
      { id: 'edge-2', from: 'assign-role', to: 'show-message', condition: 'success' }
    ]
  });

  const groups = groupFlowCanvasNodes(flow.nodes, 'resource');
  const html = renderFlowCanvasToHTML(flow, {
    canvasGroupBy: 'resource',
    collapsedCanvasGroups: ['user']
  });
  const designerHTML = renderFlowDesignerToHTML(flow, {
    canvasGroupBy: 'risk',
    collapsedCanvasGroups: ['low']
  });

  assert.equal(groups.active, true);
  assert.equal(groups.groups.some((group) => group.key === 'user'), true);
  assert.match(html, /flow-canvas__groups/);
  assert.match(html, /Resource: user/);
  assert.match(html, /0 in · 1 out/);
  assert.match(html, /is-collapsed/);
  assert.match(html, /data-flow-action="toggle-canvas-group"/);
  assert.match(designerHTML, /data-flow-canvas-field="canvasGroupBy"/);
  assert.match(designerHTML, /Collapse|Expand/);
});

test('renders flow canvas viewport controls', () => {
  const flow = createFlow({
    id: 'canvas-viewport-flow',
    name: 'Canvas viewport flow',
    nodes: [
      { id: 'start', type: 'message.show', label: 'Start' },
      { id: 'query-users', type: 'capability.run', capability: 'user.query', label: 'Query users' }
    ],
    edges: [
      { id: 'edge-1', from: 'start', to: 'query-users', condition: 'success' }
    ]
  });

  const viewport = normalizeFlowCanvasViewport({
    canvasZoom: 2,
    canvasDensity: 'compact',
    showCanvasMinimap: true
  });
  const html = renderFlowCanvasToHTML(flow, {
    canvasZoom: 0.7,
    canvasDensity: 'compact',
    showCanvasMinimap: true,
    selectedNodeId: 'query-users'
  });
  const designerHTML = renderFlowDesignerToHTML(flow, {
    canvasZoom: 1.2,
    canvasDensity: 'compact',
    showCanvasMinimap: true
  });

  assert.deepEqual(viewport, { zoom: 1.5, density: 'compact', showMinimap: true });
  assert.match(html, /data-flow-canvas-zoom="0.7"/);
  assert.match(html, /flow-canvas--density-compact/);
  assert.match(html, /flow-canvas__viewport/);
  assert.match(html, /flow-canvas__minimap/);
  assert.match(html, /flow-canvas__minimap-node/);
  assert.match(designerHTML, /data-flow-canvas-field="canvasDensity"/);
  assert.match(designerHTML, /data-flow-action="zoom-canvas-in"/);
  assert.match(designerHTML, /data-flow-action="toggle-canvas-minimap"/);
  assert.match(designerHTML, /120%/);
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

test('creates variable mapper sources for selected node inputs', () => {
  const flow = createFlow({
    id: 'mapper-flow',
    name: 'Mapper flow',
    intent: {
      slots: [
        { name: 'organizationName', label: 'Organization name', required: true },
        { name: 'parentName', label: 'Parent name' }
      ]
    },
    nodes: [
      { id: 'query-parent', type: 'capability.run', label: 'Query parent', capability: 'org.query' },
      { id: 'create-child', type: 'capability.run', label: 'Create child', capability: 'org.create' },
      { id: 'notify', type: 'message.show', label: 'Notify' }
    ],
    edges: [
      { id: 'edge-1', from: 'query-parent', to: 'create-child' },
      { id: 'edge-2', from: 'create-child', to: 'notify' }
    ]
  });

  const sources = createFlowVariableSources(flow, 'create-child');
  const html = renderVariableMapperToHTML({ flow, selectedNodeId: 'create-child' });

  assert.equal(sources.some((source) => source.reference === 'intent.organizationName'), true);
  assert.equal(sources.some((source) => source.reference === 'context.actor.id'), true);
  assert.equal(sources.some((source) => source.reference === 'query-parent.data.id'), true);
  assert.equal(sources.some((source) => source.reference === 'notify.data.id'), false);
  assert.match(html, /data-flow-action="insert-variable-reference"/);
  assert.match(html, /query-parent\.data\.id/);
});

test('analyzes and renders intent rule quality', () => {
  const flow = createFlow({
    id: 'intent-quality-flow',
    name: 'Intent quality flow',
    intent: {
      keywords: ['创建'],
      patterns: ['(?:broken'],
      slots: [
        { name: 'name', label: 'Name', required: true },
        { name: 'password', label: 'Password', sensitive: true, source: 'intent' }
      ]
    }
  });

  const analysis = analyzeIntentConfig(flow);
  const html = renderIntentPatternEditorToHTML(flow);

  assert.equal(analysis.ok, false);
  assert.equal(analysis.status, 'blocked');
  assert.match(analysis.issues.join('\n'), /Invalid intent pattern/);
  assert.match(analysis.warnings.join('\n'), /Required slot has no extraction source: name/);
  assert.match(analysis.warnings.join('\n'), /Sensitive slot should use manual source: password/);
  assert.match(html, /Intent patterns/);
  assert.match(html, /flow-intent-editor__slots/);
  assert.match(html, /Password/);
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

test('creates actionable repair plans for AI draft missing capabilities', () => {
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
      id: 'ai-repair-plan',
      name: 'Repair plan flow',
      nodes: [
        {
          id: 'delete',
          type: 'capability.run',
          label: 'Remove material',
          capability: 'material.remove',
          params: { id: '{{intent.id}}' }
        }
      ]
    }
  }, { runtime });
  const plan = createAIFlowDraftRepairPlan(draft, runtime);
  const html = renderAIFlowDraftPreviewToHTML(draft, { runtime });

  assert.equal(draft.ok, false);
  assert.equal(draft.repairPlan.missingCount, 1);
  assert.equal(plan.actions[0].action, 'replace-capability');
  assert.equal(plan.actions[0].recommendation.capability.name, 'material.delete');
  assert.equal(plan.actions[0].registration.name, 'material.remove');
  assert.equal(plan.actions[0].registration.action, 'delete');
  assert.equal(plan.actions[0].registration.requiresConfirmation, true);
  assert.match(html, /Repair plan/);
  assert.match(html, /Recommended: material\.delete/);
});

test('applies safe AI flow draft repair replacements', () => {
  const runtime = createPivotRuntime();
  runtime.registerCapability({
    name: 'material.delete',
    resource: 'material',
    action: ActionType.DELETE,
    risk: RiskLevel.HIGH,
    requiresConfirmation: true,
    description: '删除耗材',
    execute: () => ({ deleted: true })
  });
  const draft = createAIFlowDraft({
    flow: {
      id: 'ai-apply-repair',
      name: 'Apply repair flow',
      status: 'published',
      nodes: [
        {
          id: 'delete',
          type: 'capability.run',
          label: 'Remove material',
          capability: 'material.remove',
          params: { id: '{{intent.id}}' }
        }
      ]
    }
  }, { runtime });

  const repaired = applyAIFlowDraftRepairPlan(draft, runtime);
  const blockedHTML = renderAIFlowDraftReviewToHTML(draft, { runtime });
  const repairedHTML = renderAIFlowDraftReviewToHTML(repaired, { runtime });

  assert.equal(repaired.applied.length, 1);
  assert.equal(repaired.applied[0].from, 'material.remove');
  assert.equal(repaired.applied[0].to, 'material.delete');
  assert.equal(repaired.skipped.length, 0);
  assert.equal(repaired.flow.status, 'draft');
  assert.equal(repaired.flow.nodes[0].capability, 'material.delete');
  assert.equal(repaired.flow.nodes[0].requiresConfirmation, true);
  assert.equal(repaired.ok, true);
  assert.equal(repaired.missingCapabilities.length, 0);
  assert.equal(repaired.originalRepairPlan.missingCount, 1);
  assert.match(blockedHTML, /data-flow-ai-action="apply-repair"/);
  assert.doesNotMatch(repairedHTML, /data-flow-ai-action="apply-repair"/);
  assert.doesNotMatch(repairedHTML, /save-draft" disabled/);
});

test('creates registration checklist when no capability recommendation exists', () => {
  const draft = createAIFlowDraft({
    flow: {
      id: 'ai-register-plan',
      name: 'Register plan flow',
      nodes: [
        {
          id: 'archive',
          type: 'capability.run',
          label: 'Archive invoice',
          capability: 'invoice.archive',
          risk: 'medium'
        }
      ]
    }
  }, { capabilities: [] });
  const plan = createAIFlowDraftRepairPlan(draft, []);

  assert.equal(plan.ok, true);
  assert.equal(plan.missingCount, 0);

  const blocked = createAIFlowDraftRepairPlan(draft.flow, [
    {
      name: 'material.query',
      resource: 'material',
      action: ActionType.QUERY,
      risk: RiskLevel.LOW
    }
  ]);

  assert.equal(blocked.ok, false);
  assert.equal(blocked.actions[0].action, 'register-capability');
  assert.equal(blocked.registrationChecklist[0].name, 'invoice.archive');
  assert.equal(blocked.registrationChecklist[0].resource, 'invoice');
  assert.equal(blocked.registrationChecklist[0].requiresConfirmation, false);
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
  assert.match(blockedHTML, /data-flow-ai-action="apply-repair"/);
  assert.match(blockedHTML, /Missing capabilities/);
});

test('renders AI flow builder panel with draft review and recommendations', () => {
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
    prompt: '删除耗材 TEST-001',
    flow: {
      id: 'ai-builder-delete',
      name: 'AI builder delete',
      nodes: [
        {
          id: 'delete',
          type: 'capability.run',
          label: 'Remove material',
          capability: 'material.remove'
        }
      ]
    }
  }, { runtime });
  const recommendations = recommendFlowCapabilities('删除耗材 TEST-001', runtime);
  const html = renderAIFlowBuilderPanelToHTML({
    prompt: '删除耗材 TEST-001',
    draftResult: draft,
    recommendations
  });

  assert.match(html, /AI Flow Builder/);
  assert.match(html, /data-flow-ai-action="generate-draft"/);
  assert.match(html, /Recommended capabilities/);
  assert.match(html, /Review AI Flow draft/);
  assert.match(html, /Save draft/);
  assert.match(html, /data-flow-ai-action="apply-repair"/);
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
  assert.equal(runs[0].result.data.nodeCount, 1);
  assert.equal(runs[0].result.data.nodes[0].result.data.name, 'C');
  assert.equal(runs[0].rawResult, undefined);
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
  assert.equal(preview.clarification.needed, true);
  assert.equal(preview.clarification.reason, 'missing-slots');
  assert.match(renderFlowTestPanelToHTML({
    testMatch: preview.match,
    testMissingSlots: preview.missingSlots,
    testClarification: preview.clarification
  }), /Clarification required/);

  const filledPreview = await runner.preview('创建', {
    match: preview.match,
    slots: { name: '张三' }
  });

  assert.equal(filledPreview.ok, true);
  assert.equal(filledPreview.clarification.needed, false);
  assert.equal(filledPreview.plan.nodes[0].params.message, '张三');
});
