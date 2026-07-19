import { renderPlanGraphToHTML, renderPlanPreviewToHTML } from '@kupola/pivot';

export function renderFlowPreviewToHTML(preview, options = {}) {
  if (!preview) {
    return '<div class="flow-empty">Run preview to inspect plan safety before execution.</div>';
  }

  return [
    '<div class="flow-preview">',
    renderPlanPreviewToHTML(preview, options),
    options.includeGraph === false ? '' : renderPlanGraphToHTML(preview),
    '</div>'
  ].join('');
}
