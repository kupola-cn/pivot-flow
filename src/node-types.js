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
  CONDITION: 'condition',
  CONFIRM: 'confirm',
  TRANSFORM: 'transform',
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

export function isKnownFlowStatus(status) {
  return Object.values(FLOW_STATUS).includes(status);
}

export function isKnownFlowNodeType(type) {
  return Object.values(FLOW_NODE_TYPES).includes(type);
}

export function isKnownRiskLevel(risk) {
  return Object.values(FLOW_RISK_LEVELS).includes(risk);
}

export function isCapabilityBackedNode(node) {
  return Boolean(getFlowNodeCapability(node)) || [
    FLOW_NODE_TYPES.CAPABILITY_RUN,
    FLOW_NODE_TYPES.API_CALL
  ].includes(node?.type);
}

export function isPlanVisibleNode(node) {
  if (!node || typeof node !== 'object') {
    return false;
  }

  if (node.type === FLOW_NODE_TYPES.INTENT_INPUT) {
    return false;
  }

  if (node.type === FLOW_NODE_TYPES.CONDITION || node.type === FLOW_NODE_TYPES.TRANSFORM) {
    return false;
  }

  return Boolean(getFlowNodeCapability(node)) || node.type === FLOW_NODE_TYPES.CONFIRM;
}

export function getDefaultCapabilityForNodeType(type) {
  return DEFAULT_NODE_CAPABILITY_MAP[type] ?? '';
}

export function getFlowNodeCapability(node) {
  if (!node || typeof node !== 'object') {
    return '';
  }

  return node.capability || getDefaultCapabilityForNodeType(node.type);
}
