import fileSaver from 'file-saver';
import { parseDraft } from '../../shared/documents';
import type { DocumentDraft } from '../../shared/documents';
import { approvedExportText } from '../../shared/documentIntegrity';
import type { ExportVariant } from '../../shared/documentIntegrity';
import { publicFragments } from '../../shared/redaction';
import type { RedactionRange } from '../../shared/redaction';
import { buildWordArtifact, WORD_MEDIA_TYPE } from '../../shared/wordDocument';

export interface WordArtifact { blob: Blob; fileName: string; text: string; contentHash: string; artifactHash: string }
type ExportDocument = DocumentDraft & { revision?: number };
type Download = (blob: Blob, name: string) => void;

/** Exports the approved snapshot through the same pure builder used by the server. */
export class WordExportService {
  private readonly download: Download;
  /** Inject the final download for tests; DOCX construction remains independent of the browser. */
  constructor(download: Download = (blob, name) => fileSaver.saveAs(blob, name)) { this.download = download; }

  /** Build the exact approved variant and its text hash; never include private source metadata in the public artifact. */
  async createArtifact(document: ExportDocument, variant: ExportVariant): Promise<WordArtifact> {
    if (!['official', 'public'].includes(variant)) throw new Error('Elige una variante de exportación válida.');
    const snapshot = parseDraft(document);
    const text = await approvedExportText(snapshot, variant);
    const format = snapshot.wordFormat ?? { profile: 'judicial' as const, marks: [] };
    const publicMarks: RedactionRange[] = [];
    if (variant === 'public') {
      let offset = 0;
      for (const fragment of publicFragments(snapshot.content, snapshot.publicVersion?.redactions ?? [])) {
        if (fragment.hidden) publicMarks.push({ start: offset, end: offset + fragment.text.length });
        offset += fragment.text.length;
      }
    }
    const artifact = await buildWordArtifact({ text, format: variant === 'public' ? { profile: format.profile, marks: [] } : format,
      ...(variant === 'official' ? { title: snapshot.title, caseNumber: snapshot.caseNumber, documentType: snapshot.documentType } : {}),
      revision: document.revision, variant, ...(variant === 'public' ? { publicMarks } : {}) });
    const date = new Date().toISOString().slice(0, 10);
    // eslint-disable-next-line no-control-regex -- File names cannot contain XML controls or Windows path characters.
    const safe = (value: string) => value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/[. ]+$/g, '').slice(0, 100) || 'Documento';
    const prefix = variant === 'public' ? 'Documento' : `${safe(snapshot.documentType || 'Documento')}${snapshot.caseNumber ? `_Exp${safe(snapshot.caseNumber)}` : ''}`;
    return { blob: new Blob([new Uint8Array(artifact.bytes)], { type: WORD_MEDIA_TYPE }), text: artifact.text, contentHash: artifact.contentHash, artifactHash: artifact.artifactHash,
      fileName: `${prefix}_${date}_${variant === 'public' ? 'PUBLICA' : 'OFICIAL'}_v${document.revision ?? 0}.docx` };
  }

  /** A prepared download is not proof that the user saved the file on their device. */
  async exportToWord(document: ExportDocument, variant: ExportVariant): Promise<WordArtifact> {
    const artifact = await this.createArtifact(document, variant);
    this.download(artifact.blob, artifact.fileName);
    return artifact;
  }
}
