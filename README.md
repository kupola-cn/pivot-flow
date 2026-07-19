# @kupola/pivot-flow

AI-native frontend business flow orchestration for Kupola PIVOT.

`@kupola/pivot-flow` is the product layer above `@kupola/pivot`. It helps web apps define, manage, preview, and run frontend business flows that are triggered by user intent.

```text
Natural language
  -> Intent mapper
  -> Flow definition
  -> PIVOT plan
  -> PIVOT runtime preview
  -> user confirmation
  -> PIVOT runtime execute
  -> result and audit
```

## Install

```bash
npm install @kupola/pivot-flow @kupola/pivot @kupola/kupola
```

```js
import {
  createFlow,
  createLocalIntentMapper,
  createLocalStorageFlowStore,
  createFlowRunner,
  registerFlowFrontendCapabilities,
  flowToPlan,
  FlowManager,
  FlowAssistantDrawer
} from '@kupola/pivot-flow';
import '@kupola/pivot-flow/css';
```

## Core Example

```js
import { createPivotRuntime } from '@kupola/pivot';
import { createFlow, createLocalIntentMapper, flowToPlan, registerFlowFrontendCapabilities } from '@kupola/pivot-flow';

const runtime = createPivotRuntime();
registerFlowFrontendCapabilities(runtime, {
  showMessage: ({ message }) => console.info(message),
  refreshTable: ({ target }) => console.info(`refresh ${target}`)
});

// Built-in frontend node types infer their capability automatically:
// message.show -> capability "message.show"
// table.refresh -> capability "table.refresh"

runtime.registerCapability({
  name: 'org.create',
  resource: 'organization',
  action: 'create',
  risk: 'medium',
  permissions: ['system:org:create'],
  paramsSchema: {
    name: { type: 'string', required: true },
    parentId: { type: 'string', required: true }
  },
  execute: ({ params }) => ({ id: 'org-1', ...params })
});

const flow = createFlow({
  id: 'org-create',
  name: 'Create organization',
  status: 'published',
  intent: {
    examples: ['在集团下增加分机构 C'],
    keywords: ['增加', '分机构'],
    slots: [
      { name: 'organizationName', type: 'string', required: true, pattern: '分机构\\s*(?<organizationName>\\S+)' },
      { name: 'parentId', type: 'string', fallback: 'group-root' }
    ]
  },
  nodes: [
    {
      id: 'create-org',
      type: 'capability.run',
      label: 'Create organization',
      capability: 'org.create',
      params: {
        name: '{{intent.organizationName}}',
        parentId: '{{intent.parentId}}'
      }
    }
  ]
});

const mapper = createLocalIntentMapper();
const match = mapper.match('在集团下增加分机构 C', [flow]).best;
const plan = flowToPlan(match.flow, { prompt: match.prompt, slots: match.slots });
const preview = await runtime.previewPlan(plan, { actor: { permissions: ['system:org:create'] } });
```

## Headless Runner

Use `createFlowRunner()` when you need the intent-to-execution pipeline without using the bundled drawer UI.

```js
const runner = createFlowRunner({
  runtime,
  flowStore,
  intentMapper: createLocalIntentMapper(),
  contextProvider: () => ({
    actor: {
      id: 'admin',
      permissions: ['system:org:create']
    }
  })
});

const preview = await runner.preview('在集团下增加分机构 C');
const result = await runner.execute('在集团下增加分机构 C');
```

When a matched flow has required slots that cannot be extracted from the prompt, `preview()` returns `stage: 'slots'` with `missingSlots`. Pass the collected values back into the runner:

```js
const preview = await runner.preview('创建');

if (preview.stage === 'slots') {
  const confirmedPreview = await runner.preview('创建', {
    match: preview.match,
    slots: {
      name: '张三'
    }
  });
}
```

`FlowAssistantDrawer` uses the same mechanism and renders parameter inputs for missing required slots before preview or execution.

## Flow Stores

Use an in-memory or localStorage store for prototypes. Use `createHttpFlowStore()` when the app needs server-backed persistence and backend authorization.

```js
import { createHttpFlowStore } from '@kupola/pivot-flow';

const flowStore = createHttpFlowStore({
  baseUrl: '/api/pivot-flows',
  runsUrl: '/api/pivot-flow-runs',
  headers: () => ({
    'X-CSRF-Token': getCsrfToken()
  })
});
```

Expected HTTP endpoints:

- `GET /api/pivot-flows`
- `POST /api/pivot-flows`
- `GET /api/pivot-flows/:id`
- `PUT /api/pivot-flows/:id`
- `DELETE /api/pivot-flows/:id`
- `POST /api/pivot-flows/:id/publish`
- `POST /api/pivot-flows/:id/disable`
- `GET /api/pivot-flow-runs`
- `POST /api/pivot-flow-runs`

## Flow Templates

Built-in templates provide common starting points for application flows. Templates create draft flows and still require project-specific capability registration, preview, publish checks, and backend authorization.

```js
import { createFlowFromTemplate, listFlowTemplates } from '@kupola/pivot-flow';

const templates = listFlowTemplates({ group: 'organization' });
const draftFlow = createFlowFromTemplate('organization.create-under-parent', {
  name: '在集团下新增分机构'
});

await flowStore.create(draftFlow);
```

`FlowManager` renders built-in templates by default. Pass `templates` to replace them with project-specific templates.

## UI Example

```js
FlowManager({
  target: '#flowManager',
  runtime,
  flowStore
});

FlowAssistantDrawer({
  trigger: '#pivotFlowBtn',
  runtime,
  flowStore,
  intentMapper: createLocalIntentMapper(),
  contextProvider: () => ({
    actor: {
      id: 'admin',
      permissions: ['system:org:create']
    }
  })
});
```

`FlowManager` provides the first configurable management surface:

- create blank or sample flows
- create draft flows from built-in or custom templates
- edit flow name, description, status, risk, examples, keywords, patterns, and slots
- add built-in nodes from the palette
- edit node label, type, capability, risk, confirmation, and JSON params
- move or delete selected nodes
- add, edit, and delete edges between nodes
- save, publish, disable, or delete flows through the configured `FlowStore`
- preview and execute the selected flow through the configured PIVOT runtime

## Security Boundary

Frontend PIVOT Flow permissions are only interaction hints and client-side safeguards. They do not replace backend authorization.

Backend APIs must still validate:

- authentication
- role permissions
- data permissions
- field-level constraints
- business invariants
- high-risk operations

If the frontend is bypassed, backend APIs must return `401`, `403`, `409`, or `422` as appropriate.

AI-generated flows must remain drafts until reviewed and published by an authorized administrator.
