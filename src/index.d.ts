import type { PivotRuntime, PivotPlan, PivotResult } from '@kupola/pivot';

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

export function renderFlowListToHTML(flows?: FlowDefinition[], options?: Record<string, unknown>): string;
export function renderFlowTemplateListToHTML(templates?: FlowTemplate[], options?: Record<string, unknown>): string;
export function renderFlowDesignerToHTML(flow?: FlowDefinition | null, state?: Record<string, unknown>): string;
export function renderFlowSettingsToHTML(flow: FlowDefinition): string;
export function renderFlowEdgeEditorToHTML(flow: FlowDefinition, state?: Record<string, unknown>): string;
export function renderFlowCanvasToHTML(flow?: FlowDefinition | null, options?: Record<string, unknown>): string;
export function renderNodeInspectorToHTML(node?: FlowNode | null, options?: { editable?: boolean }): string;
export function renderEditableNodeInspectorToHTML(node: FlowNode): string;
export function renderNodePaletteToHTML(nodes?: unknown[]): string;
export function renderVariableMapperToHTML(options?: Record<string, unknown>): string;
export function renderIntentPatternEditorToHTML(flow?: FlowDefinition | null): string;
export function renderFlowPreviewToHTML(preview?: PivotResult | null, options?: Record<string, unknown>): string;
export function renderFlowRunPanelToHTML(result?: PivotResult | null): string;
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
