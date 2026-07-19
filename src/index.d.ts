import type { PivotRuntime, PivotPlan, PivotResult, PivotCapability } from '@kupola/pivot';

export type FlowStatus = 'draft' | 'published' | 'disabled' | 'archived';
export type FlowRisk = 'low' | 'medium' | 'high' | 'critical';
export type FlowNodeType =
  | 'intent.input'
  | 'api.call'
  | 'capability.run'
  | 'condition'
  | 'confirm'
  | 'transform'
  | 'message.show'
  | 'route.navigate'
  | 'table.refresh'
  | 'form.open'
  | 'drawer.open'
  | 'modal.open'
  | 'audit.mark';

export interface FlowSlot {
  name: string;
  label?: string;
  type?: 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'object';
  required?: boolean;
  source?: 'intent' | 'context' | 'node' | 'manual';
  pattern?: string;
  options?: string[];
  fallback?: unknown;
  sensitive?: boolean;
  inputType?: 'text' | 'password' | 'number' | 'date' | 'email' | 'tel' | 'url';
}

export interface FlowIntentConfig {
  examples?: string[];
  patterns?: string[];
  keywords?: string[];
  slots?: FlowSlot[];
  ai?: {
    enabled?: boolean;
    provider?: string;
    schema?: Record<string, unknown>;
  };
}

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  label?: string;
  capability?: string;
  params?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  risk?: FlowRisk;
  requiresConfirmation?: boolean;
  condition?: unknown;
  ui?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface FlowEdge {
  id?: string;
  from: string;
  to: string;
  condition?: 'always' | 'success' | 'failure' | 'skipped' | Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface FlowDefinition {
  id: string;
  name: string;
  description?: string;
  version?: string;
  status?: FlowStatus;
  intent?: FlowIntentConfig;
  variables?: unknown[];
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  permissions?: string[];
  risk?: FlowRisk;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string | null;
}

export interface FlowValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface FlowMatch {
  flow: FlowDefinition;
  prompt: string;
  confidence: number;
  slots: Record<string, unknown>;
  missingSlots: FlowSlot[];
  reasons: string[];
}

export interface FlowMatchResult {
  ok: boolean;
  prompt: string;
  best: FlowMatch | null;
  matches: FlowMatch[];
}

export interface IntentMapper {
  match(prompt: string, flows: FlowDefinition[], options?: { includeDraft?: boolean }): FlowMatchResult;
}

export interface FlowIntentRuleScore {
  status: 'matched' | 'similar' | 'missed' | 'invalid' | 'extracted' | 'missing';
  score?: number;
  overlap?: number;
  name?: string;
  label?: string;
  value?: unknown;
}

export interface FlowIntentMatchExplanation extends FlowMatch {
  eligible: boolean;
  status: string;
  passedThreshold: boolean;
  rank?: number;
  details: {
    examples: FlowIntentRuleScore[];
    keywords: FlowIntentRuleScore[];
    patterns: FlowIntentRuleScore[];
    slots: FlowIntentRuleScore[];
    missingSlots: FlowIntentRuleScore[];
    missingPenalty: number;
    minConfidence: number;
  };
}

export interface FlowIntentMatchExplanationResult {
  ok: boolean;
  prompt: string;
  minConfidence: number;
  best: FlowIntentMatchExplanation | null;
  matches: FlowIntentMatchExplanation[];
  candidates: FlowIntentMatchExplanation[];
}

export interface FlowIntentClarificationPlan {
  needed: boolean;
  reason: 'ready' | 'no-match' | 'ambiguous' | 'missing-slots';
  prompt: string;
  best: FlowIntentMatchExplanation | null;
  candidates: FlowIntentMatchExplanation[];
  missingSlots: FlowSlot[];
  questions: string[];
  suggestions: string[];
  message: string;
}

export interface FlowStore {
  list(query?: { status?: FlowStatus; keyword?: string }): Promise<FlowDefinition[]>;
  get(id: string): Promise<FlowDefinition | null>;
  create(flow: Partial<FlowDefinition>): Promise<FlowDefinition>;
  update(id: string, patch: Partial<FlowDefinition>): Promise<FlowDefinition>;
  remove(id: string): Promise<void>;
  publish(id: string): Promise<FlowDefinition>;
  disable(id: string): Promise<FlowDefinition>;
  recordRun?(record: Record<string, unknown>): Promise<Record<string, unknown>>;
  listRuns?(flowId?: string): Promise<Record<string, unknown>[]>;
}

export interface FlowTemplate {
  id: string;
  name: string;
  group?: string;
  description?: string;
  flow: Partial<FlowDefinition>;
}

export function createFlow(input?: Partial<FlowDefinition>): FlowDefinition;
export function createFlowNode(input?: Partial<FlowNode>): FlowNode;
export function createFlowEdge(input?: Partial<FlowEdge>): FlowEdge;
export function normalizeFlow(flow: Partial<FlowDefinition>): FlowDefinition;
export function cloneFlow<T = unknown>(flow: T): T;
export function duplicateFlow(flow?: Partial<FlowDefinition>, overrides?: Partial<FlowDefinition>): FlowDefinition;
export function validateFlow(flow: FlowDefinition, options?: { capabilities?: unknown }): FlowValidationResult;
export function canConnectFlowNodes(flow: FlowDefinition, from?: string, to?: string, options?: {
  edgeId?: string;
  condition?: FlowEdge['condition'];
}): {
  ok: boolean;
  valid: boolean;
  message: string;
};
export const FLOW_EXPORT_SCHEMA: 'kupola.pivot-flow.export.v1';
export interface FlowExportPayload {
  schema: typeof FLOW_EXPORT_SCHEMA;
  version: 1;
  exportedAt: string;
  metadata: Record<string, unknown>;
  flows: FlowDefinition[];
}
export interface FlowImportItem {
  index: number;
  ok: boolean;
  status: 'ready' | 'review' | 'blocked';
  action: 'create' | 'create-with-new-id' | 'replace-candidate' | 'skip' | string;
  originalId: string;
  flowId: string;
  flowName: string;
  flow: FlowDefinition | null;
  validation: FlowValidationResult;
  errors: string[];
  warnings: string[];
}
export interface FlowImportReport {
  ok: boolean;
  status: 'ready' | 'review' | 'blocked';
  schema: string;
  importedAt: string;
  importedFrom: string;
  total: number;
  readyCount: number;
  reviewCount: number;
  blockedCount: number;
  flows: FlowDefinition[];
  items: FlowImportItem[];
  blockingIssues: string[];
  warnings: string[];
  summary: string;
}
export function createFlowExportPayload(flows?: FlowDefinition | FlowDefinition[], options?: {
  exportedAt?: string;
  metadata?: Record<string, unknown>;
}): FlowExportPayload;
export function exportFlowToJSON(flow: FlowDefinition, options?: {
  exportedAt?: string;
  metadata?: Record<string, unknown>;
  compact?: boolean;
  space?: number;
}): string;
export function exportFlowsToJSON(flows?: FlowDefinition[], options?: {
  exportedAt?: string;
  metadata?: Record<string, unknown>;
  compact?: boolean;
  space?: number;
}): string;
export function parseFlowImportJSON(value: string | object): {
  schema: string;
  version: number | null;
  importedAt: string;
  metadata: Record<string, unknown>;
  flows: unknown[];
};
export function prepareImportedFlow(flow?: Partial<FlowDefinition>, options?: {
  importedAt?: string;
  importedFrom?: string;
  existingIds?: string[] | Set<string>;
  existingFlows?: FlowDefinition[];
  preserveIds?: boolean;
  preserveStatus?: boolean;
  conflictStrategy?: 'regenerate' | 'keep';
  createdAt?: string;
  updatedAt?: string;
}): FlowDefinition;
export function createFlowImportReport(input: string | object, options?: {
  importedAt?: string;
  importedFrom?: string;
  existingIds?: string[] | Set<string>;
  existingFlows?: FlowDefinition[];
  preserveIds?: boolean;
  preserveStatus?: boolean;
  conflictStrategy?: 'regenerate' | 'keep';
  capabilities?: unknown;
  runtime?: PivotRuntime;
}): FlowImportReport;
export function importFlowsToStore(inputOrReport: string | object | FlowImportReport, flowStore: FlowStore, options?: {
  importedAt?: string;
  importedFrom?: string;
  existingIds?: string[] | Set<string>;
  existingFlows?: FlowDefinition[];
  preserveIds?: boolean;
  preserveStatus?: boolean;
  conflictStrategy?: 'regenerate' | 'keep';
  capabilities?: unknown;
  runtime?: PivotRuntime;
}): Promise<{
  ok: boolean;
  createdCount: number;
  skippedCount: number;
  flows: FlowDefinition[];
  errors: string[];
  report: FlowImportReport;
}>;
export function renderFlowImportReportToHTML(reportOrInput: FlowImportReport | string | object, options?: {
  importedAt?: string;
  importedFrom?: string;
  existingIds?: string[] | Set<string>;
  existingFlows?: FlowDefinition[];
  preserveIds?: boolean;
  preserveStatus?: boolean;
  conflictStrategy?: 'regenerate' | 'keep';
  capabilities?: unknown;
  runtime?: PivotRuntime;
}): string;
export interface FlowDataReference {
  source: 'node' | 'intent' | 'context';
  raw: string;
  fromNodeId: string;
  refPath: string;
  path: string;
}
export interface FlowDataDependency extends FlowDataReference {
  toNodeId: string;
  status: 'upstream' | 'external' | 'missing-node' | 'self' | 'downstream' | 'unconnected';
  message: string;
}
export interface FlowDataDependencyReport {
  ok: boolean;
  status: 'ready' | 'review' | 'blocked';
  flowId: string;
  flowName: string;
  total: number;
  upstreamCount: number;
  externalCount: number;
  warningCount: number;
  blockingCount: number;
  dependencies: FlowDataDependency[];
  blocking: FlowDataDependency[];
  warnings: FlowDataDependency[];
  summary: string;
}
export function analyzeFlowDataDependencies(flow?: FlowDefinition | null): FlowDataDependencyReport;
export function extractFlowDataReferences(value?: unknown, path?: string): FlowDataReference[];
export function renderFlowDataDependenciesToHTML(reportOrFlow?: FlowDataDependencyReport | FlowDefinition | null): string;
export interface FlowNodeNeighborhoodReport {
  ok: boolean;
  flowId: string;
  flowName: string;
  nodeId: string;
  node: FlowNode | null;
  depth: number;
  upstream: {
    nodeIds: string[];
    edgeIds: string[];
    nodes: FlowNode[];
    edges: FlowEdge[];
  };
  downstream: {
    nodeIds: string[];
    edgeIds: string[];
    nodes: FlowNode[];
    edges: FlowEdge[];
  };
  relatedNodeIds: string[];
  relatedEdgeIds: string[];
  relatedNodes: FlowNode[];
  relatedEdges: FlowEdge[];
  summary: string;
}
export function getFlowNodeNeighborhood(flow?: FlowDefinition | null, nodeId?: string, options?: {
  depth?: number;
}): FlowNodeNeighborhoodReport;
export function renderFlowNodeNeighborhoodToHTML(flowOrReport?: FlowDefinition | FlowNodeNeighborhoodReport | null, nodeId?: string, options?: {
  depth?: number;
}): string;
export interface FlowAccessRow {
  id: string;
  source: 'flow' | 'node' | string;
  label: string;
  nodeId: string;
  capability: string;
  permissions: string[];
  missingPermissions: string[];
  status: 'allowed' | 'blocked' | 'unknown';
}
export interface FlowAccessReport {
  ok: boolean;
  status: 'allowed' | 'review' | 'blocked';
  flowId: string;
  flowName: string;
  actorId: string;
  actorName: string;
  actorKnown: boolean;
  actorPermissions: string[];
  requiredPermissions: string[];
  missingPermissions: string[];
  rows: FlowAccessRow[];
  warnings: string[];
  summary: string;
}
export function createFlowAccessReport(flow?: FlowDefinition | null, source?: PivotRuntime | PivotCapability[] | { list(filter?: Record<string, unknown>): PivotCapability[] }, options?: {
  runtime?: PivotRuntime;
  capabilities?: PivotCapability[];
  actor?: Record<string, unknown> & { permissions?: string[] };
  context?: Record<string, unknown> & { actor?: Record<string, unknown> & { permissions?: string[] } };
}): FlowAccessReport;
export function renderFlowAccessReportToHTML(reportOrFlow?: FlowAccessReport | FlowDefinition | null, source?: PivotRuntime | PivotCapability[] | { list(filter?: Record<string, unknown>): PivotCapability[] }, options?: {
  runtime?: PivotRuntime;
  capabilities?: PivotCapability[];
  actor?: Record<string, unknown> & { permissions?: string[] };
  context?: Record<string, unknown> & { actor?: Record<string, unknown> & { permissions?: string[] } };
}): string;
export function hasPermission(actorPermissions?: string[], requiredPermission?: string): boolean;
export interface FlowSafetyCapabilityRow {
  nodeId: string;
  nodeLabel: string;
  capability: string;
  registered: boolean | null;
  registrationStatus: 'registered' | 'missing' | 'unknown';
  resource: string;
  action: string;
  risk: FlowRisk | string;
  confirmationRequired: boolean;
  requiresConfirmation: boolean;
  confirmationStatus: 'required' | 'missing' | 'not-required';
  permissions: string[];
  permissionStatus: 'declared' | 'missing';
  backendRequired: boolean;
}
export interface FlowSafetyCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}
export interface FlowSafetySensitiveSlot {
  name: string;
  label: string;
  source: string;
  inputType: string;
  required: boolean;
  safe: boolean;
}
export interface FlowSafetyReport {
  ok: boolean;
  status: 'ready' | 'review' | 'blocked';
  flowId: string;
  flowName: string;
  flowStatus: string;
  risk: FlowRisk | string;
  summary: string;
  checks: FlowSafetyCheck[];
  capabilities: FlowSafetyCapabilityRow[];
  dataDependencies: FlowDataDependencyReport;
  sensitiveSlots: FlowSafetySensitiveSlot[];
  backendRequirements: string[];
  blockingIssues: string[];
  warnings: string[];
}
export interface FlowBatchSafetyReport {
  ok: boolean;
  status: 'ready' | 'review' | 'blocked';
  total: number;
  readyCount: number;
  reviewCount: number;
  blockedCount: number;
  riskCounts: Record<string, number>;
  highestRisk: FlowRisk | string;
  checkSummaries: Array<{
    id: string;
    label: string;
    status: 'pass' | 'warn' | 'fail';
    passCount: number;
    warnCount: number;
    failCount: number;
    messages: string[];
  }>;
  blockedFlows: FlowBatchSafetyFlowSummary[];
  reviewFlows: FlowBatchSafetyFlowSummary[];
  readyFlows: FlowBatchSafetyFlowSummary[];
  reports: FlowSafetyReport[];
  blockingIssues: string[];
  warnings: string[];
  summary: string;
}
export interface FlowBatchSafetyFlowSummary {
  flowId: string;
  flowName: string;
  flowStatus: string;
  status: 'ready' | 'review' | 'blocked';
  risk: FlowRisk | string;
  blockingCount: number;
  warningCount: number;
  summary: string;
}
export function createFlowSafetyReport(flow?: FlowDefinition | null, source?: PivotRuntime | PivotCapability[] | { list(filter?: Record<string, unknown>): PivotCapability[] }, options?: {
  runtime?: PivotRuntime;
  capabilities?: PivotCapability[];
}): FlowSafetyReport;
export function createFlowBatchSafetyReport(flows?: FlowDefinition[], source?: PivotRuntime | PivotCapability[] | { list(filter?: Record<string, unknown>): PivotCapability[] }, options?: {
  runtime?: PivotRuntime;
  capabilities?: PivotCapability[];
}): FlowBatchSafetyReport;
export function renderFlowSafetyReportToHTML(reportOrFlow?: FlowSafetyReport | FlowDefinition | null, source?: PivotRuntime | PivotCapability[] | { list(filter?: Record<string, unknown>): PivotCapability[] }, options?: {
  runtime?: PivotRuntime;
  capabilities?: PivotCapability[];
}): string;
export function renderFlowBatchSafetyReportToHTML(reportOrFlows?: FlowBatchSafetyReport | FlowDefinition[], source?: PivotRuntime | PivotCapability[] | { list(filter?: Record<string, unknown>): PivotCapability[] }, options?: {
  runtime?: PivotRuntime;
  capabilities?: PivotCapability[];
  maxWarnings?: number;
}): string;
export function flowToPlan(flow: FlowDefinition, input?: { prompt?: string; slots?: Record<string, unknown>; planId?: string }, context?: Record<string, unknown>): PivotPlan;
export function resolveFlowParams(value: unknown, input?: Record<string, unknown>, context?: Record<string, unknown>): unknown;
export function evaluateFlowCondition(condition: unknown, input?: Record<string, unknown>, context?: Record<string, unknown>): boolean;
export function applyFlowTransform(mapping?: Record<string, unknown>, input?: Record<string, unknown>, context?: Record<string, unknown>): unknown;
export function compareValues(left: unknown, operator: string, right?: unknown): boolean;
export function createLocalIntentMapper(options?: { minConfidence?: number }): IntentMapper;
export function scoreFlow(prompt: string, normalizedPrompt: string, flow: FlowDefinition): FlowMatch & {
  explanation: FlowIntentMatchExplanation;
};
export function explainFlowIntentMatch(prompt?: string, flow?: FlowDefinition, options?: {
  minConfidence?: number;
  includeDraft?: boolean;
}): FlowIntentMatchExplanation;
export function explainIntentMatches(prompt?: string, flows?: FlowDefinition[], options?: {
  minConfidence?: number;
  includeDraft?: boolean;
  includeIneligible?: boolean;
  limit?: number;
}): FlowIntentMatchExplanationResult;
export function renderIntentMatchExplanationToHTML(explanationOrPrompt?: FlowIntentMatchExplanationResult | FlowIntentMatchExplanation | string, flows?: FlowDefinition[], options?: {
  minConfidence?: number;
  includeDraft?: boolean;
  includeIneligible?: boolean;
  limit?: number;
}): string;
export function createIntentClarificationPlan(matchOrExplanation?: FlowIntentMatchExplanationResult | FlowIntentMatchExplanation | FlowMatchResult | FlowMatch, options?: {
  maxCandidates?: number;
  ambiguityThreshold?: number;
}): FlowIntentClarificationPlan;
export function renderIntentClarificationPlanToHTML(planOrExplanation?: FlowIntentClarificationPlan | FlowIntentMatchExplanationResult | FlowIntentMatchExplanation | FlowMatchResult | FlowMatch, options?: {
  maxCandidates?: number;
  ambiguityThreshold?: number;
}): string;
export function createMemoryFlowStore(initialFlows?: FlowDefinition[]): FlowStore;
export function createLocalStorageFlowStore(options?: { key?: string; runKey?: string; storage?: Storage; initialFlows?: FlowDefinition[] }): FlowStore;
export function createHttpFlowStore(options?: {
  baseUrl?: string;
  runsUrl?: string;
  fetcher?: typeof fetch;
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
  credentials?: RequestCredentials;
}): FlowStore;
export const BUILT_IN_FLOW_TEMPLATES: readonly FlowTemplate[];
export function listFlowTemplates(query?: { group?: string; keyword?: string }): FlowTemplate[];
export function getFlowTemplate(id: string): FlowTemplate | null;
export function createFlowFromTemplate(templateOrId: string | FlowTemplate, overrides?: Partial<FlowDefinition>): FlowDefinition;
export function createFlowRunner(options: {
  runtime: PivotRuntime;
  flowStore?: FlowStore;
  flows?: FlowDefinition[];
  intentMapper?: IntentMapper;
  contextProvider?: () => Record<string, unknown> | Promise<Record<string, unknown>>;
  context?: Record<string, unknown>;
  runRecord?: {
    includeRawResult?: boolean;
    maxNodes?: number;
    maxDepth?: number;
    maxArrayItems?: number;
    maxStringLength?: number;
    summaryDepth?: number;
  };
}): {
  runtime: PivotRuntime;
  flowStore: FlowStore;
  intentMapper: IntentMapper;
  match(prompt: string, options?: Record<string, unknown>): Promise<{
    ok: boolean;
    prompt: string;
    match: FlowMatch | null;
    matches: FlowMatch[];
    clarification?: FlowIntentClarificationPlan;
    message: string;
  }>;
  preview(prompt: string, input?: Record<string, unknown>): Promise<{
    ok: boolean;
    stage: string;
    prompt: string;
    message: string;
    match: FlowMatch | null;
    matches?: FlowMatch[];
    missingSlots?: FlowSlot[];
    slots?: Record<string, unknown>;
    clarification?: FlowIntentClarificationPlan;
    plan?: PivotPlan;
    context?: Record<string, unknown>;
    preview?: PivotResult;
  }>;
  execute(prompt: string, input?: Record<string, unknown>): Promise<{
    ok: boolean;
    stage: string;
    prompt: string;
    message: string;
    match: FlowMatch | null;
    missingSlots?: FlowSlot[];
    slots?: Record<string, unknown>;
    clarification?: FlowIntentClarificationPlan;
    plan?: PivotPlan;
    context?: Record<string, unknown>;
    preview?: PivotResult;
    result?: PivotResult;
  }>;
};
export function getUnfilledMissingSlots(missingSlots?: FlowSlot[], slots?: Record<string, unknown>): FlowSlot[];
export interface FlowExecutionNodeState {
  status: 'idle' | 'executed' | 'failed' | 'skipped';
  result?: unknown;
  durationMs?: number;
  message?: string;
  code?: string;
  label?: string;
  capability?: string;
}
export interface FlowRunSummaryNode {
  id: string;
  label: string;
  index: number;
  type: string;
  capability: string;
  risk: FlowRisk | string;
  status: 'idle' | 'executed' | 'failed' | 'skipped';
  durationMs: number;
  message: string;
  code: string;
}
export interface FlowRunSummary {
  ok: boolean;
  status: 'idle' | 'success' | 'failed';
  message: string;
  code: string;
  durationMs: number;
  totalNodes: number;
  executedCount: number;
  failedCount: number;
  skippedCount: number;
  nodeItems: FlowRunSummaryNode[];
  failedNodes: FlowRunSummaryNode[];
  slowestNodes: FlowRunSummaryNode[];
  firstFailedNode: FlowRunSummaryNode | null;
  slowestNode: FlowRunSummaryNode | null;
  recommendations: string[];
}
export function getFlowRunSummary(result?: PivotResult | null, flowOrNodes?: FlowDefinition | FlowNode[], options?: {
  edges?: FlowEdge[];
  slowestLimit?: number;
}): FlowRunSummary;
export function renderFlowRunSummaryToHTML(summaryOrResult?: FlowRunSummary | PivotResult | null, options?: {
  flow?: FlowDefinition;
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  slowestLimit?: number;
}): string;
export function createFlowRunRecord(input?: {
  flow?: FlowDefinition;
  flowId?: string;
  flowName?: string;
  prompt?: string;
  ok?: boolean;
  message?: string;
  result?: PivotResult | null;
  preview?: PivotResult | null;
}, options?: {
  includeRawResult?: boolean;
  maxNodes?: number;
  maxDepth?: number;
  maxArrayItems?: number;
  maxStringLength?: number;
  summaryDepth?: number;
}): Record<string, unknown>;
export function summarizeFlowRunResult(result?: PivotResult | null, options?: {
  maxNodes?: number;
  maxDepth?: number;
  maxArrayItems?: number;
  maxStringLength?: number;
  summaryDepth?: number;
}): Record<string, unknown> | null;
export function sanitizeFlowRunValue(value?: unknown, options?: {
  maxDepth?: number;
  maxArrayItems?: number;
  maxStringLength?: number;
}, depth?: number, key?: string): unknown;
export interface FlowRunHistorySummary {
  total: number;
  successCount: number;
  failedCount: number;
  latestAt: string;
  latestStatus: 'success' | 'failed' | 'unknown' | '';
}
export function filterFlowRuns(runs?: Record<string, unknown>[], options?: {
  flowId?: string;
  keyword?: string;
  status?: 'success' | 'failed' | string;
  dateRange?: '24h' | '7d' | '30d' | string;
  range?: '24h' | '7d' | '30d' | string;
  now?: number | string;
  limit?: number;
}): Record<string, unknown>[];
export function createFlowRunHistorySummary(runs?: Record<string, unknown>[], options?: {
  flowId?: string;
  keyword?: string;
  status?: 'success' | 'failed' | string;
  dateRange?: '24h' | '7d' | '30d' | string;
  range?: '24h' | '7d' | '30d' | string;
  now?: number | string;
  limit?: number;
}): FlowRunHistorySummary;
export function renderFlowRunHistoryToHTML(runs?: Record<string, unknown>[], options?: {
  flow?: FlowDefinition;
  nodes?: FlowNode[];
  flowId?: string;
  keyword?: string;
  status?: 'success' | 'failed' | string;
  dateRange?: '24h' | '7d' | '30d' | string;
  range?: '24h' | '7d' | '30d' | string;
  now?: number | string;
  limit?: number;
  title?: boolean;
  controls?: boolean;
}): string;
export function getFlowResultDurationMs(item?: unknown): number;
export function getFlowResultMessage(item?: unknown): string;
export function getFlowResultCode(item?: unknown): string;
export function formatFlowDuration(value?: number): string;
export function truncateFlowText(value?: unknown, maxLength?: number): string;

export const FLOW_FRONTEND_CAPABILITIES: {
  MESSAGE_SHOW: 'message.show';
  ROUTE_NAVIGATE: 'route.navigate';
  TABLE_REFRESH: 'table.refresh';
  FORM_OPEN: 'form.open';
  DRAWER_OPEN: 'drawer.open';
  MODAL_OPEN: 'modal.open';
  AUDIT_MARK: 'audit.mark';
};

export const DEFAULT_NODE_CAPABILITY_MAP: Record<string, string>;
export function getDefaultCapabilityForNodeType(type: string): string;
export function getFlowNodeCapability(node: Partial<FlowNode>): string;

export interface FlowFrontendCapabilityAdapter {
  showMessage?: (params: Record<string, unknown>, context?: Record<string, unknown>) => void | Promise<void>;
  navigate?: (params: Record<string, unknown>, context?: Record<string, unknown>) => void | Promise<void>;
  refreshTable?: (params: Record<string, unknown>, context?: Record<string, unknown>) => void | Promise<void>;
  openForm?: (params: Record<string, unknown>, context?: Record<string, unknown>) => void | Promise<void>;
  openDrawer?: (params: Record<string, unknown>, context?: Record<string, unknown>) => void | Promise<void>;
  openModal?: (params: Record<string, unknown>, context?: Record<string, unknown>) => void | Promise<void>;
  markAudit?: (params: Record<string, unknown>, context?: Record<string, unknown>) => void | Promise<void>;
  messagePermissions?: string[];
  routePermissions?: string[];
  tablePermissions?: string[];
  formPermissions?: string[];
  drawerPermissions?: string[];
  modalPermissions?: string[];
  auditPermissions?: string[];
}

export function createFlowFrontendCapabilities(adapter?: FlowFrontendCapabilityAdapter): unknown[];
export function registerFlowFrontendCapabilities(runtime: PivotRuntime, adapter?: FlowFrontendCapabilityAdapter): unknown[];
export function createAIFlowBuilderContext(source?: PivotRuntime | PivotCapability[] | { list(filter?: Record<string, unknown>): PivotCapability[] }, options?: {
  filter?: Record<string, unknown>;
  includeSchemas?: boolean;
  maxDescriptionLength?: number;
}): {
  generatedAt: string;
  instruction: string;
  safetyRules: string[];
  flowShape: Record<string, unknown>;
  capabilitySummary: ReturnType<typeof createCapabilityManifestSummary>;
};
export interface AIFlowProviderRequest {
  prompt: string;
  builderContext: ReturnType<typeof createAIFlowBuilderContext>;
  capabilitySummary: ReturnType<typeof createCapabilityManifestSummary>;
  safetyRules: string[];
  flowShape: Record<string, unknown>;
  metadata: Record<string, unknown>;
  signal?: AbortSignal;
}
export interface AIFlowProvider {
  name?: string;
  generate(request: AIFlowProviderRequest, options?: Record<string, unknown>): unknown | Promise<unknown>;
}
export type AIFlowProviderLike =
  | AIFlowProvider
  | ((request: AIFlowProviderRequest, options?: Record<string, unknown>) => unknown | Promise<unknown>);
export function createAIFlowProvider(provider: AIFlowProviderLike, options?: {
  name?: string;
}): Required<Pick<AIFlowProvider, 'name' | 'generate'>>;
export function createAIFlowProviderRequest(prompt?: string, source?: PivotRuntime | PivotCapability[] | ReturnType<typeof createAIFlowBuilderContext>, options?: {
  filter?: Record<string, unknown>;
  includeSchemas?: boolean;
  maxDescriptionLength?: number;
  metadata?: Record<string, unknown>;
  signal?: AbortSignal;
}): AIFlowProviderRequest & {
  responseContract: {
    format: 'json';
    root: string;
    draftOnly: boolean;
  };
};
export function createAIFlowProviderMessages(prompt?: string, source?: PivotRuntime | PivotCapability[] | ReturnType<typeof createAIFlowBuilderContext>, options?: {
  filter?: Record<string, unknown>;
  includeSchemas?: boolean;
  maxDescriptionLength?: number;
  metadata?: Record<string, unknown>;
  signal?: AbortSignal;
  systemMessage?: string;
  compact?: boolean;
}): {
  request: ReturnType<typeof createAIFlowProviderRequest>;
  responseFormat: {
    type: 'json_object';
  };
  messages: Array<{
    role: 'system' | 'user';
    content: string;
  }>;
};
export function parseAIFlowProviderOutput(output?: unknown, fallbackPrompt?: string): {
  prompt: string;
  flow: Partial<FlowDefinition>;
};
export interface AIFlowDraftRepairRegistration {
  name: string;
  resource: string;
  action: string;
  risk: FlowRisk | string;
  permissions: string[];
  requiresConfirmation: boolean;
  paramsSchema: Record<string, unknown>;
  nodeId: string;
  nodeLabel: string;
  notes: string[];
}
export interface AIFlowDraftRepairAction {
  action: 'replace-capability' | 'register-capability';
  nodeId: string;
  nodeLabel: string;
  missingCapability: string;
  message: string;
  recommendation: null | {
    capability: Record<string, unknown>;
    score: number;
    reasons: string[];
  };
  registration: AIFlowDraftRepairRegistration;
  risk: FlowRisk | string;
  requiresBackendWork: boolean;
  requiresReview: boolean;
}
export interface AIFlowDraftRepairPlan {
  ok: boolean;
  flowId: string;
  flowName: string;
  missingCount: number;
  summary: string;
  actions: AIFlowDraftRepairAction[];
  registrationChecklist: AIFlowDraftRepairRegistration[];
}
export function generateAIFlowDraft(prompt?: string, options?: {
  provider: AIFlowProviderLike;
  runtime?: PivotRuntime;
  capabilities?: PivotCapability[];
  builderContext?: ReturnType<typeof createAIFlowBuilderContext>;
  builderOptions?: {
    filter?: Record<string, unknown>;
    includeSchemas?: boolean;
    maxDescriptionLength?: number;
  };
  filter?: Record<string, unknown>;
  includeSchemas?: boolean;
  maxDescriptionLength?: number;
  providerConfig?: { name?: string };
  providerOptions?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  signal?: AbortSignal;
  allowPublished?: boolean;
  includeProviderOutput?: boolean;
}): Promise<ReturnType<typeof createAIFlowDraft> & {
  prompt: string;
  provider: string;
  builderContext: ReturnType<typeof createAIFlowBuilderContext>;
  structuredOutput: {
    prompt: string;
    flow: Partial<FlowDefinition>;
  };
  providerOutput?: unknown;
}>;
export function createAIFlowDraft(input?: Partial<FlowDefinition> | { prompt?: string; flow?: Partial<FlowDefinition> }, options?: {
  runtime?: PivotRuntime;
  capabilities?: PivotCapability[];
  allowPublished?: boolean;
}): {
  ok: boolean;
  flow: FlowDefinition;
  validation: ReturnType<typeof validateAIFlowDraft>;
  diff: ReturnType<typeof diffAIFlowDraft>;
  missingCapabilities: ReturnType<typeof getMissingFlowCapabilities>;
  repairPlan: AIFlowDraftRepairPlan;
  capabilitySummary: ReturnType<typeof createCapabilityManifestSummary>;
};
export function getMissingFlowCapabilities(flow?: FlowDefinition, source?: PivotRuntime | PivotCapability[] | { list(filter?: Record<string, unknown>): PivotCapability[] }, options?: {
  runtime?: PivotRuntime;
  capabilities?: PivotCapability[];
  recommendationLimit?: number;
  limit?: number;
}): Array<{
  nodeId: string;
  capability: string;
  label: string;
  recommendations: ReturnType<typeof recommendFlowCapabilities>;
}>;
export function createAIFlowDraftRepairPlan(draftResult?: FlowDefinition | ReturnType<typeof createAIFlowDraft>, source?: PivotRuntime | PivotCapability[] | { list(filter?: Record<string, unknown>): PivotCapability[] }, options?: {
  runtime?: PivotRuntime;
  capabilities?: PivotCapability[];
  recommendationLimit?: number;
  limit?: number;
}): AIFlowDraftRepairPlan;
export function applyAIFlowDraftRepairPlan(draftResult?: FlowDefinition | ReturnType<typeof createAIFlowDraft>, source?: PivotRuntime | PivotCapability[] | { list(filter?: Record<string, unknown>): PivotCapability[] }, options?: {
  runtime?: PivotRuntime;
  capabilities?: PivotCapability[];
  repairPlan?: AIFlowDraftRepairPlan;
  nodeIds?: string[];
  minScore?: number;
  recommendationLimit?: number;
  limit?: number;
}): ReturnType<typeof createAIFlowDraft> & {
  applied: Array<{
    nodeId: string;
    from: string;
    to: string;
    score: number;
  }>;
  skipped: Array<{
    nodeId: string;
    missingCapability: string;
    action: 'replace-capability' | 'register-capability';
    reason: string;
  }>;
  originalRepairPlan: AIFlowDraftRepairPlan;
};
export function diffAIFlowDraft(before?: unknown, after?: unknown, options?: {
  ignorePaths?: string[];
  limit?: number;
}): Array<{
  path: string;
  type: 'added' | 'removed' | 'changed';
  before: unknown;
  after: unknown;
}>;
export function recommendFlowCapabilities(prompt?: string, source?: PivotRuntime | PivotCapability[] | { list(filter?: Record<string, unknown>): PivotCapability[] }, options?: {
  filter?: Record<string, unknown>;
  includeSchemas?: boolean;
  maxDescriptionLength?: number;
  limit?: number;
}): Array<{
  capability: Record<string, unknown>;
  score: number;
  reasons: string[];
}>;
export function renderAIFlowDraftPreviewToHTML(draftResult?: FlowDefinition | ReturnType<typeof createAIFlowDraft>, options?: {
  runtime?: PivotRuntime;
  capabilities?: PivotCapability[];
  allowPublished?: boolean;
  showJSON?: boolean;
  showDiff?: boolean;
  showRepairPlan?: boolean;
}): string;
export function renderAIFlowDraftReviewToHTML(draftResult?: FlowDefinition | ReturnType<typeof createAIFlowDraft>, options?: {
  runtime?: PivotRuntime;
  capabilities?: PivotCapability[];
  allowPublished?: boolean;
  showJSON?: boolean;
  showDiff?: boolean;
  showRepairPlan?: boolean;
  canApplyRepair?: boolean;
  canSave?: boolean;
  title?: string;
  description?: string;
}): string;
export function renderAIFlowBuilderPanelToHTML(state?: {
  prompt?: string;
  recommendations?: ReturnType<typeof recommendFlowCapabilities>;
  draftResult?: ReturnType<typeof createAIFlowDraft>;
  loading?: boolean;
  message?: string;
  error?: string;
}, options?: {
  runtime?: PivotRuntime;
  capabilities?: PivotCapability[];
  showDiff?: boolean;
  showRepairPlan?: boolean;
  canApplyRepair?: boolean;
}): string;
export function AIFlowBuilderPanel(options: {
  target: string | Element;
  provider?: AIFlowProviderLike;
  runtime?: PivotRuntime;
  capabilities?: PivotCapability[];
  prompt?: string;
  draftResult?: ReturnType<typeof createAIFlowDraft>;
  showDiff?: boolean;
  showRepairPlan?: boolean;
  canApplyRepair?: boolean;
  savedMessage?: string;
  recommendationOptions?: Record<string, unknown>;
  repairOptions?: Record<string, unknown>;
  onGenerated?: (draftResult: Awaited<ReturnType<typeof generateAIFlowDraft>>) => void | Promise<void>;
  onRepairApplied?: (draftResult: ReturnType<typeof applyAIFlowDraftRepairPlan>) => void | Promise<void>;
  onSaveDraft?: (flow: FlowDefinition, draftResult: ReturnType<typeof createAIFlowDraft>) => unknown | Promise<unknown>;
  onSaved?: (saved: unknown, draftResult: ReturnType<typeof createAIFlowDraft>) => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
}): {
  element: Element;
  generate(prompt?: string): Promise<Awaited<ReturnType<typeof generateAIFlowDraft>> | null>;
  applyRepair(): Promise<ReturnType<typeof applyAIFlowDraftRepairPlan> | null>;
  update(nextState?: Record<string, unknown>): void;
  destroy(): void;
};
export function AIFlowDraftReviewer(options: {
  target: string | Element;
  draftResult?: ReturnType<typeof createAIFlowDraft>;
  runtime?: PivotRuntime;
  capabilities?: PivotCapability[];
  showJSON?: boolean;
  showDiff?: boolean;
  showRepairPlan?: boolean;
  canApplyRepair?: boolean;
  title?: string;
  description?: string;
  savedMessage?: string;
  repairOptions?: Record<string, unknown>;
  onRepairApplied?: (draftResult: ReturnType<typeof applyAIFlowDraftRepairPlan>) => void | Promise<void>;
  onSaveDraft?: (flow: FlowDefinition, draftResult: ReturnType<typeof createAIFlowDraft>) => unknown | Promise<unknown>;
  onSaved?: (saved: unknown, draftResult: ReturnType<typeof createAIFlowDraft>) => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
}): { element: Element; update(draftResult: ReturnType<typeof createAIFlowDraft>): void; destroy(): void };
export function createCapabilityManifestSummary(source?: PivotRuntime | PivotCapability[] | { list(filter?: Record<string, unknown>): PivotCapability[] }, options?: {
  filter?: Record<string, unknown>;
  includeSchemas?: boolean;
  maxDescriptionLength?: number;
}): {
  generatedAt: string;
  count: number;
  capabilities: Array<Record<string, unknown>>;
  resources: Record<string, number>;
  actions: Record<string, number>;
  risks: Record<string, number>;
  permissions: string[];
};
export function validateAIFlowDraft(flow: FlowDefinition, options?: {
  runtime?: PivotRuntime;
  capabilities?: PivotCapability[];
  allowPublished?: boolean;
}): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  capabilitySummary: ReturnType<typeof createCapabilityManifestSummary>;
};

export function renderFlowListToHTML(flows?: FlowDefinition[], options?: Record<string, unknown>): string;
export function filterFlows(flows?: FlowDefinition[], options?: { keyword?: string; status?: FlowStatus | string; risk?: FlowRisk | string }): FlowDefinition[];
export function groupFlows(flows?: FlowDefinition[], options?: { groupBy?: 'status' | 'risk' | string }): Array<{ key: string; label: string; flows: FlowDefinition[] }>;
export function getFlowRisk(flow?: Partial<FlowDefinition>): FlowRisk | 'low';
export function renderFlowTemplateListToHTML(templates?: FlowTemplate[], options?: Record<string, unknown>): string;
export function groupFlowTemplates(templates?: FlowTemplate[]): Array<{ key: string; label: string; templates: FlowTemplate[] }>;
export function renderFlowDesignerToHTML(flow?: FlowDefinition | null, state?: Record<string, unknown>): string;
export function renderFlowSettingsToHTML(flow: FlowDefinition): string;
export function renderFlowEdgeEditorToHTML(flow: FlowDefinition, state?: Record<string, unknown>): string;
export function renderFlowCanvasToHTML(flow?: FlowDefinition | null, options?: {
  preview?: PivotResult | null;
  result?: PivotResult | null;
  nodeKeyword?: string;
  selectedNodeId?: string;
  selectedEdgeId?: string;
  groupBy?: 'type' | 'risk' | 'resource' | string;
  canvasGroupBy?: 'type' | 'risk' | 'resource' | string;
  collapsedGroups?: string[] | Set<string> | string;
  collapsedCanvasGroups?: string[] | Set<string> | string;
  zoom?: number;
  canvasZoom?: number;
  density?: 'comfortable' | 'compact' | string;
  canvasDensity?: 'comfortable' | 'compact' | string;
  showMinimap?: boolean;
  showCanvasMinimap?: boolean;
}): string;
export function createFlowCanvasLayout(nodes?: FlowNode[], edges?: FlowEdge[]): {
  layers: Array<Array<{ node: FlowNode; index: number }>>;
  layerById: Map<string, number>;
};
export function groupFlowCanvasNodes(nodes?: FlowNode[], groupBy?: 'type' | 'risk' | 'resource' | string): {
  active: boolean;
  groupBy: string;
  groups: Array<{
    key: string;
    label: string;
    nodes: Array<{ node: FlowNode; index: number }>;
  }>;
};
export function normalizeFlowCanvasViewport(options?: {
  zoom?: number;
  canvasZoom?: number;
  density?: 'comfortable' | 'compact' | string;
  canvasDensity?: 'comfortable' | 'compact' | string;
  showMinimap?: boolean;
  showCanvasMinimap?: boolean;
}): {
  zoom: number;
  density: 'comfortable' | 'compact' | string;
  showMinimap: boolean;
};
export function getFlowExecutionTrace(result?: PivotResult | null, nodes?: FlowNode[], edges?: FlowEdge[]): {
  nodeStates: Map<string, FlowExecutionNodeState>;
  edgeStates: Map<string, { active: boolean; failed: boolean; fromStatus: string; toStatus: string }>;
  executedNodeIds: string[];
  failedNodeIds: string[];
  skippedNodeIds: string[];
  firstFailedNodeId: string;
  totalDurationMs: number;
};
export function getFlowCanvasDiagnostics(result?: PivotResult | null, nodes?: FlowNode[], edges?: FlowEdge[], options?: {
  groupBy?: 'type' | 'risk' | 'resource' | string;
  canvasGroupBy?: 'type' | 'risk' | 'resource' | string;
  slowestLimit?: number;
}): {
  trace: ReturnType<typeof getFlowExecutionTrace>;
  failedNodes: Array<{
    id: string;
    label: string;
    index: number;
    message: string;
    code: string;
    durationMs: number;
  }>;
  slowestNodes: Array<{
    id: string;
    label: string;
    index: number;
    durationMs: number;
    status: 'idle' | 'executed' | 'failed' | 'skipped';
  }>;
  crossGroupEdges: Array<{
    id: string;
    from: string;
    to: string;
    fromGroup: string;
    toGroup: string;
    condition: string | Record<string, unknown>;
    active: boolean;
    failed: boolean;
  }>;
  failedCrossGroupEdges: Array<{
    id: string;
    from: string;
    to: string;
    fromGroup: string;
    toGroup: string;
    condition: string | Record<string, unknown>;
    active: boolean;
    failed: boolean;
  }>;
  firstFailedNode: null | {
    id: string;
    label: string;
    index: number;
    message: string;
    code: string;
    durationMs: number;
  };
  slowestNode: null | {
    id: string;
    label: string;
    index: number;
    durationMs: number;
    status: 'idle' | 'executed' | 'failed' | 'skipped';
  };
};
export function getFlowNodeMatches(nodes?: FlowNode[], keyword?: string): { active: boolean; matchedIds: Set<string>; count: number };
export function getFlowNodeAdjacency(nodeId?: string, edges?: FlowEdge[]): { active: boolean; relatedEdgeIds: Set<string>; relatedNodeIds: Set<string> };
export function renderNodeInspectorToHTML(node?: FlowNode | null, options?: { editable?: boolean }): string;
export function renderEditableNodeInspectorToHTML(node: FlowNode): string;
export function renderNodePaletteToHTML(nodes?: unknown[]): string;
export interface FlowVariableSource {
  group: string;
  label: string;
  reference: string;
  paramKey: string;
  description: string;
}
export function createFlowVariableSources(flow?: FlowDefinition | null, selectedNodeId?: string): FlowVariableSource[];
export function renderVariableMapperToHTML(options?: {
  flow?: FlowDefinition | null;
  selectedNodeId?: string;
  sources?: Array<string | Partial<FlowVariableSource>>;
}): string;
export function analyzeIntentConfig(flow?: FlowDefinition | null): {
  ok: boolean;
  status: 'ready' | 'review' | 'blocked';
  summary: string;
  counts: {
    examples: number;
    keywords: number;
    patterns: number;
    slots: number;
  };
  issues: string[];
  warnings: string[];
};
export function renderIntentPatternEditorToHTML(flow?: FlowDefinition | null): string;
export function renderFlowPreviewToHTML(preview?: PivotResult | null, options?: Record<string, unknown>): string;
export function renderFlowRunPanelToHTML(result?: PivotResult | null, options?: {
  flow?: FlowDefinition;
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  slowestLimit?: number;
}): string;
export function renderFlowCapabilityMatrixToHTML(flow?: FlowDefinition | null, runtime?: PivotRuntime): string;
export function getFlowCapabilityRows(flow?: FlowDefinition | null, runtime?: PivotRuntime): Array<{
  nodeId?: string;
  nodeLabel: string;
  capability: string;
  resource: string;
  action: string;
  risk: FlowRisk | string;
  requiresConfirmation: boolean;
  permissions: string[];
}>;
export function renderFlowTestPanelToHTML(state?: Record<string, unknown>): string;
export function parseFlowTestSlots(value?: string): Record<string, unknown>;
export function renderFlowAuditPanelToHTML(audits?: unknown[], options?: Record<string, unknown>): string;

export function FlowManager(options: {
  target: string | Element;
  runtime?: PivotRuntime;
  flowStore?: FlowStore;
  flows?: FlowDefinition[];
  templates?: FlowTemplate[];
  intentMapper?: IntentMapper;
  contextProvider?: () => Record<string, unknown> | Promise<Record<string, unknown>>;
  context?: Record<string, unknown>;
  input?: Record<string, unknown>;
  runRecord?: {
    includeRawResult?: boolean;
    maxNodes?: number;
    maxDepth?: number;
    maxArrayItems?: number;
    maxStringLength?: number;
    summaryDepth?: number;
  };
}): { element: Element; refresh(): Promise<void>; destroy(): void };

export function FlowDesigner(options: {
  target: string | Element;
  flow?: FlowDefinition;
  input?: Record<string, unknown>;
  context?: Record<string, unknown>;
  onPreview?: (plan: PivotPlan) => void;
}): { element: Element; update(flow: FlowDefinition): void; destroy(): void };

export function FlowAssistantDrawer(options: {
  trigger?: string | Element;
  runtime: PivotRuntime;
  flowStore?: FlowStore;
  flows?: FlowDefinition[];
  intentMapper?: IntentMapper;
  contextProvider?: () => Record<string, unknown> | Promise<Record<string, unknown>>;
  context?: Record<string, unknown>;
}): { element: Element; open(): void; close(): void; destroy(): void };
