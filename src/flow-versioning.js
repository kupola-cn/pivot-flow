import { FLOW_STATUS } from './node-types.js';
import { cloneFlow, createFlow, createId } from './flow-schema.js';
import { validateFlow } from './flow-validation.js';
import { escapeHTML } from './components/dom.js';

export function createFlowSnapshot(flowInput = {}, options = {}) {
  const flow = createFlow(flowInput);
  const createdAt = options.createdAt ?? new Date().toISOString();

  return {
    id: options.id ?? createId('flow-snapshot'),
    flowId: flow.id,
    flowName: flow.name,
    version: flow.version ?? '',
    status: flow.status ?? FLOW_STATUS.DRAFT,
    label: options.label ?? `${flow.name || flow.id} snapshot`,
    reason: options.reason ?? '',
    createdAt,
    createdBy: options.createdBy ?? '',
    metadata: isPlainObject(options.metadata) ? cloneFlow(options.metadata) : {},
    flow: cloneFlow(flow)
  };
}

export function restoreFlowSnapshot(snapshot = {}, overrides = {}) {
  const source = snapshot?.flow ?? snapshot;
  const restoredAt = overrides.restoredAt ?? new Date().toISOString();
  const metadata = isPlainObject(source?.metadata) ? cloneFlow(source.metadata) : {};

  return createFlow({
    ...cloneFlow(source ?? {}),
    ...overrides,
    id: overrides.id ?? source?.id ?? createId('flow'),
    status: overrides.status ?? FLOW_STATUS.DRAFT,
    publishedAt: overrides.publishedAt ?? null,
    updatedAt: overrides.updatedAt ?? restoredAt,
    metadata: {
      ...metadata,
      ...(isPlainObject(overrides.metadata) ? overrides.metadata : {}),
      restoredAt,
      restoredFromSnapshot: snapshot?.id ?? ''
    }
  });
}

export function diffFlows(before = {}, after = {}, options = {}) {
  const changes = [];
  const ignorePaths = new Set(options.ignorePaths ?? ['createdAt', 'updatedAt', 'publishedAt']);
  compareValues('', before ?? null, after ?? null, changes, ignorePaths, Number(options.limit || 80));
  return changes.map(classifyFlowChange);
}

export function createFlowChangeReport(beforeInput = {}, afterInput = {}, options = {}) {
  const before = createFlow(beforeInput);
  const after = createFlow(afterInput);
  const changes = diffFlows(before, after, options);
  const capabilities = normalizeCapabilities(options.capabilities ?? options.runtime);
  const validation = validateFlow(after, capabilities.length > 0 ? { capabilities } : {});
  const highImpactChanges = changes.filter((item) => item.risk === 'high');
  const mediumImpactChanges = changes.filter((item) => item.risk === 'medium');
  const warnings = [
    ...validation.warnings,
    ...highImpactChanges.map((item) => `Review high-impact change: ${item.path}`),
    ...mediumImpactChanges
      .filter((item) => item.category === 'nodes' || item.category === 'edges')
      .map((item) => `Review flow graph change: ${item.path}`)
  ];
  const status = validation.errors.length > 0 ? 'blocked' : warnings.length > 0 ? 'review' : 'ready';
  const categories = countChangesByCategory(changes);

  return {
    ok: validation.errors.length === 0,
    status,
    beforeFlowId: before.id,
    afterFlowId: after.id,
    beforeFlowName: before.name,
    afterFlowName: after.name,
    total: changes.length,
    highImpactCount: highImpactChanges.length,
    mediumImpactCount: mediumImpactChanges.length,
    lowImpactCount: changes.filter((item) => item.risk === 'low').length,
    categories,
    changes,
    validation,
    blockingIssues: validation.errors,
    warnings,
    summary: createChangeSummary(changes.length, highImpactChanges.length, mediumImpactChanges.length, validation.errors.length)
  };
}

export function renderFlowChangeReportToHTML(reportOrBefore, afterInput, options = {}) {
  const report = isChangeReport(reportOrBefore) ? reportOrBefore : createFlowChangeReport(reportOrBefore, afterInput, options);
  const rows = report.changes.length > 0
    ? report.changes.map(renderChangeItem).join('')
    : '<li><span><strong>No changes</strong><small>The compared flow definitions are equivalent.</small></span></li>';
  const issueList = report.blockingIssues.length > 0
    ? `<div class="flow-change-report__issues flow-change-report__issues--error"><strong>Blocking issues</strong><ul>${report.blockingIssues.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul></div>`
    : '';
  const warningList = report.warnings.length > 0
    ? `<div class="flow-change-report__issues flow-change-report__issues--warning"><strong>Review warnings</strong><ul>${report.warnings.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul></div>`
    : '';

  return `
    <section class="flow-change-report flow-change-report--${escapeHTML(report.status)}">
      <header class="flow-change-report__header">
        <div>
          <strong>Flow change report</strong>
          <span>${escapeHTML(report.summary)}</span>
        </div>
        <span class="flow-badge flow-badge--${escapeHTML(report.status)}">${escapeHTML(report.status)}</span>
      </header>
      <div class="flow-change-report__summary">
        <span><strong>${report.total}</strong><small>Total changes</small></span>
        <span><strong>${report.highImpactCount}</strong><small>High impact</small></span>
        <span><strong>${report.mediumImpactCount}</strong><small>Medium impact</small></span>
        <span><strong>${report.lowImpactCount}</strong><small>Low impact</small></span>
      </div>
      <div class="flow-change-report__changes">
        <strong>Changes</strong>
        <ol>${rows}</ol>
      </div>
      ${issueList}
      ${warningList}
      <small>Change reports support human review only. Publish and execute APIs must still enforce server-side authorization, validation, and audit.</small>
    </section>
  `;
}

function classifyFlowChange(change) {
  const path = change.path || '';
  const category = getChangeCategory(path);
  return {
    ...change,
    category,
    risk: getChangeRisk(path, category),
    label: createChangeLabel(change, category)
  };
}

function getChangeCategory(path) {
  if (path.startsWith('intent')) {
    return 'intent';
  }
  if (path.startsWith('nodes')) {
    return 'nodes';
  }
  if (path.startsWith('edges')) {
    return 'edges';
  }
  if (path.startsWith('permissions')) {
    return 'permissions';
  }
  if (path === 'risk' || path === 'status' || path === 'publishedAt') {
    return 'lifecycle';
  }
  if (path.startsWith('metadata')) {
    return 'metadata';
  }
  return 'general';
}

function getChangeRisk(path, category) {
  if (/permissions|capability|risk|requiresConfirmation|condition|status/.test(path)) {
    return 'high';
  }
  if (category === 'nodes' || category === 'edges' || category === 'intent') {
    return 'medium';
  }
  return 'low';
}

function createChangeLabel(change, category) {
  return `${category}: ${change.path || 'root'} ${change.type}`;
}

function countChangesByCategory(changes) {
  return changes.reduce((output, item) => {
    output[item.category] = (output[item.category] ?? 0) + 1;
    return output;
  }, {});
}

function createChangeSummary(total, highImpactCount, mediumImpactCount, blockingCount) {
  if (blockingCount > 0) {
    return `Found ${total} change(s), but the target flow has ${blockingCount} blocking issue(s).`;
  }
  if (total === 0) {
    return 'No flow changes were detected.';
  }
  if (highImpactCount > 0) {
    return `Found ${total} change(s), including ${highImpactCount} high-impact change(s).`;
  }
  if (mediumImpactCount > 0) {
    return `Found ${total} change(s), including ${mediumImpactCount} graph or intent change(s).`;
  }
  return `Found ${total} low-impact change(s).`;
}

function renderChangeItem(item) {
  return `
    <li class="flow-change-report__item flow-change-report__item--${escapeHTML(item.risk)}">
      <span>
        <strong>${escapeHTML(item.label)}</strong>
        <small>${escapeHTML(formatDiffValue(item.before))} -> ${escapeHTML(formatDiffValue(item.after))}</small>
      </span>
      <em>${escapeHTML(item.risk)}</em>
    </li>
  `;
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

function normalizeCapabilities(source) {
  if (!source) {
    return [];
  }

  if (source instanceof Set) {
    return Array.from(source);
  }

  if (Array.isArray(source)) {
    return source;
  }

  if (typeof source.listCapabilities === 'function') {
    return source.listCapabilities();
  }

  if (typeof source.list === 'function') {
    return source.list();
  }

  return [];
}

function isChangeReport(value) {
  return Boolean(value && typeof value === 'object' && Array.isArray(value.changes) && typeof value.summary === 'string');
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}
