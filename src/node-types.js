export const FLOW_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  DISABLED: 'disabled',
  ARCHIVED: 'archived'
});

export const FLOW_NODE_TYPES = Object.freeze({
  INTENT_INPUT: 'intent.input',
  PARAM_EXTRACT: 'param.extract',
  PARAM_VALIDATE: 'param.validate',
  PARAM_NORMALIZE: 'param.normalize',
  API_CALL: 'api.call',
  CAPABILITY_RUN: 'capability.run',
  CAPABILITY_CALL: 'capability.call',
  DATA_QUERY: 'data.query',
  DATA_GET: 'data.get',
  DATA_AGGREGATE: 'data.aggregate',
  DATA_CREATE: 'data.create',
  DATA_UPDATE: 'data.update',
  DATA_DELETE: 'data.delete',
  DATA_FILTER: 'data.filter',
  DATA_SORT: 'data.sort',
  DATA_MAP: 'data.map',
  DATA_MERGE: 'data.merge',
  DATA_PICK: 'data.pick',
  DATA_DEDUPE: 'data.dedupe',
  CONDITION: 'condition',
  SWITCH: 'switch',
  CONFIRM: 'confirm',
  TRANSFORM: 'transform',
  LOOP: 'loop',
  HUMAN_INPUT: 'human.input',
  HUMAN_SELECT: 'human.select',
  UI_DISPLAY: 'ui.display',
  OUTPUT_MESSAGE: 'output.message',
  OUTPUT_RESULT: 'output.result',
  OUTPUT_TABLE: 'output.table',
  OUTPUT_DETAIL: 'output.detail',
  OUTPUT_OPTIONS: 'output.options',
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
  [FLOW_NODE_TYPES.HUMAN_INPUT]: 'human.input',
  [FLOW_NODE_TYPES.HUMAN_SELECT]: 'human.select',
  [FLOW_NODE_TYPES.CAPABILITY_CALL]: 'capability.call',
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
    type: FLOW_NODE_TYPES.CAPABILITY_CALL,
    label: 'Call capability',
    group: 'capability',
    description: 'Call a registered business capability with mapped params.'
  },
  {
    type: FLOW_NODE_TYPES.PARAM_EXTRACT,
    label: 'Extract params',
    group: 'input',
    description: 'Extract structured params from user input.'
  },
  {
    type: FLOW_NODE_TYPES.PARAM_VALIDATE,
    label: 'Validate params',
    group: 'input',
    description: 'Validate required params, types, ranges, and enums.'
  },
  {
    type: FLOW_NODE_TYPES.PARAM_NORMALIZE,
    label: 'Normalize params',
    group: 'input',
    description: 'Normalize params before later flow steps.'
  },
  {
    type: FLOW_NODE_TYPES.DATA_QUERY,
    label: 'Query',
    group: 'data',
    description: 'Query a resource through a registered capability.'
  },
  {
    type: FLOW_NODE_TYPES.DATA_GET,
    label: 'Get record',
    group: 'data',
    description: 'Get one resource record by id, code, or unique key.'
  },
  {
    type: FLOW_NODE_TYPES.DATA_AGGREGATE,
    label: 'Aggregate',
    group: 'data',
    description: 'Aggregate records with count, sum, avg, or groupBy.'
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
    type: FLOW_NODE_TYPES.DATA_FILTER,
    label: 'Filter',
    group: 'control',
    description: 'Filter upstream records without calling a backend service.'
  },
  {
    type: FLOW_NODE_TYPES.DATA_SORT,
    label: 'Sort',
    group: 'control',
    description: 'Sort upstream records without calling a backend service.'
  },
  {
    type: FLOW_NODE_TYPES.DATA_MAP,
    label: 'Map',
    group: 'control',
    description: 'Map or project upstream records into a new shape.'
  },
  {
    type: FLOW_NODE_TYPES.DATA_MERGE,
    label: 'Merge',
    group: 'control',
    description: 'Merge two upstream data sets by configured keys.'
  },
  {
    type: FLOW_NODE_TYPES.DATA_PICK,
    label: 'Pick',
    group: 'control',
    description: 'Pick a record or field from upstream data.'
  },
  {
    type: FLOW_NODE_TYPES.DATA_DEDUPE,
    label: 'Dedupe',
    group: 'control',
    description: 'Remove duplicate upstream records by configured keys.'
  },
  {
    type: FLOW_NODE_TYPES.CONDITION,
    label: 'Condition',
    group: 'control',
    description: 'Route execution by a condition on prior results.'
  },
  {
    type: FLOW_NODE_TYPES.SWITCH,
    label: 'Switch',
    group: 'control',
    description: 'Route execution across multiple configured cases.'
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
    type: FLOW_NODE_TYPES.HUMAN_INPUT,
    label: 'User input',
    group: 'human',
    description: 'Ask the user to manually provide a missing or corrected value.'
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
    type: FLOW_NODE_TYPES.OUTPUT_MESSAGE,
    label: 'Output message',
    group: 'output',
    description: 'Return a message to the flow user.'
  },
  {
    type: FLOW_NODE_TYPES.OUTPUT_RESULT,
    label: 'Output result',
    group: 'output',
    description: 'Return structured result data to the flow user.'
  },
  {
    type: FLOW_NODE_TYPES.OUTPUT_TABLE,
    label: 'Output table',
    group: 'output',
    description: 'Return tabular records and optional column metadata.'
  },
  {
    type: FLOW_NODE_TYPES.OUTPUT_DETAIL,
    label: 'Output detail',
    group: 'output',
    description: 'Return one record as a detail view payload.'
  },
  {
    type: FLOW_NODE_TYPES.OUTPUT_OPTIONS,
    label: 'Output options',
    group: 'output',
    description: 'Return selectable options to the host app.'
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
    FLOW_NODE_TYPES.CAPABILITY_CALL,
    FLOW_NODE_TYPES.API_CALL,
    FLOW_NODE_TYPES.DATA_QUERY,
    FLOW_NODE_TYPES.DATA_GET,
    FLOW_NODE_TYPES.DATA_AGGREGATE,
    FLOW_NODE_TYPES.DATA_CREATE,
    FLOW_NODE_TYPES.DATA_UPDATE,
    FLOW_NODE_TYPES.DATA_DELETE,
    FLOW_NODE_TYPES.HUMAN_INPUT
  ].includes(node?.type);
}

export function isPlanVisibleNode(node) {
  if (!node || typeof node !== 'object') {
    return false;
  }

  if (node.type === FLOW_NODE_TYPES.INTENT_INPUT) {
    return false;
  }

  if ([
    FLOW_NODE_TYPES.PARAM_EXTRACT,
    FLOW_NODE_TYPES.PARAM_VALIDATE,
    FLOW_NODE_TYPES.PARAM_NORMALIZE,
    FLOW_NODE_TYPES.CONDITION,
    FLOW_NODE_TYPES.SWITCH,
    FLOW_NODE_TYPES.TRANSFORM,
    FLOW_NODE_TYPES.LOOP,
    FLOW_NODE_TYPES.DATA_FILTER,
    FLOW_NODE_TYPES.DATA_SORT,
    FLOW_NODE_TYPES.DATA_MAP,
    FLOW_NODE_TYPES.DATA_MERGE,
    FLOW_NODE_TYPES.DATA_PICK,
    FLOW_NODE_TYPES.DATA_DEDUPE,
    FLOW_NODE_TYPES.OUTPUT_MESSAGE,
    FLOW_NODE_TYPES.OUTPUT_RESULT,
    FLOW_NODE_TYPES.OUTPUT_TABLE,
    FLOW_NODE_TYPES.OUTPUT_DETAIL,
    FLOW_NODE_TYPES.OUTPUT_OPTIONS,
    FLOW_NODE_TYPES.OUTPUT_RETURN
  ].includes(node.type)) {
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
    id: 'param.extract',
    type: FLOW_NODE_TYPES.PARAM_EXTRACT,
    label: 'Extract',
    nodeLabel: 'Extract params',
    group: 'input',
    description: 'Extract structured params from user input.',
    params: { source: '{{input.prompt}}', slots: [] }
  },
  {
    id: 'param.validate',
    type: FLOW_NODE_TYPES.PARAM_VALIDATE,
    label: 'Validate',
    nodeLabel: 'Validate params',
    group: 'input',
    description: 'Validate required params before data access.',
    params: { source: '{{intent}}', rules: [] }
  },
  {
    id: 'param.normalize',
    type: FLOW_NODE_TYPES.PARAM_NORMALIZE,
    label: 'Normalize',
    nodeLabel: 'Normalize params',
    group: 'input',
    description: 'Normalize params before later flow steps.',
    params: { source: '{{intent}}', rules: [] }
  },
  {
    id: 'human.input',
    type: FLOW_NODE_TYPES.HUMAN_INPUT,
    label: 'User input',
    nodeLabel: 'Ask user input',
    group: 'human',
    description: 'Ask the user to provide a missing or corrected value.',
    capability: 'human.input',
    params: { name: 'value', prompt: 'Please provide a value', inputType: 'text', required: true }
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
    id: 'data.get',
    type: FLOW_NODE_TYPES.DATA_GET,
    label: 'Get',
    nodeLabel: 'Get record',
    group: 'data',
    description: 'Get one record from a business resource.',
    action: 'get',
    params: { resource: '', key: { field: 'id', value: '{{intent.id}}' } }
  },
  {
    id: 'data.aggregate',
    type: FLOW_NODE_TYPES.DATA_AGGREGATE,
    label: 'Aggregate',
    nodeLabel: 'Aggregate data',
    group: 'data',
    description: 'Aggregate records with count, sum, avg, or groupBy.',
    action: 'aggregate',
    params: { resource: '', operation: 'count', groupBy: [] }
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
    id: 'data.filter',
    type: FLOW_NODE_TYPES.DATA_FILTER,
    label: 'Filter',
    nodeLabel: 'Filter data',
    group: 'control',
    description: 'Filter upstream records.',
    params: { source: '{{previous.data.records}}', where: {} }
  },
  {
    id: 'data.map',
    type: FLOW_NODE_TYPES.DATA_MAP,
    label: 'Map',
    nodeLabel: 'Map data',
    group: 'control',
    description: 'Map upstream data fields.',
    params: { source: '{{previous.data.records}}', mappings: {} }
  },
  {
    id: 'data.sort',
    type: FLOW_NODE_TYPES.DATA_SORT,
    label: 'Sort',
    nodeLabel: 'Sort data',
    group: 'control',
    description: 'Sort upstream records.',
    params: { source: '{{previous.data.records}}', by: [], direction: 'asc' }
  },
  {
    id: 'data.merge',
    type: FLOW_NODE_TYPES.DATA_MERGE,
    label: 'Merge',
    nodeLabel: 'Merge data',
    group: 'control',
    description: 'Merge two upstream data sets by key.',
    params: { left: '{{previous.data.records}}', right: [], leftKey: 'id', rightKey: 'id', mode: 'left' }
  },
  {
    id: 'data.pick',
    type: FLOW_NODE_TYPES.DATA_PICK,
    label: 'Pick',
    nodeLabel: 'Pick data',
    group: 'control',
    description: 'Pick one record or field from upstream data.',
    params: { source: '{{previous.data.records}}', mode: 'first', path: '' }
  },
  {
    id: 'data.dedupe',
    type: FLOW_NODE_TYPES.DATA_DEDUPE,
    label: 'Dedupe',
    nodeLabel: 'Dedupe data',
    group: 'control',
    description: 'Remove duplicate records by key.',
    params: { source: '{{previous.data.records}}', keys: ['id'] }
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
    id: 'switch',
    type: FLOW_NODE_TYPES.SWITCH,
    label: 'Switch',
    nodeLabel: 'Switch branch',
    group: 'control',
    description: 'Route the flow across multiple cases.',
    condition: { path: 'data.status', cases: [], default: true }
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
    id: 'output.message',
    type: FLOW_NODE_TYPES.OUTPUT_MESSAGE,
    label: 'Message output',
    nodeLabel: 'Return message',
    group: 'output',
    description: 'Return a message to the user.',
    params: { message: 'No result found.', type: 'info' }
  },
  {
    id: 'output.table',
    type: FLOW_NODE_TYPES.OUTPUT_TABLE,
    label: 'Table output',
    nodeLabel: 'Return table',
    group: 'output',
    description: 'Return records as a table result.',
    params: { data: '{{previous.data.records}}', columns: [] }
  },
  {
    id: 'output.detail',
    type: FLOW_NODE_TYPES.OUTPUT_DETAIL,
    label: 'Detail output',
    nodeLabel: 'Return detail',
    group: 'output',
    description: 'Return one record as a detail result.',
    params: { data: '{{previous.data.record}}', fields: [] }
  },
  {
    id: 'output.options',
    type: FLOW_NODE_TYPES.OUTPUT_OPTIONS,
    label: 'Options output',
    nodeLabel: 'Return options',
    group: 'output',
    description: 'Return selectable options to the host app.',
    params: { options: '{{previous.data.records}}', labelField: 'name', valueField: 'id' }
  },
  {
    id: 'output.result',
    type: FLOW_NODE_TYPES.OUTPUT_RESULT,
    label: 'Result output',
    nodeLabel: 'Return result',
    group: 'output',
    description: 'Return structured result data.',
    params: { data: '{{previous.data}}' }
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
  },
  {
    id: 'capability.call',
    type: FLOW_NODE_TYPES.CAPABILITY_CALL,
    label: 'Call capability',
    nodeLabel: 'Call capability',
    group: 'capability',
    description: 'Call a registered business capability.',
    params: {}
  }
]);

const FLOW_WORKBENCH_NODE_TEXT_ZH = Object.freeze({
  'param.input': { label: '参数', nodeLabel: '输入参数', description: '声明来自意图或上下文的参数。' },
  'param.extract': { label: '抽取', nodeLabel: '抽取参数', description: '从用户输入中抽取结构化参数。' },
  'param.validate': { label: '校验', nodeLabel: '校验参数', description: '校验必填、类型、范围和枚举。' },
  'param.normalize': { label: '标准化', nodeLabel: '标准化参数', description: '在后续步骤前标准化参数。' },
  'human.input': { label: '补充输入', nodeLabel: '请求用户输入', description: '缺少参数或需要修正时让用户补充。' },
  'data.query': { label: '查询', nodeLabel: '查询数据', description: '从业务资源查询记录。' },
  'data.get': { label: '获取', nodeLabel: '获取记录', description: '按 ID、编码或唯一键获取一条业务记录。' },
  'data.aggregate': { label: '聚合', nodeLabel: '聚合数据', description: '对业务记录进行计数、求和、分组等统计。' },
  'data.create': { label: '新增', nodeLabel: '新增数据', description: '新增业务资源记录。' },
  'data.update': { label: '修改', nodeLabel: '修改数据', description: '修改匹配的业务资源记录。' },
  'data.delete': { label: '删除', nodeLabel: '删除数据', description: '删除匹配的业务资源记录。' },
  'data.filter': { label: '过滤', nodeLabel: '过滤数据', description: '过滤上游记录。' },
  'data.map': { label: '映射', nodeLabel: '映射数据', description: '映射上游数据字段。' },
  'data.sort': { label: '排序', nodeLabel: '排序数据', description: '对上游记录排序。' },
  'data.merge': { label: '合并', nodeLabel: '合并数据', description: '按键合并两组上游数据。' },
  'data.pick': { label: '选取', nodeLabel: '选取数据', description: '从上游数据中选取记录或字段。' },
  'data.dedupe': { label: '去重', nodeLabel: '数据去重', description: '按键移除重复记录。' },
  condition: { label: '条件', nodeLabel: '条件判断', description: '根据结构化条件进行分支。' },
  switch: { label: '多分支', nodeLabel: '多分支判断', description: '按多个 case 路由流程。' },
  loop: { label: '循环', nodeLabel: '循环处理', description: '按集合逐项重复后续步骤。' },
  transform: { label: '转换', nodeLabel: '转换数据', description: '映射或整理后续步骤需要的数据。' },
  'human.select': { label: '人工选择', nodeLabel: '选择记录', description: '让使用者从候选记录中选择一条。' },
  'subflow.run': { label: '子流程', nodeLabel: '运行子流程', description: '复用另一个已发布流程。' },
  'ui.display': { label: '展示', nodeLabel: '展示结果', description: '在前端展示数据。' },
  'output.message': { label: '消息输出', nodeLabel: '返回消息', description: '向用户返回提示消息。' },
  'output.table': { label: '表格输出', nodeLabel: '返回表格', description: '以表格形式返回记录。' },
  'output.detail': { label: '详情输出', nodeLabel: '返回详情', description: '以详情形式返回单条记录。' },
  'output.options': { label: '选项输出', nodeLabel: '返回选项', description: '向宿主应用返回可选项。' },
  'output.result': { label: '结果输出', nodeLabel: '返回结果', description: '返回结构化结果数据。' },
  'message.show': { label: '消息', nodeLabel: '显示消息', description: '显示用户可见的提示消息。' },
  'capability.run': { label: '自定义能力', nodeLabel: '调用能力', description: '调用已注册的业务能力。' },
  'capability.call': { label: '能力调用', nodeLabel: '调用能力', description: '调用已注册的业务能力。' }
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
