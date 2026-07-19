import { getFlowRunSummary } from '../flow-run-summary.js';
import { escapeAttr, escapeHTML } from './dom.js';

export function filterFlowRuns(runs = [], options = {}) {
  const keyword = String(options.keyword || '').trim().toLowerCase();
  const status = String(options.status || '').trim();
  const dateRange = normalizeDateRange(options.dateRange ?? options.range);
  const since = getDateRangeStart(dateRange, options.now);
  const limit = Number(options.limit || 0);
  const filtered = (Array.isArray(runs) ? runs : [])
    .filter((run) => !options.flowId || run.flowId === options.flowId)
    .filter((run) => {
      if (!since) {
        return true;
      }
      const time = getRunTime(run);
      return time > 0 && time >= since;
    })
    .filter((run) => {
      if (!status) {
        return true;
      }
      return status === 'success' ? run.ok === true : run.ok === false;
    })
    .filter((run) => {
      if (!keyword) {
        return true;
      }
      return [
        run.id,
        run.flowId,
        run.prompt,
        run.message,
        run.result?.message
      ].some((value) => String(value ?? '').toLowerCase().includes(keyword));
    })
    .sort((left, right) => getRunTime(right) - getRunTime(left));

  return limit > 0 ? filtered.slice(0, limit) : filtered;
}

export function createFlowRunHistorySummary(runs = [], options = {}) {
  const filtered = filterFlowRuns(runs, options);
  const successCount = filtered.filter((run) => run.ok === true).length;
  const failedCount = filtered.filter((run) => run.ok === false).length;
  const latest = filtered[0] ?? null;

  return {
    total: filtered.length,
    successCount,
    failedCount,
    latestAt: latest?.timestamp || latest?.createdAt || '',
    latestStatus: latest ? latest.ok === true ? 'success' : latest.ok === false ? 'failed' : 'unknown' : ''
  };
}

export function renderFlowRunHistoryToHTML(runs = [], options = {}) {
  const filtered = filterFlowRuns(runs, options);
  const summary = createFlowRunHistorySummary(runs, options);

  return [
    '<section class="flow-run-history">',
    options.title === false
      ? ''
      : [
        '<div class="flow-run-history__header">',
        '<div>',
        '<strong>Run history</strong>',
        `<span>${escapeHTML(summary.total)} record(s)</span>`,
        '</div>',
        summary.latestAt ? `<small>Latest ${escapeHTML(formatRunTime(summary.latestAt))}</small>` : '',
        '</div>'
      ].join(''),
    options.controls === false ? '' : renderRunHistoryFilters(options),
    '<div class="flow-run-history__summary">',
    `<span><strong>${escapeHTML(summary.total)}</strong><small>runs</small></span>`,
    `<span><strong>${escapeHTML(summary.successCount)}</strong><small>success</small></span>`,
    `<span><strong>${escapeHTML(summary.failedCount)}</strong><small>failed</small></span>`,
    '</div>',
    filtered.length === 0
      ? '<div class="flow-empty flow-empty--compact">No run records match the current filters.</div>'
      : [
        '<ol class="flow-run-history__list">',
        ...filtered.map((run) => renderRunHistoryItem(run, options)),
        '</ol>'
      ].join(''),
    '</section>'
  ].join('');
}

function renderRunHistoryFilters(options) {
  const status = String(options.status || '');
  const keyword = String(options.keyword || '');
  return [
    '<div class="flow-run-history__filters">',
    `<input class="ds-input ds-input--sm" type="search" placeholder="Search runs" value="${escapeAttr(keyword)}" data-flow-run-filter="keyword">`,
    '<select class="ds-select ds-select--sm" data-flow-run-filter="status">',
    ...[
      ['', 'All results'],
      ['success', 'Success'],
      ['failed', 'Failed']
    ].map(([value, label]) => `<option value="${escapeAttr(value)}"${status === value ? ' selected' : ''}>${escapeHTML(label)}</option>`),
    '</select>',
    '<select class="ds-select ds-select--sm" data-flow-run-filter="dateRange">',
    ...renderDateRangeOptions(options.dateRange ?? options.range),
    '</select>',
    keyword || status || options.dateRange || options.range ? '<button type="button" class="ds-btn ds-btn--tertiary ds-btn--sm" data-flow-action="clear-run-filters">Clear</button>' : '',
    '</div>'
  ].join('');
}

function renderRunHistoryItem(run, options) {
  const summary = getFlowRunSummary(run.result, options.flow ?? options.nodes ?? []);
  const status = run.ok === true ? 'success' : run.ok === false ? 'failed' : summary.status;
  const nodeCount = Array.isArray(run.result?.data?.nodes) ? run.result.data.nodes.length : summary.nodeItems.length;

  return [
    '<li class="flow-run-history__item">',
    '<div>',
    `<strong>${escapeHTML(run.prompt || run.flowName || run.flowId || run.id || 'Flow run')}</strong>`,
    `<small>${escapeHTML(formatRunTime(run.timestamp || run.createdAt))}</small>`,
    '</div>',
    `<span class="flow-badge flow-badge--${escapeAttr(status === 'failed' ? 'high' : status === 'success' ? 'low' : 'medium')}">${escapeHTML(status)}</span>`,
    `<small>${escapeHTML(run.message || run.result?.message || summary.message || '')}</small>`,
    `<small>${escapeHTML(nodeCount)} node(s) · ${escapeHTML(summary.durationMs || 0)}ms</small>`,
    '</li>'
  ].join('');
}

function getRunTime(run) {
  const value = Date.parse(run?.timestamp || run?.createdAt || '');
  return Number.isFinite(value) ? value : 0;
}

function normalizeDateRange(value) {
  const range = String(value || '').trim();
  return ['24h', '7d', '30d'].includes(range) ? range : '';
}

function getDateRangeStart(range, now = Date.now()) {
  const current = typeof now === 'number' ? now : Date.parse(now);
  const safeNow = Number.isFinite(current) ? current : Date.now();
  const offsets = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  };
  return offsets[range] ? safeNow - offsets[range] : 0;
}

function renderDateRangeOptions(value) {
  const selected = normalizeDateRange(value);
  return [
    ['', 'All time'],
    ['24h', 'Last 24h'],
    ['7d', 'Last 7d'],
    ['30d', 'Last 30d']
  ].map(([range, label]) => `<option value="${escapeAttr(range)}"${selected === range ? ' selected' : ''}>${escapeHTML(label)}</option>`);
}

function formatRunTime(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
}
