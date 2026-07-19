import { cloneFlow } from './flow-schema.js';
import { createFlowSnapshot, restoreFlowSnapshot } from './flow-versioning.js';

export function createMemoryFlowSnapshotStore(initialSnapshots = []) {
  const snapshots = new Map();

  for (const snapshot of initialSnapshots) {
    if (snapshot?.id) {
      snapshots.set(snapshot.id, cloneFlow(snapshot));
    }
  }

  return {
    async list(flowId) {
      return Array.from(snapshots.values())
        .filter((snapshot) => !flowId || snapshot.flowId === flowId)
        .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
        .map(cloneFlow);
    },

    async get(id) {
      const snapshot = snapshots.get(id);
      return snapshot ? cloneFlow(snapshot) : null;
    },

    async create(snapshot) {
      if (!snapshot?.id) {
        throw new Error('Flow snapshot id is required.');
      }
      snapshots.set(snapshot.id, cloneFlow(snapshot));
      return cloneFlow(snapshot);
    },

    async remove(id) {
      snapshots.delete(id);
    },

    async clear(flowId) {
      for (const snapshot of snapshots.values()) {
        if (!flowId || snapshot.flowId === flowId) {
          snapshots.delete(snapshot.id);
        }
      }
    }
  };
}

export function createVersionedFlowStore(flowStore, options = {}) {
  if (!flowStore || typeof flowStore !== 'object') {
    throw new Error('A FlowStore is required to create a versioned FlowStore.');
  }

  const snapshotStore = options.snapshotStore ?? createMemoryFlowSnapshotStore(options.initialSnapshots ?? []);
  const snapshotBefore = new Set(options.snapshotBefore ?? ['update', 'publish', 'disable', 'remove']);

  const createSnapshotBefore = async (action, flowId, extra = {}) => {
    if (!snapshotBefore.has(action) || typeof flowStore.get !== 'function') {
      return null;
    }

    const flow = await flowStore.get(flowId);
    if (!flow) {
      return null;
    }

    const snapshot = createFlowSnapshot(flow, {
      label: extra.label ?? `Before ${action}`,
      reason: extra.reason ?? `before:${action}`,
      createdBy: extra.createdBy ?? options.createdBy ?? '',
      metadata: {
        ...(extra.metadata ?? {}),
        action
      }
    });
    return await snapshotStore.create(snapshot);
  };

  return {
    ...flowStore,
    snapshotStore,

    async listSnapshots(flowId) {
      return await snapshotStore.list(flowId);
    },

    async getSnapshot(id) {
      return await snapshotStore.get(id);
    },

    async createSnapshot(flowId, snapshotOptions = {}) {
      if (typeof flowStore.get !== 'function') {
        throw new Error('FlowStore.get() is required to create a snapshot.');
      }

      const flow = await flowStore.get(flowId);
      if (!flow) {
        throw new Error(`Flow was not found: ${flowId}`);
      }

      return await snapshotStore.create(createFlowSnapshot(flow, snapshotOptions));
    },

    async restoreSnapshot(snapshotId, restoreOptions = {}) {
      const snapshot = await snapshotStore.get(snapshotId);
      if (!snapshot) {
        throw new Error(`Flow snapshot was not found: ${snapshotId}`);
      }

      const restored = restoreFlowSnapshot(snapshot, restoreOptions);
      const existing = typeof flowStore.get === 'function' ? await flowStore.get(restored.id) : null;
      if (existing && typeof flowStore.update === 'function') {
        return await flowStore.update(restored.id, restored);
      }
      if (typeof flowStore.create === 'function') {
        return await flowStore.create(restored);
      }

      throw new Error('FlowStore.create() or FlowStore.update() is required to restore a snapshot.');
    },

    async update(id, patch) {
      await createSnapshotBefore('update', id);
      return await flowStore.update(id, patch);
    },

    async publish(id) {
      await createSnapshotBefore('publish', id);
      return await flowStore.publish(id);
    },

    async disable(id) {
      await createSnapshotBefore('disable', id);
      return await flowStore.disable(id);
    },

    async remove(id) {
      await createSnapshotBefore('remove', id);
      return await flowStore.remove(id);
    }
  };
}
