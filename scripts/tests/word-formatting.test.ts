import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import { ageCandidates, officialFragments, OFFICIAL_MARK_CATEGORIES, validateOfficialMarks } from '../../shared/officialMarking.js';
import { parseWordFormat, WORD_PROFILES } from '../../shared/wordFormatting.js';
import { buildWordArtifact } from '../../shared/wordDocument.js';
import { WordExportService } from '../../src/services/WordExportService.js';
import { reviewFingerprint } from '../../shared/documentIntegrity.js';
import { parseDraft } from '../../shared/documents.js';
import type { DocumentDraft } from '../../shared/documents.js';

const fixture = () => parseDraft({ title: 'Título sintético', caseNumber: 'TEST/2026', caseType: 'Penal', documentType: 'Documento', summary: '', transcription: '',
  originalTranscription: 'Fuente original sintética', content: '  María de la Cruz declara.', completedPhases: [], audit: { names: false, congruence: false, pii: false } });
async function approved(draft: DocumentDraft): Promise<DocumentDraft> {
  const approved = { ...draft, audit: { names: true, congruence: true, pii: true } }; approved.reviewHash = await reviewFingerprint(approved); return approved;
}

type XmlNode = Record<string, unknown>;
const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, trimValues: false, parseTagValue: false });
function visible(nodes: XmlNode[]): string {
  return nodes.map(node => {
    if ('w:t' in node) return (node['w:t'] as XmlNode[]).map(item => item['#text'] ?? '').join('');
    if ('w:tab' in node) return '\t';
    if ('w:br' in node) return '\n';
    return Object.entries(node).filter(([key, value]) => key !== ':@' && Array.isArray(value)).map(([, value]) => visible(value as XmlNode[])).join('');
  }).join('');
}
function inspect(bytes: Uint8Array) {
  const zip = new AdmZip(Buffer.from(bytes));
  const xml = zip.readAsText('word/document.xml');
  const document = (parser.parse(xml) as XmlNode[]).find(node => 'w:document' in node)!['w:document'] as XmlNode[];
  const body = document.find(node => 'w:body' in node)!['w:body'] as XmlNode[];
  const paragraphs = body.filter(node => 'w:p' in node).map(node => node['w:p'] as XmlNode[]);
  const red = (color: string) => paragraphs.flatMap(paragraph => paragraph.filter(node => 'w:r' in node).map(node => node['w:r'] as XmlNode[]))
    .filter(run => (run.find(node => 'w:rPr' in node)?.['w:rPr'] as XmlNode[] | undefined)?.some(node => 'w:color' in node && (node[':@'] as XmlNode)?.['@_w:val'] === color)).map(visible).join('');
  return { zip, xml, text: paragraphs.map(visible).join('\n'), red };
}

test('official categories are exactly the GPT categories; marks preserve UTF-16 text and never hide it', () => {
  assert.deepEqual(OFFICIAL_MARK_CATEGORIES, ['name', 'surname', 'initials', 'nickname', 'address', 'vehicle_brand', 'serial', 'date', 'age']);
  const text = '😀 Ana 16 años; 09:15; 300 pesos.';
  const marks = validateOfficialMarks(text, [{ start: 3, end: 6, category: 'name' }, { start: 7, end: 14, category: 'age' }]);
  assert.equal(officialFragments(text, marks).map(fragment => fragment.text).join(''), text);
  assert.equal(officialFragments(text, marks).filter(fragment => fragment.marked).map(fragment => fragment.text).join('|'), 'Ana|16 años');
  assert.ok(!officialFragments(text, marks).find(fragment => fragment.marked && /09:15|300/.test(fragment.text)));
});

test('official marks reject stale positions, invalid categories, overlaps, split emojis and oversized plans', () => {
  const invalid: unknown[] = [null, {}, [{ start: 1, end: 2, category: 'name' }], [{ start: 0, end: 2, category: 'phone' }],
    [{ start: 0, end: 5, category: 'name' }], [{ start: 0, end: 2, category: 'name' }, { start: 0, end: 3, category: 'age' }],
    [{ start: 0.5, end: 2, category: 'name' }], Array.from({ length: 2001 }, () => ({ start: 0, end: 2, category: 'name' }))];
  for (const value of invalid) assert.throws(() => validateOfficialMarks('😀x', value));
  assert.deepEqual(validateOfficialMarks('AnaSol', [{ start: 3, end: 6, category: 'surname' }, { start: 0, end: 3, category: 'name' }]),
    [{ start: 0, end: 3, category: 'name' }, { start: 3, end: 6, category: 'surname' }]);
});

test('age proposals convert only explicit ages with visible replacements and leave durations and all source characters untouched', () => {
  const text = 'Tiene dieciséis años de edad. Edad: treinta y dos años. Edad de ciento veinte años. Lleva dieciséis años trabajando. A las 16:20 pagó 16 pesos; 16 años de edad.';
  const candidates = ageCandidates(text);
  assert.deepEqual(candidates.map(candidate => [candidate.original, candidate.replacement]), [['dieciséis', '16'], ['treinta y dos', '32'], ['ciento veinte', '120']]);
  for (const candidate of candidates) assert.equal(text.slice(candidate.start, candidate.end), candidate.original);
  assert.equal(ageCandidates('cinco años de antigüedad; mil años de edad; Edad: desconocida años.').length, 0);
  assert.ok(text.includes('dieciséis años de edad'));
});

test('profile parsing validates supplied court metadata, exact profile and original positions without mutating input', () => {
  const input = { profile: 'transcript647', court: 'Juzgado aportado', marks: [{ start: 0, end: 3, category: 'name' }] };
  assert.deepEqual(parseWordFormat('Ana', input), input);
  assert.deepEqual(parseWordFormat('Ana', { profile: 'judicial' }), { profile: 'judicial', marks: [] });
  for (const value of [{ profile: 'arbitrary' }, { profile: 'judicial', court: 'Juzgado\nOtro' }, { profile: 'judicial', marks: 'Ana' }, { profile: 'judicial', marks: [{ start: 0, end: 4, category: 'name' }] }]) assert.throws(() => parseWordFormat('Ana', value));
});

test('judicial Word uses explicit Carta dimensions, Blueprint margins, indent, actual header and centered page field', async () => {
  const artifact = await buildWordArtifact({ text: 'RESULTANDO\nTexto íntegro.', title: 'Título aportado', caseNumber: 'TEST/2026', documentType: 'Sentencia',
    format: { profile: 'judicial', court: 'Juzgado aportado', marks: [] } });
  const data = inspect(artifact.bytes);
  assert.equal(data.text, 'RESULTANDO\nTexto íntegro.');
  for (const pattern of [/w:w="12240" w:h="15840"/, /w:top="1701"/, /w:right="1417"/, /w:bottom="1417"/, /w:left="1701"/, /w:firstLine="709"/, /w:line="360"/, /w:b\//]) assert.match(data.xml, pattern);
  const header = data.zip.readAsText('word/header1.xml'), footer = data.zip.readAsText('word/footer1.xml');
  assert.match(header, /Juzgado aportado/); assert.match(header, /TEST\/2026/); assert.match(header, /Sentencia/);
  assert.match(footer, /w:val="center"/); assert.match(footer, /PAGE/);
  assert.ok(!data.xml.includes('PODER JUDICIAL DEL ESTADO DE NUEVO LEÓN'));
});

test('double spacing is selected by its own reviewed profile without rewriting or adding judicial sections', async () => {
  const artifact = await buildWordArtifact({ text: 'Primera\nÚltima', format: { profile: 'judicialDouble', marks: [] } });
  const data = inspect(artifact.bytes);
  assert.equal(data.text, 'Primera\nÚltima'); assert.match(data.xml, /w:line="480"/);
  assert.ok(!data.zip.getEntry('word/header1.xml'));
});

test('transcript647 reproduces model section and NormalWeb layout without initial summary or fabricated identities', async () => {
  const text = '[00:00.000 → 00:01.500] SPK_2\n  Literal 😀\t<&>  \n\n[00:01.200 → 00:03.700]\nSin hablante suministrado.\n';
  const artifact = await buildWordArtifact({ text, title: 'TRANSCRIPCIÓN', format: { profile: 'transcript647', marks: [] } });
  const data = inspect(artifact.bytes);
  assert.equal(data.text, text); assert.equal(data.zip.readAsText('docProps/core.xml').includes('TRANSCRIPCIÓN'), true);
  for (const pattern of [/w:w="12240" w:h="15840"/, /w:top="1440"/, /w:right="1800"/, /w:bottom="1440"/, /w:left="1800"/, /w:line="240"/, /w:before="100"/, /w:after="100"/, /w:ascii="Times New Roman"/, /w:sz w:val="24"/, /w:val="left"/]) assert.match(data.xml, pattern);
  assert.ok(!data.zip.getEntry('word/header1.xml')); assert.ok(!data.zip.getEntry('word/footer1.xml'));
  assert.equal((data.text.match(/SPK_/g) ?? []).length, 1);
  assert.deepEqual(WORD_PROFILES.transcript647.margins, { top: 1440, right: 1800, bottom: 1440, left: 1800, header: 720, footer: 720 });
});

test('red marking is a style over exact official ranges; hours, quantities and ordinary numbers remain black', async () => {
  const text = 'Ana\n16 años; 09:15; 300 pesos.';
  const artifact = await buildWordArtifact({ text, format: { profile: 'transcript647', marks: [{ start: 0, end: 3, category: 'name' }, { start: 4, end: 11, category: 'age' }] } });
  const data = inspect(artifact.bytes);
  assert.equal(data.text, text); assert.equal(data.red('FF0000'), 'Ana16 años');
  assert.ok(data.xml.includes('09:15; 300 pesos.'));
  assert.equal(artifact.contentHash, createHash('sha256').update(text).digest('hex'));
});

test('newline normalization maps reviewed red ranges correctly and rejects boundaries inside CRLF', async () => {
  const text = 'Primera\r\nAna\rFin';
  const artifact = await buildWordArtifact({ text, format: { profile: 'judicial', marks: [{ start: 9, end: 12, category: 'name' }] } });
  const data = inspect(artifact.bytes);
  assert.equal(data.text, 'Primera\nAna\nFin'); assert.equal(data.red('FF0000'), 'Ana');
  await assert.rejects(buildWordArtifact({ text, format: { profile: 'judicial', marks: [{ start: 0, end: 8, category: 'name' }] } }), /salto de línea/);
});

test('literal export exceeds editor text limit, includes more than 200 interventions and hashes exact bytes independently', async () => {
  const text = Array.from({ length: 205 }, (_, index) => `[00:${index}.000] SPK_1\n${index}: ${'literal '.repeat(320)}\n`).join('\n');
  assert.ok(text.length > 500000);
  const artifact = await buildWordArtifact({ text, format: { profile: 'transcript647', marks: [] } });
  assert.equal(inspect(artifact.bytes).text, text);
  assert.equal(artifact.artifactHash, createHash('sha256').update(artifact.bytes).digest('hex'));
  assert.equal(artifact.contentHash, createHash('sha256').update(text).digest('hex'));
  const corrupted = artifact.bytes.slice(); corrupted[20] ^= 1;
  assert.notEqual(createHash('sha256').update(corrupted).digest('hex'), artifact.artifactHash);
});

test('public replacement coloring never reuses official ranges or embeds supplied private metadata', async () => {
  const artifact = await buildWordArtifact({ text: '[DATO OCULTO] declara.', title: 'Persona privada', caseNumber: 'CASE-SECRETO', documentType: 'Tipo privado', variant: 'public',
    publicMarks: [{ start: 0, end: 13 }], format: { profile: 'judicial', court: 'Juzgado privado', marks: [] } });
  const data = inspect(artifact.bytes);
  assert.equal(data.red('B91C1C'), '[DATO OCULTO]'); assert.equal(data.red('FF0000'), '');
  for (const entry of data.zip.getEntries()) if (!entry.isDirectory) for (const privateValue of ['Persona privada', 'CASE-SECRETO', 'Tipo privado', 'Juzgado privado']) assert.ok(!entry.getData().toString('utf8').includes(privateValue));
  await assert.rejects(buildWordArtifact({ text: 'Ana', variant: 'public', format: { profile: 'judicial', marks: [{ start: 0, end: 3, category: 'name' }] } }), /por separado/);
  await assert.rejects(buildWordArtifact({ text: 'Ana', publicMarks: [{ start: 0, end: 3 }], format: { profile: 'judicial', marks: [] } }), /propia variante/);
});

test('WordExportService requires approval for format and official marks, preserves source and returns binary fingerprint', async () => {
  const draft = await approved({ ...fixture(), wordFormat: { profile: 'transcript647', marks: [{ start: 2, end: 18, category: 'name' }] } });
  const artifact = await new WordExportService().createArtifact(draft, 'official');
  const bytes = new Uint8Array(await artifact.blob.arrayBuffer());
  assert.equal(artifact.artifactHash, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(inspect(bytes).red('FF0000'), 'María de la Cruz');
  assert.equal(draft.originalTranscription, fixture().originalTranscription);
  const changed = { ...draft, wordFormat: { ...draft.wordFormat!, profile: 'judicial' as const } };
  await assert.rejects(new WordExportService().createArtifact(changed, 'official'), /revisa/i);
  changed.reviewHash = await reviewFingerprint(changed);
  assert.ok((await new WordExportService().createArtifact(changed, 'official')).blob.size > 0);
});

test('invalid XML, unpaired Unicode, invalid metadata, revision and excessive text fail explicitly without truncation', async () => {
  for (const text of ['  ', 'Texto\u0000', 'Texto\uD800', 'Texto\uFFFF']) await assert.rejects(buildWordArtifact({ text, format: { profile: 'judicial', marks: [] } }));
  await assert.rejects(buildWordArtifact({ text: 'Texto', title: 'Título\nOtro', format: { profile: 'judicial', marks: [] } }));
  await assert.rejects(buildWordArtifact({ text: 'Texto', revision: -1, format: { profile: 'judicial', marks: [] } }));
  await assert.rejects(buildWordArtifact({ text: 'x'.repeat(20 * 1024 * 1024 + 1), format: { profile: 'judicial', marks: [] } }), /demasiado grande/);
});
