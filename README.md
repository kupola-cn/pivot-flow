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

For sensitive values, prefer manual slots instead of asking users to put secrets in the natural-language prompt. Mark the slot as sensitive so the drawer renders a password input:

```js
slots: [
  {
    name: 'password',
    label: 'Initial password',
    source: 'manual',
    required: true,
    sensitive: true,
    inputType: 'password'
  }
]
```

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

## Conditions And Transforms

`evaluateFlowCondition()` and `applyFlowTransform()` provide a small controlled DSL for custom runners, tests, and preview tooling. They do not evaluate arbitrary JavaScript.

```js
const ok = evaluateFlowCondition({
  left: '{{intent.quantity}}',
  operator: 'gt',
  right: 0
}, { slots: { quantity: 3 } });

const payload = applyFlowTransform({
  name: '{{intent.name}}',
  actorId: '{{context.actor.id}}'
}, { slots: { name: '张三' } }, { actor: { id: 'admin' } });
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

`FlowManager` provides the first configurable management surface:

- create blank or sample flows
- create draft flows from built-in or custom templates grouped by business domain
- search, filter, group, publish, and disable filtered flows in the manager sidebar
- edit flow name, description, status, risk, examples, keywords, patterns, and slots
- add built-in nodes from the palette
- edit node label, type, capability, risk, confirmation, and JSON params
- inspect a layered flow canvas generated from nodes and edges
- search canvas nodes, locate a node from a compact selector, and highlight nodes related to the current selection
- configure condition node JSON and transform node schemas
- move or delete selected nodes
- add, edit, and delete edges between nodes
- validate edge ids, endpoints, and conditions before publishing
- test match, preview, and execute from the management page with prompt and slots JSON
- save, publish, disable, or delete flows through the configured `FlowStore`
- preview and execute the selected flow through the configured PIVOT runtime
- inspect capability dependencies, risk levels, confirmation requirements, and registered permissions for the selected flow
- inspect execution paths in the canvas, including executed nodes, skipped nodes, failed nodes, and active edges
- automatically focus the first failed node after execution and expose a failed-node jump action so the operator can inspect the broken step

The designer uses a structured layered canvas rather than a freeform drag canvas. This keeps the API stable while making dependencies, edge direction, risk, confirmation, and execution state easier to inspect.

## AI Flow Builder Safety Primitives

`pivot-flow` does not let AI execute or publish flows directly. The library exposes helper APIs for future AI builders:

```js
import {
  createAIFlowBuilderContext,
  createAIFlowProvider,
  createAIFlowDraft,
  createCapabilityManifestSummary,
  diffAIFlowDraft,
  generateAIFlowDraft,
  getMissingFlowCapabilities,
  parseAIFlowProviderOutput,
  recommendFlowCapabilities,
  renderAIFlowDraftReviewToHTML,
  renderAIFlowDraftPreviewToHTML,
  AIFlowDraftReviewer,
  validateAIFlowDraft
} from '@kupola/pivot-flow';

const context = createAIFlowBuilderContext(runtime);
const manifest = createCapabilityManifestSummary(runtime);
const recommendations = recommendFlowCapabilities('删除耗材 TEST-001', runtime);
const draft = createAIFlowDraft(aiStructuredOutput, { runtime });
const validation = validateAIFlowDraft(draft.flow, { runtime });
const missing = getMissingFlowCapabilities(draft.flow, runtime);
const diff = diffAIFlowDraft(aiStructuredOutput.flow, draft.flow);
const previewHTML = renderAIFlowDraftPreviewToHTML(draft, { showDiff: true });

const provider = createAIFlowProvider(async (request) => {
  const response = await fetch('/api/ai/flow-builder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: request.prompt,
      safetyRules: request.safetyRules,
      flowShape: request.flowShape,
      capabilitySummary: request.capabilitySummary
    })
  });
  return await response.json();
}, { name: 'app-ai-flow-builder' });

const generated = await generateAIFlowDraft('删除耗材 TEST-001', {
  runtime,
  provider
});

AIFlowDraftReviewer({
  target: '#review',
  draftResult: generated,
  onSaveDraft: (flow) => flowStore.create(flow)
});
```

- `createAIFlowBuilderContext()` returns model-facing instructions, safety rules, expected Flow shape, and a sanitized capability summary.
- `createAIFlowProvider()` normalizes a project-owned AI adapter. The project can call any model API, but the provider must return structured JSON.
- `generateAIFlowDraft()` sends a controlled builder request to the provider, parses the structured response, normalizes it as a draft, and validates it.
- `parseAIFlowProviderOutput()` accepts common JSON response shapes, including raw JSON text, fenced JSON, `{ flow }`, `output_text`, and chat `choices[0].message.content`.
- `createAIFlowDraft()` converts structured AI output into a normalized draft Flow and validates it immediately.
- `createCapabilityManifestSummary()` returns a capability summary without `execute` functions.
- `getMissingFlowCapabilities()` reports draft nodes that reference unavailable capabilities and suggests close registered capabilities.
- `diffAIFlowDraft()` shows how the raw AI output changed during normalization, such as `published` becoming `draft` or high-risk confirmation being added.
- `recommendFlowCapabilities()` ranks registered capabilities for a natural-language prompt.
- `renderAIFlowDraftPreviewToHTML()` renders a safe draft preview with validation errors, nodes, risk, and confirmation state.
- `renderAIFlowDraftReviewToHTML()` and `AIFlowDraftReviewer()` add a human review step before a draft is saved.
- `validateAIFlowDraft()` checks that AI output stays as a draft, only references registered capabilities, and requires confirmation for high-risk or delete operations.

The provider layer is intentionally generic. `pivot-flow` does not include OpenAI, Tongyi, Claude, or any other model SDK. Applications should call AI APIs through their own backend when secrets, tenant data, or audit requirements are involved. The backend should redact sensitive context, apply rate limits, and return only structured Flow JSON to the browser.

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
