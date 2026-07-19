import { FLOW_STATUS } from './node-types.js';
import { cloneFlow, createFlow, createId } from './flow-schema.js';
import { validateFlow } from './flow-validation.js';
import { escapeHTML } from './components/dom.js';

export const FLOW_EXPORT_SCHEMA = 'kupola.pivot-flow.export.v1';

export function createFlowExportPayload(flows = [], options = {}) {
  const items = normalizeFlowArray(flows);
  const exportedAt = options.exportedAt ?? new Date().toISOString();

  return {
    schema: FLOW_EXPORT_SCHEMA,
    version: 1,
    exportedAt,
    metadata: isPlainObject(options.metadata) ? cloneFlow(options.metadata) : {},
    flows: items.map((flow) => createFlow(flow))
  };
}

export function exportFlowToJSON(flow, options = {}) {
  return stringifyFlowExport(createFlowExportPayload([flow], options), options);
}

export function exportFlowsToJSON(flows = [], options = {}) {
  return stringifyFlowExport(createFlowExportPayload(flows, options), options);
}

export function parseFlowImportJSON(value) {
  const parsed = parseImportValue(value);
  const flows = extractImportFlows(parsed);

  return {
    schema: typeof parsed?.schema === 'string' ? parsed.schema : '',
    version: Number.isFinite(parsed?.version) ? parsed.version : null,
    importedAt: new Date().toISOString(),
    metadata: isPlainObject(parsed?.metadata) ? cloneFlow(parsed.metadata) : {},
    flows
  };
}

export function prepareImportedFlow(flowInput = {}, options = {}) {
  const importedAt = options.importedAt ?? new Date().toISOString();
  const originalId = String(flowInput?.id ?? '').trim();
  const existingIds = normalizeIdSet(options.existingIds ?? options.existingFlows);
  const preserveId = options.preserveIds !== false;
  const preserveStatus = options.preserveStatus === true;
  const conflictStrategy = options.conflictStrategy ?? 'regenerate';
  const nextId = resolveImportId(originalId, existingIds, { preserveId, conflictStrategy });
  const metadata = isPlainObject(flowInput?.metadata) ? cloneFlow(flowInput.metadata) : {};

  return createFlow({
    ...cloneFlow(flowInput ?? {}),
    id: nextId.id,
    status: preserveStatus ? flowInput.status : FLOW_STATUS.DRAFT,
    publishedAt: preserveStatus ? flowInput.publishedAt ?? null : null,
    createdAt: options.createdAt ?? flowInput.createdAt,
    updatedAt: options.updatedAt ?? importedAt,
    metadata: {
      ...metadata,
      importedAt,
      importedFrom: options.importedFrom ?? metadata.importedFrom ?? '',
      originalId
    }
  });
}

export function createFlowImportReport(input, options = {}) {
  const importedAt = options.importedAt ?? new Date().toISOString();
  const importedFrom = options.importedFrom ?? '';
  const existingIds = normalizeIdSet(options.existingIds ?? options.existingFlows);
  let parsed;

  try {
    parsed = parseFlowImportJSON(input);
  } catch (error) {
    return {
      ok: false,
      status: 'blocked',
      schema: '',
      importedAt,
      importedFrom,
      total: 0,
      readyCount: 0,
      reviewCount: 0,
      blockedCount: 1,
      flows: [],
      items: [],
      blockingIssues: [error.message],
      warnings: [],
      summary: `Flow import is blocked: ${error.message}`
    };
  }

  const seenIds = new Set(existingIds);
  const items = parsed.flows.map((flowInput, index) => {
    if (!isPlainObject(flowInput)) {
      return createImportItem({
        index,
        status: 'blocked',
        action: 'skip',
        originalId: '',
        errors: ['Imported flow must be a plain object.']
      });
    }

    const originalId = String(flowInput.id ?? '').trim();
    const idConflict = originalId && seenIds.has(originalId);
    const generatedId = !originalId || (idConflict && options.conflictStrategy !== 'keep');
    const flow = prepareImportedFlow(flowInput, {
      ...options,
      importedAt,
      importedFrom,
      existingIds: seenIds
    });
    seenIds.add(flow.id);

    const capabilities = normalizeCapabilities(options.capabilities ?? options.runtime);
    const validation = validateFlow(flow, capabilities.length > 0 ? { capabilities } : {});
    const warnings = [...validation.warnings];

    if (!options.preserveStatus && flowInput.status && flowInput.status !== FLOW_STATUS.DRAFT) {
      warnings.push(`Imported flow status was reset from ${flowInput.status} to draft.`);
    }

    if (generatedId && originalId && flow.id !== originalId) {
      warnings.push(`Imported flow id was regenerated because ${originalId} already exists.`);
    }

    if (!originalId) {
      warnings.push('Imported flow id was generated because the source flow had no id.');
    }

    const status = validation.errors.length > 0 ? 'blocked' : warnings.length > 0 ? 'review' : 'ready';
    const action = generatedId ? 'create-with-new-id' : idConflict ? 'replace-candidate' : 'create';

    return createImportItem({
      index,
      status,
      action,
      flow,
      originalId,
      errors: validation.errors,
      warnings,
      validation
    });
  });

  const readyCount = items.filter((item) => item.status === 'ready').length;
  const reviewCount = items.filter((item) => item.status === 'review').length;
  const blockedCount = items.filter((item) => item.status === 'blocked').length;
  const blockingIssues = items.flatMap((item) => item.errors.map((error) => `${item.flowName || `Flow #${item.index + 1}`}: ${error}`));
  const warnings = items.flatMap((item) => item.warnings.map((warning) => `${item.flowName || `Flow #${item.index + 1}`}: ${warning}`));
  const status = blockedCount > 0 ? 'blocked' : reviewCount > 0 ? 'review' : 'ready';

  return {
    ok: blockedCount === 0,
    status,
    schema: parsed.schema,
    importedAt,
    importedFrom,
    total: items.length,
    readyCount,
    reviewCount,
    blockedCount,
    flows: items.filter((item) => item.flow).map((item) => cloneFlow(item.flow)),
    items,
    blockingIssues,
    warnings,
    summary: createImportSummary(items.length, readyCount, reviewCount, blockedCount)
  };
}

export async function importFlowsToStore(inputOrReport, flowStore, options = {}) {
  if (!flowStore || typeof flowStore.create !== 'function') {
    throw new Error('A FlowStore with create() is required to import flows.');
  }

  const importOptions = { ...options };
  if (!isImportReport(inputOrReport) && !importOptions.existingIds && !importOptions.existingFlows && typeof flowStore.list === 'function') {
    importOptions.existingFlows = await flowStore.list();
  }

  const report = isImportReport(inputOrReport) ? inputOrReport : createFlowImportReport(inputOrReport, importOptions);
  const results = [];
  const errors = [];

  for (const item of report.items) {
    if (item.status === 'blocked' || !item.flow) {
      errors.push(...item.errors.map((error) => `${item.flowName || `Flow #${item.index + 1}`}: ${error}`));
      continue;
    }

    try {
      const saved = await flowStore.create(item.flow);
      results.push(saved);
    } catch (error) {
      errors.push(`${item.flowName || item.flowId}: ${error.message}`);
    }
  }

  return {
    ok: errors.length === 0,
    createdCount: results.length,
    skippedCount: report.items.length - results.length,
    flows: results,
    errors,
    report
  };
}

export function renderFlowImportReportToHTML(reportOrInput, options = {}) {
  const report = isImportReport(reportOrInput) ? reportOrInput : createFlowImportReport(reportOrInput, options);
  const rows = report.items.length > 0
    ? report.items.map((item) => renderImportItem(item)).join('')
    : '<li><span><strong>No flows found</strong><small>The import package does not contain flow definitions.</small></span></li>';
  const issueList = report.blockingIssues.length > 0
    ? `<div class="flow-import-report__issues flow-import-report__issues--error"><strong>Blocking issues</strong><ul>${report.blockingIssues.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul></div>`
    : '';
  const warningList = report.warnings.length > 0
    ? `<div class="flow-import-report__issues flow-import-report__issues--warning"><strong>Review warnings</strong><ul>${report.warnings.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul></div>`
    : '';

  return `
    <section class="flow-import-report flow-import-report--${escapeHTML(report.status)}">
      <header class="flow-import-report__header">
        <div>
          <strong>Flow import report</strong>
          <span>${escapeHTML(report.summary)}</span>
        </div>
        <span class="flow-badge flow-badge--${escapeHTML(report.status)}">${escapeHTML(report.status)}</span>
      </header>
      <div class="flow-import-report__summary">
        <span><strong>${report.total}</strong><small>Total</small></span>
        <span><strong>${report.readyCount}</strong><small>Ready</small></span>
        <span><strong>${report.reviewCount}</strong><small>Needs review</small></span>
        <span><strong>${report.blockedCount}</strong><small>Blocked</small></span>
      </div>
      <div class="flow-import-report__flows">
        <strong>Imported flows</strong>
        <ol>${rows}</ol>
      </div>
      ${issueList}
      ${warningList}
      <small>Imported flows are prepared as drafts by default. Server-side authorization and validation must still protect every write operation.</small>
    </section>
  `;
}

function stringifyFlowExport(payload, options = {}) {
  const space = options.compact ? 0 : options.space ?? 2;
  return JSON.stringify(payload, null, space);
}

function normalizeFlowArray(flows) {
  if (Array.isArray(flows)) {
    return flows;
  }

  return flows ? [flows] : [];
}

function parseImportValue(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error('Flow import JSON is empty.');
    }

    try {
      return JSON.parse(trimmed);
    } catch (error) {
      throw new Error(`Flow import JSON is invalid: ${error.message}`);
    }
  }

  if (value && typeof value === 'object') {
    return value;
  }

  throw new Error('Flow import value must be JSON text or an object.');
}

function extractImportFlows(parsed) {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (Array.isArray(parsed?.flows)) {
    return parsed.flows;
  }

  if (isPlainObject(parsed?.flow)) {
    return [parsed.flow];
  }

  if (isPlainObject(parsed) && (parsed.id || parsed.name || parsed.nodes || parsed.edges || parsed.intent)) {
    return [parsed];
  }

  throw new Error('Flow import package must contain a flow or flows array.');
}

function resolveImportId(originalId, existingIds, options = {}) {
  if (!options.preserveId || !originalId) {
    return { id: createId('flow'), changed: true };
  }

  if (!existingIds.has(originalId)) {
    return { id: originalId, changed: false };
  }

  if (options.conflictStrategy === 'keep') {
    return { id: originalId, changed: false };
  }

  return { id: createId('flow'), changed: true };
}

function createImportItem(input = {}) {
  const flow = input.flow ? cloneFlow(input.flow) : null;

  return {
    index: input.index ?? 0,
    ok: input.status !== 'blocked',
    status: input.status ?? 'blocked',
    action: input.action ?? 'skip',
    originalId: input.originalId ?? '',
    flowId: flow?.id ?? '',
    flowName: flow?.name ?? '',
    flow,
    validation: input.validation ?? {
      valid: input.status !== 'blocked',
      errors: input.errors ?? [],
      warnings: input.warnings ?? []
    },
    errors: input.errors ?? [],
    warnings: input.warnings ?? []
  };
}

function createImportSummary(total, readyCount, reviewCount, blockedCount) {
  if (total === 0) {
    return 'No flow definitions were found in the import package.';
  }

  if (blockedCount > 0) {
    return `Found ${total} flow(s): ${blockedCount} blocked, ${reviewCount} need review, ${readyCount} ready.`;
  }

  if (reviewCount > 0) {
    return `Found ${total} flow(s): ${reviewCount} need review, ${readyCount} ready.`;
  }

  return `Found ${total} flow(s), all ready to import as drafts.`;
}

function renderImportItem(item) {
  const issues = [
    ...item.errors.map((error) => `<small class="flow-import-report__error">${escapeHTML(error)}</small>`),
    ...item.warnings.map((warning) => `<small>${escapeHTML(warning)}</small>`)
  ].join('');

  return `
    <li class="flow-import-report__item flow-import-report__item--${escapeHTML(item.status)}">
      <span>
        <strong>${escapeHTML(item.flowName || item.originalId || `Flow #${item.index + 1}`)}</strong>
        <small>${escapeHTML(item.action)} · ${escapeHTML(item.flowId || item.originalId || '-')}</small>
      </span>
      <em>${escapeHTML(item.status)}</em>
      ${issues}
    </li>
  `;
}

function normalizeIdSet(value) {
  if (value instanceof Set) {
    return new Set(value);
  }

  if (Array.isArray(value)) {
    return new Set(value.map((item) => typeof item === 'string' ? item : item?.id).filter(Boolean));
  }

  return new Set();
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

function isImportReport(value) {
  return Boolean(value && typeof value === 'object' && Array.isArray(value.items) && Array.isArray(value.flows) && typeof value.summary === 'string');
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}
