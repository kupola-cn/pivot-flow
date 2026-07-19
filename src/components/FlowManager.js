import { createFlow, createFlowEdge, createFlowNode } from '../flow-schema.js';
import { createFlowFromTemplate, listFlowTemplates } from '../flow-templates.js';
import { flowToPlan } from '../flow-to-plan.js';
import { createMemoryFlowStore } from '../flow-store.js';
import { validateFlow } from '../flow-validation.js';
import { getDefaultCapabilityForNodeType } from '../node-types.js';
import { escapeHTML, on, resolveTarget, setHTML } from './dom.js';
import { renderFlowAuditPanelToHTML } from './FlowAuditPanel.js';
import { renderFlowDesignerToHTML } from './FlowDesigner.js';
import { renderFlowListToHTML } from './FlowList.js';
import { renderFlowPreviewToHTML } from './FlowPreview.js';
import { renderFlowRunPanelToHTML } from './FlowRunPanel.js';
import { renderFlowTemplateListToHTML } from './FlowTemplateList.js';

export function FlowManager(options = {}) {
  const target = resolveTarget(options.target);
  const flowStore = options.flowStore ?? createMemoryFlowStore(options.flows ?? []);
  const templates = Array.isArray(options.templates) ? options.templates : listFlowTemplates();
  const state = {
    flows: [],
    templates,
    selectedFlowId: '',
    selectedNodeId: '',
    selectedEdgeId: '',
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
      renderFlowListToHTML(state.flows, { activeId: state.selectedFlowId }),
      renderFlowTemplateListToHTML(state.templates),
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
      renderFlowRunPanelToHTML(state.result),
      '</div>',
      '<div>',
      '<div class="flow-panel-title">Audit</div>',
      renderFlowAuditPanelToHTML(options.runtime?.getAuditEvents?.() ?? []),
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
    render();
  };

  const saveSelected = async () => {
    const flow = getSelectedFlow(state);
    if (!flow) {
      return null;
    }

    if (flow.status === 'published') {
      const validation = validateFlow(flow);
      if (!validation.valid) {
        state.error = `Cannot save as published: ${validation.errors.join('; ')}`;
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

    const validation = validateFlow(flow);
    if (!validation.valid) {
      state.error = `Cannot publish invalid flow: ${validation.errors.join('; ')}`;
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
    const to = nodes.find((node) => node.id !== from)?.id ?? nodes[1].id;
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

    if (field === 'params') {
      try {
        node.params = value.trim() ? JSON.parse(value) : {};
        state.error = '';
      } catch (error) {
        state.error = `Invalid node params JSON: ${error.message}`;
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

  const cleanups = [
    on(target, 'click', '[data-flow-action="select"]', (e, el) => {
      state.selectedFlowId = el.dataset.flowId;
      state.selectedNodeId = '';
      state.selectedEdgeId = '';
      state.preview = null;
      state.result = null;
      render();
    }),
    on(target, 'click', '[data-flow-action="select-node"]', (e, el) => {
      state.selectedNodeId = el.dataset.nodeId;
      render();
    }),
    on(target, 'click', '[data-flow-action="select-edge"]', (e, el) => {
      state.selectedEdgeId = el.dataset.edgeId;
      render();
    }),
    on(target, 'click', '[data-flow-action="refresh"]', () => {
      refresh();
    }),
    on(target, 'click', '[data-flow-action="preview"]', () => {
      previewSelected();
    }),
    on(target, 'click', '[data-flow-action="execute"]', () => {
      executeSelected();
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
    on(target, 'click', '[data-flow-action="create-sample"]', async () => {
      const sample = await flowStore.create(createSampleFlow());
      state.selectedFlowId = sample.id;
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

function parseListInput(value) {
  return String(value ?? '')
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getSelectedFlow(state) {
  return state.flows.find((flow) => flow.id === state.selectedFlowId) ?? state.flows[0] ?? null;
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
