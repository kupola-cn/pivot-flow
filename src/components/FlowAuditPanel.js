import { renderAuditViewerToHTML } from '@kupola/pivot';

export function renderFlowAuditPanelToHTML(audits = [], options = {}) {
  return renderAuditViewerToHTML(audits, {
    title: options.title ?? 'PIVOT Flow Audit',
    emptyText: options.emptyText ?? 'No flow audit events available.'
  });
}
