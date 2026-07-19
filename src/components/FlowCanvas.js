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
  const nodeStates = getFlowNodeStates(options.result ?? options.preview);

  return [
    '<div class="flow-canvas">',
    '<div class="flow-canvas__summary">',
    `<span>${escapeHTML(nodes.length)} nodes</span>`,
    `<span>${escapeHTML(edges.length)} edges</span>`,
    `<span>${escapeHTML(layout.layers.length)} layers</span>`,
    '</div>',
    '<div class="flow-canvas__board">',
    ...layout.layers.map((layer, index) => renderLayer(layer, index, options, nodeStates)),
    '</div>',
    renderEdgeRail(edges, options),
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

function renderLayer(layer, index, options, nodeStates) {
  return [
    '<section class="flow-canvas__layer">',
    '<div class="flow-canvas__layer-title">',
    `<span>Layer ${escapeHTML(index + 1)}</span>`,
    `<small>${escapeHTML(layer.length)} node${layer.length === 1 ? '' : 's'}</small>`,
    '</div>',
    '<ol class="flow-canvas__nodes">',
    ...layer.map((item) => renderNodeCard(item.node, item.index, options, nodeStates.get(item.node.id))),
    '</ol>',
    '</section>'
  ].join('');
}

export function renderNodeCard(node, index, options = {}, nodeState = null) {
  const selected = options.selectedNodeId === node.id;
  const status = nodeState?.status ?? 'idle';
  const capability = getFlowNodeCapability(node);
  return [
    `<li class="flow-node${selected ? ' is-selected' : ''} flow-node--${escapeAttr(status)}" data-node-id="${escapeAttr(node.id)}" data-flow-action="select-node">`,
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
    '</span>',
    '</span>',
    `<span class="flow-badge flow-badge--${escapeAttr(node.risk || 'low')}">${escapeHTML(node.risk || 'low')}</span>`,
    '</button>',
    '</li>'
  ].join('');
}

function renderEdgeRail(edges, options = {}) {
  if (!Array.isArray(edges) || edges.length === 0) {
    return '';
  }

  return [
    '<div class="flow-canvas__edge-rail">',
    '<div class="flow-canvas__edge-title">Edges</div>',
    '<ol>',
    ...edges.map((edge) => [
      `<li class="${edge.id === options.selectedEdgeId ? 'is-selected' : ''}">`,
      `<button type="button" data-flow-action="select-edge" data-edge-id="${escapeAttr(edge.id)}">`,
      `<span>${escapeHTML(edge.from || '-')} -> ${escapeHTML(edge.to || '-')}</span>`,
      `<small>${escapeHTML(edge.condition || 'success')}</small>`,
      '</button>',
      '</li>'
    ].join('')),
    '</ol>',
    '</div>'
  ].join('');
}

function getFlowNodeStates(result) {
  const states = new Map();
  const nodeResults = result?.data?.nodes;
  if (!Array.isArray(nodeResults)) {
    return states;
  }

  for (const item of nodeResults) {
    const nodeId = item?.node?.id;
    if (!nodeId) {
      continue;
    }
    const skipped = Boolean(item?.result?.data?.skipped);
    const ok = Boolean(item?.result?.ok);
    states.set(nodeId, {
      status: skipped ? 'skipped' : ok ? 'executed' : 'failed'
    });
  }
  return states;
}
