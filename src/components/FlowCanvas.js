import { escapeHTML, escapeAttr } from './dom.js';

export function renderFlowCanvasToHTML(flow, options = {}) {
  const nodes = Array.isArray(flow?.nodes) ? flow.nodes : [];

  if (!flow) {
    return '<div class="flow-empty">Select a flow to inspect its nodes.</div>';
  }

  if (nodes.length === 0) {
    return '<div class="flow-empty">This flow has no nodes.</div>';
  }

  return [
    '<div class="flow-canvas">',
    '<ol class="flow-canvas__nodes">',
    ...nodes.map((node, index) => renderNodeCard(node, index, options)),
    '</ol>',
    '</div>'
  ].join('');
}

export function renderNodeCard(node, index, options = {}) {
  const selected = options.selectedNodeId === node.id;
  return [
    `<li class="flow-node${selected ? ' is-selected' : ''}" data-node-id="${escapeAttr(node.id)}" data-flow-action="select-node">`,
    '<button type="button" class="flow-node__button">',
    '<span class="flow-node__index">',
    escapeHTML(index + 1),
    '</span>',
    '<span class="flow-node__body">',
    `<strong>${escapeHTML(node.label || node.id)}</strong>`,
    `<small>${escapeHTML(node.type)}${node.capability ? ` · ${escapeHTML(node.capability)}` : ''}</small>`,
    '</span>',
    `<span class="flow-badge flow-badge--${escapeAttr(node.risk || 'low')}">${escapeHTML(node.risk || 'low')}</span>`,
    '</button>',
    '</li>'
  ].join('');
}
