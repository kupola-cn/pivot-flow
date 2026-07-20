import { FlowDesigner } from './components/FlowDesigner.js';
import { FlowManager } from './components/FlowManager.js';

export function createPivotFlowApp(options = {}) {
  return FlowManager(options);
}

export function createFlowDesigner(options = {}) {
  return FlowDesigner(options);
}
