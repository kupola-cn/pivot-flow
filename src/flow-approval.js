import { FLOW_STATUS } from './node-types.js';
import { cloneFlow, createId } from './flow-schema.js';
import { createFlowSafetyReport } from './flow-safety-report.js';
import { createFlowAccessReport } from './flow-access-report.js';
import { escapeHTML } from './components/dom.js';

export const FLOW_APPROVAL_STATUS = Object.freeze({
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled'
});

export function createFlowApprovalRequest(flow, options = {}) {
  const now = options.requestedAt ?? new Date().toISOString();
  return {
    id: options.id ?? createId('flow-approval'),
    flowId: flow?.id ?? '',
    flowName: flow?.name ?? '',
    status: FLOW_APPROVAL_STATUS.PENDING,
    requestedAt: now,
    requestedBy: options.requestedBy ?? '',
    reason: options.reason ?? '',
    reviewedAt: null,
    reviewedBy: '',
    reviewComment: '',
    metadata: options.metadata ? cloneFlow(options.metadata) : {},
    flow: cloneFlow(flow ?? {})
  };
}

export function reviewFlowApproval(request = {}, decision = {}) {
  const action = String(decision.action ?? '').toLowerCase();
  if (!['approve', 'reject', 'cancel'].includes(action)) {
    throw new Error('Flow approval decision action must be approve, reject, or cancel.');
  }
  if (request.status !== FLOW_APPROVAL_STATUS.PENDING) {
    throw new Error(`Only pending approval requests can be reviewed: ${request.status || 'unknown'}.`);
  }
  const status = action === 'approve' ? FLOW_APPROVAL_STATUS.APPROVED : action === 'reject' ? FLOW_APPROVAL_STATUS.REJECTED : FLOW_APPROVAL_STATUS.CANCELLED;
  return {
    ...cloneFlow(request),
    status,
    reviewedAt: decision.reviewedAt ?? new Date().toISOString(),
    reviewedBy: decision.reviewedBy ?? '',
    reviewComment: decision.comment ?? ''
  };
}

export function createFlowPublishGate(flow, source, options = {}) {
  const safety = createFlowSafetyReport(flow, source, options);
  const access = createFlowAccessReport(flow, source, options);
  const approval = options.approval ?? null;
  const requiresApproval = options.requiresApproval !== false;
  const approvalOk = !requiresApproval || approval?.status === FLOW_APPROVAL_STATUS.APPROVED;
  const blockingIssues = [
    ...safety.blockingIssues,
    ...(!access.ok ? [access.summary] : []),
    ...(!approvalOk ? ['Flow approval is required before publishing.'] : [])
  ];
  return {
    ok: blockingIssues.length === 0,
    status: blockingIssues.length > 0 ? 'blocked' : safety.status === 'review' || access.status === 'review' ? 'review' : 'ready',
    flowId: flow?.id ?? '',
    flowName: flow?.name ?? '',
    requiresApproval,
    approvalStatus: approval?.status ?? 'missing',
    safety,
    access,
    blockingIssues,
    warnings: [...safety.warnings, ...access.warnings],
    summary: blockingIssues.length > 0 ? `Publish blocked by ${blockingIssues.length} issue(s).` : 'Flow is ready for publish gate.'
  };
}

export function applyApprovedPublish(flow, approval, options = {}) {
  if (approval?.status !== FLOW_APPROVAL_STATUS.APPROVED) {
    throw new Error('An approved Flow approval request is required to publish.');
  }
  if (approval.flowId && flow?.id && approval.flowId !== flow.id) {
    throw new Error(`Approval flow id does not match target flow: ${approval.flowId} != ${flow.id}.`);
  }
  return {
    ...cloneFlow(flow ?? {}),
    status: options.status ?? FLOW_STATUS.PUBLISHED,
    publishedAt: options.publishedAt ?? new Date().toISOString(),
    metadata: {
      ...(flow?.metadata ?? {}),
      publishedByApproval: approval.id
    }
  };
}

export function renderFlowPublishGateToHTML(gateOrFlow, source, options = {}) {
  const gate = gateOrFlow?.safety && gateOrFlow?.access ? gateOrFlow : createFlowPublishGate(gateOrFlow, source, options);
  const issues = gate.blockingIssues.length > 0
    ? `<ul>${gate.blockingIssues.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>`
    : '<small>No blocking publish issues.</small>';
  return `
    <section class="flow-publish-gate flow-publish-gate--${escapeHTML(gate.status)}">
      <header><strong>Publish gate</strong><span>${escapeHTML(gate.summary)}</span></header>
      <div><span><strong>${escapeHTML(gate.approvalStatus)}</strong><small>approval</small></span><span><strong>${escapeHTML(gate.safety.status)}</strong><small>safety</small></span><span><strong>${escapeHTML(gate.access.status)}</strong><small>access</small></span></div>
      ${issues}
      <small>Approval and frontend gates do not replace backend publish authorization.</small>
    </section>
  `;
}
