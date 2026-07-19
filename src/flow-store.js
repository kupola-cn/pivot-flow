import { createFlow, cloneFlow } from './flow-schema.js';
import { FLOW_STATUS } from './node-types.js';

export function createMemoryFlowStore(initialFlows = []) {
  const flows = new Map();
  const runs = [];

  for (const flow of initialFlows) {
    const normalized = createFlow(flow);
    flows.set(normalized.id, normalized);
  }

  return {
    async list(query = {}) {
      return filterFlows(Array.from(flows.values()), query).map(cloneFlow);
    },

    async get(id) {
      const flow = flows.get(id);
      return flow ? cloneFlow(flow) : null;
    },

    async create(flowInput) {
      const flow = createFlow(flowInput);
      flows.set(flow.id, flow);
      return cloneFlow(flow);
    },

    async update(id, patch) {
      const current = flows.get(id);
      if (!current) {
        throw new Error(`Flow was not found: ${id}`);
      }

      const next = createFlow({
        ...current,
        ...patch,
        id: current.id,
        updatedAt: new Date().toISOString()
      });
      flows.set(id, next);
      return cloneFlow(next);
    },

    async remove(id) {
      flows.delete(id);
    },

    async publish(id) {
      return this.update(id, {
        status: FLOW_STATUS.PUBLISHED,
        publishedAt: new Date().toISOString()
      });
    },

    async disable(id) {
      return this.update(id, {
        status: FLOW_STATUS.DISABLED
      });
    },

    async recordRun(record) {
      const entry = {
        id: record.id ?? `run:${Date.now()}:${runs.length + 1}`,
        timestamp: record.timestamp ?? new Date().toISOString(),
        ...record
      };
      runs.unshift(entry);
      return cloneFlow(entry);
    },

    async listRuns(flowId) {
      return runs.filter((run) => !flowId || run.flowId === flowId).map(cloneFlow);
    }
  };
}

export function createLocalStorageFlowStore(options = {}) {
  const storage = options.storage ?? globalThis.localStorage;
  const key = options.key ?? 'kupola:pivot-flow:flows';
  const runKey = options.runKey ?? 'kupola:pivot-flow:runs';
  const memoryFallback = createMemoryFlowStore(options.initialFlows ?? []);

  if (!storage) {
    return memoryFallback;
  }

  const readFlows = () => {
    try {
      const value = JSON.parse(storage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };

  const writeFlows = (flows) => {
    storage.setItem(key, JSON.stringify(flows));
  };

  const readRuns = () => {
    try {
      const value = JSON.parse(storage.getItem(runKey) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };

  const writeRuns = (runs) => {
    storage.setItem(runKey, JSON.stringify(runs));
  };

  return {
    async list(query = {}) {
      return filterFlows(readFlows(), query).map(cloneFlow);
    },

    async get(id) {
      const flow = readFlows().find((item) => item.id === id);
      return flow ? cloneFlow(flow) : null;
    },

    async create(flowInput) {
      const flows = readFlows();
      const flow = createFlow(flowInput);
      flows.push(flow);
      writeFlows(flows);
      return cloneFlow(flow);
    },

    async update(id, patch) {
      const flows = readFlows();
      const index = flows.findIndex((flow) => flow.id === id);
      if (index < 0) {
        throw new Error(`Flow was not found: ${id}`);
      }

      const next = createFlow({
        ...flows[index],
        ...patch,
        id,
        updatedAt: new Date().toISOString()
      });
      flows[index] = next;
      writeFlows(flows);
      return cloneFlow(next);
    },

    async remove(id) {
      writeFlows(readFlows().filter((flow) => flow.id !== id));
    },

    async publish(id) {
      return this.update(id, {
        status: FLOW_STATUS.PUBLISHED,
        publishedAt: new Date().toISOString()
      });
    },

    async disable(id) {
      return this.update(id, {
        status: FLOW_STATUS.DISABLED
      });
    },

    async recordRun(record) {
      const runs = readRuns();
      const entry = {
        id: record.id ?? `run:${Date.now()}:${runs.length + 1}`,
        timestamp: record.timestamp ?? new Date().toISOString(),
        ...record
      };
      runs.unshift(entry);
      writeRuns(runs);
      return cloneFlow(entry);
    },

    async listRuns(flowId) {
      return readRuns().filter((run) => !flowId || run.flowId === flowId).map(cloneFlow);
    }
  };
}

function filterFlows(flows, query = {}) {
  const keyword = String(query.keyword ?? '').trim().toLowerCase();
  return flows.filter((flow) => {
    if (query.status && flow.status !== query.status) {
      return false;
    }

    if (keyword) {
      const haystack = [flow.id, flow.name, flow.description, flow.status].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(keyword);
    }

    return true;
  });
}
