import { cloneFlow, createFlowNode } from '../flow-schema.js';
import { flowToPlan } from '../flow-to-plan.js';
import { getDefaultCapabilityForNodeType } from '../node-types.js';
import { escapeAttr, escapeHTML, resolveTarget, setHTML } from './dom.js';

const DEFAULT_NODE_WIDTH = 238;
const DEFAULT_NODE_HEIGHT = 132;
const DEFAULT_BOARD_WIDTH = 2200;
const DEFAULT_BOARD_HEIGHT = 1400;

export function FlowWorkbench(options = {}) {
  const target = resolveTarget(options.target);
  const state = createWorkbenchState(options);
  const api = createWorkbenchApi(state, options);
  const cleanups = [];

  const render = () => {
    setHTML(target, renderFlowWorkbenchToHTML(state, options));
  };

  const refresh = (nextFlow) => {
    if (nextFlow) {
      state.flow = cloneFlow(nextFlow);
      state.selectedNodeId = state.flow.nodes?.[0]?.id || '';
      state.connectionDraft = null;
      state.draggingNodeId = '';
    }
    render();
  };

  const handleClick = async (event) => {
    const button = event.target.closest('button');
    if (button) {
      event.preventDefault();
    }
    if (event.target.closest('.flow-workbench__port')) {
      return;
    }

    const promptButton = event.target.closest('[data-flow-workbench-prompt]');
    if (promptButton) {
      state.prompt = promptButton.dataset.flowWorkbenchPrompt || state.prompt;
      render();
      return;
    }

    const actionEl = event.target.closest('[data-flow-workbench-action]');
    if (!actionEl || !target.contains(actionEl)) {
      return;
    }

    const action = actionEl.dataset.flowWorkbenchAction;
    if (action === 'select-node') {
      state.selectedNodeId = actionEl.dataset.nodeId || state.selectedNodeId;
    } else if (action === 'add-node') {
      addNode(state, options, actionEl.dataset.nodeType);
    } else if (action === 'remove-node') {
      removeSelectedNode(state, api);
    } else if (action === 'reset') {
      state.flow = cloneFlow(options.flow);
      state.selectedNodeId = state.flow.nodes?.[0]?.id || '';
      state.connectionDraft = null;
      state.draggingNodeId = '';
      api.writeLog('ready', options.resetMessage || 'Flow was reset.');
    } else if (action === 'preview') {
      await runFlow(state, options, api, { execute: false });
    } else if (action === 'execute') {
      await runFlow(state, options, api, { execute: true });
    }

    render();
  };

  const handleInput = (event) => {
    const input = event.target;
    if (input.dataset.flowWorkbenchPromptInput !== undefined) {
      state.prompt = input.value;
    } else if (input.dataset.flowWorkbenchField) {
      updateSelectedNode(state, input.dataset.flowWorkbenchField, input.value);
    }
  };

  const handleChange = (event) => {
    const input = event.target;
    if (input.dataset.flowWorkbenchConnectTo) {
      connectNodes(state, api, state.selectedNodeId, input.value);
      render();
    }
  };

  const handlePointerDown = (event) => {
    const port = event.target.closest('.flow-workbench__port');
    if (port) {
      startPortConnection(event, target, state, api, render, port);
      return;
    }

    const nodeEl = event.target.closest('.flow-workbench__node');
    if (nodeEl) {
      startNodeDrag(event, target, state, render, nodeEl);
    }
  };

  target.addEventListener('click', handleClick);
  target.addEventListener('input', handleInput);
  target.addEventListener('change', handleChange);
  target.addEventListener('pointerdown', handlePointerDown);
  cleanups.push(
    () => target.removeEventListener('click', handleClick),
    () => target.removeEventListener('input', handleInput),
    () => target.removeEventListener('change', handleChange),
    () => target.removeEventListener('pointerdown', handlePointerDown)
  );

  api.writeLog('ready', options.readyMessage || 'Flow workbench is ready.');
  render();

  return {
    element: target,
    getFlow: () => cloneFlow(state.flow),
    update: refresh,
    refresh,
    destroy() {
      cleanups.forEach((cleanup) => cleanup());
      target.innerHTML = '';
    }
  };
}

export function renderFlowWorkbenchToHTML(state, options = {}) {
  const labels = createLabels(options.labels);
  return [
    '<section class="flow-workbench">',
    '<header class="flow-workbench__topbar">',
    '<div class="flow-workbench__title">',
    `<h2>${escapeHTML(options.title || state.flow.name || labels.title)}</h2>`,
    `<p>${escapeHTML(options.description || state.flow.description || '')}</p>`,
    '</div>',
    '<div class="flow-workbench__actions">',
    renderToolbarButton('reset', labels.reset, 'secondary'),
    renderToolbarButton('preview', labels.preview, 'secondary'),
    renderToolbarButton('execute', labels.execute, 'brand'),
    '</div>',
    '</header>',
    '<aside class="flow-workbench__palette">',
    `<div class="flow-workbench__panel-title">${escapeHTML(labels.palette)}</div>`,
    '<div class="flow-workbench__node-list">',
    renderPalette(options.nodeTypes || []),
    '</div>',
    '</aside>',
    '<main class="flow-workbench__canvas-shell">',
    renderCanvasToolbar(state, options, labels),
    renderCanvas(state, options),
    '</main>',
    '<aside class="flow-workbench__inspector">',
    `<div class="flow-workbench__panel-title">${escapeHTML(labels.inspector)}</div>`,
    '<div class="flow-workbench__inspector-body">',
    renderInspector(state, labels),
    '</div>',
    '</aside>',
    '<section class="flow-workbench__result">',
    `<div class="flow-workbench__result-body">${state.resultHTML}</div>`,
    `<div class="flow-workbench__log">${state.logs.map(renderLogEntry).join('')}</div>`,
    '</section>',
    '</section>'
  ].join('');
}

function createWorkbenchState(options) {
  const flow = cloneFlow(options.flow);
  return {
    flow,
    selectedNodeId: options.selectedNodeId || flow.nodes?.[0]?.id || '',
    prompt: options.prompt || flow.intent?.examples?.[0] || flow.name || '',
    resultHTML: options.emptyResultHTML || '<div class="flow-workbench__empty">Run the flow to show output.</div>',
    logs: [],
    connectionDraft: null,
    connectingFrom: '',
    draggingNodeId: '',
    dragOffset: null
  };
}

function createWorkbenchApi(state, options) {
  return {
    getState: () => state,
    getFlow: () => state.flow,
    setResultHTML(html) {
      state.resultHTML = html || '';
    },
    writeLog(type, message) {
      state.logs = [{
        type,
        message,
        time: new Date().toLocaleTimeString(options.locale || 'zh-CN', { hour12: false })
      }, ...state.logs].slice(0, options.maxLogs || 12);
    },
    escapeHTML
  };
}

function renderToolbarButton(action, label, variant) {
  return `<button type="button" class="ds-btn ds-btn--${escapeAttr(variant)} ds-btn--sm" data-flow-workbench-action="${escapeAttr(action)}">${escapeHTML(label)}</button>`;
}

function renderPalette(nodeTypes) {
  return nodeTypes.map((item) => {
    const type = item.type || item[0];
    const label = item.label || item[1] || type;
    const description = item.description || item[2] || '';
    return [
      '<button type="button" class="flow-workbench__palette-card" ',
      `data-flow-workbench-action="add-node" data-node-type="${escapeAttr(type)}">`,
      `<strong>${escapeHTML(label)}</strong>`,
      `<span>${escapeHTML(description)}</span>`,
      '</button>'
    ].join('');
  }).join('');
}

function renderCanvasToolbar(state, options, labels) {
  return [
    '<div class="flow-workbench__canvas-toolbar">',
    '<label class="flow-workbench__prompt">',
    `<span>${escapeHTML(labels.prompt)}</span>`,
    `<input class="ds-input ds-input--sm" data-flow-workbench-prompt-input value="${escapeAttr(state.prompt)}">`,
    '</label>',
    '<div class="flow-workbench__quick-prompts">',
    (options.quickPrompts || []).map((prompt) => [
      '<button type="button" class="ds-btn ds-btn--ghost ds-btn--sm" ',
      `data-flow-workbench-prompt="${escapeAttr(prompt.value || prompt)}">`,
      escapeHTML(prompt.label || prompt),
      '</button>'
    ].join('')).join(''),
    '</div>',
    `<span class="ds-badge ds-badge--success">${escapeHTML(state.connectionDraft ? labels.connecting : labels.ready)}</span>`,
    '</div>'
  ].join('');
}

function renderCanvas(state, options) {
  const { width, height } = getBoardSize(state);
  const edges = state.flow.edges.map((edge) => renderEdge(state, edge)).join('');
  const draftEdge = renderDraftEdge(state);
  const nodes = state.flow.nodes.map((node) => renderNode(state, options, node)).join('');

  return [
    '<section class="flow-workbench__canvas" aria-label="Flow canvas">',
    `<div class="flow-workbench__board" style="width:${width}px;height:${height}px">`,
    `<svg class="flow-workbench__edges" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    edges,
    draftEdge,
    '</svg>',
    nodes,
    '</div>',
    '</section>'
  ].join('');
}

function renderEdge(state, edge) {
  const from = getNode(state, edge.from);
  const to = getNode(state, edge.to);
  if (!from || !to) {
    return '';
  }
  const a = from.ui?.position || { x: 0, y: 0 };
  const b = to.ui?.position || { x: 0, y: 0 };
  return `<path class="flow-workbench__edge" d="${escapeAttr(createEdgePath(a.x + DEFAULT_NODE_WIDTH, a.y + DEFAULT_NODE_HEIGHT / 2, b.x, b.y + DEFAULT_NODE_HEIGHT / 2))}"></path>`;
}

function renderDraftEdge(state) {
  if (!state.connectionDraft) {
    return '';
  }
  const from = getNode(state, state.connectionDraft.from);
  if (!from) {
    return '';
  }
  const position = from.ui?.position || { x: 0, y: 0 };
  const point = state.connectionDraft.point || position;
  return `<path class="flow-workbench__edge flow-workbench__edge--draft" d="${escapeAttr(createEdgePath(position.x + DEFAULT_NODE_WIDTH, position.y + DEFAULT_NODE_HEIGHT / 2, point.x, point.y))}"></path>`;
}

function createEdgePath(x1, y1, x2, y2) {
  const mid = Math.max(48, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + mid} ${y1}, ${x2 - mid} ${y2}, ${x2} ${y2}`;
}

function renderNode(state, options, node) {
  const position = node.ui?.position || { x: 80, y: 80 };
  const selected = node.id === state.selectedNodeId ? ' is-selected' : '';
  const dragging = node.id === state.draggingNodeId ? ' is-dragging' : '';
  const rows = getNodeContentRows(options, node).map(([label, value]) => [
    '<div class="flow-workbench__node-row">',
    `<span>${escapeHTML(label)}:</span>`,
    `<strong title="${escapeAttr(value)}">${escapeHTML(value)}</strong>`,
    '</div>'
  ].join('')).join('');

  return [
    `<article class="flow-workbench__node${selected}${dragging}" style="left:${position.x}px;top:${position.y}px" data-flow-workbench-action="select-node" data-node-id="${escapeAttr(node.id)}">`,
    `<button type="button" class="flow-workbench__port flow-workbench__port--in" data-node-id="${escapeAttr(node.id)}" data-port-kind="input" aria-label="${escapeAttr(node.label || node.id)} input"></button>`,
    `<button type="button" class="flow-workbench__port flow-workbench__port--out" data-node-id="${escapeAttr(node.id)}" data-port-kind="output" aria-label="${escapeAttr(node.label || node.id)} output"></button>`,
    '<div class="flow-workbench__node-title">',
    `<strong>${escapeHTML(node.label || node.id)}</strong>`,
    `<span class="flow-workbench__node-type">${escapeHTML(renderNodeType(options, node.type))}</span>`,
    '</div>',
    `<div class="flow-workbench__node-content">${rows}</div>`,
    '</article>'
  ].join('');
}

function renderInspector(state, labels) {
  const node = getNode(state, state.selectedNodeId);
  if (!node) {
    return `<div class="flow-workbench__empty">${escapeHTML(labels.emptyInspector)}</div>`;
  }
  const connectOptions = state.flow.nodes
    .filter((item) => item.id !== node.id)
    .map((item) => `<option value="${escapeAttr(item.id)}">${escapeHTML(item.label || item.id)}</option>`)
    .join('');

  return [
    '<form>',
    renderField(labels.nodeName, 'label', node.label || ''),
    renderField(labels.capability, 'capability', node.capability || ''),
    '<label class="flow-workbench__field">',
    `<span>${escapeHTML(labels.risk)}</span>`,
    `<select class="ds-select ds-select--sm" data-flow-workbench-field="risk">${['low', 'medium', 'high', 'critical'].map((risk) => `<option value="${risk}"${risk === (node.risk || 'low') ? ' selected' : ''}>${risk}</option>`).join('')}</select>`,
    '</label>',
    '<label class="flow-workbench__field">',
    `<span>${escapeHTML(labels.params)}</span>`,
    `<textarea class="ds-textarea" data-flow-workbench-field="params">${escapeHTML(JSON.stringify(node.params || {}, null, 2))}</textarea>`,
    '</label>',
    '<label class="flow-workbench__field">',
    `<span>${escapeHTML(labels.connectTo)}</span>`,
    `<select class="ds-select ds-select--sm" data-flow-workbench-connect-to><option value="">${escapeHTML(labels.selectTarget)}</option>${connectOptions}</select>`,
    '</label>',
    '<button type="button" class="ds-btn ds-btn--ghost ds-btn--sm" data-flow-workbench-action="remove-node">',
    escapeHTML(labels.deleteNode),
    '</button>',
    `<p class="flow-workbench__hint">${escapeHTML(labels.summary(state.flow.nodes.length, state.flow.edges.length))}</p>`,
    '</form>'
  ].join('');
}

function renderField(label, field, value) {
  return [
    '<label class="flow-workbench__field">',
    `<span>${escapeHTML(label)}</span>`,
    `<input class="ds-input ds-input--sm" data-flow-workbench-field="${escapeAttr(field)}" value="${escapeAttr(value)}">`,
    '</label>'
  ].join('');
}

function renderLogEntry(entry) {
  return [
    '<div class="flow-workbench__log-entry">',
    `<strong>${escapeHTML(entry.type)} · ${escapeHTML(entry.time)}</strong>`,
    `<small>${escapeHTML(entry.message)}</small>`,
    '</div>'
  ].join('');
}

function addNode(state, options, type) {
  if (!type) {
    return;
  }
  const definition = (options.nodeTypes || []).find((item) => (item.type || item[0]) === type) || {};
  const node = createFlowNode({
    type,
    label: definition.nodeLabel || definition.label || renderNodeType(options, type),
    capability: definition.capability || defaultCapability(type),
    risk: definition.risk || 'low',
    params: definition.params || defaultParams(type),
    ui: { position: nextNodePosition(state) }
  });
  state.flow.nodes = [...state.flow.nodes, node];
  state.selectedNodeId = node.id;
}

function removeSelectedNode(state, api) {
  const id = state.selectedNodeId;
  if (!id) {
    return;
  }
  state.flow.nodes = state.flow.nodes.filter((node) => node.id !== id);
  state.flow.edges = state.flow.edges.filter((edge) => edge.from !== id && edge.to !== id);
  state.selectedNodeId = state.flow.nodes[0]?.id || '';
  api.writeLog('node.remove', `Removed node: ${id}`);
}

function updateSelectedNode(state, field, value) {
  const node = getNode(state, state.selectedNodeId);
  if (!node) {
    return;
  }
  if (field === 'params') {
    try {
      node.params = JSON.parse(value || '{}');
    } catch {
      return;
    }
  } else {
    node[field] = value;
  }
}

async function runFlow(state, options, api, { execute }) {
  if (typeof options.runtimeFactory !== 'function') {
    api.writeLog('runtime.missing', 'runtimeFactory is required.');
    return;
  }
  const runtime = await options.runtimeFactory(api);
  const context = typeof options.contextProvider === 'function'
    ? await options.contextProvider()
    : options.context || {};
  const slots = typeof options.extractSlots === 'function'
    ? options.extractSlots(state.prompt, state.flow)
    : {};
  const plan = flowToPlan(state.flow, { prompt: state.prompt, slots }, context);

  if (execute) {
    const result = await runtime.executePlan(plan, context);
    api.writeLog(result.ok ? 'execute.ok' : 'execute.fail', result.message || 'Flow executed.');
  } else {
    api.writeLog('preview.ok', 'Runtime plan generated.');
    api.setResultHTML(`<pre class="flow-workbench__json">${escapeHTML(JSON.stringify(plan, null, 2))}</pre>`);
  }
}

function startNodeDrag(event, target, state, render, nodeEl) {
  if (state.connectionDraft || event.button !== 0 || event.target.closest('button, input, select, textarea')) {
    return;
  }
  const nodeId = nodeEl.dataset.nodeId;
  const node = getNode(state, nodeId);
  if (!node) {
    return;
  }
  const point = getCanvasPoint(target, event);
  const position = node.ui?.position || { x: 80, y: 80 };
  state.draggingNodeId = nodeId;
  state.selectedNodeId = nodeId;
  state.dragOffset = {
    x: point.x - position.x,
    y: point.y - position.y
  };

  const move = (moveEvent) => {
    if (state.draggingNodeId !== nodeId) {
      return;
    }
    const nextPoint = getCanvasPoint(target, moveEvent);
    node.ui = node.ui || {};
    node.ui.position = clampNodePosition({
      x: nextPoint.x - state.dragOffset.x,
      y: nextPoint.y - state.dragOffset.y
    });
    render();
  };

  const up = () => {
    state.draggingNodeId = '';
    state.dragOffset = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    render();
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up, { once: true });
}

function startPortConnection(event, target, state, api, render, portEl) {
  const nodeId = portEl.dataset.nodeId;
  const portKind = portEl.dataset.portKind;
  if (event.button !== 0 || portKind !== 'output' || !nodeId) {
    return;
  }

  state.connectingFrom = nodeId;
  state.connectionDraft = {
    from: nodeId,
    point: getCanvasPoint(target, event)
  };
  render();

  const move = (moveEvent) => {
    if (!state.connectionDraft) {
      return;
    }
    state.connectionDraft.point = getCanvasPoint(target, moveEvent);
    render();
  };

  const up = (upEvent) => {
    const element = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
    const targetPort = element?.closest?.('.flow-workbench__port[data-port-kind="input"]');
    const toNode = targetPort?.dataset.nodeId || findInputNodeAtPoint(state, getCanvasPoint(target, upEvent), nodeId)?.id;
    if (toNode) {
      connectNodes(state, api, nodeId, toNode);
      state.selectedNodeId = toNode;
    }
    state.connectionDraft = null;
    state.connectingFrom = '';
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    render();
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up, { once: true });
}

function connectNodes(state, api, from, to) {
  if (!from || !to || from === to) {
    return;
  }
  const exists = state.flow.edges.some((edge) => edge.from === from && edge.to === to);
  if (!exists) {
    state.flow.edges = [...state.flow.edges, { id: `edge:${from}:${to}:${Date.now()}`, from, to, condition: 'success' }];
    api.writeLog('edge.add', `${getNode(state, from)?.label || from} -> ${getNode(state, to)?.label || to}`);
  }
}

function getCanvasPoint(target, event) {
  const board = target.querySelector('.flow-workbench__board');
  if (!board) {
    return { x: 0, y: 0 };
  }
  const rect = board.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function findInputNodeAtPoint(state, point, fromNodeId) {
  return state.flow.nodes.find((node) => {
    if (node.id === fromNodeId) {
      return false;
    }
    const position = node.ui?.position || { x: 0, y: 0 };
    const portX = position.x;
    const portY = position.y + DEFAULT_NODE_HEIGHT / 2;
    return Math.abs(point.x - portX) <= 24 && Math.abs(point.y - portY) <= 24;
  }) || null;
}

function getBoardSize(state) {
  const maxX = Math.max(...state.flow.nodes.map((node) => (node.ui?.position?.x || 0) + DEFAULT_NODE_WIDTH), 0);
  const maxY = Math.max(...state.flow.nodes.map((node) => (node.ui?.position?.y || 0) + DEFAULT_NODE_HEIGHT), 0);
  return {
    width: Math.max(DEFAULT_BOARD_WIDTH, maxX + 280),
    height: Math.max(DEFAULT_BOARD_HEIGHT, maxY + 280)
  };
}

function nextNodePosition(state) {
  const selected = getNode(state, state.selectedNodeId);
  if (selected?.ui?.position) {
    return clampNodePosition({
      x: selected.ui.position.x + 280,
      y: selected.ui.position.y + 170
    });
  }
  const maxX = Math.max(...state.flow.nodes.map((node) => node.ui?.position?.x || 80), 80);
  return clampNodePosition({ x: maxX + 280, y: 560 });
}

function clampNodePosition(point) {
  return {
    x: Math.max(24, point.x),
    y: Math.max(24, point.y)
  };
}

function getNode(state, id) {
  return state.flow.nodes.find((node) => node.id === id);
}

function getNodeContentRows(options, node) {
  if (typeof options.nodeContentRows === 'function') {
    return options.nodeContentRows(node);
  }
  return [
    [options.labels?.type || 'Type', renderNodeType(options, node.type)],
    [options.labels?.capability || 'Capability', node.capability || '-'],
    [options.labels?.risk || 'Risk', node.risk || 'low'],
    [options.labels?.params || 'Params', summarizeParams(node.params || {})]
  ];
}

function summarizeParams(params) {
  const entries = Object.entries(params || {});
  if (entries.length === 0) {
    return '-';
  }
  return entries.map(([key, value]) => `${key}=${formatParamValue(value)}`).join(' | ');
}

function formatParamValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatParamValue(item)).join(', ')}]`;
  }
  if (value && typeof value === 'object') {
    return '{...}';
  }
  return String(value ?? '-');
}

function renderNodeType(options, type) {
  return options.nodeTypeLabels?.[type] || type;
}

function defaultCapability(type) {
  return getDefaultCapabilityForNodeType(type);
}

function defaultParams(type) {
  if (type === 'message.show') {
    return { message: 'Flow message', type: 'info' };
  }
  return {};
}

function createLabels(labels = {}) {
  return {
    title: 'Flow workbench',
    reset: 'Reset',
    preview: 'Preview',
    execute: 'Run',
    palette: 'Node palette',
    inspector: 'Node inspector',
    prompt: 'Prompt',
    ready: 'Ready',
    connecting: 'Connecting',
    emptyInspector: 'Select a node.',
    nodeName: 'Node name',
    capability: 'Capability',
    risk: 'Risk',
    params: 'Params JSON',
    connectTo: 'Connect to',
    selectTarget: 'Select target',
    deleteNode: 'Delete node',
    summary: (nodes, edges) => `${nodes} nodes, ${edges} edges`,
    ...labels
  };
}
