import { renderResultToHTML, renderTimelineDetailToHTML } from '@kupola/pivot';

export function renderFlowRunPanelToHTML(result) {
  if (!result) {
    return '<div class="flow-empty">Execute a flow to inspect result and timeline.</div>';
  }

  return [
    '<div class="flow-run-panel">',
    renderResultToHTML(result),
    renderTimelineDetailToHTML(result),
    '</div>'
  ].join('');
}
