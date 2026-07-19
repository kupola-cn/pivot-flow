import { createFlow, createFlowEdge, createFlowNode } from '../flow-schema.js';
import { createFlowFromTemplate, listFlowTemplates } from '../flow-templates.js';
import { flowToPlan } from '../flow-to-plan.js';
import { canConnectFlowNodes } from '../flow-validation.js';
import { createFlowRunner } from '../flow-runner.js';
import { createMemoryFlowStore } from '../flow-store.js';
import { createIntentClarificationPlan, createLocalIntentMapper } from '../intent-mapper.js';
import { createFlowBatchSafetyReport, createFlowSafetyReport, renderFlowBatchSafetyReportToHTML, renderFlowSafetyReportToHTML } from '../flow-safety-report.js';
import { renderFlowDataDependenciesToHTML } from '../flow-dependencies.js';
import { getDefaultCapabilityForNodeType } from '../node-types.js';
import { escapeAttr, escapeHTML, on, resolveTarget, setHTML } from './dom.js';
import { renderFlowAuditPanelToHTML } from './FlowAuditPanel.js';
import { renderFlowCapabilityMatrixToHTML } from './FlowCapabilityMatrix.js';
import { getFlowExecutionTrace, groupFlowCanvasNodes } from './FlowCanvas.js';
import { renderFlowDesignerToHTML } from './FlowDesigner.js';
import { filterFlows, renderFlowListToHTML } from './FlowList.js';
import { renderFlowPreviewToHTML } from './FlowPreview.js';
import { renderFlowRunPanelToHTML } from './FlowRunPanel.js';
import { parseFlowTestSlots } from './FlowTestPanel.js';
import { renderFlowTemplateListToHTML } from './FlowTemplateList.js';

export function FlowManager(options = {}) {
  const target = resolveTarget(options.target);
  const flowStore = options.flowStore ?? createMemoryFlowStore(options.flows ?? []);
  const templates = Array.isArray(options.templates) ? options.templates : listFlowTemplates();
  const intentMapper = options.intentMapper ?? createLocalIntentMapper();
  const runner = options.runtime
    ? createFlowRunner({
      runtime: options.runtime,
      flowStore,
      intentMapper,
      contextProvider: options.contextProvider
    })
    : null;
  const state = {
    flows: [],
    templates,
    selectedFlowId: '',
    selectedNodeId: '',
    selectedEdgeId: '',
    nodeKeyword: '',
    canvasGroupBy: '',
    collapsedCanvasGroups: [],
    listKeyword: '',
    listStatus: '',
    listRisk: '',
    listGroupBy: '',
    testPrompt: '',
    testSlotsText: '{}',
    testMatch: null,
    testMissingSlots: [],
    testClarification: null,
    preview: null,
    result: null,
    loading: false,
    error: ''
  };

  const refresh = async () => {
    state.loading = true;
    render();
    try {
      state.flows = await flowStore.list();
      state.selectedFlowId = state.selectedFlowId || state.flows[0]?.id || '';
      state.selectedEdgeId = state.selectedEdgeId || getSelectedFlow(state)?.edges?.[0]?.id || '';
      state.error = '';
    } catch (error) {
      state.error = error?.message || 'Failed to load flows.';
    } finally {
      state.loading = false;
      render();
    }
  };

  const render = () => {
    const flow = getSelectedFlow(state);
    const visibleFlows = filterFlows(state.flows, {
      keyword: state.listKeyword,
      status: state.listStatus,
      risk: state.listRisk
    });
    setHTML(target, [
      '<section class="flow-manager">',
      '<header class="flow-manager__header">',
      '<div>',
      '<h2>PIVOT Flow Manager</h2>',
      '<p>Manage intent-driven frontend business flows.</p>',
      '</div>',
      '<div class="flow-manager__actions">',
      '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-action="refresh">Refresh</button>',
      '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-action="create-flow">New flow</button>',
      '<button type="button" class="ds-btn ds-btn--brand ds-btn--sm" data-flow-action="create-sample">Sample flow</button>',
      '</div>',
      '</header>',
      state.error ? `<div class="flow-alert flow-alert--error">${escapeHTML(state.error)}</div>` : '',
      '<div class="flow-manager__grid">',
      '<aside class="flow-manager__sidebar">',
      renderFlowListFilters(state, visibleFlows.length),
      renderFlowListToHTML(state.flows, {
        activeId: state.selectedFlowId,
        keyword: state.listKeyword,
        status: state.listStatus,
        risk: state.listRisk,
        groupBy: state.listGroupBy,
        emptyText: 'No flows match the current filters.'
      }),
      renderFlowTemplateListToHTML(state.templates, { groupBy: 'group' }),
      '</aside>',
      '<main class="flow-manager__workspace">',
      renderFlowDesignerToHTML(flow, state),
      '</main>',
      '</div>',
      '<section class="flow-manager__runtime">',
      '<div>',
      '<div class="flow-panel-title">Preview</div>',
      renderFlowPreviewToHTML(state.preview),
      '</div>',
      '<div>',
      '<div class="flow-panel-title">Run result</div>',
      renderFlowRunPanelToHTML(state.result, { flow }),
      '</div>',
      '<div>',
      '<div class="flow-panel-title">Audit</div>',
      renderFlowAuditPanelToHTML(options.runtime?.getAuditEvents?.() ?? []),
      '</div>',
      '<div>',
      '<div class="flow-panel-title">Capabilities</div>',
      renderFlowCapabilityMatrixToHTML(flow, options.runtime),
      '</div>',
      '<div>',
      '<div class="flow-panel-title">Data dependencies</div>',
      renderFlowDataDependenciesToHTML(flow),
      '</div>',
      '<div>',
      '<div class="flow-panel-title">Publish safety</div>',
      renderFlowSafetyReportToHTML(flow, options.runtime),
      '</div>',
      '<div>',
      '<div class="flow-panel-title">Batch safety</div>',
      renderFlowBatchSafetyReportToHTML(visibleFlows, options.runtime),
      '</div>',
      '</section>',
      '</section>'
    ].join(''));
  };

  const previewSelected = async () => {
    const flow = getSelectedFlow(state);
    if (!flow || !options.runtime) {
      return;
    }

    const context = await resolveContext(options.contextProvider);
    const plan = flowToPlan(flow, options.input ?? { prompt: flow.name, slots: {} }, context);
    state.preview = await options.runtime.previewPlan(plan, context);
    state.result = null;
    render();
  };

  const executeSelected = async () => {
    const flow = getSelectedFlow(state);
    if (!flow || !options.runtime) {
      return;
    }

    const context = await resolveContext(options.contextProvider);
    const plan = flowToPlan(flow, options.input ?? { prompt: flow.name, slots: {} }, context);
    state.preview = await options.runtime.previewPlan(plan, context);
    if (state.preview.ok) {
      state.result = await options.runtime.executePlan(plan, context);
    } else {
      state.result = state.preview;
    }
    focusFirstFailedNode(state, flow, state.result);
    render();
  };

  const matchTestPrompt = async () => {
    const flow = getSelectedFlow(state);
    if (!flow) {
      state.error = 'Select a flow before testing.';
      render();
      return null;
    }

    const prompt = state.testPrompt || flow?.name || '';
    const matchResult = intentMapper.match(prompt, flow ? [flow] : [], { includeDraft: true });
    state.testMatch = matchResult.best;
    state.testMissingSlots = matchResult.best?.missingSlots ?? [];
    state.testClarification = createIntentClarificationPlan({
      ok: matchResult.ok,
      prompt,
      best: matchResult.best,
      matches: matchResult.matches ?? [],
      candidates: matchResult.matches ?? []
    });
    state.preview = null;
    state.result = null;
    state.error = matchResult.ok ? '' : 'Current flow did not match this prompt.';
    render();
    return matchResult.best;
  };

  const previewTestPrompt = async () => {
    if (!runner) {
      state.error = 'PIVOT runtime is required to test flows.';
      render();
      return null;
    }

    const slots = parseTestSlots();
    if (!slots) {
      render();
      return null;
    }

    const flow = getSelectedFlow(state);
    const matchEntry = state.testMatch ?? await matchTestPrompt();
    if (!matchEntry) {
      return null;
    }

    const previewResult = await runner.preview(state.testPrompt || flow?.name || '', {
      match: matchEntry,
      slots,
      matchOptions: { includeDraft: true }
    });
    state.testMatch = previewResult.match;
    state.testMissingSlots = previewResult.missingSlots ?? [];
    state.testClarification = previewResult.clarification ?? null;
    state.preview = previewResult.preview ?? null;
    state.result = null;
    state.error = previewResult.ok ? '' : previewResult.message;
    render();
    return previewResult;
  };

  const executeTestPrompt = async () => {
    if (!runner) {
      state.error = 'PIVOT runtime is required to test flows.';
      render();
      return null;
    }

    const slots = parseTestSlots();
    if (!slots) {
      render();
      return null;
    }

    const flow = getSelectedFlow(state);
    const matchEntry = state.testMatch ?? await matchTestPrompt();
    if (!matchEntry) {
      return null;
    }

    const execution = await runner.execute(state.testPrompt || flow?.name || '', {
      match: matchEntry,
      slots,
      matchOptions: { includeDraft: true }
    });
    state.testMatch = execution.match;
    state.testMissingSlots = execution.missingSlots ?? [];
    state.testClarification = execution.clarification ?? null;
    state.preview = execution.preview ?? null;
    state.result = execution.result ?? execution.preview ?? null;
    state.error = execution.ok ? '' : execution.message;
    focusFirstFailedNode(state, flow, state.result);
    render();
    return execution;
  };

  const parseTestSlots = () => {
    try {
      return parseFlowTestSlots(state.testSlotsText);
    } catch (error) {
      state.error = `Invalid test slots JSON: ${error.message}`;
      return null;
    }
  };

  const saveSelected = async () => {
    const flow = getSelectedFlow(state);
    if (!flow) {
      return null;
    }

    if (flow.status === 'published') {
      const safety = createFlowSafetyReport(flow, options.runtime);
      if (!safety.ok) {
        state.error = `Cannot save as published: ${safety.blockingIssues.join('; ')}`;
        render();
        return null;
      }
    }

    try {
      const saved = await flowStore.update(flow.id, flow);
      state.selectedFlowId = saved.id;
      state.error = '';
      await refresh();
      return saved;
    } catch (error) {
      state.error = error?.message || 'Failed to save flow.';
      render();
      return null;
    }
  };

  const publishSelected = async () => {
    const flow = getSelectedFlow(state);
    if (!flow) {
      return;
    }

    const safety = createFlowSafetyReport(flow, options.runtime);
    if (!safety.ok) {
      state.error = `Cannot publish unsafe flow: ${safety.blockingIssues.join('; ')}`;
      render();
      return;
    }

    const saved = await saveSelected();
    if (!saved) {
      return;
    }

    try {
      await flowStore.publish(saved.id);
      state.error = '';
      await refresh();
    } catch (error) {
      state.error = error?.message || 'Failed to publish flow.';
      render();
    }
  };

  const disableSelected = async () => {
    const flow = getSelectedFlow(state);
    if (!flow) {
      return;
    }

    try {
      await flowStore.disable(flow.id);
      state.error = '';
      await refresh();
    } catch (error) {
      state.error = error?.message || 'Failed to disable flow.';
      render();
    }
  };

  const publishFiltered = async () => {
    const flows = getVisibleFlows(state);
    if (flows.length === 0) {
      return;
    }

    const batchSafety = createFlowBatchSafetyReport(flows, options.runtime);
    if (!batchSafety.ok) {
      state.error = `Cannot publish filtered flows: ${batchSafety.summary} ${batchSafety.blockingIssues.slice(0, 5).join('; ')}`;
      render();
      return;
    }

    try {
      for (const flow of flows) {
        await flowStore.publish(flow.id);
      }
      state.error = '';
      await refresh();
    } catch (error) {
      state.error = error?.message || 'Failed to publish filtered flows.';
      render();
    }
  };

  const disableFiltered = async () => {
    const flows = getVisibleFlows(state);
    if (flows.length === 0) {
      return;
    }

    try {
      for (const flow of flows) {
        await flowStore.disable(flow.id);
      }
      state.error = '';
      await refresh();
    } catch (error) {
      state.error = error?.message || 'Failed to disable filtered flows.';
      render();
    }
  };

  const removeSelected = async () => {
    const flow = getSelectedFlow(state);
    if (!flow) {
      return;
    }

    if (typeof globalThis.confirm === 'function' && !globalThis.confirm(`Delete flow "${flow.name || flow.id}"?`)) {
      return;
    }

    try {
      await flowStore.remove(flow.id);
      state.selectedFlowId = '';
      state.selectedNodeId = '';
      state.selectedEdgeId = '';
      state.testMatch = null;
      state.testMissingSlots = [];
      state.preview = null;
      state.result = null;
      state.error = '';
      await refresh();
    } catch (error) {
      state.error = error?.message || 'Failed to delete flow.';
      render();
    }
  };

  const createBlankFlow = async () => {
    try {
      const flow = await flowStore.create(createFlow({
        name: 'Untitled flow',
        description: 'Describe when this flow should be used.',
        status: 'draft',
        intent: {
          examples: [],
          keywords: [],
          patterns: []
        },
        nodes: []
      }));
      state.selectedFlowId = flow.id;
      state.selectedNodeId = '';
      state.preview = null;
      state.result = null;
      state.error = '';
      await refresh();
    } catch (error) {
      state.error = error?.message || 'Failed to create flow.';
      render();
    }
  };

  const createTemplateFlow = async (templateId) => {
    const template = state.templates.find((item) => item.id === templateId);
    if (!template) {
      state.error = `Flow template was not found: ${templateId}`;
      render();
      return;
    }

    try {
      const flow = await flowStore.create(createFlowFromTemplate(template));
      state.selectedFlowId = flow.id;
      state.selectedNodeId = flow.nodes?.[0]?.id ?? '';
      state.selectedEdgeId = flow.edges?.[0]?.id ?? '';
      state.testPrompt = flow.intent?.examples?.[0] ?? flow.name ?? '';
      state.testSlotsText = '{}';
      state.testMatch = null;
      state.testMissingSlots = [];
      state.preview = null;
      state.result = null;
      state.error = '';
      await refresh();
    } catch (error) {
      state.error = error?.message || 'Failed to create flow from template.';
      render();
    }
  };

  const addNodeToSelected = (nodeType) => {
    const flow = getSelectedFlow(state);
    if (!flow || !nodeType) {
      return;
    }

    const node = createFlowNode({
      type: nodeType,
      label: nodeType,
      capability: getDefaultCapabilityForNodeType(nodeType),
      risk: 'low'
    });
    flow.nodes = [...(flow.nodes ?? []), node];
    state.selectedNodeId = node.id;
    state.selectedEdgeId = '';
    state.preview = null;
    state.result = null;
    render();
  };

  const removeSelectedNode = () => {
    const flow = getSelectedFlow(state);
    if (!flow || !state.selectedNodeId) {
      return;
    }

    flow.nodes = (flow.nodes ?? []).filter((node) => node.id !== state.selectedNodeId);
    flow.edges = (flow.edges ?? []).filter((edge) => edge.from !== state.selectedNodeId && edge.to !== state.selectedNodeId);
    state.selectedNodeId = flow.nodes?.[0]?.id ?? '';
    state.selectedEdgeId = flow.edges?.[0]?.id ?? '';
    state.preview = null;
    state.result = null;
    state.error = '';
    render();
  };

  const moveSelectedNode = (direction) => {
    const flow = getSelectedFlow(state);
    const nodes = flow?.nodes ?? [];
    const index = nodes.findIndex((node) => node.id === state.selectedNodeId);
    const nextIndex = direction === 'up' ? index - 1 : index + 1;

    if (index < 0 || nextIndex < 0 || nextIndex >= nodes.length) {
      return;
    }

    const nextNodes = [...nodes];
    const [node] = nextNodes.splice(index, 1);
    nextNodes.splice(nextIndex, 0, node);
    flow.nodes = nextNodes;
    state.preview = null;
    state.result = null;
    state.error = '';
    render();
  };

  const addEdgeToSelected = () => {
    const flow = getSelectedFlow(state);
    const nodes = flow?.nodes ?? [];
    if (!flow || nodes.length < 2) {
      state.error = 'At least two nodes are required to add an edge.';
      render();
      return;
    }

    const from = state.selectedNodeId && nodes.some((node) => node.id === state.selectedNodeId)
      ? state.selectedNodeId
      : nodes[0].id;
    const to = findConnectableTarget(flow, from);
    if (!to) {
      state.error = `No valid target node can be connected from ${from}.`;
      render();
      return;
    }
    const edge = createFlowEdge({ from, to, condition: 'success' });
    flow.edges = [...(flow.edges ?? []), edge];
    state.selectedEdgeId = edge.id;
    state.preview = null;
    state.result = null;
    state.error = '';
    render();
  };

  const removeSelectedEdge = () => {
    const flow = getSelectedFlow(state);
    if (!flow || !state.selectedEdgeId) {
      return;
    }

    flow.edges = (flow.edges ?? []).filter((edge) => edge.id !== state.selectedEdgeId);
    state.selectedEdgeId = flow.edges?.[0]?.id ?? '';
    state.preview = null;
    state.result = null;
    state.error = '';
    render();
  };

  const updateSelectedEdgeField = (field, value) => {
    const flow = getSelectedFlow(state);
    const edge = flow?.edges?.find((item) => item.id === state.selectedEdgeId);
    if (!edge || !field) {
      return;
    }

    if (field === 'from' || field === 'to') {
      const nextEdge = {
        ...edge,
        [field]: value
      };
      const connection = canConnectFlowNodes(flow, nextEdge.from, nextEdge.to, {
        edgeId: edge.id,
        condition: nextEdge.condition
      });
      if (!connection.ok) {
        state.error = connection.message;
        return;
      }
    }

    edge[field] = value;
    state.preview = null;
    state.result = null;
    state.error = '';
  };

  const updateSelectedField = (field, value) => {
    const flow = getSelectedFlow(state);
    if (!flow || !field) {
      return;
    }

    if (field === 'intent.examples' || field === 'intent.keywords' || field === 'intent.patterns') {
      const key = field.split('.')[1];
      flow.intent = {
        ...(flow.intent ?? {}),
        [key]: parseListInput(value)
      };
      state.error = '';
      return;
    }

    if (field === 'intent.slots') {
      try {
        const slots = value.trim() ? JSON.parse(value) : [];
        if (!Array.isArray(slots)) {
          throw new Error('Slots must be an array.');
        }
        flow.intent = {
          ...(flow.intent ?? {}),
          slots
        };
        state.error = '';
      } catch (error) {
        state.error = `Invalid intent slots JSON: ${error.message}`;
      }
      return;
    }

    flow[field] = value;
    state.error = '';
  };

  const updateSelectedNodeField = (field, value, inputType) => {
    const flow = getSelectedFlow(state);
    const node = flow?.nodes?.find((item) => item.id === state.selectedNodeId);
    if (!node || !field) {
      return;
    }

    if (field === 'params' || field === 'condition' || field === 'inputSchema' || field === 'outputSchema') {
      try {
        node[field] = value.trim() ? JSON.parse(value) : {};
        state.error = '';
      } catch (error) {
        state.error = `Invalid node ${field} JSON: ${error.message}`;
      }
      return;
    }

    if (inputType === 'checkbox') {
      node[field] = Boolean(value);
      state.error = '';
      return;
    }

    node[field] = value;
    state.error = '';
  };

  const insertVariableReference = (reference, paramKey) => {
    const flow = getSelectedFlow(state);
    const node = flow?.nodes?.find((item) => item.id === state.selectedNodeId);
    if (!node) {
      state.error = 'Select a node before inserting a variable reference.';
      render();
      return;
    }

    const key = createUniqueParamKey(node.params, paramKey || reference);
    node.params = {
      ...(isPlainObject(node.params) ? node.params : {}),
      [key]: `{{${reference}}}`
    };
    state.preview = null;
    state.result = null;
    state.error = '';
    render();
  };

  const cleanups = [
    on(target, 'click', '[data-flow-action="select"]', (e, el) => {
      state.selectedFlowId = el.dataset.flowId;
      state.selectedNodeId = '';
      state.selectedEdgeId = '';
      state.nodeKeyword = '';
      state.canvasGroupBy = '';
      state.collapsedCanvasGroups = [];
      state.testPrompt = getSelectedFlow(state)?.intent?.examples?.[0] ?? getSelectedFlow(state)?.name ?? '';
      state.testSlotsText = '{}';
      state.testMatch = null;
      state.testMissingSlots = [];
      state.preview = null;
      state.result = null;
      render();
    }),
    on(target, 'click', '[data-flow-action="select-node"]', (e, el) => {
      state.selectedNodeId = el.dataset.nodeId;
      render();
      scrollSelectedNodeIntoView(target, state.selectedNodeId);
    }),
    on(target, 'click', '[data-flow-action="select-edge"]', (e, el) => {
      state.selectedEdgeId = el.dataset.edgeId;
      render();
    }),
    on(target, 'click', '[data-flow-action="refresh"]', () => {
      refresh();
    }),
    on(target, 'click', '[data-flow-action="clear-flow-filters"]', () => {
      state.listKeyword = '';
      state.listStatus = '';
      state.listRisk = '';
      state.listGroupBy = '';
      render();
    }),
    on(target, 'click', '[data-flow-action="clear-node-search"]', () => {
      state.nodeKeyword = '';
      render();
    }),
    on(target, 'click', '[data-flow-action="toggle-canvas-group"]', (e, el) => {
      toggleCanvasGroup(state, el.dataset.canvasGroupKey);
      render();
    }),
    on(target, 'click', '[data-flow-action="collapse-canvas-groups"]', () => {
      const flow = getSelectedFlow(state);
      const groups = groupFlowCanvasNodes(flow?.nodes ?? [], state.canvasGroupBy);
      state.collapsedCanvasGroups = groups.groups.map((group) => group.key);
      render();
    }),
    on(target, 'click', '[data-flow-action="expand-canvas-groups"]', () => {
      state.collapsedCanvasGroups = [];
      render();
    }),
    on(target, 'click', '[data-flow-action="focus-failed-node"]', () => {
      const flow = getSelectedFlow(state);
      focusFirstFailedNode(state, flow, state.result ?? state.preview);
      render();
      scrollSelectedNodeIntoView(target, state.selectedNodeId);
    }),
    on(target, 'click', '[data-flow-action="preview"]', () => {
      previewSelected();
    }),
    on(target, 'click', '[data-flow-action="execute"]', () => {
      executeSelected();
    }),
    on(target, 'click', '[data-flow-action="test-match"]', () => {
      matchTestPrompt();
    }),
    on(target, 'click', '[data-flow-action="test-preview"]', () => {
      previewTestPrompt();
    }),
    on(target, 'click', '[data-flow-action="test-execute"]', () => {
      executeTestPrompt();
    }),
    on(target, 'click', '[data-flow-action="save-flow"]', () => {
      saveSelected();
    }),
    on(target, 'click', '[data-flow-action="publish-flow"]', () => {
      publishSelected();
    }),
    on(target, 'click', '[data-flow-action="disable-flow"]', () => {
      disableSelected();
    }),
    on(target, 'click', '[data-flow-action="publish-filtered-flows"]', () => {
      publishFiltered();
    }),
    on(target, 'click', '[data-flow-action="disable-filtered-flows"]', () => {
      disableFiltered();
    }),
    on(target, 'click', '[data-flow-action="remove-flow"]', () => {
      removeSelected();
    }),
    on(target, 'click', '[data-flow-action="create-flow"]', () => {
      createBlankFlow();
    }),
    on(target, 'click', '[data-flow-action="create-from-template"]', (e, el) => {
      createTemplateFlow(el.dataset.templateId);
    }),
    on(target, 'click', '[data-flow-action="add-node"]', (e, el) => {
      addNodeToSelected(el.dataset.nodeType);
    }),
    on(target, 'click', '[data-flow-action="remove-node"]', () => {
      removeSelectedNode();
    }),
    on(target, 'click', '[data-flow-action="move-node-up"]', () => {
      moveSelectedNode('up');
    }),
    on(target, 'click', '[data-flow-action="move-node-down"]', () => {
      moveSelectedNode('down');
    }),
    on(target, 'click', '[data-flow-action="insert-variable-reference"]', (e, el) => {
      insertVariableReference(el.dataset.flowReference, el.dataset.flowParamKey);
    }),
    on(target, 'click', '[data-flow-action="add-edge"]', () => {
      addEdgeToSelected();
    }),
    on(target, 'click', '[data-flow-action="remove-edge"]', () => {
      removeSelectedEdge();
    }),
    on(target, 'input', '[data-flow-field]', (e, el) => {
      updateSelectedField(el.dataset.flowField, e.target.value);
      state.preview = null;
      state.result = null;
    }),
    on(target, 'change', '[data-flow-field]', (e, el) => {
      updateSelectedField(el.dataset.flowField, e.target.value);
      state.preview = null;
      state.result = null;
    }),
    on(target, 'input', '[data-flow-node-field]', (e, el) => {
      updateSelectedNodeField(el.dataset.flowNodeField, e.target.value, e.target.type);
      state.preview = null;
      state.result = null;
    }),
    on(target, 'change', '[data-flow-node-field]', (e, el) => {
      updateSelectedNodeField(
        el.dataset.flowNodeField,
        e.target.type === 'checkbox' ? e.target.checked : e.target.value,
        e.target.type
      );
      state.preview = null;
      state.result = null;
      render();
    }),
    on(target, 'change', '[data-flow-edge-field]', (e, el) => {
      updateSelectedEdgeField(el.dataset.flowEdgeField, e.target.value);
      render();
    }),
    on(target, 'input', '[data-flow-test-field]', (e, el) => {
      if (el.dataset.flowTestField === 'prompt') {
        state.testPrompt = e.target.value;
        state.testMatch = null;
        state.testMissingSlots = [];
      }
      if (el.dataset.flowTestField === 'slots') {
        state.testSlotsText = e.target.value;
      }
      state.preview = null;
      state.result = null;
      state.error = '';
    }),
    on(target, 'input', '[data-flow-list-filter]', (e, el) => {
      if (el.dataset.flowListFilter === 'keyword') {
        state.listKeyword = e.target.value;
        render();
      }
    }),
    on(target, 'input', '[data-flow-canvas-field]', (e, el) => {
      if (el.dataset.flowCanvasField === 'nodeKeyword') {
        state.nodeKeyword = e.target.value;
        render();
      }
    }),
    on(target, 'change', '[data-flow-canvas-field]', (e, el) => {
      if (el.dataset.flowCanvasField === 'selectedNodeId') {
        state.selectedNodeId = e.target.value;
        render();
        scrollSelectedNodeIntoView(target, state.selectedNodeId);
      }
      if (el.dataset.flowCanvasField === 'canvasGroupBy') {
        state.canvasGroupBy = e.target.value;
        state.collapsedCanvasGroups = [];
        render();
      }
    }),
    on(target, 'change', '[data-flow-list-filter]', (e, el) => {
      if (el.dataset.flowListFilter === 'status') {
        state.listStatus = e.target.value;
        render();
      }
      if (el.dataset.flowListFilter === 'risk') {
        state.listRisk = e.target.value;
        render();
      }
      if (el.dataset.flowListFilter === 'groupBy') {
        state.listGroupBy = e.target.value;
        render();
      }
    }),
    on(target, 'click', '[data-flow-action="create-sample"]', async () => {
      const sample = await flowStore.create(createSampleFlow());
      state.selectedFlowId = sample.id;
      state.selectedNodeId = sample.nodes?.[0]?.id ?? '';
      state.selectedEdgeId = sample.edges?.[0]?.id ?? '';
      state.testPrompt = sample.intent?.examples?.[0] ?? sample.name ?? '';
      state.testSlotsText = '{}';
      state.testMatch = null;
      state.testMissingSlots = [];
      state.preview = null;
      state.result = null;
      state.canvasGroupBy = '';
      state.collapsedCanvasGroups = [];
      await refresh();
    })
  ];

  refresh();

  return {
    element: target,
    refresh,
    destroy() {
      cleanups.forEach((cleanup) => cleanup());
      target.innerHTML = '';
    }
  };
}

function toggleCanvasGroup(state, key) {
  const groupKey = String(key || '');
  if (!groupKey) {
    return;
  }
  const current = new Set(Array.isArray(state.collapsedCanvasGroups) ? state.collapsedCanvasGroups : []);
  if (current.has(groupKey)) {
    current.delete(groupKey);
  } else {
    current.add(groupKey);
  }
  state.collapsedCanvasGroups = Array.from(current);
}

function parseListInput(value) {
  return String(value ?? '')
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function renderFlowListFilters(state, visibleCount) {
  const statuses = ['', 'published', 'draft', 'disabled', 'archived'];
  const risks = ['', 'critical', 'high', 'medium', 'low'];
  const groupOptions = [
    ['', 'No grouping'],
    ['status', 'Group by status'],
    ['risk', 'Group by risk']
  ];
  return [
    '<div class="flow-list-filters">',
    '<div class="flow-list-filters__meta">',
    '<strong>Flows</strong>',
    `<span>${escapeHTML(visibleCount)} / ${escapeHTML(state.flows.length)}</span>`,
    '</div>',
    '<input class="ds-input ds-input--sm" type="search" placeholder="Search flows" ',
    `value="${escapeAttr(state.listKeyword)}" data-flow-list-filter="keyword">`,
    '<select class="ds-select ds-select--sm" data-flow-list-filter="status">',
    ...statuses.map((status) => [
      `<option value="${escapeAttr(status)}"${state.listStatus === status ? ' selected' : ''}>`,
      escapeHTML(status || 'All statuses'),
      '</option>'
    ].join('')),
    '</select>',
    '<div class="flow-list-filters__row">',
    '<select class="ds-select ds-select--sm" data-flow-list-filter="risk">',
    ...risks.map((risk) => [
      `<option value="${escapeAttr(risk)}"${state.listRisk === risk ? ' selected' : ''}>`,
      escapeHTML(risk || 'All risks'),
      '</option>'
    ].join('')),
    '</select>',
    '<select class="ds-select ds-select--sm" data-flow-list-filter="groupBy">',
    ...groupOptions.map(([value, label]) => [
      `<option value="${escapeAttr(value)}"${state.listGroupBy === value ? ' selected' : ''}>`,
      escapeHTML(label),
      '</option>'
    ].join('')),
    '</select>',
    '</div>',
    state.listKeyword || state.listStatus || state.listRisk || state.listGroupBy
      ? '<button type="button" class="ds-btn ds-btn--tertiary ds-btn--sm" data-flow-action="clear-flow-filters">Clear filters</button>'
      : '',
    visibleCount > 0
      ? [
        '<div class="flow-list-filters__bulk">',
        '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-action="publish-filtered-flows">Publish filtered</button>',
        '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-action="disable-filtered-flows">Disable filtered</button>',
        '</div>'
      ].join('')
      : '',
    '</div>'
  ].join('');
}

function getSelectedFlow(state) {
  return state.flows.find((flow) => flow.id === state.selectedFlowId) ?? state.flows[0] ?? null;
}

function getVisibleFlows(state) {
  return filterFlows(state.flows, {
    keyword: state.listKeyword,
    status: state.listStatus,
    risk: state.listRisk
  });
}

function focusFirstFailedNode(state, flow, result) {
  const trace = getFlowExecutionTrace(result, flow?.nodes ?? [], flow?.edges ?? []);
  if (trace.firstFailedNodeId) {
    state.selectedNodeId = trace.firstFailedNodeId;
  }
}

function findConnectableTarget(flow, from) {
  for (const node of flow?.nodes ?? []) {
    const connection = canConnectFlowNodes(flow, from, node.id);
    if (connection.ok) {
      return node.id;
    }
  }
  return '';
}

function scrollSelectedNodeIntoView(target, nodeId) {
  if (!nodeId || typeof target.querySelector !== 'function') {
    return;
  }

  const run = () => {
    const node = target.querySelector(`[data-node-id="${cssEscape(nodeId)}"]`);
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  };

  if (typeof globalThis.queueMicrotask === 'function') {
    globalThis.queueMicrotask(run);
  } else {
    globalThis.setTimeout?.(run, 0);
  }
}

function cssEscape(value) {
  if (globalThis.CSS && typeof globalThis.CSS.escape === 'function') {
    return globalThis.CSS.escape(value);
  }

  return String(value).replace(/["\\]/g, '\\$&');
}

function createUniqueParamKey(params, seed) {
  const base = createParamKey(seed);
  const existing = isPlainObject(params) ? params : {};
  if (!Object.hasOwn(existing, base)) {
    return base;
  }

  let index = 2;
  while (Object.hasOwn(existing, `${base}${index}`)) {
    index += 1;
  }
  return `${base}${index}`;
}

function createParamKey(value) {
  const text = String(value || 'value')
    .replace(/\{\{|\}\}/g, '')
    .replace(/^intent\./, '')
    .replace(/^context\./, '');
  const parts = text.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length === 0) {
    return 'value';
  }
  const [first, ...rest] = parts;
  return [
    first.charAt(0).toLowerCase() + first.slice(1),
    ...rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  ].join('');
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

async function resolveContext(contextProvider) {
  if (typeof contextProvider === 'function') {
    return await contextProvider();
  }
  return {};
}

function createSampleFlow() {
  return createFlow({
    id: `sample-org-create-${Date.now()}`,
    name: 'Create branch organization',
    description: 'Create a child organization under a parent organization.',
    status: 'draft',
    intent: {
      examples: ['在集团下增加分机构 C'],
      keywords: ['增加', '分机构', '集团'],
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
