import { test } from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import { WordExportService } from '../../src/services/WordExportService.js';
import { approvedExportText, hashText, invalidateReview, publicFingerprint, reviewFingerprint, validateReview } from '../../shared/documentIntegrity.js';
import { literalCandidates, publicFragments, publicText, suggestRedactions, validateRedactions } from '../../shared/redaction.js';
import { parseDraft } from '../../shared/documents.js';
import type { DocumentDraft } from '../../shared/documents.js';

export const fixture = (): DocumentDraft => parseDraft({ title: 'María de la Cruz', caseNumber: 'TEST/2026', caseType: 'Penal', documentType: 'Sentencia Definitiva',
  summary: 'Fuente sintética reservada', transcription: 'Transcripción de trabajo', originalTranscription: 'Fuente ORIGINAL sintética',
  content: '  María de la Cruz declaró: «sí» & <exacto>.\r\n\r\n\tCorreo: maria@example.test; teléfono: +52 55 1234 5678.\nSímbolos: ñ á ü ⚖️ 😀.\nÚltima línea con espacios.  \n',
  completedPhases: ['Antecedentes y Competencia'], audit: { names: false, congruence: false, pii: false } });
export async function approved(draft = fixture()) {
  draft.audit = { names: true, congruence: true, pii: true }; draft.reviewHash = await reviewFingerprint(draft); return draft;
}
async function parts(blob: Blob) {
  const zip = new AdmZip(Buffer.from(await blob.arrayBuffer()));
  return Object.fromEntries(zip.getEntries().filter(entry => !entry.isDirectory).map(entry => [entry.entryName, entry.getData().toString('utf8')]));
}
function wordBody(xml: string) {
  const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, trimValues: false, parseTagValue: false });
  const data = parser.parse(xml);
  const paragraphs: string[] = [];
  const collect = (items: Record<string, unknown>[]): string => items.map(item => {
    if ('w:t' in item) return (item['w:t'] as { '#text': string }[]).map(node => node['#text'] ?? '').join('');
    if ('w:tab' in item) return '\t';
    return Object.entries(item).filter(([key]) => key !== ':@').map(([, value]) => Array.isArray(value) ? collect(value) : '').join('');
  }).join('');
  const visit = (items: Record<string, unknown>[]) => { for (const item of items) for (const [key, value] of Object.entries(item)) {
    if (key === 'w:p') paragraphs.push(collect(value as Record<string, unknown>[]));
    else if (Array.isArray(value)) visit(value);
  } };
  visit(data); return paragraphs.join('\n');
}

test('official Word retains approved characters, blank paragraphs, tabs, spaces and declared formatting', async () => {
  const draft = await approved();
  const artifact = await new WordExportService().createArtifact({ ...draft, revision: 7 }, 'official');
  const files = await parts(artifact.blob);
  assert.equal(wordBody(files['word/document.xml']), draft.content.replace(/\r\n?/g, '\n'));
  assert.equal(artifact.text, wordBody(files['word/document.xml']));
  assert.equal(artifact.contentHash, await hashText(artifact.text));
  assert.match(files['word/document.xml'], /w:ascii="Times New Roman"/); assert.match(files['word/document.xml'], /w:sz w:val="24"/);
  assert.match(files['word/document.xml'], /w:line="360"/); assert.match(files['word/document.xml'], /w:left="1701"/);
  assert.match(files['word/document.xml'], /w:w="12240" w:h="15840"/);
  assert.match(files['docProps/custom.xml'], new RegExp(artifact.contentHash)); assert.match(artifact.fileName, /OFICIAL_v7/);
});

test('public Word uses the exact selected plan, red replacements and no original in any package metadata', async () => {
  const draft = await approved();
  const ranges = ['María de la Cruz', 'maria@example.test', '+52 55 1234 5678'].flatMap(term => literalCandidates(draft.content, term).map(({ start, end }) => ({ start, end })));
  draft.publicVersion = { redactions: ranges, reviewed: true, reviewHash: null }; draft.publicVersion.reviewHash = await publicFingerprint(draft);
  const artifact = await new WordExportService().createArtifact(draft, 'public');
  const files = await parts(artifact.blob);
  assert.equal(wordBody(files['word/document.xml']), publicText(draft.content, ranges).replace(/\r\n?/g, '\n'));
  assert.match(files['word/document.xml'], /w:color w:val="B91C1C"/);
  for (const content of Object.values(files)) for (const hidden of ['María de la Cruz', 'maria@example.test', '+52 55 1234 5678', draft.summary, draft.originalTranscription!]) assert.ok(!content.includes(hidden));
  assert.match(artifact.fileName, /PUBLICA/); assert.ok(!artifact.fileName.includes(draft.title));
});

test('review approval binds both sources and the draft; each edited field rejects stale exports', async () => {
  const draft = await approved();
  for (const field of ['content', 'summary', 'transcription', 'originalTranscription', 'title', 'caseNumber', 'caseType', 'documentType'] as const) {
    const modified = { ...draft, [field]: draft[field] + ' cambiado' };
    await assert.rejects(approvedExportText(modified, 'official'), /revisa/i);
    const checked = await validateReview(modified); assert.equal(checked.reviewHash, null); assert.equal(checked.audit.names, false);
  }
  const changed = invalidateReview(draft, 'sources'); assert.equal(changed.phaseStates?.['Antecedentes y Competencia'], 'stale');
});

test('public review is separate, and changing a plan or content requires public confirmation again', async () => {
  const draft = await approved();
  assert.equal(await approvedExportText(draft, 'official'), draft.content);
  await assert.rejects(approvedExportText(draft, 'public'), /ocultaciones/);
  draft.publicVersion = { redactions: [{ start: 2, end: 18 }], reviewed: true, reviewHash: await publicFingerprint(draft) };
  await assert.rejects(approvedExportText(draft, 'public'), /ocultaciones/);
  draft.publicVersion.reviewHash = await publicFingerprint(draft);
  assert.notEqual(await approvedExportText(draft, 'public'), draft.content);
  const edited = invalidateReview({ ...draft, content: 'Nuevo texto' }, 'content');
  assert.deepEqual(edited.publicVersion?.redactions, []); assert.equal(edited.publicVersion?.reviewed, false);
});

test('ranges reject overlaps, stale offsets and half an emoji; manual matching is literal and repeated', () => {
  for (const ranges of [[{ start: -1, end: 1 }], [{ start: 0, end: 4 }], [{ start: 1, end: 2 }], [{ start: 0, end: 2 }, { start: 1, end: 3 }]]) assert.throws(() => validateRedactions('😀x', ranges));
  assert.equal(publicText('😀x', [{ start: 0, end: 2 }]), '[DATO OCULTO]x');
  assert.equal(literalCandidates('Ana (a+b) Ana (a+b)', '(a+b)').length, 2);
  assert.ok(publicFragments('Ana', [{ start: 0, end: 3 }]).every(fragment => !fragment.text.includes('Ana')));
});

test('suggestions find common identifiers and contacts but leave all text intact until selected', () => {
  const text = 'María Pérez correo persona@example.test, CURP GODE561231HDFRRN09, RFC GODE561231GR8, teléfono +52 55 1234 5678, fecha 12/03/2026.';
  const candidates = suggestRedactions(text);
  for (const kind of ['Correo', 'CURP', 'RFC', 'Teléfono', 'Fecha', 'Posible nombre']) assert.ok(candidates.some(candidate => candidate.kind === kind), kind);
  assert.equal(publicText(text, []), text);
});

test('legacy drafts require new approval, optional state persists and download failures propagate', async () => {
  const draft = await approved();
  const old = { ...draft }; delete old.reviewHash; delete old.originalTranscription;
  const migrated = parseDraft(old); assert.equal(migrated.audit.pii, false); assert.equal(migrated.originalTranscription, old.transcription);
  let downloads = 0;
  await assert.rejects(new WordExportService(() => { downloads++; throw new Error('Descarga fallida'); }).exportToWord(draft, 'official'), /Descarga fallida/);
  assert.equal(downloads, 1);
  await assert.rejects(new WordExportService().createArtifact({ ...draft, content: 'Cambió después de revisar' }, 'official'), /revisa/i);
});

test('unsupported XML controls fail explicitly and empty content can never be approved for export', async () => {
  for (const text of ['', '  ', 'Contenido\u0000inválido', 'Surrogado\uD800']) {
    const draft = await approved({ ...fixture(), content: text });
    await assert.rejects(new WordExportService().createArtifact(draft, 'official'));
  }
});
