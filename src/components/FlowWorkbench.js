import { Tooltip } from '@kupola/kupola/components/tooltip';
import { cloneFlow, createFlow, createFlowNode } from '../flow-schema.js';
import { flowToPlan } from '../flow-to-plan.js';
import { canConnectFlowNodes, getFlowNodePorts, validateFlow } from '../flow-validation.js';
import { createDefaultFlowWorkbenchNodeTypes, getDefaultCapabilityForNodeType } from '../node-types.js';
import { escapeAttr, escapeHTML, resolveTarget, setHTML } from './dom.js';

const DEFAULT_NODE_WIDTH = 238;
const DEFAULT_NODE_HEIGHT = 132;
const DEFAULT_BOARD_WIDTH = 2200;
const DEFAULT_BOARD_HEIGHT = 1400;
const PALETTE_GROUP_ORDER = ['database', 'business', 'input-output', 'workflow', 'template', 'extension', 'output', 'custom'];
const PALETTE_GROUP_KEY_MAP = Object.freeze({
  capability: 'extension',
  custom: 'extension',
  flow: 'workflow',
  control: 'business',
  human: 'business',
  input: 'input-output',
  feedback: 'input-output',
  output: 'output',
  data: 'database',
  template: 'template',
  templates: 'template',
  businessTemplate: 'template',
  'business-template': 'template'
});
const PALETTE_GROUP_LABELS_EN = Object.freeze({
  extension: 'Extensions',
  workflow: 'Workflow',
  business: 'Business logic',
  'input-output': 'Input & output',
  database: 'Database',
  template: 'Business templates',
  output: 'Output',
  custom: 'Custom'
});
const PALETTE_GROUP_LABELS_ZH = Object.freeze({
  extension: '插件',
  workflow: '工作流',
  business: '业务逻辑',
  'input-output': '输入&输出',
  database: '数据库',
  template: '业务模板',
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
    hidePaletteTooltip(state);
    setHTML(target, renderFlowWorkbenchToHTML(state, options));
    refreshCanvasEdges(target, state);
  };

  const refresh = (nextFlow) => {
    if (nextFlow) {
      state.flow = cloneFlow(nextFlow);
      state.selectedNodeId = '';
      state.connectionDraft = null;
      state.draggingNodeId = '';
      state.previewDialog = null;
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
        state.flowListOpen = false;
      }
    } else if (action === 'toggle-result') {
      state.resultOpen = !state.resultOpen;
    } else if (action === 'toggle-flow-list') {
      state.flowListOpen = !state.flowListOpen;
      state.paletteOpen = false;
      state.selectedNodeId = '';
      if (state.flowListOpen) {
        state.flowListLoading = true;
        render();
        await loadWorkbenchFlowList(state, options, api);
      }
    } else if (action === 'close-flow-list') {
      state.flowListOpen = false;
    } else if (action === 'refresh-flow-list') {
      state.flowListLoading = true;
      render();
      await loadWorkbenchFlowList(state, options, api);
    } else if (action === 'load-flow') {
      await loadWorkbenchFlow(state, options, api, actionEl.dataset.flowId);
    } else if (action === 'new-flow') {
      await newWorkbenchFlow(state, options, api, render);
    } else if (action === 'confirm-new-flow') {
      resolveNewFlowConfirm(state, true);
    } else if (action === 'cancel-new-flow') {
      resolveNewFlowConfirm(state, false);
    } else if (action === 'save-flow') {
      await saveWorkbenchFlow(state, options, api);
    } else if (action === 'publish-flow') {
      await publishWorkbenchFlow(state, options, api);
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
    } else if (action === 'preview') {
      await runFlow(state, options, api, { execute: false });
    } else if (action === 'execute') {
      await runFlow(state, options, api, { execute: true });
    } else if (action === 'close-preview') {
      state.previewDialog = null;
    } else if (action === 'toggle-preview-format') {
      if (state.previewDialog) {
        state.previewDialog.formatted = !state.previewDialog.formatted;
      }
    } else if (action === 'copy-preview') {
      await copyPreviewJSON(state, api);
    }

    render();
  };

  const handleInput = (event) => {
    const input = event.target;
    if (input.dataset.flowWorkbenchPaletteSearch !== undefined) {
      state.paletteQuery = input.value;
      render();
      restorePaletteSearchFocus(target, state.paletteQuery);
    } else if (input.dataset.flowWorkbenchFlowSearch !== undefined) {
      state.flowListQuery = input.value;
      render();
      restoreFlowSearchFocus(target, state.flowListQuery);
    } else if (input.dataset.flowWorkbenchPromptInput !== undefined) {
      state.prompt = input.value;
    } else if (input.dataset.flowWorkbenchParamField) {
      const node = updateSelectedNodeParam(state, input.dataset.flowWorkbenchParamField, input.dataset.flowWorkbenchParamType, input);
      if (node) {
        syncParamsTextarea(target, node);
        refreshNodePreview(target, state, options, node);
        refreshCanvasEdges(target, state);
      }
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
    } else if (input.dataset.flowWorkbenchFlowStatus !== undefined) {
      state.flowListStatus = input.value;
      render();
    } else if (input.dataset.flowWorkbenchZoom !== undefined) {
      updateZoom(state, input.value);
      render();
    } else if (input.dataset.flowWorkbenchParamField) {
      const node = updateSelectedNodeParam(state, input.dataset.flowWorkbenchParamField, input.dataset.flowWorkbenchParamType, input);
      if (node) {
        syncParamsTextarea(target, node);
        refreshNodePreview(target, state, options, node);
        refreshCanvasEdges(target, state);
      }
    } else if (input.dataset.flowWorkbenchField) {
      const node = updateSelectedNode(state, input.dataset.flowWorkbenchField, input.value);
      if (node) {
        refreshNodePreview(target, state, options, node);
        refreshCanvasEdges(target, state);
        if (input.dataset.flowWorkbenchField === 'capability') {
          render();
        }
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
    showPaletteTooltip(state, item);
  };

  const handlePaletteTooltipHide = (event) => {
    const item = event.target.closest?.('[data-flow-workbench-palette-description]');
    if (item && item.contains?.(event.relatedTarget)) {
      return;
    }
    hidePaletteTooltip(state);
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
      resolveNewFlowConfirm(state, false);
      cleanups.forEach((cleanup) => cleanup());
      hidePaletteTooltip(state);
      target.innerHTML = '';
    }
  };
}

export function renderFlowWorkbenchToHTML(state, options = {}) {
  const labels = createLabels(options.labels);
  const showHeaderText = options.showHeaderText !== false;
  const showFlowStatus = options.showFlowStatus ?? showHeaderText;
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
    renderToolbarButton('new-flow', labels.newFlow, 'secondary', { icon: 'new' }),
    options.flowStore ? renderToolbarButton('toggle-flow-list', labels.flows, 'secondary', { icon: 'flows' }) : '',
    options.flowStore ? renderToolbarButton('save-flow', labels.save, 'secondary', { icon: 'save' }) : '',
    options.flowStore ? renderToolbarButton('publish-flow', labels.publish, 'secondary', { icon: 'publish' }) : '',
    renderToolbarButton('preview', labels.preview, 'secondary', { icon: 'preview' }),
    renderToolbarButton('execute', labels.execute, 'brand', { icon: 'execute' }),
    '</div>',
    '</header>',
    renderCanvasToolbar(state, options, labels),
    renderWorkbenchStatusStrip(state, labels, { showFlowStatus }),
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
    renderInspector(state, labels, options),
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
    state.flowListOpen ? renderFlowListModal(state, options, labels) : '',
    renderPreviewModal(state, labels),
    renderNewFlowConfirmModal(state, labels),
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
    dragOffset: null,
    paletteTooltip: null,
    paletteTooltipTarget: null,
    flowListOpen: Boolean(options.flowListOpen),
    flowListItems: [],
    flowListLoading: false,
    flowListError: '',
    flowListQuery: options.flowListQuery || '',
    flowListStatus: options.flowListStatus || '',
    newFlowConfirm: null,
    previewDialog: null
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
    '<div class="flow-workbench__component-controls">',
    renderToolbarButton('toggle-palette', labels.components, 'secondary', { icon: 'components' }),
    '</div>',
    '<div class="flow-workbench__zoom-controls">',
    renderToolbarButton('zoom-out', '-', 'secondary'),
    renderZoomMenu(state),
    renderToolbarButton('zoom-in', '+', 'secondary'),
    renderToolbarButton('reset-viewport', labels.fit, 'secondary'),
    '</div>',
    '</div>'
  ].join('');
}

function renderWorkbenchStatusStrip(state, labels, options = {}) {
  return [
    '<div class="flow-workbench__status-strip">',
    options.showFlowStatus ? renderFlowStatus(state, labels) : '',
    renderWorkbenchStatus(state, labels),
    '</div>'
  ].join('');
}

function renderFlowStatus(state, labels) {
  const status = String(state.flow?.status || 'draft');
  const label = getFlowStatusLabel(status, labels);
  const name = state.flow?.name || labels.untitledFlow;
  return [
    `<div class="flow-workbench__status flow-workbench__flow-status flow-workbench__flow-status--${escapeAttr(status)}" role="status">`,
    '<span class="flow-workbench__status-dot" aria-hidden="true"></span>',
    `<span>${escapeHTML(`${label}（${name}）`)}</span>`,
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

function getFlowStatusLabel(status, labels) {
  return {
    draft: labels.draft,
    published: labels.published,
    disabled: labels.disabled,
    archived: labels.archived
  }[status] || status || labels.draft;
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

function restoreFlowSearchFocus(target, value) {
  const input = target.querySelector?.('[data-flow-workbench-flow-search]');
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

function renderFlowListModal(state, options, labels) {
  const flows = getFilteredFlowListItems(state);
  return [
    '<div class="ds-modal-container flow-workbench__flow-list-container is-open" role="presentation">',
    '<div class="ds-modal-mask flow-workbench__flow-list-mask is-visible">',
    '<section class="ds-modal flow-workbench__flow-list-dialog" role="dialog" aria-modal="true" aria-labelledby="flowWorkbenchFlowListTitle">',
    '<header class="ds-modal__header">',
    `<h3 id="flowWorkbenchFlowListTitle" class="ds-modal__title">${escapeHTML(labels.flows)}</h3>`,
    '<button type="button" class="ds-modal__close" data-flow-workbench-action="close-flow-list" aria-label="Close">×</button>',
    '</header>',
    '<div class="ds-modal__body flow-workbench__flow-list-body">',
    '<div class="flow-workbench__flow-list-filters">',
    `<input class="ds-input ds-input--sm" data-flow-workbench-flow-search placeholder="${escapeAttr(labels.flowSearch)}" value="${escapeAttr(state.flowListQuery || '')}">`,
    `<select class="ds-select ds-select--sm" data-flow-workbench-flow-status>${renderFlowStatusOptions(state.flowListStatus, labels)}</select>`,
    renderToolbarButton('refresh-flow-list', labels.refresh, 'secondary', { icon: 'refresh' }),
    '</div>',
    state.flowListError ? `<div class="flow-workbench__flow-list-error">${escapeHTML(state.flowListError)}</div>` : '',
    state.flowListLoading ? `<div class="flow-workbench__empty">${escapeHTML(labels.loadingFlows)}</div>` : renderFlowListItems(flows, state, labels),
    '</div>',
    '<footer class="ds-modal__footer">',
    '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-workbench-action="close-flow-list">Close</button>',
    '</footer>',
    '</section>',
    '</div>',
    '</div>'
  ].join('');
}

function renderNewFlowConfirmModal(state, labels) {
  const dialog = state.newFlowConfirm;
  if (!dialog) {
    return '';
  }

  return [
    '<div class="ds-modal-container flow-workbench__confirm-container is-open" role="presentation">',
    '<div class="ds-modal-mask flow-workbench__confirm-mask is-visible">',
    '<section class="ds-modal flow-workbench__confirm-modal" role="dialog" aria-modal="true" aria-labelledby="flowWorkbenchNewFlowConfirmTitle">',
    '<header class="ds-modal__header">',
    `<h3 id="flowWorkbenchNewFlowConfirmTitle" class="ds-modal__title">${escapeHTML(dialog.title || labels.newFlowConfirmTitle)}</h3>`,
    '<button type="button" class="ds-modal__close" data-flow-workbench-action="cancel-new-flow" aria-label="Close">×</button>',
    '</header>',
    `<div class="ds-modal__body flow-workbench__confirm-body">${escapeHTML(dialog.content || labels.newFlowConfirmContent)}</div>`,
    '<footer class="ds-modal__footer">',
    `<button type="button" class="ds-btn ds-btn--ghost ds-btn--sm" data-flow-workbench-action="cancel-new-flow">${escapeHTML(dialog.cancelText || labels.newFlowCancelText)}</button>`,
    `<button type="button" class="ds-btn ds-btn--primary ds-btn--sm" data-flow-workbench-action="confirm-new-flow">${escapeHTML(dialog.confirmText || labels.newFlowConfirmText)}</button>`,
    '</footer>',
    '</section>',
    '</div>',
    '</div>'
  ].join('');
}

function renderPreviewModal(state, labels) {
  const dialog = state.previewDialog;
  if (!dialog) {
    return '';
  }
  const json = getPreviewJSON(dialog);
  const formatLabel = dialog.formatted ? labels.previewCompact : labels.previewFormatted;
  const copyLabel = dialog.copied ? labels.previewCopied : labels.previewCopy;
  const previewContent = dialog.formatted
    ? `<div class="flow-workbench__preview-tree" role="tree">${renderJSONTree(dialog.plan || {}, { root: true })}</div>`
    : `<pre class="flow-workbench__preview-json">${escapeHTML(json)}</pre>`;

  return [
    '<div class="ds-modal-container flow-workbench__preview-container is-open" role="presentation">',
    '<div class="ds-modal-mask flow-workbench__preview-mask is-visible">',
    '<section class="ds-modal flow-workbench__preview-modal" role="dialog" aria-modal="true" aria-labelledby="flowWorkbenchPreviewTitle">',
    '<header class="ds-modal__header">',
    `<h3 id="flowWorkbenchPreviewTitle" class="ds-modal__title">${escapeHTML(labels.previewTitle)}</h3>`,
    '<button type="button" class="ds-modal__close" data-flow-workbench-action="close-preview" aria-label="Close">×</button>',
    '</header>',
    '<div class="ds-modal__body flow-workbench__preview-body">',
    '<div class="flow-workbench__preview-toolbar">',
    `<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-workbench-action="toggle-preview-format">${escapeHTML(formatLabel)}</button>`,
    `<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-workbench-action="copy-preview">${escapeHTML(copyLabel)}</button>`,
    '</div>',
    previewContent,
    '</div>',
    '<footer class="ds-modal__footer">',
    `<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-workbench-action="close-preview">${escapeHTML(labels.close)}</button>`,
    '</footer>',
    '</section>',
    '</div>',
    '</div>'
  ].join('');
}

function getPreviewJSON(dialog) {
  return JSON.stringify(dialog.plan || {}, null, 2);
}

function renderJSONTree(value, options = {}) {
  if (isJSONPrimitive(value)) {
    return renderJSONTreePrimitive(options.key, value);
  }

  const entries = Array.isArray(value)
    ? value.map((item, index) => [index, item])
    : Object.entries(value || {});
  const children = entries.length
    ? entries.map(([key, childValue]) => renderJSONTree(childValue, { key })).join('')
    : '';

  if (options.root) {
    return children || renderJSONTreePrimitive(null, value);
  }

  const summary = getJSONTreeSummary(value);
  return [
    '<details class="flow-workbench__json-node" open>',
    '<summary class="flow-workbench__json-summary">',
    `<span class="flow-workbench__json-key">${escapeHTML(String(options.key))}</span>`,
    '<span class="flow-workbench__json-separator">:</span>',
    `<span class="flow-workbench__json-summary-value">${escapeHTML(summary)}</span>`,
    '</summary>',
    `<div class="flow-workbench__json-children">${children}</div>`,
    '</details>'
  ].join('');
}

function renderJSONTreePrimitive(key, value) {
  const keyHTML = key === null || key === undefined
    ? ''
    : `<span class="flow-workbench__json-key">${escapeHTML(String(key))}</span><span class="flow-workbench__json-separator">:</span>`;
  return [
    '<div class="flow-workbench__json-leaf" role="treeitem">',
    keyHTML,
    renderJSONPrimitive(value),
    '</div>'
  ].join('');
}

function renderJSONPrimitive(value) {
  const type = value === null ? 'null' : typeof value;
  return `<span class="flow-workbench__json-value flow-workbench__json-value--${escapeAttr(type)}">${escapeHTML(formatJSONPrimitive(value))}</span>`;
}

function formatJSONPrimitive(value) {
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  if (value === undefined) {
    return 'undefined';
  }
  return String(value);
}

function isJSONPrimitive(value) {
  return value === null || typeof value !== 'object';
}

function getJSONTreeSummary(value) {
  if (Array.isArray(value)) {
    return value.length ? `Array(${value.length})` : '[]';
  }
  const entries = Object.entries(value || {});
  if (!entries.length) {
    return '{}';
  }
  const preview = entries.slice(0, 2)
    .map(([key, childValue]) => `${key}: ${getJSONTreePreviewValue(childValue)}`)
    .join(', ');
  return `{${preview}${entries.length > 2 ? ', ...' : ''}}`;
}

function getJSONTreePreviewValue(value) {
  if (Array.isArray(value)) {
    return value.length ? `[...]` : '[]';
  }
  if (value && typeof value === 'object') {
    return '{...}';
  }
  return formatJSONPrimitive(value);
}

function renderFlowStatusOptions(currentStatus, labels) {
  return [
    ['', labels.allFlows],
    ['draft', labels.draft],
    ['published', labels.published],
    ['disabled', labels.disabled],
    ['archived', labels.archived]
  ].map(([value, label]) => `<option value="${escapeAttr(value)}"${value === currentStatus ? ' selected' : ''}>${escapeHTML(label)}</option>`).join('');
}

function renderFlowListItems(flows, state, labels) {
  if (!flows.length) {
    return `<div class="flow-workbench__empty">${escapeHTML(labels.emptyFlows)}</div>`;
  }

  return [
    '<ol class="flow-workbench__flow-list">',
    flows.map((flow) => [
      `<li class="flow-workbench__flow-list-item${flow.id === state.flow.id ? ' is-current' : ''}">`,
      '<button type="button" class="flow-workbench__flow-list-button" data-flow-workbench-action="load-flow" ',
      `data-flow-id="${escapeAttr(flow.id)}">`,
      '<span class="flow-workbench__flow-list-main">',
      `<strong>${escapeHTML(flow.name || flow.id)}</strong>`,
      `<small>${escapeHTML(flow.description || flow.id)}</small>`,
      '</span>',
      '<span class="flow-workbench__flow-list-meta">',
      `<span class="ds-badge ds-badge--neutral">${escapeHTML(flow.status || 'draft')}</span>`,
      `<small>${escapeHTML(formatFlowListMeta(flow))}</small>`,
      '</span>',
      '</button>',
      '</li>'
    ].join('')).join(''),
    '</ol>'
  ].join('');
}

function getFilteredFlowListItems(state) {
  const keyword = String(state.flowListQuery || '').trim().toLowerCase();
  const status = String(state.flowListStatus || '').trim();
  return (state.flowListItems || []).filter((flow) => {
    if (status && flow.status !== status) {
      return false;
    }
    if (!keyword) {
      return true;
    }
    return [flow.id, flow.name, flow.description, flow.status]
      .some((value) => String(value || '').toLowerCase().includes(keyword));
  });
}

function formatFlowListMeta(flow) {
  const nodeCount = Array.isArray(flow.nodes) ? flow.nodes.length : Number(flow.nodeCount || 0);
  const edgeCount = Array.isArray(flow.edges) ? flow.edges.length : Number(flow.edgeCount || 0);
  const version = flow.publishedVersion || flow.published_version || flow.version || '';
  const updated = flow.updatedAt || flow.updated_at || flow.publishedAt || flow.published_at || '';
  return [
    `${nodeCount} nodes`,
    `${edgeCount} edges`,
    version ? `v${version}` : '',
    updated ? String(updated).slice(0, 10) : ''
  ].filter(Boolean).join(' · ');
}

async function loadWorkbenchFlowList(state, options, api) {
  const flowStore = getWorkbenchFlowStore(options);
  if (!flowStore || typeof flowStore.list !== 'function') {
    state.flowListError = 'flowStore.list is required.';
    state.flowListLoading = false;
    return;
  }

  try {
    const items = await flowStore.list({
      keyword: state.flowListQuery || '',
      status: state.flowListStatus || ''
    });
    state.flowListItems = Array.isArray(items) ? items.map(cloneFlow) : [];
    state.flowListError = '';
  } catch (error) {
    state.flowListError = error?.message || 'Failed to load flows.';
    api.writeLog('flow.list.fail', state.flowListError);
  } finally {
    state.flowListLoading = false;
  }
}

async function loadWorkbenchFlow(state, options, api, id) {
  const flowStore = getWorkbenchFlowStore(options);
  if (!flowStore || typeof flowStore.get !== 'function' || !id) {
    return;
  }

  try {
    const flow = await flowStore.get(id);
    if (!flow) {
      throw new Error(`Flow was not found: ${id}`);
    }
    assertWorkbenchFlowValid(flow, options);
    state.flow = cloneFlow(flow);
    state.selectedNodeId = '';
    state.connectionDraft = null;
    state.draggingNodeId = '';
    state.paletteOpen = false;
    state.flowListOpen = false;
    state.previewDialog = null;
    state.prompt = state.flow.intent?.examples?.[0] || state.flow.name || state.prompt || '';
    api.writeLog('flow.load', `Loaded flow: ${state.flow.name || state.flow.id}`);
    await options.onLoadFlow?.(cloneFlow(state.flow), api);
  } catch (error) {
    state.flowListError = error?.message || 'Failed to load flow.';
    api.writeLog('flow.load.fail', state.flowListError);
  }
}

async function newWorkbenchFlow(state, options, api, render) {
  if (!await confirmNewWorkbenchFlow(state, options, render)) {
    return null;
  }

  const flow = createFlow({
    name: '',
    description: '',
    status: 'draft',
    metadata: options.newFlowMetadata || {}
  });
  state.flow = flow;
  state.selectedNodeId = '';
  state.connectionDraft = null;
  state.draggingNodeId = '';
  state.helpNodeId = '';
  state.paletteOpen = false;
  state.flowListOpen = false;
  state.previewDialog = null;
  state.prompt = '';
  state.resultHTML = options.emptyResultHTML || '<div class="flow-workbench__empty">Run the flow to show output.</div>';
  state.logs = [];
  api.writeLog('flow.new', options.newFlowMessage || 'New draft flow started.');
  await options.onNewFlow?.(cloneFlow(state.flow), api);
  return state.flow;
}

async function confirmNewWorkbenchFlow(state, options, render) {
  if (typeof options.confirmNewFlow === 'function') {
    return await options.confirmNewFlow(cloneFlow(state.flow)) !== false;
  }

  const hasContent = (state.flow?.nodes?.length || 0) > 0 || (state.flow?.edges?.length || 0) > 0;
  if (!hasContent) {
    return true;
  }
  const labels = createLabels(options.labels);
  return openNewFlowConfirm(state, {
    title: labels.newFlowConfirmTitle,
    content: labels.newFlowConfirmContent,
    confirmText: labels.newFlowConfirmText,
    cancelText: labels.newFlowCancelText
  }, render);
}

function openNewFlowConfirm(state, dialog, render) {
  resolveNewFlowConfirm(state, false);
  return new Promise((resolve) => {
    state.newFlowConfirm = { ...dialog, resolve };
    render?.();
  });
}

function resolveNewFlowConfirm(state, confirmed) {
  const dialog = state.newFlowConfirm;
  if (!dialog) {
    return;
  }
  state.newFlowConfirm = null;
  dialog.resolve(Boolean(confirmed));
}

async function saveWorkbenchFlow(state, options, api, saveOptions = {}) {
  const flowStore = getWorkbenchFlowStore(options);
  if (!flowStore) {
    api.writeLog('flow.save.fail', 'flowStore is required.');
    return null;
  }

  try {
    const draft = {
      ...cloneFlow(state.flow),
      status: saveOptions.status || 'draft',
      updatedAt: new Date().toISOString()
    };
    assertWorkbenchFlowValid(draft, options);

    let saved;
    if (typeof flowStore.save === 'function') {
      saved = await flowStore.save(draft);
    } else {
      const existing = typeof flowStore.get === 'function' ? await flowStore.get(draft.id) : null;
      if (existing && typeof flowStore.update === 'function') {
        saved = await flowStore.update(draft.id, draft);
      } else if (typeof flowStore.create === 'function') {
        saved = await flowStore.create(draft);
      } else {
        throw new Error('flowStore.save, create, or update is required.');
      }
    }

    state.flow = cloneFlow(saved || draft);
    if (!saveOptions.silent) {
      api.writeLog('flow.save', `Saved flow: ${state.flow.name || state.flow.id}`);
    }
    await options.onSaveFlow?.(cloneFlow(state.flow), api);
    await loadWorkbenchFlowList(state, options, api);
    return state.flow;
  } catch (error) {
    const message = error?.message || 'Failed to save flow.';
    api.writeLog('flow.save.fail', message);
    state.flowListError = message;
    return null;
  }
}

async function publishWorkbenchFlow(state, options, api) {
  const flowStore = getWorkbenchFlowStore(options);
  if (!flowStore || typeof flowStore.publish !== 'function') {
    api.writeLog('flow.publish.fail', 'flowStore.publish is required.');
    return null;
  }

  try {
    const saved = await saveWorkbenchFlow(state, options, api, { silent: true, status: 'draft' });
    if (!saved) {
      return null;
    }
    const published = await flowStore.publish(saved.id, {
      changeSummary: options.publishChangeSummary || `Published from ${saved.name || saved.id}`
    });
    state.flow = cloneFlow(published || {
      ...saved,
      status: 'published',
      publishedAt: new Date().toISOString()
    });
    api.writeLog('flow.publish', `Published flow: ${state.flow.name || state.flow.id}`);
    await options.onPublishFlow?.(cloneFlow(state.flow), api);
    await loadWorkbenchFlowList(state, options, api);
    return state.flow;
  } catch (error) {
    const message = error?.message || 'Failed to publish flow.';
    api.writeLog('flow.publish.fail', message);
    state.flowListError = message;
    return null;
  }
}

function getWorkbenchFlowStore(options) {
  return options.flowStore || null;
}

function assertWorkbenchFlowValid(flow, options) {
  const validation = validateFlow(flow, {
    capabilities: options.capabilities,
    resources: options.resources,
    resourceSchemas: options.resourceSchemas,
    subflows: options.subflows
  });
  if (!validation.valid) {
    throw new Error(validation.errors.join('; '));
  }
}

function showPaletteTooltip(state, item) {
  const description = item.dataset.flowWorkbenchPaletteDescription || '';
  if (!description || typeof document === 'undefined') {
    return;
  }
  if (state.paletteTooltip && state.paletteTooltipTarget === item) {
    return;
  }

  hidePaletteTooltip(state);
  state.paletteTooltipTarget = item;
  state.paletteTooltip = Tooltip({
    target: item,
    content: description,
    placement: getPaletteTooltipPlacement(item),
    trigger: 'manual'
  });
  state.paletteTooltip.show();
}

function hidePaletteTooltip(state) {
  state.paletteTooltip?.destroy?.();
  state.paletteTooltip = null;
  state.paletteTooltipTarget = null;
}

function getPaletteTooltipPlacement(item) {
  const rect = item.getBoundingClientRect?.();
  if (!rect) {
    return 'right';
  }
  const viewportWidth = globalThis.window?.innerWidth || 0;
  const placeRight = viewportWidth > 0 && rect.left < 300 && rect.right + 300 < viewportWidth;
  return placeRight ? 'right' : 'left';
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
    '<div class="ds-modal-mask flow-workbench__help-modal-mask is-visible">',
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
    '</div>',
    '</div>'
  ].join('');
}

function renderInspector(state, labels, options = {}) {
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
    renderCapabilityField(labels.capability, node.capability || '', node, options, labels),
    '<label class="flow-workbench__field">',
    `<span>${escapeHTML(labels.risk)}</span>`,
    `<select class="ds-select ds-select--sm" data-flow-workbench-field="risk">${['low', 'medium', 'high', 'critical'].map((risk) => `<option value="${risk}"${risk === (node.risk || 'low') ? ' selected' : ''}>${risk}</option>`).join('')}</select>`,
    '</label>',
    renderParamSchemaForm(node, labels, options),
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

function renderParamSchemaForm(node, labels, options = {}) {
  const paramsSchema = getNodeParamsSchema(node, options);
  const fields = Object.entries(paramsSchema || {});
  if (fields.length === 0) {
    return '';
  }

  return [
    '<section class="flow-workbench__param-form">',
    '<div class="flow-workbench__param-form-head">',
    `<strong>${escapeHTML(labels.paramForm || 'Params form')}</strong>`,
    `<small>${escapeHTML(node.capability || defaultCapability(node.type) || node.type)}</small>`,
    '</div>',
    '<div class="flow-workbench__param-form-grid">',
    fields.map(([name, schema]) => renderParamSchemaField(name, schema, node.params?.[name])).join(''),
    '</div>',
    '</section>'
  ].join('');
}

function renderParamSchemaField(name, schema = {}, value) {
  const type = String(schema.type || 'string');
  const label = `${schema.label || name}${schema.required ? ' *' : ''}`;
  if (type === 'boolean') {
    return [
      '<label class="flow-workbench__param-field flow-workbench__param-field--checkbox">',
      `<input type="checkbox" data-flow-workbench-param-field="${escapeAttr(name)}" data-flow-workbench-param-type="${escapeAttr(type)}"${value ? ' checked' : ''}>`,
      `<span>${escapeHTML(label)}</span>`,
      '</label>'
    ].join('');
  }

  const inputValue = formatParamSchemaValue(value, type);
  const multiline = type === 'array' || type === 'object';
  return [
    '<label class="flow-workbench__param-field">',
    `<span>${escapeHTML(label)}</span>`,
    multiline
      ? `<textarea class="ds-textarea" rows="2" data-flow-workbench-param-field="${escapeAttr(name)}" data-flow-workbench-param-type="${escapeAttr(type)}">${escapeHTML(inputValue)}</textarea>`
      : `<input class="ds-input ds-input--sm" type="${schema.sensitive ? 'password' : 'text'}" data-flow-workbench-param-field="${escapeAttr(name)}" data-flow-workbench-param-type="${escapeAttr(type)}" value="${escapeAttr(inputValue)}">`,
    schema.description ? `<small>${escapeHTML(schema.description)}</small>` : '',
    '</label>'
  ].join('');
}

function renderCapabilityField(label, value, node, options = {}, labels = {}) {
  const mode = getCapabilityControlMode(node);
  if (mode === 'hidden') {
    return '';
  }

  if (mode === 'fixed') {
    const fixedValue = value || defaultCapability(node?.type);
    return [
      '<label class="flow-workbench__field">',
      `<span>${escapeHTML(label)}</span>`,
      `<input class="ds-input ds-input--sm" value="${escapeAttr(fixedValue || '-')}" readonly aria-readonly="true">`,
      '</label>'
    ].join('');
  }

  const capabilities = listWorkbenchCapabilities(options, node);
  const selectedValue = String(value || '');
  const hasSelectedCapability = capabilities.some((capability) => capability?.name === selectedValue);
  const unlistedSelected = selectedValue && !hasSelectedCapability ? [{ name: selectedValue, title: selectedValue }] : [];
  const choices = [...unlistedSelected, ...capabilities];
  return [
    '<label class="flow-workbench__field">',
    `<span>${escapeHTML(label)}</span>`,
    '<select class="ds-select ds-select--sm" data-flow-workbench-field="capability">',
    `<option value=""${selectedValue ? '' : ' selected'}>${escapeHTML(labels.capabilityNone || getCapabilityNoneText(options.locale))}</option>`,
    choices.map((capability) => renderCapabilityOption(capability, selectedValue)).join(''),
    '</select>',
    '</label>'
  ].join('');
}

function getCapabilityControlMode(node) {
  if (!node || typeof node !== 'object') {
    return 'hidden';
  }
  if (isFixedCapabilityNode(node)) {
    return 'fixed';
  }
  if (isActionFilteredCapabilityNode(node) || node.type === 'capability.run' || node.type === 'capability.call') {
    return 'select';
  }
  return 'hidden';
}

function isFixedCapabilityNode(node) {
  return [
    'human.input',
    'human.select',
    'ui.display',
    'subflow.run',
    'message.show',
    'output.message',
    'output.table',
    'output.detail',
    'output.options',
    'output.result'
  ].includes(node?.type);
}

function isActionFilteredCapabilityNode(node) {
  return Boolean(getCapabilityActionForNode(node));
}

function renderCapabilityOption(capability = {}, selectedValue = '') {
  const name = String(capability.name || '');
  if (!name) {
    return '';
  }
  return [
    `<option value="${escapeAttr(name)}"${name === selectedValue ? ' selected' : ''}>`,
    escapeHTML(formatCapabilityOptionText(capability)),
    '</option>'
  ].join('');
}

function formatCapabilityOptionText(capability = {}) {
  const name = String(capability.name || '');
  const title = String(capability.title || capability.description || '').trim();
  return title && title !== name ? `${name} - ${title}` : name;
}

function getCapabilityNoneText(locale) {
  return isChineseLocale(locale) ? '不绑定能力（通用节点）' : 'No capability binding';
}

function getNodeParamsSchema(node, options = {}) {
  const capability = getWorkbenchCapability(options, node.capability || defaultCapability(node.type));
  if (isPlainObject(capability?.paramsSchema)) {
    return capability.paramsSchema;
  }

  const definition = getWorkbenchNodeDefinition(options, node);
  if (isPlainObject(definition?.paramsSchema)) {
    return definition.paramsSchema;
  }
  return {};
}

function getWorkbenchCapability(options, capabilityName) {
  const name = String(capabilityName || '').trim();
  if (!name) {
    return null;
  }
  const capabilities = listWorkbenchCapabilities(options);
  return capabilities.find((capability) => capability?.name === name) ?? null;
}

function listWorkbenchCapabilities(options = {}, node = null) {
  const source = options.capabilities;
  const capabilities = Array.isArray(source)
    ? source
    : typeof source?.list === 'function'
      ? source.list()
      : [];
  return filterCapabilitiesForNode(capabilities, node);
}

function filterCapabilitiesForNode(capabilities, node) {
  const action = getCapabilityActionForNode(node);
  if (!action) {
    return capabilities;
  }
  return capabilities.filter((capability) => String(capability?.action || '').toLowerCase() === action);
}

function getCapabilityActionForNode(node) {
  const explicitAction = String(node?.action || '').trim().toLowerCase();
  if (explicitAction) {
    return explicitAction;
  }
  return {
    'data.query': 'query',
    'data.get': 'get',
    'data.aggregate': 'aggregate',
    'data.create': 'create',
    'data.update': 'update',
    'data.delete': 'delete'
  }[node?.type] || '';
}

function formatParamSchemaValue(value, type) {
  if (value === undefined || value === null) {
    return type === 'array' ? '[]' : type === 'object' ? '{}' : '';
  }
  if (type === 'array' || type === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
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
  const templateId = definition.id || definition.key || definition.type || definition[0] || type;
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
    metadata: {
      ...(isPlainObject(definition.metadata) ? definition.metadata : {}),
      templateId
    },
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

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
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

function updateSelectedNodeParam(state, name, type, input) {
  const node = getNode(state, state.selectedNodeId);
  if (!node || !name) {
    return null;
  }
  node.params = {
    ...(isPlainObject(node.params) ? node.params : {}),
    [name]: parseParamSchemaInput(input, type)
  };
  return node;
}

function parseParamSchemaInput(input, type = 'string') {
  if (type === 'boolean') {
    return Boolean(input.checked);
  }

  const value = input.value;
  if (String(value).trim().startsWith('{{')) {
    return String(value).trim();
  }
  if (type === 'number') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  if (type === 'array' || type === 'object') {
    try {
      return JSON.parse(value || (type === 'array' ? '[]' : '{}'));
    } catch {
      return value;
    }
  }
  return value;
}

function syncParamsTextarea(target, node) {
  const textarea = target.querySelector('[data-flow-workbench-field="params"]');
  if (textarea && document.activeElement !== textarea) {
    textarea.value = JSON.stringify(node.params || {}, null, 2);
  }
}

async function runFlow(state, options, api, { execute }) {
  const context = typeof options.contextProvider === 'function'
    ? await options.contextProvider()
    : options.context || {};
  const slots = typeof options.extractSlots === 'function'
    ? options.extractSlots(state.prompt, state.flow)
    : {};
  const plan = flowToPlan(state.flow, { prompt: state.prompt, slots }, context);

  if (execute) {
    if (typeof options.runtimeFactory !== 'function') {
      api.writeLog('runtime.missing', 'runtimeFactory is required.');
      return;
    }
    const runtime = await options.runtimeFactory(api);
    state.resultOpen = true;
    const result = await runtime.executePlan(plan, context);
    api.writeLog(result.ok ? 'execute.ok' : 'execute.fail', result.message || 'Flow executed.');
  } else {
    api.writeLog('preview.ok', 'Runtime plan generated.');
    state.previewDialog = {
      plan,
      formatted: true,
      copied: false
    };
  }
}

async function copyPreviewJSON(state, api) {
  if (!state.previewDialog) {
    return;
  }
  const text = getPreviewJSON(state.previewDialog);
  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(text);
      state.previewDialog.copied = true;
      api.writeLog('preview.copy', 'Preview JSON copied.');
    } else {
      state.previewDialog.copied = false;
      api.writeLog('preview.copy.fail', 'Clipboard API is unavailable.');
    }
  } catch (error) {
    state.previewDialog.copied = false;
    api.writeLog('preview.copy.fail', error?.message || 'Failed to copy preview JSON.');
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
  const definitions = getWorkbenchNodeTypes(options);
  const templateId = node?.metadata?.templateId || node?.metadata?.template || '';
  if (templateId) {
    const byTemplate = definitions.find((item) => (item.id || item.key || item.type || item[0]) === templateId);
    if (byTemplate) {
      return byTemplate;
    }
  }

  const byCapability = definitions.find((item) => {
    const capability = item.capability || '';
    return capability && node.capability && capability === node.capability;
  });
  if (byCapability) {
    return byCapability;
  }

  return definitions.find((item) => {
    const type = item.type || item[0];
    const id = item.id || item.key || item.type || item[0];
    return type === node.type && id === node.type;
  }) || definitions.find((item) => {
    const type = item.type || item[0];
    return type === node.type && !item.capability;
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
    newFlow: 'New',
    newFlowConfirmTitle: 'Create new flow',
    newFlowConfirmContent: 'The current canvas will be cleared. Create a new flow?',
    newFlowConfirmText: 'Create',
    newFlowCancelText: 'Cancel',
    close: 'Close',
    components: 'Components',
    reset: 'Reset',
    fit: 'Fit',
    preview: 'Preview',
    previewTitle: 'Preview plan JSON',
    previewFormatted: 'Formatted',
    previewCompact: 'Raw JSON',
    previewCopy: 'Copy',
    previewCopied: 'Copied',
    execute: 'Run',
    flows: 'Flows',
    save: 'Save',
    publish: 'Publish',
    refresh: 'Refresh',
    palette: 'Node palette',
    inspector: 'Node inspector',
    prompt: 'Prompt',
    ready: 'Ready',
    connecting: 'Connecting',
    emptyInspector: 'Select a node.',
    nodeName: 'Node name',
    capability: 'Capability',
    risk: 'Risk',
    paramForm: 'Params form',
    params: 'Params JSON',
    connectTo: 'Connect to',
    selectTarget: 'Select target',
    deleteNode: 'Delete node',
    result: 'Run result',
    flowSearch: 'Search flows',
    allFlows: 'All',
    draft: 'Draft',
    published: 'Published',
    disabled: 'Disabled',
    archived: 'Archived',
    loadingFlows: 'Loading flows...',
    emptyFlows: 'No flows found.',
    untitledFlow: 'Untitled',
    paletteSearch: '',
    paletteEmpty: '',
    defaultHelpDescription: 'Configure this node with its capability, risk level, and JSON params, then connect its output port to the next node input port.',
    summary: (nodes, edges) => `${nodes} nodes, ${edges} edges`,
    ...labels
  };
}
