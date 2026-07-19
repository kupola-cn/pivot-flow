export const FLOW_API_CONTRACT = Object.freeze({
  flows: '/api/pivot-flows',
  runs: '/api/pivot-flow-runs',
  snapshots: '/api/pivot-flow-snapshots',
  approvals: '/api/pivot-flow-approvals'
});

export function createFlowApiContract(options = {}) {
  const baseUrl = trim(options.baseUrl ?? '');
  return {
    version: '1.0',
    endpoints: {
      listFlows: join(baseUrl, options.flowsUrl ?? FLOW_API_CONTRACT.flows),
      flowRuns: join(baseUrl, options.runsUrl ?? FLOW_API_CONTRACT.runs),
      snapshots: join(baseUrl, options.snapshotsUrl ?? FLOW_API_CONTRACT.snapshots),
      approvals: join(baseUrl, options.approvalsUrl ?? FLOW_API_CONTRACT.approvals)
    },
    requiredStatusCodes: [200, 201, 204, 400, 401, 403, 404, 409, 422, 500],
    responseShape: { ok: 'boolean', data: 'object|array|null', message: 'string', error: 'string' }
  };
}

export function validateFlowApiResponse(payload, options = {}) {
  const errors = [];
  if (!payload || typeof payload !== 'object') {
    errors.push('API response must be an object.');
  } else {
    if (!('data' in payload) && !('error' in payload) && !('message' in payload)) {
      errors.push('API response should include data, message, or error.');
    }
    if ('ok' in payload && typeof payload.ok !== 'boolean') {
      errors.push('API response ok must be boolean when provided.');
    }
  }
  if (options.status && !createFlowApiContract().requiredStatusCodes.includes(Number(options.status))) {
    errors.push(`Unexpected API status code: ${options.status}.`);
  }
  return { valid: errors.length === 0, errors, warnings: errors.length === 0 && !('ok' in (payload ?? {})) ? ['API response ok field is recommended.'] : [] };
}

function trim(value) {
  return String(value).replace(/\/+$/, '');
}

function join(base, path) {
  const suffix = String(path).startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
