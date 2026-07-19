import { FLOW_STATUS } from './node-types.js';

export function createFlow(input = {}) {
  const now = new Date().toISOString();
  return normalizeFlow({
    id: input.id ?? createId('flow'),
    name: input.name ?? '',
    description: input.description ?? '',
    version: input.version ?? '0.1.0',
    status: input.status ?? FLOW_STATUS.DRAFT,
    intent: input.intent ?? {},
    variables: input.variables ?? [],
    nodes: input.nodes ?? [],
    edges: input.edges ?? [],
    permissions: input.permissions ?? [],
    risk: input.risk ?? 'low',
    metadata: input.metadata ?? {},
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    publishedAt: input.publishedAt ?? null
  });
}

export function createFlowNode(input = {}) {
  return {
    id: input.id ?? createId('node'),
    type: input.type ?? 'capability.run',
    label: input.label ?? input.name ?? '',
    capability: input.capability ?? '',
    params: input.params ?? {},
    inputSchema: input.inputSchema ?? {},
    outputSchema: input.outputSchema ?? {},
    risk: input.risk ?? 'low',
    requiresConfirmation: Boolean(input.requiresConfirmation),
    condition: input.condition ?? null,
    ui: input.ui ?? {},
    metadata: input.metadata ?? {}
  };
}

export function createFlowEdge(input = {}) {
  return {
    id: input.id ?? createId('edge'),
    from: input.from ?? '',
    to: input.to ?? '',
    condition: input.condition ?? 'success',
    metadata: input.metadata ?? {}
  };
}

export function normalizeFlow(flow = {}) {
  return {
    ...flow,
    id: String(flow.id ?? '').trim(),
    name: String(flow.name ?? '').trim(),
    description: String(flow.description ?? ''),
    version: String(flow.version ?? '0.1.0'),
    status: flow.status ?? FLOW_STATUS.DRAFT,
    intent: normalizeIntent(flow.intent),
    variables: Array.isArray(flow.variables) ? flow.variables : [],
    nodes: Array.isArray(flow.nodes) ? flow.nodes.map(createFlowNode) : [],
    edges: Array.isArray(flow.edges) ? flow.edges.map(createFlowEdge) : [],
    permissions: Array.isArray(flow.permissions) ? flow.permissions.filter(isNonEmptyString) : [],
    metadata: isPlainObject(flow.metadata) ? flow.metadata : {}
  };
}

export function normalizeIntent(intent = {}) {
  const safeIntent = isPlainObject(intent) ? intent : {};
  return {
    examples: Array.isArray(safeIntent.examples) ? safeIntent.examples.filter(isNonEmptyString) : [],
    patterns: Array.isArray(safeIntent.patterns) ? safeIntent.patterns.filter(isNonEmptyString) : [],
    keywords: Array.isArray(safeIntent.keywords) ? safeIntent.keywords.filter(isNonEmptyString) : [],
    slots: Array.isArray(safeIntent.slots) ? safeIntent.slots.map(normalizeSlot) : [],
    ai: isPlainObject(safeIntent.ai) ? safeIntent.ai : { enabled: false }
  };
}

export function normalizeSlot(slot = {}) {
  return {
    name: String(slot.name ?? '').trim(),
    label: slot.label ?? '',
    type: slot.type ?? 'string',
    required: Boolean(slot.required),
    source: slot.source ?? 'intent',
    pattern: slot.pattern ?? '',
    options: Array.isArray(slot.options) ? slot.options : [],
    fallback: slot.fallback
  };
}

export function cloneFlow(flow) {
  return JSON.parse(JSON.stringify(flow));
}

export function createId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}:${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}
