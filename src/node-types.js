export const FLOW_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  DISABLED: 'disabled',
  ARCHIVED: 'archived'
});

export const FLOW_NODE_TYPES = Object.freeze({
  INTENT_INPUT: 'intent.input',
  API_CALL: 'api.call',
  CAPABILITY_RUN: 'capability.run',
  DATA_QUERY: 'data.query',
  CONDITION: 'condition',
  CONFIRM: 'confirm',
  TRANSFORM: 'transform',
  HUMAN_SELECT: 'human.select',
  UI_DISPLAY: 'ui.display',
  OUTPUT_RETURN: 'output.return',
  SUBFLOW_RUN: 'subflow.run',
  MESSAGE_SHOW: 'message.show',
  ROUTE_NAVIGATE: 'route.navigate',
  TABLE_REFRESH: 'table.refresh',
  FORM_OPEN: 'form.open',
  DRAWER_OPEN: 'drawer.open',
  MODAL_OPEN: 'modal.open',
  AUDIT_MARK: 'audit.mark'
});

export const FLOW_RISK_LEVELS = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
});

export const DEFAULT_NODE_CAPABILITY_MAP = Object.freeze({
  [FLOW_NODE_TYPES.HUMAN_SELECT]: 'human.select',
  [FLOW_NODE_TYPES.UI_DISPLAY]: 'ui.display',
  [FLOW_NODE_TYPES.SUBFLOW_RUN]: 'flow.subflow.run',
  [FLOW_NODE_TYPES.MESSAGE_SHOW]: 'message.show',
  [FLOW_NODE_TYPES.ROUTE_NAVIGATE]: 'route.navigate',
  [FLOW_NODE_TYPES.TABLE_REFRESH]: 'table.refresh',
  [FLOW_NODE_TYPES.FORM_OPEN]: 'form.open',
  [FLOW_NODE_TYPES.DRAWER_OPEN]: 'drawer.open',
  [FLOW_NODE_TYPES.MODAL_OPEN]: 'modal.open',
  [FLOW_NODE_TYPES.AUDIT_MARK]: 'audit.mark'
});

export const BUILT_IN_NODE_DEFINITIONS = Object.freeze([
  {
    type: FLOW_NODE_TYPES.CAPABILITY_RUN,
    label: 'Capability',
    group: 'capability',
    description: 'Run a registered PIVOT capability.'
  },
  {
    type: FLOW_NODE_TYPES.DATA_QUERY,
    label: 'Query',
    group: 'data',
    description: 'Query a resource through a registered capability.'
  },
  {
    type: FLOW_NODE_TYPES.CONDITION,
    label: 'Condition',
    group: 'control',
    description: 'Route execution by a condition on prior results.'
  },
  {
    type: FLOW_NODE_TYPES.CONFIRM,
    label: 'Confirm',
    group: 'control',
    description: 'Require a human approval before continuing.'
  },
  {
    type: FLOW_NODE_TYPES.TRANSFORM,
    label: 'Transform',
    group: 'control',
    description: 'Map or reshape data for later nodes.'
  },
  {
    type: FLOW_NODE_TYPES.HUMAN_SELECT,
    label: 'Human select',
    group: 'human',
    description: 'Ask a user to select one record from candidate results.'
  },
  {
    type: FLOW_NODE_TYPES.UI_DISPLAY,
    label: 'Display',
    group: 'feedback',
    description: 'Display flow data through a frontend renderer.'
  },
  {
    type: FLOW_NODE_TYPES.OUTPUT_RETURN,
    label: 'Output',
    group: 'control',
    description: 'Declare the final output of a flow.'
  },
  {
    type: FLOW_NODE_TYPES.SUBFLOW_RUN,
    label: 'Subflow',
    group: 'flow',
    description: 'Run another published flow as a reusable step.'
  },
  {
    type: FLOW_NODE_TYPES.ROUTE_NAVIGATE,
    label: 'Navigate',
    group: 'page',
    description: 'Navigate within the current frontend app.'
  },
  {
    type: FLOW_NODE_TYPES.TABLE_REFRESH,
    label: 'Refresh table',
    group: 'page',
    description: 'Refresh a table or list after an operation.'
  },
  {
    type: FLOW_NODE_TYPES.FORM_OPEN,
    label: 'Open form',
    group: 'page',
    description: 'Open and optionally prefill a form.'
  },
  {
    type: FLOW_NODE_TYPES.MESSAGE_SHOW,
    label: 'Show message',
    group: 'feedback',
    description: 'Show a user-facing result message.'
  },
  {
    type: FLOW_NODE_TYPES.AUDIT_MARK,
    label: 'Audit mark',
    group: 'feedback',
    description: 'Add a semantic marker to the flow audit trail.'
  }
]);

const customNodeDefinitions = new Map();

export function isKnownFlowStatus(status) {
  return Object.values(FLOW_STATUS).includes(status);
}

export function isKnownFlowNodeType(type) {
  return Object.values(FLOW_NODE_TYPES).includes(type) || customNodeDefinitions.has(type);
}

export function isKnownRiskLevel(risk) {
  return Object.values(FLOW_RISK_LEVELS).includes(risk);
}

export function isCapabilityBackedNode(node) {
  return Boolean(getFlowNodeCapability(node)) || [
    FLOW_NODE_TYPES.CAPABILITY_RUN,
    FLOW_NODE_TYPES.API_CALL,
    FLOW_NODE_TYPES.DATA_QUERY
  ].includes(node?.type);
}

export function isPlanVisibleNode(node) {
  if (!node || typeof node !== 'object') {
    return false;
  }

  if (node.type === FLOW_NODE_TYPES.INTENT_INPUT) {
    return false;
  }

  if (node.type === FLOW_NODE_TYPES.CONDITION || node.type === FLOW_NODE_TYPES.TRANSFORM || node.type === FLOW_NODE_TYPES.OUTPUT_RETURN) {
    return false;
  }

  return Boolean(getFlowNodeCapability(node)) || node.type === FLOW_NODE_TYPES.CONFIRM || typeof getFlowNodeTypeDefinition(node.type)?.toPlanNode === 'function';
}

export function getDefaultCapabilityForNodeType(type) {
  return getFlowNodeTypeDefinition(type)?.capability ?? DEFAULT_NODE_CAPABILITY_MAP[type] ?? '';
}

export function getFlowNodeCapability(node) {
  if (!node || typeof node !== 'object') {
    return '';
  }

  return node.capability || getDefaultCapabilityForNodeType(node.type);
}

export function registerFlowNodeType(definition = {}) {
  const normalized = normalizeFlowNodeTypeDefinition(definition);

  if (Object.values(FLOW_NODE_TYPES).includes(normalized.type)) {
    throw new Error(`Built-in flow node type cannot be overwritten: ${normalized.type}`);
  }

  customNodeDefinitions.set(normalized.type, normalized);
  return normalized;
}

export function unregisterFlowNodeType(type) {
  return customNodeDefinitions.delete(String(type || '').trim());
}

export function clearCustomFlowNodeTypes() {
  customNodeDefinitions.clear();
}

export function getFlowNodeTypeDefinition(type) {
  const normalizedType = String(type || '').trim();
  if (!normalizedType) {
    return null;
  }

  return customNodeDefinitions.get(normalizedType)
    ?? BUILT_IN_NODE_DEFINITIONS.find((definition) => definition.type === normalizedType)
    ?? null;
}

export function listFlowNodeTypeDefinitions(options = {}) {
  const includeCustom = options.includeCustom !== false;
  return [
    ...BUILT_IN_NODE_DEFINITIONS,
    ...(includeCustom ? Array.from(customNodeDefinitions.values()) : [])
  ];
}

function normalizeFlowNodeTypeDefinition(definition = {}) {
  if (!definition || typeof definition !== 'object') {
    throw new Error('Flow node type definition must be an object.');
  }

  const type = String(definition.type || '').trim();
  if (!type) {
    throw new Error('Flow node type definition requires a type.');
  }

  return {
    ...definition,
    type,
    label: String(definition.label || type),
    group: String(definition.group || 'custom'),
    description: String(definition.description || ''),
    inputSchema: isPlainObject(definition.inputSchema) ? definition.inputSchema : {},
    outputSchema: isPlainObject(definition.outputSchema) ? definition.outputSchema : {},
    defaultParams: isPlainObject(definition.defaultParams) ? definition.defaultParams : {},
    ports: isPlainObject(definition.ports) ? definition.ports : {},
    safety: isPlainObject(definition.safety) ? definition.safety : {}
  };
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}
