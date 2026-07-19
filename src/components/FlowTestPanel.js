import { escapeHTML, formatJson } from './dom.js';
import { renderIntentClarificationPlanToHTML } from '../intent-mapper.js';

export function renderFlowTestPanelToHTML(state = {}) {
  return [
    '<section class="flow-test-panel">',
    '<div class="flow-test-panel__header">',
    '<div>',
    '<div class="flow-panel-title">Run test</div>',
    '<div class="flow-muted">Match, preview, and execute the current flow configuration.</div>',
    '</div>',
    '<div class="flow-test-panel__actions">',
    '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-action="test-match">Match</button>',
    '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-action="test-preview">Preview</button>',
    '<button type="button" class="ds-btn ds-btn--brand ds-btn--sm" data-flow-action="test-execute">Execute</button>',
    '</div>',
    '</div>',
    '<div class="flow-test-panel__grid">',
    '<label class="flow-field">',
    '<span>Prompt</span>',
    `<textarea class="ds-textarea" rows="3" data-flow-test-field="prompt">${escapeHTML(state.testPrompt ?? '')}</textarea>`,
    '</label>',
    '<label class="flow-field">',
    '<span>Slots JSON</span>',
    `<textarea class="ds-textarea" rows="3" data-flow-test-field="slots">${escapeHTML(state.testSlotsText ?? '{}')}</textarea>`,
    '</label>',
    '</div>',
    renderTestMatch(state.testMatch, state.testMissingSlots, state.testClarification),
    '</section>'
  ].join('');
}

function renderTestMatch(match, missingSlots = [], clarification = null) {
  if (!match) {
    return [
      '<div class="flow-empty flow-empty--compact">Run match to inspect intent routing.</div>',
      clarification?.needed ? renderIntentClarificationPlanToHTML(clarification) : ''
    ].join('');
  }

  return [
    '<div class="flow-test-match">',
    '<div class="flow-panel-title">Matched flow</div>',
    `<strong>${escapeHTML(match.flow?.name || match.flow?.id || '-')}</strong>`,
    `<span>${escapeHTML(Math.round((match.confidence ?? 0) * 100))}% confidence</span>`,
    '<div class="flow-token-list">',
    ...Object.entries(match.slots ?? {}).map(([key, value]) => `<code>${escapeHTML(key)}: ${escapeHTML(value)}</code>`),
    '</div>',
    missingSlots?.length
      ? [
        '<div class="flow-alert flow-alert--error">',
        'Missing slots: ',
        missingSlots.map((slot) => escapeHTML(slot.label || slot.name)).join(', '),
        '</div>'
      ].join('')
      : '',
    clarification?.needed ? renderIntentClarificationPlanToHTML(clarification) : '',
    '<details class="flow-test-match__details">',
    '<summary>Match details</summary>',
    `<pre>${escapeHTML(formatJson({
      flowId: match.flow?.id,
      slots: match.slots ?? {},
      missingSlots: missingSlots ?? [],
      clarification: clarification ?? null,
      reasons: match.reasons ?? []
    }))}</pre>`,
    '</details>',
    '</div>'
  ].join('');
}

export function parseFlowTestSlots(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return {};
  }

  const slots = JSON.parse(text);
  if (!slots || typeof slots !== 'object' || Array.isArray(slots)) {
    throw new Error('Slots must be a JSON object.');
  }

  return slots;
}
