import { getFlowNodeCapability } from '../node-types.js';
import { getFlowNodePorts } from '../flow-validation.js';
import {
  formatFlowDuration,
  getFlowExecutionTrace,
  truncateFlowText
} from '../flow-run-summary.js';
import { escapeHTML, escapeAttr } from './dom.js';

export function renderFlowCanvasToHTML(flow, options = {}) {
  const nodes = Array.isArray(flow?.nodes) ? flow.nodes : [];
  const edges = Array.isArray(flow?.edges) ? flow.edges : [];

  if (!flow) {
    return '<div class="flow-empty">Select a flow to inspect its nodes.</div>';
  }

  if (nodes.length === 0) {
    return '<div class="flow-empty">This flow has no nodes.</div>';
  }

  const layout = createFlowCanvasLayout(nodes, edges);
  const trace = getFlowExecutionTrace(options.result ?? options.preview, nodes, edges);
  const diagnostics = getFlowCanvasDiagnostics(options.result ?? options.preview, nodes, edges, {
    groupBy: options.groupBy || options.canvasGroupBy
  });
  const nodeMatches = getFlowNodeMatches(nodes, options.nodeKeyword);
  const adjacency = getFlowNodeAdjacency(options.selectedNodeId, edges);
  const groups = groupFlowCanvasNodes(nodes, options.groupBy || options.canvasGroupBy);
  const collapsedGroups = normalizeCollapsedGroups(options.collapsedGroups ?? options.collapsedCanvasGroups);
  const viewport = normalizeFlowCanvasViewport(options);

  return [
    `<div class="flow-canvas flow-canvas--density-${escapeAttr(viewport.density)}" data-flow-canvas-zoom="${escapeAttr(viewport.zoom)}" data-flow-canvas-dropzone="true">`,
    '<div class="flow-canvas__summary">',
    `<span>${escapeHTML(nodes.length)} nodes</span>`,
    `<span>${escapeHTML(edges.length)} edges</span>`,
    `<span>${escapeHTML(layout.layers.length)} layers</span>`,
    `<span>${escapeHTML(Math.round(viewport.zoom * 100))}% zoom</span>`,
    `<span>${escapeHTML(viewport.density)} density</span>`,
    groups.active ? `<span>${escapeHTML(groups.groups.length)} groups</span>` : '',
    collapsedGroups.size > 0 ? `<span>${escapeHTML(collapsedGroups.size)} collapsed</span>` : '',
    trace.executedNodeIds.length > 0 ? `<span class="flow-canvas__summary-status flow-canvas__summary-status--executed">${escapeHTML(trace.executedNodeIds.length)} executed</span>` : '',
    trace.failedNodeIds.length > 0 ? `<span class="flow-canvas__summary-status flow-canvas__summary-status--failed">${escapeHTML(trace.failedNodeIds.length)} failed</span>` : '',
    trace.skippedNodeIds.length > 0 ? `<span class="flow-canvas__summary-status flow-canvas__summary-status--skipped">${escapeHTML(trace.skippedNodeIds.length)} skipped</span>` : '',
    trace.totalDurationMs > 0 ? `<span>${escapeHTML(formatFlowDuration(trace.totalDurationMs))} total</span>` : '',
    '</div>',
    renderConnectionStatus(options),
    renderExecutionDiagnostics(diagnostics),
    renderCanvasViewport(
      groups.active
        ? renderGroupedBoard(groups.groups, edges, options, trace.nodeStates, nodeMatches, adjacency, collapsedGroups)
        : renderBoard(layout.layers, options, trace.nodeStates, nodeMatches, adjacency),
      viewport
    ),
    renderEdgeRail(edges, options, trace.edgeStates, adjacency),
    viewport.showMinimap ? renderFlowCanvasMinimap(layout, options, trace.nodeStates, nodeMatches, adjacency) : '',
    '</div>'
  ].join('');
}

export function createFlowCanvasLayout(nodes = [], edges = []) {
  const indexedNodes = nodes.map((node, index) => ({ node, index }));
  const nodeIds = new Set(indexedNodes.map((item) => item.node.id));
  const incoming = new Map(indexedNodes.map((item) => [item.node.id, 0]));
  const outgoing = new Map(indexedNodes.map((item) => [item.node.id, []]));
  const layerById = new Map(indexedNodes.map((item) => [item.node.id, 0]));

  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to) || edge.from === edge.to) {
      continue;
    }
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const queue = indexedNodes
    .filter((item) => (incoming.get(item.node.id) ?? 0) === 0)
    .map((item) => item.node.id);
  const visited = new Set();

  while (queue.length > 0) {
    const id = queue.shift();
    if (visited.has(id)) {
      continue;
    }
    visited.add(id);

    for (const next of outgoing.get(id) ?? []) {
      layerById.set(next, Math.max(layerById.get(next) ?? 0, (layerById.get(id) ?? 0) + 1));
      incoming.set(next, Math.max(0, (incoming.get(next) ?? 0) - 1));
      if ((incoming.get(next) ?? 0) === 0) {
        queue.push(next);
      }
    }
  }

  for (const item of indexedNodes) {
    if (!visited.has(item.node.id)) {
      layerById.set(item.node.id, Math.max(layerById.get(item.node.id) ?? 0, item.index));
    }
  }

  const layers = [];
  for (const item of indexedNodes) {
    const layerIndex = layerById.get(item.node.id) ?? 0;
    layers[layerIndex] = layers[layerIndex] ?? [];
    layers[layerIndex].push(item);
  }

  return {
    layers: layers.filter(Boolean).map((layer) => layer.sort((left, right) => left.index - right.index)),
    layerById
  };
}

export function groupFlowCanvasNodes(nodes = [], groupBy = '') {
  const mode = normalizeCanvasGroupBy(groupBy);
  const indexedNodes = (Array.isArray(nodes) ? nodes : []).map((node, index) => ({ node, index }));
  if (!mode) {
    return {
      active: false,
      groupBy: '',
      groups: [
        {
          key: '',
          label: '',
          nodes: indexedNodes
        }
      ]
    };
  }

  const groups = new Map();
  for (const item of indexedNodes) {
    const key = getCanvasNodeGroupKey(item.node, mode);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: getCanvasGroupLabel(key, mode),
        nodes: []
      });
    }
    groups.get(key).nodes.push(item);
  }

  return {
    active: true,
    groupBy: mode,
    groups: Array.from(groups.values())
  };
}

export function normalizeFlowCanvasViewport(options = {}) {
  const rawZoom = Number(options.zoom ?? options.canvasZoom ?? 1);
  const zoom = Math.min(1.5, Math.max(0.6, Number.isFinite(rawZoom) ? rawZoom : 1));
  const density = ['comfortable', 'compact'].includes(options.density || options.canvasDensity)
    ? String(options.density || options.canvasDensity)
    : 'comfortable';

  return {
    zoom: Math.round(zoom * 100) / 100,
    density,
    showMinimap: Boolean(options.showMinimap ?? options.showCanvasMinimap)
  };
}

function renderCanvasViewport(content, viewport) {
  const style = `--flow-canvas-zoom:${viewport.zoom}`;
  return [
    `<div class="flow-canvas__viewport" style="${escapeAttr(style)}">`,
    '<div class="flow-canvas__viewport-inner">',
    content,
    '</div>',
    '</div>'
  ].join('');
}

function renderFlowCanvasMinimap(layout, options, nodeStates, nodeMatches, adjacency) {
  const layers = Array.isArray(layout?.layers) ? layout.layers : [];
  if (layers.length === 0) {
    return '';
  }

  return [
    '<div class="flow-canvas__minimap">',
    '<div class="flow-canvas__minimap-title">Minimap</div>',
    '<div class="flow-canvas__minimap-grid">',
    ...layers.map((layer) => [
      '<span class="flow-canvas__minimap-layer">',
      ...layer.map((item) => {
        const status = nodeStates.get(item.node.id)?.status ?? 'idle';
        const selected = options.selectedNodeId === item.node.id;
        const matched = nodeMatches?.matchedIds?.has(item.node.id) ?? false;
        const related = adjacency?.relatedNodeIds?.has(item.node.id) ?? false;
        return `<button type="button" title="${escapeAttr(item.node.label || item.node.id)}" class="${getMinimapNodeClasses({ status, selected, matched, related })}" data-flow-action="select-node" data-node-id="${escapeAttr(item.node.id)}"></button>`;
      }).join(''),
      '</span>'
    ].join('')),
    '</div>',
    '</div>'
  ].join('');
}

function renderBoard(layers, options, nodeStates, nodeMatches, adjacency) {
  return [
    '<div class="flow-canvas__board">',
    ...layers.map((layer, index) => renderLayer(layer, index, options, nodeStates, nodeMatches, adjacency)),
    '</div>'
  ].join('');
}

function renderGroupedBoard(groups, edges, options, nodeStates, nodeMatches, adjacency, collapsedGroups) {
  return [
    '<div class="flow-canvas__groups">',
    ...groups.map((group) => renderNodeGroup(group, edges, options, nodeStates, nodeMatches, adjacency, collapsedGroups)),
    '</div>'
  ].join('');
}

function renderNodeGroup(group, edges, options, nodeStates, nodeMatches, adjacency, collapsedGroups) {
  const collapsed = collapsedGroups.has(group.key);
  const groupNodeIds = new Set(group.nodes.map((item) => item.node.id));
  const groupEdges = edges.filter((edge) => groupNodeIds.has(edge.from) && groupNodeIds.has(edge.to));
  const incomingEdges = edges.filter((edge) => !groupNodeIds.has(edge.from) && groupNodeIds.has(edge.to));
  const outgoingEdges = edges.filter((edge) => groupNodeIds.has(edge.from) && !groupNodeIds.has(edge.to));
  const layout = createFlowCanvasLayout(group.nodes.map((item) => item.node), groupEdges);

  return [
    `<section class="flow-canvas__group${collapsed ? ' is-collapsed' : ''}" data-canvas-group-key="${escapeAttr(group.key)}">`,
    '<button type="button" class="flow-canvas__group-title" data-flow-action="toggle-canvas-group" data-canvas-group-key="',
    escapeAttr(group.key),
    '">',
    '<span>',
    `<strong>${escapeHTML(group.label)}</strong>`,
    `<small>${escapeHTML(group.nodes.length)} node${group.nodes.length === 1 ? '' : 's'} · ${escapeHTML(groupEdges.length)} internal · ${escapeHTML(incomingEdges.length)} in · ${escapeHTML(outgoingEdges.length)} out</small>`,
    '</span>',
    `<em>${collapsed ? 'Expand' : 'Collapse'}</em>`,
    '</button>',
    collapsed
      ? ''
      : renderBoard(layout.layers.map((layer) => layer.map((item) => {
        const original = group.nodes.find((entry) => entry.node.id === item.node.id);
        return original ?? item;
      })), options, nodeStates, nodeMatches, adjacency),
    '</section>'
  ].join('');
}

function renderLayer(layer, index, options, nodeStates, nodeMatches, adjacency) {
  return [
    '<section class="flow-canvas__layer">',
    '<div class="flow-canvas__layer-title">',
    `<span>Layer ${escapeHTML(index + 1)}</span>`,
    `<small>${escapeHTML(layer.length)} node${layer.length === 1 ? '' : 's'}</small>`,
    '</div>',
    '<ol class="flow-canvas__nodes">',
    ...layer.map((item) => renderNodeCard(item.node, item.index, options, nodeStates.get(item.node.id), nodeMatches, adjacency)),
    '</ol>',
    '</section>'
  ].join('');
}

function normalizeCanvasGroupBy(value) {
  const groupBy = String(value || '').trim();
  return ['type', 'risk', 'resource'].includes(groupBy) ? groupBy : '';
}

function normalizeCollapsedGroups(value) {
  if (value instanceof Set) {
    return new Set(Array.from(value).map(String));
  }
  if (Array.isArray(value)) {
    return new Set(value.map(String));
  }
  if (typeof value === 'string' && value.trim()) {
    return new Set(value.split(',').map((item) => item.trim()).filter(Boolean));
  }
  return new Set();
}

function getCanvasNodeGroupKey(node, mode) {
  if (node?.ui?.group || node?.metadata?.group || node?.group) {
    return String(node.ui?.group || node.metadata?.group || node.group);
  }
  if (mode === 'type') {
    return String(node?.type || 'unknown');
  }
  if (mode === 'risk') {
    return String(node?.risk || 'low');
  }
  if (mode === 'resource') {
    const capability = getFlowNodeCapability(node);
    const parts = capability ? capability.split('.') : [];
    return parts.length > 1 ? parts.slice(0, -1).join('.') : node?.type || 'frontend';
  }
  return 'default';
}

function getCanvasGroupLabel(key, mode) {
  if (!key) {
    return 'Default';
  }
  if (mode === 'risk') {
    return `${key} risk`;
  }
  if (mode === 'resource') {
    return `Resource: ${key}`;
  }
  if (mode === 'type') {
    return `Type: ${key}`;
  }
  return key;
}

export function renderNodeCard(node, index, options = {}, nodeState = null, nodeMatches = null, adjacency = null) {
  const selected = options.selectedNodeId === node.id;
  const matched = nodeMatches?.matchedIds?.has(node.id) ?? false;
  const dimmed = Boolean(nodeMatches?.active && !matched);
  const related = Boolean(adjacency?.relatedNodeIds?.has(node.id));
  const status = nodeState?.status ?? 'idle';
  const capability = getFlowNodeCapability(node);
  const diagnostic = getNodeDiagnostic(nodeState);
  const ports = getFlowNodePorts(node);
  const position = normalizeNodePosition(node);
  return [
    `<li class="${getNodeClasses({ selected, matched, dimmed, related, status })}" data-node-id="${escapeAttr(node.id)}" data-flow-node-x="${escapeAttr(position.x)}" data-flow-node-y="${escapeAttr(position.y)}">`,
    renderNodePorts(node, ports.inputs, 'input', options),
    `<button type="button" class="flow-node__button" data-flow-action="select-node" data-node-id="${escapeAttr(node.id)}">`,
    '<span class="flow-node__index">',
    escapeHTML(index + 1),
    '</span>',
    '<span class="flow-node__body">',
    `<strong>${escapeHTML(node.label || node.id)}</strong>`,
    `<small>${escapeHTML(node.type)}${capability ? ` · ${escapeHTML(capability)}` : ''}</small>`,
    '<span class="flow-node__meta">',
    node.requiresConfirmation ? '<em>confirm</em>' : '',
    status !== 'idle' ? `<em>${escapeHTML(status)}</em>` : '',
    diagnostic.durationText ? `<em>${escapeHTML(diagnostic.durationText)}</em>` : '',
    '</span>',
    diagnostic.message ? `<small class="flow-node__diagnostic">${escapeHTML(diagnostic.message)}</small>` : '',
    '</span>',
    `<span class="flow-badge flow-badge--${escapeAttr(node.risk || 'low')}">${escapeHTML(node.risk || 'low')}</span>`,
    '</button>',
    renderNodePorts(node, ports.outputs, 'output', options),
    '</li>'
  ].join('');
}

function renderConnectionStatus(options = {}) {
  const pending = options.pendingConnection;
  const message = options.connectionMessage || '';
  if (!pending && !message) {
    return '';
  }

  return [
    '<div class="flow-canvas__connection-status">',
    pending?.from
      ? `<span>Connecting from ${escapeHTML(pending.from)}${pending.sourcePort ? ` / ${escapeHTML(pending.sourcePort)}` : ''}</span>`
      : '',
    message ? `<span class="flow-canvas__connection-message">${escapeHTML(message)}</span>` : '',
    '</div>'
  ].join('');
}

function renderNodePorts(node, ports, kind, options = {}) {
  if (!Array.isArray(ports) || ports.length === 0) {
    return '';
  }

  const pending = options.pendingConnection;
  return [
    `<div class="flow-node__ports flow-node__ports--${escapeAttr(kind)}">`,
    ...ports.map((port) => {
      const action = kind === 'output' ? 'start-port-connection' : 'finish-port-connection';
      const pendingClass = kind === 'output' && pending?.from === node.id && pending?.sourcePort === port.id ? ' is-pending' : '';
      return [
        `<button type="button" class="flow-node-port ds-btn ds-btn--tertiary ds-btn--sm${pendingClass}"`,
        ` data-flow-action="${escapeAttr(action)}"`,
        ` data-node-id="${escapeAttr(node.id)}"`,
        ` data-port-id="${escapeAttr(port.id)}"`,
        ` data-port-kind="${escapeAttr(kind)}"`,
        ` title="${escapeAttr(port.label || port.id)}">`,
        `<span>${escapeHTML(port.label || port.id)}</span>`,
        '</button>'
      ].join('');
    }),
    '</div>'
  ].join('');
}

function renderEdgeRail(edges, options = {}, edgeStates = new Map(), adjacency = null) {
  if (!Array.isArray(edges) || edges.length === 0) {
    return '';
  }

  return [
    '<div class="flow-canvas__edge-rail">',
    '<div class="flow-canvas__edge-title">Edges</div>',
    '<ol>',
    ...edges.map((edge) => [
      `<li class="${getEdgeClasses(edge, options, edgeStates, adjacency)}">`,
      `<button type="button" data-flow-action="select-edge" data-edge-id="${escapeAttr(edge.id)}">`,
      `<span>${escapeHTML(edge.from || '-')} -> ${escapeHTML(edge.to || '-')}</span>`,
      `<small>${escapeHTML(getEdgeStateLabel(edge, edgeStates))}</small>`,
      '</button>',
      '</li>'
    ].join('')),
    '</ol>',
    '</div>'
  ].join('');
}

export { getFlowExecutionTrace } from '../flow-run-summary.js';

export function getFlowCanvasDiagnostics(result, nodes = [], edges = [], options = {}) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const safeEdges = Array.isArray(edges) ? edges : [];
  const trace = getFlowExecutionTrace(result, safeNodes, safeEdges);
  const nodeById = new Map(safeNodes.map((node, index) => [node.id, { node, index }]));
  const failedNodes = trace.failedNodeIds.map((nodeId) => {
    const entry = nodeById.get(nodeId);
    const state = trace.nodeStates.get(nodeId);
    return {
      id: nodeId,
      label: entry?.node?.label || nodeId,
      index: entry?.index ?? -1,
      message: state?.message || '',
      code: state?.code || '',
      durationMs: state?.durationMs || 0
    };
  });
  const slowestNodes = safeNodes
    .map((node, index) => {
      const state = trace.nodeStates.get(node.id);
      return {
        id: node.id,
        label: node.label || node.id,
        index,
        durationMs: state?.durationMs || 0,
        status: state?.status || 'idle'
      };
    })
    .filter((item) => item.durationMs > 0)
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, Number(options.slowestLimit || 3));
  const groupBy = normalizeCanvasGroupBy(options.groupBy || options.canvasGroupBy);
  const groupKeyByNodeId = new Map(safeNodes.map((node) => [node.id, groupBy ? getCanvasNodeGroupKey(node, groupBy) : '']));
  const crossGroupEdges = groupBy
    ? safeEdges
      .filter((edge) => groupKeyByNodeId.has(edge.from) && groupKeyByNodeId.has(edge.to) && groupKeyByNodeId.get(edge.from) !== groupKeyByNodeId.get(edge.to))
      .map((edge) => ({
        id: edge.id || `${edge.from}->${edge.to}`,
        from: edge.from || '',
        to: edge.to || '',
        fromGroup: groupKeyByNodeId.get(edge.from) || '',
        toGroup: groupKeyByNodeId.get(edge.to) || '',
        condition: edge.condition || 'success',
        active: Boolean(trace.edgeStates.get(edge.id)?.active),
        failed: Boolean(trace.edgeStates.get(edge.id)?.failed)
      }))
    : [];

  return {
    trace,
    failedNodes,
    slowestNodes,
    crossGroupEdges,
    failedCrossGroupEdges: crossGroupEdges.filter((edge) => edge.failed),
    firstFailedNode: failedNodes[0] ?? null,
    slowestNode: slowestNodes[0] ?? null
  };
}

function renderExecutionDiagnostics(diagnostics) {
  if (!diagnostics.firstFailedNode && !diagnostics.slowestNode && diagnostics.crossGroupEdges.length === 0) {
    return '';
  }

  return [
    '<div class="flow-canvas__diagnostics">',
    diagnostics.firstFailedNode
      ? [
        '<span class="flow-canvas__diagnostic flow-canvas__diagnostic--failed">',
        `<strong>Failed node</strong>`,
        `<small>${escapeHTML(diagnostics.firstFailedNode.label)}${diagnostics.firstFailedNode.message ? ` · ${escapeHTML(diagnostics.firstFailedNode.message)}` : ''}</small>`,
        '</span>'
      ].join('')
      : '',
    diagnostics.slowestNode
      ? [
        '<span class="flow-canvas__diagnostic">',
        '<strong>Slowest node</strong>',
        `<small>${escapeHTML(diagnostics.slowestNode.label)} · ${escapeHTML(formatFlowDuration(diagnostics.slowestNode.durationMs))}</small>`,
        '</span>'
      ].join('')
      : '',
    diagnostics.crossGroupEdges.length > 0
      ? [
        '<span class="flow-canvas__diagnostic">',
        '<strong>Cross-group edges</strong>',
        `<small>${escapeHTML(diagnostics.crossGroupEdges.length)} total${diagnostics.failedCrossGroupEdges.length > 0 ? ` · ${escapeHTML(diagnostics.failedCrossGroupEdges.length)} failed path` : ''}</small>`,
        '</span>'
      ].join('')
      : '',
    diagnostics.failedNodes.length > 1
      ? renderFailedNodeList(diagnostics.failedNodes)
      : '',
    '</div>'
  ].join('');
}

function renderFailedNodeList(failedNodes) {
  return [
    '<div class="flow-canvas__failed-list">',
    '<strong>Failed nodes</strong>',
    '<ol>',
    ...failedNodes.map((node) => [
      '<li>',
      `<button type="button" data-flow-action="select-node" data-node-id="${escapeAttr(node.id)}">`,
      `<span>${escapeHTML(node.label)}</span>`,
      `<small>${escapeHTML([node.message || node.code, node.durationMs ? formatFlowDuration(node.durationMs) : ''].filter(Boolean).join(' · '))}</small>`,
      '</button>',
      '</li>'
    ].join('')),
    '</ol>',
    '</div>'
  ].join('');
}

export function getFlowNodeMatches(nodes = [], keyword = '') {
  const normalized = String(keyword || '').trim().toLowerCase();
  const matchedIds = new Set();
  if (!normalized) {
    return { active: false, matchedIds, count: 0 };
  }

  for (const node of Array.isArray(nodes) ? nodes : []) {
    const capability = getFlowNodeCapability(node);
    const haystack = [
      node?.id,
      node?.label,
      node?.type,
      capability,
      node?.risk
    ].filter(Boolean).join(' ').toLowerCase();
    if (haystack.includes(normalized)) {
      matchedIds.add(node.id);
    }
  }

  return { active: true, matchedIds, count: matchedIds.size };
}

export function getFlowNodeAdjacency(nodeId = '', edges = []) {
  const selectedNodeId = String(nodeId || '').trim();
  const relatedEdgeIds = new Set();
  const relatedNodeIds = new Set();
  if (!selectedNodeId) {
    return { active: false, relatedEdgeIds, relatedNodeIds };
  }

  relatedNodeIds.add(selectedNodeId);
  for (const edge of Array.isArray(edges) ? edges : []) {
    if (edge?.from === selectedNodeId || edge?.to === selectedNodeId) {
      if (edge.id) {
        relatedEdgeIds.add(edge.id);
      }
      if (edge.from) {
        relatedNodeIds.add(edge.from);
      }
      if (edge.to) {
        relatedNodeIds.add(edge.to);
      }
    }
  }

  return { active: true, relatedEdgeIds, relatedNodeIds };
}

function getNodeDiagnostic(nodeState) {
  if (!nodeState) {
    return { durationText: '', message: '' };
  }

  return {
    durationText: nodeState.durationMs > 0 ? formatFlowDuration(nodeState.durationMs) : '',
    message: truncateFlowText(nodeState.message || nodeState.code || '', 90)
  };
}

function normalizeNodePosition(node = {}) {
  const position = node?.ui?.position ?? {};
  const x = Number(position.x ?? 0);
  const y = Number(position.y ?? 0);
  return {
    x: Number.isFinite(x) ? Math.round(x) : 0,
    y: Number.isFinite(y) ? Math.round(y) : 0
  };
}

function getNodeClasses(input) {
  return [
    'flow-node',
    input.selected ? 'is-selected' : '',
    input.matched ? 'is-matched' : '',
    input.dimmed ? 'is-dimmed' : '',
    input.related ? 'is-related' : '',
    `flow-node--${escapeAttr(input.status)}`
  ].filter(Boolean).join(' ');
}

function getMinimapNodeClasses(input) {
  return [
    'flow-canvas__minimap-node',
    input.status && input.status !== 'idle' ? `flow-canvas__minimap-node--${escapeAttr(input.status)}` : '',
    input.selected ? 'is-selected' : '',
    input.matched ? 'is-matched' : '',
    input.related ? 'is-related' : ''
  ].filter(Boolean).join(' ');
}

function getEdgeClasses(edge, options, edgeStates, adjacency) {
  const state = edgeStates.get(edge.id);
  return [
    edge.id === options.selectedEdgeId ? 'is-selected' : '',
    adjacency?.relatedEdgeIds?.has(edge.id) ? 'is-related' : '',
    state?.active ? 'is-path' : '',
    state?.failed ? 'is-failed-path' : ''
  ].filter(Boolean).join(' ');
}

function getEdgeStateLabel(edge, edgeStates) {
  const condition = edge.condition || 'success';
  const state = edgeStates.get(edge.id);
  if (!state?.active) {
    return condition;
  }
  return state.failed ? `${condition} · failed path` : `${condition} · path`;
}
