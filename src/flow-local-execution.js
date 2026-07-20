import { createPlan, createResult } from '@kupola/pivot';
import { applyFlowTransform, compareValues, evaluateFlowCondition } from './flow-control.js';
import { normalizeFlow } from './flow-schema.js';
import { flowNodeToPlanNode, flowToPlan } from './flow-to-plan.js';
import { FLOW_NODE_TYPES, isPlanVisibleNode } from './node-types.js';
import { validateFlow } from './flow-validation.js';

const TEMPLATE_PATTERN = /^\{\{\s*([^}]+?)\s*\}\}$/;

export async function executeFlowGraph(flowInput, options = {}) {
  const runtime = options.runtime;
  const flow = normalizeFlow(flowInput);
  const validation = validateFlow(flow, options.validation ?? {});

  if (!validation.valid) {
    return createResult({
      ok: false,
      message: 'Flow validation failed.',
      data: { flow, nodes: [] },
      explain: { ...validation, timeline: [createTimelineStep('flow.validation', 'failed', 'Flow validation failed.')] }
    });
  }

  const plan = flowToPlan(flow, options.input ?? {}, options.context ?? {});
  const orderedNodes = getFlowExecutionOrder(flow);
  const incomingEdgesByNodeId = groupIncomingEdges(flow);
  const resultsByNodeId = {};
  const nodeResults = [];
  const outputs = [];
  const timeline = [createTimelineStep('flow.validation', 'passed', 'Flow validation passed.', { nodes: orderedNodes.length })];
  const stopOnError = options.executeOptions?.stopOnError ?? true;

  for (const node of orderedNodes) {
    const runState = getFlowNodeRunState(node, incomingEdgesByNodeId, resultsByNodeId);

    if (!runState.run) {
      const result = createSkippedNodeResult(node, runState.reason);
      resultsByNodeId[node.id] = result;
      nodeResults.push({ node, command: null, result });
      timeline.push(createTimelineStep('flow.node', 'skipped', `Flow node skipped: ${node.id}`, { nodeId: node.id, reason: runState.reason }));
      continue;
    }

    timeline.push(createTimelineStep('flow.node', 'started', `Flow node started: ${node.id}`, { nodeId: node.id, type: node.type }));
    const previous = getPreviousNodeResult(nodeResults);
    const result = await executeFlowNode(node, {
      flow,
      runtime,
      input: options.input ?? {},
      context: options.context ?? {},
      executeOptions: options.executeOptions ?? {},
      resultsByNodeId,
      previous
    });

    resultsByNodeId[node.id] = result;
    nodeResults.push({ node, command: null, result });

    if (result.ok && result.data?.output) {
      outputs.push(result.data.output);
    }

    timeline.push(createTimelineStep('flow.node', result.ok ? 'executed' : 'failed', `Flow node ${result.ok ? 'executed' : 'failed'}: ${node.id}`, {
      nodeId: node.id,
      type: node.type,
      reason: result.message
    }));

    if (!result.ok && stopOnError) {
      break;
    }
  }

  const failedNodes = nodeResults.filter((item) => !item.result.ok && !item.result.data?.skipped);
  const skippedNodes = nodeResults.filter((item) => item.result.data?.skipped);
  const ok = failedNodes.length === 0;
  const output = outputs[outputs.length - 1] ?? null;

  timeline.push(createTimelineStep('flow.execution', ok ? 'executed' : 'failed', ok ? 'Flow executed.' : 'Flow execution failed.'));

  return createResult({
    ok,
    message: ok ? 'Flow executed.' : 'Flow execution failed.',
    data: {
      flow,
      plan,
      nodes: nodeResults,
      compensations: [],
      status: ok ? 'executed' : 'failed',
      outputs,
      output
    },
    explain: {
      executedNodes: nodeResults.length - skippedNodes.length,
      skippedNodes: skippedNodes.length,
      failedNodes: failedNodes.length,
      timeline
    }
  });
}

export async function executeFlowNode(node, state = {}) {
  if (isPlanVisibleNode(node)) {
    return executeCapabilityBackedFlowNode(node, state);
  }

  const rawParams = node.params ?? {};
  const params = node.type === FLOW_NODE_TYPES.DATA_MAP
    ? {
      source: resolveFlowExecutionValue(rawParams.source ?? rawParams.items, state),
      mappings: rawParams.mappings ?? rawParams.projection
    }
    : resolveFlowExecutionValue(rawParams, state);

  switch (node.type) {
    case FLOW_NODE_TYPES.INTENT_INPUT:
      return createResult({ ok: true, message: 'Intent input resolved.', data: { value: state.input?.slots ?? {} } });
    case FLOW_NODE_TYPES.PARAM_EXTRACT:
      return executeParamExtractNode(params, state);
    case FLOW_NODE_TYPES.PARAM_VALIDATE:
      return executeParamValidateNode(params, state);
    case FLOW_NODE_TYPES.PARAM_NORMALIZE:
      return executeParamNormalizeNode(params, state);
    case FLOW_NODE_TYPES.DATA_FILTER:
      return executeDataFilterNode(params, state);
    case FLOW_NODE_TYPES.DATA_SORT:
      return executeDataSortNode(params, state);
    case FLOW_NODE_TYPES.DATA_MAP:
      return executeDataMapNode(params, state);
    case FLOW_NODE_TYPES.DATA_MERGE:
      return executeDataMergeNode(params, state);
    case FLOW_NODE_TYPES.DATA_PICK:
      return executeDataPickNode(params, state);
    case FLOW_NODE_TYPES.DATA_DEDUPE:
      return executeDataDedupeNode(params, state);
    case FLOW_NODE_TYPES.CONDITION:
      return executeConditionNode(node, state);
    case FLOW_NODE_TYPES.SWITCH:
      return executeSwitchNode(node, state);
    case FLOW_NODE_TYPES.TRANSFORM:
      return createResult({ ok: true, message: 'Data transformed.', data: applyFlowTransform(node.params ?? {}, createExpressionInput(state), state.context ?? {}) });
    case FLOW_NODE_TYPES.OUTPUT_MESSAGE:
    case FLOW_NODE_TYPES.OUTPUT_RESULT:
    case FLOW_NODE_TYPES.OUTPUT_TABLE:
    case FLOW_NODE_TYPES.OUTPUT_DETAIL:
    case FLOW_NODE_TYPES.OUTPUT_OPTIONS:
    case FLOW_NODE_TYPES.OUTPUT_RETURN:
      return executeOutputNode(node, params, state);
    default:
      return createResult({
        ok: true,
        message: 'Flow node has no local execution behavior.',
        data: { skipped: true, reason: 'no-local-executor', type: node.type }
      });
  }
}

export function createFlowOutput(node = {}, params = {}, state = {}) {
  const title = params.title ?? node.label ?? '';

  if (node.type === FLOW_NODE_TYPES.OUTPUT_MESSAGE) {
    return {
      kind: 'message',
      title,
      message: params.message ?? params.text ?? '',
      type: params.type ?? 'info',
      data: params.data ?? getPreviousData(state)
    };
  }

  if (node.type === FLOW_NODE_TYPES.OUTPUT_TABLE) {
    return {
      kind: 'table',
      title,
      data: asArray(params.data ?? params.records ?? getPreviousData(state)),
      columns: Array.isArray(params.columns) ? params.columns : []
    };
  }

  if (node.type === FLOW_NODE_TYPES.OUTPUT_DETAIL) {
    return {
      kind: 'detail',
      title,
      data: params.data ?? params.record ?? getPreviousData(state),
      fields: Array.isArray(params.fields) ? params.fields : []
    };
  }

  if (node.type === FLOW_NODE_TYPES.OUTPUT_OPTIONS) {
    return {
      kind: 'options',
      title,
      options: asArray(params.options ?? params.data ?? getPreviousData(state)),
      labelField: params.labelField ?? 'label',
      valueField: params.valueField ?? 'value'
    };
  }

  return {
    kind: 'result',
    title,
    data: params.data ?? params.result ?? getPreviousData(state)
  };
}

export function resolveFlowExecutionValue(value, state = {}) {
  if (Array.isArray(value)) {
    return value.map((item) => resolveFlowExecutionValue(item, state));
  }

  if (isPlainObject(value)) {
    if (typeof value.$from === 'string') {
      const source = state.resultsByNodeId?.[value.$from];
      return readPath(source, value.path ?? 'data');
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, resolveFlowExecutionValue(entryValue, state)])
    );
  }

  if (typeof value !== 'string') {
    return value;
  }

  const template = value.match(TEMPLATE_PATTERN);
  if (!template) {
    return value;
  }

  return resolveExecutionReference(template[1], state);
}

async function executeCapabilityBackedFlowNode(node, state) {
  if (!state.runtime || typeof state.runtime.executePlan !== 'function') {
    return createResult({
      ok: false,
      message: 'PIVOT runtime is required to execute capability-backed flow nodes.',
      explain: { nodeId: node.id, type: node.type }
    });
  }

  const planNode = flowNodeToPlanNode(node, state.flow, state.input ?? {}, state.context ?? {});
  if (!planNode) {
    return createResult({ ok: true, message: 'Flow node is not plan visible.', data: { skipped: true } });
  }

  const executableNode = {
    ...planNode,
    params: resolveFlowExecutionValue(planNode.params ?? {}, state),
    input: resolveFlowExecutionValue(planNode.input ?? {}, state)
  };
  const plan = createPlan({
    id: `${state.input?.planId ?? `flow-plan:${state.flow.id}`}:${node.id}:${Date.now()}`,
    intent: state.input?.prompt ?? state.flow.name,
    nodes: [executableNode],
    edges: [],
    metadata: {
      ...(state.flow.metadata ?? {}),
      flowId: state.flow.id,
      flowName: state.flow.name,
      flowNodeId: node.id
    }
  });
  const result = await state.runtime.executePlan(plan, state.context ?? {}, state.executeOptions ?? {});
  return result?.data?.nodes?.[0]?.result ?? result;
}

function executeParamExtractNode(params, state) {
  const source = params.source ?? state.input?.prompt ?? '';
  return createResult({
    ok: true,
    message: 'Params extracted.',
    data: {
      params: isPlainObject(params.defaults) ? params.defaults : {},
      source,
      missing: []
    }
  });
}

function executeParamValidateNode(params, state) {
  const source = params.source ?? state.input?.slots ?? {};
  const rules = Array.isArray(params.rules) ? params.rules : [];
  const missing = rules
    .filter((rule) => rule?.required && isEmpty(readPath(source, rule.name ?? rule.path ?? '')))
    .map((rule) => rule.name ?? rule.path ?? '');

  return createResult({
    ok: missing.length === 0,
    message: missing.length === 0 ? 'Params validated.' : 'Required params are missing.',
    data: {
      valid: missing.length === 0,
      params: source,
      missing
    }
  });
}

function executeParamNormalizeNode(params, state) {
  const source = isPlainObject(params.source) ? params.source : state.input?.slots ?? {};
  return createResult({
    ok: true,
    message: 'Params normalized.',
    data: {
      params: normalizeParamValue(source)
    }
  });
}

function executeDataFilterNode(params, state) {
  const items = asArray(params.source ?? params.items ?? getPreviousData(state));
  const where = params.where ?? params.condition ?? {};
  const output = items.filter((item, index) => matchesDataWhere(item, where, { ...state, item, index }));
  return createResult({ ok: true, message: 'Data filtered.', data: { items: output, records: output, count: output.length } });
}

function executeDataSortNode(params, state) {
  const items = [...asArray(params.source ?? params.items ?? getPreviousData(state))];
  const fields = Array.isArray(params.by) ? params.by : params.by ? [params.by] : [];
  const direction = String(params.direction ?? 'asc').toLowerCase() === 'desc' ? -1 : 1;
  items.sort((left, right) => compareSortValues(getSortValue(left, fields), getSortValue(right, fields)) * direction);
  return createResult({ ok: true, message: 'Data sorted.', data: { items, records: items, count: items.length } });
}

function executeDataMapNode(params, state) {
  const items = asArray(params.source ?? params.items ?? getPreviousData(state));
  const mappings = isPlainObject(params.mappings) ? params.mappings : isPlainObject(params.projection) ? params.projection : {};
  const output = items.map((item, index) => {
    const localState = { ...state, item, index, locals: { ...(state.locals ?? {}), item, data: item, record: item, index } };
    return Object.keys(mappings).length > 0
      ? resolveFlowExecutionValue(mappings, localState)
      : item;
  });
  return createResult({ ok: true, message: 'Data mapped.', data: { items: output, records: output, count: output.length } });
}

function executeDataMergeNode(params, state) {
  const leftItems = asArray(params.left ?? params.source ?? getPreviousData(state));
  const rightItems = asArray(params.right ?? []);
  const leftKey = params.leftKey ?? params.key ?? 'id';
  const rightKey = params.rightKey ?? params.key ?? 'id';
  const rightAlias = String(params.rightAlias ?? params.as ?? '').trim();
  const mode = params.mode ?? 'left';
  const rightByKey = new Map(rightItems.map((item) => [readPath(item, rightKey), item]));
  const output = [];

  for (const leftItem of leftItems) {
    const rightItem = rightByKey.get(readPath(leftItem, leftKey));
    if (!rightItem && mode === 'inner') {
      continue;
    }
    output.push(mergeItems(leftItem, rightItem, rightAlias));
  }

  return createResult({ ok: true, message: 'Data merged.', data: { items: output, records: output, count: output.length } });
}

function executeDataPickNode(params, state) {
  const source = params.source ?? params.data ?? getPreviousData(state);
  const mode = params.mode ?? 'first';
  const value = pickDataValue(source, mode, params);
  return createResult({
    ok: true,
    message: isEmpty(value) ? 'Data pick returned empty.' : 'Data picked.',
    data: {
      value,
      record: value,
      empty: isEmpty(value)
    }
  });
}

function executeDataDedupeNode(params, state) {
  const items = asArray(params.source ?? params.items ?? getPreviousData(state));
  const keys = Array.isArray(params.keys) && params.keys.length > 0 ? params.keys : ['id'];
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const fingerprint = keys.map((key) => JSON.stringify(readPath(item, key))).join('|');
    if (seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);
    output.push(item);
  }

  return createResult({ ok: true, message: 'Data deduped.', data: { items: output, records: output, count: output.length } });
}

function executeConditionNode(node, state) {
  const matched = evaluateFlowCondition(node.condition, createExpressionInput(state), state.context ?? {});
  return createResult({ ok: true, message: 'Condition evaluated.', data: { matched, value: matched } });
}

function executeSwitchNode(node, state) {
  const condition = node.condition ?? {};
  const value = readPath(createExpressionInput(state), condition.path ?? 'data');
  const cases = Array.isArray(condition.cases) ? condition.cases : [];
  const matchedCase = cases.find((item) => matchesStructuredCondition(value, item));
  return createResult({
    ok: true,
    message: matchedCase ? 'Switch case matched.' : 'Switch default matched.',
    data: {
      value,
      matched: Boolean(matchedCase),
      case: matchedCase ?? null,
      default: !matchedCase
    }
  });
}

function executeOutputNode(node, params, state) {
  const output = createFlowOutput(node, params, state);
  return createResult({
    ok: true,
    message: 'Flow output created.',
    data: {
      output,
      ...output
    }
  });
}

function getFlowExecutionOrder(flow) {
  const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
  const edges = Array.isArray(flow.edges) ? flow.edges : [];
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));

  for (const edge of edges) {
    if (!indegree.has(edge.from) || !indegree.has(edge.to)) {
      continue;
    }
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from).push(edge.to);
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const queue = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  const order = [];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    const node = nodeById.get(nodeId);
    if (node) {
      order.push(node);
    }
    for (const nextId of outgoing.get(nodeId) ?? []) {
      indegree.set(nextId, (indegree.get(nextId) ?? 0) - 1);
      if (indegree.get(nextId) === 0) {
        queue.push(nextId);
      }
    }
  }

  return order.length === nodes.length ? order : nodes;
}

function groupIncomingEdges(flow) {
  const incoming = new Map();
  for (const edge of flow.edges ?? []) {
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge]);
  }
  return incoming;
}

function getFlowNodeRunState(node, incomingEdgesByNodeId, resultsByNodeId) {
  const incoming = incomingEdgesByNodeId.get(node.id) ?? [];
  if (incoming.length === 0) {
    return { run: true, reason: 'root' };
  }

  const active = incoming.filter((edge) => isIncomingEdgeActive(edge, resultsByNodeId[edge.from]));
  return active.length > 0
    ? { run: true, reason: 'incoming-active', activeIncomingEdges: active.length }
    : { run: false, reason: 'incoming-inactive', activeIncomingEdges: 0 };
}

function isIncomingEdgeActive(edge, sourceResult) {
  if (!sourceResult) {
    return false;
  }

  const condition = edge.condition ?? 'success';
  const skipped = Boolean(sourceResult.data?.skipped);

  if (typeof condition === 'string') {
    if (condition === 'always') {
      return true;
    }
    if (condition === 'success') {
      return sourceResult.ok && !skipped;
    }
    if (condition === 'failure') {
      return !sourceResult.ok && !skipped;
    }
    if (condition === 'skipped') {
      return skipped;
    }
    return false;
  }

  if (!isPlainObject(condition)) {
    return Boolean(sourceResult.ok);
  }

  return matchesStructuredEdgeCondition(sourceResult, condition);
}

function matchesStructuredEdgeCondition(result, condition) {
  if (condition.ok !== undefined && Boolean(result.ok) !== condition.ok) {
    return false;
  }
  if (condition.skipped !== undefined && Boolean(result.data?.skipped) !== condition.skipped) {
    return false;
  }

  const value = condition.path ? readPath(result, condition.path) : result.data;
  return matchesStructuredCondition(value, condition);
}

function matchesStructuredCondition(value, condition) {
  if (condition.exists !== undefined && compareValues(value, 'exists', undefined) !== condition.exists) {
    return false;
  }
  if (condition.empty !== undefined && isEmpty(value) !== condition.empty) {
    return false;
  }
  if (condition.notEmpty !== undefined && isEmpty(value) === condition.notEmpty) {
    return false;
  }
  if (condition.equals !== undefined && value !== condition.equals) {
    return false;
  }
  if (condition.notEquals !== undefined && value === condition.notEquals) {
    return false;
  }
  if (condition.in !== undefined && (!Array.isArray(condition.in) || !condition.in.includes(value))) {
    return false;
  }
  if (condition.gt !== undefined && !(Number(value) > Number(condition.gt))) {
    return false;
  }
  if (condition.gte !== undefined && !(Number(value) >= Number(condition.gte))) {
    return false;
  }
  if (condition.lt !== undefined && !(Number(value) < Number(condition.lt))) {
    return false;
  }
  if (condition.lte !== undefined && !(Number(value) <= Number(condition.lte))) {
    return false;
  }
  if (condition.contains !== undefined && !compareValues(value, 'contains', condition.contains)) {
    return false;
  }
  return true;
}

function matchesDataWhere(item, where, state) {
  if (!where || (isPlainObject(where) && Object.keys(where).length === 0)) {
    return true;
  }

  if (Array.isArray(where.all)) {
    return where.all.every((entry) => matchesDataWhere(item, entry, state));
  }
  if (Array.isArray(where.any)) {
    return where.any.some((entry) => matchesDataWhere(item, entry, state));
  }
  if (where.not !== undefined) {
    return !matchesDataWhere(item, where.not, state);
  }
  if (where.field || where.path) {
    const left = readPath(item, where.field ?? where.path);
    const right = resolveFlowExecutionValue(where.value ?? where.right, state);
    return compareValues(left, where.operator ?? 'eq', right);
  }

  if (where.left !== undefined || where.operator !== undefined) {
    return evaluateFlowCondition(where, createExpressionInput(state), state.context ?? {});
  }

  if (isPlainObject(where)) {
    return Object.entries(where).every(([key, expected]) => readPath(item, key) === expected);
  }

  return Boolean(where);
}

function resolveExecutionReference(reference, state) {
  const path = String(reference || '').trim();
  if (!path) {
    return '';
  }

  if (path.startsWith('intent.')) {
    return readPath(state.input?.slots ?? {}, path.slice('intent.'.length));
  }

  if (path.startsWith('context.')) {
    return readPath(state.context ?? {}, path.slice('context.'.length));
  }

  if (path.startsWith('item.')) {
    return readPath(state.locals?.item ?? state.item ?? {}, path.slice('item.'.length));
  }

  if (path === 'previous' || path.startsWith('previous.')) {
    return path === 'previous'
      ? state.previous
      : readPath(state.previous, path.slice('previous.'.length));
  }

  const [nodeId, ...rest] = path.split('.');
  return readPath(state.resultsByNodeId?.[nodeId], rest.join('.') || 'data');
}

function createExpressionInput(state) {
  return {
    ...(state.input ?? {}),
    slots: state.input?.slots ?? {},
    intent: state.input?.slots ?? {},
    data: getPreviousData(state),
    previous: state.previous,
    item: state.item ?? state.locals?.item,
    index: state.index ?? state.locals?.index
  };
}

function getPreviousNodeResult(nodeResults) {
  for (let index = nodeResults.length - 1; index >= 0; index -= 1) {
    const result = nodeResults[index]?.result;
    if (result && !result.data?.skipped) {
      return result;
    }
  }
  return null;
}

function getPreviousData(state) {
  return state.previous?.data?.items
    ?? state.previous?.data?.records
    ?? state.previous?.data?.record
    ?? state.previous?.data?.value
    ?? state.previous?.data?.result
    ?? state.previous?.data
    ?? null;
}

function createSkippedNodeResult(node, reason) {
  return createResult({
    ok: true,
    message: `Flow node skipped: ${reason}.`,
    data: {
      skipped: true,
      nodeId: node.id,
      type: node.type,
      reason
    }
  });
}

function createTimelineStep(stage, status, message, metadata = {}) {
  return {
    stage,
    status,
    message,
    timestamp: new Date().toISOString(),
    metadata
  };
}

function normalizeParamValue(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeParamValue);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entryValue]) => [key, normalizeParamValue(entryValue)]));
  }
  return typeof value === 'string' ? value.trim() : value;
}

function pickDataValue(source, mode, params) {
  const path = params.path ? String(params.path) : '';
  const data = path ? readPath(source, path) : source;

  if (Array.isArray(data)) {
    if (mode === 'last') {
      return data[data.length - 1] ?? null;
    }
    if (mode === 'index') {
      return data[Number(params.index || 0)] ?? null;
    }
    return data[0] ?? null;
  }

  return data ?? null;
}

function mergeItems(leftItem, rightItem, rightAlias) {
  if (!rightItem) {
    return leftItem;
  }
  if (rightAlias) {
    return { ...leftItem, [rightAlias]: rightItem };
  }
  return { ...leftItem, ...rightItem };
}

function getSortValue(item, fields) {
  if (fields.length === 0) {
    return item;
  }

  return fields.map((field) => {
    const path = typeof field === 'string' ? field : field?.field ?? field?.path ?? '';
    return readPath(item, path);
  });
}

function compareSortValues(left, right) {
  const leftValues = Array.isArray(left) ? left : [left];
  const rightValues = Array.isArray(right) ? right : [right];
  const length = Math.max(leftValues.length, rightValues.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftValues[index];
    const rightValue = rightValues[index];
    if (leftValue === rightValue) {
      continue;
    }
    return String(leftValue ?? '').localeCompare(String(rightValue ?? ''), undefined, { numeric: true });
  }

  return 0;
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === null || value === undefined || value === '') {
    return [];
  }
  return [value];
}

function readPath(source, path) {
  if (!path) {
    return source;
  }

  const parts = String(path).split('.').filter(Boolean);
  let current = source;

  for (const part of parts) {
    if (current === null || current === undefined || !(part in Object(current))) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

function isEmpty(value) {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}
