import { createFlowEdge, createFlowNode } from './flow-schema.js';
import { canConnectFlowNodes } from './flow-validation.js';

export function createFlowCanvasState(flow = {}, options = {}) {
  return {
    flowId: flow.id ?? '',
    selectedNodeId: options.selectedNodeId ?? '',
    selectedEdgeId: options.selectedEdgeId ?? '',
    zoom: clamp(Number(options.zoom ?? 1), 0.4, 2),
    pan: normalizePoint(options.pan),
    positions: normalizeFlowCanvasPositions(flow, options.positions)
  };
}

export function normalizeFlowCanvasPositions(flow = {}, positions = {}) {
  const map = new Map(Object.entries(positions instanceof Map ? Object.fromEntries(positions) : positions ?? {}));
  return (flow.nodes ?? []).reduce((output, node, index) => {
    output[node.id] = normalizePoint(map.get(node.id) ?? node.ui?.position ?? { x: (index % 4) * 260, y: Math.floor(index / 4) * 140 });
    return output;
  }, {});
}

export function moveFlowCanvasNode(state = {}, nodeId = '', point = {}) {
  if (!nodeId) {
    throw new Error('A node id is required to move a canvas node.');
  }
  return {
    ...state,
    selectedNodeId: nodeId,
    positions: {
      ...(state.positions ?? {}),
      [nodeId]: normalizePoint(point)
    }
  };
}

export function addFlowCanvasNode(flow = {}, nodeInput = {}, point = {}) {
  const node = createFlowNode(nodeInput);
  return {
    flow: { ...flow, nodes: [...(flow.nodes ?? []), { ...node, ui: { ...(node.ui ?? {}), position: normalizePoint(point) } }] },
    node
  };
}

export function connectFlowCanvasNodes(flow = {}, from = '', to = '', options = {}) {
  const connection = canConnectFlowNodes(flow, from, to, options);
  if (!connection.ok) {
    return { ok: false, message: connection.message, flow };
  }
  const edge = createFlowEdge({ from, to, condition: options.condition ?? 'success' });
  return { ok: true, message: connection.message, edge, flow: { ...flow, edges: [...(flow.edges ?? []), edge] } };
}

function normalizePoint(point = {}) {
  return { x: Number(point.x ?? 0), y: Number(point.y ?? 0) };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 1));
}

