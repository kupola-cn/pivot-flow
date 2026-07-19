import { escapeAttr, escapeHTML } from './dom.js';

export function renderFlowSnapshotListToHTML(snapshots = [], options = {}) {
  const items = Array.isArray(snapshots) ? snapshots : [];
  const canRestore = options.canRestore !== false;
  const canCreate = Boolean(options.canCreate);

  return [
    '<section class="flow-snapshot-list">',
    '<div class="flow-snapshot-list__header">',
    '<div>',
    '<strong>Snapshots</strong>',
    `<span>${escapeHTML(items.length)} restore point(s)</span>`,
    '</div>',
    canCreate
      ? '<button type="button" class="ds-btn ds-btn--secondary ds-btn--sm" data-flow-action="create-flow-snapshot">Create snapshot</button>'
      : '',
    '</div>',
    items.length === 0
      ? '<div class="flow-empty flow-empty--compact">No snapshots available.</div>'
      : [
        '<ol class="flow-snapshot-list__items">',
        ...items.map((snapshot) => renderSnapshotItem(snapshot, { canRestore })),
        '</ol>'
      ].join(''),
    '<small>Restoring a snapshot creates or updates a draft Flow. Backend APIs must still authorize the restore operation.</small>',
    '</section>'
  ].join('');
}

function renderSnapshotItem(snapshot = {}, options = {}) {
  return [
    '<li class="flow-snapshot-list__item">',
    '<span>',
    `<strong>${escapeHTML(snapshot.label || snapshot.flowName || snapshot.flowId || snapshot.id || 'Snapshot')}</strong>`,
    `<small>${escapeHTML([snapshot.reason, snapshot.version, snapshot.createdAt].filter(Boolean).join(' · '))}</small>`,
    '</span>',
    '<span class="flow-snapshot-list__meta">',
    `<em>${escapeHTML(snapshot.status || 'draft')}</em>`,
    options.canRestore
      ? `<button type="button" class="ds-btn ds-btn--tertiary ds-btn--sm" data-flow-action="restore-flow-snapshot" data-snapshot-id="${escapeAttr(snapshot.id)}">Restore</button>`
      : '',
    '</span>',
    '</li>'
  ].join('');
}
