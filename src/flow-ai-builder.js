import { ActionType, RiskLevel } from '@kupola/pivot';
import { validateFlow } from './flow-validation.js';
import { FLOW_STATUS, getFlowNodeCapability } from './node-types.js';

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
