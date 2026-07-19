import { createLocalIntentMapper } from '../intent-mapper.js';
import { createMemoryFlowStore } from '../flow-store.js';
import { createFlowRunner } from '../flow-runner.js';
import { createElement, escapeHTML, on } from './dom.js';
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
      contextProvider: options.contextProvider
    })
    : null;
  const state = {
    open: false,
    prompt: '',
    match: null,
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
    state.preview = null;
    state.result = null;
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
      match: state.match
    });
    state.match = previewResult.match;
    state.preview = previewResult.preview ?? null;
    state.result = null;
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

    const execution = await runner.execute(state.prompt, {
      match: state.match
    });
    state.match = execution.match;
    state.preview = execution.preview ?? null;
    state.result = execution.result ?? execution.preview ?? null;
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
