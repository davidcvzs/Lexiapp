import { AlignmentType, Document, Footer, Header, LineRuleType, Packer, PageNumber, Paragraph, Tab, TextRun } from 'docx';
import { officialFragments } from './officialMarking.js';
import { parseWordFormat, WORD_PROFILES } from './wordFormatting.js';
import { validateRedactions } from './redaction.js';
import type { WordFormat } from './wordFormatting.js';
import type { RedactionRange } from './redaction.js';

export interface BuildWordOptions {
  text: string; title?: string; caseNumber?: string; documentType?: string; format: WordFormat; revision?: number; variant?: 'official' | 'public';
  /** Positions in the already masked public text, never positions or content from the private source. */
  publicMarks?: RedactionRange[];
}
export interface BuiltWordArtifact { bytes: Uint8Array; text: string; contentHash: string; artifactHash: string }
export const WORD_MEDIA_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_WORD_TEXT_BYTES = 20 * 1024 * 1024;

function checkXml(text: string): void {
  // eslint-disable-next-line no-control-regex -- XML cannot preserve these controls or incomplete Unicode characters.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]|[\uFFFE\uFFFF]/.test(text)) throw new Error('El texto contiene caracteres incompatibles con Word. Corrígelos antes de exportar.');
}
function metadata(value: unknown, max: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > max || /[\r\n\t]/.test(value)) throw new Error('Metadatos Word inválidos.');
  checkXml(value); return value;
}
export async function wordBytesHash(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function normalizedRanges<T extends RedactionRange>(text: string, ranges: T[]): T[] {
  const offsets = [...new Set(ranges.flatMap(range => [range.start, range.end]))].sort((a, b) => a - b);
  const positions = new Map<number, number>();
  let cursor = 0, removed = 0;
  for (const offset of offsets) {
    if (offset > 0 && text[offset - 1] === '\r' && text[offset] === '\n') throw new Error('Una marca no puede dividir un salto de línea.');
    removed += text.slice(cursor, offset).match(/\r\n/g)?.length ?? 0;
    positions.set(offset, offset - removed); cursor = offset;
  }
  return ranges.map(range => ({ ...range, start: positions.get(range.start)!, end: positions.get(range.end)! }));
}

/** Pure browser/server construction. Binary and content hashes describe bytes, not a download confirmation. */
export async function buildWordArtifact(options: BuildWordOptions): Promise<BuiltWordArtifact> {
  if (!options || typeof options.text !== 'string' || !options.text.trim() || new TextEncoder().encode(options.text).byteLength > MAX_WORD_TEXT_BYTES) throw new Error('Texto Word vacío o demasiado grande.');
  checkXml(options.text);
  const variant = options.variant ?? 'official';
  if (variant !== 'official' && variant !== 'public') throw new Error('Variante Word inválida.');
  if (options.revision !== undefined && (!Number.isSafeInteger(options.revision) || options.revision < 0)) throw new Error('Revisión Word inválida.');
  const parsed = parseWordFormat(options.text, options.format);
  const title = metadata(options.title, 200), caseNumber = metadata(options.caseNumber, 100), documentType = metadata(options.documentType, 100);
  if (parsed.court !== undefined) checkXml(parsed.court);
  if (variant === 'official' && options.publicMarks !== undefined) throw new Error('Las ocultaciones públicas requieren su propia variante.');
  if (variant === 'public' && parsed.marks.length) throw new Error('El marcado oficial y las ocultaciones públicas se revisan por separado.');
  const text = options.text.replace(/\r\n?/g, '\n');
  const format = { ...parsed, marks: normalizedRanges(options.text, parsed.marks) };
  const publicMarks = normalizedRanges(options.text, validateRedactions(options.text, options.publicMarks ?? []));
  const profile = WORD_PROFILES[format.profile];
  const fragments: { text: string; color: string }[] = variant === 'official' ? officialFragments(text, format.marks).map(fragment => ({ text: fragment.text, color: fragment.marked ? 'FF0000' : '000000' })) : (() => {
    const result: { text: string; color: string }[] = []; let cursor = 0;
    for (const range of publicMarks) {
      if (cursor < range.start) result.push({ text: text.slice(cursor, range.start), color: '000000' });
      result.push({ text: text.slice(range.start, range.end), color: 'B91C1C' }); cursor = range.end;
    }
    if (cursor < text.length || !result.length) result.push({ text: text.slice(cursor), color: '000000' });
    return result;
  })();
  const lines: { text: string; color: string }[][] = [[]];
  for (const fragment of fragments) fragment.text.split('\n').forEach((line, index) => {
    if (index) lines.push([]);
    lines.at(-1)!.push({ text: line, color: fragment.color });
  });
  const children = lines.map(fragments => {
    const heading = format.profile !== 'transcript647' && /^(?:RESULTANDO|CONSIDERANDO|RESUELVE)\s*[:.]?\s*$/.test(fragments.map(fragment => fragment.text).join(''));
    return new Paragraph({ alignment: heading ? AlignmentType.CENTER : profile.alignment,
      spacing: { before: profile.before, after: profile.after, line: profile.line, lineRule: LineRuleType.AUTO },
      indent: { firstLine: heading ? 0 : profile.firstLine }, children: fragments.map(fragment => new TextRun({
        children: fragment.text.split('\t').flatMap((part, position) => position ? [new Tab(), part] : [part]),
        font: profile.font, size: profile.size, color: fragment.color, bold: heading,
      })) });
  });
  // Header values are supplied metadata and never sample court names or an initial source summary.
  const headerLines = variant === 'public' ? [] : [format.court, caseNumber ? `Expediente: ${caseNumber}` : undefined, documentType].filter((value): value is string => !!value);
  const header = headerLines.length ? new Header({ children: headerLines.map(line => new Paragraph({ alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: line, font: profile.font, size: profile.size, color: '000000', bold: true })] })) }) : undefined;
  const footer = profile.pageNumbers ? new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
    children: [new TextRun({ children: [PageNumber.CURRENT], font: profile.font, size: profile.size, color: '000000' })] })] }) : undefined;
  const contentHash = await wordBytesHash(new TextEncoder().encode(text));
  const doc = new Document({ creator: 'LexIA', title: variant === 'public' ? 'Versión pública revisada' : title ?? '',
    description: variant === 'public' ? 'Documento con ocultaciones revisadas por el usuario.' : 'Documento revisado por el usuario.',
    customProperties: [{ name: 'LexIAContentSHA256', value: contentHash }, { name: 'LexIAVariant', value: variant },
      { name: 'LexIARevision', value: String(options.revision ?? 0) }, { name: 'LexIAFormatProfile', value: format.profile }],
    sections: [{ properties: { page: { size: profile.page, margin: profile.margins } },
      ...(header ? { headers: { default: header } } : {}), ...(footer ? { footers: { default: footer } } : {}), children }],
  });
  const bytes = new Uint8Array(await Packer.toArrayBuffer(doc));
  return { bytes, text, contentHash, artifactHash: await wordBytesHash(bytes) };
}
