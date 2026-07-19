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
  flowToPlan,
  FlowManager,
  FlowAssistantDrawer
} from '@kupola/pivot-flow';
import '@kupola/pivot-flow/css';
```

## Core Example

```js
import { createPivotRuntime } from '@kupola/pivot';
import { createFlow, createLocalIntentMapper, flowToPlan } from '@kupola/pivot-flow';

const runtime = createPivotRuntime();
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
