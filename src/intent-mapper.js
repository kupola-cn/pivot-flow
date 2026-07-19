import { FLOW_STATUS } from './node-types.js';

export function createLocalIntentMapper(options = {}) {
  const minConfidence = options.minConfidence ?? 0.2;

  return {
    match(prompt, flows = [], matchOptions = {}) {
      const entries = Array.isArray(flows) ? flows : [];
      const includeDraft = Boolean(matchOptions.includeDraft);
      const normalizedPrompt = normalizeText(prompt);

      const matches = entries
        .filter((flow) => includeDraft || flow.status === FLOW_STATUS.PUBLISHED)
        .map((flow) => scoreFlow(prompt, normalizedPrompt, flow))
        .filter((match) => match.confidence >= minConfidence)
        .sort((left, right) => right.confidence - left.confidence);

      return {
        ok: matches.length > 0,
        prompt,
        best: matches[0] ?? null,
        matches
      };
    }
  };
}

export function scoreFlow(prompt, normalizedPrompt, flow) {
  const intent = flow.intent ?? {};
  let score = 0;
  const reasons = [];

  for (const example of intent.examples ?? []) {
    const normalizedExample = normalizeText(example);
    if (!normalizedExample) {
      continue;
    }

    if (normalizedPrompt.includes(normalizedExample) || normalizedExample.includes(normalizedPrompt)) {
      score += 0.5;
      reasons.push(`matched example: ${example}`);
    } else {
      const overlap = textOverlap(normalizedPrompt, normalizedExample);
      if (overlap >= 0.5) {
        score += overlap * 0.25;
        reasons.push(`similar example: ${example}`);
      }
    }
  }

  for (const keyword of intent.keywords ?? []) {
    if (keyword && prompt.includes(keyword)) {
      score += 0.15;
      reasons.push(`matched keyword: ${keyword}`);
    }
  }

  for (const pattern of intent.patterns ?? []) {
    const regexp = compilePattern(pattern);
    if (regexp?.test(prompt)) {
      score += 0.35;
      reasons.push(`matched pattern: ${pattern}`);
    }
  }

  const slotResult = extractSlots(prompt, intent.slots ?? []);
  if (Object.keys(slotResult.slots).length > 0) {
    score += Math.min(0.3, Object.keys(slotResult.slots).length * 0.1);
    reasons.push('extracted slots');
  }

  if (slotResult.missing.length > 0) {
    score -= Math.min(0.3, slotResult.missing.length * 0.1);
  }

  const confidence = clamp(score, 0, 0.99);

  return {
    flow,
    prompt,
    confidence,
    slots: slotResult.slots,
    missingSlots: slotResult.missing,
    reasons
  };
}

export function extractSlots(prompt, slots = []) {
  const output = {};
  const missing = [];

  for (const slot of Array.isArray(slots) ? slots : []) {
    if (!slot?.name) {
      continue;
    }

    let value = undefined;

    if (slot.pattern) {
      const regexp = compilePattern(slot.pattern);
      const match = regexp?.exec(prompt);
      if (match) {
        value = match.groups?.[slot.name] ?? match[1] ?? match[0];
      }
    }

    if ((value === undefined || value === '') && slot.fallback !== undefined) {
      value = slot.fallback;
    }

    if (value !== undefined && value !== '') {
      output[slot.name] = coerceSlotValue(value, slot);
      continue;
    }

    if (slot.required) {
      missing.push(slot);
    }
  }

  return { slots: output, missing };
}

function coerceSlotValue(value, slot) {
  if (slot.type === 'number') {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : value;
  }

  if (slot.type === 'boolean') {
    if (value === true || value === 'true' || value === '是') {
      return true;
    }
    if (value === false || value === 'false' || value === '否') {
      return false;
    }
  }

  return value;
}

function compilePattern(pattern) {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

function textOverlap(left, right) {
  const leftChars = new Set(Array.from(left));
  const rightChars = new Set(Array.from(right));
  if (leftChars.size === 0 || rightChars.size === 0) {
    return 0;
  }

  let hits = 0;
  for (const char of leftChars) {
    if (rightChars.has(char)) {
      hits += 1;
    }
  }

  return hits / Math.max(leftChars.size, rightChars.size);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
