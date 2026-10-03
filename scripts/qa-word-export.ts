import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseDraft } from '../shared/documents.js';
import { publicFingerprint, reviewFingerprint } from '../shared/documentIntegrity.js';
import { literalCandidates } from '../shared/redaction.js';
import { WordExportService } from '../src/services/WordExportService.js';

// Local synthetic fixtures only: never reads credentials, sources or database records.
const folder = resolve('.firebase/phase4-word-qa');
await mkdir(folder, { recursive: true });
const paragraph = 'Este párrafo contiene únicamente texto sintético para comprobar márgenes, interlineado, justificación y continuidad entre páginas. María Pérez conserva sus palabras originales en la versión oficial. El correo maria@example.test y el teléfono +52 55 1234 5678 se ocultan únicamente cuando la selección ha sido confirmada. La revisión compara párrafos completos, líneas vacías y signos como á, ñ, ü, «comillas», § y €.';
const draft = parseDraft({ title: 'QA sintética María Pérez', caseNumber: 'TEST-QA', caseType: 'Prueba', documentType: 'Prueba',
  summary: 'Fuente privada sintética, excluida del archivo público.', transcription: 'Copia de trabajo sintética.', originalTranscription: 'Fuente original sintética.',
  content: `PRUEBA DE EXPORTACIÓN — DATOS SINTÉTICOS\n\n  Espacios iniciales conservados.\n\tLínea con tabulación.\n\n${Array.from({ length: 8 }, (_, i) => `${i + 1}. ${paragraph}`).join('\n\n')}\n\nFIN DE LA PRUEBA.  \n`,
  completedPhases: ['Prueba'], audit: { names: true, congruence: true, pii: true }, reviewHash: null });
draft.reviewHash = await reviewFingerprint(draft);
draft.publicVersion = { redactions: ['María Pérez', 'maria@example.test', '+52 55 1234 5678'].flatMap(term => literalCandidates(draft.content, term).map(({ start, end }) => ({ start, end }))), reviewed: true, reviewHash: null };
draft.publicVersion.reviewHash = await publicFingerprint(draft);
for (const variant of ['official', 'public'] as const) {
  const artifact = await new WordExportService().createArtifact({ ...draft, revision: 1 }, variant);
  await writeFile(resolve(folder, `${variant}.docx`), Buffer.from(await artifact.blob.arrayBuffer()));
  await writeFile(resolve(folder, `${variant}.txt`), artifact.text, 'utf8');
}
console.log(`Archivos sintéticos para revisión visual: ${folder}`);
