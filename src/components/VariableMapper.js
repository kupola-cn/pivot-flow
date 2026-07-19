import { escapeHTML } from './dom.js';

export function renderVariableMapperToHTML(options = {}) {
  const sources = options.sources ?? [
    'intent.name',
    'context.actor.id',
    'context.selection.id',
    'query-parent.data.id'
  ];

  return [
    '<div class="flow-variable-mapper">',
    '<div class="flow-panel-title">Variable mapper</div>',
    '<ol class="flow-token-list">',
    ...sources.map((source) => `<li><code>{{${escapeHTML(source)}}}</code></li>`),
    '</ol>',
    '</div>'
  ].join('');
}
