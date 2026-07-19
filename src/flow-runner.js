import { flowToPlan } from './flow-to-plan.js';
import { createMemoryFlowStore } from './flow-store.js';
import { createIntentClarificationPlan, createLocalIntentMapper } from './intent-mapper.js';
import { createFlowRunRecord } from './flow-run-record.js';

export function createFlowRunner(options = {}) {
  const runtime = options.runtime;
  const flowStore = options.flowStore ?? createMemoryFlowStore(options.flows ?? []);
  const intentMapper = options.intentMapper ?? createLocalIntentMapper();
  const contextProvider = options.contextProvider;

  if (!runtime) {
    throw new Error('PIVOT runtime is required to create a FlowRunner.');
  }

  const getContext = async () => {
    if (typeof contextProvider === 'function') {
      return await contextProvider();
    }

    return options.context ?? {};
  };

  const match = async (prompt, matchOptions = {}) => {
    const flows = await flowStore.list(matchOptions.query ?? {});
    const matchResult = intentMapper.match(prompt, flows, matchOptions);
    const clarification = createIntentClarificationPlan({
      ok: matchResult.ok,
      prompt,
      best: matchResult.best,
      matches: matchResult.matches ?? [],
      candidates: matchResult.matches ?? []
    }, matchOptions.clarification ?? {});
    return {
      ok: matchResult.ok,
      prompt,
      match: matchResult.best,
      matches: matchResult.matches,
      clarification,
      message: matchResult.ok ? 'Flow matched.' : 'No published flow matched this intent.'
    };
  };

  const createPlanFromMatch = async (matchEntry, prompt, input = {}) => {
    const context = await getContext();
    const plan = flowToPlan(matchEntry.flow, {
      ...input,
      prompt,
      slots: {
        ...(matchEntry.slots ?? {}),
        ...(input.slots ?? {})
      }
    }, context);

    return { context, plan };
  };

  const preview = async (prompt, input = {}) => {
    const matched = input.match
      ? { ok: true, prompt, match: input.match, matches: [input.match], message: 'Flow matched.' }
      : await match(prompt, input.matchOptions ?? {});

    if (!matched.match) {
      return {
        ok: false,
        stage: 'match',
        prompt,
        message: matched.message,
        match: null,
        matches: matched.matches ?? [],
        missingSlots: [],
        clarification: matched.clarification ?? createIntentClarificationPlan(matched)
      };
    }

    const mergedSlots = {
      ...(matched.match.slots ?? {}),
      ...(input.slots ?? {})
    };
    const missingSlots = getUnfilledMissingSlots(matched.match.missingSlots, mergedSlots);

    if (missingSlots.length > 0) {
      return {
        ok: false,
        stage: 'slots',
        prompt,
        message: 'Required flow slots are missing.',
        match: matched.match,
        matches: matched.matches ?? [],
        missingSlots,
        slots: mergedSlots,
        clarification: createIntentClarificationPlan({
          ...matched,
          best: {
            ...matched.match,
            missingSlots
          },
          matches: (matched.matches ?? []).map((entry) => entry === matched.match ? { ...entry, missingSlots } : entry)
        })
      };
    }

    const prepared = await createPlanFromMatch(matched.match, prompt, {
      ...input,
      slots: mergedSlots
    });
    const previewResult = await runtime.previewPlan(prepared.plan, prepared.context);

    return {
      ok: previewResult.ok,
      stage: 'preview',
      prompt,
      message: previewResult.message,
      match: matched.match,
      matches: matched.matches ?? [],
      missingSlots: [],
      slots: mergedSlots,
      clarification: createIntentClarificationPlan({
        ...matched,
        best: {
          ...matched.match,
          missingSlots: []
        },
        matches: (matched.matches ?? []).map((entry) => entry === matched.match ? { ...entry, missingSlots: [] } : entry)
      }),
      plan: prepared.plan,
      context: prepared.context,
      preview: previewResult
    };
  };

  const execute = async (prompt, input = {}) => {
    const previewed = input.preview?.plan
      ? input.preview
      : await preview(prompt, input);

    if (!previewed.ok) {
      return {
        ...previewed,
        stage: previewed.stage ?? 'preview',
        result: previewed.preview ?? null
      };
    }

    const result = await runtime.executePlan(previewed.plan, previewed.context, input.executeOptions ?? {});

    if (typeof flowStore.recordRun === 'function') {
      await flowStore.recordRun(createFlowRunRecord({
        flow: previewed.match?.flow,
        prompt,
        result
      }, {
        ...(options.runRecord ?? {}),
        ...(input.runRecord ?? {})
      }));
    }

    return {
      ...previewed,
      ok: result.ok,
      stage: 'execute',
      message: result.message,
      result
    };
  };

  return {
    runtime,
    flowStore,
    intentMapper,
    match,
    preview,
    execute
  };
}

export function getUnfilledMissingSlots(missingSlots = [], slots = {}) {
  if (!Array.isArray(missingSlots) || missingSlots.length === 0) {
    return [];
  }

  return missingSlots.filter((slot) => {
    const value = slots?.[slot.name];
    return value === undefined || value === null || value === '';
  });
}
