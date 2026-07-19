import { createLocalIntentMapper, explainIntentMatches } from './intent-mapper.js';

export function createAIIntentRouterProviderRequest(prompt = '', flows = [], options = {}) {
  return {
    prompt: String(prompt ?? ''),
    flows: (Array.isArray(flows) ? flows : []).map((flow) => ({
      id: flow.id,
      name: flow.name,
      description: flow.description,
      status: flow.status,
      intent: flow.intent
    })),
    minConfidence: options.minConfidence ?? 0.55,
    responseContract: {
      format: 'json',
      shape: { flowId: 'string', confidence: 'number', slots: {}, reason: 'string' }
    }
  };
}

export function parseAIIntentRouterOutput(output = {}) {
  const value = typeof output === 'string' ? parseJSON(output) : output;
  const candidate = value?.flowId ? value : value?.match ?? value?.data ?? {};
  return {
    flowId: String(candidate.flowId ?? '').trim(),
    confidence: clampConfidence(candidate.confidence),
    slots: isPlainObject(candidate.slots) ? candidate.slots : {},
    reason: String(candidate.reason ?? '')
  };
}

export function createHybridIntentRouter(options = {}) {
  const localMapper = options.localMapper ?? createLocalIntentMapper({ minConfidence: options.minConfidence });
  const aiProvider = options.aiProvider ?? null;
  const minConfidence = Number(options.minConfidence ?? 0.55);
  const aiMinConfidence = Number(options.aiMinConfidence ?? minConfidence);

  return {
    async match(prompt, flows = [], matchOptions = {}) {
      const local = localMapper.match(prompt, flows, matchOptions);
      if (local.ok && local.best?.confidence >= minConfidence) {
        return { ok: true, source: 'local', prompt, best: local.best, matches: local.matches, local };
      }
      if (!aiProvider) {
        return { ok: false, source: 'local', prompt, best: local.best, matches: local.matches, local, message: 'No confident local match.' };
      }
      const request = createAIIntentRouterProviderRequest(prompt, flows, { minConfidence: aiMinConfidence });
      const raw = typeof aiProvider === 'function' ? await aiProvider(request) : await aiProvider.match(request);
      const ai = parseAIIntentRouterOutput(raw);
      const flow = flows.find((item) => item.id === ai.flowId);
      if (!flow || ai.confidence < aiMinConfidence) {
        return { ok: false, source: 'ai', prompt, best: local.best, matches: local.matches, local, ai, message: 'No confident AI match.' };
      }
      return {
        ok: true,
        source: 'ai',
        prompt,
        best: { flow, prompt, confidence: ai.confidence, slots: ai.slots, missingSlots: [], reasons: [ai.reason || 'AI structured match'] },
        matches: local.matches,
        local,
        ai
      };
    },

    explain(prompt, flows = [], explainOptions = {}) {
      return explainIntentMatches(prompt, flows, explainOptions);
    }
  };
}

function parseJSON(value) {
  try { return JSON.parse(value); } catch { throw new Error('AI intent router output is not valid JSON.'); }
}

function clampConfidence(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

