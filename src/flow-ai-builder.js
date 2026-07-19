import { ActionType, RiskLevel } from '@kupola/pivot';
import { createFlow } from './flow-schema.js';
import { validateFlow } from './flow-validation.js';
import { FLOW_NODE_TYPES, FLOW_STATUS, getDefaultCapabilityForNodeType, getFlowNodeCapability } from './node-types.js';
import { on, resolveTarget, setHTML } from './components/dom.js';

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
  const diff = diffAIFlowDraft(source, flow);
  const missingCapabilities = getMissingFlowCapabilities(flow, capabilities, options);

  return {
    ok: validation.valid,
    flow,
    validation,
    diff,
    missingCapabilities,
    capabilitySummary: validation.capabilitySummary
  };
}

export function getMissingFlowCapabilities(flow, source, options = {}) {
  const capabilities = normalizeCapabilities(source ?? options.capabilities ?? options.runtime);
  const capabilityNames = new Set(capabilities.map((capability) => capability.name).filter(Boolean));
  if (capabilityNames.size === 0) {
    return [];
  }

  return (Array.isArray(flow?.nodes) ? flow.nodes : [])
    .map((node) => {
      const capability = getFlowNodeCapability(node);
      if (!capability || capabilityNames.has(capability)) {
        return null;
      }

      const prompt = [
        capability,
        node?.label,
        node?.type,
        node?.risk
      ].filter(Boolean).join(' ');

      return {
        nodeId: node?.id || '',
        capability,
        label: node?.label || '',
        recommendations: recommendFlowCapabilities(prompt, capabilities, {
          ...options,
          limit: options.recommendationLimit || 3
        })
      };
    })
    .filter(Boolean);
}

export function diffAIFlowDraft(before = {}, after = {}, options = {}) {
  const changes = [];
  const ignorePaths = new Set(options.ignorePaths ?? ['createdAt', 'updatedAt', 'publishedAt']);
  compareValues('', before ?? null, after ?? null, changes, ignorePaths, Number(options.limit || 60));
  return changes;
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
  const missingCapabilities = draftResult?.missingCapabilities ?? getMissingFlowCapabilities(flow, options.capabilities ?? options.runtime, options);
  const diff = Array.isArray(draftResult?.diff) ? draftResult.diff : [];
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
    missingCapabilities.length > 0
      ? renderMissingCapabilities(missingCapabilities)
      : '',
    '<ol class="flow-ai-draft-preview__nodes">',
    ...nodes.map((node, index) => renderDraftNode(node, index)),
    '</ol>',
    options.showDiff && diff.length > 0
      ? renderDraftDiff(diff)
      : '',
    options.showJSON
      ? `<pre>${escapeHTML(JSON.stringify(flow, null, 2))}</pre>`
      : '',
    '</section>'
  ].join('');
}

export function renderAIFlowDraftReviewToHTML(draftResult, options = {}) {
  const validation = draftResult?.validation ?? validateAIFlowDraft(draftResult?.flow ?? draftResult, options);
  const canSave = Boolean(validation.valid && options.canSave !== false);
  const title = options.title ?? 'Review AI Flow draft';
  const description = options.description ?? 'Review the generated draft before saving it. AI output is never executed or published from this step.';

  return [
    '<section class="flow-ai-draft-review">',
    '<div class="flow-ai-draft-review__header">',
    '<div>',
    `<strong>${escapeHTML(title)}</strong>`,
    `<span>${escapeHTML(description)}</span>`,
    '</div>',
    `<span class="flow-badge flow-badge--${canSave ? 'low' : 'high'}">${canSave ? 'ready' : 'blocked'}</span>`,
    '</div>',
    renderAIFlowDraftPreviewToHTML(draftResult, { ...options, showDiff: options.showDiff ?? true }),
    '<div class="flow-ai-draft-review__actions">',
    `<button type="button" class="ds-btn ds-btn--brand ds-btn--sm" data-flow-ai-action="save-draft"${canSave ? '' : ' disabled'}>Save draft</button>`,
    '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-ai-action="cancel-draft">Cancel</button>',
    '</div>',
    '</section>'
  ].join('');
}

export function AIFlowDraftReviewer(options = {}) {
  const target = resolveTarget(options.target);
  const state = {
    draftResult: options.draftResult ?? null,
    saving: false,
    message: ''
  };

  const render = () => {
    const content = state.draftResult
      ? renderAIFlowDraftReviewToHTML(state.draftResult, {
        ...options,
        canSave: !state.saving
      })
      : '<div class="flow-empty">No AI Flow draft to review.</div>';
    const message = state.message
      ? `<div class="flow-ai-draft-review__message">${escapeHTML(state.message)}</div>`
      : '';
    setHTML(target, [content, message].join(''));
  };

  const cleanups = [
    on(target, 'click', '[data-flow-ai-action="save-draft"]', async () => {
      if (!state.draftResult || state.saving || typeof options.onSaveDraft !== 'function') {
        return;
      }

      state.saving = true;
      state.message = 'Saving draft...';
      render();

      try {
        const saved = await options.onSaveDraft(state.draftResult.flow, state.draftResult);
        state.message = options.savedMessage ?? 'Draft saved.';
        if (typeof options.onSaved === 'function') {
          await options.onSaved(saved, state.draftResult);
        }
      } catch (error) {
        state.message = error?.message || 'Failed to save draft.';
      } finally {
        state.saving = false;
        render();
      }
    }),
    on(target, 'click', '[data-flow-ai-action="cancel-draft"]', async () => {
      state.draftResult = null;
      state.message = '';
      if (typeof options.onCancel === 'function') {
        await options.onCancel();
      }
      render();
    })
  ];

  render();

  return {
    element: target,
    update(nextDraftResult) {
      state.draftResult = nextDraftResult;
      state.message = '';
      render();
    },
    destroy() {
      cleanups.forEach((cleanup) => cleanup());
      target.innerHTML = '';
    }
  };
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

function renderMissingCapabilities(items) {
  return [
    '<div class="flow-ai-draft-preview__missing">',
    '<strong>Missing capabilities</strong>',
    '<ol>',
    ...items.map((item) => [
      '<li>',
      `<span>${escapeHTML(item.capability)}</span>`,
      item.recommendations.length > 0
        ? `<small>Closest: ${escapeHTML(item.recommendations.map((entry) => entry.capability.name).join(', '))}</small>`
        : '<small>No close registered capability was found.</small>',
      '</li>'
    ].join('')),
    '</ol>',
    '</div>'
  ].join('');
}

function renderDraftDiff(diff) {
  return [
    '<div class="flow-ai-draft-preview__diff">',
    '<strong>Draft changes</strong>',
    '<ol>',
    ...diff.slice(0, 12).map((item) => [
      '<li>',
      `<span>${escapeHTML(item.path || '(root)')}</span>`,
      `<small>${escapeHTML(item.type)}: ${escapeHTML(formatDiffValue(item.before))} -> ${escapeHTML(formatDiffValue(item.after))}</small>`,
      '</li>'
    ].join('')),
    '</ol>',
    '</div>'
  ].join('');
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

function compareValues(path, before, after, changes, ignorePaths, limit) {
  if (changes.length >= limit || ignorePaths.has(path)) {
    return;
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      const nextPath = path ? `${path}.${key}` : key;
      compareValues(nextPath, before[key], after[key], changes, ignorePaths, limit);
      if (changes.length >= limit) {
        break;
      }
    }
    return;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      compareValues(`${path}[${index}]`, before[index], after[index], changes, ignorePaths, limit);
      if (changes.length >= limit) {
        break;
      }
    }
    return;
  }

  if (JSON.stringify(before) === JSON.stringify(after)) {
    return;
  }

  changes.push({
    path,
    type: before === undefined ? 'added' : after === undefined ? 'removed' : 'changed',
    before: simplifyDiffValue(before),
    after: simplifyDiffValue(after)
  });
}

function simplifyDiffValue(value) {
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }
  if (isPlainObject(value)) {
    return '{...}';
  }
  return value;
}

function formatDiffValue(value) {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  return String(value);
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
