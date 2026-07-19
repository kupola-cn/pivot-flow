import { ActionType, RiskLevel } from '@kupola/pivot';
import { validateFlow } from './flow-validation.js';
import { analyzeFlowDataDependencies } from './flow-dependencies.js';
import { getFlowNodeCapability, isCapabilityBackedNode } from './node-types.js';

const RISK_RANK = {
  [RiskLevel.LOW]: 1,
  [RiskLevel.MEDIUM]: 2,
  [RiskLevel.HIGH]: 3,
  [RiskLevel.CRITICAL]: 4
};

const SENSITIVE_NAME_PATTERN = /(password|passwd|pwd|token|secret|credential|phone|mobile|email|id_?card|身份证|手机号|电话|邮箱|密钥|令牌|密码)/i;

export function createFlowSafetyReport(flow, source, options = {}) {
  const capabilities = normalizeCapabilities(source ?? options.capabilities ?? options.runtime);
  const capabilityByName = new Map(capabilities.map((capability) => [capability.name, capability]).filter(([name]) => Boolean(name)));
  const knownCapabilities = capabilityByName.size > 0 ? Array.from(capabilityByName.keys()) : null;
  const validation = validateFlow(flow, knownCapabilities ? { capabilities: knownCapabilities } : {});
  const dataDependencies = analyzeFlowDataDependencies(flow);
  const capabilityRows = collectCapabilityRows(flow, capabilityByName, Boolean(knownCapabilities));
  const sensitiveSlots = collectSensitiveSlots(flow);
  const checks = [
    createValidationCheck(validation),
    createDataDependencyCheck(dataDependencies),
    createCapabilityRegistrationCheck(capabilityRows, Boolean(knownCapabilities)),
    createConfirmationCheck(capabilityRows),
    createPermissionCheck(capabilityRows),
    createSensitiveSlotCheck(sensitiveSlots),
    createBackendAuthCheck()
  ];
  const blockingIssues = [
    ...validation.errors,
    ...capabilityRows
      .filter((row) => row.registrationStatus === 'missing')
      .map((row) => `Capability is not registered: ${row.capability}`),
    ...capabilityRows
      .filter((row) => row.confirmationStatus === 'missing')
      .map((row) => `High-risk node must require confirmation: ${row.nodeId || row.capability}`),
    ...dataDependencies.blocking.map((item) => `Invalid data dependency: ${item.message}`)
  ];
  const warnings = [
    ...validation.warnings,
    ...dataDependencies.warnings.map((item) => `Review data dependency: ${item.message}`),
    ...capabilityRows
      .filter((row) => row.permissionStatus === 'missing')
      .map((row) => `Capability has no declared permissions: ${row.capability}`),
    ...sensitiveSlots
      .filter((slot) => slot.source !== 'manual')
      .map((slot) => `Sensitive slot should use manual source: ${slot.name}`),
    'Backend authorization, data-scope validation, transactions, and audit must be enforced by server APIs.'
  ];
  const risk = getHighestRisk(flow, capabilityRows);

  return {
    ok: blockingIssues.length === 0,
    status: blockingIssues.length > 0 ? 'blocked' : warnings.length > 0 ? 'review' : 'ready',
    flowId: flow?.id || '',
    flowName: flow?.name || '',
    flowStatus: flow?.status || '',
    risk,
    summary: createReportSummary(blockingIssues.length, warnings.length),
    checks,
    capabilities: capabilityRows,
    dataDependencies,
    sensitiveSlots,
    backendRequirements: createBackendRequirements(capabilityRows),
    blockingIssues,
    warnings
  };
}

export function createFlowBatchSafetyReport(flows = [], source, options = {}) {
  const entries = (Array.isArray(flows) ? flows : [])
    .map((flow) => createFlowSafetyReport(flow, source, options));
  const blocked = entries.filter((entry) => entry.status === 'blocked');
  const review = entries.filter((entry) => entry.status === 'review');
  const ready = entries.filter((entry) => entry.status === 'ready');
  const blockingIssues = entries.flatMap((entry) => entry.blockingIssues.map((issue) => `${entry.flowName || entry.flowId}: ${issue}`));
  const warnings = entries.flatMap((entry) => entry.warnings.map((warning) => `${entry.flowName || entry.flowId}: ${warning}`));
  const riskCounts = entries.reduce((output, entry) => {
    output[entry.risk] = (output[entry.risk] ?? 0) + 1;
    return output;
  }, {});

  return {
    ok: blocked.length === 0,
    status: blocked.length > 0 ? 'blocked' : review.length > 0 ? 'review' : 'ready',
    total: entries.length,
    readyCount: ready.length,
    reviewCount: review.length,
    blockedCount: blocked.length,
    riskCounts,
    reports: entries,
    blockingIssues,
    warnings,
    summary: createBatchReportSummary(entries.length, blocked.length, review.length)
  };
}

export function renderFlowSafetyReportToHTML(reportOrFlow, source, options = {}) {
  const report = isSafetyReport(reportOrFlow)
    ? reportOrFlow
    : createFlowSafetyReport(reportOrFlow, source, options);

  if (!report.flowId && !report.flowName) {
    return '<div class="flow-empty flow-empty--compact">Select a flow to review publish safety.</div>';
  }

  return [
    `<section class="flow-safety-report flow-safety-report--${escapeAttr(report.status)}">`,
    '<div class="flow-safety-report__header">',
    '<div>',
    '<strong>Publish safety</strong>',
    `<span>${escapeHTML(report.summary)}</span>`,
    '</div>',
    `<span class="flow-badge flow-badge--${escapeAttr(report.status === 'blocked' ? 'high' : report.status === 'review' ? 'medium' : 'low')}">${escapeHTML(report.status)}</span>`,
    '</div>',
    '<div class="flow-safety-report__summary">',
    `<span><strong>${escapeHTML(report.capabilities.length)}</strong><small>capabilities</small></span>`,
    `<span><strong>${escapeHTML(report.risk)}</strong><small>risk</small></span>`,
    `<span><strong>${escapeHTML(report.blockingIssues.length)}</strong><small>blocking</small></span>`,
    `<span><strong>${escapeHTML(report.warnings.length)}</strong><small>warnings</small></span>`,
    '</div>',
    renderSafetyChecks(report.checks),
    renderSafetyIssues('Blocking issues', report.blockingIssues, 'error'),
    renderSafetyIssues('Warnings', report.warnings, 'warning'),
    renderSafetyCapabilities(report.capabilities),
    renderSensitiveSlots(report.sensitiveSlots),
    renderBackendRequirements(report.backendRequirements),
    '</section>'
  ].join('');
}

export function renderFlowBatchSafetyReportToHTML(reportOrFlows, source, options = {}) {
  const report = isBatchSafetyReport(reportOrFlows)
    ? reportOrFlows
    : createFlowBatchSafetyReport(reportOrFlows, source, options);

  if (report.total === 0) {
    return '<div class="flow-empty flow-empty--compact">No flows selected for batch safety review.</div>';
  }

  return [
    `<section class="flow-batch-safety-report flow-batch-safety-report--${escapeAttr(report.status)}">`,
    '<div class="flow-safety-report__header">',
    '<div>',
    '<strong>Batch publish safety</strong>',
    `<span>${escapeHTML(report.summary)}</span>`,
    '</div>',
    `<span class="flow-badge flow-badge--${escapeAttr(report.status === 'blocked' ? 'high' : report.status === 'review' ? 'medium' : 'low')}">${escapeHTML(report.status)}</span>`,
    '</div>',
    '<div class="flow-safety-report__summary">',
    `<span><strong>${escapeHTML(report.total)}</strong><small>flows</small></span>`,
    `<span><strong>${escapeHTML(report.readyCount)}</strong><small>ready</small></span>`,
    `<span><strong>${escapeHTML(report.reviewCount)}</strong><small>review</small></span>`,
    `<span><strong>${escapeHTML(report.blockedCount)}</strong><small>blocked</small></span>`,
    '</div>',
    renderSafetyIssues('Blocking issues', report.blockingIssues, 'error'),
    renderSafetyIssues('Warnings', report.warnings.slice(0, Number(options.maxWarnings || 12)), 'warning'),
    '<div class="flow-batch-safety-report__flows">',
    '<strong>Flow results</strong>',
    '<ol>',
    ...report.reports.map((entry) => [
      '<li>',
      '<span>',
      `<strong>${escapeHTML(entry.flowName || entry.flowId)}</strong>`,
      `<small>${escapeHTML(entry.summary)}</small>`,
      '</span>',
      `<span class="flow-badge flow-badge--${escapeAttr(entry.status === 'blocked' ? 'high' : entry.status === 'review' ? 'medium' : 'low')}">${escapeHTML(entry.status)}</span>`,
      '</li>'
    ].join('')),
    '</ol>',
    '</div>',
    '</section>'
  ].join('');
}

function collectCapabilityRows(flow, capabilityByName, hasKnownCapabilities) {
  const nodes = Array.isArray(flow?.nodes) ? flow.nodes : [];
  return nodes
    .filter((node) => isCapabilityBackedNode(node))
    .map((node) => {
      const capabilityName = getFlowNodeCapability(node);
      const capability = capabilityByName.get(capabilityName) ?? null;
      const risk = normalizeRisk(node.risk || capability?.risk || RiskLevel.LOW);
      const action = capability?.action || inferActionFromCapability(capabilityName);
      const requiresConfirmation = Boolean(node.requiresConfirmation || capability?.requiresConfirmation);
      const confirmationRequired = risk === RiskLevel.HIGH || risk === RiskLevel.CRITICAL || action === ActionType.DELETE;
      const permissions = Array.isArray(capability?.permissions) ? capability.permissions : [];

      return {
        nodeId: node.id || '',
        nodeLabel: node.label || node.id || capabilityName || '',
        capability: capabilityName || '',
        registered: hasKnownCapabilities ? Boolean(capability) : null,
        registrationStatus: hasKnownCapabilities && !capability ? 'missing' : hasKnownCapabilities ? 'registered' : 'unknown',
        resource: capability?.resource || inferResourceFromCapability(capabilityName),
        action,
        risk,
        confirmationRequired,
        requiresConfirmation,
        confirmationStatus: confirmationRequired && !requiresConfirmation ? 'missing' : confirmationRequired ? 'required' : 'not-required',
        permissions,
        permissionStatus: permissions.length > 0 ? 'declared' : 'missing',
        backendRequired: true
      };
    });
}

function collectSensitiveSlots(flow) {
  const slots = Array.isArray(flow?.intent?.slots) ? flow.intent.slots : [];
  return slots
    .filter((slot) => Boolean(slot?.sensitive) || slot?.inputType === 'password' || SENSITIVE_NAME_PATTERN.test(slot?.name || '') || SENSITIVE_NAME_PATTERN.test(slot?.label || ''))
    .map((slot) => ({
      name: slot.name || '',
      label: slot.label || slot.name || '',
      source: slot.source || 'intent',
      inputType: slot.inputType || '',
      required: Boolean(slot.required),
      safe: slot.source === 'manual'
    }));
}

function createValidationCheck(validation) {
  return {
    id: 'flow-validation',
    label: 'Flow structure',
    status: validation.valid ? 'pass' : 'fail',
    message: validation.valid ? 'Flow schema and graph are valid.' : validation.errors.join('; ')
  };
}

function createCapabilityRegistrationCheck(rows, hasKnownCapabilities) {
  const missing = rows.filter((row) => row.registrationStatus === 'missing');
  return {
    id: 'capability-registration',
    label: 'Registered capabilities',
    status: missing.length > 0 ? 'fail' : hasKnownCapabilities ? 'pass' : 'warn',
    message: missing.length > 0
      ? `${missing.length} capability item(s) are not registered.`
      : hasKnownCapabilities ? 'All referenced capabilities are registered.' : 'Runtime capabilities were not provided; registration could not be verified.'
  };
}

function createDataDependencyCheck(report) {
  return {
    id: 'data-dependencies',
    label: 'Data dependencies',
    status: report.status === 'blocked' ? 'fail' : report.status === 'review' ? 'warn' : 'pass',
    message: report.summary
  };
}

function createConfirmationCheck(rows) {
  const missing = rows.filter((row) => row.confirmationStatus === 'missing');
  return {
    id: 'confirmation',
    label: 'Human confirmation',
    status: missing.length > 0 ? 'fail' : 'pass',
    message: missing.length > 0
      ? `${missing.length} high-risk/delete node(s) require confirmation.`
      : 'High-risk and delete operations require confirmation where needed.'
  };
}

function createPermissionCheck(rows) {
  const missing = rows.filter((row) => row.permissionStatus === 'missing');
  return {
    id: 'permissions',
    label: 'Permission declarations',
    status: missing.length > 0 ? 'warn' : 'pass',
    message: missing.length > 0
      ? `${missing.length} capability item(s) have no declared frontend permission hints. Backend authorization is still mandatory.`
      : 'Capabilities declare permission hints. Backend authorization is still mandatory.'
  };
}

function createSensitiveSlotCheck(slots) {
  const unsafe = slots.filter((slot) => !slot.safe);
  return {
    id: 'sensitive-slots',
    label: 'Sensitive inputs',
    status: unsafe.length > 0 ? 'warn' : 'pass',
    message: slots.length === 0
      ? 'No sensitive slots were detected.'
      : unsafe.length > 0 ? `${unsafe.length} sensitive slot(s) should be collected manually.` : 'Sensitive slots use manual input.'
  };
}

function createBackendAuthCheck() {
  return {
    id: 'backend-auth',
    label: 'Backend authorization',
    status: 'warn',
    message: 'Frontend checks are interaction safeguards only. Backend APIs must enforce authentication, role permissions, data permissions, validation, and audit.'
  };
}

function createBackendRequirements(rows) {
  const resources = Array.from(new Set(rows.map((row) => row.resource).filter(Boolean)));
  const actions = Array.from(new Set(rows.map((row) => row.action).filter(Boolean)));
  return [
    'Authenticate the actor and return 401 when unauthenticated.',
    'Authorize every capability on the backend and return 403 when denied.',
    'Apply tenant, organization, role, and data-scope checks for queried or mutated records.',
    'Validate request fields and business invariants; return 409 or 422 for conflicts and invalid input.',
    'Wrap high-risk multi-step writes in backend transactions where applicable.',
    'Write server-side audit records for sensitive queries, writes, deletes, and permission changes.',
    resources.length > 0 ? `Covered resources: ${resources.join(', ')}.` : '',
    actions.length > 0 ? `Covered actions: ${actions.join(', ')}.` : ''
  ].filter(Boolean);
}

function renderSafetyChecks(checks) {
  return [
    '<div class="flow-safety-report__checks">',
    ...checks.map((check) => [
      `<div class="flow-safety-report__check flow-safety-report__check--${escapeAttr(check.status)}">`,
      `<span>${escapeHTML(check.label)}</span>`,
      `<strong>${escapeHTML(check.status)}</strong>`,
      `<small>${escapeHTML(check.message)}</small>`,
      '</div>'
    ].join('')),
    '</div>'
  ].join('');
}

function renderSafetyIssues(title, items, tone) {
  if (!items.length) {
    return '';
  }

  return [
    `<div class="flow-safety-report__issues flow-safety-report__issues--${escapeAttr(tone)}">`,
    `<strong>${escapeHTML(title)}</strong>`,
    '<ul>',
    ...items.map((item) => `<li>${escapeHTML(item)}</li>`),
    '</ul>',
    '</div>'
  ].join('');
}

function renderSafetyCapabilities(rows) {
  if (!rows.length) {
    return '<div class="flow-empty flow-empty--compact">No capability-backed nodes.</div>';
  }

  return [
    '<div class="flow-safety-report__capabilities">',
    '<strong>Capability review</strong>',
    '<ol>',
    ...rows.map((row) => [
      '<li>',
      '<span>',
      `<strong>${escapeHTML(row.nodeLabel)}</strong>`,
      `<small>${escapeHTML(row.capability || 'missing capability')}</small>`,
      '</span>',
      `<span class="flow-badge flow-badge--${escapeAttr(row.risk)}">${escapeHTML(row.risk)}</span>`,
      `<small>${escapeHTML(row.registrationStatus)} · ${escapeHTML(row.confirmationStatus)} · ${escapeHTML(row.permissionStatus)}</small>`,
      row.permissions.length > 0
        ? `<small>${row.permissions.map((permission) => `<code>${escapeHTML(permission)}</code>`).join('')}</small>`
        : '',
      '</li>'
    ].join('')),
    '</ol>',
    '</div>'
  ].join('');
}

function renderSensitiveSlots(slots) {
  if (!slots.length) {
    return '';
  }

  return [
    '<div class="flow-safety-report__sensitive">',
    '<strong>Sensitive slots</strong>',
    '<ol>',
    ...slots.map((slot) => [
      '<li>',
      `<span>${escapeHTML(slot.label || slot.name)}</span>`,
      `<small>${escapeHTML(slot.source)} · ${slot.safe ? 'manual' : 'review source'}</small>`,
      '</li>'
    ].join('')),
    '</ol>',
    '</div>'
  ].join('');
}

function renderBackendRequirements(items) {
  return [
    '<details class="flow-safety-report__backend">',
    '<summary>Backend requirements</summary>',
    '<ul>',
    ...items.map((item) => `<li>${escapeHTML(item)}</li>`),
    '</ul>',
    '</details>'
  ].join('');
}

function createReportSummary(blockingCount, warningCount) {
  if (blockingCount > 0) {
    return `${blockingCount} blocking issue(s) must be fixed before publish.`;
  }
  if (warningCount > 0) {
    return `${warningCount} warning(s) require review before publish.`;
  }
  return 'No blocking publish safety issues were found.';
}

function createBatchReportSummary(total, blockedCount, reviewCount) {
  if (blockedCount > 0) {
    return `${blockedCount} of ${total} flow(s) have blocking publish safety issues.`;
  }
  if (reviewCount > 0) {
    return `${reviewCount} of ${total} flow(s) require review before publish.`;
  }
  return `${total} flow(s) are ready for publish.`;
}

function getHighestRisk(flow, rows) {
  let risk = normalizeRisk(flow?.risk || RiskLevel.LOW);
  for (const row of rows) {
    if ((RISK_RANK[row.risk] ?? 0) > (RISK_RANK[risk] ?? 0)) {
      risk = row.risk;
    }
  }
  return risk;
}

function normalizeCapabilities(source) {
  if (!source) {
    return [];
  }
  if (Array.isArray(source)) {
    return source.filter(Boolean);
  }
  if (typeof source.listCapabilities === 'function') {
    return source.listCapabilities();
  }
  if (typeof source.list === 'function') {
    return source.list();
  }
  if (source.registry && typeof source.registry.list === 'function') {
    return source.registry.list();
  }
  return [];
}

function normalizeRisk(value) {
  const risk = String(value || '').trim();
  return Object.prototype.hasOwnProperty.call(RISK_RANK, risk) ? risk : RiskLevel.LOW;
}

function inferResourceFromCapability(capability = '') {
  const parts = String(capability || '').split('.');
  return parts.length > 1 ? parts.slice(0, -1).join('.') : '';
}

function inferActionFromCapability(capability = '') {
  const action = String(capability || '').split('.').pop() || '';
  const aliases = {
    add: ActionType.CREATE,
    create: ActionType.CREATE,
    insert: ActionType.CREATE,
    remove: ActionType.DELETE,
    delete: ActionType.DELETE,
    destroy: ActionType.DELETE,
    update: ActionType.UPDATE,
    edit: ActionType.UPDATE,
    modify: ActionType.UPDATE,
    query: ActionType.QUERY,
    list: ActionType.QUERY,
    get: ActionType.QUERY,
    read: ActionType.QUERY
  };
  return aliases[action] || action || '';
}

function isSafetyReport(value) {
  return value && Array.isArray(value.checks) && Array.isArray(value.capabilities) && Array.isArray(value.backendRequirements);
}

function isBatchSafetyReport(value) {
  return value && Array.isArray(value.reports) && typeof value.total === 'number' && Array.isArray(value.blockingIssues);
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
