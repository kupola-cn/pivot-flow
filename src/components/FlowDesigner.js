import { flowToPlan } from '../flow-to-plan.js';
import { validateFlow } from '../flow-validation.js';
import { escapeHTML, on, resolveTarget, setHTML } from './dom.js';
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
    '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-action="preview">Preview</button>',
    '<button type="button" class="ds-btn ds-btn--brand ds-btn--sm" data-flow-action="execute">Execute</button>',
    '</div>',
    '</div>',
    validation.valid ? '' : `<div class="flow-alert flow-alert--error">${escapeHTML(validation.errors.join('; '))}</div>`,
    renderFlowCanvasToHTML(flow, state),
    '</main>',
    '<aside class="flow-designer__inspector">',
    renderNodeInspectorToHTML(selectedNode),
    renderVariableMapperToHTML(),
    renderIntentPatternEditorToHTML(flow),
    '</aside>',
    '</section>'
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
