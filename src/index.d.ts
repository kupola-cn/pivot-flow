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
export function validateFlow(flow: FlowDefinition, options?: { capabilities?: unknown }): FlowValidationResult;
export function flowToPlan(flow: FlowDefinition, input?: { prompt?: string; slots?: Record<string, unknown>; planId?: string }, context?: Record<string, unknown>): PivotPlan;
export function resolveFlowParams(value: unknown, input?: Record<string, unknown>, context?: Record<string, unknown>): unknown;
export function evaluateFlowCondition(condition: unknown, input?: Record<string, unknown>, context?: Record<string, unknown>): boolean;
export function applyFlowTransform(mapping?: Record<string, unknown>, input?: Record<string, unknown>, context?: Record<string, unknown>): unknown;
export function compareValues(left: unknown, operator: string, right?: unknown): boolean;
export function createLocalIntentMapper(options?: { minConfidence?: number }): IntentMapper;
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
}): {
  runtime: PivotRuntime;
  flowStore: FlowStore;
  intentMapper: IntentMapper;
  match(prompt: string, options?: Record<string, unknown>): Promise<{
    ok: boolean;
    prompt: string;
    match: FlowMatch | null;
    matches: FlowMatch[];
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
    plan?: PivotPlan;
    context?: Record<string, unknown>;
    preview?: PivotResult;
    result?: PivotResult;
  }>;
};
export function getUnfilledMissingSlots(missingSlots?: FlowSlot[], slots?: Record<string, unknown>): FlowSlot[];

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
  canSave?: boolean;
  title?: string;
  description?: string;
}): string;
export function AIFlowDraftReviewer(options: {
  target: string | Element;
  draftResult?: ReturnType<typeof createAIFlowDraft>;
  runtime?: PivotRuntime;
  capabilities?: PivotCapability[];
  showJSON?: boolean;
  showDiff?: boolean;
  title?: string;
  description?: string;
  savedMessage?: string;
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
export function renderFlowCanvasToHTML(flow?: FlowDefinition | null, options?: Record<string, unknown>): string;
export function createFlowCanvasLayout(nodes?: FlowNode[], edges?: FlowEdge[]): {
  layers: Array<Array<{ node: FlowNode; index: number }>>;
  layerById: Map<string, number>;
};
export function getFlowExecutionTrace(result?: PivotResult | null, nodes?: FlowNode[], edges?: FlowEdge[]): {
  nodeStates: Map<string, { status: 'idle' | 'executed' | 'failed' | 'skipped'; result?: unknown }>;
  edgeStates: Map<string, { active: boolean; failed: boolean; fromStatus: string; toStatus: string }>;
  executedNodeIds: string[];
  failedNodeIds: string[];
  skippedNodeIds: string[];
  firstFailedNodeId: string;
};
export function getFlowNodeMatches(nodes?: FlowNode[], keyword?: string): { active: boolean; matchedIds: Set<string>; count: number };
export function getFlowNodeAdjacency(nodeId?: string, edges?: FlowEdge[]): { active: boolean; relatedEdgeIds: Set<string>; relatedNodeIds: Set<string> };
export function renderNodeInspectorToHTML(node?: FlowNode | null, options?: { editable?: boolean }): string;
export function renderEditableNodeInspectorToHTML(node: FlowNode): string;
export function renderNodePaletteToHTML(nodes?: unknown[]): string;
export function renderVariableMapperToHTML(options?: Record<string, unknown>): string;
export function renderIntentPatternEditorToHTML(flow?: FlowDefinition | null): string;
export function renderFlowPreviewToHTML(preview?: PivotResult | null, options?: Record<string, unknown>): string;
export function renderFlowRunPanelToHTML(result?: PivotResult | null): string;
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
  input?: Record<string, unknown>;
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
}): { element: Element; open(): void; close(): void; destroy(): void };
