import { cloneFlow, createFlow } from './flow-schema.js';
import { createFlowChangeReport, createFlowSnapshot, diffFlows, restoreFlowSnapshot } from './flow-versioning.js';

export function createFlowEditSession(flowInput = {}, options = {}) {
  let baseline = createFlow(flowInput);
  let draft = createFlow(options.draft ?? flowInput);
  const snapshots = [];

  const api = {
    get baseline() {
      return cloneFlow(baseline);
    },

    get draft() {
      return cloneFlow(draft);
    },

    get snapshots() {
      return snapshots.map(cloneFlow);
    },

    get dirty() {
      return diffFlows(baseline, draft, options.diffOptions ?? {}).length > 0;
    },

    get changes() {
      return diffFlows(baseline, draft, options.diffOptions ?? {});
    },

    get report() {
      return createFlowChangeReport(baseline, draft, {
        ...(options.reportOptions ?? {}),
        runtime: options.runtime,
        capabilities: options.capabilities
      });
    },

    update(patch = {}) {
      draft = createFlow({
        ...draft,
        ...cloneFlow(patch ?? {})
      });
      return api.draft;
    },

    replace(nextFlow = {}) {
      draft = createFlow(nextFlow);
      return api.draft;
    },

    mutate(mutator) {
      if (typeof mutator !== 'function') {
        throw new Error('A flow edit mutator function is required.');
      }

      const next = cloneFlow(draft);
      const result = mutator(next);
      draft = createFlow(result ?? next);
      return api.draft;
    },

    reset() {
      draft = createFlow(baseline);
      return api.draft;
    },

    commit(commitOptions = {}) {
      baseline = createFlow(commitOptions.flow ?? draft);
      draft = createFlow(baseline);
      return api.baseline;
    },

    snapshot(snapshotOptions = {}) {
      const snapshot = createFlowSnapshot(draft, snapshotOptions);
      snapshots.unshift(snapshot);
      return cloneFlow(snapshot);
    },

    restore(snapshotOrId, restoreOptions = {}) {
      const snapshot = typeof snapshotOrId === 'string'
        ? snapshots.find((item) => item.id === snapshotOrId)
        : snapshotOrId;

      if (!snapshot) {
        throw new Error(`Flow snapshot was not found: ${String(snapshotOrId || '')}`);
      }

      draft = restoreFlowSnapshot(snapshot, restoreOptions);
      return api.draft;
    },

    getChangeReport(reportOptions = {}) {
      return createFlowChangeReport(baseline, draft, {
        ...(options.reportOptions ?? {}),
        ...reportOptions,
        runtime: reportOptions.runtime ?? options.runtime,
        capabilities: reportOptions.capabilities ?? options.capabilities
      });
    },

    getChanges(diffOptions = {}) {
      return diffFlows(baseline, draft, {
        ...(options.diffOptions ?? {}),
        ...diffOptions
      });
    }
  };

  return api;
}
