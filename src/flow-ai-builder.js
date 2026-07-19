import { ActionType, RiskLevel } from '@kupola/pivot';
import { createFlow } from './flow-schema.js';
import { validateFlow } from './flow-validation.js';
import { FLOW_NODE_TYPES, FLOW_STATUS, getDefaultCapabilityForNodeType, getFlowNodeCapability } from './node-types.js';

export function createAIFlowBuilderContext(source, options = {}) {
  const capabilitySummary = createCapabilityManifestSummary(source, options);
  return {
    generatedAt: capabilitySummary.generatedAt,
    instruction: 'Generate draft FlowDefinition JSON only. Do not execute, publish, or invent capabilities.',
    safetyRules: [
      'status must be draft',
      'nodes may only reference registered capabilities from capabilitySummary.capabilities',
      'high, critical, and delete operation nodes must set requiresConfirmation to true',
      'API calls must be represented by registered capability.run nodes, not arbitrary URLs',
      'sensitive values must be requested as manual slots instead of embedded in prompt examples'
    ],
    flowShape: {
      id: 'string',
      name: 'string',
      description: 'string',
      status: 'draft',
      intent: {
        examples: ['string'],
        keywords: ['string'],
        patterns: ['string'],
        slots: [
          {
            name: 'string',
            label: 'string',
            type: 'string',
            required: true,
            source: 'intent'
          }
        ]
      },
      nodes: [
        {
          id: 'string',
          type: 'capability.run',
          label: 'string',
          capability: 'registered.capability.name',
          params: {}
        }
      ],
      edges: [
        {
          from: 'node-id',
          to: 'node-id',
          condition: 'success'
        }
      ]
    },
    capabilitySummary
  };
}

export function createAIFlowDraft(input = {}, options = {}) {
  const capabilities = normalizeCapabilities(options.capabilities ?? options.runtime);
  const capabilityByName = new Map(capabilities.map((capability) => [capability.name, capability]));
  const source = isPlainObject(input?.flow) ? input.flow : input;
  const nodes = Array.isArray(source?.nodes)
    ? source.nodes.map((node, index) => normalizeAIFlowNode(node, index, capabilityByName))
    : [];
  const flow = createFlow({
    ...source,
    status: FLOW_STATUS.DRAFT,
    nodes,
    edges: Array.isArray(source?.edges) ? source.edges : [],
    metadata: {
      ...(isPlainObject(source?.metadata) ? source.metadata : {}),
      aiGenerated: true,
      aiBuilder: 'pivot-flow',
      sourceIntent: input?.prompt || source?.metadata?.sourceIntent || ''
    }
  });
  const validation = validateAIFlowDraft(flow, {
    ...options,
    capabilities
  });

  return {
    ok: validation.valid,
    flow,
    validation,
    capabilitySummary: validation.capabilitySummary
  };
}

export function recommendFlowCapabilities(prompt = '', source, options = {}) {
  const capabilities = createCapabilityManifestSummary(source, options).capabilities;
  const query = String(prompt || '').trim().toLowerCase();
  const tokens = createSearchTokens(query);
  const limit = Math.max(1, Number(options.limit || 8));

  return capabilities
    .map((capability) => ({
      capability,
      score: scoreCapability(capability, query, tokens),
      reasons: getCapabilityRecommendationReasons(capability, query, tokens)
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.capability.name.localeCompare(right.capability.name))
    .slice(0, limit);
}

export function renderAIFlowDraftPreviewToHTML(draftResult, options = {}) {
  const flow = draftResult?.flow ?? draftResult;
  const validation = draftResult?.validation ?? validateAIFlowDraft(flow, options);
  const nodes = Array.isArray(flow?.nodes) ? flow.nodes : [];
  const status = validation.valid ? 'valid draft' : 'blocked';

  return [
    '<section class="flow-ai-draft-preview">',
    '<div class="flow-ai-draft-preview__header">',
    '<div>',
    `<strong>${escapeHTML(flow?.name || flow?.id || 'AI Flow draft')}</strong>`,
    `<span>${escapeHTML(flow?.description || flow?.id || '')}</span>`,
    '</div>',
    `<span class="flow-badge flow-badge--${validation.valid ? 'low' : 'high'}">${escapeHTML(status)}</span>`,
    '</div>',
    validation.errors.length > 0
      ? `<div class="flow-alert flow-alert--error">${escapeHTML(validation.errors.join('; '))}</div>`
      : '',
    '<ol class="flow-ai-draft-preview__nodes">',
    ...nodes.map((node, index) => renderDraftNode(node, index)),
    '</ol>',
    options.showJSON
      ? `<pre>${escapeHTML(JSON.stringify(flow, null, 2))}</pre>`
      : '',
    '</section>'
  ].join('');
}

export function createCapabilityManifestSummary(source, options = {}) {
  const capabilities = normalizeCapabilities(source, options.filter)
    .map((capability) => summarizeCapability(capability, options));
  const resources = countBy(capabilities, 'resource');
  const actions = countBy(capabilities, 'action');
  const risks = countBy(capabilities, 'risk');
  const permissions = Array.from(new Set(capabilities.flatMap((capability) => capability.permissions ?? []))).sort();

  return {
    generatedAt: new Date().toISOString(),
    count: capabilities.length,
    capabilities,
    resources,
    actions,
    risks,
    permissions
  };
}

export function validateAIFlowDraft(flow, options = {}) {
  const capabilities = normalizeCapabilities(options.capabilities ?? options.runtime);
  const capabilityNames = new Set(capabilities.map((capability) => capability.name).filter(Boolean));
  const capabilityByName = new Map(capabilities.map((capability) => [capability.name, capability]));
  const validation = validateFlow(flow, capabilityNames.size > 0 ? { capabilities: capabilityNames } : {});
  const errors = [...validation.errors];
  const warnings = [...validation.warnings];

  if (!options.allowPublished && flow?.status !== FLOW_STATUS.DRAFT) {
    errors.push('AI-generated flow must remain draft until reviewed and published by an authorized user.');
  }

  for (const node of Array.isArray(flow?.nodes) ? flow.nodes : []) {
    const capabilityName = getFlowNodeCapability(node);
    if (!capabilityName) {
      continue;
    }

    const capability = capabilityByName.get(capabilityName);
    if (capabilityNames.size > 0 && !capability) {
      errors.push(`AI-generated flow references an unregistered capability: ${capabilityName}`);
      continue;
    }

    if (requiresHumanConfirmation(node, capability) && !node.requiresConfirmation) {
      errors.push(`High-risk AI-generated node must require confirmation: ${node.id || capabilityName}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    capabilitySummary: createCapabilityManifestSummary(capabilities)
  };
}

function renderDraftNode(node, index) {
  return [
    '<li class="flow-ai-draft-preview__node">',
    '<span class="flow-node__index">',
    escapeHTML(index + 1),
    '</span>',
    '<span>',
    `<strong>${escapeHTML(node?.label || node?.id || `Node ${index + 1}`)}</strong>`,
    `<small>${escapeHTML([node?.type, getFlowNodeCapability(node)].filter(Boolean).join(' · '))}</small>`,
    '</span>',
    `<span class="flow-badge flow-badge--${escapeAttr(node?.risk || 'low')}">${escapeHTML(node?.risk || 'low')}</span>`,
    node?.requiresConfirmation ? '<em>confirm</em>' : '',
    '</li>'
  ].join('');
}

function normalizeAIFlowNode(node, index, capabilityByName) {
  const safeNode = isPlainObject(node) ? node : {};
  const type = safeNode.type || (safeNode.capability ? FLOW_NODE_TYPES.CAPABILITY_RUN : FLOW_NODE_TYPES.MESSAGE_SHOW);
  const capabilityName = safeNode.capability || getDefaultCapabilityForNodeType(type);
  const capability = capabilityByName.get(capabilityName);
  const risk = safeNode.risk || capability?.risk || RiskLevel.LOW;

  return {
    ...safeNode,
    id: String(safeNode.id || `node-${index + 1}`).trim(),
    type,
    label: String(safeNode.label || safeNode.name || capability?.description || capabilityName || type).trim(),
    capability: capabilityName,
    risk,
    requiresConfirmation: Boolean(safeNode.requiresConfirmation || requiresHumanConfirmation({ ...safeNode, risk }, capability)),
    params: isPlainObject(safeNode.params) ? safeNode.params : {}
  };
}

function scoreCapability(capability, query, tokens) {
  if (!query) {
    return 0;
  }

  const haystack = getCapabilitySearchText(capability);
  let score = 0;
  if (haystack.includes(query)) {
    score += 12;
  }
  if (capability.resource && query.includes(capability.resource)) {
    score += 4;
  }
  if (capability.action && query.includes(capability.action)) {
    score += 4;
  }
  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += token.length > 1 ? 3 : 1;
    }
  }
  if (capability.risk === RiskLevel.HIGH || capability.risk === RiskLevel.CRITICAL) {
    score -= 1;
  }
  return score;
}

function getCapabilityRecommendationReasons(capability, query, tokens) {
  const haystack = getCapabilitySearchText(capability);
  const reasons = [];
  if (query && haystack.includes(query)) {
    reasons.push('full prompt match');
  }
  if (query && capability.resource && query.includes(capability.resource)) {
    reasons.push(`resource: ${capability.resource}`);
  }
  if (query && capability.action && query.includes(capability.action)) {
    reasons.push(`action: ${capability.action}`);
  }
  for (const token of tokens) {
    if (token.length > 1 && haystack.includes(token)) {
      reasons.push(`keyword: ${token}`);
    }
  }
  return Array.from(new Set(reasons));
}

function getCapabilitySearchText(capability) {
  return [
    capability.name,
    capability.resource,
    capability.action,
    capability.risk,
    capability.description,
    ...(capability.permissions ?? []),
    ...(capability.tags ?? [])
  ].filter(Boolean).join(' ').toLowerCase();
}

function createSearchTokens(query) {
  const normalized = String(query || '').trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const words = normalized.split(/[\s,，。；;:：]+/).filter(Boolean);
  return Array.from(new Set([
    normalized,
    ...words,
    ...words.flatMap((word) => word.split(/[._/-]+/)).filter(Boolean)
  ]));
}

function summarizeCapability(capability, options = {}) {
  const includeSchemas = options.includeSchemas !== false;
  const description = String(capability?.description || '');
  const maxDescriptionLength = Number(options.maxDescriptionLength || 180);
  const summary = {
    name: capability?.name || '',
    resource: capability?.resource || '',
    action: capability?.action || '',
    risk: capability?.risk || RiskLevel.LOW,
    description: description.length > maxDescriptionLength
      ? `${description.slice(0, maxDescriptionLength)}...`
      : description,
    permissions: Array.isArray(capability?.permissions) ? [...capability.permissions] : [],
    requiresConfirmation: Boolean(capability?.requiresConfirmation),
    domain: capability?.domain || '',
    group: capability?.group || '',
    tags: Array.isArray(capability?.tags) ? [...capability.tags] : []
  };

  if (includeSchemas) {
    summary.paramsSchema = clonePlainValue(capability?.paramsSchema ?? {});
    summary.resultSchema = clonePlainValue(capability?.resultSchema ?? {});
  }

  return summary;
}

function normalizeCapabilities(source, filter) {
  if (!source) {
    return [];
  }

  if (Array.isArray(source)) {
    return source.filter(Boolean);
  }

  if (typeof source.listCapabilities === 'function') {
    return source.listCapabilities(filter);
  }

  if (typeof source.list === 'function') {
    return source.list(filter);
  }

  if (source.registry && typeof source.registry.list === 'function') {
    return source.registry.list(filter);
  }

  return [];
}

function requiresHumanConfirmation(node, capability) {
  const risk = node?.risk || capability?.risk || RiskLevel.LOW;
  if (risk === RiskLevel.HIGH || risk === RiskLevel.CRITICAL) {
    return true;
  }

  return capability?.requiresConfirmation || capability?.action === ActionType.DELETE;
}

function countBy(items, field) {
  return items.reduce((output, item) => {
    const key = item[field] || 'unknown';
    output[key] = (output[key] ?? 0) + 1;
    return output;
  }, {});
}

function clonePlainValue(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHTML(value);
}
