import { escapeHTML } from './dom.js';

export function renderIntentPatternEditorToHTML(flow) {
  const intent = flow?.intent ?? {};
  const analysis = analyzeIntentConfig(flow);
  return [
    '<div class="flow-intent-editor">',
    '<div class="flow-intent-editor__header">',
    '<span>',
    '<div class="flow-panel-title">Intent patterns</div>',
    `<small>${escapeHTML(analysis.summary)}</small>`,
    '</span>',
    `<em>${escapeHTML(analysis.status)}</em>`,
    '</div>',
    renderIntentStats(analysis),
    renderIntentIssues(analysis),
    renderList('Examples', intent.examples),
    renderList('Keywords', intent.keywords),
    renderList('Patterns', intent.patterns),
    renderSlots(intent.slots),
    '</div>'
  ].join('');
}

export function analyzeIntentConfig(flow = {}) {
  const intent = flow?.intent ?? {};
  const examples = Array.isArray(intent.examples) ? intent.examples.filter(Boolean) : [];
  const keywords = Array.isArray(intent.keywords) ? intent.keywords.filter(Boolean) : [];
  const patterns = Array.isArray(intent.patterns) ? intent.patterns.filter(Boolean) : [];
  const slots = Array.isArray(intent.slots) ? intent.slots : [];
  const issues = [];
  const warnings = [];

  if (examples.length === 0 && keywords.length === 0 && patterns.length === 0 && !intent.ai?.enabled) {
    issues.push('No local intent rule is configured.');
  }

  for (const pattern of patterns) {
    try {
      new RegExp(pattern);
    } catch (error) {
      issues.push(`Invalid intent pattern: ${pattern}`);
    }
  }

  const slotNames = new Set();
  for (const slot of slots) {
    if (!slot?.name) {
      issues.push('Slot name is required.');
      continue;
    }
    if (slotNames.has(slot.name)) {
      issues.push(`Duplicate slot: ${slot.name}`);
    }
    slotNames.add(slot.name);
    if (slot.required && !slot.pattern && slot.fallback === undefined && slot.source !== 'context' && slot.source !== 'manual') {
      warnings.push(`Required slot has no extraction source: ${slot.name}`);
    }
    if ((slot.sensitive || slot.inputType === 'password') && slot.source !== 'manual') {
      warnings.push(`Sensitive slot should use manual source: ${slot.name}`);
    }
  }

  const status = issues.length > 0 ? 'blocked' : warnings.length > 0 ? 'review' : 'ready';

  return {
    ok: issues.length === 0,
    status,
    summary: createIntentSummary({ examples, keywords, patterns, slots, issues, warnings, aiEnabled: Boolean(intent.ai?.enabled) }),
    counts: {
      examples: examples.length,
      keywords: keywords.length,
      patterns: patterns.length,
      slots: slots.length
    },
    issues,
    warnings
  };
}

function renderList(label, values = []) {
  const entries = Array.isArray(values) ? values : [];
  if (entries.length === 0) {
    return `<div class="flow-empty flow-empty--compact">${escapeHTML(label)} not configured.</div>`;
  }

  return [
    `<div class="flow-intent-editor__label">${escapeHTML(label)}</div>`,
    '<ol class="flow-token-list">',
    ...entries.map((value) => `<li>${escapeHTML(value)}</li>`),
    '</ol>'
  ].join('');
}

function renderIntentStats(analysis) {
  return [
    '<div class="flow-intent-editor__stats">',
    renderStat('Examples', analysis.counts.examples),
    renderStat('Keywords', analysis.counts.keywords),
    renderStat('Patterns', analysis.counts.patterns),
    renderStat('Slots', analysis.counts.slots),
    '</div>'
  ].join('');
}

function renderStat(label, value) {
  return [
    '<span>',
    `<strong>${escapeHTML(value)}</strong>`,
    `<small>${escapeHTML(label)}</small>`,
    '</span>'
  ].join('');
}

function renderIntentIssues(analysis) {
  if (analysis.issues.length === 0 && analysis.warnings.length === 0) {
    return '';
  }

  return [
    '<div class="flow-intent-editor__issues">',
    ...analysis.issues.map((issue) => `<div class="flow-alert flow-alert--error">${escapeHTML(issue)}</div>`),
    ...analysis.warnings.map((warning) => `<div class="flow-alert flow-alert--warning">${escapeHTML(warning)}</div>`),
    '</div>'
  ].join('');
}

function renderSlots(slots = []) {
  const entries = Array.isArray(slots) ? slots : [];
  if (entries.length === 0) {
    return '<div class="flow-empty flow-empty--compact">Slots not configured.</div>';
  }

  return [
    '<div class="flow-intent-editor__label">Slots</div>',
    '<ol class="flow-intent-editor__slots">',
    ...entries.map((slot) => [
      '<li>',
      '<span>',
      `<strong>${escapeHTML(slot.label || slot.name || 'Unnamed slot')}</strong>`,
      `<small>${escapeHTML([slot.name, slot.type || 'string', slot.source || 'intent'].filter(Boolean).join(' · '))}</small>`,
      '</span>',
      `<em>${escapeHTML(slot.required ? 'required' : 'optional')}</em>`,
      slot.pattern ? `<code>${escapeHTML(slot.pattern)}</code>` : '',
      slot.fallback !== undefined ? `<code>fallback: ${escapeHTML(JSON.stringify(slot.fallback))}</code>` : '',
      '</li>'
    ].join('')),
    '</ol>'
  ].join('');
}

function createIntentSummary(input) {
  if (input.issues.length > 0) {
    return `${input.issues.length} issue(s) block reliable intent matching.`;
  }
  if (input.warnings.length > 0) {
    return `${input.warnings.length} warning(s) should be reviewed.`;
  }
  if (input.aiEnabled) {
    return 'AI matching is enabled; local rules are available as guardrails.';
  }
  return 'Local intent rules are ready.';
}
