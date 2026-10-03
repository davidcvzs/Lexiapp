import { createHash } from 'node:crypto';
import AdmZip from 'adm-zip';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { isRecord, parseTranscriptManifest, validSha256 } from '../../shared/transcription.js';
import { canonicalSegments, formatLiteralTranscript, parseTranscriptPage, MAX_TRANSCRIPT_PAGE_SEGMENTS, validateTranscriptSequence } from '../../shared/transcriptSegments.js';
import type { TranscriptSegment } from '../../shared/transcriptSegments.js';
import { buildWordArtifact } from '../../shared/wordDocument.js';
import { parseWordFormat, WORD_PROFILES } from '../../shared/wordFormatting.js';
import type { WordFormat } from '../../shared/wordFormatting.js';
import { MAX_WORD_ARTIFACT_BYTES, parseTranscriptWordRequest, transcriptWordReviewHash } from '../../shared/transcriptWord.js';
import type { RemoteDeletionState, TranscriptWordReceipt, TranscriptWordState } from '../../shared/transcriptWord.js';
import { RequestError } from '../middleware/security.js';
import { WorkspaceRepository } from '../persistence/WorkspaceRepository.js';
import type { JobStore } from '../persistence/WorkspaceRepository.js';
import { MAX_SOURCE_BYTES } from '../persistence/TranscriptStore.js';
import type { SegmentJobStore } from '../persistence/TranscriptStore.js';
import { TranscriptArtifactStore } from '../persistence/TranscriptArtifactStore.js';
import type { StoredWordArtifact, TranscriptArtifactRepository } from '../persistence/TranscriptArtifactStore.js';
import { CloudflareTranscriptionService } from './CloudflareTranscriptionService.js';
import type { RemoteDeletionCheck } from './CloudflareTranscriptionService.js';

type WordSources = Pick<JobStore, 'getJob'> & Pick<SegmentJobStore, 'getSegmentPage'>;
export interface RemoteVideoProvider {
  deleteRemote(jobId: string, signal: AbortSignal, ownerId: string): Promise<void>;
  checkRemoteDeletion(jobId: string, signal: AbortSignal, ownerId: string): Promise<RemoteDeletionCheck>;
}
type XmlNode = Record<string, unknown>;
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const child = (node: XmlNode, key: string): XmlNode[] => Array.isArray(node[key]) ? node[key] as XmlNode[] : [];
function descendants(nodes: XmlNode[], key: string): XmlNode[] {
  const found: XmlNode[] = [];
  for (const node of nodes) for (const [name, value] of Object.entries(node)) {
    if (name === key) found.push(node);
    else if (name !== ':@' && Array.isArray(value)) found.push(...descendants(value as XmlNode[], key));
  }
  return found;
}
function runText(nodes: XmlNode[]): string {
  return nodes.map(node => {
    if ('w:t' in node) return child(node, 'w:t').map(text => typeof text['#text'] === 'string' ? text['#text'] : '').join('');
    if ('w:tab' in node) return '\t';
    if ('w:br' in node || 'w:cr' in node) return '\n';
    return Object.entries(node).filter(([key]) => key !== ':@').map(([, value]) => Array.isArray(value) ? runText(value as XmlNode[]) : '').join('');
  }).join('');
}
function attributes(nodes: XmlNode[], key: string): Record<string, unknown> {
  const found = descendants(nodes, key);
  if (found.length !== 1 || !isRecord(found[0][':@'])) throw new Error('format');
  return found[0][':@'];
}
function attributeEquals(attrs: Record<string, unknown>, name: string, expected: string | number): void {
  if (attrs[`@_${name}`] !== String(expected)) throw new Error('format');
}
function xmlNodes(xml: string): XmlNode[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('xml');
  return new XMLParser({ preserveOrder: true, ignoreAttributes: false, trimValues: false, parseTagValue: false }).parse(xml) as XmlNode[];
}
interface Range { start: number; end: number }
function coloredRanges(text: string, ranges: Range[]): Range[] {
  const result: Range[] = [];
  const append = (start: number, end: number) => {
    if (end <= start) return;
    const previous = result.at(-1);
    if (previous?.end === start) previous.end = end;
    else result.push({ start, end });
  };
  for (const range of ranges) {
    let start = range.start;
    for (let index = text.indexOf('\n', start); index >= 0 && index < range.end; index = text.indexOf('\n', start)) {
      append(start, index); start = index + 1;
    }
    append(start, range.end);
  }
  return result;
}

/** Check actual OOXML body and official red positions, rather than trusting generator properties. */
export function verifyTranscriptWordDocument(bytes: Uint8Array, expectedText: string, format: WordFormat, caseNumber?: string): void {
  try {
    if (bytes.byteLength < 1 || bytes.byteLength > MAX_WORD_ARTIFACT_BYTES) throw new Error('size');
    const zip = new AdmZip(Buffer.from(bytes)), matches = zip.getEntries().filter(entry => entry.entryName === 'word/document.xml' && !entry.isDirectory);
    if (matches.length !== 1 || matches[0].header.size > 128 * 1024 * 1024) throw new Error('package');
    const nodes = xmlNodes(new TextDecoder('utf-8', { fatal: true }).decode(matches[0].getData()));
    const bodies = descendants(nodes, 'w:body');
    if (bodies.length !== 1) throw new Error('body');
    const body = child(bodies[0], 'w:body'), sections = descendants(body, 'w:sectPr'), profile = WORD_PROFILES[format.profile];
    if (sections.length !== 1) throw new Error('sections');
    const section = child(sections[0], 'w:sectPr'), size = attributes(section, 'w:pgSz'), margins = attributes(section, 'w:pgMar');
    attributeEquals(size, 'w:w', profile.page.width); attributeEquals(size, 'w:h', profile.page.height);
    for (const [name, value] of Object.entries(profile.margins)) attributeEquals(margins, `w:${name}`, value);
    const paragraphs = descendants(body, 'w:p');
    const text: string[] = [], red: Range[] = []; let offset = 0;
    for (const paragraph of paragraphs) {
      const content = child(paragraph, 'w:p'), value = runText(content);
      const heading = format.profile !== 'transcript647' && /^(?:RESULTANDO|CONSIDERANDO|RESUELVE)\s*[:.]?\s*$/.test(value);
      const spacing = attributes(content, 'w:spacing'), indent = attributes(content, 'w:ind');
      attributeEquals(spacing, 'w:before', profile.before); attributeEquals(spacing, 'w:after', profile.after);
      attributeEquals(spacing, 'w:line', profile.line); attributeEquals(spacing, 'w:lineRule', 'auto');
      attributeEquals(indent, 'w:firstLine', heading ? 0 : profile.firstLine);
      attributeEquals(attributes(content, 'w:jc'), 'w:val', heading ? 'center' : profile.alignment);
      let runOffset = offset;
      for (const run of descendants(content, 'w:r')) {
        const children = child(run, 'w:r'), runValue = runText(children);
        const fonts = attributes(children, 'w:rFonts');
        for (const name of ['w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia']) attributeEquals(fonts, name, profile.font);
        attributeEquals(attributes(children, 'w:sz'), 'w:val', profile.size);
        attributeEquals(attributes(children, 'w:szCs'), 'w:val', profile.size);
        const bold = descendants(children, 'w:b');
        if (bold.length !== 1) throw new Error('heading');
        if (heading ? isRecord(bold[0][':@']) && bold[0][':@']['@_w:val'] === 'false' : !isRecord(bold[0][':@']) || bold[0][':@']['@_w:val'] !== 'false') throw new Error('heading');
        const colors = descendants(children, 'w:color');
        const colorAttributes = colors[0]?.[':@'];
        const color = isRecord(colorAttributes) ? colorAttributes['@_w:val'] : undefined;
        if (color !== '000000' && color !== 'FF0000') throw new Error('color');
        if (typeof color === 'string' && color.toUpperCase() === 'FF0000' && runValue.length) red.push({ start: runOffset, end: runOffset + runValue.length });
        runOffset += runValue.length;
      }
      text.push(value); offset += value.length + 1;
    }
    const actual = text.join('\n');
    if (actual !== expectedText || JSON.stringify(coloredRanges(actual, red)) !== JSON.stringify(coloredRanges(expectedText, format.marks))) throw new Error('content');
    const headerEntries = zip.getEntries().filter(entry => /^word\/header\d+\.xml$/.test(entry.entryName));
    const footerEntries = zip.getEntries().filter(entry => /^word\/footer\d+\.xml$/.test(entry.entryName));
    const expectedHeader = [format.court, caseNumber ? `Expediente: ${caseNumber}` : undefined].filter(Boolean).join('\n');
    if (headerEntries.length !== (expectedHeader ? 1 : 0) || footerEntries.length !== (profile.pageNumbers ? 1 : 0)) throw new Error('headerFooter');
    const relationship = (key: 'w:headerReference' | 'w:footerReference', entryName: string | undefined) => {
      const references = descendants(section, key);
      if (!entryName) { if (references.length) throw new Error('reference'); return; }
      if (references.length !== 1 || !isRecord(references[0][':@'])) throw new Error('reference');
      const ref = references[0][':@']; attributeEquals(ref, 'w:type', 'default');
      const relations = xmlNodes(zip.readAsText('word/_rels/document.xml.rels'));
      const found = descendants(relations, 'Relationship').filter(node => isRecord(node[':@']) && node[':@']['@_Id'] === ref['@_r:id']);
      if (found.length !== 1 || !isRecord(found[0][':@']) || found[0][':@']['@_Target'] !== entryName.slice(5)
        || found[0][':@']['@_Type'] !== `http://schemas.openxmlformats.org/officeDocument/2006/relationships/${key === 'w:headerReference' ? 'header' : 'footer'}`) throw new Error('reference');
    };
    relationship('w:headerReference', headerEntries[0]?.entryName); relationship('w:footerReference', footerEntries[0]?.entryName);
    if (headerEntries.length) {
      const headers = xmlNodes(headerEntries[0].getData().toString('utf8'));
      const paragraphs = descendants(headers, 'w:p');
      if (paragraphs.map(paragraph => runText(child(paragraph, 'w:p'))).join('\n') !== expectedHeader) throw new Error('header');
      for (const paragraph of paragraphs) attributeEquals(attributes(child(paragraph, 'w:p'), 'w:jc'), 'w:val', 'center');
    }
    if (footerEntries.length) {
      const footers = xmlNodes(footerEntries[0].getData().toString('utf8')), paragraphs = descendants(footers, 'w:p');
      if (paragraphs.length !== 1 || runText(child(paragraphs[0], 'w:p')) !== '') throw new Error('footer');
      attributeEquals(attributes(child(paragraphs[0], 'w:p'), 'w:jc'), 'w:val', 'center');
      const fields = descendants(footers, 'w:instrText');
      if (fields.length !== 1 || child(fields[0], 'w:instrText').map(node => node['#text'] ?? '').join('').trim() !== 'PAGE') throw new Error('pagination');
    }
  } catch { throw new RequestError(502, 'El Word generado no conserva el texto, formato, metadatos y marcado oficial revisados. No se autoriza borrar el video.'); }
}

/** Build and preserve literal Word from authoritative segments; deletion is a separate confirmed action. */
export class TranscriptWordService {
  private readonly jobs: WordSources;
  private readonly artifacts: TranscriptArtifactRepository;
  private readonly provider: RemoteVideoProvider;
  private readonly builder: typeof buildWordArtifact;
  constructor(options: { jobs?: WordSources; artifacts?: TranscriptArtifactRepository; provider?: RemoteVideoProvider; builder?: typeof buildWordArtifact } = {}) {
    this.jobs = options.jobs ?? new WorkspaceRepository();
    this.artifacts = options.artifacts ?? new TranscriptArtifactStore();
    this.provider = options.provider ?? new CloudflareTranscriptionService();
    this.builder = options.builder ?? buildWordArtifact;
  }

  private async source(uid: string, id: string) {
    const job = await this.jobs.getJob(uid, id);
    if (job.status !== 'completed') throw new RequestError(409, 'La transcripción todavía no está completada.');
    let manifest;
    try { manifest = parseTranscriptManifest(job.transcript); }
    catch { throw new RequestError(409, 'El Word requiere una fuente completa de segmentos verificados.'); }
    const segments: TranscriptSegment[] = []; let offset = 0, bytes = 0;
    while (offset < manifest.segmentCount) {
      let page;
      try { page = parseTranscriptPage(await this.jobs.getSegmentPage(uid, id, offset, MAX_TRANSCRIPT_PAGE_SEGMENTS), {
        jobId: id, offset, limit: MAX_TRANSCRIPT_PAGE_SEGMENTS, totalSegments: manifest.segmentCount, sha256: manifest.sha256, previousSegment: segments.at(-1),
      }); } catch (error) { if (error instanceof RequestError) throw error; throw new RequestError(502, 'La fuente guardada está incompleta o cambió durante la recuperación.'); }
      bytes += Buffer.byteLength(canonicalSegments(page.segments));
      if (bytes > MAX_SOURCE_BYTES) throw new RequestError(413, 'La fuente supera 20 MiB. No se construyó un Word truncado.');
      segments.push(...page.segments); offset += page.segments.length;
    }
    try { validateTranscriptSequence(segments); } catch { throw new RequestError(502, 'La fuente guardada tiene segmentos incompletos o fuera de orden.'); }
    if (segments.length !== manifest.segmentCount || hash(canonicalSegments(segments)) !== manifest.sha256) throw new RequestError(502, 'La fuente completa no coincide con su huella de integridad.');
    const latest = await this.jobs.getJob(uid, id);
    if (latest.status !== 'completed' || latest.transcript?.sha256 !== manifest.sha256) throw new RequestError(409, 'La fuente cambió antes de construir el Word.');
    return { manifest, text: formatLiteralTranscript(segments).replace(/\r\n?/g, '\n') };
  }

  getState(uid: string, id: string): Promise<TranscriptWordState> { return this.artifacts.getState(uid, id); }

  private async currentState(uid: string, id: string, checked: TranscriptWordReceipt): Promise<TranscriptWordState> {
    const state = await this.artifacts.getState(uid, id);
    if (!state.artifact || state.artifact.artifactId !== checked.artifactId || state.artifact.artifactHash !== checked.artifactHash
      || state.artifact.reviewHash !== checked.reviewHash || state.transcript.sha256 !== checked.sourceHash) {
      throw new RequestError(409, 'Otra pestaña cambió el Word vigente. Recupera su estado antes de continuar.');
    }
    return state;
  }

  /** A repeated reviewed request retrieves its durable bytes instead of manufacturing a new receipt. */
  async create(uid: string, id: string, input: unknown): Promise<TranscriptWordState> {
    const source = await this.source(uid, id);
    let request;
    try { request = parseTranscriptWordRequest(input, source.text); } catch { throw new RequestError(400, 'Revisa la fuente, el formato y las posiciones de marcado antes de crear el Word.'); }
    if (request.sourceHash !== source.manifest.sha256) throw new RequestError(409, 'La fuente revisada cambió. Revisa la transcripción completa otra vez.');
    const reviewHash = await transcriptWordReviewHash(request), previous = await this.artifacts.getState(uid, id);
    if (previous.artifact?.reviewHash === reviewHash) {
      const stored = await this.download(uid, id);
      if (stored.artifact.reviewHash !== reviewHash) throw new RequestError(409, 'Otra pestaña cambió el Word vigente. Recupera su estado antes de continuar.');
      return this.currentState(uid, id, stored.artifact);
    }
    if (['pending', 'unknown'].includes(previous.remoteDeletion.status)) throw new RequestError(409, 'Resuelve el borrado pendiente antes de cambiar el Word vigente.');
    let word;
    try { word = await this.builder({ text: source.text, format: request.format, caseNumber: request.caseNumber, variant: 'official' }); }
    catch { throw new RequestError(422, 'No fue posible construir el Word. Se conservó la transcripción y no se solicitó borrar el video.'); }
    if (!(word.bytes instanceof Uint8Array) || word.bytes.byteLength < 1 || word.bytes.byteLength > MAX_WORD_ARTIFACT_BYTES) throw new RequestError(413, 'El Word supera el límite de 4 MiB. No se guardó ni truncó.');
    verifyTranscriptWordDocument(word.bytes, source.text, request.format, request.caseNumber);
    if (word.text !== source.text || word.contentHash !== hash(source.text) || word.artifactHash !== hash(word.bytes)) throw new RequestError(502, 'Las huellas del Word generado no coinciden con su contenido.');
    const artifact: TranscriptWordReceipt = { jobId: id, artifactId: reviewHash, sourceHash: source.manifest.sha256,
      contentHash: word.contentHash, artifactHash: word.artifactHash, byteLength: word.bytes.byteLength,
      fileName: `Transcripcion_${reviewHash.slice(0, 16)}_OFICIAL.docx`, createdAt: new Date().toISOString(), reviewHash, format: request.format,
      ...(request.caseNumber === undefined ? {} : { caseNumber: request.caseNumber }) };
    const saved = await this.artifacts.save(uid, id, artifact, word.bytes);
    return this.currentState(uid, id, saved);
  }

  /** Verify both complete source and stored OOXML again before returning a download or reserving deletion. */
  async download(uid: string, id: string): Promise<StoredWordArtifact> {
    const source = await this.source(uid, id), stored = await this.artifacts.download(uid, id);
    if (stored.artifact.sourceHash !== source.manifest.sha256 || stored.artifact.contentHash !== hash(source.text) || hash(stored.bytes) !== stored.artifact.artifactHash) throw new RequestError(502, 'El Word guardado ya no coincide con la fuente verificada.');
    let format;
    try { format = parseWordFormat(source.text, stored.artifact.format); } catch { throw new RequestError(502, 'El formato guardado del Word no es válido.'); }
    const reviewHash = await transcriptWordReviewHash({ sourceHash: source.manifest.sha256, reviewed: true, format,
      ...(stored.artifact.caseNumber === undefined ? {} : { caseNumber: stored.artifact.caseNumber }) });
    if (reviewHash !== stored.artifact.reviewHash || reviewHash !== stored.artifact.artifactId) throw new RequestError(502, 'El recibo no corresponde al formato y marcado revisados.');
    verifyTranscriptWordDocument(stored.bytes, source.text, format, stored.artifact.caseNumber); return stored;
  }

  /** Explicit confirmation is necessary, and even a failed reserved attempt is not retried automatically. */
  async deleteRemote(uid: string, id: string, input: unknown, signal: AbortSignal): Promise<RemoteDeletionState> {
    if (!isRecord(input) || !validSha256(input.artifactId) || !validSha256(input.artifactHash) || input.downloadConfirmed !== true || input.confirm !== true) throw new RequestError(400, 'Descarga el Word y confirma expresamente el borrado de este video.');
    const stored = await this.download(uid, id);
    if (input.artifactId !== stored.artifact.artifactId || input.artifactHash !== stored.artifact.artifactHash) throw new RequestError(409, 'Descarga el Word vigente y confirma su huella antes de borrar.');
    signal.throwIfAborted();
    const reserved = await this.artifacts.reserveDeletion(uid, id, input.artifactId, input.artifactHash);
    if (!reserved.created) return reserved.state;
    let status: 'deleted' | 'failed' | 'unknown', message: string;
    try {
      await this.provider.deleteRemote(id, signal, uid); status = 'deleted'; message = 'El proveedor confirmó la eliminación del video. Se conservaron la transcripción y el Word.';
    } catch (error) {
      const rejected = error instanceof RequestError && [400, 403, 404, 409, 413, 429, 503].includes(error.status);
      status = rejected ? 'failed' : 'unknown';
      message = rejected ? 'El proveedor rechazó el borrado. Se conservaron la transcripción y el Word; revisa la configuración antes de un nuevo intento.'
        : 'No se pudo confirmar el resultado del borrado. Consulta su estado; no se repetirá DELETE automáticamente.';
    }
    return this.artifacts.finishDeletion(uid, id, input.artifactId, status, message);
  }

  /** Only GET is used to reconcile a missing DELETE acknowledgement. */
  async reconcile(uid: string, id: string, signal: AbortSignal): Promise<RemoteDeletionState> {
    const state = await this.artifacts.getState(uid, id), previous = state.remoteDeletion;
    if (!['pending', 'unknown'].includes(previous.status)) return previous;
    if (!previous.artifactId || !state.artifact || previous.artifactId !== state.artifact.artifactId) throw new RequestError(409, 'La operación pendiente no coincide con el Word guardado.');
    let result: RemoteDeletionCheck;
    try { result = await this.provider.checkRemoteDeletion(id, signal, uid); }
    catch { result = 'unknown'; }
    if (result === 'deleted') return this.artifacts.finishDeletion(uid, id, previous.artifactId, 'deleted', 'El registro del proveedor confirmó la eliminación. Se conservaron la transcripción y el Word.');
    return this.artifacts.finishDeletion(uid, id, previous.artifactId, 'unknown', result === 'present'
      ? 'El video sigue visible en el proveedor; la eliminación anterior no está confirmada. No se repetirá DELETE automáticamente.'
      : 'El proveedor todavía no permite confirmar el resultado. Se conservaron la transcripción y el Word.');
  }
}
