import { resolveTask } from '../../shared/legalTasks.js';
import type { TaskSelection } from '../../shared/legalTasks.js';
/** Synthetic provider metadata; never read real legal evidence in automated tests. */
export const taskProvenance = (selection: TaskSelection = { taskId: 'DECLARACION', formatId: 'default' }) => ({
  ...selection, rulesVersion: 'test-1', rulesHash: '1'.repeat(64),
  references: resolveTask(selection).format.references.map(id => ({ id, sha256: '2'.repeat(64) })),
});
