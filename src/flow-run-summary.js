import { getFlowNodeCapability } from './node-types.js';
import { escapeHTML } from './components/dom.js';

export function getFlowExecutionTrace(result, nodes = [], edges = []) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const safeEdges = Array.isArray(edges) ? edges : [];
  const nodeStates = new Map();
  const edgeStates = new Map();
  const executedNodeIds = [];
  const failedNodeIds = [];
  const skippedNodeIds = [];
  let totalDurationMs = 0;
  const nodeResults = result?.data?.nodes;
  if (!Array.isArray(nodeResults)) {
    return {
      nodeStates,
      edgeStates,
      executedNodeIds,
      failedNodeIds,
      skippedNodeIds,
      firstFailedNodeId: '',
      totalDurationMs
    };
  }

  for (const item of nodeResults) {
    const nodeId = getResultNodeId(item);
    if (!nodeId) {
      continue;
    }
    const skipped = Boolean(item?.result?.data?.skipped);
    const ok = Boolean(item?.result?.ok);
    const status = skipped ? 'skipped' : ok ? 'executed' : 'failed';
    const durationMs = getFlowResultDurationMs(item);
    const message = getFlowResultMessage(item);
    if (durationMs > 0) {
      totalDurationMs += durationMs;
    }
    nodeStates.set(nodeId, {
      status,
      result: item?.result ?? null,
      durationMs,
      message,
      code: getFlowResultCode(item),
      label: item?.node?.label || nodeId,
      capability: item?.node?.capability || ''
    });

    if (status === 'executed') {
      executedNodeIds.push(nodeId);
    } else if (status === 'failed') {
      failedNodeIds.push(nodeId);
    } else if (status === 'skipped') {
      skippedNodeIds.push(nodeId);
    }
  }

  const knownNodeIds = new Set(safeNodes.map((node) => node.id));
  for (const edge of safeEdges) {
    if (!edge?.id || !knownNodeIds.has(edge.from) || !knownNodeIds.has(edge.to)) {
      continue;
    }
    const fromStatus = nodeStates.get(edge.from)?.status ?? 'idle';
    const toStatus = nodeStates.get(edge.to)?.status ?? 'idle';
    const active = isFlowEdgeOnExecutionPath(edge, fromStatus, toStatus);
    edgeStates.set(edge.id, {
      active,
      failed: active && (fromStatus === 'failed' || toStatus === 'failed'),
      fromStatus,
      toStatus
    });
  }

  return {
    nodeStates,
    edgeStates,
    executedNodeIds,
    failedNodeIds,
    skippedNodeIds,
    firstFailedNodeId: failedNodeIds[0] ?? '',
    totalDurationMs
  };
}

export function getFlowRunSummary(result, flowOrNodes = [], options = {}) {
  const nodes = Array.isArray(flowOrNodes) ? flowOrNodes : Array.isArray(flowOrNodes?.nodes) ? flowOrNodes.nodes : [];
  const edges = Array.isArray(options.edges) ? options.edges : Array.isArray(flowOrNodes?.edges) ? flowOrNodes.edges : [];
  const trace = getFlowExecutionTrace(result, nodes, edges);
  const nodeById = new Map(nodes.map((node, index) => [node.id, { node, index }]));
  const nodeItems = Array.from(trace.nodeStates.entries()).map(([nodeId, state]) => {
    const entry = nodeById.get(nodeId);
    const node = entry?.node ?? {};
    return {
      id: nodeId,
      label: node.label || state.label || nodeId,
      index: entry?.index ?? -1,
      type: node.type || '',
      capability: getFlowNodeCapability(node) || state.capability || '',
      risk: node.risk || 'low',
      status: state.status,
      durationMs: state.durationMs || 0,
      message: state.message || '',
      code: state.code || ''
    };
  });
  const failedNodes = nodeItems.filter((node) => node.status === 'failed');
  const slowestNodes = nodeItems
    .filter((node) => node.durationMs > 0)
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, Number(options.slowestLimit || 3));
  const topDurationMs = getFlowResultDurationMs(result);
  const durationMs = trace.totalDurationMs || topDurationMs;
  const status = !result ? 'idle' : result.ok ? 'success' : 'failed';
  const code = getFlowResultCode(result);

  return {
    ok: Boolean(result?.ok),
    status,
    message: getFlowResultMessage(result),
    code,
    durationMs,
    totalNodes: nodes.length || nodeItems.length,
    executedCount: trace.executedNodeIds.length,
    failedCount: trace.failedNodeIds.length,
    skippedCount: trace.skippedNodeIds.length,
    nodeItems,
    failedNodes,
    slowestNodes,
    firstFailedNode: failedNodes[0] ?? null,
    slowestNode: slowestNodes[0] ?? null,
    recommendations: createFlowRunRecommendations({ result, status, code, failedNodes, slowestNodes })
  };
}

export function renderFlowRunSummaryToHTML(summaryOrResult, options = {}) {
  const summary = isFlowRunSummary(summaryOrResult)
    ? summaryOrResult
    : getFlowRunSummary(summaryOrResult, options.flow ?? options.nodes ?? [], options);
  if (summary.status === 'idle') {
    return '<div class="flow-empty">Run or preview a flow to inspect the execution summary.</div>';
  }

  return [
    `<section class="flow-run-summary flow-run-summary--${escapeHTML(summary.status)}">`,
    '<div class="flow-run-summary__header">',
    '<span>',
    '<strong>Flow run summary</strong>',
    `<small>${escapeHTML(summary.message || (summary.ok ? 'Execution completed.' : 'Execution failed.'))}</small>`,
    '</span>',
    `<em>${escapeHTML(summary.status)}</em>`,
    '</div>',
    '<div class="flow-run-summary__stats">',
    renderSummaryStat('Executed', summary.executedCount),
    renderSummaryStat('Failed', summary.failedCount),
    renderSummaryStat('Skipped', summary.skippedCount),
    renderSummaryStat('Duration', summary.durationMs > 0 ? formatFlowDuration(summary.durationMs) : '-'),
    '</div>',
    renderSummaryNodeSection('Failed nodes', summary.failedNodes, 'failed'),
    renderSummaryNodeSection('Slowest nodes', summary.slowestNodes, 'slowest'),
    renderRecommendations(summary.recommendations),
    '</section>'
  ].join('');
}

export function getFlowResultDurationMs(item) {
  const candidates = [
    item?.durationMs,
    item?.elapsedMs,
    item?.timeMs,
    item?.result?.durationMs,
    item?.result?.elapsedMs,
    item?.result?.timeMs,
    item?.result?.data?.durationMs,
    item?.result?.data?.elapsedMs,
    item?.result?.meta?.durationMs,
    item?.result?.metadata?.durationMs,
    item?.data?.durationMs,
    item?.data?.elapsedMs,
    item?.meta?.durationMs,
    item?.metadata?.durationMs
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return 0;
}

export function getFlowResultMessage(item) {
  const result = item?.result ?? item ?? {};
  const data = result?.data ?? {};
  const error = result?.error ?? {};
  const candidates = [
    result.message,
    result.error,
    error.message,
    data.message,
    data.error,
    data.reason,
    data.detail,
    data.summary
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }
    const value = typeof candidate === 'string' ? candidate : JSON.stringify(candidate);
    if (value.trim()) {
      return value.trim();
    }
  }
  return '';
}

export function getFlowResultCode(item) {
  const result = item?.result ?? item ?? {};
  const data = result?.data ?? {};
  const candidates = [
    result.code,
    result.status,
    data.code,
    data.status
  ];
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
      return String(candidate).trim();
    }
  }
  return '';
}

export function formatFlowDuration(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) {
    return '';
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}

export function truncateFlowText(value, maxLength = 120) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function getResultNodeId(item) {
  return item?.node?.id || item?.nodeId || item?.id || '';
}

function isFlowEdgeOnExecutionPath(edge, fromStatus, toStatus) {
  if (fromStatus === 'idle' || toStatus === 'idle') {
    return false;
  }

  const condition = typeof edge.condition === 'string' ? edge.condition : 'success';
  if (condition === 'always') {
    return true;
  }
  if (condition === 'success') {
    return fromStatus === 'executed';
  }
  if (condition === 'failure') {
    return fromStatus === 'failed';
  }
  if (condition === 'skipped') {
    return fromStatus === 'skipped';
  }
  return true;
}

function createFlowRunRecommendations(input) {
  if (!input.result) {
    return ['Run or preview the flow before inspecting diagnostics.'];
  }
  const recommendations = [];
  if (input.failedNodes.length > 0) {
    recommendations.push('Open the first failed node and verify its capability, params, permissions, and backend response.');
  }
  if (['401', '403'].includes(String(input.code))) {
    recommendations.push('Check login state and server-side permissions. Frontend permission hints cannot replace backend authorization.');
  }
  if (input.status === 'failed' && input.failedNodes.length === 0) {
    recommendations.push('Inspect the runtime result, backend response, and audit logs for the failure cause.');
  }
  if (input.slowestNodes[0]?.durationMs >= 1000) {
    recommendations.push('Review the slowest node for API latency, missing indexes, or unnecessary chained operations.');
  }
  return recommendations;
}

function isFlowRunSummary(value) {
  return value && typeof value === 'object' && Array.isArray(value.nodeItems) && Array.isArray(value.recommendations);
}

function renderSummaryStat(label, value) {
  return [
    '<span>',
    `<strong>${escapeHTML(value)}</strong>`,
    `<small>${escapeHTML(label)}</small>`,
    '</span>'
  ].join('');
}

function renderSummaryNodeSection(title, nodes, kind) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return '';
  }
  return [
    `<div class="flow-run-summary__nodes flow-run-summary__nodes--${escapeHTML(kind)}">`,
    `<strong>${escapeHTML(title)}</strong>`,
    '<ol>',
    ...nodes.map((node) => [
      '<li>',
      `<span>${escapeHTML(node.label || node.id)}</span>`,
      `<small>${escapeHTML([
        node.capability,
        node.message || node.code,
        node.durationMs ? formatFlowDuration(node.durationMs) : ''
      ].filter(Boolean).join(' · '))}</small>`,
      '</li>'
    ].join('')),
    '</ol>',
    '</div>'
  ].join('');
}

function renderRecommendations(recommendations) {
  if (!Array.isArray(recommendations) || recommendations.length === 0) {
    return '';
  }
  return [
    '<div class="flow-run-summary__recommendations">',
    '<strong>Recommended checks</strong>',
    '<ul>',
    ...recommendations.map((item) => `<li>${escapeHTML(item)}</li>`),
    '</ul>',
    '</div>'
  ].join('');
}
