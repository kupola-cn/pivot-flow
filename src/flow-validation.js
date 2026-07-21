import { FLOW_NODE_TYPES, FLOW_STATUS, getFlowNodeCapability, getFlowNodeTypeDefinition, isCapabilityBackedNode, isKnownFlowNodeType, isKnownFlowStatus, isKnownRiskLevel } from './node-types.js';

export function validateFlow(flow, options = {}) {
  const errors = [];
  const warnings = [];
  const knownCapabilities = normalizeCapabilitySet(options.capabilities);
  const knownSubflows = normalizeSubflowMap(options.subflows);
  const resourceSchemas = normalizeResourceSchemas(options.resourceSchemas ?? options.resources);

  if (!isPlainObject(flow)) {
    return createFlowValidationResult(['Flow must be a plain object.'], warnings);
  }

  requireString(flow, 'id', errors);
  requireString(flow, 'name', errors);

  if (!isKnownFlowStatus(flow.status)) {
    errors.push(`Unknown flow status: ${String(flow.status)}`);
  }

  if (!Array.isArray(flow.nodes)) {
    errors.push('Flow nodes must be an array.');
  }

  if (!Array.isArray(flow.edges)) {
    errors.push('Flow edges must be an array.');
  }

  if (errors.length > 0) {
    return createFlowValidationResult(errors, warnings);
  }

  const nodeIds = new Set();
  const nodeById = new Map();
  const edgeIds = new Set();

  for (const node of flow.nodes) {
    if (!isPlainObject(node)) {
      errors.push('Flow node must be a plain object.');
      continue;
    }

    if (typeof node.id !== 'string' || node.id.trim() === '') {
      errors.push('Flow node id is required.');
      continue;
    }

    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate flow node id: ${node.id}`);
    }

    nodeIds.add(node.id);
    nodeById.set(node.id, node);

    if (!isKnownFlowNodeType(node.type)) {
      errors.push(`Unknown flow node type: ${String(node.type)}`);
    }

    if (node.risk && !isKnownRiskLevel(node.risk)) {
      errors.push(`Unknown flow node risk: ${String(node.risk)}`);
    }

    const capability = getFlowNodeCapability(node);

    const capabilityBacked = isCapabilityBackedNode(node);

    if (capabilityBacked && node.type !== FLOW_NODE_TYPES.CONFIRM && !capability) {
      errors.push(`Flow node capability is required: ${node.id}`);
    }

    if (knownCapabilities && capabilityBacked && capability && !knownCapabilities.has(capability)) {
      errors.push(`Flow node capability is not registered: ${capability}`);
    }

    if (node.type === FLOW_NODE_TYPES.CONDITION && !isPlainObject(node.condition)) {
      errors.push(`Condition node requires a condition object: ${node.id}`);
    }

    if (node.type === FLOW_NODE_TYPES.SWITCH && !isPlainObject(node.condition)) {
      errors.push(`Switch node requires a condition object: ${node.id}`);
    }

    if (node.type === FLOW_NODE_TYPES.TRANSFORM && !isPlainObject(node.params)) {
      errors.push(`Transform node params must be an object: ${node.id}`);
    }

    if (node.type === FLOW_NODE_TYPES.DATA_QUERY && resourceSchemas) {
      validateDataQueryResourceSchema(node, resourceSchemas, errors);
    }

    if (node.type === FLOW_NODE_TYPES.SUBFLOW_RUN) {
      const subflowId = getSubflowId(node);
      if (!subflowId) {
        errors.push(`Subflow node requires params.flowId: ${node.id}`);
      } else if (knownSubflows) {
        validateSubflowContract(node, knownSubflows.get(subflowId), subflowId, errors, warnings);
      }
    }

    const nodeTypeDefinition = getFlowNodeTypeDefinition(node.type);
    if (typeof nodeTypeDefinition?.validate === 'function') {
      const customValidation = nodeTypeDefinition.validate(node, { flow, options });
      collectCustomValidation(customValidation, errors, warnings);
    }
  }

  for (const edge of flow.edges) {
    if (!isPlainObject(edge)) {
      errors.push('Flow edge must be a plain object.');
      continue;
    }

    if (typeof edge.id !== 'string' || edge.id.trim() === '') {
      errors.push('Flow edge id is required.');
    } else if (edgeIds.has(edge.id)) {
      errors.push(`Duplicate flow edge id: ${edge.id}`);
    } else {
      edgeIds.add(edge.id);
    }

    if (!nodeIds.has(edge.from)) {
      errors.push(`Flow edge references unknown from node: ${edge.from}`);
    }

    if (!nodeIds.has(edge.to)) {
      errors.push(`Flow edge references unknown to node: ${edge.to}`);
    }

    if (edge.from === edge.to) {
      errors.push(`Flow edge cannot reference the same node: ${edge.from}`);
    }

    if (!isKnownEdgeCondition(edge.condition)) {
      errors.push(`Unknown flow edge condition: ${String(edge.condition)}`);
    }

    const portValidation = validateEdgePorts(nodeById.get(edge.from), nodeById.get(edge.to), edge);
    if (!portValidation.ok) {
      errors.push(portValidation.message);
    }
  }

  if (hasCycle(flow)) {
    errors.push('Flow contains a cycle.');
  }

  validateIntent(flow.intent, errors, warnings);

  if (flow.status === FLOW_STATUS.PUBLISHED) {
    if (flow.nodes.length === 0) {
      errors.push('Published flow must contain at least one node.');
    }

    const visibleNodes = flow.nodes.filter((node) => node.type !== FLOW_NODE_TYPES.INTENT_INPUT);
    if (visibleNodes.length === 0) {
      errors.push('Published flow must contain executable nodes.');
    }
  }

  if (flow.nodes.length === 0) {
    warnings.push('Flow has no nodes.');
  }

  return createFlowValidationResult(errors, warnings);
}

function isKnownEdgeCondition(condition) {
  if (condition === undefined || condition === null) {
    return true;
  }

  if (typeof condition === 'string') {
    return ['always', 'success', 'failure', 'skipped'].includes(condition);
  }

  return isValidStructuredEdgeCondition(condition);
}

export function createFlowValidationResult(errors = [], warnings = []) {
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export function canConnectFlowNodes(flow, from, to, options = {}) {
  const nodes = Array.isArray(flow?.nodes) ? flow.nodes : [];
  const edges = Array.isArray(flow?.edges) ? flow.edges : [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const fromId = String(from || '').trim();
  const toId = String(to || '').trim();
  const edgeId = String(options.edgeId || '').trim();

  if (!fromId || !nodeIds.has(fromId)) {
    return createConnectionResult(false, `Unknown from node: ${fromId || '-'}.`);
  }
  if (!toId || !nodeIds.has(toId)) {
    return createConnectionResult(false, `Unknown to node: ${toId || '-'}.`);
  }
  if (fromId === toId) {
    return createConnectionResult(false, `Flow edge cannot reference the same node: ${fromId}.`);
  }

  const portValidation = validateEdgePorts(nodeById.get(fromId), nodeById.get(toId), {
    sourcePort: options.sourcePort,
    targetPort: options.targetPort
  });
  if (!portValidation.ok) {
    return createConnectionResult(false, portValidation.message);
  }

  const duplicate = edges.find((edge) => edge.from === fromId && edge.to === toId && (!edgeId || edge.id !== edgeId));
  if (duplicate) {
    return createConnectionResult(false, `Duplicate edge already connects ${fromId} -> ${toId}.`);
  }

  const nextEdges = [
    ...edges.filter((edge) => !edgeId || edge.id !== edgeId),
    { id: edgeId || '__candidate__', from: fromId, to: toId, condition: options.condition ?? 'success' }
  ];
  if (hasCycle({ nodes, edges: nextEdges })) {
    return createConnectionResult(false, `Connecting ${fromId} -> ${toId} would create a cycle.`);
  }

  return createConnectionResult(true, `Connection is valid: ${fromId} -> ${toId}.`);
}

export function getFlowNodePorts(node = {}) {
  const explicitInputs = normalizeFlowPorts(node?.ports?.inputs, 'input');
  const explicitOutputs = normalizeFlowPorts(node?.ports?.outputs, 'output');
  const defaults = DEFAULT_FLOW_NODE_PORTS[node?.type] ?? DEFAULT_FLOW_NODE_PORTS.default;

  return {
    inputs: explicitInputs.length > 0 ? explicitInputs : defaults.inputs,
    outputs: explicitOutputs.length > 0 ? explicitOutputs : defaults.outputs
  };
}

const DEFAULT_FLOW_NODE_PORTS = Object.freeze({
  [FLOW_NODE_TYPES.INTENT_INPUT]: freezePorts({
    inputs: [],
    outputs: [{ id: 'output.value', label: 'Value', kind: 'output', dataType: 'object' }]
  }),
  [FLOW_NODE_TYPES.PARAM_EXTRACT]: freezePorts({
    inputs: [{ id: 'input.prompt', label: 'Prompt', kind: 'input', dataType: 'string' }],
    outputs: [
      { id: 'output.params', label: 'Params', kind: 'output', dataType: 'object' },
      { id: 'output.missing', label: 'Missing', kind: 'output', dataType: 'array' }
    ]
  }),
  [FLOW_NODE_TYPES.PARAM_VALIDATE]: freezePorts({
    inputs: [{ id: 'input.params', label: 'Params', kind: 'input', dataType: 'object' }],
    outputs: [
      { id: 'output.valid', label: 'Valid', kind: 'output', dataType: 'object' },
      { id: 'output.invalid', label: 'Invalid', kind: 'output', dataType: 'object' }
    ]
  }),
  [FLOW_NODE_TYPES.PARAM_NORMALIZE]: freezePorts({
    inputs: [{ id: 'input.params', label: 'Params', kind: 'input', dataType: 'object' }],
    outputs: [{ id: 'output.params', label: 'Params', kind: 'output', dataType: 'object' }]
  }),
  [FLOW_NODE_TYPES.DATA_QUERY]: freezePorts({
    inputs: [{ id: 'input.query', label: 'Query', kind: 'input', dataType: 'object' }],
    outputs: [
      { id: 'output.records', label: 'Records', kind: 'output', dataType: 'array' },
      { id: 'output.empty', label: 'Empty', kind: 'output', dataType: 'void' },
      { id: 'output.error', label: 'Error', kind: 'output', dataType: 'object' }
    ]
  }),
  [FLOW_NODE_TYPES.DATA_GET]: freezePorts({
    inputs: [{ id: 'input.key', label: 'Key', kind: 'input', dataType: 'object' }],
    outputs: [
      { id: 'output.record', label: 'Record', kind: 'output', dataType: 'object' },
      { id: 'output.notFound', label: 'Not found', kind: 'output', dataType: 'void' },
      { id: 'output.error', label: 'Error', kind: 'output', dataType: 'object' }
    ]
  }),
  [FLOW_NODE_TYPES.DATA_AGGREGATE]: freezePorts({
    inputs: [{ id: 'input.records', label: 'Records', kind: 'input', dataType: 'array' }],
    outputs: [
      { id: 'output.result', label: 'Result', kind: 'output', dataType: 'object' },
      { id: 'output.error', label: 'Error', kind: 'output', dataType: 'object' }
    ]
  }),
  [FLOW_NODE_TYPES.DATA_CREATE]: freezePorts({
    inputs: [{ id: 'input.data', label: 'Data', kind: 'input', dataType: 'object' }],
    outputs: [
      { id: 'output.record', label: 'Record', kind: 'output', dataType: 'object' },
      { id: 'output.error', label: 'Error', kind: 'output', dataType: 'object' }
    ]
  }),
  [FLOW_NODE_TYPES.DATA_UPDATE]: freezePorts({
    inputs: [{ id: 'input.data', label: 'Data', kind: 'input', dataType: 'object' }],
    outputs: [
      { id: 'output.records', label: 'Records', kind: 'output', dataType: 'array' },
      { id: 'output.error', label: 'Error', kind: 'output', dataType: 'object' }
    ]
  }),
  [FLOW_NODE_TYPES.DATA_DELETE]: freezePorts({
    inputs: [{ id: 'input.query', label: 'Query', kind: 'input', dataType: 'object' }],
    outputs: [
      { id: 'output.deleted', label: 'Deleted', kind: 'output', dataType: 'number' },
      { id: 'output.error', label: 'Error', kind: 'output', dataType: 'object' }
    ]
  }),
  [FLOW_NODE_TYPES.DATA_FILTER]: freezePorts({
    inputs: [{ id: 'input.items', label: 'Items', kind: 'input', dataType: 'array' }],
    outputs: [{ id: 'output.items', label: 'Items', kind: 'output', dataType: 'array' }]
  }),
  [FLOW_NODE_TYPES.DATA_SORT]: freezePorts({
    inputs: [{ id: 'input.items', label: 'Items', kind: 'input', dataType: 'array' }],
    outputs: [{ id: 'output.items', label: 'Items', kind: 'output', dataType: 'array' }]
  }),
  [FLOW_NODE_TYPES.DATA_MAP]: freezePorts({
    inputs: [{ id: 'input.items', label: 'Items', kind: 'input', dataType: 'array' }],
    outputs: [{ id: 'output.items', label: 'Items', kind: 'output', dataType: 'array' }]
  }),
  [FLOW_NODE_TYPES.DATA_MERGE]: freezePorts({
    inputs: [
      { id: 'input.left', label: 'Left', kind: 'input', dataType: 'array' },
      { id: 'input.right', label: 'Right', kind: 'input', dataType: 'array' }
    ],
    outputs: [{ id: 'output.items', label: 'Items', kind: 'output', dataType: 'array' }]
  }),
  [FLOW_NODE_TYPES.DATA_PICK]: freezePorts({
    inputs: [{ id: 'input.data', label: 'Data', kind: 'input', dataType: 'object' }],
    outputs: [
      { id: 'output.value', label: 'Value', kind: 'output', dataType: 'object' },
      { id: 'output.empty', label: 'Empty', kind: 'output', dataType: 'void' }
    ]
  }),
  [FLOW_NODE_TYPES.DATA_DEDUPE]: freezePorts({
    inputs: [{ id: 'input.items', label: 'Items', kind: 'input', dataType: 'array' }],
    outputs: [{ id: 'output.items', label: 'Items', kind: 'output', dataType: 'array' }]
  }),
  [FLOW_NODE_TYPES.CAPABILITY_RUN]: freezePorts({
    inputs: [{ id: 'input.params', label: 'Params', kind: 'input', dataType: 'object' }],
    outputs: [
      { id: 'output.result', label: 'Result', kind: 'output', dataType: 'object' },
      { id: 'output.error', label: 'Error', kind: 'output', dataType: 'object' }
    ]
  }),
  [FLOW_NODE_TYPES.CAPABILITY_CALL]: freezePorts({
    inputs: [{ id: 'input.params', label: 'Params', kind: 'input', dataType: 'object' }],
    outputs: [
      { id: 'output.result', label: 'Result', kind: 'output', dataType: 'object' },
      { id: 'output.error', label: 'Error', kind: 'output', dataType: 'object' }
    ]
  }),
  [FLOW_NODE_TYPES.CONDITION]: freezePorts({
    inputs: [{ id: 'input.value', label: 'Value', kind: 'input', dataType: 'object' }],
    outputs: [
      { id: 'output.true', label: 'True', kind: 'output', dataType: 'boolean' },
      { id: 'output.false', label: 'False', kind: 'output', dataType: 'boolean' }
    ]
  }),
  [FLOW_NODE_TYPES.SWITCH]: freezePorts({
    inputs: [{ id: 'input.value', label: 'Value', kind: 'input', dataType: 'object' }],
    outputs: [{ id: 'output.default', label: 'Default', kind: 'output', dataType: 'object' }]
  }),
  [FLOW_NODE_TYPES.LOOP]: freezePorts({
    inputs: [{ id: 'input.items', label: 'Items', kind: 'input', dataType: 'array' }],
    outputs: [
      { id: 'output.item', label: 'Item', kind: 'output', dataType: 'object' },
      { id: 'output.done', label: 'Done', kind: 'output', dataType: 'array' }
    ]
  }),
  [FLOW_NODE_TYPES.HUMAN_INPUT]: freezePorts({
    inputs: [{ id: 'input.request', label: 'Request', kind: 'input', dataType: 'object' }],
    outputs: [
      { id: 'output.value', label: 'Value', kind: 'output', dataType: 'object' },
      { id: 'output.cancelled', label: 'Cancelled', kind: 'output', dataType: 'void' }
    ]
  }),
  [FLOW_NODE_TYPES.HUMAN_SELECT]: freezePorts({
    inputs: [{ id: 'input.payload', label: 'Payload', kind: 'input', dataType: 'array' }],
    outputs: [
      { id: 'output.selected', label: 'Selected', kind: 'output', dataType: 'object' },
      { id: 'output.cancelled', label: 'Cancelled', kind: 'output', dataType: 'void' }
    ]
  }),
  [FLOW_NODE_TYPES.UI_DISPLAY]: freezePorts({
    inputs: [{ id: 'input.data', label: 'Data', kind: 'input', dataType: 'object' }],
    outputs: [{ id: 'output.done', label: 'Done', kind: 'output', dataType: 'void' }]
  }),
  [FLOW_NODE_TYPES.OUTPUT_MESSAGE]: freezePorts({
    inputs: [{ id: 'input.data', label: 'Data', kind: 'input', dataType: 'object' }],
    outputs: [{ id: 'output.done', label: 'Done', kind: 'output', dataType: 'void' }]
  }),
  [FLOW_NODE_TYPES.OUTPUT_RESULT]: freezePorts({
    inputs: [{ id: 'input.data', label: 'Data', kind: 'input', dataType: 'object' }],
    outputs: [{ id: 'output.done', label: 'Done', kind: 'output', dataType: 'void' }]
  }),
  [FLOW_NODE_TYPES.OUTPUT_TABLE]: freezePorts({
    inputs: [{ id: 'input.records', label: 'Records', kind: 'input', dataType: 'array' }],
    outputs: [{ id: 'output.done', label: 'Done', kind: 'output', dataType: 'void' }]
  }),
  [FLOW_NODE_TYPES.OUTPUT_DETAIL]: freezePorts({
    inputs: [{ id: 'input.record', label: 'Record', kind: 'input', dataType: 'object' }],
    outputs: [{ id: 'output.done', label: 'Done', kind: 'output', dataType: 'void' }]
  }),
  [FLOW_NODE_TYPES.OUTPUT_OPTIONS]: freezePorts({
    inputs: [{ id: 'input.options', label: 'Options', kind: 'input', dataType: 'array' }],
    outputs: [{ id: 'output.done', label: 'Done', kind: 'output', dataType: 'void' }]
  }),
  [FLOW_NODE_TYPES.CONFIRM]: freezePorts({
    inputs: [{ id: 'input.payload', label: 'Payload', kind: 'input', dataType: 'object' }],
    outputs: [
      { id: 'output.confirmed', label: 'Confirmed', kind: 'output', dataType: 'object' },
      { id: 'output.rejected', label: 'Rejected', kind: 'output', dataType: 'void' }
    ]
  }),
  default: freezePorts({
    inputs: [{ id: 'input', label: 'Input', kind: 'input', dataType: 'object' }],
    outputs: [{ id: 'output', label: 'Output', kind: 'output', dataType: 'object' }]
  })
});

function validateEdgePorts(fromNode, toNode, edge = {}) {
  const sourcePort = String(edge.sourcePort || '').trim();
  const targetPort = String(edge.targetPort || '').trim();

  if (sourcePort && fromNode) {
    const outputPorts = getFlowNodePorts(fromNode).outputs;
    if (!outputPorts.some((port) => port.id === sourcePort)) {
      return createConnectionResult(false, `Unknown source port ${sourcePort} on node ${fromNode.id}.`);
    }
  }

  if (targetPort && toNode) {
    const inputPorts = getFlowNodePorts(toNode).inputs;
    if (!inputPorts.some((port) => port.id === targetPort)) {
      return createConnectionResult(false, `Unknown target port ${targetPort} on node ${toNode.id}.`);
    }
  }

  return createConnectionResult(true, 'Ports are valid.');
}

function normalizeFlowPorts(value, kind) {
  const list = Array.isArray(value)
    ? value
    : isPlainObject(value)
      ? Object.entries(value).map(([id, port]) => ({ id, ...(isPlainObject(port) ? port : {}) }))
      : [];

  return list
    .map((port) => ({
      id: String(port?.id || '').trim(),
      label: String(port?.label || port?.id || '').trim(),
      kind,
      dataType: port?.dataType || 'object',
      required: Boolean(port?.required),
      cardinality: port?.cardinality || 'one'
    }))
    .filter((port) => port.id);
}

function freezePorts(ports) {
  return Object.freeze({
    inputs: Object.freeze(ports.inputs.map((port) => Object.freeze(port))),
    outputs: Object.freeze(ports.outputs.map((port) => Object.freeze(port)))
  });
}

function createConnectionResult(ok, message) {
  return {
    ok,
    message,
    valid: ok
  };
}

function validateIntent(intent = {}, errors, warnings) {
  const slots = Array.isArray(intent.slots) ? intent.slots : [];
  const names = new Set();

  for (const slot of slots) {
    if (!isPlainObject(slot)) {
      errors.push('Flow intent slot must be a plain object.');
      continue;
    }

    if (typeof slot.name !== 'string' || slot.name.trim() === '') {
      errors.push('Flow intent slot name is required.');
      continue;
    }

    if (names.has(slot.name)) {
      errors.push(`Duplicate flow intent slot: ${slot.name}`);
    }

    names.add(slot.name);

    if (slot.required && !slot.pattern && slot.fallback === undefined && slot.source !== 'context' && slot.source !== 'manual') {
      warnings.push(`Required slot has no pattern or fallback: ${slot.name}`);
    }
  }
}

function hasCycle(flow) {
  if (!Array.isArray(flow.nodes) || !Array.isArray(flow.edges)) {
    return false;
  }

  const outgoing = new Map(flow.nodes.map((node) => [node.id, []]));
  for (const edge of flow.edges) {
    if (outgoing.has(edge.from)) {
      outgoing.get(edge.from).push(edge.to);
    }
  }

  const visiting = new Set();
  const visited = new Set();

  const visit = (id) => {
    if (visiting.has(id)) {
      return true;
    }

    if (visited.has(id)) {
      return false;
    }

    visiting.add(id);

    for (const next of outgoing.get(id) ?? []) {
      if (visit(next)) {
        return true;
      }
    }

    visiting.delete(id);
    visited.add(id);
    return false;
  };

  return flow.nodes.some((node) => visit(node.id));
}

function normalizeCapabilitySet(capabilities) {
  if (!capabilities) {
    return null;
  }

  if (capabilities instanceof Set) {
    return capabilities;
  }

  if (Array.isArray(capabilities)) {
    return new Set(capabilities.map((capability) => typeof capability === 'string' ? capability : capability?.name).filter(Boolean));
  }

  if (typeof capabilities.list === 'function') {
    return normalizeCapabilitySet(capabilities.list());
  }

  return null;
}

function normalizeSubflowMap(subflows) {
  if (!subflows) {
    return null;
  }

  if (subflows instanceof Map) {
    return subflows;
  }

  if (Array.isArray(subflows)) {
    return new Map(subflows.map((flow) => [flow?.id, flow]).filter(([id]) => id));
  }

  if (typeof subflows.list === 'function') {
    return normalizeSubflowMap(subflows.list());
  }

  if (isPlainObject(subflows)) {
    return new Map(Object.entries(subflows));
  }

  return null;
}

function normalizeResourceSchemas(resources) {
  if (!resources) {
    return null;
  }

  if (resources instanceof Map) {
    return resources;
  }

  if (Array.isArray(resources)) {
    return new Map(resources.map((resource) => [resource?.name ?? resource?.id, resource]).filter(([name]) => name));
  }

  if (typeof resources.list === 'function') {
    return normalizeResourceSchemas(resources.list());
  }

  if (isPlainObject(resources)) {
    return new Map(Object.entries(resources));
  }

  return null;
}

function getSubflowId(node) {
  return String(node?.params?.flowId ?? node?.flowId ?? '').trim();
}

function validateDataQueryResourceSchema(node, resourceSchemas, errors) {
  const resourceName = String(node.resource || node.params?.resource || '').trim();
  if (!resourceName) {
    return;
  }

  const resourceSchema = resourceSchemas.get(resourceName);
  if (!resourceSchema) {
    errors.push(`Resource schema was not found: ${resourceName} on ${node.id}`);
    return;
  }

  const fields = getResourceFieldNames(resourceSchema);
  const filters = Array.isArray(node.params?.filters) ? node.params.filters : [];
  for (const filter of filters) {
    const field = String(filter?.field || '').trim();
    if (field && fields.size > 0 && !fields.has(field)) {
      errors.push(`Query filter field is not declared by resource ${resourceName}: ${field} on ${node.id}`);
    }
  }

  if (node.params?.include === undefined) {
    return;
  }

  if (!Array.isArray(node.params.include)) {
    errors.push(`Query include must be an array: ${node.id}`);
    return;
  }

  const relations = getResourceRelationNames(resourceSchema);
  for (const include of node.params.include) {
    const relation = typeof include === 'string' ? include : include?.relation ?? include?.name;
    const relationName = String(relation || '').trim();
    if (relationName && relations.size > 0 && !relations.has(relationName)) {
      errors.push(`Query include relation is not declared by resource ${resourceName}: ${relationName} on ${node.id}`);
    }
  }
}

function getResourceFieldNames(resourceSchema) {
  const fields = resourceSchema?.fields;
  if (isPlainObject(fields)) {
    return new Set(Object.keys(fields));
  }
  if (Array.isArray(fields)) {
    return new Set(fields.map((field) => typeof field === 'string' ? field : field?.name).filter(Boolean));
  }
  return new Set();
}

function getResourceRelationNames(resourceSchema) {
  const relations = resourceSchema?.relations ?? resourceSchema?.includes;
  if (isPlainObject(relations)) {
    return new Set(Object.keys(relations));
  }
  if (Array.isArray(relations)) {
    return new Set(relations.map((relation) => typeof relation === 'string' ? relation : relation?.name).filter(Boolean));
  }
  return new Set();
}

function validateSubflowContract(node, subflow, subflowId, errors, warnings) {
  if (!subflow) {
    errors.push(`Subflow definition was not found: ${subflowId}`);
    return;
  }

  const inputSchema = getSubflowInputSchema(subflow);
  const outputSchema = getSubflowOutputSchema(subflow);
  const input = node.params?.input ?? node.input ?? {};

  validateSchemaValue(input, inputSchema, `Subflow input`, node.id, errors);
  validateOutputSchemaCompatibility(node.outputSchema, outputSchema, node.id, errors, warnings);
}

function getSubflowInputSchema(subflow) {
  if (isPlainObject(subflow?.inputSchema)) {
    return subflow.inputSchema;
  }

  if (isPlainObject(subflow?.metadata?.inputSchema)) {
    return subflow.metadata.inputSchema;
  }

  const slots = Array.isArray(subflow?.intent?.slots) ? subflow.intent.slots : [];
  return Object.fromEntries(slots.map((slot) => [
    slot.name,
    {
      type: slot.type || 'string',
      required: Boolean(slot.required)
    }
  ]).filter(([name]) => name));
}

function getSubflowOutputSchema(subflow) {
  if (isPlainObject(subflow?.outputSchema)) {
    return subflow.outputSchema;
  }

  if (isPlainObject(subflow?.metadata?.outputSchema)) {
    return subflow.metadata.outputSchema;
  }

  return {};
}

function validateSchemaValue(value, schema, label, nodeId, errors) {
  if (!isPlainObject(schema) || Object.keys(schema).length === 0) {
    return;
  }

  if (!isPlainObject(value)) {
    errors.push(`${label} must be an object: ${nodeId}`);
    return;
  }

  for (const [field, rule] of Object.entries(schema)) {
    const normalizedRule = normalizeSchemaRule(rule);
    const fieldValue = value[field];
    if (normalizedRule.required && isMissingValue(fieldValue)) {
      errors.push(`${label} missing required field ${field}: ${nodeId}`);
      continue;
    }
    if (isMissingValue(fieldValue) || isDynamicReference(fieldValue)) {
      continue;
    }
    if (!matchesSchemaType(fieldValue, normalizedRule.type)) {
      errors.push(`${label} field ${field} expected ${normalizedRule.type}: ${nodeId}`);
    }
  }
}

function validateOutputSchemaCompatibility(nodeOutputSchema, subflowOutputSchema, nodeId, errors, warnings) {
  if (!isPlainObject(subflowOutputSchema) || Object.keys(subflowOutputSchema).length === 0) {
    return;
  }

  if (!isPlainObject(nodeOutputSchema) || Object.keys(nodeOutputSchema).length === 0) {
    warnings.push(`Subflow node outputSchema is not declared: ${nodeId}`);
    return;
  }

  for (const [field, rule] of Object.entries(nodeOutputSchema)) {
    const expected = normalizeSchemaRule(subflowOutputSchema[field]);
    const actual = normalizeSchemaRule(rule);
    if (!subflowOutputSchema[field]) {
      errors.push(`Subflow output field is not declared by child flow: ${field} on ${nodeId}`);
      continue;
    }
    if (expected.type && actual.type && expected.type !== actual.type) {
      errors.push(`Subflow output field ${field} expected ${expected.type} but node declares ${actual.type}: ${nodeId}`);
    }
  }
}

function normalizeSchemaRule(rule) {
  if (typeof rule === 'string') {
    return { type: rule, required: false };
  }

  const safeRule = isPlainObject(rule) ? rule : {};
  return {
    type: safeRule.type || inferSchemaType(safeRule.default ?? safeRule.defaultValue),
    required: Boolean(safeRule.required)
  };
}

function matchesSchemaType(value, type) {
  if (!type || type === 'any') {
    return true;
  }
  if (type === 'array') {
    return Array.isArray(value);
  }
  if (type === 'object') {
    return isPlainObject(value);
  }
  if (type === 'number') {
    return typeof value === 'number' && Number.isFinite(value);
  }
  if (type === 'boolean') {
    return typeof value === 'boolean';
  }
  if (type === 'string' || type === 'text' || type === 'date') {
    return typeof value === 'string';
  }
  return true;
}

function isDynamicReference(value) {
  return typeof value === 'string' && /^\{\{\s*[^}]+?\s*\}\}$/.test(value)
    || isPlainObject(value) && typeof value.$from === 'string';
}

function isMissingValue(value) {
  return value === undefined || value === null || value === '';
}

function inferSchemaType(value) {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (isPlainObject(value)) {
    return 'object';
  }
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  if (typeof value === 'number') {
    return 'number';
  }
  return 'string';
}

function collectCustomValidation(validation, errors, warnings) {
  if (!validation) {
    return;
  }

  if (Array.isArray(validation.errors)) {
    errors.push(...validation.errors.filter(Boolean));
  }

  if (Array.isArray(validation.warnings)) {
    warnings.push(...validation.warnings.filter(Boolean));
  }

  if (typeof validation === 'string') {
    errors.push(validation);
  }
}

function isValidStructuredEdgeCondition(condition) {
  if (!isPlainObject(condition)) {
    return false;
  }

  const allowedFields = new Set([
    'ok',
    'skipped',
    'path',
    'exists',
    'equals',
    'notEquals',
    'in',
    'gt',
    'gte',
    'lt',
    'lte',
    'contains',
    'empty',
    'notEmpty'
  ]);

  for (const field of Object.keys(condition)) {
    if (!allowedFields.has(field)) {
      return false;
    }
  }

  if (condition.ok !== undefined && typeof condition.ok !== 'boolean') {
    return false;
  }

  if (condition.skipped !== undefined && typeof condition.skipped !== 'boolean') {
    return false;
  }

  if (condition.path !== undefined && (typeof condition.path !== 'string' || condition.path.trim() === '')) {
    return false;
  }

  if (condition.exists !== undefined && typeof condition.exists !== 'boolean') {
    return false;
  }

  if (condition.in !== undefined && !Array.isArray(condition.in)) {
    return false;
  }

  if (condition.empty !== undefined && typeof condition.empty !== 'boolean') {
    return false;
  }

  if (condition.notEmpty !== undefined && typeof condition.notEmpty !== 'boolean') {
    return false;
  }

  return true;
}

function requireString(target, field, errors) {
  if (typeof target[field] !== 'string' || target[field].trim() === '') {
    errors.push(`Flow field is required: ${field}`);
  }
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}
