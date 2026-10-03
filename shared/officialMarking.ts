/** Official red marks preserve the selected characters; public hiding has a separate contract. */
export const OFFICIAL_MARK_CATEGORIES = ['name', 'surname', 'initials', 'nickname', 'address', 'vehicle_brand', 'serial', 'date', 'age'] as const;
export type OfficialMarkCategory = typeof OFFICIAL_MARK_CATEGORIES[number];
export const OFFICIAL_MARK_LABELS: Record<OfficialMarkCategory, string> = {
  name: 'Nombres completos o parciales', surname: 'Apellidos', initials: 'Iniciales identificativas', nickname: 'Apodos',
  address: 'Domicilios y sus componentes', vehicle_brand: 'Marcas de vehículos', serial: 'Números de serie', date: 'Fechas completas o parciales', age: 'Edades',
};
export interface OfficialMark { start: number; end: number; category: OfficialMarkCategory }
export interface OfficialFragment { text: string; marked: boolean; category?: OfficialMarkCategory }
export interface AgeCandidate { start: number; end: number; original: string; replacement: string; category: 'age' }
export const MAX_OFFICIAL_MARKS = 2000;

function splitsSurrogate(text: string, offset: number): boolean {
  return offset > 0 && offset < text.length && /[\uD800-\uDBFF]/.test(text[offset - 1]) && /[\uDC00-\uDFFF]/.test(text[offset]);
}

/** UTF-16 offsets match browser selections. Category selection is explicit, never inferred. */
export function validateOfficialMarks(text: string, value: unknown): OfficialMark[] {
  if (!Array.isArray(value) || value.length > MAX_OFFICIAL_MARKS) throw new Error('Plan de marcado oficial inválido.');
  const marks = value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Marca oficial inválida.');
    const { start, end, category } = item as Record<string, unknown>;
    if (typeof start !== 'number' || typeof end !== 'number' || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      start < 0 || end <= start || end > text.length || splitsSurrogate(text, start) || splitsSurrogate(text, end) ||
      typeof category !== 'string' || !(OFFICIAL_MARK_CATEGORIES as readonly string[]).includes(category)) throw new Error('Posiciones o categoría del marcado oficial inválidas.');
    return { start, end, category: category as OfficialMarkCategory };
  }).sort((a, b) => a.start - b.start);
  if (marks.some((mark, index) => index > 0 && mark.start < marks[index - 1].end)) throw new Error('Las marcas oficiales no pueden solaparse.');
  return marks;
}

export function officialFragments(text: string, marks: OfficialMark[]): OfficialFragment[] {
  const fragments: OfficialFragment[] = [];
  let cursor = 0;
  for (const mark of validateOfficialMarks(text, marks)) {
    if (cursor < mark.start) fragments.push({ text: text.slice(cursor, mark.start), marked: false });
    fragments.push({ text: text.slice(mark.start, mark.end), marked: true, category: mark.category });
    cursor = mark.end;
  }
  if (cursor < text.length || !fragments.length) fragments.push({ text: text.slice(cursor), marked: false });
  return fragments;
}

const units: Record<string, number> = { cero: 0, uno: 1, un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29 };
const tens: Record<string, number> = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
function ageNumber(value: string): number | undefined {
  const normalized = value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036F]/g, '').replace(/\s+/g, ' ').trim();
  if (/^\d{1,3}$/.test(normalized)) { const number = Number(normalized); return number <= 150 ? number : undefined; }
  if (normalized in units) return units[normalized];
  if (normalized in tens) return tens[normalized];
  const compound = /^(treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa) y (uno|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)$/.exec(normalized);
  if (compound) return tens[compound[1]] + units[compound[2]];
  if (normalized === 'cien') return 100;
  if (normalized.startsWith('ciento ')) { const rest = ageNumber(normalized.slice(7)); return rest !== undefined && rest >= 1 && rest <= 50 ? 100 + rest : undefined; }
  return undefined;
}

/** Conservative proposals require the word edad. No source text is edited and no duration is converted. */
export function ageCandidates(text: string): AgeCandidate[] {
  const wordUnits = [...Object.keys(units), 'dieciséis', 'veintiún', 'veintidós', 'veintitrés', 'veintiséis'].sort((a, b) => b.length - a.length).join('|');
  const wordTens = Object.keys(tens).join('|');
  const numberWords = `(?:\\d{1,3}|cien|(?:ciento\\s+)?(?:(?:${wordUnits})|(?:${wordTens})(?:\\s+y\\s+(?:uno|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve))?))`;
  const patterns = [new RegExp(`(?<![\\p{L}\\p{N}])(${numberWords})\\s+años?\\s+de\\s+edad\\b`, 'giu'),
    new RegExp(`\\bedad\\s*(?:de|es(?:\\s+de)?|:)\\s*(${numberWords})\\s+años?\\b`, 'giu')];
  const candidates: AgeCandidate[] = [];
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) {
    const original = match[1], number = ageNumber(original);
    if (number === undefined || /^\d+$/.test(original)) continue;
    const start = match.index + match[0].indexOf(original), end = start + original.length;
    if (!candidates.some(candidate => start < candidate.end && end > candidate.start)) candidates.push({ start, end, original, replacement: String(number), category: 'age' });
    if (candidates.length >= MAX_OFFICIAL_MARKS) return candidates.sort((a, b) => a.start - b.start);
  }
  return candidates.sort((a, b) => a.start - b.start);
}
