import { useMemo, useState } from 'react';
import { ageCandidates, OFFICIAL_MARK_CATEGORIES, OFFICIAL_MARK_LABELS, validateOfficialMarks } from '../../../shared/officialMarking';
import type { OfficialMark } from '../../../shared/officialMarking';
import { literalCandidates } from '../../../shared/redaction';

export interface OfficialMarkReviewProps {
  text: string;
  marks: OfficialMark[];
  onChange: (marks: OfficialMark[]) => void;
  disabled?: boolean;
  onApplyAge?: (proposal: ReturnType<typeof ageCandidates>[number]) => void;
}

/** Select exact official red intervals over the supplied text; public concealment remains independent. */
export function OfficialMarkReview({ text, marks, onChange, disabled = false, onApplyAge }: OfficialMarkReviewProps) {
  const literal = text;
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState<OfficialMark['category']>('name');
  const [error, setError] = useState('');
  const matches = useMemo(() => literalCandidates(literal, term), [literal, term]);
  const ages = useMemo(() => onApplyAge ? ageCandidates(literal) : [], [literal, onApplyAge]);
  const toggle = (start: number, end: number) => {
    if (disabled) return;
    try {
      const selected = marks.some(mark => mark.start === start && mark.end === end);
      onChange(validateOfficialMarks(literal, selected ? marks.filter(mark => mark.start !== start || mark.end !== end)
        : [...marks, { start, end, category }].sort((a, b) => a.start - b.start)));
      setError('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo aplicar el marcado.'); }
  };
  return <section aria-label="Marcado oficial en rojo" style={{ padding: '1rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem', marginTop: '1rem' }}>
    <h3>Marcado oficial en rojo</h3>
    <p>Selecciona coincidencias literales. El marcado conserva el texto y es independiente de las ocultaciones públicas.</p>
    <label>Texto exacto para marcar <input aria-label="Texto exacto para marcado oficial" value={term} disabled={disabled} onChange={event => setTerm(event.target.value)} /></label>{' '}
    <label>Categoría <select aria-label="Categoría de marcado oficial" value={category} disabled={disabled} onChange={event => setCategory(event.target.value as OfficialMark['category'])}>
      {OFFICIAL_MARK_CATEGORIES.map(value => <option key={value} value={value}>{OFFICIAL_MARK_LABELS[value]}</option>)}
    </select></label>
    {error && <p role="alert">{error}</p>}
    <p>{marks.length} intervalos seleccionados.</p>
    {term && <div>{matches.slice(0, 100).map(match => <label key={`${match.start}:${match.end}`} style={{ display: 'block' }}>
      <input type="checkbox" disabled={disabled} checked={marks.some(mark => mark.start === match.start && mark.end === match.end)}
        onChange={() => toggle(match.start, match.end)} />Marcar {OFFICIAL_MARK_LABELS[category]}: {literal.slice(match.start, match.end)} ({match.start + 1}–{match.end})
    </label>)}{matches.length > 100 && <p>Se muestran las primeras 100 coincidencias. Precisa la búsqueda para revisar las demás.</p>}</div>}
    {marks.map(mark => <p key={`${mark.start}:${mark.end}`}><span style={{ color: '#b91c1c' }}>{literal.slice(mark.start, mark.end)}</span> · {OFFICIAL_MARK_LABELS[mark.category]}{' '}
      <button type="button" disabled={disabled} onClick={() => { onChange(marks.filter(item => item !== mark)); setError(''); }}>Quitar marcado en {mark.start + 1}</button></p>)}
    {!!ages.length && <div aria-label="Propuestas de edades"><p>Las conversiones de edades requieren aplicar cada cambio antes de revisar el borrador.</p>
      {ages.slice(0, 100).map(proposal => <p key={`${proposal.start}:${proposal.end}`}>{proposal.original} → {proposal.replacement}{' '}
        <button disabled={disabled} onClick={() => onApplyAge?.(proposal)}>Aplicar edad en {proposal.start + 1}</button></p>)}
    </div>}
  </section>;
}
