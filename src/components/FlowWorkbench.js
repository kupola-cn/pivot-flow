import { cloneFlow, createFlowNode } from '../flow-schema.js';
import { flowToPlan } from '../flow-to-plan.js';
import { canConnectFlowNodes, getFlowNodePorts } from '../flow-validation.js';
import { createDefaultFlowWorkbenchNodeTypes, getDefaultCapabilityForNodeType } from '../node-types.js';
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
      state.selectedNodeId = '';
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
      state.paletteOpen = false;
    } else if (action === 'toggle-palette') {
      state.paletteOpen = !state.paletteOpen;
      if (state.paletteOpen) {
        state.selectedNodeId = '';
      }
    } else if (action === 'toggle-result') {
      state.resultOpen = !state.resultOpen;
    } else if (action === 'close-inspector') {
      state.selectedNodeId = '';
    } else if (action === 'zoom-in') {
      updateZoom(state, state.zoom + 0.1);
    } else if (action === 'zoom-out') {
      updateZoom(state, state.zoom - 0.1);
    } else if (action === 'reset-viewport') {
      state.pan = { x: 0, y: 0 };
      state.zoom = 1;
    } else if (action === 'add-node') {
      addNode(state, options, actionEl.dataset.nodeTemplate || actionEl.dataset.nodeType);
      state.paletteOpen = false;
    } else if (action === 'remove-node') {
      removeSelectedNode(state, api);
    } else if (action === 'reset') {
      state.flow = cloneFlow(options.flow);
      state.selectedNodeId = '';
      state.connectionDraft = null;
      state.draggingNodeId = '';
      state.pan = createPoint(options.pan, { x: 0, y: 0 });
      state.zoom = normalizeZoom(options.zoom);
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
      connectNodes(state, api, state.selectedNodeId, input.value, getDefaultConnectionPorts(state, state.selectedNodeId, input.value));
      render();
    } else if (input.dataset.flowWorkbenchZoom !== undefined) {
      updateZoom(state, input.value);
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
      return;
    }

    const canvasEl = event.target.closest('.flow-workbench__canvas');
    if (canvasEl) {
      startCanvasPan(event, state, render, canvasEl);
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
  const showHeaderText = options.showHeaderText !== false;
  return [
    `<section class="flow-workbench${state.resultOpen ? ' is-result-open' : ''}">`,
    renderCanvas(state, options),
    `<header class="flow-workbench__topbar${showHeaderText ? '' : ' flow-workbench__topbar--actions-only'}">`,
    showHeaderText ? [
      '<div class="flow-workbench__title">',
    `<h2>${escapeHTML(options.title || state.flow.name || labels.title)}</h2>`,
    `<p>${escapeHTML(options.description || state.flow.description || '')}</p>`,
      '</div>'
    ].join('') : '',
    '<div class="flow-workbench__actions">',
    renderToolbarButton('toggle-palette', labels.components, 'secondary'),
    renderToolbarButton('reset', labels.reset, 'secondary'),
    renderToolbarButton('preview', labels.preview, 'secondary'),
    renderToolbarButton('execute', labels.execute, 'brand'),
    '</div>',
    '</header>',
    renderCanvasToolbar(state, options, labels),
    state.paletteOpen && !state.selectedNodeId ? [
      '<aside class="flow-workbench__palette">',
    `<div class="flow-workbench__panel-title">${escapeHTML(labels.palette)}</div>`,
    '<div class="flow-workbench__node-list">',
    renderPalette(options),
    '</div>',
    '</aside>',
    ].join('') : '',
    state.selectedNodeId ? [
      '<aside class="flow-workbench__inspector">',
    `<div class="flow-workbench__panel-title">${escapeHTML(labels.inspector)}</div>`,
    '<button type="button" class="flow-workbench__panel-close" data-flow-workbench-action="close-inspector" aria-label="Close inspector">×</button>',
    '<div class="flow-workbench__inspector-body">',
    renderInspector(state, labels),
    '</div>',
    '</aside>',
    ].join('') : '',
    '<button type="button" class="flow-workbench__result-toggle ds-btn ds-btn--secondary ds-btn--sm" data-flow-workbench-action="toggle-result">',
    escapeHTML(labels.result),
    '</button>',
    state.resultOpen ? [
      '<section class="flow-workbench__result">',
    `<div class="flow-workbench__result-body">${state.resultHTML}</div>`,
    `<div class="flow-workbench__log">${state.logs.map(renderLogEntry).join('')}</div>`,
    '</section>',
    ].join('') : '',
    '</section>'
  ].join('');
}

function createWorkbenchState(options) {
  const flow = cloneFlow(options.flow);
  return {
    flow,
    selectedNodeId: options.selectedNodeId || '',
    prompt: options.prompt || flow.intent?.examples?.[0] || flow.name || '',
    resultHTML: options.emptyResultHTML || '<div class="flow-workbench__empty">Run the flow to show output.</div>',
    logs: [],
    paletteOpen: Boolean(options.paletteOpen),
    resultOpen: Boolean(options.resultOpen),
    pan: createPoint(options.pan, { x: 0, y: 0 }),
    zoom: normalizeZoom(options.zoom),
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
      state.resultOpen = true;
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

function renderPalette(options) {
  const nodeTypes = getWorkbenchNodeTypes(options);
  return nodeTypes.map((item) => {
    const template = item.id || item.key || item.type || item[0];
    const type = item.type || item[0];
    const label = item.label || item[1] || type;
    const description = item.description || item[2] || '';
    return [
      '<button type="button" class="flow-workbench__palette-card" ',
      `data-flow-workbench-action="add-node" data-node-template="${escapeAttr(template)}" data-node-type="${escapeAttr(type)}">`,
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
    '<div class="flow-workbench__zoom-controls">',
    renderToolbarButton('zoom-out', '-', 'secondary'),
    '<select class="ds-select ds-select--sm flow-workbench__zoom-select" data-flow-workbench-zoom aria-label="Zoom">',
    renderZoomOptions(state.zoom),
    '</select>',
    renderToolbarButton('zoom-in', '+', 'secondary'),
    renderToolbarButton('reset-viewport', labels.fit, 'secondary'),
    '</div>',
    '</div>'
  ].join('');
}

function renderZoomOptions(currentZoom) {
  const levels = [0.5, 0.75, 1, 1.1, 1.25, 1.5, 2];
  if (!levels.some((zoom) => Math.abs(currentZoom - zoom) < 0.001)) {
    levels.push(currentZoom);
    levels.sort((a, b) => a - b);
  }
  return levels.map((zoom) => `<option value="${zoom}"${Math.abs(currentZoom - zoom) < 0.001 ? ' selected' : ''}>${Math.round(zoom * 100)}%</option>`).join('');
}

function renderCanvas(state, options) {
  const { width, height } = getBoardSize(state);
  const transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
  const edges = state.flow.edges.map((edge) => renderEdge(state, edge)).join('');
  const draftEdge = renderDraftEdge(state);
  const nodes = state.flow.nodes.map((node) => renderNode(state, options, node)).join('');

  return [
    '<section class="flow-workbench__canvas" aria-label="Flow canvas">',
    `<div class="flow-workbench__board" style="width:${width}px;height:${height}px;transform:${escapeAttr(transform)}">`,
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
  const ports = getFlowNodePorts(node);
  const inputPort = ports.inputs[0] || { id: 'input', label: 'Input' };
  const outputPort = ports.outputs[0] || { id: 'output', label: 'Output' };
  const rows = getNodeContentRows(options, node).map(([label, value]) => [
    '<div class="flow-workbench__node-row">',
    `<span>${escapeHTML(label)}:</span>`,
    `<strong title="${escapeAttr(value)}">${escapeHTML(value)}</strong>`,
    '</div>'
  ].join('')).join('');

  return [
    `<article class="flow-workbench__node${selected}${dragging}" style="left:${position.x}px;top:${position.y}px" data-flow-workbench-action="select-node" data-node-id="${escapeAttr(node.id)}">`,
    `<button type="button" class="flow-workbench__port flow-workbench__port--in" data-node-id="${escapeAttr(node.id)}" data-port-id="${escapeAttr(inputPort.id)}" data-port-kind="input" aria-label="${escapeAttr(`${node.label || node.id} ${inputPort.label || inputPort.id}`)}"></button>`,
    `<button type="button" class="flow-workbench__port flow-workbench__port--out" data-node-id="${escapeAttr(node.id)}" data-port-id="${escapeAttr(outputPort.id)}" data-port-kind="output" aria-label="${escapeAttr(`${node.label || node.id} ${outputPort.label || outputPort.id}`)}"></button>`,
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
  const definition = getWorkbenchNodeTypes(options)
    .find((item) => (item.id || item.key || item.type || item[0]) === type || (item.type || item[0]) === type)
    || {};
  const nodeType = definition.type || definition[0] || type;
  const node = createFlowNode({
    type: nodeType,
    label: definition.nodeLabel || definition.label || renderNodeType(options, nodeType),
    capability: definition.capability || defaultCapability(nodeType),
    resource: definition.resource || '',
    action: definition.action || '',
    risk: definition.risk || 'low',
    requiresConfirmation: Boolean(definition.requiresConfirmation),
    condition: clonePlain(definition.condition ?? null),
    control: clonePlain(definition.control || {}),
    params: clonePlain(definition.params || definition.defaultParams || defaultParams(nodeType)),
    inputSchema: clonePlain(definition.inputSchema || {}),
    outputSchema: clonePlain(definition.outputSchema || {}),
    ports: clonePlain(definition.ports || {}),
    ui: { position: nextNodePosition(state) }
  });
  state.flow.nodes = [...state.flow.nodes, node];
  state.selectedNodeId = node.id;
}

function getWorkbenchNodeTypes(options) {
  return options.nodeTypes?.length
    ? options.nodeTypes
    : createDefaultFlowWorkbenchNodeTypes({ locale: options.locale });
}

function clonePlain(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
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
    state.resultOpen = true;
    const result = await runtime.executePlan(plan, context);
    api.writeLog(result.ok ? 'execute.ok' : 'execute.fail', result.message || 'Flow executed.');
  } else {
    state.resultOpen = true;
    api.writeLog('preview.ok', 'Runtime plan generated.');
    api.setResultHTML(`<pre class="flow-workbench__json">${escapeHTML(JSON.stringify(plan, null, 2))}</pre>`);
  }
}

function startCanvasPan(event, state, render, canvasEl) {
  if (state.connectionDraft || event.button !== 0) {
    return;
  }
  event.preventDefault();
  const startClient = { x: event.clientX, y: event.clientY };
  const startPan = { ...state.pan };
  canvasEl.classList.add('is-panning');

  const move = (moveEvent) => {
    moveEvent.preventDefault();
    state.pan = {
      x: startPan.x + moveEvent.clientX - startClient.x,
      y: startPan.y + moveEvent.clientY - startClient.y
    };
    updateBoardTransform(canvasEl, state);
  };

  const up = () => {
    canvasEl.classList.remove('is-panning');
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    render();
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up, { once: true });
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
  event.preventDefault();
  const point = getCanvasPoint(target, event, state);
  const position = node.ui?.position || { x: 80, y: 80 };
  state.draggingNodeId = nodeId;
  state.selectedNodeId = nodeId;
  state.paletteOpen = false;
  state.dragOffset = {
    x: point.x - position.x,
    y: point.y - position.y
  };
  nodeEl.classList.add('is-dragging', 'is-selected');

  const move = (moveEvent) => {
    if (state.draggingNodeId !== nodeId) {
      return;
    }
    moveEvent.preventDefault();
    const nextPoint = getCanvasPoint(target, moveEvent, state);
    node.ui = node.ui || {};
    node.ui.position = clampNodePosition({
      x: nextPoint.x - state.dragOffset.x,
      y: nextPoint.y - state.dragOffset.y
    });
    nodeEl.style.left = `${node.ui.position.x}px`;
    nodeEl.style.top = `${node.ui.position.y}px`;
    refreshCanvasEdges(target, state);
  };

  const up = () => {
    state.draggingNodeId = '';
    state.dragOffset = null;
    nodeEl.classList.remove('is-dragging');
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    render();
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up, { once: true });
}

function updateBoardTransform(scope, state) {
  const board = scope.querySelector?.('.flow-workbench__board') || scope.closest?.('.flow-workbench')?.querySelector('.flow-workbench__board');
  if (board) {
    board.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
  }
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
    sourcePort: portEl.dataset.portId || '',
    point: getCanvasPoint(target, event, state)
  };
  render();

  const move = (moveEvent) => {
    if (!state.connectionDraft) {
      return;
    }
    moveEvent.preventDefault();
    state.connectionDraft.point = getCanvasPoint(target, moveEvent, state);
    refreshCanvasEdges(target, state);
  };

  const up = (upEvent) => {
    const element = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
    const targetPort = element?.closest?.('.flow-workbench__port[data-port-kind="input"]');
    const toNode = targetPort?.dataset.nodeId || findInputNodeAtPoint(state, getCanvasPoint(target, upEvent, state), nodeId)?.id;
    const connection = toNode
      ? connectNodes(state, api, nodeId, toNode, {
        sourcePort: state.connectionDraft.sourcePort,
        targetPort: targetPort?.dataset.portId || getDefaultConnectionPorts(state, nodeId, toNode).targetPort
      })
      : null;
    if (toNode) {
      state.selectedNodeId = connection?.ok ? toNode : '';
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

function refreshCanvasEdges(target, state) {
  const edges = target.querySelector('.flow-workbench__edges');
  if (!edges) {
    return;
  }
  edges.innerHTML = state.flow.edges.map((edge) => renderEdge(state, edge)).join('') + renderDraftEdge(state);
}

function connectNodes(state, api, from, to, options = {}) {
  const connection = canConnectFlowNodes(state.flow, from, to, {
    ...options,
    condition: options.condition || 'success'
  });
  if (!connection.ok) {
    api.writeLog('edge.blocked', connection.message);
    return connection;
  }

  state.flow.edges = [...state.flow.edges, {
    id: `edge:${from}:${to}:${Date.now()}`,
    from,
    to,
    sourcePort: options.sourcePort || '',
    targetPort: options.targetPort || '',
    condition: options.condition || 'success'
  }];
  api.writeLog('edge.add', `${getNode(state, from)?.label || from} -> ${getNode(state, to)?.label || to}`);
  return connection;
}

function getDefaultConnectionPorts(state, from, to) {
  const fromNode = getNode(state, from);
  const toNode = getNode(state, to);
  return {
    sourcePort: getFlowNodePorts(fromNode).outputs[0]?.id || '',
    targetPort: getFlowNodePorts(toNode).inputs[0]?.id || ''
  };
}

function getCanvasPoint(target, event, state) {
  const board = target.querySelector('.flow-workbench__board');
  if (!board) {
    return { x: 0, y: 0 };
  }
  const rect = board.getBoundingClientRect();
  const zoom = state?.zoom || 1;
  return {
    x: (event.clientX - rect.left) / zoom,
    y: (event.clientY - rect.top) / zoom
  };
}

function updateZoom(state, value) {
  state.zoom = normalizeZoom(value);
}

function createPoint(value, fallback) {
  return {
    x: Number.isFinite(Number(value?.x)) ? Number(value.x) : fallback.x,
    y: Number.isFinite(Number(value?.y)) ? Number(value.y) : fallback.y
  };
}

function normalizeZoom(value) {
  const zoom = Number(value || 1);
  if (!Number.isFinite(zoom)) {
    return 1;
  }
  return Math.min(2, Math.max(0.4, zoom));
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
    components: 'Components',
    reset: 'Reset',
    fit: 'Fit',
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
    result: 'Run result',
    summary: (nodes, edges) => `${nodes} nodes, ${edges} edges`,
    ...labels
  };
}
