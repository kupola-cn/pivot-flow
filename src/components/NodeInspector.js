import { FLOW_NODE_TYPES, FLOW_RISK_LEVELS, getFlowNodeCapability, getFlowNodeTypeDefinition } from '../node-types.js';
import { escapeAttr, escapeHTML, formatJson } from './dom.js';

export function renderNodeInspectorToHTML(node, options = {}) {
  if (!node) {
    return '<div class="flow-empty">Select a node to inspect its configuration.</div>';
  }

  if (options.editable) {
    return renderEditableNodeInspectorToHTML(node, options);
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

export function renderEditableNodeInspectorToHTML(node, options = {}) {
  const capability = resolveNodeCapability(node, options);
  const nodeDefinition = getFlowNodeTypeDefinition(node.type);
  const resourceSchema = resolveNodeResourceSchema(node, options);
  const defaultInspector = () => renderDefaultEditableNodeInspectorToHTML(node, {
    ...options,
    capability,
    nodeDefinition,
    resourceSchema
  });

  if (typeof nodeDefinition?.renderInspector === 'function') {
    const rendered = nodeDefinition.renderInspector({
      node,
      capability,
      nodeDefinition,
      resourceSchema,
      options,
      defaultInspector
    });
    if (typeof rendered === 'string') {
      return rendered;
    }
  }

  return defaultInspector();
}

export function getNodeCapabilitySchema(node, options = {}) {
  const capability = resolveNodeCapability(node, options);
  const nodeDefinition = getFlowNodeTypeDefinition(node?.type);
  return resolveNodeParamsSchema(capability, nodeDefinition);
}

function renderDefaultEditableNodeInspectorToHTML(node, options = {}) {
  const capability = options.capability ?? resolveNodeCapability(node, options);
  const nodeDefinition = options.nodeDefinition ?? getFlowNodeTypeDefinition(node.type);
  const resourceSchema = options.resourceSchema ?? resolveNodeResourceSchema(node, options);
  const variableSources = normalizeVariableSources(options.variableSources);
  const paramsSchema = resolveNodeParamsSchema(capability, nodeDefinition);
  const inputSchema = node.inputSchema ?? nodeDefinition?.inputSchema ?? null;
  const outputSchema = node.outputSchema ?? capability?.outputSchema ?? nodeDefinition?.outputSchema ?? null;

  return [
    '<div class="flow-inspector">',
    '<div class="flow-panel-title">Node inspector</div>',
    renderVariableDatalist(variableSources),
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
    renderSchemaParamFields(node, paramsSchema, variableSources),
    node.type === FLOW_NODE_TYPES.DATA_QUERY ? renderResourceQueryEditor(node, resourceSchema, variableSources) : '',
    node.type === FLOW_NODE_TYPES.CONDITION ? renderJsonTextarea('Condition JSON', 'condition', node.condition ?? {}) : '',
    node.type === FLOW_NODE_TYPES.TRANSFORM ? renderJsonTextarea('Input schema JSON', 'inputSchema', node.inputSchema ?? {}) : '',
    node.type === FLOW_NODE_TYPES.TRANSFORM ? renderJsonTextarea('Output schema JSON', 'outputSchema', node.outputSchema ?? {}) : '',
    renderSchemaPreview('Input schema', inputSchema),
    renderSchemaPreview('Output schema', outputSchema),
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

function renderJsonTextarea(label, field, value) {
  return [
    '<label class="flow-inspector__block">',
    `<span>${escapeHTML(label)}</span>`,
    `<textarea class="ds-textarea" rows="6" data-flow-node-field="${escapeAttr(field)}">${escapeHTML(formatJson(value))}</textarea>`,
    '</label>'
  ].join('');
}

function resolveNodeCapability(node, options = {}) {
  const capabilityName = getFlowNodeCapability(node);
  if (!capabilityName) {
    return null;
  }

  if (typeof options.runtime?.getCapability === 'function') {
    return options.runtime.getCapability(capabilityName);
  }

  const capabilities = Array.isArray(options.capabilities)
    ? options.capabilities
    : typeof options.capabilities?.list === 'function'
      ? options.capabilities.list()
      : [];

  return capabilities.find((capability) => capability?.name === capabilityName) ?? null;
}

function resolveNodeResourceSchema(node, options = {}) {
  const resourceName = String(node?.resource || '').trim();
  if (!resourceName) {
    return null;
  }

  return options.resourceSchemas?.[resourceName]
    ?? options.resources?.[resourceName]
    ?? null;
}

function renderSchemaParamFields(node, paramsSchema, variableSources) {
  if (!isPlainObject(paramsSchema) || Object.keys(paramsSchema).length === 0) {
    return '';
  }

  return [
    '<section class="flow-inspector__schema" data-flow-node-schema="params">',
    '<div class="flow-panel-title">Params form</div>',
    ...Object.entries(paramsSchema).map(([field, rule]) => renderSchemaParamField(field, rule, node.params?.[field], variableSources)),
    '</section>'
  ].join('');
}

function renderSchemaParamField(field, rule, value, variableSources) {
  const schema = normalizeFieldSchema(rule);
  const label = schema.label || field;
  const effectiveValue = value === undefined ? schema.defaultValue : value;
  const valueText = effectiveValue === undefined || effectiveValue === null ? '' : String(effectiveValue);
  const commonAttrs = [
    `data-flow-node-param-field="${escapeAttr(field)}"`,
    `data-flow-node-param-type="${escapeAttr(schema.type)}"`,
    schema.defaultValue !== undefined ? `data-flow-node-param-default="${escapeAttr(formatJson(schema.defaultValue))}"` : ''
  ].filter(Boolean).join(' ');
  const listAttr = variableSources.length > 0 && ['string', 'text', 'number'].includes(schema.type)
    ? ' list="flow-node-variable-options"'
    : '';
  const placeholder = schema.placeholder
    || (schema.defaultValue !== undefined && !isPlainObject(schema.defaultValue) && !Array.isArray(schema.defaultValue)
      ? `Default: ${schema.defaultValue}`
      : '');
  const placeholderAttr = placeholder ? ` placeholder="${escapeAttr(placeholder)}"` : '';
  const hint = [
    schema.required ? '<em>required</em>' : '',
    schema.sensitive ? '<em>sensitive</em>' : '',
    schema.defaultValue !== undefined ? `<em>default: ${escapeHTML(formatInlineValue(schema.defaultValue))}</em>` : ''
  ].filter(Boolean).join('');

  if (schema.type === 'boolean') {
    return [
      '<label class="flow-check flow-check--schema">',
      `<input type="checkbox" ${commonAttrs}${Boolean(effectiveValue) ? ' checked' : ''}>`,
      `<span>${escapeHTML(label)}${hint}</span>`,
      '</label>'
    ].join('');
  }

  if (schema.options.length > 0) {
    return [
      '<label class="flow-field flow-field--schema">',
      `<span>${escapeHTML(label)}${hint}</span>`,
      `<select class="ds-select" ${commonAttrs}>`,
      '<option value="">Select...</option>',
      ...schema.options.map((option) => `<option value="${escapeAttr(option)}"${String(option) === valueText ? ' selected' : ''}>${escapeHTML(option)}</option>`),
      '</select>',
      '</label>'
    ].join('');
  }

  if (schema.type === 'object' || schema.type === 'array') {
    return [
      '<label class="flow-field flow-field--schema flow-field--wide">',
      `<span>${escapeHTML(label)}${hint}</span>`,
      `<textarea class="ds-textarea" rows="4" ${commonAttrs}${placeholderAttr}>${escapeHTML(effectiveValue === undefined ? '' : formatJson(effectiveValue))}</textarea>`,
      '</label>'
    ].join('');
  }

  const inputType = schema.sensitive
    ? 'password'
    : schema.type === 'number'
      ? 'number'
      : schema.type === 'date'
        ? 'date'
        : 'text';

  return [
    '<label class="flow-field flow-field--schema">',
    `<span>${escapeHTML(label)}${hint}</span>`,
    `<input class="ds-input" type="${escapeAttr(inputType)}" ${commonAttrs}${listAttr}${placeholderAttr} value="${escapeAttr(valueText)}">`,
    '</label>'
  ].join('');
}

function renderVariableDatalist(variableSources) {
  if (variableSources.length === 0) {
    return '';
  }

  return [
    '<datalist id="flow-node-variable-options">',
    ...variableSources.map((source) => `<option value="{{${escapeAttr(source.reference)}}}">${escapeHTML(source.label || source.reference)}</option>`),
    '</datalist>'
  ].join('');
}

function renderResourceQueryEditor(node, resourceSchema, variableSources) {
  const fields = getResourceFields(resourceSchema);
  if (fields.length === 0) {
    return '';
  }

  const filters = Array.isArray(node.params?.filters) ? node.params.filters : [];
  const editableFilters = filters.length > 0 ? filters : [{}];
  return [
    '<section class="flow-inspector__schema" data-flow-node-schema="query">',
    '<div class="flow-panel-title">Query filters</div>',
    ...editableFilters.map((filter, index) => renderQueryFilter(index, filter, fields, variableSources)),
    '</section>'
  ].join('');
}

function renderQueryFilter(index, filter, fields, variableSources) {
  const operator = filter?.operator ?? 'eq';
  const listAttr = variableSources.length > 0 ? ' list="flow-node-variable-options"' : '';
  return [
    '<div class="flow-query-filter">',
    '<label class="flow-field">',
    '<span>Field</span>',
    `<select class="ds-select" data-flow-node-filter-index="${escapeAttr(index)}" data-flow-node-filter-field="field">`,
    '<option value="">Select field...</option>',
    ...fields.map((field) => `<option value="${escapeAttr(field.name)}"${field.name === filter?.field ? ' selected' : ''}>${escapeHTML(field.label || field.name)}</option>`),
    '</select>',
    '</label>',
    '<label class="flow-field">',
    '<span>Operator</span>',
    `<select class="ds-select" data-flow-node-filter-index="${escapeAttr(index)}" data-flow-node-filter-field="operator">${renderOperatorOptions(operator)}</select>`,
    '</label>',
    '<label class="flow-field">',
    '<span>Value</span>',
    `<input class="ds-input" data-flow-node-filter-index="${escapeAttr(index)}" data-flow-node-filter-field="value"${listAttr} placeholder="{{intent.name}}" value="${escapeAttr(filter?.value ?? '')}">`,
    '</label>',
    '</div>'
  ].join('');
}

function renderOperatorOptions(value) {
  return ['eq', 'neq', 'contains', 'gt', 'gte', 'lt', 'lte', 'in'].map((operator) => [
    `<option value="${escapeAttr(operator)}"${operator === value ? ' selected' : ''}>`,
    escapeHTML(operator),
    '</option>'
  ].join('')).join('');
}

function renderSchemaPreview(label, schema) {
  const fields = getSchemaFields(schema);
  if (fields.length === 0) {
    return '';
  }

  return [
    '<section class="flow-inspector__schema-preview">',
    `<div class="flow-panel-title">${escapeHTML(label)}</div>`,
    '<dl class="flow-schema-preview">',
    ...fields.map((field) => [
      '<div class="flow-schema-preview__row">',
      `<dt>${escapeHTML(field.label || field.name)}</dt>`,
      '<dd>',
      `<code>${escapeHTML(field.type)}</code>`,
      field.required ? '<em>required</em>' : '',
      field.description ? `<span>${escapeHTML(field.description)}</span>` : '',
      '</dd>',
      '</div>'
    ].join('')),
    '</dl>',
    '</section>'
  ].join('');
}

function resolveNodeParamsSchema(capability, nodeDefinition) {
  if (isPlainObject(capability?.paramsSchema)) {
    return capability.paramsSchema;
  }

  if (isPlainObject(nodeDefinition?.paramsSchema)) {
    return nodeDefinition.paramsSchema;
  }

  if (isPlainObject(nodeDefinition?.inputSchema)) {
    return nodeDefinition.inputSchema;
  }

  if (isPlainObject(nodeDefinition?.defaultParams)) {
    return Object.fromEntries(Object.entries(nodeDefinition.defaultParams).map(([field, value]) => [
      field,
      {
        type: inferSchemaType(value),
        default: value
      }
    ]));
  }

  return null;
}

function getSchemaFields(schema) {
  if (!isPlainObject(schema)) {
    return [];
  }

  if (isPlainObject(schema.fields)) {
    return Object.entries(schema.fields).map(([name, field]) => ({
      name,
      ...normalizeFieldSchema(field)
    }));
  }

  return Object.entries(schema).map(([name, field]) => ({
    name,
    ...normalizeFieldSchema(field)
  }));
}

function normalizeFieldSchema(rule) {
  if (typeof rule === 'string') {
    return {
      type: rule,
      label: '',
      description: '',
      placeholder: '',
      required: false,
      sensitive: false,
      defaultValue: undefined,
      options: []
    };
  }

  const safeRule = isPlainObject(rule) ? rule : {};
  return {
    type: safeRule.type || inferSchemaType(safeRule.default ?? safeRule.defaultValue),
    label: safeRule.label || safeRule.title || '',
    description: safeRule.description || '',
    placeholder: safeRule.placeholder || '',
    required: Boolean(safeRule.required),
    sensitive: Boolean(safeRule.sensitive),
    defaultValue: safeRule.default ?? safeRule.defaultValue,
    options: normalizeOptions(safeRule.options ?? safeRule.enum ?? safeRule.values)
  };
}

function normalizeOptions(value) {
  if (Array.isArray(value)) {
    return value.map(String);
  }

  if (isPlainObject(value)) {
    return Object.keys(value);
  }

  return [];
}

function getResourceFields(resourceSchema) {
  const fields = resourceSchema?.fields;
  if (!isPlainObject(fields)) {
    return [];
  }

  return Object.entries(fields)
    .filter(([, field]) => field?.queryable !== false)
    .map(([name, field]) => ({
      name,
      label: field?.label || name
    }));
}

function inferSchemaType(value) {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (isPlainObject(value)) {
    return 'object';
  }
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  if (typeof value === 'number') {
    return 'number';
  }
  return 'string';
}

function formatInlineValue(value) {
  if (isPlainObject(value) || Array.isArray(value)) {
    return formatJson(value);
  }
  return String(value);
}

function normalizeVariableSources(sources) {
  return (Array.isArray(sources) ? sources : [])
    .map((source) => {
      if (typeof source === 'string') {
        return {
          reference: source,
          label: source
        };
      }

      return {
        reference: source?.reference,
        label: source?.label || source?.reference
      };
    })
    .filter((source) => source.reference);
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}
