import { createFlow } from '../flow-schema.js';
import { flowToPlan } from '../flow-to-plan.js';
import { createMemoryFlowStore } from '../flow-store.js';
import { escapeHTML, on, resolveTarget, setHTML } from './dom.js';
import { renderFlowAuditPanelToHTML } from './FlowAuditPanel.js';
import { renderFlowDesignerToHTML } from './FlowDesigner.js';
import { renderFlowListToHTML } from './FlowList.js';
import { renderFlowPreviewToHTML } from './FlowPreview.js';
import { renderFlowRunPanelToHTML } from './FlowRunPanel.js';

export function FlowManager(options = {}) {
  const target = resolveTarget(options.target);
  const flowStore = options.flowStore ?? createMemoryFlowStore(options.flows ?? []);
  const state = {
    flows: [],
    selectedFlowId: '',
    selectedNodeId: '',
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
      '<button type="button" class="ds-btn ds-btn--brand ds-btn--sm" data-flow-action="create-sample">Sample flow</button>',
      '</div>',
      '</header>',
      state.error ? `<div class="flow-alert flow-alert--error">${escapeHTML(state.error)}</div>` : '',
      '<div class="flow-manager__grid">',
      '<aside class="flow-manager__sidebar">',
      renderFlowListToHTML(state.flows, { activeId: state.selectedFlowId }),
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

  const cleanups = [
    on(target, 'click', '[data-flow-action="select"]', (e, el) => {
      state.selectedFlowId = el.dataset.flowId;
      state.selectedNodeId = '';
      state.preview = null;
      state.result = null;
      render();
    }),
    on(target, 'click', '[data-flow-action="select-node"]', (e, el) => {
      state.selectedNodeId = el.dataset.nodeId;
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
