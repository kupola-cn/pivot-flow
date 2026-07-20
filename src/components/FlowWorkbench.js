import { cloneFlow, createFlowNode } from '../flow-schema.js';
import { flowToPlan } from '../flow-to-plan.js';
import { canConnectFlowNodes, getFlowNodePorts } from '../flow-validation.js';
import { createDefaultFlowWorkbenchNodeTypes, getDefaultCapabilityForNodeType } from '../node-types.js';
import { escapeAttr, escapeHTML, resolveTarget, setHTML } from './dom.js';

const DEFAULT_NODE_WIDTH = 238;
const DEFAULT_NODE_HEIGHT = 132;
const DEFAULT_BOARD_WIDTH = 2200;
const DEFAULT_BOARD_HEIGHT = 1400;
const PALETTE_GROUP_ORDER = ['extension', 'workflow', 'business', 'input-output', 'database', 'output', 'custom'];
const PALETTE_GROUP_KEY_MAP = Object.freeze({
  capability: 'extension',
  custom: 'extension',
  flow: 'workflow',
  control: 'business',
  human: 'business',
  input: 'input-output',
  feedback: 'input-output',
  output: 'output',
  data: 'database'
});
const PALETTE_GROUP_LABELS_EN = Object.freeze({
  extension: 'Extensions',
  workflow: 'Workflow',
  business: 'Business logic',
  'input-output': 'Input & output',
  database: 'Database',
  output: 'Output',
  custom: 'Custom'
});
const PALETTE_GROUP_LABELS_ZH = Object.freeze({
  extension: '插件',
  workflow: '工作流',
  business: '业务逻辑',
  'input-output': '输入&输出',
  database: '数据库',
  output: '输出',
  custom: '自定义'
});
const NODE_ICON_CLASS_MAP = Object.freeze({
  'intent.input': 'parameter',
  'param.extract': 'parameter',
  'param.validate': 'confirm',
  'param.normalize': 'transform',
  'api.call': 'capability',
  'capability.run': 'capability',
  'capability.call': 'capability',
  'data.query': 'query',
  'data.get': 'query',
  'data.aggregate': 'transform',
  'data.create': 'create',
  'data.update': 'update',
  'data.delete': 'delete',
  'data.filter': 'condition',
  'data.sort': 'transform',
  'data.map': 'transform',
  'data.merge': 'subflow',
  'data.pick': 'select',
  'data.dedupe': 'transform',
  condition: 'condition',
  switch: 'condition',
  confirm: 'confirm',
  transform: 'transform',
  loop: 'loop',
  'human.input': 'form',
  'human.select': 'select',
  'ui.display': 'display',
  'output.message': 'message',
  'output.result': 'output',
  'output.table': 'display',
  'output.detail': 'display',
  'output.options': 'select',
  'output.return': 'output',
  'subflow.run': 'subflow',
  'message.show': 'message',
  'route.navigate': 'navigate',
  'table.refresh': 'refresh',
  'form.open': 'form',
  'drawer.open': 'drawer',
  'modal.open': 'modal',
  'audit.mark': 'audit'
});

export function FlowWorkbench(options = {}) {
  const target = resolveTarget(options.target);
  const state = createWorkbenchState(options);
  const api = createWorkbenchApi(state, options);
  const cleanups = [];

  const render = () => {
    setHTML(target, renderFlowWorkbenchToHTML(state, options));
    refreshCanvasEdges(target, state);
  };

  const refresh = (nextFlow) => {
    if (nextFlow) {
      state.flow = cloneFlow(nextFlow);
      state.selectedNodeId = '';
      state.connectionDraft = null;
      state.draggingNodeId = '';
    }
    render();
  };

  const handleClick = async (event) => {
    const button = event.target.closest('button');
    if (button) {
      event.preventDefault();
    }
    if (event.target.closest('.flow-workbench__port')) {
      return;
    }

    const promptButton = event.target.closest('[data-flow-workbench-prompt]');
    if (promptButton) {
      state.prompt = promptButton.dataset.flowWorkbenchPrompt || state.prompt;
      render();
      return;
    }

    const actionEl = event.target.closest('[data-flow-workbench-action]');
    if (!actionEl || !target.contains(actionEl)) {
      if (state.zoomMenuOpen && !event.target.closest('.flow-workbench__zoom-menu')) {
        state.zoomMenuOpen = false;
        render();
      }
      return;
    }

    const action = actionEl.dataset.flowWorkbenchAction;
    if (action !== 'toggle-zoom-menu' && action !== 'set-zoom') {
      state.zoomMenuOpen = false;
    }
    if (action === 'select-node') {
      state.selectedNodeId = actionEl.dataset.nodeId || state.selectedNodeId;
      state.paletteOpen = false;
    } else if (action === 'toggle-palette') {
      state.paletteOpen = !state.paletteOpen;
      if (state.paletteOpen) {
        state.selectedNodeId = '';
      }
    } else if (action === 'toggle-result') {
      state.resultOpen = !state.resultOpen;
    } else if (action === 'close-inspector') {
      state.selectedNodeId = '';
    } else if (action === 'zoom-in') {
      updateZoom(state, state.zoom + 0.1);
    } else if (action === 'zoom-out') {
      updateZoom(state, state.zoom - 0.1);
    } else if (action === 'reset-viewport') {
      state.pan = { x: 0, y: 0 };
      state.zoom = 1;
    } else if (action === 'toggle-zoom-menu') {
      state.zoomMenuOpen = !state.zoomMenuOpen;
    } else if (action === 'set-zoom') {
      updateZoom(state, actionEl.dataset.zoom);
      state.zoomMenuOpen = false;
    } else if (action === 'add-node') {
      addNode(state, options, actionEl.dataset.nodeTemplate || actionEl.dataset.nodeType);
      state.paletteOpen = false;
    } else if (action === 'remove-node') {
      removeSelectedNode(state, api);
    } else if (action === 'copy-node') {
      copyNode(state, api, actionEl.dataset.nodeId);
      state.paletteOpen = false;
    } else if (action === 'remove-node-by-id') {
      removeNode(state, api, actionEl.dataset.nodeId);
    } else if (action === 'show-node-help') {
      state.helpNodeId = actionEl.dataset.nodeId || '';
    } else if (action === 'close-node-help') {
      state.helpNodeId = '';
    } else if (action === 'reset') {
      state.flow = cloneFlow(options.flow);
      state.selectedNodeId = '';
      state.connectionDraft = null;
      state.draggingNodeId = '';
      state.helpNodeId = '';
      state.paletteQuery = '';
      state.zoomMenuOpen = false;
      state.pan = createPoint(options.pan, { x: 0, y: 0 });
      state.zoom = normalizeZoom(options.zoom);
      api.writeLog('ready', options.resetMessage || 'Flow was reset.');
    } else if (action === 'preview') {
      await runFlow(state, options, api, { execute: false });
    } else if (action === 'execute') {
      await runFlow(state, options, api, { execute: true });
    }

    render();
  };

  const handleInput = (event) => {
    const input = event.target;
    if (input.dataset.flowWorkbenchPaletteSearch !== undefined) {
      state.paletteQuery = input.value;
      render();
      restorePaletteSearchFocus(target, state.paletteQuery);
    } else if (input.dataset.flowWorkbenchPromptInput !== undefined) {
      state.prompt = input.value;
    } else if (input.dataset.flowWorkbenchField) {
      const node = updateSelectedNode(state, input.dataset.flowWorkbenchField, input.value);
      if (node) {
        refreshNodePreview(target, state, options, node);
        refreshCanvasEdges(target, state);
      }
    }
  };

  const handleChange = (event) => {
    const input = event.target;
    if (input.dataset.flowWorkbenchConnectTo) {
      connectNodes(state, api, state.selectedNodeId, input.value, getDefaultConnectionPorts(state, state.selectedNodeId, input.value));
      render();
    } else if (input.dataset.flowWorkbenchZoom !== undefined) {
      updateZoom(state, input.value);
      render();
    } else if (input.dataset.flowWorkbenchField) {
      const node = updateSelectedNode(state, input.dataset.flowWorkbenchField, input.value);
      if (node) {
        refreshNodePreview(target, state, options, node);
        refreshCanvasEdges(target, state);
      }
    }
  };

  const handlePointerDown = (event) => {
    const port = event.target.closest('.flow-workbench__port');
    if (port) {
      startPortConnection(event, target, state, api, render, port);
      return;
    }

    const nodeEl = event.target.closest('.flow-workbench__node');
    if (nodeEl) {
      startNodeDrag(event, target, state, render, nodeEl);
      return;
    }

    const canvasEl = event.target.closest('.flow-workbench__canvas');
    if (canvasEl) {
      startCanvasPan(event, state, render, canvasEl);
    }
  };

  const handlePaletteTooltipShow = (event) => {
    const item = event.target.closest?.('[data-flow-workbench-palette-description]');
    if (!item || !target.contains(item)) {
      return;
    }
    showPaletteTooltip(target, item);
  };

  const handlePaletteTooltipHide = (event) => {
    const item = event.target.closest?.('[data-flow-workbench-palette-description]');
    if (item && item.contains?.(event.relatedTarget)) {
      return;
    }
    hidePaletteTooltip(target);
  };

  target.addEventListener('click', handleClick);
  target.addEventListener('input', handleInput);
  target.addEventListener('change', handleChange);
  target.addEventListener('pointerdown', handlePointerDown);
  target.addEventListener('pointerover', handlePaletteTooltipShow);
  target.addEventListener('pointerout', handlePaletteTooltipHide);
  target.addEventListener('focusin', handlePaletteTooltipShow);
  target.addEventListener('focusout', handlePaletteTooltipHide);
  cleanups.push(
    () => target.removeEventListener('click', handleClick),
    () => target.removeEventListener('input', handleInput),
    () => target.removeEventListener('change', handleChange),
    () => target.removeEventListener('pointerdown', handlePointerDown),
    () => target.removeEventListener('pointerover', handlePaletteTooltipShow),
    () => target.removeEventListener('pointerout', handlePaletteTooltipHide),
    () => target.removeEventListener('focusin', handlePaletteTooltipShow),
    () => target.removeEventListener('focusout', handlePaletteTooltipHide)
  );

  api.writeLog('ready', options.readyMessage || 'Flow workbench is ready.');
  render();

  return {
    element: target,
    getFlow: () => cloneFlow(state.flow),
    update: refresh,
    refresh,
    destroy() {
      cleanups.forEach((cleanup) => cleanup());
      target.innerHTML = '';
    }
  };
}

export function renderFlowWorkbenchToHTML(state, options = {}) {
  const labels = createLabels(options.labels);
  const showHeaderText = options.showHeaderText !== false;
  return [
    `<section class="flow-workbench${state.resultOpen ? ' is-result-open' : ''}">`,
    renderCanvas(state, options),
    `<header class="flow-workbench__topbar${showHeaderText ? '' : ' flow-workbench__topbar--actions-only'}">`,
    showHeaderText ? [
      '<div class="flow-workbench__title">',
    `<h2>${escapeHTML(options.title || state.flow.name || labels.title)}</h2>`,
    `<p>${escapeHTML(options.description || state.flow.description || '')}</p>`,
      '</div>'
    ].join('') : '',
    '<div class="flow-workbench__actions">',
    renderToolbarButton('toggle-palette', labels.components, 'secondary', { icon: 'components' }),
    renderToolbarButton('reset', labels.reset, 'secondary', { icon: 'reset' }),
    renderToolbarButton('preview', labels.preview, 'secondary', { icon: 'preview' }),
    renderToolbarButton('execute', labels.execute, 'brand', { icon: 'execute' }),
    '</div>',
    '</header>',
    renderCanvasToolbar(state, options, labels),
    renderWorkbenchStatus(state, labels),
    state.paletteOpen && !state.selectedNodeId ? [
      '<aside class="flow-workbench__palette">',
    renderPalette(state, options, labels),
    '</aside>',
    ].join('') : '',
    state.selectedNodeId ? [
      '<aside class="flow-workbench__inspector">',
    `<div class="flow-workbench__panel-title">${escapeHTML(labels.inspector)}</div>`,
    '<button type="button" class="flow-workbench__panel-close" data-flow-workbench-action="close-inspector" aria-label="Close inspector">×</button>',
    '<div class="flow-workbench__inspector-body">',
    renderInspector(state, labels),
    '</div>',
    '</aside>',
    ].join('') : '',
    '<button type="button" class="flow-workbench__result-toggle ds-btn ds-btn--secondary ds-btn--sm" data-flow-workbench-action="toggle-result">',
    '<span class="flow-workbench__button-icon flow-workbench__button-icon--result" aria-hidden="true"></span>',
    `<span>${escapeHTML(labels.result)}</span>`,
    '</button>',
    state.resultOpen ? [
      '<section class="flow-workbench__result">',
    `<div class="flow-workbench__result-body">${state.resultHTML}</div>`,
    `<div class="flow-workbench__log">${state.logs.map(renderLogEntry).join('')}</div>`,
    '</section>',
    ].join('') : '',
    state.paletteOpen && !state.selectedNodeId ? '<div class="flow-workbench__palette-tooltip" role="tooltip" hidden></div>' : '',
    renderNodeHelpModal(state, options, labels),
    '</section>'
  ].join('');
}

function createWorkbenchState(options) {
  const flow = cloneFlow(options.flow);
  return {
    flow,
    selectedNodeId: options.selectedNodeId || '',
    prompt: options.prompt || flow.intent?.examples?.[0] || flow.name || '',
    resultHTML: options.emptyResultHTML || '<div class="flow-workbench__empty">Run the flow to show output.</div>',
    logs: [],
    paletteOpen: Boolean(options.paletteOpen),
    paletteQuery: options.paletteQuery || '',
    resultOpen: Boolean(options.resultOpen),
    helpNodeId: options.helpNodeId || '',
    zoomMenuOpen: Boolean(options.zoomMenuOpen),
    pan: createPoint(options.pan, { x: 0, y: 0 }),
    zoom: normalizeZoom(options.zoom),
    connectionDraft: null,
    connectingFrom: '',
    draggingNodeId: '',
    dragOffset: null
  };
}

function createWorkbenchApi(state, options) {
  return {
    getState: () => state,
    getFlow: () => state.flow,
    setResultHTML(html) {
      state.resultHTML = html || '';
      state.resultOpen = true;
    },
    writeLog(type, message) {
      state.logs = [{
        type,
        message,
        time: new Date().toLocaleTimeString(options.locale || 'zh-CN', { hour12: false })
      }, ...state.logs].slice(0, options.maxLogs || 12);
    },
    escapeHTML
  };
}

function renderToolbarButton(action, label, variant, options = {}) {
  const icon = options.icon
    ? `<span class="flow-workbench__button-icon flow-workbench__button-icon--${escapeAttr(options.icon)}" aria-hidden="true"></span>`
    : '';
  return [
    `<button type="button" class="ds-btn ds-btn--${escapeAttr(variant)} ds-btn--sm flow-workbench__toolbar-button" data-flow-workbench-action="${escapeAttr(action)}">`,
    icon,
    `<span>${escapeHTML(label)}</span>`,
    '</button>'
  ].join('');
}

function renderPalette(state, options, labels) {
  const query = String(state.paletteQuery || '').trim().toLowerCase();
  const groups = groupPaletteItems(
    getWorkbenchNodeTypes(options)
      .map(normalizePaletteItem)
      .filter((item) => matchesPaletteQuery(item, query))
  );

  return [
    '<div class="flow-workbench__palette-search">',
    '<label class="flow-workbench__palette-search-field">',
    `<span class="flow-workbench__visually-hidden">${escapeHTML(labels.palette)}</span>`,
    `<input class="ds-input ds-input--sm flow-workbench__palette-search-input" data-flow-workbench-palette-search placeholder="${escapeAttr(getPaletteSearchPlaceholder(options, labels))}" value="${escapeAttr(state.paletteQuery || '')}">`,
    '</label>',
    '</div>',
    '<div class="flow-workbench__node-list flow-workbench__palette-list">',
    groups.length ? groups.map((group) => [
      '<section class="flow-workbench__palette-group">',
      `<div class="flow-workbench__palette-group-title">${escapeHTML(getPaletteGroupLabel(group.key, options))}</div>`,
      '<div class="flow-workbench__palette-grid">',
      group.items.map((item) => renderPaletteItem(item)).join(''),
      '</div>',
      '</section>'
    ].join('')).join('') : `<div class="flow-workbench__empty">${escapeHTML(getPaletteEmptyMessage(options, labels))}</div>`,
    '</div>'
  ].join('');
}

function renderPaletteItem(item) {
  return [
    `<button type="button" class="flow-workbench__palette-item flow-workbench__palette-item--${escapeAttr(item.groupKey)}" `,
    `data-flow-workbench-action="add-node" data-node-template="${escapeAttr(item.template)}" data-node-type="${escapeAttr(item.type)}" `,
    `data-flow-workbench-palette-description="${escapeAttr(item.description)}" aria-label="${escapeAttr(item.description ? `${item.label}: ${item.description}` : item.label)}">`,
    '<span class="flow-workbench__palette-item-icon" aria-hidden="true">',
    `<span class="flow-workbench__node-icon flow-workbench__node-icon--${escapeAttr(item.iconClass)}"></span>`,
    '</span>',
    `<span class="flow-workbench__palette-item-label">${escapeHTML(item.label)}</span>`,
    '</button>'
  ].join('');
}

function normalizePaletteItem(item) {
  const template = item.id || item.key || item.type || item[0];
  const type = item.type || item[0];
  const label = item.label || item[1] || type;
  const description = item.description || item[2] || '';
  const group = item.group || 'custom';
  const groupKey = getPaletteGroupKey(group);
  return {
    template,
    type,
    label,
    description,
    group,
    groupKey,
    iconClass: getNodeIconClass(type)
  };
}

function matchesPaletteQuery(item, query) {
  if (!query) {
    return true;
  }
  return [item.template, item.type, item.label, item.description, item.group, item.groupKey]
    .some((value) => String(value || '').toLowerCase().includes(query));
}

function groupPaletteItems(items) {
  const byGroup = new Map();
  items.forEach((item) => {
    if (!byGroup.has(item.groupKey)) {
      byGroup.set(item.groupKey, []);
    }
    byGroup.get(item.groupKey).push(item);
  });
  return Array.from(byGroup.entries())
    .sort(([a], [b]) => getPaletteGroupOrder(a) - getPaletteGroupOrder(b) || a.localeCompare(b))
    .map(([key, groupItems]) => ({ key, items: groupItems }));
}

function getPaletteGroupKey(group) {
  const key = String(group || 'custom').trim().toLowerCase();
  return PALETTE_GROUP_KEY_MAP[key] || key || 'custom';
}

function getPaletteGroupOrder(groupKey) {
  const index = PALETTE_GROUP_ORDER.indexOf(groupKey);
  return index === -1 ? PALETTE_GROUP_ORDER.length : index;
}

function getPaletteGroupLabel(groupKey, options) {
  const customLabel = options.paletteGroupLabels?.[groupKey];
  if (customLabel) {
    return customLabel;
  }
  const labels = isChineseLocale(options.locale) ? PALETTE_GROUP_LABELS_ZH : PALETTE_GROUP_LABELS_EN;
  return labels[groupKey] || groupKey;
}

function getPaletteSearchPlaceholder(options, labels) {
  if (labels.paletteSearch) {
    return labels.paletteSearch;
  }
  return isChineseLocale(options.locale) ? '搜索节点、插件、工作流' : 'Search nodes, plugins, workflows';
}

function getPaletteEmptyMessage(options, labels) {
  if (labels.paletteEmpty) {
    return labels.paletteEmpty;
  }
  return isChineseLocale(options.locale) ? '没有匹配的节点。' : 'No matching nodes.';
}

function renderCanvasToolbar(state, options, labels) {
  return [
    '<div class="flow-workbench__canvas-toolbar">',
    '<label class="flow-workbench__prompt">',
    `<span>${escapeHTML(labels.prompt)}</span>`,
    `<input class="ds-input ds-input--sm" data-flow-workbench-prompt-input value="${escapeAttr(state.prompt)}">`,
    '</label>',
    '<div class="flow-workbench__quick-prompts">',
    (options.quickPrompts || []).map((prompt) => [
      '<button type="button" class="ds-btn ds-btn--ghost ds-btn--sm" ',
      `data-flow-workbench-prompt="${escapeAttr(prompt.value || prompt)}">`,
      escapeHTML(prompt.label || prompt),
      '</button>'
    ].join('')).join(''),
    '</div>',
    '</div>',
    '<div class="flow-workbench__zoom-toolbar">',
    '<div class="flow-workbench__zoom-controls">',
    renderToolbarButton('zoom-out', '-', 'secondary'),
    renderZoomMenu(state),
    renderToolbarButton('zoom-in', '+', 'secondary'),
    renderToolbarButton('reset-viewport', labels.fit, 'secondary'),
    '</div>',
    '</div>'
  ].join('');
}

function renderWorkbenchStatus(state, labels) {
  const status = state.connectionDraft ? 'connecting' : 'ready';
  const label = state.connectionDraft ? labels.connecting : labels.ready;
  return [
    `<div class="flow-workbench__status flow-workbench__status--${escapeAttr(status)}" role="status">`,
    '<span class="flow-workbench__status-dot" aria-hidden="true"></span>',
    `<span>${escapeHTML(label)}</span>`,
    '</div>'
  ].join('');
}

function renderZoomOptions(currentZoom) {
  const levels = [0.5, 0.75, 1, 1.1, 1.25, 1.5, 2];
  if (!levels.some((zoom) => Math.abs(currentZoom - zoom) < 0.001)) {
    levels.push(currentZoom);
    levels.sort((a, b) => a - b);
  }
  return levels;
}

function renderZoomMenu(state) {
  const levels = renderZoomOptions(state.zoom);
  const currentLabel = `${Math.round(state.zoom * 100)}%`;
  return [
    '<div class="flow-workbench__zoom-menu">',
    '<button type="button" class="flow-workbench__zoom-select flow-workbench__zoom-trigger" ',
    `data-flow-workbench-action="toggle-zoom-menu" aria-haspopup="listbox" aria-expanded="${state.zoomMenuOpen ? 'true' : 'false'}">`,
    '<span class="flow-workbench__button-icon flow-workbench__button-icon--zoom" aria-hidden="true"></span>',
    `<span>${escapeHTML(currentLabel)}</span>`,
    '<span class="flow-workbench__button-icon flow-workbench__button-icon--chevron" aria-hidden="true"></span>',
    '</button>',
    state.zoomMenuOpen ? [
      '<div class="flow-workbench__zoom-options" role="listbox" aria-label="Zoom">',
      levels.map((zoom) => {
        const selected = Math.abs(state.zoom - zoom) < 0.001;
        return [
          '<button type="button" ',
          `class="flow-workbench__zoom-option${selected ? ' is-selected' : ''}" `,
          `data-flow-workbench-action="set-zoom" data-zoom="${escapeAttr(zoom)}" `,
          `role="option" aria-selected="${selected ? 'true' : 'false'}">`,
          `${Math.round(zoom * 100)}%`,
          '</button>'
        ].join('');
      }).join(''),
      '</div>'
    ].join('') : '',
    '</div>'
  ].join('');
}

function restorePaletteSearchFocus(target, value) {
  const input = target.querySelector?.('[data-flow-workbench-palette-search]');
  if (!input) {
    return;
  }
  input.focus?.();
  const position = String(value || '').length;
  try {
    input.setSelectionRange?.(position, position);
  } catch {
    // Some input implementations do not support selection APIs.
  }
}

function showPaletteTooltip(target, item) {
  const description = item.dataset.flowWorkbenchPaletteDescription || '';
  const tooltip = target.querySelector?.('.flow-workbench__palette-tooltip');
  if (!tooltip || !description) {
    return;
  }
  tooltip.textContent = description;
  tooltip.hidden = false;
  positionPaletteTooltip(tooltip, item);
}

function hidePaletteTooltip(target) {
  const tooltip = target.querySelector?.('.flow-workbench__palette-tooltip');
  if (tooltip) {
    tooltip.hidden = true;
  }
}

function positionPaletteTooltip(tooltip, item) {
  const rect = item.getBoundingClientRect?.();
  if (!rect) {
    return;
  }
  const gap = 12;
  const viewportWidth = globalThis.window?.innerWidth || 0;
  const placeRight = viewportWidth > 0 && rect.left < 300 && rect.right + 300 < viewportWidth;
  tooltip.style.top = `${rect.top + rect.height / 2}px`;
  if (placeRight) {
    tooltip.style.left = `${rect.right + gap}px`;
    tooltip.style.transform = 'translateY(-50%)';
  } else {
    tooltip.style.left = `${Math.max(gap, rect.left - gap)}px`;
    tooltip.style.transform = 'translate(-100%, -50%)';
  }
}

function renderCanvas(state, options) {
  const { width, height } = getBoardSize(state);
  const transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
  const edges = state.flow.edges.map((edge) => renderEdge(state, edge)).join('');
  const draftEdge = renderDraftEdge(state);
  const nodes = state.flow.nodes.map((node) => renderNode(state, options, node)).join('');

  return [
    '<section class="flow-workbench__canvas" aria-label="Flow canvas">',
    `<div class="flow-workbench__board" style="width:${width}px;height:${height}px;transform:${escapeAttr(transform)}">`,
    `<svg class="flow-workbench__edges" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    edges,
    draftEdge,
    '</svg>',
    nodes,
    '</div>',
    '</section>'
  ].join('');
}

function renderEdge(state, edge, nodeSizes = new Map()) {
  const from = getNode(state, edge.from);
  const to = getNode(state, edge.to);
  if (!from || !to) {
    return '';
  }
  const a = from.ui?.position || { x: 0, y: 0 };
  const b = to.ui?.position || { x: 0, y: 0 };
  const fromPoint = getOutputPortPoint(a, nodeSizes.get(from.id));
  const toPoint = getInputPortPoint(b, nodeSizes.get(to.id));
  return `<path class="flow-workbench__edge" d="${escapeAttr(createEdgePath(fromPoint.x, fromPoint.y, toPoint.x, toPoint.y))}"></path>`;
}

function renderDraftEdge(state, nodeSizes = new Map()) {
  if (!state.connectionDraft) {
    return '';
  }
  const from = getNode(state, state.connectionDraft.from);
  if (!from) {
    return '';
  }
  const position = from.ui?.position || { x: 0, y: 0 };
  const point = state.connectionDraft.point || position;
  const fromPoint = getOutputPortPoint(position, nodeSizes.get(from.id));
  return `<path class="flow-workbench__edge flow-workbench__edge--draft" d="${escapeAttr(createEdgePath(fromPoint.x, fromPoint.y, point.x, point.y))}"></path>`;
}

function getInputPortPoint(position, size = {}) {
  return { x: position.x, y: position.y + getNodeRenderHeight(size) / 2 };
}

function getOutputPortPoint(position, size = {}) {
  return { x: position.x + getNodeRenderWidth(size), y: position.y + getNodeRenderHeight(size) / 2 };
}

function getNodeRenderWidth(size = {}) {
  return Number.isFinite(size.width) && size.width > 0 ? size.width : DEFAULT_NODE_WIDTH;
}

function getNodeRenderHeight(size = {}) {
  return Number.isFinite(size.height) && size.height > 0 ? size.height : DEFAULT_NODE_HEIGHT;
}

function createEdgePath(x1, y1, x2, y2) {
  const mid = Math.max(48, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + mid} ${y1}, ${x2 - mid} ${y2}, ${x2} ${y2}`;
}

function renderNode(state, options, node) {
  const position = node.ui?.position || { x: 80, y: 80 };
  const selected = node.id === state.selectedNodeId ? ' is-selected' : '';
  const dragging = node.id === state.draggingNodeId ? ' is-dragging' : '';
  const ports = getFlowNodePorts(node);
  const inputPort = ports.inputs[0] || { id: 'input', label: 'Input' };
  const outputPort = ports.outputs[0] || { id: 'output', label: 'Output' };
  const iconClass = getNodeIconClass(node.type);
  const rows = renderNodeContentRows(options, node);

  return [
    `<article class="flow-workbench__node${selected}${dragging}" style="left:${position.x}px;top:${position.y}px" data-flow-workbench-action="select-node" data-node-id="${escapeAttr(node.id)}">`,
    `<button type="button" class="flow-workbench__port flow-workbench__port--in" data-node-id="${escapeAttr(node.id)}" data-port-id="${escapeAttr(inputPort.id)}" data-port-kind="input" aria-label="${escapeAttr(`${node.label || node.id} ${inputPort.label || inputPort.id}`)}"></button>`,
    `<button type="button" class="flow-workbench__port flow-workbench__port--out" data-node-id="${escapeAttr(node.id)}" data-port-id="${escapeAttr(outputPort.id)}" data-port-kind="output" aria-label="${escapeAttr(`${node.label || node.id} ${outputPort.label || outputPort.id}`)}"></button>`,
    '<div class="flow-workbench__node-title">',
    '<div class="flow-workbench__node-title-main">',
    `<span class="flow-workbench__node-icon flow-workbench__node-icon--${escapeAttr(iconClass)}" aria-label="${escapeAttr(renderNodeType(options, node.type))}" title="${escapeAttr(renderNodeType(options, node.type))}"></span>`,
    `<strong>${escapeHTML(node.label || node.id)}</strong>`,
    '</div>',
    '<div class="flow-workbench__node-actions">',
    renderNodeActionButton('copy-node', node.id, 'copy', 'Copy node'),
    renderNodeActionButton('remove-node-by-id', node.id, 'delete', 'Delete node', 'x'),
    renderNodeActionButton('show-node-help', node.id, 'help', 'Node help', '?'),
    '</div>',
    '</div>',
    `<div class="flow-workbench__node-content">${rows}</div>`,
    '</article>'
  ].join('');
}

function renderNodeActionButton(action, nodeId, icon, label, glyph = '') {
  return [
    `<button type="button" class="flow-workbench__node-action flow-workbench__node-action--${escapeAttr(icon)}" `,
    `data-flow-workbench-action="${escapeAttr(action)}" data-node-id="${escapeAttr(nodeId)}" `,
    `aria-label="${escapeAttr(label)}" title="${escapeAttr(label)}">`,
    glyph ? `<span class="flow-workbench__node-action-glyph" aria-hidden="true">${escapeHTML(glyph)}</span>` : '',
    '</button>'
  ].join('');
}

function getNodeIconClass(type) {
  return NODE_ICON_CLASS_MAP[type] || 'capability';
}

function renderNodeContentRows(options, node) {
  return getNodeContentRows(options, node).map(([label, value]) => [
    '<div class="flow-workbench__node-row">',
    `<span>${escapeHTML(label)}:</span>`,
    `<strong title="${escapeAttr(value)}">${escapeHTML(value)}</strong>`,
    '</div>'
  ].join('')).join('');
}

function renderNodeHelpModal(state, options, labels) {
  if (!state.helpNodeId) {
    return '';
  }
  const node = getNode(state, state.helpNodeId);
  if (!node) {
    return '';
  }
  const definition = getWorkbenchNodeDefinition(options, node);
  const title = node.label || definition?.nodeLabel || definition?.label || node.id;
  const description = definition?.help || definition?.description || labels.defaultHelpDescription;
  const usageRows = [
    [labels.type || 'Type', renderNodeType(options, node.type)],
    [labels.capability || 'Capability', node.capability || defaultCapability(node.type) || '-'],
    [labels.risk || 'Risk', node.risk || 'low'],
    [labels.params || 'Params JSON', JSON.stringify(node.params || {}, null, 2)]
  ];

  return [
    '<div class="ds-modal-container flow-workbench__help-modal-container is-open" role="presentation">',
    '<button type="button" class="ds-modal-mask is-visible" data-flow-workbench-action="close-node-help" aria-label="Close node help"></button>',
    '<section class="ds-modal flow-workbench__help-modal" role="dialog" aria-modal="true" aria-labelledby="flowWorkbenchNodeHelpTitle">',
    '<header class="ds-modal__header">',
    `<h3 id="flowWorkbenchNodeHelpTitle" class="ds-modal__title">${escapeHTML(title)}</h3>`,
    '<button type="button" class="ds-modal__close" data-flow-workbench-action="close-node-help" aria-label="Close">×</button>',
    '</header>',
    '<div class="ds-modal__body">',
    `<p class="flow-workbench__help-description">${escapeHTML(description)}</p>`,
    '<dl class="flow-workbench__help-list">',
    usageRows.map(([label, value]) => [
      `<dt>${escapeHTML(label)}</dt>`,
      `<dd>${escapeHTML(value)}</dd>`
    ].join('')).join(''),
    '</dl>',
    '</div>',
    '<footer class="ds-modal__footer">',
    '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-workbench-action="close-node-help">Close</button>',
    '</footer>',
    '</section>',
    '</div>'
  ].join('');
}

function renderInspector(state, labels) {
  const node = getNode(state, state.selectedNodeId);
  if (!node) {
    return `<div class="flow-workbench__empty">${escapeHTML(labels.emptyInspector)}</div>`;
  }
  const connectOptions = state.flow.nodes
    .filter((item) => item.id !== node.id)
    .map((item) => `<option value="${escapeAttr(item.id)}">${escapeHTML(item.label || item.id)}</option>`)
    .join('');

  return [
    '<form>',
    renderField(labels.nodeName, 'label', node.label || ''),
    renderField(labels.capability, 'capability', node.capability || ''),
    '<label class="flow-workbench__field">',
    `<span>${escapeHTML(labels.risk)}</span>`,
    `<select class="ds-select ds-select--sm" data-flow-workbench-field="risk">${['low', 'medium', 'high', 'critical'].map((risk) => `<option value="${risk}"${risk === (node.risk || 'low') ? ' selected' : ''}>${risk}</option>`).join('')}</select>`,
    '</label>',
    '<label class="flow-workbench__field">',
    `<span>${escapeHTML(labels.params)}</span>`,
    `<textarea class="ds-textarea" data-flow-workbench-field="params">${escapeHTML(JSON.stringify(node.params || {}, null, 2))}</textarea>`,
    '</label>',
    '<label class="flow-workbench__field">',
    `<span>${escapeHTML(labels.connectTo)}</span>`,
    `<select class="ds-select ds-select--sm" data-flow-workbench-connect-to><option value="">${escapeHTML(labels.selectTarget)}</option>${connectOptions}</select>`,
    '</label>',
    '<button type="button" class="ds-btn ds-btn--ghost ds-btn--sm" data-flow-workbench-action="remove-node">',
    escapeHTML(labels.deleteNode),
    '</button>',
    `<p class="flow-workbench__hint">${escapeHTML(labels.summary(state.flow.nodes.length, state.flow.edges.length))}</p>`,
    '</form>'
  ].join('');
}

function renderField(label, field, value) {
  return [
    '<label class="flow-workbench__field">',
    `<span>${escapeHTML(label)}</span>`,
    `<input class="ds-input ds-input--sm" data-flow-workbench-field="${escapeAttr(field)}" value="${escapeAttr(value)}">`,
    '</label>'
  ].join('');
}

function renderLogEntry(entry) {
  return [
    '<div class="flow-workbench__log-entry">',
    `<strong>${escapeHTML(entry.type)} · ${escapeHTML(entry.time)}</strong>`,
    `<small>${escapeHTML(entry.message)}</small>`,
    '</div>'
  ].join('');
}

function addNode(state, options, type) {
  if (!type) {
    return;
  }
  const definition = getWorkbenchNodeTypes(options)
    .find((item) => (item.id || item.key || item.type || item[0]) === type || (item.type || item[0]) === type)
    || {};
  const nodeType = definition.type || definition[0] || type;
  const node = createFlowNode({
    type: nodeType,
    label: definition.nodeLabel || definition.label || renderNodeType(options, nodeType),
    capability: definition.capability || defaultCapability(nodeType),
    resource: definition.resource || '',
    action: definition.action || '',
    risk: definition.risk || 'low',
    requiresConfirmation: Boolean(definition.requiresConfirmation),
    condition: clonePlain(definition.condition ?? null),
    control: clonePlain(definition.control || {}),
    params: clonePlain(definition.params || definition.defaultParams || defaultParams(nodeType)),
    inputSchema: clonePlain(definition.inputSchema || {}),
    outputSchema: clonePlain(definition.outputSchema || {}),
    ports: clonePlain(definition.ports || {}),
    ui: { position: nextNodePosition(state) }
  });
  state.flow.nodes = [...state.flow.nodes, node];
  state.selectedNodeId = node.id;
}

function getWorkbenchNodeTypes(options) {
  return options.nodeTypes?.length
    ? options.nodeTypes
    : createDefaultFlowWorkbenchNodeTypes({ locale: options.locale });
}

function clonePlain(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function removeSelectedNode(state, api) {
  const id = state.selectedNodeId;
  if (!id) {
    return;
  }
  removeNode(state, api, id);
}

function removeNode(state, api, id) {
  if (!id || !getNode(state, id)) {
    return;
  }
  state.flow.nodes = state.flow.nodes.filter((node) => node.id !== id);
  state.flow.edges = state.flow.edges.filter((edge) => edge.from !== id && edge.to !== id);
  state.selectedNodeId = state.selectedNodeId === id ? state.flow.nodes[0]?.id || '' : state.selectedNodeId;
  state.helpNodeId = state.helpNodeId === id ? '' : state.helpNodeId;
  api.writeLog('node.remove', `Removed node: ${id}`);
}

function copyNode(state, api, id) {
  const source = getNode(state, id);
  if (!source) {
    return;
  }
  const copy = clonePlain(source);
  copy.id = createCopiedNodeId(state, source.id);
  copy.ui = copy.ui || {};
  const position = source.ui?.position || { x: 80, y: 80 };
  copy.ui.position = clampNodePosition({
    x: position.x + 36,
    y: position.y + 36
  });
  state.flow.nodes = [...state.flow.nodes, copy];
  state.selectedNodeId = copy.id;
  state.helpNodeId = '';
  api.writeLog('node.copy', `Copied node: ${source.id}`);
}

function createCopiedNodeId(state, sourceId) {
  const base = `${sourceId}-copy`;
  const ids = new Set(state.flow.nodes.map((node) => node.id));
  if (!ids.has(base)) {
    return base;
  }
  let index = 2;
  while (ids.has(`${base}-${index}`)) {
    index += 1;
  }
  return `${base}-${index}`;
}

function updateSelectedNode(state, field, value) {
  const node = getNode(state, state.selectedNodeId);
  if (!node) {
    return null;
  }
  if (field === 'params') {
    try {
      node.params = JSON.parse(value || '{}');
    } catch {
      return null;
    }
  } else {
    node[field] = value;
  }
  return node;
}

async function runFlow(state, options, api, { execute }) {
  if (typeof options.runtimeFactory !== 'function') {
    api.writeLog('runtime.missing', 'runtimeFactory is required.');
    return;
  }
  const runtime = await options.runtimeFactory(api);
  const context = typeof options.contextProvider === 'function'
    ? await options.contextProvider()
    : options.context || {};
  const slots = typeof options.extractSlots === 'function'
    ? options.extractSlots(state.prompt, state.flow)
    : {};
  const plan = flowToPlan(state.flow, { prompt: state.prompt, slots }, context);

  if (execute) {
    state.resultOpen = true;
    const result = await runtime.executePlan(plan, context);
    api.writeLog(result.ok ? 'execute.ok' : 'execute.fail', result.message || 'Flow executed.');
  } else {
    state.resultOpen = true;
    api.writeLog('preview.ok', 'Runtime plan generated.');
    api.setResultHTML(`<pre class="flow-workbench__json">${escapeHTML(JSON.stringify(plan, null, 2))}</pre>`);
  }
}

function startCanvasPan(event, state, render, canvasEl) {
  if (state.connectionDraft || event.button !== 0) {
    return;
  }
  event.preventDefault();
  const startClient = { x: event.clientX, y: event.clientY };
  const startPan = { ...state.pan };
  canvasEl.classList.add('is-panning');

  const move = (moveEvent) => {
    moveEvent.preventDefault();
    state.pan = {
      x: startPan.x + moveEvent.clientX - startClient.x,
      y: startPan.y + moveEvent.clientY - startClient.y
    };
    updateBoardTransform(canvasEl, state);
  };

  const up = () => {
    canvasEl.classList.remove('is-panning');
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    render();
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up, { once: true });
}

function startNodeDrag(event, target, state, render, nodeEl) {
  if (state.connectionDraft || event.button !== 0 || event.target.closest('button, input, select, textarea')) {
    return;
  }
  const nodeId = nodeEl.dataset.nodeId;
  const node = getNode(state, nodeId);
  if (!node) {
    return;
  }
  event.preventDefault();
  const point = getCanvasPoint(target, event, state);
  const position = node.ui?.position || { x: 80, y: 80 };
  state.draggingNodeId = nodeId;
  state.selectedNodeId = nodeId;
  state.paletteOpen = false;
  state.dragOffset = {
    x: point.x - position.x,
    y: point.y - position.y
  };
  nodeEl.classList.add('is-dragging', 'is-selected');

  const move = (moveEvent) => {
    if (state.draggingNodeId !== nodeId) {
      return;
    }
    moveEvent.preventDefault();
    const nextPoint = getCanvasPoint(target, moveEvent, state);
    node.ui = node.ui || {};
    node.ui.position = clampNodePosition({
      x: nextPoint.x - state.dragOffset.x,
      y: nextPoint.y - state.dragOffset.y
    });
    nodeEl.style.left = `${node.ui.position.x}px`;
    nodeEl.style.top = `${node.ui.position.y}px`;
    refreshCanvasEdges(target, state);
  };

  const up = () => {
    state.draggingNodeId = '';
    state.dragOffset = null;
    nodeEl.classList.remove('is-dragging');
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    render();
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up, { once: true });
}

function updateBoardTransform(scope, state) {
  const board = scope.querySelector?.('.flow-workbench__board') || scope.closest?.('.flow-workbench')?.querySelector('.flow-workbench__board');
  if (board) {
    board.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
  }
}

function startPortConnection(event, target, state, api, render, portEl) {
  const nodeId = portEl.dataset.nodeId;
  const portKind = portEl.dataset.portKind;
  if (event.button !== 0 || portKind !== 'output' || !nodeId) {
    return;
  }

  state.connectingFrom = nodeId;
  state.connectionDraft = {
    from: nodeId,
    sourcePort: portEl.dataset.portId || '',
    point: getCanvasPoint(target, event, state)
  };
  render();

  const move = (moveEvent) => {
    if (!state.connectionDraft) {
      return;
    }
    moveEvent.preventDefault();
    state.connectionDraft.point = getCanvasPoint(target, moveEvent, state);
    refreshCanvasEdges(target, state);
  };

  const up = (upEvent) => {
    const element = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
    const targetPort = element?.closest?.('.flow-workbench__port[data-port-kind="input"]');
    const toNode = targetPort?.dataset.nodeId || findInputNodeAtPoint(state, getCanvasPoint(target, upEvent, state), nodeId, getRenderedNodeSizes(target))?.id;
    const connection = toNode
      ? connectNodes(state, api, nodeId, toNode, {
        sourcePort: state.connectionDraft.sourcePort,
        targetPort: targetPort?.dataset.portId || getDefaultConnectionPorts(state, nodeId, toNode).targetPort
      })
      : null;
    if (toNode) {
      state.selectedNodeId = connection?.ok ? toNode : '';
    }
    state.connectionDraft = null;
    state.connectingFrom = '';
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    render();
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up, { once: true });
}

function refreshCanvasEdges(target, state) {
  const edges = target.querySelector('.flow-workbench__edges');
  if (!edges) {
    return;
  }
  const nodeSizes = getRenderedNodeSizes(target);
  edges.innerHTML = state.flow.edges.map((edge) => renderEdge(state, edge, nodeSizes)).join('') + renderDraftEdge(state, nodeSizes);
}

function refreshNodePreview(target, state, options, node) {
  const nodeEl = findRenderedNodeElement(target, node.id);
  if (!nodeEl) {
    return;
  }

  const titleEl = nodeEl.querySelector?.('.flow-workbench__node-title-main strong');
  if (titleEl) {
    titleEl.textContent = node.label || node.id;
  }

  const contentEl = nodeEl.querySelector?.('.flow-workbench__node-content');
  if (contentEl) {
    contentEl.innerHTML = renderNodeContentRows(options, node);
  }

  const ports = getFlowNodePorts(node);
  const inputPort = ports.inputs[0] || { id: 'input', label: 'Input' };
  const outputPort = ports.outputs[0] || { id: 'output', label: 'Output' };
  const inputEl = nodeEl.querySelector?.('.flow-workbench__port--in');
  const outputEl = nodeEl.querySelector?.('.flow-workbench__port--out');
  inputEl?.setAttribute?.('aria-label', `${node.label || node.id} ${inputPort.label || inputPort.id}`);
  outputEl?.setAttribute?.('aria-label', `${node.label || node.id} ${outputPort.label || outputPort.id}`);
}

function findRenderedNodeElement(target, nodeId) {
  const nodes = target.querySelectorAll?.('.flow-workbench__node') || [];
  return Array.from(nodes).find((nodeEl) => nodeEl.dataset?.nodeId === nodeId) || null;
}

function getRenderedNodeSizes(target) {
  const sizes = new Map();
  const nodes = target.querySelectorAll?.('.flow-workbench__node') || [];
  Array.from(nodes).forEach((nodeEl) => {
    const nodeId = nodeEl.dataset?.nodeId;
    if (!nodeId) {
      return;
    }
    const rect = typeof nodeEl.getBoundingClientRect === 'function' ? nodeEl.getBoundingClientRect() : {};
    const width = Number(nodeEl.offsetWidth || rect.width || DEFAULT_NODE_WIDTH);
    const height = Number(nodeEl.offsetHeight || rect.height || DEFAULT_NODE_HEIGHT);
    sizes.set(nodeId, {
      width: Number.isFinite(width) && width > 0 ? width : DEFAULT_NODE_WIDTH,
      height: Number.isFinite(height) && height > 0 ? height : DEFAULT_NODE_HEIGHT
    });
  });
  return sizes;
}

function connectNodes(state, api, from, to, options = {}) {
  const connection = canConnectFlowNodes(state.flow, from, to, {
    ...options,
    condition: options.condition || 'success'
  });
  if (!connection.ok) {
    api.writeLog('edge.blocked', connection.message);
    return connection;
  }

  state.flow.edges = [...state.flow.edges, {
    id: `edge:${from}:${to}:${Date.now()}`,
    from,
    to,
    sourcePort: options.sourcePort || '',
    targetPort: options.targetPort || '',
    condition: options.condition || 'success'
  }];
  api.writeLog('edge.add', `${getNode(state, from)?.label || from} -> ${getNode(state, to)?.label || to}`);
  return connection;
}

function getDefaultConnectionPorts(state, from, to) {
  const fromNode = getNode(state, from);
  const toNode = getNode(state, to);
  return {
    sourcePort: getFlowNodePorts(fromNode).outputs[0]?.id || '',
    targetPort: getFlowNodePorts(toNode).inputs[0]?.id || ''
  };
}

function getCanvasPoint(target, event, state) {
  const board = target.querySelector('.flow-workbench__board');
  if (!board) {
    return { x: 0, y: 0 };
  }
  const rect = board.getBoundingClientRect();
  const zoom = state?.zoom || 1;
  return {
    x: (event.clientX - rect.left) / zoom,
    y: (event.clientY - rect.top) / zoom
  };
}

function updateZoom(state, value) {
  state.zoom = normalizeZoom(value);
}

function createPoint(value, fallback) {
  return {
    x: Number.isFinite(Number(value?.x)) ? Number(value.x) : fallback.x,
    y: Number.isFinite(Number(value?.y)) ? Number(value.y) : fallback.y
  };
}

function normalizeZoom(value) {
  const zoom = Number(value || 1);
  if (!Number.isFinite(zoom)) {
    return 1;
  }
  return Math.min(2, Math.max(0.4, zoom));
}

function findInputNodeAtPoint(state, point, fromNodeId) {
  return state.flow.nodes.find((node) => {
    if (node.id === fromNodeId) {
      return false;
    }
    const position = node.ui?.position || { x: 0, y: 0 };
    const { x: portX, y: portY } = getInputPortPoint(position);
    return Math.abs(point.x - portX) <= 24 && Math.abs(point.y - portY) <= 24;
  }) || null;
}

function getBoardSize(state) {
  const maxX = Math.max(...state.flow.nodes.map((node) => (node.ui?.position?.x || 0) + DEFAULT_NODE_WIDTH), 0);
  const maxY = Math.max(...state.flow.nodes.map((node) => (node.ui?.position?.y || 0) + DEFAULT_NODE_HEIGHT), 0);
  return {
    width: Math.max(DEFAULT_BOARD_WIDTH, maxX + 280),
    height: Math.max(DEFAULT_BOARD_HEIGHT, maxY + 280)
  };
}

function nextNodePosition(state) {
  const selected = getNode(state, state.selectedNodeId);
  if (selected?.ui?.position) {
    return clampNodePosition({
      x: selected.ui.position.x + 280,
      y: selected.ui.position.y + 170
    });
  }
  const maxX = Math.max(...state.flow.nodes.map((node) => node.ui?.position?.x || 80), 80);
  return clampNodePosition({ x: maxX + 280, y: 560 });
}

function clampNodePosition(point) {
  return {
    x: Math.max(24, point.x),
    y: Math.max(24, point.y)
  };
}

function getNode(state, id) {
  return state.flow.nodes.find((node) => node.id === id);
}

function getNodeContentRows(options, node) {
  if (typeof options.nodeContentRows === 'function') {
    return options.nodeContentRows(node);
  }
  return [
    [options.labels?.type || 'Type', renderNodeType(options, node.type)],
    [options.labels?.capability || 'Capability', node.capability || '-'],
    [options.labels?.risk || 'Risk', node.risk || 'low'],
    [options.labels?.params || 'Params', summarizeParams(node.params || {})]
  ];
}

function getWorkbenchNodeDefinition(options, node) {
  return getWorkbenchNodeTypes(options).find((item) => {
    const type = item.type || item[0];
    const capability = item.capability || '';
    if (capability && node.capability && capability === node.capability) {
      return true;
    }
    return type === node.type;
  }) || null;
}

function summarizeParams(params) {
  const entries = Object.entries(params || {});
  if (entries.length === 0) {
    return '-';
  }
  return entries.map(([key, value]) => `${key}=${formatParamValue(value)}`).join(' | ');
}

function formatParamValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatParamValue(item)).join(', ')}]`;
  }
  if (value && typeof value === 'object') {
    return '{...}';
  }
  return String(value ?? '-');
}

function renderNodeType(options, type) {
  return options.nodeTypeLabels?.[type] || type;
}

function defaultCapability(type) {
  return getDefaultCapabilityForNodeType(type);
}

function defaultParams(type) {
  if (type === 'message.show') {
    return { message: 'Flow message', type: 'info' };
  }
  return {};
}

function isChineseLocale(locale) {
  return String(locale || '').toLowerCase().startsWith('zh');
}

function createLabels(labels = {}) {
  return {
    title: 'Flow workbench',
    components: 'Components',
    reset: 'Reset',
    fit: 'Fit',
    preview: 'Preview',
    execute: 'Run',
    palette: 'Node palette',
    inspector: 'Node inspector',
    prompt: 'Prompt',
    ready: 'Ready',
    connecting: 'Connecting',
    emptyInspector: 'Select a node.',
    nodeName: 'Node name',
    capability: 'Capability',
    risk: 'Risk',
    params: 'Params JSON',
    connectTo: 'Connect to',
    selectTarget: 'Select target',
    deleteNode: 'Delete node',
    result: 'Run result',
    paletteSearch: '',
    paletteEmpty: '',
    defaultHelpDescription: 'Configure this node with its capability, risk level, and JSON params, then connect its output port to the next node input port.',
    summary: (nodes, edges) => `${nodes} nodes, ${edges} edges`,
    ...labels
  };
}
