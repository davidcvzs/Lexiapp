import { useMemo, useState } from 'react';
import type { DocumentDraft } from '../../../shared/documents';
import { literalCandidates, publicFragments, suggestRedactions } from '../../../shared/redaction';
import type { RedactionRange } from '../../../shared/redaction';
import { isApproved, publicFingerprint, reviewPayload } from '../../../shared/documentIntegrity';

interface Props { draft: DocumentDraft; disabled: boolean; update: React.Dispatch<React.SetStateAction<DocumentDraft>> }
/** Every proposed masking range requires explicit selection; no hidden original in the preview. */
export function PublicVersionReview({ draft, disabled, update }: Props) {
  const [manual, setManual] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const candidates = useMemo(() => {
    const all = [...literalCandidates(draft.content, manual), ...suggestRedactions(draft.content)];
    const unique = new Map(all.map(range => [`${range.start}:${range.end}`, range]));
    for (const range of draft.publicVersion?.redactions ?? []) if (!unique.has(`${range.start}:${range.end}`)) unique.set(`${range.start}:${range.end}`, { ...range, kind: 'Selección guardada' });
    return [...unique.values()].sort((a, b) => a.start - b.start);
  }, [draft.content, draft.publicVersion?.redactions, manual]);
  const ranges = draft.publicVersion?.redactions ?? [];
  const toggle = (range: RedactionRange, selected: boolean) => {
    if (selected && ranges.length >= 2000 && !ranges.some(item => item.start < range.end && item.end > range.start)) {
      setError('Se alcanzó el límite de 2000 ocultaciones por documento.'); return;
    }
    setError('');
    update(previous => {
      const existing = previous.publicVersion?.redactions ?? [];
      const next = selected ? [...existing.filter(item => !(item.start < range.end && item.end > range.start)), { start: range.start, end: range.end }]
        : existing.filter(item => item.start !== range.start || item.end !== range.end);
      return { ...previous, publicVersion: { redactions: next.sort((a, b) => a.start - b.start), reviewed: false, reviewHash: null } };
    });
  };
  const confirm = async (checked: boolean) => {
    if (!checked) { update(previous => ({ ...previous, publicVersion: { redactions: previous.publicVersion?.redactions ?? [], reviewed: false, reviewHash: null } })); return; }
    setChecking(true); setError('');
    try {
      const hash = await publicFingerprint(draft);
      update(previous => isApproved(previous) && reviewPayload(previous) === reviewPayload(draft) && JSON.stringify(previous.publicVersion?.redactions) === JSON.stringify(draft.publicVersion?.redactions)
        ? { ...previous, publicVersion: { redactions: previous.publicVersion?.redactions ?? [], reviewed: true, reviewHash: hash } } : previous);
    } catch { setError('No se pudo confirmar la revisión pública.'); }
    finally { setChecking(false); }
  };
  return <section aria-label="Revisión de versión pública" style={{ padding: '1rem', margin: '1rem 0', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '0.5rem', color: '#0f172a' }}>
    <h3>Ocultaciones de la versión pública</h3>
    <p>Selecciona los datos que deben ocultarse y revisa el texto completo. Las sugerencias pueden omitir datos o marcar texto que debe conservarse.</p>
    <label>Buscar texto literal <input aria-label="Dato a ocultar" value={manual} disabled={disabled} onChange={event => setManual(event.target.value)} /></label>
    <div style={{ maxHeight: '180px', overflowY: 'auto', padding: '0.5rem 0' }}>
      {candidates.map(candidate => <label key={`${candidate.start}:${candidate.end}`} style={{ display: 'block', margin: '0.375rem 0' }}>
        <input type="checkbox" disabled={disabled || checking || (ranges.length >= 2000 && !ranges.some(range => range.start < candidate.end && range.end > candidate.start))} checked={ranges.some(range => range.start === candidate.start && range.end === candidate.end)}
          onChange={event => toggle(candidate, event.target.checked)} />{' '}
        Ocultar {candidate.kind}: {draft.content.slice(candidate.start, candidate.end)} (posición {candidate.start + 1})
      </label>)}
      {!candidates.length && <p>No hay sugerencias. Puedes buscar y seleccionar texto literal.</p>}
    </div>
    <p>{ranges.length} ocultaciones seleccionadas.</p>
    <div aria-label="Vista pública revisable" style={{ whiteSpace: 'pre-wrap', background: 'white', padding: '1rem', border: '1px solid #e2e8f0' }}>
      {publicFragments(draft.content, ranges).map((fragment, index) => <span key={index} style={fragment.hidden ? { color: '#b91c1c', fontWeight: 700 } : undefined}>{fragment.text}</span>)}
    </div>
    <label style={{ display: 'block', marginTop: '0.75rem' }}><input type="checkbox" checked={draft.publicVersion?.reviewed ?? false}
      disabled={disabled || checking || !isApproved(draft)} onChange={event => void confirm(event.target.checked)} />{' '}
      Revisé la vista pública y confirmé qué datos se ocultan y cuáles se conservan.
    </label>
    {error && <p role="alert">{error}</p>}
  </section>;
}
