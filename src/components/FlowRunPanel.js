import { renderResultToHTML, renderTimelineDetailToHTML } from '@kupola/pivot';
import { renderFlowRunSummaryToHTML } from '../flow-run-summary.js';

export function renderFlowRunPanelToHTML(result, options = {}) {
  if (!result) {
    return '<div class="flow-empty">Execute a flow to inspect result and timeline.</div>';
  }

  return [
    '<div class="flow-run-panel">',
    renderFlowRunSummaryToHTML(result, options),
    renderResultToHTML(result),
    renderTimelineDetailToHTML(result),
    '</div>'
  ].join('');
}
