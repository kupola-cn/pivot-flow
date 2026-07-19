import { getFlowNodeCapability } from './node-types.js';

export function getFlowNodeNeighborhood(flow, nodeId = '', options = {}) {
  const nodes = Array.isArray(flow?.nodes) ? flow.nodes : [];
  const edges = Array.isArray(flow?.edges) ? flow.edges : [];
  const id = String(nodeId || '').trim();
  const depth = Math.max(1, Number(options.depth || 1));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  if (!id || !nodeById.has(id)) {
    return createEmptyNeighborhood(flow, id);
  }

  const incoming = new Map();
  const outgoing = new Map();
  for (const edge of edges) {
    if (!edge?.from || !edge?.to) {
      continue;
    }
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge]);
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
  }

  const upstream = walkGraph(id, incoming, 'from', depth);
  const downstream = walkGraph(id, outgoing, 'to', depth);
  const relatedIds = new Set([id, ...upstream.nodeIds, ...downstream.nodeIds]);
  const relatedEdges = edges.filter((edge) => relatedIds.has(edge.from) && relatedIds.has(edge.to));
  const relatedNodes = nodes.filter((node) => relatedIds.has(node.id));

  return {
    ok: true,
    flowId: flow?.id || '',
    flowName: flow?.name || '',
    nodeId: id,
    node: nodeById.get(id),
    depth,
    upstream: {
      nodeIds: upstream.nodeIds,
      edgeIds: upstream.edgeIds,
      nodes: upstream.nodeIds.map((item) => nodeById.get(item)).filter(Boolean),
      edges: upstream.edgeIds.map((item) => edges.find((edge) => getEdgeId(edge) === item)).filter(Boolean)
    },
    downstream: {
      nodeIds: downstream.nodeIds,
      edgeIds: downstream.edgeIds,
      nodes: downstream.nodeIds.map((item) => nodeById.get(item)).filter(Boolean),
      edges: downstream.edgeIds.map((item) => edges.find((edge) => getEdgeId(edge) === item)).filter(Boolean)
    },
    relatedNodeIds: Array.from(relatedIds),
    relatedEdgeIds: relatedEdges.map(getEdgeId),
    relatedNodes,
    relatedEdges,
    summary: `${upstream.nodeIds.length} upstream node(s), ${downstream.nodeIds.length} downstream node(s).`
  };
}

export function renderFlowNodeNeighborhoodToHTML(flow, nodeId = '', options = {}) {
  const report = isNeighborhoodReport(flow)
    ? flow
    : getFlowNodeNeighborhood(flow, nodeId, options);

  if (!report.ok) {
    return '<div class="flow-empty flow-empty--compact">Select a node to inspect its upstream and downstream context.</div>';
  }

  return [
    '<section class="flow-node-neighborhood">',
    '<div class="flow-node-neighborhood__header">',
    '<div>',
    `<strong>${escapeHTML(report.node?.label || report.nodeId)}</strong>`,
    `<span>${escapeHTML(report.summary)}</span>`,
    '</div>',
    `<span class="flow-badge">${escapeHTML(report.node?.risk || 'low')}</span>`,
    '</div>',
    '<div class="flow-node-neighborhood__summary">',
    `<span><strong>${escapeHTML(report.upstream.nodeIds.length)}</strong><small>upstream</small></span>`,
    `<span><strong>${escapeHTML(report.downstream.nodeIds.length)}</strong><small>downstream</small></span>`,
    `<span><strong>${escapeHTML(report.relatedEdgeIds.length)}</strong><small>edges</small></span>`,
    '</div>',
    renderNeighborhoodGroup('Upstream', report.upstream.nodes),
    renderNeighborhoodGroup('Downstream', report.downstream.nodes),
    '</section>'
  ].join('');
}

function walkGraph(startId, edgeMap, targetField, depth) {
  const nodeIds = [];
  const edgeIds = [];
  const seen = new Set([startId]);
  const queue = [{ id: startId, level: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.level >= depth) {
      continue;
    }
    for (const edge of edgeMap.get(current.id) ?? []) {
      const nextId = edge[targetField];
      if (!nextId || seen.has(nextId)) {
        continue;
      }
      seen.add(nextId);
      nodeIds.push(nextId);
      edgeIds.push(getEdgeId(edge));
      queue.push({ id: nextId, level: current.level + 1 });
    }
  }

  return { nodeIds, edgeIds };
}

function renderNeighborhoodGroup(title, nodes) {
  if (!nodes.length) {
    return '';
  }

  return [
    '<div class="flow-node-neighborhood__group">',
    `<strong>${escapeHTML(title)}</strong>`,
    '<ol>',
    ...nodes.map((node) => [
      '<li>',
      '<span>',
      `<strong>${escapeHTML(node.label || node.id)}</strong>`,
      `<small>${escapeHTML([node.type, getFlowNodeCapability(node)].filter(Boolean).join(' · '))}</small>`,
      '</span>',
      `<span class="flow-badge flow-badge--${escapeAttr(node.risk || 'low')}">${escapeHTML(node.risk || 'low')}</span>`,
      '</li>'
    ].join('')),
    '</ol>',
    '</div>'
  ].join('');
}

function createEmptyNeighborhood(flow, nodeId) {
  return {
    ok: false,
    flowId: flow?.id || '',
    flowName: flow?.name || '',
    nodeId,
    node: null,
    depth: 0,
    upstream: { nodeIds: [], edgeIds: [], nodes: [], edges: [] },
    downstream: { nodeIds: [], edgeIds: [], nodes: [], edges: [] },
    relatedNodeIds: [],
    relatedEdgeIds: [],
    relatedNodes: [],
    relatedEdges: [],
    summary: 'Node was not found.'
  };
}

function getEdgeId(edge) {
  return edge?.id || `${edge?.from || ''}->${edge?.to || ''}`;
}

function isNeighborhoodReport(value) {
  return value && Array.isArray(value.relatedNodeIds) && Array.isArray(value.relatedEdgeIds) && value.upstream && value.downstream;
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHTML(value);
}
