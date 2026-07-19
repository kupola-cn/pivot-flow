import { createFlowAccessReport } from './flow-access-report.js';
import { renderFlowSafetyReportToHTML } from './flow-safety-report.js';
import { escapeHTML } from './components/dom.js';

export function simulateFlowPermissions(flow, source, actors = [], options = {}) {
  const rows = (Array.isArray(actors) ? actors : []).map((actor) => {
    const report = createFlowAccessReport(flow, source, { ...options, actor });
    return {
      actorId: actor?.id ?? '',
      actorName: actor?.name ?? actor?.username ?? actor?.id ?? '',
      permissions: actor?.permissions ?? [],
      ok: report.ok,
      status: report.status,
      missingPermissions: report.missingPermissions,
      report
    };
  });
  return {
    ok: rows.every((row) => row.ok),
    total: rows.length,
    allowedCount: rows.filter((row) => row.ok).length,
    blockedCount: rows.filter((row) => !row.ok).length,
    rows,
    summary: `${rows.filter((row) => row.ok).length}/${rows.length} actor(s) allowed by frontend permission hints.`
  };
}

export function renderFlowPermissionSimulationToHTML(simulationOrFlow, source, actors, options = {}) {
  const simulation = simulationOrFlow?.rows ? simulationOrFlow : simulateFlowPermissions(simulationOrFlow, source, actors, options);
  const rows = simulation.rows.length > 0
    ? simulation.rows.map((row) => `<li><span><strong>${escapeHTML(row.actorName || row.actorId || 'Actor')}</strong><small>${escapeHTML(row.missingPermissions.join(', ') || 'No missing permissions')}</small></span><em>${escapeHTML(row.status)}</em></li>`).join('')
    : '<li><span><strong>No actors</strong><small>Add actors to simulate permission hints.</small></span></li>';
  return `<section class="flow-permission-simulation"><header><strong>Permission simulation</strong><span>${escapeHTML(simulation.summary)}</span></header><ol>${rows}</ol><small>Simulation is a frontend hint only. Backend authorization remains mandatory.</small></section>`;
}

export { renderFlowSafetyReportToHTML };

