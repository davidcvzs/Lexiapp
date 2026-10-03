import type { DocumentDraft } from '../../../shared/documents';
import { invalidateReview } from '../../../shared/documentIntegrity';
import { editWorkflowContent } from '../../../shared/workflowEngine';
import type { WordFormat, WordProfileId } from '../../../shared/wordFormatting';
import type { ageCandidates } from '../../../shared/officialMarking';
import { OfficialMarkReview } from './OfficialMarkReview';

/** Format and visible edits belong to documentState and require review again. */
export function DocumentWordReview({ draft, update, disabled = false, onError }: {
  draft: DocumentDraft; update: (draft: DocumentDraft) => void; disabled?: boolean; onError: (message: string) => void;
}) {
  const format: WordFormat = draft.wordFormat ?? { profile: 'judicial', marks: [] };
  const change = (next: WordFormat) => update(invalidateReview({ ...draft, wordFormat: next }, 'metadata'));
  const applyAge = (proposal: ReturnType<typeof ageCandidates>[number]) => {
    try {
      if (draft.content.slice(proposal.start, proposal.end) !== proposal.original) throw new Error('El borrador cambió. Revisa de nuevo la edad.');
      const content = draft.content.slice(0, proposal.start) + proposal.replacement + draft.content.slice(proposal.end);
      update(draft.workflow ? editWorkflowContent(draft, content) : invalidateReview({ ...draft, content }, 'content'));
    } catch (error) { onError(error instanceof Error ? error.message : 'No se pudo aplicar la edición.'); }
  };
  return <details style={{ marginTop: '1rem', fontFamily: 'Inter, sans-serif', fontSize: '0.875rem' }}>
    <summary>Formato y marcado rojo del Word oficial</summary>
    <p>El marcado conserva el texto. Las conversiones de edad se aplican como ediciones visibles antes de aprobar el borrador.</p>
    <label>Formato Word <select aria-label="Formato Word del borrador" value={format.profile} disabled={disabled}
      onChange={event => change({ ...format, profile: event.target.value as WordProfileId })}>
      <option value="judicial">Judicial · Carta · interlineado 1.5</option>
      <option value="judicialDouble">Judicial · Carta · interlineado doble</option>
      <option value="transcript647">Transcripción · formato 647</option>
    </select></label>
    <label style={{ display: 'block', margin: '0.5rem 0' }}>Juzgado para el encabezado (opcional) <input aria-label="Juzgado para Word" maxLength={200}
      value={format.court ?? ''} disabled={disabled} onChange={event => change({ ...format, court: event.target.value })} /></label>
    <OfficialMarkReview text={draft.content} marks={format.marks} disabled={disabled}
      onChange={marks => change({ ...format, marks })} onApplyAge={applyAge} />
  </details>;
}
