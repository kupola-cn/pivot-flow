import { escapeAttr, escapeHTML } from './dom.js';

export function renderVariableMapperToHTML(options = {}) {
  const sources = normalizeSources(options.sources ?? createFlowVariableSources(options.flow, options.selectedNodeId));

  return [
    '<div class="flow-variable-mapper">',
    '<div class="flow-panel-title">Variable mapper</div>',
    sources.length === 0
      ? '<div class="flow-empty flow-empty--compact">No variables available for the selected node.</div>'
      : [
        '<ol class="flow-variable-mapper__list">',
        ...sources.map((source) => renderVariableSource(source)),
        '</ol>'
      ].join(''),
    '<div class="flow-variable-mapper__hint">Select a token to insert it into the selected node params.</div>',
    '</div>'
  ].join('');
}

export function createFlowVariableSources(flow = {}, selectedNodeId = '') {
  const nodes = Array.isArray(flow?.nodes) ? flow.nodes : [];
  const edges = Array.isArray(flow?.edges) ? flow.edges : [];
  const selectedId = String(selectedNodeId || '').trim();
  const sources = [];

  for (const slot of Array.isArray(flow?.intent?.slots) ? flow.intent.slots : []) {
    if (!slot?.name) {
      continue;
    }
    sources.push(createVariableSource({
      group: 'Intent',
      label: slot.label || slot.name,
      reference: `intent.${slot.name}`,
      paramKey: slot.name,
      description: slot.required ? 'required slot' : 'slot'
    }));
  }

  for (const reference of [
    ['Actor id', 'context.actor.id', 'actorId'],
    ['Actor permissions', 'context.actor.permissions', 'actorPermissions'],
    ['Route page', 'context.route.page', 'routePage'],
    ['Selection id', 'context.selection.id', 'selectionId'],
    ['Form values', 'context.form', 'form'],
    ['Table state', 'context.table', 'table']
  ]) {
    sources.push(createVariableSource({
      group: 'Context',
      label: reference[0],
      reference: reference[1],
      paramKey: reference[2],
      description: 'runtime context'
    }));
  }

  const upstreamIds = selectedId
    ? getUpstreamNodeIds(selectedId, nodes, edges)
    : nodes.map((node) => node.id).filter(Boolean);
  const selectedIndex = nodes.findIndex((node) => node.id === selectedId);
  const availableNodeIds = upstreamIds.length > 0
    ? upstreamIds
    : selectedIndex > 0 ? nodes.slice(0, selectedIndex).map((node) => node.id) : [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  for (const nodeId of availableNodeIds) {
    if (!nodeId || nodeId === selectedId) {
      continue;
    }
    const node = nodeById.get(nodeId);
    sources.push(createVariableSource({
      group: 'Upstream node',
      label: node?.label || nodeId,
      reference: `${nodeId}.data.id`,
      paramKey: createParamKey(nodeId, 'Id'),
      description: node?.capability || node?.type || 'node output'
    }));
    sources.push(createVariableSource({
      group: 'Upstream node',
      label: `${node?.label || nodeId} data`,
      reference: `${nodeId}.data`,
      paramKey: createParamKey(nodeId, 'Data'),
      description: 'full node data'
    }));
  }

  return dedupeSources(sources);
}

function renderVariableSource(source) {
  return [
    '<li class="flow-variable-mapper__item">',
    '<span>',
    `<strong>${escapeHTML(source.label)}</strong>`,
    `<small>${escapeHTML(source.group)} · ${escapeHTML(source.description || '')}</small>`,
    `<code>{{${escapeHTML(source.reference)}}}</code>`,
    '</span>',
    '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-action="insert-variable-reference" ',
    `data-flow-reference="${escapeAttr(source.reference)}" data-flow-param-key="${escapeAttr(source.paramKey)}">Insert</button>`,
    '</li>'
  ].join('');
}

function normalizeSources(sources) {
  return (Array.isArray(sources) ? sources : []).map((source) => {
    if (typeof source === 'string') {
      return createVariableSource({
        group: 'Variable',
        label: source,
        reference: source,
        paramKey: createParamKey(source)
      });
    }
    return createVariableSource(source ?? {});
  }).filter((source) => source.reference);
}

function createVariableSource(input) {
  return {
    group: input.group || 'Variable',
    label: input.label || input.reference,
    reference: input.reference,
    paramKey: input.paramKey || createParamKey(input.reference),
    description: input.description || ''
  };
}

function getUpstreamNodeIds(selectedNodeId, nodes, edges) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (!nodeIds.has(selectedNodeId)) {
    return [];
  }

  const incoming = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    if (incoming.has(edge.to) && nodeIds.has(edge.from)) {
      incoming.get(edge.to).push(edge.from);
    }
  }

  const output = [];
  const visited = new Set();
  const queue = [...(incoming.get(selectedNodeId) ?? [])];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);
    output.push(current);
    queue.push(...(incoming.get(current) ?? []));
  }

  const order = new Map(nodes.map((node, index) => [node.id, index]));
  return output.sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
}

function dedupeSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    if (!source.reference || seen.has(source.reference)) {
      return false;
    }
    seen.add(source.reference);
    return true;
  });
}

function createParamKey(value, suffix = '') {
  const parts = String(value || '')
    .replace(/\{\{|\}\}/g, '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return 'value';
  }
  const [first, ...rest] = parts;
  const key = [
    first.toLowerCase(),
    ...rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  ].join('');
  return `${key}${suffix}`;
}
