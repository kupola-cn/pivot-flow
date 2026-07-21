import test from 'node:test';
import assert from 'node:assert/strict';
import { ActionType, RiskLevel, createPivotRuntime } from '@kupola/pivot';
import {
  createFlow,
  clearCustomFlowNodeTypes,
  createAIFlowBuilderContext,
  createDefaultFlowWorkbenchNodeTypes,
  createAIFlowProvider,
  createAIFlowProviderMessages,
  createAIFlowProviderRequest,
  createAIFlowDraft,
  createCapabilityManifestSummary,
  createFlowFromTemplate,
  createFlowDesigner,
  FlowWorkbench,
  createHttpFlowStore,
  canConnectFlowNodes,
  createLocalIntentMapper,
  createMemoryFlowStore,
  createMemoryFlowSnapshotStore,
  createFlowRunner,
  createFlowRunHistorySummary,
  createFlowRunRecord,
  executeFlowGraph,
  createFlowAccessReport,
  createFlowApiContract,
  createFlowApprovalRequest,
  createFlowCanvasState,
  createFlowExportPayload,
  createFlowImportReport,
  createFlowChangeReport,
  createFlowEditSession,
  createFlowSnapshot,
  createPivotFlowApp,
  createVersionedFlowStore,
  createFlowPublishGate,
  createHybridIntentRouter,
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
  getFlowNodePorts,
  getNodeCapabilitySchema,
  getFlowRisk,
  getFlowRunSummary,
  getFlowNodeTypeDefinition,
  groupFlowTemplates,
  groupFlowCanvasNodes,
  groupFlows,
  generateAIFlowDraft,
  filterFlowRuns,
  hasPermission,
  listFlowNodeTypeDefinitions,
  normalizeFlowCanvasViewport,
  exportFlowToJSON,
  exportFlowsToJSON,
  importFlowsToStore,
  addFlowCanvasNode,
  applyApprovedPublish,
  connectFlowCanvasNodes,
  moveFlowCanvasNode,
  parseAIFlowProviderOutput,
  parseAIIntentRouterOutput,
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
  renderFlowSnapshotListToHTML,
  renderFlowAccessReportToHTML,
  renderFlowPermissionSimulationToHTML,
  renderFlowPublishGateToHTML,
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
  renderFlowWorkbenchToHTML,
  renderVariableMapperToHTML,
  restoreFlowSnapshot,
  recommendFlowCapabilities,
  reviewFlowApproval,
  renderAIFlowDraftPreviewToHTML,
  renderAIFlowBuilderPanelToHTML,
  renderAIFlowDraftReviewToHTML,
  parseFlowTestSlots,
  registerFlowNodeType,
  registerFlowFrontendCapabilities,
  renderNodePaletteToHTML,
  sanitizeFlowRunValue,
  simulateFlowPermissions,
  summarizeFlowRunResult,
  validateAIFlowDraft,
  validateFlowApiResponse,
  validateFlow,
  unregisterFlowNodeType
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

function createElementStub() {
  return {
    innerHTML: '',
    addEventListener() {},
    removeEventListener() {},
    contains() {
      return true;
    },
    querySelector() {
      return null;
    }
  };
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

test('gates publishing through approval safety and access checks', () => {
  const flow = createOrganizationFlow();
  const runtime = createPivotRuntime();
  runtime.registerCapability({
    name: 'org.create',
    resource: 'organization',
    action: ActionType.CREATE,
    risk: RiskLevel.MEDIUM,
    permissions: ['system:org:create'],
    execute: () => ({ ok: true })
  });
  const request = createFlowApprovalRequest(flow, {
    id: 'approval-1',
    requestedBy: 'admin'
  });
  const blocked = createFlowPublishGate(flow, runtime, {
    actor: { id: 'viewer', permissions: [] },
    approval: request
  });
  const approved = reviewFlowApproval(request, {
    action: 'approve',
    reviewedBy: 'owner'
  });
  const ready = createFlowPublishGate(flow, runtime, {
    actor: { id: 'admin', permissions: ['system:org:create'] },
    approval: approved
  });
  const published = applyApprovedPublish(flow, approved, {
    publishedAt: '2026-07-19T15:00:00.000Z'
  });
  const html = renderFlowPublishGateToHTML(ready);

  assert.equal(blocked.ok, false);
  assert.equal(blocked.blockingIssues.some((item) => item.includes('approval')), true);
  assert.equal(approved.status, 'approved');
  assert.equal(ready.ok, true);
  assert.equal(published.status, 'published');
  assert.equal(published.metadata.publishedByApproval, 'approval-1');
  assert.match(html, /Publish gate/);
  assert.throws(() => reviewFlowApproval(approved, { action: 'approve' }), /Only pending/);
});

test('routes intents through local matching before AI fallback', async () => {
  const flow = createOrganizationFlow();
  const aiFlow = createFlow({
    id: 'role-query',
    name: 'Query roles',
    status: 'published',
    intent: { keywords: ['角色'] }
  });
  const router = createHybridIntentRouter({
    aiProvider: () => ({ flowId: 'role-query', confidence: 0.9, slots: { keyword: '管理员' }, reason: 'role query' })
  });
  const local = await router.match('在集团下增加分机构 C', [flow, aiFlow]);
  const ai = await router.match('帮我看看管理员角色', [flow, aiFlow], { minConfidence: 0.99 });
  const parsed = parseAIIntentRouterOutput('{"flowId":"x","confidence":2,"slots":{},"reason":"ok"}');

  assert.equal(local.source, 'local');
  assert.equal(local.best.flow.id, 'org-create');
  assert.equal(ai.source, 'ai');
  assert.equal(ai.best.flow.id, 'role-query');
  assert.equal(parsed.confidence, 1);
});

test('edits canvas state with safe node movement and connections', () => {
  const flow = createFlow({
    id: 'canvas-edit',
    name: 'Canvas edit',
    nodes: [
      { id: 'a', type: 'message.show', label: 'A' },
      { id: 'b', type: 'message.show', label: 'B' }
    ],
    edges: []
  });
  const state = createFlowCanvasState(flow);
  const moved = moveFlowCanvasNode(state, 'a', { x: 20, y: 30 });
  const added = addFlowCanvasNode(flow, { id: 'c', type: 'message.show', label: 'C' }, { x: 40, y: 50 });
  const connected = connectFlowCanvasNodes(added.flow, 'a', 'b');
  const blocked = connectFlowCanvasNodes(connected.flow, 'a', 'b');

  assert.deepEqual(moved.positions.a, { x: 20, y: 30 });
  assert.equal(added.node.id, 'c');
  assert.equal(connected.ok, true);
  assert.equal(blocked.ok, false);
});

test('simulates role permissions and renders frontend hint results', () => {
  const flow = createOrganizationFlow();
  const runtime = createPivotRuntime();
  runtime.registerCapability({
    name: 'org.create',
    resource: 'organization',
    action: ActionType.CREATE,
    risk: RiskLevel.MEDIUM,
    permissions: ['system:org:create'],
    execute: () => ({ ok: true })
  });
  const simulation = simulateFlowPermissions(flow, runtime, [
    { id: 'admin', permissions: ['system:org:create'] },
    { id: 'viewer', permissions: [] }
  ]);
  const html = renderFlowPermissionSimulationToHTML(simulation);

  assert.equal(simulation.ok, false);
  assert.equal(simulation.allowedCount, 1);
  assert.equal(simulation.blockedCount, 1);
  assert.match(html, /Permission simulation/);
  assert.match(html, /system:org:create/);
});

test('defines and validates backend API contracts', () => {
  const contract = createFlowApiContract({ baseUrl: '/admin' });
  const ok = validateFlowApiResponse({ ok: true, data: [] }, { status: 200 });
  const warning = validateFlowApiResponse({ data: [] }, { status: 200 });
  const bad = validateFlowApiResponse('bad', { status: 299 });

  assert.equal(contract.endpoints.listFlows, '/admin/api/pivot-flows');
  assert.equal(ok.valid, true);
  assert.equal(warning.warnings.length, 1);
  assert.equal(bad.valid, false);
  assert.equal(bad.errors.some((item) => item.includes('object')), true);
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

test('versioned flow stores snapshot before lifecycle changes', async () => {
  const flow = createFlow({
    ...createOrganizationFlow(),
    status: 'draft'
  });
  const snapshotStore = createMemoryFlowSnapshotStore();
  const baseStore = createMemoryFlowStore([flow]);
  const store = createVersionedFlowStore(baseStore, {
    snapshotStore,
    createdBy: 'admin'
  });

  await store.update(flow.id, {
    name: 'Updated organization flow'
  });
  await store.publish(flow.id);

  const snapshots = await store.listSnapshots(flow.id);
  const updateSnapshot = snapshots.find((item) => item.reason === 'before:update');

  assert.equal(snapshots.length, 2);
  assert.equal(snapshots.some((item) => item.reason === 'before:publish'), true);
  assert.equal(Boolean(updateSnapshot), true);
  assert.equal(updateSnapshot.flow.name, 'Create branch organization');

  const restored = await store.restoreSnapshot(updateSnapshot.id, {
    restoredAt: '2026-07-19T13:00:00.000Z'
  });

  assert.equal(restored.status, 'draft');
  assert.equal(restored.publishedAt, null);
  assert.equal(restored.metadata.restoredFromSnapshot, updateSnapshot.id);
});

test('versioned flow stores can disable automatic snapshots for selected actions', async () => {
  const flow = createFlow({
    ...createOrganizationFlow(),
    status: 'draft'
  });
  const store = createVersionedFlowStore(createMemoryFlowStore([flow]), {
    snapshotBefore: ['publish']
  });

  await store.update(flow.id, { name: 'No update snapshot' });
  await store.publish(flow.id);

  const snapshots = await store.listSnapshots(flow.id);

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].reason, 'before:publish');
});

test('renders flow snapshot lists with restore actions', () => {
  const snapshot = createFlowSnapshot(createOrganizationFlow(), {
    id: 'snapshot-render',
    label: 'Before update',
    reason: 'manual',
    createdAt: '2026-07-19T14:00:00.000Z'
  });
  const html = renderFlowSnapshotListToHTML([snapshot], {
    canCreate: true,
    canRestore: true
  });
  const emptyHTML = renderFlowSnapshotListToHTML([]);

  assert.match(html, /flow-snapshot-list/);
  assert.match(html, /Before update/);
  assert.match(html, /data-flow-action="create-flow-snapshot"/);
  assert.match(html, /data-flow-action="restore-flow-snapshot"/);
  assert.match(html, /data-snapshot-id="snapshot-render"/);
  assert.match(emptyHTML, /No snapshots available/);
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

test('validates and stores canvas edge ports', () => {
  const flow = createFlow({
    id: 'port-connection-flow',
    name: 'Port connection flow',
    nodes: [
      { id: 'query-users', type: 'data.query', capability: 'users.query' },
      { id: 'select-user', type: 'human.select' }
    ],
    edges: []
  });

  const queryPorts = getFlowNodePorts(flow.nodes[0]);
  const valid = canConnectFlowNodes(flow, 'query-users', 'select-user', {
    sourcePort: 'output.records',
    targetPort: 'input.payload'
  });
  const invalid = canConnectFlowNodes(flow, 'query-users', 'select-user', {
    sourcePort: 'output.missing',
    targetPort: 'input.payload'
  });
  const connected = connectFlowCanvasNodes(flow, 'query-users', 'select-user', {
    sourcePort: 'output.records',
    targetPort: 'input.payload'
  });

  assert.equal(queryPorts.outputs.some((port) => port.id === 'output.records'), true);
  assert.equal(valid.ok, true);
  assert.equal(invalid.ok, false);
  assert.match(invalid.message, /Unknown source port/);
  assert.equal(connected.ok, true);
  assert.equal(connected.edge.sourcePort, 'output.records');
  assert.equal(connected.edge.targetPort, 'input.payload');
  assert.equal(validateFlow(connected.flow).valid, true);
  assert.equal(validateFlow(createFlow({
    id: 'bad-port-flow',
    name: 'Bad port flow',
    nodes: flow.nodes,
    edges: [
      { from: 'query-users', to: 'select-user', sourcePort: 'output.missing' }
    ]
  })).valid, false);
});

test('defines PLAN5 business flow node ports', () => {
  const getPorts = getFlowNodePorts({ type: 'data.get' });
  const aggregatePorts = getFlowNodePorts({ type: 'data.aggregate' });
  const mergePorts = getFlowNodePorts({ type: 'data.merge' });
  const switchPorts = getFlowNodePorts({ type: 'switch' });
  const humanInputPorts = getFlowNodePorts({ type: 'human.input' });
  const tableOutputPorts = getFlowNodePorts({ type: 'output.table' });

  assert.equal(getPorts.outputs.some((port) => port.id === 'output.notFound'), true);
  assert.equal(aggregatePorts.outputs.some((port) => port.id === 'output.result'), true);
  assert.equal(mergePorts.inputs.some((port) => port.id === 'input.left'), true);
  assert.equal(mergePorts.inputs.some((port) => port.id === 'input.right'), true);
  assert.equal(switchPorts.outputs.some((port) => port.id === 'output.default'), true);
  assert.equal(humanInputPorts.outputs.some((port) => port.id === 'output.value'), true);
  assert.equal(tableOutputPorts.inputs.some((port) => port.id === 'input.records'), true);

  const valid = validateFlow(createFlow({
    id: 'switch-flow',
    name: 'Switch flow',
    nodes: [
      { id: 'query', type: 'data.query', capability: 'records.query' },
      { id: 'branch', type: 'switch', condition: { path: 'data.status', cases: [{ equals: 'ok' }] } },
      { id: 'table', type: 'output.table' }
    ],
    edges: [
      { from: 'query', to: 'branch', sourcePort: 'output.records', targetPort: 'input.value' },
      { from: 'branch', to: 'table', sourcePort: 'output.default', targetPort: 'input.records' }
    ]
  }));
  const invalid = validateFlow(createFlow({
    id: 'bad-switch-flow',
    name: 'Bad switch flow',
    nodes: [{ id: 'branch', type: 'switch' }]
  }));

  assert.equal(valid.valid, true);
  assert.match(invalid.errors.join('\n'), /Switch node requires a condition object/);
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

test('provides an official query-user-by-name template for empty single and duplicate results', () => {
  const templates = listFlowTemplates({ group: 'user' });
  const flow = createFlowFromTemplate('user.query-by-name');
  const plan = flowToPlan(flow, {
    prompt: '查询张三的信息',
    slots: { name: '张三' }
  });

  assert.equal(templates.some((template) => template.id === 'user.query-by-name'), true);
  assert.equal(flow.metadata.templateId, 'user.query-by-name');
  assert.equal(flow.intent.examples.includes('查询张三的信息'), true);
  assert.equal(flow.nodes.find((node) => node.id === 'query-users').type, 'data.query');
  assert.equal(flow.nodes.find((node) => node.id === 'select-user').type, 'human.select');
  assert.equal(flow.nodes.find((node) => node.id === 'show-one').ui.renderer, 'detail');
  assert.equal(flow.nodes.find((node) => node.id === 'select-user').ui.renderer, 'table');
  assert.equal(flow.edges.some((edge) => edge.to === 'show-empty' && edge.condition.equals === 0), true);
  assert.equal(flow.edges.some((edge) => edge.to === 'show-one' && edge.condition.equals === 1), true);
  assert.equal(flow.edges.some((edge) => edge.to === 'select-user' && edge.condition.gt === 1), true);
  assert.equal(plan.nodes.find((node) => node.id === 'query-users').capability, 'user.query');
  assert.equal(plan.nodes.find((node) => node.id === 'select-user').capability, 'human.select');
  assert.equal(plan.nodes.find((node) => node.id === 'show-selected').capability, 'ui.display');
  assert.equal(plan.nodes.some((node) => node.id === 'return-result'), false);
  assert.equal(plan.nodes.find((node) => node.id === 'query-users').params.filters[0].value, '张三');
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
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const runs = [
    {
      id: 'run-1',
      flowId: 'org-create',
      prompt: '在集团下增加分机构 C',
      ok: true,
      timestamp: twoHoursAgo,
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
      timestamp: oneHourAgo,
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
      timestamp: twoDaysAgo,
      result: { ok: true, data: {} }
    }
  ];

  const filtered = filterFlowRuns(runs, { flowId: 'org-create', status: 'failed', keyword: '角色' });
  const recent = filterFlowRuns(runs, {
    dateRange: '24h',
    now: now.toISOString()
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

test('renders draggable palette nodes and clickable canvas ports', () => {
  const flow = createFlow({
    id: 'canvas-port-flow',
    name: 'Canvas port flow',
    nodes: [
      {
        id: 'query-users',
        type: 'data.query',
        label: 'Query users',
        ui: { position: { x: 24, y: 48 } }
      },
      { id: 'select-user', type: 'human.select', label: 'Select user' }
    ],
    edges: [
      {
        id: 'edge-1',
        from: 'query-users',
        to: 'select-user',
        sourcePort: 'output.records',
        targetPort: 'input.payload'
      }
    ]
  });
  const paletteHTML = renderNodePaletteToHTML();
  const canvasHTML = renderFlowCanvasToHTML(flow, {
    pendingConnection: { from: 'query-users', sourcePort: 'output.records' },
    connectionMessage: 'Cannot connect duplicate edge.'
  });
  const edgeEditorHTML = renderFlowEdgeEditorToHTML(flow, { selectedEdgeId: 'edge-1' });

  assert.match(paletteHTML, /draggable="true"/);
  assert.match(canvasHTML, /data-flow-canvas-dropzone="true"/);
  assert.match(canvasHTML, /data-flow-action="start-port-connection"/);
  assert.match(canvasHTML, /data-flow-action="finish-port-connection"/);
  assert.match(canvasHTML, /data-port-id="output\.records"/);
  assert.match(canvasHTML, /data-flow-node-x="24"/);
  assert.match(canvasHTML, /Connecting from query-users/);
  assert.match(canvasHTML, /Cannot connect duplicate edge/);
  assert.match(edgeEditorHTML, /data-flow-edge-field="sourcePort"/);
  assert.match(edgeEditorHTML, /data-flow-edge-field="targetPort"/);
  assert.match(edgeEditorHTML, /value="output\.records" selected/);
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

test('renders designer reset action when a flow has unsaved changes', () => {
  const flow = createFlow({
    id: 'dirty-flow',
    name: 'Dirty flow',
    nodes: [
      { id: 'message', type: 'message.show', label: 'Message' }
    ]
  });
  const cleanHTML = renderFlowDesignerToHTML(flow, {
    hasUnsavedChanges: false
  });
  const dirtyHTML = renderFlowDesignerToHTML(flow, {
    hasUnsavedChanges: true
  });

  assert.doesNotMatch(cleanHTML, /data-flow-action="reset-flow-edits"/);
  assert.match(dirtyHTML, /data-flow-action="reset-flow-edits"/);
  assert.match(dirtyHTML, /Reset edits/);
});

test('exports one-call UI app helpers from the main and UI entries', async () => {
  const ui = await import('../src/ui.js');
  const target = createElementStub();
  const designer = createFlowDesigner({
    target,
    flow: createFlow({
      id: 'designer-helper-flow',
      name: 'Designer helper flow',
      nodes: [
        { id: 'message', type: 'message.show', label: 'Message' }
      ]
    })
  });
  const workbenchTarget = createElementStub();
  const workbench = FlowWorkbench({
    target: workbenchTarget,
    flow: createFlow({
      id: 'workbench-helper-flow',
      name: 'Workbench helper flow',
      nodes: [
        { id: 'message', type: 'message.show', label: 'Message', ui: { position: { x: 80, y: 80 } } }
      ]
    }),
    nodeTypes: [
      { type: 'message.show', label: 'Message', description: 'Show a message.' }
    ],
    runtimeFactory: () => createPivotRuntime()
  });

  assert.equal(typeof createPivotFlowApp, 'function');
  assert.equal(typeof createFlowDesigner, 'function');
  assert.equal(typeof FlowWorkbench, 'function');
  assert.equal(typeof renderFlowWorkbenchToHTML, 'function');
  assert.equal(ui.createPivotFlowApp, createPivotFlowApp);
  assert.equal(ui.createFlowDesigner, createFlowDesigner);
  assert.equal(ui.FlowWorkbench, FlowWorkbench);
  assert.equal(ui.renderFlowWorkbenchToHTML, renderFlowWorkbenchToHTML);
  assert.match(target.innerHTML, /flow-designer/);
  assert.match(workbenchTarget.innerHTML, /flow-workbench/);
  const defaultWorkbenchHTML = renderFlowWorkbenchToHTML({
    flow: createFlow({
      id: 'default-workbench-flow',
      name: 'Default workbench flow',
      nodes: []
    }),
    selectedNodeId: '',
    prompt: '',
    resultHTML: '',
    logs: [],
    paletteOpen: true,
    resultOpen: false,
    pan: { x: 0, y: 0 },
    zoom: 1
  });
  assert.match(defaultWorkbenchHTML, /data-node-template="data\.query"/);
  assert.match(defaultWorkbenchHTML, /flow-workbench__palette-search-input/);
  assert.match(defaultWorkbenchHTML, /flow-workbench__palette-group-title/);
  assert.match(defaultWorkbenchHTML, /flow-workbench__palette-grid/);
  assert.match(defaultWorkbenchHTML, /flow-workbench__palette-item/);
  assert.match(defaultWorkbenchHTML, /data-flow-workbench-palette-description="Query records from a business resource\."/);
  assert.doesNotMatch(defaultWorkbenchHTML, /flow-workbench__palette-tooltip/);
  assert.match(defaultWorkbenchHTML, /flow-workbench__canvas-toolbar/);
  assert.match(defaultWorkbenchHTML, /flow-workbench__status-strip/);
  assert.match(defaultWorkbenchHTML, /Draft（Default workbench flow）/);
  assert.match(defaultWorkbenchHTML, /flow-workbench__status flow-workbench__status--ready/);
  assert.match(defaultWorkbenchHTML, /flow-workbench__status-dot/);
  assert.doesNotMatch(defaultWorkbenchHTML, /ds-badge ds-badge--success/);
  assert.match(defaultWorkbenchHTML, /flow-workbench__zoom-toolbar/);
  assert.match(defaultWorkbenchHTML, /flow-workbench__component-controls/);
  assert.match(defaultWorkbenchHTML, /flow-workbench__zoom-trigger/);
  assert.match(defaultWorkbenchHTML, /data-flow-workbench-action="toggle-zoom-menu"/);
  assert.match(defaultWorkbenchHTML, /data-flow-workbench-action="new-flow"/);
  assert.match(defaultWorkbenchHTML, /flow-workbench__button-icon--new/);
  assert.match(defaultWorkbenchHTML, /flow-workbench__button-icon--components/);
  assert.match(defaultWorkbenchHTML, /flow-workbench__button-icon--reset/);
  assert.match(defaultWorkbenchHTML, /flow-workbench__button-icon--preview/);
  assert.match(defaultWorkbenchHTML, /flow-workbench__button-icon--execute/);
  assert.match(defaultWorkbenchHTML, /flow-workbench__button-icon--result/);
  assert.doesNotMatch(defaultWorkbenchHTML, /data-flow-workbench-action="toggle-flow-list"/);
  assert.equal(defaultWorkbenchHTML.indexOf('flow-workbench__canvas-toolbar') < defaultWorkbenchHTML.indexOf('flow-workbench__zoom-toolbar'), true);
  assert.equal(defaultWorkbenchHTML.indexOf('data-flow-workbench-action="toggle-palette"') > defaultWorkbenchHTML.indexOf('flow-workbench__zoom-toolbar'), true);
  assert.equal(defaultWorkbenchHTML.indexOf('data-flow-workbench-action="toggle-palette"') < defaultWorkbenchHTML.indexOf('data-flow-workbench-action="zoom-out"'), true);
  const flowStoreWorkbenchHTML = renderFlowWorkbenchToHTML({
    flow: createFlow({
      id: 'store-workbench-flow',
      name: 'Store workbench flow',
      nodes: []
    }),
    selectedNodeId: '',
    prompt: '',
    resultHTML: '',
    logs: [],
    paletteOpen: false,
    resultOpen: false,
    flowListOpen: true,
    flowListItems: [
      createFlow({
        id: 'published-search-flow',
        name: 'Published search flow',
        description: 'Search a user by name.',
        status: 'published',
        nodes: [{ id: 'query-users', type: 'data.query', capability: 'user.query' }],
        edges: []
      }),
      createFlow({
        id: 'draft-message-flow',
        name: 'Draft message flow',
        status: 'draft',
        nodes: [{ id: 'show-message', type: 'message.show', capability: 'message.show' }],
        edges: []
      })
    ],
    flowListQuery: 'search',
    flowListStatus: 'published',
    pan: { x: 0, y: 0 },
    zoom: 1
  }, {
    flowStore: createMemoryFlowStore(),
    labels: {
      flows: 'Flows',
      save: 'Save',
      publish: 'Publish',
      refresh: 'Refresh'
    }
  });
  assert.match(flowStoreWorkbenchHTML, /data-flow-workbench-action="toggle-flow-list"/);
  assert.match(flowStoreWorkbenchHTML, /flow-workbench__button-icon--flows/);
  assert.match(flowStoreWorkbenchHTML, /flow-workbench__button-icon--save/);
  assert.match(flowStoreWorkbenchHTML, /flow-workbench__button-icon--publish/);
  assert.match(flowStoreWorkbenchHTML, /flow-workbench__flow-list-dialog/);
  assert.match(flowStoreWorkbenchHTML, /data-flow-workbench-flow-search/);
  assert.match(flowStoreWorkbenchHTML, /data-flow-workbench-flow-status/);
  assert.match(flowStoreWorkbenchHTML, /Published search flow/);
  assert.doesNotMatch(flowStoreWorkbenchHTML, /Draft message flow/);
  const openZoomWorkbenchHTML = renderFlowWorkbenchToHTML({
    flow: createFlow({
      id: 'open-zoom-workbench-flow',
      name: 'Open zoom workbench flow',
      nodes: []
    }),
    selectedNodeId: '',
    prompt: '',
    resultHTML: '',
    logs: [],
    paletteOpen: false,
    resultOpen: false,
    zoomMenuOpen: true,
    pan: { x: 0, y: 0 },
    zoom: 1.25
  });
  assert.match(openZoomWorkbenchHTML, /flow-workbench__zoom-options/);
  assert.match(openZoomWorkbenchHTML, /data-flow-workbench-action="set-zoom"/);
  assert.match(openZoomWorkbenchHTML, /aria-selected="true">125%/);
  const connectingStatusHTML = renderFlowWorkbenchToHTML({
    flow: createFlow({
      id: 'connecting-status-workbench-flow',
      name: 'Connecting status workbench flow',
      nodes: []
    }),
    selectedNodeId: '',
    prompt: '',
    resultHTML: '',
    logs: [],
    paletteOpen: false,
    resultOpen: false,
    connectionDraft: { from: 'source', point: { x: 0, y: 0 } },
    pan: { x: 0, y: 0 },
    zoom: 1
  });
  assert.match(connectingStatusHTML, /flow-workbench__status flow-workbench__status--connecting/);
  assert.match(connectingStatusHTML, />Connecting</);
  const filteredPaletteHTML = renderFlowWorkbenchToHTML({
    flow: createFlow({
      id: 'filtered-palette-workbench-flow',
      name: 'Filtered palette workbench flow',
      nodes: []
    }),
    selectedNodeId: '',
    prompt: '',
    resultHTML: '',
    logs: [],
    paletteOpen: true,
    paletteQuery: 'query',
    resultOpen: false,
    pan: { x: 0, y: 0 },
    zoom: 1
  });
  assert.match(filteredPaletteHTML, /data-node-template="data\.query"/);
  assert.doesNotMatch(filteredPaletteHTML, /data-node-template="data\.create"/);
  const zhPaletteHTML = renderFlowWorkbenchToHTML({
    flow: createFlow({
      id: 'zh-palette-workbench-flow',
      name: 'ZH palette workbench flow',
      nodes: []
    }),
    selectedNodeId: '',
    prompt: '',
    resultHTML: '',
    logs: [],
    paletteOpen: true,
    resultOpen: false,
    pan: { x: 0, y: 0 },
    zoom: 1
  }, { locale: 'zh-CN' });
  assert.match(zhPaletteHTML, /placeholder="搜索节点、插件、工作流"/);
  assert.match(zhPaletteHTML, />业务逻辑</);
  assert.match(zhPaletteHTML, />数据库</);
  const actionsOnlyHTML = renderFlowWorkbenchToHTML({
    flow: createFlow({
      id: 'actions-only-workbench-flow',
      name: 'Hidden header title',
      description: 'Hidden header description',
      nodes: []
    }),
    selectedNodeId: '',
    prompt: '',
    resultHTML: '',
    logs: [],
    paletteOpen: false,
    resultOpen: false,
    pan: { x: 0, y: 0 },
    zoom: 1
  }, { showHeaderText: false });
  assert.match(actionsOnlyHTML, /flow-workbench__topbar--actions-only/);
  assert.doesNotMatch(actionsOnlyHTML, /Hidden header title/);
  assert.doesNotMatch(actionsOnlyHTML, /Hidden header description/);
  const exclusivePanelHTML = renderFlowWorkbenchToHTML({
    flow: createFlow({
      id: 'exclusive-workbench-flow',
      name: 'Exclusive workbench flow',
      nodes: [
        { id: 'message', type: 'message.show', label: 'Message', ui: { position: { x: 80, y: 80 } } }
      ]
    }),
    selectedNodeId: 'message',
    prompt: '',
    resultHTML: '',
    logs: [],
    paletteOpen: true,
    resultOpen: false,
    pan: { x: 0, y: 0 },
    zoom: 1
  });
  assert.match(exclusivePanelHTML, /flow-workbench__inspector/);
  assert.doesNotMatch(exclusivePanelHTML, /flow-workbench__palette/);
  const portHTML = renderFlowWorkbenchToHTML({
    flow: createFlow({
      id: 'workbench-port-flow',
      name: 'Workbench port flow',
      nodes: [
        { id: 'query-users', type: 'data.query', capability: 'users.query', ui: { position: { x: 80, y: 80 } } }
      ]
    }),
    selectedNodeId: '',
    prompt: '',
    resultHTML: '',
    logs: [],
    paletteOpen: false,
    resultOpen: false,
    pan: { x: 0, y: 0 },
    zoom: 1
  });
  assert.match(portHTML, /data-port-id="input\.query"/);
  assert.match(portHTML, /data-port-id="output\.records"/);
  assert.match(portHTML, /flow-workbench__node-icon--query/);
  assert.match(portHTML, /data-flow-workbench-action="copy-node"/);
  assert.match(portHTML, /data-flow-workbench-action="remove-node-by-id"/);
  assert.match(portHTML, /data-flow-workbench-action="show-node-help"/);
  assert.match(portHTML, /flow-workbench__node-action--delete[\s\S]*?>[\s\S]*?<span class="flow-workbench__node-action-glyph" aria-hidden="true">x<\/span>/);
  assert.match(portHTML, /flow-workbench__node-action--help[\s\S]*?>[\s\S]*?<span class="flow-workbench__node-action-glyph" aria-hidden="true">\?<\/span>/);
  assert.doesNotMatch(portHTML, /flow-workbench__node-type/);
  const helpHTML = renderFlowWorkbenchToHTML({
    flow: createFlow({
      id: 'workbench-help-flow',
      name: 'Workbench help flow',
      nodes: [
        {
          id: 'query-users',
          type: 'data.query',
          label: 'Query users',
          capability: 'users.query',
          params: { filters: [{ field: 'name', operator: 'eq', value: '{{intent.name}}' }] },
          ui: { position: { x: 80, y: 80 } }
        }
      ]
    }),
    selectedNodeId: '',
    helpNodeId: 'query-users',
    prompt: '',
    resultHTML: '',
    logs: [],
    paletteOpen: false,
    resultOpen: false,
    pan: { x: 0, y: 0 },
    zoom: 1
  }, {
    nodeTypes: [
      { type: 'data.query', label: 'Query', description: 'Query records.' }
    ]
  });
  assert.match(helpHTML, /ds-modal-container/);
  assert.match(helpHTML, /ds-modal-mask is-visible/);
  assert.match(helpHTML, /Query records\./);

  designer.destroy();
  workbench.destroy();
  assert.equal(target.innerHTML, '');
  assert.equal(workbenchTarget.innerHTML, '');
});

test('provides generic workbench nodes for common flow patterns', () => {
  const zhNodes = createDefaultFlowWorkbenchNodeTypes({ locale: 'zh-CN' });
  const queryNode = zhNodes.find((node) => node.id === 'data.query');
  const updateNode = zhNodes.find((node) => node.id === 'data.update');
  const createNode = zhNodes.find((node) => node.id === 'data.create');
  const deleteNode = zhNodes.find((node) => node.id === 'data.delete');
  const getNode = zhNodes.find((node) => node.id === 'data.get');
  const aggregateNode = zhNodes.find((node) => node.id === 'data.aggregate');
  const humanInputNode = zhNodes.find((node) => node.id === 'human.input');
  const outputTableNode = zhNodes.find((node) => node.id === 'output.table');
  const outputDetailNode = zhNodes.find((node) => node.id === 'output.detail');
  const capabilityCallNode = zhNodes.find((node) => node.id === 'capability.call');
  const loopNode = zhNodes.find((node) => node.id === 'loop');
  const plan = flowToPlan(createFlow({
    id: 'generic-update-flow',
    name: 'Generic update flow',
    nodes: [
      {
        id: 'update-record',
        type: 'data.update',
        label: 'Update record',
        capability: 'record.update',
        params: { resource: 'records', where: { id: '{{intent.id}}' }, data: { name: '{{intent.name}}' } }
      }
    ]
  }), {
    slots: { id: 'r-1', name: 'Updated' }
  });

  assert.equal(updateNode?.label, '修改');
  assert.equal(queryNode?.capability || '', '');
  assert.equal(createNode?.capability || '', '');
  assert.equal(updateNode?.capability || '', '');
  assert.equal(deleteNode?.capability || '', '');
  assert.equal(getNode?.label, '获取');
  assert.equal(aggregateNode?.label, '聚合');
  assert.equal(humanInputNode?.label, '补充输入');
  assert.equal(outputTableNode?.label, '表格输出');
  assert.equal(outputDetailNode?.label, '详情输出');
  assert.equal(capabilityCallNode?.label, '能力调用');
  assert.equal(loopNode?.type, 'loop');
  assert.equal(plan.nodes[0].capability, 'record.update');
  assert.equal(plan.nodes[0].params.action, 'update');
  assert.equal(plan.nodes[0].params.where.id, 'r-1');
});

test('keeps business templates separate from generic workbench nodes', () => {
  const nodeTypes = [
    {
      id: 'his.user.query',
      type: 'data.query',
      group: 'template',
      label: '查询用户',
      nodeLabel: '查询用户表',
      description: 'Query HIS users by configured filters.',
      capability: 'user.query',
      params: { filters: [{ field: 'name', value: '{{intent.name}}' }], limit: 20 }
    },
    ...createDefaultFlowWorkbenchNodeTypes({ locale: 'zh-CN' })
  ];

  const genericQueryFlow = createFlow({
    id: 'generic-query-flow',
    name: 'Generic query flow',
    nodes: [
      {
        id: 'query-data',
        type: 'data.query',
        label: '查询数据',
        metadata: { templateId: 'data.query' },
        params: { resource: '', filters: [], limit: 20 }
      }
    ]
  });
  const paletteHTML = renderFlowWorkbenchToHTML({
    flow: genericQueryFlow,
    selectedNodeId: '',
    prompt: '',
    resultHTML: '',
    logs: [],
    paletteOpen: true,
    resultOpen: false,
    pan: { x: 0, y: 0 },
    zoom: 1
  }, {
    locale: 'zh-CN',
    nodeTypes
  });
  const inspectorHTML = renderFlowWorkbenchToHTML({
    flow: genericQueryFlow,
    selectedNodeId: 'query-data',
    helpNodeId: 'query-data',
    prompt: '',
    resultHTML: '',
    logs: [],
    paletteOpen: true,
    resultOpen: false,
    pan: { x: 0, y: 0 },
    zoom: 1
  }, {
    locale: 'zh-CN',
    nodeTypes
  });

  assert.match(paletteHTML, /业务模板/);
  assert.match(paletteHTML, /data-node-template="his\.user\.query"/);
  assert.match(inspectorHTML, /从业务资源查询记录/);
  assert.doesNotMatch(inspectorHTML, /Query HIS users by configured filters\.<\/p>/);
});

test('maps PLAN5 capability backed nodes to plan semantics', () => {
  const flow = createFlow({
    id: 'plan5-capability-backed-flow',
    name: 'PLAN5 capability backed flow',
    nodes: [
      {
        id: 'get-user',
        type: 'data.get',
        resource: 'users',
        capability: 'users.get',
        params: { key: { field: 'id', value: '{{intent.userId}}' } }
      },
      {
        id: 'aggregate-orders',
        type: 'data.aggregate',
        resource: 'orders',
        capability: 'orders.aggregate',
        params: { operation: 'count', filters: [{ field: 'userId', value: '{{intent.userId}}' }] }
      },
      {
        id: 'ask-keyword',
        type: 'human.input',
        params: { name: 'keyword', prompt: 'Enter keyword' }
      },
      {
        id: 'call-business',
        type: 'capability.call',
        capability: 'business.enrich',
        params: { userId: '{{intent.userId}}', keyword: '{{ask-keyword.data.value}}' }
      },
      {
        id: 'table-output',
        type: 'output.table',
        params: { data: '{{aggregate-orders.data.records}}' }
      }
    ],
    edges: [
      { from: 'get-user', to: 'aggregate-orders' },
      { from: 'aggregate-orders', to: 'ask-keyword' },
      { from: 'ask-keyword', to: 'call-business' },
      { from: 'call-business', to: 'table-output' }
    ]
  });
  const plan = flowToPlan(flow, { slots: { userId: 'u-1' } });
  const getPlanNode = plan.nodes.find((node) => node.id === 'get-user');
  const aggregatePlanNode = plan.nodes.find((node) => node.id === 'aggregate-orders');
  const humanInputPlanNode = plan.nodes.find((node) => node.id === 'ask-keyword');
  const callPlanNode = plan.nodes.find((node) => node.id === 'call-business');

  assert.equal(getPlanNode.capability, 'users.get');
  assert.equal(getPlanNode.params.action, 'get');
  assert.equal(getPlanNode.params.key.value, 'u-1');
  assert.equal(aggregatePlanNode.params.action, 'aggregate');
  assert.equal(humanInputPlanNode.capability, 'human.input');
  assert.equal(callPlanNode.capability, 'business.enrich');
  assert.equal(callPlanNode.params.keyword.$from, 'ask-keyword');
  assert.equal(plan.nodes.some((node) => node.id === 'table-output'), false);
  assert.equal(plan.edges.some((edge) => edge.to === 'table-output'), false);
});

test('workbench node title actions copy, remove, and open help', () => {
  let clickHandler = null;
  const target = {
    innerHTML: '',
    addEventListener(type, handler) {
      if (type === 'click') {
        clickHandler = handler;
      }
    },
    removeEventListener() {},
    contains() {
      return true;
    },
    querySelector() {
      return null;
    }
  };
  const workbench = FlowWorkbench({
    target,
    flow: createFlow({
      id: 'node-actions-flow',
      name: 'Node actions flow',
      nodes: [
        {
          id: 'query-users',
          type: 'data.query',
          label: 'Query users',
          capability: 'users.query',
          params: { limit: 20 },
          ui: { position: { x: 80, y: 80 } }
        },
        {
          id: 'show-users',
          type: 'ui.display',
          label: 'Show users',
          capability: 'ui.display',
          params: { renderer: 'table' },
          ui: { position: { x: 360, y: 80 } }
        }
      ],
      edges: [
        { id: 'edge:query-users:show-users', from: 'query-users', to: 'show-users' }
      ]
    }),
    nodeTypes: [
      { type: 'data.query', label: 'Query', description: 'Query records.' }
    ],
    runtimeFactory: () => createPivotRuntime()
  });
  const dispatchAction = (action, nodeId) => {
    const actionEl = {
      dataset: { flowWorkbenchAction: action, nodeId }
    };
    clickHandler({
      preventDefault() {},
      target: {
        closest(selector) {
          if (selector === 'button' || selector === '[data-flow-workbench-action]') {
            return actionEl;
          }
          return null;
        }
      }
    });
  };

  dispatchAction('copy-node', 'query-users');
  assert.equal(workbench.getFlow().nodes.length, 3);
  assert.deepEqual(workbench.getFlow().nodes.find((node) => node.id === 'query-users-copy')?.params, { limit: 20 });

  dispatchAction('show-node-help', 'query-users');
  assert.match(target.innerHTML, /ds-modal-container/);
  assert.match(target.innerHTML, /Query records\./);

  dispatchAction('remove-node-by-id', 'query-users');
  const flow = workbench.getFlow();
  assert.equal(flow.nodes.some((node) => node.id === 'query-users'), false);
  assert.equal(flow.edges.some((edge) => edge.from === 'query-users' || edge.to === 'query-users'), false);
  workbench.destroy();
});

test('workbench syncs inspector edits to node preview and measured edge ports', () => {
  let inputHandler = null;
  const edgesEl = { innerHTML: '' };
  const titleEl = { textContent: '' };
  const contentEl = { innerHTML: '' };
  const inputPortEl = { setAttribute() {} };
  const outputPortEl = { setAttribute() {} };
  const sourceNodeEl = {
    dataset: { nodeId: 'query-users' },
    offsetWidth: 238,
    offsetHeight: 160,
    querySelector(selector) {
      if (selector === '.flow-workbench__node-title-main strong') {
        return titleEl;
      }
      if (selector === '.flow-workbench__node-content') {
        return contentEl;
      }
      if (selector === '.flow-workbench__port--in') {
        return inputPortEl;
      }
      if (selector === '.flow-workbench__port--out') {
        return outputPortEl;
      }
      return null;
    }
  };
  const targetNodeEl = {
    dataset: { nodeId: 'show-users' },
    offsetWidth: 238,
    offsetHeight: 180,
    querySelector() {
      return null;
    }
  };
  const target = {
    innerHTML: '',
    addEventListener(type, handler) {
      if (type === 'input') {
        inputHandler = handler;
      }
    },
    removeEventListener() {},
    contains() {
      return true;
    },
    querySelector(selector) {
      return selector === '.flow-workbench__edges' ? edgesEl : null;
    },
    querySelectorAll(selector) {
      return selector === '.flow-workbench__node' ? [sourceNodeEl, targetNodeEl] : [];
    }
  };
  const workbench = FlowWorkbench({
    target,
    selectedNodeId: 'query-users',
    flow: createFlow({
      id: 'node-sync-flow',
      name: 'Node sync flow',
      nodes: [
        {
          id: 'query-users',
          type: 'data.query',
          label: 'Query users',
          capability: 'users.query',
          params: { limit: 20 },
          ui: { position: { x: 80, y: 80 } }
        },
        {
          id: 'show-users',
          type: 'ui.display',
          label: 'Show users',
          capability: 'ui.display',
          ui: { position: { x: 360, y: 120 } }
        }
      ],
      edges: [
        { id: 'edge:query-users:show-users', from: 'query-users', to: 'show-users' }
      ]
    }),
    runtimeFactory: () => createPivotRuntime()
  });

  assert.match(edgesEl.innerHTML, /M 318 160 C/);
  assert.match(edgesEl.innerHTML, /360 210"/);

  inputHandler({
    target: {
      dataset: { flowWorkbenchField: 'params' },
      value: '{"limit":5}'
    }
  });
  assert.match(contentEl.innerHTML, /limit=5/);

  inputHandler({
    target: {
      dataset: { flowWorkbenchField: 'label' },
      value: 'Find users'
    }
  });
  assert.equal(titleEl.textContent, 'Find users');
  workbench.destroy();
});

test('workbench renders schema-driven params form from capabilities', () => {
  const html = renderFlowWorkbenchToHTML({
    flow: createFlow({
      id: 'workbench-param-schema-flow',
      name: 'Workbench param schema flow',
      nodes: [
        {
          id: 'query-users',
          type: 'data.query',
          label: 'Query users',
          capability: 'users.query',
          params: { keyword: '张三', limit: 20, includeDisabled: false }
        }
      ],
      edges: []
    }),
    selectedNodeId: 'query-users',
    paletteOpen: false,
    flowListOpen: false,
    resultOpen: false,
    pan: { x: 0, y: 0 },
    zoom: 1,
    logs: []
  }, {
    locale: 'zh-CN',
    capabilities: [
      {
        name: 'users.query',
        title: '查询用户',
        resource: 'users',
        action: 'query',
        risk: 'low',
        paramsSchema: {
          keyword: { type: 'string', required: true },
          limit: { type: 'number' },
          includeDisabled: { type: 'boolean' }
        }
      },
      {
        name: 'users.create',
        title: '新增用户',
        resource: 'users',
        action: 'create',
        risk: 'medium'
      },
      {
        name: 'users.delete',
        title: '删除用户',
        resource: 'users',
        action: 'delete',
        risk: 'high'
      }
    ],
    labels: {
      paramForm: '参数表单'
    }
  });

  assert.match(html, /flow-workbench__param-form/);
  assert.match(html, /参数表单/);
  assert.match(html, /<select class="ds-select ds-select--sm" data-flow-workbench-field="capability">/);
  assert.match(html, /不绑定能力/);
  assert.match(html, /users\.query - 查询用户/);
  assert.doesNotMatch(html, /users\.create - 新增用户/);
  assert.doesNotMatch(html, /users\.delete - 删除用户/);
  assert.doesNotMatch(html, /资源:users · 动作:query · 风险:low/);
  assert.match(html, /data-flow-workbench-param-field="keyword"/);
  assert.match(html, /data-flow-workbench-param-field="limit"/);
  assert.match(html, /data-flow-workbench-param-field="includeDisabled"/);
  assert.match(html, /张三/);
});

test('workbench scopes capability controls by node type', () => {
  const capabilities = [
    { name: 'users.query', title: '查询用户', action: 'query' },
    { name: 'users.create', title: '新增用户', action: 'create' },
    { name: 'message.show', title: '显示消息', action: 'execute' }
  ];
  const fixedOutputHTML = renderFlowWorkbenchToHTML({
    flow: createFlow({
      id: 'fixed-output-capability-flow',
      name: 'Fixed output capability flow',
      nodes: [{ id: 'table-output', type: 'output.table', label: '表格输出' }],
      edges: []
    }),
    selectedNodeId: 'table-output',
    paletteOpen: false,
    resultOpen: false,
    pan: { x: 0, y: 0 },
    zoom: 1,
    logs: []
  }, {
    locale: 'zh-CN',
    capabilities
  });
  const hiddenCapabilityHTML = renderFlowWorkbenchToHTML({
    flow: createFlow({
      id: 'hidden-capability-flow',
      name: 'Hidden capability flow',
      nodes: [{ id: 'transform-data', type: 'transform', label: '转换数据' }],
      edges: []
    }),
    selectedNodeId: 'transform-data',
    paletteOpen: false,
    resultOpen: false,
    pan: { x: 0, y: 0 },
    zoom: 1,
    logs: []
  }, {
    locale: 'zh-CN',
    capabilities
  });
  const capabilityCallHTML = renderFlowWorkbenchToHTML({
    flow: createFlow({
      id: 'capability-call-flow',
      name: 'Capability call flow',
      nodes: [{ id: 'call-capability', type: 'capability.call', label: '能力调用' }],
      edges: []
    }),
    selectedNodeId: 'call-capability',
    paletteOpen: false,
    resultOpen: false,
    pan: { x: 0, y: 0 },
    zoom: 1,
    logs: []
  }, {
    locale: 'zh-CN',
    capabilities
  });

  assert.match(fixedOutputHTML, /value="output\.table" readonly/);
  assert.doesNotMatch(fixedOutputHTML, /data-flow-workbench-field="capability"/);
  assert.doesNotMatch(hiddenCapabilityHTML, /<span>Capability<\/span>|<span>能力标识<\/span>/);
  assert.match(capabilityCallHTML, /data-flow-workbench-field="capability"/);
  assert.match(capabilityCallHTML, /users\.query - 查询用户/);
  assert.match(capabilityCallHTML, /users\.create - 新增用户/);
  assert.match(capabilityCallHTML, /message\.show - 显示消息/);
});

test('workbench starts a new unnamed draft flow', async () => {
  let clickHandler = null;
  let newFlow = null;
  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => true;
  const target = {
    innerHTML: '',
    addEventListener(type, handler) {
      if (type === 'click') {
        clickHandler = handler;
      }
    },
    removeEventListener() {},
    contains() {
      return true;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };
  let workbench = null;
  try {
    workbench = FlowWorkbench({
      target,
      flow: createFlow({
        id: 'existing-flow',
        name: 'Existing flow',
        status: 'published',
        nodes: [{ id: 'query-users', type: 'data.query', capability: 'users.query' }],
        edges: []
      }),
      onNewFlow(flow) {
        newFlow = flow;
      }
    });

    await clickHandler({
      preventDefault() {},
      target: {
        closest(selector) {
          if (selector === 'button' || selector === '[data-flow-workbench-action]') {
            return { dataset: { flowWorkbenchAction: 'new-flow' } };
          }
          return null;
        }
      }
    });

    assert.equal(workbench.getFlow().status, 'draft');
    assert.equal(workbench.getFlow().name, '');
    assert.equal(workbench.getFlow().nodes.length, 0);
    assert.equal(newFlow.status, 'draft');
    assert.match(target.innerHTML, /Draft（Untitled）/);
  } finally {
    workbench?.destroy();
    globalThis.confirm = originalConfirm;
  }
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

test('renders schema-driven node inspector fields from capability and resource schemas', () => {
  const runtime = createPivotRuntime();
  runtime.registerCapability({
    name: 'users.query',
    resource: 'users',
    action: ActionType.QUERY,
    risk: RiskLevel.LOW,
    paramsSchema: {
      name: { type: 'string', label: 'Name', required: true, default: '{{intent.name}}' },
      limit: { type: 'number', default: 20 },
      mode: { type: 'string', options: ['exact', 'fuzzy'] },
      includeDisabled: { type: 'boolean', default: false },
      projection: { type: 'array' },
      options: { type: 'object' }
    },
    outputSchema: {
      records: { type: 'array', description: 'matched records' },
      total: { type: 'number' }
    },
    execute: () => ({ records: [], total: 0 })
  });

  const html = renderEditableNodeInspectorToHTML({
    id: 'query-users',
    type: 'data.query',
    label: 'Query users',
    resource: 'users',
    capability: 'users.query',
    params: {
      name: '{{intent.name}}',
      limit: 10,
      mode: 'fuzzy',
      filters: [
        { field: 'name', operator: 'contains', value: '{{intent.name}}' }
      ]
    }
  }, {
    runtime,
    resourceSchemas: {
      users: {
        fields: {
          id: { type: 'string', queryable: false },
          name: { type: 'string', label: 'User name' },
          age: { type: 'number', label: 'Age' }
        }
      }
    },
    variableSources: [
      { label: 'Intent name', reference: 'intent.name' }
    ]
  });

  assert.equal(getNodeCapabilitySchema({ type: 'data.query', capability: 'users.query' }, { runtime }).limit.type, 'number');
  assert.match(html, /data-flow-node-schema="params"/);
  assert.match(html, /data-flow-node-param-field="name"/);
  assert.match(html, /data-flow-node-param-type="number"/);
  assert.match(html, /type="checkbox" data-flow-node-param-field="includeDisabled"/);
  assert.match(html, /<select class="ds-select" data-flow-node-param-field="mode"/);
  assert.match(html, /<textarea class="ds-textarea" rows="4" data-flow-node-param-field="projection"/);
  assert.match(html, /data-flow-node-schema="query"/);
  assert.match(html, /data-flow-node-filter-field="field"/);
  assert.match(html, /value="name" selected>User name/);
  assert.match(html, /data-flow-node-filter-field="operator"/);
  assert.match(html, /value="contains" selected/);
  assert.match(html, /datalist id="flow-node-variable-options"/);
  assert.match(html, /value="\{\{intent\.name\}\}"/);
  assert.match(html, /Output schema/);
  assert.match(html, /matched records/);
});

test('renders PLAN5 built-in node schemas in the editable inspector', () => {
  const humanHtml = renderEditableNodeInspectorToHTML({
    id: 'ask-name',
    type: 'human.input',
    params: { name: 'name', prompt: '请输入姓名', required: true }
  });
  const loopHtml = renderEditableNodeInspectorToHTML({
    id: 'loop-patients',
    type: 'loop',
    control: {
      mode: 'forEach',
      source: '{{intent.patients}}',
      itemName: 'patient',
      maxItems: 10
    }
  });
  const loopDefinition = getFlowNodeTypeDefinition('loop');

  assert.equal(getNodeCapabilitySchema({ type: 'human.input' }).prompt.required, true);
  assert.equal(getNodeCapabilitySchema({ type: 'data.query' }).include.type, 'array');
  assert.equal(loopDefinition.controlSchema.maxItems.type, 'number');
  assert.match(humanHtml, /data-flow-node-schema="params"/);
  assert.match(humanHtml, /data-flow-node-param-field="prompt"/);
  assert.match(humanHtml, /data-flow-node-param-field="inputType"/);
  assert.match(loopHtml, /data-flow-node-schema="control"/);
  assert.match(loopHtml, /data-flow-node-control-field="source"/);
  assert.match(loopHtml, /data-flow-node-control-field="maxItems" data-flow-node-control-type="number"/);
  assert.doesNotMatch(loopHtml, /data-flow-node-param-field="maxItems"/);
});

test('renders an editable query filter row when a resource has no filters yet', () => {
  const html = renderEditableNodeInspectorToHTML({
    id: 'query-users',
    type: 'data.query',
    resource: 'users',
    capability: 'users.query',
    params: {}
  }, {
    resourceSchemas: {
      users: {
        fields: {
          name: { type: 'string', label: 'Name' }
        }
      }
    }
  });

  assert.match(html, /data-flow-node-schema="query"/);
  assert.match(html, /data-flow-node-filter-index="0"/);
  assert.doesNotMatch(html, /No filters configured/);
});

test('lets custom nodes reuse and extend the default schema inspector', () => {
  clearCustomFlowNodeTypes();

  try {
    registerFlowNodeType({
      type: 'demo.schema-node',
      label: 'Schema node',
      paramsSchema: {
        threshold: { type: 'number', default: 1 },
        enabled: { type: 'boolean', default: true }
      },
      outputSchema: {
        accepted: { type: 'boolean', required: true }
      },
      renderInspector({ defaultInspector }) {
        return defaultInspector().replace('Node inspector', 'Custom inspector');
      }
    });

    const html = renderEditableNodeInspectorToHTML({
      id: 'schema-node',
      type: 'demo.schema-node',
      params: {}
    });

    assert.match(html, /Custom inspector/);
    assert.match(html, /data-flow-node-param-field="threshold"/);
    assert.match(html, /data-flow-node-param-default="1"/);
    assert.match(html, /data-flow-node-param-field="enabled" data-flow-node-param-type="boolean"/);
    assert.match(html, /Output schema/);
    assert.match(html, /accepted/);
  } finally {
    clearCustomFlowNodeTypes();
  }
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

test('maps generic query, display, subflow, and output nodes to plan semantics', () => {
  const flow = createFlow({
    id: 'generic-node-flow',
    name: 'Generic node flow',
    status: 'draft',
    nodes: [
      {
        id: 'query-users',
        type: 'data.query',
        label: 'Query users',
        resource: 'users',
        capability: 'users.query',
        params: {
          filters: [
            { field: 'name', operator: 'eq', value: '{{intent.name}}' }
          ],
          limit: 20
        }
      },
      {
        id: 'select-user',
        type: 'human.select',
        params: {
          source: '{{query-users.data.records}}',
          valueField: 'id'
        }
      },
      {
        id: 'display-user',
        type: 'ui.display',
        params: {
          data: '{{select-user.data.record}}'
        }
      },
      {
        id: 'run-subflow',
        type: 'subflow.run',
        params: {
          flowId: 'user-detail-flow',
          version: 'latest-published',
          input: {
            userId: '{{select-user.data.record.id}}'
          }
        }
      },
      {
        id: 'return-output',
        type: 'output.return',
        params: {
          result: '{{run-subflow.data.result}}'
        }
      }
    ],
    edges: [
      { from: 'query-users', to: 'select-user', condition: { path: 'data.total', gt: 1 } },
      { from: 'select-user', to: 'display-user', condition: 'success' },
      { from: 'display-user', to: 'run-subflow', condition: 'success' }
    ]
  });

  const validation = validateFlow(flow);
  const plan = flowToPlan(flow, { slots: { name: 'Zhang San' } });
  const queryNode = plan.nodes.find((node) => node.id === 'query-users');
  const selectNode = plan.nodes.find((node) => node.id === 'select-user');
  const displayNode = plan.nodes.find((node) => node.id === 'display-user');
  const subflowNode = plan.nodes.find((node) => node.id === 'run-subflow');

  assert.equal(validation.valid, true);
  assert.equal(queryNode.capability, 'users.query');
  assert.equal(queryNode.params.resource, 'users');
  assert.equal(queryNode.params.filters[0].value, 'Zhang San');
  assert.equal(selectNode.capability, 'human.select');
  assert.equal(displayNode.capability, 'ui.display');
  assert.equal(subflowNode.capability, 'flow.subflow.run');
  assert.equal(subflowNode.params.flowId, 'user-detail-flow');
  assert.equal(subflowNode.params.input.userId.$from, 'select-user');
  assert.equal(plan.nodes.some((node) => node.id === 'return-output'), false);
  assert.equal(plan.edges[0].condition.gt, 1);
});

test('validates subflow nodes and structured edge conditions', () => {
  const flow = createFlow({
    id: 'invalid-subflow',
    name: 'Invalid subflow',
    status: 'draft',
    nodes: [
      { id: 'source', type: 'message.show', params: { message: 'start' } },
      { id: 'subflow', type: 'subflow.run', params: {} },
      { id: 'target', type: 'message.show', params: { message: 'done' } }
    ],
    edges: [
      { id: 'edge-bad', from: 'source', to: 'target', condition: { path: 'data.total', unknown: 1 } }
    ]
  });
  const validation = validateFlow(flow);

  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /Subflow node requires params\.flowId: subflow/);
  assert.match(validation.errors.join('\n'), /Unknown flow edge condition/);
});

test('validates subflow input and output schemas when definitions are provided', () => {
  const childFlow = {
    id: 'user-detail-flow',
    name: 'User detail flow',
    inputSchema: {
      userId: { type: 'string', required: true },
      includeOrders: { type: 'boolean' }
    },
    outputSchema: {
      result: { type: 'object' }
    }
  };
  const validFlow = createFlow({
    id: 'valid-subflow-contract',
    name: 'Valid subflow contract',
    status: 'draft',
    nodes: [
      {
        id: 'run-subflow',
        type: 'subflow.run',
        params: {
          flowId: 'user-detail-flow',
          input: {
            userId: '{{intent.userId}}',
            includeOrders: true
          }
        },
        outputSchema: {
          result: { type: 'object' }
        }
      }
    ]
  });
  const invalidFlow = createFlow({
    id: 'invalid-subflow-contract',
    name: 'Invalid subflow contract',
    status: 'draft',
    nodes: [
      {
        id: 'bad-subflow',
        type: 'subflow.run',
        params: {
          flowId: 'user-detail-flow',
          input: {
            includeOrders: 'yes'
          }
        },
        outputSchema: {
          result: { type: 'array' },
          missing: { type: 'string' }
        }
      },
      {
        id: 'missing-subflow',
        type: 'subflow.run',
        params: {
          flowId: 'missing-flow',
          input: { userId: 'u-1' }
        }
      }
    ]
  });
  const valid = validateFlow(validFlow, { subflows: [childFlow] });
  const invalid = validateFlow(invalidFlow, { subflows: [childFlow] });
  const errors = invalid.errors.join('\n');

  assert.equal(valid.valid, true);
  assert.equal(invalid.valid, false);
  assert.match(errors, /Subflow input missing required field userId: bad-subflow/);
  assert.match(errors, /Subflow input field includeOrders expected boolean: bad-subflow/);
  assert.match(errors, /Subflow output field result expected object but node declares array: bad-subflow/);
  assert.match(errors, /Subflow output field is not declared by child flow: missing on bad-subflow/);
  assert.match(errors, /Subflow definition was not found: missing-flow/);
});

test('validates data query filters and includes against resource schemas', () => {
  const validFlow = createFlow({
    id: 'valid-resource-schema-flow',
    name: 'Valid resource schema flow',
    status: 'draft',
    nodes: [
      {
        id: 'query-users',
        type: 'data.query',
        resource: 'users',
        capability: 'users.query',
        params: {
          filters: [{ field: 'name', operator: 'contains', value: '{{intent.name}}' }],
          include: ['role']
        }
      }
    ]
  });
  const invalidFlow = createFlow({
    id: 'invalid-resource-schema-flow',
    name: 'Invalid resource schema flow',
    status: 'draft',
    nodes: [
      {
        id: 'query-users',
        type: 'data.query',
        resource: 'users',
        capability: 'users.query',
        params: {
          filters: [{ field: 'unknownField', operator: 'eq', value: 'x' }],
          include: ['orders']
        }
      },
      {
        id: 'query-missing-resource',
        type: 'data.query',
        resource: 'missing',
        capability: 'missing.query',
        params: { include: [] }
      }
    ]
  });
  const resourceSchemas = {
    users: {
      fields: {
        id: { type: 'string' },
        name: { type: 'string' }
      },
      relations: {
        role: { resource: 'roles' }
      }
    }
  };
  const valid = validateFlow(validFlow, { resourceSchemas });
  const invalid = validateFlow(invalidFlow, { resourceSchemas });
  const errors = invalid.errors.join('\n');

  assert.equal(valid.valid, true);
  assert.equal(invalid.valid, false);
  assert.match(errors, /Query filter field is not declared by resource users: unknownField on query-users/);
  assert.match(errors, /Query include relation is not declared by resource users: orders on query-users/);
  assert.match(errors, /Resource schema was not found: missing on query-missing-resource/);
});

test('registers custom flow node types for validation, palette, and plan mapping', () => {
  clearCustomFlowNodeTypes();

  try {
    const definition = registerFlowNodeType({
      type: 'demo.custom',
      label: 'Demo custom',
      group: 'demo',
      description: 'Run a custom demo node.',
      inputSchema: {
        name: { type: 'string', required: true }
      },
      outputSchema: {
        ok: { type: 'boolean' }
      },
      validate(node) {
        return node.params?.name
          ? null
          : { errors: [`Custom node requires params.name: ${node.id}`] };
      },
      toPlanNode(node) {
        return {
          id: node.id,
          capability: 'demo.custom.run',
          params: node.params,
          metadata: {
            custom: true
          }
        };
      }
    });
    const flow = createFlow({
      id: 'custom-node-flow',
      name: 'Custom node flow',
      status: 'draft',
      nodes: [
        {
          id: 'custom',
          type: 'demo.custom',
          params: {
            name: '{{intent.name}}'
          }
        }
      ]
    });
    const validation = validateFlow(flow);
    const plan = flowToPlan(flow, { slots: { name: 'demo' } });
    const palette = renderNodePaletteToHTML();

    assert.equal(definition.type, 'demo.custom');
    assert.equal(getFlowNodeTypeDefinition('demo.custom').label, 'Demo custom');
    assert.equal(listFlowNodeTypeDefinitions().some((node) => node.type === 'demo.custom'), true);
    assert.equal(validation.valid, true);
    assert.equal(plan.nodes[0].capability, 'demo.custom.run');
    assert.equal(plan.nodes[0].params.name, 'demo');
    assert.equal(plan.nodes[0].metadata.customNodeType, 'demo.custom');
    assert.match(palette, /demo\.custom/);
    assert.equal(unregisterFlowNodeType('demo.custom'), true);
    assert.equal(getFlowNodeTypeDefinition('demo.custom'), null);
  } finally {
    clearCustomFlowNodeTypes();
  }
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
  const selectCapability = runtime.getCapability('human.select');
  const displayCapability = runtime.getCapability('ui.display');

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
  assert.deepEqual(selectCapability.paramsSchema.renderer.options, ['table', 'list', 'detail']);
  assert.equal(displayCapability.paramsSchema.data.required, true);
  assert.equal(displayCapability.paramsSchema.renderer.options.includes('detail'), true);

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

test('executes PLAN5 local data processing nodes and returns flow output', async () => {
  const runtime = createPivotRuntime();
  runtime.registerCapability({
    name: 'users.query',
    resource: 'users',
    action: ActionType.QUERY,
    risk: RiskLevel.LOW,
    paramsSchema: {},
    allowUnknownParams: true,
    permissions: [],
    execute: () => ({
      records: [
        { id: 'u-1', name: 'Zhang San', roleId: 'r-1', status: 'active' },
        { id: 'u-2', name: 'Li Si', roleId: 'r-2', status: 'inactive' },
        { id: 'u-1', name: 'Zhang San', roleId: 'r-1', status: 'active' }
      ]
    })
  });
  runtime.registerCapability({
    name: 'roles.query',
    resource: 'roles',
    action: ActionType.QUERY,
    risk: RiskLevel.LOW,
    paramsSchema: {},
    allowUnknownParams: true,
    permissions: [],
    execute: () => ({
      records: [
        { id: 'r-1', roleName: 'Doctor' },
        { id: 'r-2', roleName: 'Nurse' }
      ]
    })
  });

  const flow = createFlow({
    id: 'plan5-local-flow',
    name: 'PLAN5 local flow',
    status: 'published',
    intent: { examples: ['查询用户'], keywords: ['查询用户', '用户'] },
    nodes: [
      { id: 'query-users', type: 'data.query', capability: 'users.query' },
      { id: 'filter-active', type: 'data.filter', params: { source: '{{query-users.data.records}}', where: { field: 'status', operator: 'eq', value: 'active' } } },
      { id: 'query-roles', type: 'data.query', capability: 'roles.query' },
      { id: 'merge-role', type: 'data.merge', params: { left: '{{filter-active.data.records}}', right: '{{query-roles.data.records}}', leftKey: 'roleId', rightKey: 'id', rightAlias: 'role' } },
      { id: 'map-user', type: 'data.map', params: { source: '{{merge-role.data.records}}', mappings: { id: '{{item.id}}', name: '{{item.name}}', roleName: '{{item.role.roleName}}' } } },
      { id: 'dedupe-user', type: 'data.dedupe', params: { source: '{{map-user.data.records}}', keys: ['id'] } },
      { id: 'sort-user', type: 'data.sort', params: { source: '{{dedupe-user.data.records}}', by: ['name'], direction: 'asc' } },
      { id: 'pick-user', type: 'data.pick', params: { source: '{{sort-user.data.records}}', mode: 'first' } },
      { id: 'return-user', type: 'output.detail', params: { data: '{{pick-user.data.value}}', fields: ['name', 'roleName'] } }
    ],
    edges: [
      { from: 'query-users', to: 'filter-active' },
      { from: 'filter-active', to: 'query-roles' },
      { from: 'query-roles', to: 'merge-role' },
      { from: 'merge-role', to: 'map-user' },
      { from: 'map-user', to: 'dedupe-user' },
      { from: 'dedupe-user', to: 'sort-user' },
      { from: 'sort-user', to: 'pick-user' },
      { from: 'pick-user', to: 'return-user' }
    ]
  });
  const result = await executeFlowGraph(flow, {
    runtime,
    input: { prompt: '查询用户', slots: {} }
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.output.kind, 'detail');
  assert.equal(result.data.output.data.name, 'Zhang San');
  assert.equal(result.data.output.data.roleName, 'Doctor');
  assert.equal(result.data.nodes.find((item) => item.node.id === 'dedupe-user').result.data.count, 1);

  const runner = createFlowRunner({
    runtime,
    flowStore: createMemoryFlowStore([flow])
  });
  const execution = await runner.execute('查询用户');

  assert.equal(execution.ok, true);
  assert.equal(execution.result.data.output.kind, 'detail');
  assert.equal(execution.result.data.output.data.roleName, 'Doctor');
});

test('executes human input capability and controlled loop nodes', async () => {
  const runtime = createPivotRuntime();
  const prompts = [];
  registerFlowFrontendCapabilities(runtime, {
    requestInput: (params) => {
      prompts.push(params.prompt);
      return 'Zhang San';
    }
  });
  const humanFlow = createFlow({
    id: 'human-input-flow',
    name: 'Human input flow',
    status: 'published',
    nodes: [
      { id: 'ask-name', type: 'human.input', params: { name: 'name', prompt: '请输入姓名', inputType: 'text', required: true } },
      { id: 'return-name', type: 'output.result', params: { data: { name: '{{ask-name.data.value}}' } } }
    ],
    edges: [
      { from: 'ask-name', to: 'return-name' }
    ]
  });
  const loopFlow = createFlow({
    id: 'loop-flow',
    name: 'Loop flow',
    status: 'published',
    nodes: [
      {
        id: 'loop-patients',
        type: 'loop',
        control: {
          mode: 'forEach',
          source: '{{intent.patients}}',
          itemName: 'patient',
          maxItems: 2,
          collect: { id: '{{patient.id}}', label: '{{patient.name}}' }
        }
      },
      { id: 'return-patients', type: 'output.table', params: { data: '{{loop-patients.data.records}}' } }
    ],
    edges: [
      { from: 'loop-patients', to: 'return-patients' }
    ]
  });

  const humanResult = await executeFlowGraph(humanFlow, { runtime });
  const loopResult = await executeFlowGraph(loopFlow, {
    input: {
      slots: {
        patients: [
          { id: 'p-1', name: 'A' },
          { id: 'p-2', name: 'B' },
          { id: 'p-3', name: 'C' }
        ]
      }
    }
  });

  assert.deepEqual(prompts, ['请输入姓名']);
  assert.equal(humanResult.ok, true);
  assert.equal(humanResult.data.output.data.name, 'Zhang San');
  assert.equal(loopResult.ok, true);
  assert.equal(loopResult.data.output.kind, 'table');
  assert.deepEqual(loopResult.data.output.data, [
    { id: 'p-1', label: 'A' },
    { id: 'p-2', label: 'B' }
  ]);
  assert.equal(loopResult.data.nodes[0].result.data.truncated, true);
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
