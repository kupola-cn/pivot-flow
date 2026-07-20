import { ActionType, RiskLevel } from '@kupola/pivot';

export const FLOW_FRONTEND_CAPABILITIES = Object.freeze({
  MESSAGE_SHOW: 'message.show',
  HUMAN_SELECT: 'human.select',
  UI_DISPLAY: 'ui.display',
  ROUTE_NAVIGATE: 'route.navigate',
  TABLE_REFRESH: 'table.refresh',
  FORM_OPEN: 'form.open',
  DRAWER_OPEN: 'drawer.open',
  MODAL_OPEN: 'modal.open',
  AUDIT_MARK: 'audit.mark'
});

export function registerFlowFrontendCapabilities(runtime, adapter = {}) {
  if (!runtime || typeof runtime.registerCapability !== 'function') {
    throw new Error('PIVOT runtime is required to register frontend flow capabilities.');
  }

  const capabilities = createFlowFrontendCapabilities(adapter);
  return capabilities.map((capability) => runtime.registerCapability(capability));
}

export function createFlowFrontendCapabilities(adapter = {}) {
  return [
    {
      name: FLOW_FRONTEND_CAPABILITIES.MESSAGE_SHOW,
      resource: 'frontend-message',
      action: ActionType.EXECUTE,
      risk: RiskLevel.LOW,
      description: 'Show a frontend message.',
      paramsSchema: {
        message: { type: 'string', required: true },
        type: { type: 'string' }
      },
      permissions: adapter.messagePermissions ?? [],
      execute: async ({ params, context }) => {
        if (typeof adapter.showMessage === 'function') {
          await adapter.showMessage(params, context);
        }
        return {
          shown: true,
          message: params.message,
          type: params.type ?? 'info'
        };
      }
    },
    {
      name: FLOW_FRONTEND_CAPABILITIES.HUMAN_SELECT,
      resource: 'frontend-human',
      action: ActionType.EXECUTE,
      risk: RiskLevel.LOW,
      description: 'Ask a user to select a record from frontend candidates.',
      allowUnknownParams: true,
      permissions: adapter.humanSelectPermissions ?? [],
      execute: async ({ params, context }) => {
        const source = Array.isArray(params.source) ? params.source : [];
        const selected = typeof adapter.selectRecord === 'function'
          ? await adapter.selectRecord(params, context)
          : source.length === 1
            ? source[0]
            : null;
        const valueField = params.valueField ?? 'id';
        return {
          selected: Boolean(selected),
          record: selected,
          value: selected && typeof selected === 'object' ? selected[valueField] : selected
        };
      }
    },
    {
      name: FLOW_FRONTEND_CAPABILITIES.UI_DISPLAY,
      resource: 'frontend-display',
      action: ActionType.EXECUTE,
      risk: RiskLevel.LOW,
      description: 'Display flow data in a frontend renderer.',
      allowUnknownParams: true,
      permissions: adapter.displayPermissions ?? [],
      execute: async ({ params, context }) => {
        if (typeof adapter.displayData === 'function') {
          await adapter.displayData(params, context);
        }
        return {
          displayed: true,
          data: params.data,
          renderer: params.renderer ?? params.ui?.renderer ?? 'auto'
        };
      }
    },
    {
      name: FLOW_FRONTEND_CAPABILITIES.ROUTE_NAVIGATE,
      resource: 'frontend-route',
      action: ActionType.EXECUTE,
      risk: RiskLevel.LOW,
      description: 'Navigate within the frontend app.',
      paramsSchema: {
        route: { type: 'string', required: true },
        replace: { type: 'boolean' }
      },
      permissions: adapter.routePermissions ?? [],
      execute: async ({ params, context }) => {
        if (typeof adapter.navigate === 'function') {
          await adapter.navigate(params, context);
        } else if (typeof window !== 'undefined') {
          if (params.replace) {
            window.location.replace(params.route);
          } else {
            window.location.href = params.route;
          }
        }
        return {
          navigated: true,
          route: params.route,
          replace: Boolean(params.replace)
        };
      }
    },
    {
      name: FLOW_FRONTEND_CAPABILITIES.TABLE_REFRESH,
      resource: 'frontend-table',
      action: ActionType.EXECUTE,
      risk: RiskLevel.LOW,
      description: 'Refresh a frontend table or list.',
      paramsSchema: {
        target: { type: 'string', required: true }
      },
      permissions: adapter.tablePermissions ?? [],
      execute: async ({ params, context }) => {
        if (typeof adapter.refreshTable === 'function') {
          await adapter.refreshTable(params, context);
        }
        return {
          refreshed: true,
          target: params.target
        };
      }
    },
    {
      name: FLOW_FRONTEND_CAPABILITIES.FORM_OPEN,
      resource: 'frontend-form',
      action: ActionType.EXECUTE,
      risk: RiskLevel.LOW,
      description: 'Open a frontend form.',
      paramsSchema: {
        target: { type: 'string', required: true },
        values: { type: 'object' }
      },
      permissions: adapter.formPermissions ?? [],
      execute: async ({ params, context }) => {
        if (typeof adapter.openForm === 'function') {
          await adapter.openForm(params, context);
        }
        return {
          opened: true,
          target: params.target,
          values: params.values ?? {}
        };
      }
    },
    {
      name: FLOW_FRONTEND_CAPABILITIES.DRAWER_OPEN,
      resource: 'frontend-drawer',
      action: ActionType.EXECUTE,
      risk: RiskLevel.LOW,
      description: 'Open a frontend drawer.',
      paramsSchema: {
        target: { type: 'string', required: true },
        props: { type: 'object' }
      },
      permissions: adapter.drawerPermissions ?? [],
      execute: async ({ params, context }) => {
        if (typeof adapter.openDrawer === 'function') {
          await adapter.openDrawer(params, context);
        }
        return {
          opened: true,
          target: params.target,
          props: params.props ?? {}
        };
      }
    },
    {
      name: FLOW_FRONTEND_CAPABILITIES.MODAL_OPEN,
      resource: 'frontend-modal',
      action: ActionType.EXECUTE,
      risk: RiskLevel.LOW,
      description: 'Open a frontend modal.',
      paramsSchema: {
        target: { type: 'string', required: true },
        props: { type: 'object' }
      },
      permissions: adapter.modalPermissions ?? [],
      execute: async ({ params, context }) => {
        if (typeof adapter.openModal === 'function') {
          await adapter.openModal(params, context);
        }
        return {
          opened: true,
          target: params.target,
          props: params.props ?? {}
        };
      }
    },
    {
      name: FLOW_FRONTEND_CAPABILITIES.AUDIT_MARK,
      resource: 'frontend-audit',
      action: ActionType.EXECUTE,
      risk: RiskLevel.LOW,
      description: 'Add a frontend audit marker.',
      paramsSchema: {
        label: { type: 'string', required: true },
        detail: { type: 'string' }
      },
      permissions: adapter.auditPermissions ?? [],
      execute: async ({ params, context }) => {
        if (typeof adapter.markAudit === 'function') {
          await adapter.markAudit(params, context);
        }
        return {
          marked: true,
          label: params.label,
          detail: params.detail ?? ''
        };
      }
    }
  ];
}
