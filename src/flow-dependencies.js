import { escapeHTML } from './components/dom.js';

const TEMPLATE_REFERENCE_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

export function analyzeFlowDataDependencies(flow = {}) {
  const nodes = Array.isArray(flow?.nodes) ? flow.nodes : [];
  const edges = Array.isArray(flow?.edges) ? flow.edges : [];
  const nodeIds = new Set(nodes.map((node) => node.id).filter(Boolean));
  const adjacency = createAdjacency(nodes, edges);
  const dependencies = [];

  for (const node of nodes) {
    const references = [
      ...extractFlowDataReferences(node.params, `${node.id}.params`),
      ...extractFlowDataReferences(node.condition, `${node.id}.condition`)
    ];

    for (const reference of references) {
      if (reference.source !== 'node') {
        dependencies.push({
          ...reference,
          toNodeId: node.id,
          status: 'external',
          message: `${reference.raw} is resolved from ${reference.source}.`
        });
        continue;
      }

      if (!nodeIds.has(reference.fromNodeId)) {
        dependencies.push({
          ...reference,
          toNodeId: node.id,
          status: 'missing-node',
          message: `Referenced node does not exist: ${reference.fromNodeId}.`
        });
        continue;
      }

      if (reference.fromNodeId === node.id) {
        dependencies.push({
          ...reference,
          toNodeId: node.id,
          status: 'self',
          message: `Node references itself: ${node.id}.`
        });
        continue;
      }

      if (hasPath(adjacency, reference.fromNodeId, node.id)) {
        dependencies.push({
          ...reference,
          toNodeId: node.id,
          status: 'upstream',
          message: `${reference.fromNodeId} feeds ${node.id}.`
        });
        continue;
      }

      if (hasPath(adjacency, node.id, reference.fromNodeId)) {
        dependencies.push({
          ...reference,
          toNodeId: node.id,
          status: 'downstream',
          message: `${node.id} references downstream node ${reference.fromNodeId}.`
        });
        continue;
      }

      dependencies.push({
        ...reference,
        toNodeId: node.id,
        status: 'unconnected',
        message: `${node.id} references ${reference.fromNodeId}, but no edge connects that dependency.`
      });
    }
  }

  const blocking = dependencies.filter((item) => ['missing-node', 'self', 'downstream'].includes(item.status));
  const warnings = dependencies.filter((item) => item.status === 'unconnected');
  const external = dependencies.filter((item) => item.status === 'external');
  const upstream = dependencies.filter((item) => item.status === 'upstream');

  return {
    ok: blocking.length === 0,
    status: blocking.length > 0 ? 'blocked' : warnings.length > 0 ? 'review' : 'ready',
    flowId: flow?.id || '',
    flowName: flow?.name || '',
    total: dependencies.length,
    upstreamCount: upstream.length,
    externalCount: external.length,
    warningCount: warnings.length,
    blockingCount: blocking.length,
    dependencies,
    blocking,
    warnings,
    summary: createDependencySummary({ dependencies, upstream, external, warnings, blocking })
  };
}

export function extractFlowDataReferences(value, path = 'value') {
  const references = [];
  visitReferences(value, path, references);
  return references;
}

export function renderFlowDataDependenciesToHTML(reportOrFlow) {
  const report = isDependencyReport(reportOrFlow) ? reportOrFlow : analyzeFlowDataDependencies(reportOrFlow);
  if (report.total === 0) {
    return '<div class="flow-empty flow-empty--compact">No data dependencies detected.</div>';
  }

  return [
    `<section class="flow-dependency-report flow-dependency-report--${escapeHTML(report.status)}">`,
    '<div class="flow-dependency-report__header">',
    '<span>',
    '<strong>Data dependencies</strong>',
    `<small>${escapeHTML(report.summary)}</small>`,
    '</span>',
    `<em>${escapeHTML(report.status)}</em>`,
    '</div>',
    '<div class="flow-dependency-report__stats">',
    renderDependencyStat('Upstream', report.upstreamCount),
    renderDependencyStat('External', report.externalCount),
    renderDependencyStat('Review', report.warningCount),
    renderDependencyStat('Blocked', report.blockingCount),
    '</div>',
    '<ol class="flow-dependency-report__items">',
    ...report.dependencies.map(renderDependencyItem),
    '</ol>',
    '</section>'
  ].join('');
}

function visitReferences(value, path, references) {
  if (typeof value === 'string') {
    for (const reference of parseTemplateReferences(value, path)) {
      references.push(reference);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => visitReferences(item, `${path}[${index}]`, references));
    return;
  }

  if (!isPlainObject(value)) {
    return;
  }

  if (typeof value.$from === 'string' && value.$from.trim()) {
    references.push({
      source: 'node',
      raw: `$from:${value.$from}`,
      fromNodeId: value.$from.trim(),
      refPath: typeof value.path === 'string' ? value.path : 'data',
      path
    });
  }

  for (const [key, entryValue] of Object.entries(value)) {
    if (key === '$from') {
      continue;
    }
    visitReferences(entryValue, `${path}.${key}`, references);
  }
}

function parseTemplateReferences(value, path) {
  const references = [];
  TEMPLATE_REFERENCE_PATTERN.lastIndex = 0;
  let match = TEMPLATE_REFERENCE_PATTERN.exec(value);
  while (match) {
    const raw = match[1].trim();
    const parsed = parseReference(raw, path);
    if (parsed) {
      references.push(parsed);
    }
    match = TEMPLATE_REFERENCE_PATTERN.exec(value);
  }
  return references;
}

function parseReference(raw, path) {
  if (!raw) {
    return null;
  }
  if (raw.startsWith('intent.')) {
    return { source: 'intent', raw, fromNodeId: '', refPath: raw.slice('intent.'.length), path };
  }
  if (raw.startsWith('context.')) {
    return { source: 'context', raw, fromNodeId: '', refPath: raw.slice('context.'.length), path };
  }

  const [fromNodeId, ...rest] = raw.split('.');
  if (!fromNodeId) {
    return null;
  }
  return {
    source: 'node',
    raw,
    fromNodeId,
    refPath: rest.join('.') || 'data',
    path
  };
}

function createAdjacency(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    if (adjacency.has(edge.from) && adjacency.has(edge.to)) {
      adjacency.get(edge.from).push(edge.to);
    }
  }
  return adjacency;
}

function hasPath(adjacency, from, to) {
  const queue = [from];
  const visited = new Set();
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === to) {
      return true;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) {
      queue.push(next);
    }
  }
  return false;
}

function createDependencySummary(input) {
  if (input.dependencies.length === 0) {
    return 'No node, intent, or context data references were detected.';
  }
  if (input.blocking.length > 0) {
    return `${input.blocking.length} blocking data dependency issue${input.blocking.length === 1 ? '' : 's'} found.`;
  }
  if (input.warnings.length > 0) {
    return `${input.warnings.length} data dependency issue${input.warnings.length === 1 ? '' : 's'} should be reviewed.`;
  }
  return `${input.upstream.length} upstream and ${input.external.length} external data dependencies are ready.`;
}

function renderDependencyStat(label, value) {
  return [
    '<span>',
    `<strong>${escapeHTML(value)}</strong>`,
    `<small>${escapeHTML(label)}</small>`,
    '</span>'
  ].join('');
}

function renderDependencyItem(item) {
  return [
    `<li class="flow-dependency-report__item flow-dependency-report__item--${escapeHTML(item.status)}">`,
    '<span>',
    `<strong>${escapeHTML(item.raw)}</strong>`,
    `<small>${escapeHTML(item.path)}${item.toNodeId ? ` -> ${escapeHTML(item.toNodeId)}` : ''}</small>`,
    '</span>',
    `<em>${escapeHTML(item.status)}</em>`,
    `<p>${escapeHTML(item.message)}</p>`,
    '</li>'
  ].join('');
}

function isDependencyReport(value) {
  return value && typeof value === 'object' && Array.isArray(value.dependencies) && typeof value.status === 'string';
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}
