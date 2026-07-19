import { resolveFlowParams } from './flow-to-plan.js';

export function evaluateFlowCondition(condition, input = {}, context = {}) {
  if (!condition || typeof condition !== 'object') {
    return Boolean(condition);
  }

  if (Array.isArray(condition.all)) {
    return condition.all.every((item) => evaluateFlowCondition(item, input, context));
  }

  if (Array.isArray(condition.any)) {
    return condition.any.some((item) => evaluateFlowCondition(item, input, context));
  }

  if (condition.not !== undefined) {
    return !evaluateFlowCondition(condition.not, input, context);
  }

  const left = resolveFlowParams(condition.left, input, context);
  const right = resolveFlowParams(condition.right, input, context);
  return compareValues(left, condition.operator ?? 'exists', right);
}

export function applyFlowTransform(mapping = {}, input = {}, context = {}) {
  return resolveFlowParams(mapping, input, context);
}

export function compareValues(left, operator, right) {
  switch (operator) {
    case 'eq':
      return left === right;
    case 'neq':
      return left !== right;
    case 'gt':
      return Number(left) > Number(right);
    case 'gte':
      return Number(left) >= Number(right);
    case 'lt':
      return Number(left) < Number(right);
    case 'lte':
      return Number(left) <= Number(right);
    case 'contains':
      return Array.isArray(left)
        ? left.includes(right)
        : String(left ?? '').includes(String(right ?? ''));
    case 'in':
      return Array.isArray(right) && right.includes(left);
    case 'empty':
      return left === undefined || left === null || left === '' || (Array.isArray(left) && left.length === 0);
    case 'exists':
      return left !== undefined && left !== null && left !== '';
    default:
      return false;
  }
}
