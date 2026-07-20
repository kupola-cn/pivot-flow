import { createPivotRuntime } from '@kupola/pivot';
import {
  createFlowFromTemplate,
  createMemoryFlowStore,
  createPivotFlowApp,
  registerFlowFrontendCapabilities
} from '@kupola/pivot-flow';
import '@kupola/pivot-flow/css';

const runtime = createPivotRuntime();

runtime.registerCapability({
  name: 'user.query',
  resource: 'users',
  action: 'query',
  risk: 'low',
  paramsSchema: {
    filters: { type: 'array', required: true },
    limit: { type: 'number', default: 20 }
  },
  outputSchema: {
    records: { type: 'array' },
    total: { type: 'number' }
  },
  execute: async ({ params }) => {
    const name = params.filters?.find((filter) => filter.field === 'name')?.value ?? '';
    const records = await window.hisApi.users.search({ name, limit: params.limit ?? 20 });
    return {
      records,
      total: records.length
    };
  }
});

registerFlowFrontendCapabilities(runtime, {
  showMessage: ({ message, type }) => window.hisUi.message[type ?? 'info'](message),
  selectRecord: ({ source, title }) => window.hisUi.selectTable({ title, rows: source }),
  displayData: ({ data, renderer, title }) => window.hisUi.display({ data, renderer, title })
});

const flowStore = createMemoryFlowStore([
  createFlowFromTemplate('user.query-by-name', {
    name: 'HIS user lookup'
  })
]);

createPivotFlowApp({
  target: '#his-flow-designer',
  runtime,
  flowStore,
  resourceSchemas: {
    users: {
      fields: {
        id: { type: 'string', label: 'User ID', queryable: false },
        name: { type: 'string', label: 'Name' },
        departmentName: { type: 'string', label: 'Department' },
        phone: { type: 'string', label: 'Phone' }
      }
    }
  }
});
