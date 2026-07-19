import { getFlowNodeCapability, isCapabilityBackedNode } from '../node-types.js';
import { escapeHTML } from './dom.js';

export function renderFlowCapabilityMatrixToHTML(flow, runtime) {
  const rows = getFlowCapabilityRows(flow, runtime);
  if (rows.length === 0) {
    return '<div class="flow-empty flow-empty--compact">No capability dependencies.</div>';
  }

  return [
    '<div class="flow-capability-matrix">',
    '<div class="flow-capability-matrix__head">',
    '<span>Node</span>',
    '<span>Capability</span>',
    '<span>Risk</span>',
    '<span>Confirm</span>',
    '<span>Permissions</span>',
    '</div>',
    ...rows.map((row) => [
      '<div class="flow-capability-matrix__row">',
      `<span>${escapeHTML(row.nodeLabel)}</span>`,
      `<code>${escapeHTML(row.capability)}</code>`,
      `<span class="flow-badge flow-badge--${escapeHTML(row.risk)}">${escapeHTML(row.risk)}</span>`,
      `<span>${row.requiresConfirmation ? 'Required' : 'No'}</span>`,
      `<span>${row.permissions.length > 0 ? row.permissions.map((permission) => `<code>${escapeHTML(permission)}</code>`).join('') : '-'}</span>`,
      '</div>'
    ].join('')),
    '</div>'
  ].join('');
}

export function getFlowCapabilityRows(flow, runtime) {
  const nodes = Array.isArray(flow?.nodes) ? flow.nodes : [];
  return nodes
    .filter((node) => isCapabilityBackedNode(node))
    .map((node) => {
      const capabilityName = getFlowNodeCapability(node);
      const capability = typeof runtime?.getCapability === 'function'
        ? runtime.getCapability(capabilityName)
        : null;

      return {
        nodeId: node.id,
        nodeLabel: node.label || node.id || capabilityName,
        capability: capabilityName,
        resource: capability?.resource || '',
        action: capability?.action || '',
        risk: node.risk || capability?.risk || 'low',
        requiresConfirmation: Boolean(node.requiresConfirmation || capability?.requiresConfirmation),
        permissions: Array.isArray(capability?.permissions) ? capability.permissions : []
      };
    });
}
