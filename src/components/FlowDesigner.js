import { flowToPlan } from '../flow-to-plan.js';
import { validateFlow } from '../flow-validation.js';
import { FLOW_RISK_LEVELS, FLOW_STATUS } from '../node-types.js';
import { escapeAttr, escapeHTML, on, resolveTarget, setHTML } from './dom.js';
import { getFlowExecutionTrace, getFlowNodeMatches, groupFlowCanvasNodes, normalizeFlowCanvasViewport, renderFlowCanvasToHTML } from './FlowCanvas.js';
import { renderIntentPatternEditorToHTML } from './IntentPatternEditor.js';
import { renderNodeInspectorToHTML } from './NodeInspector.js';
import { renderNodePaletteToHTML } from './NodePalette.js';
import { renderFlowTestPanelToHTML } from './FlowTestPanel.js';
import { renderVariableMapperToHTML } from './VariableMapper.js';

export function renderFlowDesignerToHTML(flow, state = {}) {
  if (!flow) {
    return '<div class="flow-empty">Select a flow to open the designer.</div>';
  }

  const selectedNode = getSelectedNode(flow, state.selectedNodeId);
  const validation = validateFlow(flow);
  const nodeMatches = getFlowNodeMatches(flow.nodes ?? [], state.nodeKeyword);

  return [
    '<section class="flow-designer">',
    '<aside class="flow-designer__palette">',
    renderNodePaletteToHTML(),
    '</aside>',
    '<main class="flow-designer__main">',
    '<div class="flow-designer__toolbar">',
    '<div>',
    `<div class="flow-panel-title">${escapeHTML(flow.name)}</div>`,
    `<div class="flow-muted">${escapeHTML(flow.description || flow.id)}</div>`,
    '</div>',
    '<div class="flow-designer__actions">',
    '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-action="save-flow">Save</button>',
    '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-action="preview">Preview</button>',
    '<button type="button" class="ds-btn ds-btn--brand ds-btn--sm" data-flow-action="execute">Execute</button>',
    '</div>',
    '</div>',
    validation.valid ? '' : `<div class="flow-alert flow-alert--error">${escapeHTML(validation.errors.join('; '))}</div>`,
    renderFlowSettingsToHTML(flow),
    renderCanvasControlsToHTML(flow, state, nodeMatches),
    renderFlowCanvasToHTML(flow, state),
    renderFlowEdgeEditorToHTML(flow, state),
    renderFlowTestPanelToHTML(state),
    '</main>',
    '<aside class="flow-designer__inspector">',
    renderNodeInspectorToHTML(selectedNode, { editable: true }),
    renderVariableMapperToHTML({ flow, selectedNodeId: state.selectedNodeId }),
    renderIntentPatternEditorToHTML(flow),
    '</aside>',
    '</section>'
  ].join('');
}

function renderCanvasControlsToHTML(flow, state, nodeMatches) {
  const nodes = Array.isArray(flow?.nodes) ? flow.nodes : [];
  const trace = getFlowExecutionTrace(state.result ?? state.preview, nodes, flow?.edges ?? []);
  const selectedNode = nodes.find((node) => node.id === state.selectedNodeId) ?? null;
  const firstFailedNode = nodes.find((node) => node.id === trace.firstFailedNodeId) ?? null;
  const groups = groupFlowCanvasNodes(nodes, state.canvasGroupBy);
  const collapsedGroups = Array.isArray(state.collapsedCanvasGroups) ? state.collapsedCanvasGroups : [];
  const viewport = normalizeFlowCanvasViewport(state);

  return [
    '<section class="flow-canvas-controls">',
    '<label class="flow-field">',
    '<span>Find node</span>',
    '<input class="ds-input ds-input--sm" type="search" placeholder="Search node, capability, type" ',
    `value="${escapeAttr(state.nodeKeyword || '')}" data-flow-canvas-field="nodeKeyword">`,
    '</label>',
    '<label class="flow-field">',
    '<span>Locate node</span>',
    `<select class="ds-select ds-select--sm" data-flow-canvas-field="selectedNodeId">${renderNodeOptions(nodes, state.selectedNodeId)}</select>`,
    '</label>',
    '<label class="flow-field">',
    '<span>Group canvas</span>',
    `<select class="ds-select ds-select--sm" data-flow-canvas-field="canvasGroupBy">${renderCanvasGroupOptions(state.canvasGroupBy)}</select>`,
    '</label>',
    '<label class="flow-field">',
    '<span>Density</span>',
    `<select class="ds-select ds-select--sm" data-flow-canvas-field="canvasDensity">${renderCanvasDensityOptions(viewport.density)}</select>`,
    '</label>',
    '<div class="flow-canvas-controls__meta">',
    nodeMatches.active
      ? `<span>${escapeHTML(nodeMatches.count)} matched</span>`
      : '<span>No search</span>',
    selectedNode
      ? `<span>Selected: ${escapeHTML(selectedNode.label || selectedNode.id)}</span>`
      : '<span>No node selected</span>',
    firstFailedNode
      ? `<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-action="focus-failed-node">Failed node</button>`
      : '',
    groups.active
      ? `<span>${escapeHTML(groups.groups.length)} groups</span>`
      : '',
    groups.active && collapsedGroups.length > 0
      ? '<button type="button" class="ds-btn ds-btn--tertiary ds-btn--sm" data-flow-action="expand-canvas-groups">Expand groups</button>'
      : '',
    groups.active && collapsedGroups.length === 0
      ? '<button type="button" class="ds-btn ds-btn--tertiary ds-btn--sm" data-flow-action="collapse-canvas-groups">Collapse groups</button>'
      : '',
    `<span>${escapeHTML(Math.round(viewport.zoom * 100))}%</span>`,
    '<button type="button" class="ds-btn ds-btn--tertiary ds-btn--sm" data-flow-action="zoom-canvas-out">Zoom out</button>',
    '<button type="button" class="ds-btn ds-btn--tertiary ds-btn--sm" data-flow-action="zoom-canvas-in">Zoom in</button>',
    viewport.zoom !== 1
      ? '<button type="button" class="ds-btn ds-btn--tertiary ds-btn--sm" data-flow-action="reset-canvas-zoom">Reset zoom</button>'
      : '',
    `<button type="button" class="ds-btn ds-btn--tertiary ds-btn--sm" data-flow-action="toggle-canvas-minimap">${viewport.showMinimap ? 'Hide minimap' : 'Show minimap'}</button>`,
    state.nodeKeyword
      ? '<button type="button" class="ds-btn ds-btn--tertiary ds-btn--sm" data-flow-action="clear-node-search">Clear</button>'
      : '',
    '</div>',
    '</section>'
  ].join('');
}

export function renderFlowEdgeEditorToHTML(flow, state = {}) {
  const nodes = Array.isArray(flow?.nodes) ? flow.nodes : [];
  const edges = Array.isArray(flow?.edges) ? flow.edges : [];
  const selectedEdge = edges.find((edge) => edge.id === state.selectedEdgeId) ?? edges[0] ?? null;

  return [
    '<section class="flow-edge-editor">',
    '<div class="flow-edge-editor__header">',
    '<div class="flow-panel-title">Edges</div>',
    '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-action="add-edge">Add edge</button>',
    '</div>',
    edges.length === 0
      ? '<div class="flow-empty flow-empty--compact">No edges configured.</div>'
      : renderEdgeList(edges, state),
    selectedEdge ? renderEdgeForm(selectedEdge, nodes) : '',
    '</section>'
  ].join('');
}

export function renderFlowSettingsToHTML(flow) {
  return [
    '<section class="flow-settings">',
    '<div class="flow-settings__grid">',
    renderInput('Name', 'name', flow.name),
    renderSelect('Status', 'status', flow.status, Object.values(FLOW_STATUS)),
    renderSelect('Risk', 'risk', flow.risk || 'low', Object.values(FLOW_RISK_LEVELS)),
    renderTextarea('Description', 'description', flow.description || ''),
    renderTextarea('Examples', 'intent.examples', flow.intent?.examples?.join('\n') || ''),
    renderTextarea('Keywords', 'intent.keywords', flow.intent?.keywords?.join('\n') || ''),
    renderTextarea('Patterns', 'intent.patterns', flow.intent?.patterns?.join('\n') || ''),
    renderTextarea('Slots JSON', 'intent.slots', JSON.stringify(flow.intent?.slots ?? [], null, 2), 6),
    '</div>',
    '<div class="flow-settings__actions">',
    '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-action="publish-flow">Publish</button>',
    '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-action="disable-flow">Disable</button>',
    '<button type="button" class="ds-btn ds-btn--ghost ds-btn--sm" data-flow-action="remove-flow">Delete</button>',
    '</div>',
    '</section>'
  ].join('');
}

function renderInput(label, field, value) {
  return [
    '<label class="flow-field">',
    `<span>${escapeHTML(label)}</span>`,
    `<input class="ds-input" data-flow-field="${escapeAttr(field)}" value="${escapeAttr(value)}">`,
    '</label>'
  ].join('');
}

function renderSelect(label, field, value, options) {
  return [
    '<label class="flow-field">',
    `<span>${escapeHTML(label)}</span>`,
    `<select class="ds-select" data-flow-field="${escapeAttr(field)}">`,
    ...options.map((option) => `<option value="${escapeAttr(option)}"${option === value ? ' selected' : ''}>${escapeHTML(option)}</option>`),
    '</select>',
    '</label>'
  ].join('');
}

function renderTextarea(label, field, value, rows = 3) {
  return [
    '<label class="flow-field flow-field--wide">',
    `<span>${escapeHTML(label)}</span>`,
    `<textarea class="ds-textarea" rows="${escapeAttr(rows)}" data-flow-field="${escapeAttr(field)}">${escapeHTML(value)}</textarea>`,
    '</label>'
  ].join('');
}

function renderEdgeList(edges, state) {
  return [
    '<ol class="flow-edge-list">',
    ...edges.map((edge) => [
      `<li class="flow-edge-list__item${edge.id === state.selectedEdgeId ? ' is-selected' : ''}">`,
      `<button type="button" class="flow-edge-card" data-flow-action="select-edge" data-edge-id="${escapeAttr(edge.id)}">`,
      '<span class="flow-edge-card__main">',
      `<strong>${escapeHTML(edge.from || '-')} -> ${escapeHTML(edge.to || '-')}</strong>`,
      `<small>${escapeHTML(edge.condition || 'success')}</small>`,
      '</span>',
      '</button>',
      '</li>'
    ].join('')),
    '</ol>'
  ].join('');
}

function renderEdgeForm(edge, nodes) {
  return [
    '<div class="flow-edge-form">',
    '<div class="flow-inspector__actions">',
    '<button type="button" class="ds-btn ds-btn--ghost ds-btn--sm" data-flow-action="remove-edge">Delete edge</button>',
    '</div>',
    '<label class="flow-field">',
    '<span>From</span>',
    `<select class="ds-select" data-flow-edge-field="from">${renderNodeOptions(nodes, edge.from)}</select>`,
    '</label>',
    '<label class="flow-field">',
    '<span>To</span>',
    `<select class="ds-select" data-flow-edge-field="to">${renderNodeOptions(nodes, edge.to)}</select>`,
    '</label>',
    '<label class="flow-field">',
    '<span>Condition</span>',
    `<select class="ds-select" data-flow-edge-field="condition">${renderConditionOptions(edge.condition)}</select>`,
    '</label>',
    '</div>'
  ].join('');
}

function renderNodeOptions(nodes, value) {
  return nodes.map((node) => [
    `<option value="${escapeAttr(node.id)}"${node.id === value ? ' selected' : ''}>`,
    escapeHTML(node.label || node.id),
    '</option>'
  ].join('')).join('');
}

function renderConditionOptions(value) {
  return ['success', 'failure', 'always', 'skipped'].map((condition) => [
    `<option value="${escapeAttr(condition)}"${condition === value ? ' selected' : ''}>`,
    escapeHTML(condition),
    '</option>'
  ].join('')).join('');
}

function renderCanvasGroupOptions(value = '') {
  const options = [
    ['', 'None'],
    ['type', 'Type'],
    ['risk', 'Risk'],
    ['resource', 'Resource']
  ];
  return options.map(([key, label]) => [
    `<option value="${escapeAttr(key)}"${key === value ? ' selected' : ''}>`,
    escapeHTML(label),
    '</option>'
  ].join('')).join('');
}

function renderCanvasDensityOptions(value = 'comfortable') {
  return [
    ['comfortable', 'Comfortable'],
    ['compact', 'Compact']
  ].map(([option, label]) => [
    `<option value="${escapeAttr(option)}"${value === option ? ' selected' : ''}>`,
    escapeHTML(label),
    '</option>'
  ].join('')).join('');
}

export function FlowDesigner(options = {}) {
  const target = resolveTarget(options.target);
  const state = {
    flow: options.flow ?? null,
    selectedNodeId: options.flow?.nodes?.[0]?.id ?? '',
    nodeKeyword: '',
    canvasGroupBy: '',
    canvasZoom: 1,
    canvasDensity: 'comfortable',
    showCanvasMinimap: false,
    collapsedCanvasGroups: []
  };

  const render = () => {
    setHTML(target, renderFlowDesignerToHTML(state.flow, state));
  };

  const cleanups = [
    on(target, 'click', '[data-flow-action="select-node"]', (e, el) => {
      state.selectedNodeId = el.dataset.nodeId;
      render();
      scrollSelectedNodeIntoView(target, state.selectedNodeId);
    }),
    on(target, 'click', '[data-flow-action="focus-failed-node"]', () => {
      const trace = getFlowExecutionTrace(state.result ?? state.preview, state.flow?.nodes ?? [], state.flow?.edges ?? []);
      if (!trace.firstFailedNodeId) {
        return;
      }
      state.selectedNodeId = trace.firstFailedNodeId;
      render();
      scrollSelectedNodeIntoView(target, state.selectedNodeId);
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
      const groups = groupFlowCanvasNodes(state.flow?.nodes ?? [], state.canvasGroupBy);
      state.collapsedCanvasGroups = groups.groups.map((group) => group.key);
      render();
    }),
    on(target, 'click', '[data-flow-action="expand-canvas-groups"]', () => {
      state.collapsedCanvasGroups = [];
      render();
    }),
    on(target, 'click', '[data-flow-action="zoom-canvas-in"]', () => {
      state.canvasZoom = adjustCanvasZoom(state.canvasZoom, 0.1);
      render();
    }),
    on(target, 'click', '[data-flow-action="zoom-canvas-out"]', () => {
      state.canvasZoom = adjustCanvasZoom(state.canvasZoom, -0.1);
      render();
    }),
    on(target, 'click', '[data-flow-action="reset-canvas-zoom"]', () => {
      state.canvasZoom = 1;
      render();
    }),
    on(target, 'click', '[data-flow-action="toggle-canvas-minimap"]', () => {
      state.showCanvasMinimap = !state.showCanvasMinimap;
      render();
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
      if (el.dataset.flowCanvasField === 'canvasDensity') {
        state.canvasDensity = e.target.value;
        render();
      }
    }),
    on(target, 'click', '[data-flow-action="preview"]', () => {
      if (!state.flow || typeof options.onPreview !== 'function') {
        return;
      }
      options.onPreview(flowToPlan(state.flow, options.input ?? {}, options.context ?? {}));
    })
  ];

  render();

  return {
    element: target,
    update(nextFlow) {
      state.flow = nextFlow;
      state.selectedNodeId = nextFlow?.nodes?.[0]?.id ?? '';
      state.nodeKeyword = '';
      state.canvasGroupBy = '';
      state.canvasZoom = 1;
      state.canvasDensity = 'comfortable';
      state.showCanvasMinimap = false;
      state.collapsedCanvasGroups = [];
      render();
    },
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

function adjustCanvasZoom(value, delta) {
  const next = Number(value || 1) + delta;
  return Math.round(Math.min(1.5, Math.max(0.6, next)) * 10) / 10;
}

function getSelectedNode(flow, selectedNodeId) {
  return flow?.nodes?.find((node) => node.id === selectedNodeId) ?? flow?.nodes?.[0] ?? null;
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
