import { createLocalIntentMapper, renderIntentClarificationPlanToHTML } from '../intent-mapper.js';
import { createMemoryFlowStore } from '../flow-store.js';
import { createFlowRunner } from '../flow-runner.js';
import { createFlowAccessReport, renderFlowAccessReportToHTML } from '../flow-access-report.js';
import { createElement, escapeAttr, escapeHTML, on } from './dom.js';
import { renderFlowPreviewToHTML } from './FlowPreview.js';
import { renderFlowRunPanelToHTML } from './FlowRunPanel.js';

export function FlowAssistantDrawer(options = {}) {
  const trigger = typeof options.trigger === 'string'
    ? document.querySelector(options.trigger)
    : options.trigger;
  const flowStore = options.flowStore ?? createMemoryFlowStore(options.flows ?? []);
  const intentMapper = options.intentMapper ?? createLocalIntentMapper();
  const runner = options.runtime
    ? createFlowRunner({
      runtime: options.runtime,
      flowStore,
      intentMapper,
      contextProvider: options.contextProvider,
      context: options.context
    })
    : null;
  const state = {
    open: false,
    prompt: '',
    match: null,
    missingSlots: [],
    slotValues: {},
    clarification: null,
    access: null,
    preview: null,
    result: null,
    error: ''
  };

  const root = createElement('section', 'flow-assistant', {
    'aria-hidden': 'true'
  });
  document.body.appendChild(root);

  const render = () => {
    root.classList.toggle('is-open', state.open);
    root.setAttribute('aria-hidden', state.open ? 'false' : 'true');
    root.innerHTML = [
      '<div class="flow-assistant__backdrop" data-flow-action="close"></div>',
      '<aside class="flow-assistant__drawer">',
      '<header class="flow-assistant__header">',
      '<div>',
      '<h2>PIVOT Flow</h2>',
      '<p>Trigger published business flows with natural language.</p>',
      '</div>',
      '<button type="button" class="ds-btn ds-btn--ghost ds-btn--sm" data-flow-action="close">Close</button>',
      '</header>',
      '<div class="flow-assistant__body">',
      '<label class="flow-field">',
      '<span>Intent</span>',
      `<textarea class="ds-textarea flow-assistant__input" rows="4" data-flow-input="prompt">${escapeHTML(state.prompt)}</textarea>`,
      '</label>',
      '<div class="flow-assistant__actions">',
      '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-action="match">Match flow</button>',
      '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-action="preview">Preview</button>',
      '<button type="button" class="ds-btn ds-btn--brand ds-btn--sm" data-flow-action="execute">Execute</button>',
      '</div>',
      state.error ? `<div class="flow-alert flow-alert--error">${escapeHTML(state.error)}</div>` : '',
      renderMatch(state.match),
      renderClarification(state.clarification),
      state.access ? renderFlowAccessReportToHTML(state.access) : '',
      renderMissingSlots(state.missingSlots, state.slotValues),
      '<div class="flow-panel-title">Preview</div>',
      renderFlowPreviewToHTML(state.preview),
      '<div class="flow-panel-title">Result</div>',
      renderFlowRunPanelToHTML(state.result),
      '</div>',
      '</aside>'
    ].join('');
  };

  const matchPrompt = async () => {
    if (!runner) {
      state.error = 'PIVOT runtime is required.';
      render();
      return null;
    }

    const matchResult = await runner.match(state.prompt);
    state.match = matchResult.match;
    state.clarification = matchResult.clarification ?? null;
    state.preview = null;
    state.result = null;
    state.missingSlots = matchResult.match?.missingSlots ?? [];
    state.slotValues = { ...(matchResult.match?.slots ?? {}) };
    state.access = matchResult.match
      ? createFlowAccessReport(matchResult.match.flow, options.runtime, {
        context: await resolveContext(options.contextProvider, options.context)
      })
      : null;
    state.error = matchResult.match ? '' : matchResult.message;
    render();
    return state.match;
  };

  const previewMatch = async () => {
    if (!runner) {
      state.error = 'PIVOT runtime is required.';
      render();
      return null;
    }

    const previewResult = await runner.preview(state.prompt, {
      match: state.match,
      slots: state.slotValues
    });
    state.match = previewResult.match;
    state.clarification = previewResult.clarification ?? null;
    state.missingSlots = previewResult.missingSlots ?? [];
    state.slotValues = { ...state.slotValues, ...(previewResult.slots ?? {}) };
    state.preview = previewResult.preview ?? null;
    state.result = null;
    state.access = previewResult.match
      ? createFlowAccessReport(previewResult.match.flow, options.runtime, {
        context: previewResult.context ?? await resolveContext(options.contextProvider, options.context)
      })
      : null;
    state.error = previewResult.ok ? '' : previewResult.message;
    render();
    return previewResult;
  };

  const executeMatch = async () => {
    if (!runner) {
      state.error = 'PIVOT runtime is required.';
      render();
      return;
    }

    const flow = state.match?.flow;
    if (flow) {
      const context = await resolveContext(options.contextProvider, options.context);
      state.access = createFlowAccessReport(flow, options.runtime, { context });
      if (!state.access.ok) {
        state.error = `Cannot execute flow: ${state.access.summary}`;
        render();
        return;
      }
    }

    const execution = await runner.execute(state.prompt, {
      match: state.match,
      slots: state.slotValues
    });
    state.match = execution.match;
    state.clarification = execution.clarification ?? null;
    state.missingSlots = execution.missingSlots ?? [];
    state.slotValues = { ...state.slotValues, ...(execution.slots ?? {}) };
    state.preview = execution.preview ?? null;
    state.result = execution.result ?? execution.preview ?? null;
    state.access = execution.match
      ? createFlowAccessReport(execution.match.flow, options.runtime, {
        context: execution.context ?? await resolveContext(options.contextProvider, options.context)
      })
      : state.access;
    state.error = execution.ok ? '' : execution.message;
    render();
  };

  const cleanups = [
    trigger ? (() => {
      const handler = () => {
        state.open = true;
        render();
      };
      trigger.addEventListener('click', handler);
      return () => trigger.removeEventListener('click', handler);
    })() : () => {},
    on(root, 'click', '[data-flow-action="close"]', () => {
      state.open = false;
      render();
    }),
    on(root, 'click', '[data-flow-action="match"]', () => {
      matchPrompt();
    }),
    on(root, 'click', '[data-flow-action="preview"]', () => {
      previewMatch();
    }),
    on(root, 'click', '[data-flow-action="execute"]', () => {
      executeMatch();
    }),
    on(root, 'input', '[data-flow-input="prompt"]', (e) => {
      state.prompt = e.target.value;
      state.match = null;
      state.missingSlots = [];
      state.slotValues = {};
      state.clarification = null;
      state.access = null;
      state.preview = null;
      state.result = null;
      state.error = '';
    }),
    on(root, 'input', '[data-flow-slot]', (e, el) => {
      state.slotValues[el.dataset.flowSlot] = e.target.value;
      state.clarification = null;
      state.access = null;
      state.preview = null;
      state.result = null;
      state.error = '';
    })
  ];

  render();

  return {
    element: root,
    open() {
      state.open = true;
      render();
    },
    close() {
      state.open = false;
      render();
    },
    destroy() {
      cleanups.forEach((cleanup) => cleanup());
      root.remove();
    }
  };
}

function renderClarification(clarification) {
  if (!clarification?.needed) {
    return '';
  }
  return renderIntentClarificationPlanToHTML(clarification);
}

function renderMissingSlots(missingSlots = [], slotValues = {}) {
  if (!Array.isArray(missingSlots) || missingSlots.length === 0) {
    return '';
  }

  return [
    '<section class="flow-missing-slots">',
    '<div class="flow-panel-title">Required parameters</div>',
    ...missingSlots.map((slot) => renderMissingSlotInput(slot, slotValues)),
    '</section>'
  ].join('');
}

function renderMissingSlotInput(slot, slotValues = {}) {
  const inputType = getSlotInputType(slot);
  return [
    '<label class="flow-field">',
    `<span>${escapeHTML(slot.label || slot.name)}</span>`,
    `<input type="${escapeAttr(inputType)}" autocomplete="${escapeAttr(getSlotAutocomplete(slot, inputType))}" class="ds-input" data-flow-slot="${escapeAttr(slot.name)}" value="${escapeAttr(slotValues[slot.name] ?? '')}" placeholder="${escapeAttr(slot.name)}">`,
    '</label>'
  ].join('');
}

function getSlotInputType(slot) {
  const allowedTypes = new Set(['text', 'password', 'number', 'date', 'email', 'tel', 'url']);
  if (slot?.inputType && allowedTypes.has(slot.inputType)) {
    return slot.inputType;
  }
  if (slot?.sensitive || /password|secret|token/i.test(slot?.name || '')) {
    return 'password';
  }
  if (slot?.type === 'number') {
    return 'number';
  }
  if (slot?.type === 'date') {
    return 'date';
  }
  return 'text';
}

function getSlotAutocomplete(slot, inputType) {
  if (inputType === 'password' || slot?.sensitive) {
    return 'new-password';
  }
  return 'off';
}

async function resolveContext(contextProvider, fallback = {}) {
  if (typeof contextProvider === 'function') {
    return await contextProvider();
  }
  return fallback ?? {};
}

function renderMatch(match) {
  if (!match) {
    return '<div class="flow-empty">Match a flow before previewing execution.</div>';
  }

  return [
    '<section class="flow-match">',
    '<div class="flow-panel-title">Matched flow</div>',
    `<strong>${escapeHTML(match.flow.name)}</strong>`,
    `<span>${escapeHTML(Math.round(match.confidence * 100))}% confidence</span>`,
    '<div class="flow-token-list">',
    ...Object.entries(match.slots ?? {}).map(([key, value]) => `<code>${escapeHTML(key)}: ${escapeHTML(value)}</code>`),
    '</div>',
    '</section>'
  ].join('');
}
