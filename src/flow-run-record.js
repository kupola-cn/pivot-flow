import { getFlowNodeCapability } from './node-types.js';

const SENSITIVE_KEY_PATTERN = /(password|passwd|pwd|token|secret|credential|authorization|cookie|phone|mobile|email|id_?card|身份证|手机号|电话|邮箱|密钥|令牌|密码)/i;
const SAFE_SUMMARY_KEYS = new Set([
  'id',
  'name',
  'code',
  'username',
  'realName',
  'status',
  'action',
  'total',
  'count',
  'created',
  'updated',
  'deleted',
  'addedRoleId',
  'addedPermissionId'
]);

export function createFlowRunRecord(input = {}, options = {}) {
  const flow = input.flow ?? {};
  const result = summarizeFlowRunResult(input.result ?? input.preview, options);
  return {
    flowId: input.flowId || flow.id || '',
    flowName: input.flowName || flow.name || '',
    prompt: input.prompt || '',
    ok: Boolean(input.result?.ok ?? input.preview?.ok),
    message: input.message || input.result?.message || input.preview?.message || '',
    result,
    ...(options.includeRawResult ? { rawResult: sanitizeFlowRunValue(input.result ?? input.preview, options) } : {})
  };
}

export function summarizeFlowRunResult(result, options = {}) {
  if (!result) {
    return null;
  }

  const nodes = Array.isArray(result?.data?.nodes)
    ? result.data.nodes.slice(0, Number(options.maxNodes || 50)).map((item) => summarizeFlowRunNode(item, options))
    : [];

  return {
    ok: Boolean(result.ok),
    message: result.message || '',
    code: result.code || '',
    data: {
      nodeCount: Array.isArray(result?.data?.nodes) ? result.data.nodes.length : nodes.length,
      nodes,
      summary: summarizeBusinessData(result.data, options)
    }
  };
}

export function sanitizeFlowRunValue(value, options = {}, depth = 0, key = '') {
  const maxDepth = Number(options.maxDepth || 5);
  const maxArrayItems = Number(options.maxArrayItems || 20);
  const maxStringLength = Number(options.maxStringLength || 500);

  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return '[redacted]';
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return value.length > maxStringLength ? `${value.slice(0, maxStringLength)}...` : value;
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (depth >= maxDepth) {
    return '[truncated]';
  }
  if (Array.isArray(value)) {
    return value.slice(0, maxArrayItems).map((item) => sanitizeFlowRunValue(item, options, depth + 1, key));
  }

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      sanitizeFlowRunValue(entryValue, options, depth + 1, entryKey)
    ])
  );
}

function summarizeFlowRunNode(item, options) {
  const node = item?.node ?? {};
  const result = item?.result ?? {};
  return {
    node: {
      id: node.id || '',
      type: node.type || '',
      label: node.label || node.id || '',
      capability: getFlowNodeCapability(node) || node.capability || '',
      risk: node.risk || ''
    },
    result: {
      ok: Boolean(result.ok),
      message: result.message || '',
      code: result.code || '',
      durationMs: getDurationMs(result),
      data: summarizeBusinessData(result.data, options)
    }
  };
}

function summarizeBusinessData(value, options = {}, depth = 0) {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return {
      listCount: value.length
    };
  }
  if (typeof value !== 'object') {
    return sanitizeFlowRunValue(value, options, depth);
  }
  if (depth >= Number(options.summaryDepth || 2)) {
    return '[summary-truncated]';
  }

  const output = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (key === 'nodes') {
      continue;
    }
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = '[redacted]';
      continue;
    }
    if (Array.isArray(entryValue)) {
      output[`${key}Count`] = entryValue.length;
      continue;
    }
    if (isPlainObject(entryValue)) {
      output[key] = summarizeBusinessData(entryValue, options, depth + 1);
      continue;
    }
    if (SAFE_SUMMARY_KEYS.has(key) || /Count$|Id$|Code$|Name$/i.test(key)) {
      output[key] = sanitizeFlowRunValue(entryValue, options, depth, key);
    }
  }
  return output;
}

function getDurationMs(result) {
  const value = result?.durationMs ?? result?.data?.durationMs ?? result?.data?.elapsedMs ?? 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}
