import { flowToPlan } from '../flow-to-plan.js';
import { validateFlow } from '../flow-validation.js';
import { FLOW_RISK_LEVELS, FLOW_STATUS } from '../node-types.js';
import { escapeAttr, escapeHTML, on, resolveTarget, setHTML } from './dom.js';
import { renderFlowCanvasToHTML } from './FlowCanvas.js';
import { renderIntentPatternEditorToHTML } from './IntentPatternEditor.js';
import { renderNodeInspectorToHTML } from './NodeInspector.js';
import { renderNodePaletteToHTML } from './NodePalette.js';
import { renderVariableMapperToHTML } from './VariableMapper.js';

export function renderFlowDesignerToHTML(flow, state = {}) {
  if (!flow) {
    return '<div class="flow-empty">Select a flow to open the designer.</div>';
  }

  const selectedNode = getSelectedNode(flow, state.selectedNodeId);
  const validation = validateFlow(flow);

  return [
    '<section class="flow-designer">',
    '<aside class="flow-designer__palette">',
    renderNodePaletteToHTML(),
    '</aside>',
    '<main class="flow-designer__main">',
    '<div class="flow-designer__toolbar">',
    '<div>',
    `<div class="flow-panel-title">${escapeHTML(flow.name)}</div>`,
    `<div class="flow-muted">${escapeHTML(flow.description || flow.id)}</div>`,
    '</div>',
    '<div class="flow-designer__actions">',
    '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-action="save-flow">Save</button>',
    '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-action="preview">Preview</button>',
    '<button type="button" class="ds-btn ds-btn--brand ds-btn--sm" data-flow-action="execute">Execute</button>',
    '</div>',
    '</div>',
    validation.valid ? '' : `<div class="flow-alert flow-alert--error">${escapeHTML(validation.errors.join('; '))}</div>`,
    renderFlowSettingsToHTML(flow),
    renderFlowCanvasToHTML(flow, state),
    '</main>',
    '<aside class="flow-designer__inspector">',
    renderNodeInspectorToHTML(selectedNode, { editable: true }),
    renderVariableMapperToHTML(),
    renderIntentPatternEditorToHTML(flow),
    '</aside>',
    '</section>'
  ].join('');
}

export function renderFlowSettingsToHTML(flow) {
  return [
    '<section class="flow-settings">',
    '<div class="flow-settings__grid">',
    renderInput('Name', 'name', flow.name),
    renderSelect('Status', 'status', flow.status, Object.values(FLOW_STATUS)),
    renderSelect('Risk', 'risk', flow.risk || 'low', Object.values(FLOW_RISK_LEVELS)),
    renderTextarea('Description', 'description', flow.description || ''),
    renderTextarea('Examples', 'intent.examples', flow.intent?.examples?.join('\n') || ''),
    renderTextarea('Keywords', 'intent.keywords', flow.intent?.keywords?.join('\n') || ''),
    renderTextarea('Patterns', 'intent.patterns', flow.intent?.patterns?.join('\n') || ''),
    '</div>',
    '<div class="flow-settings__actions">',
    '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-action="publish-flow">Publish</button>',
    '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-action="disable-flow">Disable</button>',
    '<button type="button" class="ds-btn ds-btn--ghost ds-btn--sm" data-flow-action="remove-flow">Delete</button>',
    '</div>',
    '</section>'
  ].join('');
}

function renderInput(label, field, value) {
  return [
    '<label class="flow-field">',
    `<span>${escapeHTML(label)}</span>`,
    `<input class="ds-input" data-flow-field="${escapeAttr(field)}" value="${escapeAttr(value)}">`,
    '</label>'
  ].join('');
}

function renderSelect(label, field, value, options) {
  return [
    '<label class="flow-field">',
    `<span>${escapeHTML(label)}</span>`,
    `<select class="ds-select" data-flow-field="${escapeAttr(field)}">`,
    ...options.map((option) => `<option value="${escapeAttr(option)}"${option === value ? ' selected' : ''}>${escapeHTML(option)}</option>`),
    '</select>',
    '</label>'
  ].join('');
}

function renderTextarea(label, field, value) {
  return [
    '<label class="flow-field flow-field--wide">',
    `<span>${escapeHTML(label)}</span>`,
    `<textarea class="ds-textarea" rows="3" data-flow-field="${escapeAttr(field)}">${escapeHTML(value)}</textarea>`,
    '</label>'
  ].join('');
}

export function FlowDesigner(options = {}) {
  const target = resolveTarget(options.target);
  const state = {
    flow: options.flow ?? null,
    selectedNodeId: options.flow?.nodes?.[0]?.id ?? ''
  };

  const render = () => {
    setHTML(target, renderFlowDesignerToHTML(state.flow, state));
  };

  const cleanups = [
    on(target, 'click', '[data-flow-action="select-node"]', (e, el) => {
      state.selectedNodeId = el.dataset.nodeId;
      render();
    }),
    on(target, 'click', '[data-flow-action="preview"]', () => {
      if (!state.flow || typeof options.onPreview !== 'function') {
        return;
      }
      options.onPreview(flowToPlan(state.flow, options.input ?? {}, options.context ?? {}));
    })
  ];

  render();

  return {
    element: target,
    update(nextFlow) {
      state.flow = nextFlow;
      state.selectedNodeId = nextFlow?.nodes?.[0]?.id ?? '';
      render();
    },
    destroy() {
      cleanups.forEach((cleanup) => cleanup());
      target.innerHTML = '';
    }
  };
}

function getSelectedNode(flow, selectedNodeId) {
  return flow?.nodes?.find((node) => node.id === selectedNodeId) ?? flow?.nodes?.[0] ?? null;
}
