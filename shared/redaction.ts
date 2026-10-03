export interface RedactionRange { start: number; end: number }
export interface RedactionCandidate extends RedactionRange { kind: string }
export const REDACTION_LABEL = '[DATO OCULTO]';

function splitsSurrogate(text: string, position: number) {
  return position > 0 && position < text.length && /[\uD800-\uDBFF]/.test(text[position - 1]) && /[\uDC00-\uDFFF]/.test(text[position]);
}
/** Validate exact UTF-16 positions against the current draft; no overlapping or partial Unicode characters. */
export function validateRedactions(text: string, value: unknown): RedactionRange[] {
  if (!Array.isArray(value) || value.length > 2000) throw new Error('Plan de ocultación inválido.');
  const ranges = value.map(range => {
    if (!range || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0 ||
      range.end <= range.start || range.end > text.length || splitsSurrogate(text, range.start) || splitsSurrogate(text, range.end)) throw new Error('Posiciones de ocultación inválidas.');
    return { start: range.start as number, end: range.end as number };
  }).sort((a, b) => a.start - b.start);
  if (ranges.some((range, index) => index > 0 && range.start < ranges[index - 1].end)) throw new Error('Las ocultaciones no pueden solaparse.');
  return ranges;
}

/** Public preview and Word share these exact fragments; originals never enter replacement attributes. */
export function publicFragments(text: string, ranges: RedactionRange[]): { text: string; hidden: boolean }[] {
  const valid = validateRedactions(text, ranges);
  const fragments: { text: string; hidden: boolean }[] = [];
  let position = 0;
  for (const range of valid) {
    if (position < range.start) fragments.push({ text: text.slice(position, range.start), hidden: false });
    fragments.push({ text: REDACTION_LABEL, hidden: true }); position = range.end;
  }
  if (position < text.length || !fragments.length) fragments.push({ text: text.slice(position), hidden: false });
  return fragments;
}
export const publicText = (text: string, ranges: RedactionRange[]) => publicFragments(text, ranges).map(fragment => fragment.text).join('');

/** Exact, case-sensitive manual matching; the user chooses which occurrences to hide. */
export function literalCandidates(text: string, term: string): RedactionCandidate[] {
  if (!term.trim()) return [];
  const ranges: RedactionCandidate[] = [];
  let start = text.indexOf(term);
  while (start >= 0 && ranges.length < 2000) { ranges.push({ start, end: start + term.length, kind: 'Selección manual' }); start = text.indexOf(term, start + term.length); }
  return ranges;
}

/** Suggestions only. Names, addresses and contextual sensitive facts still need human review. */
export function suggestRedactions(text: string): RedactionCandidate[] {
  const patterns: [string, RegExp][] = [
    ['Correo', /[\w.!#$%&'*+/=?^`{|}~-]+@[\w.-]+\.[a-zA-Z]{2,}/g],
    ['CURP', /\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d\b/gi],
    ['RFC', /\b[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}\b/gi],
    ['Teléfono', /(?<!\w)(?:\+?52[ .-]?)?(?:\(\d{2,3}\)|\d{2,3})[ .-]?\d{3,4}[ .-]?\d{4}(?!\w)/g],
    ['Fecha', /\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/g],
    ['Posible nombre', /\b[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+(?:\s+(?:de|del|la|las|los))?(?:\s+[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+){1,3}/g],
  ];
  const candidates: RedactionCandidate[] = [];
  for (const [kind, pattern] of patterns) for (const match of text.matchAll(pattern)) {
    const start = match.index, end = start + match[0].length;
    if (candidates.length >= 2000) break;
    if (!candidates.some(range => start < range.end && end > range.start)) candidates.push({ start, end, kind });
  }
  return candidates.sort((a, b) => a.start - b.start);
}
