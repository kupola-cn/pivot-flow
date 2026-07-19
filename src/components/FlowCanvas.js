import { getFlowNodeCapability } from '../node-types.js';
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

  return [
    '<div class="flow-canvas">',
    '<div class="flow-canvas__summary">',
    `<span>${escapeHTML(nodes.length)} nodes</span>`,
    `<span>${escapeHTML(edges.length)} edges</span>`,
    `<span>${escapeHTML(layout.layers.length)} layers</span>`,
    groups.active ? `<span>${escapeHTML(groups.groups.length)} groups</span>` : '',
    collapsedGroups.size > 0 ? `<span>${escapeHTML(collapsedGroups.size)} collapsed</span>` : '',
    trace.executedNodeIds.length > 0 ? `<span class="flow-canvas__summary-status flow-canvas__summary-status--executed">${escapeHTML(trace.executedNodeIds.length)} executed</span>` : '',
    trace.failedNodeIds.length > 0 ? `<span class="flow-canvas__summary-status flow-canvas__summary-status--failed">${escapeHTML(trace.failedNodeIds.length)} failed</span>` : '',
    trace.skippedNodeIds.length > 0 ? `<span class="flow-canvas__summary-status flow-canvas__summary-status--skipped">${escapeHTML(trace.skippedNodeIds.length)} skipped</span>` : '',
    trace.totalDurationMs > 0 ? `<span>${escapeHTML(formatDuration(trace.totalDurationMs))} total</span>` : '',
    '</div>',
    renderExecutionDiagnostics(diagnostics),
    groups.active
      ? renderGroupedBoard(groups.groups, edges, options, trace.nodeStates, nodeMatches, adjacency, collapsedGroups)
      : renderBoard(layout.layers, options, trace.nodeStates, nodeMatches, adjacency),
    renderEdgeRail(edges, options, trace.edgeStates, adjacency),
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
  return [
    `<li class="${getNodeClasses({ selected, matched, dimmed, related, status })}" data-node-id="${escapeAttr(node.id)}" data-flow-action="select-node">`,
    '<button type="button" class="flow-node__button">',
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
    '</li>'
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

export function getFlowExecutionTrace(result, nodes = [], edges = []) {
  const nodeStates = new Map();
  const edgeStates = new Map();
  const executedNodeIds = [];
  const failedNodeIds = [];
  const skippedNodeIds = [];
  let totalDurationMs = 0;
  const nodeResults = result?.data?.nodes;
  if (!Array.isArray(nodeResults)) {
    return {
      nodeStates,
      edgeStates,
      executedNodeIds,
      failedNodeIds,
      skippedNodeIds,
      firstFailedNodeId: '',
      totalDurationMs
    };
  }

  for (const item of nodeResults) {
    const nodeId = item?.node?.id;
    if (!nodeId) {
      continue;
    }
    const skipped = Boolean(item?.result?.data?.skipped);
    const ok = Boolean(item?.result?.ok);
    const status = skipped ? 'skipped' : ok ? 'executed' : 'failed';
    const durationMs = getResultDurationMs(item);
    const message = getResultMessage(item);
    if (durationMs > 0) {
      totalDurationMs += durationMs;
    }
    nodeStates.set(nodeId, {
      status,
      result: item?.result ?? null,
      durationMs,
      message,
      code: getResultCode(item)
    });

    if (status === 'executed') {
      executedNodeIds.push(nodeId);
    } else if (status === 'failed') {
      failedNodeIds.push(nodeId);
    } else if (status === 'skipped') {
      skippedNodeIds.push(nodeId);
    }
  }

  const knownNodeIds = new Set((Array.isArray(nodes) ? nodes : []).map((node) => node.id));
  for (const edge of Array.isArray(edges) ? edges : []) {
    if (!edge?.id || !knownNodeIds.has(edge.from) || !knownNodeIds.has(edge.to)) {
      continue;
    }
    const fromStatus = nodeStates.get(edge.from)?.status ?? 'idle';
    const toStatus = nodeStates.get(edge.to)?.status ?? 'idle';
    const active = isEdgeOnExecutionPath(edge, fromStatus, toStatus);
    edgeStates.set(edge.id, {
      active,
      failed: active && (fromStatus === 'failed' || toStatus === 'failed'),
      fromStatus,
      toStatus
    });
  }

  return {
    nodeStates,
    edgeStates,
    executedNodeIds,
    failedNodeIds,
    skippedNodeIds,
    firstFailedNodeId: failedNodeIds[0] ?? '',
    totalDurationMs
  };
}

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
        `<small>${escapeHTML(diagnostics.slowestNode.label)} · ${escapeHTML(formatDuration(diagnostics.slowestNode.durationMs))}</small>`,
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
      `<small>${escapeHTML([node.message || node.code, node.durationMs ? formatDuration(node.durationMs) : ''].filter(Boolean).join(' · '))}</small>`,
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

function isEdgeOnExecutionPath(edge, fromStatus, toStatus) {
  if (fromStatus === 'idle' || toStatus === 'idle') {
    return false;
  }

  const condition = typeof edge.condition === 'string' ? edge.condition : 'success';
  if (condition === 'always') {
    return true;
  }
  if (condition === 'success') {
    return fromStatus === 'executed';
  }
  if (condition === 'failure') {
    return fromStatus === 'failed';
  }
  if (condition === 'skipped') {
    return fromStatus === 'skipped';
  }
  return true;
}

function getNodeDiagnostic(nodeState) {
  if (!nodeState) {
    return { durationText: '', message: '' };
  }

  return {
    durationText: nodeState.durationMs > 0 ? formatDuration(nodeState.durationMs) : '',
    message: truncateText(nodeState.message || nodeState.code || '', 90)
  };
}

function getResultDurationMs(item) {
  const candidates = [
    item?.durationMs,
    item?.elapsedMs,
    item?.timeMs,
    item?.result?.durationMs,
    item?.result?.elapsedMs,
    item?.result?.timeMs,
    item?.result?.data?.durationMs,
    item?.result?.data?.elapsedMs,
    item?.result?.meta?.durationMs,
    item?.result?.metadata?.durationMs
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return 0;
}

function getResultMessage(item) {
  const result = item?.result ?? {};
  const data = result?.data ?? {};
  const error = result?.error ?? {};
  const candidates = [
    result.message,
    result.error,
    error.message,
    data.message,
    data.error,
    data.reason,
    data.detail,
    data.summary
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }
    const value = typeof candidate === 'string' ? candidate : JSON.stringify(candidate);
    if (value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function getResultCode(item) {
  const result = item?.result ?? {};
  const data = result?.data ?? {};
  const candidates = [
    result.code,
    result.status,
    data.code,
    data.status
  ];
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
      return String(candidate).trim();
    }
  }
  return '';
}

function formatDuration(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) {
    return '';
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}

function truncateText(value, maxLength) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
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
