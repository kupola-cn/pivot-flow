import { FLOW_STATUS } from './node-types.js';
import { escapeHTML } from './components/dom.js';

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
  const explanation = explainFlowIntentMatch(prompt, flow);
  return {
    flow,
    prompt,
    confidence: explanation.confidence,
    slots: explanation.slots,
    missingSlots: explanation.missingSlots,
    reasons: explanation.reasons,
    explanation
  };
}

export function explainIntentMatches(prompt, flows = [], options = {}) {
  const minConfidence = options.minConfidence ?? 0.2;
  const includeDraft = Boolean(options.includeDraft);
  const includeIneligible = Boolean(options.includeIneligible);
  const candidates = (Array.isArray(flows) ? flows : [])
    .map((flow) => explainFlowIntentMatch(prompt, flow, { minConfidence, includeDraft }))
    .filter((candidate) => includeIneligible || candidate.eligible)
    .sort((left, right) => right.confidence - left.confidence)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  const matches = candidates.filter((candidate) => candidate.passedThreshold);
  const limitedCandidates = Number(options.limit) > 0 ? candidates.slice(0, Number(options.limit)) : candidates;

  return {
    ok: matches.length > 0,
    prompt,
    minConfidence,
    best: matches[0] ?? null,
    matches,
    candidates: limitedCandidates
  };
}

export function explainFlowIntentMatch(prompt, flow, options = {}) {
  const minConfidence = options.minConfidence ?? 0.2;
  const includeDraft = Boolean(options.includeDraft);
  const normalizedPrompt = normalizeText(prompt);
  const intent = flow.intent ?? {};
  let score = 0;
  const reasons = [];
  const examples = [];
  const keywords = [];
  const patterns = [];

  for (const example of intent.examples ?? []) {
    const normalizedExample = normalizeText(example);
    if (!normalizedExample) {
      continue;
    }

    if (normalizedPrompt.includes(normalizedExample) || normalizedExample.includes(normalizedPrompt)) {
      score += 0.5;
      reasons.push(`matched example: ${example}`);
      examples.push({ value: example, status: 'matched', score: 0.5 });
    } else {
      const overlap = textOverlap(normalizedPrompt, normalizedExample);
      if (overlap >= 0.5) {
        const exampleScore = overlap * 0.25;
        score += exampleScore;
        reasons.push(`similar example: ${example}`);
        examples.push({ value: example, status: 'similar', score: exampleScore, overlap });
      } else {
        examples.push({ value: example, status: 'missed', score: 0, overlap });
      }
    }
  }

  for (const keyword of intent.keywords ?? []) {
    if (keyword && prompt.includes(keyword)) {
      score += 0.15;
      reasons.push(`matched keyword: ${keyword}`);
      keywords.push({ value: keyword, status: 'matched', score: 0.15 });
    } else if (keyword) {
      keywords.push({ value: keyword, status: 'missed', score: 0 });
    }
  }

  for (const pattern of intent.patterns ?? []) {
    const regexp = compilePattern(pattern);
    if (!regexp) {
      patterns.push({ value: pattern, status: 'invalid', score: 0 });
    } else if (regexp.test(prompt)) {
      score += 0.35;
      reasons.push(`matched pattern: ${pattern}`);
      patterns.push({ value: pattern, status: 'matched', score: 0.35 });
    } else {
      patterns.push({ value: pattern, status: 'missed', score: 0 });
    }
  }

  const slotResult = extractSlots(prompt, intent.slots ?? []);
  if (Object.keys(slotResult.slots).length > 0) {
    const slotScore = Math.min(0.3, Object.keys(slotResult.slots).length * 0.1);
    score += slotScore;
    reasons.push('extracted slots');
  }

  let missingPenalty = 0;
  if (slotResult.missing.length > 0) {
    missingPenalty = Math.min(0.3, slotResult.missing.length * 0.1);
    score -= missingPenalty;
  }

  const confidence = clamp(score, 0, 0.99);
  const eligible = includeDraft || flow.status === FLOW_STATUS.PUBLISHED;

  return {
    flow,
    prompt,
    eligible,
    status: flow.status ?? '',
    confidence,
    passedThreshold: eligible && confidence >= minConfidence,
    slots: slotResult.slots,
    missingSlots: slotResult.missing,
    reasons,
    details: {
      examples,
      keywords,
      patterns,
      slots: Object.entries(slotResult.slots).map(([name, value]) => ({ name, value, status: 'extracted' })),
      missingSlots: slotResult.missing.map((slot) => ({ name: slot.name, label: slot.label || slot.name, status: 'missing' })),
      missingPenalty,
      minConfidence
    }
  };
}

export function renderIntentMatchExplanationToHTML(explanationOrPrompt, flows = [], options = {}) {
  const explanation = typeof explanationOrPrompt === 'string'
    ? explainIntentMatches(explanationOrPrompt, flows, options)
    : explanationOrPrompt;
  const candidates = Array.isArray(explanation?.candidates)
    ? explanation.candidates
    : explanation?.flow
      ? [explanation]
      : [];

  if (candidates.length === 0) {
    return '<div class="flow-empty">No intent match candidates available.</div>';
  }

  return [
    '<section class="flow-intent-explain">',
    '<div class="flow-intent-explain__header">',
    '<span>',
    '<strong>Intent match explanation</strong>',
    `<small>${escapeHTML(explanation.prompt || candidates[0]?.prompt || '')}</small>`,
    '</span>',
    explanation.best ? `<em>Best: ${escapeHTML(explanation.best.flow?.name || explanation.best.flow?.id || '')}</em>` : '<em>No match</em>',
    '</div>',
    '<ol class="flow-intent-explain__candidates">',
    ...candidates.map((candidate) => renderIntentCandidate(candidate)),
    '</ol>',
    '</section>'
  ].join('');
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

function renderIntentCandidate(candidate) {
  const details = candidate.details ?? {};
  const matchedKeywords = (details.keywords ?? []).filter((item) => item.status === 'matched');
  const matchedPatterns = (details.patterns ?? []).filter((item) => item.status === 'matched');
  const matchedExamples = (details.examples ?? []).filter((item) => item.status === 'matched' || item.status === 'similar');
  const slots = details.slots ?? [];
  const missingSlots = details.missingSlots ?? [];

  return [
    `<li class="flow-intent-explain__candidate${candidate.passedThreshold ? ' is-match' : ''}">`,
    '<div class="flow-intent-explain__candidate-head">',
    '<span>',
    `<strong>${escapeHTML(candidate.flow?.name || candidate.flow?.id || 'Untitled flow')}</strong>`,
    `<small>${escapeHTML(candidate.flow?.id || '')}${candidate.eligible ? '' : ' · not eligible'}</small>`,
    '</span>',
    `<em>${escapeHTML(Math.round((candidate.confidence ?? 0) * 100))}%</em>`,
    '</div>',
    candidate.reasons?.length
      ? `<p>${escapeHTML(candidate.reasons.join(' · '))}</p>`
      : '<p>No local rule produced a score for this flow.</p>',
    '<div class="flow-intent-explain__facts">',
    renderIntentFact('Examples', matchedExamples.map((item) => item.value)),
    renderIntentFact('Keywords', matchedKeywords.map((item) => item.value)),
    renderIntentFact('Patterns', matchedPatterns.map((item) => item.value)),
    renderIntentFact('Slots', slots.map((item) => `${item.name}: ${formatFactValue(item.value)}`)),
    renderIntentFact('Missing', missingSlots.map((item) => item.label || item.name)),
    '</div>',
    '</li>'
  ].join('');
}

function renderIntentFact(label, values) {
  const safeValues = Array.isArray(values) ? values.filter((value) => value !== undefined && value !== null && String(value).trim()) : [];
  if (safeValues.length === 0) {
    return '';
  }
  return [
    '<span>',
    `<strong>${escapeHTML(label)}</strong>`,
    `<small>${escapeHTML(safeValues.join(', '))}</small>`,
    '</span>'
  ].join('');
}

function formatFactValue(value) {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}
