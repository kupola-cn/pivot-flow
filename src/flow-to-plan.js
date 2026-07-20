import { createPlan } from '@kupola/pivot';
import { normalizeFlow } from './flow-schema.js';
import { validateFlow } from './flow-validation.js';
import { FLOW_NODE_TYPES, getFlowNodeCapability, getFlowNodeTypeDefinition, isPlanVisibleNode } from './node-types.js';

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

  const nodeTypeDefinition = getFlowNodeTypeDefinition(node.type);
  if (typeof nodeTypeDefinition?.toPlanNode === 'function') {
    const planNode = nodeTypeDefinition.toPlanNode(node, {
      flow,
      input,
      context,
      resolveFlowParams,
      getFlowNodeCapability
    });
    return planNode ? normalizeCustomPlanNode(planNode, node, flow, input, context) : null;
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

  if (node.type === FLOW_NODE_TYPES.SUBFLOW_RUN) {
    return createCapabilityPlanNode(node, flow, input, context, {
      flowId: node.params?.flowId ?? node.flowId,
      version: node.params?.version ?? node.version,
      input: node.params?.input ?? node.input ?? {}
    });
  }

  if ([FLOW_NODE_TYPES.DATA_QUERY, FLOW_NODE_TYPES.DATA_GET, FLOW_NODE_TYPES.DATA_AGGREGATE, FLOW_NODE_TYPES.DATA_CREATE, FLOW_NODE_TYPES.DATA_UPDATE, FLOW_NODE_TYPES.DATA_DELETE].includes(node.type)) {
    return createCapabilityPlanNode(node, flow, input, context, {
      resource: node.resource,
      action: node.action || getDefaultDataAction(node.type),
      ...(node.params ?? {})
    });
  }

  if ([FLOW_NODE_TYPES.HUMAN_INPUT, FLOW_NODE_TYPES.HUMAN_SELECT, FLOW_NODE_TYPES.UI_DISPLAY].includes(node.type)) {
    return createCapabilityPlanNode(node, flow, input, context, node.params ?? {});
  }

  return createCapabilityPlanNode(node, flow, input, context, node.params ?? {});
}

function getDefaultDataAction(type) {
  return {
    [FLOW_NODE_TYPES.DATA_QUERY]: 'query',
    [FLOW_NODE_TYPES.DATA_GET]: 'get',
    [FLOW_NODE_TYPES.DATA_AGGREGATE]: 'aggregate',
    [FLOW_NODE_TYPES.DATA_CREATE]: 'create',
    [FLOW_NODE_TYPES.DATA_UPDATE]: 'update',
    [FLOW_NODE_TYPES.DATA_DELETE]: 'delete'
  }[type] || '';
}

function createCapabilityPlanNode(node, flow, input, context, params) {
  return {
    id: node.id,
    capability: getFlowNodeCapability(node),
    intent: node.label || flow.name,
    risk: node.risk,
    params: resolveFlowParams(params ?? {}, input, context),
    inputSchema: node.inputSchema,
    outputSchema: node.outputSchema,
    metadata: {
      ...(node.metadata ?? {}),
      flowNodeType: node.type,
      flowId: flow.id
    }
  };
}

function normalizeCustomPlanNode(planNode, sourceNode, flow, input, context) {
  return {
    ...planNode,
    id: planNode.id ?? sourceNode.id,
    intent: planNode.intent ?? sourceNode.label ?? flow.name,
    risk: planNode.risk ?? sourceNode.risk,
    params: resolveFlowParams(planNode.params ?? {}, input, context),
    inputSchema: planNode.inputSchema ?? sourceNode.inputSchema,
    outputSchema: planNode.outputSchema ?? sourceNode.outputSchema,
    metadata: {
      ...(sourceNode.metadata ?? {}),
      ...(planNode.metadata ?? {}),
      flowNodeType: sourceNode.type,
      flowId: flow.id,
      customNodeType: sourceNode.type
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
