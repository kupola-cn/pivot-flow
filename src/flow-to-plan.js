import { createPlan } from '@kupola/pivot';
import { normalizeFlow } from './flow-schema.js';
import { validateFlow } from './flow-validation.js';
import { FLOW_NODE_TYPES, isPlanVisibleNode } from './node-types.js';

const TEMPLATE_PATTERN = /^\{\{\s*([^}]+?)\s*\}\}$/;

export function flowToPlan(flowInput, input = {}, context = {}) {
  const flow = normalizeFlow(flowInput);
  const validation = validateFlow(flow, input);

  if (!validation.valid) {
    const error = new Error(`Invalid PIVOT Flow: ${validation.errors.join('; ')}`);
    error.validation = validation;
    throw error;
  }

  const planNodeIds = new Set();
  const nodes = [];

  for (const node of flow.nodes) {
    const planNode = flowNodeToPlanNode(node, flow, input, context);
    if (!planNode) {
      continue;
    }

    planNodeIds.add(planNode.id);
    nodes.push(planNode);
  }

  const edges = flow.edges
    .filter((edge) => planNodeIds.has(edge.from) && planNodeIds.has(edge.to))
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      condition: edge.condition ?? 'success'
    }));

  return createPlan({
    id: input.planId ?? `flow-plan:${flow.id}:${Date.now()}`,
    intent: input.prompt ?? flow.name,
    nodes,
    edges,
    metadata: {
      ...(flow.metadata ?? {}),
      flowId: flow.id,
      flowName: flow.name,
      flowVersion: flow.version,
      prompt: input.prompt ?? ''
    }
  });
}

export function flowNodeToPlanNode(node, flow, input = {}, context = {}) {
  if (!isPlanVisibleNode(node)) {
    return null;
  }

  if (node.type === FLOW_NODE_TYPES.CONFIRM) {
    return {
      id: node.id,
      type: 'approval',
      intent: node.label || flow.name,
      approval: {
        title: node.label || 'Confirm flow step',
        description: node.description ?? node.metadata?.description ?? 'This flow step requires confirmation.',
        risk: node.risk ?? flow.risk ?? 'medium'
      },
      metadata: {
        ...(node.metadata ?? {}),
        flowNodeType: node.type
      }
    };
  }

  return {
    id: node.id,
    capability: node.capability,
    intent: node.label || flow.name,
    risk: node.risk,
    params: resolveFlowParams(node.params ?? {}, input, context),
    inputSchema: node.inputSchema,
    outputSchema: node.outputSchema,
    metadata: {
      ...(node.metadata ?? {}),
      flowNodeType: node.type,
      flowId: flow.id
    }
  };
}

export function resolveFlowParams(value, input = {}, context = {}) {
  if (Array.isArray(value)) {
    return value.map((item) => resolveFlowParams(item, input, context));
  }

  if (isPlainObject(value)) {
    if (typeof value.$from === 'string') {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, resolveFlowParams(entryValue, input, context)])
    );
  }

  if (typeof value !== 'string') {
    return value;
  }

  const template = value.match(TEMPLATE_PATTERN);
  if (!template) {
    return value;
  }

  return resolveTemplateReference(template[1], input, context);
}

export function resolveTemplateReference(reference, input = {}, context = {}) {
  const path = String(reference || '').trim();

  if (!path) {
    return '';
  }

  if (path.startsWith('intent.')) {
    return readPath(input.slots ?? {}, path.slice('intent.'.length));
  }

  if (path.startsWith('context.')) {
    return readPath(context, path.slice('context.'.length));
  }

  const [nodeId, ...rest] = path.split('.');
  return {
    $from: nodeId,
    path: rest.join('.') || 'data'
  };
}

function readPath(source, path) {
  const parts = String(path).split('.').filter(Boolean);
  let current = source;

  for (const part of parts) {
    if (current === null || current === undefined || !Object.hasOwn(Object(current), part)) {
      return '';
    }

    current = current[part];
  }

  return current;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}
