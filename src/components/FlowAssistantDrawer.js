import { createLocalIntentMapper } from '../intent-mapper.js';
import { flowToPlan } from '../flow-to-plan.js';
import { createMemoryFlowStore } from '../flow-store.js';
import { createElement, escapeHTML, on } from './dom.js';
import { renderFlowPreviewToHTML } from './FlowPreview.js';
import { renderFlowRunPanelToHTML } from './FlowRunPanel.js';

export function FlowAssistantDrawer(options = {}) {
  const trigger = typeof options.trigger === 'string'
    ? document.querySelector(options.trigger)
    : options.trigger;
  const flowStore = options.flowStore ?? createMemoryFlowStore(options.flows ?? []);
  const intentMapper = options.intentMapper ?? createLocalIntentMapper();
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
    const flows = await flowStore.list();
    const matchResult = intentMapper.match(state.prompt, flows);
    state.match = matchResult.best;
    state.preview = null;
    state.result = null;
    state.error = matchResult.best ? '' : 'No published flow matched this intent.';
    render();
    return state.match;
  };

  const previewMatch = async () => {
    if (!options.runtime) {
      state.error = 'PIVOT runtime is required.';
      render();
      return null;
    }

    const match = state.match ?? await matchPrompt();
    if (!match) {
      return null;
    }

    const context = await resolveContext(options.contextProvider);
    const plan = flowToPlan(match.flow, {
      prompt: state.prompt,
      slots: match.slots
    }, context);
    state.preview = await options.runtime.previewPlan(plan, context);
    state.result = null;
    state.error = '';
    render();
    return { match, plan, context };
  };

  const executeMatch = async () => {
    const prepared = await previewMatch();
    if (!prepared) {
      return;
    }

    if (!state.preview?.ok) {
      state.result = state.preview;
      render();
      return;
    }

    state.result = await options.runtime.executePlan(prepared.plan, prepared.context);
    if (typeof flowStore.recordRun === 'function') {
      await flowStore.recordRun({
        flowId: prepared.match.flow.id,
        prompt: state.prompt,
        ok: state.result.ok,
        message: state.result.message
      });
    }
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

async function resolveContext(contextProvider) {
  if (typeof contextProvider === 'function') {
    return await contextProvider();
  }
  return {};
}
