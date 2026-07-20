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
  DATA_CREATE: 'data.create',
  DATA_UPDATE: 'data.update',
  DATA_DELETE: 'data.delete',
  CONDITION: 'condition',
  CONFIRM: 'confirm',
  TRANSFORM: 'transform',
  LOOP: 'loop',
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
    type: FLOW_NODE_TYPES.DATA_CREATE,
    label: 'Create',
    group: 'data',
    description: 'Create a resource through a registered capability.'
  },
  {
    type: FLOW_NODE_TYPES.DATA_UPDATE,
    label: 'Update',
    group: 'data',
    description: 'Update a resource through a registered capability.'
  },
  {
    type: FLOW_NODE_TYPES.DATA_DELETE,
    label: 'Delete',
    group: 'data',
    description: 'Delete a resource through a registered capability.'
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
    type: FLOW_NODE_TYPES.LOOP,
    label: 'Loop',
    group: 'control',
    description: 'Repeat downstream steps for each item in a collection.'
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
    FLOW_NODE_TYPES.DATA_QUERY,
    FLOW_NODE_TYPES.DATA_CREATE,
    FLOW_NODE_TYPES.DATA_UPDATE,
    FLOW_NODE_TYPES.DATA_DELETE
  ].includes(node?.type);
}

export function isPlanVisibleNode(node) {
  if (!node || typeof node !== 'object') {
    return false;
  }

  if (node.type === FLOW_NODE_TYPES.INTENT_INPUT) {
    return false;
  }

  if (node.type === FLOW_NODE_TYPES.CONDITION || node.type === FLOW_NODE_TYPES.TRANSFORM || node.type === FLOW_NODE_TYPES.LOOP || node.type === FLOW_NODE_TYPES.OUTPUT_RETURN) {
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

export function createDefaultFlowWorkbenchNodeTypes(options = {}) {
  const zh = String(options.locale || '').toLowerCase().startsWith('zh');
  const text = zh ? FLOW_WORKBENCH_NODE_TEXT_ZH : FLOW_WORKBENCH_NODE_TEXT_EN;
  return DEFAULT_FLOW_WORKBENCH_NODE_TYPES.map((definition) => ({
    ...definition,
    label: text[definition.id]?.label || definition.label,
    description: text[definition.id]?.description || definition.description,
    nodeLabel: text[definition.id]?.nodeLabel || definition.nodeLabel
  }));
}

export const DEFAULT_FLOW_WORKBENCH_NODE_TYPES = Object.freeze([
  {
    id: 'param.input',
    type: FLOW_NODE_TYPES.INTENT_INPUT,
    label: 'Parameter',
    nodeLabel: 'Input parameter',
    group: 'input',
    description: 'Declare a value provided by user intent or context.',
    params: { name: 'keyword', source: 'intent', required: true }
  },
  {
    id: 'data.query',
    type: FLOW_NODE_TYPES.DATA_QUERY,
    label: 'Query',
    nodeLabel: 'Query data',
    group: 'data',
    description: 'Query records from a business resource.',
    action: 'query',
    params: { resource: '', filters: [], limit: 20 }
  },
  {
    id: 'data.create',
    type: FLOW_NODE_TYPES.DATA_CREATE,
    label: 'Create',
    nodeLabel: 'Create data',
    group: 'data',
    description: 'Create a business resource record.',
    action: 'create',
    params: { resource: '', data: {} },
    risk: 'medium'
  },
  {
    id: 'data.update',
    type: FLOW_NODE_TYPES.DATA_UPDATE,
    label: 'Update',
    nodeLabel: 'Update data',
    group: 'data',
    description: 'Update matching business resource records.',
    action: 'update',
    params: { resource: '', where: {}, data: {} },
    risk: 'medium'
  },
  {
    id: 'data.delete',
    type: FLOW_NODE_TYPES.DATA_DELETE,
    label: 'Delete',
    nodeLabel: 'Delete data',
    group: 'data',
    description: 'Delete matching business resource records.',
    action: 'delete',
    params: { resource: '', where: {} },
    risk: 'high',
    requiresConfirmation: true
  },
  {
    id: 'condition',
    type: FLOW_NODE_TYPES.CONDITION,
    label: 'Condition',
    nodeLabel: 'Condition',
    group: 'control',
    description: 'Branch the flow by a structured condition.',
    condition: { path: 'data.ok', equals: true }
  },
  {
    id: 'loop',
    type: FLOW_NODE_TYPES.LOOP,
    label: 'Loop',
    nodeLabel: 'Loop items',
    group: 'control',
    description: 'Repeat downstream steps for each item in a collection.',
    control: { mode: 'forEach', source: '{{previous.data.records}}', itemName: 'item' }
  },
  {
    id: 'transform',
    type: FLOW_NODE_TYPES.TRANSFORM,
    label: 'Transform',
    nodeLabel: 'Transform data',
    group: 'control',
    description: 'Map or reshape values for later steps.',
    params: { mappings: {} }
  },
  {
    id: 'human.select',
    type: FLOW_NODE_TYPES.HUMAN_SELECT,
    label: 'Human select',
    nodeLabel: 'Select record',
    group: 'human',
    description: 'Ask the user to choose one record.',
    capability: 'human.select',
    params: { source: '{{previous.data.records}}', title: 'Select record' }
  },
  {
    id: 'subflow.run',
    type: FLOW_NODE_TYPES.SUBFLOW_RUN,
    label: 'Subflow',
    nodeLabel: 'Run subflow',
    group: 'flow',
    description: 'Run a published flow as a reusable step.',
    capability: 'flow.subflow.run',
    params: { flowId: '', input: {} }
  },
  {
    id: 'ui.display',
    type: FLOW_NODE_TYPES.UI_DISPLAY,
    label: 'Display',
    nodeLabel: 'Display result',
    group: 'feedback',
    description: 'Display data in the frontend.',
    capability: 'ui.display',
    params: { data: '{{previous.data}}', renderer: 'detail' }
  },
  {
    id: 'message.show',
    type: FLOW_NODE_TYPES.MESSAGE_SHOW,
    label: 'Message',
    nodeLabel: 'Show message',
    group: 'feedback',
    description: 'Show a user-facing message.',
    capability: 'message.show',
    params: { message: 'Flow message', type: 'info' }
  },
  {
    id: 'capability.run',
    type: FLOW_NODE_TYPES.CAPABILITY_RUN,
    label: 'Custom capability',
    nodeLabel: 'Run capability',
    group: 'capability',
    description: 'Call any registered business capability.',
    params: {}
  }
]);

const FLOW_WORKBENCH_NODE_TEXT_ZH = Object.freeze({
  'param.input': { label: '参数', nodeLabel: '输入参数', description: '声明来自意图或上下文的参数。' },
  'data.query': { label: '查询', nodeLabel: '查询数据', description: '从业务资源查询记录。' },
  'data.create': { label: '新增', nodeLabel: '新增数据', description: '新增业务资源记录。' },
  'data.update': { label: '修改', nodeLabel: '修改数据', description: '修改匹配的业务资源记录。' },
  'data.delete': { label: '删除', nodeLabel: '删除数据', description: '删除匹配的业务资源记录。' },
  condition: { label: '条件', nodeLabel: '条件判断', description: '根据结构化条件进行分支。' },
  loop: { label: '循环', nodeLabel: '循环处理', description: '按集合逐项重复后续步骤。' },
  transform: { label: '转换', nodeLabel: '转换数据', description: '映射或整理后续步骤需要的数据。' },
  'human.select': { label: '人工选择', nodeLabel: '选择记录', description: '让使用者从候选记录中选择一条。' },
  'subflow.run': { label: '子流程', nodeLabel: '运行子流程', description: '复用另一个已发布流程。' },
  'ui.display': { label: '展示', nodeLabel: '展示结果', description: '在前端展示数据。' },
  'message.show': { label: '消息', nodeLabel: '显示消息', description: '显示用户可见的提示消息。' },
  'capability.run': { label: '自定义能力', nodeLabel: '调用能力', description: '调用已注册的业务能力。' }
});

const FLOW_WORKBENCH_NODE_TEXT_EN = Object.freeze({});

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
    paramsSchema: isPlainObject(definition.paramsSchema) ? definition.paramsSchema : {},
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
