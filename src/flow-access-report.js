import { getFlowNodeCapability, isCapabilityBackedNode } from './node-types.js';

export function createFlowAccessReport(flow, source, options = {}) {
  const capabilities = normalizeCapabilities(source ?? options.capabilities ?? options.runtime);
  const capabilityByName = new Map(capabilities.map((capability) => [capability.name, capability]).filter(([name]) => Boolean(name)));
  const actorPermissions = normalizePermissionList(options.actor?.permissions ?? options.context?.actor?.permissions);
  const actorKnown = Array.isArray(options.actor?.permissions) || Array.isArray(options.context?.actor?.permissions);
  const rows = collectAccessRows(flow, capabilityByName);
  const requiredPermissions = unique(rows.flatMap((row) => row.permissions));
  const missingPermissions = actorKnown
    ? requiredPermissions.filter((permission) => !hasPermission(actorPermissions, permission))
    : [];
  const warnings = [
    actorKnown ? '' : 'Actor permissions were not provided; frontend access could not be verified.',
    requiredPermissions.length === 0 ? 'No frontend permission hints are declared for this Flow.' : '',
    'Frontend access checks are interaction hints only. Backend APIs must still enforce authentication, role permissions, data permissions, and audit.'
  ].filter(Boolean);
  const rowReports = rows.map((row) => {
    const missing = actorKnown
      ? row.permissions.filter((permission) => !hasPermission(actorPermissions, permission))
      : [];
    return {
      ...row,
      missingPermissions: missing,
      status: !actorKnown ? 'unknown' : missing.length > 0 ? 'blocked' : 'allowed'
    };
  });

  return {
    ok: missingPermissions.length === 0,
    status: !actorKnown ? 'review' : missingPermissions.length > 0 ? 'blocked' : warnings.length > 0 ? 'review' : 'allowed',
    flowId: flow?.id || '',
    flowName: flow?.name || '',
    actorId: options.actor?.id || options.context?.actor?.id || '',
    actorName: options.actor?.name || options.context?.actor?.name || '',
    actorKnown,
    actorPermissions,
    requiredPermissions,
    missingPermissions,
    rows: rowReports,
    warnings,
    summary: createAccessSummary(actorKnown, requiredPermissions.length, missingPermissions.length)
  };
}

export function renderFlowAccessReportToHTML(reportOrFlow, source, options = {}) {
  const report = isFlowAccessReport(reportOrFlow)
    ? reportOrFlow
    : createFlowAccessReport(reportOrFlow, source, options);

  if (!report.flowId && !report.flowName) {
    return '<div class="flow-empty flow-empty--compact">Select a flow to review access hints.</div>';
  }

  return [
    `<section class="flow-access-report flow-access-report--${escapeAttr(report.status)}">`,
    '<div class="flow-access-report__header">',
    '<div>',
    '<strong>Access hints</strong>',
    `<span>${escapeHTML(report.summary)}</span>`,
    '</div>',
    `<span class="flow-badge flow-badge--${escapeAttr(report.status === 'blocked' ? 'high' : report.status === 'allowed' ? 'low' : 'medium')}">${escapeHTML(report.status)}</span>`,
    '</div>',
    '<div class="flow-access-report__summary">',
    `<span><strong>${escapeHTML(report.requiredPermissions.length)}</strong><small>required</small></span>`,
    `<span><strong>${escapeHTML(report.actorPermissions.length)}</strong><small>actor perms</small></span>`,
    `<span><strong>${escapeHTML(report.missingPermissions.length)}</strong><small>missing</small></span>`,
    '</div>',
    renderPermissionChips('Missing permissions', report.missingPermissions, 'error'),
    renderAccessRows(report.rows),
    renderPermissionChips('Actor permissions', report.actorPermissions, 'neutral'),
    renderAccessWarnings(report.warnings),
    '</section>'
  ].join('');
}

export function hasPermission(actorPermissions = [], requiredPermission = '') {
  const required = String(requiredPermission || '').trim();
  if (!required) {
    return true;
  }

  return normalizePermissionList(actorPermissions).some((permission) => {
    if (permission === '*' || permission === required) {
      return true;
    }
    if (permission.endsWith(':*') && required.startsWith(permission.slice(0, -1))) {
      return true;
    }
    if (permission.endsWith('.*') && required.startsWith(permission.slice(0, -1))) {
      return true;
    }
    return false;
  });
}

function collectAccessRows(flow, capabilityByName) {
  const rows = [];
  const flowPermissions = normalizePermissionList(flow?.permissions);
  if (flowPermissions.length > 0) {
    rows.push({
      id: 'flow',
      source: 'flow',
      label: flow?.name || flow?.id || 'Flow',
      nodeId: '',
      capability: '',
      permissions: flowPermissions
    });
  }

  for (const node of Array.isArray(flow?.nodes) ? flow.nodes : []) {
    if (!isCapabilityBackedNode(node)) {
      continue;
    }
    const capabilityName = getFlowNodeCapability(node);
    const capability = capabilityByName.get(capabilityName) ?? {};
    const permissions = unique([
      ...normalizePermissionList(node.permissions),
      ...normalizePermissionList(capability.permissions)
    ]);
    if (permissions.length === 0) {
      continue;
    }
    rows.push({
      id: node.id || capabilityName,
      source: 'node',
      label: node.label || node.id || capabilityName,
      nodeId: node.id || '',
      capability: capabilityName,
      permissions
    });
  }

  return rows;
}

function createAccessSummary(actorKnown, requiredCount, missingCount) {
  if (!actorKnown) {
    return 'Actor permissions are unknown; backend authorization remains required.';
  }
  if (missingCount > 0) {
    return `${missingCount} permission hint(s) are missing for the current actor.`;
  }
  if (requiredCount > 0) {
    return 'The current actor has the declared frontend permission hints.';
  }
  return 'No frontend permission hints were declared for this Flow.';
}

function renderPermissionChips(title, permissions, tone) {
  if (!permissions.length) {
    return '';
  }

  return [
    `<div class="flow-access-report__permissions flow-access-report__permissions--${escapeAttr(tone)}">`,
    `<strong>${escapeHTML(title)}</strong>`,
    '<div>',
    ...permissions.map((permission) => `<code>${escapeHTML(permission)}</code>`),
    '</div>',
    '</div>'
  ].join('');
}

function renderAccessRows(rows) {
  if (!rows.length) {
    return '<div class="flow-empty flow-empty--compact">No permission-backed Flow items.</div>';
  }

  return [
    '<div class="flow-access-report__rows">',
    '<strong>Permission sources</strong>',
    '<ol>',
    ...rows.map((row) => [
      '<li>',
      '<span>',
      `<strong>${escapeHTML(row.label)}</strong>`,
      `<small>${escapeHTML(row.capability || row.source)}</small>`,
      '</span>',
      `<span class="flow-badge flow-badge--${escapeAttr(row.status === 'blocked' ? 'high' : row.status === 'allowed' ? 'low' : 'medium')}">${escapeHTML(row.status)}</span>`,
      `<small>${row.permissions.map((permission) => `<code>${escapeHTML(permission)}</code>`).join('')}</small>`,
      row.missingPermissions.length > 0 ? `<small>Missing: ${row.missingPermissions.map((permission) => `<code>${escapeHTML(permission)}</code>`).join('')}</small>` : '',
      '</li>'
    ].join('')),
    '</ol>',
    '</div>'
  ].join('');
}

function renderAccessWarnings(warnings) {
  if (!warnings.length) {
    return '';
  }

  return [
    '<div class="flow-access-report__warnings">',
    '<strong>Access notes</strong>',
    '<ul>',
    ...warnings.map((warning) => `<li>${escapeHTML(warning)}</li>`),
    '</ul>',
    '</div>'
  ].join('');
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

function normalizePermissionList(value) {
  return Array.isArray(value)
    ? unique(value.map((item) => String(item || '').trim()).filter(Boolean))
    : [];
}

function unique(items) {
  return Array.from(new Set(items));
}

function isFlowAccessReport(value) {
  return value && Array.isArray(value.requiredPermissions) && Array.isArray(value.missingPermissions) && Array.isArray(value.rows);
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
