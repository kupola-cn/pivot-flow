import { FLOW_NODE_TYPES, FLOW_STATUS, isCapabilityBackedNode, isKnownFlowNodeType, isKnownFlowStatus, isKnownRiskLevel } from './node-types.js';

export function validateFlow(flow, options = {}) {
  const errors = [];
  const warnings = [];
  const knownCapabilities = normalizeCapabilitySet(options.capabilities);

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

    if (isCapabilityBackedNode(node) && node.type !== FLOW_NODE_TYPES.CONFIRM && !node.capability) {
      errors.push(`Flow node capability is required: ${node.id}`);
    }

    if (knownCapabilities && node.capability && !knownCapabilities.has(node.capability)) {
      errors.push(`Flow node capability is not registered: ${node.capability}`);
    }
  }

  for (const edge of flow.edges) {
    if (!isPlainObject(edge)) {
      errors.push('Flow edge must be a plain object.');
      continue;
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

export function createFlowValidationResult(errors = [], warnings = []) {
  return {
    valid: errors.length === 0,
    errors,
    warnings
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

function requireString(target, field, errors) {
  if (typeof target[field] !== 'string' || target[field].trim() === '') {
    errors.push(`Flow field is required: ${field}`);
  }
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}
