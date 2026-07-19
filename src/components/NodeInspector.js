import { FLOW_NODE_TYPES, FLOW_RISK_LEVELS } from '../node-types.js';
import { escapeAttr, escapeHTML, formatJson } from './dom.js';

export function renderNodeInspectorToHTML(node, options = {}) {
  if (!node) {
    return '<div class="flow-empty">Select a node to inspect its configuration.</div>';
  }

  if (options.editable) {
    return renderEditableNodeInspectorToHTML(node);
  }

  return [
    '<div class="flow-inspector">',
    '<div class="flow-panel-title">Node inspector</div>',
    renderField('ID', node.id),
    renderField('Label', node.label),
    renderField('Type', node.type),
    renderField('Capability', node.capability || '-'),
    renderField('Risk', node.risk || 'low'),
    renderField('Confirm', node.requiresConfirmation ? 'yes' : 'no'),
    '<div class="flow-inspector__block">',
    '<span>Params</span>',
    `<pre>${escapeHTML(formatJson(node.params ?? {}))}</pre>`,
    '</div>',
    '</div>'
  ].join('');
}

export function renderEditableNodeInspectorToHTML(node) {
  return [
    '<div class="flow-inspector">',
    '<div class="flow-panel-title">Node inspector</div>',
    renderReadonlyField('ID', node.id),
    '<div class="flow-inspector__actions">',
    '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-action="move-node-up">Move up</button>',
    '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-action="move-node-down">Move down</button>',
    '<button type="button" class="ds-btn ds-btn--ghost ds-btn--sm" data-flow-action="remove-node">Delete node</button>',
    '</div>',
    renderInput('Label', 'label', node.label || ''),
    renderSelect('Type', 'type', node.type, Object.values(FLOW_NODE_TYPES)),
    renderInput('Capability', 'capability', node.capability || ''),
    renderSelect('Risk', 'risk', node.risk || 'low', Object.values(FLOW_RISK_LEVELS)),
    renderCheckbox('Requires confirmation', 'requiresConfirmation', Boolean(node.requiresConfirmation)),
    '<label class="flow-inspector__block">',
    '<span>Params JSON</span>',
    `<textarea class="ds-textarea" rows="8" data-flow-node-field="params">${escapeHTML(formatJson(node.params ?? {}))}</textarea>`,
    '</label>',
    '</div>'
  ].join('');
}

function renderField(label, value) {
  return [
    '<div class="flow-inspector__field">',
    `<span>${escapeHTML(label)}</span>`,
    `<strong>${escapeHTML(value)}</strong>`,
    '</div>'
  ].join('');
}

function renderReadonlyField(label, value) {
  return [
    '<div class="flow-inspector__field">',
    `<span>${escapeHTML(label)}</span>`,
    `<strong>${escapeHTML(value)}</strong>`,
    '</div>'
  ].join('');
}

function renderInput(label, field, value) {
  return [
    '<label class="flow-field">',
    `<span>${escapeHTML(label)}</span>`,
    `<input class="ds-input" data-flow-node-field="${escapeAttr(field)}" value="${escapeAttr(value)}">`,
    '</label>'
  ].join('');
}

function renderSelect(label, field, value, options) {
  return [
    '<label class="flow-field">',
    `<span>${escapeHTML(label)}</span>`,
    `<select class="ds-select" data-flow-node-field="${escapeAttr(field)}">`,
    ...options.map((option) => `<option value="${escapeAttr(option)}"${option === value ? ' selected' : ''}>${escapeHTML(option)}</option>`),
    '</select>',
    '</label>'
  ].join('');
}

function renderCheckbox(label, field, checked) {
  return [
    '<label class="flow-check">',
    `<input type="checkbox" data-flow-node-field="${escapeAttr(field)}"${checked ? ' checked' : ''}>`,
    `<span>${escapeHTML(label)}</span>`,
    '</label>'
  ].join('');
}
