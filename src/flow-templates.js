import { createFlow } from './flow-schema.js';

export const BUILT_IN_FLOW_TEMPLATES = Object.freeze([
  {
    id: 'organization.create-under-parent',
    name: 'Create organization under parent',
    group: 'organization',
    description: 'Create a child organization under a known parent organization.',
    flow: {
      name: 'Create child organization',
      description: 'Create a child organization under a parent organization.',
      risk: 'medium',
      status: 'draft',
      intent: {
        examples: ['在集团下增加分机构 C', '创建一个分支机构 A'],
        keywords: ['增加', '创建', '机构', '分机构'],
        slots: [
          { name: 'organizationName', label: 'Organization name', type: 'string', required: true, pattern: '(?:分机构|机构)\\s*(?<organizationName>\\S+)' },
          { name: 'parentId', label: 'Parent ID', type: 'string', fallback: 'group-root' }
        ]
      },
      nodes: [
        {
          id: 'create-organization',
          type: 'capability.run',
          label: 'Create organization',
          capability: 'org.create',
          risk: 'medium',
          params: {
            name: '{{intent.organizationName}}',
            parentId: '{{intent.parentId}}'
          }
        },
        {
          id: 'refresh-organizations',
          type: 'table.refresh',
          label: 'Refresh organizations',
          params: { target: 'organizations' }
        },
        {
          id: 'show-success',
          type: 'message.show',
          label: 'Show result',
          params: { message: 'Organization created.' }
        }
      ],
      edges: [
        { from: 'create-organization', to: 'refresh-organizations', condition: 'success' },
        { from: 'refresh-organizations', to: 'show-success', condition: 'success' }
      ]
    }
  },
  {
    id: 'user.create-basic',
    name: 'Create user',
    group: 'user',
    description: 'Create a user and refresh the user table.',
    flow: {
      name: 'Create user',
      description: 'Create a user from natural language parameters.',
      risk: 'medium',
      status: 'draft',
      intent: {
        examples: ['增加一个用户张三', '创建用户李四'],
        keywords: ['增加', '创建', '用户'],
        slots: [
          { name: 'realName', label: 'Real name', type: 'string', required: true, pattern: '用户\\s*(?<realName>\\S+)' },
          { name: 'username', label: 'Username', type: 'string', source: 'manual' }
        ]
      },
      nodes: [
        {
          id: 'create-user',
          type: 'capability.run',
          label: 'Create user',
          capability: 'user.create',
          risk: 'medium',
          params: {
            username: '{{intent.username}}',
            realName: '{{intent.realName}}'
          }
        },
        {
          id: 'refresh-users',
          type: 'table.refresh',
          label: 'Refresh users',
          params: { target: 'users' }
        }
      ],
      edges: [
        { from: 'create-user', to: 'refresh-users', condition: 'success' }
      ]
    }
  },
  {
    id: 'material.delete-with-confirm',
    name: 'Delete material with confirmation',
    group: 'material',
    description: 'Preview, confirm, and delete a material.',
    flow: {
      name: 'Delete material',
      description: 'Delete a material after high-risk confirmation.',
      risk: 'high',
      status: 'draft',
      intent: {
        examples: ['删除耗材 A001', '移除物资手套'],
        keywords: ['删除', '移除', '耗材', '物资'],
        slots: [
          { name: 'materialKeyword', label: 'Material keyword', type: 'string', required: true, pattern: '(?:耗材|物资)\\s*(?<materialKeyword>\\S+)' }
        ]
      },
      nodes: [
        {
          id: 'confirm-delete',
          type: 'confirm',
          label: 'Confirm delete material',
          risk: 'high',
          requiresConfirmation: true
        },
        {
          id: 'delete-material',
          type: 'capability.run',
          label: 'Delete material',
          capability: 'material.delete',
          risk: 'high',
          requiresConfirmation: true,
          params: {
            keyword: '{{intent.materialKeyword}}'
          }
        },
        {
          id: 'refresh-materials',
          type: 'table.refresh',
          label: 'Refresh materials',
          params: { target: 'materials' }
        }
      ],
      edges: [
        { from: 'confirm-delete', to: 'delete-material', condition: 'success' },
        { from: 'delete-material', to: 'refresh-materials', condition: 'success' }
      ]
    }
  }
]);

export function listFlowTemplates(query = {}) {
  const keyword = String(query.keyword ?? '').trim().toLowerCase();
  const group = String(query.group ?? '').trim();

  return BUILT_IN_FLOW_TEMPLATES
    .filter((template) => !group || template.group === group)
    .filter((template) => {
      if (!keyword) {
        return true;
      }

      const haystack = [
        template.id,
        template.name,
        template.group,
        template.description
      ].join(' ').toLowerCase();
      return haystack.includes(keyword);
    })
    .map(cloneTemplate);
}

export function getFlowTemplate(id) {
  const template = BUILT_IN_FLOW_TEMPLATES.find((item) => item.id === id);
  return template ? cloneTemplate(template) : null;
}

export function createFlowFromTemplate(templateOrId, overrides = {}) {
  const template = typeof templateOrId === 'string'
    ? getFlowTemplate(templateOrId)
    : templateOrId;

  if (!template) {
    throw new Error(`Flow template was not found: ${templateOrId}`);
  }

  return createFlow({
    ...template.flow,
    ...overrides,
    metadata: {
      ...(template.flow?.metadata ?? {}),
      ...(overrides.metadata ?? {}),
      templateId: template.id
    }
  });
}

function cloneTemplate(template) {
  return JSON.parse(JSON.stringify(template));
}
