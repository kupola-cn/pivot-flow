import { listFlowNodeTypeDefinitions } from '../node-types.js';
import { escapeHTML, escapeAttr } from './dom.js';

export function renderNodePaletteToHTML(nodes = listFlowNodeTypeDefinitions()) {
  return [
    '<div class="flow-palette">',
    '<div class="flow-panel-title">Node palette</div>',
    '<ol class="flow-palette__list">',
    ...nodes.map((node) => [
      '<li class="flow-palette__item">',
      `<button type="button" class="flow-node-type" data-flow-action="add-node" data-node-type="${escapeAttr(node.type)}">`,
      `<span>${escapeHTML(node.label)}</span>`,
      `<small>${escapeHTML(node.description)}</small>`,
      '</button>',
      '</li>'
    ].join('')),
    '</ol>',
    '</div>'
  ].join('');
}
